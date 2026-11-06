import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { createAvailabilityRequest } from '@/lib/offers-server';

export const runtime = 'nodejs';

/**
 * Check Availability (owner, 2026-11-05, mockup 1): a buyer asks whether a
 * piece another dealer holds is still available. Name + email (phone and a
 * message optional). NO payment — the owner answers on Admin → Offers with a
 * private Buy link or a "this piece has sold" email (lib/offers-server.ts).
 */
export async function POST(req: Request) {
  const ip = getClientIp(req);
  if (!(await checkRateLimit(`availability-create:${ip}`, 10, 3600))) {
    return NextResponse.json({ error: 'Too many requests. Please try again in a bit, or call (239) 404-8505.' }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body.productId !== 'string' || !body.productId) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  try {
    const result = await createAvailabilityRequest(createServiceClient(), {
      productId: body.productId,
      customer: body.customer && typeof body.customer === 'object' ? body.customer : {},
      message: body.message,
      locale: body.locale === 'es' ? 'es' : 'en',
      userId: user?.id ?? null,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code ?? null }, { status: result.status });
    }
    return NextResponse.json({ ok: true, requestId: result.offerId });
  } catch (error) {
    console.error('Availability request error:', error);
    return NextResponse.json({ error: 'Could not send the request. Please call (239) 404-8505.' }, { status: 500 });
  }
}
