import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// "Bullion — no sales tax" (owner, 2026-11-24): READING an order's bullion
// lines (`order_items.tax_free_bullion`, `supabase/order-items-bullion-2026-11.sql`).
// Its own module, with no other imports, so the receipt mailer and the pages
// can use it without pulling in the sale-recording code. Both reads are
// tolerant: before the SQL has run they return "no bullion".
// Writing the mark lives in `instant-sale-server.ts` (`markBullionLines`).

/**
 * The bullion part of an order's merchandise, from its marked lines (the
 * Remote invoice's pay page re-figures the tax for the typed address with it).
 * 0 before the SQL has run — then no line can be marked anyway.
 */
export async function loadBullionTaxFree(client: SupabaseClient, orderId: string): Promise<number> {
  const { data, error } = await client
    .from('order_items')
    .select('price_snapshot, quantity, discount')
    .eq('order_id', orderId)
    .eq('tax_free_bullion', true);
  if (error || !data) return 0;
  const sum = (data as Array<{ price_snapshot: number; quantity?: number | null; discount?: number | null }>).reduce(
    (total, row) => total + Number(row.price_snapshot) * Math.max(1, Number(row.quantity ?? 1)) - Math.max(0, Number(row.discount ?? 0)),
    0,
  );
  return Math.round(sum * 100) / 100;
}

/**
 * The ids of an order's bullion lines, for the receipts and the order page.
 * Read on its own so the existing item selects stay as they are and every
 * page works before the SQL (empty set).
 */
export async function loadBullionLineIds(client: SupabaseClient, orderId: string): Promise<Set<string>> {
  const { data, error } = await client.from('order_items').select('id').eq('order_id', orderId).eq('tax_free_bullion', true);
  if (error || !data) return new Set();
  return new Set((data as Array<{ id: string }>).map((row) => row.id));
}
