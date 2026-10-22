import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hoursLine } from '@/lib/business-location';
import { getStoreHours } from '@/lib/store-hours';
import { buildPaperReceipt, type PaperReceipt, type PaperReceiptOrder } from '@/lib/order-receipt-paper';

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
  'shipping_method',
  'shipping_address',
  'created_at',
  'order_items(inventory_number, title_snapshot, item_year_snapshot, metal_snapshot, purity_snapshot, gram_weight_snapshot, price_snapshot, quantity, discount, image_snapshot, created_at)',
].join(', ');

/** One order's one-page paper (`order-receipt-paper.ts`), read fresh — e.g. right after an in-store sale is recorded. */
export async function loadPaperReceipt(client: SupabaseClient, orderId: string): Promise<PaperReceipt | null> {
  const [{ data: order, error }, schedule] = await Promise.all([
    client.from('orders').select(PAPER_COLUMNS).eq('id', orderId).maybeSingle(),
    getStoreHours(),
  ]);
  if (error || !order) {
    if (error) console.error('paper receipt read error:', error);
    return null;
  }
  const typed = order as unknown as PaperReceiptOrder;
  // Lines in the order they were entered on the form.
  (typed.order_items as Array<PaperReceiptOrder['order_items'][number] & { created_at?: string }>)
    .sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));
  return buildPaperReceipt(typed, { hoursLine: hoursLine(schedule, false) });
}
