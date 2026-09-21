import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createAdminNotification } from '@/lib/admin-notify';
import { PRODUCT_IMAGES_BUCKET } from '@/lib/product-image-storage';
import { encodeLeadPhoto } from '@/lib/lead-photo-encode';
import { LEAD_PHOTO_MAX } from '@/lib/lead-photo-limits';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { normalizePhoneNumber, phoneErrorMessage } from '@/lib/phone';
import {
  formatLocation,
  inquiryPreferenceLines,
  inquirySubjectSuffix,
  parseLocationArea,
  parseLocationDetail,
  parsePreferredContact,
  preferredContactEmailErrorMessage,
  preferredContactLabel,
  preferredContactNeedsEmail,
  type LocationArea,
  type PreferredContact,
} from '@/lib/inquiry-fields';

export const runtime = 'nodejs';

const OWNER_EMAIL = 'rcman12589@gmail.com';
// Resend's verified sending domain is naplesestatejewelry.com (migrated 2026-08-05).
const FROM = 'Naples Estate Jewelry <noreply@naplesestatejewelry.com>';

const MAX_NAME = 200;
const MAX_EMAIL = 320;
const MAX_PHONE = 60;
const MAX_MESSAGE = 5000;
const MAX_FILES = LEAD_PHOTO_MAX; // was 6 — silently dropped photos 7+ (2026-09-20)
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB per photo

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface MessagePreferences {
  locationArea: LocationArea | null;
  locationDetail: string | null;
  preferredContact: PreferredContact | null;
}

/** Best-effort owner notification email. Returns true if an email was sent. */
async function sendOwnerEmail(
  name: string,
  email: string,
  phone: string,
  message: string,
  imageUrls: string[],
  prefs: MessagePreferences,
): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return false;
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(resendKey);
    const photoHtml = imageUrls.length
      ? `<p><strong>Photos (${imageUrls.length}):</strong></p>` +
        imageUrls.map((u) => `<p><a href="${esc(u)}">${esc(u)}</a></p>`).join('')
      : '';
    const sender = name || phone;
    const location = formatLocation(prefs.locationArea, prefs.locationDetail);
    const prefHtml =
      (location ? `<p><strong>Location:</strong> ${esc(location)}</p>` : '') +
      (prefs.preferredContact
        ? `<p><strong>Preferred contact:</strong> ${esc(preferredContactLabel(prefs.preferredContact, false))}</p>`
        : '');
    const emailOpts: Parameters<InstanceType<typeof Resend>['emails']['send']>[0] = {
      from: FROM,
      to: OWNER_EMAIL,
      subject: `New website message from ${sender}${inquirySubjectSuffix(prefs.locationArea, prefs.locationDetail, prefs.preferredContact)}`,
      html: `<p><strong>Name:</strong> ${name ? esc(name) : 'Not provided'}</p>
             <p><strong>Email:</strong> ${email ? esc(email) : 'Not provided'}</p>
             <p><strong>Phone:</strong> ${esc(phone)}</p>
             ${prefHtml}
             <p><strong>Message:</strong></p>
             <p>${esc(message).replace(/\n/g, '<br>')}</p>
             ${photoHtml}`,
    };
    if (email) emailOpts.replyTo = email;
    await resend.emails.send(emailOpts);
    return true;
  } catch (emailErr) {
    console.error('Contact message email error:', emailErr);
    return false;
  }
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  if (!(await checkRateLimit(`contact-message:${ip}`, 5, 3600))) {
    return NextResponse.json({ error: 'Too many requests. Please try again in a bit.' }, { status: 429 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  // Honeypot — silently accept and drop obvious bots.
  if (String(form.get('bot-field') ?? '').trim()) return NextResponse.json({ success: true });

  const name = String(form.get('name') ?? '').trim().slice(0, MAX_NAME);
  const email = String(form.get('email') ?? '').trim().slice(0, MAX_EMAIL);
  const phone = String(form.get('phone') ?? '').trim().slice(0, MAX_PHONE);
  const message = String(form.get('message') ?? '').trim().slice(0, MAX_MESSAGE);

  if (!phone || !message) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  // Was a local "10 to 15 digits" count, duplicated in MessageUsForm. Both now
  // defer to lib/phone.ts, so one rule covers every surface and the stored value
  // is canonical. Note this is a VISIBLE 400 — never fold a bad phone into the
  // silent honeypot drop above, which would make a real person's message vanish.
  const normalizedPhone = normalizePhoneNumber(phone);
  if (!normalizedPhone) {
    return NextResponse.json({ error: phoneErrorMessage(false) }, { status: 400 });
  }
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }
  // Location + preferred contact (2026-09-08): required on the form, lenient
  // here on absence, strict on values; "Email" without an address is a 400.
  const locationArea = parseLocationArea(form.get('location_area'));
  const prefs: MessagePreferences = {
    locationArea,
    locationDetail: parseLocationDetail(form.get('location_detail'), locationArea),
    preferredContact: parsePreferredContact(form.get('preferred_contact')),
  };
  if (preferredContactNeedsEmail(prefs.preferredContact, email)) {
    return NextResponse.json({ error: preferredContactEmailErrorMessage(false) }, { status: 400 });
  }

  // Service-role client: required to upload photos (Storage RLS) and to write the
  // admin_notifications row (admin-only RLS). Runs server-side so the key is never
  // exposed to the browser.
  let service: ReturnType<typeof createServiceClient> | null = null;
  try {
    service = createServiceClient();
  } catch {
    service = null;
  }

  // Collect and upload any attached photos to the messages/ prefix.
  const files: File[] = [];
  for (const [, value] of form.entries()) {
    if (value instanceof File && value.size > 0) files.push(value);
  }
  const accepted = files
    .filter((f) => f.type.startsWith('image/') && f.size <= MAX_BYTES)
    .slice(0, MAX_FILES);

  const imageUrls: string[] = [];
  if (service && accepted.length) {
    const bucket = service.storage.from(PRODUCT_IMAGES_BUCKET);
    for (const file of accepted) {
      try {
        // Re-encoded to WebP (original bytes kept if sharp cannot read them).
        const photo = await encodeLeadPhoto(file);
        const path = `messages/${crypto.randomUUID()}.${photo.extension}`;
        const { error: upErr } = await bucket.upload(path, photo.buffer, {
          contentType: photo.contentType,
          cacheControl: '31536000',
          upsert: false,
        });
        if (!upErr) {
          const { data } = bucket.getPublicUrl(path);
          if (data?.publicUrl) imageUrls.push(data.publicUrl);
        }
      } catch (uploadErr) {
        console.error('Contact message photo upload error:', uploadErr);
      }
    }
  }

  // Canonical form, so the owner reads the same shape on every message. Phone
  // is required and validated above, so the empty branch this used to have was
  // unreachable.
  const notificationBody = [
    message,
    '',
    `Phone: ${normalizedPhone}`,
    ...inquiryPreferenceLines(prefs.locationArea, prefs.locationDetail, prefs.preferredContact),
  ].join('\n');

  // Insert into the admin message center.
  const sender = name || normalizedPhone;
  const savedToMessages = service
    ? await createAdminNotification(service, {
        type: 'message',
        title: `Message from ${sender}`,
        body: notificationBody,
        customerName: name || null,
        customerEmail: email || null,
        imageUrls,
      })
    : false;

  // Best-effort email backup so the message reaches the owner even if the message
  // center write is unavailable (e.g. service role not configured).
  const emailed = await sendOwnerEmail(name, email, normalizedPhone, message, imageUrls, prefs);

  if (!savedToMessages && !emailed) {
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
