'use client';

// Static hero overlay: the headline, sign-up form, CTA buttons, and the top
// legibility halo. HomeHeroStack pins ONE of these over the two parallax
// slideshow panes, so while scrolling swaps the slideshows underneath, this
// layer stays exactly where it is until the whole frame breaks free.
//
// The light/dark text theme is controlled by the stack via the `dark` prop
// (driven by whichever slideshow currently dominates the frame); the elements
// transition between the two token sets.

import Link from 'next/link';
import { useEffect, useState, type CSSProperties, type MouseEvent } from 'react';
import HomeSubscriberForm from './HomeSubscriberForm';
import { VISIT_ANCHOR_ID } from '@/lib/home-anchors';

/**
 * Smooth-scroll to the in-page target, honouring reduced motion.
 *
 * ⚠️ Deliberately JS here rather than `scroll-behavior: smooth` on `html`.
 * That property applies to the scrolling container, so setting it globally
 * would also animate the scroll-to-top that happens on every route change —
 * a sitewide feel change to buy one button an animation.
 *
 * The `<a href="#...">` underneath is real: without JS, on a middle-click, or
 * from the keyboard's context menu, the browser's own jump still works. This
 * only upgrades the plain jump when it can.
 */
function scrollToAnchor(event: MouseEvent<HTMLAnchorElement>, id: string) {
  const target = document.getElementById(id);
  if (!target) return; // Let the browser try the default jump.
  event.preventDefault();
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  // `replaceState`, not `pushState`: the jump should not put an entry between
  // the visitor and whatever they were on before the homepage.
  window.history.replaceState(null, '', `#${id}`);
}

type Props = {
  locale: string;
  dark: boolean;
};

// Theme tokens consumed by the overlay; the elements transition between them.
const LIGHT_THEME: CSSProperties = {
  '--hero-fade': '255, 253, 247',
  '--hero-text': '#17130c',
  '--hero-eyebrow': '#8f6c06',
  '--hero-btn-color': '#7a5800',
  '--hero-btn-border': 'rgba(139, 103, 0, 0.55)',
  '--hero-btn-bg': 'rgba(180, 130, 0, 0.10)',
} as CSSProperties;

const DARK_THEME: CSSProperties = {
  '--hero-fade': '5, 5, 5',
  '--hero-text': '#f9f9f7',
  '--hero-eyebrow': '#e9c349',
  '--hero-btn-color': '#e9c349',
  '--hero-btn-border': 'rgba(233, 195, 73, 0.72)',
  '--hero-btn-bg': 'rgba(212, 175, 55, 0.14)',
} as CSSProperties;

// Compact-mode rule bodies ("Compact hero" in the styles below), shared by its
// width bands. They are interpolated into that style block, so its
// no-backticks rule applies inside these strings too.

/** Phones: eyebrow hidden, headline 1.5rem under the promo bar, tighter gaps. */
const COMPACT_PHONE_ROOM = `
            .home-hero-top > span { display: none; }
            .home-hero-top {
              top: 1.5rem;
              --hero-fit-room: calc(100cqh - 1.5rem - 1rem);
            }
            .home-hero-bottom { gap: 0.5rem; }
            .home-hero-newest { margin-top: 0; }`;

/** Phones: a slimmer Join the List button; Buy / Sell / Visit Us on one row. */
const COMPACT_PHONE_CONTROLS = `
            .home-subscriber-label { margin-bottom: 0.3rem; }
            .home-subscriber-join {
              height: 1.9rem;
              padding-inline: 0.9rem;
              font-size: 0.62rem;
            }
            .home-hero-actions {
              grid-template-columns: repeat(3, minmax(0, 1fr));
              width: 100%;
              gap: 0.4rem;
            }
            .home-hero-actions .hero-cta {
              padding-block: 0.4rem;
              padding-inline: 0.3rem;
              font-size: 0.62rem;
              letter-spacing: 0.1em;
            }
            .home-hero-actions .hero-cta:last-child {
              grid-column: auto;
              width: auto;
              justify-self: stretch;
            }
            .home-hero-newest { font-size: 0.72rem; }`;

/** Laptops: eyebrow hidden, tighter gaps, 1.5rem under the buttons. */
const COMPACT_DESKTOP_ROOM = `
            .home-hero-top > span { display: none; }
            .home-hero-top {
              --hero-fit-room: calc(2 * min(var(--hero-quarter), 100cqh - var(--hero-quarter) - 1.5rem));
            }
            .home-hero-bottom {
              margin-bottom: 1.5rem;
              gap: 0.75rem;
            }
            .home-hero-newest { margin-top: -0.25rem; }`;

/** Laptops: a shorter Join the List button, slimmer buttons. */
const COMPACT_DESKTOP_CONTROLS = `
            .home-subscriber-join { height: 2.25rem; }
            .home-hero-actions .hero-cta {
              padding-block: 0.4rem;
              min-width: 8rem;
            }`;

const COMPACT_PHONE = COMPACT_PHONE_ROOM + COMPACT_PHONE_CONTROLS;

/**
 * One compact-mode band: a viewport-width range and the HERO height at or below
 * which compact mode switches on. See "Compact hero" in the styles for how the
 * limits were measured.
 */
type CompactBand = {
  minWidth?: number;
  maxWidth?: number;
  maxHeroHeight: number;
  rules: string;
};

/**
 * Limits re-measured 2026-09-15 after the sign-up block became the caption +
 * ONE "Join the List" button (the three stacked phone fields are gone, so the
 * block is ~80px shorter and every limit fell). Same method as 09-13: a
 * headless-Chrome sweep of the live page with compact OFF (EN + ES, 84 widths
 * 320-1920 x 15 heights 340-620, measured only after the entrance animations
 * had finished); each limit is the HERO height of the tallest window that was
 * tight (under 16px) or overlapping, checked against every width in its band
 * (the limit must also sit below the height at which each width's tallest
 * tight window would reach 16px, so no window that fits is compacted).
 * Verified with a compact-ON sweep: CHANGELOG 2026-09-15.
 */

/** From 640px up the English and Spanish headlines behave the same. */
const COMPACT_BANDS_SHARED: CompactBand[] = [
  // Exactly 640: the phone layout (max-width: 640px) with the sm-sized button.
  { minWidth: 640, maxWidth: 640, maxHeroHeight: 328, rules: COMPACT_PHONE },
  { minWidth: 641, maxWidth: 767, maxHeroHeight: 388, rules: COMPACT_DESKTOP_ROOM + COMPACT_DESKTOP_CONTROLS },
  { minWidth: 768, maxHeroHeight: 392, rules: COMPACT_DESKTOP_ROOM + COMPACT_DESKTOP_CONTROLS },
];

/** English headline. */
const COMPACT_BANDS_EN: CompactBand[] = [
  { maxWidth: 349, maxHeroHeight: 393, rules: COMPACT_PHONE },
  { minWidth: 350, maxWidth: 618, maxHeroHeight: 353, rules: COMPACT_PHONE },
  { minWidth: 619, maxWidth: 639, maxHeroHeight: 318, rules: COMPACT_PHONE },
  ...COMPACT_BANDS_SHARED,
];

/** Spanish headline (wraps differently on narrow phones, so its edges differ). */
const COMPACT_BANDS_ES: CompactBand[] = [
  { maxWidth: 336, maxHeroHeight: 393, rules: COMPACT_PHONE },
  { minWidth: 337, maxWidth: 365, maxHeroHeight: 373, rules: COMPACT_PHONE },
  { minWidth: 366, maxWidth: 612, maxHeroHeight: 353, rules: COMPACT_PHONE },
  { minWidth: 613, maxWidth: 639, maxHeroHeight: 318, rules: COMPACT_PHONE },
  ...COMPACT_BANDS_SHARED,
];

function compactBandCss(band: CompactBand): string {
  const widths = [
    band.minWidth != null ? `(min-width: ${band.minWidth}px)` : '',
    band.maxWidth != null ? `(max-width: ${band.maxWidth}px)` : '',
  ].filter(Boolean).join(' and ');
  return `
        @media ${widths} {
          @container hero-overlay (max-height: ${band.maxHeroHeight}px) {${band.rules}
          }
        }`;
}

export default function HomeHeroOverlay({ locale, dark }: Props) {
  const isEs = locale === 'es';
  const storeHref = isEs ? '/es/shop' : '/shop';
  // The shop already sorted newest-first (`?sort=newest`, ShopSortSelect).
  // New listings are appended to the END of inventory order, so without this
  // a returning visitor never sees what just came in from the homepage.
  const newArrivalsHref = `${storeHref}?sort=newest`;

  // Reveal after fonts settle (mirrors the slideshow's is-ready fade timing);
  // a short fallback guarantees the text can never stay hidden.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let marked = false;
    const mark = () => {
      if (cancelled || marked) return;
      marked = true;
      window.requestAnimationFrame(() => {
        if (!cancelled) setReady(true);
      });
    };
    const fallbackTimer = window.setTimeout(mark, 1500);
    const fontsReady =
      'fonts' in document ? document.fonts.ready.catch(() => undefined) : Promise.resolve();
    Promise.resolve(fontsReady).then(() => {
      window.clearTimeout(fallbackTimer);
      mark();
    });
    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
    };
  }, []);

  const theme = dark ? DARK_THEME : LIGHT_THEME;

  const buttons = [
    { href: storeHref, label: isEs ? 'Comprar' : 'Buy' },
    { href: isEs ? '/es/estate-jewelry' : '/estate-jewelry', label: isEs ? 'Vender' : 'Sell' },
    // Third slot was Trade (-> /trade-in) until 2026-08-18. Now it jumps to the
    // "Call or Visit Us Today" block at the foot of this page — the showroom is
    // the thing the hero should be selling now, and that block carries the
    // phone number, the address, the hours and the map together.
    //
    // ⚠️ /trade-in is no longer linked from the hero. It is still in the footer
    // under "Sell to Us"; if the trade-in program needs a prominent entry
    // again, it needs a new home rather than this slot back.
    { href: `#${VISIT_ANCHOR_ID}`, label: isEs ? 'Visítenos' : 'Visit Us', anchor: true },
  ];

  return (
    <div
      className={`home-hero-overlay ${ready ? 'is-ready' : ''}`}
      style={theme}
      data-customer-reveal-skip
    >
      {/* Top halo for text legibility — two layers cross-fade so the color
          change is smooth (gradients can't transition; opacity can). */}
      <div className="home-top-fade home-top-fade--light" style={{ opacity: dark ? 0 : 1 }} aria-hidden="true" />
      <div className="home-top-fade home-top-fade--dark" style={{ opacity: dark ? 1 : 0 }} aria-hidden="true" />

      {/* Zone = the room above the sign-up block. The headline sizes itself
          to it on a short window (.home-hero-top-zone in the styles below). */}
      <div className="home-hero-top-zone">
        {/* Headline — centered in the top half, above the rotating pieces */}
        <div className="home-hero-top">
          {/* Eyebrow: a <span>, so it carries NO heading weight — which is why the
              PROMISE lives here and the keywords sit in the <h1> below. This is
              the pairing the owner settled on; it was briefly
              "We Buy & Sell Estate Jewelry and Watches" while the headline was
              brand copy, and reverted with the headline.

              ⚠️ It must put the knowing on US, not the customer.
              "Know What Yours Is Worth" was rejected for implying the visitor
              should already know what they have — most arrive holding something
              inherited and unidentified.

              ⚠️ Says nothing about the SERVICE MODEL, deliberately — and that
              foresight paid off: the showroom opened 2026-08-17 and 61 strings
              elsewhere had to be rewritten, while this one did not. Do not add
              "visit us", "mobile" or "by appointment" here now either. */}
          <span
            className="text-[0.75rem] font-bold uppercase tracking-[0.3em] block"
            style={{ color: 'var(--hero-eyebrow)', fontFamily: 'var(--font-label)' }}
          >
            {isEs ? 'Una Pieza o Todo un Patrimonio' : 'One Piece or an Entire Estate'}
          </span>
          {/* ⚠️ KEEP THIS SHORT — the length is load-bearing, not a style choice.
              At clamp(2.4rem, 8vw, 5.75rem) in a min(92vw, 52rem) box, measured
              line counts are: ~26-29 characters = 2 lines at every width (the
              profile this page has always had), 38 characters = 3 lines at both
              320px and 1280px+, 48 characters = 4 lines. Re-measure before
              lengthening; the full page title will NOT fit here.

              KEYWORDS, deliberately — location + both primary categories + buyer
              intent, in the one slot Google reads as the page's topic. The owner's
              stated priority (2026-08-16) is that the strongest signal on the site
              is that we BUY in Naples, and this is the only element that can carry
              it with heading weight.

              A brand-voice draft ("Pieces Worth Discovering") held this slot
              briefly and was reverted for exactly that reason. Its trade-off is
              worth remembering if the question comes round again: warmer copy, but
              the homepage then had no on-page topic signal at all.

              ⚠️ At 46 characters this is well past the ~29-char two-line budget.
              The headline block was widened to 72rem so it renders TWO lines on
              desktop; it is still THREE at phone and tablet widths, where 92vw
              binds before the cap. Accepted. Re-measure on any rewording and do
              not assume a line count — it now differs by breakpoint.

              ⚠️ Since 2026-09-13 the size also depends on window HEIGHT: on a
              short window the CSS fit shrinks this so it clears the sign-up
              form. That fit hardcodes this wording's measured widths (23.5 and
              12.6 in the headline fit rule below) — a longer headline needs them
              re-measured, or it can wrap onto a line the fit did not budget for.

              ⚠️ "Premier", not "Premiere" — the latter means a debut performance.
              `/silver-services` uses the same correct form; do not let a
              well-meaning edit reintroduce the typo in the site's largest text.

              ⚠️ One test survives every rewrite: hero copy must never imply the
              visitor should ALREADY know what they have. "Know What Yours Is
              Worth" was rejected for exactly that — most arrive holding something
              inherited and unidentified. */}
          <h1
            className="font-normal tracking-normal"
            style={{ fontFamily: 'var(--font-headline)', color: 'var(--hero-text)' }}
          >
            {isEs
              ? 'Compradores de Oro, Plata y Joyería en Naples'
              : 'Naples Premier Gold, Sterling & Jewelry Buyers'}
          </h1>
        </div>
      </div>

      {/* Sign-up + actions — centered in the open space below the pieces */}
      <div className="home-hero-bottom">
        <div className="flex w-full justify-center px-2" style={{ pointerEvents: 'auto' }}>
          <HomeSubscriberForm locale={locale} />
        </div>
        <div
          className="home-hero-actions flex flex-wrap justify-center gap-4 md:gap-5"
          style={{ pointerEvents: 'auto' }}
        >
          {buttons.map(({ href, label, anchor }) => {
            const className =
              'hero-cta inline-flex justify-center min-w-[9rem] md:min-w-[10rem] border px-8 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest';
            const style = {
              background: 'var(--hero-btn-bg)',
              borderColor: 'var(--hero-btn-border)',
              color: 'var(--hero-btn-color)',
              fontFamily: 'var(--font-label)',
              boxShadow: '0 0 18px rgba(212,175,55,0.12)',
              backdropFilter: 'blur(3px)',
            };

            // A plain <a> for the in-page jump, never <Link>. This is not a
            // route change: routing it would arm the route progress bar for a
            // navigation that never commits, leaving the bar to time out.
            return anchor ? (
              <a
                key={label}
                href={href}
                className={className}
                style={style}
                onClick={(event) => scrollToAnchor(event, VISIT_ANCHOR_ID)}
              >
                {label}
              </a>
            ) : (
              <Link key={label} href={href} className={className} style={style}>
                {label}
              </Link>
            );
          })}
        </div>
        {/* Option C (owner, 2026-09-10): the trio is untouched and "New Arrivals"
            is a quiet underlined line beneath it — deliberately NOT a fourth
            button (a four-up row was mocked and declined). A <Link>, because
            this IS a route change and should arm the progress bar. */}
        <Link
          href={newArrivalsHref}
          className="home-hero-newest"
          style={{ color: 'var(--hero-btn-color)', fontFamily: 'var(--font-label)', pointerEvents: 'auto' }}
        >
          {isEs ? 'Novedades' : 'New Arrivals'}
          <span aria-hidden="true"> →</span>
        </Link>
      </div>

      <style>{`
        /* The overlay is a pinned, click-transparent layer over the slideshow
           panes; the form and CTA wrappers opt back into pointer events. */
        /* Registered so 25cqh is computed ONCE, on the zone, against the
           overlay (a container query unit never queries its own element) and
           then inherited as a plain length. Unregistered, the token would
           re-resolve further down against the zone itself. */
        @property --hero-quarter {
          syntax: '<length>';
          inherits: true;
          initial-value: 0px;
        }

        .home-hero-overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
          /* Two rows: the headline zone gets whatever the sign-up block
             leaves. A size container so the zone can read its height. */
          display: grid;
          grid-template-rows: minmax(0, 1fr) auto;
          container-type: size;
          container-name: hero-overlay;
        }

        /* The space ABOVE the sign-up block, as a size container: the
           headline measures its room against this (100cqh) instead of
           assuming the top half is free. Size containment makes it a
           stacking context, so it carries the text's z-index itself —
           without it the headline would paint UNDER the halo layers. */
        .home-hero-top-zone {
          position: relative;
          grid-row: 1;
          min-height: 0;
          z-index: 5;
          pointer-events: none;
          container-type: size;
          --hero-quarter: 25cqh;
        }

        .home-hero-overlay .home-hero-top,
        .home-hero-overlay .home-hero-bottom {
          opacity: 0;
        }

        .home-hero-overlay.is-ready .home-hero-top {
          animation: home-hero-top-fade-in 720ms cubic-bezier(0.2, 0.8, 0.2, 1) 80ms both;
        }

        .home-hero-overlay.is-ready .home-hero-bottom {
          animation: home-hero-bottom-fade-in 720ms cubic-bezier(0.2, 0.8, 0.2, 1) 500ms both;
        }

        @keyframes home-hero-top-fade-in {
          from {
            opacity: 0;
            filter: blur(6px);
            transform: translateX(-50%) translateY(14px);
          }
          to {
            opacity: 1;
            filter: blur(0);
            transform: translateX(-50%) translateY(0);
          }
        }

        @keyframes home-hero-bottom-fade-in {
          from {
            opacity: 0;
            filter: blur(6px);
            transform: translateX(-50%) translateY(18px);
          }
          to {
            opacity: 1;
            filter: blur(0);
            transform: translateX(-50%) translateY(0);
          }
        }

        /* Top halo layers (cross-faded via inline opacity) */
        .home-top-fade {
          position: absolute;
          inset: 0;
          z-index: 4;
          pointer-events: none;
          transition: opacity 0.8s ease;
        }
        .home-top-fade--light {
          background:
            radial-gradient(ellipse 80% 55% at 50% 0%,
              rgba(255, 253, 247, 0.65) 0%, rgba(255, 253, 247, 0.25) 60%, transparent 100%),
            linear-gradient(to bottom, rgba(255, 253, 247, 0.35) 0%, transparent 45%);
        }
        .home-top-fade--dark {
          background:
            radial-gradient(ellipse 80% 55% at 50% 0%,
              rgba(5, 5, 5, 0.65) 0%, rgba(5, 5, 5, 0.25) 60%, transparent 100%),
            linear-gradient(to bottom, rgba(5, 5, 5, 0.35) 0%, transparent 45%);
        }

        /* Headline block — centered within the TOP HALF of the hero. */
        .home-hero-top {
          position: absolute;
          left: 50%;
          top: 0;
          height: 50%;
          /* 72rem (1152px), not the 52rem the sign-up block below still uses.
             Measured 2026-08-16: the 46-character headline needs 1152px to fall
             from three lines to two at the 5.75rem type cap — 1024px and 1100px
             are both still three. Widening buys a line back on desktop and
             nothing else: below roughly 1250px the 92vw term binds first, so
             phones and tablets are completely unaffected.

             ⚠️ Deliberately NOT applied to .home-hero-bottom. That block holds
             the subscriber form and the Buy/Sell/Trade buttons, and stretching
             an input row to 1152px makes it worse, not better. The two blocks
             being different widths is intended. */
          width: min(92vw, 72rem);
          transform: translateX(-50%);
          z-index: 5;
          pointer-events: none;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 0 1rem;
        }

        /* Sign-up + actions — centered in the open space BELOW the pieces.

           WARNING: var(--app-vh), never svh. These offsets position content
           INSIDE the pinned frame, and that frame is now stable — so an svh
           offset here moves the TEXT ALONE against a background that does not,
           which reads as more obviously broken than the whole page shifting.
           Owner reported exactly that on 2026-08-19. See DECISIONS,
           "svh is NOT stable in an in-app browser".

           NOTE: no backticks anywhere in this comment. It lives inside a
           styled-jsx template literal, so a backtick would END the string and
           surface as a bogus JSX parse error. */
        .home-hero-bottom {
          /* In flow in the overlay's second row, held off the bottom by its
             margin — the same place the old absolute bottom offset put it
             (measured identical at 14 window sizes, 2026-09-13) — so the row
             above it knows how much room is left. */
          position: relative;
          grid-row: 2;
          left: 50%;
          margin-bottom: clamp(5rem, calc(var(--app-vh) * 0.15), 10rem);
          width: min(92vw, 52rem);
          transform: translateX(-50%);
          z-index: 5;
          pointer-events: none;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.5rem;
        }

        /* Smooth color cross-fade in sync with the background */
        .home-hero-top span,
        .home-hero-top h1 {
          transition: color 0.8s ease, text-shadow 0.8s ease;
        }
        .hero-cta {
          transition: background 0.8s ease, border-color 0.8s ease, color 0.8s ease, scale 0.2s ease;
        }
        .hero-cta:hover { scale: 1.04; }

        /* "New Arrivals" text link under the trio. Pulled up against the
           buttons (the column gap is sized for form → buttons, not for a
           caption), underlined so it reads as a link over any photo. */
        .home-hero-newest {
          margin-top: -0.6rem;
          font-size: 0.85rem;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-decoration: underline;
          text-underline-offset: 4px;
          text-decoration-color: color-mix(in srgb, currentColor 55%, transparent);
          text-shadow: 0 1px 12px rgba(var(--hero-fade), 0.9);
          transition: color 0.8s ease, text-decoration-color 0.2s ease;
        }
        .home-hero-newest:hover { text-decoration-color: currentColor; }

        .home-hero-top > span {
          margin-bottom: 1.25rem;
        }

        .home-hero-top h1 {
          font-size: clamp(2.4rem, 8vw, 5.75rem);
          /* 1.15, not the 0.95 this used to be. 0.95 advances the baseline LESS
             than the font's own ink needs, so on a two-line headline the
             descenders of line 1 collided with the ascenders of line 2 — the
             "p" of "Naples" landed on the "i" of "Sterling" (owner spotted it).

             Measured at the 5.75rem cap (92px): line 2 needs 77px of ascender
             and line 1 drops a 23px descender = 100px of ink, against an 87.4px
             advance — a 12.6px overlap. Anything below 1.09 still collides;
             1.1 clears by only 1.2px, which a font-fallback swap could erase.
             ⚠️ Do not tighten this back below ~1.1 without re-measuring the ink,
             and note the ratio applies at EVERY size, so the collision existed
             on phones too, just less visibly. */
          line-height: 1.15;
          margin: 0;
          /* Room for the descender tails INSIDE the box, cancelled by the
             margin so nothing moves. At 1.15 the font's tails (g, J, y) hang
             about 0.04em below the last line box, and Safari crops the
             entrance animation's blurred layer to the line boxes: on load the
             tips were cut off, then popped in near the end of the fade (owner,
             2026-10-18, seen on a phone; reproduced in WebKit). The padding
             puts them inside the layer. Do not drop it, and keep the two
             values equal or the headline shifts. */
          padding-bottom: 0.15em;
          margin-bottom: -0.15em;
          text-shadow: 0 2px 24px rgba(var(--hero-fade), 0.9);
        }

        /* Headline fit (owner, 2026-09-13, "Option A"): on a short window
           the headline SHRINKS IN PLACE so it never reaches the sign-up
           form. Its position does not change; only its size.

           Room = a band centered where the headline is centered (a quarter
           of the overlay down), as tall as it can be without coming within
           1.5rem of the zone's bottom, less the eyebrow (18px + 1.25rem).
           The size is the LARGEST of three fits, each capped by the width
           its line count needs, so it never budgets for fewer lines than it
           renders: one line (unwrapped, the headline measures 22.4em EN and
           22.1em ES; 23.5 leaves margin), two lines (12.6, from the
           1152px-for-two-lines measurement plus margin), three lines (no
           width cap; 8vw already holds it to three). Then the old caps still
           apply — never above 8vw or 5.75rem — so a window with room renders
           exactly as it did.

           Before this, 1024x609 overlapped the form by 92px and 1366x657 by
           28px. Inside @supports so a browser without container units keeps
           the plain clamp above. */
        @supports (height: 1cqh) {
          .home-hero-top {
            /* Twice the registered quarter = half the OVERLAY, as before the
               zone existed; the 50% above would now be half the zone. */
            height: calc(var(--hero-quarter) * 2);
            --hero-fit-room: calc(2 * min(var(--hero-quarter), 100cqh - var(--hero-quarter) - 1.5rem) - 2.4rem);
            --hero-fit-measure: calc(min(92vw, 72rem) - 2rem);
          }

          .home-hero-top h1 {
            font-size: clamp(
              1.5rem,
              min(
                8vw,
                max(
                  min(var(--hero-fit-room) / 1.15, var(--hero-fit-measure) / 23.5),
                  min(var(--hero-fit-room) / 2.3, var(--hero-fit-measure) / 12.6),
                  var(--hero-fit-room) / 3.45
                )
              ),
              5.75rem
            );
          }
        }

        @media (max-width: 640px) {
          /* Headline near the top (nudged down a touch). */
          .home-hero-top {
            /* var(--app-vh), not svh — moved the headline 13.6px on its own. */
            top: clamp(3rem, calc(var(--app-vh) * 0.11), 6rem);
            height: auto;
            justify-content: flex-start;
          }

          .home-hero-top > span {
            margin-bottom: 0.6rem;
          }

          .home-hero-top h1 {
            font-size: clamp(1.9rem, 7vw, 2.5rem);
          }

          /* Phone fit: here the headline is anchored at the top offset, not
             centered, so its room runs from that offset to 1rem above the
             zone's bottom, less the eyebrow (18px + 0.6rem). Two lines only
             when the width guarantees it, otherwise three. Floor 1.5rem: an
             iPhone SE in Safari (375x552) still overlaps at the floor —
             shortening the headline is the fix there, not smaller type. */
          @supports (height: 1cqh) {
            .home-hero-top {
              --hero-fit-room: calc(100cqh - clamp(3rem, calc(var(--app-vh) * 0.11), 6rem) - 1rem - 1.75rem);
            }

            .home-hero-top h1 {
              font-size: clamp(
                1.5rem,
                min(
                  7vw,
                  max(
                    min(var(--hero-fit-room) / 2.3, var(--hero-fit-measure) / 12.6),
                    var(--hero-fit-room) / 3.45
                  )
                ),
                2.5rem
              );
            }
          }

          /* Sign-up + actions anchored to the bottom of the hero so the last
             CTA button (Visit Us) always stays inside it (with a small gap
             before the next section) regardless of viewport height /
             browser-chrome changes. */
          .home-hero-bottom {
            /* A margin, not a bottom offset: the block is in flow now, where
               a bottom offset would shift it up on top of the desktop margin
               (measured: the form jumped 99px at 390x664). */
            margin-bottom: clamp(1rem, calc(var(--app-vh) * 0.03), 2rem);
            gap: 0.85rem;
          }

          /* Two up, one down — STRUCTURAL, not a side effect of what fits.
             As a wrapping flex row this was two-plus-one only while two 9rem
             buttons plus the 1rem gap fitted the line; below about 336px of
             row width that failed and all three silently became separate
             rows (measured: 294px of row at a 320px viewport against the
             304px the pair needed). A two-column grid decides the count up
             front, so the narrowest phone gets the same arrangement as a
             wide one. */
          .home-hero-actions {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.75rem;
            /* Capped so the columns land on the same 9rem the buttons already
               used, rather than stretching to fill a 640px viewport. */
            width: min(100%, 18.75rem);
            margin-inline: auto;
          }

          /* The grid track owns the width now. Without this the 9rem minimum
             would overflow its column on a narrow phone instead of shrinking. */
          .home-hero-actions .hero-cta {
            min-width: 0;
            padding-inline: 0.75rem;
          }

          /* The odd button spans both tracks and centres at ONE track's width
             (50% of the full span, less half the gap), so it sits directly
             under the pair at matching width rather than stretching double. */
          .home-hero-actions .hero-cta:last-child {
            grid-column: 1 / -1;
            justify-self: center;
            width: calc(50% - 0.375rem);
          }

          .home-hero-newest {
            margin-top: -0.25rem;
            font-size: 0.78rem;
          }
        }

        /* Compact hero (owner, 2026-09-13): ONLY on a hero too short for the
           headline to clear the sign-up form. The eyebrow is hidden (and the
           fit stops reserving its space), the sign-up block's gaps tighten,
           on laptops the space under the buttons drops to 1.5rem ("Choice
           A"); a phone headline starts 1.5rem under the promo bar ("option
           1"); and the form fields and buttons shrink (owner: smaller
           controls only where the hero does not fit today). A hero that
           already fits is untouched. The rule bodies are the COMPACT_*
           constants at the top of this file.

           The limits are HERO heights, one table per headline language
           (COMPACT_BANDS_EN / COMPACT_BANDS_ES at the top of this file — each
           page renders only its own). Each was set from a sweep of the live
           page at the tallest window where the previous layout was tight
           (under 16px) or overlapping and below the first height where it
           fit, so nothing that fit gains compact mode. The two headlines wrap
           differently only on narrow phones, which is why the tables differ
           there and match from 431px up. Narrow widths that were not measured
           keep the neighbouring limit that cannot change a fitting screen.

           ⚠️ A container query on the overlay, never a max-height media query:
           the overlay height comes from the frozen --app-vh, while a media
           query follows the live window height, which a mobile toolbar moves
           mid-scroll — the hero would flip modes while the visitor scrolls.
           Source order matters: these must stay after every rule they
           override, including the phone fit above. */
        ${(isEs ? COMPACT_BANDS_ES : COMPACT_BANDS_EN).map(compactBandCss).join('\n')}

        @media (prefers-reduced-motion: reduce) {
          .home-hero-overlay .home-hero-top,
          .home-hero-overlay .home-hero-bottom {
            opacity: 1;
            filter: none;
            animation: none !important;
            transform: translateX(-50%);
          }
        }
      `}</style>
    </div>
  );
}
