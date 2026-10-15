import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { getBestOfferProductIds, getListingsMap } from '@/lib/ebay/store';

// Bulk product_id -> listing map (local DB read, no eBay calls). Powers the
// per-row eBay status chip in Product Admin — one fetch on mount, never one
// call per row (the exact staleness fix the Etsy chips needed).
// Each row also carries `best_offer: true` when the item allows Best Offer
// (2026-10-15) — the table shows "Live + Offer" instead of "Live".

export const runtime = 'nodejs';

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const service = createServiceClient();
  const [rows, bestOfferIds] = await Promise.all([getListingsMap(service), getBestOfferProductIds(service)]);
  const listings = Object.fromEntries(
    Object.entries(rows).map(([productId, row]) => [productId, bestOfferIds.has(productId) ? { ...row, best_offer: true } : row]),
  );
  return NextResponse.json({ listings });
}
