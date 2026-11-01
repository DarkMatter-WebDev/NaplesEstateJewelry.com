# Admin listing editor on a phone — audit and plan (2026-09-02)

> **Status 2026-09-02 (late): owner chose Option B.** It is built (compact
> one-line action row + ⋯ sheet on phones, 16px editor fields on touch; no
> viewport lock, no touch guards, no hide-on-scroll) and is being reviewed
> by the owner on Safari over the LAN dev server — `10.0.0.208.nip.io:3007`
> — before the push. Step 1's diagnostic build was skipped by the owner's
> choice; the LAN review is the real-device check instead. Checklist and
> Cloudflare step: `TASKS.md`.

> Written after the 2026-09-02 batch (zoom lock + hide-on-scroll Save row)
> failed on the owner's Safari four deploys in a row and was reverted at the
> owner's request: *"bring us back to the start, then enter a deep dive
> audit to plan out a fix rather than guessing."* Nothing in this file is
> built. Step 1 of the plan produces the numbers every later step depends on.

## 1. What the owner asked for, in their words

1. "I was able to accidentally zoom in on my mobile device, and then I was
   able to horizontally scroll. I don't want to be able to accidentally zoom
   in… I might accidentally press a button when trying to zoom back out."
2. "Make it so the bottom footer menu fixed to the bottom of the viewport
   disappears when I scroll down, and comes back when I scroll back up like
   a lot of popular mobile sites do."
3. Constraints stated later: "we still need vertical scrolling all the
   time"; "I simply do not want to be able to scroll horizontally"; test
   "as a user… all possible paths… the ADD A PRODUCT window too."
4. Device: **iPhone, Safari** ("I tested on Safari mobile"). Chrome on iOS
   was tried once at the end.

## 2. The editor as it is now (the reverted, months-proven layout)

`components/admin/AdminShell.tsx`, the `{editing && …}` portal (~line 5163):

```text
div.fixed.inset-0.z-50.flex                     ← backdrop, rgba(0,0,0,.5)
└─ div.product-editor-modal                     ← h-svh · flex-col · overflow-hidden · w-full
   ├─ header  (px-7 py-5, "New listing / Edit listing", ✕ Close)
   ├─ div.product-editor-body                   ← flex-1 · min-h-0 · overflow-y-auto · overflow-x-hidden · p-4 · gap-4
   │  └─ 8 × div.product-editor-panel[data-collapsed]   Photos · Video · AI · Details · Etsy · eBay · Instagram · Facebook
   │        (collapsed = only the .editor-collapse-header row is displayed; padding 1.05rem on phones)
   └─ div.grid.grid-cols-2  (Save row, IN FLOW)   Clone? · Undo · Close · Save · Save + Add Another · Save and Close
         py-4 · padding-bottom: max(1rem, 1rem + env(safe-area-inset-bottom))
```

Facts about this layout that matter for any change:

- **Every accordion starts collapsed** on open (`setOpenEditorSections({…all false})`,
  three call sites). With eight collapsed panels the body content is roughly
  500–620px tall — on a phone that is *close to* the body's own height, which
  is why "all accordions collapsed" is the sensitive case in every report.
- The Save row is **160–190px tall on phones** (2 columns × 3 rows of pill
  buttons + padding + safe-area). It is the reason the owner wants it out of
  the way: on a 660px Safari viewport it takes ~28% of the screen.
- The modal is `h-svh` on purpose (comment in the file: "dvh grows as soon
  as the toolbar auto-hides… the footer is always inside the guaranteed-safe
  area"). `DECISIONS.md` → *"Viewport height is `svh`"* records the site-wide
  rule and the `--app-vh` exception for in-app browsers.
- Inputs are `.form-field` = **14px** (`globals.css` ~line 1872). iOS Safari
  auto-zooms the page on focus of any input under 16px — this is the
  "accidental zoom" (tap-to-zoom), not a pinch.
- The page underneath is locked while the editor is open
  (`document.body.style.overflow = 'hidden'`, `overscrollBehavior = 'none'`).
- The admin shell root is `h-dvh overflow-hidden` (the one sanctioned `dvh`).
- The site ships the Next.js default viewport meta
  (`width=device-width, initial-scale=1`) everywhere; there is no admin
  layout file.

## 3. What shipped, and what the owner saw (chronological)

| # | Deployed change | Owner's report (Safari iOS unless noted) |
|---|---|---|
| 0 | Baseline above | Works; tap-to-zoom + sideways pan after zoom; wants the row to hide on scroll |
| 1 | Admin viewport lock (`maximum-scale=1, user-scalable=no`) · 16px inputs under `(hover: none)` · modal `touch-action: pan-x pan-y` + `overscroll-behavior: contain` · document-level **non-passive** `touchstart`/`touchmove`/`gesturestart` guards · Save row **absolutely positioned overlay** with `will-change: transform`, hidden = `translateY(110%)` · body `padding-bottom: 1rem + var(--editor-footer-h)` (ResizeObserver → React state) · `onScroll` → `setState` on the 7k-line component | "the entire page is locked, I can't scroll at all to see the lower accordions… the lower save menu bar is locked too… after I open an accordion it unlocks" |
| 2 | `touch-action: manipulation` · var written in `useLayoutEffect` straight to the DOM · fallback `14rem` | Same |
| 3 | Reserved space as `.product-editor-body::after` flex item instead of padding | "still exactly like it was… only when all accordions are collapsed I can't scroll down to reach Facebook" |
| 4 | Row back **in flow**; hidden = `max-height: 0` collapse; 300ms toggle lock; no show-at-end rule | Safari: "all wonky… sometimes I can scroll and the bar hides, but then it never comes back." **Chrome iOS: works, but most of the row is hidden behind Chrome's bottom toolbar** |
| 5 | Full revert to #0 (thumbnail-rail fix kept) | — |

## 4. What is actually KNOWN vs what was ASSUMED

**Known (measured or certain):**

- All four failing variants were **live on production** when the owner
  tested them (verified by fetching the deployed CSS each time).
- Every measurement taken this session was **Chromium**: the in-app pane at
  375×812 (replicas of the modal markup) and the *real* editor in the owner's
  desk Chrome at 500×715 against production (variant 1: body
  `scrollHeight 777 > clientHeight 550`, padding 176px applied, programmatic
  scroll moved). All passed. **Safari was measured zero times.**
- Variant 4's "hides then never comes back" is a design flaw, not a Safari
  quirk: with everything collapsed, collapsing the row grew the scroll area
  until the content *fit*, so no scroll event could fire again, and scroll
  events were the only "show" trigger. The Chromium replica reported
  `scrollable: false` in exactly that state and it was not read as the defect
  it was.
- Variant 4 also shows that **touch scrolling of the in-flow body does work
  on Safari at least some of the time** ("sometimes I can scroll").
- The Chrome-iOS "row behind the toolbar" symptom came from an `h-svh` modal
  with the row in flow — i.e. the *baseline* geometry. It is very likely
  pre-existing and independent of the batch, and it is the same class of
  problem `--app-vh` / `ViewportHeightToken` was introduced for on the public
  site (in-app browsers where `svh` does not exclude the chrome).

**Assumed, never verified (each one was the basis of a deploy):**

- A1 — "iOS ignores `user-scalable=no`, so a JS pinch guard is needed."
- A2 — "`touch-action: pan-x pan-y` on an ancestor blocks nested scrolling on
  iOS" (variant 2's premise).
- A3 — "Safari discards `padding-bottom` of a flex-column scroll container"
  (variant 3's premise). The `::after` variant that followed it *also*
  failed, so whatever the Safari behaviour is, it was not this alone.
- A4 — "The overlay's reserved space is the whole problem" (variants 1–3).
- A5 — "A Chromium replica that scrolls proves the Safari editor scrolls."

A1–A4 may each be partly true. None was measured on the device that fails.

## 5. Candidate root causes for "collapsed editor cannot scroll" (variants 1–3)

Listed with the measurement that would confirm or eliminate each. Several
can be true at once.

| Id | Candidate | Confirm / eliminate by |
|---|---|---|
| C1 | **Geometry:** on Safari, `scrollHeight ≤ clientHeight` when collapsed (reserved space not counted, or modal/body sized differently than in Chromium) | Read `body.clientHeight`, `body.scrollHeight`, computed `padding-bottom`, `::after` height, `--editor-footer-h`, modal rect, `innerHeight`, `visualViewport.height` on the phone |
| C2 | **Touch handling:** iOS never starts a scroll on the body — `touch-action` on the modal, the document-level non-passive listeners, or `overscroll-behavior: contain` | Count `touchstart`/`touchmove`/`scroll` events on the body during a drag; log `touchmove.cancelable` and whether `scrollTop` changes; toggle each layer independently |
| C3 | **Overlay hit-testing:** the absolutely positioned, `will-change: transform` row (variants 1–3) intercepting touches meant for the body | Log which element `touchstart` targets; compare with the row hidden |
| C4 | **Re-render cost:** `onScroll` → `setState` on the 7k-line `AdminShell` on every scroll event, making Safari's scroll feel dead | Measure event-to-frame time; test with the handler disabled |
| C5 | **Viewport meta lock** interfering with WebKit's scroll gesture start | Toggle the meta alone |
| C6 | **`h-svh` vs the real visible height** (also the Chrome-iOS toolbar overlap) | Compare `100svh` (modal rect height), `innerHeight`, `visualViewport.height + offsetTop`, `env(safe-area-inset-bottom)` on Safari and Chrome iOS |

## 6. The plan

### Step 1 — one diagnostic deploy, then measure on the phone (no fix yet)

Build a **flag-gated, client-only readout** on the editor that changes
nothing for normal use. Opening `/admin?editorDebug=1` (or a
`localStorage` flag) renders a small panel inside the modal showing, live:

- `innerWidth × innerHeight`, `visualViewport.height` / `offsetTop`,
  `100svh` (modal rect), `env(safe-area-inset-bottom)`, UA (Safari / CriOS);
- body `clientHeight` / `scrollHeight` / `scrollTop`, computed
  `padding-bottom`, row rect (`top`, `height`) vs viewport bottom;
- event counters over the last 2s on the body: `touchstart`, `touchmove`
  (and whether the last one was `cancelable`), `scroll`; the last
  `touchstart` target's class;
- `matchMedia` results for `(hover: none)`, `(max-width: 767px)`,
  `(prefers-reduced-motion: reduce)`.

In the **same** deploy, add flag-gated candidate behaviours that default
off so each can be A/B'd on the phone without another push:
`&lock=1` (viewport lock), `&inputs=16` (16px fields), `&ta=manipulation`
/ `&ta=pan` (touch-action), `&guard=1` (document touch guards),
`&hide=collapse` (variant-4 style with proper show triggers),
`&hide=overlay` (variant-1 style). Every flag is read once on the client;
none touches the server, the schema or the public site.

Owner protocol (Safari, then Chrome iOS): open Edit with everything
collapsed → read the panel → try to scroll → read again → open an accordion
→ read → close it → read. Repeat with one flag at a time. Screenshots of the
panel are the deliverable; the numbers go into `TASKS.md`.

Cost: one Netlify deploy. Everything after this is decided by those
screenshots, not by reasoning about WebKit from a desk.

### Step 2 — choose the treatment for the Save row (owner decision, informed by step 1)

| Option | What it is | Reclaims space? | Scroll logic? | Risk |
|---|---|---|---|---|
| **A. Leave the row in flow, always visible** (current) + fix zoom only | Nothing moves; 16px inputs; optional viewport lock | No | None | Lowest |
| **B. Compact action bar** — *recommended* | Replace the 2×3 grid (160–190px) with one **56–64px** row: `Close` · `Save` · `Save & Close`, with `Clone` / `Undo` / `Save + Add Another` behind a `⋯` sheet. Always visible, in flow. | **Yes, permanently (~120px)** | None | Low — pure layout, no scroll coupling; desktop keeps the full row |
| **C. Hide-on-scroll, in flow** | Variant 4 done properly: show triggers that do not depend on scroll events (row shows whenever the body is not scrollable, on touch-end after upward movement, and on a short idle) | While scrolling | Yes | Medium — needs step-1 data on C2/C4 |
| **D. Hide-on-scroll overlay** | Variants 1–3 with Safari-verified reserved space | While scrolling | Yes | Highest — the family that failed three times |

The recommendation is **B plus the zoom fix**: it delivers what the
hide-on-scroll request was *for* (room for the form on a small screen)
deterministically, with no event handling that Safari can drop, and it
does not change the geometry that has worked for months beyond making the
row shorter. It needs a mockup and a yes before any code (standing rule).

### Step 3 — the zoom fix, separately measured

- **16px fields inside the editor** (`.product-editor-modal :is(input,
  select, textarea) { font-size: 1rem }` under `(hover: none)`) is the
  layer that actually stops iOS tap-to-zoom, and it cannot affect scrolling.
  Ship it once step 1 shows the editor scrolls with it on.
- **The admin viewport lock** (`maximum-scale=1, user-scalable=no`) is
  optional; keep it only if step 1 shows no interaction with scrolling.
  Never on the public site (WCAG 1.4.4; Lighthouse a11y is 100).
- **Do not add document-level non-passive touch listeners** unless step 1
  proves pinch still zooms with the two layers above — they were the most
  invasive part of variant 1 and were never shown to be needed.

### Step 4 — Chrome iOS bottom toolbar (independent of the row)

From the step-1 numbers on Chrome iOS, size the modal to the *visible*
height rather than `100svh`: the site already has `--app-vh`
(`ViewportHeightToken`, written from `innerHeight`, refreshed only through
`onLayoutAffectingResize`) precisely because `svh` misbehaves in in-app and
non-Safari iOS browsers. Candidate: modal `height: var(--app-vh)` with
`min-height: 0`, or `visualViewport.height` on that one element. Decide
from the readout, not from the spec.

### Step 5 — verification protocol before any of it ships

1. Owner runs the step-1 panel with the chosen flags on **Safari and Chrome
   iOS**, Edit **and** Add Product, all-collapsed and one-expanded; numbers
   recorded in `TASKS.md`.
2. Only then: build the chosen option, gate (`tsc` · lint · tests · build),
   stage, deploy.
3. Owner walkthrough on the phone with a numbered checklist; the debug
   panel is removed in the same deploy as the fix or the one after.

## 7. Traps recorded for whoever picks this up

- Chromium (the in-app pane, the desk Chrome) cannot stand in for WebKit on
  scroll geometry or touch handling. Four deploys were "verified" that way.
- The admin is behind login; the pane cannot log in (Turnstile crashes it),
  and the owner's LAN dev server needs a hostname Turnstile will accept.
  Real-device measurement therefore means production + a flag, or a
  Netlify branch deploy — both cost a deploy.
- The owner's desk Chrome has OS reduced-motion on; animated behaviour
  cannot be judged there.
- A Chromium replica reporting `scrollable: false` after a hide **was** the
  variant-4 bug and was misread as "everything visible". Read the replica's
  scrollability as a requirement, not a curiosity.
- `.next/types/validator.ts` goes stale when a route file is deleted; run
  `npm run build` before trusting a `tsc` failure that names a deleted file.
