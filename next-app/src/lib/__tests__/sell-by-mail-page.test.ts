import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The UNLISTED /sellbymail page (owner, 2026-11-01): reachable only by the link
// the owner sends to known clients and dealers. These guards keep it unlisted
// (see DECISIONS.md → "No mail-in page" for why it must never go public).

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');
const PAGE = read('src', 'app', '[locale]', 'sellbymail', 'page.tsx');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === 'sellbymail') continue;
      walk(full, out);
    } else if (/\.(tsx?|json)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe('/sellbymail stays unlisted', () => {
  it('is noindex / nofollow', () => {
    expect(PAGE).toContain('robots: { index: false, follow: false }');
  });

  it('is not in the sitemap', () => {
    expect(read('src', 'app', 'sitemap.ts')).not.toMatch(/sellbymail/);
  });

  it('nothing else in the app links to it (menus, footer, pages, messages)', () => {
    const files = [...walk(join(process.cwd(), 'src')), join(process.cwd(), 'messages', 'en.json'), join(process.cwd(), 'messages', 'es.json')];
    // A link or a path string — comments that name the page are fine.
    const linking = files.filter((f) => existsSync(f) && /href[^\n]*sellbymail|['"`]\/(?:es\/)?sellbymail\b/.test(readFileSync(f, 'utf8')));
    expect(linking).toEqual([]);
  });

  it('keeps the normal site header and footer', () => {
    expect(PAGE).toContain('<SiteHeader />');
    expect(PAGE).toContain('<SiteFooter locale={locale} />');
  });
});

describe('the page says what the owner said, and only that', () => {
  it('eight steps, including the ID photo and the insured prepaid label', () => {
    expect(PAGE.match(/title: \['/g)?.length).toBe(8);
    expect(PAGE).toContain('Send a photo of your ID');
    expect(PAGE).toContain('insured on its way to us, with coverage based on its value');
    expect(PAGE).toContain('USPS, FedEx or UPS');
    expect(PAGE).toContain('within one day of arrival');
    expect(PAGE).toContain('return shipping is paid by you');
    for (const pay of ['Zelle', 'Bank transfer', 'Mailed check']) expect(PAGE).toContain(pay);
  });

  it('step 1 offers call, text, email and the photo form', () => {
    expect(PAGE).toContain('href="tel:2394048505"');
    expect(PAGE).toContain('<TextUsLink');
    expect(PAGE).toContain('mailto:info@naplesestatejewelry.com');
    expect(PAGE).toContain('href="#send-photos"');
    expect(PAGE).toContain('<EvalForm locale={locale} submitted={false} variant="sell-by-mail" />');
  });
});

describe('images (owner, 2026-11-01, option B) — only images the site already uses', () => {
  it('one icon per step from the owner\'s icon pack, a four-icon "What we buy" row', () => {
    const icons = [...PAGE.matchAll(/icon: '([a-z-]+)'/g)].map((m) => m[1]);
    expect(icons).toEqual(['phone-signal', 'shield', 'heirloom', 'house', 'scale', 'pricing', 'camera', 'cash']);
    for (const name of icons) expect(existsSync(join(process.cwd(), 'public', 'assets', 'images', 'icons', `mark-${name}.webp`))).toBe(true);
    expect(PAGE).toContain('<ClayMark name={step.icon} size={76} />');
    for (const mark of ['chain', 'sterling-flatware', 'gemstone', 'coins']) expect(PAGE).toContain(`['${mark}',`);
  });

  it('the owner photo beside the opener (described, priority) and the shared storefront photo', () => {
    expect(PAGE).toContain("const OWNER_PHOTO = '/assets/images/pages/chris-owner.webp';");
    expect(PAGE).toContain('Chris, the owner, at the appraisal table in the Naples showroom');
    expect(PAGE).toMatch(/src=\{OWNER_PHOTO\}[\s\S]{0,400}priority/);
    expect(PAGE).toContain('<StorefrontPhoto locale={locale} aspect="2:1"');
  });
});

describe('photo-form leads from the page arrive marked', () => {
  it('the form sends source=sell-by-mail; the route titles it "Sell by Mail Request"', () => {
    const form = read('src', 'components', 'free-evaluation', 'EvalForm.tsx');
    expect(form).toContain("variant = 'free-evaluation'");
    expect(form).toContain("fd.append('source', variant);");
    const route = read('src', 'app', 'api', 'inquire', 'route.ts');
    expect(route).toContain("source === 'sell-by-mail' ? 'Sell by Mail Request'");
    expect(route).toContain('return `Sell-by-mail request from ${who}`;');
  });
});

describe('trust section (owner, 2026-11-01, mockup 3)', () => {
  it('every pick is a real review and every highlight is verbatim in both languages', async () => {
    const { TRUST_BAND, TRUST_FEATURED, TRUST_PULL, trustReview } = await import('@/lib/sell-by-mail-trust');
    const picks = [TRUST_FEATURED, ...TRUST_BAND, TRUST_PULL];
    expect(picks.map((p) => p.name)).toEqual([
      'Mine Cervantes', 'Lorena & Scott Schultz', 'Joseph Roth', 'Edna Cavazos', 'Scott Tallent', 'Barbara Arnold', 'John P', 'Ruthe Lloyd',
    ]);
    for (const pick of picks) {
      const review = trustReview(pick);
      expect(review, pick.name).toBeDefined();
      if (pick.highlight) {
        expect(review!.quote).toContain(pick.highlight[0]);
        expect(review!.quoteEs).toContain(pick.highlight[1]);
      }
    }
  });

  it('sits after the steps and before the details; band reused; Google wordmark used', () => {
    const steps = PAGE.indexOf('{/* Steps */}');
    const trust = PAGE.indexOf('{/* Trust (after the steps)');
    const details = PAGE.indexOf('{/* Details */}');
    expect(steps).toBeGreaterThan(0);
    expect(trust).toBeGreaterThan(steps);
    expect(details).toBeGreaterThan(trust);
    expect(PAGE).toContain('<TestimonialMarqueeBand durationSeconds={durationSeconds} className="testimonial-marquee-tall">');
    expect(PAGE).toContain('<GoogleReviewsLine settings={reviews} isEs={isEs} googleLogo');
    expect(existsSync(join(process.cwd(), 'public', 'assets', 'images', 'brands', 'google.svg'))).toBe(true);
  });
});
