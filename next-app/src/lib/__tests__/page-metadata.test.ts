import { describe, expect, it } from 'vitest';
import { OG_IMAGE, SITE_NAME, TITLE_SUFFIX, pageMetadata } from '@/lib/seo';

describe('pageMetadata — social card', () => {
  // Each test here corresponds to a defect that was live on 2026-08-16.

  it('suffixes the brand onto og:title, because the title template does not', () => {
    // Verified empirically against the running app: a page declaring
    // openGraph.title emits it VERBATIM — `title.template` never touches it.
    // Without this the card falls back to the layout's og:title, which is why
    // every interior page used to share as the homepage.
    const meta = pageMetadata({
      title: 'Sell Sterling Silver in Naples, FL',
      description: 'd',
      path: '/silver-services',
      locale: 'en',
    });

    expect(meta.openGraph.title).toBe(`Sell Sterling Silver in Naples, FL${TITLE_SUFFIX}`);
    expect(meta.openGraph.title).toContain(SITE_NAME);
    // twitter must agree with og, or the card title changes by platform.
    expect(meta.twitter.title).toBe(meta.openGraph.title);
    // The <title> stays bare — the template adds the suffix there.
    expect(meta.title).toBe('Sell Sterling Silver in Naples, FL');
  });

  it('does not double-suffix a title that already carries the brand', () => {
    const meta = pageMetadata({
      title: 'Naples Estate Jewelry - Sell Jewelry, Gold & Silver in Naples, FL',
      description: 'd',
      path: '/',
      locale: 'en',
      brandedTitle: true,
    });

    expect(meta.openGraph.title).toBe('Naples Estate Jewelry - Sell Jewelry, Gold & Silver in Naples, FL');
    expect(meta.openGraph.title.match(new RegExp(SITE_NAME, 'g'))).toHaveLength(1);
    expect(meta.title).toEqual({ absolute: 'Naples Estate Jewelry - Sell Jewelry, Gold & Silver in Naples, FL' });
  });

  it('ALWAYS emits an image — a page-level openGraph replaces the layout block', () => {
    // /sell and every /sell/[city] page shipped a hand-rolled openGraph with no
    // images and posted blank cards in production. There is no inheritance to
    // fall back on, so the image must come from here every time.
    const meta = pageMetadata({ title: 't', description: 'd', path: '/sell', locale: 'en' });

    expect(meta.openGraph.images).toEqual([OG_IMAGE]);
    expect(meta.twitter.images).toEqual([OG_IMAGE.url]);
    expect(meta.openGraph.siteName).toBe(SITE_NAME);
  });

  it('falls back to the site card when a page image is null, never an empty list', () => {
    // Product pages used `images: image ? [{url: image}] : []`; an empty array
    // is exactly as blank as no tag at all.
    const withNull = pageMetadata({ title: 't', description: 'd', path: '/shop/x', locale: 'en', image: null });
    expect(withNull.openGraph.images).toEqual([OG_IMAGE]);

    const withImage = pageMetadata({
      title: 't', description: 'd', path: '/shop/x', locale: 'en',
      image: { url: 'https://cdn.example/product.webp' },
    });
    expect(withImage.openGraph.images).toEqual([{ url: 'https://cdn.example/product.webp' }]);
    expect(withImage.twitter.images).toEqual(['https://cdn.example/product.webp']);
  });

  it('keeps og:url identical to the canonical, per locale', () => {
    // A Spanish share previously carried the ENGLISH homepage URL.
    const en = pageMetadata({ title: 't', description: 'd', path: '/sell', locale: 'en' });
    const es = pageMetadata({ title: 't', description: 'd', path: '/sell', locale: 'es' });

    expect(en.openGraph.url).toBe(en.alternates.canonical);
    expect(es.openGraph.url).toBe(es.alternates.canonical);
    expect(es.openGraph.url).toBe('/es/sell');
    expect(en.openGraph.url).not.toBe(es.openGraph.url);
  });

  it('declares the locale and its alternate', () => {
    // og:locale was absent entirely, so Facebook assumed en_US on Spanish pages.
    const es = pageMetadata({ title: 't', description: 'd', path: '/', locale: 'es' });
    expect(es.openGraph.locale).toBe('es_ES');
    expect(es.openGraph.alternateLocale).toBe('en_US');

    const en = pageMetadata({ title: 't', description: 'd', path: '/', locale: 'en' });
    expect(en.openGraph.locale).toBe('en_US');
    expect(en.openGraph.alternateLocale).toBe('es_ES');
  });

  it('uses one description for the page and both social cards', () => {
    const meta = pageMetadata({ title: 't', description: 'shared copy', path: '/about', locale: 'en' });
    expect(meta.description).toBe('shared copy');
    expect(meta.openGraph.description).toBe('shared copy');
    expect(meta.twitter.description).toBe('shared copy');
  });
});
