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
  resolveAdvertisedTradeInPrice,
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
