import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { revalidatePath, revalidateTag } from 'next/cache';
import { finalizePaidOrder } from '@/lib/order-finalize';
import { scheduleProductStatusHooks } from '@/lib/product-status-hooks';
import { getProductImages, getProductMetal, getProductWeight } from '@/lib/sales';
import type { InStoreItem, InStorePaymentMethod } from '@/lib/in-store-sale';
import { isProductPurchasable, type Product } from '@/types/product';

// Instant Sale (owner, 2026-10-21): the server steps the In-store sale and the
// Remote sale share, so a sale is written exactly one way:
//   order lines  → `buildSaleItemPayloads` (listed rows read and checked here,
//                  unlisted pieces carry no product row at all);
//   offline paid → `recordOfflinePayment` = the in-store recorder's three steps
//                  (capture_paypal_order → the in-store stamp → hooks + receipt).
// A remote invoice paid ONLINE never comes here: it goes through the normal
// PayPal capture route like any web order.

const PRODUCT_COLUMNS =
  'id, title, status, quantity, inventory_number, sku, item_year, category, metal_variant, purity, gram_weight, weight_grams, image_urls, images';

export type SaleItemPayload = Record<string, unknown> & { product_id: string | null };

export async function buildSaleItemPayloads(
  service: SupabaseClient,
  items: InStoreItem[],
): Promise<{ payloads: SaleItemPayload[]; listedIds: string[] } | { error: string; status: number }> {
  const listedIds = items.flatMap((item) => (item.kind === 'listed' ? [item.productId] : []));
  const products = new Map<string, Product>();
  if (listedIds.length > 0) {
    const { data, error } = await service.from('products').select(PRODUCT_COLUMNS).in('id', listedIds);
    if (error) return { error: 'Could not read the listed items.', status: 500 };
    for (const row of (data ?? []) as unknown as Product[]) products.set(row.id, row);
  }

  const payloads: SaleItemPayload[] = [];
  for (const item of items) {
    if (item.kind === 'listed') {
      const p = products.get(item.productId);
      if (!p) return { error: 'A listed item on this sale was not found.', status: 404 };
      if (!isProductPurchasable(p.status, p.quantity)) {
        return { error: `"${p.title}" is not available to sell (${p.status}).`, status: 409 };
      }
      payloads.push({
        product_id: p.id,
        inventory_number: p.inventory_number != null ? String(p.inventory_number) : p.sku ?? p.id,
        title_snapshot: p.title,
        item_year_snapshot: p.item_year ?? null,
        metal_snapshot: getProductMetal(p),
        purity_snapshot: p.purity ? String(p.purity) : null,
        gram_weight_snapshot: getProductWeight(p),
        price_snapshot: item.price,
        quantity: 1,
        // A photo taken for this sale replaces the listing's own, on this order only.
        image_snapshot: item.photoUrl ?? getProductImages(p)[0] ?? null,
      });
    } else {
      payloads.push({
        product_id: null,
        inventory_number: null,
        title_snapshot: item.title,
        item_year_snapshot: null,
        metal_snapshot: item.metal === 'Other' ? null : item.metal,
        purity_snapshot: item.purity,
        gram_weight_snapshot: item.gramWeight,
        price_snapshot: item.price,
        quantity: 1,
        image_snapshot: item.photoUrl,
      });
    }
  }
  return { payloads, listedIds };
}

/** "No longer available: …" from create_paypal_order → a 409 the form can show. */
export function createOrderErrorStatus(message: string | null | undefined): number {
  return /no longer available|not available/i.test(message ?? '') ? 409 : 500;
}

/**
 * Mark an existing unpaid order PAID with money taken outside the site, the
 * way the in-store recorder always has:
 *   1. `capture_paypal_order` — paid + every listed product sold (row lock);
 *   2. the stamp — the real payment method, no PayPal capture id, a readable
 *      reference, and `picked_up` when the customer already has the piece;
 *   3. the shop cache, the eBay/Etsy/Deep Field hooks, then the invoice row,
 *      the customer's receipt (when asked) and the owner's email.
 */
export async function recordOfflinePayment(
  service: SupabaseClient,
  input: {
    orderId: string;
    orderNumber: string;
    listedIds: string[];
    paidBy: InStorePaymentMethod;
    /** `in_store_zettle`, `remote_zelle`, … */
    paymentMethodValue: string;
    /** "In store · Zelle" / "Invoice · Zelle". */
    reference: string;
    captureIdPrefix: 'in-store' | 'remote';
    pickedUp: boolean;
    note: string | null;
    recordedBy: string | null;
    sendCustomerReceipt: boolean;
  },
): Promise<{ ok: true; receiptEmailed: boolean } | { ok: false; error: string; status: number }> {
  const { data: captured, error: captureError } = await service.rpc('capture_paypal_order', {
    p_order_id: input.orderId,
    p_capture_id: `${input.captureIdPrefix}:${input.orderNumber}`,
    p_payment_response: { source: input.captureIdPrefix === 'remote' ? 'remote_sale' : 'in_store', paid_by: input.paidBy, note: input.note, recorded_by: input.recordedBy },
  });
  if (captureError) {
    console.error('instant sale capture_paypal_order error:', captureError);
    return { ok: false, error: `The order ${input.orderNumber} was created but could not be marked paid: ${captureError.message}`, status: 500 };
  }
  const capturedRow = Array.isArray(captured) ? captured[0] : captured;
  if (capturedRow?.item_conflict) {
    // The RPC flagged the order `failed` — a web buyer paid for an item first.
    return { ok: false, error: 'An item on this sale was just sold online. Nothing was recorded — check Orders before selling it.', status: 409 };
  }

  const { error: stampError } = await service
    .from('orders')
    .update({
      payment_method: input.paymentMethodValue,
      paypal_capture_id: null,
      payment_reference: input.reference,
      ...(input.pickedUp ? { fulfillment_status: 'picked_up' } : {}),
    })
    .eq('id', input.orderId);
  if (stampError) console.error('instant sale stamp error:', stampError);

  revalidateTag('shop-catalog', { expire: 0 });
  for (const id of input.listedIds) {
    revalidatePath(`/shop/${id}`);
    revalidatePath(`/es/shop/${id}`);
  }
  // Ends the eBay/Etsy listings and mirrors the sold flip to Deep Field —
  // the same hook a web sale schedules.
  if (input.listedIds.length > 0) scheduleProductStatusHooks(input.listedIds);

  await finalizePaidOrder(service, input.orderId, { sendCustomerReceipt: input.sendCustomerReceipt });

  // Report what actually happened to the receipt, not finalizePaidOrder's
  // overall flag: that flag also covers the invoice upsert, and on 2026-09-16
  // the very first live test showed "Not emailed" while the receipt HAD been
  // sent — the invoice write had failed on a missing service_role grant.
  const { data: receiptRows } = input.sendCustomerReceipt
    ? await service.from('order_emails').select('id').eq('order_id', input.orderId).eq('email_type', 'receipt').limit(1)
    : { data: [] as { id: string }[] };
  return { ok: true, receiptEmailed: Boolean(receiptRows?.length) };
}
