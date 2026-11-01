import { describe, expect, it } from 'vitest';
import { LEGAL_NOINDEX_PATHS, getLegalMetadata, type LegalPageKey } from '@/lib/legal-metadata';

const pages: LegalPageKey[] = [
  'privacy',
  'terms',
  'returns-refunds',
  'shipping',
  'accessibility',
  'cookie-preferences',
];

describe('legal page metadata', () => {
  it.each(pages)('uses the root title template exactly once for %s', (page) => {
    const metadata = getLegalMetadata(page, 'en');
    expect(metadata.title).not.toContain('Naples Estate Jewelry');
  });

  it.each(pages)('localizes Spanish metadata and canonical paths for %s', (page) => {
    const en = getLegalMetadata(page, 'en');
    const es = getLegalMetadata(page, 'es');
    expect(es.title).not.toBe(en.title);
    expect(es.alternates?.canonical).toMatch(/^\/es\//);
  });

  // `sitemap.ts` subtracts LEGAL_NOINDEX_PATHS from its own list. If that
  // constant ever falls out of step with the pages actually marked noindex, the
  // sitemap silently starts submitting a noindex URL again — the exact
  // contradiction fixed on 2026-08-16, and one that only surfaces as a Search
  // Console error weeks later.
  it.each(pages)('lists %s in LEGAL_NOINDEX_PATHS, matching its robots tag', (page) => {
    const metadata = getLegalMetadata(page, 'en');
    const robots = metadata.robots as { index?: boolean } | undefined;
    expect(robots?.index).toBe(false);

    const canonical = getLegalMetadata(page, 'en').alternates?.canonical as string;
    expect(LEGAL_NOINDEX_PATHS).toContain(canonical);
  });

  it('exposes exactly one path per legal page, with no extras', () => {
    expect([...LEGAL_NOINDEX_PATHS].sort()).toEqual(
      pages.map((p) => getLegalMetadata(p, 'en').alternates?.canonical as string).sort(),
    );
  });
});
