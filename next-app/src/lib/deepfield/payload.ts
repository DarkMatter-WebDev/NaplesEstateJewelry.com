import type { Product, SpotData } from '@/types/product';
import {
  calcSpotMeltValue,
  getProductPriceValue,
  parseManualPriceLabelValue,
} from '@/lib/pricing';
import { getProductSoldPriceLock, normalizeProductStatus } from '@/types/product';

/**
 * Public origin for images stored as site-relative paths. 113 of the catalog's
 * image references are `/assets/...` files served by this site rather than
 * Supabase Storage; Deep Field cannot resolve those without an origin.
 */
export const NEJ_PUBLIC_ORIGIN = 'https://naplesestatejewelry.com';

/**
 * Fields sent to Deep Field.
 *
 * This is an ALLOW-LIST on purpose. A column added to `products` later is
 * excluded by default rather than silently shipped to another company's
 * database. Adding a field here is a deliberate act.
 *
 * Deliberately absent:
 * - cost_basis, minimum_price, private_price_label, live_spot_snapshot,
 *   acquisition_date, acquisition_source, internal_notes — internal business
 *   data; the database revokes these from anon/authenticated for the same reason.
 * - reserved_until, reserved_order_id — vestigial since the no-reservation checkout.
 * - price_label — a dead legacy column. Nothing renders it and every save writes
 *   null, but stale values survive on ~19 rows including "$0.00" on a product
 *   that sells for $450. Shipping it invites the receiver to render a wrong price.
 */
export const DEEPFIELD_PRODUCT_FIELDS = [
  'id', 'inventory_number', 'sku', 'slug', 'sort_order',
  'title', 'title_es', 'description', 'description_es',
  'public_notes', 'public_notes_es', 'details', 'details_es', 'tags', 'tags_es',
  'category', 'metal', 'metal_type', 'metal_variant',
  'product_type', 'jewelry_type', 'chain_type', 'brand', 'gender', 'item_year',
  'purity', 'weight_grams', 'gram_weight', 'width_mm', 'length', 'stone_details',
  'price_mode', 'manual_price_label', 'pricing_multiplier',
  'sold_price', 'melt_value', 'asking_price', 'show_spot_price',
  'special_price_override_enabled', 'special_price_override_amount',
  'special_price_override_mode', 'special_price_override_percent',
  'special_price_override_discount_percent', 'special_price_override_discount_amount',
  'status', 'location', 'quantity', 'featured',
  'images', 'image_urls', 'image_padding', 'image_padding_by_image',
  'created_at', 'updated_at',
] as const satisfies readonly (keyof Product)[];

/** Never leaves this server, whatever the allow-list says. Asserted at build time. */
export const DEEPFIELD_FORBIDDEN_FIELDS = [
  'cost_basis', 'minimum_price', 'private_price_label', 'live_spot_snapshot',
  'acquisition_date', 'acquisition_source', 'internal_notes',
  'reserved_until', 'reserved_order_id',
] as const;

export type DeepFieldPriceSource = 'spot' | 'manual' | 'sold_lock';

export interface DeepFieldProductPayload extends Record<string, unknown> {
  id: string;
  images: string[];
  image_urls: string[];
  nej_price_usd: number | null;
  nej_price_source: DeepFieldPriceSource | null;
  nej_melt_value_usd: number | null;
  nej_spot_snapshot: DeepFieldSpotSnapshot | null;
  nej_price_unavailable_reason: string | null;
}

export interface DeepFieldSpotSnapshot {
  goldPerTroyOz: number;
  silverPerTroyOz: number | null;
  source: SpotData['source'];
  capturedAt: string;
}

/**
 * Make a stored image reference fetchable from outside this site.
 *
 * Site-relative paths get the public origin. Each segment is percent-encoded
 * because a handful of source filenames contain spaces and parentheses
 * ("IMG_5132 (Product Staging).webp"), which are not legal in a URL and fail on
 * strict HTTP clients. Already-absolute URLs pass through untouched — notably
 * they must NOT be re-encoded, or an already-escaped URL would double-escape.
 */
export function toAbsoluteImageUrl(value: string): string {
  const trimmed = String(value ?? '').trim();
  if (!trimmed.startsWith('/')) return trimmed;
  const encoded = trimmed.split('/').map((segment) => encodeURIComponent(segment)).join('/');
  return `${NEJ_PUBLIC_ORIGIN}${encoded}`;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Resolve the price Deep Field should show, using the same rules the storefront
 * uses — sold lock, then manual label, then live spot × multiplier.
 *
 * 60 of ~128 products are spot-multiplier with no stored price of any kind:
 * their price exists only as a render-time computation. Deep Field computes
 * these live on its side, so this is a fallback snapshot, not the primary
 * price. Sold items stay locked to sold_price on both sides.
 *
 * Fail-closed on spot: when live metal pricing is unavailable, a spot-priced
 * product reports a null price with a reason rather than a fallback-rate guess.
 * Shipping a fabricated number into another company's storefront is worse than
 * shipping none — the same rule getMarketplaceSpotPriceError already enforces
 * for Etsy and eBay writes. Manual and sold-locked prices are unaffected,
 * because they need no spot data.
 */
export function resolveDeepFieldPrice(
  product: Product,
  spotData: SpotData | null,
): Pick<
  DeepFieldProductPayload,
  'nej_price_usd' | 'nej_price_source' | 'nej_melt_value_usd' | 'nej_price_unavailable_reason'
> {
  const locked = getProductSoldPriceLock(product);
  if (locked != null) {
    return {
      nej_price_usd: round2(locked),
      nej_price_source: 'sold_lock',
      nej_melt_value_usd: null,
      nej_price_unavailable_reason: null,
    };
  }

  if (product.price_mode === 'manual') {
    const parsed = parseManualPriceLabelValue(product.manual_price_label);
    return {
      nej_price_usd: parsed == null ? null : round2(parsed),
      nej_price_source: parsed == null ? null : 'manual',
      nej_melt_value_usd: null,
      nej_price_unavailable_reason: parsed == null
        ? 'manual price label is empty or unparseable'
        : null,
    };
  }

  if (!spotData || spotData.source !== 'api') {
    return {
      nej_price_usd: null,
      nej_price_source: null,
      nej_melt_value_usd: null,
      nej_price_unavailable_reason:
        'live metal spot pricing unavailable; no fallback price sent',
    };
  }

  const value = getProductPriceValue(product, spotData);
  const melt = calcSpotMeltValue(product, spotData);
  if (value == null) {
    return {
      nej_price_usd: null,
      nej_price_source: null,
      nej_melt_value_usd: melt == null ? null : round2(melt),
      nej_price_unavailable_reason: 'missing weight, purity, or pricing multiplier',
    };
  }

  return {
    nej_price_usd: round2(value),
    nej_price_source: 'spot',
    nej_melt_value_usd: melt == null ? null : round2(melt),
    nej_price_unavailable_reason: null,
  };
}

export function toSpotSnapshot(spotData: SpotData | null): DeepFieldSpotSnapshot | null {
  if (!spotData || spotData.source !== 'api') return null;
  return {
    goldPerTroyOz: spotData.goldPerTroyOz,
    silverPerTroyOz: spotData.silverPerTroyOz,
    source: spotData.source,
    capturedAt: new Date(spotData.fetchedAt).toISOString(),
  };
}

/**
 * Build the outbound payload for one product. Pure — no I/O — so the field
 * policy and price resolution are unit-testable without a network or database.
 */
export function buildDeepFieldPayload(
  product: Product,
  spotData: SpotData | null,
): DeepFieldProductPayload {
  const source = product as unknown as Record<string, unknown>;
  const payload: Record<string, unknown> = {};

  for (const field of DEEPFIELD_PRODUCT_FIELDS) {
    if (field in source) payload[field] = source[field];
  }

  payload.status = normalizeProductStatus(product.status);
  payload.images = (product.images ?? []).map(toAbsoluteImageUrl);
  payload.image_urls = (product.image_urls ?? []).map(toAbsoluteImageUrl);

  const price = resolveDeepFieldPrice(product, spotData);
  Object.assign(payload, price);
  payload.nej_spot_snapshot = price.nej_price_source === 'spot' ? toSpotSnapshot(spotData) : null;

  // Independent second guard. If the allow-list is ever edited carelessly this
  // throws rather than leaking — the caller treats a throw as "skip this
  // product", which is the safe direction.
  for (const forbidden of DEEPFIELD_FORBIDDEN_FIELDS) {
    if (forbidden in payload) {
      throw new Error(`Deep Field payload would leak internal field "${forbidden}"`);
    }
  }

  return payload as DeepFieldProductPayload;
}
