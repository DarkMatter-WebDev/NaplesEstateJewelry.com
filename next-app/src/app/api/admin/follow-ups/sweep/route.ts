import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { sweepFollowUps } from '@/lib/follow-ups-server';

/**
 * Admin → Follow-ups, every 15 minutes (pg_cron `nej-follow-ups-sweep`,
 * supabase/follow-ups-2026-11.sql): queue thank-yous for new buy receipts and
 * paid orders, move waiting buyers along once picked up / delivered, then send
 * what is due (unless Pause all is on). Guarded by the TEXT_ALERTS_CRON_SECRET
 * already in Vault and on Netlify, in `x-cron-secret` — same as the tracking sweep.
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
    return NextResponse.json(await sweepFollowUps(createServiceClient()));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Follow-ups sweep failed.' },
      { status: 500 },
    );
  }
}
