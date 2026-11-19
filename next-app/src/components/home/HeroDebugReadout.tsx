'use client';

// Hidden hero frame-timing readout (2026-11-18). Opens ONLY with `?heroDebug=1`
// on the homepage (HomeHeroStack gates it and code-splits it, so normal
// visitors never download this file). Built to measure an iPhone-only "double
// stutter" at the hero's first transition, which cannot be traced from the
// Windows PC (Safari's Web Inspector needs a Mac).
//
// For 30 s from mount it records every animation frame's length plus what the
// hero did (panes B/C mounting, reveals, photo loads, photo swaps at the hidden
// back, cards coming onto the screen), then shows a report with a Copy button.
// Nothing is sent anywhere — the report lives on the phone until the owner
// pastes it.
//
// Limits (say so when reading a report): it sees frames the PAGE drew late
// (main-thread hitches). A hitch that happens only inside Safari's own
// compositor would not show as a slow frame here — an empty "slow frames" list
// during a visible stutter means exactly that.

import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

const RECORD_MS = 30_000;
const NEAR_MS = 350;

type Ev = { t: number; what: string };

function sec(ms: number) {
  return (ms / 1000).toFixed(2) + 's';
}

function paneOf(el: Element): string {
  const pane = el.closest('.home-hero-stack-pane');
  if (!pane) return '?';
  if (pane.classList.contains('home-hero-stack-pane--a')) return 'A';
  if (pane.classList.contains('home-hero-stack-pane--b')) return 'B';
  if (pane.classList.contains('home-hero-stack-pane--c')) return 'C';
  return '?';
}

function buildReport(events: Ev[], frames: { t: number; d: number }[]): string {
  const ds = frames.map((f) => f.d).sort((a, b) => a - b);
  const median = ds.length ? ds[Math.floor(ds.length / 2)] : 0;
  const threshold = Math.max(median * 1.7, 12);
  const slow = frames.filter((f) => f.d > threshold);
  const ev = [...events].sort((a, b) => a.t - b.t);
  const lines: string[] = [];
  lines.push('NEJ hero readout v1');
  lines.push(`device: ${navigator.userAgent}`);
  lines.push(
    `screen: ${innerWidth}x${innerHeight} dpr ${devicePixelRatio}` +
      ` · reduced-motion ${matchMedia('(prefers-reduced-motion: reduce)').matches ? 'ON' : 'off'}` +
      ` · freeze-latch ${(() => { try { return sessionStorage.getItem('nej-hero-frozen') ?? 'none'; } catch { return '?'; } })()}`,
  );
  lines.push(
    `frames: ${frames.length} · typical ${median.toFixed(1)}ms · slow = over ${threshold.toFixed(1)}ms · slow frames: ${slow.length}`,
  );
  lines.push('');
  lines.push('SLOW FRAMES (time since page start · length · what happened within 0.35s):');
  if (slow.length === 0) lines.push('  none');
  for (const f of slow.slice(0, 40)) {
    const start = f.t - f.d;
    const near = ev
      .filter((e) => e.t >= start - NEAR_MS && e.t <= f.t + NEAR_MS)
      .map((e) => `${e.what} @${sec(e.t)}`);
    lines.push(`  ${sec(f.t)} ${Math.round(f.d)}ms${near.length ? ' ← ' + near.slice(0, 6).join('; ') : ''}`);
  }
  lines.push('');
  lines.push('EVENTS:');
  for (const e of ev.slice(0, 120)) lines.push(`  ${sec(e.t)} ${e.what}`);
  return lines.join('\n');
}

export default function HeroDebugReadout() {
  const [left, setLeft] = useState(Math.round(RECORD_MS / 1000));
  const [report, setReport] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    const events: Ev[] = [];
    const frames: { t: number; d: number }[] = [];
    const add = (what: string) => events.push({ t: performance.now(), what });
    const startedAt = performance.now();
    add('readout started');

    // Every animation frame's length.
    let raf = 0;
    let last = 0;
    const loop = (ts: number) => {
      if (last) frames.push({ t: ts, d: ts - last });
      last = ts;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // Photo loads anywhere in the hero (load does not bubble — capture).
    const onLoad = (e: Event) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement) || !img.closest('.home-hero-stack')) return;
      const kind = img.closest('div[aria-hidden]') && !img.closest('[class*="__card"]') ? 'next-photo helper' : 'card';
      add(`photo loaded (pane ${paneOf(img)} ${kind}, ${img.naturalWidth}px)`);
    };
    document.addEventListener('load', onLoad, true);

    // Pane mounts / reveals / preloader mounts, polled (cheap querySelector reads).
    const seen = new Set<string>();
    const once = (key: string, what: string) => {
      if (seen.has(key)) return;
      seen.add(key);
      add(what);
    };
    let ringObserver: MutationObserver | null = null;
    let cardIo: IntersectionObserver | null = null;
    const attachRingA = (ring: Element) => {
      // Photo swaps at the hidden back + cards turning to face front/back.
      ringObserver = new MutationObserver((muts) => {
        for (const m of muts) {
          const card = (m.target as Element).closest('[class*="__card"]');
          const slot = card ? Array.prototype.indexOf.call(ring.children, card) : -1;
          if (m.attributeName === 'src') add(`pane A slot ${slot} swapped photo (at the back)`);
          if (m.attributeName === 'data-carousel-facing' && card) {
            add(`pane A slot ${slot} turned ${card.getAttribute('data-carousel-facing')}`);
          }
        }
      });
      ringObserver.observe(ring, { subtree: true, attributes: true, attributeFilter: ['src', 'data-carousel-facing'] });
      // Cards coming onto / fully onto the screen (only while facing front).
      const state = new Map<Element, { on: boolean; full: boolean }>();
      cardIo = new IntersectionObserver(
        (entries) => {
          for (const en of entries) {
            const card = en.target;
            if (card.getAttribute('data-carousel-facing') === 'back') continue;
            const slot = Array.prototype.indexOf.call(ring.children, card);
            const s = state.get(card) ?? { on: false, full: false };
            const on = en.intersectionRatio > 0;
            const full = en.intersectionRatio >= 0.97;
            if (on && !s.on) add(`pane A slot ${slot} coming onto screen`);
            if (full && !s.full) add(`pane A slot ${slot} fully on screen`);
            if (!on && s.on) add(`pane A slot ${slot} left the screen`);
            state.set(card, { on, full });
          }
        },
        { threshold: [0, 0.25, 0.5, 0.75, 0.97, 1] },
      );
      for (const card of Array.from(ring.children)) cardIo.observe(card);
    };
    const poll = window.setInterval(() => {
      for (const L of ['a', 'b', 'c'] as const) {
        const pane = document.querySelector(`.home-hero-stack-pane--${L}`);
        if (!pane) continue;
        const up = L.toUpperCase();
        if (pane.querySelector('.home-carousel-hero')) once(`m${L}`, `pane ${up} slideshow mounted`);
        if (pane.querySelector('.home-carousel-hero.is-ready')) once(`r${L}`, `pane ${up} revealed`);
        const scene = pane.querySelector('[class*="__scene"]');
        if (scene?.querySelector(':scope > div[aria-hidden]')) once(`p${L}`, `pane ${up} next-photo helper mounted`);
        if (L === 'a' && !ringObserver) {
          const ring = pane.querySelector('[class*="__ring"]');
          if (ring) {
            attachRingA(ring);
            once('ringA', 'pane A ring found');
          }
        }
      }
    }, 50);

    const countdown = window.setInterval(() => {
      setLeft(Math.max(0, Math.round((RECORD_MS - (performance.now() - startedAt)) / 1000)));
    }, 1000);

    const finish = window.setTimeout(() => {
      cancelAnimationFrame(raf);
      window.clearInterval(poll);
      window.clearInterval(countdown);
      document.removeEventListener('load', onLoad, true);
      ringObserver?.disconnect();
      cardIo?.disconnect();
      setReport(buildReport(events, frames));
    }, RECORD_MS);

    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(poll);
      window.clearInterval(countdown);
      window.clearTimeout(finish);
      document.removeEventListener('load', onLoad, true);
      ringObserver?.disconnect();
      cardIo?.disconnect();
    };
  }, []);

  if (closed) return null;

  const box: CSSProperties = {
    position: 'fixed',
    left: 8,
    right: 8,
    bottom: 8,
    zIndex: 2147483000,
    background: 'rgba(20,20,20,0.92)',
    color: '#fff',
    font: '12px/1.35 ui-monospace, Menlo, monospace',
    borderRadius: 10,
    padding: 10,
    boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
  };

  const panel = report == null ? (
    <div style={{ ...box, right: 'auto', pointerEvents: 'none' }} aria-live="polite">
      Recording hero… {left}s — don’t scroll or tap
    </div>
  ) : (
    <div style={box} role="dialog" aria-label="Hero readout">
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(report).then(() => setCopied(true), () => setCopied(false));
          }}
          style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: 0, background: '#d4af37', color: '#111', fontWeight: 700, fontSize: 15 }}
        >
          {copied ? 'Copied ✓' : 'Copy report'}
        </button>
        <button
          type="button"
          onClick={() => setClosed(true)}
          style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #888', background: 'transparent', color: '#fff', fontSize: 15 }}
        >
          Close
        </button>
      </div>
      <textarea
        readOnly
        value={report}
        onFocus={(e) => e.currentTarget.select()}
        style={{ width: '100%', height: '40vh', background: '#111', color: '#eee', font: 'inherit', border: '1px solid #444', borderRadius: 6, padding: 6, fontSize: 16 }}
      />
    </div>
  );

  return createPortal(panel, document.body);
}
