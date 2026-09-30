import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STOREFRONT_PHOTO_SRC } from '@/components/StorefrontPhoto';

// The storefront photo (owner, 2026-09-08) is the one picture that says
// "which door". It must be a real WebP under the size cap, and every approved
// surface must render it through the ONE component (same file, same alt).

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

describe('storefront photo asset', () => {
  it('is a real WebP (RIFF/WEBP header) and reasonably sized', () => {
    const file = join(ROOT, 'public', STOREFRONT_PHOTO_SRC);
    const buf = readFileSync(file);
    expect(buf.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(buf.subarray(8, 12).toString('ascii')).toBe('WEBP');
    // 1600×1200 at q74 came out ~351KB; a regression to PNG-under-.webp or a
    // 4000px re-export would blow well past this.
    expect(statSync(file).size).toBeLessThan(600 * 1024);
  });
});

describe('storefront photo surfaces', () => {
  const surfaces: Array<[string, string[], string]> = [
    ['homepage Visit Us (square, beside the square map — mockup V2)', ['src', 'app', '[locale]', '(home)', 'page.tsx'], 'aspect="1:1"'],
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

  it('the map stays square (the recorded decision) and no surface adds a caption', () => {
    const map = read('src', 'components', 'ShowroomMap.tsx');
    expect(map).toContain("aspectRatio: '1 / 1'");
    expect(map).not.toContain("aspect?:");
    const component = read('src', 'components', 'StorefrontPhoto.tsx');
    expect(component).not.toContain('<figcaption');
  });
});
