import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { paypalConfigured } from '@/lib/paypal';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { authorizeOffer } from '@/lib/offers-server';
import { formatOfferDeadline } from '@/lib/offers';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * The buyer approved the PayPal window for an offer: turn the approval into a
 * HOLD (PayPal authorization) and open the offer for the owner. Idempotent — a
 * retry for an offer that is already open answers with the same result.
 */
export async function POST(req: Request) {
  if (!paypalConfigured()) {
    return NextResponse.json({ error: 'PayPal is not configured.' }, { status: 503 });
  }
  const ip = getClientIp(req);
  if (!(await checkRateLimit(`offer-authorize:${ip}`, 30, 3600))) {
    return NextResponse.json({ error: 'Too many requests. Please try again in a bit.' }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const paypalOrderId = body && typeof body.paypalOrderId === 'string' ? body.paypalOrderId : null;
  if (!paypalOrderId) return NextResponse.json({ error: 'Missing paypalOrderId' }, { status: 400 });
  // Card boxes (2026-10-29) get a 3-D Secure check before the hold; a declined card answers code `card_declined`.
  const paymentMethod = body.paymentMethod === 'card' ? 'card' : 'paypal';

  try {
    const result = await authorizeOffer(createServiceClient(), paypalOrderId, { paymentMethod });
    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code ?? null }, { status: result.status });
    }
    const isEs = result.offer.locale === 'es';
    return NextResponse.json({
      success: true,
      total: result.offer.total,
      amount: result.offer.amount,
      expiresAt: result.offer.expires_at,
      deadline: formatOfferDeadline(result.offer.expires_at, isEs),
    });
  } catch (error) {
    console.error('Offer authorize error:', error);
    return NextResponse.json({ error: 'PayPal did not confirm the hold.' }, { status: 502 });
  }
}
