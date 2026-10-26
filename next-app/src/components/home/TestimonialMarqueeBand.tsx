'use client';

// The reviews band — homepage AND product pages (2026-10-25). Owner: "a
// scrolling carousel of reviews … when the user hovers over it, it stops and
// they can click on it and drag it right and left to progress or go back".
//
// Until 2026-10-25 the band moved with a pure-CSS animation, which cannot be
// dragged. Now one requestAnimationFrame loop owns the track's position:
//   - it advances by itself at `durationSeconds` per half-track (the old speed);
//   - it stops while a mouse is over it, while it is being dragged, while a
//     card inside has keyboard focus, and while the band is off screen;
//   - press and drag (mouse, pen, or a finger) moves it either way; it stays
//     where it was dropped and carries on from there when the mouse leaves;
//   - a finger pauses it for TOUCH_RESUME_MS after the last touch;
//   - with prefers-reduced-motion it never moves by itself, but still drags.
// The loop runs only while it has something to do — never offscreen, never
// while paused — so it costs nothing per frame elsewhere on the page.
//
// The track holds two identical halves; the position wraps modulo one half,
// so it loops endlessly in both directions. (That is why the CSS spaces cards
// with margin, not gap — see `.testimonial-marquee-track` in globals.css.)
//
// Clicks: every card is a "Read on Google" link (stretched overlay). A drag
// must never open it, so a press only becomes a drag past DRAG_THRESHOLD_PX,
// pointer capture starts only then (capturing on press would steal the
// link's click), and the click that ends a drag is swallowed.
//
// The cards arrive as server-rendered children, so none of their content joins
// the client bundle. `data-customer-reveal-skip` is load-bearing — see
// TestimonialsSection.

import { useEffect, useRef, type ReactNode } from 'react';

type Props = {
  /** Seconds the track takes to travel one half (derived from the card count). */
  durationSeconds: number;
  children: ReactNode;
};

/** Movement before a press counts as a drag rather than a click. */
const DRAG_THRESHOLD_PX = 6;
/** After a finger lets go, wait this long before scrolling by itself again. */
const TOUCH_RESUME_MS = 3000;

export default function TestimonialMarqueeBand({ durationSeconds, children }: Props) {
  const bandRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const band = bandRef.current;
    const track = trackRef.current;
    if (!band || !track) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let half = track.scrollWidth / 2;
    let offset = 0;
    let onScreen = false;
    let hovered = false;
    let focused = false;
    let resumeAt = 0;
    let frame = 0;
    let last = 0;

    // Press / drag state.
    let pointerId: number | null = null;
    let startX = 0;
    let startOffset = 0;
    let dragging = false;
    let swallowClick = false;

    const wrap = (value: number) => (half > 0 ? ((value % half) + half) % half : 0);
    const paint = () => {
      track.style.transform = `translate3d(${-offset}px, 0, 0)`;
    };
    const shouldRun = () =>
      onScreen && !hovered && !focused && pointerId === null && !reducedMotion.matches;

    const tick = (now: number) => {
      frame = 0;
      if (!shouldRun()) return;
      const dt = last ? Math.min(now - last, 100) : 0; // a long gap (tab hidden) must not jump
      last = now;
      if (now >= resumeAt && half > 0) {
        offset = wrap(offset + (half / durationSeconds) * (dt / 1000));
        paint();
      }
      frame = requestAnimationFrame(tick);
    };
    const update = () => {
      if (shouldRun()) {
        if (!frame) {
          last = 0;
          frame = requestAnimationFrame(tick);
        }
      } else if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        // Real intersected area, not `isIntersecting` — the boolean is true
        // for zero-area grazes (the hero-pane pause bug, CHANGELOG 2026-08-06).
        const { width, height } = entry.intersectionRect;
        onScreen = width > 0 && height > 0;
        update();
      },
      { rootMargin: '96px 0px' },
    );
    io.observe(band);

    const ro = new ResizeObserver(() => {
      half = track.scrollWidth / 2;
      offset = wrap(offset);
      paint();
    });
    ro.observe(track);

    const onPointerEnter = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') {
        hovered = true;
        update();
      }
    };
    const onPointerLeave = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && pointerId === null) {
        hovered = false;
        update();
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || pointerId !== null) return;
      pointerId = e.pointerId;
      startX = e.clientX;
      startOffset = offset;
      dragging = false;
      update();
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      const dx = e.clientX - startX;
      if (!dragging) {
        if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
        dragging = true;
        band.dataset.dragging = '';
        try { band.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      }
      offset = wrap(startOffset - dx);
      paint();
    };
    const endPress = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      if (dragging) {
        swallowClick = true;
        delete band.dataset.dragging;
        // A click that would end this drag fires synchronously after pointerup;
        // if none does (released off the band), stop swallowing on the next tick.
        setTimeout(() => { swallowClick = false; }, 0);
      }
      if (e.pointerType !== 'mouse') resumeAt = performance.now() + TOUCH_RESUME_MS;
      else if (e.type === 'pointercancel' || !band.matches(':hover')) hovered = false;
      pointerId = null;
      dragging = false;
      update();
    };
    const onClickCapture = (e: MouseEvent) => {
      if (swallowClick) {
        e.preventDefault();
        e.stopPropagation();
        swallowClick = false;
      }
    };
    // Links and text would otherwise start the browser's own drag.
    const onDragStart = (e: DragEvent) => e.preventDefault();
    const onFocusIn = (e: FocusEvent) => {
      // Keyboard focus only. Pressing a card with the mouse also focuses its
      // link in Chrome; treating that as "focused" would re-centre the card on
      // every press (breaking the drag) and keep the band paused afterwards.
      if (!(e.target as Element).matches(':focus-visible')) return;
      focused = true;
      // Bring the focused card into view by moving the track, not the box:
      // the browser scrolls an overflow:hidden box to reveal focus, which would
      // fight the transform. Undo that and slide the track instead.
      band.scrollLeft = 0;
      const card = (e.target as HTMLElement).closest('.testimonial-card') as HTMLElement | null;
      if (card) {
        const inset = Math.max(0, (band.clientWidth - card.offsetWidth) / 2);
        offset = wrap(card.offsetLeft - inset);
        paint();
      }
      update();
    };
    const onFocusOut = (e: FocusEvent) => {
      if (!band.contains(e.relatedTarget as Node | null)) {
        focused = false;
        update();
      }
    };

    band.addEventListener('pointerenter', onPointerEnter);
    band.addEventListener('pointerleave', onPointerLeave);
    band.addEventListener('pointerdown', onPointerDown);
    band.addEventListener('pointermove', onPointerMove);
    band.addEventListener('pointerup', endPress);
    band.addEventListener('pointercancel', endPress);
    band.addEventListener('click', onClickCapture, true);
    band.addEventListener('dragstart', onDragStart);
    band.addEventListener('focusin', onFocusIn);
    band.addEventListener('focusout', onFocusOut);
    reducedMotion.addEventListener('change', update);

    return () => {
      io.disconnect();
      ro.disconnect();
      if (frame) cancelAnimationFrame(frame);
      band.removeEventListener('pointerenter', onPointerEnter);
      band.removeEventListener('pointerleave', onPointerLeave);
      band.removeEventListener('pointerdown', onPointerDown);
      band.removeEventListener('pointermove', onPointerMove);
      band.removeEventListener('pointerup', endPress);
      band.removeEventListener('pointercancel', endPress);
      band.removeEventListener('click', onClickCapture, true);
      band.removeEventListener('dragstart', onDragStart);
      band.removeEventListener('focusin', onFocusIn);
      band.removeEventListener('focusout', onFocusOut);
      reducedMotion.removeEventListener('change', update);
    };
  }, [durationSeconds]);

  return (
    // Class names and data-customer-reveal-skip are load-bearing — see the
    // comments in TestimonialsSection and in globals.css.
    <div ref={bandRef} className="testimonial-marquee" data-customer-reveal-skip>
      <div ref={trackRef} className="testimonial-marquee-track">
        {children}
      </div>
    </div>
  );
}
