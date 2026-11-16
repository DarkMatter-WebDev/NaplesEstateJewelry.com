/**
 * eBay / Etsy sales on Admin → Orders (owner, 2026-11-16: "a simple record
 * letting me know it sold, when, and how much.. no need to record buyer data";
 * option B — mixed into the orders list with an eBay / Etsy chip).
 *
 * PURE and client-safe: turns `marketplace_sale_events` rows (one per order
 * line, written by the sales sweep — lib/marketplace-sales-sweep.ts) into one
 * record per marketplace order. These are NOT `orders` rows: no receipts, no
 * tax totals, no buyer. Tests: lib/__tests__/marketplace-sale-records.test.ts.
 */
export type MarketplaceChannel = 'ebay' | 'etsy';

export interface MarketplaceSaleEventRow {
  channel: string;
  external_order_id: string;
  external_line_id: string;
  product_id: string | null;
  quantity: number | null;
  sale_price: number | string | null;
  outcome: string | null;
  title?: string | null;
  sold_at?: string | null;
  marketplace_status?: string | null;
  created_at: string;
}

export interface MarketplaceSaleRecord {
  /** Stable key: channel + marketplace order id. */
  key: string;
  channel: MarketplaceChannel;
  externalOrderId: string;
  /** One title per order line ("Item" when the marketplace sent none). */
  items: string[];
  /** When the marketplace order was placed (falls back to when the site saw it). */
  soldAt: string;
  /** Sum of line prices × quantity, before shipping and fees; null when no line had a price. */
  total: number | null;
  status: 'sold' | 'refunded' | 'cancelled';
}

export const MARKETPLACE_LABEL: Record<MarketplaceChannel, string> = { ebay: 'eBay', etsy: 'Etsy' };

/** The seller's own order page on the marketplace (the owner signs in there to see the buyer). */
export function marketplaceOrderUrl(channel: MarketplaceChannel, externalOrderId: string): string {
  const id = encodeURIComponent(externalOrderId);
  return channel === 'ebay'
    ? `https://www.ebay.com/mesh/ord/details?mode=SH&orderid=${id}`
    : `https://www.etsy.com/your/orders/sold?order_id=${id}`;
}

function toMoney(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Group line rows into one record per marketplace order, newest first.
 * `productTitles` fills a title for rows written before the title column
 * existed. A row still 'pending' (a write that never finished) is skipped.
 */
export function buildMarketplaceSaleRecords(
  rows: readonly MarketplaceSaleEventRow[],
  productTitles: ReadonlyMap<string, string> = new Map(),
): MarketplaceSaleRecord[] {
  const byOrder = new Map<string, MarketplaceSaleRecord>();
  for (const row of rows) {
    if (row.channel !== 'ebay' && row.channel !== 'etsy') continue;
    if (row.outcome === 'pending') continue;
    const channel = row.channel as MarketplaceChannel;
    const key = `${channel}:${row.external_order_id}`;
    const quantity = Math.max(1, Math.floor(Number(row.quantity) || 1));
    const price = toMoney(row.sale_price);
    const title = row.title?.trim()
      || (row.product_id ? productTitles.get(row.product_id) : undefined)
      || 'Item';
    const soldAt = row.sold_at || row.created_at;
    const status = row.marketplace_status === 'refunded' || row.marketplace_status === 'cancelled' ? row.marketplace_status : 'sold';

    const existing = byOrder.get(key);
    if (!existing) {
      byOrder.set(key, {
        key,
        channel,
        externalOrderId: row.external_order_id,
        items: [quantity > 1 ? `${title} ×${quantity}` : title],
        soldAt,
        total: price != null ? Math.round(price * quantity * 100) / 100 : null,
        status,
      });
      continue;
    }
    existing.items.push(quantity > 1 ? `${title} ×${quantity}` : title);
    if (Date.parse(soldAt) < Date.parse(existing.soldAt)) existing.soldAt = soldAt;
    if (price != null) {
      existing.total = Math.round(((existing.total ?? 0) + price * quantity) * 100) / 100;
    }
    if (status !== 'sold') existing.status = status;
  }
  return Array.from(byOrder.values())
    .sort((a, b) => Date.parse(b.soldAt) - Date.parse(a.soldAt));
}

/** The Orders search box: order id, item titles, or the marketplace's name. */
export function marketplaceRecordMatches(record: MarketplaceSaleRecord, search: string): boolean {
  const term = search.trim().toLowerCase();
  if (!term) return true;
  return [record.externalOrderId, MARKETPLACE_LABEL[record.channel], ...record.items].join(' ').toLowerCase().includes(term);
}

export type OrdersListEntry<O> = { kind: 'order'; order: O; at: string } | { kind: 'marketplace'; record: MarketplaceSaleRecord; at: string };

/** Site orders and marketplace records in one list, newest first (site orders keep their own order among themselves). */
export function mergeOrdersAndMarketplace<O extends { created_at: string }>(
  orders: readonly O[],
  records: readonly MarketplaceSaleRecord[],
): OrdersListEntry<O>[] {
  const entries: OrdersListEntry<O>[] = [
    ...orders.map((order) => ({ kind: 'order' as const, order, at: order.created_at })),
    ...records.map((record) => ({ kind: 'marketplace' as const, record, at: record.soldAt })),
  ];
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => (Date.parse(b.entry.at) - Date.parse(a.entry.at)) || (a.index - b.index))
    .map(({ entry }) => entry);
}
