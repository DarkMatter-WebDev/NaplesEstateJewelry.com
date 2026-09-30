import { describe, expect, it } from 'vitest';
import {
  HORIZONTAL_LOCK_BIAS,
  HORIZONTAL_TRIGGER_PX,
  SWIPE_ADVANCE_MIN_PX,
  VERTICAL_TRIGGER_PX,
  resolveSwipeAxis,
  swipeAdvanceThresholdPx,
} from '@/lib/photo-swipe';

describe('photo swipe — axis arbitration', () => {
  it('locks horizontal on a small sideways move', () => {
    expect(resolveSwipeAxis(5, 0)).toBe('h');
    expect(resolveSwipeAxis(-5, 0)).toBe('h');
  });

  // The reported bug, twice over (owner 2026-08-09 and 2026-08-17): a thumb
  // swiping across a phone arcs, so the first pixels carry real vertical drift.
  // Under the old symmetric test these locked 'v' and the swipe was dead.
  it('locks horizontal despite the vertical drift of a real thumb swipe', () => {
    expect(resolveSwipeAxis(6, 6)).toBe('h');
    expect(resolveSwipeAxis(6, 9)).toBe('h');   // drift 1.5x the sideways travel
    expect(resolveSwipeAxis(-6, 9)).toBe('h');
  });

  // The heart of the fix. A gesture that has not yet proven itself either way
  // must stay UNDECIDED rather than defaulting to a scroll, because conceding
  // early is unrecoverable — the browser starts scrolling and never gives the
  // gesture back.
  it('stays undecided while the evidence is weak, instead of conceding', () => {
    expect(resolveSwipeAxis(2, 5)).toBeNull();
    expect(resolveSwipeAxis(0, 6)).toBeNull();
    expect(resolveSwipeAxis(3, 3)).toBeNull();
  });

  it('an undecided gesture can still resolve horizontal once it commits', () => {
    // Same gesture, a few frames later: it started arcing down and then went
    // sideways. This is the swipe the old code threw away.
    expect(resolveSwipeAxis(2, 5)).toBeNull();
    expect(resolveSwipeAxis(8, 7)).toBe('h');
  });

  it('locks vertical only once the drag is clearly a scroll', () => {
    expect(resolveSwipeAxis(0, VERTICAL_TRIGGER_PX)).toBe('v');
    expect(resolveSwipeAxis(2, 20)).toBe('v');
    // Just short of the trigger is still undecided, not vertical.
    expect(resolveSwipeAxis(0, VERTICAL_TRIGGER_PX - 1)).toBeNull();
  });

  it('leaves a genuine page scroll to the browser', () => {
    // Straight down the screen: never horizontal at any distance.
    for (const dy of [12, 25, 60, 200]) {
      expect(resolveSwipeAxis(0, dy)).toBe('v');
      expect(resolveSwipeAxis(1, dy)).toBe('v');
    }
  });

  it('requires vertical to beat the horizontal bias, not merely exceed dx', () => {
    // 14 down against 10 across is more vertical than horizontal, but well
    // inside the ~58 degree cone, so it is a swipe.
    expect(resolveSwipeAxis(10, 14)).toBe('h');
    // 30 down against 10 across is not.
    expect(resolveSwipeAxis(10, 30)).toBe('v');
  });

  it('keeps vertical harder to trigger than horizontal', () => {
    // The asymmetry IS the fix; a future tune that equalises them reinstates
    // the original bug.
    expect(VERTICAL_TRIGGER_PX).toBeGreaterThan(HORIZONTAL_TRIGGER_PX);
    expect(HORIZONTAL_LOCK_BIAS).toBeGreaterThan(1);
  });
});

describe('photo swipe — advance threshold', () => {
  it('uses the floor on a narrow card', () => {
    // A 166px shop card: the proportional share is below the floor.
    expect(swipeAdvanceThresholdPx(166)).toBe(SWIPE_ADVANCE_MIN_PX);
  });

  it('scales with a wide frame', () => {
    // A 576px tablet gallery.
    expect(swipeAdvanceThresholdPx(576)).toBeCloseTo(46.08, 2);
  });

  it('never asks for more travel than the old gallery floor of 40px', () => {
    // The gallery used to demand 40px before advancing, on top of 10px just to
    // lock the axis. A phone-width frame must now be easier than that.
    expect(swipeAdvanceThresholdPx(344)).toBeLessThan(40);
  });

  it('is stable at zero width rather than returning 0', () => {
    // getBoundingClientRect can report 0 before layout; the floor must hold or
    // any twitch would count as a swipe.
    expect(swipeAdvanceThresholdPx(0)).toBe(SWIPE_ADVANCE_MIN_PX);
  });
});
