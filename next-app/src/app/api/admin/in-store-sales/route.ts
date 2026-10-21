import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { finalizePaidOrder } from '@/lib/order-finalize';
import { scheduleProductStatusHooks } from '@/lib/product-status-hooks';
import { buildAddressObject, generateOrderNumber, getProductImages, getProductMetal, getProductWeight } from '@/lib/sales';
import {
  IN_STORE_PAYMENT_LABELS,
  IN_STORE_SHIPPING_LABELS,
  inStorePaymentMethodValue,
  normalizeInStoreSaleInput,
} from '@/lib/in-store-sale';
import { formatCurrency } from '@/types/sales';
import { isProductPurchasable, type Product } from '@/types/product';

/**
 * POST: record a sale made in the showroom (the card was taken on Zettle).
 *
 * Reuses the two RPCs a web sale uses, in the same order, so a listed item is
 * sold exactly the way checkout sells it (row lock, quantity, sold_price,
 * marketplace + Deep Field hooks, invoice + receipt):
 *   1. `create_paypal_order` — the order + line rows (payment_method set here
 *      to `in_store_<method>`);
 *   2. `capture_paypal_order` — marks it paid and flips the product to sold.
 *      It stamps `payment_method = 'paypal'` and a capture id because that is
 *      its only caller until now, so step 3 restores the in-store values.
 *   3. one update: payment_method back to in-store, no PayPal capture id, the
 *      reference "In store · …", and for a PICKUP fulfillment picked_up (the
 *      buyer left with it).
 * A SHIPPED sale (owner, 2026-10-20) is stored like a shipped web order:
 * shipping_method 'shipping', the address, the fee, and fulfillment left
 * `pending` so it waits under Orders until Mark Shipped + tracking.
 * No new SQL: nothing for the owner to run.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

const PRODUCT_COLUMNS =
  'id, title, status, quantity, inventory_number, sku, item_year, category, metal_variant, purity, gram_weight, weight_grams, image_urls, images';

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;

  const body = await req.json().catch(() => null);
  const input = normalizeInStoreSaleInput(body);
  if ('error' in input) return NextResponse.json({ error: input.error }, { status: 400 });
  const sale = input.value;

  const service = createServiceClient();
  const paidByLabel = IN_STORE_PAYMENT_LABELS[sale.paidBy];

  let itemPayload: Record<string, unknown>;
  let listedProductId: string | null = null;
  if (sale.item.kind === 'listed') {
    const { data: product, error } = await service.from('products').select(PRODUCT_COLUMNS).eq('id', sale.item.productId).maybeSingle();
    if (error || !product) return NextResponse.json({ error: 'That item was not found.' }, { status: 404 });
    const p = product as unknown as Product;
    if (!isProductPurchasable(p.status, p.quantity)) {
      return NextResponse.json({ error: `"${p.title}" is not available to sell (${p.status}).` }, { status: 409 });
    }
    listedProductId = p.id;
    itemPayload = {
      product_id: p.id,
      inventory_number: p.inventory_number != null ? String(p.inventory_number) : p.sku ?? p.id,
      title_snapshot: p.title,
      item_year_snapshot: p.item_year ?? null,
      metal_snapshot: getProductMetal(p),
      purity_snapshot: p.purity ? String(p.purity) : null,
      gram_weight_snapshot: getProductWeight(p),
      price_snapshot: sale.item.price,
      quantity: 1,
      image_snapshot: getProductImages(p)[0] ?? null,
    };
  } else {
    itemPayload = {
      product_id: null,
      inventory_number: null,
      title_snapshot: sale.item.title,
      item_year_snapshot: null,
      metal_snapshot: sale.item.metal === 'Other' ? null : sale.item.metal,
      purity_snapshot: sale.item.purity,
      gram_weight_snapshot: sale.item.gramWeight,
      price_snapshot: sale.item.price,
      quantity: 1,
      image_snapshot: null,
    };
  }

  const orderNumber = generateOrderNumber();
  const { delivery } = sale;
  const shipped = delivery.method === 'ship';
  // The order page names a postage service from the fee; "No charge" and a
  // typed amount match no tier, so the note says what was chosen.
  const deliveryNote = delivery.method === 'ship'
    ? `Ship · ${IN_STORE_SHIPPING_LABELS[delivery.shipping]} ${formatCurrency(delivery.shippingFee)}`
    : null;
  const internalNotes = [`In-store sale · ${paidByLabel} · recorded by ${admin.user.email ?? 'admin'}`, deliveryNote, sale.note]
    .filter(Boolean)
    .join(' | ');
  const shippingAddress = delivery.address
    ? buildAddressObject({
      line1: delivery.address.line1,
      line2: delivery.address.line2 ?? undefined,
      city: delivery.address.city,
      state: delivery.address.state,
      postalCode: delivery.address.postalCode,
      country: 'United States',
    })
    : null;
  const orderPayload = {
    order_number: orderNumber,
    user_id: null,
    customer_name: sale.customer.name,
    customer_email: sale.customer.email,
    customer_phone: sale.customer.phone,
    subtotal: sale.subtotal,
    tax: sale.tax,
    shipping_fee: sale.shippingFee,
    discount: 0,
    total: sale.total,
    payment_method: inStorePaymentMethodValue(sale.paidBy),
    // The same narrowed values web checkout stores (`shippingMethodForDb`).
    shipping_method: shipped ? 'shipping' : 'pickup',
    shipping_address: shippingAddress,
    billing_address: null,
    internal_notes: internalNotes,
    customer_notes: null,
  };

  const { data: created, error: createError } = await service.rpc('create_paypal_order', {
    order_payload: orderPayload,
    items_payload: [itemPayload],
  });
  if (createError) {
    console.error('in-store sale create_paypal_order error:', createError);
    const status = /no longer available|not available/i.test(createError.message ?? '') ? 409 : 500;
    return NextResponse.json({ error: createError.message ?? 'Could not create the order.' }, { status });
  }
  const createdRow = Array.isArray(created) ? created[0] : created;
  const orderId = createdRow?.order_id as string | undefined;
  if (!orderId) return NextResponse.json({ error: 'Could not create the order.' }, { status: 500 });

  const { data: captured, error: captureError } = await service.rpc('capture_paypal_order', {
    p_order_id: orderId,
    p_capture_id: `in-store:${orderNumber}`,
    p_payment_response: { source: 'in_store', paid_by: sale.paidBy, note: sale.note, recorded_by: admin.user.email ?? null },
  });
  if (captureError) {
    console.error('in-store sale capture_paypal_order error:', captureError);
    return NextResponse.json({ error: `The order ${orderNumber} was created but could not be marked paid: ${captureError.message}` }, { status: 500 });
  }
  const capturedRow = Array.isArray(captured) ? captured[0] : captured;
  if (capturedRow?.item_conflict) {
    // The RPC flagged the order `failed` — a web buyer paid for the item first.
    return NextResponse.json(
      { error: 'That item was just sold online. Nothing was recorded — check Orders before selling it in store.', orderId },
      { status: 409 },
    );
  }

  const { error: stampError } = await service
    .from('orders')
    .update({
      payment_method: inStorePaymentMethodValue(sale.paidBy),
      paypal_capture_id: null,
      payment_reference: `In store · ${paidByLabel}`,
      // A shipped sale stays `pending` (as created) until Mark Shipped.
      ...(shipped ? {} : { fulfillment_status: 'picked_up' }),
    })
    .eq('id', orderId);
  if (stampError) console.error('in-store sale stamp error:', stampError);

  revalidateTag('shop-catalog', { expire: 0 });
  if (listedProductId) {
    revalidatePath(`/shop/${listedProductId}`);
    revalidatePath(`/es/shop/${listedProductId}`);
    // Ends the eBay/Etsy listings and mirrors the sold flip to Deep Field —
    // the same hook a web sale schedules.
    scheduleProductStatusHooks([listedProductId]);
  }

  // Invoice row + the customer's receipt (when an email was given) + the
  // owner's new-order email. Best-effort, exactly as after a web capture.
  await finalizePaidOrder(service, orderId);

  // Report what actually happened to the receipt, not finalizePaidOrder's
  // overall flag: that flag also covers the invoice upsert, and on 2026-09-16
  // the very first live test showed "Not emailed" while the receipt HAD been
  // sent — the invoice write had failed on a missing service_role grant.
  const { data: receiptRows } = sale.customer.email
    ? await service.from('order_emails').select('id').eq('order_id', orderId).eq('email_type', 'receipt').limit(1)
    : { data: [] as { id: string }[] };

  return NextResponse.json({
    orderId,
    orderNumber,
    receiptEmailed: Boolean(receiptRows?.length),
    shipped,
  });
}
