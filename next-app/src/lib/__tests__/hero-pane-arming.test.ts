import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// 2026-11-18, measured on the owner's iPhone with ?heroDebug=1: Safari has no
// requestIdleCallback, so the old fixed timers mounted slideshow B at 2.5 s
// (53 ms frame) and C 0.3 s later (59 ms frame) mid-spin — the "double
// stutter" at the first transition. Safari now mounts B at pane A's reveal and
// C right behind it, inside the fade-in's invisible 260 ms delay.

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const STACK = read('src/components/home/HomeHeroStack.tsx');
const HERO = read('src/components/home/HomeHero.tsx');

describe('hero slideshow arming on Safari (no requestIdleCallback)', () => {
  it('never mounts B on a fixed mid-spin timer again', () => {
    expect(STACK).not.toMatch(/setTimeout\(arm, 2500\)/);
    expect(STACK).toMatch(/\} else if \(paneAReady\) \{[\s\S]{0,900}?window\.setTimeout\(arm, 0\)/);
    expect(STACK).toContain('onReady={markPaneAReady}');
    // Chrome/desktop path unchanged.
    expect(STACK).toContain('window.requestIdleCallback(arm, { timeout: 2500 })');
  });

  it("C follows B inside pane A's invisible fade-in delay", () => {
    const after = Number(STACK.match(/const SAFARI_ARM_C_AFTER_B_MS = (\d+);/)?.[1]);
    const delay = Number(HERO.match(/animation: home-carousel-fade-in \d+ms ease (\d+)ms both;/)?.[1]);
    expect(delay).toBeGreaterThan(0); // positive control: the fade-in rule was found
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(delay);
    expect(STACK).toContain('window.setTimeout(armC, SAFARI_ARM_C_AFTER_B_MS)');
  });

  it('HomeHero reports its reveal exactly once', () => {
    expect(HERO).toContain('onReady?: () => void;');
    expect(HERO).toMatch(/if \(!heroReady \|\| reportedReadyRef\.current\) return;\s*reportedReadyRef\.current = true;\s*onReadyRef\.current\?\.\(\);/);
  });
});
