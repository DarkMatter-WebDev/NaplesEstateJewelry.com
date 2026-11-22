import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeOrderLanguage, type OrderLanguage } from '@/lib/order-language';

// `orders.customer_language` (supabase/order-customer-language-2026-11.sql).
// Read and written on its OWN query, never inside a wider select: until the
// SQL runs the column is missing, and a missing column in a shared select
// would break the whole receipt. Before the SQL: writes are skipped (logged)
// and every order reads as English — exactly how the site behaved before.

/** Set the order's customer language. Never throws — a language must not cost the sale. */
export async function saveOrderLanguage(client: SupabaseClient, orderId: string, language: OrderLanguage): Promise<boolean> {
  const { error } = await client.from('orders').update({ customer_language: language }).eq('id', orderId);
  if (error) {
    console.error('[order-language] write skipped (run supabase/order-customer-language-2026-11.sql):', error.message);
    return false;
  }
  return true;
}

/** The order's customer language; English when unset or the column is not there yet. */
export async function loadOrderLanguage(client: SupabaseClient, orderId: string): Promise<OrderLanguage> {
  const { data, error } = await client.from('orders').select('customer_language').eq('id', orderId).maybeSingle();
  if (error || !data) return 'en';
  return normalizeOrderLanguage((data as { customer_language?: unknown }).customer_language);
}

/** Has the SQL run? (The order page hides the Language switch until it has.) */
export async function orderLanguageReady(client: SupabaseClient): Promise<boolean> {
  const { error } = await client.from('orders').select('customer_language').limit(1);
  return !error;
}

/** Listing id → Spanish title, for the listed pieces on a Spanish receipt (pick 2). Empty on any error. */
export async function loadSpanishItemTitles(
  client: SupabaseClient,
  productIds: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const ids = [...new Set(productIds.filter((id): id is string => typeof id === 'string' && id.length > 0))];
  const titles = new Map<string, string>();
  if (ids.length === 0) return titles;
  const { data, error } = await client.from('products').select('id, title_es').in('id', ids);
  if (error || !data) return titles;
  for (const row of data as Array<{ id: string; title_es: string | null }>) {
    if (row.title_es?.trim()) titles.set(String(row.id), row.title_es.trim());
  }
  return titles;
}

/** Both at once, for a Spanish receipt: the language, and (only when Spanish) the titles. */
export async function loadOrderLanguageAndTitles(
  client: SupabaseClient,
  orderId: string,
  productIds: Array<string | null | undefined>,
): Promise<{ language: OrderLanguage; spanishTitles: Map<string, string> }> {
  const language = await loadOrderLanguage(client, orderId);
  return { language, spanishTitles: language === 'es' ? await loadSpanishItemTitles(client, productIds) : new Map() };
}
