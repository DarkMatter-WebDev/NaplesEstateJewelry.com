import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { revalidatePath, revalidateTag } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CHECKOUT_PRODUCT_COLUMNS,
  buildOrderDraft,
  isOrderDraftError,
  round2,
  type CheckoutOrderItem,
} from '@/lib/checkout-pricing';
import { isCheckoutShippingMethod, shippingMethodForDb } from '@/lib/checkout-shipping';
import {
  authorizePayPalOrder,
  capturePayPalAuthorization,
  createPayPalOrder,
  getPayPalOrderAuthorization,
  voidPayPalAuthorization,
  type PayPalAuthorizationResult,
} from '@/lib/paypal';
import { fetchSpotData } from '@/lib/spot-price';
import { buildAddressObject, generateOrderNumber, getSnapshotPrice } from '@/lib/sales';
import {
  inferProductJewelryType,
  isProductPurchasable,
  normalizeProductLinkType,
  productJewelryTypeLabel,
  productLengthSizeDisplay,
  productWidthDisplay,
  type Product,
  type SpotData,
} from '@/types/product';
import { calcSpotMeltValue } from '@/lib/pricing';
import { normalizePersonName } from '@/lib/person-name';
import { normalizePhoneNumber } from '@/lib/phone';
import { validateUsShippingAddress } from '@/lib/us-address';
import { getSiteUrl } from '@/lib/order-email-branding';
import { ownerNotificationRecipient } from '@/lib/order-owner-notification';
import { buildOfferBuyerEmail, buildOwnerOfferEmail } from '@/lib/offer-emails';
import {
  OWNER_NOTE_MAX,
  OFFER_ABANDON_AFTER_MINUTES,
  type OfferItemDetails,
  OFFER_MESSAGE_MAX,
  buyerEmailForStatus,
  cleanOfferText,
  computeOfferTotals,
  counterAmountMessage,
  counterAmountProblem,
  counterExpiresAt,
  isCounterLive,
  isOfferLive,
  isOfferStatus,
  OFFER_DELETE_MAX,
  offerAmountMessage,
  offerAmountProblem,
  offerDeleteBlock,
  offerExpiresAt,
  offerPayPalReference,
  ownerOfferTextBody,
  parseOfferAmount,
  statusesForFilter,
  type OfferFilter,
  type OfferStatus,
} from '@/lib/offers';

/**
 * "Make an Offer" — everything that touches the database, PayPal, email and
 * Twilio (owner, 2026-10-15, mockup v2). Pure rules are in lib/offers.ts.
 *
 * Money rules, in one place:
 *  - An offer is a PayPal AUTHORIZE order: the buyer's approval holds the
 *    total; nothing is charged until the owner accepts.
 *  - Accept writes a normal order through the SAME RPCs as the checkout
 *    (create_paypal_order → capture_paypal_order), so stock, sold status,
 *    sold_price, the receipt, the invoice and the marketplace delist all run
 *    exactly as for any sale.
 *  - Every path that ends an offer without a charge releases the hold
 *    (voidPayPalAuthorization). A release PayPal refused is kept as
 *    hold_status 'release_failed' and retried by the 15-minute sweep.
 */

export const OFFER_COLUMNS = [
  'id', 'product_id', 'status', 'amount', 'listed_price', 'shipping_method', 'subtotal', 'tax', 'shipping_fee',
  'total', 'customer_name', 'customer_email', 'customer_phone', 'shipping_address', 'message', 'locale', 'user_id',
  'order_snapshot', 'paypal_order_id', 'authorization_id', 'authorized_at', 'expires_at', 'hold_status',
  'counter_amount', 'counter_note', 'counter_sent_at', 'counter_expires_at', 'order_id', 'decided_at', 'last_error',
  'owner_notified_at', 'notified_status', 'created_at', 'updated_at',
].join(', ');

export type OfferRow = {
  id: string;
  product_id: string;
  status: OfferStatus;
  amount: number;
  listed_price: number | null;
  shipping_method: string;
  subtotal: number;
  tax: number;
  shipping_fee: number;
  total: number;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  shipping_address: Record<string, unknown> | null;
  message: string | null;
  locale: string;
  user_id: string | null;
  order_snapshot: CheckoutOrderItem[];
  paypal_order_id: string | null;
  authorization_id: string | null;
  authorized_at: string | null;
  expires_at: string | null;
  hold_status: 'none' | 'held' | 'released' | 'captured' | 'release_failed';
  counter_amount: number | null;
  counter_note: string | null;
  counter_sent_at: string | null;
  counter_expires_at: string | null;
  order_id: string | null;
  decided_at: string | null;
  last_error: string | null;
  owner_notified_at: string | null;
  notified_status: string | null;
  created_at: string;
  updated_at: string;
};

export type OfferResult<T = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; status: number; error: string; code?: string };

function fail(status: number, error: string, code?: string): { ok: false; status: number; error: string; code?: string } {
  return { ok: false, status, error, ...(code ? { code } : {}) };
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeOfferRow(row: Record<string, unknown>): OfferRow {
  const offer = row as unknown as OfferRow;
  return {
    ...offer,
    amount: toNumber(row.amount),
    listed_price: row.listed_price == null ? null : toNumber(row.listed_price),
    subtotal: toNumber(row.subtotal),
    tax: toNumber(row.tax),
    shipping_fee: toNumber(row.shipping_fee),
    total: toNumber(row.total),
    counter_amount: row.counter_amount == null ? null : toNumber(row.counter_amount),
    status: isOfferStatus(row.status) ? row.status : 'pending',
  };
}

/** The table (or column) is missing because make-offer-2026-10.sql has not run. */
export function isMissingOffersSchemaError(error: { message?: string | null; code?: string | null } | null | undefined): boolean {
  const message = (error?.message ?? '').toLowerCase();
  return error?.code === '42P01'
    || error?.code === 'PGRST205'
    || message.includes('product_offers')
    || message.includes('accepts_offers')
    || message.includes('offer_id');
}

export const OFFERS_SQL_HINT = 'Run supabase/make-offer-2026-10.sql in Supabase first.';

export function hashCounterToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function newCounterToken(): string {
  return randomBytes(24).toString('base64url');
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export type OfferProduct = {
  product: Product;
  /** Today's checkout price; null when it cannot be priced (feed down, no price). */
  listedPrice: number | null;
  purchasable: boolean;
  acceptsOffers: boolean;
};

/** Today's checkout prices for these products, the way checkout prices them. */
export async function loadOfferProducts(
  client: SupabaseClient,
  productIds: string[],
): Promise<Map<string, OfferProduct>> {
  const ids = Array.from(new Set(productIds.filter(Boolean)));
  const result = new Map<string, OfferProduct>();
  if (ids.length === 0) return result;
  const [{ data, error }, spotData] = await Promise.all([
    client.from('products').select(`${CHECKOUT_PRODUCT_COLUMNS}, title_es, accepts_offers`).in('id', ids),
    fetchSpotData(),
  ]);
  if (error) throw error;
  for (const raw of (data ?? []) as unknown as Product[]) {
    const spotDown = spotData.source === 'fallback' && raw.price_mode !== 'manual';
    const price = spotDown ? 0 : round2(getSnapshotPrice(raw, spotData));
    result.set(raw.id, {
      product: raw,
      listedPrice: price > 0 ? price : null,
      purchasable: isProductPurchasable(raw.status, raw.quantity),
      acceptsOffers: raw.accepts_offers === true,
    });
  }
  return result;
}

export async function loadOfferProduct(client: SupabaseClient, productId: string): Promise<OfferProduct | null> {
  return (await loadOfferProducts(client, [productId])).get(productId) ?? null;
}

function productUrl(productId: string, isEs: boolean): string {
  return `${getSiteUrl()}${isEs ? '/es' : ''}/shop/${encodeURIComponent(productId)}`;
}

function adminOffersUrl(): string {
  return `${getSiteUrl()}/admin/offers`;
}

// ---------------------------------------------------------------------------
// Buyer: make an offer
// ---------------------------------------------------------------------------

export type CreateOfferInput = {
  productId: string;
  amount: unknown;
  shippingMethod: string;
  customer: Record<string, unknown>;
  message: unknown;
  locale: string;
  userId: string | null;
};

export async function createOffer(
  service: SupabaseClient,
  input: CreateOfferInput,
): Promise<OfferResult<{ offerId: string; paypalOrderId: string }>> {
  const isEs = input.locale === 'es';
  const loaded = await loadOfferProduct(service, input.productId).catch((error) => {
    if (isMissingOffersSchemaError(error)) return null;
    throw error;
  });
  if (!loaded || !loaded.acceptsOffers) {
    return fail(404, isEs ? 'Esta pieza no acepta ofertas.' : 'This piece is not taking offers.', 'not_accepting');
  }
  if (!loaded.purchasable) {
    return fail(409, isEs ? 'Esta pieza ya no está disponible.' : 'This piece is no longer available.', 'unavailable');
  }
  if (loaded.listedPrice == null) {
    return fail(
      503,
      isEs
        ? 'No podemos tomar ofertas en línea por esta pieza en este momento. Llame al (239) 404-8505.'
        : 'We cannot take online offers on this piece right now. Please call (239) 404-8505.',
      'spot_unavailable',
    );
  }

  const amount = parseOfferAmount(input.amount);
  const amountProblem = offerAmountProblem(amount, loaded.listedPrice);
  if (amountProblem || amount == null) {
    return fail(400, offerAmountMessage(amountProblem ?? 'missing', loaded.listedPrice, isEs), 'amount');
  }

  const shippingMethod = input.shippingMethod;
  if (!isCheckoutShippingMethod(shippingMethod)) return fail(400, 'Invalid shipping method.');
  const needsShipping = shippingMethod !== 'local-pickup';
  const customer = input.customer;

  const name = normalizePersonName(customer.name);
  if (!name) return fail(400, isEs ? 'Escriba su nombre y apellido.' : 'Enter both a first and last name.');
  const phone = normalizePhoneNumber(customer.phone);
  if (!phone) return fail(400, isEs ? 'Escriba un teléfono válido.' : 'Enter a valid phone number.');
  const email = String(customer.email ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail(400, isEs ? 'Escriba un correo electrónico válido.' : 'Enter a valid email address.');
  }

  const addressValidation = needsShipping
    ? validateUsShippingAddress({
        line1: customer.address_line1,
        line2: customer.address_line2,
        city: customer.city,
        state: customer.state,
        postalCode: customer.postal_code,
        country: customer.country,
      })
    : null;
  if (addressValidation?.error) return fail(400, addressValidation.error);
  const address = addressValidation?.address ?? null;
  const shippingState = address?.state ?? (typeof customer.state === 'string' ? customer.state : null);

  // The authoritative figures: the checkout's own draft with the offer as the
  // price. The pure computeOfferTotals is what the page showed; both must agree.
  const draft = await buildOrderDraft(
    service,
    [{ productId: input.productId, quantity: 1 }],
    shippingMethod,
    shippingState,
    null,
    { unitPriceOverride: { productId: input.productId, unitPrice: amount } },
  );
  if (isOrderDraftError(draft)) return fail(draft.status, draft.error, draft.code);
  const shown = computeOfferTotals(amount, shippingMethod, shippingState);
  if (!shown || shown.total !== draft.total) {
    return fail(409, isEs ? 'El total cambió. Revise e intente de nuevo.' : 'The total changed. Please review and try again.', 'total_changed');
  }

  const { data: existing, error: existingError } = await service
    .from('product_offers')
    .select('id')
    .eq('product_id', input.productId)
    .ilike('customer_email', email)
    .eq('status', 'open')
    .limit(1);
  if (existingError) {
    if (isMissingOffersSchemaError(existingError)) return fail(503, OFFERS_SQL_HINT);
    throw existingError;
  }
  if (existing && existing.length > 0) {
    return fail(
      409,
      isEs
        ? 'Ya tiene una oferta abierta por esta pieza. Le responderemos pronto.'
        : 'You already have an open offer on this piece. We will answer it soon.',
      'already_open',
    );
  }

  const shippingAddress = buildAddressObject({
    line1: address?.line1 ?? String(customer.address_line1 ?? ''),
    line2: address?.line2 ?? String(customer.address_line2 ?? ''),
    city: address?.city ?? String(customer.city ?? ''),
    state: address?.state ?? String(customer.state ?? ''),
    postalCode: address?.postalCode ?? String(customer.postal_code ?? ''),
    country: address?.country ?? String(customer.country ?? ''),
  });

  const { data: inserted, error: insertError } = await service
    .from('product_offers')
    .insert({
      product_id: input.productId,
      status: 'pending',
      amount,
      listed_price: loaded.listedPrice,
      shipping_method: shippingMethod,
      subtotal: draft.subtotal,
      tax: draft.tax,
      shipping_fee: draft.shippingFee,
      total: draft.total,
      customer_name: name,
      customer_email: email,
      customer_phone: phone,
      shipping_address: shippingAddress,
      message: cleanOfferText(input.message, OFFER_MESSAGE_MAX),
      locale: isEs ? 'es' : 'en',
      user_id: input.userId,
      order_snapshot: draft.items,
    })
    .select('id')
    .single();
  if (insertError || !inserted) {
    if (isMissingOffersSchemaError(insertError)) return fail(503, OFFERS_SQL_HINT);
    throw insertError ?? new Error('Offer row was not created.');
  }
  const offerId = String(inserted.id);

  try {
    const paypalOrder = await createPayPalOrder({
      intent: 'AUTHORIZE',
      currency: 'USD',
      subtotal: draft.subtotal,
      tax: draft.tax,
      shipping: draft.shippingFee,
      total: draft.total,
      items: draft.items.map((item) => ({
        name: item.title_snapshot,
        quantity: '1',
        unitAmount: item.price_snapshot,
        sku: item.inventory_number,
      })),
      referenceId: offerPayPalReference(offerId),
      shippingAddress: address
        ? {
            fullName: name,
            addressLine1: address.line1,
            addressLine2: address.line2,
            city: address.city,
            state: address.state,
            postalCode: address.postalCode,
            countryCode: address.countryCode,
          }
        : null,
    });
    const { error: linkError } = await service
      .from('product_offers')
      .update({ paypal_order_id: paypalOrder.id })
      .eq('id', offerId);
    if (linkError) throw linkError;
    return { ok: true, offerId, paypalOrderId: paypalOrder.id };
  } catch (error) {
    console.error('Offer PayPal order error:', error);
    await service.from('product_offers').update({ status: 'abandoned', last_error: String(error).slice(0, 500) }).eq('id', offerId);
    return fail(502, isEs ? 'No se pudo iniciar PayPal. Intente de nuevo.' : 'Could not start PayPal. Please try again.');
  }
}

// ---------------------------------------------------------------------------
// Buyer approved the PayPal window → hold the money
// ---------------------------------------------------------------------------

async function loadOffer(service: SupabaseClient, column: 'id' | 'paypal_order_id', value: string): Promise<OfferRow | null> {
  const { data, error } = await service.from('product_offers').select(OFFER_COLUMNS).eq(column, value).maybeSingle();
  if (error) throw error;
  return data ? normalizeOfferRow(data as unknown as Record<string, unknown>) : null;
}

export async function authorizeOffer(
  service: SupabaseClient,
  paypalOrderId: string,
): Promise<OfferResult<{ offer: OfferRow }>> {
  const offer = await loadOffer(service, 'paypal_order_id', paypalOrderId);
  if (!offer) return fail(404, 'Offer not found for this payment.');
  if (offer.status === 'open') return { ok: true, offer };
  if (offer.status !== 'pending' && offer.status !== 'abandoned') {
    return fail(409, 'This offer is already closed.', 'closed');
  }
  const isEs = offer.locale === 'es';

  let authorization: PayPalAuthorizationResult;
  try {
    authorization = await authorizePayPalOrder(paypalOrderId);
  } catch (error) {
    console.error('Offer authorize error:', error);
    try {
      authorization = await getPayPalOrderAuthorization(paypalOrderId);
    } catch {
      return fail(502, isEs ? 'PayPal no confirmó la retención.' : 'PayPal did not confirm the hold.');
    }
  }
  if (!authorization.authorizationId || !['CREATED', 'PENDING'].includes(authorization.status)) {
    return fail(402, isEs ? 'PayPal no aprobó la retención del pago.' : 'PayPal did not approve the payment hold.', 'not_authorized');
  }

  const amountOk = authorization.amount != null && Math.abs(authorization.amount - offer.total) <= 0.01 && authorization.currency === 'USD';
  const product = await loadOfferProduct(service, offer.product_id);
  const now = new Date();
  const authorizedAt = authorization.createTime ? new Date(authorization.createTime) : now;

  // Held the wrong amount, or the piece sold while the buyer was in PayPal:
  // release at once and never open the offer.
  if (!amountOk || !product?.purchasable) {
    const released = await voidPayPalAuthorization(authorization.authorizationId).catch(() => ({ released: false as const, captured: false, error: 'void failed' }));
    await service.from('product_offers').update({
      status: !amountOk ? 'abandoned' : 'item_sold',
      authorization_id: authorization.authorizationId,
      authorized_at: authorizedAt.toISOString(),
      hold_status: released.released ? 'released' : 'release_failed',
      decided_at: now.toISOString(),
      last_error: !amountOk ? `Held ${authorization.amount} ${authorization.currency}, expected ${offer.total} USD.` : 'Item sold before the offer opened.',
      // The buyer is told on screen; no email for an offer that never opened.
      notified_status: !amountOk ? 'abandoned' : 'item_sold',
    }).eq('id', offer.id);
    return fail(
      409,
      !amountOk
        ? (isEs ? 'El monto retenido no coincide. No se le cobró nada.' : 'The held amount did not match. You were not charged.')
        : (isEs ? 'Esta pieza se acaba de vender. Se liberó la retención; no se le cobró nada.' : 'This piece just sold. The hold was released — you were not charged.'),
      'unavailable',
    );
  }

  const { data: opened, error: openError } = await service
    .from('product_offers')
    .update({
      status: 'open',
      authorization_id: authorization.authorizationId,
      authorized_at: authorizedAt.toISOString(),
      expires_at: offerExpiresAt(authorizedAt).toISOString(),
      hold_status: 'held',
      last_error: null,
    })
    .eq('id', offer.id)
    .in('status', ['pending', 'abandoned'])
    .select(OFFER_COLUMNS)
    .maybeSingle();

  if (openError || !opened) {
    // A second open offer by the same buyer (the unique index) or a race.
    await voidPayPalAuthorization(authorization.authorizationId).catch(() => null);
    await service.from('product_offers').update({ status: 'abandoned', hold_status: 'released', last_error: openError?.message ?? 'race' }).eq('id', offer.id).eq('status', 'pending');
    return fail(
      409,
      isEs ? 'Ya tiene una oferta abierta por esta pieza. Se liberó esta retención.' : 'You already have an open offer on this piece. This hold was released.',
      'already_open',
    );
  }

  const openOffer = normalizeOfferRow(opened as unknown as Record<string, unknown>);
  await Promise.allSettled([
    notifyOwnerOfOffer(service, openOffer, product),
    sendBuyerEmailForStatus(service, openOffer, product.product.title, product.product.title_es ?? null),
  ]);
  return { ok: true, offer: openOffer };
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

async function sendResend(input: { to: string; subject: string; html: string; text: string; replyTo?: string; idempotencyKey: string }): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return false;
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
    console.error('Offer email error:', error);
    return false;
  }
  return true;
}

/** The owner's email (info@) + a text to the owner's cell. Marks owner_notified_at on success. */
async function notifyOwnerOfOffer(service: SupabaseClient, offer: OfferRow, product: OfferProduct): Promise<void> {
  if (offer.owner_notified_at) return;
  const inventoryNumber = product.product.inventory_number != null ? String(product.product.inventory_number) : null;
  const built = buildOwnerOfferEmail({
    offerId: offer.id,
    productTitle: product.product.title,
    inventoryNumber,
    amount: offer.amount,
    listedPrice: offer.listed_price,
    total: offer.total,
    shippingMethod: offer.shipping_method,
    customerName: offer.customer_name,
    customerEmail: offer.customer_email,
    customerPhone: offer.customer_phone,
    message: offer.message,
    expiresAt: offer.expires_at,
    adminUrl: adminOffersUrl(),
  });
  const [emailed] = await Promise.allSettled([
    sendResend({
      to: ownerNotificationRecipient(),
      replyTo: offer.customer_email,
      subject: built.subject,
      html: built.html,
      text: built.text,
      idempotencyKey: `offer-${offer.id}-owner`,
    }),
    textOwnerAboutOffer(offer, product.product.title, inventoryNumber),
  ]);
  if (emailed.status === 'fulfilled' && emailed.value) {
    await service.from('product_offers').update({ owner_notified_at: new Date().toISOString() }).eq('id', offer.id);
  }
}

async function textOwnerAboutOffer(offer: OfferRow, title: string, inventoryNumber: string | null): Promise<void> {
  try {
    const { twilioConfigured, DEFAULT_FORWARD_TO } = await import('@/lib/text-alerts/config');
    if (!twilioConfigured()) return;
    const { sendTwilioMessage } = await import('@/lib/text-alerts/twilio');
    await sendTwilioMessage({
      to: process.env.TWILIO_FORWARD_TO?.trim() || DEFAULT_FORWARD_TO,
      body: ownerOfferTextBody({
        amount: offer.amount,
        title,
        inventoryNumber,
        listedPrice: offer.listed_price,
        customerName: offer.customer_name,
        shippingMethod: offer.shipping_method,
        expiresAt: offer.expires_at,
        adminUrl: adminOffersUrl(),
      }),
    });
  } catch (error) {
    console.error('Offer owner text error:', error);
  }
}

/** The buyer email for the offer's CURRENT status, once (notified_status). */
async function sendBuyerEmailForStatus(
  service: SupabaseClient,
  offer: OfferRow,
  title: string,
  titleEs: string | null,
  counterToken?: string,
): Promise<boolean> {
  const kind = buyerEmailForStatus(offer.status);
  if (!kind || offer.notified_status === offer.status) return true;
  const isEs = offer.locale === 'es';
  // A counter email needs the raw token, which only exists at the moment the
  // counter is made; a retry without it cannot rebuild the link.
  if (kind === 'countered' && !counterToken) return false;
  const built = buildOfferBuyerEmail({
    kind,
    isEs,
    customerName: offer.customer_name,
    productTitle: (isEs ? titleEs : null) || title,
    productUrl: productUrl(offer.product_id, isEs),
    amount: offer.amount,
    total: offer.total,
    expiresAt: offer.expires_at,
    counterAmount: offer.counter_amount,
    ownerNote: offer.counter_note,
    counterUrl: counterToken ? counterUrl(counterToken, isEs) : null,
    counterExpiresAt: offer.counter_expires_at,
  });
  const sent = await sendResend({
    to: offer.customer_email,
    subject: built.subject,
    html: built.html,
    text: built.text,
    idempotencyKey: `offer-${offer.id}-${offer.status}`,
  }).catch(() => false);
  if (sent) {
    await service.from('product_offers').update({ notified_status: offer.status }).eq('id', offer.id);
  }
  return sent;
}

export function counterUrl(token: string, isEs: boolean): string {
  return `${getSiteUrl()}${isEs ? '/es' : ''}/offer/counter/${encodeURIComponent(token)}`;
}

// ---------------------------------------------------------------------------
// Releasing a hold
// ---------------------------------------------------------------------------

/** Move an offer to a closing status, releasing its hold first. Returns the updated row. */
async function closeWithRelease(
  service: SupabaseClient,
  offer: OfferRow,
  nextStatus: OfferStatus,
  extra: Record<string, unknown> = {},
): Promise<OfferRow | null> {
  let holdStatus: OfferRow['hold_status'] = offer.hold_status;
  let lastError: string | null = null;
  if (offer.authorization_id && (offer.hold_status === 'held' || offer.hold_status === 'release_failed')) {
    try {
      const released = await voidPayPalAuthorization(offer.authorization_id);
      if (released.released) {
        holdStatus = 'released';
      } else {
        holdStatus = released.captured ? 'captured' : 'release_failed';
        lastError = released.error;
      }
    } catch (error) {
      holdStatus = 'release_failed';
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  const { data, error } = await service
    .from('product_offers')
    .update({
      status: nextStatus,
      hold_status: holdStatus,
      decided_at: new Date().toISOString(),
      ...(lastError ? { last_error: lastError.slice(0, 500) } : {}),
      ...extra,
    })
    .eq('id', offer.id)
    .eq('status', offer.status)
    .select(OFFER_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeOfferRow(data as unknown as Record<string, unknown>) : null;
}

// ---------------------------------------------------------------------------
// Admin: accept, decline, counter
// ---------------------------------------------------------------------------

/**
 * Decline, with an optional message to the buyer (owner, 2026-10-15: "similar
 * to how ebay works"). The message lives in `counter_note` — the one column for
 * the owner's message on an offer, whether it was countered or declined — so a
 * retried email (the sweep) still carries it.
 */
export async function declineOffer(
  service: SupabaseClient,
  offerId: string,
  input: { note?: unknown } = {},
): Promise<OfferResult<{ offer: OfferRow }>> {
  const offer = await loadOffer(service, 'id', offerId);
  if (!offer) return fail(404, 'Offer not found.');
  if (offer.status !== 'open') return fail(409, `This offer is ${offer.status.replace('_', ' ')}, not open.`);
  const closed = await closeWithRelease(service, offer, 'declined', {
    counter_note: cleanOfferText(input.note, OWNER_NOTE_MAX),
  });
  if (!closed) return fail(409, 'The offer changed while declining. Reload the page.');
  const product = await loadOfferProduct(service, offer.product_id);
  await sendBuyerEmailForStatus(service, closed, product?.product.title ?? 'your item', product?.product.title_es ?? null);
  return { ok: true, offer: closed };
}

export async function counterOffer(
  service: SupabaseClient,
  offerId: string,
  input: { amount: unknown; note: unknown },
): Promise<OfferResult<{ offer: OfferRow; emailed: boolean; link: string }>> {
  const offer = await loadOffer(service, 'id', offerId);
  if (!offer) return fail(404, 'Offer not found.');
  if (!isOfferLive(offer)) return fail(409, 'This offer is no longer open.');
  const product = await loadOfferProduct(service, offer.product_id);
  if (!product?.purchasable) return fail(409, 'This item is no longer available.');
  const listedPrice = product.listedPrice ?? offer.listed_price;
  const amount = parseOfferAmount(input.amount);
  const problem = counterAmountProblem(amount, offer.amount, listedPrice);
  if (problem || amount == null) return fail(400, counterAmountMessage(problem ?? 'missing', offer.amount, listedPrice));

  const token = newCounterToken();
  const sentAt = new Date();
  const countered = await closeWithRelease(service, offer, 'countered', {
    counter_amount: amount,
    counter_note: cleanOfferText(input.note, OWNER_NOTE_MAX),
    counter_token_hash: hashCounterToken(token),
    counter_sent_at: sentAt.toISOString(),
    counter_expires_at: counterExpiresAt(sentAt).toISOString(),
  });
  if (!countered) return fail(409, 'The offer changed while countering. Reload the page.');
  const emailed = await sendBuyerEmailForStatus(service, countered, product.product.title, product.product.title_es ?? null, token);
  return { ok: true, offer: countered, emailed, link: counterUrl(token, countered.locale === 'es') };
}

/**
 * A fresh Buy-now link for a live counter (the first email failed, or the buyer
 * lost it). The old link stops working — only the new token's hash is kept.
 */
export async function resendCounter(
  service: SupabaseClient,
  offerId: string,
): Promise<OfferResult<{ offer: OfferRow; emailed: boolean; link: string }>> {
  const offer = await loadOffer(service, 'id', offerId);
  if (!offer) return fail(404, 'Offer not found.');
  if (!isCounterLive(offer)) return fail(409, 'This counter-offer is no longer live.');
  const product = await loadOfferProduct(service, offer.product_id);
  if (!product?.purchasable) return fail(409, 'This item is no longer available.');
  const token = newCounterToken();
  const { data, error } = await service
    .from('product_offers')
    .update({ counter_token_hash: hashCounterToken(token), notified_status: null })
    .eq('id', offer.id)
    .eq('status', 'countered')
    .select(OFFER_COLUMNS)
    .maybeSingle();
  if (error || !data) return fail(409, 'The offer changed. Reload the page.');
  const updated = normalizeOfferRow(data as unknown as Record<string, unknown>);
  const emailed = await sendBuyerEmailForStatus(service, updated, product.product.title, product.product.title_es ?? null, token);
  return { ok: true, offer: updated, emailed, link: counterUrl(token, updated.locale === 'es') };
}

export async function acceptOffer(
  service: SupabaseClient,
  offerId: string,
): Promise<OfferResult<{ offer: OfferRow; orderId: string; orderNumber: string; itemConflict?: boolean }>> {
  const offer = await loadOffer(service, 'id', offerId);
  if (!offer) return fail(404, 'Offer not found.');
  if (offer.status !== 'open') return fail(409, `This offer is ${offer.status.replace('_', ' ')}, not open.`);
  if (!isOfferLive(offer)) {
    await expireOffer(service, offer);
    return fail(409, 'This offer has expired — the hold was released.');
  }
  if (!offer.authorization_id) return fail(409, 'This offer has no PayPal hold.');

  const product = await loadOfferProduct(service, offer.product_id);
  if (!product?.purchasable) {
    const closed = await closeWithRelease(service, offer, 'item_sold');
    if (closed) await sendBuyerEmailForStatus(service, closed, product?.product.title ?? 'your item', product?.product.title_es ?? null);
    return fail(409, 'This item is no longer available — the offer was closed and the hold released.');
  }

  // 1. The order row, through the checkout's own RPC (unpaid until step 3).
  const orderNumber = generateOrderNumber();
  const { data: rpcData, error: rpcError } = await service.rpc('create_paypal_order', {
    order_payload: {
      order_number: orderNumber,
      user_id: offer.user_id,
      customer_name: offer.customer_name,
      customer_email: offer.customer_email,
      customer_phone: offer.customer_phone,
      subtotal: offer.subtotal,
      tax: offer.tax,
      shipping_fee: offer.shipping_fee,
      discount: 0,
      total: offer.total,
      payment_method: 'paypal',
      shipping_method: shippingMethodForDb(offer.shipping_method as Parameters<typeof shippingMethodForDb>[0]),
      shipping_address: offer.shipping_address,
      billing_address: null,
      internal_notes: `From an accepted offer (${offer.id}).`,
      customer_notes: offer.message,
    },
    items_payload: offer.order_snapshot,
  });
  const created = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  const orderId = created?.order_id as string | undefined;
  if (rpcError || !orderId) {
    console.error('Offer accept create_paypal_order error:', rpcError);
    return fail(500, rpcError?.message ?? 'Could not create the order. Nothing was charged.');
  }
  await service.from('orders').update({ paypal_order_id: offer.paypal_order_id, offer_id: offer.id }).eq('id', orderId);

  // 2. Charge the hold.
  let capture;
  try {
    capture = await capturePayPalAuthorization(offer.authorization_id, orderNumber);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Offer capture error:', error);
    await service.from('orders').update({ order_status: 'cancelled', internal_notes: `Offer charge refused by PayPal: ${message}`.slice(0, 500) }).eq('id', orderId);
    // Release whatever is left of the hold. No buyer email: the owner calls
    // them (their phone is on the offer) — "not accepted" would be untrue.
    await closeWithRelease(service, offer, 'failed', { last_error: message.slice(0, 500), notified_status: 'failed' });
    return fail(402, `PayPal refused the charge — the item is still available. (${message})`, 'capture_failed');
  }
  if (capture.status !== 'COMPLETED' || !capture.captureId) {
    await service.from('product_offers').update({ last_error: `Capture status ${capture.status}` }).eq('id', offer.id);
    return fail(402, `PayPal reports the charge as ${capture.status}. Check PayPal before doing anything else.`, 'capture_pending');
  }

  // 3. Record the money, then mark paid + sold (same RPC as checkout).
  await service.from('orders').update({
    payment_status: 'pending',
    payment_reference: capture.captureId,
    paypal_capture_id: capture.captureId,
    payment_response: capture.raw as object,
  }).eq('id', orderId);
  const { data: capData, error: capError } = await service.rpc('capture_paypal_order', {
    p_order_id: orderId,
    p_capture_id: capture.captureId,
    p_payment_response: capture.raw as object,
  });
  await service.from('product_offers').update({
    status: 'accepted',
    hold_status: 'captured',
    order_id: orderId,
    decided_at: new Date().toISOString(),
    notified_status: 'accepted',
  }).eq('id', offer.id);
  const accepted = (await loadOffer(service, 'id', offer.id)) ?? offer;

  if (capError) {
    console.error('Offer accept capture_paypal_order error:', capError);
    return { ok: true, offer: accepted, orderId, orderNumber };
  }
  const capResult = Array.isArray(capData) ? capData[0] : capData;
  if (capResult?.item_conflict) {
    const { notifyItemConflict } = await import('@/lib/order-finalize');
    await notifyItemConflict(service, { id: orderId, orderNumber, captureId: capture.captureId });
    return { ok: true, offer: accepted, orderId, orderNumber, itemConflict: true };
  }

  revalidateTag('shop-catalog', { expire: 0 });
  revalidatePath(`/shop/${offer.product_id}`);
  revalidatePath(`/es/shop/${offer.product_id}`);
  const { scheduleProductStatusHooks } = await import('@/lib/product-status-hooks');
  scheduleProductStatusHooks([offer.product_id]);
  const { finalizePaidOrder } = await import('@/lib/order-finalize');
  await finalizePaidOrder(service, orderId);
  return { ok: true, offer: accepted, orderId, orderNumber };
}

async function expireOffer(service: SupabaseClient, offer: OfferRow): Promise<void> {
  const closed = await closeWithRelease(service, offer, 'expired');
  if (!closed) return;
  const product = await loadOfferProduct(service, offer.product_id).catch(() => null);
  await sendBuyerEmailForStatus(service, closed, product?.product.title ?? 'your item', product?.product.title_es ?? null);
}

// ---------------------------------------------------------------------------
// Counter checkout (the buyer's private Buy-now link)
// ---------------------------------------------------------------------------

export type LiveCounter = {
  offer: OfferRow;
  product: OfferProduct;
};

export type CounterLookup =
  | { state: 'live'; counter: LiveCounter }
  | { state: 'expired' | 'sold' | 'used' | 'missing' };

export async function findCounterByToken(service: SupabaseClient, token: string): Promise<CounterLookup> {
  if (!token || token.length < 16 || token.length > 128) return { state: 'missing' };
  const { data, error } = await service
    .from('product_offers')
    .select(OFFER_COLUMNS)
    .eq('counter_token_hash', hashCounterToken(token))
    .maybeSingle();
  if (error) {
    if (isMissingOffersSchemaError(error)) return { state: 'missing' };
    throw error;
  }
  if (!data) return { state: 'missing' };
  const offer = normalizeOfferRow(data as unknown as Record<string, unknown>);
  if (offer.status === 'counter_bought') return { state: 'used' };
  if (offer.status === 'item_sold') return { state: 'sold' };
  if (!isCounterLive(offer)) return { state: 'expired' };
  const product = await loadOfferProduct(service, offer.product_id);
  if (!product?.purchasable) return { state: 'sold' };
  return { state: 'live', counter: { offer, product } };
}

// ---------------------------------------------------------------------------
// After ANY paid order (finalizePaidOrder): settle offers
// ---------------------------------------------------------------------------

/**
 * Called for every paid order from finalizePaidOrder (client capture AND the
 * webhook backstop). Idempotent and best-effort; the sweep reconciles a miss.
 *  1. An order that came from an offer (orders.offer_id) marks that offer
 *     accepted / bought at counter.
 *  2. Every other open offer or live counter on a product that is no longer
 *     for sale is closed as "item sold" and its hold released.
 */
export async function settleOffersAfterPaidOrder(service: SupabaseClient, orderId: string): Promise<void> {
  const { data: order, error } = await service.from('orders').select('id, offer_id').eq('id', orderId).maybeSingle();
  if (error || !order) return; // offer_id missing before the SQL runs — nothing to settle
  const offerId = (order as { offer_id?: string | null }).offer_id ?? null;
  if (offerId) {
    const offer = await loadOffer(service, 'id', offerId).catch(() => null);
    if (offer && offer.status !== 'accepted' && offer.status !== 'counter_bought') {
      const fromCounter = offer.status === 'countered' || offer.status === 'counter_expired';
      await service.from('product_offers').update({
        status: fromCounter ? 'counter_bought' : 'accepted',
        order_id: orderId,
        decided_at: new Date().toISOString(),
        notified_status: fromCounter ? 'counter_bought' : 'accepted',
        ...(fromCounter ? {} : { hold_status: 'captured' }),
      }).eq('id', offer.id);
    }
  }

  const { data: items } = await service.from('order_items').select('product_id').eq('order_id', orderId);
  const productIds = Array.from(new Set((items ?? []).map((item) => item.product_id).filter((id): id is string => Boolean(id))));
  if (productIds.length > 0) await closeOffersOnUnavailableProducts(service, productIds, offerId);
}

async function closeOffersOnUnavailableProducts(service: SupabaseClient, productIds: string[], exceptOfferId: string | null): Promise<number> {
  const { data, error } = await service
    .from('product_offers')
    .select(OFFER_COLUMNS)
    .in('product_id', productIds)
    .in('status', ['open', 'countered']);
  if (error || !data?.length) return 0;
  // ⛔ A failed product read must close NOTHING. An empty map here would read
  // as "every item is gone" and release every buyer's hold.
  let products: Map<string, OfferProduct>;
  try {
    products = await loadOfferProducts(service, productIds);
  } catch (loadError) {
    console.error('Offer close: product read failed — nothing closed.', loadError);
    return 0;
  }
  let closed = 0;
  for (const row of data) {
    const offer = normalizeOfferRow(row as unknown as Record<string, unknown>);
    if (offer.id === exceptOfferId) continue;
    const product = products.get(offer.product_id);
    if (product?.purchasable) continue;
    const wasOpen = offer.status === 'open';
    const done = await closeWithRelease(service, offer, 'item_sold', wasOpen ? {} : { notified_status: 'item_sold' });
    if (done && wasOpen) {
      await sendBuyerEmailForStatus(service, done, product?.product.title ?? 'your item', product?.product.title_es ?? null);
    }
    if (done) closed += 1;
  }
  return closed;
}

// ---------------------------------------------------------------------------
// The 15-minute sweep (pg_cron nej-offers-sweep)
// ---------------------------------------------------------------------------

export type OfferSweepSummary = {
  expired: number;
  itemSold: number;
  countersExpired: number;
  abandoned: number;
  holdsRetried: number;
  emailsRetried: number;
  ownerAlertsRetried: number;
};

export async function sweepOffers(service: SupabaseClient, now: Date = new Date()): Promise<OfferSweepSummary> {
  const summary: OfferSweepSummary = {
    expired: 0, itemSold: 0, countersExpired: 0, abandoned: 0, holdsRetried: 0, emailsRetried: 0, ownerAlertsRetried: 0,
  };
  const nowIso = now.toISOString();

  // 1. Offers past their 72 hours.
  const { data: due, error: dueError } = await service
    .from('product_offers').select(OFFER_COLUMNS).eq('status', 'open').lte('expires_at', nowIso).limit(50);
  if (dueError) {
    if (isMissingOffersSchemaError(dueError)) return summary;
    throw dueError;
  }
  for (const row of due ?? []) {
    await expireOffer(service, normalizeOfferRow(row as unknown as Record<string, unknown>));
    summary.expired += 1;
  }

  // 2. Open offers / live counters on items that sold another way.
  const { data: live } = await service.from('product_offers').select('product_id').in('status', ['open', 'countered']).limit(500);
  const liveProductIds = Array.from(new Set((live ?? []).map((row) => String(row.product_id))));
  if (liveProductIds.length > 0) summary.itemSold = await closeOffersOnUnavailableProducts(service, liveProductIds, null);

  // 3. Counters whose link ran out (no hold to release; no email).
  const { data: countersDue } = await service
    .from('product_offers').select('id').eq('status', 'countered').lte('counter_expires_at', nowIso).limit(100);
  for (const row of countersDue ?? []) {
    const { data } = await service.from('product_offers')
      .update({ status: 'counter_expired', notified_status: 'counter_expired' })
      .eq('id', row.id).eq('status', 'countered').select('id');
    if (data?.length) summary.countersExpired += 1;
  }

  // 4. PayPal windows never approved.
  const abandonBefore = new Date(now.getTime() - OFFER_ABANDON_AFTER_MINUTES * 60_000).toISOString();
  const { data: stale } = await service.from('product_offers')
    .update({ status: 'abandoned' }).eq('status', 'pending').lte('created_at', abandonBefore).select('id');
  summary.abandoned = stale?.length ?? 0;

  // 5. Holds PayPal refused to release earlier.
  const { data: stuck } = await service.from('product_offers').select(OFFER_COLUMNS)
    .eq('hold_status', 'release_failed').not('status', 'in', '(open,accepted)').limit(50);
  for (const row of stuck ?? []) {
    const offer = normalizeOfferRow(row as unknown as Record<string, unknown>);
    if (!offer.authorization_id) continue;
    const released = await voidPayPalAuthorization(offer.authorization_id).catch(() => null);
    if (released?.released || (released && !released.released && released.captured)) {
      await service.from('product_offers').update({ hold_status: released.released ? 'released' : 'captured' }).eq('id', offer.id);
      summary.holdsRetried += 1;
    }
  }

  // 6. Buyer emails and owner alerts that did not go out.
  const { data: unsent } = await service.from('product_offers').select(OFFER_COLUMNS)
    .in('status', ['open', 'declined', 'expired', 'item_sold']).gte('updated_at', new Date(now.getTime() - 7 * 86_400_000).toISOString()).limit(200);
  const needEmail = (unsent ?? [])
    .map((row) => normalizeOfferRow(row as unknown as Record<string, unknown>))
    .filter((offer) => offer.notified_status !== offer.status);
  const needOwner = (unsent ?? [])
    .map((row) => normalizeOfferRow(row as unknown as Record<string, unknown>))
    .filter((offer) => offer.status === 'open' && !offer.owner_notified_at);
  if (needEmail.length || needOwner.length) {
    const products = await loadOfferProducts(service, [...needEmail, ...needOwner].map((offer) => offer.product_id)).catch(() => new Map<string, OfferProduct>());
    for (const offer of needEmail) {
      const product = products.get(offer.product_id);
      if (await sendBuyerEmailForStatus(service, offer, product?.product.title ?? 'your item', product?.product.title_es ?? null)) summary.emailsRetried += 1;
    }
    for (const offer of needOwner) {
      const product = products.get(offer.product_id);
      if (!product) continue;
      await notifyOwnerOfOffer(service, offer, product);
      summary.ownerAlertsRetried += 1;
    }
  }
  return summary;
}

// ---------------------------------------------------------------------------
// Admin reads
// ---------------------------------------------------------------------------

export type AdminOfferView = OfferRow & {
  product_title: string;
  product_inventory_number: string | null;
  product_image: string | null;
  product_listed_price: number | null;
  product_available: boolean;
  order_number: string | null;
  /** The card's "Item details" dropdown (2026-10-18); null when the product is gone. */
  product_details: OfferItemDetails | null;
};

// Only for the "Item details" dropdown: what the checkout columns leave out.
// cost_basis is private — this read is admin-only (requireAdmin + service role).
const OFFER_DETAIL_COLUMNS = 'id, description, length, width_mm, jewelry_type, product_type, chain_type, tags, tags_es, title_es, cost_basis';

type OfferDetailRow = Pick<Product, 'id' | 'description' | 'length' | 'width_mm' | 'jewelry_type' | 'product_type' | 'chain_type' | 'tags' | 'tags_es' | 'title_es' | 'cost_basis'>;

function offerItemDetails(product: Product, extra: OfferDetailRow | undefined, spotData: SpotData): OfferItemDetails {
  const merged = { ...product, ...(extra ?? {}) } as Product;
  // Nulls, never a fallback number: with the spot feed down there is no melt.
  const melt = spotData.source === 'api' ? calcSpotMeltValue(merged, spotData) : null;
  const spotPerOz = melt == null ? null : merged.category === 'Silver' ? spotData.silverPerTroyOz : spotData.goldPerTroyOz;
  const typeLabel = merged.jewelry_type || merged.product_type ? productJewelryTypeLabel(inferProductJewelryType(merged)) : null;
  const link = normalizeProductLinkType(merged.chain_type) ?? (merged.chain_type?.trim() || null);
  const type = typeLabel && typeLabel !== 'Other' ? (link ? `${typeLabel} · ${link}` : typeLabel) : link;
  const cost = Number(merged.cost_basis);
  const multiplier = Number(merged.pricing_multiplier);
  return {
    category: merged.category,
    purity: merged.purity ?? null,
    grams: merged.gram_weight ?? merged.weight_grams ?? null,
    length: extra ? productLengthSizeDisplay(merged) : null,
    width: extra ? productWidthDisplay(merged) : null,
    type,
    year: merged.item_year ?? null,
    description: extra?.description?.trim() || null,
    melt: melt == null ? null : round2(melt),
    spotPerOz: spotPerOz ?? null,
    cost: Number.isFinite(cost) && cost > 0 ? cost : null,
    multiplier: merged.price_mode === 'spot-multiplier' && Number.isFinite(multiplier) && multiplier > 0 ? multiplier : null,
    productPath: `/shop/${encodeURIComponent(merged.id)}`,
  };
}

export async function listOffersForAdmin(service: SupabaseClient, filter: OfferFilter): Promise<AdminOfferView[]> {
  const { data, error } = await service
    .from('product_offers')
    .select(OFFER_COLUMNS)
    .in('status', statusesForFilter(filter))
    // Open: soonest deadline first. Everything else: most recent first.
    .order(filter === 'open' ? 'expires_at' : 'updated_at', { ascending: filter === 'open' })
    .limit(200);
  if (error) throw error;
  const offers = (data ?? []).map((row) => normalizeOfferRow(row as unknown as Record<string, unknown>));
  const productIds = Array.from(new Set(offers.map((offer) => offer.product_id)));
  const [products, detailRead, spotData] = await Promise.all([
    loadOfferProducts(service, productIds),
    productIds.length > 0
      ? service.from('products').select(OFFER_DETAIL_COLUMNS).in('id', productIds)
      : Promise.resolve({ data: [], error: null }),
    fetchSpotData(),
  ]);
  // The dropdown is extra: if its read fails, the cards still load (specs only).
  if (detailRead.error) console.error('Offer item details read error:', detailRead.error.message);
  const details = new Map<string, OfferDetailRow>();
  for (const row of (detailRead.error ? [] : detailRead.data ?? []) as unknown as OfferDetailRow[]) details.set(row.id, row);
  const orderIds = offers.map((offer) => offer.order_id).filter((id): id is string => Boolean(id));
  const orderNumbers = new Map<string, string>();
  if (orderIds.length > 0) {
    const { data: orders } = await service.from('orders').select('id, order_number').in('id', orderIds);
    for (const order of orders ?? []) orderNumbers.set(String(order.id), String(order.order_number));
  }
  return offers.map((offer) => {
    const product = products.get(offer.product_id);
    const images = product ? [...(product.product.image_urls ?? []), ...(product.product.images ?? [])] : [];
    return {
      ...offer,
      product_title: product?.product.title ?? offer.order_snapshot?.[0]?.title_snapshot ?? 'Item',
      product_inventory_number: product?.product.inventory_number != null ? String(product.product.inventory_number) : null,
      product_image: images[0] ?? offer.order_snapshot?.[0]?.image_snapshot ?? null,
      product_listed_price: product?.listedPrice ?? null,
      product_available: product?.purchasable ?? false,
      order_number: offer.order_id ? orderNumbers.get(offer.order_id) ?? null : null,
      product_details: product ? offerItemDetails(product.product, details.get(offer.product_id), spotData) : null,
    };
  });
}

/**
 * Delete old offers by hand (owner mockup v4, 2026-10-15) — one, or every
 * finished offer on a tab. The server re-checks each row with
 * `offerDeleteBlock` (the page's buttons are convenience, not enforcement):
 * open offers, live counters and holds not yet released are skipped and named.
 * An accepted offer's paid order stays (orders.offer_id → null by the FK).
 */
export async function deleteOffers(
  service: SupabaseClient,
  offerIds: string[],
): Promise<OfferResult<{ deleted: number; skipped: { id: string; reason: string }[] }>> {
  const ids = Array.from(new Set(offerIds.filter((id) => typeof id === 'string' && id.trim() !== '')));
  if (ids.length === 0) return fail(400, 'Choose at least one offer.');
  if (ids.length > OFFER_DELETE_MAX) return fail(400, `Delete at most ${OFFER_DELETE_MAX} offers at a time.`);
  const { data, error } = await service
    .from('product_offers')
    .select('id, status, hold_status, counter_expires_at')
    .in('id', ids);
  if (error) throw error;
  const now = new Date();
  const skipped: { id: string; reason: string }[] = [];
  const deletable: string[] = [];
  for (const row of data ?? []) {
    const reason = offerDeleteBlock(row as { status: string; hold_status: string | null; counter_expires_at: string | null }, now);
    if (reason) skipped.push({ id: String(row.id), reason });
    else deletable.push(String(row.id));
  }
  if (deletable.length === 0) return { ok: true, deleted: 0, skipped };
  const { data: removed, error: deleteError } = await service
    .from('product_offers')
    .delete()
    .in('id', deletable)
    // Re-checked in the same statement: a row that turned open in between stays.
    .not('status', 'in', '(open,pending)')
    .select('id');
  if (deleteError) throw deleteError;
  return { ok: true, deleted: removed?.length ?? 0, skipped };
}

/** Open offers per product (the product table's "2 open") and in total (the menu). */
export async function countOpenOffers(service: SupabaseClient): Promise<{ total: number; byProduct: Record<string, number> }> {
  const { data, error } = await service.from('product_offers').select('product_id').eq('status', 'open').limit(1000);
  if (error) throw error;
  const byProduct: Record<string, number> = {};
  for (const row of data ?? []) {
    const id = String(row.product_id);
    byProduct[id] = (byProduct[id] ?? 0) + 1;
  }
  return { total: data?.length ?? 0, byProduct };
}
