import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { loadFollowUpItems } from '@/lib/follow-up-items-server';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f-]{36}$/i;

/** Follow-ups → Upcoming → "View items": the original item lines behind one thank-you (read-only). */
export async function GET(_req: Request, { params }: Params) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Unknown email.' }, { status: 404 });
  try {
    const view = await loadFollowUpItems(createServiceClient(), id);
    if (!view) return NextResponse.json({ error: 'Unknown email.' }, { status: 404 });
    return NextResponse.json(view, { headers: { 'Cache-Control': 'no-store' } });
  } catch (loadError) {
    return NextResponse.json({ error: loadError instanceof Error ? loadError.message : 'Could not load the items.' }, { status: 500 });
  }
}
