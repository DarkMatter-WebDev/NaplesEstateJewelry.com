import { describe, expect, it } from 'vitest';
import type { Product, SpotData } from '@/types/product';
import { formatUsdPrice, getDisplayPrice, getProductPriceValue, normalizeManualPriceLabel } from '@/lib/pricing';
import { getSnapshotPrice } from '@/lib/sales';

const spot: SpotData = {
  goldPerTroyOz: 2_000,
  silverPerTroyOz: 25,
  fetchedAt: 0,
  source: 'api',
};

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'whole-dollar-test',
    title: 'Whole dollar test',
    status: 'available',
    category: 'Gold',
    price_mode: 'spot-multiplier',
    pricing_multiplier: 1,
    // 14/24 of a troy ounce at $2,000/oz = $1,166.66… — a price with cents.
    purity: 14,
    gram_weight: 31.1034768,
    weight_grams: 31.1034768,
    manual_price_label: null,
    asking_price: null,
    sold_price: null,
    ...overrides,
  } as Product;
}

describe('item prices are whole dollars', () => {
  it('rounds a spot-computed price and charges exactly what it displays', () => {
    const product = makeProduct();

    // The guarantee that matters: one number, not a rounded label over a
    // cents-bearing charge. A regression here re-opens "Never charge a total
    // the buyer was not shown".
    expect(getProductPriceValue(product, spot)).toBe(1_167);
    expect(getSnapshotPrice(product, spot)).toBe(1_167);
    expect(getDisplayPrice(product, spot)).toBe('$1,167');
    expect(getDisplayPrice(product, spot)).toBe(formatUsdPrice(getSnapshotPrice(product, spot)));
  });

  it('rounds a manual price label that carries cents', () => {
    const product = makeProduct({ price_mode: 'manual', manual_price_label: '$2,360.88' });

    expect(getProductPriceValue(product, spot)).toBe(2_361);
    expect(getSnapshotPrice(product, spot)).toBe(2_361);
    expect(getDisplayPrice(product, spot)).toBe('$2,361');
    expect(normalizeManualPriceLabel('$2,360.88')).toBe('$2,361');
  });

  it('falls back to a rounded asking_price when the label is unparseable', () => {
    const product = makeProduct({
      price_mode: 'manual',
      manual_price_label: 'Contact for price',
      asking_price: 899.49,
    });

    expect(getSnapshotPrice(product, spot)).toBe(899);
  });

  it('shows a non-numeric manual label verbatim rather than a price', () => {
    const product = makeProduct({ price_mode: 'manual', manual_price_label: 'Contact for price' });

    expect(getProductPriceValue(product, spot)).toBeNull();
    expect(getDisplayPrice(product, spot)).toBe('Contact for price');
  });

  it('leaves a captured sold price at its exact recorded amount', () => {
    // A sale is a historical fact, not an offer. Re-rounding it would misstate
    // what the customer actually paid.
    const product = makeProduct({ status: 'sold', sold_price: 1_986.61 });

    expect(getProductPriceValue(product, spot)).toBe(1_986.61);
  });

  it('rounds a sub-50-cent price away to $0 so checkout refuses it', () => {
    // CODE-D01 rejects a $0 line item. Failing closed on junk price data is the
    // intended outcome — an estate piece is never legitimately worth $0.10.
    const product = makeProduct({ price_mode: 'manual', manual_price_label: '$0.10' });

    expect(getSnapshotPrice(product, spot)).toBe(0);
  });
});
