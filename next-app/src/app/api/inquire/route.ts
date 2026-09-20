import { NextResponse } from 'next/server';
import { createPublicClient } from '@/lib/supabase/public';
import { createServiceClient } from '@/lib/supabase/service';
import { createAdminNotification } from '@/lib/admin-notify';
import { PRODUCT_IMAGES_BUCKET } from '@/lib/product-image-storage';
import { encodeLeadPhoto } from '@/lib/lead-photo-encode';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { checkSubmissionForSpam } from '@/lib/spam-heuristics';
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

// Field length caps for the public JSON (product-inquiry) path — parity with the
// multipart lead-form path's DB hygiene and a brake on abusive payload sizes.
const MAX_ITEM = 200;
const MAX_NAME = 200;
const MAX_PHONE = 60;
const MAX_EMAIL = 320;
const MAX_MESSAGE = 5000;

const OWNER_EMAIL = 'rcman12589@gmail.com';
// Sending domain is naplesestatejewelry.com in Resend (migrated 2026-08-05); the
// .co domain is no longer verified there, so a .co From address will not send.
const FROM = 'Naples Estate Jewelry <noreply@naplesestatejewelry.com>';

type InquiryKind = 'free-evaluation' | 'submit-item' | 'product-inquiry';

/** Human, type-aware notification titles for the unified admin inbox. */
function inquiryNotificationTitle(kind: InquiryKind, name: string, itemTitle: string): string {
  const who = name.trim() || 'a customer';
  switch (kind) {
    case 'free-evaluation':
      return `Free evaluation request from ${who}`;
    case 'submit-item':
      return `Item submission from ${who}`;
    case 'product-inquiry':
      return `Inquiry about ${itemTitle} from ${who}`;
  }
}

/**
 * Also drop every inquiry into the admin message center (unified inbox), so lead
 * submissions show up alongside contact messages and order notifications — with
 * any uploaded photos attached. Best-effort: requires the service-role client and
 * its admin_notifications INSERT grant; a failure here never fails the request,
 * since the inquiry row + owner email already captured the submission.
 */
/** Location + preferred contact as the sender gave them (2026-09-08). All nullable: older forms and the product form send fewer. */
interface InquiryPreferences {
  locationArea: LocationArea | null;
  locationDetail: string | null;
  preferredContact: PreferredContact | null;
}

async function notifyAdminOfInquiry(input: {
  kind: InquiryKind;
  itemTitle: string;
  name: string;
  phone: string;
  email: string | null;
  message: string;
  imageUrls: string[];
  prefs: InquiryPreferences;
}) {
  let service;
  try {
    service = createServiceClient();
  } catch {
    return;
  }
  // The message center is text-only, so the two preferences ride as lines
  // under the phone, in the order the owner reads them.
  const extraLines = [
    ...(input.phone ? [`Phone: ${input.phone}`] : []),
    ...inquiryPreferenceLines(input.prefs.locationArea, input.prefs.locationDetail, input.prefs.preferredContact),
  ];
  await createAdminNotification(service, {
    type: 'inquiry',
    title: inquiryNotificationTitle(input.kind, input.name, input.itemTitle),
    body: extraLines.length ? `${input.message}\n\n${extraLines.join('\n')}` : input.message,
    customerName: input.name,
    customerEmail: input.email,
    imageUrls: input.imageUrls,
  });
}

const MAX_FILES = 10;
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB per photo

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface EmailPayload {
  itemTitle: string;
  name: string;
  phone: string;
  email: string | null;
  message: string;
  imageUrls: string[];
  prefs: InquiryPreferences;
}

async function sendEmails({ itemTitle, name, phone, email, message, imageUrls, prefs }: EmailPayload) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(resendKey);

    const photoHtml = imageUrls.length
      ? `<p><strong>Photos (${imageUrls.length}):</strong></p>` +
        imageUrls.map((u) => `<p><a href="${esc(u)}">${esc(u)}</a></p>`).join('')
      : '<p><em>No photos attached.</em></p>';

    const location = formatLocation(prefs.locationArea, prefs.locationDetail);
    const prefHtml =
      (location ? `<p><strong>Location:</strong> ${esc(location)}</p>` : '') +
      (prefs.preferredContact
        ? `<p><strong>Preferred contact:</strong> ${esc(preferredContactLabel(prefs.preferredContact, false))}</p>`
        : '');

    // Notify owner
    await resend.emails.send({
      from: FROM,
      to: OWNER_EMAIL,
      subject: `New inquiry: ${itemTitle}${inquirySubjectSuffix(prefs.locationArea, prefs.locationDetail, prefs.preferredContact)}`,
      html: `<p><strong>Item:</strong> ${esc(itemTitle)}</p>
             <p><strong>Name:</strong> ${esc(name)}</p>
             <p><strong>Phone:</strong> ${esc(phone)}</p>
             <p><strong>Email:</strong> ${email ? esc(email) : 'Not provided'}</p>
             ${prefHtml}
             <p><strong>Message:</strong></p>
             <p>${esc(message).replace(/\n/g, '<br>')}</p>
             ${photoHtml}`,
    });

    // Confirm to customer
    if (email) {
      await resend.emails.send({
        from: FROM,
        to: email,
        subject: `We received your inquiry about: ${itemTitle}`,
        html: `<p>Hi ${esc(name)},</p>
               <p>Thank you for your interest in <strong>${esc(itemTitle)}</strong>. We will be in touch with you shortly.</p>
               <p>For urgent questions, call us at <a href="tel:2394048505">(239) 404-8505</a>.</p>
               <p>— Naples Estate Jewelry</p>`,
      });
    }
  } catch (emailErr) {
    console.error('Resend email error:', emailErr);
  }
}

/**
 * JSON path — product inquiry from the shop (no file uploads).
 * Preserves the original contract used by InquiryForm.
 */
/**
 * Log a dropped submission, then let the caller return a normal success.
 *
 * ⛔ The logging is not decoration. The honeypot has been silently dropping
 * bots on two of the three forms since it was written, and because nothing was
 * ever recorded there was no way to tell a working filter from a filter that
 * had stopped matching. A dropped submission must leave a trace somewhere, and
 * the Netlify function log is the cheapest somewhere.
 *
 * Greppable prefix on purpose: `[inquiry-spam]`.
 */
function logDroppedSubmission(kind: string, reasons: string[], name: string, email: string) {
  console.warn(
    `[inquiry-spam] dropped ${kind} submission (${reasons.join(', ')}) name=${JSON.stringify(name.slice(0, 40))} email=${JSON.stringify(email.slice(0, 60))}`,
  );
}

async function handleJsonInquiry(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const raw = body as Record<string, string>;

  // Honeypot + heuristics — silently accept and drop.
  //
  // ⚠️ The honeypot alone was not enough here: `InquiryForm.tsx` shipped without
  // a `bot-field` input, so on the product-inquiry form there was nothing for a
  // bot to fall into. That is fixed, but a bot POSTing JSON straight at this
  // route never sees the form either — hence the content check alongside it.
  const verdict = checkSubmissionForSpam({ name: raw.name, honeypot: raw['bot-field'] });
  if (verdict.isSpam) {
    logDroppedSubmission('product-inquiry', verdict.reasons, String(raw.name ?? ''), String(raw.email ?? ''));
    return NextResponse.json({ success: true });
  }

  const item = String(raw.item ?? '').trim().slice(0, MAX_ITEM);
  const name = String(raw.name ?? '').trim().slice(0, MAX_NAME);
  const phone = String(raw.phone ?? '').trim().slice(0, MAX_PHONE);
  const email = String(raw.email ?? '').trim().slice(0, MAX_EMAIL);
  const message = String(raw.message ?? '').trim().slice(0, MAX_MESSAGE);
  if (!item || !name || !phone || !message) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  // ⚠️ A VISIBLE 400, deliberately not folded into the silent spam drop above:
  // a bot should vanish, but a real person who mistyped their number must be
  // told so they can fix it. See lib/phone.ts.
  const normalizedPhone = normalizePhoneNumber(phone);
  if (!normalizedPhone) {
    return NextResponse.json({ error: phoneErrorMessage(false) }, { status: 400 });
  }
  // The product form asks only for the contact preference (no location).
  // Lenient on absence — a page loaded before the deploy posts without it —
  // but "Email" with no address is a visible 400, same contract as the phone.
  const prefs: InquiryPreferences = {
    locationArea: null,
    locationDetail: null,
    preferredContact: parsePreferredContact(raw.preferred_contact),
  };
  if (preferredContactNeedsEmail(prefs.preferredContact, email)) {
    return NextResponse.json({ error: preferredContactEmailErrorMessage(false) }, { status: 400 });
  }

  // Insert as the anon role, which holds the public-insert grant on inquiries.
  // (The service role is intentionally not used here — it lacks INSERT on the table.)
  const supabase = createPublicClient();
  const error = await insertInquiry(supabase, {
    item_title: item,
    name,
    phone: normalizedPhone,
    email: email || null,
    message,
  }, [], prefs);

  if (error) {
    console.error('Inquiry insert error:', error);
    return NextResponse.json({ error: 'Failed to save inquiry' }, { status: 500 });
  }

  await notifyAdminOfInquiry({ kind: 'product-inquiry', itemTitle: item, name, phone: normalizedPhone, email: email || null, message, imageUrls: [], prefs });
  await sendEmails({ itemTitle: item, name, phone: normalizedPhone, email: email || null, message, imageUrls: [], prefs });

  return NextResponse.json({ success: true });
}

interface InquiryBaseRow {
  item_title: string;
  name: string;
  phone: string;
  email: string | null;
  message: string;
}

/**
 * One insert for both paths. Tries the full row (photos + the 2026-09-08
 * preference columns); if the database has not had the matching SQL applied
 * yet (`inquiries-location-contact-2026-09.sql` / `sales-workflow.sql`), the
 * error names the missing column and the row is retried WITHOUT those columns,
 * with the same facts folded into the message text so nothing is ever lost.
 * Returns the insert error, or null.
 */
async function insertInquiry(
  db: ReturnType<typeof createPublicClient>,
  baseRow: InquiryBaseRow,
  imageUrls: string[],
  prefs: InquiryPreferences,
): Promise<{ message: string } | null> {
  const fullRow = {
    ...baseRow,
    ...(imageUrls.length ? { uploaded_image_urls: imageUrls } : {}),
    ...(prefs.locationArea ? { location_area: prefs.locationArea } : {}),
    ...(prefs.locationDetail ? { location_detail: prefs.locationDetail } : {}),
    ...(prefs.preferredContact ? { preferred_contact: prefs.preferredContact } : {}),
  };
  const { error } = await db.from('inquiries').insert(fullRow);
  if (!error) return null;
  if (!/uploaded_image_urls|location_area|location_detail|preferred_contact|column|schema cache/i.test(error.message)) {
    return error;
  }
  console.warn('[inquiries] preference/photo columns missing — run supabase/inquiries-location-contact-2026-09.sql; folding into message:', error.message);
  const extra = [
    ...inquiryPreferenceLines(prefs.locationArea, prefs.locationDetail, prefs.preferredContact),
    ...(imageUrls.length ? [`Photos:\n${imageUrls.join('\n')}`] : []),
  ];
  const retry = await db
    .from('inquiries')
    .insert({ ...baseRow, message: extra.length ? `${baseRow.message}\n\n${extra.join('\n')}` : baseRow.message });
  return retry.error;
}

/**
 * Multipart path — lead forms (/contact "submit-item" and /free-evaluation),
 * which include required photo uploads. Photos are uploaded server-side with
 * the service-role client to the product-images bucket (so no anonymous Storage
 * policy is needed) and recorded in inquiries.uploaded_image_urls, which the
 * Storage GC reference scan already tracks.
 */
async function handleLeadForm(req: Request) {
  const form = await req.formData();

  // Honeypot + heuristics — silently accept and drop. Same contract as the JSON
  // path; this one matters more per request, because it also uploads photos.
  const leadVerdict = checkSubmissionForSpam({
    name: String(form.get('name') ?? ''),
    honeypot: String(form.get('bot-field') ?? ''),
  });
  if (leadVerdict.isSpam) {
    logDroppedSubmission('lead-form', leadVerdict.reasons, String(form.get('name') ?? ''), String(form.get('email') ?? ''));
    return NextResponse.json({ success: true });
  }

  const source = String(form.get('source') ?? '').toLowerCase();
  const name = String(form.get('name') ?? '').trim();
  const phone = String(form.get('phone') ?? '').trim();
  const email = String(form.get('email') ?? '').trim();
  const location = String(form.get('location') ?? '').trim();
  const rawMessage = String(
    form.get('item_description') ?? form.get('description') ?? form.get('message') ?? '',
  ).trim();

  if (!name || !phone) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  // Visible 400 — same contract as the JSON path above.
  const normalizedPhone = normalizePhoneNumber(phone);
  if (!normalizedPhone) {
    return NextResponse.json({ error: phoneErrorMessage(false) }, { status: 400 });
  }
  // Location + preferred contact (2026-09-08). Required on the form; lenient
  // here on absence (a form loaded before the deploy), strict on bad values
  // (unknown value → treated as not given, never stored as free text).
  const locationArea = parseLocationArea(form.get('location_area'));
  const prefs: InquiryPreferences = {
    locationArea,
    locationDetail: parseLocationDetail(form.get('location_detail'), locationArea),
    preferredContact: parsePreferredContact(form.get('preferred_contact')),
  };
  if (preferredContactNeedsEmail(prefs.preferredContact, email)) {
    return NextResponse.json({ error: preferredContactEmailErrorMessage(false) }, { status: 400 });
  }

  const itemTitle = source === 'free-evaluation' ? 'Free Evaluation Request' : 'Submit Your Item';

  let message = rawMessage || '(No description provided.)';
  if (location) message += `\n\nLocation: ${location}`;

  // Collect uploaded image files from any field name (photo_1..photo_5, photos[]).
  const files: File[] = [];
  for (const [, value] of form.entries()) {
    if (value instanceof File && value.size > 0) files.push(value);
  }
  const accepted = files
    .filter((f) => f.type.startsWith('image/') && f.size <= MAX_BYTES)
    .slice(0, MAX_FILES);

  // Upload photos with the service-role client (bypasses Storage RLS).
  const imageUrls: string[] = [];
  let service: ReturnType<typeof createServiceClient> | null = null;
  try {
    service = createServiceClient();
  } catch {
    service = null;
  }

  if (service && accepted.length) {
    const bucket = service.storage.from(PRODUCT_IMAGES_BUCKET);
    for (const file of accepted) {
      try {
        // Re-encoded to WebP (original bytes kept if sharp cannot read them).
        const photo = await encodeLeadPhoto(file);
        const path = `inquiries/${crypto.randomUUID()}.${photo.extension}`;
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
        console.error('Inquiry photo upload error:', uploadErr);
      }
    }
  }

  // Insert the inquiry as the anon role (it holds the public-insert grant on
  // inquiries). The service role is used ONLY for the Storage upload above — it
  // is NOT used for the row insert, because it lacks INSERT on this table, which
  // is what caused 42501 "permission denied for table inquiries" once a service
  // key was configured.
  const db = createPublicClient();

  const insertError = await insertInquiry(db, {
    item_title: itemTitle,
    name,
    phone: normalizedPhone,
    email: email || null,
    message,
  }, imageUrls, prefs);

  if (insertError) {
    console.error('Inquiry insert error:', insertError);
    return NextResponse.json({ error: 'Failed to save inquiry' }, { status: 500 });
  }

  await notifyAdminOfInquiry({
    kind: source === 'free-evaluation' ? 'free-evaluation' : 'submit-item',
    itemTitle, name, phone: normalizedPhone, email: email || null, message, imageUrls, prefs,
  });
  await sendEmails({ itemTitle, name, phone: normalizedPhone, email: email || null, message, imageUrls, prefs });

  return NextResponse.json({ success: true });
}

export async function POST(req: Request) {
  // Per-IP abuse brake: each inquiry sends up to two Resend emails (owner + a
  // confirmation to the submitted address) and, on the lead-form path, uploads
  // photos. Cap submissions so the endpoint can't be used as an email/upload relay.
  const ip = getClientIp(req);
  if (!(await checkRateLimit(`inquire:${ip}`, 5, 3600))) {
    return NextResponse.json({ error: 'Too many requests. Please try again in a bit.' }, { status: 429 });
  }

  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('multipart/form-data')) {
    return handleLeadForm(req);
  }
  return handleJsonInquiry(req);
}
