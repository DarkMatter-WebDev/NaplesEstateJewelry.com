import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEGACY_REDIRECTS } from '@/lib/legacy-redirects';

// /spot-prices (2026-09-06): the live-prices destination page. Its wiring is
// string paths — the About menu item, the footer link, the three sell-page
// links, the /live alias and the sitemap — none of which the compiler checks.
// The karat table must also use the SAME fractions as the gold-worth guide
// so the two pages can never disagree (the guide's framing rule).

const ROOT = process.cwd();
const APP = join(ROOT, 'src', 'app');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

const PAGE = read('src', 'app', '[locale]', 'spot-prices', 'page.tsx');
const GUIDE = read('src', 'app', '[locale]', 'gold-services', 'what-is-my-gold-worth', 'page.tsx');

function fractions(src: string): Record<string, number> {
  // page: `{ mark: '14k · 585', fine: 0.583 }`; guide: `{ mark: '14k · 585', fineEn: '58.3% gold'`
  const out: Record<string, number> = {};
  for (const m of src.matchAll(/mark: '([0-9]+k · [0-9]+)'.*?(?:fine: ([0-9.]+)|fineEn: '([0-9.]+)% gold')/g)) {
    out[m[1]] = m[2] ? Number(m[2]) : Number(m[3]) / 100;
  }
  return out;
}

describe('/spot-prices page', () => {
  it('exists with its own metadata path and ISR window', () => {
    expect(existsSync(join(APP, '[locale]', 'spot-prices', 'page.tsx'))).toBe(true);
    expect(PAGE).toContain("path: '/spot-prices'");
    expect(PAGE).toContain('export const revalidate = 300');
  });

  it('karat fractions match the gold-worth guide exactly', () => {
    const page = fractions(PAGE);
    const guide = fractions(GUIDE);
    expect(Object.keys(page).length).toBe(5);
    for (const [mark, fine] of Object.entries(page)) {
      expect(guide[mark], `guide has ${mark}`).toBeDefined();
      expect(Math.abs(guide[mark] - fine)).toBeLessThan(0.0006);
    }
  });

  it('labels the table as metal value, not an offer, and states no margin', () => {
    expect(PAGE).toContain("'not an offer'");
    expect(PAGE).not.toMatch(/\b\d{2}% of spot\b/i);
  });

  it('is reachable from the About menu, the footer and the three sell pages', () => {
    expect(read('src', 'components', 'layout', 'SiteHeader.tsx')).toContain("{ key: 'livePrices' as const, path: '/spot-prices' }");
    expect(JSON.parse(read('messages', 'en.json')).nav.livePrices).toBe('Live Metal Prices');
    expect(JSON.parse(read('messages', 'es.json')).nav.livePrices).toBe('Precios de Metales en Vivo');
    expect(read('src', 'components', 'layout', 'SiteFooter.tsx')).toContain("href: p('/spot-prices')");
    for (const page of ['bullion', 'gold-services', 'silver-services']) {
      expect(read('src', 'app', '[locale]', page, 'page.tsx'), page).toContain("'/spot-prices'");
    }
  });

  it('has the /live alias and a sitemap entry', () => {
    expect(LEGACY_REDIRECTS['/live']).toEqual({ to: '/spot-prices', permanent: false });
    expect(read('src', 'app', 'sitemap.ts')).toContain("path: '/spot-prices'");
  });
});
