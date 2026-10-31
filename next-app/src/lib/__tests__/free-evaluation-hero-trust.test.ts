import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TESTIMONIALS } from '@/lib/testimonials';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');
const page = read('src', 'app', '[locale]', 'free-evaluation', 'page.tsx');

// /free-evaluation hero (2026-10-31, owner-approved mockup): the owner photo
// replaces the generated placeholder, and three short Google reviews sit under
// the Call / Visit buttons. The magnet QR (/magnet) lands here.
describe('/free-evaluation hero: owner photo + review strip', () => {
  it('shows the real owner photo, not the generated placeholder', () => {
    expect(page).not.toContain('evaluation-desk-placeholder');
    expect(page).toContain("'/assets/images/pages/chris-owner.webp'");
  });

  it('puts the phone copy right after the "I\'m Chris" paragraph and the square in the lg column', () => {
    const lede = page.indexOf('fe-hero-lede');
    const phoneCopy = page.indexOf('<div className="lg:hidden mt-5">');
    const everyPiece = page.indexOf('fe-hero-kicker');
    expect(lede).toBeGreaterThan(-1);
    expect(phoneCopy).toBeGreaterThan(lede);
    expect(phoneCopy).toBeLessThan(everyPiece);
    expect(page).toContain('className="relative hidden lg:block"');
  });

  it('quotes three reviews that exist in TESTIMONIALS, whole — never retyped or trimmed', () => {
    const names = page.match(/HERO_REVIEW_NAMES = \[([^\]]+)\]/)?.[1].match(/'([^']+)'/g)?.map((s) => s.slice(1, -1)) ?? [];
    expect(names).toHaveLength(3);
    for (const name of names) expect(TESTIMONIALS.some((t) => t.name === name)).toBe(true);
    // The quote is rendered from the list, not pasted into the page.
    expect(page).toContain('isEs ? review.quoteEs : review.quote');
    for (const name of names) {
      const t = TESTIMONIALS.find((r) => r.name === name)!;
      expect(page).not.toContain(t.quote.slice(0, 40));
    }
  });

  it('sits under the Call / Visit buttons and links to the Google reviews', () => {
    const call = page.indexOf('href="tel:2394048505" className="gold-button"');
    const strip = page.indexOf('className="fe-reviews"');
    expect(call).toBeGreaterThan(-1);
    expect(strip).toBeGreaterThan(call);
    expect(page).toContain('href={GOOGLE_REVIEWS_URL}');
  });

  it('carries no review count and no review schema', () => {
    expect(page).not.toMatch(/aggregateRating|"Review"/);
  });
});
