import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import {
  BACKFILL_DAYS,
  countSaleOutcome,
  emptySalesSweepSummary,
  linesBefore,
  saleRecordDetails,
  saleRecordInsert,
  selectReversedOrders,
  formatSalesSweepSummary,
  hasSalesScope,
  salesReadFrom,
  salesSweepOutcomeLevel,
  selectEbaySaleLines,
  selectEtsySaleLines,
  type MarketplaceSaleLine,
  type SaleApplyOutcome,
  type SaleChannel,
  type ReversedOrder,
  type SalesSweepSummary,
  type UnmatchedSaleLine,
} from '@/lib/marketplace-sales';
import type { EbayOrder, EtsyReceipt } from '@/lib/marketplace-sales';
import { ensureFreshAccessToken as ensureEtsyToken } from '@/lib/etsy/auth';
import { getShopReceipts } from '@/lib/etsy/client';
import {
  getConnection as getEtsyConnection,
  insertSyncLog as insertEtsyLog,
  updateConnection as updateEtsyConnection,
  upsertListing as upsertEtsyListing,
  type EtsyConnectionRow,
} from '@/lib/etsy/store';
import {
  handleProductStatusChange as handleEtsyProductStatusChange,
  scanAndMarkOutOfDate as scanEtsyOutOfDate,
} from '@/lib/etsy/sync';
import { ensureFreshAccessToken as ensureEbayToken } from '@/lib/ebay/auth';
import { getOrders } from '@/lib/ebay/client';
import {
  getConnection as getEbayConnection,
  insertSyncLog as insertEbayLog,
  updateConnection as updateEbayConnection,
  upsertListing as upsertEbayListing,
  type EbayConnectionRow,
} from '@/lib/ebay/store';
import {
  handleProductStatusChange as handleEbayProductStatusChange,
  scanAndMarkOutOfDate as scanEbayOutOfDate,
} from '@/lib/ebay/sync';
import { syncProductsToDeepField } from '@/lib/deepfield/sync';

/**
 * The server half of "a sale on Etsy/eBay marks the product sold on the
 * site" (rules and the pure selection in lib/marketplace-sales.ts). Runs at
 * the top of each 30-minute reconcile sweep, before the drift repair, so a
 * sale is applied and the other marketplace is closed in the same pass.
 *
 * Per applied line, exactly what a website sale does, via the SQL function
 * `apply_marketplace_sale` (supabase/marketplace-sales-2026-09.sql): the
 * quantity comes down; at 0 the product is 'sold' with the marketplace price.
 * Then, for a product that became sold:
 *   - its OWN listing row on the selling channel is marked terminal here (the
 *     marketplace already zeroed it — asking it to delist again would only
 *     log a refusal), and
 *   - the OTHER channel's status hook runs, which is the same call the manual
 *     Mark Sold fires — that is what ends the eBay listing after an Etsy sale.
 * A quantity that merely dropped re-hashes both channels so the new count is
 * pushed on the next update.
 *
 * These are AWAITED, not scheduled with after(): this is the cron, not the
 * payment path, and it has the whole function budget.
 */
const SALES_BUDGET_MS = 15_000;

export interface SalesSweepResult extends SalesSweepSummary {
  /** 'armed' = first run set the cursor and read nothing; 'skipped' = off, not connected, or no scope. */
  state: 'ran' | 'armed' | 'skipped';
  reason?: string;
}

type ApplyRow = { outcome: SaleApplyOutcome; status: string | null; quantity: number | null };

async function applyLine(service: SupabaseClient, line: MarketplaceSaleLine): Promise<ApplyRow> {
  const { data, error } = await service.rpc('apply_marketplace_sale', {
    p_channel: line.channel,
    p_external_order_id: line.externalOrderId,
    p_external_line_id: line.externalLineId,
    p_product_id: line.productId,
    p_quantity: line.quantity,
    p_sale_price: line.salePrice,
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as ApplyRow | undefined;
  if (!row?.outcome) throw new Error('apply_marketplace_sale returned no outcome.');
  return row;
}

// ---------------------------------------------------------------------------
// Sale records for Admin → Orders (2026-11-16). Never buyer data. Every write
// here is best-effort: until supabase/marketplace-sale-records-2026-11.sql is
// run the columns/grant are missing, and that must not break the sweep.
// ---------------------------------------------------------------------------
const SALE_EVENTS = 'marketplace_sale_events';
const SALE_KEY = 'channel,external_order_id,external_line_id';

/** Fill title / date / reference on the row `apply_marketplace_sale` just wrote (it has no such parameters). */
async function fillRecordDetails(service: SupabaseClient, line: MarketplaceSaleLine): Promise<void> {
  try {
    await service
      .from(SALE_EVENTS)
      .update(saleRecordDetails(line))
      .eq('channel', line.channel)
      .eq('external_order_id', line.externalOrderId)
      .eq('external_line_id', line.externalLineId)
      .is('title', null);
  } catch {
    // best-effort (see above)
  }
}

/** Insert record-only rows, skipping ones that exist. Returns how many were new, or -1 if the write failed. */
async function recordSaleRows(service: SupabaseClient, rows: ReturnType<typeof saleRecordInsert>[]): Promise<number> {
  if (rows.length === 0) return 0;
  try {
    const { data, error } = await service
      .from(SALE_EVENTS)
      .upsert(rows, { onConflict: SALE_KEY, ignoreDuplicates: true })
      .select('id');
    if (error) return -1;
    return (data ?? []).length;
  } catch {
    return -1;
  }
}

/**
 * The one-time fill-in of past sales: RECORDS ONLY — no product is touched
 * (the owner handled sales before auto-mark-sold was armed). Lines the regular
 * read already covered are left to it (`linesBefore`). Rows that exist but
 * predate the record columns get their title/date, and orders refunded or
 * cancelled since show as such.
 */
async function backfillRecords(
  service: SupabaseClient,
  io: ChannelIo,
  channel: SaleChannel,
  lines: { sales: MarketplaceSaleLine[]; unmatched: UnmatchedSaleLine[] },
  reversed: ReversedOrder[],
  regularReadFrom: Date,
): Promise<boolean> {
  const fresh = [...linesBefore(lines.sales, regularReadFrom), ...linesBefore(lines.unmatched, regularReadFrom)].map(saleRecordInsert);
  const added = await recordSaleRows(service, fresh);
  if (added < 0) return false;

  // Rows written before the record columns existed (by apply_marketplace_sale).
  const { data: bare, error: bareError } = await service
    .from(SALE_EVENTS)
    .select('external_order_id, external_line_id')
    .eq('channel', channel)
    .is('title', null);
  if (bareError) return false;
  const byKey = new Map([...lines.sales, ...lines.unmatched].map((line) => [`${line.externalOrderId}|${line.externalLineId}`, line]));
  for (const row of (bare ?? []) as Array<{ external_order_id: string; external_line_id: string }>) {
    const line = byKey.get(`${row.external_order_id}|${row.external_line_id}`);
    if (!line) continue;
    await service.from(SALE_EVENTS).update(saleRecordDetails(line))
      .eq('channel', channel).eq('external_order_id', row.external_order_id).eq('external_line_id', row.external_line_id);
  }

  for (const status of ['refunded', 'cancelled'] as const) {
    const ids = reversed.filter((r) => r.status === status).map((r) => r.externalOrderId);
    if (ids.length === 0) continue;
    await service.from(SALE_EVENTS).update({ marketplace_status: status })
      .eq('channel', channel).in('external_order_id', ids).is('marketplace_status', null);
  }

  await io.log({
    action: 'marketplace_sales',
    outcome: 'ok',
    message: `Filled in ${added} past ${io.name} sale${added === 1 ? '' : 's'} for Admin → Orders (records only — no product changed).`,
    detail: { added, refundedOrCancelled: reversed.length },
  });
  return true;
}

function revalidateProduct(productId: string): void {
  revalidateTag('shop-catalog', { expire: 0 });
  revalidatePath(`/shop/${productId}`);
  revalidatePath(`/es/shop/${productId}`);
}

/** After a product became SOLD through `channel`: close its own row, end it on the other channel, tell Deep Field. */
async function afterSold(service: SupabaseClient, channel: SaleChannel, productId: string): Promise<void> {
  if (channel === 'etsy') {
    await upsertEtsyListing(service, productId, { sync_state: 'delisted', listing_state: 'inactive' }).catch(() => undefined);
    await handleEbayProductStatusChange([productId]);
  } else {
    await upsertEbayListing(service, productId, { sync_state: 'hidden_oos', last_pushed_qty: 0 }).catch(() => undefined);
    await handleEtsyProductStatusChange([productId]);
  }
  await syncProductsToDeepField([productId]).catch((err) => console.error('[marketplace-sales] deepfield sync failed:', err));
  revalidateProduct(productId);
}

/** After a quantity DROPPED but stock remains: both channels re-hash so the new count pushes. */
async function afterDecremented(productId: string): Promise<void> {
  await Promise.allSettled([scanEtsyOutOfDate([productId]), scanEbayOutOfDate([productId])]);
  revalidateProduct(productId);
}

function lineLabel(line: MarketplaceSaleLine): string {
  return line.title ? `"${line.title}"` : `product ${line.productId}`;
}

interface ChannelIo {
  name: 'Etsy' | 'eBay';
  log: (input: { product_id?: string | null; action: string; outcome: 'ok' | 'warning' | 'error'; message: string; detail?: Record<string, unknown> | null }) => Promise<void>;
}

async function applyAll(
  service: SupabaseClient,
  io: ChannelIo,
  channel: SaleChannel,
  sales: MarketplaceSaleLine[],
  unmatched: UnmatchedSaleLine[],
  ordersRead: number,
  deadlineAt: number,
): Promise<SalesSweepResult> {
  const summary = emptySalesSweepSummary();
  summary.ordersRead = ordersRead;
  summary.unmatched = unmatched.length;

  for (const line of sales) {
    if (Date.now() > deadlineAt) {
      summary.failed += 1;
      await io.log({ product_id: line.productId, action: 'marketplace_sale', outcome: 'warning', message: `Ran out of time before applying the ${io.name} sale of ${lineLabel(line)}; it will be picked up on the next sweep.` });
      continue;
    }
    try {
      const row = await applyLine(service, line);
      await fillRecordDetails(service, line);
      countSaleOutcome(summary, row.outcome);
      if (row.outcome === 'sold') {
        await io.log({
          product_id: line.productId,
          action: 'marketplace_sale',
          outcome: 'ok',
          message: `Sold on ${io.name} — marked sold on the site${line.salePrice != null ? ` at $${line.salePrice.toFixed(2)}` : ''} (${io.name} order ${line.externalOrderId}).`,
          detail: { order: line.externalOrderId, line: line.externalLineId, quantity: line.quantity, salePrice: line.salePrice },
        });
        await afterSold(service, channel, line.productId);
      } else if (row.outcome === 'decremented') {
        await io.log({
          product_id: line.productId,
          action: 'marketplace_sale',
          outcome: 'ok',
          message: `Sold ${line.quantity} on ${io.name} — ${row.quantity ?? '?'} left on the site (${io.name} order ${line.externalOrderId}).`,
          detail: { order: line.externalOrderId, line: line.externalLineId, quantity: line.quantity, remaining: row.quantity },
        });
        await afterDecremented(line.productId);
      } else if (row.outcome === 'not_available') {
        // Already sold by hand (or a draft) — nothing to do, but say so once.
        await io.log({
          product_id: line.productId,
          action: 'marketplace_sale',
          outcome: 'ok',
          message: `Sold on ${io.name}; the site already shows ${row.status ?? 'not available'} — no change (${io.name} order ${line.externalOrderId}).`,
        });
      } else if (row.outcome === 'missing_product') {
        await io.log({ action: 'marketplace_sale', outcome: 'warning', message: `${io.name} order ${line.externalOrderId} names product ${line.productId}, which no longer exists.` });
      }
      // 'duplicate' is the overlap window doing its job — silent.
    } catch (err) {
      summary.failed += 1;
      await io.log({
        product_id: line.productId,
        action: 'marketplace_sale',
        outcome: 'error',
        message: `Could not apply the ${io.name} sale of ${lineLabel(line)}: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  for (const line of unmatched) {
    // Recorded so the sale shows on Admin → Orders; logged only the first time
    // it is seen (the 10-minute overlap re-reads it on the next sweep).
    const recorded = await recordSaleRows(service, [saleRecordInsert(line)]);
    if (recorded === 0) continue;
    await io.log({
      action: 'marketplace_sale',
      outcome: 'warning',
      message: `${io.name} order ${line.externalOrderId} sold ${line.title ? `"${line.title}"` : 'an item'} (${line.reference}) that is not linked to a product here — nothing changed.`,
    });
  }

  await io.log({
    action: 'marketplace_sales',
    outcome: salesSweepOutcomeLevel(summary),
    message: formatSalesSweepSummary(io.name, summary),
    detail: { ...summary },
  });
  return { ...summary, state: 'ran' };
}

/** Log a skip reason only when it differs from the last one — 48 identical "reconnect" rows a day would bury the log. */
async function logSkipOnce(service: SupabaseClient, table: 'etsy_sync_log' | 'ebay_sync_log', io: ChannelIo, message: string): Promise<void> {
  const { data } = await service
    .from(table)
    .select('message')
    .eq('action', 'marketplace_sales')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if ((data as { message?: string | null } | null)?.message === message) return;
  await io.log({ action: 'marketplace_sales', outcome: 'warning', message });
}

/** Etsy listing id → product id, for just the listings these receipts name. */
async function etsyListingMap(service: SupabaseClient, receipts: readonly EtsyReceipt[]): Promise<Map<number, string>> {
  const listingIds = new Set<number>();
  for (const receipt of receipts) for (const t of receipt.transactions ?? []) if (t.listing_id != null) listingIds.add(t.listing_id);
  const listingToProduct = new Map<number, string>();
  if (listingIds.size === 0) return listingToProduct;
  const { data } = await service.from('etsy_listings').select('product_id, etsy_listing_id').in('etsy_listing_id', Array.from(listingIds));
  for (const l of (data ?? []) as Array<{ product_id: string; etsy_listing_id: number | null }>) {
    if (l.etsy_listing_id != null) listingToProduct.set(l.etsy_listing_id, l.product_id);
  }
  return listingToProduct;
}

/** eBay SKU / item id → product id, for just the lines these orders name. */
async function ebayProductMaps(service: SupabaseClient, orders: readonly EbayOrder[]): Promise<{ skuToProduct: Map<string, string>; itemToProduct: Map<string, string> }> {
  const skus = new Set<string>();
  const itemIds = new Set<string>();
  for (const order of orders) {
    for (const line of order.lineItems ?? []) {
      if (line.sku) skus.add(line.sku);
      if (line.legacyItemId) itemIds.add(String(line.legacyItemId));
    }
  }
  const skuToProduct = new Map<string, string>();
  const itemToProduct = new Map<string, string>();
  if (skus.size === 0 && itemIds.size === 0) return { skuToProduct, itemToProduct };
  let query = service.from('ebay_listings').select('product_id, ebay_sku, ebay_listing_id');
  const filters: string[] = [];
  if (skus.size > 0) filters.push(`ebay_sku.in.(${Array.from(skus).map((s) => `"${s.replace(/"/g, '')}"`).join(',')})`);
  if (itemIds.size > 0) filters.push(`ebay_listing_id.in.(${Array.from(itemIds).map((s) => `"${s}"`).join(',')})`);
  query = query.or(filters.join(','));
  const { data } = await query;
  for (const l of (data ?? []) as Array<{ product_id: string; ebay_sku: string; ebay_listing_id: string | null }>) {
    if (l.ebay_sku) skuToProduct.set(l.ebay_sku, l.product_id);
    if (l.ebay_listing_id) itemToProduct.set(l.ebay_listing_id, l.product_id);
  }
  return { skuToProduct, itemToProduct };
}

function skipped(reason: string): SalesSweepResult {
  return { ...emptySalesSweepSummary(), state: 'skipped', reason };
}

// ---------------------------------------------------------------------------
// Etsy
// ---------------------------------------------------------------------------
export async function sweepEtsySales(connection?: EtsyConnectionRow | null): Promise<SalesSweepResult> {
  const service = createServiceClient();
  const io: ChannelIo = { name: 'Etsy', log: (input) => insertEtsyLog(service, input) };
  const startedAt = new Date();
  const deadlineAt = startedAt.getTime() + SALES_BUDGET_MS;

  const row = connection === undefined ? await getEtsyConnection(service) : connection;
  if (!row || row.status !== 'connected') return skipped('not connected');
  if (row.auto_mark_sold === false) return skipped('auto-mark-sold is off');
  if (!hasSalesScope('etsy', row.scopes)) {
    await logSkipOnce(service, 'etsy_sync_log', io, 'Auto-mark-sold is waiting for order permission — reconnect Etsy from Admin → Settings to grant it.');
    return skipped('missing transactions_r scope');
  }
  if (!row.sales_cursor) {
    // First run: watch from now. Sales before this moment are the owner's (already handled by hand).
    try {
      await updateEtsyConnection(service, { sales_cursor: startedAt.toISOString() });
    } catch (err) {
      // The column arrives with supabase/marketplace-sales-2026-09.sql; until it is run this must not break the drift reconcile.
      await logSkipOnce(service, 'etsy_sync_log', io, `Auto-mark-sold is waiting for the database migration (supabase/marketplace-sales-2026-09.sql): ${err instanceof Error ? err.message : String(err)}`);
      return skipped('migration not run');
    }
    await io.log({ action: 'marketplace_sales', outcome: 'ok', message: `Auto-mark-sold armed — Etsy sales from ${startedAt.toISOString()} will mark products sold on the site.` });
    return { ...emptySalesSweepSummary(), state: 'armed' };
  }

  try {
    const { accessToken, shopId } = await ensureEtsyToken(service);
    const regularReadFrom = salesReadFrom(row.sales_cursor);
    const receipts = await getShopReceipts({ shopId, accessToken, minCreated: regularReadFrom });

    const selection = selectEtsySaleLines(receipts, await etsyListingMap(service, receipts));
    const result = await applyAll(service, io, 'etsy', selection.sales, selection.unmatched, receipts.length, deadlineAt);
    // Advance only after a successful read; a failed run re-reads from the old cursor.
    await updateEtsyConnection(service, { sales_cursor: startedAt.toISOString() });

    // One-time fill-in of past sales for Admin → Orders (records only).
    // `undefined` = the column is not there yet (SQL not run) → skip.
    if (row.sales_backfilled_at === null && Date.now() < deadlineAt) {
      try {
        const past = await getShopReceipts({
          shopId,
          accessToken,
          minCreated: new Date(startedAt.getTime() - BACKFILL_DAYS.etsy * 86_400_000),
          maxPages: 20,
          includeUnpaid: true,
        });
        const pastSelection = selectEtsySaleLines(past, await etsyListingMap(service, past));
        const done = await backfillRecords(service, io, 'etsy', pastSelection, selectReversedOrders('etsy', past), regularReadFrom);
        if (done) await updateEtsyConnection(service, { sales_backfilled_at: new Date().toISOString() });
      } catch (err) {
        await io.log({ action: 'marketplace_sales', outcome: 'warning', message: `Filling in past Etsy sales failed (will retry next sweep): ${err instanceof Error ? err.message : String(err)}` });
      }
    }
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Etsy sales sweep failed.';
    await io.log({ action: 'marketplace_sales', outcome: 'error', message: `Etsy sales sweep failed: ${message}` });
    return { ...emptySalesSweepSummary(), failed: 1, state: 'ran', reason: message };
  }
}

// ---------------------------------------------------------------------------
// eBay
// ---------------------------------------------------------------------------
export async function sweepEbaySales(connection?: EbayConnectionRow | null): Promise<SalesSweepResult> {
  const service = createServiceClient();
  const io: ChannelIo = { name: 'eBay', log: (input) => insertEbayLog(service, input) };
  const startedAt = new Date();
  const deadlineAt = startedAt.getTime() + SALES_BUDGET_MS;

  const row = connection === undefined ? await getEbayConnection(service) : connection;
  if (!row || row.status !== 'connected') return skipped('not connected');
  if (row.auto_mark_sold === false) return skipped('auto-mark-sold is off');
  if (!hasSalesScope('ebay', row.scopes)) {
    await logSkipOnce(service, 'ebay_sync_log', io, 'Auto-mark-sold is waiting for order permission — reconnect eBay from Admin → Settings to grant it.');
    return skipped('missing sell.fulfillment.readonly scope');
  }
  if (!row.orders_cursor) {
    try {
      await updateEbayConnection(service, { orders_cursor: startedAt.toISOString() });
    } catch (err) {
      await logSkipOnce(service, 'ebay_sync_log', io, `Auto-mark-sold could not arm: ${err instanceof Error ? err.message : String(err)}`);
      return skipped('could not arm');
    }
    await io.log({ action: 'marketplace_sales', outcome: 'ok', message: `Auto-mark-sold armed — eBay sales from ${startedAt.toISOString()} will mark products sold on the site.` });
    return { ...emptySalesSweepSummary(), state: 'armed' };
  }

  try {
    const { accessToken } = await ensureEbayToken(service);
    const regularReadFrom = salesReadFrom(row.orders_cursor);
    const orders = await getOrders({ accessToken, createdAfter: regularReadFrom });

    const maps = await ebayProductMaps(service, orders);
    const selection = selectEbaySaleLines(orders, maps.skuToProduct, maps.itemToProduct);
    const result = await applyAll(service, io, 'ebay', selection.sales, selection.unmatched, orders.length, deadlineAt);
    await updateEbayConnection(service, { orders_cursor: startedAt.toISOString() });

    // One-time fill-in of past sales for Admin → Orders (records only).
    // `undefined` = the column is not there yet (SQL not run) → skip.
    if (row.sales_backfilled_at === null && Date.now() < deadlineAt) {
      try {
        const past = await getOrders({
          accessToken,
          createdAfter: new Date(startedAt.getTime() - BACKFILL_DAYS.ebay * 86_400_000),
          maxPages: 10,
        });
        const pastMaps = await ebayProductMaps(service, past);
        const pastSelection = selectEbaySaleLines(past, pastMaps.skuToProduct, pastMaps.itemToProduct);
        const done = await backfillRecords(service, io, 'ebay', pastSelection, selectReversedOrders('ebay', past), regularReadFrom);
        if (done) await updateEbayConnection(service, { sales_backfilled_at: new Date().toISOString() });
      } catch (err) {
        await io.log({ action: 'marketplace_sales', outcome: 'warning', message: `Filling in past eBay sales failed (will retry next sweep): ${err instanceof Error ? err.message : String(err)}` });
      }
    }
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'eBay sales sweep failed.';
    await io.log({ action: 'marketplace_sales', outcome: 'error', message: `eBay sales sweep failed: ${message}` });
    return { ...emptySalesSweepSummary(), failed: 1, state: 'ran', reason: message };
  }
}
