import 'server-only';
import sharp from 'sharp';
import type { SupabaseClient } from '@supabase/supabase-js';
import { encodeProductImageToWebp } from '@/lib/product-image-encode';
import { getSiteUrl } from '@/lib/order-email-branding';
import { ownerNotificationRecipient } from '@/lib/order-owner-notification';
import { getStoreHours } from '@/lib/store-hours';
import { SHOWROOM_TIME_ZONE, WEEK_ORDER, type WeekDay } from '@/lib/business-location';
import { isPdf } from '@/lib/tax-exempt-ai';
import {
  CERTIFICATE_COLUMNS,
  STORE_TEXT_NUMBER,
  TAX_CERT_BUCKET,
  TAX_CERT_TYPE_LABELS,
  TAX_EXEMPT_APPROVAL_HOURS,
  certificateIsUsable,
  certificateUsableThrough,
  exemptShortTag,
  formatCertDate,
  hasCopyOnFile,
  maskCertNumber,
  opensAtLabel,
  ownerApprovalTextBody,
  parseTaxExemptSnapshot,
  requestRefLabel,
  snapshotFromCertificate,
  type CertificateRead,
  type CertificateChecks,
  type CertificateRow,
  type TaxCertType,
  type TaxExemptRequestStatus,
  type TaxExemptSaleChoice,
  type TaxExemptSnapshot,
  type TaxExemptSource,
} from '@/lib/tax-exempt';

// Server half of tax-exempt sales (see `lib/tax-exempt.ts` for the why).
// Everything here uses the SERVICE client: the tables have no anon /
// authenticated access (supabase/tax-exempt-2026-10.sql).

// ---------------------------------------------------------------------------
// Files (private bucket)
// ---------------------------------------------------------------------------

/**
 * Store a certificate photo or PDF under `<prefix>/<uuid>.webp|pdf`.
 * Photos are re-encoded to WebP and CHECKED to be WebP before the name and
 * contentType claim it (AGENTS.md → Optimization defaults). PDFs are kept as
 * uploaded (verified by their `%PDF-` header). Not cached: `cacheControl: '0'`.
 */
export async function storeCertificateFile(
  service: SupabaseClient,
  file: Buffer,
  prefix: 'certificates' | 'requests',
): Promise<{ path: string; mime: string } | { error: string; status: number }> {
  let body: Buffer;
  let mime: string;
  let extension: string;
  if (isPdf(file)) {
    body = file;
    mime = 'application/pdf';
    extension = 'pdf';
  } else {
    try {
      const encoded = await encodeProductImageToWebp(file, { quality: 82 });
      const produced = await sharp(encoded.buffer).metadata();
      if (produced.format !== 'webp') throw new Error(`encoder produced ${produced.format ?? 'unknown'}`);
      body = encoded.buffer;
    } catch (error) {
      console.error('[tax-exempt] certificate encode failed', error instanceof Error ? error.message : error);
      return { error: 'That file is not a photo or PDF we can read. Try another one.', status: 400 };
    }
    mime = 'image/webp';
    extension = 'webp';
  }
  const path = `${prefix}/${crypto.randomUUID()}.${extension}`;
  const { error } = await service.storage.from(TAX_CERT_BUCKET).upload(path, body, { contentType: mime, cacheControl: '0', upsert: false });
  if (error) {
    console.error('[tax-exempt] certificate upload failed', error.message);
    const missing = /bucket not found/i.test(error.message);
    return {
      error: missing ? 'The certificate could not be stored — supabase/tax-exempt-2026-10.sql has not been run yet.' : 'The certificate could not be stored. Try again.',
      status: 502,
    };
  }
  return { path, mime };
}

/** A short-lived link to view a certificate (admins only — callers check). */
export async function signedCertificateUrl(service: SupabaseClient, path: string, seconds = 300): Promise<string | null> {
  const { data, error } = await service.storage.from(TAX_CERT_BUCKET).createSignedUrl(path, seconds);
  if (error) console.error('[tax-exempt] signed url failed', error.message);
  return data?.signedUrl ?? null;
}

/** Remove an uploaded file that no certificate, request or order points at (a retake, an abandoned draft). */
export async function removeUnreferencedCertificateFile(service: SupabaseClient, path: string): Promise<void> {
  const [cert, request] = await Promise.all([
    service.from('tax_exempt_certificates').select('id').eq('photo_path', path).limit(1),
    service.from('tax_exempt_requests').select('id').eq('photo_path', path).neq('status', 'draft').limit(1),
  ]);
  if ((cert.data ?? []).length > 0 || (request.data ?? []).length > 0) return;
  const { error } = await service.storage.from(TAX_CERT_BUCKET).remove([path]);
  if (error) console.error('[tax-exempt] remove file failed', path, error.message);
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

/**
 * The exemption noted on an order, or null. Tolerant on purpose: before the
 * SQL runs the columns do not exist, and every receipt / email / page that
 * calls this must keep working exactly as before.
 */
export async function loadOrderTaxExemption(client: SupabaseClient, orderId: string): Promise<TaxExemptSnapshot | null> {
  const { data, error } = await client.from('orders').select('tax_exempt, tax_exempt_snapshot').eq('id', orderId).maybeSingle();
  if (error || !data) return null;
  const row = data as { tax_exempt?: boolean; tax_exempt_snapshot?: unknown };
  return row.tax_exempt ? parseTaxExemptSnapshot(row.tax_exempt_snapshot) : null;
}

/** Note the exemption on the order (flag, certificate, snapshot). */
export async function applyOrderExemption(service: SupabaseClient, orderId: string, snapshot: TaxExemptSnapshot): Promise<{ ok: true } | { error: string }> {
  const { error } = await service
    .from('orders')
    .update({ tax_exempt: true, tax_exempt_certificate_id: snapshot.certificateId, tax_exempt_snapshot: snapshot })
    .eq('id', orderId);
  if (error) {
    console.error('[tax-exempt] order note failed', error.message);
    return { error: error.message };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------------

export async function findCertificate(service: SupabaseClient, id: string): Promise<CertificateRow | null> {
  const { data } = await service.from('tax_exempt_certificates').select(CERTIFICATE_COLUMNS).eq('id', id).maybeSingle();
  return (data as unknown as CertificateRow) ?? null;
}

/** Instant Sale's "Certificate on file" list: approved, kept for reuse, still usable. */
export async function listCertificatesForPicker(service: SupabaseClient, query = ''): Promise<CertificateRow[]> {
  let request = service
    .from('tax_exempt_certificates')
    .select(CERTIFICATE_COLUMNS)
    .eq('status', 'approved')
    .eq('saved_for_reuse', true)
    .order('approved_at', { ascending: false })
    .limit(60);
  const q = query.replace(/[%,()]/g, ' ').trim();
  if (q) request = request.or(`business_name.ilike.%${q}%,cert_number.ilike.%${q}%,customer_name.ilike.%${q}%`);
  const { data, error } = await request;
  if (error) {
    console.error('[tax-exempt] picker list failed', error.message);
    return [];
  }
  return ((data ?? []) as unknown as CertificateRow[]).filter((row) => certificateIsUsable(row));
}

type NewCertificate = {
  certType: TaxCertType | null;
  businessName: string | null;
  certNumber: string | null;
  expiresOn: string | null;
  photoPath: string | null;
  photoMime: string | null;
  physicalCopySeen: boolean;
  flAuthNumber: string | null;
  source: TaxExemptSource;
  requestId?: string | null;
  customer: { name: string | null; email: string | null; phone: string | null };
  userId?: string | null;
  savedForReuse: boolean;
  approvedBy: string | null;
};

export async function insertCertificate(service: SupabaseClient, input: NewCertificate): Promise<CertificateRow | { error: string }> {
  const { data, error } = await service
    .from('tax_exempt_certificates')
    .insert({
      cert_type: input.certType,
      business_name: input.businessName,
      cert_number: input.certNumber,
      expires_on: input.expiresOn,
      photo_path: input.photoPath,
      photo_mime: input.photoMime,
      physical_copy_seen: input.physicalCopySeen,
      fl_auth_number: input.flAuthNumber,
      source: input.source,
      request_id: input.requestId ?? null,
      customer_name: input.customer.name,
      customer_email: input.customer.email,
      customer_phone: input.customer.phone,
      user_id: input.userId ?? null,
      saved_for_reuse: input.savedForReuse,
      approved_by_email: input.approvedBy,
    })
    .select(CERTIFICATE_COLUMNS)
    .single();
  if (error || !data) {
    console.error('[tax-exempt] certificate insert failed', error?.message);
    const missing = /tax_exempt_certificates/.test(error?.message ?? '') && /does not exist|schema cache/i.test(error?.message ?? '');
    return { error: missing ? 'Tax-exempt sales need supabase/tax-exempt-2026-10.sql run in Supabase first.' : 'Could not save the certificate.' };
  }
  return data as unknown as CertificateRow;
}

/**
 * Instant Sale: the box's choice → the certificate this sale rests on. A new
 * certificate is ALWAYS stored (it is the record for this sale); "Save for
 * next time" only decides whether it shows in the picker later.
 */
export async function resolveSaleCertificate(
  service: SupabaseClient,
  choice: TaxExemptSaleChoice,
  context: { source: 'in_store' | 'remote_sale'; approvedBy: string | null; customer: { name: string | null; email: string | null; phone: string | null } },
): Promise<CertificateRow | { error: string }> {
  if (choice.kind === 'on_file') {
    const row = await findCertificate(service, choice.certificateId);
    if (!row) return { error: 'That certificate is no longer on file. Pick it again.' };
    if (!certificateIsUsable(row)) return { error: 'That certificate has expired or was withdrawn. Take a photo of the current one.' };
    // No copy on file (no photo and no filed paper copy — it was only seen):
    // Florida then needs an authorization number for THIS sale — a transaction
    // number is good for one sale (Rule 12A-1.039(3)(b)3).
    if (!hasCopyOnFile(row)) {
      if (!choice.flAuthNumber) {
        return { error: 'That certificate has no copy on file. Verify it with FL Revenue and enter the Florida authorization number for this sale (or take a photo of the certificate as a new one).' };
      }
      // The order's snapshot carries this sale's number; the stored certificate is unchanged.
      return { ...row, fl_auth_number: choice.flAuthNumber };
    }
    return choice.flAuthNumber ? { ...row, fl_auth_number: choice.flAuthNumber } : row;
  }
  return insertCertificate(service, {
    certType: choice.certType,
    businessName: choice.businessName,
    certNumber: choice.certNumber,
    expiresOn: choice.expiresOn,
    photoPath: choice.photoPath,
    photoMime: choice.photoMime,
    physicalCopySeen: choice.physicalCopySeen,
    flAuthNumber: choice.flAuthNumber,
    source: context.source,
    customer: context.customer,
    savedForReuse: choice.saveForNextTime,
    approvedBy: context.approvedBy,
  });
}

/** The certificate a signed-in customer saved to their account, if it can still be used. */
export async function savedCertificateForUser(service: SupabaseClient, userId: string): Promise<CertificateRow | null> {
  const { data, error } = await service
    .from('tax_exempt_certificates')
    .select(CERTIFICATE_COLUMNS)
    .eq('user_id', userId)
    .eq('status', 'approved')
    .order('approved_at', { ascending: false })
    .limit(5);
  if (error) return null;
  return ((data ?? []) as unknown as CertificateRow[]).find((row) => certificateIsUsable(row)) ?? null;
}

/** What the account page and checkout show about a saved certificate (never the photo, never the full number). */
export type SavedCertificateView = {
  id: string;
  businessName: string | null;
  certType: TaxCertType | null;
  typeLabel: string;
  masked: string;
  validThrough: string | null;
  approvedOn: string | null;
};

export function savedCertificateView(row: CertificateRow): SavedCertificateView {
  return {
    id: row.id,
    businessName: row.business_name,
    certType: row.cert_type,
    typeLabel: row.cert_type ? TAX_CERT_TYPE_LABELS[row.cert_type].long : 'Florida certificate',
    masked: maskCertNumber(row.cert_number),
    validThrough: formatCertDate(certificateUsableThrough(row)),
    approvedOn: formatCertDate(row.approved_at),
  };
}

// ---------------------------------------------------------------------------
// Website requests
// ---------------------------------------------------------------------------

export type RequestCart = {
  items: { productId?: string; title: string; price: number; quantity: number }[];
  subtotal: number | null;
  shippingFee: number | null;
  tax: number | null;
  total: number | null;
  shippingMethod: string | null;
  shippingState: string | null;
};

export type TaxExemptRequestRow = {
  id: string;
  ref: number;
  created_at: string;
  token: string;
  status: TaxExemptRequestStatus;
  locale: string;
  photo_path: string;
  photo_mime: string | null;
  ai_read: CertificateRead | null;
  ai_checks: CertificateChecks | null;
  cert_type: TaxCertType | null;
  business_name: string | null;
  cert_number: string | null;
  expires_on: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  user_id: string | null;
  save_to_account: boolean;
  cart: RequestCart | null;
  submitted_at: string | null;
  decided_at: string | null;
  decided_by_email: string | null;
  decline_reason: string | null;
  approved_until: string | null;
  certificate_id: string | null;
  owner_texted_at: string | null;
};

export const REQUEST_COLUMNS =
  'id, ref, created_at, token, status, locale, photo_path, photo_mime, ai_read, ai_checks, cert_type, business_name, cert_number, expires_on, customer_name, customer_email, customer_phone, user_id, save_to_account, cart, submitted_at, decided_at, decided_by_email, decline_reason, approved_until, certificate_id, owner_texted_at';

export function newRequestToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64url');
}

export function isRequestToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{24,64}$/.test(value);
}

export async function findRequestByToken(service: SupabaseClient, token: string): Promise<TaxExemptRequestRow | null> {
  if (!isRequestToken(token)) return null;
  const { data } = await service.from('tax_exempt_requests').select(REQUEST_COLUMNS).eq('token', token).maybeSingle();
  return (data as unknown as TaxExemptRequestRow) ?? null;
}

export async function findRequestById(service: SupabaseClient, id: string): Promise<TaxExemptRequestRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await service.from('tax_exempt_requests').select(REQUEST_COLUMNS).eq('id', id).maybeSingle();
  return (data as unknown as TaxExemptRequestRow) ?? null;
}

export function requestIsLive(row: Pick<TaxExemptRequestRow, 'status' | 'approved_until'>, now: Date = new Date()): boolean {
  return row.status === 'approved' && Boolean(row.approved_until) && new Date(row.approved_until as string).getTime() > now.getTime();
}

/** Drafts nobody sent: delete the row and its file after a week (best-effort, a few at a time). */
export async function sweepAbandonedDrafts(service: SupabaseClient): Promise<void> {
  const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data } = await service
    .from('tax_exempt_requests')
    .select('id, photo_path')
    .eq('status', 'draft')
    .lt('created_at', cutoff)
    .limit(10);
  for (const row of (data ?? []) as { id: string; photo_path: string }[]) {
    await service.from('tax_exempt_requests').delete().eq('id', row.id).eq('status', 'draft');
    await removeUnreferencedCertificateFile(service, row.photo_path);
  }
}

// ---------------------------------------------------------------------------
// My Account: verify before shopping (owner, mockup v3 2026-10-27)
// ---------------------------------------------------------------------------

/** A request sent from My Account carries no cart (checkout always stores one). */
export function isAccountRequest(row: Pick<TaxExemptRequestRow, 'cart'>): boolean {
  return row.cart == null;
}

/** A declined request stays on the account card this long (then the card is plain again). */
const ACCOUNT_DECLINE_SHOWN_DAYS = 14;

export type AccountRequestView = {
  token: string;
  status: 'pending' | 'declined';
  ref: string | null;
  businessName: string | null;
  tag: string;
  submittedAt: string | null;
  declineReason: string | null;
  storeOpen: boolean | null;
  opensLabel: string | null;
};

export type AccountTaxExemptState = {
  /** The usable certificate saved to this account (checkout applies it). */
  certificate: SavedCertificateView | null;
  /** The newest saved certificate when none is usable any more — "Expired: upload your new one". */
  expired: SavedCertificateView | null;
  /** A request saved to this account still waiting, or recently declined. */
  request: AccountRequestView | null;
};

/**
 * What My Account (and checkout, for "still waiting") shows for one signed-in
 * customer. Reads only rows linked to `userId`; the token it returns belongs
 * to that customer's own request (it lets the card cancel it).
 */
export async function accountTaxExemptState(service: SupabaseClient, userId: string, isEs = false): Promise<AccountTaxExemptState> {
  const [certificates, requests] = await Promise.all([
    service
      .from('tax_exempt_certificates')
      .select(CERTIFICATE_COLUMNS)
      .eq('user_id', userId)
      .eq('status', 'approved')
      .order('approved_at', { ascending: false })
      .limit(5),
    service
      .from('tax_exempt_requests')
      .select(REQUEST_COLUMNS)
      .eq('user_id', userId)
      .eq('save_to_account', true)
      .in('status', ['pending', 'declined'])
      .order('submitted_at', { ascending: false })
      .limit(1),
  ]);
  const rows = (certificates.error ? [] : (certificates.data ?? [])) as unknown as CertificateRow[];
  const usable = rows.find((row) => certificateIsUsable(row)) ?? null;
  const expired = !usable && rows[0] ? rows[0] : null;

  let request: AccountRequestView | null = null;
  const latest = ((requests.error ? [] : (requests.data ?? [])) as unknown as TaxExemptRequestRow[])[0];
  if (latest) {
    const decidedMs = latest.decided_at ? new Date(latest.decided_at).getTime() : 0;
    const showDecline = latest.status === 'declined'
      && Date.now() - decidedMs < ACCOUNT_DECLINE_SHOWN_DAYS * 86_400_000
      && (!usable || decidedMs > new Date(usable.approved_at).getTime());
    if (latest.status === 'pending' || showDecline) {
      const window = latest.status === 'pending' ? await storeApprovalWindow(new Date(), isEs) : null;
      request = {
        token: latest.token,
        status: latest.status as 'pending' | 'declined',
        ref: requestRefLabel(latest.ref),
        businessName: latest.business_name,
        tag: exemptShortTag({ certType: latest.cert_type, certNumber: latest.cert_number }),
        submittedAt: latest.submitted_at,
        declineReason: latest.status === 'declined' ? latest.decline_reason : null,
        storeOpen: window?.open ?? null,
        opensLabel: window?.opensLabel ?? null,
      };
    }
  }
  return {
    certificate: usable ? savedCertificateView(usable) : null,
    expired: expired ? savedCertificateView(expired) : null,
    request,
  };
}

// ---------------------------------------------------------------------------
// Checkout: which exemption (if any) applies to this payment
// ---------------------------------------------------------------------------

export type CheckoutExemptionInput = {
  /** A website request the buyer's browser holds. */
  token?: string | null;
  /** The buyer kept "use my saved certificate" on (signed in). */
  useSaved?: boolean;
};

export function parseCheckoutExemptionInput(raw: unknown): CheckoutExemptionInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const token = isRequestToken(source.token) ? source.token : null;
  const useSaved = source.useSaved === true;
  return token || useSaved ? { token, useSaved } : null;
}

export type CheckoutExemption = {
  certificate: CertificateRow;
  via: 'website' | 'account';
  requestRef: string | null;
  requestId: string | null;
};

/**
 * ⛔ The ONLY door through which checkout drops the tax. A token counts only
 * when the owner approved that request, within 24 hours, for the SAME email;
 * a saved certificate only for the signed-in account it was saved to.
 */
export async function resolveCheckoutExemption(
  service: SupabaseClient,
  input: CheckoutExemptionInput | null,
  buyer: { email: string | null; userId: string | null },
): Promise<CheckoutExemption | null> {
  if (!input) return null;
  if (input.token) {
    const request = await findRequestByToken(service, input.token);
    const sameEmail = Boolean(buyer.email) && request?.customer_email?.toLowerCase() === buyer.email?.trim().toLowerCase();
    if (request && requestIsLive(request) && sameEmail && request.certificate_id) {
      const certificate = await findCertificate(service, request.certificate_id);
      if (certificate && certificate.status === 'approved') {
        return { certificate, via: 'website', requestRef: requestRefLabel(request.ref), requestId: request.id };
      }
    }
  }
  if (input.useSaved && buyer.userId) {
    const certificate = await savedCertificateForUser(service, buyer.userId);
    if (certificate) return { certificate, via: 'account', requestRef: null, requestId: null };
  }
  return null;
}

export function checkoutExemptionSnapshot(exemption: CheckoutExemption, taxNotCharged: number): TaxExemptSnapshot {
  return snapshotFromCertificate(exemption.certificate, {
    approvedVia: exemption.via,
    taxNotCharged,
    requestRef: exemption.requestRef,
  });
}

// ---------------------------------------------------------------------------
// Store hours: is someone there to approve?
// ---------------------------------------------------------------------------

function easternParts(now: Date): { day: WeekDay; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: SHOWROOM_TIME_ZONE, weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { day: get('weekday') as WeekDay, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Open now, or when it opens next ("11 AM", "11 AM tomorrow", "11 AM Tuesday"). */
export async function storeApprovalWindow(now: Date = new Date(), isEs = false): Promise<{ open: boolean; opensLabel: string | null }> {
  const schedule = await getStoreHours();
  const { day, minutes } = easternParts(now);
  const today = schedule[day];
  if (today?.open && minutes >= toMinutes(today.opens) && minutes < toMinutes(today.closes)) return { open: true, opensLabel: null };
  if (today?.open && minutes < toMinutes(today.opens)) return { open: false, opensLabel: opensAtLabel(today.opens, isEs) };
  const index = WEEK_ORDER.indexOf(day);
  for (let step = 1; step <= 7; step += 1) {
    const next = WEEK_ORDER[(index + step) % 7];
    if (schedule[next]?.open) {
      const time = opensAtLabel(schedule[next].opens, isEs);
      const when = step === 1 ? (isEs ? 'mañana' : 'tomorrow') : (isEs ? ESP_DAYS[next] : next);
      return { open: false, opensLabel: time ? `${time} ${when}` : null };
    }
  }
  return { open: false, opensLabel: null };
}

const ESP_DAYS: Record<WeekDay, string> = {
  Monday: 'el lunes', Tuesday: 'el martes', Wednesday: 'el miércoles', Thursday: 'el jueves', Friday: 'el viernes', Saturday: 'el sábado', Sunday: 'el domingo',
};

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

async function sendEmail(input: { to: string; subject: string; html: string; text: string; replyTo?: string; idempotencyKey: string }): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return false;
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(resendKey);
    const { error } = await resend.emails.send(
      {
        from: 'Naples Estate Jewelry <noreply@naplesestatejewelry.com>',
        to: input.to,
        ...(input.replyTo ? { replyTo: input.replyTo } : {}),
        subject: input.subject,
        html: input.html,
        text: input.text,
      },
      { idempotencyKey: input.idempotencyKey },
    );
    if (error) {
      console.error('[tax-exempt] email error:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[tax-exempt] email error:', error);
    return false;
  }
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function simpleEmailHtml(heading: string, paragraphs: string[], button?: { label: string; url: string }): string {
  return `<!doctype html><html><body style="margin:0;background:#f7f4ec;font-family:Arial,Helvetica,sans-serif;color:#1d1a14;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:28px 14px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #eadfbd;">
<tr><td style="padding:22px 28px;border-bottom:2px solid #735c00;font-family:Georgia,serif;font-size:20px;">Naples Estate Jewelry</td></tr>
<tr><td style="padding:24px 28px;">
<h1 style="margin:0 0 14px;font-family:Georgia,serif;font-size:21px;font-weight:normal;">${esc(heading)}</h1>
${paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;">${esc(p)}</p>`).join('')}
${button ? `<p style="margin:20px 0;text-align:center;"><a href="${esc(button.url)}" style="display:inline-block;background:#b5890c;color:#fff;text-decoration:none;padding:13px 26px;border-radius:999px;font-size:13px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;">${esc(button.label)}</a></p>` : ''}
<p style="margin:18px 0 0;font-size:13px;color:#746b5b;text-align:center;">Questions? Call or text ${esc(STORE_TEXT_NUMBER)}</p>
</td></tr></table></td></tr></table></body></html>`;
}

/**
 * The owner's text for a request that passed the AI checks (owner, 2026-10-27:
 * "notify me (admin) via text message that i have an approval needed"). From
 * the same Twilio number as the offer texts. If Twilio is not set up or the
 * send fails, an email to info@ goes instead so the request is never silent.
 */
export async function notifyOwnerOfRequest(service: SupabaseClient, request: TaxExemptRequestRow): Promise<void> {
  const ref = requestRefLabel(request.ref) ?? 'TX';
  const url = `${getSiteUrl()}/admin/tax-exempt/${request.id}`;
  const body = ownerApprovalTextBody({
    ref,
    businessName: request.business_name,
    certType: request.cert_type,
    certNumber: request.cert_number,
    expiresOn: request.expires_on,
    cartTotal: request.cart?.total ?? null,
    tax: request.cart?.tax ?? null,
    customerName: request.customer_name,
    customerPhone: request.customer_phone,
    url,
    forAccount: isAccountRequest(request),
    aiRead: Boolean(request.ai_checks),
  });
  let texted = false;
  try {
    const { twilioConfigured, DEFAULT_FORWARD_TO } = await import('@/lib/text-alerts/config');
    if (twilioConfigured()) {
      const { sendTwilioMessage } = await import('@/lib/text-alerts/twilio');
      await sendTwilioMessage({ to: process.env.TWILIO_FORWARD_TO?.trim() || DEFAULT_FORWARD_TO, body });
      texted = true;
    }
  } catch (error) {
    console.error('[tax-exempt] owner text error:', error instanceof Error ? error.message : error);
  }
  if (texted) {
    await service.from('tax_exempt_requests').update({ owner_texted_at: new Date().toISOString() }).eq('id', request.id);
    return;
  }
  const emailed = await sendEmail({
    to: ownerNotificationRecipient(),
    replyTo: request.customer_email ?? undefined,
    subject: `Tax-exempt approval needed · ${ref} · ${request.business_name ?? 'website buyer'}${isAccountRequest(request) ? ' · for their account' : ''}`,
    html: simpleEmailHtml('Tax-exempt approval needed', [body.replace(` ${url}`, '')], { label: 'Review the certificate', url }),
    text: body,
    idempotencyKey: `tax-exempt-${request.id}-owner`,
  });
  if (emailed) await service.from('tax_exempt_requests').update({ owner_emailed_at: new Date().toISOString() }).eq('id', request.id);
}

/**
 * The buyer's email after the owner decided: approved (with the link back to
 * checkout) or declined (with the reason). A request sent from My Account has
 * no checkout to go back to: its emails point to the shop / My Account.
 */
export async function emailBuyerDecision(service: SupabaseClient, request: TaxExemptRequestRow, certificate: CertificateRow | null): Promise<void> {
  if (!request.customer_email) return;
  if (isAccountRequest(request)) {
    await emailAccountDecision(service, request, certificate);
    return;
  }
  const isEs = request.locale === 'es';
  const checkoutUrl = `${getSiteUrl()}${isEs ? '/es' : ''}/checkout?taxExempt=${encodeURIComponent(request.token)}`;
  const firstName = (request.customer_name ?? '').split(' ')[0] || (isEs ? 'hola' : 'there');
  const tag = certificate ? exemptShortTag({ certType: certificate.cert_type, certNumber: certificate.cert_number }) : '';
  let sent = false;
  if (request.status === 'approved') {
    const heading = isEs ? 'Aprobado para comprar sin impuesto' : "You're approved to buy tax-exempt";
    const paragraphs = isEs
      ? [
        `Hola ${firstName}: aprobamos su certificado de Florida ${tag}${request.business_name ? ` de ${request.business_name}` : ''}.`,
        'Si todavía tiene abierta la página de pago, su total ya se actualizó. Si la cerró, use el botón para terminar su pedido sin impuesto.',
        `La aprobación es válida por ${TAX_EXEMPT_APPROVAL_HOURS} horas. Cada pieza es única y sigue a la venta hasta que se pague.`,
      ]
      : [
        `Hi ${firstName}, we approved Florida certificate ${tag}${request.business_name ? ` for ${request.business_name}` : ''}.`,
        'If your checkout page is still open, your total has already updated. If you closed it, use the button to finish your order with no sales tax.',
        `This approval is good for ${TAX_EXEMPT_APPROVAL_HOURS} hours. Each piece is one of a kind and stays for sale until it is paid for.`,
      ];
    const label = isEs ? 'Terminar mi pedido' : 'Finish your order';
    sent = await sendEmail({
      to: request.customer_email,
      subject: isEs ? 'Su exención de impuesto fue aprobada' : 'Your tax exemption is approved',
      html: simpleEmailHtml(heading, paragraphs, { label, url: checkoutUrl }),
      text: [heading, '', ...paragraphs, '', `${label}: ${checkoutUrl}`, '', `${isEs ? 'Preguntas' : 'Questions'}: ${STORE_TEXT_NUMBER}`].join('\n'),
      idempotencyKey: `tax-exempt-${request.id}-approved`,
    });
  } else if (request.status === 'declined') {
    const heading = isEs ? 'No pudimos aprobar su certificado' : "We couldn't approve your certificate";
    const paragraphs = isEs
      ? [
        `Hola ${firstName}: no pudimos aprobar el certificado que envió.`,
        ...(request.decline_reason ? [`Motivo: ${request.decline_reason}`] : []),
        `Puede pagar con el impuesto, subir otro certificado en la página de pago, o enviarnos un mensaje de texto al ${STORE_TEXT_NUMBER}.`,
      ]
      : [
        `Hi ${firstName}, we couldn't approve the certificate you sent.`,
        ...(request.decline_reason ? [`Reason: ${request.decline_reason}`] : []),
        `You can pay with tax, upload another certificate at checkout, or text us at ${STORE_TEXT_NUMBER}.`,
      ];
    sent = await sendEmail({
      to: request.customer_email,
      subject: isEs ? 'Su certificado de exención' : 'Your tax-exempt certificate',
      html: simpleEmailHtml(heading, paragraphs, { label: isEs ? 'Volver al pago' : 'Back to checkout', url: `${getSiteUrl()}${isEs ? '/es' : ''}/checkout` }),
      text: [heading, '', ...paragraphs].join('\n'),
      idempotencyKey: `tax-exempt-${request.id}-declined`,
    });
  }
  if (sent) await service.from('tax_exempt_requests').update({ buyer_emailed_at: new Date().toISOString() }).eq('id', request.id);
}

/** Approved / declined email for a certificate sent from My Account (mockup v3). */
async function emailAccountDecision(service: SupabaseClient, request: TaxExemptRequestRow, certificate: CertificateRow | null): Promise<void> {
  if (!request.customer_email) return;
  const isEs = request.locale === 'es';
  const site = `${getSiteUrl()}${isEs ? '/es' : ''}`;
  const firstName = (request.customer_name ?? '').split(' ')[0] || (isEs ? 'hola' : 'there');
  let sent = false;
  if (request.status === 'approved' && certificate) {
    const type = certificate.cert_type ? TAX_CERT_TYPE_LABELS[certificate.cert_type] : null;
    const typeName = type ? (isEs ? type.es : `Florida ${type.long}`) : (isEs ? 'certificado de Florida' : 'Florida certificate');
    const through = formatCertDate(certificateUsableThrough(certificate));
    const detail = [maskCertNumber(certificate.cert_number), through ? `${isEs ? 'válido hasta' : 'valid through'} ${through}` : null].filter(Boolean).join(', ');
    const heading = isEs ? 'Su exención de impuesto está aprobada' : 'Your tax-exempt status is approved';
    const paragraphs = isEs
      ? [
        `Hola ${firstName}: verificamos su ${typeName}${certificate.business_name ? ` de ${certificate.business_name}` : ''}${detail ? ` (${detail})` : ''}.`,
        'Quedó guardado en su cuenta: cuando pague con su sesión iniciada, el impuesto de Florida se quita solo.',
        'Puede verlo o quitarlo cuando quiera en Mi Cuenta.',
      ]
      : [
        `Hi ${firstName}, we verified your ${typeName}${certificate.business_name ? ` for ${certificate.business_name}` : ''}${detail ? ` (${detail})` : ''}.`,
        "It's saved to your account: when you check out signed in, Florida sales tax comes off automatically.",
        'You can see or remove it anytime in My Account.',
      ];
    const label = isEs ? 'Ver la tienda' : 'Shop now';
    sent = await sendEmail({
      to: request.customer_email,
      subject: heading,
      html: simpleEmailHtml(heading, paragraphs, { label, url: `${site}/shop` }),
      text: [heading, '', ...paragraphs, '', `${label}: ${site}/shop`, '', `${isEs ? 'Preguntas' : 'Questions'}: ${STORE_TEXT_NUMBER}`].join('\n'),
      idempotencyKey: `tax-exempt-${request.id}-approved`,
    });
  } else if (request.status === 'declined') {
    const heading = isEs ? 'No pudimos aprobar su certificado' : "We couldn't approve your certificate";
    const paragraphs = isEs
      ? [
        `Hola ${firstName}: no pudimos aprobar el certificado que envió desde su cuenta.`,
        ...(request.decline_reason ? [`Motivo: ${request.decline_reason}`] : []),
        `Puede enviar otro desde Mi Cuenta, o enviarnos un mensaje de texto al ${STORE_TEXT_NUMBER}.`,
      ]
      : [
        `Hi ${firstName}, we couldn't approve the certificate you sent from your account.`,
        ...(request.decline_reason ? [`Reason: ${request.decline_reason}`] : []),
        `You can send another one from My Account, or text us at ${STORE_TEXT_NUMBER}.`,
      ];
    const label = isEs ? 'Ir a Mi Cuenta' : 'Go to My Account';
    sent = await sendEmail({
      to: request.customer_email,
      subject: isEs ? 'Su certificado de exención' : 'Your tax-exempt certificate',
      html: simpleEmailHtml(heading, paragraphs, { label, url: `${site}/account` }),
      text: [heading, '', ...paragraphs, '', `${label}: ${site}/account`].join('\n'),
      idempotencyKey: `tax-exempt-${request.id}-declined`,
    });
  }
  if (sent) await service.from('tax_exempt_requests').update({ buyer_emailed_at: new Date().toISOString() }).eq('id', request.id);
}
