import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import {
  fetchShopVisibilitySettings,
  saveShowSoldItems,
  saveHideSoldItemPrices,
  fetchSpecialPriceDefault,
  saveSpecialPriceDefault,
  normalizeSpecialPriceDefaultBasis,
} from '@/lib/shop-settings';

export const runtime = 'nodejs';

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const service = createServiceClient();
    const [visibility, specialPriceDefault] = await Promise.all([
      fetchShopVisibilitySettings(service),
      fetchSpecialPriceDefault(service),
    ]);
    return NextResponse.json({ ...visibility, specialPriceDefault });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load shop settings.' },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'A settings patch is required.' }, { status: 400 });
  }

  const service = createServiceClient();
  let touched = false;

  try {
    if (typeof body.showSoldItems === 'boolean') {
      await saveShowSoldItems(service, body.showSoldItems);
      touched = true;
    }

    if (typeof body.hideSoldItemPrices === 'boolean') {
      await saveHideSoldItemPrices(service, body.hideSoldItemPrices);
      touched = true;
    }

    // Site-wide trade-in default — any of its fields present means "update it".
    if (
      'specialPriceDefaultEnabled' in body ||
      'specialPriceDefaultPercent' in body ||
      'specialPriceDefaultBasis' in body ||
      'specialPriceDefaultDiscountPercent' in body
    ) {
      const enabled = Boolean(body.specialPriceDefaultEnabled);
      const basis = normalizeSpecialPriceDefaultBasis(body.specialPriceDefaultBasis);
      const raw = body.specialPriceDefaultPercent;
      let percent: number | null = null;
      if (raw !== null && raw !== undefined && raw !== '') {
        const n = Number(raw);
        if (!Number.isFinite(n)) {
          return NextResponse.json({ error: 'The percent must be a number (e.g. 10, or -5 for below spot).' }, { status: 400 });
        }
        percent = n;
      }
      const rawDiscount = body.specialPriceDefaultDiscountPercent;
      let discountPercent: number | null = null;
      if (rawDiscount !== null && rawDiscount !== undefined && rawDiscount !== '') {
        const n = Number(rawDiscount);
        if (!Number.isFinite(n) || n < 0 || n > 100) {
          return NextResponse.json({ error: 'The discount must be a number from 0 to 100 (e.g. 20 for 20% off).' }, { status: 400 });
        }
        discountPercent = n;
      }
      await saveSpecialPriceDefault(service, { enabled, basis, percent, discountPercent });
      touched = true;
    }

    if (!touched) {
      return NextResponse.json({ error: 'No recognized settings to update.' }, { status: 400 });
    }

    // The public storefront reads these; bust the cached shop-catalog read so
    // list-view changes reflect immediately. Individual product pages are
    // time-revalidated (ISR, ~5 min) like the spot-price values they show.
    revalidateTag('shop-catalog', { expire: 0 });
    revalidatePath('/shop/[id]', 'page');
    revalidatePath('/es/shop/[id]', 'page');

    const [visibility, specialPriceDefault] = await Promise.all([
      fetchShopVisibilitySettings(service),
      fetchSpecialPriceDefault(service),
    ]);
    return NextResponse.json({ ...visibility, specialPriceDefault });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save shop settings.' },
      { status: 500 },
    );
  }
}
