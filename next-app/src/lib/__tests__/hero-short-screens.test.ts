import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guard for the homepage hero on short screens (2026-09-13). Every limit here was
// measured with a sweep of the live page across widths and heights; the rules
// that make those measurements hold are easy to "tidy" away, so they are pinned.
// Rationale: DECISIONS, "The homepage headline shrinks in place on a short
// window", "A hero too short to fit goes compact" and "The hero keeps a minimum
// height on the tiniest windows".

const HOME = join(process.cwd(), 'src', 'components', 'home');
const read = (path: string) => readFileSync(path, 'utf8');
const overlay = read(join(HOME, 'HomeHeroOverlay.tsx'));
const stack = read(join(HOME, 'HomeHeroStack.tsx'));
const form = read(join(HOME, 'HomeSubscriberForm.tsx'));
const globals = read(join(process.cwd(), 'src', 'app', 'globals.css'));

describe('hero minimum height (option 2)', () => {
  it('keeps a page-level copy of the viewport token for the hero to read', () => {
    // The hero redefines --app-vh for its subtree; without this copy the
    // definition would reference itself and be invalid.
    expect(globals).toContain('--app-vh-page: var(--app-vh);');
  });

  it('floors the token inside the hero only', () => {
    expect(stack).toContain('--app-vh: max(var(--app-vh-page), var(--hero-min-vh));');
  });

  it('collapses BOTH runways to no travel below the minimum', () => {
    const zeroSwitch = 'max(0px, (var(--app-vh-page) - var(--hero-min-vh) + 1px) * 100000)';
    expect(stack).toContain(`min(var(--app-vh) * 2.4, ${zeroSwitch})`);
    expect(stack).toContain(`min(var(--app-vh) * 2.1, ${zeroSwitch})`);
  });

  it('settles on slideshow A when the runway has no travel', () => {
    // A bare early return would leave a crossing's transforms on screen after a
    // window shrinks below the minimum mid-scroll.
    expect(stack).toMatch(/if \(travel <= 0\) \{\s*settleOnPaneA\(\);\s*return;\s*\}/);
    expect(stack).toMatch(/if \(reduceMotion\.matches\) \{\s*settleOnPaneA\(\);\s*return;\s*\}/);
  });
});

describe('compact hero', () => {
  it('queries the overlay height, never the live window height', () => {
    // A mobile toolbar changes the window height mid-scroll; the overlay height
    // comes from the frozen token. A height media query would flip modes while
    // the visitor scrolls.
    for (const source of [overlay, stack]) {
      expect(source).not.toMatch(/@media[^{]*\((?:max|min)-height/);
    }
    expect(overlay).toContain('container-name: hero-overlay;');
    expect(overlay).toContain('@container hero-overlay (max-height: ${band.maxHeroHeight}px)');
  });

  it('keeps the measured hero-height limits, one table per headline language', () => {
    expect(overlay).toContain('(isEs ? COMPACT_BANDS_ES : COMPACT_BANDS_EN).map(compactBandCss)');
    // Re-measured 2026-09-15 for the one-button sign-up block (CHANGELOG 2026-09-15).
    for (const limit of [393, 373, 353, 318, 328, 388, 392]) {
      expect(overlay).toContain(`maxHeroHeight: ${limit},`);
    }
    for (const old of [600, 580, 560, 540, 520, 498, 478, 398, 460]) {
      expect(overlay).not.toContain(`maxHeroHeight: ${old},`);
    }
  });

  it('styles the sign-up block through its class hooks', () => {
    // Since 2026-09-15 the block is the caption and ONE "Join the List" button
    // (the fields live in HomeSubscribeModal), so these are the only hooks.
    for (const hook of ['home-subscriber-label', 'home-subscriber-join']) {
      expect(form).toContain(hook);
      expect(overlay).toContain(`.${hook}`);
    }
    for (const gone of ['home-subscriber-fields', 'home-subscriber-input', 'home-subscriber-privacy']) {
      expect(form).not.toContain(gone);
      expect(overlay).not.toContain(gone);
    }
  });

  it('loads the sign-up window on the tap, never with the homepage', () => {
    // The window must not join the hero's first paint / LCP path.
    expect(form).toMatch(/dynamic\(\(\) => import\('\.\/HomeSubscribeModal'\), \{ ssr: false \}\)/);
    expect(form).toContain('{open && <HomeSubscribeModal');
  });
});
