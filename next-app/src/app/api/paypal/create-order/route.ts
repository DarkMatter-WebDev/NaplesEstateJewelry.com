import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { buildAddressObject, generateOrderNumber } from '@/lib/sales';
import {
  buildOrderDraft,
  isOrderDraftError,
  normalizeOrderLines,
  quotedTotalHasDrifted,
  toOrderQuote,
  type OrderDraft,
  type OrderDraftOptions,
  type OrderLine,
} from '@/lib/checkout-pricing';
import { normalizeDiscountCode } from '@/lib/discount-codes';
import { makeDiscountResolver } from '@/lib/discount-codes-server';
import { isCheckoutShippingMethod, shippingMethodForDb } from '@/lib/checkout-shipping';
import {
  createPayPalOrder,
  paypalConfigured,
  type PayPalLineItem,
  type PayPalShippingAddress,
} from '@/lib/paypal';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { upsertOrderInvoice } from '@/lib/order-invoices';
import {
  type NormalizedUsShippingAddress,
  validateUsShippingAddress,
} from '@/lib/us-address';
import { normalizePhoneNumber } from '@/lib/phone';
import { normalizePersonName } from '@/lib/person-name';
import { findCounterByToken } from '@/lib/offers-server';
import {
  applyOrderExemption,
  checkoutExemptionSnapshot,
  parseCheckoutExemptionInput,
  resolveCheckoutExemption,
} from '@/lib/tax-exempt-server';

export const runtime = 'nodejs';

const CURRENCY = 'USD';
const MAX_CART_ITEMS = 50;

function lineItems(items: { title_snapshot: string; price_snapshot: number; quantity: number; inventory_number: string }[]): PayPalLineItem[] {
  return items.map((item) => ({
    name: item.title_snapshot,
    quantity: String(Math.max(1, Math.floor(item.quantity))),
    unitAmount: item.price_snapshot,
    sku: item.inventory_number,
  }));
}

function buildPayPalShippingAddress(
  // The already-validated name, not the raw body field: this is what gets
  // printed on the shipping label.
  fullName: string,
  address: NormalizedUsShippingAddress,
): PayPalShippingAddress {
  return {
    fullName,
    addressLine1: address.line1,
    addressLine2: address.line2,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    countryCode: address.countryCode,
  };
}

export async function POST(req: Request) {
  if (!paypalConfigured()) {
    return NextResponse.json({ error: 'PayPal is not configured.' }, { status: 503 });
  }

  const ip = getClientIp(req);
  if (!(await checkRateLimit(`create-order:${ip}`, 30, 3600))) {
    return NextResponse.json({ error: 'Too many requests. Please try again in a bit.' }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });

  const reuseOrderId = typeof body.orderId === 'string' && body.orderId ? body.orderId : null;
  // New payload: items = [{ id, quantity }]. Legacy fallback: productIds = string[]
  // (each treated as quantity 1). normalizeOrderLines dedupes and clamps.
  const rawLines: OrderLine[] = Array.isArray(body.items)
    ? body.items.map((entry: { id?: unknown; quantity?: unknown }) => ({
        productId: String(entry?.id ?? ''),
        quantity: Number(entry?.quantity ?? 1),
      }))
    : Array.isArray(body.productIds)
      ? body.productIds.map((id: unknown) => ({ productId: String(id ?? ''), quantity: 1 }))
      : [];
  const orderLines = normalizeOrderLines(rawLines);
  if (orderLines.length > MAX_CART_ITEMS) {
    return NextResponse.json(
      { error: `A checkout can contain at most ${MAX_CART_ITEMS} unique products.` },
      { status: 400 },
    );
  }
  const customer = body.customer ?? {};
  // Only the CODE crosses the wire — never an amount. The resolver below
  // re-reads the code and recomputes the discount from the server's own
  // subtotal, so a forged `discount` field in the body has no effect.
  const discountCode = normalizeDiscountCode(
    typeof body.discountCode === 'string' ? body.discountCode : null,
  );
  // The total the buyer's screen is CURRENTLY showing. Used only to decide
  // whether to stop and ask them to re-confirm — never to price anything. See
  // quotedTotalHasDrifted() for why accepting this unsigned is safe.
  const quotedTotal = body.quotedTotal;

  /**
   * Refuse to charge an amount the buyer was not shown.
   *
   * MUST be called before any side effect — no order row, no PayPal order, no
   * money. Both creation paths below run it: the reuse branch previously
   * returned early and would otherwise have skipped it entirely.
   */
  const priceDriftResponse = (draft: OrderDraft) => {
    if (!quotedTotalHasDrifted(quotedTotal, draft.total)) return null;
    return NextResponse.json(
      {
        error: 'The price changed while this order was open.',
        code: 'price_changed',
        quotedTotal: Number(quotedTotal),
        quote: toOrderQuote(draft),
      },
      { status: 409 },
    );
  };
  const shippingMethod = String(body.shippingMethod ?? 'local-pickup');
  if (!isCheckoutShippingMethod(shippingMethod)) {
    return NextResponse.json({ error: 'Invalid shipping method.' }, { status: 400 });
  }
  const needsShipping = shippingMethod !== 'local-pickup';

  if (!customer.name || !customer.email || !customer.phone) {
    return NextResponse.json({ error: 'Name, email, and phone are required' }, { status: 400 });
  }

  // Presence was never enough: a real order landed with `customer_name` = "Sara"
  // and `customer_phone` = "Catlett", leaving no way to reach the buyer. Checkout
  // now collects the name as two fields and validates the phone, but THESE are
  // the checks that hold — the route is reachable directly, so the form is
  // convenience, not enforcement. See `lib/person-name.ts` and `lib/phone.ts`.
  const normalizedName = normalizePersonName(customer.name);
  if (!normalizedName) {
    return NextResponse.json(
      { error: 'Enter both a first and last name for this order.' },
      { status: 400 },
    );
  }

  const normalizedPhone = normalizePhoneNumber(customer.phone);
  if (!normalizedPhone) {
    return NextResponse.json(
      { error: 'Enter a valid phone number so we can reach you about your order.' },
      { status: 400 },
    );
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
  if (addressValidation?.error) {
    return NextResponse.json({ error: addressValidation.error }, { status: 400 });
  }
  const normalizedShippingAddress = addressValidation?.address ?? null;

  const orderShippingAddress = buildAddressObject({
    line1: normalizedShippingAddress?.line1 ?? customer.address_line1,
    line2: normalizedShippingAddress?.line2 ?? customer.address_line2,
    city: normalizedShippingAddress?.city ?? customer.city,
    state: normalizedShippingAddress?.state ?? customer.state,
    postalCode: normalizedShippingAddress?.postalCode ?? customer.postal_code,
    country: normalizedShippingAddress?.country ?? customer.country,
  });
  const paypalShippingAddress = normalizedShippingAddress
    ? buildPayPalShippingAddress(normalizedName, normalizedShippingAddress)
    : null;

  const supabase = await createClient();
  const service = createServiceClient();

  // Service client: discount_codes is admin-only under RLS, so the request-scoped
  // client cannot read it. Null when no code was submitted, which keeps an
  // ordinary order free of any discount lookup.
  // ---- Counter-offer checkout (lib/offers.ts): the buyer's private Buy-now
  // link. The token proves the agreed price; it covers exactly ONE unit of ONE
  // product, and no discount code stacks on an agreed price.
  const counterToken = typeof body.counterToken === 'string' && body.counterToken ? body.counterToken : null;
  let draftOptions: OrderDraftOptions = {};
  let counterOfferId: string | null = null;
  if (counterToken) {
    const lookup = await findCounterByToken(service, counterToken);
    if (lookup.state !== 'live') {
      const isEs = body.locale === 'es';
      const message = lookup.state === 'sold'
        ? (isEs ? 'Lo sentimos, esta pieza se vendió.' : 'Sorry, this piece has sold.')
        : lookup.state === 'used'
          ? (isEs ? 'Esta contraoferta ya se pagó.' : 'This counter-offer has already been paid.')
          : (isEs ? 'Esta contraoferta venció.' : 'This counter-offer has expired.');
      return NextResponse.json({ error: message, code: 'counter_unavailable' }, { status: 409 });
    }
    const { offer } = lookup.counter;
    const onlyThatItem = orderLines.length === 1
      && orderLines[0].productId === offer.product_id
      && orderLines[0].quantity === 1;
    if (!onlyThatItem || !offer.counter_amount) {
      return NextResponse.json({ error: 'This link covers one piece at the agreed price.' }, { status: 400 });
    }
    draftOptions = { unitPriceOverride: { productId: offer.product_id, unitPrice: offer.counter_amount } };
    counterOfferId = offer.id;
  }

  const discountResolver = counterOfferId ? null : makeDiscountResolver(service, discountCode, customer.email);

  // ---- Tax-exempt (lib/tax-exempt.ts). ⛔ The only way checkout drops the
  // tax: an owner-approved request held by this buyer for THIS email, or the
  // signed-in buyer's saved certificate. Re-checked here at payment, never
  // taken from the browser's say-so. A counter-offer link stays taxed as before.
  const exemptionInput = counterOfferId ? null : parseCheckoutExemptionInput(body.taxExempt);
  const exemption = exemptionInput
    ? await resolveCheckoutExemption(service, exemptionInput, {
      email: String(customer.email),
      userId: (await supabase.auth.getUser()).data.user?.id ?? null,
    })
    : null;
  if (exemption) draftOptions = { ...draftOptions, taxExempt: true };
  /** Note the exemption on the order (or clear a stale one on a reused order). */
  const noteExemption = async (orderId: string, draft: OrderDraft) => {
    if (exemption && draft.taxExempted > 0) {
      await applyOrderExemption(service, orderId, checkoutExemptionSnapshot(exemption, draft.taxExempted));
    } else {
      await service.from('orders').update({ tax_exempt: false, tax_exempt_certificate_id: null, tax_exempt_snapshot: null }).eq('id', orderId).eq('tax_exempt', true);
    }
  };

  // ---- Retry path: reuse an existing unpaid order, re-create its PayPal order.
  // Only reuse when the stored order still matches what the buyer is paying for
  // NOW — same product set and same recomputed totals. The buyer may have edited
  // the cart or switched shipping method after cancelling the PayPal window;
  // reusing the old rows then would charge the wrong amount. On any mismatch the
  // stale order is cancelled and we fall through to the new-order path below.
  if (reuseOrderId) {
    const { data: order, error } = await service
      .from('orders')
      .select('id, order_number, total, subtotal, tax, shipping_fee, discount, discount_code, payment_status, paypal_capture_id')
      .eq('id', reuseOrderId)
      .maybeSingle();

    if (error || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    if (order.payment_status === 'paid' || order.paypal_capture_id) {
      return NextResponse.json({ error: 'This order has already been paid.' }, { status: 409 });
    }

    const { data: orderItems } = await service
      .from('order_items')
      .select('product_id, title_snapshot, price_snapshot, quantity, inventory_number')
      .eq('order_id', reuseOrderId);

    // Compare the stored line set (product + quantity) against the current cart.
    const storedLineKeys = new Set(
      (orderItems ?? []).map((item) => `${String(item.product_id)}:${Math.max(1, Math.floor(Number(item.quantity ?? 1)))}`),
    );
    const currentLineKeys = orderLines.map((line) => `${line.productId}:${line.quantity}`);
    const sameProducts =
      currentLineKeys.length > 0 &&
      currentLineKeys.length === storedLineKeys.size &&
      currentLineKeys.every((key) => storedLineKeys.has(key));

    let sameTotals = false;
    // Hoisted so the price-drift guard below can see it. Scoping it inside the
    // `sameProducts` block is what let the reuse path start a payment without
    // ever consulting the buyer's quoted total.
    let reuseDraft: OrderDraft | null = null;
    if (sameProducts) {
      // Recompute totals from the live cart payload; catches shipping-method
      // switches (express vs priority both store as 'shipping') and price drift.
      const draft = await buildOrderDraft(
        supabase,
        orderLines,
        shippingMethod,
        normalizedShippingAddress?.state ?? customer.state,
        discountResolver,
        draftOptions,
      );
      if (!isOrderDraftError(draft)) reuseDraft = draft;
      // The discount is part of "same totals" — the buyer may have added,
      // changed, or removed a code since the cancelled attempt, and a code can
      // also have expired or filled its cap in the meantime. On any mismatch we
      // fall through and rebuild, rather than re-charging the stale amount.
      sameTotals =
        !isOrderDraftError(draft) &&
        draft.subtotal === Number(order.subtotal) &&
        draft.shippingFee === Number(order.shipping_fee) &&
        draft.discount === Number(order.discount ?? 0) &&
        (draft.appliedDiscount?.code ?? null) === (order.discount_code ?? null) &&
        draft.tax === Number(order.tax) &&
        draft.total === Number(order.total);
    }

    if (sameProducts && sameTotals) {
      // BEFORE re-creating the PayPal order — the first side effect on this
      // path. `reuseDraft` is non-null here, since sameTotals requires it.
      const drifted = reuseDraft ? priceDriftResponse(reuseDraft) : null;
      if (drifted) return drifted;

      const items = (orderItems ?? []).map((item) => ({
        title_snapshot: item.title_snapshot,
        price_snapshot: Number(item.price_snapshot),
        quantity: Math.max(1, Math.floor(Number(item.quantity ?? 1))),
        inventory_number: item.inventory_number ?? '',
      }));

      try {
        const paypalOrder = await createPayPalOrder({
          currency: CURRENCY,
          subtotal: Number(order.subtotal),
          tax: Number(order.tax),
          shipping: Number(order.shipping_fee),
          discount: Number(order.discount ?? 0),
          total: Number(order.total),
          items: lineItems(items),
          referenceId: order.id,
          shippingAddress: paypalShippingAddress,
        });
        // Reset status back to open/pending: the buyer may be resuming an order
        // that onCancel previously soft-cancelled, and it's live again now.
        const { data: associatedOrder, error: updateError } = await service
          .from('orders')
          .update({
            paypal_order_id: paypalOrder.id,
            order_status: 'open',
            fulfillment_status: 'pending',
            customer_name: normalizedName,
            customer_email: String(customer.email).trim(),
            customer_phone: normalizedPhone,
            shipping_address: orderShippingAddress,
            ...(counterOfferId ? { offer_id: counterOfferId } : {}),
          })
          .eq('id', order.id)
          .select('id')
          .maybeSingle();
        if (updateError || !associatedOrder) {
          throw new Error(`Could not associate the PayPal order: ${updateError?.message ?? 'order row was not updated'}`);
        }
        if (reuseDraft) await noteExemption(order.id, reuseDraft);
        return NextResponse.json({ paypalOrderId: paypalOrder.id, orderId: order.id });
      } catch (err) {
        console.error('PayPal create-order (reuse) error:', err);
        return NextResponse.json({ error: 'Could not start PayPal checkout.' }, { status: 502 });
      }
    }

    // Stale order — cancel it and create a fresh one from the current payload.
    await service.from('orders').update({ order_status: 'cancelled' }).eq('id', order.id);
  }

  // ---- New order path.
  const draft = await buildOrderDraft(
    supabase,
    orderLines,
    shippingMethod,
    normalizedShippingAddress?.state ?? customer.state,
    discountResolver,
    draftOptions,
  );
  if (isOrderDraftError(draft)) {
    // `code` lets the checkout client show precise bilingual guidance instead
    // of pattern-matching the English message (see OrderDraftErrorCode).
    return NextResponse.json({ error: draft.error, code: draft.code ?? null }, { status: draft.status });
  }
  if (draft.total <= 0) {
    return NextResponse.json({ error: 'Order total must be greater than zero.' }, { status: 400 });
  }

  // BEFORE the order row, the PayPal order, or any money. If this ever moves
  // below `create_paypal_order`, every price move leaves an abandoned order.
  const drifted = priceDriftResponse(draft);
  if (drifted) return drifted;

  const { data: { user } } = await supabase.auth.getUser();
  const orderNumber = generateOrderNumber();
  const orderPayload = {
    order_number: orderNumber,
    user_id: user?.id ?? null,
    customer_name: normalizedName,
    customer_email: String(customer.email).trim(),
    customer_phone: normalizedPhone,
    subtotal: draft.subtotal,
    tax: draft.tax,
    shipping_fee: draft.shippingFee,
    discount: draft.discount,
    // Snapshot the code and its terms so a historical order still reads
    // correctly after the code is edited, deactivated, or deleted.
    discount_code: draft.appliedDiscount?.code ?? null,
    discount_type: draft.appliedDiscount?.type ?? null,
    discount_value: draft.appliedDiscount?.value ?? null,
    total: draft.total,
    payment_method: 'paypal',
    shipping_method: shippingMethodForDb(shippingMethod),
    shipping_address: orderShippingAddress,
    billing_address: null,
    internal_notes: null,
    customer_notes: customer.notes ? String(customer.notes).trim() : null,
  };

  // Every item must carry a product_id or the capture RPC will silently update 0 rows.
  if (draft.items.some((item) => !item.product_id)) {
    return NextResponse.json({ error: 'Cart item is missing a product reference. Please refresh and try again.' }, { status: 500 });
  }

  // Create order + order_items without reserving products. Items remain 'available'
  // so concurrent buyers can proceed; the capture RPC resolves any race atomically.
  const { data: rpcData, error: rpcError } = await service.rpc('create_paypal_order', {
    order_payload: orderPayload,
    items_payload: draft.items,
  });

  if (rpcError) {
    console.error('create_paypal_order RPC error:', rpcError);
    const message = rpcError.message ?? 'Could not create order.';
    const status = /no longer available|not available/i.test(message) ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }

  const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  const orderId = result?.order_id as string | undefined;
  if (!orderId) {
    return NextResponse.json({ error: 'Could not create order.' }, { status: 500 });
  }

  try {
    const paypalOrder = await createPayPalOrder({
      currency: CURRENCY,
      subtotal: draft.subtotal,
      tax: draft.tax,
      shipping: draft.shippingFee,
      discount: draft.discount,
      total: draft.total,
      items: lineItems(draft.items),
      referenceId: orderId,
      shippingAddress: paypalShippingAddress,
    });

    const { data: associatedOrder, error: associationError } = await service
      .from('orders')
      .update({ paypal_order_id: paypalOrder.id, ...(counterOfferId ? { offer_id: counterOfferId } : {}) })
      .eq('id', orderId)
      .select('id')
      .maybeSingle();
    if (associationError || !associatedOrder) {
      throw new Error(`Could not associate the PayPal order: ${associationError?.message ?? 'order row was not updated'}`);
    }
    // Before the invoice row, so the receipt reads the exemption.
    if (exemption && draft.taxExempted > 0) {
      await applyOrderExemption(service, orderId, checkoutExemptionSnapshot(exemption, draft.taxExempted));
    }
    await upsertOrderInvoice(service, orderId);

    return NextResponse.json({ paypalOrderId: paypalOrder.id, orderId });
  } catch (err) {
    console.error('PayPal create-order error:', err);
    // Cancel the order record so it does not appear as an open, orderless entry.
    await service
      .from('orders')
      .update({ order_status: 'cancelled' })
      .eq('id', orderId);
    return NextResponse.json({ error: 'Could not start PayPal checkout.' }, { status: 502 });
  }
}
