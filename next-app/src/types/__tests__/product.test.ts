import { describe, expect, it } from 'vitest';
import {
  AVAILABLE_ONLY_SHOP_PRODUCT_STATUSES,
  PUBLIC_SHOP_PRODUCT_STATUSES,
  isProductPurchasable,
  isProductVisibleInShop,
  formatProductPurityLabel,
  normalizeProductLengthSizeValue,
  normalizeProductWidthMm,
  parseLengthInches,
  normalizeProductStatus,
  productWidthDisplay,
  normalizeSpecialPriceOverrideMode,
  resolveAdvertisedTradeInPrice,
  resolveSpecialTradeInPrice,
} from '../product';

type OverrideFields = Parameters<typeof resolveAdvertisedTradeInPrice>[0];

const noOverride: OverrideFields = {
  special_price_override_enabled: false,
  special_price_override_amount: null,
  special_price_override_mode: null,
  special_price_override_percent: null,
};

describe('resolveAdvertisedTradeInPrice', () => {
  it('falls back to the plain melt value when nothing is set', () => {
    expect(resolveAdvertisedTradeInPrice(noOverride, 1000, null)).toBe(1000);
    expect(resolveAdvertisedTradeInPrice(noOverride, 1000, { enabled: false, percent: 10 })).toBe(1000);
  });

  it('applies the site-wide default percent over melt when enabled (positive, negative, zero)', () => {
    expect(resolveAdvertisedTradeInPrice(noOverride, 1000, { enabled: true, percent: 10 })).toBe(1100);
    expect(resolveAdvertisedTradeInPrice(noOverride, 1000, { enabled: true, percent: -10 })).toBe(900);
    expect(resolveAdvertisedTradeInPrice(noOverride, 1000, { enabled: true, percent: 0 })).toBe(1000);
  });

  it('the site-wide default needs a computable melt value', () => {
    expect(resolveAdvertisedTradeInPrice(noOverride, null, { enabled: true, percent: 10 })).toBeNull();
  });

  it('ignores an absent/invalid site percent (falls back to melt)', () => {
    expect(resolveAdvertisedTradeInPrice(noOverride, 1000, { enabled: true, percent: null })).toBe(1000);
  });

  it('the per-item override ALWAYS wins over the site-wide default', () => {
    const flat: OverrideFields = {
      special_price_override_enabled: true,
      special_price_override_mode: 'amount',
      special_price_override_amount: 777,
      special_price_override_percent: null,
    };
    expect(resolveAdvertisedTradeInPrice(flat, 1000, { enabled: true, percent: 10 })).toBe(777);

    const pct: OverrideFields = {
      special_price_override_enabled: true,
      special_price_override_mode: 'percent',
      special_price_override_amount: null,
      special_price_override_percent: 25,
    };
    expect(resolveAdvertisedTradeInPrice(pct, 1000, { enabled: true, percent: 10 })).toBe(1250);
    expect(
      resolveAdvertisedTradeInPrice(pct, 1000, { enabled: true, basis: 'asking', percent: null, discountPercent: 20 }, 2000),
    ).toBe(1250);
  });

  describe('site-wide basis "asking" (% off the asking price)', () => {
    const asking = (discountPercent: number | null) =>
      ({ enabled: true, basis: 'asking', percent: 10, discountPercent }) as const;

    it('takes the discount off the asking price, ignoring the melt percent', () => {
      expect(resolveAdvertisedTradeInPrice(noOverride, 1000, asking(20), 2000)).toBe(1600);
      expect(resolveAdvertisedTradeInPrice(noOverride, 1000, asking(0), 2000)).toBe(2000);
      expect(resolveAdvertisedTradeInPrice(noOverride, 1000, asking(12.5), 1247)).toBeCloseTo(1091.125);
    });

    it('has no floor at melt value', () => {
      expect(resolveAdvertisedTradeInPrice(noOverride, 1000, asking(50), 1200)).toBe(600);
    });

    it('falls back to melt when there is no numeric asking price ("Contact for price")', () => {
      expect(resolveAdvertisedTradeInPrice(noOverride, 1000, asking(20), null)).toBe(1000);
      expect(resolveAdvertisedTradeInPrice(noOverride, 1000, asking(20))).toBe(1000);
      expect(resolveAdvertisedTradeInPrice(noOverride, 1000, asking(20), 0)).toBe(1000);
    });

    it('falls back to melt when the discount is missing or out of range', () => {
      expect(resolveAdvertisedTradeInPrice(noOverride, 1000, asking(null), 2000)).toBe(1000);
      expect(resolveAdvertisedTradeInPrice(noOverride, 1000, asking(-5), 2000)).toBe(1000);
      expect(resolveAdvertisedTradeInPrice(noOverride, 1000, asking(101), 2000)).toBe(1000);
    });

    it('still needs a computable melt value, so the line shows on the same items as before', () => {
      expect(resolveAdvertisedTradeInPrice(noOverride, null, asking(20), 2000)).toBeNull();
    });

    it('is ignored while the site-wide default is off', () => {
      expect(resolveAdvertisedTradeInPrice(noOverride, 1000, { ...asking(20), enabled: false }, 2000)).toBe(1000);
    });

    it('basis "melt" (or absent) keeps the % over melt even with a discount stored', () => {
      expect(
        resolveAdvertisedTradeInPrice(noOverride, 1000, { enabled: true, basis: 'melt', percent: 10, discountPercent: 20 }, 2000),
      ).toBe(1100);
      expect(resolveAdvertisedTradeInPrice(noOverride, 1000, { enabled: true, percent: 10, discountPercent: 20 }, 2000)).toBe(1100);
    });
  });

  // Owner 2026-10-31: the item's own "Override Type" can also be a % or a $
  // amount OFF the asking price (the price the shop shows and checkout charges).
  describe('per-item override off the asking price', () => {
    const siteMelt = { enabled: true, percent: 10 } as const;
    const offAsking = (
      mode: 'asking_percent' | 'asking_amount',
      value: number | null,
    ): OverrideFields => ({
      special_price_override_enabled: true,
      special_price_override_mode: mode,
      special_price_override_amount: 777, // a stale number from another choice must never leak in
      special_price_override_percent: 25,
      special_price_override_discount_percent: mode === 'asking_percent' ? value : null,
      special_price_override_discount_amount: mode === 'asking_amount' ? value : null,
    });

    it('percent off: $1,000 asking − 20% = $800, and it beats the site-wide default', () => {
      expect(resolveAdvertisedTradeInPrice(offAsking('asking_percent', 20), 500, siteMelt, 1000)).toBe(800);
      expect(resolveAdvertisedTradeInPrice(offAsking('asking_percent', 0), 500, siteMelt, 1000)).toBe(1000);
      expect(resolveAdvertisedTradeInPrice(offAsking('asking_percent', 12.5), 500, null, 1247)).toBeCloseTo(1091.125);
    });

    it('dollar amount off: $1,000 asking − $150 = $850', () => {
      expect(resolveAdvertisedTradeInPrice(offAsking('asking_amount', 150), 500, siteMelt, 1000)).toBe(850);
    });

    it('has no floor at melt value', () => {
      expect(resolveAdvertisedTradeInPrice(offAsking('asking_percent', 60), 500, null, 1000)).toBe(400);
      expect(resolveAdvertisedTradeInPrice(offAsking('asking_amount', 700), 500, null, 1000)).toBe(300);
    });

    it('never advertises $0 or less, or an out-of-range / missing number: falls back to the site-wide default', () => {
      expect(resolveAdvertisedTradeInPrice(offAsking('asking_amount', 1000), 500, siteMelt, 1000)).toBe(550);
      expect(resolveAdvertisedTradeInPrice(offAsking('asking_amount', 1500), 500, siteMelt, 1000)).toBe(550);
      expect(resolveAdvertisedTradeInPrice(offAsking('asking_percent', 100), 500, siteMelt, 1000)).toBe(550);
      expect(resolveAdvertisedTradeInPrice(offAsking('asking_percent', 101), 500, siteMelt, 1000)).toBe(550);
      expect(resolveAdvertisedTradeInPrice(offAsking('asking_percent', -5), 500, siteMelt, 1000)).toBe(550);
      expect(resolveAdvertisedTradeInPrice(offAsking('asking_amount', 0), 500, siteMelt, 1000)).toBe(550);
      expect(resolveAdvertisedTradeInPrice(offAsking('asking_amount', null), 500, null, 1000)).toBe(500);
    });

    it('"Contact for price" (no numeric asking price) falls back to the site-wide default, then melt', () => {
      expect(resolveAdvertisedTradeInPrice(offAsking('asking_percent', 20), 500, siteMelt, null)).toBe(550);
      expect(resolveAdvertisedTradeInPrice(offAsking('asking_amount', 150), 500, null, 0)).toBe(500);
    });

    it('is off while the override checkbox is off', () => {
      expect(
        resolveAdvertisedTradeInPrice({ ...offAsking('asking_percent', 20), special_price_override_enabled: false }, 500, null, 1000),
      ).toBe(500);
    });

    it('the two older choices are unchanged, and an unknown mode reads as a flat amount', () => {
      expect(resolveSpecialTradeInPrice({ ...offAsking('asking_percent', 20), special_price_override_mode: 'amount' }, 500, 1000)).toBe(777);
      expect(resolveSpecialTradeInPrice({ ...offAsking('asking_percent', 20), special_price_override_mode: 'percent' }, 500, 1000)).toBe(625);
      expect(normalizeSpecialPriceOverrideMode('asking_percent')).toBe('asking_percent');
      expect(normalizeSpecialPriceOverrideMode('asking_amount')).toBe('asking_amount');
      expect(normalizeSpecialPriceOverrideMode('something')).toBe('amount');
      expect(normalizeSpecialPriceOverrideMode(null)).toBe('amount');
    });
  });
});

describe('draft product visibility', () => {
  it('keeps draft as a real status while excluding it from the public shop', () => {
    expect(normalizeProductStatus('Draft')).toBe('draft');
    expect(isProductVisibleInShop('draft')).toBe(false);
    expect(isProductPurchasable('draft', 1)).toBe(false);
    expect(PUBLIC_SHOP_PRODUCT_STATUSES).not.toContain('draft');
    expect(AVAILABLE_ONLY_SHOP_PRODUCT_STATUSES).not.toContain('draft');
  });

  it('preserves the established available and sold public behavior', () => {
    expect(isProductVisibleInShop('available')).toBe(true);
    expect(isProductPurchasable('available', 1)).toBe(true);
    expect(isProductVisibleInShop('sold')).toBe(true);
  });
});

describe('product width', () => {
  const productForWidth = (product_type: string, width_mm: number | null) => ({
    product_type,
    jewelry_type: product_type,
    width_mm,
    title: `${product_type} test`,
    title_es: null,
    chain_type: null,
    tags: [],
    tags_es: [],
  });

  it('normalizes positive millimeter measurements to two decimal places', () => {
    expect(normalizeProductWidthMm('8 mm')).toBe(8);
    expect(normalizeProductWidthMm(12.345)).toBe(12.35);
    expect(normalizeProductWidthMm(0)).toBeNull();
    expect(normalizeProductWidthMm(1001)).toBeNull();
  });

  it('displays width only for necklaces and bracelets', () => {
    expect(productWidthDisplay(productForWidth('Necklace', 8))).toBe('8 mm');
    expect(productWidthDisplay(productForWidth('Bracelet', 12.5))).toBe('12.5 mm');
    expect(productWidthDisplay(productForWidth('Ring', 8))).toBeNull();
    expect(productWidthDisplay(productForWidth('Bracelet', null))).toBeNull();
  });
});

describe('product length and size normalization', () => {
  it('stores plain and inch-suffixed measurements as the same bare number', () => {
    expect(normalizeProductLengthSizeValue(24)).toBe('24');
    expect(normalizeProductLengthSizeValue('24')).toBe('24');
    expect(normalizeProductLengthSizeValue('24 in')).toBe('24');
    expect(normalizeProductLengthSizeValue('24in')).toBe('24');
    expect(normalizeProductLengthSizeValue('24 inches')).toBe('24');
    expect(normalizeProductLengthSizeValue('24"')).toBe('24');
    expect(normalizeProductLengthSizeValue('24.0 in')).toBe('24');
    expect(normalizeProductLengthSizeValue('7.50 in')).toBe('7.5');
  });

  it('keeps ring-size shorthand and non-measurement legacy text compatible', () => {
    expect(normalizeProductLengthSizeValue('size: 7.50')).toBe('7.5');
    expect(normalizeProductLengthSizeValue('adjustable')).toBe('adjustable');
    expect(normalizeProductLengthSizeValue('')).toBe('');
  });

  // The owner measures in millimetres; a bare "470" was stored — and printed,
  // pushed to Etsy and eBay — as 470 inches (2026-09-12). A value that carries
  // its unit converts once, here, and everything downstream keeps reading inches.
  it('converts millimetre and centimetre values to inches, rounded to 2 decimals', () => {
    expect(normalizeProductLengthSizeValue('470 mm')).toBe('18.5');
    expect(normalizeProductLengthSizeValue('470mm')).toBe('18.5');
    expect(normalizeProductLengthSizeValue('470 millimeters')).toBe('18.5');
    expect(normalizeProductLengthSizeValue('47 cm')).toBe('18.5');
    expect(normalizeProductLengthSizeValue('4.7 centimetres')).toBe('1.85');
    expect(normalizeProductLengthSizeValue('40 mm')).toBe('1.57');
    expect(parseLengthInches('470 mm')).toBe(18.5);
    expect(parseLengthInches('18.5')).toBe(18.5);
    expect(parseLengthInches('6 to 6.25 in')).toBeNull();
    expect(parseLengthInches('adjustable')).toBeNull();
  });

  it('still treats a bare number as inches', () => {
    expect(normalizeProductLengthSizeValue('470')).toBe('470');
    expect(parseLengthInches('7.75')).toBe(7.75);
  });
});

describe('formatProductPurityLabel', () => {
  it('writes gold karats with a K and silver fineness as parts per thousand', () => {
    expect(formatProductPurityLabel(14)).toBe('14K');
    expect(formatProductPurityLabel(10)).toBe('10K');
    expect(formatProductPurityLabel(24)).toBe('24K');
    expect(formatProductPurityLabel(925)).toBe('925');
    expect(formatProductPurityLabel(800)).toBe('800');
  });

  it('returns null for a missing or nonsensical purity', () => {
    expect(formatProductPurityLabel(null)).toBeNull();
    expect(formatProductPurityLabel(undefined)).toBeNull();
    expect(formatProductPurityLabel(0)).toBeNull();
  });
});
