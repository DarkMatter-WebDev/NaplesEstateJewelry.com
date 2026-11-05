import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { sweepOrderTracking } from '@/lib/order-tracking-server';

/**
 * Hourly delivery-tracking sweep (pg_cron `nej-order-tracking-sweep`,
 * supabase/order-tracking-2026-11.sql): registers shipped packages that have
 * no EasyPost tracker yet and re-reads every package still on its way, so a
 * missed webhook never means a missed out-for-delivery / delivered email.
 * Guarded by the TEXT_ALERTS_CRON_SECRET already in Vault and on Netlify, in
 * `x-cron-secret` — the same shape as the offers sweep.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const secret = process.env.TEXT_ALERTS_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'TEXT_ALERTS_CRON_SECRET is not configured.' }, { status: 503 });
  }
  if (req.headers.get('x-cron-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  try {
    return NextResponse.json(await sweepOrderTracking(createServiceClient()));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Tracking sweep failed.' },
      { status: 500 },
    );
  }
}
