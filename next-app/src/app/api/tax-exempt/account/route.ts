import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getVerifiedUser } from '@/lib/auth-claims';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { normalizePersonName } from '@/lib/person-name';
import { normalizePhoneNumber } from '@/lib/phone';
import {
  findRequestByToken,
  notifyOwnerOfRequest,
  REQUEST_COLUMNS,
  storeApprovalWindow,
  type TaxExemptRequestRow,
} from '@/lib/tax-exempt-server';
import { exemptShortTag, requestRefLabel } from '@/lib/tax-exempt';

/**
 * My Account → "Send for verification" (owner, mockup v3 2026-10-27: verify
 * the certificate "before going through checkout"). Same draft as checkout
 * (`/api/tax-exempt/read` made it), but with NO cart: the request is always
 * saved to this account, the owner's text says "for their account, no order
 * yet", and approving it saves the certificate to the account. Checkout then
 * applies it through the saved-certificate door of `resolveCheckoutExemption`
 * — this route never changes a price.
 *
 * Signed in only. Name and email come from the account; the phone is typed (or
 * prefilled) on the card so the owner can text with a question.
 */
export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: Request) {
  const ip = getClientIp(req);
  if (!(await checkRateLimit(`tax-exempt-submit:${ip}`, 10, 3600))) {
    return NextResponse.json({ error: 'Too many requests. Please text us at (239) 404-8505.' }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const isEs = body?.locale === 'es';
  if (!body) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const supabase = await createClient();
  const user = await getVerifiedUser(supabase).catch(() => null);
  if (!user?.email) return NextResponse.json({ error: isEs ? 'Inicie sesión primero.' : 'Please sign in first.' }, { status: 401 });

  if (body.certify !== true) {
    return NextResponse.json({ error: isEs ? 'Marque la casilla de certificación.' : 'Tick the box to certify.' }, { status: 400 });
  }
  const phone = normalizePhoneNumber(String(body.phone ?? ''));
  if (!phone) {
    return NextResponse.json({ error: isEs ? 'Escriba un número de celular válido.' : 'Enter a valid mobile number.' }, { status: 400 });
  }

  const service = createServiceClient();
  const request = await findRequestByToken(service, String(body.token ?? ''));
  // A draft made while signed out has no owner yet; one made by another account is not this customer's.
  if (!request || (request.user_id && request.user_id !== user.id)) {
    return NextResponse.json({ error: isEs ? 'Suba el certificado de nuevo.' : 'Please upload the certificate again.' }, { status: 404 });
  }
  if (request.status !== 'draft') {
    return NextResponse.json({ error: isEs ? 'Esta solicitud ya se envió.' : 'This request was already sent.', status: request.status }, { status: 409 });
  }

  const { data: profile } = await supabase.from('profiles').select('full_name, first_name, last_name').eq('id', user.id).maybeSingle();
  const profileRow = (profile ?? {}) as { full_name?: string | null; first_name?: string | null; last_name?: string | null };
  const name = normalizePersonName(profileRow.full_name || [profileRow.first_name, profileRow.last_name].filter(Boolean).join(' ')) || null;

  // One waiting request per account: a new one replaces an older one still waiting.
  await service
    .from('tax_exempt_requests')
    .update({ status: 'cancelled' })
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .is('cart', null);

  const now = new Date().toISOString();
  const { data: updated, error } = await service
    .from('tax_exempt_requests')
    .update({
      status: 'pending',
      locale: isEs ? 'es' : 'en',
      customer_name: name,
      customer_email: user.email.toLowerCase(),
      customer_phone: phone,
      user_id: user.id,
      save_to_account: true,
      cart: null,
      certified_at: now,
      submitted_at: now,
    })
    .eq('id', request.id)
    .eq('status', 'draft')
    .select(REQUEST_COLUMNS)
    .maybeSingle();
  if (error || !updated) {
    console.error('[tax-exempt] account submit failed', error?.message);
    return NextResponse.json({ error: isEs ? 'No se pudo enviar. Intente de nuevo.' : 'Could not send it. Please try again.' }, { status: 500 });
  }
  const row = updated as unknown as TaxExemptRequestRow;
  // Awaited: on Netlify anything after the response may never run.
  await notifyOwnerOfRequest(service, row);

  const window = await storeApprovalWindow(new Date(), isEs);
  return NextResponse.json({
    request: {
      token: row.token,
      status: 'pending',
      ref: requestRefLabel(row.ref),
      businessName: row.business_name,
      tag: exemptShortTag({ certType: row.cert_type, certNumber: row.cert_number }),
      submittedAt: row.submitted_at,
      declineReason: null,
      storeOpen: window.open,
      opensLabel: window.opensLabel,
    },
  });
}
