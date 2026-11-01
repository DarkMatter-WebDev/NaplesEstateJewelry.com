import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// /guides (2026-10-27): one index page listing every guide the site already
// has. Its wiring is string paths (About menu, footer, sitemap) the compiler
// never checks, and its cards must point at guides that EXIST and stay an
// index — titles + one line — never a copy of a guide's text.

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

const PAGE_PATH = join(ROOT, 'src', 'app', '[locale]', 'guides', 'page.tsx');
const PAGE = read('src', 'app', '[locale]', 'guides', 'page.tsx');
const SITEMAP = read('src', 'app', 'sitemap.ts');

/** Every `path: '/…'` inside the GUIDES list. */
function listedGuidePaths(): string[] {
  const block = PAGE.match(/const GUIDES: GuideEntry\[\] = \[([\s\S]*?)\n\];/);
  if (!block) throw new Error('GUIDES list not found');
  return [...block[1].matchAll(/path: '([^']+)'/g)].map((m) => m[1]);
}

describe('/guides page', () => {
  it('exists, is indexable, and is listed in the sitemap at a low priority', () => {
    expect(existsSync(PAGE_PATH)).toBe(true);
    expect(PAGE).toContain("path: '/guides'");
    expect(PAGE).not.toContain('index: false');
    expect(SITEMAP).toMatch(/path: '\/guides', priority: 0\.5/);
  });

  it('lists the eight guides, each a real nested page that the sitemap carries', () => {
    const paths = listedGuidePaths();
    expect(paths).toHaveLength(8);
    for (const path of paths) {
      // Nested under a parent service page — never /guides/<slug>.
      expect(path.split('/').filter(Boolean)).toHaveLength(2);
      expect(path.startsWith('/guides')).toBe(false);
      expect(existsSync(join(ROOT, 'src', 'app', '[locale]', ...path.split('/').filter(Boolean), 'page.tsx'))).toBe(true);
      expect(SITEMAP).toContain(`path: '${path}'`);
    }
  });

  it("uses each guide's own title so the card and the page agree", () => {
    const block = PAGE.match(/const GUIDES: GuideEntry\[\] = \[([\s\S]*?)\n\];/)![1];
    for (const entry of block.split(/\n  \{\n/).slice(1)) {
      const path = entry.match(/path: '([^']+)'/)![1];
      const titleEn = entry.match(/titleEn: '([^']+)'/)![1];
      const guide = read('src', 'app', '[locale]', ...path.split('/').filter(Boolean), 'page.tsx');
      expect(guide, path).toContain(titleEn);
    }
  });

  it('stays an index: short lines, no guide prose', () => {
    for (const m of PAGE.matchAll(/line(?:En|Es): '([^']+)'/g)) {
      expect(m[1].length, m[1]).toBeLessThan(150);
    }
  });

  it('is reachable from the About menu (both languages) and the footer', () => {
    expect(read('src', 'components', 'layout', 'SiteHeader.tsx')).toContain("{ key: 'guides' as const, path: '/guides' }");
    expect(JSON.parse(read('messages', 'en.json')).nav.guides).toBe('Guides');
    expect(JSON.parse(read('messages', 'es.json')).nav.guides).toBe('Guías');
    expect(read('src', 'components', 'layout', 'SiteFooter.tsx')).toContain("href: p('/guides')");
  });

  it('ends with the evaluation and the phone, like every guide', () => {
    expect(PAGE).toContain("p('/free-evaluation')");
    expect(PAGE).toContain('href="tel:2394048505"');
  });
});
