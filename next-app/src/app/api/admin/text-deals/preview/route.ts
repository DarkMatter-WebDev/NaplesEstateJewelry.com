import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { buildDealMedia, dealHasSpanishColumns, ensureDealSpanishWords, loadDeal } from '@/lib/text-alerts/deals';

/**
 * POST { dealId, retranslate? } → renders (and stores) every picture of the
 * message — the main one with the price first, then the detail shots — and
 * returns their public URLs and sizes. The same pictures are what the send
 * uses, so what the owner previews is exactly what goes out.
 *
 * Spanish (2026-11-22): first fills the Spanish boxes (translated when empty,
 * or when the English changed and the owner had not corrected the Spanish;
 * `retranslate: true` = "Translate again"), then renders the Spanish pictures
 * beside the English ones. A failed translation never fails the Preview — it
 * comes back in `spanish.error`, and the Spanish falls back to English words.
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
  const loaded = await loadDeal(service, dealId);
  if (!loaded) return NextResponse.json({ error: 'Deal not found.' }, { status: 404 });
  try {
    const spanish = await ensureDealSpanishWords(service, loaded, { force: body?.retranslate === true });
    const deal = spanish.deal;
    const media = await buildDealMedia(service, deal);
    return NextResponse.json({
      pictures: media.pictures.map(({ url, bytes, main }) => ({ url, bytes, main })),
      totalBytes: media.totalBytes,
      picturesEs: media.picturesEs?.map(({ url, bytes, main }) => ({ url, bytes, main })) ?? null,
      totalBytesEs: media.totalBytesEs,
      spanish: dealHasSpanishColumns(deal)
        ? {
            title_es: deal.title_es ?? '',
            size_text_es: deal.size_text_es ?? '',
            description_es: deal.description_es ?? '',
            message_es: deal.message_es ?? '',
            translated: spanish.translated,
            stale: spanish.stale,
            error: spanish.error,
          }
        : null,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not render the picture.' }, { status: 500 });
  }
}
