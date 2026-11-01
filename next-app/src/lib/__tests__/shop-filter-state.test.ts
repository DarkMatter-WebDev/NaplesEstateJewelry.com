import { describe, expect, it } from 'vitest';
import {
  changeShopItemGroupParams,
  changeShopItemTypeParams,
  filterAvailableShopItemTypeOptions,
  normalizeShopFilterState,
  normalizeShopLengthInches,
  normalizeShopSearchQuery,
  normalizeShopStatusFilter,
  normalizeShopWidthRanges,
  productMatchesShopLengthInches,
  productMatchesShopWidthRanges,
} from '@/lib/shop-filter-state';

describe('shop filter state', () => {
  it('defaults the mutually exclusive inventory status to available', () => {
    expect(normalizeShopStatusFilter(undefined)).toBe('available');
    expect(normalizeShopStatusFilter('available')).toBe('available');
    expect(normalizeShopStatusFilter('unexpected')).toBe('available');
    expect(normalizeShopStatusFilter('Sold')).toBe('sold');
  });

  it('trims storefront search text and removes whitespace-only queries', () => {
    expect(normalizeShopFilterState({ q: '  Tiffany  ' })).toEqual({ q: 'Tiffany' });
    expect(normalizeShopFilterState({ q: '   ' })).toEqual({});
  });

  it('collapses repeated search whitespace before filtering or URL updates', () => {
    expect(normalizeShopSearchQuery('  yellow   gold\t ring  ')).toBe('yellow gold ring');
    expect(normalizeShopFilterState({ q: 'yellow   gold' })).toEqual({ q: 'yellow gold' });
  });

  it('keeps every sort the gallery offers and drops unknown values', () => {
    for (const sort of ['newest', 'price-asc', 'price-desc', 'weight-asc', 'weight-desc', 'brand-asc', 'brand-desc']) {
      expect(normalizeShopFilterState({ sort })).toEqual({ sort });
    }
    expect(normalizeShopFilterState({ sort: 'oldest' })).toEqual({});
    expect(normalizeShopFilterState({ sort: 'created-desc' })).toEqual({});
  });

  it('only keeps item type options represented in public inventory', () => {
    const options = [
      { value: 'ring', label: 'Rings' },
      { value: 'coin', label: 'Coins' },
      { value: 'watch', label: 'Watches' },
    ];
    expect(filterAvailableShopItemTypeOptions(options, ['ring', 'watch'])).toEqual([
      { value: 'ring', label: 'Rings' },
      { value: 'watch', label: 'Watches' },
    ]);
  });

  it('lets a specific item type supersede a conflicting category', () => {
    expect(normalizeShopFilterState({ itemGroup: 'everything-else', itemType: 'ring' })).toEqual({
      itemType: 'ring',
    });
  });

  it('drops category-owned metal constraints from a conflicting shared URL', () => {
    expect(normalizeShopFilterState({
      itemGroup: 'everything-else',
      itemType: 'ring',
      metal: 'silver',
      metalColor: 'silver',
      purity: '925',
    })).toEqual({ itemType: 'ring' });
  });

  it('keeps category-owned constraints explicit and internally compatible', () => {
    expect(normalizeShopFilterState({
      itemGroup: 'everything-else',
      metal: 'gold',
      metalColor: 'yellow_gold',
      purity: '14',
      gender: 'Women',
    })).toEqual({
      itemGroup: 'everything-else',
      metal: 'silver',
    });
  });

  it('drops hidden link, length, and width filters when the item type cannot use them', () => {
    expect(normalizeShopFilterState({
      itemType: 'ring',
      chainType: 'rope-chain',
      length: '18 in',
      width: '5-6.9',
    })).toEqual({ itemType: 'ring' });
  });

  it('preserves link, length, and validated width filters for supported item types', () => {
    expect(normalizeShopFilterState({
      itemType: 'necklace',
      chainType: 'rope-chain',
      length: '18 in',
      width: ['5-6.9', '10-plus', 'invalid', '5-6.9'],
    })).toEqual({
      itemType: 'necklace',
      chainType: 'rope-chain',
      length: '18 in',
      width: '5-6.9,10-plus',
    });
  });

  it('normalizes comma-separated width ranges to known unique values', () => {
    expect(normalizeShopWidthRanges(['under-3,3-4.9', 'bogus', 'under-3'])).toEqual([
      'under-3',
      '3-4.9',
    ]);
  });

  it('canonicalizes wearable lengths across stored and URL unit formats', () => {
    expect(normalizeShopLengthInches(['24', '24 in', '24 inches', '24"', '24.0'])).toEqual(['24']);
    expect(normalizeShopLengthInches(['7.50 in,8"', 'bogus', '0'])).toEqual(['7.5', '8']);
  });

  it('matches stored product lengths against canonical shop selections', () => {
    expect(productMatchesShopLengthInches('24', ['24'])).toBe(true);
    expect(productMatchesShopLengthInches('24 in', ['24'])).toBe(true);
    expect(productMatchesShopLengthInches('24"', ['24'])).toBe(true);
    expect(productMatchesShopLengthInches('24.5', ['24'])).toBe(false);
    expect(productMatchesShopLengthInches(null, ['24'])).toBe(false);
    expect(productMatchesShopLengthInches(null, [])).toBe(true);
  });

  it('matches width ranges without gaps or overlapping boundaries', () => {
    expect(productMatchesShopWidthRanges(2.99, ['under-3'])).toBe(true);
    expect(productMatchesShopWidthRanges(3, ['under-3'])).toBe(false);
    expect(productMatchesShopWidthRanges(3, ['3-4.9'])).toBe(true);
    expect(productMatchesShopWidthRanges(5, ['3-4.9'])).toBe(false);
    expect(productMatchesShopWidthRanges(5, ['5-6.9'])).toBe(true);
    expect(productMatchesShopWidthRanges(10, ['10-plus'])).toBe(true);
    expect(productMatchesShopWidthRanges(null, ['10-plus'])).toBe(false);
    expect(productMatchesShopWidthRanges(4, ['under-3', '3-4.9'])).toBe(true);
  });

  it('does not silently force a metal when an item type is chosen', () => {
    const next = changeShopItemTypeParams(new URLSearchParams(), 'coin', undefined);
    expect(next.toString()).toBe('itemType=coin');
  });

  it('removes category-owned Silver when switching from Everything Else to an item type', () => {
    const next = changeShopItemTypeParams(
      new URLSearchParams('itemGroup=everything-else&metal=silver'),
      'ring',
      'everything-else',
    );
    expect(next.toString()).toBe('itemType=ring');
  });

  it('does not revive a stale link filter when changing to another chain-capable type', () => {
    const next = changeShopItemTypeParams(
      new URLSearchParams('itemType=ring&chainType=rope-chain&length=18+in&width=5-6.9'),
      'necklace',
      undefined,
    );
    expect(next.toString()).toBe('itemType=necklace');
  });

  it('clears item-type dependents and applies only the selected category constraints', () => {
    const next = changeShopItemGroupParams(
      new URLSearchParams('itemType=necklace&chainType=rope-chain&length=18+in&width=5-6.9&gender=Women'),
      'everything-else',
      undefined,
    );
    expect(next.toString()).toBe('itemGroup=everything-else&metal=silver');
  });

  it('deselects an active category without disturbing independent filters', () => {
    const next = changeShopItemGroupParams(
      new URLSearchParams('brand=Rolex&itemGroup=jewelry'),
      'jewelry',
      'jewelry',
    );
    expect(next.toString()).toBe('brand=Rolex');
  });
});
