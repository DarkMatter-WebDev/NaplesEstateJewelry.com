import { describe, expect, it } from 'vitest';
import {
  normalizeSelectionMode,
  randomModeScope,
  type CarouselSelectionMode,
} from '../../../carousel/lib/carouselConfig';
import { SHOP_JEWELRY_ITEM_TYPE_KEYS } from '@/lib/shop-filter-state';
import { isProductJewelryItem, PRODUCT_WEARABLE_JEWELRY_TYPES } from '@/types/product';

type JewelryInput = Parameters<typeof isProductJewelryItem>[0];

function product(overrides: Partial<JewelryInput> = {}): JewelryInput {
  return {
    title: '',
    title_es: null,
    chain_type: null,
    tags: [],
    tags_es: [],
    jewelry_type: null,
    product_type: null,
    ...overrides,
  };
}

describe('carousel random lineup modes', () => {
  it('accepts the three random scopes and fails closed to manual', () => {
    expect(normalizeSelectionMode('random_gold_jewelry')).toBe('random_gold_jewelry');
    expect(normalizeSelectionMode('random_silver_jewelry')).toBe('random_silver_jewelry');
    expect(normalizeSelectionMode('random_non_jewelry')).toBe('random_non_jewelry');
    expect(normalizeSelectionMode('manual')).toBe('manual');
    expect(normalizeSelectionMode('something_else')).toBe('manual');
    expect(normalizeSelectionMode(null)).toBe('manual');
    expect(normalizeSelectionMode(undefined)).toBe('manual');
  });

  it('maps the superseded metal-only values forward instead of dropping them', () => {
    // A setting saved before the jewelry/non-jewelry split must keep drawing
    // randomly rather than silently reverting to the curated lineup.
    expect(normalizeSelectionMode('random_gold')).toBe('random_gold_jewelry');
    expect(normalizeSelectionMode('random_silver')).toBe('random_silver_jewelry');
  });

  it('scopes each random mode to the right metal and jewelry side', () => {
    expect(randomModeScope('random_gold_jewelry')).toEqual({ category: 'Gold', jewelry: true });
    expect(randomModeScope('random_silver_jewelry')).toEqual({ category: 'Silver', jewelry: true });
    // Non-jewelry spans both metals — it is the catalog's "everything else".
    expect(randomModeScope('random_non_jewelry')).toEqual({ category: null, jewelry: false });
    expect(randomModeScope('manual')).toBeNull();
  });

  it('gives every random mode a scope and manual none', () => {
    const modes: CarouselSelectionMode[] = [
      'manual',
      'random_gold_jewelry',
      'random_silver_jewelry',
      'random_non_jewelry',
    ];
    const withScope = modes.filter((mode) => randomModeScope(mode) !== null);
    expect(withScope).toEqual(['random_gold_jewelry', 'random_silver_jewelry', 'random_non_jewelry']);
  });
});

describe('wearable-jewelry classification', () => {
  it('stays in step with the shop category filter, so the two cannot drift', () => {
    const fromProductTypes = PRODUCT_WEARABLE_JEWELRY_TYPES.map((type) => type.toLowerCase()).sort();
    const fromShopFilter = [...SHOP_JEWELRY_ITEM_TYPE_KEYS].sort();
    expect(fromProductTypes).toEqual(fromShopFilter);
  });

  it('counts wearable pieces as jewelry', () => {
    expect(isProductJewelryItem(product({ jewelry_type: 'Necklace' }))).toBe(true);
    expect(isProductJewelryItem(product({ product_type: 'Ring' }))).toBe(true);
    expect(isProductJewelryItem(product({ jewelry_type: 'Watch' }))).toBe(true);
    expect(isProductJewelryItem(product({ title: '14K Yellow Gold Byzantine Link Bracelet' }))).toBe(true);
  });

  it('excludes coins, bullion, flatware, and unclassifiable pieces', () => {
    expect(isProductJewelryItem(product({ jewelry_type: 'Coin' }))).toBe(false);
    expect(isProductJewelryItem(product({ jewelry_type: 'Bullion' }))).toBe(false);
    expect(isProductJewelryItem(product({ jewelry_type: 'Silverware' }))).toBe(false);
    expect(isProductJewelryItem(product({ jewelry_type: 'Other' }))).toBe(false);
    expect(isProductJewelryItem(product({ title: 'Sterling Silver Serving Spoon' }))).toBe(false);
    // Nothing identifiable at all is "everything else", never jewelry.
    expect(isProductJewelryItem(product())).toBe(false);
  });
});
