import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { normalizeHeardAbout } from '@/lib/order-heard-about';

/**
 * POST { orderId, orderNumber, heardAbout, heardAboutOther? } — the buyer's
 * optional "How did you hear about us?" answer from the Order Received screen.
 *
 * Guest-safe without sign-in because the order's id (a UUID the capture route
 * just handed this browser) AND its order number must both match, the order
 * must be paid, and the answer is write-once (`heard_about is null`), so a
 * stranger can neither guess an order nor overwrite a buyer's answer.
 * One generic 404 covers "no such order" and "already answered".
 */
export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const ip = getClientIp(req);
  if (!(await checkRateLimit(`order-heard-about:${ip}`, 20, 3600))) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : '';
  const orderNumber = typeof body?.orderNumber === 'string' ? body.orderNumber.trim() : '';
  if (!UUID_RE.test(orderId) || !orderNumber) {
    return NextResponse.json({ error: 'Missing order.' }, { status: 400 });
  }
  const answer = normalizeHeardAbout(body?.heardAbout, body?.heardAboutOther);
  if (!answer) {
    return NextResponse.json({ error: 'Pick an answer.' }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from('orders')
    .update({ heard_about: answer.heardAbout, heard_about_other: answer.heardAboutOther })
    .eq('id', orderId)
    .eq('order_number', orderNumber)
    .eq('payment_status', 'paid')
    .is('heard_about', null)
    .select('id');
  if (error) {
    console.error('heard-about save error:', error.message);
    return NextResponse.json({ error: 'Could not save.' }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
