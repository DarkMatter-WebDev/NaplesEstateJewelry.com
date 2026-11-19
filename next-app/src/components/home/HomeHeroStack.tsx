'use client';

// Scroll-pinned hero stack. The page appears to stand still while the user
// scrolls: a sticky, overflow-hidden frame pins the hero below the header, and
// scroll progress drives the slideshow layers inside it. Only the SLIDESHOWS
// move. There are THREE of them and they hand over in sequence: A slides UP and
// away while B RISES FROM BELOW to take its place, and B is already sliding up
// and away while C rises behind it — the two crossings OVERLAP, so the hero
// never stops moving mid-handover. C holds until the runway ends.
// EVERYTHING travels upward, so the hero reads as one continuous scroll
// (owner request 2026-08-06 — this replaced an arrangement where arriving panes
// descended from above; do not restore that from older comments elsewhere).
// The headline, sign-up form, and CTA buttons live in a separate, pinned overlay
// layer that stays exactly where it is throughout. When the runway ends the
// sticky frame (slideshows + overlay together) releases and scrolls away
// naturally with the rest of the page.
//
// The arriving pane slightly OVERLAPS the departing one (PANE_A_TRAVEL below
// 100), and both crossings are EASED, so a pane decelerates into its lock rather
// than stopping dead. Both are load-bearing for how the handover reads — see
// those constants.
//
// Transforms are written imperatively per scroll frame (no React re-renders).
// A slideshow pane is `inert` only while it is fully offscreen, so exactly the
// visible ring's cards are clickable — and it is also `paused` then, which stops
// its carousel's ring animation and per-frame sampler (the carousel's own
// IntersectionObserver cannot detect this inside the pinned frame). The
// overlay's light/dark text theme follows whichever slideshow currently
// dominates the frame. prefers-reduced-motion collapses the runway to the frame
// height via CSS — no travel, no pin, panes B and C hidden — restoring the
// original static hero.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import HomeHero from './HomeHero';
import HomeHeroOverlay from './HomeHeroOverlay';
import {
  type CarouselItem,
  type CarouselSettings,
} from '../../../carousel/lib/carouselData';
import { DEFAULT_BG } from '../../../carousel/lib/carouselConfig';

// Hidden frame-timing readout, ONLY for `?heroDebug=1` (2026-11-18, measuring
// an iPhone-only stutter). Code-split: normal visitors never download it.
// Server snapshot is always false, so the HTML never differs (no hydration skew).
const HeroDebugReadout = dynamic(() => import('./HeroDebugReadout'), { ssr: false });
const subscribeNever = () => () => {};
const readHeroDebug = () => new URLSearchParams(window.location.search).get('heroDebug') === '1';
const readHeroDebugOnServer = () => false;

// Safari slideshow arming (no requestIdleCallback there) — see the arm effects.
const SAFARI_ARM_C_AFTER_B_MS = 150;
const SAFARI_ARM_FALLBACK_MS = 4000;
import { nextHeroSnapPoint, resolveHeroSnapPoints } from '@/lib/home-hero-snap';
import { onLayoutAffectingResize } from '@/lib/viewport-resize';

type Props = {
  locale: string;
  initialItems: CarouselItem[];
  /**
   * Curated lineup for slideshow B. Empty means B mirrors slideshow A
   * (identical lineup), which is also the pre-migration behavior.
   */
  initialAltItems?: CarouselItem[];
  /** Same contract as initialAltItems, for slideshow C. */
  initialThirdItems?: CarouselItem[];
  initialSettings: CarouselSettings;
  /**
   * Announcement strip rendered INSIDE the pinned frame, above the slideshows
   * (owner, 2026-08-11: "make it so this banner doesn't scroll away until the
   * hero txt does").
   *
   * It lives here rather than above the hero in page flow precisely so the
   * release timing needs no arithmetic: it is part of the same sticky element
   * as the overlay text, so it unpins on exactly the same frame, by
   * construction. Any approach that kept it a separate sticky element would
   * have to keep two release points in sync forever.
   *
   * Server-rendered content passed down from the page, so it stays out of this
   * client bundle.
   */
  banner?: ReactNode;
};

// The runway is walked as two OVERLAPPING crossings and nothing else, as
// fractions of its scroll distance:
//   0             -> PHASE_1_END   crossing A -> B
//   PHASE_2_START -> PHASE_2_END   crossing B -> C  (starts BEFORE the first ends)
// The two crossings share the band PHASE_2_START..PHASE_1_END, during which both
// clocks run.
//
// There is NO hold anywhere, including at the end: PHASE_2_END is exactly 1, so
// C reaches flush on the same frame the runway ends and the sticky frame
// unpins (owner, 2026-08-06: no pause at the third carousel before scrolling on).
// That also means C's ease-out and the page starting to scroll away coincide, so
// on-screen motion is continuous — as C's own travel decelerates to zero the
// whole frame begins moving instead.
//
// NOTE the phases OVERLAP: PHASE_2_START is BEFORE PHASE_1_END, so the
// second crossing is already under way while the first finishes. That is
// deliberate (owner, 2026-08-06: "overlap the crossings so it never stops").
// There is no hold between them at all — B sweeps through flush rather than
// resting there, and the frame is never motionless mid-hero.
//
// TWO INVARIANTS, both fixed 2026-08-06 after the owner reported the handovers
// feeling uneven and still slightly paused.
//
// 1. THE CROSSINGS MUST BE THE SAME LENGTH. They were 0.47 and 0.54 — crossing
//    two ran 15% longer, so the two handovers moved at different speeds and the
//    spacing between slideshows visibly changed from one to the next ("dynamic
//    distance between the first, second and third"). Equal lengths make every
//    handover identical.
//
// 2. THE OVERLAP RATIO SETS HOW MUCH THE MOTION DIPS AT THE HANDOVER, and the
//    reason is not obvious: smoothstep's derivative is ZERO AT BOTH ENDS. Butting
//    the crossings would hand over from a term decelerating to zero to one
//    accelerating from zero, so the velocity still touches nothing. Overlapping
//    fixes that, but only as far as the ratio allows — at 0.20 the incoming
//    crossing is still on the flat part of its curve (slope 0.97 of a possible
//    1.50, ~65%) and the dip was still perceptible. At 0.36 it is 1.38/1.50,
//    ~92%, so the handover barely slows at all.
//
// Keep `(PHASE_1_END - PHASE_2_START) / (PHASE_2_END - PHASE_2_START)` near 0.36
// and both crossing lengths equal. Raising the ratio further starts the next
// slideshow before the current one has really arrived; lowering it brings the
// pause back.
// Solved, not guessed: pinning PHASE_2_END at 1 while holding both invariants
// (equal crossing lengths L, overlap ratio 0.36) gives L = 1/1.64 = 0.61, hence
// PHASE_1_END = 0.61 and PHASE_2_START = 1 - 0.61 = 0.39. Overlap 0.22, ratio
// 0.361, handover slope 1.38/1.50 = 92%. Re-solve the same way if the ratio or
// the end point ever move.
const PHASE_1_END = 0.61;
const PHASE_2_START = 0.39;
const PHASE_2_END = 1;

// How far the DEPARTING pane travels, as a percentage of one frame height, over
// the same scroll in which the arriving pane travels exactly 100%. The arriving
// travel is FIXED — offscreen at rest, exactly flush when it locks — so this
// constant is the only control over the seam.
//
// The seam is `t * (PANE_A_TRAVEL - 100)`:
//   > 100  departing pane outruns the arriving one, leaving a real GAP of open
//          frame between them (the backdrop shows through).
//   = 100  they butt exactly, gap 0.
//   < 100  the arriving pane OVERLAPS the departing one.
//
// Lowered 100 -> 95 -> 85 across 2026-08-06 as the owner asked for the join to
// keep tightening ("I can see transitions"). At 85 the arriving pane overlaps
// the departing one by ~15% of a frame (~180px at 1200px).
//
// Two things that overlap buys, and both matter to how visible the join is:
//   - the arriving pane's feathered top edge fades over the departing pane's
//     REAL PHOTOGRAPH rather than out to backdrop, so there is no pale band;
//   - it guarantees the two panes genuinely share a band, which is what lets the
//     seam feathers (A_EXIT_DISSOLVE_PCT, B_ARRIVE_FEATHER_PCT) run wide enough
//     to stop the boundary reading as a line.
//
// The departing pane never clears the frame at 85 — it stops 15% short — which
// is only safe because the arriving pane is flush and higher in the stack by
// then. Frame coverage is verified across the whole runway after every change to
// this constant, never assumed.
const PANE_A_TRAVEL = 85;

/**
 * Smoothstep. Scroll progress is linear, so a pane driven by raw `t` moves at a
 * constant speed and then STOPS DEAD at its clamp — a velocity discontinuity the
 * eye reads as a jolt, which is most of what "it pauses" was. Easing lets each
 * pane accelerate away and decelerate into its locked position, so the crossing
 * hands over to the next crossing smoothly instead of hitting a stop.
 *
 * Endpoints are exact (0 -> 0, 1 -> 1), which matters: the resting and locked
 * positions, the inert/live thresholds, and the CSS resting transforms all
 * assume t=0 and t=1 land precisely.
 */
const ease = (t: number) => t * t * (3 - 2 * t);

/**
 * Smootherstep (quintic) — the TOUCH variant of the curve above.
 *
 * Same contract, same exact endpoints (0 -> 0, 1 -> 1), but its first AND second
 * derivatives are both zero at each end rather than just the first. Practically:
 * a pane sits at its locked position through a longer stretch of scroll, then
 * crosses faster in the middle (peak slope 1.875 vs smoothstep's 1.5). That
 * reads as each slideshow SNAPPING into place instead of drifting there.
 *
 * Touch only, on purpose (owner, 2026-08-08). A finger drag is ballistic — it
 * flings and decays — so the extra hold at the ends lands as a deliberate
 * settle. A mouse wheel arrives in fixed notches where the same curve reads as
 * sticky rather than snappy, so the pointer-fine path keeps smoothstep.
 */
const easeSnap = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/**
 * How long a touch snap takes to carry the hero one whole slideshow, in ms.
 *
 * THIS is the speed control for the handover a visitor actually sees on a
 * phone, not the runway. Once the snap is doing the scrolling, the panes move
 * one frame height over exactly this duration — the runway does not enter into
 * it, because the pane travel is fixed and only the scroll BUDGET changes.
 *
 * Raised 400ms -> 1000ms (owner, 2026-08-09: "way too fast, slow it down a
 * lot"). The old figure was not a chosen value at all: it fell out of a
 * pixel-based formula (distance x 0.85, capped at 700), so it also drifted with
 * viewport height. Turn this one number up for a statelier handover.
 */
const SNAP_STEP_MS = 1000;

/**
 * Progress covered by one full slideshow step, used to scale the duration above
 * for partial moves. A->B and B->C are each almost exactly half the runway, so
 * this is 0.5 rather than a measured constant per step.
 */
const FULL_STEP_PROGRESS = 0.5;

// Pull the carousel RINGS toward each other during a crossing, as a percent of
// frame height.
//
// The panes are full-frame and each ring sits centred in its own pane, so
// consecutive rings are inherently ~one frame apart however much the PANES
// overlap — the photos never get near each other. Measured: a ring box spans
// 14.9%-85.1% of the frame, so it is ~70% tall with ~15% of headroom either
// side, and two rings must be closer than 70% apart to overlay at all.
//
// A constant lift cannot get there. It is capped by that 15% of headroom — lift
// an arriving pane's ring any further and it pokes into frame while the pane is
// still parked below at rest — which bottoms out at ~75% separation, just short
// of touching.
//
// So the pull PEAKS MID-CROSSING and is zero at both ends: `4e(1 - e)` is 0 at
// e=0 and e=1, 1 at e=0.5. At rest and when locked the composition is exactly as
// designed and nothing peeks; only while a crossing is actually happening do the
// two rings lean toward each other. At 15 that closes the mid-crossing gap to
// ~62% — inside the ~70% ring height, so the photo bands genuinely overlay.
const RING_PULL_PCT = 15;
const ringPull = (e: number) => 4 * e * (1 - e) * RING_PULL_PCT;

// Fade a DEPARTING pane out over the tail of its exit.
//
// Why: the departing pane only travels PANE_A_TRAVEL (85%), so late in a
// crossing the part of it still inside the frame is its bottom ~15% — and its
// ring left the top of the frame long before, so that strip is EMPTY backdrop.
// Measured at p=0.50: pane A's bottom sat at 25.6% while pane B's top was still
// at 8%, leaving an 8%-tall band of blank black at the top of the frame, fully
// opaque. Against an arriving white slideshow that reads as a hard black bar
// rather than as a photograph leaving (owner, 2026-08-07).
//
// Fading the tail dissolves that band instead of sliding it out. It starts late
// so the overlap still does its job for most of the crossing: the arriving
// pane's feathered top edge blends over a SOLID photograph while it matters, and
// only the empty remainder fades.
// Raised 0.4 -> 0.65 -> 0.75 (owner, 2026-08-07: start it sooner so the leaving
// slideshow is nearly invisible by the time its empty tail is the only thing
// left). A LONGER tail means the fade STARTS EARLIER, so opacity is lower by the
// time the exposed strip appears: where the black bar used to sit it measures
// ~0.11, against 1.00 before any of this.
//
// The cost, accepted deliberately: the departing slideshow is already
// part-transparent mid-crossing while a third of it is still on screen (~0.42 at
// p=0.40), so the handover reads as a CROSSFADE rather than one layer sliding
// over another. That is the intended look now, not a bug. Much past this the
// outgoing slideshow starts dissolving while it is still the main thing on
// screen, which becomes a different effect rather than a cleaner version of this
// one.
// 2026-08-08: 0.75 was TOO MUCH, and the reason is worth keeping.
//
// Opacity applies to the WHOLE pane. Pane A's backdrop is pure black and the
// frame behind it is white, so a partly-transparent pane A does not read as
// "leaving" — it reads as a flat GRAY RECTANGLE. Measured mid-crossing at
// p=0.35: pane A still occupied 27% of the frame at opacity 0.36, compositing
// to a uniform rgb(163,163,163) with the carousel photos washed out inside it.
// Black fading over white passes through every gray on the way; no value of
// this constant avoids that, because the problem is that the fade is applied to
// an AREA rather than to an EDGE.
//
// So the dissolve moved to a spatial one (A_EXIT_DISSOLVE_PCT below) and this
// dropped back to 0.45, where it does the job it is actually good at: taking the
// last of the pane out at the very end. At p=0.35 pane A now sits at ~0.87
// opacity — reading as a photograph, not a smear — and the handover is carried
// by the gradient instead.
const FADE_TAIL = 0.45;
const exitOpacity = (e: number) => Math.min(1, Math.max(0, (1 - e) / FADE_TAIL));

// How far up from its own bottom edge a DEPARTING pane dissolves, in percent of
// pane height, at full exit.
//
// This is what replaced the whole-pane opacity fade. Because PANE_A_TRAVEL is
// 85, the departing pane is ALWAYS partly visible at the top of the frame during
// a crossing — it cannot leave on its own, it can only be covered as the
// arriving pane rises. So there is necessarily a band of it on screen, and the
// only question is whether that band ends in a LINE or a GRADIENT.
//
// Sized to reach comfortably PAST the arriving pane's top edge. The gap between
// them is `15 * e` percent of pane height (that is the overlap PANE_A_TRAVEL=85
// provides), so at e=0.61 the feather needs to exceed ~9% just to touch the
// seam; 40 * e = 24% clears it and keeps ramping into the visible band above.
// Scaled by `e` so a pane AT REST is full-bleed with no mask at all.
const A_EXIT_DISSOLVE_PCT = 40;
const exitDissolve = (e: number) => e * A_EXIT_DISSOLVE_PCT;

// The ARRIVING pane's top feather, peaked mid-crossing.
//
// It used to be `(1 - e) * EDGE_FEATHER_PCT`, which shrinks as the crossing
// proceeds — widest when the arriving pane is barely on screen and narrowest
// mid-crossing, which is exactly backwards. Mid-crossing is when the seam is
// most exposed; measured at p=0.35 the feather had collapsed to ~2% of pane
// height (~25px) against a 326px band of high-contrast gray, which is why the
// owner saw a hard line there and not a blend.
//
// `4e(1-e)` peaks at e=0.5 and is zero at both ends, so a pane at rest or fully
// locked is still full-bleed. Safe to run much wider than the overlap here
// because what sits above the arriving pane's top edge for the whole crossing is
// the DEPARTING pane, not open frame — the condition the old clamp guarded
// against does not apply to this edge.
const B_ARRIVE_FEATHER_PCT = 14;
const arriveFeather = (e: number) => 4 * e * (1 - e) * B_ARRIVE_FEATHER_PCT;

/**
 * Offset a pane's inner hero (the ring + its swept background) against the
 * pane's own travel. Positive moves it DOWN. Guarded because a pane's hero is
 * only mounted once that slideshow is armed.
 */
function setRingPull(pane: HTMLElement, pct: number) {
  const hero = pane.firstElementChild as HTMLElement | null;
  if (!hero) return;
  hero.style.transform = Math.abs(pct) < 0.05 ? '' : `translate3d(0, ${pct.toFixed(3)}%, 0)`;
}
// The seam feathers used to be a single width clamped to the live overlap
// (EDGE_FEATHER_PCT / FEATHER_OVERLAP_SHARE / featherFor), on the invariant that
// "the feather must stay inside the overlap". That invariant was right for the
// era when arriving panes DESCENDED and could expose real uncovered frame, but
// it is what capped the join at a ~2-5% ramp — narrow enough to read as a line,
// which is exactly what the owner kept seeing.
//
// Now the two sides are sized independently and neither is clamped to the
// overlap, because the geometry that made the clamp necessary is gone: for the
// whole crossing the departing pane covers everything above the arriving pane's
// top edge, so a wide feather there lands on a photograph, never on backdrop.
// See A_EXIT_DISSOLVE_PCT and B_ARRIVE_FEATHER_PCT above.

/**
 * Whether a slideshow's solid background reads as dark, for the overlay's text
 * theme. Parses the hex and uses relative luminance rather than matching only
 * pure black, because the admin color picker accepts any hex. Non-hex values
 * (gradients cannot occur anymore; named colors are normalized upstream) fall
 * back to light, matching the historical default.
 */
function isDarkHex(color: string): boolean {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return false;
  const hex = match[1].length === 3 ? match[1].split('').map((c) => c + c).join('') : match[1];
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

/**
 * Fade one edge of a pane over `pct` percent of its height. A zero/negligible
 * width removes the mask entirely rather than painting a no-op gradient, so a
 * pane at rest or locked is genuinely full-bleed (a mask-image with an alpha
 * ramp of 0 still forces the element onto its own compositing layer).
 */
function setPaneMask(pane: HTMLElement, topPct: number, bottomPct: number) {
  const top = topPct > 0.1 ? topPct : 0;
  const bottom = bottomPct > 0.1 ? bottomPct : 0;
  if (top === 0 && bottom === 0) {
    pane.style.removeProperty('-webkit-mask-image');
    pane.style.removeProperty('mask-image');
    return;
  }
  // One gradient carrying BOTH edges. Written top-to-bottom: transparent at 0%,
  // opaque by `top`, opaque until `100 - bottom`, transparent at 100%. Either
  // ramp collapses to nothing when its width is 0, so this covers the
  // one-edge cases too.
  const mask = 'linear-gradient(to bottom, '
    + `transparent 0%, #000 ${top.toFixed(2)}%, `
    + `#000 ${(100 - bottom).toFixed(2)}%, transparent 100%)`;
  pane.style.setProperty('-webkit-mask-image', mask);
  pane.style.setProperty('mask-image', mask);
}

export default function HomeHeroStack({
  locale,
  initialItems,
  initialAltItems,
  initialThirdItems,
  initialSettings,
  banner,
}: Props) {
  const runwayRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const paneARef = useRef<HTMLDivElement>(null);
  const paneBRef = useRef<HTMLDivElement>(null);
  const paneCRef = useRef<HTMLDivElement>(null);

  // Each later slideshow's own curated lineup; an empty lineup mirrors A.
  const altItems = initialAltItems && initialAltItems.length > 0 ? initialAltItems : initialItems;
  const thirdItems = initialThirdItems && initialThirdItems.length > 0 ? initialThirdItems : initialItems;

  // One solid admin-chosen background per slideshow (2026-08-09, replacing the
  // per-photo sweep). These are STATIC for the life of the page, which is what
  // lets the overlay theme and the frame's crossing backdrop be derived up
  // front instead of reported per-frame by each pane. A lineup that MIRRORS A
  // still uses its own slideshow's color — the color belongs to the slideshow
  // slot, not the lineup (pre-migration all three read the same value anyway).
  const paneColors = {
    a: initialSettings.bgColor || DEFAULT_BG,
    b: initialSettings.bgColorAlt || initialSettings.bgColor || DEFAULT_BG,
    c: initialSettings.bgColorThird || initialSettings.bgColor || DEFAULT_BG,
  } as const;
  const paneDark = {
    a: isDarkHex(paneColors.a),
    b: isDarkHex(paneColors.b),
    c: isDarkHex(paneColors.c),
  } as const;

  // Lightweight start: the later slideshows are NOT mounted with the page. B
  // arms (and only then fetches/decodes its images and builds its ring) on the
  // first scroll intent, or during browser idle shortly after load — whichever
  // comes first. C waits longer still, arming only once the visitor has scrolled
  // far enough that its crossing is plausibly next (see armedC below), so a
  // visitor who never scrolls past the first hold never pays for it. Server HTML
  // and the first client render agree (nothing armed), so no hydration skew.
  const [armed, setArmed] = useState(false);
  const [armedC, setArmedC] = useState(false);
  const armedCRef = useRef(false);
  const heroDebug = useSyncExternalStore(subscribeNever, readHeroDebug, readHeroDebugOnServer);
  // Pane A's reveal (HomeHero onReady). Safari arms B/C on it — see below.
  const [paneAReady, setPaneAReady] = useState(false);
  const markPaneAReady = useCallback(() => setPaneAReady(true), []);

  // The overlay's text theme follows whichever slideshow currently dominates
  // the frame — each crossing hands over at its midpoint. With one solid color
  // per slideshow the per-pane themes are STATIC (paneDark above); only the
  // dominant pane changes with scroll. The latest-ref pattern keeps the scroll
  // effect (mounted once, empty deps) reading current values without
  // re-subscribing.
  const [overlayDark, setOverlayDark] = useState(paneDark.a);
  const dominantRef = useRef<'a' | 'b' | 'c'>('a');
  const paneColorsRef = useRef(paneColors);
  const paneDarkRef = useRef(paneDark);
  useEffect(() => {
    paneColorsRef.current = paneColors;
    paneDarkRef.current = paneDark;
  });

  // Which panes are actually on screen. The carousel's own IntersectionObserver
  // cannot work this out inside the pinned frame — every pane's box grazes the
  // viewport, so `isIntersecting` never flips (measured 2026-08-06: it returned
  // true for all three panes at every scroll position, and the observer fired
  // exactly once per mount). This component applies the transforms, so it knows
  // exactly; it drives the pause instead. State, not a ref, because the panes
  // are React children — but it is written ONLY on a transition, so a whole
  // scroll through the hero causes a handful of re-renders, not one per frame.
  const [liveA, setLiveA] = useState(true);
  const [liveB, setLiveB] = useState(false);
  const [liveC, setLiveC] = useState(false);
  const liveRef = useRef({ a: true, b: false, c: false });
  const travelRef = useRef<number | null>(null);

  // Arm slideshow B off the critical path: first user scroll intent (they are
  // heading toward the crossing) or idle time after load warms it early enough
  // that its images are typically ready before any crossing pixel is visible.
  // Reduced motion never arms — pane B is display:none there and mounting it
  // would only waste memory.
  useEffect(() => {
    if (armed) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let idleHandle = 0;
    let timerHandle = 0;
    const arm = () => setArmed(true);
    const options = { passive: true, once: true } as AddEventListenerOptions;
    window.addEventListener('scroll', arm, options);
    window.addEventListener('wheel', arm, options);
    window.addEventListener('touchstart', arm, options);
    if (typeof window.requestIdleCallback === 'function') {
      idleHandle = window.requestIdleCallback(arm, { timeout: 2500 });
    } else if (paneAReady) {
      // ⛔ Safari (no requestIdleCallback) — 2026-11-18, measured on the
      // owner's iPhone with ?heroDebug=1: the old fixed 2500ms timer mounted B
      // (53ms frame) and then C (59ms frame) MID-SPIN — the "double stutter"
      // at the first transition, and the only slow frames in 30 s. Now B mounts
      // the moment pane A is revealed: its fade-in waits 260ms before the ring
      // shows at all (`home-carousel-fade-in 760ms ease 260ms`), so both mounts
      // land while it is still invisible. Do not move this back to a timer.
      timerHandle = window.setTimeout(arm, 0);
    } else {
      // Safety net only: pane A always reports ready (its own 1800ms cap).
      timerHandle = window.setTimeout(arm, SAFARI_ARM_FALLBACK_MS);
    }
    return () => {
      window.removeEventListener('scroll', arm);
      window.removeEventListener('wheel', arm);
      window.removeEventListener('touchstart', arm);
      if (idleHandle) window.cancelIdleCallback?.(idleHandle);
      if (timerHandle) window.clearTimeout(timerHandle);
    };
  }, [armed, paneAReady]);

  // Arm slideshow C off the scroll path too, one idle beat after B.
  //
  // It used to arm from inside the scroll handler at p > 0.12, which put a whole
  // carousel mount — React render, ring construction, image decode — in the
  // middle of a crossing. Profiled 2026-08-06 on a cold load: exactly one long
  // frame in the entire scroll, 41.4ms against a 16.7ms median, landing on the
  // precise frame C mounted. That was the stutter "between carousels".
  //
  // The old rationale (a visitor who never scrolls past the first hold never
  // pays for C) barely applies now that the runway is ~1 screen: anyone who
  // scrolls at all reaches C's crossing almost immediately. Staggering it one
  // idle callback after B keeps the two mounts out of the same frame, so neither
  // lands on the scroll.
  useEffect(() => {
    if (!armed || armedC) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let idleHandle = 0;
    let timerHandle = 0;
    const armC = () => {
      armedCRef.current = true;
      setArmedC(true);
    };
    if (typeof window.requestIdleCallback === 'function') {
      idleHandle = window.requestIdleCallback(armC, { timeout: 1500 });
    } else {
      // Safari: right behind B (was 300ms), so C also mounts inside pane A's
      // 260ms invisible fade-in delay rather than after the ring appears.
      timerHandle = window.setTimeout(armC, SAFARI_ARM_C_AFTER_B_MS);
    }
    return () => {
      if (idleHandle) window.cancelIdleCallback?.(idleHandle);
      if (timerHandle) window.clearTimeout(timerHandle);
    };
  }, [armed, armedC]);

  useEffect(() => {
    const runway = runwayRef.current;
    const frame = frameRef.current;
    const paneA = paneARef.current;
    const paneB = paneBRef.current;
    const paneC = paneCRef.current;
    if (!runway || !frame || !paneA || !paneB || !paneC) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    // `pointer: coarse` is the finger-scrolling signal, which is what the
    // snappier curve is for — not a width breakpoint. A large tablet and a
    // small phone both want it; a narrow desktop window does not, because it is
    // still driven by a wheel. Read live rather than cached so plugging in a
    // mouse or rotating into a desktop-class pointer takes effect immediately.
    const coarsePointer = window.matchMedia('(pointer: coarse)');

    let raf = 0;
    let queued = false;
    // Write-on-change guard for the frame's mirrored backdrop below. Same
    // reasoning as the pane's own background: the value is recomputed every
    // frame but changes only as a colour seam sweeps, and this element is the
    // full pinned viewport.
    let lastFrameBackground = '';
    // Last scroll progress actually applied. NaN so the first frame always runs,
    // and reset to NaN by `remeasure` whenever the geometry or the active curve
    // changes underneath it.
    let lastP = NaN;
    // Latch for the resting branch below, same purpose as `lastP`.
    let restingApplied = false;

    // Hold the hero still on slideshow A. Used by reduced motion AND by a
    // runway with no travel — a window shorter than the hero's minimum height,
    // where CSS collapses the runway so the page scrolls normally.
    const settleOnPaneA = () => {
      // Idempotent, and this runs on the same page-wide scroll listener as the
      // main path — so without a latch a visitor in either mode pays for
      // clearing already-cleared styles on every frame of the whole page.
      // Reset by `remeasure`, which the reduced-motion and resize listeners call.
      if (restingApplied) return;
      restingApplied = true;
      // CSS has collapsed the runway to the plain hero; clear any transforms
      // left over from before the preference flipped or the window shrank.
      paneA.style.transform = '';
      paneB.style.transform = '';
      paneC.style.transform = '';
      setRingPull(paneA, 0);
      setRingPull(paneB, 0);
      setRingPull(paneC, 0);
      paneA.style.opacity = '';
      paneB.style.opacity = '';
      setPaneMask(paneA, 0, 0);
      setPaneMask(paneB, 0, 0);
      setPaneMask(paneC, 0, 0);
      paneA.inert = false;
      // Only pane A shows: B and C are display:none under reduced motion and
      // parked below the frame (their resting transform) with no travel.
      if (!liveRef.current.a) { liveRef.current.a = true; setLiveA(true); }
      if (liveRef.current.b) { liveRef.current.b = false; setLiveB(false); }
      if (liveRef.current.c) { liveRef.current.c = false; setLiveC(false); }
      dominantRef.current = 'a';
      setOverlayDark(paneDarkRef.current.a);
    };

    const apply = () => {
      queued = false;
      if (reduceMotion.matches) {
        settleOnPaneA();
        return;
      }
      // The sticky frame translates from 0 to (runway height - frame height)
      // within the runway while pinned, so this offset IS the scroll progress.
      // Cached: both heights derive purely from viewport units (the runway is
      // calc(100svh...) plus 240svh, or 210svh on a non-coarse pointer), so they
      // change only on resize or a pointer-type change — but
      // offsetHeight is a forced layout, and this ran twice on every scroll
      // frame. Invalidated to null by the resize handler below.
      let travel = travelRef.current;
      if (travel == null) {
        travel = runway.offsetHeight - frame.offsetHeight;
        travelRef.current = travel;
      }
      // No travel: the window is shorter than the hero's minimum height and CSS
      // has collapsed the runway (.home-hero-stack below). Clear anything left
      // from before a resize and hold on slideshow A.
      if (travel <= 0) {
        settleOnPaneA();
        return;
      }
      const offset = frame.getBoundingClientRect().top - runway.getBoundingClientRect().top;
      const p = Math.min(Math.max(offset / travel, 0), 1);
      // Everything below is a pure function of `p`, so an unchanged `p` can only
      // rewrite the values already on the elements. Bail before doing it.
      //
      // This is not a micro-optimisation: the scroll listener is on `window`, so
      // it fires for the WHOLE page, and `p` CLAMPS to 1 the moment the frame
      // unpins. Without this guard, every scroll frame spent anywhere below the
      // hero — the services strip, the reviews, the footer — still rewrote three
      // transforms, two opacities, three mask gradients and three ring pulls,
      // all to their existing values. The same applies at rest (p = 0) and to
      // any horizontal or zero-delta scroll event.
      //
      // `remeasure` resets this to NaN alongside the cached travel, so a resize,
      // a reduced-motion flip or a pointer-type change still forces one full
      // re-apply rather than being swallowed by an equal `p`.
      if (p === lastP) return;
      lastP = p;
      // Two crossing clocks that deliberately OVERLAP: t2 starts before t1
      // finishes, so B is being pulled away by the second crossing while the
      // first is still seating it. B therefore sweeps THROUGH flush rather than
      // resting there, and no frame of the hero is motionless.
      const t1 = Math.min(Math.max(p / PHASE_1_END, 0), 1);
      const t2 = Math.min(Math.max((p - PHASE_2_START) / (PHASE_2_END - PHASE_2_START), 0), 1);
      // Eased copies drive everything VISUAL (transforms, feathers) so a pane
      // decelerates into its lock rather than stopping dead. The raw values keep
      // driving the LOGIC below — inert/live thresholds and the dominant-pane
      // handover — because those are about which phase we are in, not how it
      // looks, and easing would only blur the boundary they test.
      // Touch gets the snappier quintic; wheel/trackpad keeps smoothstep.
      // Both share exact endpoints, so every position the rest of this function
      // depends on (resting, flush, locked) is identical either way — only the
      // path between them differs.
      const curve = coarsePointer.matches ? easeSnap : ease;
      const e1 = curve(t1);
      const e2 = curve(t2);

      // Everything travels UPWARD (owner request 2026-08-06): a pane exits up
      // and the next one rises from BELOW to take its place, so the hero reads
      // as one continuous upward scroll rather than a layer dropping over the
      // top. B is the only pane that does both: it rises during t1, then leaves
      // during t2, hence its two terms.
      //
      // At PANE_A_TRAVEL = 95 the arriving pane gains on the departing one, so
      // its top edge rides ~5% of a frame OVER the outgoing photograph. That
      // small overlap is what closes the join: the feather then blends one photo
      // into another instead of fading both out to backdrop.
      paneA.style.transform = `translate3d(0, ${(-e1 * PANE_A_TRAVEL).toFixed(3)}%, 0)`;
      paneB.style.transform = `translate3d(0, ${((1 - e1) * 100 - e2 * PANE_A_TRAVEL).toFixed(3)}%, 0)`;
      paneC.style.transform = `translate3d(0, ${((1 - e2) * 100).toFixed(3)}%, 0)`;

      // Lean the rings toward each other while a crossing is running. The
      // DEPARTING pane's ring trails (pulled down, staying nearer the pane
      // arriving beneath it); the ARRIVING pane's ring leads (pulled up). B is
      // both in turn, so it carries one term from each crossing.
      setRingPull(paneA, ringPull(e1));
      setRingPull(paneB, -ringPull(e1) + ringPull(e2));
      setRingPull(paneC, -ringPull(e2));

      // Each pane fades only while IT is the one leaving: A during crossing one,
      // B during crossing two, C never (it is the last and simply locks).
      paneA.style.opacity = String(exitOpacity(e1));
      paneB.style.opacity = String(exitOpacity(e2));

      // Now that arriving panes rise from below, the two sides of a crossing
      // feather DIFFERENT edges — they are the two halves of one seam:
      //   departing pane -> its BOTTOM edge leads the way up and out;
      //   arriving  pane -> its TOP edge is what climbs into the frame.
      // Feathering both sides softens that seam into the frame's mirrored
      // backdrop instead of butting two photos together on a hard line.
      //
      // Each still fades to nothing where its edge is offscreen or flush, so the
      // resting hero and both locked heroes stay full-bleed: A's bottom is 0 at
      // rest (it sits exactly on the frame's bottom, and any feather would fade
      // the hero the visitor first sees), and C's top is 0 once locked.
      //
      // B carries BOTH edges at once, and that is not optional: PHASE_2_START
      // (0.39) is BEFORE PHASE_1_END (0.61), so for p in [0.39, 0.61] pane B is
      // arriving and departing simultaneously. The previous `if (t2 > 0)` picked
      // one edge, which snapped B's top feather to zero the instant phase 2
      // opened — measured as a 12.6% -> 0 jump mid-crossing. (A stale comment
      // here asserted the phases could not overlap; they have overlapped ever
      // since the crossings were deliberately overlapped so motion never stops.)
      //
      // Departing edges use the WIDE dissolve — it has to reach past the
      // arriving pane's top edge into the visible band above, which the old
      // overlap clamp (0.7 x a 15% overlap) can never span. Arriving edges use
      // the mid-crossing-peaked feather.
      setPaneMask(paneA, 0, exitDissolve(e1));
      setPaneMask(paneB, arriveFeather(e1), exitDissolve(e2));
      setPaneMask(paneC, arriveFeather(e2), 0);

      // Only a fully offscreen pane is inert; mid-crossing both live layers stay
      // interactive. B is offscreen before it arrives and again after it leaves.
      paneA.inert = t1 > 0.999;
      paneB.inert = t1 < 0.001 || t2 > 0.999;
      paneC.inert = t2 < 0.001;

      // Same conditions, inverted: a pane that is inert is offscreen, and an
      // offscreen slideshow must not spin or run its per-frame sampler.
      const onA = !(t1 > 0.999);
      const onB = !(t1 < 0.001 || t2 > 0.999);
      const onC = !(t2 < 0.001);
      const live = liveRef.current;
      if (live.a !== onA) { live.a = onA; setLiveA(onA); }
      if (live.b !== onB) { live.b = onB; setLiveB(onB); }
      if (live.c !== onC) { live.c = onC; setLiveC(onC); }

      // Hand over to whichever slideshow now dominates the frame; each crossing
      // hands over at its own midpoint.
      const dominant = t2 >= 0.5 ? 'c' : t1 >= 0.5 ? 'b' : 'a';

      // A feathered or fading edge is partly transparent, so the frame is what
      // shows through — paint it with the DOMINANT pane's solid background.
      // It used to always mirror hero A, which was right when A was the only
      // pane that could be uncovered, but is wrong once a departing pane fades:
      // the strip it vacates would reveal the OUTGOING backdrop (black) directly
      // above the INCOMING slideshow (white), which is the bar this fade exists
      // to remove. Following the dominant pane means the vacated strip already
      // matches what is arriving.
      //
      // Switching on dominance rather than blending is safe because the switch
      // happens at the crossing midpoint, where the two panes still cover the
      // frame completely (measured: full coverage there) — so nothing of the
      // frame is visible at the instant it changes.
      const nextFrameBackground = paneColorsRef.current[dominant] || DEFAULT_BG;
      if (nextFrameBackground !== lastFrameBackground) {
        lastFrameBackground = nextFrameBackground;
        frame.style.background = nextFrameBackground;
      }
      if (dominantRef.current !== dominant) {
        dominantRef.current = dominant;
        setOverlayDark(paneDarkRef.current[dominant]);
      }
    };

    const schedule = () => {
      if (queued) return;
      queued = true;
      raf = requestAnimationFrame(apply);
    };
    // Anything that can change the runway/frame geometry drops the cached
    // travel so the next frame re-measures it exactly once.
    const remeasure = () => {
      travelRef.current = null;
      // Drop the progress guard too. The geometry (or the easing curve, on a
      // pointer-type change) is about to differ, so the same `p` no longer
      // implies the same rendered result.
      lastP = NaN;
      restingApplied = false;
      schedule();
    };

    apply();
    window.addEventListener('scroll', schedule, { passive: true });
    // NOT a bare resize listener. In Instagram's/Facebook's in-app browsers the
    // toolbar hides and shows on scroll, firing resize continuously — which
    // would drop the cached travel and force a synchronous re-measure
    // (offsetHeight) on every frame of an ordinary scroll. The geometry here is
    // entirely svh- and rem-derived, so toolbar movement genuinely cannot change
    // it; only a width change or a large height change can.
    const stopResize = onLayoutAffectingResize(remeasure);
    reduceMotion.addEventListener('change', remeasure);
    // `remeasure`, NOT `schedule`. This used to be a repaint-only listener on
    // the reasoning that "only the curve changes here, not the geometry" — true
    // until 2026-08-14, when the runway became SHORTER on non-coarse pointers to
    // speed the hero up on desktop. Pointer type now changes the runway height,
    // so the cached `travel` has to be dropped or a device that switches pointer
    // (plugging in a mouse, a hybrid laptop) would drive the whole choreography
    // off a stale measurement.
    coarsePointer.addEventListener('change', remeasure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', schedule);
      stopResize();
      reduceMotion.removeEventListener('change', remeasure);
      coarsePointer.removeEventListener('change', remeasure);
    };
  }, []);

  // TOUCH SNAP. Two owner requests (2026-08-09), one mechanism: each slideshow
  // should settle into place more firmly, and starting a scroll should carry the
  // visitor smoothly to the NEXT slideshow. Both reduce to "one gesture advances
  // exactly one slideshow".
  //
  // A single flick covers a large share of the runway, which is precisely why a
  // scroll could sail straight past a slideshow onto the one after. The fix is
  // not a slower runway (that would recalibrate the whole choreography); it is
  // stepping from where the GESTURE BEGAN, so however far a fling travels it
  // still lands on the next slideshow and no further.
  //
  // (This paragraph used to cite "~1 screen (110svh)". The touch runway has been
  // 240svh since 2026-08-09 and desktop 210svh since 2026-08-14; the argument is
  // independent of the number, which is why it survived the retune unchanged.)
  //
  // Touch only, deliberately. A wheel already arrives in small discrete notches
  // and hijacking it would fight the visitor's own scrolling — the same reason
  // the snappier easing curve is touch-only. Reduced motion never snaps, and
  // neither end of the runway does, so scrolling out of the hero stays free.
  useEffect(() => {
    const runway = runwayRef.current;
    const frame = frameRef.current;
    if (!runway || !frame) return;

    const coarsePointer = window.matchMedia('(pointer: coarse)');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    // easeSnap, not ease: the snap only ever runs on touch, and B's flush point
    // genuinely differs between the two curves.
    const snapPoints = resolveHeroSnapPoints({
      phase1End: PHASE_1_END,
      phase2Start: PHASE_2_START,
      phase2End: PHASE_2_END,
      paneATravel: PANE_A_TRAVEL,
      ease: easeSnap,
    });

    let animation = 0;
    let startProgress: number | null = null;
    let startY = 0;
    let lastY = 0;

    const cancelSnap = () => {
      if (!animation) return;
      cancelAnimationFrame(animation);
      animation = 0;
    };

    /**
     * Progress read from the PAGE and left unclamped, so "C is locked at the end
     * of the runway" is distinguishable from "the visitor is far down the page".
     * The scroll handler's own `p` is clamped to [0,1] and pins at 1 forever
     * once the frame unpins, so it cannot answer that.
     */
    const readMetrics = () => {
      const travel = runway.offsetHeight - frame.offsetHeight;
      if (travel <= 0) return null;
      const headerOffset = parseFloat(getComputedStyle(frame).top) || 0;
      const pinStart = runway.getBoundingClientRect().top + window.scrollY - headerOffset;
      return { travel, pinStart, progress: (window.scrollY - pinStart) / travel };
    };

    const animateTo = (targetY: number, progressDelta: number) => {
      const fromY = window.scrollY;
      const distance = targetY - fromY;
      if (Math.abs(distance) < 2) return;
      // Timed by PROGRESS, not pixels. The panes travel one frame height per
      // crossing whatever the runway is set to, so a pixel-based duration would
      // silently change how fast the slideshows move every time the runway or
      // the viewport height changed. A progress-based one holds the handover to
      // the same wall-clock speed on any device.
      const duration = Math.min(
        SNAP_STEP_MS * 1.6,
        Math.max(320, (progressDelta / FULL_STEP_PROGRESS) * SNAP_STEP_MS),
      );
      const started = performance.now();
      const step = (now: number) => {
        const t = Math.min((now - started) / duration, 1);
        const eased = 1 - (1 - t) ** 3; // ease-out cubic: leaves at once, settles gently
        // Reasserting position EVERY frame is what overrides the platform's
        // momentum scrolling, which is still running after the finger lifts.
        // A one-shot scrollTo would simply lose to it.
        window.scrollTo(0, fromY + distance * eased);
        animation = t < 1 ? requestAnimationFrame(step) : 0;
      };
      cancelSnap();
      animation = requestAnimationFrame(step);
    };

    const onTouchStart = (event: TouchEvent) => {
      cancelSnap();
      const touch = event.touches[0];
      if (!touch) return;
      startY = touch.clientY;
      lastY = startY;
      startProgress = readMetrics()?.progress ?? null;
    };

    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touch) lastY = touch.clientY;
    };

    const onTouchEnd = () => {
      const from = startProgress;
      startProgress = null;
      if (from === null || !coarsePointer.matches || reduceMotion.matches) return;
      // Outside the pinned runway this is an ordinary page scroll; leave it be.
      if (from < -0.05 || from > 1.05) return;
      const dy = lastY - startY;
      if (Math.abs(dy) < 8) return; // a tap or a stray touch, not a scroll
      // A finger moving UP the screen scrolls the page DOWN.
      const target = nextHeroSnapPoint(snapPoints, from, dy < 0 ? 1 : -1);
      if (target === null) return; // at an end — let them leave the hero
      const metrics = readMetrics();
      if (!metrics) return;
      animateTo(metrics.pinStart + target * metrics.travel, Math.abs(target - from));
    };

    // A wheel or a key means the visitor took over; never fight that.
    const releaseToUser = () => cancelSnap();

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', releaseToUser, { passive: true });
    window.addEventListener('wheel', releaseToUser, { passive: true });
    window.addEventListener('keydown', releaseToUser);
    return () => {
      cancelSnap();
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', releaseToUser);
      window.removeEventListener('wheel', releaseToUser);
      window.removeEventListener('keydown', releaseToUser);
    };
  }, []);

  return (
    <div ref={runwayRef} className="home-hero-stack" data-customer-reveal-skip>
      <div ref={frameRef} className="home-hero-stack-frame" data-customer-reveal-skip>
        {banner}
        {/* Everything below the banner. The panes and the overlay are
            `inset: 0` against THIS box rather than the frame, so the banner's
            height is subtracted from the slideshow area automatically — no
            measured offset, no CSS variable to keep in sync. */}
        <div className="home-hero-stack-viewport">
        <div
          ref={paneARef}
          className="home-hero-stack-pane home-hero-stack-pane--a"
          data-customer-reveal-skip
        >
          <HomeHero
            locale={locale}
            initialItems={initialItems}
            initialSettings={initialSettings}
            backgroundColor={paneColors.a}
            paused={!liveA}
            onReady={markPaneAReady}
        />
        </div>
        <div
          ref={paneBRef}
          className="home-hero-stack-pane home-hero-stack-pane--b"
          data-customer-reveal-skip
          inert
        >
          {armed && (
            <HomeHero
              locale={locale}
              initialItems={altItems}
              initialSettings={initialSettings}
              backgroundColor={paneColors.b}
              reverseSpin
              paused={!liveB}
        />
          )}
        </div>
        <div
          ref={paneCRef}
          className="home-hero-stack-pane home-hero-stack-pane--c"
          data-customer-reveal-skip
          inert
        >
          {armedC && (
            <HomeHero
              locale={locale}
              initialItems={thirdItems}
              initialSettings={initialSettings}
              backgroundColor={paneColors.c}
              paused={!liveC}
        />
          )}
        </div>

        {/* Static layer: headline, sign-up, CTAs, and the legibility halo stay
            pinned while the slideshows swap underneath. */}
        <div className="home-hero-stack-overlay" data-customer-reveal-skip>
          <HomeHeroOverlay locale={locale} dark={overlayDark} />
        </div>
        </div>
      </div>
      {heroDebug && <HeroDebugReadout />}

      <style>{`
        .home-hero-stack {
          position: relative;
          /* Short-screen minimum (owner, 2026-09-13, "option 2"). Inside the
             hero, the viewport token is never below --hero-min-vh, so on a
             window shorter than that the frame, panes and overlay all lay out
             as if the window were that tall and the page scrolls a little to
             reach the buttons. It reads --app-vh-page (the page copy of the
             token, globals.css) because a custom property cannot reference
             itself. A window at or above the minimum computes exactly as
             before. Per-width minimums are set further down. */
          --hero-min-vh: 420px;
          --app-vh: max(var(--app-vh-page), var(--hero-min-vh));
          /* Frame height + scroll runway.

             The runway is ONLY the scroll budget. It does not change what the
             panes do — each still travels exactly one frame height per crossing
             — so it sets how much SCROLL buys that travel, i.e. the speed of the
             hero under a finger or a wheel. A crossing spans 0.61 of the runway,
             so scroll-per-full-pane-travel is 0.61 x this number: at 110svh that
             was 67svh of scroll for 100svh of pane movement, about 1.5x faster
             than 1:1, and the owner reported it as far too fast on a phone.

             110svh -> 240svh (owner, 2026-08-09: "way too fast, slow it down a
             lot"), giving 146svh of scroll per 100svh of travel — roughly 0.7x,
             comfortably calmer than 1:1 and about 2.2x slower than before. Not
             back to the old 290svh: the hero no longer has to be scrolled by
             hand on touch, since one flick snaps a whole slideshow, so a longer
             runway costs the visitor far less than it did when this was
             compressed on 2026-08-06.

             NOTE this governs the MANUAL drag only. On touch the handover is
             usually driven by the snap, whose speed is SNAP_STEP_MS and is
             independent of this number. Changing one without the other slows
             half the experience.

             The PHASE_* fractions divide whatever budget is set here, so they do
             not need re-tuning alongside it.

             The min() / max() wrapper is a 0-or-1 switch: on a window shorter
             than --hero-min-vh the extra runway is 0, so nothing pins and the
             page scrolls normally (the reduced-motion layout, in CSS alone);
             at or above it the term is exactly the runway above. */
          height: calc((var(--app-vh) - var(--site-header-height)) + min(var(--app-vh) * 2.4, max(0px, (var(--app-vh-page) - var(--hero-min-vh) + 1px) * 100000)));
        }

        /* DESKTOP ONLY: a slightly shorter runway, i.e. a slightly faster hero
           (owner, 2026-08-14: "speed up the scroll a tiny bit on desktop").

           240svh -> 210svh, so scroll-per-full-pane-travel goes 146svh -> 128svh
           (0.61 x the runway). That is ~12.5% less scrolling through the hero —
           on a 950px-tall window, 2280px of travel becomes 1995px. Still calmer
           than 1:1, and nowhere near the 110svh that was rejected as "way too
           fast" on 2026-08-09; that verdict came from a PHONE, which is exactly
           why this is scoped away from touch.

           TOUCH IS DELIBERATELY UNCHANGED. On a finger the handover is usually
           driven by the snap, whose speed is SNAP_STEP_MS, and the runway governs
           only the manual drag — so shortening it there would speed up half the
           experience and leave the other half alone.

           The query is written "not all and (pointer: coarse)" rather than
           "(pointer: fine)" so it is the exact complement of the signal the JS
           branches on. A device reporting "pointer: none" would otherwise get
           the desktop CURVE from the JS but the touch RUNWAY from here, which is
           the kind of mismatch that is invisible until it is not.

           NOTE: no backticks anywhere in this style block. It is a template
           literal, so one would terminate the string and 500 the route.

           Must stay ABOVE the prefers-reduced-motion block, which collapses this
           same property at equal specificity and therefore wins on source order
           only. */
        @media not all and (pointer: coarse) {
          .home-hero-stack {
            height: calc((var(--app-vh) - var(--site-header-height)) + min(var(--app-vh) * 2.1, max(0px, (var(--app-vh-page) - var(--hero-min-vh) + 1px) * 100000)));
          }
        }

        /* Minimum hero heights by width, measured 2026-09-13: the shortest
           window at which the headline, the compact sign-up block and the
           buttons all fit, English and Spanish. Below it the runway above
           collapses and the hero keeps this height. */
        @media (max-width: 359px) {
          .home-hero-stack { --hero-min-vh: 400px; }
        }
        @media (min-width: 360px) and (max-width: 619px) {
          .home-hero-stack { --hero-min-vh: 360px; }
        }
        @media (min-width: 620px) and (max-width: 639px) {
          .home-hero-stack { --hero-min-vh: 320px; }
        }
        @media (min-width: 640px) and (max-width: 767px) {
          .home-hero-stack { --hero-min-vh: 400px; }
        }

        .home-hero-stack-frame {
          position: sticky;
          top: var(--site-header-height); /* pinned just below the fixed site header */
          height: calc(var(--app-vh) - var(--site-header-height));
          overflow: hidden;
          /* Seeded with slideshow A's solid color (A is the resting pane); the
             scroll handler repaints this with the dominant pane's color. */
          background: ${paneColors.a};
          /* The hero's bottom separator lives on the frame (not the slideshow
             sections) so no border line sweeps through the crossing. */
          border-bottom: 1px solid rgba(220, 179, 54, 0.22);
          /* Column so the announcement banner takes its natural height at the
             top and the slideshow viewport absorbs whatever is left. The frame's
             OWN height is unchanged (100svh - header), which matters: both the
             travel and the snap step are computed as
             runway.offsetHeight - frame.offsetHeight, so the choreography and
             the one-slideshow-per-flick snap are untouched by this. */
          display: flex;
          flex-direction: column;
        }

        /* The slideshow area — the frame minus the banner. Positioned, so the
           panes' and overlay's inset:0 resolve against it. A min-height of 0
           is required or the flex item refuses to shrink below its content. */
        .home-hero-stack-viewport {
          position: relative;
          flex: 1 1 auto;
          min-height: 0;
          overflow: hidden;
        }

        /* The banner must not be squeezed by the flex container: it is the one
           thing here with an intrinsic height. */
        .home-hero-stack-frame > .home-announcement {
          flex: 0 0 auto;
          position: relative;
          z-index: 4; /* above the overlay's halo, same as it had in page flow */
        }

        .home-hero-stack-pane {
          position: absolute;
          inset: 0;
          will-change: transform;
        }

        .home-hero-stack-pane--a {
          z-index: 1;
        }

        /* B and C each wait BELOW the frame and rise into it during their own
           crossing (owner request 2026-08-06), so the whole hero scrolls one
           way. These resting transforms must match the t=0 value the scroll
           handler computes — (1 - 0) * 100 = 100% — or the pane would jump on
           the first frame after hydration. The stacking order is arrival order. */
        .home-hero-stack-pane--b {
          z-index: 2;
          transform: translate3d(0, 100%, 0);
        }

        .home-hero-stack-pane--c {
          z-index: 3;
          transform: translate3d(0, 100%, 0);
        }

        /* Text/form layer sits above both slideshows and never moves. */
        .home-hero-stack-overlay {
          position: absolute;
          inset: 0;
          z-index: 3;
          pointer-events: none;
        }

        /* Inside a fixed-height pane the hero fills the frame exactly. */
        .home-hero-stack-pane .home-carousel-hero {
          height: 100%;
        }

        @media (prefers-reduced-motion: reduce) {
          /* No travel: the runway is exactly the frame, so nothing pins and
             the single slideshow + overlay render as the original hero. */
          .home-hero-stack {
            height: calc(var(--app-vh) - var(--site-header-height));
          }
          .home-hero-stack-pane--b,
          .home-hero-stack-pane--c {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
