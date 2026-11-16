import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import { buildMarketplaceSaleRecords, type MarketplaceSaleEventRow, type MarketplaceSaleRecord } from '@/lib/marketplace-sale-records';

/**
 * eBay / Etsy sale records for Admin → Orders. Server only (service role —
 * browsers have no access to `marketplace_sale_events`); the caller must have
 * checked the admin first. Never fails the page: before
 * supabase/marketplace-sale-records-2026-11.sql is run it returns [].
 */
export async function loadMarketplaceSaleRecords(): Promise<MarketplaceSaleRecord[]> {
  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from('marketplace_sale_events')
      .select('channel, external_order_id, external_line_id, product_id, quantity, sale_price, outcome, title, sold_at, marketplace_status, created_at')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error || !data) return [];
    const rows = data as MarketplaceSaleEventRow[];

    // Titles for rows written before the title column existed.
    const missing = Array.from(new Set(rows.filter((r) => !r.title && r.product_id).map((r) => r.product_id as string)));
    const productTitles = new Map<string, string>();
    if (missing.length > 0) {
      const { data: products } = await service.from('products').select('id, title').in('id', missing);
      for (const p of (products ?? []) as Array<{ id: string; title: string | null }>) {
        if (p.title) productTitles.set(p.id, p.title);
      }
    }
    return buildMarketplaceSaleRecords(rows, productTitles);
  } catch {
    return [];
  }
}
