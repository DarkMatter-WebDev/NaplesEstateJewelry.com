"use client";

// Storefront 3D carousel. Renders the admin-curated selection from Supabase.
// Background color and the price caption are controlled by the admin's saved
// settings (white background + images-only by default).
//
// Usage in a page:
//   import { Carousel } from "@/components/Carousel";
//   <Carousel />
//
// Override the saved settings (e.g. for previews):
//   <Carousel showPrice bg="#fff3ed" />
//
// Or pass items yourself to bypass the Supabase fetch entirely:
//   <Carousel items={myItems} showPrice bg="#ffffff" />

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import styles from "./Carousel.module.css";
import {
  fetchSelectedItems,
  fetchSettings,
  type CarouselItem,
} from "../lib/carouselData";
import { DEFAULT_BG } from "../lib/carouselConfig";
import { carouselImageLoading } from "@/lib/storefront-image-loading";
import {
  createFrameGuard,
  freezeHero,
  isFrameGuardDisabled,
  isHeroFrozen,
} from "@/lib/hero-frame-guard";

type Props = {
  /** Provide items directly to bypass the Supabase fetch. */
  items?: CarouselItem[];
  /** Force the price caption on/off. If omitted, uses the saved setting. */
  showPrice?: boolean;
  /** Force the background color. If omitted, uses the saved setting. */
  bg?: string;
  /** Seconds per full rotation. */
  spin?: number;
  /**
   * Spin the ring the opposite way, so photos flow LEFT-TO-RIGHT across the
   * front instead of the default right-to-left. Used by the hero's second
   * slideshow. The per-frame sample corrects its derived angle and its
   * hidden-back crossing test to match the reversed animation.
   */
  reverse?: boolean;
  /**
   * Hard pause from the owner, for callers that already know whether this
   * carousel is on screen. The IntersectionObserver below cannot be made
   * airtight inside the pinned hero stack: a pane's box always grazes the
   * viewport there, so `isIntersecting` never flips and the `0` threshold can
   * never fire — a pane sliding from ratio 0.004 to 0 crosses no rung and would
   * keep spinning offscreen. `HomeHeroStack` computes on/offscreen exactly
   * (it is the thing applying the transforms), so it passes it in.
   * When true the ring and the per-frame loop stop regardless of geometry.
   */
  paused?: boolean;
  /** Base card width in em. */
  cardWidth?: number;
  /** Card aspect ratio, e.g. "1 / 1" (square, default) or "7 / 10" (portrait). */
  aspect?: string;
  /** Perspective in em (smaller = more extreme). */
  perspective?: number;
  /**
   * Max cards rendered on the ring at once. When the list is longer than this,
   * the carousel becomes a windowed/infinite ring: only this many cards exist
   * (on a tight, intimate radius), and the long list cycles through them as
   * cards pass the hidden back. Keeps the close "few-item" feel at any length.
   */
  visibleCount?: number;
};

// The per-frame background sweep (`computeSweepBackground`, and the
// `onFrontItemChange` / `onBackgroundChange` callbacks that carried it out)
// was removed 2026-08-09: the hero now paints ONE solid admin-chosen color per
// slideshow instead of following each photo's backdrop to the front. A lineup
// mixing white- and black-backdrop pieces made the whole background flip back
// and forth as the ring turned. Per-CARD padding (`--card-bg` below) is a
// separate feature and stays.

/**
 * Encode quality for ring cards AND the offscreen preloader — they must match,
 * or the preloader warms a variant the card never requests and every photo is
 * fetched twice.
 *
 * 90 -> 82 (2026-08-09). The cards only ever request w=640, so the source is
 * downscaled hard before quality is applied and 90 was buying detail at a size
 * too small to show it. Must be listed in `images.qualities` in next.config.ts;
 * an unlisted value is served as an error rather than clamped.
 */
const CARD_IMAGE_QUALITY = 82;

/**
 * Thresholds for the offscreen-pause observer. A single `0` threshold only
 * fires when `isIntersecting` flips, which never happens for a pane inside the
 * pinned hero stack — so the observer fired once per mount and the pause guard
 * was dead. The ladder is deliberately dense near zero, because that is where a
 * pane enters and leaves; the coarse upper rungs just avoid needless callbacks
 * while a slideshow sits fully on screen.
 */
const VISIBILITY_THRESHOLDS = [0, 0.005, 0.01, 0.02, 0.04, 0.08, 0.15, 0.3, 0.6, 1];

/**
 * Upcoming photos are decoded BEFORE they come round to the front
 * (2026-11-18, owner on iPhone: "i see the stutter just once, when the first
 * new photo from the carousel comes onto the screen"). A browser decodes an
 * image when it first paints it; a card that has just swapped its photo at the
 * hidden back is not painted until it swings into view (~8 s later), so the
 * first never-before-shown photo was decoded on the spot — at 1080 px on a 3×
 * iPhone — and held a frame. `decode()` does that work while the card is still
 * hidden. Used on the ring cards AND the offscreen preloader (same URL → same
 * decoded image). Failures are ignored: the photo still paints as before.
 */
function decodeAhead(event: { currentTarget: HTMLImageElement }) {
  event.currentTarget.decode?.().catch(() => undefined);
}

/**
 * The offscreen preloader mounts this long after the page's `load` event, and
 * only once its slideshow is live, so warming the NEXT photos never competes
 * with the photos the visitor is waiting for (or with an offscreen pane).
 */
const PRELOAD_ARM_DELAY_MS = 1500;

export function Carousel({
  items,
  showPrice,
  bg,
  spin = 32,
  reverse = false,
  paused = false,
  cardWidth = 17.5,
  aspect = "1 / 1",
  perspective = 35,
  visibleCount = 6,
}: Props) {
  const ringRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  // Only the self-fetched (uncontrolled) items live in state. In controlled
  // mode the `items` prop is the source of truth and is read directly during
  // render below, so a later items change (e.g. async-loaded selection)
  // renders immediately without mirroring props into state via an effect.
  const [fetched, setFetched] = useState<CarouselItem[]>([]);
  const [priceOn, setPriceOn] = useState<boolean>(showPrice ?? false);
  const [bgColor, setBgColor] = useState<string>(bg ?? DEFAULT_BG);
  const [error, setError] = useState<string | null>(null);

  // ---- Weak-machine freeze (2026-08-24) --------------------------------------
  // The spinning ring re-composites every card layer every frame; on a weak or
  // software-rendered GPU that is a sustained 10–20fps no matter what the JS
  // does. `hero-frame-guard` watches real frame cadence inside the rAF loop
  // below and, once a machine proves it cannot keep up, freezes the ring — a
  // still 3D arrangement, cards clickable, hero handover intact. The verdict is
  // a per-session latch shared by every Carousel instance, so later panes and
  // later page views freeze immediately instead of re-measuring.
  //
  // Both initializers read browser state lazily: on the server they fall to
  // `false`, and a client whose first render disagrees is harmless because
  // neither value appears in the markup — they only steer effects. (This is
  // why there is no hydration hazard despite the asymmetric init.)
  // `reducedMotion` folds prefers-reduced-motion into the same freeze path:
  // the CSS pause in Carousel.module.css covers pre-hydration, but the inline
  // `animationPlayState = 'running'` the observer writes below would stomp it
  // after hydration — so JS has to know about it too, and stopping the rAF
  // loop for a ring that cannot move is free battery anyway.
  const [fpsFrozen, setFpsFrozen] = useState(() => isHeroFrozen());
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const hardPaused = paused || fpsFrozen || reducedMotion;

  // Preloader arming (see PRELOAD_ARM_DELAY_MS). One-way: once armed it stays
  // mounted, so a pane that scrolls away and back keeps its warmed photos.
  const [preloadArmed, setPreloadArmed] = useState(false);
  useEffect(() => {
    if (preloadArmed || paused) return;
    let timer = 0;
    const arm = () => {
      timer = window.setTimeout(() => setPreloadArmed(true), PRELOAD_ARM_DELAY_MS);
    };
    if (document.readyState === "complete") arm();
    else window.addEventListener("load", arm, { once: true });
    return () => {
      window.removeEventListener("load", arm);
      window.clearTimeout(timer);
    };
  }, [preloadArmed, paused]);

  useEffect(() => {
    if (items) return; // controlled mode: caller supplies the items
    let cancelled = false;
    fetchSelectedItems()
      .then((rows) => !cancelled && setFetched(rows))
      .catch((e) => !cancelled && setError(e.message ?? String(e)));
    return () => {
      cancelled = true;
    };
  }, [items]);

  const data = items ?? fetched;

  useEffect(() => {
    // Skip the settings fetch only if BOTH are forced via props.
    if (showPrice !== undefined && bg !== undefined) return;
    let cancelled = false;
    fetchSettings()
      .then((s) => {
        if (cancelled) return;
        if (showPrice === undefined) setPriceOn(s.showPrice);
        if (bg === undefined) setBgColor(s.bgColor);
      })
      .catch(() => {}); // missing settings just means defaults
    return () => {
      cancelled = true;
    };
  }, [showPrice, bg]);

  // ---- Windowed / infinite ring --------------------------------------------
  // When the list is longer than `visibleCount`, only that many cards live on
  // the ring (a tight, intimate radius). Each slot's photo advances by
  // `effectiveVisible` as it passes the hidden back, so the whole list cycles
  // past the camera while the close few-item look stays constant.
  const effectiveVisible = Math.min(visibleCount, Math.max(data.length, 1));

  // slotItems[p] = index into `data` currently shown by ring slot p.
  const windowKey = `${data.length}:${effectiveVisible}`;
  const initialSlotItems = useMemo(() => {
    const len = Math.max(data.length, 1);
    return Array.from({ length: effectiveVisible }, (_, p) => p % len);
  }, [data.length, effectiveVisible]);

  const [slotItemsState, setSlotItemsState] = useState<{ key: string; items: number[] }>(() => ({
    key: windowKey,
    items: initialSlotItems,
  }));
  const slotItems = slotItemsState.key === windowKey ? slotItemsState.items : initialSlotItems;

  // Always-fresh refs so the single rAF loop below reads the latest values
  // without re-subscribing (re-subscribing mid-animation caused stale closures).
  const dataRef = useRef(data);
  const slotItemsRef = useRef(slotItems);
  const windowKeyRef = useRef(windowKey);
  const prevSlotAnglesRef = useRef<number[]>([]);
  // The ring's CSS animation + its duration, cached. `getAnimations()` allocates
  // an array and its `getComputedTiming()` was being called twice per frame, per
  // carousel. The Animation object is stable for the life of the animation, so
  // it is re-queried only when the cache is empty or the cached one has gone
  // idle (which is what a restarted/replaced animation looks like).
  const ringAnimRef = useRef<{ anim: Animation; duration: number } | null>(null);
  // Last facing/z-index written per slot, so unchanged frames skip the DOM write
  // entirely. These were written for every card on every frame, which is a style
  // invalidation per card per frame for values that change only a few times a
  // second.
  const prevFacingRef = useRef<string[]>([]);
  const prevZRef = useRef<string[]>([]);
  const startedAtRef = useRef(0);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    slotItemsRef.current = slotItems;
  }, [slotItems]);

  // Reset the imperative window state whenever the list length or visible count
  // changes. Render uses `initialSlotItems` immediately for the new key, so this
  // effect only resets refs used by the animation loop.
  useEffect(() => {
    windowKeyRef.current = windowKey;
    slotItemsRef.current = initialSlotItems;
    prevSlotAnglesRef.current = [];
    // The write-on-change caches below must be cleared with the window: the
    // cards are re-created for the new key, so a stale cache would make the loop
    // skip the write a fresh card still needs.
    prevFacingRef.current = [];
    prevZRef.current = [];
    ringAnimRef.current = null;
    startedAtRef.current = typeof performance !== "undefined" ? performance.now() : 0;
  }, [windowKey, initialSlotItems]);

  // Per-frame sample: advance the window as slots cross the hidden back, and
  // keep each card's facing/z-index current for 3D hit testing. Reads the live
  // CSS-animation clock so it stays in sync even under reduced-motion.
  const sample = useCallback(() => {
    const ring = ringRef.current;
    const items = dataRef.current;
    const slots = slotItemsRef.current;
    const n = items.length;
    const ev = slots.length;
    if (!ring || n === 0 || ev === 0) return;

    let ringAngle = 0;
    let cached = ringAnimRef.current;
    // Re-query only when there is nothing cached or the cached animation is no
    // longer live; otherwise reuse it. `playState` is a cheap property read,
    // unlike getAnimations() + getComputedTiming() every frame.
    if (!cached || cached.anim.playState === "idle") {
      const anims = ring.getAnimations?.() ?? [];
      const found = anims.find((a) => {
        const d = a.effect?.getComputedTiming?.().duration;
        return typeof d === "number" && d > 0;
      });
      cached = found
        ? { anim: found, duration: Number(found.effect!.getComputedTiming().duration) }
        : null;
      ringAnimRef.current = cached;
    }
    if (cached && cached.anim.currentTime != null) {
      const { duration } = cached;
      ringAngle =
        (((Number(cached.anim.currentTime) % duration) + duration) % duration / duration) * 360;
    } else {
      const elapsed = (performance.now() - startedAtRef.current) / 1000;
      ringAngle = (elapsed / spin) * 360;
    }
    // animation-direction: reverse negates the applied rotation, but the
    // animation clock above still counts forward — mirror the angle so all
    // geometry below (backface, windowing) matches what is actually on screen.
    if (reverse) ringAngle = (360 - (ringAngle % 360)) % 360;

    const step = 360 / ev;
    const cycle = n > ev;
    const prev = prevSlotAnglesRef.current;
    let nextSlots: number[] | null = null;

    for (let p = 0; p < ev; p++) {
      let a = (ringAngle + p * step) % 360;
      if (a < 0) a += 360; // [0, 360)
      const rad = (a * Math.PI) / 180;
      // A back-facing 3D card can still have a very large projected box while
      // it passes behind the camera. Keep those hidden planes out of hit
      // testing so they cannot cover a card that is actually visible.
      const card = ring.children[p] as HTMLElement | undefined;
      const depth = Math.cos(rad);
      // Not `> 0`: a card within a few degrees of edge-on projects as a sliver
      // (axe measured 13.8px wide) that is visually unreadable but was still a
      // full-sized click/tab target — flagged under WCAG target-size. Treating
      // the near-edge band as "back" hands those degenerate targets the same
      // pointer-events/tab-order exclusion; 0.1 ≈ 84°, so every card a user
      // could actually recognize stays clickable.
      const isFrontFacing = depth > 0.1;
      if (card) {
        // Write only on change. The values are identical across most frames, and
        // an unconditional write invalidates style for every card every frame.
        // The z-index is already quantised by the Math.round below, so it holds
        // steady for several frames at a time.
        const facing = isFrontFacing ? "front" : "back";
        if (prevFacingRef.current[p] !== facing) {
          prevFacingRef.current[p] = facing;
          card.dataset.carouselFacing = facing;
          // Back-facing link cards are pointer-events:none but were still real
          // tab stops with real accessible names — a keyboard user could focus
          // a card that is visually reversed behind the ring, and axe flagged
          // the hidden planes under target-size. Keep them out of the tab order
          // and the accessibility tree while they face away; both attributes
          // are cleared the moment the card swings back to the front.
          if (facing === "back") {
            card.setAttribute("tabindex", "-1");
            card.setAttribute("aria-hidden", "true");
          } else {
            card.removeAttribute("tabindex");
            card.removeAttribute("aria-hidden");
          }
        }
        // When front cards overlap in projection, the card closest to the
        // viewer must win hit testing just as it wins visual stacking.
        const z = isFrontFacing ? String(Math.round((depth + 1) * 100)) : "-1";
        if (prevZRef.current[p] !== z) {
          prevZRef.current[p] = z;
          card.style.zIndex = z;
        }
      }
      // Advance this slot's photo as it crosses the hidden back (180deg).
      // Angles grow over time on a forward ring and shrink on a reversed one,
      // so the crossing is detected in the matching direction.
      const pa = prev[p];
      const crossedBack = reverse ? pa != null && pa >= 180 && a < 180 : pa != null && pa < 180 && a >= 180;
      if (cycle && crossedBack) {
        if (!nextSlots) nextSlots = slots.slice();
        nextSlots[p] = (slots[p] + ev) % n;
      }
      prev[p] = a;
    }

    if (nextSlots) {
      slotItemsRef.current = nextSlots;
      setSlotItemsState({ key: windowKeyRef.current, items: nextSlots });
    }
  }, [spin, reverse]);

  // Continuous tracking while the animation runs — but only while the carousel
  // is on screen. An IntersectionObserver pauses the CSS spin and stops the rAF
  // loop when the hero scrolls out of view, so item count barely affects scroll
  // performance (and it saves battery). Both resume when it scrolls back in.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    let raf = 0;
    let running = false;
    // One guard per effect run. Its warm-up clock starts at its FIRST frame —
    // for panes B/C that is when they first become visible, not at mount — and
    // an IO stop/start gap shows up as one huge delta, which the guard discards.
    const guardDisabled = isFrameGuardDisabled();
    const guard = createFrameGuard();
    const loop = (now: number) => {
      sample();
      // A sibling carousel may have tripped the shared latch (or the owner
      // soft-navigated in with ?heroFreeze=1); converge on it rather than keep
      // spinning choppily next to a frozen pane. Deliberately does NOT call
      // freezeHero() — only a genuine trip below writes the session latch, so
      // a forced preview can never latch itself permanent.
      if (isHeroFrozen()) {
        setFpsFrozen(true);
        running = false;
        return;
      }
      if (!guardDisabled && guard.frame(now)) {
        freezeHero();
        setFpsFrozen(true);
        // No next frame: the state flip re-runs this effect into the paused
        // branch, which also pauses the CSS animation.
        running = false;
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    // NOTE (2026-08-06): this guard was silently dead inside the pinned hero
    // stack, measured rather than assumed. Two separate reasons, both required
    // fixing — either alone still leaves every slideshow running forever:
    //
    //   1. `entry.isIntersecting` is TRUE for a ZERO-AREA intersection. Every
    //      pane's scene box grazes the viewport at all times inside the sticky,
    //      overflow-hidden frame, so it reported `true` at every scroll position
    //      for every pane — it never once returned false. Gate on real
    //      intersected AREA instead.
    //   2. With `threshold: 0` the observer fires only when `isIntersecting`
    //      flips. Since it never flipped, the callback ran exactly ONCE per
    //      mount and never again. A threshold ladder makes it re-fire as a pane
    //      crosses, so pausing/resuming actually tracks the crossing.
    //
    // Measured effect: 3 rAF loops at every scroll position -> 1 while a
    // slideshow is holding, 2 only mid-crossing (when both really are visible).
    // An explicit `paused` from the owner wins outright: stop and do not even
    // observe, so no late geometry callback can restart an offscreen ring.
    // `hardPaused` folds in the weak-machine freeze latch and reduced-motion,
    // which take the identical path: CSS animation paused, no rAF loop.
    if (hardPaused) {
      const ring = ringRef.current;
      if (ring) ring.style.animationPlayState = 'paused';
      stop();
      return stop;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        const { width, height } = entry.intersectionRect;
        const visible = width > 0 && height > 0;
        const ring = ringRef.current;
        if (ring) ring.style.animationPlayState = visible ? 'running' : 'paused';
        if (visible) start();
        else stop();
      },
      { threshold: VISIBILITY_THRESHOLDS },
    );
    io.observe(scene);

    return () => {
      io.disconnect();
      stop();
    };
    // data.length so the observer (re)attaches when the ring first mounts (0 -> N).
  }, [sample, data.length, hardPaused]);

  // Fire immediately whenever the items change (initial paint, or reduced-motion
  // where rAF may not advance) so every card's facing/z-index is correct even
  // before the first animation frame.
  useEffect(() => {
    sample();
  }, [sample, data]);

  const showThePrice = showPrice ?? priceOn;
  const theBg = bg ?? bgColor;

  const sceneStyle = {
    "--spin": `${spin}s`,
    "--cardW": `${cardWidth}em`,
    "--ar": aspect,
    "--bg": theBg,
    "--perspective": `${perspective}em`,
  } as CSSProperties;

  if (error) {
    return (
      <div className={styles.scene} style={sceneStyle}>
        <p className={styles.empty}>Couldn’t load carousel: {error}</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={styles.scene} style={sceneStyle}>
        <p className={styles.empty}>No featured pieces selected yet.</p>
      </div>
    );
  }

  // The next photo each slot will show when it next crosses the back. Preload
  // these (off-screen) so they're decoded before they swap in — no pop-in.
  const preloadItems =
    data.length > effectiveVisible
      ? (() => {
          const seen = new Set(slotItems);
          const out: CarouselItem[] = [];
          for (const s of slotItems) {
            const next = (s + effectiveVisible) % data.length;
            if (!seen.has(next)) {
              seen.add(next);
              const item = data[next];
              if (item) out.push(item);
            }
          }
          return out;
        })()
      : [];

  return (
    <div ref={sceneRef} className={styles.scene} style={sceneStyle} aria-label="Featured jewelry carousel">
      <div
        ref={ringRef}
        className={styles.ring}
        style={{ "--n": effectiveVisible, animationDirection: reverse ? "reverse" : undefined } as CSSProperties}
      >
        {slotItems.map((itemIndex, slot) => {
          const item = data[itemIndex];
          if (!item) return null;
          // `paused` is the owner's on/offscreen signal, so it doubles as the
          // "this pane is parked" hint for fetch priority.
          const imageLoading = carouselImageLoading(slot, paused);
          const inner = (
            <>
              <Image
                className={styles.img}
                src={item.imageUrl}
                alt={item.name}
                fill
                // Each card renders far smaller than the source; this tells the
                // optimizer the display size so it ships a right-sized AVIF/WebP
                // instead of the full-resolution original.
                sizes="(max-width: 640px) 80vw, (max-width: 1024px) 50vw, 35vw"
                quality={CARD_IMAGE_QUALITY}
                loading={imageLoading.loading}
                fetchPriority={imageLoading.fetchPriority}
                // Fires again for each photo swapped in at the hidden back.
                onLoad={decodeAhead}
                draggable={false}
              />
              {showThePrice && item.priceLabel && (
                <span className={styles.caption}>{item.priceLabel}</span>
              )}
            </>
          );

          // Keyed by SLOT (not item) so cards persist as their photo cycles —
          // the ring keeps spinning and only the image swaps (at the back).
          const cardStyle = {
            "--i": slot,
            ...(item.bgColor ? { "--card-bg": item.bgColor } : {}),
          } as CSSProperties;

          return item.href ? (
            <a
              key={slot}
              href={item.href}
              className={`${styles.card} ${styles.link}`}
              style={cardStyle}
              onPointerDown={() => {
                const ring = ringRef.current;
                if (ring) ring.style.animationPlayState = "paused";
              }}
            >
              {inner}
            </a>
          ) : (
            <div key={slot} className={styles.card} style={cardStyle}>
              {inner}
            </div>
          );
        })}
      </div>

      {/* Off-screen preloader: warms the upcoming images (same sizes/quality as
          the cards, so it fetches the exact same optimized variant). */}
      {preloadArmed && preloadItems.length > 0 && (
        <div
          aria-hidden
          style={{ position: "fixed", left: "-9999px", top: 0, width: 1, height: 1, overflow: "hidden", opacity: 0, pointerEvents: "none" }}
        >
          {preloadItems.map((item) => (
            // Card-sized (via the scene's --cardW/--ar vars) with the same
            // object-fit as .img, NOT a fixed 48px square. Lighthouse audits
            // offscreen <img>s by their own boxes: at 48x48 each preload was
            // flagged as ~98% wasted bytes ("Improve image delivery", ~215 KiB)
            // and as a distorted aspect ratio (Best Practices) — measured on
            // production 2026-08-23. Matching the real card's box makes both
            // audits read it exactly like the card it is warming.
            <span
              key={`preload-${item.id}`}
              style={{ position: "relative", display: "block", width: "var(--cardW)", aspectRatio: "var(--ar)" }}
            >
              <Image
                src={item.imageUrl}
                alt=""
                fill
                sizes="(max-width: 640px) 80vw, (max-width: 1024px) 50vw, 35vw"
                quality={CARD_IMAGE_QUALITY}
                // Was the next/image default `lazy`: parked at left:-9999px it
                // could be skipped indefinitely (Chrome mobile preview: 1 of 5
                // still unloaded 3.5 s in), so the "preload" often did not
                // happen. Eager + low priority, and it mounts only after page
                // load (preloadArmed), so it never competes with visible photos.
                loading="eager"
                fetchPriority="low"
                onLoad={decodeAhead}
                style={{ objectFit: "contain" }}
              />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
