import { describe, expect, it } from 'vitest';
import {
  DEEPFIELD_FORBIDDEN_FIELDS,
  DEEPFIELD_PRODUCT_FIELDS,
  buildDeepFieldPayload,
  resolveDeepFieldPrice,
  toAbsoluteImageUrl,
} from '@/lib/deepfield/payload';
import type { Product, SpotData } from '@/types/product';

const LIVE_SPOT: SpotData = {
  goldPerTroyOz: 4343.299805,
  silverPerTroyOz: 63.707001,
  fetchedAt: 1786146956481,
  source: 'api',
};

const FALLBACK_SPOT: SpotData = { ...LIVE_SPOT, source: 'fallback' };

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'test-product',
    category: 'Gold',
    metal_type: 'Gold',
    metal_variant: 'yellow_gold',
    title: 'Test',
    title_es: null,
    price_label: null,
    manual_price_label: null,
    price_mode: 'spot-multiplier',
    purity: 14,
    weight_grams: 53.91,
    inventory_number: 21,
    sku: '21',
    slug: 'test',
    metal: 'Gold',
    gram_weight: 53.91,
    stone_details: null,
    brand: null,
    product_type: 'Bracelet',
    jewelry_type: 'Bracelet',
    chain_type: null,
    length: null,
    width_mm: null,
    pricing_multiplier: 1.25,
    sold_price: null,
    show_spot_price: true,
    special_price_override_enabled: false,
    special_price_override_amount: null,
    special_price_override_mode: 'amount',
    special_price_override_percent: null,
    quantity: 1,
    status: 'available',
    location: 'showcase',
    images: [],
    image_urls: [],
    image_padding: 'none',
    image_padding_by_image: {},
    description: null,
    description_es: null,
    details: [],
    details_es: [],
    tags: [],
    tags_es: [],
    private_price_label: 'SECRET LABEL',
    gender: 'Unisex',
    item_year: 1960,
    cost_basis: 1234.56,
    melt_value: null,
    asking_price: null,
    minimum_price: 999,
    live_spot_snapshot: { secret: true },
    acquisition_date: '2026-01-01',
    acquisition_source: 'Estate sale, private',
    internal_notes: 'paid cash, seller motivated',
    public_notes: null,
    public_notes_es: null,
    featured: false,
    sort_order: 1,
    created_at: '2026-06-15T17:47:30.840263+00:00',
    updated_at: '2026-08-04T20:50:31.796177+00:00',
    ...overrides,
  } as Product;
}

describe('deep field payload field policy', () => {
  it('never emits an internal field, even when the row carries values', () => {
    const payload = buildDeepFieldPayload(makeProduct(), LIVE_SPOT);
    for (const forbidden of DEEPFIELD_FORBIDDEN_FIELDS) {
      expect(payload).not.toHaveProperty(forbidden);
    }
  });

  it('excludes the dead price_label column that carries stale values', () => {
    const payload = buildDeepFieldPayload(
      makeProduct({ price_label: '$0.00' } as Partial<Product>),
      LIVE_SPOT,
    );
    expect(payload).not.toHaveProperty('price_label');
  });

  it('keeps the allow-list and forbidden list disjoint', () => {
    for (const forbidden of DEEPFIELD_FORBIDDEN_FIELDS) {
      expect(DEEPFIELD_PRODUCT_FIELDS).not.toContain(forbidden);
    }
  });

  it('ships the inputs Deep Field needs to price spot items live', () => {
    const payload = buildDeepFieldPayload(makeProduct(), LIVE_SPOT);
    for (const field of ['pricing_multiplier', 'purity', 'gram_weight', 'weight_grams', 'category', 'price_mode']) {
      expect(payload).toHaveProperty(field);
    }
  });
});

describe('toAbsoluteImageUrl', () => {
  it('absolutizes a site-relative path', () => {
    expect(toAbsoluteImageUrl('/assets/images/shop/a.webp'))
      .toBe('https://naplesestatejewelry.com/assets/images/shop/a.webp');
  });

  it('percent-encodes spaces and parentheses', () => {
    expect(toAbsoluteImageUrl('/assets/shoppics/IMG_5132 (Product Staging).webp'))
      .toBe('https://naplesestatejewelry.com/assets/shoppics/IMG_5132%20(Product%20Staging).webp');
  });

  it('leaves an absolute URL untouched so it is never double-encoded', () => {
    const url = 'https://evz.supabase.co/storage/v1/object/public/product-images/products/a%20b.webp';
    expect(toAbsoluteImageUrl(url)).toBe(url);
  });
});

describe('resolveDeepFieldPrice', () => {
  it('computes spot price matching the storefront formula', () => {
    // 53.91g x 14/24 x (4343.299805 / 31.1034768) = 4391.34 melt; x1.25 = 5489.17,
    // rounded to the whole dollar the storefront shows and checkout charges.
    // Melt is a market quote, not an offer, so it keeps its cents.
    const result = resolveDeepFieldPrice(makeProduct(), LIVE_SPOT);
    expect(result.nej_price_source).toBe('spot');
    expect(result.nej_melt_value_usd).toBeCloseTo(4391.34, 2);
    expect(result.nej_price_usd).toBe(5489);
  });

  it('locks a sold product to sold_price and ignores spot entirely', () => {
    const result = resolveDeepFieldPrice(
      makeProduct({ status: 'sold', sold_price: 1980.94 }),
      FALLBACK_SPOT,
    );
    expect(result.nej_price_source).toBe('sold_lock');
    expect(result.nej_price_usd).toBe(1980.94);
  });

  it('parses a manual price label', () => {
    const result = resolveDeepFieldPrice(
      makeProduct({ price_mode: 'manual', manual_price_label: '$23,995' }),
      LIVE_SPOT,
    );
    expect(result.nej_price_source).toBe('manual');
    expect(result.nej_price_usd).toBe(23995);
  });

  it('sends no price rather than a fallback rate when spot is not live', () => {
    const result = resolveDeepFieldPrice(makeProduct(), FALLBACK_SPOT);
    expect(result.nej_price_usd).toBeNull();
    expect(result.nej_price_source).toBeNull();
    expect(result.nej_price_unavailable_reason).toMatch(/spot pricing unavailable/i);
  });

  it('still prices manual and sold items when spot is unavailable', () => {
    expect(
      resolveDeepFieldPrice(
        makeProduct({ price_mode: 'manual', manual_price_label: '$450' }),
        null,
      ).nej_price_usd,
    ).toBe(450);
    expect(
      resolveDeepFieldPrice(makeProduct({ status: 'sold', sold_price: 12 }), null).nej_price_usd,
    ).toBe(12);
  });

  it('reports a reason instead of a price when weight or purity is missing', () => {
    const result = resolveDeepFieldPrice(
      makeProduct({ purity: null, gram_weight: null, weight_grams: null }),
      LIVE_SPOT,
    );
    expect(result.nej_price_usd).toBeNull();
    expect(result.nej_price_unavailable_reason).toBeTruthy();
  });
});

describe('buildDeepFieldPayload', () => {
  it('omits the spot snapshot for non-spot pricing', () => {
    const manual = buildDeepFieldPayload(
      makeProduct({ price_mode: 'manual', manual_price_label: '$450' }),
      LIVE_SPOT,
    );
    expect(manual.nej_spot_snapshot).toBeNull();

    const spot = buildDeepFieldPayload(makeProduct(), LIVE_SPOT);
    expect(spot.nej_spot_snapshot).toMatchObject({ source: 'api', goldPerTroyOz: LIVE_SPOT.goldPerTroyOz });
  });

  it('normalizes legacy title-case status', () => {
    const payload = buildDeepFieldPayload(makeProduct({ status: 'Sold', sold_price: 5 }), LIVE_SPOT);
    expect(payload.status).toBe('sold');
  });

  it('rewrites relative image paths in both image columns', () => {
    const payload = buildDeepFieldPayload(
      makeProduct({
        images: ['/assets/images/shop/a.webp', 'https://cdn.example/b.webp'],
        image_urls: ['/assets/images/shop/a.webp'],
      }),
      LIVE_SPOT,
    );
    expect(payload.images).toEqual([
      'https://naplesestatejewelry.com/assets/images/shop/a.webp',
      'https://cdn.example/b.webp',
    ]);
    expect(payload.image_urls).toEqual(['https://naplesestatejewelry.com/assets/images/shop/a.webp']);
  });
});
