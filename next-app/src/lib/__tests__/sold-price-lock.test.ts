import { describe, expect, it } from 'vitest';
import type { Product, SpotData } from '@/types/product';
import { getDisplayPrice, getProductPriceValue, getStorefrontDisplayPrice } from '@/lib/pricing';
import { getSnapshotPrice } from '@/lib/sales';

const spot: SpotData = {
  goldPerTroyOz: 2_000,
  silverPerTroyOz: 25,
  fetchedAt: 0,
  source: 'api',
};

function spotProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'price-lock-test',
    title: 'Price lock test',
    status: 'available',
    category: 'Gold',
    price_mode: 'spot-multiplier',
    pricing_multiplier: 1,
    purity: 24,
    gram_weight: 31.1034768,
    weight_grams: 31.1034768,
    manual_price_label: null,
    asking_price: null,
    sold_price: null,
    ...overrides,
  } as Product;
}

describe('sold product price locks', () => {
  it('uses the stored sold price for display, sorting, and order snapshots', () => {
    const product = spotProduct({ status: 'sold', sold_price: 1_986.61 });

    expect(getProductPriceValue(product, spot)).toBe(1_986.61);
    expect(getDisplayPrice(product, spot)).toBe('$1,987');
    expect(getSnapshotPrice(product, spot)).toBe(1_986.61);
  });

  it('keeps the lock after Sold until the product is explicitly Available', () => {
    const product = spotProduct({ status: 'archived', sold_price: 1_500 });

    expect(getProductPriceValue(product, { ...spot, goldPerTroyOz: 3_000 })).toBe(1_500);
  });

  it('ignores a stale lock after relisting and resumes live price calculations', () => {
    const product = spotProduct({ status: 'available', sold_price: 1_500 });

    expect(getProductPriceValue(product, spot)).toBeCloseTo(2_000, 6);
    expect(getProductPriceValue(product, { ...spot, goldPerTroyOz: 3_000 })).toBeCloseTo(3_000, 6);
  });

  it('masks only sold storefront prices when the admin setting is enabled', () => {
    const sold = spotProduct({ status: 'sold', sold_price: 1_500 });
    const available = spotProduct({ status: 'available' });

    expect(getStorefrontDisplayPrice(sold, spot, true, 'en')).toBe('Sold');
    expect(getStorefrontDisplayPrice(sold, spot, true, 'es')).toBe('Vendido');
    expect(getStorefrontDisplayPrice(sold, spot, false, 'en')).toBe('$1,500');
    expect(getStorefrontDisplayPrice(available, spot, true, 'en')).toBe('$2,000');
  });
});
