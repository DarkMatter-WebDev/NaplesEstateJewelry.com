import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONTACT_BAR_SECTIONS, showsContactBar, stripLocalePrefix } from '../contact-bar-paths';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

describe('phone contact bar: which pages', () => {
  it.each([
    '/gold-services',
    '/gold-services/gold-marks',
    '/gold-services/what-is-my-gold-worth',
    '/silver-services',
    '/silver-services/silver-marks',
    '/silver-services/flatware-value',
    '/estate-jewelry',
    '/estate-services/selling-inherited-jewelry',
    '/bullion',
    '/sell',
    '/sell/naples',
    '/sell/dont-melt-it',
    '/free-evaluation',
    '/diamond-buyers',
    '/watch-buyers',
    '/jewelry-appraisal/hallmarks',
  ])('shows on the seller page %s, in both languages', (path) => {
    expect(showsContactBar(path)).toBe(true);
    expect(showsContactBar(`/es${path}`)).toBe(true);
    // The internal default-locale segment a prerender can carry.
    expect(showsContactBar(`/en${path}`)).toBe(true);
    expect(showsContactBar(`${path}/`)).toBe(true);
  });

  it.each([
    '/',
    '/es',
    '/shop',
    '/shop/abc-123',
    '/checkout',
    '/account',
    '/account/sign-in',
    '/card',
    '/kittcard',
    '/es/card',
    '/admin',
    '/admin/in-store-sale',
    '/contact',
    '/reviews',
    '/spot-prices',
    '/order-lookup',
    '/privacy',
  ])('stays off %s', (path) => {
    expect(showsContactBar(path)).toBe(false);
  });

  it('matches whole sections only, never a look-alike prefix', () => {
    expect(showsContactBar('/seller-guide')).toBe(false);
    expect(showsContactBar('/sellers')).toBe(false);
    expect(showsContactBar('/bullion-news')).toBe(false);
    expect(showsContactBar(null)).toBe(false);
    expect(showsContactBar('')).toBe(false);
  });

  it('strips a locale segment and nothing else', () => {
    expect(stripLocalePrefix('/es/sell/naples')).toBe('/sell/naples');
    expect(stripLocalePrefix('/en')).toBe('/');
    expect(stripLocalePrefix('/estate-jewelry')).toBe('/estate-jewelry');
    expect(stripLocalePrefix('/english-silver')).toBe('/english-silver');
  });

  it('every section is a real page folder', () => {
    for (const section of CONTACT_BAR_SECTIONS) {
      expect(() => read('src', 'app', '[locale]', section.slice(1), 'page.tsx')).not.toThrow();
    }
  });
});

describe('phone contact bar: wiring', () => {
  const bar = read('src', 'components', 'cta', 'MobileContactBar.tsx');
  const layout = read('src', 'app', '[locale]', 'layout.tsx');
  const css = read('src', 'app', 'globals.css');

  it('is mounted once, from the layout — never from a page file', () => {
    expect(layout.match(/<MobileContactBar /g)?.length).toBe(1);
    for (const section of CONTACT_BAR_SECTIONS) {
      expect(read('src', 'app', '[locale]', section.slice(1), 'page.tsx')).not.toContain('MobileContactBar');
    }
  });

  it('takes its links from contact-links, the owner’s cell only', () => {
    expect(bar).toContain('TEL_HREF');
    expect(bar).toContain('smsHref(sellerTextBody(isEs))');
    expect(bar).toContain('directionsHref()');
    expect(bar).not.toMatch(/tel:\d|sms:\d|888/);
  });

  it('is phones-only, shifts no layout, and never deopts static pages', () => {
    expect(bar).toContain('md:hidden');
    expect(bar).toContain('usePathname');
    expect(bar).not.toContain('useSearchParams');
    expect(css).toMatch(/\.mobile-contact-bar \{[^}]*position: fixed/);
    expect(css).toMatch(/\.mobile-contact-bar \{[^}]*z-index: 30/);
  });

  it('makes room for itself and lifts the cookie notice clear of it', () => {
    expect(css).toContain('body:has([data-mobile-contact-bar]) {');
    expect(css).toContain('body:has([data-mobile-contact-bar]) [data-cookie-notice] {');
  });
});
