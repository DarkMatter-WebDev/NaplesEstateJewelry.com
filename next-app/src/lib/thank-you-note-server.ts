import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { THANK_YOU_NOTES_SQL_FILE, type ThankYouNoteKind, type ThankYouNoteState } from '@/lib/thank-you-note';

// `buy_receipts.thank_you_note` / `orders.thank_you_note` — own queries only
// (see lib/thank-you-note.ts for why). Buy receipts go through the signed-in
// admin's client (the table has no service-role write grant on purpose);
// orders through the service client, like every other admin order write.

const TABLE: Record<ThankYouNoteKind, 'buy_receipts' | 'orders'> = { buy_receipt: 'buy_receipts', order: 'orders' };

/** The note, and whether its column exists yet (false before the SQL, or when the read fails). */
export async function loadThankYouNote(client: SupabaseClient, kind: ThankYouNoteKind, id: string): Promise<ThankYouNoteState> {
  try {
    const { data, error } = await client.from(TABLE[kind]).select('thank_you_note').eq('id', id).maybeSingle();
    if (error) return { ready: false, note: '' };
    return { ready: true, note: (data?.thank_you_note as string | null | undefined) ?? '' };
  } catch {
    return { ready: false, note: '' };
  }
}

export async function saveThankYouNote(
  client: SupabaseClient,
  kind: ThankYouNoteKind,
  id: string,
  note: string | null,
): Promise<{ ok: true; note: string } | { ok: false; error: string; status: number }> {
  const table = TABLE[kind];
  const statusColumns = kind === 'buy_receipt' ? 'id, status' : 'id, deleted_at';
  const { data: current, error: readError } = await client.from(table).select(statusColumns).eq('id', id).maybeSingle();
  if (readError) return { ok: false, error: readError.message, status: 500 };
  if (!current) return { ok: false, error: kind === 'buy_receipt' ? 'Receipt not found.' : 'Order not found.', status: 404 };
  const row = current as { status?: string; deleted_at?: string | null };
  if (kind === 'buy_receipt' && row.status === 'void') return { ok: false, error: 'This receipt is void.', status: 409 };

  const { data, error } = await client.from(table).update({ thank_you_note: note }).eq('id', id).select('thank_you_note').maybeSingle();
  if (error) {
    const missing = /thank_you_note/.test(error.message) || error.code === '42703' || error.code === 'PGRST204';
    return { ok: false, error: missing ? `The note box needs ${THANK_YOU_NOTES_SQL_FILE} — run it in Supabase first.` : error.message, status: missing ? 409 : 500 };
  }
  return { ok: true, note: (data?.thank_you_note as string | null | undefined) ?? '' };
}
