import { describe, expect, it } from 'vitest';
import {
  VIEWPORT_CHROME_TOLERANCE_PX,
  isLayoutAffectingResize,
} from '../viewport-resize';

const size = (width: number, height: number) => ({ width, height });

describe('isLayoutAffectingResize', () => {
  it('ignores a toolbar-sized height change', () => {
    // Instagram's in-app browser: ~60px of chrome sliding away mid-scroll.
    expect(isLayoutAffectingResize(size(390, 844), size(390, 784))).toBe(false);
    expect(isLayoutAffectingResize(size(390, 784), size(390, 844))).toBe(false);
  });

  it('ignores the largest plausible mobile chrome', () => {
    expect(isLayoutAffectingResize(size(390, 844), size(390, 844 - 120))).toBe(false);
  });

  it('reacts to any width change, however small', () => {
    expect(isLayoutAffectingResize(size(390, 844), size(391, 844))).toBe(true);
  });

  it('reacts to a rotation', () => {
    expect(isLayoutAffectingResize(size(390, 844), size(844, 390))).toBe(true);
  });

  it('reacts to a height change beyond any toolbar — e.g. a keyboard', () => {
    expect(isLayoutAffectingResize(size(390, 844), size(390, 844 - 320))).toBe(true);
  });

  it('treats an identical size as nothing to do', () => {
    expect(isLayoutAffectingResize(size(390, 844), size(390, 844))).toBe(false);
  });

  it('puts the boundary exactly at the tolerance, exclusive', () => {
    const h = 844;
    const atTolerance = h - VIEWPORT_CHROME_TOLERANCE_PX;
    expect(isLayoutAffectingResize(size(390, h), size(390, atTolerance))).toBe(false);
    expect(isLayoutAffectingResize(size(390, h), size(390, atTolerance - 1))).toBe(true);
  });

  it('honours a caller-supplied tolerance', () => {
    expect(isLayoutAffectingResize(size(390, 844), size(390, 800), 10)).toBe(true);
    expect(isLayoutAffectingResize(size(390, 844), size(390, 800), 100)).toBe(false);
  });

  // The anchor semantics that onLayoutAffectingResize relies on. Comparing each
  // event to the LAST SEEN size would make both of these wrong: oscillation
  // would be fine, but a slow drag-resize would creep past unnoticed.
  it('absorbs toolbar oscillation when measured from a fixed anchor', () => {
    const anchor = size(390, 844);
    for (const h of [784, 844, 790, 844, 800]) {
      expect(isLayoutAffectingResize(anchor, size(390, h))).toBe(false);
    }
  });

  it('still catches a slow drift once it clears the tolerance from the anchor', () => {
    const anchor = size(1200, 900);
    // Each individual step is tiny; what matters is the distance from the anchor.
    expect(isLayoutAffectingResize(anchor, size(1200, 890))).toBe(false);
    expect(isLayoutAffectingResize(anchor, size(1200, 800))).toBe(false);
    expect(isLayoutAffectingResize(anchor, size(1200, 700))).toBe(true);
  });
});
