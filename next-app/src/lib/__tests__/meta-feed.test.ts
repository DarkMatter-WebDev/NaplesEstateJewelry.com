import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  feedImagePath,
  feedImageToken,
  META_FALLBACK_BRAND,
  META_FEED_MAX_IMAGES,
  metaFeedBrand,
  metaFeedQuantity,
  parseFeedChannel,
  parseFeedImageFile,
  productFeedImages,
} from '@/lib/meta-feed';

// 2026-10-25: the Meta catalog behind the Instagram shop reads
// `/api/merchant-feed?channel=meta`. Meta needs a brand on every item and
// JPEG/PNG photos (the catalog is WebP). Google's feed must not change.

const SRC = join(process.cwd(), 'src');
const read = (...p: string[]) => readFileSync(join(SRC, ...p), 'utf8');

describe('meta feed helpers', () => {
  it('only "meta" selects the Meta channel', () => {
    expect(parseFeedChannel('meta')).toBe('meta');
    expect(parseFeedChannel(null)).toBe('google');
    expect(parseFeedChannel('Meta')).toBe('google');
    expect(parseFeedChannel('')).toBe('google');
  });

  it('uses the product brand, else the shop name', () => {
    expect(metaFeedBrand('Tiffany & Co.')).toBe('Tiffany & Co.');
    expect(metaFeedBrand('  Rolex ')).toBe('Rolex');
    expect(metaFeedBrand(null)).toBe(META_FALLBACK_BRAND);
    expect(metaFeedBrand('   ')).toBe(META_FALLBACK_BRAND);
    expect(metaFeedBrand('x'.repeat(150))).toHaveLength(100);
  });

  it('sends the units on hand, a blank stock count as one piece', () => {
    expect(metaFeedQuantity(null)).toBe(1);
    expect(metaFeedQuantity(undefined)).toBe(1);
    expect(metaFeedQuantity(3)).toBe(3);
    expect(metaFeedQuantity('2')).toBe(2);
    expect(metaFeedQuantity(0)).toBe(0);
  });

  it('image addresses round-trip and change when the photo changes', () => {
    const a = 'https://x.supabase.co/storage/v1/object/public/product-images/a.webp';
    const b = 'https://x.supabase.co/storage/v1/object/public/product-images/b.webp';
    const path = feedImagePath('gold chain/1', 3, a);
    expect(path).toBe(`/feed-image/gold%20chain%2F1/3-${feedImageToken(a)}.jpg`);
    expect(feedImageToken(a)).toMatch(/^[0-9a-f]{10}$/);
    expect(feedImageToken(a)).not.toBe(feedImageToken(b));
    expect(parseFeedImageFile(`3-${feedImageToken(a)}.jpg`)).toEqual({ index: 3, token: feedImageToken(a) });
  });

  it('rejects any file name the feed never issues', () => {
    const token = feedImageToken('u');
    expect(parseFeedImageFile(`${META_FEED_MAX_IMAGES}-${token}.jpg`)).toBeNull();
    expect(parseFeedImageFile(`1-${token}.webp`)).toBeNull();
    expect(parseFeedImageFile(`1-${token.toUpperCase()}.jpg`)).toBeNull();
    expect(parseFeedImageFile('1-abc.jpg')).toBeNull();
    expect(parseFeedImageFile(`../1-${token}.jpg`)).toBeNull();
  });

  it('reads image_urls first, legacy images second, dropping blanks', () => {
    expect(productFeedImages({ image_urls: ['a', '', 'b'], images: ['z'] })).toEqual(['a', 'b']);
    expect(productFeedImages({ image_urls: [], images: ['/assets/z.webp'] })).toEqual(['/assets/z.webp']);
    expect(productFeedImages({ image_urls: null, images: null })).toEqual([]);
  });
});

describe('meta feed wiring', () => {
  const feed = read('app', 'api', 'merchant-feed', 'route.ts');

  it('adds the brand line for Meta only', () => {
    expect(feed).toMatch(/channel === 'meta' \? `\s*<g:brand>/);
  });

  it('sends quantity_to_sell_on_facebook for Meta only (Instagram reads 0 as sold out)', () => {
    expect(feed).toMatch(/channel === 'meta'\s*\?\s*`\s*<g:quantity_to_sell_on_facebook>\$\{metaFeedQuantity\(row\.quantity\)\}/);
    expect(feed).toMatch(/FEED_COLUMNS =[\s\S]*?quantity';/);
  });

  it('keeps Google on the stored photo URLs', () => {
    expect(feed).toContain(': sourceUrls.map(absoluteUrl)');
  });

  it('the image route only serves a token that matches the stored photo', () => {
    const route = read('app', 'feed-image', '[id]', '[file]', 'route.ts');
    expect(route).toContain('feedImageToken(source) !== parsed.token');
    expect(route).toContain(".jpeg(");
    expect(route).toContain('toOwnedBuffer(');
    expect(route).not.toMatch(/dynamicParams/);
  });

  it('the image route stays outside the locale proxy and the /api rate limit', () => {
    expect(read('proxy.ts')).toMatch(/svg\|png\|jpg\|jpeg/);
    expect(feedImagePath('p', 0, 'u').startsWith('/api/')).toBe(false);
  });

  it('the site carries the Meta domain-verification tag', () => {
    expect(read('app', 'layout.tsx')).toContain("'facebook-domain-verification': '6qraoa3bc9aa19chfta5mqr1cpbkkq'");
  });
});
