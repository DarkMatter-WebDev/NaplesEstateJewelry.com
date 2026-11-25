import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { isThankYouNoteKind, normalizeThankYouNote } from '@/lib/thank-you-note';
import { saveThankYouNote } from '@/lib/thank-you-note-server';
import { resetOpenings } from '@/lib/follow-up-opening-server';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Save a buy receipt's / an order's "Note for the thank-you email" (internal
 * only — lib/thank-you-note.ts). Its queued thank-you's AI opening is then
 * cleared so the next sweep writes it again with the note.
 */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;

  const body = (await req.json().catch(() => null)) as { kind?: unknown; id?: unknown; note?: unknown } | null;
  if (!isThankYouNoteKind(body?.kind) || typeof body?.id !== 'string' || !UUID.test(body.id)) {
    return NextResponse.json({ error: 'Unknown receipt or order.' }, { status: 400 });
  }
  const note = normalizeThankYouNote(body.note);
  if ('error' in note) return NextResponse.json({ error: note.error }, { status: 400 });

  const service = createServiceClient();
  // Buy receipts: the signed-in admin's client (no service-role write on that table, on purpose).
  const client = body.kind === 'buy_receipt' ? admin.supabase : service;
  const saved = await saveThankYouNote(client, body.kind, body.id, note.value);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });

  await resetOpenings(service, body.kind, body.id);
  return NextResponse.json({ note: saved.note });
}
