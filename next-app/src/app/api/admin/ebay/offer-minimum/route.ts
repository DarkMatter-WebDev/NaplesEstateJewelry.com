import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { normalizeOfferMinimumMode, validateOfferMinimumInput } from '@/lib/ebay/best-offer';
import { setEbayOfferMinimum } from '@/lib/ebay/sync';

// The eBay drawer section's "Minimum offer" box (2026-11-01): one item's Best
// Offer minimum (none / $ off asking / % off asking / fixed $). Saves it on the
// product and, while "Allow offers" is on for a live or prepared offer, updates
// it on eBay at once (lib/ebay/sync.ts → setEbayOfferMinimum).

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  let body: { productId?: unknown; mode?: unknown; value?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { code: 'invalid_json', message: 'Invalid JSON body.' } }, { status: 400 });
  }
  if (typeof body.productId !== 'string' || !body.productId) {
    return NextResponse.json({ error: { code: 'missing_product_id', message: 'productId is required.' } }, { status: 400 });
  }
  const mode = normalizeOfferMinimumMode(body.mode);
  if (body.mode != null && mode == null) {
    return NextResponse.json({ error: { code: 'invalid_mode', message: 'Unknown minimum kind.' } }, { status: 400 });
  }
  const invalid = validateOfferMinimumInput(mode, body.value);
  if (invalid) {
    return NextResponse.json({ error: { code: 'invalid_value', message: invalid } }, { status: 400 });
  }
  const value = mode == null ? null : Math.round(Number(body.value) * 100) / 100;

  const result = await setEbayOfferMinimum(body.productId, mode, value);
  return NextResponse.json(result);
}
