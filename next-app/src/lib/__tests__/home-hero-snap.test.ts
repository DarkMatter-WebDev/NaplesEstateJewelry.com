import { describe, expect, it } from 'vitest';
import {
  nextHeroSnapPoint,
  paneBOffsetPercent,
  resolveHeroSnapPoints,
  type HeroPhaseGeometry,
} from '@/lib/home-hero-snap';

// Mirrors HomeHeroStack's live constants and its two curves.
const smoothstep = (t: number) => t * t * (3 - 2 * t);
const smootherstep = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

const TOUCH: HeroPhaseGeometry = {
  phase1End: 0.61,
  phase2Start: 0.39,
  phase2End: 1,
  paneATravel: 85,
  ease: smootherstep,
};
const POINTER: HeroPhaseGeometry = { ...TOUCH, ease: smoothstep };

describe('paneBOffsetPercent', () => {
  it('is parked one full frame below at rest and gone by the end', () => {
    expect(paneBOffsetPercent(0, TOUCH)).toBeCloseTo(100, 6);
    expect(paneBOffsetPercent(1, TOUCH)).toBeCloseTo(-TOUCH.paneATravel, 6);
  });

  it('decreases strictly, which is what makes the bisection sound', () => {
    let previous = Infinity;
    for (let i = 0; i <= 200; i += 1) {
      const value = paneBOffsetPercent(i / 200, TOUCH);
      expect(value).toBeLessThan(previous);
      previous = value;
    }
  });
});

describe('resolveHeroSnapPoints', () => {
  it('pins A at the start and C at the end', () => {
    const [a, , c] = resolveHeroSnapPoints(TOUCH);
    expect(a).toBe(0);
    expect(c).toBe(1);
  });

  it('puts B exactly flush at its snap point', () => {
    const [, b] = resolveHeroSnapPoints(TOUCH);
    // Sub-0.01% of frame height — far finer than a pixel on any real viewport.
    expect(Math.abs(paneBOffsetPercent(b, TOUCH))).toBeLessThan(0.01);
  });

  it('lands B inside the overlap band, where both crossings are live', () => {
    const [, b] = resolveHeroSnapPoints(TOUCH);
    expect(b).toBeGreaterThan(TOUCH.phase2Start);
    expect(b).toBeLessThan(TOUCH.phase1End);
  });

  it('tracks the curve — the two pointer modes flush at different progress', () => {
    const [, touchB] = resolveHeroSnapPoints(TOUCH);
    const [, pointerB] = resolveHeroSnapPoints(POINTER);
    expect(Math.abs(paneBOffsetPercent(pointerB, POINTER))).toBeLessThan(0.01);
    // Using the wrong curve's snap point would leave B visibly off flush.
    expect(touchB).not.toBeCloseTo(pointerB, 3);
  });

  it('tracks the constants — a retune moves the snap point with it', () => {
    const retuned = { ...TOUCH, paneATravel: 100 };
    const [, b] = resolveHeroSnapPoints(retuned);
    expect(Math.abs(paneBOffsetPercent(b, retuned))).toBeLessThan(0.01);
  });
});

describe('nextHeroSnapPoint', () => {
  const points = resolveHeroSnapPoints(TOUCH);
  const [a, b, c] = points;

  it('steps forward one slideshow at a time', () => {
    expect(nextHeroSnapPoint(points, a, 1)).toBe(b);
    expect(nextHeroSnapPoint(points, b, 1)).toBe(c);
  });

  it('steps back one slideshow at a time', () => {
    expect(nextHeroSnapPoint(points, c, -1)).toBe(b);
    expect(nextHeroSnapPoint(points, b, -1)).toBe(a);
  });

  it('returns null at each end so the visitor scrolls out of the hero normally', () => {
    expect(nextHeroSnapPoint(points, c, 1)).toBeNull();
    expect(nextHeroSnapPoint(points, a, -1)).toBeNull();
  });

  it('caps a hard fling at ONE slideshow regardless of how far it travelled', () => {
    // The gesture began at rest; the finger flung most of the runway before
    // lifting. Stepping from the START position is what stops that landing on C.
    expect(nextHeroSnapPoint(points, 0, 1)).toBe(b);
    expect(nextHeroSnapPoint(points, 0, 1)).not.toBe(c);
  });

  it('steps from wherever the gesture began, not from the nearest point', () => {
    // p=0.30 is nearer to B than to A, but a downward gesture must still only
    // reach B — and an upward one must return to A, not overshoot past it.
    expect(nextHeroSnapPoint(points, 0.3, 1)).toBe(b);
    expect(nextHeroSnapPoint(points, 0.3, -1)).toBe(a);
  });

  it('ignores a point it is already sitting on, within epsilon', () => {
    expect(nextHeroSnapPoint(points, b + 0.01, 1)).toBe(c);
    expect(nextHeroSnapPoint(points, b - 0.01, -1)).toBe(a);
  });
});
