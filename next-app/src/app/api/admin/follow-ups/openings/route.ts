import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { resetOpenings } from '@/lib/follow-up-opening-server';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * A buy receipt was edited (its items may have changed): its queued
 * thank-you's AI opening is cleared so the sweep writes it again. Called by the
 * receipt page after a save — the buy-receipt routes themselves never use the
 * service role. Touches `follow_up_messages` only. An opening the owner typed stays.
 */
export async function POST(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;
  const body = (await req.json().catch(() => null)) as { kind?: unknown; id?: unknown } | null;
  if ((body?.kind !== 'buy_receipt' && body?.kind !== 'order') || typeof body.id !== 'string' || !UUID.test(body.id)) {
    return NextResponse.json({ error: 'Unknown receipt or order.' }, { status: 400 });
  }
  await resetOpenings(createServiceClient(), body.kind, body.id);
  return NextResponse.json({ ok: true });
}
