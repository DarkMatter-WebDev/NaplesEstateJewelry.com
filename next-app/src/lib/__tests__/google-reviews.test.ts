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
