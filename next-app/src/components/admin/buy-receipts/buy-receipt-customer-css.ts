// Styles for the buy receipt's customer input mode (owner mockups 2026-10-03).
//
// Two strings:
// - CUSTOMER_MODE_PAGE_CSS hides the whole admin page while the mode is on.
//   The customer screen is a direct child of <body> (a portal), so "every other
//   child of <body>" is exactly "the back end". With nothing else displayed the
//   document has no height: there is nothing to scroll to and nothing to tab to.
// - BUY_RECEIPT_CUSTOMER_CSS is the screen itself, scoped under its host class.
//
// The screen shows the owner's own receipt paper (`BuyReceiptSheet`, drawn in
// its seller's view) on the admin page's background, with one bar under it.
// Nothing about the PAPER is styled here — how it looks, which parts are faded,
// how a flagged box looks: all of that is the paper's own
// (`buy-receipt-sheet-css.ts`). This file is only the frame around it, the bar,
// the code keypad and the thank-you.
//
// Nothing here scrolls on a tablet or a laptop: the seller's boxes are at the
// top of the paper and the rest runs off the bottom behind the bar. `.brc-page`
// may scroll only as a last resort, on a screen too small to hold the boxes (a
// phone) — and then only as far as the boxes go (`brc-scroll`, set by the
// component from what it measures).

export const CUSTOMER_MODE_HOST_CLASS = 'buy-receipt-customer-host';

export const CUSTOMER_MODE_PAGE_CSS = `
html, body { overflow: hidden !important; overscroll-behavior: none !important; }
body > *:not(.${CUSTOMER_MODE_HOST_CLASS}) { display: none !important; }
`;

export const BUY_RECEIPT_CUSTOMER_CSS = `
.buy-receipt-customer-host {
  position: fixed;
  left: 0;
  top: 0;
  width: 100%;
  /* --brc-h / --brc-top follow the part of the screen the keyboard leaves visible
     (set by the component before the first paint). 100% of a fixed box is the
     viewport, so no viewport unit is needed for the moment before that. */
  height: var(--brc-h, 100%);
  transform: translateY(var(--brc-top, 0px));
  z-index: 2147483000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  background: var(--color-background, #f9f9f7);
  color: var(--color-on-surface, #1a1c1c);
  font-family: var(--font-body, system-ui), system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 16px;
  line-height: 1.4;
  overscroll-behavior: none;
  touch-action: manipulation;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}
.buy-receipt-customer-host *, .buy-receipt-customer-host *::before, .buy-receipt-customer-host *::after { box-sizing: border-box; }
.buy-receipt-customer-host input { -webkit-user-select: text; user-select: text; }
/* The frame's own resets stay out of the paper: it is styled by its own file. */
.buy-receipt-customer-host .brc-center h2, .buy-receipt-customer-host .brc-center p { margin: 0; }
.buy-receipt-customer-host .brc-bar button, .buy-receipt-customer-host .brc-center button { font-family: var(--font-label, inherit); }

.buy-receipt-customer-host .brc-screen { flex: 1; min-height: 0; display: flex; flex-direction: column; outline: none; }
.buy-receipt-customer-host .brc-in { width: 100%; max-width: 1100px; margin: 0 auto; }

/* ── The form: the owner's own paper, locked to the screen ── */
/* clip, not hidden: a clipped box is not a scroller at all, so nothing — a finger, a
   focused box, a browser's "scroll to the field" — can move the paper. (hidden first,
   for a browser that does not know clip; the component then holds it at the top.) */
.buy-receipt-customer-host .brc-page { flex: 1; min-height: 0; position: relative; padding: 16px 16px 0; overflow: hidden; overflow: clip; }
/* --brc-slide: how far the paper is moved up while a keyboard covers the lower half of a
   sideways tablet — just enough to keep every seller box and the bar in view. */
.buy-receipt-customer-host .brc-paper { position: relative; transform: translateY(calc(var(--brc-slide, 0px) * -1)); }
/* Last resort (a phone): the page may move, and the paper ends where the seller's boxes end.
   The paper itself is clipped, never a scroller: a browser bringing a focused box into view
   would otherwise slide the paper INSIDE its own frame, past the cut. */
.buy-receipt-customer-host .brc-page.brc-scroll { overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; }
.buy-receipt-customer-host .brc-scroll .brc-paper { transform: none; max-height: var(--brc-cut, none); overflow: hidden; overflow: clip; }

.buy-receipt-customer-host .brc-bar { position: relative; z-index: 1; flex: none; background: #ffffff; border-top: 1px solid var(--color-outline-variant, #d0c5af); padding: 0 34px env(safe-area-inset-bottom, 0px); }
.buy-receipt-customer-host .brc-bar .brc-in { display: flex; align-items: center; gap: 14px; height: 86px; }
.buy-receipt-customer-host .brc-staff { flex: none; display: inline-flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #8a8372; background: transparent; border: 1px solid #ded7c6; border-radius: 999px; padding: 9px 14px; cursor: pointer; }
.buy-receipt-customer-host .brc-staff svg { width: 13px; height: 13px; }
/* What to do, in plain words; after a Save that found unfinished boxes, the red line instead. */
.buy-receipt-customer-host .brc-msg { flex: 1; min-width: 0; font-size: 15px; font-weight: 500; line-height: 1.3; color: var(--color-on-surface-variant, #4d4635); text-align: right; }
.buy-receipt-customer-host .brc-msg.brc-err { font-weight: 600; color: var(--color-error, #ba1a1a); }
.buy-receipt-customer-host .brc-save { flex: none; height: 54px; min-width: 210px; padding: 0 30px; border: 0; border-radius: 999px; background: linear-gradient(135deg, #dcb336, #b5890c); color: #ffffff; font-size: 15px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; cursor: pointer; box-shadow: 0 12px 26px rgba(181, 137, 12, 0.22); }
.buy-receipt-customer-host .brc-unf { flex: none; height: 54px; padding: 0 20px; border: 1px solid rgba(115, 92, 0, 0.5); border-radius: 999px; background: rgba(255, 255, 255, 0.72); color: var(--color-primary, #735c00); font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; cursor: pointer; }
.buy-receipt-customer-host .brc-save:focus-visible, .buy-receipt-customer-host .brc-unf:focus-visible, .buy-receipt-customer-host .brc-staff:focus-visible, .buy-receipt-customer-host .brc-keys button:focus-visible, .buy-receipt-customer-host .brc-link:focus-visible { outline: 2px solid #1a1c1c; outline-offset: 2px; }

/* The keyboard is up (class set from the visible height, see the component):
   the bar tightens, so Save stays in view just above the keys. */
.buy-receipt-customer-host.brc-kbd .brc-bar .brc-in { height: 52px; }
.buy-receipt-customer-host.brc-kbd .brc-save { height: 40px; min-width: 150px; font-size: 13.5px; box-shadow: none; }
.buy-receipt-customer-host.brc-kbd .brc-unf { height: 40px; padding: 0 14px; font-size: 11px; }
.buy-receipt-customer-host.brc-kbd .brc-staff { padding: 6px 11px; }
.buy-receipt-customer-host.brc-kbd .brc-msg { font-size: 13px; }

/* A phone: the bar's words take a line of their own above the buttons. */
@media (max-width: 699px) {
  .buy-receipt-customer-host .brc-bar { padding: 0 16px env(safe-area-inset-bottom, 0px); }
  .buy-receipt-customer-host .brc-bar .brc-in { height: auto; min-height: 68px; flex-wrap: wrap; gap: 8px 10px; padding: 9px 0; }
  .buy-receipt-customer-host .brc-msg { order: -1; flex: 0 0 100%; text-align: left; font-size: 14px; }
  .buy-receipt-customer-host .brc-save { flex: 1; min-width: 0; height: 48px; padding: 0 16px; }
  .buy-receipt-customer-host .brc-unf { height: 48px; padding: 0 12px; font-size: 10.5px; }
  .buy-receipt-customer-host.brc-kbd .brc-bar .brc-in { height: auto; min-height: 52px; padding: 6px 0; }
  /* With the keys up there is no room for the plain instruction; the red line still shows. */
  .buy-receipt-customer-host.brc-kbd .brc-hint { display: none; }
}

/* ── Keypad and thank-you ── */
/* Centred with auto margins, not justify-content: on a screen too short to hold
   it, the top must stay reachable instead of being cut off above the fold. */
.buy-receipt-customer-host .brc-center { padding: 16px; text-align: center; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; }
.buy-receipt-customer-host .brc-center-in { margin: auto; display: flex; flex-direction: column; align-items: center; }
.buy-receipt-customer-host .brc-badge { display: flex; align-items: center; justify-content: center; width: 58px; height: 58px; flex: none; border-radius: 50%; border: 1.5px solid var(--color-primary, #735c00); background: #fbf5dd; color: var(--color-primary, #735c00); }
.buy-receipt-customer-host .brc-badge svg { width: 25px; height: 25px; }
.buy-receipt-customer-host .brc-center h2 { margin-top: 12px; font-family: var(--font-headline, Georgia), Georgia, serif; font-size: 30px; line-height: 1.15; font-weight: 700; }
.buy-receipt-customer-host .brc-center .brc-sub { margin-top: 6px; max-width: 30em; font-size: 16px; color: var(--color-on-surface-variant, #4d4635); }
.buy-receipt-customer-host .brc-center .brc-who { margin-top: 16px; font-size: 11.5px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: var(--color-primary, #735c00); }
.buy-receipt-customer-host .brc-dots { display: flex; gap: 14px; margin: 12px 0 6px; }
.buy-receipt-customer-host .brc-dots i { width: 16px; height: 16px; border-radius: 50%; border: 1.5px solid #b9ae95; background: #ffffff; }
.buy-receipt-customer-host .brc-dots i.brc-filled { background: #1a1c1c; border-color: #1a1c1c; }
.buy-receipt-customer-host .brc-pad-msg { min-height: 22px; max-width: 30em; font-size: 14px; font-weight: 600; color: var(--color-error, #ba1a1a); }
.buy-receipt-customer-host .brc-pad-msg a { color: inherit; text-decoration: underline; }
.buy-receipt-customer-host .brc-keys { display: grid; grid-template-columns: repeat(3, 84px); gap: 10px; margin-top: 4px; }
.buy-receipt-customer-host .brc-keys button { height: 60px; border: 1px solid var(--color-outline-variant, #d0c5af); border-radius: 14px; background: #ffffff; color: var(--color-on-surface, #1a1c1c); font-family: var(--font-body, inherit); font-size: 24px; font-weight: 600; cursor: pointer; }
.buy-receipt-customer-host .brc-keys button:active { background: #fbf5dd; }
.buy-receipt-customer-host .brc-keys button:disabled { opacity: 0.45; cursor: default; }
.buy-receipt-customer-host .brc-keys .brc-ghost { border-color: transparent; background: transparent; font-size: 15px; color: var(--color-on-surface-variant, #4d4635); }
.buy-receipt-customer-host .brc-link { margin-top: 14px; padding: 4px 8px; border: 0; background: none; color: var(--color-primary, #735c00); font-family: var(--font-body, inherit); font-size: 14px; font-weight: 600; text-decoration: underline; cursor: pointer; }
.buy-receipt-customer-host .brc-thanks .brc-badge { width: 78px; height: 78px; }
.buy-receipt-customer-host .brc-thanks .brc-badge svg { width: 34px; height: 34px; }
.buy-receipt-customer-host .brc-thanks h2 { margin-top: 18px; font-size: 40px; }
.buy-receipt-customer-host .brc-thanks .brc-sub { margin-top: 10px; font-size: 20px; }
.buy-receipt-customer-host .brc-thanks .brc-staff { margin-top: 44px; font-size: 12px; padding: 12px 20px; }
@media (max-width: 699px), (max-height: 620px) {
  .buy-receipt-customer-host .brc-center h2 { font-size: 24px; }
  .buy-receipt-customer-host .brc-badge { width: 44px; height: 44px; }
  .buy-receipt-customer-host .brc-badge svg { width: 20px; height: 20px; }
  .buy-receipt-customer-host .brc-center .brc-who { margin-top: 10px; }
  .buy-receipt-customer-host .brc-keys { grid-template-columns: repeat(3, 76px); gap: 8px; }
  .buy-receipt-customer-host .brc-keys button { height: 52px; }
  .buy-receipt-customer-host .brc-thanks h2 { font-size: 30px; }
  .buy-receipt-customer-host .brc-thanks .brc-sub { font-size: 17px; }
  .buy-receipt-customer-host .brc-thanks .brc-staff { margin-top: 28px; }
}
`;
