import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getVerifiedUser } from '@/lib/auth-claims';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { buildOrderDraft, isOrderDraftError, normalizeOrderLines, type OrderLine } from '@/lib/checkout-pricing';
import { isCheckoutShippingMethod } from '@/lib/checkout-shipping';
import { normalizeDiscountCode } from '@/lib/discount-codes';
import { makeDiscountResolver } from '@/lib/discount-codes-server';
import { normalizePersonName } from '@/lib/person-name';
import { normalizePhoneNumber } from '@/lib/phone';
import {
  findRequestByToken,
  notifyOwnerOfRequest,
  REQUEST_COLUMNS,
  storeApprovalWindow,
  type RequestCart,
  type TaxExemptRequestRow,
} from '@/lib/tax-exempt-server';
import { requestRefLabel } from '@/lib/tax-exempt';

/**
 * Checkout → "Send for approval": the buyer certified the purchase and the
 * draft becomes a PENDING request. The owner gets a text (email if Twilio is
 * not available) with a link to approve it. Nothing about the price changes
 * here — the exemption only applies once the owner approves.
 *
 * The cart total in the owner's text is the AUTHORITATIVE one (the same
 * `buildOrderDraft` as checkout), never a figure from the browser.
 */
export const runtime = 'nodejs';
export const maxDuration = 30;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  const ip = getClientIp(req);
  if (!(await checkRateLimit(`tax-exempt-submit:${ip}`, 10, 3600))) {
    return NextResponse.json({ error: 'Too many requests. Please text us at (239) 404-8505.' }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const isEs = body?.locale === 'es';
  if (!body) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  if (body.certify !== true) {
    return NextResponse.json({ error: isEs ? 'Marque la casilla de certificación.' : 'Tick the box to certify the purchase.' }, { status: 400 });
  }
  const customer = (body.customer ?? {}) as Record<string, unknown>;
  const name = normalizePersonName(String(customer.name ?? ''));
  const email = String(customer.email ?? '').trim().toLowerCase();
  const phone = normalizePhoneNumber(String(customer.phone ?? ''));
  if (!name || !EMAIL_PATTERN.test(email) || !phone) {
    return NextResponse.json(
      { error: isEs ? 'Primero complete su nombre, correo y teléfono en el formulario de pago.' : 'Fill in your name, email and phone on the checkout form first.' },
      { status: 400 },
    );
  }

  const service = createServiceClient();
  const request = await findRequestByToken(service, String(body.token ?? ''));
  if (!request) return NextResponse.json({ error: isEs ? 'Suba el certificado de nuevo.' : 'Please upload the certificate again.' }, { status: 404 });
  if (request.status !== 'draft') {
    return NextResponse.json({ error: isEs ? 'Esta solicitud ya se envió.' : 'This request was already sent.', status: request.status }, { status: 409 });
  }

  const supabase = await createClient();
  const user = await getVerifiedUser(supabase).catch(() => null);

  // The cart, priced by the server.
  const cartBody = (body.cart ?? {}) as Record<string, unknown>;
  const lines: OrderLine[] = Array.isArray(cartBody.items)
    ? (cartBody.items as { id?: unknown; quantity?: unknown }[]).map((entry) => ({ productId: String(entry?.id ?? ''), quantity: Number(entry?.quantity ?? 1) }))
    : [];
  const shippingMethod = String(cartBody.shippingMethod ?? 'local-pickup');
  const shippingState = typeof cartBody.shippingState === 'string' ? cartBody.shippingState : null;
  let cart: RequestCart = { items: [], subtotal: null, shippingFee: null, tax: null, total: null, shippingMethod, shippingState };
  if (normalizeOrderLines(lines).length > 0 && isCheckoutShippingMethod(shippingMethod)) {
    const code = normalizeDiscountCode(typeof cartBody.discountCode === 'string' ? cartBody.discountCode : null);
    const draft = await buildOrderDraft(supabase, lines, shippingMethod, shippingState, code ? makeDiscountResolver(service, code, email) : null);
    if (!isOrderDraftError(draft)) {
      cart = {
        items: draft.items.map((item) => ({ productId: item.product_id, title: item.title_snapshot, price: item.price_snapshot, quantity: item.quantity })),
        subtotal: draft.subtotal,
        shippingFee: draft.shippingFee,
        tax: draft.tax,
        total: draft.total,
        shippingMethod,
        shippingState,
      };
    }
  }

  const now = new Date().toISOString();
  const { data: updated, error } = await service
    .from('tax_exempt_requests')
    .update({
      status: 'pending',
      customer_name: name,
      customer_email: email,
      customer_phone: phone,
      user_id: user?.id ?? request.user_id ?? null,
      save_to_account: Boolean(user) && body.saveToAccount === true,
      cart,
      certified_at: now,
      submitted_at: now,
    })
    .eq('id', request.id)
    .eq('status', 'draft')
    .select(REQUEST_COLUMNS)
    .maybeSingle();
  if (error || !updated) {
    console.error('[tax-exempt] submit failed', error?.message);
    return NextResponse.json({ error: isEs ? 'No se pudo enviar. Intente de nuevo.' : 'Could not send it. Please try again.' }, { status: 500 });
  }
  const row = updated as unknown as TaxExemptRequestRow;
  // Awaited: on Netlify anything after the response may never run.
  await notifyOwnerOfRequest(service, row);

  const window = await storeApprovalWindow(new Date(), isEs);
  return NextResponse.json({
    status: 'pending',
    ref: requestRefLabel(row.ref),
    submittedAt: row.submitted_at,
    storeOpen: window.open,
    opensLabel: window.opensLabel,
  });
}
