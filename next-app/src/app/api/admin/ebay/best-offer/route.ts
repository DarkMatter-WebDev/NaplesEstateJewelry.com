import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { setEbayBestOffer } from '@/lib/ebay/sync';

// The eBay drawer section's "Allow offers" box (2026-10-14): one item's Best
// Offer on or off. Saves the choice on the product and, for a live or prepared
// offer, updates it on eBay at once (lib/ebay/sync.ts → setEbayBestOffer).
// Also called once per item by the Products list's bulk "Best Offer on / off".

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  let body: { productId?: unknown; enabled?: unknown; skipIfUnchanged?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { code: 'invalid_json', message: 'Invalid JSON body.' } }, { status: 400 });
  }
  if (typeof body.productId !== 'string' || !body.productId) {
    return NextResponse.json({ error: { code: 'missing_product_id', message: 'productId is required.' } }, { status: 400 });
  }
  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: { code: 'invalid_enabled', message: 'enabled must be true or false.' } }, { status: 400 });
  }

  // The bulk run (EbayBestOfferBulkModal) sends skipIfUnchanged: true; the drawer box does not.
  const result = await setEbayBestOffer(body.productId, body.enabled, { skipIfUnchanged: body.skipIfUnchanged === true });
  return NextResponse.json(result);
}
