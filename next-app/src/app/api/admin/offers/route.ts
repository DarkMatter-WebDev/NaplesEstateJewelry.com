import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { OFFER_FILTERS, type OfferFilter } from '@/lib/offers';
import { OFFERS_SQL_HINT, countOpenOffers, isMissingOffersSchemaError, listOffersForAdmin } from '@/lib/offers-server';

export const runtime = 'nodejs';

/**
 * Admin → Offers. `?counts=1` → open offers in total and per product (the menu
 * badge and the product table's "2 open"); otherwise the list for `?filter=`.
 */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const url = new URL(req.url);
  const service = createServiceClient();
  try {
    if (url.searchParams.get('counts') === '1') {
      // Which products have "Accept offers" on: read here rather than in the
      // admin's product summary query, so that query (and the Products page)
      // works the same before the SQL has added the column.
      const { data: flagged, error: flagError } = await service.from('products').select('id').eq('accepts_offers', true);
      const acceptsOffers = flagError ? [] : (flagged ?? []).map((row) => String(row.id));
      return NextResponse.json({ ...(await countOpenOffers(service)), acceptsOffers });
    }
    const raw = url.searchParams.get('filter') ?? 'open';
    const filter: OfferFilter = (OFFER_FILTERS as readonly string[]).includes(raw) ? raw as OfferFilter : 'open';
    return NextResponse.json({ offers: await listOffersForAdmin(service, filter) });
  } catch (error) {
    if (isMissingOffersSchemaError(error as { message?: string })) {
      // Before the SQL runs: an empty, explained answer rather than an error,
      // so the menu badge and the table column stay quiet.
      return NextResponse.json({ setupNeeded: true, message: OFFERS_SQL_HINT, total: 0, byProduct: {}, offers: [] });
    }
    console.error('Admin offers read error:', error);
    return NextResponse.json({ error: 'Could not load offers.' }, { status: 500 });
  }
}
