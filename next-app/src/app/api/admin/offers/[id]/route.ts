import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { acceptOffer, counterOffer, declineOffer, resendCounter } from '@/lib/offers-server';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

/**
 * The owner's answer to an offer: `accept` (charge the hold → paid order, item
 * SOLD), `decline` (release the hold), `counter` (release the hold, email a
 * private Buy-now link) or `resend-counter` (a fresh link for a live counter).
 */
export async function POST(req: Request, context: Context) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  const action = body?.action;
  const service = createServiceClient();
  try {
    const result = action === 'accept'
      ? await acceptOffer(service, id)
      : action === 'decline'
        ? await declineOffer(service, id, { note: body?.note })
        : action === 'counter'
          ? await counterOffer(service, id, { amount: body?.amount, note: body?.note })
          : action === 'resend-counter'
            ? await resendCounter(service, id)
            : null;
    if (!result) return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    if (!result.ok) return NextResponse.json({ error: result.error, code: result.code ?? null }, { status: result.status });
    return NextResponse.json(result);
  } catch (error) {
    console.error(`Admin offer ${String(action)} error:`, error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Offer action failed.' }, { status: 500 });
  }
}
