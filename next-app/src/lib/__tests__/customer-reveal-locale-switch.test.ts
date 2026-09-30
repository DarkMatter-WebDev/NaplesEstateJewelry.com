import { describe, expect, it } from 'vitest';
import { isLocaleOnlyChange, normalizeRevealPathname } from '@/components/layout/CustomerReveal';

// The English/Español toggle must be a text swap, not an arrival (owner,
// 2026-09-08, on /card: the entrance fade after the switch read as a "flash
// reload"). These are the two pure decisions the reveal effect makes.

describe('normalizeRevealPathname', () => {
  it('strips a leading locale segment only', () => {
    expect(normalizeRevealPathname('/card')).toBe('/card');
    expect(normalizeRevealPathname('/es/card')).toBe('/card');
    expect(normalizeRevealPathname('/en/card')).toBe('/card');
    expect(normalizeRevealPathname('/es')).toBe('/');
    expect(normalizeRevealPathname('/')).toBe('/');
    // Not a locale segment: a page whose name merely starts with the letters.
    expect(normalizeRevealPathname('/estate-services')).toBe('/estate-services');
    expect(normalizeRevealPathname('/es/estate-services')).toBe('/estate-services');
  });
});

describe('isLocaleOnlyChange', () => {
  it('is true only when the page is the same and just the language moved', () => {
    expect(isLocaleOnlyChange('/card', '/es/card')).toBe(true);
    expect(isLocaleOnlyChange('/es/card', '/card')).toBe(true);
    expect(isLocaleOnlyChange('/es/shop', '/shop')).toBe(true);
    expect(isLocaleOnlyChange('/', '/es')).toBe(true);
  });

  it('is false for a first mount, the same URL, or a real page change', () => {
    expect(isLocaleOnlyChange(null, '/es/card')).toBe(false);
    expect(isLocaleOnlyChange('/card', '/card')).toBe(false);
    expect(isLocaleOnlyChange('/card', '/reviews')).toBe(false);
    expect(isLocaleOnlyChange('/es/card', '/es/reviews')).toBe(false);
    expect(isLocaleOnlyChange('/', '/es/shop')).toBe(false);
  });
});
