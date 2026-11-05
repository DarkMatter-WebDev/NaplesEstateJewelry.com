import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { easyPostWebhookSecret, retrieveTracker, verifyEasyPostSignature } from '@/lib/easypost';
import { applyTrackerUpdate } from '@/lib/order-tracking-server';

/**
 * EasyPost `tracker.updated` webhook (registered from Admin → Settings →
 * Delivery Tracking → Connect). Fails CLOSED without EASYPOST_WEBHOOK_SECRET
 * or a valid `X-Hmac-Signature`.
 *
 * ⛔ The body only says WHICH tracker changed. The tracker itself is re-read
 * from EasyPost with our own key before anything is stored or emailed, so a
 * replayed or forged event can at most trigger a harmless re-check.
 * EasyPost wants a 2xx within seven seconds and retries a failure up to six
 * times; the hourly sweep is the backstop either way.
 */
export const runtime = 'nodejs';
export const maxDuration = 20;

export async function POST(req: Request) {
  const secret = easyPostWebhookSecret();
  if (!secret) {
    return NextResponse.json({ error: 'EASYPOST_WEBHOOK_SECRET is not configured.' }, { status: 503 });
  }

  const rawBody = await req.text();
  if (!verifyEasyPostSignature(rawBody, req.headers.get('x-hmac-signature'), secret)) {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
  }

  let event: { object?: string; description?: string; result?: { id?: string; object?: string } } | null = null;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const trackerId = event?.result?.id;
  if (event?.object !== 'Event' || !String(event.description ?? '').startsWith('tracker.') || !trackerId) {
    return NextResponse.json({ ok: true, ignored: 'Not a tracker event.' });
  }

  const service = createServiceClient();
  const { data: row, error: rowError } = await service
    .from('order_tracking')
    .select('order_id')
    .eq('easypost_tracker_id', trackerId)
    .maybeSingle();
  if (rowError) {
    return NextResponse.json({ error: rowError.message }, { status: 500 });
  }
  if (!row) return NextResponse.json({ ok: true, ignored: 'Tracker not linked to an order.' });

  try {
    const tracker = await retrieveTracker(trackerId);
    const result = await applyTrackerUpdate(service, tracker);
    return NextResponse.json(result);
  } catch (error) {
    // 500 → EasyPost retries; the hourly sweep catches it regardless.
    console.error('[easypost webhook] update failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Update failed.' }, { status: 500 });
  }
}
