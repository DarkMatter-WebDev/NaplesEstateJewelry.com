import { createClient } from '@supabase/supabase-js';
import { fetchSpotData } from '@/lib/spot-price';
import { getProductPriceValue } from '@/lib/pricing';
import type { Product } from '@/types/product';
import {
  feedImagePath,
  META_FEED_MAX_IMAGES,
  metaFeedBrand,
  metaFeedQuantity,
  parseFeedChannel,
  productFeedImages,
} from '@/lib/meta-feed';

// Google Merchant Center product feed (RSS 2.0 + g: namespace), replacing the
// crawl-based "products found by Google" source (2026-08-31). Why a feed: the
// crawl ingested BOTH locales of every product page — sold pages included,
// since those deliberately stay live for SEO — and a crawl only notices a sale
// on its next visit, which can leave a one-of-one piece looking buyable on
// Google for days. This feed is the controlled inverse: AVAILABLE products
// only, one entry per product, priced by the same canonical helper as
// checkout/eBay/Etsy at the moment Google fetches.
//
// ⚠️ Fail-closed like every other marketplace write (see
// getMarketplaceSpotPriceError): if live spot is unavailable, this route
// returns 503 rather than emitting fallback prices — Google then keeps serving
// its last good copy of the feed and retries later.
//
// Merchant Center is configured to fetch this daily; between fetches, Google's
// "automatic item updates" re-reads the product page's own JSON-LD
// (availability: SoldOut) as the fast corrective when something sells.
// ⚠️ If the site's shipping tiers or this feed's shape ever change, remember
// Merchant Center's shipping table is configured by hand and nothing syncs it
// (TASKS 2026-08-30).
//
// `?channel=meta` (2026-10-25) is the same feed for the Meta catalog behind
// the Instagram shop: it adds `g:brand` (Meta requires it) and
// `g:quantity_to_sell_on_facebook` (without it Instagram shows every piece
// out of stock), and points every
// image at the JPEG converter, since Meta does not take WebP. Without the
// parameter the output is byte-for-byte what Merchant Center has always read.
// See lib/meta-feed.ts.

export const dynamic = 'force-dynamic';

const BASE = 'https://naplesestatejewelry.com';

/** Everything the feed and its pricing path actually read. */
const FEED_COLUMNS =
  'id, status, title, description, category, brand, image_urls, images, inventory_number, '
  + 'price_mode, pricing_multiplier, gram_weight, weight_grams, purity, manual_price_label, sold_price, quantity';

type FeedRow = Pick<
  Product,
  | 'id' | 'status' | 'title' | 'description' | 'category' | 'brand' | 'image_urls' | 'images'
  | 'inventory_number' | 'price_mode' | 'pricing_multiplier' | 'gram_weight'
  | 'weight_grams' | 'purity' | 'manual_price_label' | 'sold_price' | 'quantity'
>;

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function absoluteUrl(url: string): string {
  return url.startsWith('/') ? `${BASE}${url}` : url;
}

/**
 * Stable feed id. Google caps g:id at 50 characters, and product slugs run
 * well past that, so the inventory number is the durable key (it already keys
 * the /p/<inventory#> short links). A product with no inventory number falls
 * back to its slug only when the slug fits; otherwise it is skipped and
 * counted, never silently truncated — a truncated id is neither stable nor
 * collision-safe.
 */
function feedId(row: FeedRow): string | null {
  if (row.inventory_number != null) return `nej-${row.inventory_number}`;
  return row.id.length <= 50 ? row.id : null;
}

export async function GET(request: Request): Promise<Response> {
  const channel = parseFeedChannel(new URL(request.url).searchParams.get('channel'));
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const [{ data: rows, error }, spotData] = await Promise.all([
    supabase.from('products').select(FEED_COLUMNS).in('status', ['available', 'Available']),
    fetchSpotData(),
  ]);

  if (error || !rows) {
    return new Response('feed source unavailable', { status: 503 });
  }

  const products = rows as unknown as FeedRow[];

  // Fail closed on stale spot exactly like eBay/Etsy price pushes do — but
  // only when a spot-priced product would actually be affected.
  const needsSpot = products.some((p) => p.price_mode === 'spot-multiplier');
  if (needsSpot && spotData.source !== 'api') {
    return new Response('live spot pricing unavailable', { status: 503 });
  }

  let skippedNoId = 0;
  let skippedNoPrice = 0;
  let skippedNoImage = 0;

  const items = products.flatMap((row) => {
    const id = feedId(row);
    if (id == null) {
      skippedNoId += 1;
      return [];
    }

    const price = getProductPriceValue(row as unknown as Product, spotData);
    if (price == null || price <= 0) {
      skippedNoPrice += 1;
      return [];
    }

    const sourceUrls = productFeedImages(row);
    const imageUrls = channel === 'meta'
      ? sourceUrls
        .slice(0, META_FEED_MAX_IMAGES)
        .map((url, index) => `${BASE}${feedImagePath(row.id, index, url)}`)
      : sourceUrls.map(absoluteUrl);
    if (imageUrls.length === 0) {
      // A listing without a usable image would be disapproved anyway.
      skippedNoImage += 1;
      return [];
    }

    const link = `${BASE}/shop/${encodeURIComponent(row.id)}`;
    const description = (row.description ?? '').trim() || `${row.title} — Naples Estate Jewelry`;
    const additionalImages = imageUrls
      .slice(1, 11)
      .map((url) => `      <g:additional_image_link>${xmlEscape(url)}</g:additional_image_link>`)
      .join('\n');

    return [
      [
        '    <item>',
        `      <g:id>${xmlEscape(id)}</g:id>`,
        `      <g:title>${xmlEscape(row.title.slice(0, 150))}</g:title>`,
        `      <g:description>${xmlEscape(description.slice(0, 5000))}</g:description>`,
        `      <g:link>${xmlEscape(link)}</g:link>`,
        `      <g:image_link>${xmlEscape(imageUrls[0])}</g:image_link>`,
        additionalImages,
        '      <g:availability>in_stock</g:availability>',
        `      <g:price>${price.toFixed(2)} USD</g:price>`,
        '      <g:condition>used</g:condition>',
        channel === 'meta' ? `      <g:brand>${xmlEscape(metaFeedBrand(row.brand))}</g:brand>` : '',
        channel === 'meta'
          ? `      <g:quantity_to_sell_on_facebook>${metaFeedQuantity(row.quantity)}</g:quantity_to_sell_on_facebook>`
          : '',
        '      <g:identifier_exists>no</g:identifier_exists>',
        '    </item>',
      ].filter(Boolean).join('\n'),
    ];
  });

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    '  <channel>',
    '    <title>Naples Estate Jewelry</title>',
    `    <link>${BASE}</link>`,
    '    <description>Curated estate jewelry, gold, and sterling silver — available pieces only.</description>',
    // Honesty over silence: a skipped item is visible in the feed source
    // rather than quietly missing from Google.
    `    <!-- ${items.length} items; skipped: ${skippedNoId} without a usable id, ${skippedNoPrice} without a price, ${skippedNoImage} without an image -->`,
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      // Google fetches on its own schedule; no shared-cache staleness wanted
      // between a sale and the next fetch.
      'Cache-Control': 'no-store',
      // Fetchable by Merchant Center (robots.ts carves this path out of the
      // /api disallow) but never indexed as a search result.
      'X-Robots-Tag': 'noindex',
    },
  });
}
