import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { dealPhotos, reopenDealAsDraft } from '@/lib/text-alerts/deals';

/** POST: clone a sold/sent deal into a new draft (same photos, price, line; fresh message) for editing and resending. */
export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

export async function POST(_req: Request, context: Context) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await context.params;
  try {
    const deal = await reopenDealAsDraft(id);
    return NextResponse.json({ deal: { ...deal, photos: dealPhotos(createServiceClient(), deal) } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not reopen the deal.';
    return NextResponse.json({ error: message }, { status: /not found/i.test(message) ? 404 : 500 });
  }
}
