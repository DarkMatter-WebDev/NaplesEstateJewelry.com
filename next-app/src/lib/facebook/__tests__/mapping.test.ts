import { describe, expect, it } from 'vitest';
import type { Product, SpotData } from '@/types/product';
import {
  DEFAULT_FACEBOOK_CAPTION_SETTINGS,
  buildFacebookPost,
  computeFacebookContentHash,
} from '../mapping';
import { FACEBOOK_MAX_HASHTAGS, FACEBOOK_MAX_PHOTO_ITEMS } from '../client';

const SITE_URL = 'https://naplesestatejewelry.com';

const LIVE_SPOT: SpotData = {
  goldPerTroyOz: 4044,
  silverPerTroyOz: 57.69,
  fetchedAt: Date.parse('2026-07-31T20:00:00Z'),
  source: 'api',
};

const FALLBACK_SPOT: SpotData = { ...LIVE_SPOT, source: 'fallback' };

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'test-product-id',
    category: 'Gold',
    metal_type: 'Gold',
    metal_variant: 'yellow_gold',
    title: 'Heavy Italian 14K Yellow Gold Cuban Link Bracelet',
    title_es: 'Pesada Pulsera Italiana de Oro Amarillo de 14K',
    price_label: null,
    manual_price_label: null,
    price_mode: 'spot-multiplier',
    purity: 14,
    weight_grams: 53.91,
    inventory_number: 21,
    sku: null,
    slug: 'test-product',
    metal: 'gold',
    gram_weight: 53.91,
    stone_details: null,
    brand: null,
    product_type: 'Bracelet',
    jewelry_type: 'Bracelet',
    chain_type: 'Cuban link',
    length: '7.75',
    pricing_multiplier: 1.5,
    show_spot_price: true,
    special_price_override_enabled: false,
    special_price_override_amount: null,
    special_price_override_mode: 'amount',
    special_price_override_percent: null,
    quantity: 1,
    status: 'available',
    location: null,
    images: [],
    image_urls: [
      'https://example.supabase.co/storage/v1/object/public/product-images/products/a.webp',
      'https://example.supabase.co/storage/v1/object/public/product-images/products/b.webp',
    ],
    description: 'A heavy Italian bracelet. Measures 7.75 inches with a hidden clasp.',
    description_es: 'Una pulsera italiana pesada.',
    tags: [],
    ...overrides,
  } as Product;
}

describe('buildFacebookPost', () => {
  it('uses the short /p/<inventory#> link when the product has an inventory number', () => {
    const post = buildFacebookPost({ product: makeProduct(), spotData: LIVE_SPOT, siteUrl: SITE_URL });

    expect(post.productUrl).toBe('https://naplesestatejewelry.com/p/21');
    expect(post.message).toContain('Shop: https://naplesestatejewelry.com/p/21');
  });

  it('falls back to the full slug URL when there is no inventory number', () => {
    const post = buildFacebookPost({
      product: makeProduct({ inventory_number: null }),
      spotData: LIVE_SPOT,
      siteUrl: 'https://naplesestatejewelry.com/',
    });
    expect(post.productUrl).toBe('https://naplesestatejewelry.com/shop/test-product-id');
  });

  it('omits the inventory number, which stays internal on Facebook', () => {
    const post = buildFacebookPost({ product: makeProduct(), spotData: LIVE_SPOT, siteUrl: SITE_URL });
    expect(post.message).not.toMatch(/Inventory/i);
    // The rest of the spec line survives the strip.
    expect(post.message).toContain('14K Yellow Gold');
    expect(post.message).toContain('53.91g');
  });

  it('uses only a few relevant hashtags instead of Instagram-sized clusters', () => {
    const post = buildFacebookPost({
      product: makeProduct({
        brand: 'MilOr',
        tags: ['vintage', 'gift', 'statement'],
      }),
      spotData: LIVE_SPOT,
      siteUrl: SITE_URL,
    });
    const hashtags = post.message.match(/#[a-z0-9]+/gi) ?? [];

    expect(hashtags).toEqual(['#bracelet', '#milor', '#vintage']);
    expect(hashtags).toHaveLength(FACEBOOK_MAX_HASHTAGS);
  });

  it('uses the canonical Tiffany brand hashtag', () => {
    const post = buildFacebookPost({
      product: makeProduct({ brand: 'Tiffany & Co.', tags: ['#tiffanyco'] }),
      spotData: LIVE_SPOT,
      siteUrl: SITE_URL,
    });

    expect(post.message).toContain('#tiffanyandco');
    expect(post.message).not.toMatch(/#tiffanyco\b/);
  });

  it('combines availability and title in one opening sentence, then shows specs and price', () => {
    const post = buildFacebookPost({ product: makeProduct(), spotData: LIVE_SPOT, siteUrl: SITE_URL });
    expect(post.quotedPrice).toBeGreaterThan(0);
    expect(post.message).toMatch(
      /^Available now: Heavy Italian 14K Yellow Gold Cuban Link Bracelet\.\n\n14K Yellow Gold · 53\.91g[^\n]*\n\n≈ \$[\d,]+ at time of posting \(based on \$4,044\/oz gold spot\)\./,
    );
  });

  it('uses a validated AI-assisted opening verbatim', () => {
    const opening = 'We’re delighted to share the Heavy Italian 14K Yellow Gold Cuban Link Bracelet, available now.';
    const post = buildFacebookPost({
      product: makeProduct(),
      spotData: LIVE_SPOT,
      siteUrl: SITE_URL,
      captionOpening: opening,
    });
    expect(post.message.startsWith(`${opening}\n\n14K Yellow Gold`)).toBe(true);
  });

  it('uses an admin-edited opener without requiring the full catalog title', () => {
    const opening = 'This heavy Italian bracelet is available now.';
    const post = buildFacebookPost({
      product: makeProduct(),
      spotData: LIVE_SPOT,
      siteUrl: SITE_URL,
      captionOpening: opening,
    });
    expect(post.message.startsWith(`${opening}\n\n14K Yellow Gold`)).toBe(true);
  });

  it('keeps a uniform one-blank-line rhythm — no adjacent content lines anywhere', () => {
    const post = buildFacebookPost({ product: makeProduct(), spotData: LIVE_SPOT, siteUrl: SITE_URL });
    const rows = post.message.split('\n');
    for (let i = 1; i < rows.length; i += 1) {
      // Two non-empty lines in a row would be a tight cluster.
      expect(rows[i - 1] !== '' && rows[i] !== '').toBe(false);
    }
  });

  it('never claims availability for a product that is not available', () => {
    const post = buildFacebookPost({
      product: makeProduct({ status: 'sold' }),
      spotData: LIVE_SPOT,
      siteUrl: SITE_URL,
    });
    expect(post.message).not.toMatch(/Available now/);
    expect(post.message).toMatch(/≈ \$[\d,]+ at time of posting \(based on .*\)\./);
  });

  it('keeps the combined availability/title opener when the price is omitted', () => {
    const post = buildFacebookPost({
      product: makeProduct(),
      spotData: LIVE_SPOT,
      siteUrl: SITE_URL,
      settings: { includePrice: false },
    });
    expect(post.message).toContain('Available now: Heavy Italian 14K Yellow Gold Cuban Link Bracelet.');
    expect(post.message).not.toMatch(/at time of posting/);
  });

  it('omits the spot parenthetical for manually priced items', () => {
    const post = buildFacebookPost({
      product: makeProduct({ price_mode: 'manual', asking_price: 2500 }),
      spotData: LIVE_SPOT,
      siteUrl: SITE_URL,
    });
    expect(post.message).not.toMatch(/based on/);
  });

  it('excludes the description body — the spec line and link carry the facts', () => {
    const post = buildFacebookPost({ product: makeProduct(), spotData: LIVE_SPOT, siteUrl: SITE_URL });
    // Distinctive description phrases must not leak into the message.
    expect(post.message).not.toContain('box clasp');
    expect(post.message).not.toContain('wearable length');
    // The Spanish line survives; it is a setting, not the description body.
    expect(post.message).toContain('🇪🇸');
  });

  it('carries the spot basis into the card price note', () => {
    const post = buildFacebookPost({ product: makeProduct(), spotData: LIVE_SPOT, siteUrl: SITE_URL });
    expect(post.cardContent.priceNote).toBe('Price at time of posting · $4,044/oz gold spot');
  });

  it('keeps the content hash price-invariant with the availability prefix', () => {
    const a = buildFacebookPost({ product: makeProduct(), spotData: LIVE_SPOT, siteUrl: SITE_URL });
    const b = buildFacebookPost({
      product: makeProduct(),
      spotData: { ...LIVE_SPOT, goldPerTroyOz: 4900 },
      siteUrl: SITE_URL,
    });
    expect(computeFacebookContentHash(a)).toBe(computeFacebookContentHash(b));
  });

  it('fails closed when a price would be quoted without live spot data', () => {
    const post = buildFacebookPost({ product: makeProduct(), spotData: FALLBACK_SPOT, siteUrl: SITE_URL });
    expect(post.blockedReason).toBeTruthy();
  });

  it('blocks a product with no images', () => {
    const post = buildFacebookPost({
      product: makeProduct({ images: [], image_urls: [] }),
      spotData: LIVE_SPOT,
      siteUrl: SITE_URL,
    });
    expect(post.blockedReason).toMatch(/no images/i);
  });

  it('caps photos one below the carousel size, since the card takes a slot', () => {
    const many = Array.from({ length: 15 }, (_, i) => `https://example.com/${i}.webp`);
    const post = buildFacebookPost({
      product: makeProduct({ image_urls: many }),
      spotData: LIVE_SPOT,
      siteUrl: SITE_URL,
    });
    expect(post.imageUrls).toHaveLength(FACEBOOK_MAX_PHOTO_ITEMS);
    expect(post.warnings.join(' ')).toContain('15');
  });

  it('builds identical card copy to what the caption quotes', () => {
    const post = buildFacebookPost({ product: makeProduct(), spotData: LIVE_SPOT, siteUrl: SITE_URL });
    expect(post.cardContent.title).toBe('Heavy Italian 14K Yellow Gold Cuban Link Bracelet');
    expect(post.cardContent.price).toMatch(/^\$[\d,]+$/);
    expect(post.cardContent.specs).toContain('14K YELLOW GOLD');
  });

  it('omits the price from both message and card when disabled', () => {
    const post = buildFacebookPost({
      product: makeProduct(),
      spotData: LIVE_SPOT,
      siteUrl: SITE_URL,
      settings: { includePrice: false },
    });
    expect(post.quotedPrice).toBeNull();
    expect(post.cardContent.price).toBeNull();
    expect(post.message).not.toMatch(/at time of posting/);
    // The shop link stays regardless of price settings.
    expect(post.message).toContain('Shop: ');
  });

  it('falls back to defaults when a caller passes explicit undefined settings', () => {
    const post = buildFacebookPost({
      product: makeProduct(),
      spotData: LIVE_SPOT,
      siteUrl: SITE_URL,
      settings: { cta: undefined, baseHashtags: undefined },
    });
    expect(post.message).toContain(DEFAULT_FACEBOOK_CAPTION_SETTINGS.cta as string);
  });

  it('renders null cta as no call-to-action line at all', () => {
    const post = buildFacebookPost({
      product: makeProduct(),
      spotData: LIVE_SPOT,
      siteUrl: SITE_URL,
      settings: { cta: null },
    });
    expect(post.message).not.toContain(DEFAULT_FACEBOOK_CAPTION_SETTINGS.cta as string);
  });
});

describe('computeFacebookContentHash', () => {
  it('is stable for identical inputs', () => {
    const a = buildFacebookPost({ product: makeProduct(), spotData: LIVE_SPOT, siteUrl: SITE_URL });
    const b = buildFacebookPost({ product: makeProduct(), spotData: LIVE_SPOT, siteUrl: SITE_URL });
    expect(computeFacebookContentHash(a)).toBe(computeFacebookContentHash(b));
  });

  it('ignores price movement, so a spot change never marks a post out of date', () => {
    const a = buildFacebookPost({ product: makeProduct(), spotData: LIVE_SPOT, siteUrl: SITE_URL });
    const b = buildFacebookPost({
      product: makeProduct(),
      spotData: { ...LIVE_SPOT, goldPerTroyOz: 4500 },
      siteUrl: SITE_URL,
    });
    expect(a.quotedPrice).not.toBe(b.quotedPrice);
    expect(computeFacebookContentHash(a)).toBe(computeFacebookContentHash(b));
  });

  it('changes when the title changes', () => {
    const a = buildFacebookPost({ product: makeProduct(), spotData: LIVE_SPOT, siteUrl: SITE_URL });
    const b = buildFacebookPost({
      product: makeProduct({ title: 'A Different Title' }),
      spotData: LIVE_SPOT,
      siteUrl: SITE_URL,
    });
    expect(computeFacebookContentHash(a)).not.toBe(computeFacebookContentHash(b));
  });
});
