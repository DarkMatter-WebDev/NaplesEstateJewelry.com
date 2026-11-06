import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { adminUpdateProductStatus } from '@/app/actions/admin-products';
import {
  acceptOffer,
  closeOffersForProducts,
  counterOffer,
  declineOffer,
  resendCounter,
  sendAvailabilityLink,
} from '@/lib/offers-server';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

/**
 * The owner's answer to an offer: `accept` (charge the hold → paid order, item
 * SOLD), `decline` (release the hold), `counter` (release the hold, email a
 * private Buy-now link) or `resend-counter` (a fresh link for a live counter).
 *
 * Check Availability (2026-11-05): `available` emails the private Buy link at
 * today's price (48 hours); `unavailable` is a decline with the "this piece
 * has sold" email and, when `markSold` is ticked, marks the item Sold the
 * owner's normal way (adminUpdateProductStatus) and closes any other request
 * on it at once.
 */
export async function POST(req: Request, context: Context) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  const action = body?.action;
  const service = createServiceClient();
  try {
    if (action === 'unavailable') {
      const result = await declineOffer(service, id, { note: body?.note });
      if (!result.ok) return NextResponse.json({ error: result.error, code: result.code ?? null }, { status: result.status });
      let markedSold = false;
      let markSoldError: string | null = null;
      if (body?.markSold === true) {
        const sold = await adminUpdateProductStatus(result.offer.product_id, 'sold');
        if (sold.error) {
          markSoldError = sold.error;
        } else {
          markedSold = true;
          await closeOffersForProducts(service, [result.offer.product_id]).catch((error) => {
            console.error('Availability close-others error:', error);
          });
        }
      }
      return NextResponse.json({ ...result, markedSold, markSoldError });
    }
    const result = action === 'accept'
      ? await acceptOffer(service, id)
      : action === 'decline'
        ? await declineOffer(service, id, { note: body?.note })
        : action === 'counter'
          ? await counterOffer(service, id, { amount: body?.amount, note: body?.note })
          : action === 'resend-counter'
            ? await resendCounter(service, id)
            : action === 'available'
              ? await sendAvailabilityLink(service, id, { note: body?.note })
              : null;
    if (!result) return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    if (!result.ok) return NextResponse.json({ error: result.error, code: result.code ?? null }, { status: result.status });
    return NextResponse.json(result);
  } catch (error) {
    console.error(`Admin offer ${String(action)} error:`, error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Offer action failed.' }, { status: 500 });
  }
}
