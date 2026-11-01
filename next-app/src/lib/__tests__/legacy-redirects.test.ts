import { describe, expect, it } from 'vitest';
import {
  LEGACY_REDIRECTS,
  resolveDefaultLocalePrefixRedirect,
  resolveLegacyRedirect,
} from '@/lib/legacy-redirects';

describe('legacy redirect resolution', () => {
  it('matches a locale-less path and keeps it locale-less', () => {
    expect(resolveLegacyRedirect('/auctions')).toEqual({ destination: '/shop', permanent: true });
    expect(resolveLegacyRedirect('/shop.html')).toEqual({ destination: '/shop', permanent: true });
  });

  it('treats /en/x as the same rule as /x — the proxy rewrite must not create a dead route', () => {
    expect(resolveLegacyRedirect('/en/auctions')).toEqual({ destination: '/shop', permanent: true });
    expect(resolveLegacyRedirect('/en/cart')).toEqual({ destination: '/shop', permanent: false });
  });

  it('re-prefixes the destination for Spanish', () => {
    expect(resolveLegacyRedirect('/es/auctions')).toEqual({ destination: '/es/shop', permanent: true });
    expect(resolveLegacyRedirect('/es/vendor-terms')).toEqual({ destination: '/es/terms', permanent: true });
    expect(resolveLegacyRedirect('/es/account/saved')).toEqual({ destination: '/es/shop', permanent: false });
  });

  it('sends the old process.html page to the free-evaluation page in both locales (English 404d before 2026-09-11)', () => {
    expect(resolveLegacyRedirect('/process.html')).toEqual({ destination: '/free-evaluation', permanent: true });
    expect(resolveLegacyRedirect('/en/process.html')).toEqual({ destination: '/free-evaluation', permanent: true });
    expect(resolveLegacyRedirect('/es/process.html')).toEqual({ destination: '/es/free-evaluation', permanent: true });
  });

  it('maps the locale root correctly for index.html (never /es/)', () => {
    expect(resolveLegacyRedirect('/index.html')).toEqual({ destination: '/', permanent: true });
    expect(resolveLegacyRedirect('/es/index.html')).toEqual({ destination: '/es', permanent: true });
  });

  it('re-slugs renamed products in both locales', () => {
    expect(resolveLegacyRedirect('/shop/new-listing-05')).toEqual({
      destination: '/shop/10k-gold-rope-chain-necklace',
      permanent: true,
    });
    expect(resolveLegacyRedirect('/es/shop/new-listing-05')).toEqual({
      destination: '/es/shop/10k-gold-rope-chain-necklace',
      permanent: true,
    });
  });

  it('has no rule for a product the owner deleted — it must 404, not dead-end via a redirect', () => {
    // new-listing-04's target was deleted 2026-08 (owner-confirmed). Re-adding
    // a rule here would send visitors to a 404 through a redirect, which is
    // worse than an honest 404 and reads as a soft 404 to search engines.
    expect(resolveLegacyRedirect('/shop/new-listing-04')).toBeNull();
    expect(resolveLegacyRedirect('/es/shop/new-listing-04')).toBeNull();
  });

  it('uses 308 for SEO consolidation and 307 for convenience-only URLs', () => {
    // Legacy static-site URLs and retired pages carry link equity.
    expect(resolveLegacyRedirect('/about.html')?.permanent).toBe(true);
    expect(resolveLegacyRedirect('/auction-terms')?.permanent).toBe(true);
    // Drawer URLs were never real pages — no equity to pass.
    expect(resolveLegacyRedirect('/wishlist')?.permanent).toBe(false);
    expect(resolveLegacyRedirect('/saved')?.permanent).toBe(false);
  });

  it('leaves live routes alone', () => {
    for (const live of ['/', '/shop', '/terms', '/es', '/es/shop', '/account', '/p/21', '/sell/naples']) {
      expect(resolveLegacyRedirect(live)).toBeNull();
    }
  });

  it('never points a redirect at another redirect (no chains)', () => {
    for (const [source, rule] of Object.entries(LEGACY_REDIRECTS)) {
      expect(LEGACY_REDIRECTS[rule.to], `${source} -> ${rule.to} is itself redirected`).toBeUndefined();
    }
  });
});

describe('default-locale prefix redirect (/en -> /, permanent)', () => {
  it('strips /en from an external default-locale URL, keeping the rest of the path', () => {
    expect(resolveDefaultLocalePrefixRedirect('/en/shop')).toBe('/shop');
    expect(resolveDefaultLocalePrefixRedirect('/en/sell/naples')).toBe('/sell/naples');
    expect(resolveDefaultLocalePrefixRedirect('/en/shop/some-product-42')).toBe('/shop/some-product-42');
  });

  it('sends /en and /en/ to the site root', () => {
    expect(resolveDefaultLocalePrefixRedirect('/en')).toBe('/');
    expect(resolveDefaultLocalePrefixRedirect('/en/')).toBe('/');
  });

  it('leaves bare, Spanish, and merely en-starting paths alone', () => {
    expect(resolveDefaultLocalePrefixRedirect('/shop')).toBeNull();
    expect(resolveDefaultLocalePrefixRedirect('/')).toBeNull();
    expect(resolveDefaultLocalePrefixRedirect('/es/shop')).toBeNull();
    expect(resolveDefaultLocalePrefixRedirect('/es')).toBeNull();
    expect(resolveDefaultLocalePrefixRedirect('/english-tea')).toBeNull();
    expect(resolveDefaultLocalePrefixRedirect('/entrance')).toBeNull();
  });
});
