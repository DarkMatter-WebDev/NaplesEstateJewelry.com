import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// 2026-09-06 split: the 26-photo marks section lives on its own guide page,
// /silver-services/silver-marks, and the lander only teases it. Each half is
// wired by string paths a compiler cannot check — a route that stops
// rendering the section, a teaser that links to a path nobody serves, or a
// guide missing from the sitemap would all ship silently.

const APP = join(process.cwd(), 'src', 'app');
const LANDER = readFileSync(join(APP, '[locale]', 'silver-services', 'page.tsx'), 'utf8');
const GUIDE_PATH = join(APP, '[locale]', 'silver-services', 'silver-marks', 'page.tsx');
const TEASER = readFileSync(join(process.cwd(), 'src', 'components', 'silver', 'SilverMarksTeaser.tsx'), 'utf8');
const SITEMAP = readFileSync(join(APP, 'sitemap.ts'), 'utf8');

describe('silver marks guide page split', () => {
  it('the guide route exists and renders the marks section', () => {
    expect(existsSync(GUIDE_PATH)).toBe(true);
    const guide = readFileSync(GUIDE_PATH, 'utf8');
    expect(guide).toContain('<SilverMarksSection locale={locale} />');
    expect(guide).toContain("path: '/silver-services/silver-marks'");
  });

  it('the lander no longer renders the full section, only the teaser', () => {
    expect(LANDER).not.toContain('SilverMarksSection');
    expect(LANDER).toContain('<SilverMarksTeaser locale={locale} />');
  });

  it('the teaser links to the guide in both locales', () => {
    expect(TEASER).toContain("'/silver-services/silver-marks'");
    expect(TEASER).toContain("'/es/silver-services/silver-marks'");
  });

  it('the teaser photos exist in the silver-marks folder', () => {
    const dir = join(process.cwd(), 'public', 'assets', 'images', 'pages', 'silver-marks');
    const keys = Array.from(TEASER.matchAll(/key: '([a-z0-9-]+)'/g)).map((m) => m[1]);
    expect(keys.length).toBe(4);
    expect(keys.filter((k) => !existsSync(join(dir, `${k}.webp`)))).toEqual([]);
  });

  it('the guide is in the sitemap, nested under the lander', () => {
    expect(SITEMAP).toContain("path: '/silver-services/silver-marks'");
  });
});
