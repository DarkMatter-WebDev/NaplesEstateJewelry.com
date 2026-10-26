import type { Metadata } from 'next';
import { cache, type CSSProperties } from 'react';
import { pageMetadata } from '@/lib/seo';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createPublicClient } from '@/lib/supabase/public';
import { createClient } from '@/lib/supabase/server';
import { getVerifiedUser } from '@/lib/auth-claims';
import {
  inferProductJewelryType,
  isDarkProductBackground,
  formatProductItemYear,
  isProductPurchasable,
  isProductSold,
  isProductVisibleInShop,
  normalizeProductQuantity,
  normalizeProductStatus,
  productJewelryTypeLabel,
  productImagePaddingBackground,
  productImagePaddingForImage,
  productLengthSizeDisplay,
  productMetalAccentVar,
  productMetalVariantLabel,
  productStatusLabel,
  productSupportsLinkType,
  productWidthDisplay,
  shouldShowSpotPrice,
  resolveAdvertisedTradeInPrice,
  type Product,
} from '@/types/product';
import { fetchSpotData } from '@/lib/spot-price';
import { fetchShopVisibilitySettings, fetchSpecialPriceDefault } from '@/lib/shop-settings';
import { jsonLdHtml } from '@/lib/json-ld';
import { calcSpotMeltValue, formatUsdPrice, getProductPriceValue, getStorefrontDisplayPrice } from '@/lib/pricing';
import { productOfferLd } from '@/lib/product-ld';
import SiteHeader from '@/components/layout/SiteHeader';
import { BreadcrumbTrailFromLd } from '@/components/BreadcrumbTrail';
import SiteFooter from '@/components/layout/SiteFooter';
import ProductImageGallery from '@/components/shop/ProductImageGallery';
import ProductBackLink from '@/components/shop/ProductBackLink';
import WishlistButton from '@/components/shop/WishlistButton';
import type { WishlistItem } from '@/context/WishlistContext';
import CartButton from '@/components/shop/CartButton';
import type { CartItem } from '@/context/CartContext';
import { productCartItem } from '@/lib/product-cart-item';
import PriceUpdateTicker from '@/components/shop/PriceUpdateTicker';
import { ProductPolicyAccordions, ProductTrustBadges } from '@/components/shop/ProductTrustSections';
import { hoursLine } from '@/lib/business-location';
import { getStoreHours } from '@/lib/store-hours';
import RelatedProductsStrip from '@/components/shop/RelatedProductsStrip';
import SpotRefreshPill from '@/components/shop/SpotRefreshPill';
import TestimonialsSection from '@/components/home/TestimonialsSection';
import { createServiceClient } from '@/lib/supabase/service';
import { getProductVideo, toPublicProductVideo } from '@/lib/product-video-store';
import { AppIcon } from '@/components/AppIcon';

interface Props {
  params: Promise<{ locale: string; id: string }>;
  searchParams?: Promise<{ returnTo?: string }>;
}

export const revalidate = 300;

const PRODUCT_DETAIL_COLUMNS = [
  'id',
  'category',
  'metal_type',
  'metal_variant',
  'title',
  'title_es',
  'description',
  'description_es',
  'public_notes',
  'public_notes_es',
  'price_label',
  'manual_price_label',
  'price_mode',
  'purity',
  'weight_grams',
  'gram_weight',
  'pricing_multiplier',
  'sold_price',
  'inventory_number',
  'sku',
  'slug',
  'brand',
  'product_type',
  'jewelry_type',
  'chain_type',
  'length',
  'width_mm',
  'status',
  'images',
  'image_urls',
  'image_padding',
  'image_padding_by_image',
  'tags',
  'tags_es',
  'gender',
  'item_year',
  'show_spot_price',
  'special_price_override_enabled',
  'special_price_override_amount',
  'special_price_override_mode',
  'special_price_override_percent',
  'sold_price',
  'quantity',
  'accepts_offers',
].join(', ');

// Columns introduced by later migrations that may not exist yet on an
// un-migrated database. If any is missing, retry without all of them and
// backfill nulls so the product page keeps working before the migration runs.
const OPTIONAL_PRODUCT_DETAIL_COLUMNS = [
  'item_year',
  'public_notes_es',
  'show_spot_price',
  'special_price_override_enabled',
  'special_price_override_amount',
  'special_price_override_mode',
  'special_price_override_percent',
  'quantity',
  'sold_price',
  'width_mm',
  'accepts_offers',
];

const PRODUCT_DETAIL_COLUMNS_REQUIRED = PRODUCT_DETAIL_COLUMNS
  .split(', ')
  .filter((column) => !OPTIONAL_PRODUCT_DETAIL_COLUMNS.includes(column))
  .join(', ');

function isMissingOptionalColumnError(error: { message?: string | null } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? '';
  return OPTIONAL_PRODUCT_DETAIL_COLUMNS.some((column) => message.includes(column));
}

// Wrapped in React.cache so generateMetadata() and the page component share a
// single DB query per request instead of each firing their own (this route calls
// it in both places to resolve the product + the 404 decision).
const fetchPublicProduct = cache(async (id: string) => {
  const supabase = createPublicClient();
  const result = await supabase
    .from('products')
    .select(PRODUCT_DETAIL_COLUMNS)
    .eq('id', id)
    .single();

  if (isMissingOptionalColumnError(result.error)) {
    const fallback = await supabase
      .from('products')
      .select(PRODUCT_DETAIL_COLUMNS_REQUIRED)
      .eq('id', id)
      .single();
    return {
      data: fallback.data
        ? {
            ...(fallback.data as unknown as Record<string, unknown>),
            item_year: null,
            public_notes_es: null,
            show_spot_price: true,
            special_price_override_enabled: false,
            special_price_override_amount: null,
            special_price_override_mode: 'amount',
            special_price_override_percent: null,
            sold_price: null,
            quantity: 1,
            width_mm: null,
            accepts_offers: false,
          } as Product
        : null,
      error: fallback.error,
    };
  }

  return {
    data: result.data as unknown as Product | null,
    error: result.error,
  };
});

const fetchPublicProductVideo = cache(async (id: string) => {
  try {
    const service = createServiceClient();
    return toPublicProductVideo(await getProductVideo(service, id));
  } catch {
    // Video is an optional enhancement. Product detail pages continue to work
    // before the migration/env rollout or during a provider-side incident.
    return null;
  }
});

export async function generateStaticParams() {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('products')
    .select('id')
    .in('status', ['available', 'Available', 'sold', 'Sold'])
    .order('sort_order', { ascending: true });

  return (data ?? []).flatMap((product) => [
    { locale: 'en', id: product.id },
    { locale: 'es', id: product.id },
  ]);
}

// `searchParams` is deliberately NOT destructured here: metadata no longer
// reads `returnTo`, because a query parameter must not influence whether a
// hidden product is disclosed. Visibility is decided by the session alone.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const { data } = await fetchPublicProduct(id);

  // Throw notFound() here — before the streaming boundary (loading.tsx) commits a
  // 200 shell — so unknown/hidden product URLs return a real 404 instead of a
  // soft-404. (A notFound() in the page body below would already be too late.)
  if (!data) notFound();

  const visible = isProductVisibleInShop(data.status);
  // See viewerMaySeeHiddenProduct: the return link decides the BACK BUTTON, a
  // session decides VISIBILITY — so `returnTo` is deliberately not read here at
  // all any more. This gate must also exist in the page body —
  // metadata alone returns the right 404 for a bare URL, but once a query
  // string makes this route stream, the 200 shell commits before metadata
  // resolves and only the body check stops the content being emitted.
  if (!visible && !(await viewerMaySeeHiddenProduct())) notFound();

  const isEs = locale === 'es';
  const title = (isEs && data.title_es) ? data.title_es : data.title;
  const description =
    (isEs && data.description_es ? data.description_es : data.description) ?? `${title} — Naples Estate Jewelry`;
  const rawImage = data.image_urls?.[0] ?? data.images?.[0];
  const image = rawImage
    ? (rawImage.startsWith('http') ? rawImage : `https://naplesestatejewelry.com${rawImage}`)
    : undefined;

  return {
    ...pageMetadata({
      title,
      description,
      path: `/shop/${id}`,
      locale,
      // The product photo when there is one. Passing null (rather than the old
      // `images: []`) falls back to the site card — an image-less product used
      // to share as a completely blank card.
      image: image ? { url: image } : null,
    }),
    // A hidden product reachable only via an admin/account return link must stay
    // out of the index even though we render full metadata for the preview.
    ...(visible ? {} : { robots: { index: false, follow: false } }),
  };
}

const SPOT_PRICE_UPDATE_INTERVAL_MS = 5 * 60 * 1000;

const SILVER_PURITY_LABELS: Record<number, string> = {
  999: '99.9%', 950: '95%', 925: '92.5%', 900: '90%', 850: '85%', 800: '80%',
};

function formatKarat(purity: number): string {
  if (purity <= 24) return `${purity}k`;
  if (SILVER_PURITY_LABELS[purity]) return SILVER_PURITY_LABELS[purity];
  // Millesimal fineness (parts per 1000) shown as a percentage, e.g. 835 -> 83.5%.
  if (purity > 100) return `${Number((purity / 10).toFixed(1))}%`;
  return `${purity}%`;
}

function formatInventoryReference(value: string | number | null | undefined): string | null {
  if (value == null || value === '') return null;
  const normalized = String(value).trim().replace(/^#\s*/, '');
  return normalized || null;
}

/**
 * Whether a HIDDEN product (archived / draft / pending_payment) may be rendered.
 *
 * A `returnTo` param alone is NOT sufficient and never was. `safeReturnHref`
 * only checks that the string starts with /admin or /account — it is a
 * back-link validator, not an authorization check. Until 2026-08-08 the gate
 * was `!visible && !returnHref`, so ANY anonymous visitor could append
 * `?returnTo=/admin` to a soft-deleted product URL and read the full page.
 * Verified live in production against all three archived products before the
 * fix; found by the Deep Field team in a port of this same code.
 *
 * Gate on a real session, not on admin: a `returnTo=/account` link is a CUSTOMER
 * returning from their order history to a product they bought, which may since
 * have been archived. Requiring admin would break that legitimate path.
 */
async function viewerMaySeeHiddenProduct(): Promise<boolean> {
  try {
    const supabase = await createClient();
    return (await getVerifiedUser(supabase)) != null;
  } catch {
    // Fail closed: if the session cannot be established, treat as anonymous.
    return false;
  }
}

function safeReturnHref(value: string | undefined, locale: string): string | null {
  if (!value) return null;
  const normalized = value.trim();
  const isEs = locale === 'es';
  const allowedPrefixes = [
    isEs ? '/es/admin' : '/admin',
    isEs ? '/es/account' : '/account',
  ];
  const isAllowed = allowedPrefixes.some((prefix) => (
    normalized === prefix ||
    normalized.startsWith(`${prefix}/`) ||
    normalized.startsWith(`${prefix}?`)
  ));

  if (isAllowed) {
    return normalized;
  }
  return null;
}

export default async function ProductDetailPage({ params, searchParams }: Props) {
  const { locale, id } = await params;
  const query = searchParams ? await searchParams : {};
  const isEs = locale === 'es';
  const shopHref = isEs ? '/es/shop' : '/shop';
  const returnHref = safeReturnHref(query.returnTo, locale);
  const accountPrefix = isEs ? '/es/account' : '/account';
  const isAccountReturn = returnHref?.startsWith(accountPrefix);
  const backHref = returnHref ?? shopHref;
  const backLabel = returnHref
    ? (isAccountReturn ? (isEs ? 'Volver a pedidos' : 'Back to Orders') : (isEs ? 'Volver al admin' : 'Back to Admin'))
    : (isEs ? 'Volver a la tienda' : 'Back to Shop');
  const contactHref = isEs ? '/es/contact' : '/contact';

  const { data: product, error } = await fetchPublicProduct(id);

  if (error || !product) notFound();

  // Admin-editable hours, read once here and passed to both trust surfaces.
  const pickupHoursLine = hoursLine(await getStoreHours(), isEs);

  const p = product as Product;
  // The load-bearing half of the gate — see generateMetadata above. A streaming
  // response has already committed a 200 by the time this runs, so this is what
  // actually prevents a hidden product's content reaching the wire.
  if (!isProductVisibleInShop(p.status) && !(await viewerMaySeeHiddenProduct())) notFound();

  const publicSettingsClient = createPublicClient();
  const [spotData, productVideo, visibility] = await Promise.all([
    fetchSpotData(),
    fetchPublicProductVideo(p.id),
    fetchShopVisibilitySettings(publicSettingsClient),
  ]);

  const title = isEs && p.title_es ? p.title_es : p.title;
  const description = isEs && p.description_es ? p.description_es : p.description;
  const publicNotes = (isEs && p.public_notes_es?.trim() ? p.public_notes_es : p.public_notes)?.trim();
  const metalLabel = productMetalVariantLabel(p.metal_variant, p.category, locale);
  const metalAccent = productMetalAccentVar(p.metal_variant, p.category);
  const isSold = isProductSold(p.status);
  const price = getStorefrontDisplayPrice(p, spotData, visibility.hideSoldItemPrices, locale);
  const isPurchasable = isProductPurchasable(p.status, p.quantity);
  const stockQuantity = normalizeProductQuantity(p.quantity);
  const productImages = p.image_urls?.length ? p.image_urls : p.images ?? [];
  const firstImagePadding = productImagePaddingForImage(p.image_padding, p.image_padding_by_image, productImages[0], 0);
  // The page background matches the first image's padding color, so the gallery
  // frame blends into the page. An unset padding ('none') resolves to white,
  // matching the gallery's own default for that case.
  const pageBackground = firstImagePadding === 'none' ? '#ffffff' : productImagePaddingBackground(firstImagePadding);
  // Dark-background items get a "dark theme": page text/borders/accents lighten
  // automatically by overriding the color tokens on <main>. Light-backed controls
  // are restored via the `.product-page-dark` rules in globals.css.
  const isDarkPage = isDarkProductBackground(pageBackground);
  const mainStyle: CSSProperties & Record<string, string> = { background: pageBackground };
  if (isDarkPage) {
    mainStyle['--color-on-surface'] = '#f2f2f0';
    mainStyle['--color-on-surface-variant'] = '#cbc8c0';
    mainStyle['--color-primary'] = '#e9c349';
    mainStyle['--color-outline-variant'] = 'rgba(255,255,255,0.20)';
  }
  const productWeight = p.gram_weight ?? p.weight_grams;
  const inventoryReference = formatInventoryReference(p.inventory_number);
  const itemDateLabel = formatProductItemYear(p.item_year);

  const meltValue = productWeight && p.purity ? calcSpotMeltValue(p, spotData) : null;
  const scrapValue = meltValue == null ? null : formatUsdPrice(meltValue);
  // Admin-controlled per item: some pieces aren't 100% precious metal, so a
  // melt value computed off the full item weight would overstate scrap value.
  const showSpotPrice = shouldShowSpotPrice(p);
  // The "Own gold or silver?" trade-in line resolves in precedence order: a
  // per-item override wins; else the SITE-WIDE default (a % over/under melt, or
  // a % off the asking price — set once in Admin → Settings → Customer Trade-in
  // Price) applies to every item; else it falls back to the plain computed melt
  // value. The scrap-value box above stays tied to the real computed value
  // either way. The asking price is THE chargeable price (getProductPriceValue).
  const siteTradeInDefault = await fetchSpecialPriceDefault(publicSettingsClient);
  const specialTradeInPrice = resolveAdvertisedTradeInPrice(
    p,
    meltValue,
    siteTradeInDefault,
    getProductPriceValue(p, spotData),
  );
  const tradeInValue = specialTradeInPrice != null ? formatUsdPrice(specialTradeInPrice) : scrapValue;
  const spotPerOz = p.category === 'Silver'
    ? spotData?.silverPerTroyOz
    : spotData?.goldPerTroyOz;
  const spotValueLabel = spotPerOz == null ? null : new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(spotPerOz);
  const nextSpotUpdateAt = spotData ? spotData.fetchedAt + SPOT_PRICE_UPDATE_INTERVAL_MS : null;

  // Auto-compile specs from structured fields
  const jewelryType = inferProductJewelryType(p);
  const chainType = productSupportsLinkType(jewelryType)
    ? p.chain_type ?? (p.tags ?? []).find(t => t.startsWith('ct:'))?.slice(3) ?? null
    : null;
  const buyerLength = productLengthSizeDisplay(p);
  const localizedBuyerLength = buyerLength
    ? isEs
      ? buyerLength.replace(/^Size:\s*/i, 'Talla: ').replace(/\s+in$/i, ' pulg')
      : buyerLength
    : null;
  const buyerLengthSpecValue = localizedBuyerLength && jewelryType === 'Ring'
    ? localizedBuyerLength.replace(/^(?:Size|Talla):\s*/i, '')
    : localizedBuyerLength;
  const specs: { label: string; value: string }[] = [];

  if (p.brand?.trim()) specs.push({ label: isEs ? 'Marca' : 'Brand', value: p.brand.trim() });
  if (itemDateLabel) specs.push({ label: 'Circa', value: itemDateLabel });

  const metalValue = [
    metalLabel,
    p.purity ? formatKarat(p.purity) : null,
  ].filter(Boolean).join(' · ');
  if (metalValue) specs.push({ label: isEs ? 'Metal' : 'Metal', value: metalValue });

  if (productWeight) {
    // Total gram weight only, written out (owner request 2026-07-31) — the
    // fine-metal/troy-oz breakdown is gone (the scrap-value box communicates
    // melt value), and with it the old purity-conditional "g"/"g total"
    // wording split; every item now uses one localized format.
    specs.push({
      label: isEs ? 'Peso' : 'Weight',
      value: isEs
        ? `${productWeight.toFixed(2)} gramos en total`
        : `${productWeight.toFixed(2)} grams total`,
    });
  }

  specs.push({ label: isEs ? 'Tipo de producto' : 'Product Type', value: productJewelryTypeLabel(jewelryType, locale) });
  if (chainType) specs.push({ label: isEs ? 'Tipo de enlace' : 'Link Type', value: chainType });
  // Chain/band width, shown just above Length so the cross-section reads before
  // the wearable length. productWidthDisplay owns the "Necklace and Bracelet
  // only" rule (the same call the shop cards make), so the two surfaces cannot
  // disagree about which pieces have a width.
  const widthLabel = productWidthDisplay(p);
  if (widthLabel) specs.push({ label: isEs ? 'Ancho' : 'Width', value: widthLabel });
  if (buyerLengthSpecValue) specs.push({
    label: jewelryType === 'Ring' ? (isEs ? 'Talla' : 'Size') : (isEs ? 'Largo' : 'Length'),
    value: buyerLengthSpecValue,
  });

  const gender = (p.gender ?? '').trim() || 'Unisex';
  if (gender !== 'Unisex') {
    specs.push({
      label: isEs ? 'Para' : 'For',
      value: isEs
        ? gender === 'Men' ? 'Hombres' : 'Mujeres'
        : gender,
    });
  }

  // Only show specs that actually have a value, so a label never renders with an
  // empty space beside it (e.g. "For" with no gender set).
  const visibleSpecs = specs.filter((spec) => spec.value != null && String(spec.value).trim() !== '');

  const normalizedStatus = normalizeProductStatus(p.status);

  const cartItem: CartItem = productCartItem(p, price);

  const wishlistItem: WishlistItem = {
    id: p.id,
    title: p.title,
    title_es: p.title_es,
    image: productImages[0] ?? null,
    image_padding: firstImagePadding,
    status: normalizedStatus,
    price_mode: p.price_mode,
    purity: p.purity,
    weight_grams: p.weight_grams,
    pricing_multiplier: p.pricing_multiplier,
    manual_price_label: p.manual_price_label,
    sold_price: p.sold_price,
  };


  const localePrefix = locale === 'es' ? '/es' : '';
  const canonicalProductUrl = `https://naplesestatejewelry.com${localePrefix}/shop/${p.id}`;
  const schemaImage = productImages[0]
    ? (productImages[0].startsWith('http') ? productImages[0] : `https://naplesestatejewelry.com${productImages[0]}`)
    : undefined;
  // Spot-linked prices change frequently; give a short validity window so the
  // merchant-listing rich result doesn't warn about a missing priceValidUntil.
  // Derive from the spot fetch timestamp (avoids an impure Date.now() in render).
  const priceValidUntil = new Date(spotData.fetchedAt + 2 * 86_400_000).toISOString().slice(0, 10);
  // The schema price is the canonical VALUE, never the storefront label: with
  // "hide sold item prices" on, the label reads "Sold" and Search Console
  // flagged every sold page for a price-less Offer (2026-09-16). A sold item
  // reports its recorded sale price (or last asking price) with SoldOut; the
  // visible page still says "Sold". No numeric price at all → no Product
  // schema (see lib/product-ld.ts).
  const offerLd = productOfferLd({
    priceValue: getProductPriceValue(p, spotData),
    url: canonicalProductUrl,
    isPurchasable,
    priceValidUntil,
  });
  const jsonLd = offerLd ? {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: title,
    ...(inventoryReference ? { sku: inventoryReference } : {}),
    ...(description ? { description } : {}),
    ...(schemaImage ? { image: schemaImage } : {}),
    brand: { '@type': 'Organization', name: 'Naples Estate Jewelry' },
    offers: offerLd,
  } : null;
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: isEs ? 'Inicio' : 'Home', item: `https://naplesestatejewelry.com${localePrefix}` },
      { '@type': 'ListItem', position: 2, name: isEs ? 'Tienda' : 'Shop', item: `https://naplesestatejewelry.com${localePrefix}/shop` },
      { '@type': 'ListItem', position: 3, name: title, item: canonicalProductUrl },
    ],
  };
  const videoLd = productVideo && schemaImage && productVideo.uploadedAt ? {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: `${title} product video`,
    description: description || `${title} at Naples Estate Jewelry`,
    thumbnailUrl: schemaImage,
    uploadDate: productVideo.uploadedAt,
    duration: `PT${Math.max(1, Math.round(productVideo.durationSeconds))}S`,
    embedUrl: productVideo.iframeUrl,
    ...(productVideo.downloadUrl ? { contentUrl: productVideo.downloadUrl } : {}),
  } : null;

  return (
    <>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }} />}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(breadcrumbLd) }} />
      {videoLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(videoLd) }} />}
      <SiteHeader />
      <main className={`pt-24 md:pt-28 pb-20${isDarkPage ? ' product-page-dark' : ''}`} style={mainStyle}>

        {/* Back to shop. Shares the product band's ultrawide tier so their left
            edges stay aligned — change both together or the back link detaches
            from the gallery beneath it. */}
        <div className="ultrawide-page-medium max-w-7xl mx-auto px-4 md:px-8 mb-6">
          <BreadcrumbTrailFromLd ld={breadcrumbLd} tone={isDarkPage ? 'dark' : 'light'} className="mb-3" />
          <ProductBackLink
            href={backHref}
            productId={p.id}
            shopHref={shopHref}
            className="hover-underline-grow inline-flex items-center gap-1 text-xs font-bold uppercase tracking-widest"
            style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}
          >
            ← {backLabel}
          </ProductBackLink>
        </div>

        {/* MEDIUM tier (1600px), not wide (2200px), deliberately: the gallery is
            a SQUARE in a 50/50 grid, so column width is also its height. On the
            wide tier a 2560px screen gave a 1036px column and therefore a 1120px
            tall photo, which the owner reported as too big (2026-08-14). Capping
            the canvas is the right lever because it preserves the equal columns
            the layout's balance rules depend on; making the grid asymmetric
            would cap the photo but invalidate that balance. */}
        <div className="ultrawide-page-medium max-w-7xl mx-auto px-4 md:px-8">
          {/* Product layout. DOM order IS the reading order — gallery, then
              title/price, description, specifications, notes, policies — so the
              two wrappers below need no `order` juggling: flattening them on a
              phone reproduces exactly this sequence.

              From md up (see `.product-detail-layout` in globals.css) the info
              wrapper occupies column 2 spanning both rows, while column 1 holds
              the gallery in row 1 and the aside (notes + policy accordions) in
              row 2 — so the space under the photo carries content instead of
              whitespace (owner request 2026-08-04, columns swapped
              2026-08-04). */}
          <div className="product-detail-layout">

            {/* Gallery */}
            <div className="product-detail-media">
              <ProductImageGallery
                images={productImages}
                title={title}
                imagePadding={p.image_padding}
                imagePaddingByImage={p.image_padding_by_image}
                video={productVideo}
                locale={locale}
              />
            </div>

            {/* Info column: purchase panel, description, specifications */}
            <div className="product-detail-column-info">

            {/* Purchase panel. Its own query container: the price/value tiles
                and the action buttons size against THIS column's width, which
                is unrelated to the viewport's. */}
            <div className="product-buy-panel flex flex-col gap-5">

              {/* Category + status */}
              <div className="flex flex-col gap-2">
                {inventoryReference && (
                  <p
                    className="text-[0.6875rem] font-bold uppercase tracking-[0.22em]"
                    style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}
                  >
                    {isEs ? 'Artículo #' : 'Item #'}{inventoryReference}
                  </p>
                )}
                <div className="product-detail-summary-row flex flex-wrap items-center gap-3">
                  <span
                    className="text-[0.6875rem] font-bold uppercase tracking-widest px-2 py-0.5"
                    style={{
                      /* Available is emerald, not gold. It was gold, which is
                         also the metal's color — the badge and the metal name
                         were the same swatch a few pixels apart. Sold keeps its
                         near-black chip unchanged. */
                      background: isPurchasable
                        ? 'var(--color-spec-status)'
                        : (isDarkPage ? '#dcd9d2' : 'var(--color-on-surface)'),
                      color: isPurchasable
                        ? 'var(--color-spec-on-status)'
                        : (isDarkPage ? '#1a1c1c' : 'var(--color-surface)'),
                    }}
                  >
                    {isPurchasable
                      ? (isEs ? 'Disponible' : 'Available')
                      : isSold ? (isEs ? 'Vendido' : 'Sold') : productStatusLabel(p.status)}
                  </span>
                  {/* Metal / karat / length each print in their own color, so four
                      separate facts stop reading as one gold blob. The colors are
                      `--color-spec-*` (globals.css `@theme`, with dark-page
                      counterparts in `.product-page-dark`); the metal's is chosen
                      by `productMetalAccentVar` so the word matches the metal.

                      ⚠️ Metal and karat were ONE span until 2026-08-17, with the
                      separator baked into the string as ` · `. They are split
                      because a single text node cannot carry two colors. The dots
                      are now their own `aria-hidden` spans — decorative, and a
                      screen reader already gets the boundary from the elements. */}
                  <span className="product-detail-summary-specs inline-flex items-center gap-2 whitespace-nowrap">
                    <span
                      className="text-[0.6875rem] font-bold uppercase tracking-[0.3em]"
                      style={{ color: metalAccent, fontFamily: 'var(--font-label)' }}
                    >
                      {metalLabel}
                    </span>
                    {p.purity ? (
                      <>
                        <span
                          aria-hidden="true"
                          className="text-[0.6875rem] font-bold"
                          style={{ color: 'var(--color-spec-separator)', fontFamily: 'var(--font-label)' }}
                        >
                          &middot;
                        </span>
                        <span
                          className="text-[0.6875rem] font-bold uppercase tracking-[0.3em]"
                          style={{ color: 'var(--color-spec-karat)', fontFamily: 'var(--font-label)' }}
                        >
                          {formatKarat(p.purity)}
                        </span>
                      </>
                    ) : null}
                    {localizedBuyerLength && (
                      <>
                        <span
                          aria-hidden="true"
                          className="text-[0.6875rem] font-bold"
                          style={{ color: 'var(--color-spec-separator)', fontFamily: 'var(--font-label)' }}
                        >
                          &middot;
                        </span>
                        <span
                          className="text-[0.6875rem] font-bold uppercase tracking-[0.3em]"
                          style={{ color: 'var(--color-spec-length)', fontFamily: 'var(--font-label)' }}
                        >
                          {localizedBuyerLength}
                        </span>
                      </>
                    )}
                  </span>
                </div>
              </div>

              {/* Title */}
              <h1
                className="text-xl md:text-4xl font-bold leading-tight"
                style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
              >
                {title}
              </h1>

              {/* Price */}
              <div className="border-t border-b py-4" style={{ borderColor: 'var(--color-outline-variant)' }}>
                <p
                  className="text-2xl md:text-3xl font-bold"
                  style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-headline)' }}
                >
                  {price}
                </p>
                {isPurchasable ? (
                  <p
                    className="flex items-center gap-1 mt-1.5"
                    style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}
                  >
                    <AppIcon name="check_circle" className="text-sm" style={{ color: 'var(--color-primary)' }} aria-hidden="true" />
                    {isEs ? 'Este es su precio' : 'This is your price'}
                  </p>
                ) : null}
                {isPurchasable && stockQuantity > 1 && (
                  <p
                    className="mt-1"
                    style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}
                  >
                    {isEs ? `${stockQuantity} unidades disponibles` : `${stockQuantity} units in stock`}
                  </p>
                )}
                {!isPurchasable && (
                  <p
                    className="mt-1.5"
                    style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}
                  >
                    {isSold ? (isEs ? 'Vendido — pieza única' : 'Sold — one of a kind') : productStatusLabel(p.status)}
                  </p>
                )}
                {isPurchasable ? (
                  <div className="product-cta-grid mt-3">
                    <CartButton item={cartItem} variant="detail" locale={locale} />
                    <WishlistButton item={wishlistItem} variant="button" locale={locale} />
                    <Link href={`${contactHref}?item=${encodeURIComponent(p.title)}`} rel="nofollow" className="outline-button">
                      {isEs ? 'Consultar' : 'Inquire'}
                    </Link>
                    <a href="tel:2394048505" className="outline-button">
                      {isEs ? 'Llamar' : 'Call'}
                    </a>
                  </div>
                ) : (
                  <div className="product-cta-grid product-cta-grid-pair mt-3">
                    <Link href={`${contactHref}?item=${encodeURIComponent(p.title)}`} rel="nofollow" className="outline-button">
                      {isEs ? 'Consultar pieza similar' : 'Inquire about a similar piece'}
                    </Link>
                    <a href="tel:2394048505" className="outline-button">
                      {isEs ? 'Llamar' : 'Call'}
                    </a>
                  </div>
                )}
                {/* Make an Offer (owner, 2026-10-15): only on items whose
                    "Accept offers" box is ticked, full width UNDER the four
                    buttons so the row above is unchanged. lib/offers.ts. */}
                {isPurchasable && p.accepts_offers === true && (
                  <div className="product-offer-row mt-2">
                    <Link
                      href={`${localePrefix}/offer/${encodeURIComponent(p.id)}`}
                      rel="nofollow"
                      className="outline-button"
                      style={{ width: '100%' }}
                    >
                      {isEs ? 'Hacer una oferta' : 'Make an Offer'}
                    </Link>
                    <p
                      className="mt-1 text-center text-[0.6875rem] leading-snug"
                      style={{ color: 'var(--color-on-surface-variant)' }}
                    >
                      {isEs
                        ? 'Su pago queda retenido y solo se cobra si aceptamos · Respuesta en 72 horas'
                        : 'Your payment is held and only charged if we accept · Answered within 72 hours'}
                    </p>
                  </div>
                )}
                {isPurchasable && (
                  <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--color-on-surface-variant)' }}>
                    <span>✓ {isEs ? 'Envío asegurado' : 'Ships fully insured'}</span>
                    <span>✓ {isEs ? 'Autenticidad garantizada' : 'Authenticity guaranteed'}</span>
                  </p>
                )}
                {scrapValue && !showSpotPrice && (
                  <p
                    className="mt-3 text-[0.72rem] leading-snug"
                    style={{ color: 'var(--color-on-surface-variant)' }}
                  >
                    {isEs
                      ? '*Esta pieza no es 100% oro/plata, por lo que el valor de spot no aplica directamente a este artículo.'
                      : "*This piece isn't 100% gold or silver, so spot pricing doesn't apply directly to this item."}
                  </p>
                )}
                {scrapValue && showSpotPrice && (
                  <div
                    className="mt-3 border p-1.5"
                    style={{
                      borderColor: isDarkPage ? 'rgba(255,255,255,0.16)' : '#e2e6ec',
                      background: isDarkPage ? '#000000' : '#ffffff',
                      borderRadius: '8px',
                    }}
                  >
                    <div className="product-value-tiles">
                      <div
                        className="product-value-tile"
                        style={{
                          background: 'linear-gradient(135deg, #faf5e3 0%, #f1e8c9 100%)',
                          border: '1px solid #ecdfb6',
                          borderRadius: '8px',
                          boxShadow: '0 6px 16px rgba(150, 120, 30, 0.10)',
                        }}
                      >
                        <span
                          className="product-value-tile-label block font-bold uppercase tracking-[0.12em]"
                          style={{ color: '#8a7634', fontFamily: 'var(--font-label)' }}
                        >
                          {isEs
                            ? `Valor de ${p.category === 'Silver' ? 'plata' : 'oro'}`
                            : `Scrap ${p.category === 'Silver' ? 'silver' : 'gold'} value`}
                        </span>
                        <span
                          className="product-value-tile-value mt-1 block font-extrabold"
                          style={{ color: '#735c00', fontFamily: 'var(--font-label)' }}
                        >
                          {scrapValue}
                        </span>
                      </div>
                      {spotValueLabel && (
                        <SpotRefreshPill
                          isEs={isEs}
                          label={isEs ? 'Basado en spot' : 'Based on spot'}
                          ariaLabel={isEs ? 'Precio spot en vivo por onza troy' : 'Live spot price per troy ounce'}
                          display={`${spotValueLabel}/oz`}
                          // Same fluid clamps as `.product-value-tile*`, inline
                          // because the pill takes style props rather than a
                          // className. Keep the two in step.
                          containerStyle={{
                            border: '1px solid #e2e6ec',
                            background: '#f4f7fb',
                            borderRadius: '8px',
                            padding: 'clamp(0.4rem, 0.26rem + 1cqi, 0.625rem) clamp(0.45rem, 0.23rem + 1.45cqi, 0.75rem)',
                            textAlign: 'left',
                          }}
                          labelStyle={{
                            display: 'block',
                            color: '#6b7280',
                            fontFamily: 'var(--font-label)',
                            fontSize: 'clamp(0.625rem, 0.56rem + 0.36cqi, 0.6875rem)',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.12em',
                            // NOT nowrap. The grid tracks are minmax(0, 1fr), so
                            // an unbreakable label punches straight out of its
                            // track: in Spanish "BASADO EN SPOT" pushed the tile
                            // row 43px past a 320px viewport and took the whole
                            // page into horizontal scroll. English never showed
                            // it because "Based on spot" happens to fit. The
                            // price below keeps nowrap — a number must not break.
                          }}
                          priceStyle={{
                            display: 'block',
                            marginTop: '0.25rem',
                            color: '#374151',
                            fontFamily: 'var(--font-label)',
                            fontSize: 'clamp(0.78rem, 0.676rem + 0.76cqi, 0.95rem)',
                            fontWeight: 800,
                            whiteSpace: 'nowrap',
                          }}
                        />
                      )}
                    </div>
                    {nextSpotUpdateAt && (
                      <PriceUpdateTicker
                        nextUpdateAt={nextSpotUpdateAt}
                        lastUpdatedAt={spotData?.fetchedAt ?? null}
                        locale={locale}
                        onDark={isDarkPage}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Store credit line */}
              {tradeInValue && showSpotPrice && isPurchasable && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    padding: '0.65rem 0.9rem',
                    background: '#f4f7fb',
                    border: '1px solid #e2e6ec',
                    borderRadius: '8px',
                    color: '#374151',
                  }}
                >
                  <span style={{ fontSize: '1rem', lineHeight: 1, flexShrink: 0 }}>⬡</span>
                  <p style={{ fontSize: '0.8125rem', color: '#374151', margin: 0, lineHeight: 1.4 }}>
                    {/* Explicit tel: link (not plain text) — format-detection is
                        disabled site-wide for hydration safety, so tappable
                        numbers must be real anchors. */}
                    {isEs ? (
                      <>¿Tienes oro o plata? Aplícalo a esta pieza y paga desde <strong style={{ color: '#735c00' }}>{tradeInValue}</strong> — llama al <a href="tel:2394048505" style={{ color: '#735c00', fontWeight: 700, whiteSpace: 'nowrap' }}>(239) 404-8505</a>. <Link href={isEs ? '/es/trade-in' : '/trade-in'} style={{ color: '#735c00', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: '2px' }}>Cómo funciona</Link></>
                    ) : (
                      <>Own gold or silver? Put it toward this piece and pay as little as <strong style={{ color: '#735c00' }}>{tradeInValue}</strong> — call <a href="tel:2394048505" style={{ color: '#735c00', fontWeight: 700, whiteSpace: 'nowrap' }}>(239) 404-8505</a>. <Link href={isEs ? '/es/trade-in' : '/trade-in'} style={{ color: '#735c00', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: '2px' }}>How it works</Link></>
                    )}
                  </p>
                </div>
              )}

            </div>
            {/* end purchase panel */}

            {/* Description */}
            {description && (
              <p className="text-sm leading-relaxed" style={{ color: 'var(--color-on-surface-variant)' }}>
                {description}
              </p>
            )}

            {/* Specifications */}
            {visibleSpecs.length > 0 && (
              <div className="border-t pt-4" style={{ borderColor: 'var(--color-outline-variant)' }}>
                <p
                  className="text-[0.6875rem] font-bold uppercase tracking-[0.2em] mb-3"
                  style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}
                >
                  {isEs ? 'Especificaciones' : 'Specifications'}
                </p>
                <dl className="flex flex-col gap-2">
                  {visibleSpecs.map(({ label, value }) => (
                    <div key={label} className="flex gap-3 text-sm">
                      <dt
                        className="w-20 flex-shrink-0 font-semibold text-xs normal-case tracking-wide pt-px"
                        style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}
                      >
                        {label}
                      </dt>
                      <dd style={{ color: 'var(--color-on-surface)' }}>{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {!isPurchasable && (
              <div>
                <p className="text-sm mb-3" style={{ color: 'var(--color-on-surface-variant)' }}>
                  {isEs
                    ? 'Este artículo ya fue vendido. Contáctenos para piezas similares.'
                    : 'This item has been sold. Contact us for similar pieces.'}
                </p>
                <Link href={contactHref} className="outline-button">
                  {isEs ? 'Consultar piezas similares' : 'Ask About Similar Pieces'}
                </Link>
              </div>
            )}

            </div>
            {/* end info column */}

            {/* Aside: notes + policy accordions. One wrapper rather than two grid
                items so a product with no Notes does not leave an empty track's
                gutter under the gallery. */}
            <div className="product-detail-column-aside">

              {/* Public notes */}
              {publicNotes && (
                <div className="border-t pt-4" style={{ borderColor: 'var(--color-outline-variant)' }}>
                  <p
                    className="text-[0.6875rem] font-bold uppercase tracking-[0.2em] mb-3"
                    style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}
                  >
                    {isEs ? 'Notas' : 'Notes'}
                  </p>
                  <p className="whitespace-pre-line text-sm leading-relaxed" style={{ color: 'var(--color-on-surface-variant)' }}>
                    {publicNotes}
                  </p>
                </div>
              )}

              {/* Policy accordions (2026-08-04) */}
              <ProductPolicyAccordions isEs={isEs} prefix={isEs ? '/es' : ''} pickupHoursLine={pickupHoursLine} />

            </div>

            {/* Trust strip. It lives INSIDE the layout grid (moved 2026-08-14)
                and spans both columns in a third row at every desktop width —
                2000px+ included since 2026-10-25 (owner: the same layout as
                1280–1999px). Placement is entirely in `.product-detail-layout`
                CSS — do not add position utilities here. */}
            <ProductTrustBadges isEs={isEs} pickupHoursLine={pickupHoursLine} />
          </div>
        </div>

        {/* "You might also like" — same-category available pieces (2026-08-04) */}
        <RelatedProductsStrip current={p} spotData={spotData} locale={locale} />

        {/* Buy-side crossover band (2026-08-30, SEO internal-link pass): a
            shopper on a silver piece is the likeliest visitor to OWN similar
            pieces, so the band passes that intent — and link equity from the
            ranking product pages — to the matching service page. Category is
            'Gold' | 'Silver', so exactly one variant renders on every product. */}
        <section className="border-t border-[#d0c5af] bg-[#f3f3f3] py-10">
          <div className="mx-auto max-w-3xl px-4 text-center md:px-8">
            <p className="text-base leading-relaxed text-[#4d4635]">
              {p.category === 'Silver' ? (
                isEs ? (
                  <>
                    ¿Tiene piezas como esta? Compramos cubertería, holloware y joyería de plata esterlina —{' '}
                    <Link href="/es/silver-services" className="font-semibold text-[#735c00] underline underline-offset-2">venda su plata esterlina en Naples</Link>{' '}
                    o solicite una <Link href="/es/jewelry-appraisal" className="font-semibold text-[#735c00] underline underline-offset-2">tasación gratuita</Link>.
                  </>
                ) : (
                  <>
                    Have pieces like this one? We buy sterling silver flatware, hollowware, and jewelry —{' '}
                    <Link href="/silver-services" className="font-semibold text-[#735c00] underline underline-offset-2">sell your sterling silver in Naples</Link>{' '}
                    or get a <Link href="/jewelry-appraisal" className="font-semibold text-[#735c00] underline underline-offset-2">free appraisal</Link>.
                  </>
                )
              ) : isEs ? (
                <>
                  ¿Tiene oro como este? Compramos joyería, cadenas y monedas de oro de 8k–24k —{' '}
                  <Link href="/es/gold-services" className="font-semibold text-[#735c00] underline underline-offset-2">venda su oro en Naples</Link>{' '}
                  o solicite una <Link href="/es/jewelry-appraisal" className="font-semibold text-[#735c00] underline underline-offset-2">tasación gratuita</Link>.
                </>
              ) : (
                <>
                  Have gold like this? We buy 8k–24k gold jewelry, chains, and coins —{' '}
                  <Link href="/gold-services" className="font-semibold text-[#735c00] underline underline-offset-2">sell your gold in Naples</Link>{' '}
                  or get a <Link href="/jewelry-appraisal" className="font-semibold text-[#735c00] underline underline-offset-2">free appraisal</Link>.
                </>
              )}
            </p>
          </div>
        </section>

        {/* Curated Google reviews — same list as the homepage (2026-08-04) */}
        <TestimonialsSection locale={locale} compact />
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
