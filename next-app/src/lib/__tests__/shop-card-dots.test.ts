import { describe, expect, it } from 'vitest';
import {
  getShopCardDots,
  SHOP_CARD_MAX_VISIBLE_DOTS,
  type ShopCardDot,
} from '@/lib/shop-card-dots';

const sizes = (dots: ShopCardDot[]) => dots.map((dot) => dot.size);
const indexes = (dots: ShopCardDot[]) => dots.map((dot) => dot.index);
const activeIndex = (dots: ShopCardDot[]) => dots.find((dot) => dot.isActive)?.index ?? null;

describe('getShopCardDots', () => {
  it('renders nothing for a single photo or an empty card', () => {
    expect(getShopCardDots(0, 0)).toEqual([]);
    expect(getShopCardDots(1, 0)).toEqual([]);
    expect(getShopCardDots(Number.NaN, 0)).toEqual([]);
  });

  it('renders one full dot per photo while they all fit', () => {
    const dots = getShopCardDots(5, 2);
    expect(indexes(dots)).toEqual([0, 1, 2, 3, 4]);
    expect(sizes(dots)).toEqual(['full', 'full', 'full', 'full', 'full']);
    expect(activeIndex(dots)).toBe(2);
  });

  it('caps the row at maxVisible once the photos outnumber it', () => {
    const dots = getShopCardDots(20, 10);
    expect(dots).toHaveLength(SHOP_CARD_MAX_VISIBLE_DOTS);
    expect(activeIndex(dots)).toBe(10);
  });

  it('tapers only the truncated side', () => {
    // Pinned at the start: nothing is hidden to the left, so the left edge is
    // full size and only the right tapers.
    const atStart = getShopCardDots(20, 0);
    expect(indexes(atStart)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(sizes(atStart)).toEqual(['full', 'full', 'full', 'full', 'full', 'medium', 'small']);

    const atEnd = getShopCardDots(20, 19);
    expect(indexes(atEnd)).toEqual([13, 14, 15, 16, 17, 18, 19]);
    expect(sizes(atEnd)).toEqual(['small', 'medium', 'full', 'full', 'full', 'full', 'full']);

    const middle = getShopCardDots(20, 10);
    expect(sizes(middle)).toEqual(['small', 'medium', 'full', 'full', 'full', 'medium', 'small']);
  });

  it('keeps the window inside the strip and always contains the active photo', () => {
    for (let count = 2; count <= 20; count += 1) {
      for (let active = 0; active < count; active += 1) {
        const dots = getShopCardDots(count, active);
        expect(dots.length).toBeLessThanOrEqual(Math.min(count, SHOP_CARD_MAX_VISIBLE_DOTS));
        expect(indexes(dots).every((index) => index >= 0 && index < count)).toBe(true);
        expect(activeIndex(dots)).toBe(active);
      }
    }
  });

  it('never tapers the active dot', () => {
    for (let count = 2; count <= 20; count += 1) {
      for (let active = 0; active < count; active += 1) {
        const dot = getShopCardDots(count, active).find((entry) => entry.isActive);
        expect(dot?.size).toBe('full');
      }
    }
  });

  it('clamps an out-of-range active index instead of dropping the row', () => {
    expect(activeIndex(getShopCardDots(6, -3))).toBe(0);
    expect(activeIndex(getShopCardDots(6, 99))).toBe(5);
  });

  it('floors maxVisible at three so both tapers cannot swallow the centre', () => {
    const dots = getShopCardDots(10, 5, 1);
    expect(dots).toHaveLength(3);
    expect(activeIndex(dots)).toBe(5);
  });
});
