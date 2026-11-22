import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hoursLine } from '@/lib/business-location';
import { getStoreHours } from '@/lib/store-hours';
import { buildPaperReceipt, type PaperReceipt, type PaperReceiptOrder } from '@/lib/order-receipt-paper';
import { loadOrderTaxExemption } from '@/lib/tax-exempt-server';
import { SPLIT_PAYMENTS_COLUMN, TRADE_IN_COLUMN } from '@/lib/in-store-sale';
import { loadOrderLanguage, loadSpanishItemTitles } from '@/lib/order-language-server';
import type { OrderLanguage } from '@/lib/order-language';

const PAPER_COLUMNS = [
  'order_number',
  'customer_name',
  'customer_email',
  'customer_phone',
  'subtotal',
  'tax',
  'shipping_fee',
  'discount',
  'total',
  'payment_status',
  'fulfillment_status',
  'payment_method',
  SPLIT_PAYMENTS_COLUMN,
  TRADE_IN_COLUMN,
  'shipping_method',
  'shipping_address',
  'created_at',
  'order_items(product_id, inventory_number, title_snapshot, item_year_snapshot, metal_snapshot, purity_snapshot, gram_weight_snapshot, price_snapshot, quantity, discount, image_snapshot, created_at)',
].join(', ');

/**
 * One order's one-page paper (`order-receipt-paper.ts`), read fresh — e.g. right
 * after an in-store sale is recorded. In the order's customer language unless
 * `language` says otherwise (2026-11-21).
 */
export async function loadPaperReceipt(client: SupabaseClient, orderId: string, language?: OrderLanguage): Promise<PaperReceipt | null> {
  const [{ data: order, error }, schedule, taxExempt, savedLanguage] = await Promise.all([
    client.from('orders').select(PAPER_COLUMNS).eq('id', orderId).maybeSingle(),
    getStoreHours(),
    loadOrderTaxExemption(client, orderId),
    language ? Promise.resolve(language) : loadOrderLanguage(client, orderId),
  ]);
  if (error || !order) {
    if (error) console.error('paper receipt read error:', error);
    return null;
  }
  const typed = order as unknown as PaperReceiptOrder;
  // Lines in the order they were entered on the form.
  (typed.order_items as Array<PaperReceiptOrder['order_items'][number] & { created_at?: string }>)
    .sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));
  const es = savedLanguage === 'es';
  const spanishTitles = es ? await loadSpanishItemTitles(client, typed.order_items.map((item) => item.product_id)) : null;
  return buildPaperReceipt(typed, { hoursLine: hoursLine(schedule, es), taxExempt, language: savedLanguage, spanishTitles });
}
