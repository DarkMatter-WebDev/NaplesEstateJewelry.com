'use client';

// Hero slideshow pane: the 3D carousel as a full-bleed background over ONE
// solid admin-chosen color (`backgroundColor`, per slideshow). The per-photo
// background sweep — a gradient rebuilt every frame that followed each photo's
// backdrop to the front — was removed 2026-08-09: with mixed lineups it flipped
// the whole hero between black and white as the ring turned. Cards still paint
// their own photo's backdrop as padding; only the section behind them is fixed.
//
// This component is ONLY the slideshow (background + ring + loading spinner).
// The static headline / sign-up / CTA layer lives in HomeHeroOverlay, and
// HomeHeroStack composes the panes with one pinned overlay for the scroll
// parallax. The overlay's light/dark text theme is derived by the stack from
// each pane's solid color — nothing is reported outward from here anymore.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Carousel } from '../../../carousel/components/Carousel';
import {
  type CarouselItem,
  type CarouselSettings,
} from '../../../carousel/lib/carouselData';
import { DEFAULT_BG } from '../../../carousel/lib/carouselConfig';

type Props = {
  locale: string;
  initialItems: CarouselItem[];
  initialSettings: CarouselSettings;
  /** This pane's solid background — the admin's color for this slideshow. */
  backgroundColor?: string;
  /**
   * Spin the ring the opposite way (photos flow left-to-right across the
   * front). The stack sets this on slideshow B so the two slideshows move
   * against each other.
   */
  reverseSpin?: boolean;
  /**
   * Hard-pause this pane's carousel. `HomeHeroStack` knows exactly which panes
   * are offscreen (it applies the transforms), so it drives this rather than
   * leaving it to the carousel's own IntersectionObserver, which cannot detect
   * offscreen panes inside the pinned frame. See the `paused` prop on Carousel.
   */
  paused?: boolean;
  /**
   * Called once, the moment this pane is revealed (`.is-ready` added). The
   * ring is still invisible for the fade-in's 260ms delay after that, so the
   * stack uses it to mount slideshows B/C where a hitch cannot be seen
   * (2026-11-18, Safari — see HomeHeroStack).
   */
  onReady?: () => void;
};

// Matches the carousel's mobile breakpoint in the <style> below.
const MOBILE_QUERY = '(max-width: 640px)';

/** Keep in step with the .home-hero-loading opacity transition below. */
const SPINNER_FADE_MS = 180;

function withLocaleHref(item: CarouselItem, locale: string): CarouselItem {
  if (locale !== 'es' || !item.href || item.href.startsWith('/es/')) return item;
  return { ...item, href: `/es${item.href}` };
}

export default function HomeHero({
  locale,
  initialItems,
  initialSettings,
  backgroundColor = DEFAULT_BG,
  reverseSpin = false,
  paused = false,
  onReady,
}: Props) {
  const sectionRef = useRef<HTMLElement>(null);
  const [heroReady, setHeroReady] = useState(false);

  // Report the reveal outward exactly once (latest-callback ref, so a new
  // function identity from the parent never re-fires it).
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  });
  const reportedReadyRef = useRef(false);
  useEffect(() => {
    if (!heroReady || reportedReadyRef.current) return;
    reportedReadyRef.current = true;
    onReadyRef.current?.();
  }, [heroReady]);

  // Track the mobile breakpoint so we can use a different ring size on phones.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  const visibleCount = isMobile
    ? initialSettings.visibleCountMobile
    : initialSettings.visibleCountDesktop;

  // Render in the admin's curated order (position).
  const localizedItems = useMemo(
    () => initialItems.map((item) => withLocaleHref(item, locale)),
    [initialItems, locale],
  );

  useEffect(() => {
    let cancelled = false;
    let readyMarked = false;

    const markHeroReady = () => {
      if (cancelled || readyMarked) return;
      readyMarked = true;
      window.requestAnimationFrame(() => {
        if (!cancelled) setHeroReady(true);
      });
    };

    const fallbackTimer = window.setTimeout(markHeroReady, 1800);

    // Wait on the images the carousel ACTUALLY RENDERS, not on the source URLs.
    //
    // This used to warm each `item.imageUrl` through `new window.Image()`. But
    // the cards display Next-OPTIMIZED variants (`/_next/image?...&w=640`), so
    // that warmed a completely different, full-resolution file — one the page
    // never displays. Measured on the homepage: 32 of 33 image requests had a
    // duplicate raw-original fetch alongside them, and every armed pane repeated
    // it for its own lineup. The gate was also waiting on the wrong files, so
    // readiness tracked a download that had nothing to do with what was painted.
    //
    // Querying the DOM is safe here: children commit before parent effects run,
    // so the Carousel's <img> elements already exist. The offscreen preloader is
    // excluded via its aria-hidden wrapper — those are the NEXT photos to cycle
    // in, and blocking the fade on them would hold the spinner far too long.
    //
    // ⚠️ FIRST TWO slots only, decode-awaited (2026-08-31) — keep in step with
    // the inline `nej-hero-go` script in (home)/page.tsx, which mirrors these
    // semantics pre-hydration. Waiting on ALL ring images meant the slowest of
    // eight always lost to the 1800ms cap on cold/stale loads, and the hero
    // unveiled with the second card (slot 1) blank. Slots 0-1 are the cards
    // actually facing the visitor at reveal and both are preloaded
    // (high/auto); the rest fade in edge-on where a late photo is invisible.
    // `decode()` prevents a loaded-but-undecoded blank frame at the reveal.
    const renderedImages = sectionRef.current
      ? Array.from(sectionRef.current.querySelectorAll('img'))
          .filter((img) => !img.closest('[aria-hidden="true"]'))
          .slice(0, 2)
      : [];

    const imagePromises = renderedImages.map((img) => {
      const loaded = img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          });
      return loaded.then(() => (img.decode ? img.decode().catch(() => undefined) : undefined));
    });
    const fontsReady = 'fonts' in document ? document.fonts.ready.catch(() => undefined) : Promise.resolve();

    Promise.allSettled([...imagePromises, fontsReady]).then(() => {
      window.clearTimeout(fallbackTimer);
      markHeroReady();
    });

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
    };
  }, [localizedItems, visibleCount]);

  // Drop the spinner from the DOM once it has finished fading.
  //
  // `.is-ready` only took it to opacity 0, which leaves an 800ms infinite
  // rotation running for the life of the page — measured: 3 still animating
  // (one per pane) long after the hero settled. Opacity does not stop an
  // animation; only removal or `display:none` does. Unmounting after the fade
  // keeps the transition intact rather than snapping the spinner away.
  const [spinnerMounted, setSpinnerMounted] = useState(true);
  useEffect(() => {
    if (!heroReady) return;
    const timer = window.setTimeout(() => setSpinnerMounted(false), SPINNER_FADE_MS + 80);
    return () => window.clearTimeout(timer);
  }, [heroReady]);

  return (
    <section
      ref={sectionRef}
      // No border here: the pane's edges travel through the pinned frame
      // during the parallax crossing, so the hero's bottom separator lives on
      // .home-hero-stack-frame instead of the slideshow section.
      className={`home-carousel-hero relative overflow-hidden ${heroReady ? 'is-ready' : ''}`}
      // The stack reads this element's inline background to paint the pinned
      // frame behind feathered crossing edges — keep it a plain inline style.
      style={{ background: backgroundColor }}
      data-customer-reveal-skip
    >
      {/* Loading spinner — fills the blank spot while the carousel data/images
          settle, and fades out the instant heroReady flips (no minimum show
          time). Hidden outright under prefers-reduced-motion, where the
          content below is already forced to opacity 1 with no fade to wait
          for. */}
      {spinnerMounted && (
        <div className="home-hero-loading" aria-hidden="true">
          <span className="home-hero-spinner" />
        </div>
      )}

      {/* Carousel background */}
      <div className="home-carousel-theme">
        <Carousel
          items={localizedItems}
          showPrice={initialSettings.showPrice}
          bg={DEFAULT_BG}
          reverse={reverseSpin}
          paused={paused}
          cardWidth={15.5}
          perspective={35}
          visibleCount={visibleCount}
        />
      </div>

      <style>{`
        .home-carousel-hero {
          min-height: calc(var(--app-vh) - var(--site-header-height));
        }

        .home-carousel-theme {
          opacity: 0;
        }

        /* Two triggers, ONE identical animation value — that identity is
           load-bearing. html.nej-hero-go is stamped by the inline script in
           (home)/page.tsx the moment pane A's card images settle (same
           image-wait + 1800ms cap as the React gate below), WITHOUT waiting
           for hydration. On throttled mobile, hydration is ~2.5s of the LCP
           render delay this pane used to pay: the LCP element is the front
           card image, and it painted only when React flipped .is-ready
           (measured on production 2026-08-23: render delay 7.4s of a 9.0s sim
           LCP). When .is-ready lands later, its animation shorthand computes
           to the SAME value, so the running animation is not restarted — do
           not let these two declarations drift apart.
           Scoped to pane A: panes B/C mount post-hydration behind the pinned
           frame and must keep waiting for their own .is-ready, or they would
           fade in at mount before their images exist.
           ⚠️ Reverted then RESTORED 2026-08-23: without this, PSI mobile is
           bimodal — usually ~80 but ~71 whenever the hydration-gated hero
           paint lands as a 9s LCP inside the trace (measured 71/80/80 across
           three post-revert runs). This stamp eliminates that failure mode. */
        html.nej-hero-go .home-hero-stack-pane--a .home-carousel-theme,
        .home-carousel-hero.is-ready .home-carousel-theme {
          animation: home-carousel-fade-in 760ms ease 260ms both;
        }

        @keyframes home-carousel-fade-in {
          from {
            opacity: 0;
            filter: blur(8px);
          }
          to {
            opacity: 1;
            filter: blur(0);
          }
        }

        /* Loading spinner — centered over the whole hero, above the (still
           invisible) carousel layer. Fades out as soon as .is-ready is added;
           no artificial minimum display time. */
        .home-hero-loading {
          position: absolute;
          inset: 0;
          z-index: 6;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          opacity: 1;
          transition: opacity 180ms ease;
        }
        html.nej-hero-go .home-hero-stack-pane--a .home-hero-loading,
        .home-carousel-hero.is-ready .home-hero-loading {
          opacity: 0;
        }
        .home-hero-spinner {
          width: 4.5rem;
          height: 4.5rem;
          border-radius: 9999px;
          border: 5px solid rgba(139, 108, 6, 0.18);
          border-top-color: #b48200;
          animation: home-hero-spin 800ms linear infinite;
        }
        @keyframes home-hero-spin {
          to {
            transform: rotate(360deg);
          }
        }

        /* Carousel scene: full height, transparent so the section color shows
           through, base scale. */
        .home-carousel-hero .home-carousel-theme > div:first-child {
          min-height: calc(var(--app-vh) - var(--site-header-height));
          block-size: calc(var(--app-vh) - var(--site-header-height));
          background: transparent !important;
          transform: scale(1.22);
          transform-origin: center center;
        }

        @media (min-width: 1024px) {
          .home-carousel-hero .home-carousel-theme > div:first-child {
            --cardW: clamp(26em, 29vw, 36em) !important;
            /* Keep the far side of the ring in front of the perspective plane.
               At the old value, wide cards could land almost on that plane,
               producing enormous transformed hitboxes that covered neighbors.
               This keeps the projection comfortably away from the camera plane
               even at the maximum desktop card width. */
            --perspective: 70em !important;
            transform: scale(1.42);
          }
        }

        @media (max-width: 640px) {
          .home-carousel-hero .home-carousel-theme > div:first-child {
            --cardW: clamp(12em, 56vw, 17em) !important;
            --perspective: 30em !important;
            /* Lifted higher (translateY -6svh -> -12svh) and trimmed a touch
               (scale 1.14 -> 1.06) so the ring clears the "Get first look"
               sign-up block on short viewports instead of sitting behind it. */
            /* var(--app-vh), not svh: an svh lift drifts the ring 14.9px
               while the frame holds still. */
            transform: translateY(calc(var(--app-vh) * -0.12)) scale(1.06);
            transform-origin: center 50%;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .home-hero-loading {
            display: none;
          }

          .home-carousel-theme {
            opacity: 1;
            filter: none;
            animation: none !important;
          }
        }
      `}</style>
    </section>
  );
}
