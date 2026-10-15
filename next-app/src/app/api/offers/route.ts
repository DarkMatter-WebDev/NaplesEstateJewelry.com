import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { paypalConfigured } from '@/lib/paypal';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { createOffer } from '@/lib/offers-server';

export const runtime = 'nodejs';

/**
 * A buyer makes an offer (site shop "Make an Offer", lib/offers.ts): validates
 * it, writes a pending offer row and opens a PayPal AUTHORIZE order for the full
 * amount. The buyer's approval in PayPal only HOLDS the money — see
 * /api/offers/authorize. Nothing is charged here.
 */
export async function POST(req: Request) {
  if (!paypalConfigured()) {
    return NextResponse.json({ error: 'PayPal is not configured.' }, { status: 503 });
  }
  const ip = getClientIp(req);
  if (!(await checkRateLimit(`offer-create:${ip}`, 20, 3600))) {
    return NextResponse.json({ error: 'Too many requests. Please try again in a bit.' }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body.productId !== 'string' || !body.productId) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  try {
    const result = await createOffer(createServiceClient(), {
      productId: body.productId,
      amount: body.amount,
      shippingMethod: String(body.shippingMethod ?? 'local-pickup'),
      customer: body.customer && typeof body.customer === 'object' ? body.customer : {},
      message: body.message,
      locale: body.locale === 'es' ? 'es' : 'en',
      userId: user?.id ?? null,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code ?? null }, { status: result.status });
    }
    return NextResponse.json({ offerId: result.offerId, paypalOrderId: result.paypalOrderId });
  } catch (error) {
    console.error('Offer create error:', error);
    return NextResponse.json({ error: 'Could not start the offer.' }, { status: 500 });
  }
}
