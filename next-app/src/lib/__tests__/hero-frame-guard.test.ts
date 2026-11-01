import { describe, expect, it } from 'vitest';
import {
  createFrameGuard,
  parseHeroFreezeOverride,
  type FrameGuard,
} from '@/lib/hero-frame-guard';

/**
 * Feed `count` frames at a fixed `delta`, starting from `from`.
 * Returns [tripped, lastTimestamp].
 */
function feed(guard: FrameGuard, from: number, count: number, delta: number): [boolean, number] {
  let now = from;
  let tripped = false;
  for (let i = 0; i < count; i++) {
    now += delta;
    tripped = guard.frame(now);
  }
  return [tripped, now];
}

describe('createFrameGuard', () => {
  it('never trips on a healthy 60fps stream', () => {
    const guard = createFrameGuard();
    guard.frame(0);
    // ~33s of 16.7ms frames, far past warm-up and many full windows.
    const [tripped] = feed(guard, 0, 2000, 16.7);
    expect(tripped).toBe(false);
  });

  it('never trips on an honest 30Hz display (~33ms)', () => {
    const guard = createFrameGuard();
    guard.frame(0);
    const [tripped] = feed(guard, 0, 1000, 33.4);
    expect(tripped).toBe(false);
  });

  it('trips on a sustained slow stream and stays tripped', () => {
    const guard = createFrameGuard();
    guard.frame(0);
    // 50ms frames: warm-up covers the first 4000ms (80 frames), then a
    // 60-frame window of slow deltas must trip it.
    const [tripped, last] = feed(guard, 0, 200, 50);
    expect(tripped).toBe(true);
    // Latch: healthy frames afterwards do not un-trip it.
    const [still] = feed(guard, last, 100, 16.7);
    expect(still).toBe(true);
  });

  it('ignores jank that happens entirely inside the warm-up window', () => {
    const guard = createFrameGuard();
    guard.frame(0);
    // 3.9s of terrible frames (inside the 4000ms warm-up)...
    const [, afterWarmup] = feed(guard, 0, 39, 100);
    // ...then a healthy stream.
    const [tripped] = feed(guard, afterWarmup, 1000, 16.7);
    expect(tripped).toBe(false);
  });

  it('discards gap deltas instead of recording them as slow frames', () => {
    const guard = createFrameGuard();
    guard.frame(0);
    let [, now] = feed(guard, 0, 300, 16.7); // past warm-up, healthy
    // Repeated 1s suspensions (hidden tab, paused pane) between healthy runs.
    for (let i = 0; i < 10; i++) {
      guard.frame(now + 1000);
      [, now] = feed(guard, now + 1000, 30, 16.7);
    }
    const [tripped] = feed(guard, now, 120, 16.7);
    expect(tripped).toBe(false);
  });

  it('is robust to a minority of slow frames (median, not mean)', () => {
    const guard = createFrameGuard();
    guard.frame(0);
    let now = 0;
    let tripped = false;
    // Past warm-up first.
    [, now] = feed(guard, now, 300, 16.7);
    // 25% of frames at 150ms would wreck a mean; the median stays healthy.
    for (let i = 0; i < 400; i++) {
      now += i % 4 === 0 ? 150 : 16.7;
      tripped = guard.frame(now);
    }
    expect(tripped).toBe(false);
  });

  it('does not trip when the median sits exactly on the threshold', () => {
    const guard = createFrameGuard({ thresholdMs: 40 });
    guard.frame(0);
    const [tripped] = feed(guard, 0, 500, 40);
    expect(tripped).toBe(false);
  });

  it('respects custom threshold and window options', () => {
    const guard = createFrameGuard({ thresholdMs: 20, windowSize: 10, warmupMs: 0 });
    guard.frame(0);
    const [tripped] = feed(guard, 0, 12, 25);
    expect(tripped).toBe(true);
  });
});

describe('parseHeroFreezeOverride', () => {
  it('parses the force flag', () => {
    expect(parseHeroFreezeOverride('?heroFreeze=1')).toBe('force');
    expect(parseHeroFreezeOverride('heroFreeze=1')).toBe('force');
  });

  it('parses the off flag', () => {
    expect(parseHeroFreezeOverride('?heroFreeze=0')).toBe('off');
  });

  it('returns null for absent or unrelated params', () => {
    expect(parseHeroFreezeOverride('')).toBe(null);
    expect(parseHeroFreezeOverride('?utm_source=x')).toBe(null);
    expect(parseHeroFreezeOverride('?heroFreeze=2')).toBe(null);
  });
});
