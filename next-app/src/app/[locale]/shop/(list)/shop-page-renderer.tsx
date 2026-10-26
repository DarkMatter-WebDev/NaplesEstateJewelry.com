import type { Metadata } from 'next';
import { Suspense } from 'react';
import { pageMetadata } from '@/lib/seo';
import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';
import {
  PRODUCT_METAL_VARIANTS,
  PUBLIC_SHOP_PRODUCT_STATUSES,
  AVAILABLE_ONLY_SHOP_PRODUCT_STATUSES,
  inferProductJewelryType,
  isProductPurchasable,
  isProductVisibleInShop,
  normalizeProductMetalVariant,
  normalizeProductStatus,
  productMetalVariantLabel,
  productSupportsLinkType,
  productJewelryTypeLabel,
  type Product,
  type ProductStatus,
} from '@/types/product';
import { fetchSpotData } from '@/lib/spot-price';
import { fetchShopVisibilitySettings } from '@/lib/shop-settings';
import { getProductPriceValue } from '@/lib/pricing';
import { compactShopCardProductImages } from '@/lib/shop-card-images';
import ShopProductGrid from '@/components/shop/ShopProductGrid';
import ShopFilters from '@/components/shop/ShopFilters';
import ShopSortSelect from '@/components/shop/ShopSortSelect';
import ShopViewToggle from '@/components/shop/ShopViewToggle';
import ShopYearFilter from '@/components/shop/ShopYearFilter';
import ShopPagination from '@/components/shop/ShopPagination';
import SpotRefreshPill from '@/components/shop/SpotRefreshPill';
import { ShopNavigationProvider, ShopLoadingOverlay, ShopScrollRestoration } from '@/components/shop/ShopNavigationProgress';
import ScriptTagWarningGuard from '@/components/shop/ScriptTagWarningGuard';
import { JEWELRY_ERA_MIN_YEAR, jewelryEraMaxYear, parseYearFilter } from '@/lib/jewelry-eras';
import SiteHeader from '@/components/layout/SiteHeader';
import BreadcrumbTrail from '@/components/BreadcrumbTrail';
import BreadcrumbJsonLd from '@/components/BreadcrumbJsonLd';
import SiteFooter from '@/components/layout/SiteFooter';
import {
  filterAvailableShopItemTypeOptions,
  isShopJewelryItemType,
  normalizeShopFilterState,
  normalizeShopLengthInches,
  normalizeShopStatusFilter,
  normalizeShopWidthRanges,
  productMatchesShopLengthInches,
  productMatchesShopWidthRanges,
} from '@/lib/shop-filter-state';
import { AppIcon } from '@/components/AppIcon';
import { shopSelectPickerCss } from '@/lib/shop-select-picker';

export async function generateShopMetadata({ params }: ShopPageProps): Promise<Metadata> {
  const { locale } = await params;
  const isEs = locale === 'es';
  return pageMetadata({
    title: isEs ? 'Comprar Joyería de Patrimonio en Naples, FL' : 'Shop Estate Jewelry in Naples, FL',
    description: isEs
      ? 'Explore joyería de oro, cadenas, pulseras y anillos de patrimonio con precios vinculados al valor spot del oro.'
      : 'Browse estate gold jewelry, chains, bracelets, and rings with live gold-spot pricing on every piece.',
    path: '/shop',
    locale,
  });
}

export interface ShopPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    metal?: string;
    metalColor?: string;
    metalType?: string;
    purity?: string;
    status?: string;
    itemType?: string;
    chainType?: string;
    length?: string | string[];
    width?: string | string[];
    gender?: string;
    brand?: string;
    q?: string;
    sort?: string;
    page?: string;
    perPage?: string;
    priceMin?: string;
    priceMax?: string;
    yearMin?: string;
    yearMax?: string;
    itemGroup?: string;
    view?: string;
  }>;
}

const CHAIN_KEYWORDS: Record<string, string[]> = {
  'cuban-link':    ['cuban'],
  'figaro-link':   ['figaro'],
  'rope-chain':    ['rope'],
  'anchor-link':   ['anchor', 'gucci'],
  'oval-link':     ['oval link'],
  'byzantine-link':['byzantine'],
  'box-link':      ['box link'],
};

const ITEM_TYPE_KEYWORDS: Record<string, string[]> = {
  necklace: ['necklace', 'chain'],
  bracelet: ['bracelet', 'bangle'],
  earrings: ['earring', 'earrings'],
  ring: ['ring'],
  pendant: ['pendant'],
  charm: ['charm', 'charms'],
  brooch: ['brooch', 'pin'],
  cufflinks: ['cufflink', 'cufflinks'],
  watch: ['watch', 'wristwatch', 'wrist watch', 'timepiece'],
  coin: ['coin'],
  silverware: ['silverware', 'flatware', 'hollowware'],
};

const ITEM_TYPE_VALUES: Record<string, ReturnType<typeof inferProductJewelryType>> = {
  necklace: 'Necklace',
  bracelet: 'Bracelet',
  earrings: 'Earrings',
  ring: 'Ring',
  pendant: 'Pendant',
  charm: 'Charm',
  brooch: 'Brooch',
  cufflinks: 'Cufflinks',
  watch: 'Watch',
  coin: 'Coin',
  silverware: 'Silverware',
};

// "Jewelry & Watches" covers wearable jewelry plus watches. Everything else —
// coins, bullion, silverware, and any tableware/hollowware type (spoons, trays,
// goblets, cups, etc.) — belongs to the "Sterling Silver" group. The split is
// binary: anything that is not a jewelry/watch type falls into Sterling Silver.
function slugifyItemType(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getProductItemTypeKey(product: Product): string | undefined {
  const productType = inferProductJewelryType(product);
  return Object.entries(ITEM_TYPE_VALUES).find(([, type]) => type === productType)?.[0] ?? slugifyItemType(productType);
}

function productMatchesItemGroup(product: Product, itemGroup: string | undefined): boolean {
  if (!itemGroup) return true;
  const typeKey = getProductItemTypeKey(product);
  if (!typeKey) return false;
  if (itemGroup === 'jewelry') return isShopJewelryItemType(typeKey);
  if (itemGroup === 'everything-else') return !isShopJewelryItemType(typeKey);
  return true;
}

function getShopItemTypeOptions(products: Product[]) {
  const knownOrder = ['necklace', 'bracelet', 'earrings', 'ring', 'pendant', 'charm', 'brooch', 'cufflinks', 'watch', 'coin', 'silverware'];
  const knownOptions: Record<string, { value: string; label: string; labelEs: string }> = {
    necklace: { value: 'necklace', label: 'Necklaces', labelEs: 'Collares' },
    bracelet: { value: 'bracelet', label: 'Bracelets', labelEs: 'Pulseras' },
    earrings: { value: 'earrings', label: 'Earrings', labelEs: 'Aretes' },
    ring: { value: 'ring', label: 'Rings', labelEs: 'Anillos' },
    pendant: { value: 'pendant', label: 'Pendants', labelEs: 'Dijes' },
    charm: { value: 'charm', label: 'Charms', labelEs: 'Charms' },
    brooch: { value: 'brooch', label: 'Brooches', labelEs: 'Broches' },
    cufflinks: { value: 'cufflinks', label: 'Cufflinks', labelEs: 'Gemelos' },
    watch: { value: 'watch', label: 'Watches', labelEs: 'Relojes' },
    coin: { value: 'coin', label: 'Coins', labelEs: 'Monedas' },
    silverware: { value: 'silverware', label: 'Silverware / Sterling', labelEs: 'Platería / sterling' },
  };
  const dynamic = products
    .map((product) => {
      const productType = inferProductJewelryType(product);
      const value = getProductItemTypeKey(product);
      if (!value || value === 'other' || knownOptions[value]) return null;
      const label = productJewelryTypeLabel(productType, 'en');
      return { value, label, labelEs: label };
    })
    .filter((option): option is { value: string; label: string; labelEs: string } => Boolean(option));
  const uniqueDynamic = Array.from(new Map(dynamic.map((option) => [option.value, option])).values())
    .sort((a, b) => a.label.localeCompare(b.label));
  const presentItemTypes = products
    .map(getProductItemTypeKey)
    .filter((value): value is string => Boolean(value));
  const availableKnownOptions = filterAvailableShopItemTypeOptions(
    knownOrder.map((value) => knownOptions[value]),
    presentItemTypes,
  );
  return [...availableKnownOptions, ...uniqueDynamic];
}

function getProductLinkType(product: Product): string {
  const jewelryType = inferProductJewelryType(product);
  if (!productSupportsLinkType(jewelryType)) return '';
  return product.chain_type ?? (product.tags ?? []).find((t: string) => t.startsWith('ct:'))?.slice(3) ?? '';
}

const NECKLACE_LENGTH_VALUES = ['16 in', '18 in', '20 in', '22 in', '24 in', '26 in', '28 in', '30 in'];
const BRACELET_LENGTH_VALUES = ['7 in', '7.5 in', '8 in'];

function getAllowedLengthValues(itemType: string | undefined): string[] {
  if (itemType === 'necklace') return NECKLACE_LENGTH_VALUES;
  if (itemType === 'bracelet') return BRACELET_LENGTH_VALUES;
  return [];
}

function getEffectiveMetalColor(metal: string | undefined, metalColor: string | undefined): string | undefined {
  if (!metalColor) return undefined;
  if (metal === 'gold') {
    return PRODUCT_METAL_VARIANTS.Gold.some((variant) => variant.value === metalColor) ? metalColor : undefined;
  }
  if (metal === 'silver') {
    return PRODUCT_METAL_VARIANTS.Silver.some((variant) => variant.value === metalColor) ? metalColor : undefined;
  }
  return [...PRODUCT_METAL_VARIANTS.Gold, ...PRODUCT_METAL_VARIANTS.Silver].some((variant) => variant.value === metalColor)
    ? metalColor
    : undefined;
}

function productMatchesBroadMetal(product: Product, metal: string | undefined): boolean {
  if (!metal) return true;
  const metalVariant = normalizeProductMetalVariant(product.metal_variant, product.category);
  if (metalVariant === 'bicolor_gold') return metal === 'gold' || metal === 'silver';
  if (metal === 'gold') return product.category === 'Gold';
  if (metal === 'silver') return product.category === 'Silver';
  return true;
}

function isVisibleInPublicGallery(product: Product): boolean {
  return isProductVisibleInShop(product.status);
}

function parsePriceLabel(value: string | null): number | null {
  if (!value) return null;
  const match = value.replace(/,/g, '').match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function getSortablePrice(product: Product, spotData: Awaited<ReturnType<typeof fetchSpotData>>): number | null {
  return getProductPriceValue(product, spotData)
    ?? parsePriceLabel(product.manual_price_label ?? product.price_label);
}

function compareNullableNumbers(
  a: number | null | undefined,
  b: number | null | undefined,
  direction: 'asc' | 'desc',
) {
  const aMissing = a == null || Number.isNaN(a);
  const bMissing = b == null || Number.isNaN(b);
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  return direction === 'asc' ? a - b : b - a;
}

const PER_PAGE_OPTIONS = [12, 24, 48, 96];
const DEFAULT_PER_PAGE = 24;
const SHOP_PRODUCT_COLUMNS = [
  'id',
  'category',
  'metal_type',
  'metal_variant',
  'title',
  'title_es',
  'price_label',
  'manual_price_label',
  'price_mode',
  'purity',
  'weight_grams',
  'inventory_number',
  'sku',
  'slug',
  'gram_weight',
  'brand',
  'product_type',
  'jewelry_type',
  'chain_type',
  'length',
  'width_mm',
  'pricing_multiplier',
  'sold_price',
  'status',
  'images',
  'image_urls',
  'image_padding',
  'image_padding_by_image',
  'tags',
  'tags_es',
  'gender',
  'item_year',
  'quantity',
  'sort_order',
  'created_at',
].join(', ');
const SHOP_PRODUCT_COLUMNS_WITHOUT_ITEM_YEAR = SHOP_PRODUCT_COLUMNS
  .split(', ')
  .filter((column) => column !== 'item_year' && column !== 'quantity' && column !== 'sold_price' && column !== 'width_mm')
  .join(', ');

// Narrow column set for the facet-only catalog fetch (Brand + Item Type dropdown
// options — see the "Facet dropdowns" comment below). That result only ever feeds
// inferProductJewelryType/getProductItemTypeKey/brand grouping, never a rendered
// product card, so the heavy image columns and every field only pricing/grid/
// detail views need are safely dropped — cuts this fetch's payload as the catalog
// grows, without touching the main catalog fetch or any filter/sort logic at all.
const SHOP_FACET_COLUMNS = [
  'id',
  'status',
  'category',
  'metal_variant',
  'title',
  'title_es',
  'brand',
  'product_type',
  'jewelry_type',
  'chain_type',
  'tags',
  'tags_es',
].join(', ');

function isMissingItemYearColumnError(error: { message?: string | null } | null | undefined) {
  return Boolean(error?.message?.toLowerCase().includes('item_year'))
    || Boolean(error?.message?.toLowerCase().includes('quantity'))
    || Boolean(error?.message?.toLowerCase().includes('sold_price'))
    || Boolean(error?.message?.toLowerCase().includes('width_mm'));
}

// The catalog read is the single most expensive part of a cold /shop render: a
// column-narrowed scan of every public product, plus the total-inventory count.
// Wrapping it in unstable_cache means concurrent cold visitors (the common case
// for an external link) share ONE DB round trip per 300s window instead of each
// triggering a fresh full-table scan. Keyed by the DB-level filter set so every
// distinct filtered view still gets a correct, independently-cached result.
type ShopCatalogFilterKey = {
  status: string | null;
  purity: string | null;
  metalColor: string | null;
  metal: string | null;
  brand: string | null;
};

async function queryShopCatalog(filterKey: ShopCatalogFilterKey, columns: string, columnsWithoutItemYear: string) {
  const supabase = createPublicClient();

  // Admin-controlled: when "show sold items" is off, the gallery lists available
  // pieces only. Defaults to showing sold (the settings read degrades to true if
  // the setting/table is missing). This read is inside the cached function; the
  // admin toggle busts the `shop-catalog` tag so a change takes effect promptly.
  const visibility = await fetchShopVisibilitySettings(supabase);
  const visibleStatuses = visibility.showSoldItems
    ? [...PUBLIC_SHOP_PRODUCT_STATUSES]
    : [...AVAILABLE_ONLY_SHOP_PRODUCT_STATUSES];

  const buildProductQuery = (columns: string) => {
    let query = supabase
      .from('products')
      .select(columns)
      .in('status', visibleStatuses)
      .order('sort_order', { ascending: true });
    if (filterKey.status) {
      query = query.eq('status', normalizeProductStatus(filterKey.status as ProductStatus));
    }
    if (filterKey.purity) {
      query = query.eq('purity', parseInt(filterKey.purity, 10));
    }
    if (filterKey.metalColor) {
      query = query.eq('metal_variant', filterKey.metalColor);
    } else if (filterKey.metal === 'gold') {
      query = query.eq('category', 'Gold');
    } else if (filterKey.metal === 'silver') {
      query = query.or('category.eq.Silver,metal_variant.eq.bicolor_gold');
    }
    if (filterKey.brand) {
      query = query.eq('brand', filterKey.brand);
    }
    return query;
  };

  // Products + total-inventory count run concurrently.
  const [productResult, totalInventoryResult] = await Promise.all([
    buildProductQuery(columns),
    supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .in('status', visibleStatuses),
  ]);

  let products = productResult.data as unknown[] | null;
  let errorMessage = productResult.error?.message ?? null;
  if (isMissingItemYearColumnError(productResult.error)) {
    const fallback = await buildProductQuery(columnsWithoutItemYear);
    products = (fallback.data as unknown[] | null)?.map(
      (product) => ({ ...(product as Record<string, unknown>), item_year: null, quantity: 1, sold_price: null, width_mm: null }),
    ) ?? null;
    errorMessage = fallback.error?.message ?? null;
  }

  return {
    products: (products ?? []) as unknown[],
    errorMessage,
    totalInventoryCount: totalInventoryResult.count ?? null,
    hideSoldItemPrices: visibility.hideSoldItemPrices,
  };
}

function loadShopCatalog(filterKey: ShopCatalogFilterKey, variant: 'full' | 'facet' = 'full') {
  const columns = variant === 'facet' ? SHOP_FACET_COLUMNS : SHOP_PRODUCT_COLUMNS;
  // The facet-only column set never includes item_year/quantity, so there is
  // nothing narrower to fall back to if a column is unexpectedly missing —
  // reuse the same list and let the (extremely unlikely, schema-drift-only)
  // error surface as errorMessage rather than silently retrying with itself.
  const columnsWithoutItemYear = variant === 'facet' ? SHOP_FACET_COLUMNS : SHOP_PRODUCT_COLUMNS_WITHOUT_ITEM_YEAR;
  return unstable_cache(
    () => queryShopCatalog(filterKey, columns, columnsWithoutItemYear),
    ['shop-catalog', JSON.stringify(filterKey), variant],
    { revalidate: 300, tags: ['shop-catalog'] },
  )();
}

function parsePerPage(value: string | undefined): number {
  const parsed = Number(value);
  return PER_PAGE_OPTIONS.includes(parsed) ? parsed : DEFAULT_PER_PAGE;
}

function parsePage(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function parsePriceFilter(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export async function renderShopPage({
  params,
  searchParams,
  variant = 'classic',
}: ShopPageProps & { variant?: 'classic' | 'modern' }) {
  const { locale } = await params;
  const rawFilters = await searchParams;
  // A bare /shop (no category selected) shows everything across both groups —
  // neither Jewelry & Watches nor Sterling Silver is preselected. Only the
  // Sterling Silver group forces the metal scope to silver.
  let filters = {
    ...normalizeShopFilterState(rawFilters),
    status: normalizeShopStatusFilter(rawFilters.status),
  };
  const selectedMetalColor = getEffectiveMetalColor(filters.metal, filters.metalColor ?? filters.metalType);

  // The DB-level filter set that defines this catalog read. The cached loader is
  // keyed by exactly these values, so a bare /shop and each filtered view get
  // their own shared-across-visitors cache entry. The spot-price fetch (its own
  // 300s fetch cache) runs concurrently and is intentionally NOT part of the key.
  // Sanitize free-text filters BEFORE they become part of the cache key. `brand`
  // is user-supplied free text; left raw, `?brand=<random>` produces an unbounded
  // number of distinct cache entries (each a fresh DB read), turning the shared
  // catalog cache into per-request load. Bound its length and constrain `metal`
  // to the two real values so junk querystrings collapse to the unfiltered key.
  const safeBrand = (() => {
    const v = (filters.brand ?? '').trim().slice(0, 60);
    return v || null;
  })();
  const safeMetal = filters.metal === 'gold' || filters.metal === 'silver' ? filters.metal : null;

  const catalogFilterKey: ShopCatalogFilterKey = {
    status: filters.status ?? null,
    purity: filters.purity ?? null,
    metalColor: selectedMetalColor || null,
    metal: safeMetal,
    brand: safeBrand,
  };

  // Facet dropdowns (Brand, Item Type) must always list every choice available
  // in the catalog, not just what remains after the *other* filters the visitor
  // already picked — otherwise picking one value quietly narrows another
  // dropdown, forcing a reset back to "All" before you can pick something else.
  // So facet options are always computed from a fully unfiltered catalog fetch,
  // never from `collectionProducts` (which has the active filters baked in at
  // the DB level). When the visitor has no filters active, that unfiltered
  // fetch is the exact same cache entry as the main catalog read, so no extra
  // DB round trip happens in the common case.
  const unfilteredCatalogKey: ShopCatalogFilterKey = { status: null, purity: null, metalColor: null, metal: null, brand: null };
  const catalogIsUnfiltered = JSON.stringify(catalogFilterKey) === JSON.stringify(unfilteredCatalogKey);

  const [catalog, facetCatalog, spotData] = await Promise.all([
    loadShopCatalog(catalogFilterKey),
    catalogIsUnfiltered ? Promise.resolve(null) : loadShopCatalog(unfilteredCatalogKey, 'facet'),
    fetchSpotData(),
  ]);

  const error = catalog.errorMessage;
  // Total public inventory, independent of the active filters/metal scope — the
  // "Showing X of Y pieces" denominator reflects the whole shop, not the
  // currently filtered collection.
  const totalInventoryCount = catalog.totalInventoryCount;
  const allProducts: Product[] = catalog.products as unknown as Product[];
  const publicGalleryProducts = allProducts.filter(isVisibleInPublicGallery);
  const collectionProducts = publicGalleryProducts;
  const facetProducts: Product[] = (
    (catalogIsUnfiltered ? catalog : facetCatalog)!.products as unknown as Product[]
  ).filter(isVisibleInPublicGallery);
  const itemTypeOptions = getShopItemTypeOptions(facetProducts);
  if (filters.itemType && !itemTypeOptions.some((option) => option.value === filters.itemType)) {
    filters = { ...filters, itemType: undefined, chainType: undefined, length: undefined, width: undefined };
  }
  const brandOptions = Array.from(new Set(
    facetProducts
      .map((product) => product.brand?.trim())
      .filter(Boolean) as string[],
  ));
  if (filters.brand && !brandOptions.includes(filters.brand)) brandOptions.push(filters.brand);
  brandOptions.sort((a, b) => a.localeCompare(b));
  const selectedLengthInches = normalizeShopLengthInches(filters.length);
  const allowedLengthInches = normalizeShopLengthInches(getAllowedLengthValues(filters.itemType));
  const effectiveSelectedLengths = selectedLengthInches.filter((length) => allowedLengthInches.includes(length));
  const effectiveSelectedWidthRanges = normalizeShopWidthRanges(filters.width);
  const publicPrices = collectionProducts
    .map((product) => getSortablePrice(product, spotData))
    .filter((price): price is number => price != null && Number.isFinite(price));
  const priceRange = publicPrices.length > 0
    ? {
        min: Math.floor(Math.min(...publicPrices) / 50) * 50,
        max: Math.ceil(Math.max(...publicPrices) / 50) * 50,
      }
    : null;
  const parsedPriceMin = parsePriceFilter(filters.priceMin);
  const parsedPriceMax = parsePriceFilter(filters.priceMax);
  const selectedPriceMin = priceRange && parsedPriceMin != null
    ? Math.min(Math.max(parsedPriceMin, priceRange.min), priceRange.max)
    : null;
  const selectedPriceMax = priceRange && parsedPriceMax != null
    ? Math.min(Math.max(parsedPriceMax, priceRange.min), priceRange.max)
    : null;
  const effectivePriceMin = selectedPriceMin != null && selectedPriceMax != null
    ? Math.min(selectedPriceMin, selectedPriceMax)
    : selectedPriceMin;
  const effectivePriceMax = selectedPriceMin != null && selectedPriceMax != null
    ? Math.max(selectedPriceMin, selectedPriceMax)
    : selectedPriceMax;

  // Era / year range. Bounds run from the start of the Victorian era to the
  // current year. A blank or full-span selection shows everything (including
  // items with no year yet). The lower handle at the floor means "1837 &
  // earlier", so it imposes no lower limit (pre-Victorian pieces stay visible);
  // likewise the upper handle at the ceiling imposes no upper limit. A bound is
  // only enforced when its handle sits strictly inside the full span.
  const yearMinBound = JEWELRY_ERA_MIN_YEAR;
  const yearMaxBound = jewelryEraMaxYear(new Date().getFullYear());
  const clampYear = (year: number) => Math.min(Math.max(year, yearMinBound), yearMaxBound);
  const parsedYearMin = parseYearFilter(filters.yearMin);
  const parsedYearMax = parseYearFilter(filters.yearMax);
  const selectedYearMin = parsedYearMin != null ? clampYear(parsedYearMin) : null;
  const selectedYearMax = parsedYearMax != null ? clampYear(parsedYearMax) : null;
  const effectiveYearMin = selectedYearMin != null ? Math.min(selectedYearMin, selectedYearMax ?? yearMaxBound) : null;
  const effectiveYearMax = selectedYearMax != null ? Math.max(selectedYearMax, selectedYearMin ?? yearMinBound) : null;
  const yearLowerLimit = effectiveYearMin != null && effectiveYearMin > yearMinBound ? effectiveYearMin : null;
  const yearUpperLimit = effectiveYearMax != null && effectiveYearMax < yearMaxBound ? effectiveYearMax : null;
  const isYearFilterActive = yearLowerLimit != null || yearUpperLimit != null;

  const filtered = collectionProducts.filter((p) => {
    if (filters.metal) {
      if (!productMatchesBroadMetal(p, filters.metal)) return false;
    }
    if (selectedMetalColor && normalizeProductMetalVariant(p.metal_variant, p.category) !== selectedMetalColor) {
      return false;
    }
    if (filters.purity) {
      if (p.purity !== parseInt(filters.purity)) return false;
    }
    if (filters.status && normalizeProductStatus(p.status) !== normalizeProductStatus(filters.status as ProductStatus)) return false;
    if (!productMatchesItemGroup(p, filters.itemGroup)) return false;
    if (filters.itemType && filters.itemType !== 'all') {
      const selectedJewelryType = ITEM_TYPE_VALUES[filters.itemType];
      if (selectedJewelryType && inferProductJewelryType(p) !== selectedJewelryType) return false;
      const kws = ITEM_TYPE_KEYWORDS[filters.itemType];
      if (!selectedJewelryType && !kws && getProductItemTypeKey(p) !== filters.itemType) return false;
      if (!selectedJewelryType && kws) {
        const txt = [p.title, p.title_es, p.chain_type, p.length, ...(p.tags ?? []), ...(p.tags_es ?? [])].join(' ').toLowerCase();
        if (!kws.some(k => txt.includes(k))) return false;
      }
    }
    if (filters.q) {
      const q = filters.q.toLowerCase();
      const txt = [p.title, p.title_es, p.brand, p.inventory_number, p.sku, productMetalVariantLabel(p.metal_variant, p.category), p.chain_type, p.length, ...(p.tags ?? []), ...(p.tags_es ?? [])].join(' ').toLowerCase();
      if (!txt.includes(q)) return false;
    }
    if (filters.chainType && (filters.itemType === 'necklace' || filters.itemType === 'bracelet')) {
      const kws = CHAIN_KEYWORDS[filters.chainType];
      if (kws) {
        if (!productSupportsLinkType(inferProductJewelryType(p))) return false;
        const txt = [getProductLinkType(p), ...(p.tags ?? [])].join(' ').toLowerCase();
        if (!kws.some(k => txt.includes(k))) return false;
      }
    }
    if (effectiveSelectedLengths.length > 0) {
      const lenTag = p.length ?? (p.tags ?? []).find((t: string) => t.startsWith('len:'))?.slice(4);
      if (!productMatchesShopLengthInches(lenTag, effectiveSelectedLengths)) return false;
    }
    if (!productMatchesShopWidthRanges(p.width_mm, effectiveSelectedWidthRanges)) return false;
    if (filters.gender && filters.itemGroup !== 'everything-else') {
      const g = p.gender ?? 'Unisex';
      // Unisex items appear in all gender categories
      if (g !== 'Unisex' && g !== filters.gender) return false;
    }
    if (filters.brand && p.brand?.trim() !== filters.brand) return false;
    if (isYearFilterActive) {
      if (p.item_year == null) return false;
      if (yearLowerLimit != null && p.item_year < yearLowerLimit) return false;
      if (yearUpperLimit != null && p.item_year > yearUpperLimit) return false;
    }
    if (effectivePriceMin != null || effectivePriceMax != null) {
      const price = getSortablePrice(p, spotData);
      if (price == null) return false;
      if (effectivePriceMin != null && price < effectivePriceMin) return false;
      if (effectivePriceMax != null && price > effectivePriceMax) return false;
    }
    return true;
  });

  // Available items first, then selected sort within each group.
  const sorted = [...filtered].sort((a, b) => {
    const aPurchasable = isProductPurchasable(a.status, a.quantity);
    const bPurchasable = isProductPurchasable(b.status, b.quantity);
    if (aPurchasable !== bPurchasable) return aPurchasable ? -1 : 1;
    if (filters.sort === 'newest') {
      // "Newest arrivals" = most recently created listing first. New listings
      // are appended at the END of inventory order (sort_order = max + 1), so
      // this is the only way a shopper sees what just came in. Rows that share
      // a created_at (the bulk imports) fall through to sort_order, newest last
      // there too, so the tie-break is reversed as well.
      const byCreated = compareNullableNumbers(
        Date.parse(a.created_at),
        Date.parse(b.created_at),
        'desc',
      );
      if (byCreated !== 0) return byCreated;
      return (b.sort_order ?? 0) - (a.sort_order ?? 0);
    }
    if (filters.sort === 'weight-asc' || filters.sort === 'weight-desc') {
      const byWeight = compareNullableNumbers(
        a.gram_weight ?? a.weight_grams,
        b.gram_weight ?? b.weight_grams,
        filters.sort === 'weight-asc' ? 'asc' : 'desc',
      );
      if (byWeight !== 0) return byWeight;
    }
    if (filters.sort === 'price-asc' || filters.sort === 'price-desc') {
      const byPrice = compareNullableNumbers(
        getSortablePrice(a, spotData),
        getSortablePrice(b, spotData),
        filters.sort === 'price-asc' ? 'asc' : 'desc',
      );
      if (byPrice !== 0) return byPrice;
    }
    if (filters.sort === 'brand-asc' || filters.sort === 'brand-desc') {
      const aBrand = a.brand?.trim() ?? '';
      const bBrand = b.brand?.trim() ?? '';
      if (!aBrand && bBrand) return 1;
      if (aBrand && !bBrand) return -1;
      const byBrand = aBrand.localeCompare(bBrand, undefined, { sensitivity: 'base' });
      if (byBrand !== 0) return filters.sort === 'brand-asc' ? byBrand : -byBrand;
    }
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });

  const perPage = parsePerPage(filters.perPage);
  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
  const currentPage = Math.min(parsePage(filters.page), totalPages);
  const startIndex = (currentPage - 1) * perPage;
  const paginatedProducts = sorted
    .slice(startIndex, startIndex + perPage)
    .map(compactShopCardProductImages);
  const showingStart = sorted.length === 0 ? 0 : startIndex + 1;
  const showingEnd = startIndex + paginatedProducts.length;

  const isEs = locale === 'es';
  // One crumbs array feeds both BreadcrumbJsonLd tags and the visible trail.
  const crumbs = [{ name: isEs ? 'Tienda' : 'Shop', path: '/shop' }];
  const isModern = variant === 'modern';
  const view: 'gallery' | 'list' = filters.view === 'list' ? 'list' : 'gallery';
  const isSilverTableware = false;
  const heroContent = isSilverTableware
    ? {
        eyebrow: isEs ? 'Platería sterling seleccionada' : 'Curated sterling silver',
        title: isEs ? 'Platería Sterling y Más' : 'Sterling Tableware & More',
        copy: isEs
          ? 'Explore piezas hermosas de plata sterling para la mesa y el hogar, seleccionadas por su calidad, historia, utilidad y valor.'
          : 'Browse beautiful sterling silver pieces for the table and home, chosen for quality, history, usefulness, and value.',
        points: [
          {
            icon: 'diamond',
            label: isEs ? 'Belleza de herencia' : 'Heirloom beauty',
            copy: isEs
              ? 'Bandejas, copas, cubiertos y objetos sterling con carácter real, hechos para usarse, regalarse y conservarse.'
              : 'Trays, cups, flatware, and sterling objects with real character, made to be used, gifted, and kept.',
          },
          {
            icon: 'savings',
            label: isEs ? 'Precios razonables' : 'Reasonable prices',
            copy: isEs
              ? 'Compramos con cuidado y mantenemos precios prácticos, para que piezas finas de plata sterling sigan siendo alcanzables.'
              : 'We buy carefully and price practically, so fine sterling pieces remain attainable rather than inflated.',
          },
          {
            icon: 'visibility',
            label: isEs ? 'Compra transparente' : 'Transparent buying',
            copy: isEs
              ? 'Los listados muestran fotos claras, detalles útiles y contexto honesto para que sepa exactamente qué está viendo.'
              : 'Listings show clear photos, useful details, and honest context so you know exactly what you are viewing.',
          },
        ],
      }
    : {
        eyebrow: isEs ? 'Una forma más inteligente de poseer oro' : 'A smarter way to own precious metals',
        title: isEs ? 'No solo compres. Invierte.' : "Don't just buy. Invest.",
        copy: isEs
          ? 'Cada pieza tiene precio en vivo contra el mercado spot del oro, con el valor exacto de chatarra de oro mostrado junto a tu precio. No solo compras joyería — estás poniendo tu dinero en oro real y usable a un valor que puedes verificar.'
          : "Every piece is priced live against the metals spot market, with the exact scrap value shown right next to your price. You're not just shopping — you're putting your money into something useful at a value you can verify.",
        points: [
          {
            icon: 'monitoring',
            label: isEs ? 'Precios en vivo' : 'Live spot prices',
            copy: isEs
              ? 'Los valores del oro se actualizan mientras compras, usando los mismos datos del mercado que impulsan cada listado.'
              : 'Spot values update as you shop, using the same market data that powers each listing.',
          },
          {
            icon: 'sell',
            label: isEs ? 'Chatarra y precio' : 'Scrap and price',
            copy: isEs
              ? 'Cada listado muestra el valor exacto de chatarra de oro junto a tu precio — nada oculto.'
              : 'Each listing shows the exact precious metal scrap value next to your price — nothing hidden.',
          },
          {
            icon: 'auto_awesome',
            label: isEs ? 'En cada página' : 'On every product page',
            copy: isEs
              ? 'Ve el multiplicador spot detrás de cada precio — y pregunta cómo cambiar tu propio oro o plata puede reducirlo.'
              : 'See the spot multiplier behind every price — and ask how trading in your own gold or silver can lower it.',
          },
        ],
      };

  const investStyle = {
    border: '1px solid rgba(115, 92, 0, 0.24)',
    background: 'linear-gradient(135deg, #fffdf7 0%, #f7f2e4 100%)',
  };

  if (error) {
    return (
      <>
        <BreadcrumbJsonLd locale={locale} crumbs={crumbs} />
        <SiteHeader />
        <main className="ultrawide-page-wide pt-28 md:pt-32 pb-16 px-4 md:px-8 max-w-7xl mx-auto">
          <p style={{ color: 'var(--color-error)' }}>Failed to load products. Please try again.</p>
        </main>
      </>
    );
  }

  // Piece count shown in the results toolbar on mobile/tablet (on desktop it
  // stays in the filter sidebar). Mirrors the count in ShopFilters exactly.
  const resultsAllCount = totalInventoryCount ?? collectionProducts.length;
  const resultsCountLabel = isEs
    ? (sorted.length === resultsAllCount ? `${resultsAllCount} piezas` : `${sorted.length} de ${resultsAllCount} piezas`)
    : (sorted.length === resultsAllCount ? `${resultsAllCount} pieces` : `${sorted.length} of ${resultsAllCount} pieces`);

  return (
    <>
      <BreadcrumbJsonLd locale={locale} crumbs={crumbs} />
      <SiteHeader />
      <main className={isModern ? 'modern-shop-page pt-20 md:pt-28 pb-20' : 'pt-20 md:pt-32 pb-20'} suppressHydrationWarning>
        {isModern && (
          // Blocking inline script (runs before the hero/filters below are painted) so a
          // reload or quick return within the same tab session skips the entry animation
          // instead of replaying it — sessionStorage persists across reloads/back-forward
          // navigation but resets for a genuinely new tab, so first-time visitors still get
          // the full reveal. Mutates this <main> node directly via document.currentScript,
          // which is why suppressHydrationWarning is set above (React never expects this
          // extra class from its own render). ScriptTagWarningGuard filters
          // the known-false-positive React 19 dev warning this raw <script>
          // triggers on hydration — see its own file for the full writeup.
          <>
            <ScriptTagWarningGuard />
            <script
              dangerouslySetInnerHTML={{
                __html: "try{if(sessionStorage.getItem('shopHeroSeen')){document.currentScript.parentElement.classList.add('shop-repeat-visit')}else{sessionStorage.setItem('shopHeroSeen','1')}}catch(e){}",
              }}
            />
          </>
        )}
        <h1 className="sr-only">
          {locale === 'es' ? 'Comprar Joyería de Patrimonio en Naples, FL' : 'Shop Estate Jewelry in Naples, FL'}
        </h1>
        <div className="mx-auto w-full max-w-[2400px] px-[clamp(1rem,3vw,3rem)]">
          <BreadcrumbTrail locale={locale} crumbs={crumbs} tone="light" />

          {/* Investment transparency note */}
          <section
            className={isModern
              ? 'modern-shop-hero shop-entry-reveal shop-entry-reveal-hero mb-6 md:mb-8 overflow-hidden text-left'
              : 'mb-2 md:mb-10 text-center px-3 md:px-5 py-2 md:py-8'}
            style={isModern ? undefined : investStyle}
            aria-labelledby="shop-invest-heading"
          >
            {isModern && <div className="modern-shop-hero-media" aria-hidden="true" />}
            <div className={isModern ? 'modern-shop-hero-content px-6 py-8 md:px-14 md:py-16' : ''}>
            <p
              className="text-[0.55rem] md:text-[0.68rem] font-bold uppercase tracking-[0.22em] mb-0.5 md:mb-2"
              style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}
            >
              {heroContent.eyebrow}
            </p>
            <h2
              id="shop-invest-heading"
              className={isModern
                ? 'responsive-title-lg font-bold mt-3 mb-4 tracking-tight max-w-2xl'
                : 'text-base md:text-4xl font-bold mt-0 mb-0 md:mb-3 tracking-tight'}
              style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
            >
              {heroContent.title}
            </h2>
            <p
              className={isModern
                ? 'hidden md:block text-base leading-8 max-w-xl mb-9'
                : 'hidden md:block text-sm leading-relaxed max-w-2xl mx-auto mb-5'}
              style={{ color: 'var(--color-on-surface-variant)' }}
            >
              {heroContent.copy}
            </p>

            {/* 3-column points — hidden on mobile */}
            <div
              className={isModern
                ? 'hidden md:grid md:grid-cols-3 gap-4 mt-4 max-w-5xl'
                : 'hidden md:grid md:grid-cols-3 gap-3 mt-4 text-center'}
              style={isModern ? undefined : { borderTop: '1px solid rgba(115, 92, 0, 0.16)', paddingTop: '1rem' }}
            >
              {heroContent.points.map(({ icon, label, copy }) => (
                <div
                  key={label}
                  className={isModern ? 'modern-shop-proof-point' : 'py-3 px-2'}
                  style={isModern ? undefined : { borderTop: '1px solid rgba(115, 92, 0, 0.18)' }}
                >
                  {isModern && (
                    <AppIcon name={icon} className="modern-shop-proof-icon" aria-hidden="true" />
                  )}
                  <div>
                  <strong
                    className="block text-[0.68rem] font-bold uppercase tracking-[0.14em] mb-1"
                    style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}
                  >
                    {label}
                  </strong>
                  <span className="text-xs leading-relaxed" style={{ color: 'var(--color-on-surface-variant)' }}>
                    {copy}
                  </span>
                  </div>
                </div>
              ))}
            </div>
            </div>
          </section>

          {/* Spot prices: visible on mobile/tablet only — desktop sees them in
              the sidebar. Tapping a pill refreshes the server-rendered pricing
              (SpotRefreshPill). */}
          {spotData && (
            <div className={isModern ? 'shop-spot-mobile-row shop-entry-reveal shop-entry-reveal-secondary' : 'shop-spot-mobile-row'}>
              <SpotRefreshPill
                isEs={isEs}
                label={isEs ? 'Plata / oz' : 'Silver / oz'}
                ariaLabel={isEs ? 'Precio de plata en vivo por onza troy' : 'Live silver price per troy ounce'}
                display={spotData.silverPerTroyOz
                  ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: spotData.silverPerTroyOz >= 100 ? 0 : 2 }).format(spotData.silverPerTroyOz)
                  : '--'}
                containerStyle={{
                  padding: '0.42rem 0.7rem',
                  textAlign: 'center',
                  fontFamily: 'var(--font-label)',
                  border: '1px solid rgba(129, 138, 146, 0.46)',
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.96), rgba(232,236,239,0.82) 48%, rgba(247,248,248,0.96))',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.88), 0 8px 22px rgba(95,105,113,0.08)',
                  borderRadius: 'var(--radius-xl)',
                }}
                labelStyle={{ display: 'block', color: '#58626a', fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.14em', lineHeight: 1, marginBottom: '0.22rem', textTransform: 'uppercase' }}
                priceStyle={{ display: 'block', color: '#3f4a52', fontSize: '0.86rem', fontWeight: 800, lineHeight: 1.05 }}
              />
              <SpotRefreshPill
                isEs={isEs}
                label={isEs ? 'Oro / oz' : 'Gold / oz'}
                ariaLabel={isEs ? 'Precio de oro en vivo por onza troy' : 'Live gold price per troy ounce'}
                display={spotData.goldPerTroyOz
                  ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: spotData.goldPerTroyOz >= 100 ? 0 : 2 }).format(spotData.goldPerTroyOz)
                  : '--'}
                containerStyle={{
                  padding: '0.42rem 0.7rem',
                  textAlign: 'center',
                  fontFamily: 'var(--font-label)',
                  border: '1px solid rgba(181, 137, 12, 0.46)',
                  background: 'linear-gradient(135deg, rgba(255,253,247,0.98), rgba(250,240,201,0.86) 48%, rgba(255,250,235,0.98))',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 8px 22px rgba(143,108,6,0.1)',
                  borderRadius: 'var(--radius-xl)',
                }}
                labelStyle={{ display: 'block', color: '#735c00', fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.14em', lineHeight: 1, marginBottom: '0.22rem', textTransform: 'uppercase' }}
                priceStyle={{ display: 'block', color: '#735c00', fontSize: '0.86rem', fontWeight: 800, lineHeight: 1.05 }}
              />
            </div>
          )}

          <ShopNavigationProvider>
            <ShopScrollRestoration />
            {/* Desktop only: standalone year filter above the catalog */}
            <div className={isModern ? 'shop-year-filter-standalone shop-entry-reveal shop-entry-reveal-secondary' : 'shop-year-filter-standalone'}>
              {/* useSearchParams() (in event handlers only, not the initial render) is
                  wrapped in Suspense defensively; a real per-request render never
                  suspends here. */}
              <Suspense fallback={<div style={{ minHeight: '3.25rem' }} aria-hidden="true" />}>
                <ShopYearFilter
                  key={`${selectedYearMin ?? 'min'}-${selectedYearMax ?? 'max'}`}
                  locale={locale}
                  minYear={yearMinBound}
                  maxYear={yearMaxBound}
                  selectedMin={selectedYearMin}
                  selectedMax={selectedYearMax}
                />
              </Suspense>
            </div>

            <div className="shop-catalog-layout">
              {/* -- Filters ------------------------------------------ */}
              <aside className={isModern ? 'shop-filter-sidebar shop-entry-reveal shop-entry-reveal-results' : 'shop-filter-sidebar'} aria-label={isEs ? 'Filtros de tienda' : 'Shop filters'}>
                <Suspense fallback={<div style={{ minHeight: '32rem' }} aria-hidden="true" />}>
                  <ShopFilters
                    locale={locale}
                    currentFilters={filters}
                    brandOptions={brandOptions}
                    filteredCount={sorted.length}
                    allCount={totalInventoryCount ?? collectionProducts.length}
                    spotData={spotData}
                    priceRange={priceRange}
                    itemTypeOptions={itemTypeOptions}
                    variant={isModern ? 'modern' : 'classic'}
                    yearFilterNode={
                      <ShopYearFilter
                        key={`mobile-${selectedYearMin ?? 'min'}-${selectedYearMax ?? 'max'}`}
                        locale={locale}
                        minYear={yearMinBound}
                        maxYear={yearMaxBound}
                        selectedMin={selectedYearMin}
                        selectedMax={selectedYearMax}
                      />
                    }
                  />
                </Suspense>
              </aside>

              {/* -- Grid --------------------------------------------- */}
              <section className={isModern ? 'min-w-0 shop-results-panel shop-entry-reveal shop-entry-reveal-results' : 'min-w-0 shop-results-panel'}>
                <ShopLoadingOverlay />
                <div className="shop-gallery-toolbar">
                  <div className="shop-toolbar-left">
                    <Suspense fallback={<div style={{ minHeight: '2.26rem', width: '4.4rem' }} aria-hidden="true" />}>
                      <ShopViewToggle locale={locale} currentView={view} />
                    </Suspense>
                    <span className="shop-toolbar-count">{resultsCountLabel}</span>
                  </div>
                  <Suspense fallback={<div style={{ minHeight: '2.25rem', width: '11.5rem' }} aria-hidden="true" />}>
                    <ShopSortSelect locale={locale} currentSort={filters.sort} />
                  </Suspense>
                </div>
                {filtered.length === 0 ? (
                  <p
                    className="py-24 text-center text-sm"
                    style={{ color: 'var(--color-on-surface-variant)' }}
                  >
                    {isEs ? 'Ningún artículo coincide con sus filtros.' : 'No items match your filters.'}
                  </p>
                ) : (
                  <>
                    <ShopProductGrid
                      products={paginatedProducts}
                      spotData={spotData}
                      locale={locale}
                      hideSoldItemPrices={catalog.hideSoldItemPrices}
                      variant={isModern ? 'modern' : 'classic'}
                      view={view}
                    />
                    <Suspense fallback={<div style={{ minHeight: '2.5rem' }} aria-hidden="true" />}>
                      <ShopPagination
                        locale={locale}
                        currentPage={currentPage}
                        perPage={perPage}
                        totalPages={totalPages}
                        totalCount={sorted.length}
                        showingStart={showingStart}
                        showingEnd={showingEnd}
                      />
                    </Suspense>
                  </>
                )}
              </section>
            </div>
          </ShopNavigationProvider>
          <style>{`
            .shop-spot-mobile-row {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 0.65rem;
              max-width: 24rem;
              margin: 0 auto 0.85rem;
              padding: 0 1rem;
            }
            @media (min-width: 1024px) {
              .shop-spot-mobile-row { display: none; }
            }
            .shop-year-filter-standalone { display: block; }
            @media (max-width: 1023px) {
              .shop-year-filter-standalone { display: none; }
            }
            .modern-shop-page {
              background: #ffffff;
            }
            .shop-entry-reveal {
              opacity: 0;
              animation: shop-entry-reveal 620ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
              will-change: opacity, transform, filter;
            }
            /* Top-down cascade: hero first, then the spot-price/era row right below
               it, then the filter sidebar and results grid together (they sit side
               by side on desktop, so they should arrive as one row, not staggered
               against each other). */
            .shop-entry-reveal-hero {
              animation-delay: 80ms;
            }
            .shop-entry-reveal-secondary {
              animation-delay: 200ms;
            }
            .shop-entry-reveal-results {
              animation-delay: 320ms;
            }
            @keyframes shop-entry-reveal {
              from {
                opacity: 0;
                transform: translateY(18px) scale(0.992);
                filter: blur(6px);
              }
              to {
                opacity: 1;
                transform: translateY(0) scale(1);
                filter: blur(0);
              }
            }
            .modern-shop-hero {
              position: relative;
              min-height: clamp(18rem, 38vw, 25rem);
              border: 1px solid rgba(115, 92, 0, 0.15);
              border-radius: var(--radius-xl);
              background: #ffffff;
              box-shadow: 0 18px 52px rgba(42, 34, 12, 0.09);
              isolation: isolate;
            }
            .modern-shop-hero-media {
              position: absolute;
              inset: 0;
              background:
                linear-gradient(90deg, #ffffff 0%, rgba(255, 255, 255, 0.88) 34%, rgba(255, 255, 255, 0.26) 56%, rgba(255, 255, 255, 0.06) 100%),
                url('/assets/images/pages/shop-modern-chain.webp') center right / cover no-repeat;
              z-index: -1;
            }
            .modern-shop-hero-content {
              max-width: 64rem;
            }
            .modern-shop-proof-point {
              display: grid;
              grid-template-columns: 3.25rem 1fr;
              gap: 1rem;
              align-items: start;
              padding: 1rem 1.1rem;
              border-left: 1px solid rgba(115, 92, 0, 0.14);
              background: rgba(255, 253, 248, 0.62);
              backdrop-filter: blur(4px);
            }
            .modern-shop-proof-icon {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              width: 2.75rem;
              height: 2.75rem;
              border-radius: 999px;
              color: #a98208;
              background: rgba(212, 175, 55, 0.14);
              font-size: 1.3rem;
              line-height: 1;
            }
            .modern-shop-page .shop-catalog-layout {
              margin-top: 1.25rem;
            }
            .modern-shop-page .shop-filter-sidebar {
              border: 1px solid rgba(115, 92, 0, 0.14);
              border-radius: var(--radius-xl);
              background: #ffffff;
              box-shadow: 0 12px 34px rgba(42, 34, 12, 0.08);
              padding: 1rem;
            }
            .modern-shop-page .shop-gender-tabs {
              max-width: 42rem;
              margin-bottom: 1.6rem;
              border-radius: var(--radius-xl);
              border-color: rgba(115, 92, 0, 0.12);
              background: rgba(255, 255, 255, 0.78);
              box-shadow: 0 10px 30px rgba(42, 34, 12, 0.08);
              overflow: hidden;
            }
            .modern-shop-page .shop-gender-tab {
              min-height: 2.85rem;
              border-radius: var(--radius-lg);
              letter-spacing: 0.13em;
            }
            .modern-shop-page .shop-gender-tab[data-active="true"] {
              background: linear-gradient(135deg, #dcb336, #b5890c);
              color: #fffdf7;
              border-color: transparent;
              box-shadow: 0 10px 24px rgba(181, 137, 12, 0.18);
            }
            .modern-shop-page .shop-filters {
              margin-bottom: 0 !important;
            }
            .modern-shop-page .shop-filter-toggle-row {
              display: none !important;
            }
            .modern-shop-page .shop-filter-panel {
              display: block !important;
            }
            .modern-shop-page .shop-search-spot-row > div,
            .modern-shop-page .shop-filter-panel {
              border-radius: var(--radius-xl) !important;
            }
            @media (max-width: 767px) {
              .shop-gallery-sort {
                flex: 1;
                min-width: 0;
                justify-content: space-between;
              }
              /* Higher specificity so this wins over the later base
                 .shop-gallery-sort-control min-width rule (min 11.5rem / 56vw) —
                 otherwise the box can't shrink and overflows beside the
                 piece count in the toolbar. The choice sits at the right end. */
              .shop-gallery-toolbar .shop-gallery-sort-control {
                min-width: 0;
                flex: 1;
                justify-content: flex-end;
              }
              /* Merge the hero and the filter card into one seamless card */
              .modern-shop-hero {
                min-height: 0;
                margin-bottom: 0;
                border-bottom: none;
                border-bottom-left-radius: 0;
                border-bottom-right-radius: 0;
                box-shadow: none;
              }
              .modern-shop-hero-content {
                padding-top: 1.35rem !important;
                padding-bottom: 0.6rem !important;
              }
              .modern-shop-page .shop-catalog-layout {
                margin-top: 0;
              }
              .modern-shop-page .shop-filter-sidebar {
                border-top: none;
                border-top-left-radius: var(--radius-xl);
                border-top-right-radius: var(--radius-xl);
              }
              .modern-shop-hero-media {
                opacity: 0.18;
                width: 100%;
              }
              .modern-shop-proof-point {
                grid-template-columns: 1fr;
              }
              /* Hide the gender tabs on mobile (gender stays available in the filters panel) */
              .shop-gender-tabs {
                display: none !important;
              }
              /* Collapse filters behind the toggle button on mobile */
              .modern-shop-page .shop-filter-toggle-row {
                display: flex !important;
              }
              .modern-shop-page .shop-filter-panel {
                display: none !important;
              }
              .modern-shop-page .shop-filter-panel.is-open {
                display: block !important;
              }
            }
            .shop-catalog-layout {
              display: block;
              margin-top: 2rem;
            }
            .shop-results-panel {
              position: relative;
            }
            .shop-gallery-toolbar {
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 0.6rem;
              margin-bottom: 0.8rem;
            }
            .shop-toolbar-left {
              display: inline-flex;
              align-items: center;
              gap: 0.7rem;
              min-width: 0;
            }
            /* Piece count sits beside the view toggle on mobile/tablet; hidden on
               desktop, where the count lives in the filter sidebar instead. */
            .shop-toolbar-count {
              font-family: var(--font-label);
              font-size: 0.75rem;
              color: var(--color-on-surface-variant);
              white-space: nowrap;
            }
            .shop-gallery-sort {
              display: inline-flex;
              align-items: center;
              gap: 0.45rem;
              min-height: 2.25rem;
              max-width: 100%;
              border: 1px solid rgba(115, 92, 0, 0.18);
              border-radius: 7px;
              background: #ffffff;
              box-shadow: 0 8px 18px rgba(42, 34, 12, 0.05);
              color: var(--color-on-surface-variant);
              font-family: var(--font-label);
              padding: 0 0.55rem 0 0.75rem;
            }
            .shop-gallery-sort-label {
              color: var(--color-primary);
              font-size: 0.58rem;
              font-weight: 800;
              letter-spacing: 0.14em;
              line-height: 1;
              text-transform: uppercase;
              white-space: nowrap;
            }
            /* The visible choice is a label; the real select lies over it,
               invisible (ShopSortSelect, owner 2026-10-25 "option B"). The
               words keep the toolbar's 0.78rem bold on every screen, while
               the select is free to be 16px on touch screens (the sitewide
               iOS no-zoom rule in globals.css) — before this, that rule made
               the words themselves 16px bold on a phone. */
            .shop-gallery-sort-control {
              position: relative;
              display: inline-flex;
              align-items: center;
              justify-content: space-between;
              gap: 0.3rem;
              min-width: min(11.5rem, 56vw);
              height: 2.15rem;
              color: var(--color-on-surface);
              cursor: pointer;
              font-family: var(--font-label);
              font-size: 0.78rem;
              font-weight: 800;
            }
            .shop-gallery-sort-value {
              min-width: 0;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }
            .shop-gallery-sort-chevron {
              flex: none;
              width: 0.95rem;
              height: 0.95rem;
            }
            .shop-gallery-sort-control select {
              position: absolute;
              inset: 0;
              width: 100%;
              height: 100%;
              margin: 0;
              opacity: 0;
              border: 0;
              cursor: pointer;
              appearance: none;
            }
            .shop-gallery-sort:has(select:focus-visible) {
              outline: 2px solid color-mix(in srgb, var(--color-primary) 72%, transparent);
              outline-offset: 2px;
            }
            @media (max-width: 440px) {
              .shop-gallery-toolbar {
                align-items: stretch;
                flex-wrap: wrap;
              }
              .shop-toolbar-left {
                flex: 1 1 100%;
                justify-content: space-between;
                width: 100%;
              }
              .shop-gallery-sort {
                flex: 1 1 100%;
                width: 100%;
              }
              .shop-gallery-toolbar .shop-gallery-sort-control {
                min-width: 0;
                width: auto;
                flex: 1;
              }
            }
            .shop-filter-sidebar {
              min-width: 0;
            }
            .shop-product-grid {
              grid-template-columns: repeat(auto-fit, minmax(min(100%, 9.5rem), 1fr));
            }
            .shop-gender-tabs {
              display: grid;
              grid-template-columns: repeat(3, minmax(0, 1fr));
              max-width: 36rem;
              margin: 0 auto 1.15rem;
              padding: 0.25rem;
              border: 1px solid rgba(115, 92, 0, 0.22);
              background: linear-gradient(135deg, rgba(255, 253, 247, 0.92), rgba(247, 242, 228, 0.84));
              box-shadow: 0 14px 34px rgba(48, 38, 12, 0.08);
            }
            .shop-gender-tab {
              min-height: 2.55rem;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              padding: 0.65rem 0.75rem;
              border: 1px solid transparent;
              color: var(--color-on-surface-variant);
              font-family: var(--font-label);
              font-size: 0.72rem;
              font-weight: 800;
              letter-spacing: 0.16em;
              text-transform: uppercase;
              text-decoration: none;
              transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease;
              white-space: nowrap;
            }
            .shop-gender-tab[data-active="true"] {
              background: linear-gradient(135deg, rgba(212, 175, 55, 0.28), rgba(255, 245, 198, 0.72));
              border-color: rgba(115, 92, 0, 0.34);
              color: var(--color-primary);
              box-shadow: 0 8px 22px rgba(115, 92, 0, 0.12);
            }
            .shop-gender-tab:hover {
              background: rgba(212, 175, 55, 0.12);
              color: var(--color-primary);
            }
            @media (min-width: 1024px) {
              .shop-toolbar-count {
                display: none;
              }
              .shop-catalog-layout {
                display: grid;
                grid-template-columns: minmax(17rem, 19rem) minmax(0, 1fr);
                align-items: start;
                gap: 1.5rem;
              }
              .modern-shop-page .shop-filter-sidebar {
                margin-top: 0;
              }
              .shop-filter-sidebar {
                position: sticky;
                top: 6.5rem;
                align-self: start;
                /* svh, NOT dvh. dvh tracks the CURRENT viewport, so in an
                   in-app browser (Instagram/Facebook) this sticky, scrollable
                   panel resized on every toolbar hide/show — i.e. continuously
                   while scrolling — and visibly stuttered. svh is measured
                   against fully-expanded chrome and does not move. The plain vh
                   line stays as the fallback for anything without svh. */
                max-height: calc(100vh - 7.5rem);
                max-height: calc(100svh - 7.5rem);
                overflow-y: auto;
                scrollbar-color: rgba(115, 92, 0, 0.34) transparent;
                scrollbar-gutter: stable;
                scrollbar-width: thin;
              }
              .shop-filter-sidebar::-webkit-scrollbar {
                width: 0.45rem;
              }
              .shop-filter-sidebar::-webkit-scrollbar-thumb {
                border-radius: 999px;
                background: rgba(115, 92, 0, 0.34);
              }
              .shop-filter-sidebar::-webkit-scrollbar-track {
                background: transparent;
              }
              /* Gender is handled by the sidebar buttons, so hide the redundant toggle */
              .modern-shop-page .shop-gender-tabs {
                display: none;
              }
              .shop-product-grid {
                grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
              }
            }
            @media (min-width: 1280px) {
              .shop-product-grid {
                grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
              }
            }
            @media (min-width: 768px) and (max-width: 1023px) {
              /* Tablet: the sidebar gender buttons cover gender, so hide the redundant tabs */
              .shop-gender-tabs {
                display: none !important;
              }
              /* Tablet: collapse the filters behind the toggle button (same as mobile) */
              .modern-shop-page .shop-filter-toggle-row {
                display: flex !important;
              }
              .modern-shop-page .shop-filter-panel {
                display: none !important;
              }
              .modern-shop-page .shop-filter-panel.is-open {
                display: block !important;
              }
              /* Tablet: denser product grid */
              .shop-product-grid {
                grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
              }
              /* Tablet: 3-up filter dropdowns so option text (e.g. Sort) isn't clipped */
              .shop-filter-grid {
                grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
              }
              /* Tablet: vertically compact the whole hero */
              .modern-shop-hero-content {
                padding-top: 2rem;
                padding-bottom: 2rem;
              }
              .modern-shop-hero-content #shop-invest-heading {
                font-size: 2.75rem;
                margin-top: 0.4rem;
                margin-bottom: 0.6rem;
              }
              .modern-shop-hero-content > p:last-of-type {
                margin-bottom: 1.1rem;
              }
              .modern-shop-hero-content > div:last-child {
                margin-top: 0.5rem;
              }
              /* Tablet: trim down the hero proof-point blocks */
              .modern-shop-proof-point {
                grid-template-columns: 2rem 1fr;
                gap: 0.6rem;
                padding: 0.55rem 0.7rem;
              }
              .modern-shop-proof-icon {
                width: 1.95rem;
                height: 1.95rem;
                font-size: 1rem;
              }
              .modern-shop-proof-point strong {
                font-size: 0.58rem;
                margin-bottom: 0.2rem;
              }
              .modern-shop-proof-point div span {
                font-size: 0.66rem;
                line-height: 1.3;
              }
            }
            @media (min-width: 1720px) {
              .shop-product-grid {
                grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
              }
            }
            @media (min-width: 1960px) {
              .shop-product-grid {
                grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
              }
            }
            @media (min-width: 2320px) {
              .shop-product-grid {
                grid-template-columns: repeat(7, minmax(0, 1fr)) !important;
              }
            }
            @media (prefers-reduced-motion: reduce) {
              .shop-entry-reveal {
                opacity: 1;
                animation: none;
                transform: none;
                filter: none;
              }
            }
            /* Repeat visit within this tab session (reload, back/forward, quick
               return) — render already-revealed instead of replaying the fade/
               blur/slide-in, so it doesn't stutter every time. See the inline
               script right after <main>. */
            .shop-repeat-visit .shop-entry-reveal {
              opacity: 1;
              animation: none;
              transform: none;
              filter: none;
            }
            /* The Sort box's open list, styled to match the site (computers
               only; lib/shop-select-picker.ts). Last, so it wins by order. */
            ${shopSelectPickerCss('.shop-gallery-sort-control')}
          `}</style>
        </div>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
