import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isLocaleOnlyChange, normalizeRevealPathname, shouldSkipReveal } from '@/components/layout/CustomerReveal';

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

// Owner, 2026-10-31, opening /card and /magnet from a QR code: "the page seems
// to load, then flash and load again." The first page of a visit is already
// painted from the server HTML before the sweep runs, so fading it in means
// blanking a page the visitor is reading.
describe('shouldSkipReveal', () => {
  it('skips the fade on a full page load and on a language switch', () => {
    expect(shouldSkipReveal(null, '/card')).toBe(true);
    expect(shouldSkipReveal(null, '/free-evaluation')).toBe(true);
    expect(shouldSkipReveal(null, '/es')).toBe(true);
    expect(shouldSkipReveal('/card', '/es/card')).toBe(true);
  });

  it('keeps the fade for a real page change inside the site', () => {
    expect(shouldSkipReveal('/card', '/reviews')).toBe(false);
    expect(shouldSkipReveal('/free-evaluation', '/')).toBe(false);
    expect(shouldSkipReveal('/es/card', '/es/sell')).toBe(false);
  });

  it('is the decision the effect uses, remembered per pathname', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/layout/CustomerReveal.tsx'), 'utf8');
    expect(source).toContain(': shouldSkipReveal(lastRevealPathname, pathname);');
    expect(source).toContain('if (skipReveal) settleWithoutReveal();');
    expect(source).toContain('lastRunSkippedReveal = skipReveal;');
  });
});
