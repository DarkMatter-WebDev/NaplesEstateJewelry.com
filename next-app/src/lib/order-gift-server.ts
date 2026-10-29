import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { giftNotesFallback, type OrderGift } from '@/lib/order-gift';

/**
 * Write (or clear) the gift fields on an order. Runs on BOTH create-order
 * paths — a resumed order may have been a gift on the first try and not now.
 *
 * Until `supabase/order-gift-2026-10.sql` runs the columns are missing: a
 * non-gift order ignores that, and a gift order writes its recipient and
 * message into `customer_notes` instead, so the owner never loses it. Never
 * throws — a gift note must not cost the sale.
 */
export async function saveOrderGift(service: SupabaseClient, orderId: string, gift: OrderGift | null): Promise<void> {
  const { error } = await service
    .from('orders')
    .update({
      is_gift: Boolean(gift),
      gift_recipient_name: gift?.recipientName ?? null,
      gift_message: gift?.message ?? null,
    })
    .eq('id', orderId);
  if (!error || !gift) return;

  console.error('[gift] gift columns write failed, using customer notes:', error.message);
  const { data } = await service.from('orders').select('customer_notes').eq('id', orderId).maybeSingle();
  const existing = (data as { customer_notes?: string | null } | null)?.customer_notes ?? null;
  if (existing?.startsWith('🎁 GIFT')) return; // already noted on an earlier try
  const { error: notesError } = await service
    .from('orders')
    .update({ customer_notes: giftNotesFallback(gift, existing) })
    .eq('id', orderId);
  if (notesError) console.error('[gift] customer notes fallback failed:', notesError.message);
}

/** The order's gift, or null (not a gift, or the columns are not there yet). */
export async function loadOrderGift(client: SupabaseClient, orderId: string): Promise<OrderGift | null> {
  const { data, error } = await client
    .from('orders')
    .select('is_gift, gift_recipient_name, gift_message')
    .eq('id', orderId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { is_gift?: boolean | null; gift_recipient_name?: string | null; gift_message?: string | null };
  return row.is_gift ? { recipientName: row.gift_recipient_name ?? null, message: row.gift_message ?? null } : null;
}
