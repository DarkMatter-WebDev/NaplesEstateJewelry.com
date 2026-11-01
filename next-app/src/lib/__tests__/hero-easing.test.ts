import { describe, expect, it } from 'vitest';

// Mirrors HomeHeroStack's two curves. Kept here rather than exported from the
// component because that module is a client component with DOM-side effects;
// these are pure math and the invariants are what matter.
const ease = (t: number) => t * t * (3 - 2 * t);
const easeSnap = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

const CURVES = { smoothstep: ease, smootherstep: easeSnap };

describe('hero crossing curves', () => {
  // The resting/flush/locked positions, the inert-live thresholds, and the CSS
  // resting transforms all assume these land exactly. A curve that returns
  // 0.9999 at t=1 leaves a pane a fraction off its lock forever.
  it.each(Object.entries(CURVES))('%s has exact endpoints', (_name, curve) => {
    expect(curve(0)).toBe(0);
    expect(curve(1)).toBe(1);
  });

  it.each(Object.entries(CURVES))('%s is monotonic across the crossing', (_name, curve) => {
    let prev = -Infinity;
    for (let t = 0; t <= 1.0000001; t += 0.005) {
      const v = curve(Math.min(t, 1));
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it.each(Object.entries(CURVES))('%s stays inside [0,1]', (_name, curve) => {
    for (let t = 0; t <= 1.0000001; t += 0.005) {
      const v = curve(Math.min(t, 1));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it.each(Object.entries(CURVES))('%s is symmetric about the midpoint', (_name, curve) => {
    for (let t = 0; t <= 0.5; t += 0.01) {
      expect(curve(t) + curve(1 - t)).toBeCloseTo(1, 10);
    }
  });

  // The point of the touch curve: hold longer at the ends, cross faster in the
  // middle. That difference IS the "snap".
  it('smootherstep holds nearer its endpoints than smoothstep', () => {
    expect(easeSnap(0.15)).toBeLessThan(ease(0.15));
    expect(easeSnap(0.85)).toBeGreaterThan(ease(0.85));
  });

  it('smootherstep crosses faster mid-scroll', () => {
    const slope = (curve: (t: number) => number, t: number) =>
      (curve(t + 1e-4) - curve(t - 1e-4)) / 2e-4;
    expect(slope(easeSnap, 0.5)).toBeCloseTo(1.875, 3);
    expect(slope(ease, 0.5)).toBeCloseTo(1.5, 3);
    expect(slope(easeSnap, 0.5)).toBeGreaterThan(slope(ease, 0.5));
  });

  // Zero velocity at both ends is what stops a pane hitting a dead stop; the
  // touch curve additionally has zero ACCELERATION there, which is why it
  // settles rather than drifts.
  it.each(Object.entries(CURVES))('%s has zero velocity at both ends', (_name, curve) => {
    const slope = (t: number) => (curve(t + 1e-5) - curve(t)) / 1e-5;
    expect(Math.abs(slope(0))).toBeLessThan(1e-3);
    expect(Math.abs((curve(1) - curve(1 - 1e-5)) / 1e-5)).toBeLessThan(1e-3);
  });

  it('smootherstep also has zero acceleration at both ends, smoothstep does not', () => {
    const accel = (curve: (t: number) => number, t: number) =>
      (curve(t + 1e-3) - 2 * curve(t) + curve(t - 1e-3)) / 1e-6;
    expect(Math.abs(accel(easeSnap, 0.002))).toBeLessThan(1);
    expect(Math.abs(accel(ease, 0.002))).toBeGreaterThan(1);
  });
});
