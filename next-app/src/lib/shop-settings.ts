import type { SupabaseClient } from '@supabase/supabase-js';

export const SHOP_SETTINGS_TABLE = 'shop_settings';
const SINGLE_ROW_ID = true;

export interface ShopVisibilitySettings {
  showSoldItems: boolean;
  hideSoldItemPrices: boolean;
}

/**
 * Whether SOLD products should appear in the public shop gallery.
 *
 * Degrades to `true` (the historical behavior — show available + sold) on any
 * error, including the table not existing yet before the migration is applied.
 */
export async function fetchShowSoldItems(supabase: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from(SHOP_SETTINGS_TABLE)
      .select('show_sold_items')
      .eq('id', SINGLE_ROW_ID)
      .maybeSingle();
    if (error) return true;
    return data?.show_sold_items ?? true;
  } catch {
    return true;
  }
}

/**
 * Public sold-item visibility and price behavior. The price mask defaults off
 * until its additive column exists, preserving the historical storefront.
 */
export async function fetchShopVisibilitySettings(supabase: SupabaseClient): Promise<ShopVisibilitySettings> {
  try {
    const { data, error } = await supabase
      .from(SHOP_SETTINGS_TABLE)
      .select('show_sold_items, hide_sold_item_prices')
      .eq('id', SINGLE_ROW_ID)
      .maybeSingle();
    if (!error) {
      return {
        showSoldItems: data?.show_sold_items ?? true,
        hideSoldItemPrices: data?.hide_sold_item_prices ?? false,
      };
    }
  } catch {
    // Fall through to the old-column-compatible read below.
  }

  return {
    showSoldItems: await fetchShowSoldItems(supabase),
    hideSoldItemPrices: false,
  };
}

/** Persist the toggle. Throws on failure so the caller can surface an error. */
export async function saveShowSoldItems(supabase: SupabaseClient, showSoldItems: boolean): Promise<void> {
  const { error } = await supabase
    .from(SHOP_SETTINGS_TABLE)
    .upsert(
      { id: SINGLE_ROW_ID, show_sold_items: showSoldItems, updated_at: new Date().toISOString() },
      { onConflict: 'id' },
    );
  if (error) throw new Error(error.message);
}

export async function saveHideSoldItemPrices(supabase: SupabaseClient, hideSoldItemPrices: boolean): Promise<void> {
  const { error } = await supabase
    .from(SHOP_SETTINGS_TABLE)
    .upsert(
      { id: SINGLE_ROW_ID, hide_sold_item_prices: hideSoldItemPrices, updated_at: new Date().toISOString() },
      { onConflict: 'id' },
    );
  if (error) throw new Error(error.message);
}

/**
 * Site-wide default for the product-page trade-in line: either a signed % over
 * melt (basis 'melt', the original) or a % off the asking price (basis 'asking').
 */
export interface SpecialPriceDefault {
  enabled: boolean;
  basis: SpecialPriceDefaultBasis;
  /** Signed percent applied to melt value; null when never set. */
  percent: number | null;
  /** Percent off the asking price (0–100); null when never set. */
  discountPercent: number | null;
}

export type SpecialPriceDefaultBasis = 'melt' | 'asking';

/** Anything but 'asking' (null, a pre-migration row) is the original melt basis. */
export function normalizeSpecialPriceDefaultBasis(value: unknown): SpecialPriceDefaultBasis {
  return value === 'asking' ? 'asking' : 'melt';
}

const SPECIAL_PRICE_DEFAULT_OFF: SpecialPriceDefault = { enabled: false, basis: 'melt', percent: null, discountPercent: null };

/**
 * The site-wide trade-in default. Degrades to the melt-only read when the
 * basis/discount columns do not exist yet (`shop-trade-in-asking-discount-2026-10.sql`
 * not run), and to "off" (the line shows the plain melt value) on any other error.
 */
export async function fetchSpecialPriceDefault(supabase: SupabaseClient): Promise<SpecialPriceDefault> {
  try {
    const { data, error } = await supabase
      .from(SHOP_SETTINGS_TABLE)
      .select('special_price_default_enabled, special_price_default_percent, special_price_default_basis, special_price_default_discount_percent')
      .eq('id', SINGLE_ROW_ID)
      .maybeSingle();
    if (!error) {
      return {
        enabled: data?.special_price_default_enabled ?? false,
        basis: normalizeSpecialPriceDefaultBasis(data?.special_price_default_basis),
        percent: data?.special_price_default_percent ?? null,
        discountPercent: data?.special_price_default_discount_percent ?? null,
      };
    }
  } catch {
    // Fall through to the melt-only read below.
  }

  try {
    const { data, error } = await supabase
      .from(SHOP_SETTINGS_TABLE)
      .select('special_price_default_enabled, special_price_default_percent')
      .eq('id', SINGLE_ROW_ID)
      .maybeSingle();
    if (error) return SPECIAL_PRICE_DEFAULT_OFF;
    return {
      enabled: data?.special_price_default_enabled ?? false,
      basis: 'melt',
      percent: data?.special_price_default_percent ?? null,
      discountPercent: null,
    };
  } catch {
    return SPECIAL_PRICE_DEFAULT_OFF;
  }
}

/**
 * Persist the site-wide trade-in default. Throws on failure. A melt-basis save
 * with no discount still works before the basis/discount SQL has run (it
 * retries without those columns); an asking-basis save needs the SQL.
 */
export async function saveSpecialPriceDefault(supabase: SupabaseClient, value: SpecialPriceDefault): Promise<void> {
  const base = {
    id: SINGLE_ROW_ID,
    special_price_default_enabled: value.enabled,
    special_price_default_percent: value.percent,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from(SHOP_SETTINGS_TABLE)
    .upsert(
      {
        ...base,
        special_price_default_basis: value.basis,
        special_price_default_discount_percent: value.discountPercent,
      },
      { onConflict: 'id' },
    );
  if (!error) return;

  const missingColumns = /special_price_default_(basis|discount_percent)/.test(error.message);
  if (missingColumns && value.basis === 'melt' && value.discountPercent == null) {
    const retry = await supabase.from(SHOP_SETTINGS_TABLE).upsert(base, { onConflict: 'id' });
    if (!retry.error) return;
    throw new Error(retry.error.message);
  }
  if (missingColumns) {
    throw new Error('The "% off asking price" option needs supabase/shop-trade-in-asking-discount-2026-10.sql run in Supabase first.');
  }
  throw new Error(error.message);
}
