import { describe, expect, it } from 'vitest';
import { buildShopPaginationHref, getShopPaginationItems } from '@/lib/shop-pagination';

describe('buildShopPaginationHref', () => {
  it('builds deterministic links from committed search params', () => {
    expect(buildShopPaginationHref('/shop', 'metal=gold&purity=14', 2)).toBe(
      '/shop?metal=gold&purity=14&page=2',
    );
  });

  it('removes page for the first page without disturbing filters', () => {
    expect(buildShopPaginationHref('/es/shop', 'metal=silver&page=3', 1)).toBe(
      '/es/shop?metal=silver',
    );
  });

  it('keeps a bare first-page URL clean', () => {
    expect(buildShopPaginationHref('/shop', '', 1)).toBe('/shop');
  });
});

describe('getShopPaginationItems', () => {
  it('shows every page for short result sets', () => {
    expect(getShopPaginationItems(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('marks the skipped range on the first page', () => {
    expect(getShopPaginationItems(1, 11)).toEqual([1, 2, 'ellipsis', 11]);
  });

  it('marks both skipped ranges around a middle page', () => {
    expect(getShopPaginationItems(6, 11)).toEqual([
      1,
      'ellipsis',
      5,
      6,
      7,
      'ellipsis',
      11,
    ]);
  });

  it('marks the skipped range on the final page', () => {
    expect(getShopPaginationItems(11, 11)).toEqual([1, 'ellipsis', 10, 11]);
  });

  it('fills a single-page gap instead of rendering an ellipsis', () => {
    expect(getShopPaginationItems(4, 11)).toEqual([1, 2, 3, 4, 5, 'ellipsis', 11]);
  });
});
