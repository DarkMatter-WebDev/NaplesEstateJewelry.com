import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { PRODUCT_IMAGE_MAX_UPLOAD_BYTES } from '@/lib/product-image-encode';
import { addDealPhoto, DealPhotoError, dealPhotos, loadDeal, makeDealPhotoMain, removeDealPhoto, type DealRow } from '@/lib/text-alerts/deals';

/**
 * The photos of a draft deal (`?dealId=`), up to five — owner, 2026-10-07.
 *   POST   raw photo bytes  → stored as WebP and ADDED (the first photo is the
 *          main picture, the rest are detail shots). One photo per request.
 *   PATCH  { main: path }   → that photo becomes the main picture.
 *   DELETE ?path=           → that photo is removed.
 * Each answers with the deal's whole photo list, the main one first. Any
 * change clears the rendered pictures (new photos need a new Preview). Same
 * size limits as product photos.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

type Loaded = { service: SupabaseClient; deal: DealRow } | { response: NextResponse };

async function loadDraft(req: Request): Promise<Loaded> {
  const dealId = new URL(req.url).searchParams.get('dealId') ?? '';
  if (!dealId) return { response: NextResponse.json({ error: 'dealId is required.' }, { status: 400 }) };
  const service = createServiceClient();
  const deal = await loadDeal(service, dealId);
  if (!deal) return { response: NextResponse.json({ error: 'Deal not found.' }, { status: 404 }) };
  if (deal.status !== 'draft') return { response: NextResponse.json({ error: 'The photos can only be changed before the deal is sent.' }, { status: 409 }) };
  return { service, deal };
}

function failure(error: unknown, fallback: string): NextResponse {
  if (error instanceof DealPhotoError) return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 500 });
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;

  const declaredLength = Number(req.headers.get('content-length') ?? 0);
  if (declaredLength > PRODUCT_IMAGE_MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: `Photo is too large (${Math.round(declaredLength / 1024 / 1024)} MB). Limit is ${PRODUCT_IMAGE_MAX_UPLOAD_BYTES / 1024 / 1024} MB.` }, { status: 413 });
  }
  const input = Buffer.from(await req.arrayBuffer());
  if (input.byteLength === 0) return NextResponse.json({ error: 'No image data received.' }, { status: 400 });
  if (input.byteLength > PRODUCT_IMAGE_MAX_UPLOAD_BYTES) return NextResponse.json({ error: 'Photo is too large to process.' }, { status: 413 });

  try {
    const loaded = await loadDraft(req);
    if ('response' in loaded) return loaded.response;
    const deal = await addDealPhoto(loaded.service, loaded.deal, input);
    return NextResponse.json({ photos: dealPhotos(loaded.service, deal) });
  } catch (error) {
    return failure(error, 'Could not store the photo.');
  }
}

export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const body = (await req.json().catch(() => null)) as { main?: unknown } | null;
  const path = typeof body?.main === 'string' ? body.main : '';
  if (!path) return NextResponse.json({ error: 'Say which photo to make the main one.' }, { status: 400 });

  try {
    const loaded = await loadDraft(req);
    if ('response' in loaded) return loaded.response;
    const deal = await makeDealPhotoMain(loaded.service, loaded.deal, path);
    return NextResponse.json({ photos: dealPhotos(loaded.service, deal) });
  } catch (error) {
    return failure(error, 'Could not change the main photo.');
  }
}

export async function DELETE(req: Request) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const path = new URL(req.url).searchParams.get('path') ?? '';
  if (!path) return NextResponse.json({ error: 'Say which photo to remove.' }, { status: 400 });

  try {
    const loaded = await loadDraft(req);
    if ('response' in loaded) return loaded.response;
    const deal = await removeDealPhoto(loaded.service, loaded.deal, path);
    return NextResponse.json({ photos: dealPhotos(loaded.service, deal) });
  } catch (error) {
    return failure(error, 'Could not remove the photo.');
  }
}
