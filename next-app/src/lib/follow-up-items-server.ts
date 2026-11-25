import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { openingInputFor, type RowForOpening } from '@/lib/follow-up-opening-server';
import type { FollowUpItemLine, FollowUpItemsView } from '@/lib/follow-up-items';

/**
 * Follow-ups → "View items": the original item lines behind one queued
 * thank-you. Runs with the service client, so a buy receipt is read ONLY
 * through the columns granted to service_role (`follow-ups-receipts-grant` +
 * `follow-ups-ai-openings` SQL; `follow-ups.test.ts` scans this file) — never
 * ID, address or payment data.
 */

const MESSAGES = 'follow_up_messages';

function num(value: unknown): number | null {
  const n = Number(value);
  return value === null || value === undefined || value === '' || !Number.isFinite(n) ? null : n;
}

const ORDER_STATE: Record<string, string> = {
  shipped: 'Shipped',
  picked_up: 'Picked up',
  completed: 'Completed',
};

export async function loadFollowUpItems(client: SupabaseClient, id: string): Promise<FollowUpItemsView | null> {
  const { data: message, error } = await client
    .from(MESSAGES)
    .select('id, audience, language, name, source_type, source_id, source_ref')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!message) return null;
  return loadItemsForSource(client, message as RowForOpening & { source_ref: string | null });
}

/**
 * The item lines of one receipt / order — for a queued thank-you (Upcoming →
 * View items) or for the visit People → "Send a thank-you" is about to thank,
 * before any row exists (2026-11-25 (15)).
 */
export async function loadItemsForSource(client: SupabaseClient, row: RowForOpening & { source_ref: string | null }): Promise<FollowUpItemsView> {
  // What the AI reads (item names cleaned + the owner's note) — the same input the opening is written from.
  const input = await openingInputFor(client, row).catch(() => null);

  if (row.source_type === 'buy_receipt') {
    const { data: receipt, error: receiptError } = await client
      .from('buy_receipts')
      .select('receipt_number, seller_name, total, status, created_at, items')
      .eq('id', row.source_id)
      .maybeSingle();
    if (receiptError) throw new Error(`Could not read the buy receipt: ${receiptError.message}`);
    const items = Array.isArray(receipt?.items) ? (receipt.items as Array<{ qty?: unknown; description?: unknown; amount?: unknown }>) : [];
    const lines: FollowUpItemLine[] = items.map((item) => ({
      qty: num(item.qty) ?? 1,
      description: String(item.description ?? '').trim() || '—',
      amount: num(item.amount),
    }));
    return {
      kind: 'receipt',
      ref: (receipt?.receipt_number as string | null) ?? row.source_ref ?? 'Buy receipt',
      name: (receipt?.seller_name as string | null) ?? row.name,
      at: (receipt?.created_at as string | null) ?? null,
      state: receipt?.status === 'void' ? 'Voided' : null,
      lines,
      total: num(receipt?.total),
      note: input?.note ?? null,
      aiPieces: input?.pieces ?? [],
    };
  }

  const [{ data: order, error: orderError }, { data: items, error: itemsError }] = await Promise.all([
    client.from('orders').select('order_number, customer_name, total, fulfillment_status, created_at').eq('id', row.source_id).maybeSingle(),
    client.from('order_items').select('title_snapshot, price_snapshot, quantity').eq('order_id', row.source_id),
  ]);
  if (orderError) throw new Error(`Could not read the order: ${orderError.message}`);
  if (itemsError) throw new Error(`Could not read the order items: ${itemsError.message}`);
  const lines: FollowUpItemLine[] = ((items ?? []) as Array<{ title_snapshot: string | null; price_snapshot: unknown; quantity: unknown }>).map((item) => {
    const qty = num(item.quantity);
    return { qty: qty !== null && qty !== 1 ? qty : null, description: (item.title_snapshot ?? '').trim() || '—', amount: num(item.price_snapshot) };
  });
  const fulfillment = String(order?.fulfillment_status ?? '');
  return {
    kind: 'order',
    ref: (order?.order_number as string | null) ?? row.source_ref ?? 'Order',
    name: (order?.customer_name as string | null) ?? row.name,
    at: (order?.created_at as string | null) ?? null,
    state: ORDER_STATE[fulfillment] ?? null,
    lines,
    total: num(order?.total),
    note: input?.note ?? null,
    aiPieces: input?.pieces ?? [],
  };
}
