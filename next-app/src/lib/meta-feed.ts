import { createHash } from 'node:crypto';
import { normalizeProductQuantity } from '@/types/product';

// Meta (Facebook / Instagram) catalog variant of the merchant feed
// (2026-10-25). Meta reads the same Google-format RSS as Merchant Center
// (`/api/merchant-feed?channel=meta`), with two differences:
//
// 1. Meta requires `brand` on every item. The product's own brand when it has
//    one, otherwise the shop's name. Google's feed is left without a brand on
//    purpose (unbranded vintage pieces, `identifier_exists: no`).
// 1b. Meta's Instagram / Facebook shop reads `quantity_to_sell_on_facebook`
//    as the units on hand; without it the field is 0 and Instagram shows
//    every piece as out of stock even with `availability: in_stock`
//    (found 2026-10-25 on the cow creamer). Sent from `products.quantity`,
//    blank = 1, as the cart counts it.
// 2. Meta accepts JPEG/PNG only, and every product photo is WebP by design
//    (DECISIONS → Media). Image links point at `/feed-image/<id>/<n>-<token>.jpg`,
//    which converts the stored WebP on request. The token is a hash of the
//    source URL, so a replaced photo gets a NEW address (the long CDN cache
//    can never serve the old picture) and a URL nobody issued is a 404.
//    `.jpg` paths skip the locale proxy and `/feed-image` is outside the
//    `/api/*` edge rate limit, so Meta's image fetcher is never throttled.

export type FeedChannel = 'google' | 'meta';

export const META_FALLBACK_BRAND = 'Naples Estate Jewelry';

/** Up to this many photos per item reach Meta (1 main + additional). */
export const META_FEED_MAX_IMAGES = 11;

export function parseFeedChannel(value: string | null): FeedChannel {
  return value === 'meta' ? 'meta' : 'google';
}

export function metaFeedBrand(brand: string | null | undefined): string {
  const trimmed = (brand ?? '').trim();
  return (trimmed || META_FALLBACK_BRAND).slice(0, 100);
}

/** Units for `quantity_to_sell_on_facebook`: the stock count, blank = 1 (one-of-a-kind). */
export function metaFeedQuantity(quantity: number | string | null | undefined): number {
  return normalizeProductQuantity(quantity);
}

/** 10 hex characters of SHA-256 over the stored photo URL. */
export function feedImageToken(sourceUrl: string): string {
  return createHash('sha256').update(sourceUrl).digest('hex').slice(0, 10);
}

export function feedImagePath(productId: string, index: number, sourceUrl: string): string {
  return `/feed-image/${encodeURIComponent(productId)}/${index}-${feedImageToken(sourceUrl)}.jpg`;
}

/** `<n>-<token>.jpg` → its parts; anything else → null. */
export function parseFeedImageFile(file: string): { index: number; token: string } | null {
  const match = /^(\d{1,2})-([0-9a-f]{10})\.jpg$/.exec(file);
  if (!match) return null;
  const index = Number(match[1]);
  if (index >= META_FEED_MAX_IMAGES) return null;
  return { index, token: match[2] };
}

/** The photo list the feed uses: `image_urls`, else legacy `images`, non-empty strings only. */
export function productFeedImages(row: {
  image_urls?: unknown;
  images?: unknown;
}): string[] {
  const urls = Array.isArray(row.image_urls) && row.image_urls.length
    ? row.image_urls
    : Array.isArray(row.images) ? row.images : [];
  return urls.filter((url): url is string => typeof url === 'string' && url.length > 0);
}
