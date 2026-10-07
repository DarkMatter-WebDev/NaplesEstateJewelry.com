import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { buildDealMedia, loadDeal } from '@/lib/text-alerts/deals';

/**
 * POST { dealId } → renders (and stores) every picture of the message — the
 * main one with the price first, then the detail shots — and returns their
 * public URLs and sizes. The same pictures are what the send uses, so what
 * the owner previews is exactly what goes out.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const body = await req.json().catch(() => null);
  const dealId = typeof body?.dealId === 'string' ? body.dealId : '';
  if (!dealId) return NextResponse.json({ error: 'dealId is required.' }, { status: 400 });

  const service = createServiceClient();
  const deal = await loadDeal(service, dealId);
  if (!deal) return NextResponse.json({ error: 'Deal not found.' }, { status: 404 });
  try {
    const media = await buildDealMedia(service, deal);
    return NextResponse.json({
      pictures: media.pictures.map(({ url, bytes, main }) => ({ url, bytes, main })),
      totalBytes: media.totalBytes,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not render the picture.' }, { status: 500 });
  }
}
