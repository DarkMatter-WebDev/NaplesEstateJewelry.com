import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GOOGLE_REVIEWS,
  freeEvaluationReviewsLabel,
  googleReviewsLine,
  parseGoogleReviews,
  reviewCountLabel,
} from '../google-reviews';
import { BAND_MIN_QUOTE_CHARS, BAND_TESTIMONIALS, TESTIMONIALS } from '../testimonials';

// Google review count line (owner, 2026-11-01): "50+ Google reviews · All five
// stars", the count admin-edited; plus the 29 reviews brought in from the
// live profile (51 total, all five stars on Google Maps that day).

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');
const settings = (count: number, allFiveStar = true) => ({ count, allFiveStar, updatedAt: null });

describe('the count never says more than the profile has', () => {
  it('rounds DOWN to the nearest 10 with "+"', () => {
    expect(reviewCountLabel(51)).toBe('50+');
    expect(reviewCountLabel(50)).toBe('50+');
    expect(reviewCountLabel(59)).toBe('50+');
    expect(reviewCountLabel(63)).toBe('60+');
    expect(reviewCountLabel(120)).toBe('120+');
  });

  it('shows no count under 10', () => {
    expect(reviewCountLabel(9)).toBeNull();
    expect(reviewCountLabel(0)).toBeNull();
    expect(googleReviewsLine(settings(7), false).count).toBe('Google reviews');
  });

  it('the default is what Google Maps showed on 2026-11-01', () => {
    expect(DEFAULT_GOOGLE_REVIEWS).toEqual({ count: 51, allFiveStar: true, updatedAt: '2026-11-01' });
  });
});

describe('the wording', () => {
  it('homepage + /reviews line, EN and ES', () => {
    expect(googleReviewsLine(settings(51), false)).toEqual({ count: '50+ Google reviews', stars: 'All five stars' });
    expect(googleReviewsLine(settings(51), true)).toEqual({ count: '50+ reseñas en Google', stars: 'Todas de cinco estrellas' });
  });

  it('"All five stars" disappears the moment the box is unticked; the count stays', () => {
    expect(googleReviewsLine(settings(51, false), false)).toEqual({ count: '50+ Google reviews', stars: null });
    expect(freeEvaluationReviewsLabel(settings(51, false), false)).toBe('From our 50+ Google reviews');
  });

  it('/free-evaluation label', () => {
    expect(freeEvaluationReviewsLabel(settings(51), false)).toBe('From our 50+ five-star Google reviews');
    expect(freeEvaluationReviewsLabel(settings(51), true)).toBe('50+ reseñas de cinco estrellas en Google');
    expect(freeEvaluationReviewsLabel(settings(5), false)).toBe('From our Google reviews');
  });
});

describe('parsing the stored setting', () => {
  it('accepts a whole count + a boolean; anything else falls back (null)', () => {
    expect(parseGoogleReviews({ count: 63, allFiveStar: false, updatedAt: '2026-12-01' })).toEqual({ count: 63, allFiveStar: false, updatedAt: '2026-12-01' });
    expect(parseGoogleReviews({ count: 63, allFiveStar: true, updatedAt: 'yesterday' })?.updatedAt).toBeNull();
    for (const bad of [null, [], 'x', { count: 5.5, allFiveStar: true }, { count: -1, allFiveStar: true }, { count: '51', allFiveStar: true }, { count: 51 }]) {
      expect(parseGoogleReviews(bad)).toBeNull();
    }
  });
});

describe('the review list', () => {
  it('holds all 51 reviews on the profile, each name once, every quote in both languages', () => {
    expect(TESTIMONIALS).toHaveLength(51);
    expect(new Set(TESTIMONIALS.map((t) => t.name)).size).toBe(51);
    for (const t of TESTIMONIALS) {
      expect(t.quote.trim().length).toBeGreaterThan(0);
      expect(t.quoteEs.trim().length).toBeGreaterThan(0);
    }
    for (const name of ['Lan Kremkau', 'Marlene Finberg', 'John P', 'Robert Stumbo', 'Lorena & Scott Schultz', 'J. W.', 'Adrian Sanchez']) {
      expect(TESTIMONIALS.some((t) => t.name === name)).toBe(true);
    }
  });

  it('keeps the customers\' own words, typos included', () => {
    expect(TESTIMONIALS.find((t) => t.name === 'Barbara Arnold')!.quote).toContain('Chis is very knowledgable');
    expect(TESTIMONIALS.find((t) => t.name === 'Lyn Dukes')!.quote).toContain('Ypu have to come see!!');
  });

  it('the scrolling band carries only the full-length ones (24 of 51)', () => {
    expect(BAND_MIN_QUOTE_CHARS).toBe(160);
    expect(BAND_TESTIMONIALS).toHaveLength(24);
    expect(BAND_TESTIMONIALS.every((t) => t.quote.length >= 160)).toBe(true);
    expect(BAND_TESTIMONIALS.some((t) => t.name === 'Adrian Sanchez')).toBe(false);
  });
});

describe('where the line appears', () => {
  it('homepage reviews section only (not the product-page band), right under the heading', () => {
    const section = read('src', 'components', 'home', 'TestimonialsSection.tsx');
    expect(section).toContain('const reviews = compact ? null : await getGoogleReviews();');
    expect(section.indexOf('<GoogleReviewsLine')).toBeGreaterThan(section.indexOf('Trusted Across Southwest Florida'));
    expect(section).toContain('BAND_TESTIMONIALS.map(');
    expect(section).not.toMatch(/[^_]TESTIMONIALS\./);
  });

  it('/reviews under the h1; /free-evaluation label from the same setting', () => {
    const reviews = read('src', 'app', '[locale]', 'reviews', 'page.tsx');
    expect(reviews.indexOf('<GoogleReviewsLine')).toBeGreaterThan(reviews.indexOf('</h1>'));
    expect(reviews).toContain('TESTIMONIALS.map(');
    const free = read('src', 'app', '[locale]', 'free-evaluation', 'page.tsx');
    expect(free).toContain('freeEvaluationReviewsLabel(googleReviews, isEs)');
  });

  it('never as review schema', () => {
    for (const file of [
      read('src', 'components', 'GoogleReviewsLine.tsx'),
      read('src', 'components', 'home', 'TestimonialsSection.tsx'),
      read('src', 'app', '[locale]', 'reviews', 'page.tsx'),
      read('src', 'lib', 'google-reviews.ts').replace(/⛔ Never add aggregateRating[^\n]*\n/, ''),
    ]) {
      expect(file).not.toMatch(/"aggregateRating"|aggregateRating:|ratingValue/);
    }
  });

  it('admin: the box, an admin-only route, a migration file', () => {
    expect(read('src', 'components', 'admin', 'AdminSettingsPanel.tsx')).toContain('<AdminGoogleReviewsPanel />');
    const route = read('src', 'app', 'api', 'admin', 'google-reviews', 'route.ts');
    expect(route.match(/requireAdmin\(\)/g)?.length).toBe(2);
    expect(route).toContain('revalidateTag(GOOGLE_REVIEWS_CACHE_TAG');
    expect(read('..', 'supabase', 'google-reviews-2026-11.sql')).toMatch(/add column if not exists google_reviews jsonb/);
  });
});

describe("Google's own wordmark (owner, 2026-11-01)", () => {
  // Owner rule (2026-11-01): the colour logo ONCE per section, 1–2 per page.
  const src = (...p: string[]) => readFileSync(join(process.cwd(), 'src', ...p), 'utf8');
  const logos = (text: string) => (text.match(/<GoogleWordmark\b/g) ?? []).length + (text.match(/<GoogleReviewsLine\b[^>]*\bgoogleLogo\b/g) ?? []).length;

  it('review cards never carry it (a band or grid of cards is one section)', () => {
    expect(src('components', 'home', 'TestimonialCard.tsx')).not.toMatch(/GoogleWordmark|googleLogo/);
  });

  it('homepage: the rating line; product pages: the note under the band — one each', () => {
    const section = src('components', 'home', 'TestimonialsSection.tsx');
    expect(section).toContain('<GoogleReviewsLine settings={reviews} isEs={isEs} googleLogo className="mb-9" />');
    expect(section).toContain('{compact ? (');
    expect(logos(section)).toBe(2); // the line (homepage only) + the note (product pages only)
  });

  it('each page has its one logo (two on /sellbymail)', () => {
    const pages: [string[], number][] = [
      [['app', '[locale]', 'sellbymail', 'page.tsx'], 2],
      [['app', '[locale]', 'reviews', 'page.tsx'], 1],
      [['app', '[locale]', 'free-evaluation', 'page.tsx'], 1],
      [['app', '[locale]', 'about', 'page.tsx'], 1],
      [['app', '[locale]', 'bullion', 'page.tsx'], 1],
      [['app', '[locale]', 'faq', 'page.tsx'], 1],
      [['components', 'card', 'CardLanding.tsx'], 2], // EN + ES branches of the one button
    ];
    for (const [p, n] of pages) expect(logos(src(...p)), p.join('/')).toBe(n);
    // /silver-services: EN + ES branches of the one caption.
    expect(logos(src('app', '[locale]', 'silver-services', 'page.tsx'))).toBe(2);
  });

  it('the gold /card button puts it on a white pill', () => {
    expect(src('components', 'card', 'CardLanding.tsx')).toContain('<GoogleWordmark pill height="1.15em" className="-translate-y-[1.4px]" />');
  });

  it("the file is Google's official SVG (four brand colours, no script)", () => {
    const svg = readFileSync(join(process.cwd(), 'public', 'assets', 'images', 'brands', 'google.svg'), 'utf8');
    for (const colour of ['#4285F4', '#EA4335', '#FBBC05', '#34A853']) expect(svg).toContain(colour);
    expect(svg).not.toMatch(/<script|onload=/i);
  });
});

describe('Google logo + stars sit level (owner, 2026-11-01)', () => {
  const src = (...p: string[]) => readFileSync(join(process.cwd(), 'src', ...p), 'utf8');
  it("the wordmark drops by its own 'g' tail so the letters sit on the text baseline", () => {
    const mark = src('components', 'GoogleWordmark.tsx');
    expect(mark).toContain('export const GOOGLE_DESCENT_RATIO = (92 - 69.35) / 92;');
    expect(mark).toContain('verticalAlign: `calc(${height} * ${-GOOGLE_DESCENT_RATIO})`');
    // Pill: the extra padding goes on TOP, so the letters (not the image) are centred.
    expect(mark).toContain('paddingTop: `calc(${height} * (0.17 + ${GOOGLE_DESCENT_RATIO}))`');
  });
  it('the rating-line stars: computer = top of the line + 0.06em down; phone = raised 0.04em', () => {
    const line = src('components', 'GoogleReviewsLine.tsx');
    expect(line).toContain('-translate-y-[0.04em] lg:self-start lg:translate-y-[0.06em]');
    // An inline transform would override the classes.
    expect(line).not.toMatch(/style=\{\{ transform:/);
  });
});
