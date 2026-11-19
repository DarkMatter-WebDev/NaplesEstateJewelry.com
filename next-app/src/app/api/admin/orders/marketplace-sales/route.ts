import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import {
  MARKETPLACE_HIDE_ACTIONS,
  MAX_MARKETPLACE_HIDE_KEYS,
  parseMarketplaceRecordKey,
  type MarketplaceHideAction,
} from '@/lib/marketplace-sale-records';
import { setMarketplaceSalesHidden } from '@/lib/marketplace-sale-records-server';

export const runtime = 'nodejs';

// Admin → Orders: Delete / Restore / Delete Forever for eBay / Etsy sale
// records (owner, 2026-11-18). Body: { action, keys: ["ebay:<order id>", …] }.
// ⛔ Hides only — never erases a row, never touches a product or the
// marketplace order (lib/marketplace-sale-records-server.ts).
export async function POST(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json().catch(() => null) as { action?: unknown; keys?: unknown } | null;
  const action = body?.action;
  if (typeof action !== 'string' || !(MARKETPLACE_HIDE_ACTIONS as readonly string[]).includes(action)) {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }
  const rawKeys = Array.isArray(body?.keys) ? body.keys : [];
  if (rawKeys.length === 0) {
    return NextResponse.json({ error: 'No sales selected.' }, { status: 400 });
  }
  if (rawKeys.length > MAX_MARKETPLACE_HIDE_KEYS) {
    return NextResponse.json({ error: `Select at most ${MAX_MARKETPLACE_HIDE_KEYS} sales at a time.` }, { status: 400 });
  }
  const targets = rawKeys.map(parseMarketplaceRecordKey);
  if (targets.some((t) => t === null)) {
    return NextResponse.json({ error: 'Unknown sale.' }, { status: 400 });
  }

  const result = await setMarketplaceSalesHidden(
    action as MarketplaceHideAction,
    targets as NonNullable<(typeof targets)[number]>[],
  );
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ success: true, changed: result.changed });
}
