import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { resetOpenings } from '@/lib/follow-up-opening-server';
import { createServiceClient } from '@/lib/supabase/service';
import { applyOrderEdit, loadAddableProducts } from '@/lib/order-edit-server';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f-]{36}$/i;

/** Edit order → "+ Add a listed piece": the available listings, priced as of now. */
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  try {
    return NextResponse.json({ products: await loadAddableProducts(createServiceClient()) });
  } catch (loadError) {
    return NextResponse.json({ error: loadError instanceof Error ? loadError.message : 'Could not load the listings.' }, { status: 500 });
  }
}

/**
 * Save an Edit order (or a Fix name — `?source=fix_name`). The body is the
 * edit window's whole state; the server compares it with the order as saved,
 * refuses what the rules lock (lib/order-edit.ts), saves, and answers with
 * the list of changes it made.
 */
export async function POST(req: Request, { params }: Params) {
  const { user, error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  const body = await req.json().catch(() => null);
  const source = new URL(req.url).searchParams.get('source') === 'fix_name' ? 'fix_name' : 'edit';
  try {
    const service = createServiceClient();
    const result = await applyOrderEdit(service, id, body, user.email ?? null, source);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    // The items / names may have changed: the queued thank-you's AI opening is written again (2026-11-25).
    await resetOpenings(service, 'order', id);
    return NextResponse.json(result);
  } catch (saveError) {
    return NextResponse.json({ error: saveError instanceof Error ? saveError.message : 'Could not save the order.' }, { status: 500 });
  }
}
