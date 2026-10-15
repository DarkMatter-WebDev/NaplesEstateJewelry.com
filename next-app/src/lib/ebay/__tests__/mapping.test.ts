import { describe, expect, it } from 'vitest';
import type { Product, SpotData } from '@/types/product';
import {
  EBAY_CONDITION_DESCRIPTION,
  EBAY_CONDITION_ID,
  EBAY_FORBIDDEN_PRODUCT_FIELDS,
  buildMappedPayload,
  buildPreflightChecks,
  buildTierFulfillmentPolicyPayload,
  computeContentHash,
  computeEbayPrice,
  isEbayIneligibleProductType,
  isPreflightPassing,
  isSilverAntiqueCategory,
  mapAspects,
  mapDescription,
  mapSku,
  mapTitle,
  resolveCategory,
  resolveEbayImageUrl,
  resolveFulfillmentPolicyId,
  resolveImageUrls,
  type EbayConnectionDefaults,
} from '../mapping';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'test-product-id',
    category: 'Gold',
    metal_type: 'Gold',
    metal_variant: 'yellow_gold',
    title: '14K Yellow Gold Necklace',
    title_es: null,
    price_label: null,
    manual_price_label: null,
    price_mode: 'spot-multiplier',
    purity: 14,
    weight_grams: 10,
    inventory_number: 42,
    sku: null,
    slug: 'test-product',
    metal: 'gold',
    gram_weight: 10,
    stone_details: null,
    brand: null,
    product_type: 'Necklace',
    jewelry_type: 'Necklace',
    chain_type: null,
    length: '20 in',
    pricing_multiplier: 2,
    show_spot_price: true,
    special_price_override_enabled: false,
    special_price_override_amount: null,
    special_price_override_mode: 'amount',
    special_price_override_percent: null,
    quantity: 1,
    status: 'available',
    location: null,
    images: [],
    image_urls: ['https://example.supabase.co/storage/v1/object/public/product-images/products/a.webp'],
    image_padding: 'none',
    image_padding_by_image: null,
    description: 'A lovely test necklace.',
    description_es: null,
    details: [],
    details_es: [],
    tags: ['jt:Necklace', 'estate jewelry'],
    tags_es: [],
    private_price_label: 'SECRET-PRIVATE-LABEL',
    gender: null,
    item_year: 1985,
    cost_basis: 999999,
    melt_value: 888888,
    asking_price: null,
    minimum_price: 777777,
    live_spot_snapshot: { secret: 'do-not-leak' },
    acquisition_date: '2020-01-01',
    acquisition_source: 'SECRET-SOURCE',
    internal_notes: 'SECRET-INTERNAL-NOTE',
    public_notes: null,
    public_notes_es: null,
    featured: false,
    sort_order: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeConnection(overrides: Partial<EbayConnectionDefaults> = {}): EbayConnectionDefaults {
  return {
    fulfillment_policy_id: 'std-policy-1',
    express_fulfillment_policy_id: 'express-policy-1',
    high_value_shipping_threshold: 1000,
    payment_policy_id: 'pay-policy-1',
    return_policy_id: 'return-policy-1',
    merchant_location_key: 'nej-naples-fl',
    price_markup_pct: 15,
    marketplace_id: 'EBAY_US',
    ...overrides,
  };
}

describe('mapTitle', () => {
  it('leaves short titles untouched', () => {
    expect(mapTitle('14K Gold Cuban Link Chain')).toBe('14K Gold Cuban Link Chain');
  });

  it('collapses internal whitespace', () => {
    expect(mapTitle('  Gold   Ring  ')).toBe('Gold Ring');
  });

  it('leaves an exactly-80-char title untouched', () => {
    const exact = 'A'.repeat(80);
    expect(mapTitle(exact)).toBe(exact);
    expect(mapTitle(exact).length).toBe(80);
  });

  it('truncates an 81-char title to a word boundary, never exceeding 80', () => {
    const long = `${'A'.repeat(79)} B`; // 81 chars total, one space before the last char
    const result = mapTitle(long);
    expect(result.length).toBeLessThanOrEqual(80);
    expect(result.endsWith(' ')).toBe(false);
    expect(long.startsWith(result)).toBe(true);
  });

  it('truncates a long space-separated title at a word boundary', () => {
    const long = `${'Word '.repeat(20)}`.trim(); // > 80 chars
    const result = mapTitle(long);
    expect(result.length).toBeLessThanOrEqual(80);
    expect(result.endsWith(' ')).toBe(false);
    expect(long.startsWith(result)).toBe(true);
    // The char right after the cut (if any) is a word boundary, not a mid-word chop.
    if (long.length > result.length) {
      expect(long[result.length]).toBe(' ');
    }
  });

  it('hard-cuts a single unbroken 90-char word (no space to break on)', () => {
    const long = 'A'.repeat(90);
    const result = mapTitle(long);
    expect(result.length).toBe(80);
  });
});

describe('mapSku', () => {
  it('strips non-alphanumeric characters from short ids (Q11)', () => {
    expect(mapSku({ id: 'abc-123' })).toBe('abc123');
  });

  it('is <=50 chars and alphanumeric-only for long slugged ids', () => {
    const id = 'heavy-italian-14k-yellow-gold-cuban-link-bracelet-53-91g-21';
    const sku = mapSku({ id });
    expect(sku.length).toBeLessThanOrEqual(50);
    expect(sku).toMatch(/^[a-zA-Z0-9]+$/);
  });

  it('is deterministic and collision-resistant for near-identical long ids', () => {
    const idA = `${'a'.repeat(60)}-first`;
    const idB = `${'a'.repeat(60)}-second`;
    const skuA1 = mapSku({ id: idA });
    const skuA2 = mapSku({ id: idA });
    const skuB = mapSku({ id: idB });
    expect(skuA1).toBe(skuA2);
    expect(skuA1).not.toBe(skuB);
  });
});

describe('condition (Q5)', () => {
  it('is a fixed ConditionEnum string and one standard template', () => {
    expect(EBAY_CONDITION_ID).toBe('USED_EXCELLENT');
    expect(EBAY_CONDITION_DESCRIPTION.length).toBeGreaterThan(0);
    expect(EBAY_CONDITION_DESCRIPTION.length).toBeLessThanOrEqual(1000);
  });
});

describe('mapDescription', () => {
  it('includes a spec block with purity, weight, length, and era', () => {
    const html = mapDescription(makeProduct());
    expect(html).toContain('Purity: 14K');
    expect(html).toContain('Weight: 10g');
    expect(html).toContain('Length: 20 in');
    expect(html).toContain('Era: 1985');
  });

  it('shows "Ring size" instead of "Length" for a Ring', () => {
    const html = mapDescription(makeProduct({ product_type: 'Ring', jewelry_type: 'Ring', length: '7.5' }));
    expect(html).toContain('Ring size: 7.5');
    expect(html).not.toContain('Length: 7.5');
  });

  it('prints silver purity as fineness and gold as karats, never the bare column number', () => {
    const silver = mapDescription(makeProduct({ category: 'Silver', metal_type: 'Silver', metal_variant: 'silver', purity: 925 }));
    expect(silver).toContain('Purity: 925');
    expect(mapDescription(makeProduct({ purity: 10 }))).toContain('Purity: 10K');
  });

  it('converts a millimetre length to inches in the description and the Chain Length aspect', () => {
    const product = makeProduct({ length: '470 mm' });
    expect(mapDescription(product)).toContain('Length: 18.5 in');
    expect(mapAspects(product)['Chain Length']).toEqual(['18.5 in']);
  });

  it('escapes HTML-significant characters from free text', () => {
    const html = mapDescription(makeProduct({ description: '<script>alert(1)</script>' }));
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('never exceeds 4000 chars', () => {
    const html = mapDescription(makeProduct({ description: 'A'.repeat(5000) }));
    expect(html.length).toBeLessThanOrEqual(4000);
  });
});

describe('mapAspects', () => {
  it('maps metal, purity, type, and brand fallback', () => {
    const aspects = mapAspects(makeProduct());
    expect(aspects.Metal).toEqual(['Yellow Gold']);
    expect(aspects['Metal Purity']).toEqual(['14k']);
    expect(aspects.Type).toEqual(['Necklace']);
    expect(aspects.Brand).toEqual(['Unbranded']);
  });

  it('uses the real brand when present', () => {
    const aspects = mapAspects(makeProduct({ brand: 'David Yurman' }));
    expect(aspects.Brand).toEqual(['David Yurman']);
  });

  it('maps a Ring to "Ring Size", not "Chain Length"', () => {
    const aspects = mapAspects(makeProduct({ product_type: 'Ring', jewelry_type: 'Ring', length: '7.5' }));
    expect(aspects['Ring Size']).toEqual(['7.5']);
    expect(aspects['Chain Length']).toBeUndefined();
  });

  it('maps a Necklace length to "Chain Length" in inches', () => {
    const aspects = mapAspects(makeProduct({ length: '20 in' }));
    expect(aspects['Chain Length']).toEqual(['20 in']);
  });

  it('never invents a "Gemstone" aspect that was never in scope', () => {
    const aspects = mapAspects(makeProduct({ stone_details: 'Blue sapphire, 2ct' }));
    expect(Object.keys(aspects)).not.toContain('Gemstone');
  });

  it('Main Stone is always present — required by eBay\'s Fine Jewelry categories, only enforced at publish time (errorId: "item specific Main Stone is missing")', () => {
    expect(mapAspects(makeProduct({ stone_details: null }))['Main Stone']).toEqual(['No Stone']);
    expect(mapAspects(makeProduct({ stone_details: '' }))['Main Stone']).toEqual(['No Stone']);
  });

  it('Main Stone passes through real stone_details text — confirmed safe via eBay\'s Taxonomy API (aspectMode FREE_TEXT, not a closed enum)', () => {
    expect(mapAspects(makeProduct({ stone_details: 'Blue sapphire, 2ct' }))['Main Stone']).toEqual(['Blue sapphire, 2ct']);
  });

  it('caps an overlong Main Stone value at eBay\'s per-value length limit', () => {
    const long = 'x'.repeat(100);
    const aspects = mapAspects(makeProduct({ stone_details: long }));
    expect(aspects['Main Stone']?.[0].length).toBeLessThanOrEqual(65);
  });

  it('Style is always present — required for Necklaces/Pendants, Earrings, and Bracelets & Charms (recommended for Rings)', () => {
    expect(mapAspects(makeProduct())['Style']).toEqual(['Classic']);
  });

  it('drops jewelry-only aspects for silver-antique items (no "Chain Length" on a punch ladle)', () => {
    const ladle = makeProduct({ product_type: 'Ladle', jewelry_type: 'Ladle', metal_variant: 'silver', length: '12.5', brand: 'Tiffany & Co.' });
    const aspects = mapAspects(ladle, { silverAntique: true });
    // Kept — sensible for silverware:
    expect(aspects.Metal).toEqual(['Sterling Silver']);
    expect(aspects.Brand).toEqual(['Tiffany & Co.']);
    expect(aspects.Type).toEqual(['Ladle']);
    // Dropped — jewelry-only, nonsensical for a ladle:
    expect(aspects['Chain Length']).toBeUndefined();
    expect(aspects['Main Stone']).toBeUndefined();
    expect(aspects.Style).toBeUndefined();
  });

  it('still emits the full jewelry aspect set when silverAntique is not set', () => {
    const aspects = mapAspects(makeProduct());
    expect(aspects['Main Stone']).toBeDefined();
    expect(aspects.Style).toEqual(['Classic']);
  });
});

describe('resolveCategory — Fine vs Fashion routing (Q4) and Coin/Bullion exclusion (Q6)', () => {
  it('routes a solid-gold Necklace to the Fine Jewelry leaf', () => {
    const category = resolveCategory(makeProduct({ metal_variant: 'yellow_gold', product_type: 'Necklace' }));
    expect(category?.categoryId).toBe('261993');
    expect(category?.path).toMatch(/Fine Jewelry/);
  });

  it('routes a vermeil Necklace to the Fashion Jewelry leaf (155101), never Fine', () => {
    const category = resolveCategory(makeProduct({ metal_variant: 'vermeil', product_type: 'Necklace' }));
    expect(category?.categoryId).toBe('155101');
    expect(category?.path).toMatch(/Fashion Jewelry/);
  });

  it('routes a vermeil "Koma Clasp" (the catalog\'s real vermeil items) to Fashion Necklaces & Pendants', () => {
    const category = resolveCategory(makeProduct({ metal_variant: 'vermeil', product_type: 'Koma Clasp', jewelry_type: 'Koma Clasp' }));
    expect(category?.categoryId).toBe('155101');
  });

  it('leaves an unpinned vermeil type (Ring — no such item exists) as null rather than guessing', () => {
    const category = resolveCategory(makeProduct({ metal_variant: 'vermeil', product_type: 'Ring', jewelry_type: 'Ring' }));
    expect(category).toBeNull();
  });

  it('never routes vermeil to a Fine Jewelry category id', () => {
    for (const type of ['Necklace', 'Ring', 'Earrings', 'Bracelet']) {
      const category = resolveCategory(makeProduct({ metal_variant: 'vermeil', product_type: type, jewelry_type: type }));
      const fineCategory = resolveCategory(makeProduct({ metal_variant: 'yellow_gold', product_type: type, jewelry_type: type }));
      if (fineCategory) {
        expect(category?.categoryId).not.toBe(fineCategory.categoryId);
      }
    }
  });

  it('returns null for Coin and Bullion — never a category, never a guess', () => {
    expect(resolveCategory(makeProduct({ product_type: 'Coin', jewelry_type: 'Coin' }))).toBeNull();
    expect(resolveCategory(makeProduct({ product_type: 'Bullion', jewelry_type: 'Bullion' }))).toBeNull();
  });

  it('isEbayIneligibleProductType flags exactly Coin and Bullion', () => {
    expect(isEbayIneligibleProductType('Coin')).toBe(true);
    expect(isEbayIneligibleProductType('Bullion')).toBe(true);
    expect(isEbayIneligibleProductType('Silverware')).toBe(false);
    expect(isEbayIneligibleProductType('Necklace')).toBe(false);
  });

  it('Silverware IS eligible and maps to a category (Q6b)', () => {
    const category = resolveCategory(makeProduct({ product_type: 'Silverware', jewelry_type: 'Silverware', metal_variant: 'silver' }));
    expect(category).not.toBeNull();
  });

  it('corrected jewelry leaves: Brooch → Fine Brooches & Pins, Cufflinks → Men\'s Cufflinks (old 12595/4196 were invalid)', () => {
    const brooch = resolveCategory(makeProduct({ product_type: 'Brooch', jewelry_type: 'Brooch', metal_variant: 'yellow_gold' }));
    expect(brooch?.categoryId).toBe('261989');
    const cufflinks = resolveCategory(makeProduct({ product_type: 'Cufflinks', jewelry_type: 'Cufflinks', metal_variant: 'yellow_gold' }));
    expect(cufflinks?.categoryId).toBe('137843');
  });

  it('maps every silver flatware serving-piece type to the verified Flatware & Silverware leaf (20104)', () => {
    for (const type of ['Spoon', 'Serving Spoon', 'Salt Spoon', 'Berry Spoon', 'Mote Spoon', 'Cold Meat Fork', 'Fish Server', 'Ladle', 'Knife']) {
      const category = resolveCategory(makeProduct({ product_type: type, jewelry_type: type, metal_variant: 'silver' }));
      expect(category?.categoryId).toBe('20104');
      expect(category?.path).toMatch(/Antiques > Silver/);
    }
  });

  it('maps silver holloware types to their own dedicated leaves', () => {
    const cases: Record<string, string> = {
      Tray: '39441',
      'Coffee Pot': '37998',
      'Salt Cellar': '163273',
      'Napkin Ring': '39440',
      'Decanter Label': '163056',
      'Tazza Set': '63620',
    };
    for (const [type, id] of Object.entries(cases)) {
      const category = resolveCategory(makeProduct({ product_type: type, jewelry_type: type, metal_variant: 'silver' }));
      expect(category?.categoryId).toBe(id);
    }
  });

  it('silver category lookup is case-insensitive (guards against product_type casing drift)', () => {
    const category = resolveCategory(makeProduct({ product_type: 'cold meat fork', jewelry_type: 'cold meat fork', metal_variant: 'silver' }));
    expect(category?.categoryId).toBe('20104');
  });

  it('pre-mapped 2026-07-10: the new Mug item + expected future silver forms map to real verified leaves', () => {
    const cases: Record<string, string> = {
      Mug: '37993', Cup: '37993', Goblet: '37993', Tankard: '37993',
      Bowl: '37991', Compote: '37991', Porringer: '37991',
      Candlestick: '20103', Candelabra: '20103',
      Pitcher: '37995', Ewer: '37995',
      Vase: '39443', Creamer: '163055', 'Sugar Bowl': '163055', Teapot: '37998',
      Box: '37992', 'Snuff Box': '37992', Vinaigrette: '107441', 'Cigarette Case': '105900',
      Bell: '261598', Inkwell: '970',
    };
    for (const [type, id] of Object.entries(cases)) {
      const category = resolveCategory(makeProduct({ product_type: type, jewelry_type: type, metal_variant: 'silver' }));
      expect(category?.categoryId).toBe(id);
    }
  });

  it('generic silver fallback: an unanticipated SILVER product_type still gets a valid catch-all leaf (1215), not null', () => {
    const category = resolveCategory(makeProduct({ product_type: 'Épergne Centerpiece', jewelry_type: 'Épergne Centerpiece', metal_variant: 'silver' }));
    expect(category?.categoryId).toBe('1215');
    expect(category?.approximate).toBe(true);
  });

  it('generic fallback is SILVER-only: an unanticipated GOLD product_type still returns null (needs explicit mapping)', () => {
    const category = resolveCategory(makeProduct({ product_type: 'Épergne Centerpiece', jewelry_type: 'Épergne Centerpiece', metal_variant: 'yellow_gold' }));
    expect(category).toBeNull();
  });

  it('Bell/Inkwell (Collectibles path, not Antiques>Silver) still get the lean silver-object aspect set via objectCategory', () => {
    for (const type of ['Bell', 'Inkwell']) {
      const category = resolveCategory(makeProduct({ product_type: type, jewelry_type: type, metal_variant: 'silver' }));
      expect(isSilverAntiqueCategory(category)).toBe(true);
    }
  });

  it('the new Mug item gets clean silver-object aspects — no bogus "Chain Length" / "Main Stone"', () => {
    const product = makeProduct({ product_type: 'Mug', jewelry_type: 'Mug', metal_variant: 'silver', length: '4.55' });
    const payload = buildMappedPayload(product, makeConnection(), null);
    expect(payload.categoryId).toBe('37993');
    expect(payload.aspects['Chain Length']).toBeUndefined();
    expect(payload.aspects['Main Stone']).toBeUndefined();
    expect(payload.aspects.Type).toEqual(['Mug']);
  });

  it('an explicit override always wins', () => {
    const category = resolveCategory(makeProduct({ product_type: 'Coin' }), { id: '999', path: 'Custom > Path' });
    expect(category).toEqual({ categoryId: '999', path: 'Custom > Path' });
  });
});

describe('computeEbayPrice', () => {
  it('applies the markup percentage on top of the manual price', () => {
    const product = makeProduct({ price_mode: 'manual', manual_price_label: '$100' });
    const result = computeEbayPrice(product, null, 15);
    expect(result.basePrice).toBe(100);
    expect(result.price).toBe(115);
    expect(result.rejectedReason).toBeNull();
  });

  it('applies the markup on top of the spot-computed price', () => {
    const product = makeProduct({ price_mode: 'spot-multiplier', purity: 14, gram_weight: 10, pricing_multiplier: 2 });
    const spotData: SpotData = { goldPerTroyOz: 3110.34768, silverPerTroyOz: null, fetchedAt: Date.now(), source: 'api' };
    // melt = 10 * (14/24) * (3110.34768/31.1034768) = 10 * 0.58333 * 100 = ~583.33;
    // calcSpotPriceValue already multiplies by pricing_multiplier (2) = ~1166.67,
    // which getProductPriceValue rounds to the whole dollar the storefront shows.
    const result = computeEbayPrice(product, spotData, 0);
    expect(result.basePrice).toBe(1167);
    expect(result.price).toBe(result.basePrice);
  });

  it('fails closed instead of pushing a storefront fallback spot price', () => {
    const product = makeProduct({ price_mode: 'spot-multiplier', purity: 14, gram_weight: 10, pricing_multiplier: 2 });
    const fallback: SpotData = { goldPerTroyOz: 3300, silverPerTroyOz: null, fetchedAt: Date.now(), source: 'fallback' };
    const result = computeEbayPrice(product, fallback, 15);
    expect(result.price).toBeNull();
    expect(result.rejectedReason).toMatch(/live metal spot pricing is unavailable/i);
  });

  it('requires a live silver quote for silver spot-priced inventory', () => {
    const product = makeProduct({ category: 'Silver', price_mode: 'spot-multiplier', purity: 925, gram_weight: 100, pricing_multiplier: 2 });
    const goldOnly: SpotData = { goldPerTroyOz: 3300, silverPerTroyOz: null, fetchedAt: Date.now(), source: 'api' };
    const result = computeEbayPrice(product, goldOnly, 15);
    expect(result.price).toBeNull();
    expect(result.rejectedReason).toMatch(/live silver spot pricing is unavailable/i);
  });

  it('uses a sold product price lock instead of the latest metal price', () => {
    const product = makeProduct({ status: 'sold', sold_price: 800, price_mode: 'spot-multiplier' });
    const spotData: SpotData = { goldPerTroyOz: 9_999, silverPerTroyOz: null, fetchedAt: Date.now(), source: 'api' };
    const result = computeEbayPrice(product, spotData, 15);
    expect(result.basePrice).toBe(800);
    expect(result.price).toBe(920);
  });

  it('has no platform price floor (unlike Etsy) — a low price still computes', () => {
    // Product prices are whole dollars, so the markup is now the only way to
    // reach a sub-dollar figure. $1 less 90% is $0.10 — under Etsy's $0.20
    // floor, which eBay deliberately does not mirror.
    const product = makeProduct({ price_mode: 'manual', manual_price_label: '$1' });
    const result = computeEbayPrice(product, null, -90);
    expect(result.basePrice).toBe(1);
    expect(result.price).toBe(0.1);
    expect(result.rejectedReason).toBeNull();
  });

  it('rejects a sub-50-cent price, which rounds away to $0', () => {
    const product = makeProduct({ price_mode: 'manual', manual_price_label: '$0.10' });
    const result = computeEbayPrice(product, null, 0);
    expect(result.price).toBeNull();
    expect(result.rejectedReason).toMatch(/no computable price/i);
  });

  it('returns null with a reason when no price can be computed', () => {
    const product = makeProduct({ price_mode: 'manual', manual_price_label: null, asking_price: null });
    const result = computeEbayPrice(product, null, 15);
    expect(result.price).toBeNull();
    expect(result.rejectedReason).toBeTruthy();
  });
});

describe('resolveFulfillmentPolicyId — Q16 price-tiered express shipping', () => {
  it('uses the standard policy at or below the threshold', () => {
    expect(resolveFulfillmentPolicyId(1000, makeConnection())).toEqual({ policyId: 'std-policy-1', tier: 'standard' });
    expect(resolveFulfillmentPolicyId(500, makeConnection())).toEqual({ policyId: 'std-policy-1', tier: 'standard' });
  });

  it('uses the express policy strictly above the threshold', () => {
    expect(resolveFulfillmentPolicyId(1000.01, makeConnection())).toEqual({ policyId: 'express-policy-1', tier: 'express' });
    expect(resolveFulfillmentPolicyId(5000, makeConnection())).toEqual({ policyId: 'express-policy-1', tier: 'express' });
  });

  it('respects an admin-edited threshold', () => {
    const connection = makeConnection({ high_value_shipping_threshold: 200 });
    expect(resolveFulfillmentPolicyId(250, connection)).toEqual({ policyId: 'express-policy-1', tier: 'express' });
  });

  it('falls back to standard if no express policy id is configured', () => {
    const connection = makeConnection({ express_fulfillment_policy_id: null });
    expect(resolveFulfillmentPolicyId(5000, connection)).toEqual({ policyId: 'std-policy-1', tier: 'standard' });
  });

  it('returns nulls when not connected', () => {
    expect(resolveFulfillmentPolicyId(5000, null)).toEqual({ policyId: null, tier: 'standard' });
  });
});

describe('resolveImageUrls / resolveEbayImageUrl — both URL shapes', () => {
  it('leaves an already-absolute Supabase Storage URL untouched', () => {
    const url = 'https://example.supabase.co/storage/v1/object/public/product-images/products/a.webp';
    expect(resolveEbayImageUrl(url)).toBe(url);
  });

  it('absolutizes a legacy /assets/... path against the site URL', () => {
    expect(resolveEbayImageUrl('/assets/images/shop/a.png')).toBe('https://naplesestatejewelry.com/assets/images/shop/a.png');
  });

  it('URL-encodes spaces in a local filename (errorId 25721 "Incorrect URL format")', () => {
    const result = resolveEbayImageUrl('/assets/shoppics/IMG_5132 (Product Staging).webp');
    expect(result).toBe('https://naplesestatejewelry.com/assets/shoppics/IMG_5132%20(Product%20Staging).webp');
    expect(result).not.toMatch(/ /);
  });

  it('caps at 24 images and prefers image_urls over the legacy images[] mirror', () => {
    const urls = Array.from({ length: 30 }, (_, i) => `https://example.com/img-${i}.webp`);
    const result = resolveImageUrls(makeProduct({ image_urls: urls, images: ['/assets/legacy.png'] }));
    expect(result).toHaveLength(24);
    expect(result[0]).toBe('https://example.com/img-0.webp');
  });

  it('falls back to images[] when image_urls is empty', () => {
    const result = resolveImageUrls(makeProduct({ image_urls: [], images: ['/assets/legacy.png'] }));
    expect(result).toEqual(['https://naplesestatejewelry.com/assets/legacy.png']);
  });
});

describe('buildPreflightChecks', () => {
  it('passes for a well-formed, connected, eligible product', () => {
    const spotData: SpotData = { goldPerTroyOz: 3300, silverPerTroyOz: 35, fetchedAt: Date.now(), source: 'api' };
    const checks = buildPreflightChecks(makeProduct(), makeConnection(), spotData);
    expect(isPreflightPassing(checks)).toBe(true);
  });

  it('blocks (never errors) a Coin/Bullion item with the owner-decision message', () => {
    const checks = buildPreflightChecks(makeProduct({ product_type: 'Coin', jewelry_type: 'Coin' }), makeConnection(), null);
    const eligibility = checks.find((c) => c.check === 'eligibility');
    expect(eligibility?.ok).toBe(false);
    expect(eligibility?.message).toMatch(/not synced to eBay per owner decision/i);
    expect(isPreflightPassing(checks)).toBe(false);
  });

  it('blocks when not connected', () => {
    const checks = buildPreflightChecks(makeProduct(), null, null);
    expect(checks.find((c) => c.check === 'connected')?.ok).toBe(false);
  });

  it('blocks a vermeil item of a type whose Fashion Jewelry leaf is unpinned (e.g. Ring)', () => {
    const checks = buildPreflightChecks(makeProduct({ metal_variant: 'vermeil', product_type: 'Ring', jewelry_type: 'Ring' }), makeConnection(), null);
    const categoryCheck = checks.find((c) => c.check === 'category');
    expect(categoryCheck?.ok).toBe(false);
    expect(categoryCheck?.message).toMatch(/Fashion Jewelry/i);
  });

  it('does NOT block a vermeil item whose Fashion Jewelry leaf IS pinned (Necklace/Koma Clasp)', () => {
    const checks = buildPreflightChecks(makeProduct({ metal_variant: 'vermeil', product_type: 'Necklace', jewelry_type: 'Necklace' }), makeConnection(), null);
    expect(checks.find((c) => c.check === 'category')?.ok).toBe(true);
  });

  it('blocks a zero-quantity item', () => {
    const checks = buildPreflightChecks(makeProduct({ quantity: 0 }), makeConnection(), null);
    expect(checks.find((c) => c.check === 'quantity')?.ok).toBe(false);
  });

  it('blocks an item with no images', () => {
    const checks = buildPreflightChecks(makeProduct({ image_urls: [], images: [] }), makeConnection(), null);
    expect(checks.find((c) => c.check === 'images')?.ok).toBe(false);
  });
});

describe('buildMappedPayload — private-field allowlist guarantee', () => {
  it('never leaks cost_basis, minimum_price, internal_notes, or other private fields', () => {
    const product = makeProduct();
    const payload = buildMappedPayload(product, makeConnection(), null);
    const serialized = JSON.stringify(payload);

    for (const field of EBAY_FORBIDDEN_PRODUCT_FIELDS) {
      const value = product[field as keyof Product];
      if (typeof value === 'string' && value) {
        expect(serialized).not.toContain(value);
      }
    }
    for (const field of EBAY_FORBIDDEN_PRODUCT_FIELDS) {
      expect(Object.prototype.hasOwnProperty.call(payload, field)).toBe(false);
    }
  });

  it('resolves the fulfillment policy tier consistently with the computed price', () => {
    const highValueProduct = makeProduct({ price_mode: 'manual', manual_price_label: '$5000' });
    const payload = buildMappedPayload(highValueProduct, makeConnection(), null);
    expect(payload.shippingTier).toBe('express');
    expect(payload.fulfillmentPolicyId).toBe('express-policy-1');
  });

  it('caps images at 24', () => {
    const urls = Array.from({ length: 30 }, (_, i) => `https://example.com/img-${i}.webp`);
    const payload = buildMappedPayload(makeProduct({ image_urls: urls }), makeConnection(), null);
    expect(payload.images).toHaveLength(24);
  });
});

describe('computeContentHash', () => {
  it('is stable for identical payloads', () => {
    const payload = buildMappedPayload(makeProduct(), makeConnection(), null);
    expect(computeContentHash(payload)).toBe(computeContentHash({ ...payload }));
  });

  it('does NOT change on a price-only change (2026-07-10) — price has its own dedicated push path; this hash is for content, not market drift', () => {
    const a = buildMappedPayload(makeProduct({ manual_price_label: '$100', price_mode: 'manual' }), makeConnection(), null);
    const b = buildMappedPayload(makeProduct({ manual_price_label: '$200', price_mode: 'manual' }), makeConnection(), null);
    expect(a.price).not.toBe(b.price);
    expect(computeContentHash(a)).toBe(computeContentHash(b));
  });

  it('still changes when a non-price field changes (title)', () => {
    const a = buildMappedPayload(makeProduct({ title: 'Original Title' }), makeConnection(), null);
    const b = buildMappedPayload(makeProduct({ title: 'Different Title' }), makeConnection(), null);
    expect(computeContentHash(a)).not.toBe(computeContentHash(b));
  });

  it('changes when a price crossing the Q16 threshold flips the resolved shipping policy', () => {
    // makeConnection()'s 15% markup means the pushed price is base * 1.15 —
    // pick bases that land clearly on each side of the $1000 threshold.
    const belowThreshold = buildMappedPayload(
      makeProduct({ manual_price_label: '$800', price_mode: 'manual' }), // 800 * 1.15 = 920
      makeConnection(),
      null,
    );
    const aboveThreshold = buildMappedPayload(
      makeProduct({ manual_price_label: '$1900', price_mode: 'manual' }), // 1900 * 1.15 = 2185
      makeConnection(),
      null,
    );
    expect(belowThreshold.fulfillmentPolicyId).toBe('std-policy-1');
    expect(aboveThreshold.fulfillmentPolicyId).toBe('express-policy-1');
    expect(computeContentHash(belowThreshold)).not.toBe(computeContentHash(aboveThreshold));
  });
});

describe('site shipping-tier fulfillment policies (2026-07-30)', () => {
  const tierMap = {
    'fee-19': 'tier-19',
    'fee-59': 'tier-59',
    'fee-99': 'tier-99',
    'fee-165': 'tier-165',
  };

  it('prefers the provisioned tier policy over the legacy threshold pair', () => {
    expect(resolveFulfillmentPolicyId(49, makeConnection(), tierMap)).toEqual({ policyId: 'tier-19', tier: 'tiered' });
    expect(resolveFulfillmentPolicyId(2185, makeConnection(), tierMap)).toEqual({ policyId: 'tier-59', tier: 'tiered' });
    expect(resolveFulfillmentPolicyId(8203, makeConnection(), tierMap)).toEqual({ policyId: 'tier-99', tier: 'tiered' });
    expect(resolveFulfillmentPolicyId(34999, makeConnection(), tierMap)).toEqual({ policyId: 'tier-165', tier: 'tiered' });
  });

  it('falls back to the legacy standard/express behavior when the tier is not provisioned', () => {
    // fee-29 ($250-$599 band) is deliberately missing from tierMap.
    expect(resolveFulfillmentPolicyId(400, makeConnection(), tierMap)).toEqual({ policyId: 'std-policy-1', tier: 'standard' });
    // No map at all — original behavior, including the express threshold.
    expect(resolveFulfillmentPolicyId(2185, makeConnection())).toEqual({ policyId: 'express-policy-1', tier: 'express' });
    expect(resolveFulfillmentPolicyId(49, makeConnection(), {})).toEqual({ policyId: 'std-policy-1', tier: 'standard' });
  });

  it('changes the content hash when a price crosses a site tier boundary', () => {
    const inFirstTier = buildMappedPayload(
      makeProduct({ manual_price_label: '$80', price_mode: 'manual' }), // 80 * 1.15 = 92 -> fee-19
      makeConnection(),
      null,
      undefined,
      tierMap,
    );
    const inLaterTier = buildMappedPayload(
      makeProduct({ manual_price_label: '$1900', price_mode: 'manual' }), // 2185 -> fee-59
      makeConnection(),
      null,
      undefined,
      tierMap,
    );
    expect(inFirstTier.fulfillmentPolicyId).toBe('tier-19');
    expect(inFirstTier.shippingTier).toBe('tiered');
    expect(inLaterTier.fulfillmentPolicyId).toBe('tier-59');
    expect(computeContentHash(inFirstTier)).not.toBe(computeContentHash(inLaterTier));
  });

  it('builds a FLAT_RATE policy payload carrying the exact tier fee', () => {
    const payload = buildTierFulfillmentPolicyPayload({ name: 'NEJ Insured Shipping $59', fee: 59, marketplaceId: 'EBAY_US' });
    expect(payload.name).toBe('NEJ Insured Shipping $59');
    expect(payload.marketplaceId).toBe('EBAY_US');
    const options = payload.shippingOptions as Array<{ costType: string; shippingServices: Array<{ shippingCost: { value: string }; additionalShippingCost: { value: string } }> }>;
    expect(options[0].costType).toBe('FLAT_RATE');
    expect(options[0].shippingServices[0].shippingCost.value).toBe('59.00');
    // One-of-one estate pieces: additional quantity still pays the full fee.
    expect(options[0].shippingServices[0].additionalShippingCost.value).toBe('59.00');
  });
});

describe('Best Offer per item (2026-10-14)', () => {
  it('maps products.ebay_best_offer onto the payload; missing or null means off', () => {
    expect(buildMappedPayload(makeProduct({ ebay_best_offer: true }), makeConnection(), null).bestOfferEnabled).toBe(true);
    expect(buildMappedPayload(makeProduct({ ebay_best_offer: false }), makeConnection(), null).bestOfferEnabled).toBe(false);
    expect(buildMappedPayload(makeProduct({ ebay_best_offer: null }), makeConnection(), null).bestOfferEnabled).toBe(false);
    // Before the SQL runs the column is simply absent from select('*').
    expect(buildMappedPayload(makeProduct(), makeConnection(), null).bestOfferEnabled).toBe(false);
  });

  it('does NOT change the content hash — the box pushes its own change, and every live listing must not turn "Content stale"', () => {
    const off = buildMappedPayload(makeProduct({ ebay_best_offer: false }), makeConnection(), null);
    const on = buildMappedPayload(makeProduct({ ebay_best_offer: true }), makeConnection(), null);
    expect(computeContentHash(off)).toBe(computeContentHash(on));
  });
});
