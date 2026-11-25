'use client';

import { useEffect, useRef } from 'react';
import { AppIcon } from '@/components/AppIcon';

type CueState = 'hidden' | 'shown' | 'gone';
type CuePos = 'center' | 'right';

type Box = { left: number; right: number; top: number; bottom: number };

const hits = (a: Box, b: Box, pad: number) =>
  a.left < b.right + pad && a.right > b.left - pad && a.top < b.bottom + pad && a.bottom > b.top - pad;

/**
 * Where the arrow can sit without covering anything that matters on the first
 * screen: the page marks those with `data-cue-avoid` — "box" for the buttons
 * (their whole area), "text" for the hours (only the inked width; the lines
 * are centred, so a corner is usually free). On a tall phone the arrow sits
 * bottom-centre over the half-visible tiles (the approved look); on a shorter
 * one it moves to the bottom-right corner; if even that would cover a button
 * (an iPhone SE shows the buttons cut off at the bottom — itself a sign there
 * is more), it does not show at all.
 */
function clearSpot(button: HTMLElement): CuePos | null {
  const avoid: Box[] = [];
  for (const el of document.querySelectorAll<HTMLElement>('[data-cue-avoid]')) {
    if (el.dataset.cueAvoid !== 'text') {
      avoid.push(el.getBoundingClientRect());
      continue;
    }
    // Text: each run of words, not the full-width lines that hold them (a
    // range over the element would count the <p> boxes edge to edge).
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim()) continue;
      range.selectNodeContents(node);
      avoid.push(...range.getClientRects());
    }
    // Icons and badges beside the words.
    for (const svg of el.querySelectorAll('svg')) avoid.push(svg.getBoundingClientRect());
  }
  // Its resting place, from the CSS (the bob's transform would skew a measured
  // rect): `bottom` resolves the safe-area inset to pixels.
  const size = button.offsetWidth;
  const top = window.innerHeight - parseFloat(getComputedStyle(button).bottom) - size;
  const bob = 6; // the bob moves it this far down
  const at = (left: number): Box => ({ left, right: left + size, top, bottom: top + size + bob });
  const center = at(window.innerWidth / 2 - size / 2);
  const right = at(window.innerWidth - size - 12);
  if (!avoid.some((box) => hits(center, box, 4))) return 'center';
  if (!avoid.some((box) => hits(right, box, 4))) return 'right';
  return null;
}

/**
 * The small gold "more below" arrow on the /magnet landing page (owner,
 * 2026-11-23, mockup 4 "C1": "they may not know they can scroll").
 *
 * - Fixed at the bottom centre of the first screen, bobbing gently
 *   (`.scroll-cue` in globals.css; no bob under reduced motion) — or the
 *   bottom-right corner, or not at all, so it never covers a button or the
 *   hours (`clearSpot`).
 * - Starts hidden and appears only once the page is known to be taller than
 *   the screen — on a tablet where everything fits it never shows.
 * - Fades out on the first scroll and does not come back for that page view.
 * - Tapping it glides the page down to the directory (`targetId`).
 *
 * The state lives on the button's `data-state` (written straight to the DOM),
 * not in React state: it only follows the window's scroll, and a re-render
 * per state change would buy nothing.
 */
export default function ScrollCue({ targetId, label }: { targetId: string; label: string }) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const button = ref.current;
    if (!button) return;
    const set = (state: CueState) => {
      button.dataset.state = state;
      button.setAttribute('aria-hidden', state === 'shown' ? 'false' : 'true');
      button.tabIndex = state === 'shown' ? 0 : -1;
    };
    const hasMoreBelow = document.documentElement.scrollHeight > window.innerHeight + 24;
    const pos = hasMoreBelow && window.scrollY <= 8 ? clearSpot(button) : null;
    if (!pos) {
      set('gone');
      return;
    }
    button.dataset.pos = pos;
    set('shown');
    const onScroll = () => {
      if (window.scrollY <= 8) return;
      set('gone');
      window.removeEventListener('scroll', onScroll);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const glide = () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(targetId)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    if (ref.current) ref.current.dataset.state = 'gone';
  };

  return (
    <button
      ref={ref}
      type="button"
      className="scroll-cue"
      data-state="hidden"
      aria-label={label}
      aria-hidden="true"
      tabIndex={-1}
      onClick={glide}
    >
      <AppIcon name="expand_more" className="text-[1.4rem]" />
    </button>
  );
}
