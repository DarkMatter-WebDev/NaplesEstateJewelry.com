export type ProductStatus =
  | 'draft'
  | 'available'
  | 'pending_payment'
  | 'sold'
  | 'archived'
  | 'Available'
  | 'Sold';

export type ProductLocation =
  | 'showcase'
  | 'safe'
  | 'offsite'
  | 'shipped'
  | 'picked_up';

export type ProductMetalVariant =
  | 'yellow_gold'
  | 'white_gold'
  | 'rose_gold'
  | 'tricolor_gold'
  | 'bicolor_gold'
  | 'silver'
  | 'vermeil'
  | 'platinum';

export type ProductMetalType =
  | 'Gold'
  | 'Silver'
  | 'Platinum'
  | 'Palladium'
  | 'Mixed Metal'
  | 'Non-Metal'
  | 'Other';

export type ProductJewelryType =
  | 'Necklace'
  | 'Bracelet'
  | 'Ring'
  | 'Pendant'
  | 'Charm'
  | 'Earrings'
  | 'Brooch'
  | 'Cufflinks'
  | 'Watch'
  | 'Coin'
  | 'Bullion'
  | 'Silverware'
  | 'Other';

export type ProductImagePadding = 'none' | 'white' | 'black';
export type ProductImagePaddingMap = Record<string, ProductImagePadding | string | null | undefined>;
const PRODUCT_IMAGE_PADDING_HEX_PATTERN = /^#[0-9a-f]{6}$/i;

export interface Product {
  id: string;
  category: 'Gold' | 'Silver';
  metal_type: ProductMetalType | string | null;
  metal_variant: ProductMetalVariant | string | null;
  title: string;
  title_es: string | null;
  price_label: string | null;
  manual_price_label: string | null;
  price_mode: 'spot-multiplier' | 'manual';
  purity: number | null;
  weight_grams: number | null;
  inventory_number: number | null;
  sku: string | null;
  slug: string | null;
  metal: string | null;
  gram_weight: number | null;
  stone_details: string | null;
  brand: string | null;
  product_type: ProductJewelryType | string | null;
  jewelry_type: ProductJewelryType | string | null;
  chain_type: string | null;
  length: string | null;
  // Physical chain/band width in millimeters. Optional during the migration
  // rollout; meaningful only for Necklace and Bracelet products.
  width_mm?: number | null;
  pricing_multiplier: number | null;
  // Final site price captured when the item becomes Sold. The database clears
  // it when the item returns to Available, allowing live/manual pricing to
  // resume. Optional until the sold-price-lock migration is applied.
  sold_price?: number | null;
  // Whether the product page shows the scrap/melt-value + spot-per-oz callout
  // (and the matching "own gold/silver, put it toward this piece" line). Off
  // for items that aren't 100% precious metal, where a full-weight melt value
  // would overstate what the item is actually worth in scrap.
  show_spot_price: boolean | null;
  // Manual override for the "Own gold or silver? Put it toward this piece and
  // pay as little as ___" trade-in line on the product page. Off by default,
  // in which case that line falls back to the computed scrap/melt value (the
  // same number shown in the "Scrap value" box above it). When on, the amount
  // below replaces just that line's price — the scrap-value box itself is
  // unaffected, since it's meant to reflect the item's actual melt value.
  special_price_override_enabled: boolean | null;
  special_price_override_amount: number | null;
  // How an enabled override expresses the trade-in price. 'amount' (default)
  // uses the flat dollar figure above; 'percent' uses a markup over the item's
  // computed spot/melt value (meltValue * (1 + percent/100)), so it auto-tracks
  // the live spot price instead of being a fixed number.
  special_price_override_mode: 'amount' | 'percent' | null;
  special_price_override_percent: number | null;
  // Units currently in stock for this listing. Most items are one-of-a-kind
  // (default 1); a positive count above 1 means several identical units are
  // listed together. Missing/null (e.g. a pre-migration row) normalizes to 1
  // via normalizeProductQuantity() so existing one-of-a-kind behavior is
  // unaffected until the column exists.
  quantity: number | null;
  status: ProductStatus | string;
  location: ProductLocation | string | null;
  images: string[];
  image_urls: string[];
  image_padding: ProductImagePadding | string | null;
  image_padding_by_image: ProductImagePaddingMap | null;
  description: string | null;
  description_es: string | null;
  details: string[];
  details_es: string[];
  tags: string[];
  tags_es: string[];
  private_price_label: string | null;
  gender: string | null;
  item_year: number | null;
  cost_basis: number | null;
  melt_value: number | null;
  asking_price: number | null;
  minimum_price: number | null;
  live_spot_snapshot: Record<string, unknown> | null;
  acquisition_date: string | null;
  acquisition_source: string | null;
  internal_notes: string | null;
  public_notes: string | null;
  public_notes_es: string | null;
  featured: boolean | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export function normalizeProductImagePadding(value: string | null | undefined): ProductImagePadding {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[_\s-]+/g, '_');
  if (normalized === 'white') return 'white';
  if (normalized === 'black') return 'black';
  return 'none';
}

export function normalizeProductImagePaddingValue(value: string | null | undefined): ProductImagePadding | string {
  const raw = String(value ?? '').trim();
  if (PRODUCT_IMAGE_PADDING_HEX_PATTERN.test(raw)) return raw.toLowerCase();
  return normalizeProductImagePadding(raw);
}

export function isProductImagePaddingCustomColor(value: string | null | undefined): boolean {
  return PRODUCT_IMAGE_PADDING_HEX_PATTERN.test(String(value ?? '').trim());
}

export function hasProductImagePadding(value: string | null | undefined): boolean {
  return normalizeProductImagePaddingValue(value) !== 'none';
}

/**
 * Whether a resolved image-padding background is dark enough to need light
 * foreground treatment. Drives the product page's dark theme and the gallery's
 * edge-navigation tone, which must agree — a per-image dark padding on an
 * otherwise light page still needs a dark scrim behind its arrows.
 * Anything that is not a plain 6-digit hex (e.g. a CSS var fallback) reads light.
 */
export function isDarkProductBackground(hex: string): boolean {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return false;
  const int = parseInt(match[1], 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.4;
}

export function productImagePaddingBackground(value: string | null | undefined): string {
  const normalized = normalizeProductImagePaddingValue(value);
  if (isProductImagePaddingCustomColor(normalized)) return normalized;
  if (normalized === 'white') return '#ffffff';
  if (normalized === 'black') return '#000000';
  return 'var(--color-surface-container)';
}

export function normalizeProductImagePaddingMap(value: unknown): ProductImagePaddingMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, padding]) => [key, normalizeProductImagePaddingValue(String(padding ?? 'none'))])
      .filter(([key]) => key.trim().length > 0),
  );
}

export function productImagePaddingMapKey(image: string | null | undefined, index: number): string {
  return image?.trim() || String(index);
}

export function productImagePaddingForImage(
  fallback: string | null | undefined,
  map: ProductImagePaddingMap | null | undefined,
  image: string | null | undefined,
  index: number,
): ProductImagePadding | string {
  const normalizedMap = normalizeProductImagePaddingMap(map);
  const key = productImagePaddingMapKey(image, index);
  if (Object.prototype.hasOwnProperty.call(normalizedMap, key)) {
    return normalizeProductImagePaddingValue(normalizedMap[key]);
  }
  if (Object.prototype.hasOwnProperty.call(normalizedMap, String(index))) {
    return normalizeProductImagePaddingValue(normalizedMap[String(index)]);
  }
  return normalizeProductImagePaddingValue(fallback);
}

export function hasAnyProductImagePadding(
  fallback: string | null | undefined,
  map: ProductImagePaddingMap | null | undefined,
): boolean {
  return hasProductImagePadding(fallback)
    || Object.values(normalizeProductImagePaddingMap(map)).some((value) => hasProductImagePadding(value));
}

export interface SpotData {
  goldPerTroyOz: number;
  silverPerTroyOz: number | null;
  fetchedAt: number;
  source: 'api' | 'fallback';
}

// The year the physical jewelry item was made (e.g. 1930), not the date the
// listing was created. Accepts a number or a numeric string and validates a
// sane range; anything else normalizes to null.
export function normalizeProductItemYear(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).trim();
  if (!cleaned || !/^\d{1,4}$/.test(cleaned)) return null;
  const year = Number(cleaned);
  if (!Number.isInteger(year) || year < 1 || year > 2200) return null;
  return year;
}

export function formatProductItemYear(value: string | number | null | undefined): string | null {
  const normalized = normalizeProductItemYear(value);
  return normalized === null ? null : String(normalized);
}

export function normalizeProductStatus(status: ProductStatus | string | null | undefined): ProductStatus {
  const value = String(status ?? 'available').toLowerCase().replace(/\s+/g, '_');
  if (value === 'draft') return 'draft';
  if (value === 'pending_payment') return 'pending_payment';
  if (value === 'sold') return 'sold';
  if (value === 'archived') return 'archived';
  return 'available';
}

export function getProductSoldPriceLock(
  product: Pick<Product, 'status' | 'sold_price'>,
): number | null {
  if (normalizeProductStatus(product.status) === 'available') return null;
  if (product.sold_price == null) return null;
  const value = Number(product.sold_price);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

// Legacy/pre-migration rows and any row fetched before the column existed have
// show_spot_price === undefined; treat that the same as true (unchanged
// behavior) so the melt-value callout only disappears when explicitly turned off.
export function shouldShowSpotPrice(product: Pick<Product, 'show_spot_price'>): boolean {
  return product.show_spot_price !== false;
}

// The admin-entered trade-in price only applies when explicitly enabled AND a
// positive amount is set — an enabled checkbox with an empty/zero/negative
// amount falls back to the computed scrap value rather than showing $0.
export function getSpecialPriceOverrideAmount(
  product: Pick<Product, 'special_price_override_enabled' | 'special_price_override_amount'>,
): number | null {
  if (!product.special_price_override_enabled) return null;
  const amount = product.special_price_override_amount;
  return typeof amount === 'number' && Number.isFinite(amount) && amount > 0 ? amount : null;
}

// Missing/null mode (pre-migration row, or a call site that hasn't been updated
// to pass it) normalizes to 'amount' — the flat-dollar behavior that existed
// before the percent option — so this is purely additive.
export function normalizeSpecialPriceOverrideMode(
  value: string | null | undefined,
): 'amount' | 'percent' {
  return value === 'percent' ? 'percent' : 'amount';
}

// Resolves the actual trade-in price to advertise on the product page, given
// the item's computed melt/spot value (pass null when it can't be computed).
// Returns null when the override is off or its inputs are invalid, in which
// case the caller falls back to the plain computed scrap value.
//   'amount'  → the flat dollar figure (must be > 0)
//   'percent' → meltValue * (1 + percent/100), requires a computable meltValue
export function resolveSpecialTradeInPrice(
  product: Pick<
    Product,
    | 'special_price_override_enabled'
    | 'special_price_override_amount'
    | 'special_price_override_mode'
    | 'special_price_override_percent'
  >,
  meltValue: number | null,
): number | null {
  if (!product.special_price_override_enabled) return null;
  if (normalizeSpecialPriceOverrideMode(product.special_price_override_mode) === 'percent') {
    const percent = product.special_price_override_percent;
    if (meltValue == null || !Number.isFinite(meltValue)) return null;
    if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0) return null;
    return meltValue * (1 + percent / 100);
  }
  return getSpecialPriceOverrideAmount(product);
}

/** The site-wide default trade-in price (a signed % over the item's melt value). */
export interface SiteTradeInDefault {
  enabled: boolean;
  percent: number | null;
}

// The actual trade-in price to advertise on a product page, resolving the full
// precedence in one place:
//   1. the per-item override (resolveSpecialTradeInPrice) — always wins;
//   2. else the SITE-WIDE default (meltValue * (1 + percent/100)) when enabled;
//   3. else the plain computed melt value (or null when it can't be computed).
// The site default percent may be negative (advertise below spot) or positive.
export function resolveAdvertisedTradeInPrice(
  product: Pick<
    Product,
    | 'special_price_override_enabled'
    | 'special_price_override_amount'
    | 'special_price_override_mode'
    | 'special_price_override_percent'
  >,
  meltValue: number | null,
  siteDefault: SiteTradeInDefault | null | undefined,
): number | null {
  const perItem = resolveSpecialTradeInPrice(product, meltValue);
  if (perItem != null) return perItem;
  if (
    siteDefault?.enabled &&
    meltValue != null &&
    Number.isFinite(meltValue) &&
    typeof siteDefault.percent === 'number' &&
    Number.isFinite(siteDefault.percent)
  ) {
    return meltValue * (1 + siteDefault.percent / 100);
  }
  return meltValue;
}

export function isProductSold(status: ProductStatus | string | null | undefined): boolean {
  return normalizeProductStatus(status) === 'sold';
}

// Missing/null (undefined column, pre-migration row, or a call site that
// hasn't been updated to pass it) normalizes to 1 — i.e. "don't gate on
// stock" — so this is purely additive and never changes existing behavior
// for callers that only ever dealt with one-of-a-kind items.
export function normalizeProductQuantity(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 1;
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return 1;
  const floored = Math.floor(numeric);
  return floored < 0 ? 0 : floored;
}

export function isProductPurchasable(
  status: ProductStatus | string | null | undefined,
  quantity?: number | string | null,
): boolean {
  return normalizeProductStatus(status) === 'available' && normalizeProductQuantity(quantity) > 0;
}

export const PUBLIC_SHOP_PRODUCT_STATUSES = ['available', 'sold', 'Available', 'Sold'] as const;

// Statuses shown when the admin has turned OFF "show sold items" — available only.
export const AVAILABLE_ONLY_SHOP_PRODUCT_STATUSES = ['available', 'Available'] as const;

export function isProductVisibleInShop(status: ProductStatus | string | null | undefined): boolean {
  const normalized = normalizeProductStatus(status);
  return normalized === 'available' || normalized === 'sold';
}

export function productStatusLabel(status: ProductStatus | string | null | undefined): string {
  const normalized = normalizeProductStatus(status);
  if (normalized === 'pending_payment') return 'Pending Payment';
  return normalized.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export const PRODUCT_METAL_VARIANTS: Record<'Gold' | 'Silver', { value: ProductMetalVariant; label: string; labelEs: string }[]> = {
  Gold: [
    { value: 'yellow_gold', label: 'Yellow Gold', labelEs: 'Oro amarillo' },
    { value: 'white_gold', label: 'White Gold', labelEs: 'Oro blanco' },
    { value: 'rose_gold', label: 'Rose Gold', labelEs: 'Oro rosa' },
    { value: 'tricolor_gold', label: 'Tricolor Gold', labelEs: 'Oro tricolor' },
    { value: 'bicolor_gold', label: 'Bicolor Gold', labelEs: 'Oro bicolor' },
  ],
  Silver: [
    { value: 'silver', label: 'Silver', labelEs: 'Plata' },
    { value: 'vermeil', label: 'Vermeil', labelEs: 'Vermeil' },
    { value: 'platinum', label: 'Platinum', labelEs: 'Platino' },
  ],
};

export const PRODUCT_METAL_TYPES: { value: ProductMetalType; label: string; labelEs: string }[] = [
  { value: 'Gold', label: 'Gold', labelEs: 'Oro' },
  { value: 'Silver', label: 'Silver', labelEs: 'Plata' },
  { value: 'Platinum', label: 'Platinum', labelEs: 'Platino' },
  { value: 'Palladium', label: 'Palladium', labelEs: 'Paladio' },
  { value: 'Mixed Metal', label: 'Mixed Metal', labelEs: 'Metal mixto' },
  { value: 'Non-Metal', label: 'Non-Metal', labelEs: 'No metal' },
  { value: 'Other', label: 'Other', labelEs: 'Otro' },
];

export const PRODUCT_JEWELRY_TYPES: { value: ProductJewelryType; label: string; labelEs: string }[] = [
  { value: 'Necklace', label: 'Necklace', labelEs: 'Collar' },
  { value: 'Bracelet', label: 'Bracelet', labelEs: 'Pulsera' },
  { value: 'Ring', label: 'Ring', labelEs: 'Anillo' },
  { value: 'Pendant', label: 'Pendant', labelEs: 'Dije' },
  { value: 'Charm', label: 'Charm', labelEs: 'Charm' },
  { value: 'Earrings', label: 'Earrings', labelEs: 'Aretes' },
  { value: 'Brooch', label: 'Brooch', labelEs: 'Broche' },
  { value: 'Cufflinks', label: 'Cufflinks', labelEs: 'Gemelos' },
  { value: 'Watch', label: 'Watch', labelEs: 'Reloj' },
  { value: 'Coin', label: 'Coin', labelEs: 'Moneda' },
  { value: 'Bullion', label: 'Bullion', labelEs: 'Lingote' },
  { value: 'Silverware', label: 'Silverware / Sterling', labelEs: 'Plateria / sterling' },
  { value: 'Other', label: 'Other', labelEs: 'Otro' },
];

export const PRODUCT_LINK_TYPES = [
  'Cuban link',
  'Figaro link',
  'Rope chain',
  'Anchor / Gucci link',
  'Oval link',
  'Byzantine link',
  'Box link',
  'Other',
] as const;

const JEWELRY_TYPE_KEYWORDS: Record<ProductJewelryType, string[]> = {
  Necklace: ['necklace', 'chain', 'collar', 'cadena'],
  Bracelet: ['bracelet', 'bangle', 'pulsera', 'esclava'],
  Ring: ['ring', 'band', 'anillo'],
  Pendant: ['pendant', 'dije'],
  Charm: ['charm', 'charms'],
  Earrings: ['earring', 'earrings', 'arete', 'aretes'],
  Brooch: ['brooch', 'pin', 'broche'],
  Cufflinks: ['cufflink', 'cufflinks', 'gemelo', 'gemelos'],
  Watch: ['watch', 'watches', 'wristwatch', 'wrist watch', 'timepiece', 'reloj'],
  Coin: ['coin', 'coins', 'moneda'],
  Bullion: ['bullion', 'bar', 'round', 'ingot', 'lingote'],
  Silverware: ['silverware', 'flatware', 'hollowware', 'plateria'],
  Other: ['other'],
};

export function normalizeProductJewelryType(value: string | null | undefined): ProductJewelryType | null {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  if (!normalized) return null;
  const direct = PRODUCT_JEWELRY_TYPES.find((type) => type.value.toLowerCase() === normalized || type.label.toLowerCase() === normalized || type.labelEs.toLowerCase() === normalized);
  if (direct) return direct.value;
  if (normalized === 'necklaces' || normalized === 'chain' || normalized === 'chains') return 'Necklace';
  if (normalized === 'bracelets' || normalized === 'bangle') return 'Bracelet';
  if (normalized === 'rings' || normalized === 'band') return 'Ring';
  if (normalized === 'pendants') return 'Pendant';
  if (normalized === 'charms') return 'Charm';
  if (normalized === 'earring') return 'Earrings';
  if (normalized === 'brooches' || normalized === 'pin') return 'Brooch';
  if (normalized === 'cufflink' || normalized === 'cufflinks' || normalized === 'cuff links' || normalized === 'gemelo' || normalized === 'gemelos') return 'Cufflinks';
  if (normalized === 'watches' || normalized === 'wristwatch' || normalized === 'wrist watch' || normalized === 'timepiece' || normalized === 'timepieces') return 'Watch';
  if (normalized === 'coins') return 'Coin';
  if (normalized === 'bars' || normalized === 'round' || normalized === 'rounds' || normalized === 'ingot') return 'Bullion';
  if (normalized === 'flatware' || normalized === 'hollowware') return 'Silverware';
  return null;
}

export const normalizeProductType = normalizeProductJewelryType;

export function normalizeProductTypeValue(value: string | null | undefined): string | null {
  const cleaned = String(value ?? '').replace(/\u0000/g, '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return null;
  return normalizeProductJewelryType(cleaned) ?? cleaned.slice(0, 80);
}

export function normalizeProductMetalType(value: string | null | undefined, fallback: Product['category'] = 'Gold'): ProductMetalType {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  const direct = PRODUCT_METAL_TYPES.find((type) => type.value.toLowerCase() === normalized || type.label.toLowerCase() === normalized || type.labelEs.toLowerCase() === normalized);
  if (direct) return direct.value;
  if (normalized === 'mixed' || normalized === 'mixed metals') return 'Mixed Metal';
  if (normalized === 'non metal' || normalized === 'nonmetal' || normalized === 'none') return 'Non-Metal';
  return fallback;
}

export function getJewelryTypeFromTags(tags: string[] | null | undefined): string | null {
  const tag = (tags ?? []).find((item) => item.startsWith('jt:'));
  return normalizeProductTypeValue(tag?.slice(3));
}

export function inferProductJewelryType(product: Pick<Product, 'title' | 'title_es' | 'chain_type' | 'tags' | 'tags_es' | 'jewelry_type'> & { product_type?: string | null }): string {
  const direct = normalizeProductTypeValue(product.product_type) ?? normalizeProductTypeValue(product.jewelry_type) ?? getJewelryTypeFromTags(product.tags);
  if (direct && direct !== 'Other') return direct;
  const text = [product.title, product.title_es, product.chain_type, ...(product.tags ?? []), ...(product.tags_es ?? [])]
    .join(' ')
    .toLowerCase();
  for (const type of PRODUCT_JEWELRY_TYPES) {
    if (type.value === 'Other') continue;
    if (JEWELRY_TYPE_KEYWORDS[type.value].some((keyword) => text.includes(keyword))) return type.value;
  }
  return 'Other';
}

/**
 * The wearable-jewelry half of the catalog's jewelry/everything-else split.
 * Everything not listed here — Coin, Bullion, Silverware, Other — is the
 * "everything else" side. This is the canonical set: the shop's Jewelry &
 * Watches category filter and the hero carousel's random lineups both classify
 * from it, and `shop-filter-state.test.ts` asserts the shop's slug list stays
 * in step, so the two can never drift apart.
 */
export const PRODUCT_WEARABLE_JEWELRY_TYPES: readonly ProductJewelryType[] = [
  'Necklace',
  'Bracelet',
  'Ring',
  'Pendant',
  'Charm',
  'Earrings',
  'Brooch',
  'Cufflinks',
  'Watch',
];

const WEARABLE_JEWELRY_TYPE_SET = new Set<string>(PRODUCT_WEARABLE_JEWELRY_TYPES);

/** Whether a product reads as wearable jewelry rather than coins/bullion/flatware. */
export function isProductJewelryItem(
  product: Pick<Product, 'title' | 'title_es' | 'chain_type' | 'tags' | 'tags_es' | 'jewelry_type'> & {
    product_type?: string | null;
  },
): boolean {
  return WEARABLE_JEWELRY_TYPE_SET.has(inferProductJewelryType(product));
}

export function productJewelryTypeLabel(value: string | null | undefined, locale = 'en'): string {
  const cleaned = normalizeProductTypeValue(value) ?? 'Other';
  const normalized = normalizeProductJewelryType(cleaned);
  const option = PRODUCT_JEWELRY_TYPES.find((type) => type.value === normalized);
  return locale === 'es' ? option?.labelEs ?? cleaned : option?.label ?? cleaned;
}

export const productTypeLabel = productJewelryTypeLabel;

export function productMetalTypeLabel(value: string | null | undefined, category: Product['category'] = 'Gold', locale = 'en'): string {
  const normalized = normalizeProductMetalType(value, category);
  const option = PRODUCT_METAL_TYPES.find((type) => type.value === normalized);
  return locale === 'es' ? option?.labelEs ?? normalized : option?.label ?? normalized;
}

export function productSupportsLinkType(jewelryType: string | null | undefined): boolean {
  const normalized = normalizeProductJewelryType(jewelryType);
  return normalized === 'Necklace' || normalized === 'Bracelet';
}

export function normalizeProductWidthMm(value: string | number | null | undefined): number | null {
  if (value == null || String(value).trim() === '') return null;
  const numeric = typeof value === 'number' ? value : Number(String(value).trim().replace(/\s*mm$/i, ''));
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 1000) return null;
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
}

export function productWidthDisplay(
  product: Pick<Product, 'width_mm' | 'title' | 'title_es' | 'chain_type' | 'tags' | 'tags_es' | 'jewelry_type' | 'product_type'>,
): string | null {
  if (!productSupportsLinkType(inferProductJewelryType(product))) return null;
  const width = normalizeProductWidthMm(product.width_mm);
  return width == null ? null : `${width.toLocaleString('en-US', { maximumFractionDigits: 2 })} mm`;
}

/**
 * A wearable length as a number of INCHES, or null when the text is not a
 * measurement. The stored `length` column, the product page, the `len:` filter
 * tag, Etsy's Length property and eBay's Chain Length all speak inches — this
 * is the one parser they share, so a value typed as `470 mm` or `47 cm` becomes
 * `18.5` once, here, instead of being read as 470 inches downstream (which is
 * what happened when only the inch suffixes were understood: the owner
 * measures in millimetres, and a bare "470" printed as "470 in" everywhere).
 * Rounded to 2 decimals; a bare number is inches, as it always was.
 */
export function parseLengthInches(value: string | number | null | undefined): number | null {
  const raw = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!raw) return null;
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*(in(?:ch(?:es?)?)?\.?|"|mm|millimet(?:er|re)s?|cm|centimet(?:er|re)s?)?$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount < 0) return null;
  const unit = (match[2] ?? '').toLowerCase();
  const inches = unit.startsWith('mm') || unit.startsWith('millimet')
    ? amount / 25.4
    : unit.startsWith('cm') || unit.startsWith('centimet')
      ? amount / 2.54
      : amount;
  return Math.round((inches + Number.EPSILON) * 100) / 100;
}

export function normalizeProductLengthSizeValue(value: string | number | null | undefined): string {
  const raw = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!raw) return '';
  const inches = parseLengthInches(raw);
  if (inches != null) return String(inches);
  const ringSize = raw.match(/^size\s*:?\s*(\d+(?:\.\d+)?)$/i);
  return ringSize ? String(Number(ringSize[1])) : raw;
}

/**
 * The purity as buyers read it: gold karats carry a K ("14K"), silver and
 * other fineness values stay parts-per-thousand ("925"). The raw column is a
 * bare number, which printed as "Purity: 14" in the marketplace spec blocks.
 */
export function formatProductPurityLabel(purity: number | null | undefined): string | null {
  if (purity == null || !Number.isFinite(purity) || purity <= 0) return null;
  return purity <= 24 ? `${Math.round(purity)}K` : String(Math.round(purity));
}

export function productLengthSizeDisplay(
  product: Pick<Product, 'length' | 'tags' | 'jewelry_type' | 'product_type' | 'title' | 'title_es' | 'chain_type' | 'tags_es'>,
): string | null {
  const rawValue = product.length ?? (product.tags ?? []).find((tag) => tag.startsWith('len:'))?.slice(4) ?? null;
  const value = rawValue?.trim().replace(/\s+/g, ' ');
  if (!value) return null;

  if (inferProductJewelryType(product) === 'Ring') return `Size: ${value.replace(/^size:\s*/i, '')}`;

  const inchValue = value.match(/\d+(?:\.\d+)?/);
  return inchValue ? `${inchValue[0]} in` : value;
}

export function normalizeProductLinkType(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  if (!normalized) return null;
  const matched = PRODUCT_LINK_TYPES.find((linkType) => {
    const link = linkType.toLowerCase();
    const shorthand = link.replace(/\s+(link|chain)$/i, '');
    return normalized === link || normalized === shorthand;
  });
  return matched ?? null;
}

export function getDefaultMetalVariant(category: Product['category']): ProductMetalVariant {
  return category === 'Silver' ? 'silver' : 'yellow_gold';
}

export function normalizeProductMetalVariant(
  value: string | null | undefined,
  category: Product['category'],
): ProductMetalVariant {
  const normalized = String(value ?? '').toLowerCase().trim().replace(/[-\s]+/g, '_');
  const allVariants = [...PRODUCT_METAL_VARIANTS.Gold, ...PRODUCT_METAL_VARIANTS.Silver].map((variant) => variant.value);
  if ((allVariants as string[]).includes(normalized)) return normalized as ProductMetalVariant;
  return getDefaultMetalVariant(category);
}

export function productMetalVariantLabel(
  value: string | null | undefined,
  category: Product['category'],
  locale = 'en',
): string {
  const normalized = normalizeProductMetalVariant(value, category);
  const option = [...PRODUCT_METAL_VARIANTS.Gold, ...PRODUCT_METAL_VARIANTS.Silver]
    .find((variant) => variant.value === normalized);
  if (!option) return category;
  return locale === 'es' ? option.labelEs : option.label;
}

/**
 * The color the metal name is printed in on the product page's summary row, so
 * the word doubles as its own swatch: yellow gold reads gold, rose gold reads
 * rose, and the white metals read as a neutral.
 *
 * Returns a `var()` reference rather than a hex — the light values live in
 * `@theme` in globals.css and the dark-page counterparts in
 * `.product-page-dark`, so a dark-backed product gets the right one with no
 * branch here.
 *
 * Tricolor, bicolor and vermeil deliberately fall through to gold: the first
 * two have no single true color, and vermeil IS gold over silver.
 */
export function productMetalAccentVar(
  value: string | null | undefined,
  category: Product['category'],
): string {
  switch (normalizeProductMetalVariant(value, category)) {
    case 'rose_gold':
      return 'var(--color-spec-metal-rose)';
    case 'white_gold':
    case 'silver':
    case 'platinum':
      return 'var(--color-spec-metal-neutral)';
    default:
      return 'var(--color-spec-metal-gold)';
  }
}
