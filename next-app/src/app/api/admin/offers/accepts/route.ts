import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBulkAcceptsOffers } from '@/lib/offers';
import { OFFERS_SQL_HINT, isMissingOffersSchemaError } from '@/lib/offers-server';

export const runtime = 'nodejs';

/**
 * Products → select → Actions → "Set all accept offers" / "Set all no offers"
 * (owner, 2026-10-15): the "Accept offers" box for many items in one write.
 * Turning it off removes the Make an Offer button; offers already open keep
 * their hold until the owner answers them (or they expire).
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const parsed = parseBulkAcceptsOffers(await req.json().catch(() => null));
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data, error } = await createServiceClient()
    .from('products')
    .update({ accepts_offers: parsed.enabled })
    .in('id', parsed.productIds)
    .select('id');
  if (error) {
    if (isMissingOffersSchemaError(error)) return NextResponse.json({ error: OFFERS_SQL_HINT }, { status: 503 });
    console.error('Bulk accepts_offers error:', error);
    return NextResponse.json({ error: 'Could not change the items.' }, { status: 500 });
  }

  const productIds = (data ?? []).map((row) => String(row.id));
  // The button lives on each item's page — refresh those and the shop.
  revalidateTag('shop-catalog', { expire: 0 });
  for (const id of productIds) {
    revalidatePath(`/shop/${id}`);
    revalidatePath(`/es/shop/${id}`);
  }
  return NextResponse.json({ ok: true, enabled: parsed.enabled, updated: productIds.length, productIds });
}
