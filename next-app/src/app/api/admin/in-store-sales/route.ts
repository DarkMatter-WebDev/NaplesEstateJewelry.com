import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { buildAddressObject, generateOrderNumber } from '@/lib/sales';
import { buildSaleItemPayloads, createOrderErrorStatus, recordOfflinePayment } from '@/lib/instant-sale-server';
import {
  IN_STORE_PAYMENT_LABELS,
  IN_STORE_SHIPPING_LABELS,
  inStorePaymentMethodValue,
  normalizeInStoreSaleInput,
} from '@/lib/in-store-sale';
import { formatCurrency } from '@/types/sales';
import { loadPaperReceipt } from '@/lib/order-receipt-paper-server';

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
 * Steps 2–3 and the receipt live in `lib/instant-sale-server.ts`, shared with
 * the Remote sale's "Record payment".
 * A SHIPPED sale (owner, 2026-10-20) is stored like a shipped web order:
 * shipping_method 'shipping', the address, the fee, and fulfillment left
 * `pending` so it waits under Orders until Mark Shipped + tracking.
 * Several items + a photo each + "Email copy" (owner, 2026-10-21). No new SQL.
 * `print: true` ("Record & print receipt", 2026-10-21) also returns the
 * one-page paper (`lib/order-receipt-paper.ts`) for the form to print.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;

  const body = await req.json().catch(() => null);
  const input = normalizeInStoreSaleInput(body);
  if ('error' in input) return NextResponse.json({ error: input.error }, { status: 400 });
  const sale = input.value;

  const service = createServiceClient();
  const paidByLabel = IN_STORE_PAYMENT_LABELS[sale.paidBy];

  const lines = await buildSaleItemPayloads(service, sale.items);
  if ('error' in lines) return NextResponse.json({ error: lines.error }, { status: lines.status });

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
    items_payload: lines.payloads,
  });
  if (createError) {
    console.error('in-store sale create_paypal_order error:', createError);
    return NextResponse.json({ error: createError.message ?? 'Could not create the order.' }, { status: createOrderErrorStatus(createError.message) });
  }
  const createdRow = Array.isArray(created) ? created[0] : created;
  const orderId = createdRow?.order_id as string | undefined;
  if (!orderId) return NextResponse.json({ error: 'Could not create the order.' }, { status: 500 });

  const paid = await recordOfflinePayment(service, {
    orderId,
    orderNumber,
    listedIds: lines.listedIds,
    paidBy: sale.paidBy,
    paymentMethodValue: inStorePaymentMethodValue(sale.paidBy),
    reference: `In store · ${paidByLabel}`,
    captureIdPrefix: 'in-store',
    // A shipped sale stays `pending` (as created) until Mark Shipped.
    pickedUp: !shipped,
    note: sale.note,
    recordedBy: admin.user.email ?? null,
    sendCustomerReceipt: sale.emailCopy,
  });
  if (!paid.ok) return NextResponse.json({ error: paid.error, orderId }, { status: paid.status });

  const wantsPaper = Boolean((body as Record<string, unknown> | null)?.print);
  return NextResponse.json({
    orderId,
    orderNumber,
    receiptEmailed: paid.receiptEmailed,
    shipped,
    paper: wantsPaper ? await loadPaperReceipt(service, orderId) : null,
  });
}
