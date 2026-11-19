import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import {
  buildMarketplaceSaleRecords,
  marketplaceHidePlan,
  splitMarketplaceRows,
  type MarketplaceChannel,
  type MarketplaceHideAction,
  type MarketplaceSaleEventRow,
  type MarketplaceSaleRecord,
} from '@/lib/marketplace-sale-records';

const SALE_EVENTS = 'marketplace_sale_events';
const BASE_COLUMNS = 'channel, external_order_id, external_line_id, product_id, quantity, sale_price, outcome, title, sold_at, marketplace_status, created_at';
const ROW_LIMIT = 1000;

export interface MarketplaceSaleRecordsResult {
  /** Shown in the Orders list. */
  active: MarketplaceSaleRecord[];
  /** Shown in the Orders Recycle Bin. */
  trash: MarketplaceSaleRecord[];
  /** False until supabase/marketplace-sale-hide-2026-11.sql has run — no Delete buttons then. */
  hideSupported: boolean;
}

const EMPTY: MarketplaceSaleRecordsResult = { active: [], trash: [], hideSupported: false };

function isMissingHideColumn(error: { message?: string | null } | null | undefined): boolean {
  const text = error?.message?.toLowerCase() ?? '';
  return text.includes('deleted_at') || text.includes('purged_at');
}

/**
 * eBay / Etsy sale records for Admin → Orders. Server only (service role —
 * browsers have no access to `marketplace_sale_events`); the caller must have
 * checked the admin first. Never fails the page: before
 * supabase/marketplace-sale-records-2026-11.sql is run it returns nothing, and
 * before supabase/marketplace-sale-hide-2026-11.sql it returns the list with
 * `hideSupported: false`. "Deleted forever" rows are never read.
 */
export async function loadMarketplaceSaleRecords(): Promise<MarketplaceSaleRecordsResult> {
  try {
    const service = createServiceClient();
    let hideSupported = true;
    const first = await service
      .from(SALE_EVENTS)
      .select(`${BASE_COLUMNS}, deleted_at, purged_at`)
      .is('purged_at', null)
      .order('created_at', { ascending: false })
      .limit(ROW_LIMIT);
    let data = first.data as MarketplaceSaleEventRow[] | null;
    let error = first.error;
    if (error && isMissingHideColumn(error)) {
      hideSupported = false;
      const fallback = await service
        .from(SALE_EVENTS)
        .select(BASE_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(ROW_LIMIT);
      data = fallback.data as MarketplaceSaleEventRow[] | null;
      error = fallback.error;
    }
    if (error || !data) return EMPTY;
    const rows = data;

    // Titles for rows written before the title column existed.
    const missing = Array.from(new Set(rows.filter((r) => !r.title && r.product_id).map((r) => r.product_id as string)));
    const productTitles = new Map<string, string>();
    if (missing.length > 0) {
      const { data: products } = await service.from('products').select('id, title').in('id', missing);
      for (const p of (products ?? []) as Array<{ id: string; title: string | null }>) {
        if (p.title) productTitles.set(p.id, p.title);
      }
    }
    const { active, trash } = splitMarketplaceRows(rows);
    return {
      active: buildMarketplaceSaleRecords(active, productTitles),
      trash: buildMarketplaceSaleRecords(trash, productTitles),
      hideSupported,
    };
  } catch {
    return EMPTY;
  }
}

/**
 * Delete (to the Recycle Bin), Restore, or Delete Forever whole marketplace
 * orders — every line of each order. ⛔ Only ever an UPDATE: the rows must stay
 * as the sales sweep's "already seen" marks (see the SQL file). Never touches a
 * product. Returns how many marketplace orders changed.
 */
export async function setMarketplaceSalesHidden(
  action: MarketplaceHideAction,
  targets: ReadonlyArray<{ channel: MarketplaceChannel; externalOrderId: string }>,
): Promise<{ changed: number } | { error: string }> {
  const plan = marketplaceHidePlan(action, new Date().toISOString());
  const service = createServiceClient();
  const changed = new Set<string>();
  for (const channel of ['ebay', 'etsy'] as const) {
    const ids = Array.from(new Set(targets.filter((t) => t.channel === channel).map((t) => t.externalOrderId)));
    if (ids.length === 0) continue;
    let query = service
      .from(SALE_EVENTS)
      .update(plan.patch)
      .eq('channel', channel)
      .in('external_order_id', ids)
      .is('purged_at', null);
    query = plan.onlyInTrash ? query.not('deleted_at', 'is', null) : query.is('deleted_at', null);
    const { data, error } = await query.select('external_order_id');
    if (error) {
      return {
        error: isMissingHideColumn(error)
          ? 'Run supabase/marketplace-sale-hide-2026-11.sql in Supabase first.'
          : error.message,
      };
    }
    for (const row of (data ?? []) as Array<{ external_order_id: string }>) changed.add(`${channel}:${row.external_order_id}`);
  }
  return { changed: changed.size };
}
