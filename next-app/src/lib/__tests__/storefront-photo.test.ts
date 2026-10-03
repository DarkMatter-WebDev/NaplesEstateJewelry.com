import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STOREFRONT_PHOTO_SRC } from '@/components/StorefrontPhoto';

// The storefront photo (owner, 2026-09-08; replaced 2026-10-03) is the one
// picture that says "which door". It must be a real WebP under the size cap,
// and every approved surface must render it through the ONE component (same
// file, same alt).

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

describe('storefront photo asset', () => {
  it('is a real WebP (RIFF/WEBP header) and reasonably sized', () => {
    const file = join(ROOT, 'public', STOREFRONT_PHOTO_SRC);
    const buf = readFileSync(file);
    expect(buf.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(buf.subarray(8, 12).toString('ascii')).toBe('WEBP');
    // 1552×1142 at q82 came out ~288KB; a regression to PNG-under-.webp or a
    // 4000px re-export would blow well past this.
    expect(statSync(file).size).toBeLessThan(600 * 1024);
  });

  it('the replaced photo got a NEW file name — the CDN and next/image cache by URL', () => {
    // 2026-10-03: the photo with the teal and green neighbours and our signs.
    // Re-using `showroom-storefront.webp` would have kept serving the old picture.
    expect(STOREFRONT_PHOTO_SRC).toBe('/assets/images/pages/showroom-storefront-v2.webp');
    expect(existsSync(join(ROOT, 'public', STOREFRONT_PHOTO_SRC))).toBe(true);
    // The superseded file was removed on the owner's word the same day; nothing may bring it back unused.
    expect(existsSync(join(ROOT, 'public', 'assets', 'images', 'pages', 'showroom-storefront.webp'))).toBe(false);
  });
});

describe('storefront photo surfaces', () => {
  const surfaces: Array<[string, string[], string]> = [
    // Two equal squares until 2026-10-03; a square cut the teal and green neighbours off.
    ['homepage Visit Us (wide photo beside the square map — mockup Option B)', ['src', 'app', '[locale]', '(home)', 'page.tsx'], 'aspect="4:3"'],
    ['contact Visit Us panel', ['src', 'components', 'contact', 'VisitUsPanel.tsx'], 'aspect="4:3"'],
    ['Naples showroom band', ['src', 'app', '[locale]', 'sell', '[city]', 'page.tsx'], 'aspect="4:3"'],
    // 16:9 until 2026-09-24; the shorter 2:1 frame paid for the email line (card-page.test.ts).
    ['/card thumbnail', ['src', 'components', 'card', 'CardLanding.tsx'], 'aspect="2:1"'],
  ];
  for (const [name, path, aspect] of surfaces) {
    it(`${name} renders <StorefrontPhoto> with ${aspect} and a sizes attribute`, () => {
      const src = read(...path);
      const i = src.indexOf('<StorefrontPhoto');
      expect(i).toBeGreaterThan(-1);
      const tag = src.slice(i, src.indexOf('/>', i));
      expect(tag).toContain(aspect);
      expect(tag).toMatch(/sizes="[^"]+"/);
    });
  }

  it('the homepage row is 4fr : 3fr, which is what makes the wide photo and the square map the same height', () => {
    const home = read('src', 'app', '[locale]', '(home)', 'page.tsx');
    const i = home.indexOf('<StorefrontPhoto');
    const row = home.slice(home.lastIndexOf('<div', i), home.indexOf('</div>', i));
    // A 4:3 photo in a 4-wide column is exactly as tall as a 1:1 map in a 3-wide one.
    expect(row).toContain('md:grid-cols-[4fr_3fr]');
    expect(row).toContain('<ShowroomMap');
    expect(row.indexOf('<StorefrontPhoto')).toBeLessThan(row.indexOf('<ShowroomMap'));
  });

  it('the map stays square (the recorded decision) and no surface adds a caption', () => {
    const map = read('src', 'components', 'ShowroomMap.tsx');
    expect(map).toContain("aspectRatio: '1 / 1'");
    expect(map).not.toContain("aspect?:");
    const component = read('src', 'components', 'StorefrontPhoto.tsx');
    expect(component).not.toContain('<figcaption');
  });

  it('has no square frame (it cuts the neighbours off) and the strip keeps the ground floor', () => {
    const component = read('src', 'components', 'StorefrontPhoto.tsx');
    expect(component).toContain("aspect?: '4:3' | '2:1';");
    expect(component).toContain("'2:1': '50% 100%'");
    expect(component).toContain("'4:3': '50% 50%'");
  });

  it('the description names the cues the new photo shows: the teal and green neighbours and our signs', () => {
    const component = read('src', 'components', 'StorefrontPhoto.tsx');
    const alts = [...component.matchAll(/^\s*[?:] '([^']+)';?\r?$/gm)].map((m) => m[1]);
    expect(alts).toHaveLength(2);
    const [es, en] = alts;
    expect(en).toContain('between a teal unit and a bright green one');
    expect(en).toContain('Suite 104 is the center glass door');
    expect(en).toContain('Naples Estate Jewelry signs in the window and by the bench');
    expect(es).toContain('entre un local turquesa y otro verde brillante');
    expect(es).toContain('letreros de Naples Estate Jewelry en la ventana y junto al banco');
    for (const alt of alts) {
      // The straightened photo cuts the curb number at the bottom edge.
      expect(alt).not.toMatch(/curb|bordillo/i);
      // The neighbouring business is never named on these surfaces (2026-08-23).
      expect(alt).not.toMatch(/Sharon|Lynch|Rochelle/i);
    }
  });
});
