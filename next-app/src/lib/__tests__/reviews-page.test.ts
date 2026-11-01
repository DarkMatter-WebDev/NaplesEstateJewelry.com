import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TESTIMONIALS } from '@/lib/testimonials';

// /reviews (2026-09-08): the full review list on its own page, opened from
// the business card's "Read Our Reviews" button. Its wiring is string paths
// (About menu, footer, /card, sitemap) that the compiler never checks, and it
// sits one letter away from the `/review` route handler, whose carve-out in
// the proxy matcher used to be an unanchored PREFIX — which would have sent
// /reviews around the locale rewrite and straight to a 404.

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

const PAGE_PATH = join(ROOT, 'src', 'app', '[locale]', 'reviews', 'page.tsx');
const PAGE = read('src', 'app', '[locale]', 'reviews', 'page.tsx');
// The card page body lives in the shared CardLanding component (2026-09-16).
const CARD = read('src', 'components', 'card', 'CardLanding.tsx');
const SECTION = read('src', 'components', 'home', 'TestimonialsSection.tsx');
const PROXY = read('src', 'proxy.ts');

/** The proxy's matcher string, as the regex Next compiles it to (for this shape they are the same). */
function proxyMatcher(): RegExp {
  // Comment lines sit between `matcher: [` and the pattern string, so find the
  // first quoted string that starts like a matcher rather than the bracket.
  const m = PROXY.match(/matcher:\s*\[[\s\S]*?'(\/\(\(\?![^']+)'/);
  if (!m) throw new Error('proxy.ts matcher not found');
  // The source holds a TS string literal, so `\\.` in the file is `\.` at runtime.
  return new RegExp(`^${m[1].replace(/\\\\/g, '\\')}$`);
}

describe('/reviews page', () => {
  it('exists, is indexable, and is listed in the sitemap', () => {
    expect(existsSync(PAGE_PATH)).toBe(true);
    expect(PAGE).toContain("path: '/reviews'");
    expect(PAGE).not.toContain('index: false');
    expect(read('src', 'app', 'sitemap.ts')).toContain("path: '/reviews'");
  });

  it('renders the curated list through the shared card and hands off to Google', () => {
    expect(TESTIMONIALS.length).toBeGreaterThan(0);
    expect(PAGE).toContain('TESTIMONIALS.map');
    expect(PAGE).toContain('<TestimonialCard');
    // The homepage band and product grid render the SAME card component.
    expect(SECTION).toContain('<TestimonialCard');
    expect(SECTION).not.toContain('function card(');
    // "Leave a Review" is the 302 route handler — a plain anchor, never a Link.
    expect(PAGE).toContain('href="/review"');
    expect(PAGE).toContain('GOOGLE_REVIEWS_URL');
  });

  it('carries no self-serving rating markup', () => {
    // Key-shaped matches, so the page's own comment explaining the ban does
    // not trip the guard.
    expect(PAGE).not.toMatch(/aggregateRating\s*:/);
    expect(PAGE).not.toMatch(/ratingValue\s*:/);
    expect(PAGE).not.toMatch(/'@type':\s*'(?:AggregateRating|Review)'/);
  });

  it('is reachable from the About menu, the footer and the card page', () => {
    expect(read('src', 'components', 'layout', 'SiteHeader.tsx')).toContain("{ key: 'reviews' as const, path: '/reviews' }");
    expect(JSON.parse(read('messages', 'en.json')).nav.reviews).toBe('Reviews');
    expect(JSON.parse(read('messages', 'es.json')).nav.reviews).toBe('Reseñas');
    expect(read('src', 'components', 'layout', 'SiteFooter.tsx')).toContain("href: p('/reviews')");
    expect(CARD).toContain('`${prefix}/reviews`');
  });

  it('is not swallowed by the /review carve-out in the proxy matcher', () => {
    const matcher = proxyMatcher();
    // Real pages go through the locale rewrite…
    expect(matcher.test('/reviews')).toBe(true);
    expect(matcher.test('/es/reviews')).toBe(true);
    expect(matcher.test('/shop')).toBe(true);
    // …while the top-level route handlers and static files still bypass it.
    expect(matcher.test('/review')).toBe(false);
    expect(matcher.test('/p/123')).toBe(false);
    expect(matcher.test('/robots.txt')).toBe(false);
  });
});

describe('/card page — reviews button and website label (2026-09-08)', () => {
  it('links to the site reviews page under the gold review ask, with the measured labels', () => {
    expect(CARD).toContain("name=\"forum\"");
    expect(CARD).toContain('Read Our Reviews');
    expect(CARD).toContain('Leer Nuestras Reseñas');
    // Bottom button says where it goes; the Spanish label drops "Completo" in
    // place because the full phrase measured 252 of 256px at 375px.
    expect(CARD).toContain('View Full Website & Shop');
    expect(CARD).toContain('Ver Sitio Web y Tienda');
    expect(CARD).not.toContain('Visit Our Website');
  });
});
