'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const REVEAL_SELECTOR = [
  'main > section',
  'main > article',
  'main > div',
  'main section',
  'main article',
  'main form',
  'main aside',
  'main nav',
  'main [class*="card"]',
  'main [class*="panel"]',
  'main [class*="tile"]',
  'main [class*="hero"]',
  'footer',
].join(',');

const EXCLUDE_SELECTOR = [
  '[data-customer-reveal-skip]',
  '[data-customer-reveal-root] header',
  '.shop-card-reveal',
  '.shop-card-reveal *',
  '.shop-list-row',
  '.shop-list-row *',
  '.shop-entry-reveal',
  '.shop-entry-reveal *',
  '.site-loading-screen',
  '.app-icon',
  'script',
  'style',
  'noscript',
].join(',');

const BACKGROUND_URL_PATTERN = /url\((?:"([^"]+)"|'([^']+)'|([^)"']+))\)/g;
const REVEAL_MEDIA_TIMEOUT_MS = 1400;

function backgroundUrlsFor(element: Element) {
  const urls = new Set<string>();
  const nodes = [element, ...Array.from(element.querySelectorAll('*'))];

  nodes.slice(0, 80).forEach((node) => {
    const backgroundImage = window.getComputedStyle(node).backgroundImage;
    for (const match of backgroundImage.matchAll(BACKGROUND_URL_PATTERN)) {
      const url = match[1] ?? match[2] ?? match[3];
      if (url && !url.startsWith('data:')) urls.add(url.trim());
    }
  });

  return Array.from(urls);
}

function waitForImage(image: HTMLImageElement) {
  if (image.complete) return Promise.resolve();

  return new Promise<void>((resolve) => {
    const done = () => {
      image.removeEventListener('load', done);
      image.removeEventListener('error', done);
      resolve();
    };

    image.addEventListener('load', done, { once: true });
    image.addEventListener('error', done, { once: true });
  });
}

function waitForBackground(url: string) {
  return new Promise<void>((resolve) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = url;
  });
}

function revealElement(element: HTMLElement, index: number) {
  // 'done' must be in this guard: the MutationObserver re-runs the sweep, and
  // without it every settled element would be re-stamped 'pending' (opacity 0)
  // and vanish.
  if (
    element.dataset.customerReveal === 'pending' ||
    element.dataset.customerReveal === 'visible' ||
    element.dataset.customerReveal === 'done'
  ) {
    return;
  }

  const delayMs = Math.min(index, 7) * 70;
  element.dataset.customerReveal = 'pending';
  element.style.setProperty('--customer-reveal-delay', `${delayMs}ms`);

  // Lazy images are intentionally allowed to remain offscreen and unloaded.
  // Waiting for them here can hide an otherwise ready page indefinitely (for
  // example, a horizontally scrollable product thumbnail gallery on mobile).
  const imagePromises = Array.from(element.querySelectorAll('img'))
    .filter((image) => image.loading !== 'lazy')
    .map(waitForImage);
  const backgroundPromises = backgroundUrlsFor(element).map(waitForBackground);
  const fontsReady = 'fonts' in document ? document.fonts.ready.catch(() => undefined) : Promise.resolve();
  let hasRevealed = false;
  let settleTimer: number | undefined;

  const commitReveal = () => {
    element.dataset.customerReveal = 'visible';

    // Release the reveal's compositor hint once the transition has finished.
    // 'visible' carries `will-change: opacity, transform, filter` (globals.css)
    // — needed DURING the 620ms transition, but left on forever it pinned every
    // revealed element as a compositor layer for the life of the page, which is
    // real GPU memory pressure on weak machines (found in the 2026-08-24 weak-GPU
    // hero audit). 'done' has NO CSS rules on purpose: natural styles are
    // visually identical to the transition's end state (opacity 1, no transform,
    // no blur), so the swap is invisible. A timeout rather than `transitionend`
    // because the transition can be skipped entirely (hidden document commits
    // immediately; reduced-motion forces transition: none) and the settle must
    // still happen. 620ms matches the CSS duration — keep them in step.
    if (settleTimer === undefined) {
      settleTimer = window.setTimeout(() => {
        if (element.dataset.customerReveal === 'visible') {
          element.dataset.customerReveal = 'done';
        }
      }, delayMs + 620 + 180);
    }
  };

  const reveal = () => {
    if (hasRevealed) return;
    hasRevealed = true;

    // Hidden documents suspend requestAnimationFrame indefinitely (background
    // tabs, prerendering, non-compositing webviews), and pending content also
    // blocks pointer events, so the frame-aligned flip must never be the only
    // path to visibility. Commit immediately while hidden; while visible, keep
    // the frame-aligned flip with a bounded idempotent backstop.
    if (document.visibilityState === 'hidden') {
      commitReveal();
      return;
    }

    window.requestAnimationFrame(commitReveal);
    window.setTimeout(commitReveal, 500);
  };

  // A decorative animation may delay content briefly, but must never become a
  // permanent visibility gate when a network resource is slow or unavailable.
  const fallbackTimer = window.setTimeout(reveal, REVEAL_MEDIA_TIMEOUT_MS);

  Promise.allSettled([...imagePromises, ...backgroundPromises, fontsReady]).then(() => {
    window.clearTimeout(fallbackTimer);
    reveal();
  });
}

function collectRevealElements(root: HTMLElement) {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>(REVEAL_SELECTOR));
  const seen = new Set<HTMLElement>();

  return candidates.filter((element) => {
    if (seen.has(element) || element.closest(EXCLUDE_SELECTOR)) return false;
    // Shop catalog views carry dozens of lazy-loaded product images. Waiting on
    // all of them before revealing a parent wrapper leaves list view stuck at
    // opacity:0 (gallery is already skipped via .shop-product-grid). The shop
    // page runs its own entry animation via .shop-entry-reveal / .shop-card-reveal.
    if (element.querySelector('.shop-product-grid, .shop-product-list')) return false;
    if (element.querySelectorAll('img').length > 40) return false;
    if (element.offsetParent === null && window.getComputedStyle(element).position !== 'fixed') return false;
    seen.add(element);
    return true;
  });
}

/** The pathname with a leading `/en` or `/es` removed — the page, regardless of language. */
export function normalizeRevealPathname(pathname: string): string {
  return pathname.replace(/^\/(?:en|es)(?=\/|$)/, '') || '/';
}

/**
 * Is this navigation the SAME page in the other language?
 *
 * Owner, 2026-09-08, on `/card`: "I see the page change to Spanish, and then
 * I see a flash reload … the reload I'm seeing might be a result of the fade
 * in effect." Exactly that. The English/Español toggle is a soft navigation,
 * but the `[locale]` segment changes, so React REMOUNTS the page's DOM; the
 * new nodes carry no `data-customer-reveal`, and the sweep below stamped them
 * `pending` (opacity 0, blurred, 18px down) and faded them in over 620ms with
 * a stagger — the entrance animation of a new page, applied to a page the
 * visitor was already reading. A language switch must be a text swap, never
 * an arrival, so it gets no reveal at all; the nodes simply render visible.
 * Real page changes (home → shop) keep the animation; first loads lost it on
 * 2026-10-31 (see `shouldSkipReveal`).
 */
export function isLocaleOnlyChange(previousPathname: string | null, nextPathname: string): boolean {
  if (previousPathname === null || previousPathname === nextPathname) return false;
  return normalizeRevealPathname(previousPathname) === normalizeRevealPathname(nextPathname);
}

/**
 * Should this run settle the page without the entrance fade?
 *
 * Yes on a full page load (`previousPathname === null`). Owner, 2026-10-31,
 * opening /card and /magnet from a QR code: "the page seems to load, then
 * flash and load again." Exactly that: the server HTML is already painted
 * (filmed on live /card: fully drawn at 0.75 s), and the sweep waits for the
 * window `load` event before stamping `pending` — so a page the visitor was
 * already looking at went blank at ~1.15 s and faded back in. On a phone over
 * cellular the gap before `load` is longer, so the page shows even longer
 * before it vanishes. The fade only works where the content is NEW: a soft
 * navigation between pages, whose incoming DOM is hidden before it paints.
 *
 * Yes on a language switch (see `isLocaleOnlyChange`). No otherwise.
 */
export function shouldSkipReveal(previousPathname: string | null, nextPathname: string): boolean {
  return previousPathname === null || isLocaleOnlyChange(previousPathname, nextPathname);
}

/**
 * The pathname the last effect run was for; null until the first run after a
 * full page load. MODULE scope on purpose, not a ref: this component renders
 * inside `[locale]/layout.tsx`, and a language switch remounts that whole
 * subtree — a ref would start empty on the new instance and the switch would
 * look like a first mount (measured 2026-09-08: the stamp landed 80ms after
 * the URL change, from the fresh instance's timer). A module variable survives
 * the remount and resets with the document, which is exactly the lifetime the
 * question "is this the same page in another language?" — and "is this the
 * first page of the visit?" — need.
 */
let lastRevealPathname: string | null = null;
/**
 * The decision made for `lastRevealPathname`, reused when the effect runs
 * again for the SAME pathname. React StrictMode (dev) mounts every effect
 * twice, and Fast Refresh can re-run it too; on those second runs the stored
 * pathname already equals the current one, and a fresh comparison would say
 * "not a switch" (or "not the first load") and fade the page after all
 * (measured 2026-09-08). One decision per pathname, however many times the
 * effect runs for it.
 */
let lastRunSkippedReveal = false;

export default function CustomerReveal() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-customer-reveal-root]');
    if (!root) return;

    const normalizedPathname = normalizeRevealPathname(pathname);
    const isAdminRoute = normalizedPathname === '/admin' || normalizedPathname.startsWith('/admin/');
    const skipReveal =
      pathname === lastRevealPathname ? lastRunSkippedReveal : shouldSkipReveal(lastRevealPathname, pathname);
    lastRevealPathname = pathname;
    lastRunSkippedReveal = skipReveal;

    if (isAdminRoute) {
      root.classList.remove('customer-reveal-enabled');
      root.querySelectorAll<HTMLElement>('[data-customer-reveal]').forEach((element) => {
        element.removeAttribute('data-customer-reveal');
        element.style.removeProperty('--customer-reveal-delay');
      });
      return;
    }

    let disposed = false;

    const runReveal = () => {
      if (disposed) return;
      root.classList.add('customer-reveal-enabled');
      collectRevealElements(root).forEach((element, index) => {
        revealElement(element, index);
      });
    };

    // A first load or a language switch: mark the nodes settled without ever
    // hiding them, so later sweeps (the observer below) skip them exactly as
    // they skip any revealed element.
    const settleWithoutReveal = () => {
      if (disposed) return;
      root.classList.add('customer-reveal-enabled');
      collectRevealElements(root).forEach((element) => {
        element.dataset.customerReveal = 'done';
      });
    };

    // ⚠️ Timing that matters: on a navigation the route commit mutates the DOM
    // and this OUTGOING page's observer fires first — its frame runs before
    // React reaches this effect's cleanup, let alone the incoming page's
    // effect. That is by design for a real page change (the new content is
    // hidden before it ever paints, then fades in), but it means the language
    // switch has to be recognised HERE, from the URL the router has already
    // pushed, not only in the next effect run. The `disposed` flag alone was
    // measured to be too late (2026-09-08).
    const sweep = () => {
      if (disposed) return;
      const here = window.location.pathname;
      if (here !== pathname && isLocaleOnlyChange(pathname, here)) {
        settleWithoutReveal();
        return;
      }
      runReveal();
    };

    const observer = new MutationObserver(() => {
      window.requestAnimationFrame(sweep);
    });

    let timer: number | undefined;
    const startReveal = () => {
      timer = window.setTimeout(() => {
        if (skipReveal) settleWithoutReveal();
        else runReveal();
        observer.observe(root, { childList: true, subtree: true });
      }, 80);
    };

    if (document.readyState === 'complete') {
      startReveal();
    } else {
      window.addEventListener('load', startReveal, { once: true });
    }

    return () => {
      disposed = true;
      window.removeEventListener('load', startReveal);
      if (timer) window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
