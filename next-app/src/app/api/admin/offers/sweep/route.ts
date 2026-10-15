import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { sweepOffers } from '@/lib/offers-server';

/**
 * 15-minute offers sweep (pg_cron `nej-offers-sweep`, supabase/make-offer-2026-10.sql):
 * expires offers past 72 hours and releases their holds, closes offers on items
 * that sold another way, expires counter links, and retries releases and emails
 * that failed. Guarded by the TEXT_ALERTS_CRON_SECRET already in Vault and on
 * Netlify, in `x-cron-secret` — the same shape as the text-alerts sweep.
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
    return NextResponse.json(await sweepOffers(createServiceClient()));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Offers sweep failed.' },
      { status: 500 },
    );
  }
}
