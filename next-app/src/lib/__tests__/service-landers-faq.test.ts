import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// 2026-09-08: the gold and silver landers gained the FAQ + phone-in-description
// parity the diamond, watch and appraisal pages already had. Two things must
// not regress: the phone stays in both descriptions (a searcher who wants to
// call should not need a click), and the FAQ answers keep the owner's facts —
// dental gold is SENT OUT for karat testing, plated/gold-filled is never bought
// as gold, flatware is priced both ways and paid at the higher.

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const GOLD = read('src', 'app', '[locale]', 'gold-services', 'page.tsx');
const SILVER = read('src', 'app', '[locale]', 'silver-services', 'page.tsx');
const FAQ = read('src', 'components', 'FaqSection.tsx');

describe('FaqSection', () => {
  it('emits FAQPage JSON-LD from the same list it renders', () => {
    expect(FAQ).toContain("'@type': 'FAQPage'");
    expect(FAQ).toContain("'@type': 'Question'");
    expect(FAQ).toContain('<details');
    // One list, two outputs — the markup can never describe hidden questions.
    expect(FAQ.match(/faqs\.map\(/g)?.length).toBe(2);
  });
});

describe('buy-side lander meta descriptions — phone last, short enough to survive truncation', () => {
  // DECISIONS.md 2026-09-08: Google cuts descriptions at ~155–160 characters
  // on phones and the number is the LAST thing in the string. Extract the
  // EN and ES literals from each page's description ternary.
  const LANDERS = ['gold-services', 'silver-services', 'diamond-buyers', 'watch-buyers', 'jewelry-appraisal', 'free-evaluation'];
  for (const lander of LANDERS) {
    it(`${lander}: both languages end with the phone and stay ≤ 160 characters`, () => {
      const src = read('src', 'app', '[locale]', lander, 'page.tsx');
      const block = src.slice(src.indexOf('description:'), src.indexOf("path: '/"));
      const literals = [...block.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]).filter((s) => s.length > 60);
      expect(literals.length).toBe(2);
      for (const text of literals) {
        expect(text.endsWith('(239) 404-8505.')).toBe(true);
        expect(text.length).toBeLessThanOrEqual(160);
      }
    });
  }
});

describe('/gold-services + /silver-services parity (2026-09-08)', () => {
  it('carry the phone number in both meta descriptions, EN and ES', () => {
    for (const src of [GOLD, SILVER]) {
      const block = src.slice(src.indexOf('description:'), src.indexOf("path: '/"));
      expect(block.match(/\(239\) 404-8505/g)?.length).toBe(2);
    }
  });

  it('render the shared FAQ block with six questions each', () => {
    expect(GOLD).toContain('<FaqSection');
    expect(SILVER).toContain('<FaqSection');
    expect(GOLD.match(/qEn: '/g)?.length).toBe(6);
    expect(SILVER.match(/qEn: '/g)?.length).toBe(6);
  });

  it('keep the owner\'s facts in the answers', () => {
    // Dental gold: sent out, offer follows the result — never priced in the shop.
    expect(GOLD).toMatch(/send dental gold out for testing/i);
    expect(GOLD).not.toMatch(/dental[^.]*priced in the shop/i);
    // Plated / gold-filled: never bought as gold.
    expect(GOLD).toMatch(/neither is bought as gold/i);
    // Flatware: both ways, pay the higher; the top tier is named, never a maker list.
    expect(SILVER).toMatch(/pay whichever is higher/i);
    expect(SILVER).toMatch(/Tiffany Chrysanthemum, Georg Jensen/);
  });
});
