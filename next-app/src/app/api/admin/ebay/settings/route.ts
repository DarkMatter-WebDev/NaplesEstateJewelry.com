import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { updateConnection, type EbayConnectionRow } from '@/lib/ebay/store';

export const runtime = 'nodejs';

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function PUT(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { code: 'invalid_json', message: 'Invalid JSON body.' } }, { status: 400 });
  }

  const patch: Partial<EbayConnectionRow> = {};

  if ('fulfillmentPolicyId' in body) patch.fulfillment_policy_id = (body.fulfillmentPolicyId as string) || null;
  if ('expressFulfillmentPolicyId' in body) patch.express_fulfillment_policy_id = (body.expressFulfillmentPolicyId as string) || null;
  if ('highValueShippingThreshold' in body) {
    const threshold = num(body.highValueShippingThreshold);
    if (threshold == null || threshold < 0) {
      return NextResponse.json(
        { error: { code: 'invalid_threshold', message: 'High-value shipping threshold must be a non-negative number.' } },
        { status: 400 },
      );
    }
    patch.high_value_shipping_threshold = threshold;
  }
  if ('paymentPolicyId' in body) patch.payment_policy_id = (body.paymentPolicyId as string) || null;
  if ('returnPolicyId' in body) patch.return_policy_id = (body.returnPolicyId as string) || null;
  if ('merchantLocationKey' in body) patch.merchant_location_key = (body.merchantLocationKey as string) || null;
  if ('autoPublish' in body) patch.auto_publish = Boolean(body.autoPublish);
  if ('soldHandling' in body) {
    if (body.soldHandling !== 'quantity_zero' && body.soldHandling !== 'withdraw') {
      return NextResponse.json(
        { error: { code: 'invalid_sold_handling', message: 'soldHandling must be "quantity_zero" or "withdraw".' } },
        { status: 400 },
      );
    }
    patch.sold_handling = body.soldHandling;
  }
  // 'bestOfferEnabled' (account-wide) is retired 2026-10-14 — Best Offer is per
  // item (products.ebay_best_offer, /api/admin/ebay/best-offer); it was never sent to eBay.
  if ('pricePushEnabled' in body) patch.price_push_enabled = Boolean(body.pricePushEnabled);
  if ('autoMarkSold' in body) patch.auto_mark_sold = Boolean(body.autoMarkSold);
  if ('pricePushThresholdPct' in body) {
    const pct = num(body.pricePushThresholdPct);
    if (pct == null || pct < 0) {
      return NextResponse.json({ error: { code: 'invalid_threshold', message: 'Price push threshold must be a non-negative number.' } }, { status: 400 });
    }
    patch.price_push_threshold_pct = pct;
  }
  if ('priceMarkupPct' in body) {
    const pct = num(body.priceMarkupPct);
    if (pct == null || pct < 0) {
      return NextResponse.json({ error: { code: 'invalid_markup', message: 'Markup percent must be a non-negative number.' } }, { status: 400 });
    }
    patch.price_markup_pct = pct;
  }

  const service = createServiceClient();
  try {
    await updateConnection(service, patch);
  } catch (err) {
    return NextResponse.json(
      { error: { code: 'update_failed', message: err instanceof Error ? err.message : 'Could not save settings.' } },
      { status: 500 },
    );
  }
  return NextResponse.json({ success: true });
}
