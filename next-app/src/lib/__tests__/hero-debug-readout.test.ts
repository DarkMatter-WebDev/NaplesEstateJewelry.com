import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// 2026-11-18: hidden `?heroDebug=1` readout for an iPhone-only hero stutter.
// It must stay invisible and free for normal visitors, and keep its data on
// the phone (the owner copies the report by hand).

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const STACK = read('src/components/home/HomeHeroStack.tsx');
const READOUT = read('src/components/home/HeroDebugReadout.tsx');

describe('hero debug readout', () => {
  it('is code-split and only mounted for ?heroDebug=1, never on the server', () => {
    expect(STACK).toContain("dynamic(() => import('./HeroDebugReadout'), { ssr: false })");
    expect(STACK).toContain(".get('heroDebug') === '1'");
    expect(STACK).toContain('const readHeroDebugOnServer = () => false;');
    expect(STACK).toContain('{heroDebug && <HeroDebugReadout />}');
    // Nothing else imports it statically (that would put it in every visitor's bundle).
    expect(STACK).not.toMatch(/import HeroDebugReadout/);
  });

  it('never sends anything off the phone', () => {
    expect(READOUT).not.toMatch(/\bfetch\(|sendBeacon|XMLHttpRequest|localStorage\.setItem/);
  });

  it('stops itself (fixed recording window, everything torn down)', () => {
    expect(READOUT).toMatch(/const RECORD_MS = 30_000;/);
    expect(READOUT).toContain('cancelAnimationFrame(raf)');
    expect(READOUT).toContain("document.removeEventListener('load', onLoad, true)");
  });
});
