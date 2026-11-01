import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// /gold-services/gold-marks (2026-09-06) — the gold twin of the silver marks
// guide. Same guard: every photo key needs BOTH files on disk (tile + full),
// the shared gallery must be pointed at the gold folder, and the string-path
// wiring (lander teaser, hallmarks link, silver guide's related card, sitemap)
// must resolve to a route that exists.

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const SECTION = read('src', 'components', 'gold', 'GoldMarksSection.tsx');
const TEASER = read('src', 'components', 'gold', 'GoldMarksTeaser.tsx');
const DIR = join(ROOT, 'public', 'assets', 'images', 'pages', 'gold-marks');

const keys = (src: string) => Array.from(new Set(Array.from(src.matchAll(/key: '([a-z0-9-]+)'/g)).map((m) => m[1])));

describe('gold marks guide', () => {
  it('has a real photo list and both files for every key', () => {
    const list = keys(SECTION);
    expect(list.length).toBeGreaterThan(25);
    expect(list).toContain('own-disney-14k');
    const missing = list.flatMap((k) => [`${k}.webp`, `${k}-full.webp`]).filter((f) => !existsSync(join(DIR, f)));
    expect(missing).toEqual([]);
  });

  it('points the shared gallery at the gold folder', () => {
    expect(SECTION).toContain("export const GOLD_MARKS_DIR = '/assets/images/pages/gold-marks'");
    expect(SECTION).toContain('dir={GOLD_MARKS_DIR}');
    expect(read('src', 'components', 'silver', 'MarkGallery.tsx')).toContain('dir = DIR');
  });

  it('keeps the framing rules in the copy', () => {
    expect(SECTION).toContain('The P is not "plated"');
    expect(SECTION).toContain('sent out for testing before purchase');
    expect(SECTION).not.toMatch(/\b\d{2}% of spot\b/i);
  });

  it('the route exists, is in the sitemap, and is linked from the lander, the hallmarks page and the silver guide', () => {
    expect(existsSync(join(ROOT, 'src', 'app', '[locale]', 'gold-services', 'gold-marks', 'page.tsx'))).toBe(true);
    expect(read('src', 'app', '[locale]', 'gold-services', 'gold-marks', 'page.tsx')).toContain('<GoldMarksSection locale={locale} />');
    expect(read('src', 'app', 'sitemap.ts')).toContain("path: '/gold-services/gold-marks'");
    expect(read('src', 'app', '[locale]', 'gold-services', 'page.tsx')).toContain('<GoldMarksTeaser locale={locale} />');
    expect(TEASER).toContain("'/gold-services/gold-marks'");
    expect(TEASER).toContain("'/es/gold-services/gold-marks'");
    expect(keys(TEASER).filter((k) => !existsSync(join(DIR, `${k}.webp`)))).toEqual([]);
    const hallmarks = read('src', 'app', '[locale]', 'jewelry-appraisal', 'hallmarks', 'page.tsx');
    expect(hallmarks).toContain("p('/gold-services/gold-marks')");
    expect(hallmarks).toContain("p('/silver-services/silver-marks')");
    expect(read('src', 'app', '[locale]', 'silver-services', 'silver-marks', 'page.tsx')).toContain("p('/gold-services/gold-marks')");
  });
});
