import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// /diamond-buyers/what-is-my-diamond-worth (2026-10-27): the seller-framed
// diamond guide with the full color and clarity chart the owner uses at the
// counter. The owner's wording rules are string facts the compiler never
// checks, and the chart must stay complete and in order.

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const PAGE_PATH = join(ROOT, 'src', 'app', '[locale]', 'diamond-buyers', 'what-is-my-diamond-worth', 'page.tsx');
const PAGE = read('src', 'app', '[locale]', 'diamond-buyers', 'what-is-my-diamond-worth', 'page.tsx');

const COLOR = 'DEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const CLARITY = ['FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'I1', 'I2', 'I3'];

function gradesIn(listName: string): string[] {
  const block = PAGE.match(new RegExp(`const ${listName}[^=]*= \\[([\\s\\S]*?)\\n  \\];`));
  if (!block) throw new Error(`${listName} not found`);
  return [...block[1].matchAll(/\{ g: '([^']+)'/g)].map((m) => m[1]);
}

describe('diamond guide', () => {
  it('exists, is indexable, nested under /diamond-buyers, and in the sitemap', () => {
    expect(existsSync(PAGE_PATH)).toBe(true);
    expect(PAGE).toContain("path: '/diamond-buyers/what-is-my-diamond-worth'");
    expect(PAGE).not.toContain('index: false');
    expect(read('src', 'app', 'sitemap.ts')).toContain("path: '/diamond-buyers/what-is-my-diamond-worth'");
  });

  it('carries the full color and clarity scales, in order, one line each', () => {
    expect(gradesIn('colorGrades')).toEqual(COLOR);
    expect(gradesIn('clarityGrades')).toEqual(CLARITY);
    expect(PAGE).toContain('id="color-clarity-chart"');
    // Every grade has a non-empty EN and ES line.
    for (const m of PAGE.matchAll(/\{ g: '[^']+', band: '[^']+', en: '([^']*)', es: '([^']*)' \}/g)) {
      expect(m[1].length).toBeGreaterThan(3);
      expect(m[2].length).toBeGreaterThan(3);
    }
  });

  it('renders both scales through the collapsible GradeChartScale (chart B, 2026-10-28)', () => {
    // Both scales go through the component, every grade's line passed in.
    expect(PAGE.match(/<GradeChartScale\b/g)?.length).toBe(2);
    expect(PAGE).toContain('grades={colorGrades.map(');
    expect(PAGE).toContain('grades={clarityGrades.map(');
    const chart = read('src', 'components', 'GradeChartScale.tsx');
    expect(chart.startsWith("'use client';")).toBe(true);
    // Compact by default, "Show every grade" remembered per device, storage in try/catch.
    expect(chart).toContain('useState(false)');
    expect(chart).toMatch(/try \{[\s\S]{0,400}?if \(localStorage\.getItem\(storageKey\) === '1'\) setExpanded\(true\);/);
    expect(chart).toContain('Show every grade');
    expect(chart).toContain('Mostrar todos los grados');
    // Chips are real buttons (keyboard + aria-pressed), never a horizontal scroller.
    expect(chart).toContain('aria-pressed={on}');
    expect(chart).not.toMatch(/overflow-x-(auto|scroll)/);
  });

  it("keeps the owner's wording rules", () => {
    // Loose stones: "we do, call first" — never a refusal.
    expect(PAGE).toMatch(/We do buy loose diamonds when the stone and the price make sense/);
    expect(PAGE).not.toMatch(/(do not|don['’]t) buy loose/i);
    expect(PAGE).not.toMatch(/no compramos (diamantes|piedras) suelt/i);
    // The appraisal gap is the owner's range, never a multiplier.
    expect(PAGE).toContain('from a fraction of the appraisal to a decent majority of it');
    expect(PAGE).not.toMatch(/\d\s?[–-]\s?\d\s?[x×]\s+resale|\d+\s?%\s+of (retail|the appraisal)/i);
    // Lab-grown bought at a nominal price; the GIA fee is the seller's.
    expect(PAGE).toContain('at a nominal price');
    expect(PAGE).toContain('the fee is the seller’s');
  });

  it('is linked from the diamond page, the hallmarks guide and the Guides index', () => {
    expect(read('src', 'app', '[locale]', 'diamond-buyers', 'page.tsx')).toContain("p('/diamond-buyers/what-is-my-diamond-worth')");
    expect(read('src', 'app', '[locale]', 'jewelry-appraisal', 'hallmarks', 'page.tsx')).toContain("p('/diamond-buyers/what-is-my-diamond-worth')");
    expect(read('src', 'app', '[locale]', 'guides', 'page.tsx')).toContain("path: '/diamond-buyers/what-is-my-diamond-worth'");
  });
});
