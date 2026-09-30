import { describe, expect, it } from 'vitest';
import {
  BUSINESS_ENTITY_ID,
  SITE_BRAND_NAME,
  SITE_HOME_URL,
  WEBSITE_ENTITY_ID,
  buildWebSiteJsonLd,
} from '../site-ld';

describe('buildWebSiteJsonLd (Google site name)', () => {
  const ld = buildWebSiteJsonLd();

  it("uses the canonical home page with a trailing slash, as in Google's spec", () => {
    expect(ld.url).toBe('https://naplesestatejewelry.com/');
    expect(SITE_HOME_URL.endsWith('/')).toBe(true);
  });

  it('prefers the brand name, with the wordmark as the only fallback and no slogan', () => {
    expect(ld.name).toBe('Naples Estate Jewelry');
    expect(SITE_BRAND_NAME).toBe('Naples Estate Jewelry');
    // Mixed case on purpose: an all-lowercase domain reads to Google as a
    // domain preference, which is the bare-domain display we are replacing.
    expect(ld.alternateName).toEqual(['NaplesEstateJewelry.com']);
    for (const n of [ld.name, ...ld.alternateName]) expect(n).not.toMatch(/#|\bco\b|llc|best|buyers/i);
  });

  it('links the site to the JewelryStore entity by @id', () => {
    expect(ld['@type']).toBe('WebSite');
    expect(ld['@id']).toBe(WEBSITE_ENTITY_ID);
    expect(ld.publisher).toEqual({ '@id': BUSINESS_ENTITY_ID });
    expect(BUSINESS_ENTITY_ID).toBe('https://naplesestatejewelry.com/#business');
  });
});
