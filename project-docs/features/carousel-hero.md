# Feature: Carousel Hero

## Summary

The **home page** hero (`/`, `/es`) is a 3D rotating photo carousel of curated
estate pieces, replacing the old MP4 ring video. It is:

- **Windowed / infinite** — only a few cards exist on the ring at once (admin-set,
  default 6 desktop / 4 mobile) on a tight, intimate radius; the full curated list
  cycles through them as cards pass the hidden back. Item count barely affects the
  look or performance.
- **One solid background per slideshow** (2026-08-09; the swept per-photo
  background was removed — with mixed lineups it flipped the hero between black
  and white as the ring turned). The admin picks a color per slideshow tab;
  the overlay text theme derives from that color by luminance. Each photo still
  belongs to a **White** or **Black** group, which now paints only that card's
  own padding so the frame matches the backdrop the photo was shot against.
- **Image-optimized** — photos route through `next/image` (AVIF/WebP, right-sized
  per display, `quality 82` shared by cards and preloader via
  `CARD_IMAGE_QUALITY`), with an off-screen **preloader** that warms the next
  batch so cycled-in cards never pop in. The fade-in ready gate waits on the
  RENDERED imgs (never re-fetch `item.imageUrl` originals — that doubled every
  image download).
- **Performance-guarded** — an `IntersectionObserver` pauses the CSS spin and the
  per-frame rAF loop whenever the hero scrolls out of view; inside the pinned
  hero stack the stack's explicit `paused` prop does this instead. A paused
  (parked) pane never claims `fetchPriority: high`.

The same `Carousel` widget also powers the admin live preview. Storefront CTAs
route directly to `/shop`; the retired `/store` chooser route no longer exists.

## Key Files

- `next-app/carousel/components/Carousel.tsx` — the engine. Windowing, the
  per-frame `sample()` loop (slot cycling + per-card facing/z hit-testing;
  the sweep and centered-card callbacks were removed 2026-08-09), offscreen
  pause, and the off-screen image preloader.
- `next-app/carousel/components/Carousel.module.css` — 3D ring CSS. Per-card
  `--card-bg` (falls back to `--bg`), edge fades, ring pointer-events passthrough.
- `next-app/carousel/lib/carouselData.ts` — Supabase data access + types
  (`CarouselItem`, `CarouselSettings`, `SelectionEntry`),
  resilient fetch/save (degrade gracefully when optional columns are unmigrated).
- `next-app/carousel/lib/carouselConfig.ts` — table/column mapping, `DEFAULT_BG`,
  `normalizeSlideshowBg` (pure; single normalizer for admin/data/server),
  `DEFAULT_VISIBLE_COUNT` / `MIN_VISIBLE_COUNT` / `MAX_VISIBLE_COUNT`.
- `next-app/src/components/home/HomeHero.tsx` — the hero slideshow pane. Renders
  the carousel over its slideshow's solid `backgroundColor` prop, uses the
  server-provided initial payload, picks the desktop/mobile visible count via
  `matchMedia`, and owns the ready gate + loading spinner (which unmounts after
  its fade). The overlay/headline layer lives in `HomeHeroOverlay`, composed by
  `HomeHeroStack`.
- `next-app/src/lib/home-carousel-server.ts` — public server read for the
  curated selection/settings, optional-column compatibility, five-minute
  tagged cache, and fallback resolution.
- `next-app/src/lib/home-carousel-payload.ts` — pure one-payload resolver and
  fallback settings used by the server read and regression tests.
- `next-app/src/components/home/HomeSubscriberForm.tsx` — sign-up form; inputs use
  a solid light fill so they stay legible over both white and black hero phases.
- `next-app/src/components/admin/AdminCarouselSettingsPanel.tsx` — admin curation:
  Slideshow 1/2/3 tabs, product search, ordered selection, per-photo
  White/Black card-padding group, per-slideshow background color, random fill
  buttons, desktop/mobile visible counts, and a live preview on the active
  slideshow's solid color.
- `next-app/src/app/[locale]/(home)/page.tsx` — resolves and passes the
  authoritative initial items/settings to `HomeHero`.

## Data Model (Supabase)

- `carousel_selection` — curated list. `product_id` (FK → `products.id`),
  `position` (order), `bg_color` (per-photo White/Black). **NULL no longer means
  "inherit white"**: since 2026-08-07 a NULL falls back to the product's own
  `image_padding`, so a black-backdrop photo added without the swatch set paints
  black instead of showing white bars. An explicitly set swatch still wins.
- `carousel_settings` — single row (`id = 1`). `show_price`, `bg_color`
  (Slideshow 1's solid background), `bg_color_alt` / `bg_color_third`
  (Slideshows 2/3; NULL inherits Slideshow 1's color — the pre-migration
  behavior), `visible_count` (desktop ring size), `visible_count_mobile`
  (mobile ring size), `selection_mode*` (always written `manual`; random draws
  only seed the editable lineup).
- Both tables are public-readable; only the admin (email-gated `is_carousel_admin()`
  in `setup.sql`) may write. Reads/writes in `carouselData.ts` use **tiered
  fallbacks** so a missing optional column never breaks the carousel or blocks a
  save — it just drops the unmigrated field.

## How It Works

**Windowing.** `effectiveVisible = min(visibleCount, items.length)`. The ring
renders that many slot cards (radius derived from the count → intimate). State
`slotItems[p]` maps each slot to a `data` index. As a slot crosses ~180° (hidden
back), it advances by `effectiveVisible`, so the window scrolls the whole list
forward. Cards are keyed by **slot**, not item, so the ring keeps spinning and only
the image swaps.

**Solid background + text theme (2026-08-09).** The section renders its
slideshow's admin-chosen color as a plain inline style; nothing repaints the
background per frame anymore. `HomeHeroStack` derives each pane's light/dark
overlay theme from that color by relative luminance and paints the pinned
frame with the DOMINANT pane's color during crossings. The removed sweep
(`computeSweepBackground` + the `onFrontItemChange`/`onBackgroundChange`
callbacks and the white/black arc grouping) survives only in git history — do
not restore it from older notes; lineups render in curated order.

**Image optimization + preload.** Cards use `next/image` (`fill`, viewport-based
`sizes`, `quality 82` via `CARD_IMAGE_QUALITY` — shared by cards AND preloader,
or the preloader warms a variant the cards never request); `next.config.ts`
sets `formats: ['image/avif','image/webp']` and `qualities: [75, 82, 90]`
(Next 16 ERRORS on unlisted quality values). An off-screen layer renders the
upcoming batch (`slots.map(s => (s + ev) % n)`) with identical `sizes` so the
browser fetches the exact same optimized variant ahead of time. The ready gate
waits on the rendered imgs' load events, excluding the preloader.

**Offscreen pause.** Two layers, because one is not enough (see DECISIONS,
"Only on-screen slideshows animate"):

- `Carousel`'s own `IntersectionObserver` gates on `intersectionRect` **area**
  (never `isIntersecting`, which is `true` for a zero-area intersection) with a
  threshold ladder (`threshold: 0` alone fires once and never again when the
  boolean never flips). This covers standalone uses like the admin preview.
- Inside the hero stack, `HomeHeroStack` passes an explicit `paused` prop through
  `HomeHero` to `Carousel`, derived from the same conditions that set `inert`.
  Geometry cannot be made airtight through a transformed, clipped ancestor, and
  the stack already knows exactly which panes are offscreen.

Net effect, measured across 11 scroll positions: **3.0 concurrent rAF loops → 1.55
average, 1 at rest**, peaking at 2 only mid-crossing when both panes really are
on screen.

**Initial payload + cache.** The localized Server Component resolves
`carousel_selection` and `carousel_settings` before rendering `HomeHero`.
`unstable_cache` keeps that combined public read for five minutes under the
`home-carousel` tag. The client receives that one set in the initial HTML and
does not refetch or replace it after hydration. Saving carousel settings calls
the authenticated `/api/admin/carousel/revalidate` endpoint to expire the tag
immediately. Bundled products appear only if the server query fails or the
curated selection is empty.

## Admin Controls (`/admin/settings` → Store Carousel Hero)

- Slideshow 1/2/3 tabs; per-tab: search + add/remove products; reorder with
  ↑/↓; per-row **White/Black** card-padding swatch; remove (✕); random FILL
  buttons (gold jewelry / silver jewelry / non-jewelry) seeding the editable
  list; status-list filter (All/Available/Sold).
- **"{Slideshow N} background"** — White/Black swatches + a custom color input,
  above the live preview, which sits on that color. One solid color per
  slideshow (2026-08-09).
- **Cards visible at once** — separate **Desktop** and **Mobile** number fields
  (3–12). The preview uses the desktop value.
- Save All Slideshows persists every lineup (with per-photo bg) + settings and
  invalidates the public carousel cache. Missing-column/table saves degrade
  with a warning naming the exact SQL file to run.

## Migrations

Run in the Supabase SQL editor (all idempotent). `setup.sql` is the full,
re-runnable source of truth; the deltas exist for incremental installs:

- `next-app/carousel/sql/setup.sql` — full schema (selection, settings, RLS, grants).
- `next-app/carousel/sql/add-per-item-bg.sql` — `carousel_selection.bg_color`.
- `next-app/carousel/sql/add-visible-count.sql` — `carousel_settings.visible_count`.
- `next-app/carousel/sql/add-visible-count-mobile.sql` — `…visible_count_mobile`.
- `next-app/carousel/sql/add-second-lineup.sql` / `add-third-lineup.sql` —
  `carousel_selection_alt` / `carousel_selection_third`.
- `next-app/carousel/sql/add-random-lineup-modes.sql` — `selection_mode*`.
- `next-app/carousel/sql/add-slideshow-bg-colors.sql` — `bg_color_alt` /
  `bg_color_third` (run + verified 2026-08-09).

**All of the above have been run in production.** Until a column is migrated,
its feature degrades quietly (per-photo colors don't persist; mobile count
mirrors desktop; later slideshows inherit Slideshow 1's background), but
nothing breaks.

## Tuning Knobs

- `CARD_IMAGE_QUALITY` in `Carousel.tsx` (must stay listed in
  `next.config.ts` `images.qualities`).
- `visibleCount` defaults in `carouselConfig.ts` and the admin fields.
- Scale / `--perspective` / `--cardW` per breakpoint in `HomeHero.tsx`'s `<style>`.
- `.home-hero-bottom` `bottom` offsets — vertical placement of the form/buttons.
- Hero-stack choreography and the touch snap (`SNAP_STEP_MS`, runway) are
  documented in DECISIONS, not here — they live in `HomeHeroStack.tsx` /
  `src/lib/home-hero-snap.ts`.

## Gotchas

- Do not reintroduce a client-side selection/settings bootstrap in `HomeHero`.
  The server-provided payload is deliberately the only set present before and
  after hydration; local products are resilience assets, not a staging set.
- The dev preview runs the tab **hidden** (rAF + CSS animation frozen) and reports
  a 0px viewport — verify motion, the desktop breakpoint, and live sizing in a real
  browser, not the embedded preview.
- `-webkit-line-clamp` on a flex item gets "blockified"; clamp an inner span.
- `carouselData.ts` instantiates the Supabase browser client at import time —
  tests must import pure helpers from `carouselConfig.ts` instead.
- The hero pane's inline `style.background` is read by `HomeHeroStack` to paint
  the pinned frame; keep it a plain inline style.
