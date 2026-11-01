import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Owner rule (2026-11-01): EVERY button reacts to hover. A real-mouse audit of
// 38 public pages found these controls with no hover change; each now uses one
// of the shared classes in globals.css. These guards keep the classes defined
// and attached. (Movement-based lifts: see social-links.test.ts.)

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');
const css = read('src', 'app', 'globals.css');
const sweep = css.slice(css.indexOf('/* Hover sweep (2026-11-01'));

describe('the shared hover classes', () => {
  it('are defined, pointer-only', () => {
    expect(sweep.length).toBeGreaterThan(0);
    const hoverBlock = sweep.slice(sweep.indexOf('@media (hover: hover)'));
    for (const rule of ['.hover-chip:hover', '.hover-link:hover', '.hover-text:hover', '.hover-dim:hover', 'main a.underline:hover', 'main details > summary:hover', '.shop-card-image-arrow:hover', '.shop-year-reset:hover:not(:disabled)', '.fe-reviews-link:hover', '.product-trust-link:hover']) {
      expect(hoverBlock).toContain(rule);
    }
  });

  it('never recolour sitewide underlined links or FAQ rows (some sit on dark sections)', () => {
    const inline = sweep.slice(sweep.indexOf('main a.underline:hover {'), sweep.indexOf('.product-trust-link:hover {'));
    expect(inline).not.toMatch(/color:/);
    const summary = sweep.slice(sweep.indexOf('main details > summary:hover {'));
    expect(summary.slice(0, summary.indexOf('}'))).not.toMatch(/(^|[^-])color:/);
  });
});

describe('attached where the audit found nothing', () => {
  const cases: Array<[string[], string]> = [
    [['src', 'components', 'layout', 'SiteHeader.tsx'], 'className="hover-dim flex items-center'],
    [['src', 'components', 'layout', 'SiteHeader.tsx'], 'site-header-language hover-chip'],
    [['src', 'components', 'layout', 'SiteFooter.tsx'], 'className="hover-link inline-flex min-h-8'],
    [['src', 'components', 'layout', 'SiteFooter.tsx'], 'className="hover-link text-xs md:text-sm md:mt-1"'],
    [['src', 'components', 'CopyAddressButton.tsx'], 'className={`hover-chip inline-flex h-6 w-6'],
    [['src', 'components', 'GradeChartScale.tsx'], 'className={`hover-chip inline-flex min-w-[2.4rem]'],
    [['src', 'components', 'GradeChartScale.tsx'], 'className="hover-link mt-4 cursor-pointer'],
    [['src', 'app', '[locale]', 'about', 'page.tsx'], 'className="hover-text inline-flex items-center gap-2 border-b'],
    [['src', 'app', '[locale]', 'spot-prices', 'page.tsx'], 'className="hover-link hover-link-on-dark'],
    [['src', 'components', 'card', 'CardLanding.tsx'], 'className="hover-text px-6 py-1.5'],
    [['src', 'components', 'card', 'CardLanding.tsx'], 'className="hover-dim flex flex-col items-center no-underline"'],
    [['src', 'components', 'card', 'CardLanding.tsx'], 'className="hover-link mt-1 flex items-center justify-center gap-1.5'],
  ];
  for (const [file, needle] of cases) {
    it(`${file[file.length - 1]}: ${needle.slice(0, 50)}`, () => {
      expect(read(...file)).toContain(needle);
    });
  }

  it('product page trade-in line: both phone links and both "How it works" links', () => {
    const product = read('src', 'app', '[locale]', 'shop', '[id]', 'page.tsx');
    expect(product.match(/<a href="tel:2394048505" className="hover-link"/g)?.length).toBe(2);
    expect(product.match(/'\/trade-in'\} className="hover-link"/g)?.length).toBe(2);
  });
});

describe('Sell menu label (owner, 2026-11-01)', () => {
  it('"Sell Us Bullion & Coins" / "Lingotes y Monedas"', () => {
    expect(JSON.parse(read('messages', 'en.json')).nav.bullion).toBe('Sell Us Bullion & Coins');
    expect(JSON.parse(read('messages', 'es.json')).nav.bullion).toBe('Lingotes y Monedas');
  });
});
