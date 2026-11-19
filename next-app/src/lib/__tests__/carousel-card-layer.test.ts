import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// 2026-11-18 (owner: "a very slight ... stutter each time a new photo
// completely comes onto the screen"). Traced in Chrome: once per card step the
// tile of the card coming into view was not rastered in time
// ("missing_tile_count: 1") → one skipped frame → the whole ring hitched.
// `will-change: transform` on each CARD removed every skipped frame (6–8 per
// 20 s → 0, two runs each) with no change in sharpness; on the photo it did
// nothing. This pins it so it is never "cleaned up".

const CSS = readFileSync(join(process.cwd(), 'carousel', 'components', 'Carousel.module.css'), 'utf8');

/** Every rule body whose selector is exactly `selector` (the file has more than one `.card {`), joined. */
function ruleBody(selector: string): string {
  const re = new RegExp(`(?:^|\\n)${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`, 'g');
  return Array.from(CSS.matchAll(re), (m) => m[1]).join('\n');
}

describe('hero carousel card layer', () => {
  it('each card keeps its own fully rastered layer (no per-card-step hitch)', () => {
    const card = ruleBody('.card');
    expect(card).toContain('transform:'); // positive control: this is the 3D card rule
    expect(card).toMatch(/will-change:\s*transform/);
  });

  it('the hint stays on the card, not the photo (on the photo it does not help)', () => {
    expect(ruleBody('.img')).not.toMatch(/will-change/);
  });
});

// 2026-11-18 (owner on iPhone: "i see the stutter just once, when the first new
// photo ... comes onto the screen"). The first never-before-shown photo was
// decoded the moment it first painted. Upcoming photos are now decoded while
// their card is still hidden, and the offscreen preloader really loads.
const TSX = readFileSync(join(process.cwd(), 'carousel', 'components', 'Carousel.tsx'), 'utf8');

describe('hero carousel decodes upcoming photos ahead of time', () => {
  it('ring cards and preloader both decode on load', () => {
    expect(TSX).toMatch(/function decodeAhead\([^)]*\)\s*\{\s*event\.currentTarget\.decode\?\.\(\)\.catch/);
    expect(TSX.match(/onLoad=\{decodeAhead\}/g)?.length).toBe(2);
  });

  it('the preloader is eager + low priority (lazy at left:-9999px could be skipped)', () => {
    const preloader = TSX.slice(TSX.indexOf('Off-screen preloader'));
    expect(preloader).toContain('loading="eager"');
    expect(preloader).toContain('fetchPriority="low"');
  });

  it('the preloader mounts only after page load, and only for a live pane', () => {
    expect(TSX).toContain('{preloadArmed && preloadItems.length > 0 && (');
    expect(TSX).toMatch(/if \(preloadArmed \|\| paused\) return;/);
    expect(TSX).toMatch(/document\.readyState === "complete"/);
  });
});
