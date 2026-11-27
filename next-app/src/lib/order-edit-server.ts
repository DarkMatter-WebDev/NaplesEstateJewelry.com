import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { adminUpdateProductsStatus } from '@/app/actions/admin-products';
import { upsertOrderInvoice } from '@/lib/order-invoices';
import { loadOrderGift } from '@/lib/order-gift-server';
import { loadBullionLineIds } from '@/lib/bullion-sale-server';
import { getProductImages, getProductMetal, getProductWeight, getSnapshotPrice } from '@/lib/sales';
import { fetchSpotData } from '@/lib/spot-price';
import { BULLION_SQL_FILE, bullionColumnReady } from '@/lib/instant-sale-server';
import { SALE_TRADE_CREDIT, salePaymentReference, SPLIT_PAYMENTS_COLUMN, TRADE_IN_COLUMN, withBullionFlags } from '@/lib/in-store-sale';
import {
  addressObject,
  describeChanges,
  editRefusal,
  editStateFromOrder,
  editTotals,
  isPaidStatus,
  keepFixedMoney,
  moneyChanged,
  orderEditRules,
  paymentsChanged,
  readEditBody,
  refundPaymentStatus,
  settlePayments,
  totalsChanges,
  type OrderChange,
  type OrderEditState,
  type OrderRowForEdit,
} from '@/lib/order-edit';
import type { Product } from '@/types/product';

/**
 * Admin → Orders → Edit order / Fix name — the save. Rules in `lib/order-edit.ts`.
 *
 * Order of writes (no database transaction is available from the client
 * library): items first, then the order row, then listings, invoice, buyers,
 * follow-ups and the history. Each later step only follows a successful
 * earlier one, and the reply names any step that failed so nothing is silent.
 */

const ORDER_COLUMNS = [
  'id', 'order_number', 'customer_name', 'customer_email', 'customer_phone',
  'subtotal', 'tax', 'shipping_fee', 'discount', 'total',
  'payment_status', 'order_status', 'payment_method', 'refund_amount', 'deleted_at', 'tax_exempt', 'tax_exempt_snapshot',
  'shipping_method', 'shipping_address', 'billing_address', 'customer_notes', 'payment_response',
  SPLIT_PAYMENTS_COLUMN, TRADE_IN_COLUMN,
  'order_items(id, product_id, inventory_number, title_snapshot, price_snapshot, quantity, discount)',
].join(', ');

type LoadedOrder = OrderRowForEdit & {
  id: string;
  order_number: string;
  tax_exempt_snapshot: unknown;
  payment_response: unknown;
};

function likeExact(email: string): string {
  return email.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function loadOrderForEdit(client: SupabaseClient, orderId: string): Promise<{ order: LoadedOrder; state: OrderEditState } | null> {
  const { data, error } = await client.from('orders').select(ORDER_COLUMNS).eq('id', orderId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const order = data as unknown as LoadedOrder;
  order.order_items = withBullionFlags(order.order_items ?? [], await loadBullionLineIds(client, orderId));
  const gift = await loadOrderGift(client, orderId).catch(() => null);
  return { order, state: editStateFromOrder(order, gift) };
}

export type OrderEditResult =
  | { ok: true; changes: OrderChange[]; historySaved: boolean; warnings: string[]; emailChanged: boolean }
  | { ok: false; status: number; error: string };

/** Listing columns for a piece added to an unpaid order. */
const ADD_PRODUCT_COLUMNS = '*';

export async function applyOrderEdit(
  service: SupabaseClient,
  orderId: string,
  body: unknown,
  byEmail: string | null,
  source: 'edit' | 'fix_name' = 'edit',
): Promise<OrderEditResult> {
  const loaded = await loadOrderForEdit(service, orderId);
  if (!loaded) return { ok: false, status: 404, error: 'Order not found.' };
  const { order, state: before } = loaded;

  const read = readEditBody(body);
  if ('error' in read) return { ok: false, status: 400, error: read.error };
  const rules = orderEditRules(order);
  let after: OrderEditState = keepFixedMoney(rules, before, { ...read.state, isGift: before.isGift });

  // Items must be this order's own (or new); a listing number can never be swapped in.
  const ownIds = new Set(before.items.map((item) => item.id));
  for (const item of after.items) {
    if (item.id && !ownIds.has(item.id)) return { ok: false, status: 400, error: 'An item does not belong to this order. Reload the page and try again.' };
  }
  // Existing lines keep their saved listing link; the bullion mark is the window's (2026-11-26).
  const beforeById = new Map(before.items.map((item) => [item.id as string, item]));
  after.items = after.items.map((item) => {
    const was = item.id ? beforeById.get(item.id) : undefined;
    return was ? { ...item, productId: was.productId, inventoryNumber: was.inventoryNumber } : item;
  });
  // Lines left out of the request stay as they are.
  for (const was of before.items) {
    if (!after.items.some((item) => item.id === was.id)) after.items.push({ ...was });
  }

  const money = moneyChanged(before, after);
  const taxExempt = Boolean(order.tax_exempt);
  // Unchanged numbers keep the order's saved totals (a name fix never re-figures an old order's tax).
  const totals = money
    ? editTotals(after, taxExempt)
    : { subtotal: Number(order.subtotal), discount: Number(order.discount), shippingFee: Number(order.shipping_fee), tax: Number(order.tax), total: Number(order.total), taxNotCharged: 0 };
  after = { ...after, payments: settlePayments(after.payments, totals.total) };
  const refusal = editRefusal(rules, after, totals);
  if (refusal) return { ok: false, status: 409, error: refusal };

  const payments = rules.paymentsEditable && paymentsChanged(before, after);
  const refund = rules.refundEditable && Math.round(before.refundAmount * 100) !== Math.round(after.refundAmount * 100);
  const changes = [...describeChanges(before, after), ...(money ? totalsChanges(order, totals) : [])];
  if (changes.length === 0) return { ok: true, changes: [], historySaved: true, warnings: [], emailChanged: false };
  const warnings: string[] = [];

  // A bullion mark needs its column (order-items-bullion-2026-11.sql) — refused before anything is written.
  const bullionTouched = after.items.some((item) => {
    const was = item.id ? beforeById.get(item.id) : undefined;
    return !item.removed && (was ? was.bullion !== item.bullion : item.bullion);
  });
  if (bullionTouched && !(await bullionColumnReady(service))) {
    return { ok: false, status: 409, error: `Bullion — no sales tax needs a one-time database update first (${BULLION_SQL_FILE}).` };
  }

  // ---- 1. Items --------------------------------------------------------------
  const addedProductIds: string[] = [];
  const removedProductIds: string[] = [];
  for (const item of after.items) {
    const was = item.id ? beforeById.get(item.id) : undefined;
    if (was && item.removed) {
      const { error } = await service.from('order_items').delete().eq('id', item.id as string).eq('order_id', orderId);
      if (error) return { ok: false, status: 500, error: `Could not remove "${was.title}": ${error.message}` };
      if (was.productId) removedProductIds.push(was.productId);
      continue;
    }
    if (was) {
      const update: Record<string, unknown> = {};
      if (was.title.trim() !== item.title.trim()) update.title_snapshot = item.title.trim();
      if (was.price !== item.price) update.price_snapshot = item.price;
      if (was.quantity !== item.quantity) update.quantity = item.quantity;
      if (was.discount !== item.discount) update.discount = item.discount;
      if (was.bullion !== item.bullion) update.tax_free_bullion = item.bullion;
      if (Object.keys(update).length === 0) continue;
      const { error } = await service.from('order_items').update(update).eq('id', item.id as string).eq('order_id', orderId);
      if (error) return { ok: false, status: 500, error: `Could not save "${item.title}": ${error.message}` };
      continue;
    }
    if (item.removed) continue;
    // A new line (any order since 2026-11-26).
    let insert: Record<string, unknown> = {
      order_id: orderId,
      product_id: null,
      inventory_number: null,
      title_snapshot: item.title.trim(),
      price_snapshot: item.price,
      quantity: item.quantity,
      discount: item.discount,
      // Only when ticked: an order without bullion still saves before the bullion SQL.
      ...(item.bullion ? { tax_free_bullion: true } : {}),
    };
    if (item.productId) {
      const { data: product, error: productError } = await service.from('products').select(ADD_PRODUCT_COLUMNS).eq('id', item.productId).maybeSingle();
      if (productError || !product) return { ok: false, status: 400, error: `"${item.title}" is no longer in the listings.` };
      const p = product as Product;
      if (String(p.status ?? '').toLowerCase() !== 'available') {
        return { ok: false, status: 409, error: `"${p.title}" is ${String(p.status ?? 'not available').replace(/_/g, ' ')} — it cannot be added.` };
      }
      insert = {
        ...insert,
        product_id: p.id,
        inventory_number: p.inventory_number != null ? String(p.inventory_number) : (p as { sku?: string | null }).sku ?? p.id,
        item_year_snapshot: (p as { item_year?: number | null }).item_year ?? null,
        metal_snapshot: getProductMetal(p),
        purity_snapshot: p.purity ? String(p.purity) : null,
        gram_weight_snapshot: getProductWeight(p),
        image_snapshot: getProductImages(p)[0] ?? null,
      };
      addedProductIds.push(p.id);
    }
    const { error } = await service.from('order_items').insert(insert);
    if (error) return { ok: false, status: 500, error: `Could not add "${item.title}": ${error.message}` };
  }

  // ---- 2. The order row --------------------------------------------------------
  const update: Record<string, unknown> = {
    customer_name: after.customerName || null,
    customer_email: after.customerEmail || null,
    customer_phone: after.customerPhone || null,
    shipping_address: addressObject(after.shippingAddress),
    billing_address: addressObject(after.billingAddress),
    shipping_method: after.shippingMethod,
    customer_notes: after.customerNotes || null,
  };
  if (before.isGift) {
    update.gift_recipient_name = after.giftRecipient || null;
    update.gift_message = after.giftMessage || null;
  }
  if (money) {
    Object.assign(update, {
      subtotal: totals.subtotal,
      discount: totals.discount,
      shipping_fee: totals.shippingFee,
      tax: totals.tax,
      total: totals.total,
    });
    if (order.tax_exempt && order.tax_exempt_snapshot && typeof order.tax_exempt_snapshot === 'object') {
      update.tax_exempt_snapshot = { ...(order.tax_exempt_snapshot as Record<string, unknown>), taxNotCharged: totals.taxNotCharged };
    }
  }
  // "Paid by" (paid outside the site): saved the way Instant Sale saves it — the
  // method value, the readable reference and the parts on `payment_response`.
  if (rules.paymentsEditable && rules.paymentPrefix && (payments || money)) {
    const parts = after.payments;
    const hasTrade = parts.some((part) => part.method === SALE_TRADE_CREDIT);
    const paidBy = parts.length > 1 ? 'split' : parts[0].method;
    const response = order.payment_response && typeof order.payment_response === 'object' ? { ...(order.payment_response as Record<string, unknown>) } : {};
    response.paid_by = paidBy;
    if (paidBy === 'split' || hasTrade) response.payments = parts;
    else delete response.payments;
    update.payment_method = `${rules.paymentPrefix}_${paidBy}`;
    update.payment_reference = salePaymentReference(rules.paymentPrefix === 'remote' ? 'Invoice' : 'In store', paidBy, parts);
    update.payment_response = response;
  }
  // Refunded (paid, not PayPal): the amount and the status it gives.
  if (rules.refundEditable && (refund || money)) {
    const status = refundPaymentStatus(after.refundAmount, totals.total);
    update.refund_amount = after.refundAmount > 0 ? after.refundAmount : null;
    update.payment_status = status;
    if (status === 'refunded') update.order_status = 'refunded';
    else if (String(order.order_status ?? '') === 'refunded') update.order_status = 'completed';
  }
  let { error: orderError } = await service.from('orders').update(update).eq('id', orderId);
  if (orderError && /gift_/.test(orderError.message)) {
    delete update.gift_message;
    delete update.gift_recipient_name;
    ({ error: orderError } = await service.from('orders').update(update).eq('id', orderId));
  }
  if (orderError) return { ok: false, status: 500, error: `The items were saved but the order was not: ${orderError.message}. Open Edit order again and save.` };

  // ---- 3. Listings -------------------------------------------------------------------
  // A removed listed piece goes back on sale (held for an unpaid order, or sold on a
  // paid one — owner pick 4); an added one is held (unpaid) or marked Sold (paid).
  const paidOrder = isPaidStatus(order.payment_status);
  if (removedProductIds.length > 0) {
    const { data } = await service.from('products').select('id, status').in('id', removedProductIds);
    const backOnSale = (data ?? [])
      .filter((row) => {
        const status = String(row.status ?? '').toLowerCase();
        return status === 'pending_payment' || (paidOrder && status === 'sold');
      })
      .map((row) => String(row.id));
    if (backOnSale.length > 0) {
      const result = await adminUpdateProductsStatus(backOnSale, 'available');
      if (result.error) warnings.push(`A removed piece could not be put back on sale: ${result.error}`);
    }
  }
  if (addedProductIds.length > 0) {
    const soldPrices = Object.fromEntries(after.items.filter((item) => item.productId && !item.id && !item.removed).map((item) => [item.productId as string, item.price]));
    const result = paidOrder
      ? await adminUpdateProductsStatus(addedProductIds, 'sold', soldPrices)
      : await adminUpdateProductsStatus(addedProductIds, 'pending_payment');
    if (result.error) warnings.push(`An added piece could not be ${paidOrder ? 'marked Sold' : 'held for this order'}: ${result.error}`);
  }

  // ---- 4. Invoice record ------------------------------------------------------------
  if (money || payments || refund) {
    const { data: hasInvoice } = await service.from('invoices').select('id').eq('order_id', orderId).limit(1);
    if ((hasInvoice ?? []).length > 0) {
      const invoice = await upsertOrderInvoice(service, orderId);
      if (!invoice.ok) warnings.push(`The invoice record was not updated: ${invoice.error}`);
    }
  }

  // ---- 5. Buyers list + follow-ups (paid orders) ------------------------------------
  const oldEmail = (before.customerEmail || '').toLowerCase();
  const newEmail = (after.customerEmail || '').toLowerCase();
  const emailChanged = oldEmail !== newEmail;
  if (rules.paid && (emailChanged || money || refund)) {
    for (const email of new Set([oldEmail, newEmail].filter(Boolean))) {
      const problem = await recomputeBuyer(service, email);
      if (problem) warnings.push(problem);
    }
  }
  if (emailChanged && newEmail) {
    await service
      .from('follow_up_messages')
      .update({ email: newEmail, name: after.customerName || null, updated_at: new Date().toISOString() })
      .eq('source_type', 'order')
      .eq('source_id', orderId)
      .in('status', ['scheduled', 'waiting', 'failed', 'not_sent', 'skipped'])
      .then(({ error }) => {
        if (error && !/follow_up_/.test(error.message)) warnings.push(`Follow-ups were not moved to the new email: ${error.message}`);
      });
  }

  // ---- 6. History ---------------------------------------------------------------------
  const historySaved = await recordOrderChange(service, orderId, byEmail, source, changes, money || payments || refund);
  return { ok: true, changes, historySaved, warnings, emailChanged };
}

/** Buyers row = that email's paid, not-deleted orders (count, total, first / last). */
async function recomputeBuyer(service: SupabaseClient, email: string): Promise<string | null> {
  const { data, error } = await service
    .from('orders')
    .select('customer_name, customer_phone, user_id, total, created_at')
    .ilike('customer_email', likeExact(email))
    .eq('payment_status', 'paid')
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (error) return `The Buyers list was not updated: ${error.message}`;
  const rows = (data ?? []) as Array<{ customer_name: string | null; customer_phone: string | null; user_id: string | null; total: number | null; created_at: string }>;
  if (rows.length === 0) {
    const { error: deleteError } = await service.from('buyers').delete().eq('email', email);
    return deleteError ? `The old email stayed on the Buyers list: ${deleteError.message}` : null;
  }
  const latest = rows[rows.length - 1];
  const values = {
    name: latest.customer_name,
    phone: latest.customer_phone,
    user_id: latest.user_id,
    order_count: rows.length,
    total_spent: Math.round(rows.reduce((sum, row) => sum + (Number(row.total) || 0), 0) * 100) / 100,
    first_order_at: rows[0].created_at,
    last_order_at: latest.created_at,
    updated_at: new Date().toISOString(),
  };
  const { data: existing } = await service.from('buyers').select('id').eq('email', email).maybeSingle();
  const { error: saveError } = existing
    ? await service.from('buyers').update(values).eq('email', email)
    : await service.from('buyers').insert({ email, ...values });
  return saveError ? `The Buyers list was not updated: ${saveError.message}` : null;
}

async function recordOrderChange(
  service: SupabaseClient,
  orderId: string,
  byEmail: string | null,
  source: 'edit' | 'fix_name',
  changes: OrderChange[],
  money: boolean,
): Promise<boolean> {
  const { error } = await service.from('order_changes').insert({
    order_id: orderId,
    changed_by_email: byEmail,
    source,
    changes,
    money_changed: money,
  });
  if (error) {
    console.error('[order-edit] history not saved:', error.message);
    return false;
  }
  return true;
}

export type OrderChangeRow = { id: string; changed_at: string; changed_by_email: string | null; source: string; changes: OrderChange[]; money_changed: boolean };

/** The order page's Change history. `ready: false` = the SQL has not run. */
export async function loadOrderChanges(client: SupabaseClient, orderId: string): Promise<{ ready: boolean; rows: OrderChangeRow[] }> {
  const { data, error } = await client
    .from('order_changes')
    .select('id, changed_at, changed_by_email, source, changes, money_changed')
    .eq('order_id', orderId)
    .order('changed_at', { ascending: false })
    .limit(100);
  if (error) return { ready: false, rows: [] };
  return {
    ready: true,
    rows: ((data ?? []) as OrderChangeRow[]).map((row) => ({ ...row, changes: Array.isArray(row.changes) ? row.changes : [] })),
  };
}

export type AddableProduct = { id: string; title: string; inventoryNumber: string | null; price: number; image: string | null };

/** "+ Add a listed piece": every available listing, priced as a sale would price it now. */
export async function loadAddableProducts(service: SupabaseClient): Promise<AddableProduct[]> {
  const [{ data, error }, spotData] = await Promise.all([
    service.from('products').select('*').in('status', ['available', 'Available']).order('inventory_number', { ascending: false, nullsFirst: false }).limit(1000),
    fetchSpotData(),
  ]);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Product[]).map((product) => ({
    id: product.id,
    title: product.title,
    inventoryNumber: product.inventory_number != null ? String(product.inventory_number) : null,
    price: Math.round((getSnapshotPrice(product, spotData) || 0) * 100) / 100,
    image: getProductImages(product)[0] ?? null,
  }));
}
