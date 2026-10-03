// Styles for the buy receipt's customer input mode (owner mockups 2026-10-03).
//
// Two strings:
// - CUSTOMER_MODE_PAGE_CSS hides the whole admin page while the mode is on.
//   The customer screen is a direct child of <body> (a portal), so "every other
//   child of <body>" is exactly "the back end". With nothing else displayed the
//   document has no height: there is nothing to scroll to and nothing to tab to.
// - BUY_RECEIPT_CUSTOMER_CSS is the screen itself, scoped under its host class.
//
// The screen is built for a finger and a first-time reader: labels ABOVE big
// boxes. (The owner's own form keeps its paper look — labels under the lines.)
//
// Nothing here scrolls on a tablet or a laptop. `.brc-main` may scroll only as
// a last resort on a screen too small to hold the boxes (a phone); on anything
// larger its content fits and there is nothing to move.

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
.buy-receipt-customer-host h2, .buy-receipt-customer-host p { margin: 0; }
.buy-receipt-customer-host button { font-family: var(--font-label, inherit); }

.buy-receipt-customer-host .brc-screen { flex: 1; min-height: 0; display: flex; flex-direction: column; outline: none; }
.buy-receipt-customer-host .brc-in { width: 100%; max-width: 1100px; margin: 0 auto; }

/* ── The form ── */
.buy-receipt-customer-host .brc-top { flex: none; background: #ffffff; border-bottom: 1px solid var(--color-outline-variant, #d0c5af); padding: 0 34px; }
.buy-receipt-customer-host .brc-top .brc-in { display: flex; align-items: center; gap: 12px; height: 64px; }
.buy-receipt-customer-host .brc-top img { height: 40px; width: auto; flex: none; }
.buy-receipt-customer-host .brc-brand { font-family: var(--font-headline, Georgia), Georgia, serif; font-size: 20px; font-weight: 700; white-space: nowrap; }
.buy-receipt-customer-host .brc-tag { margin-left: auto; font-size: 11px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: var(--color-on-surface-variant, #4d4635); white-space: nowrap; }

.buy-receipt-customer-host .brc-main { flex: 1; min-height: 0; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; padding: 24px 34px 0; }
.buy-receipt-customer-host .brc-title { margin-bottom: 20px; }
.buy-receipt-customer-host .brc-title h2 { font-family: var(--font-headline, Georgia), Georgia, serif; font-size: 30px; line-height: 1.1; font-weight: 700; }
.buy-receipt-customer-host .brc-title p { margin-top: 6px; font-size: 16px; color: var(--color-on-surface-variant, #4d4635); }

.buy-receipt-customer-host .brc-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 16px; }
.buy-receipt-customer-host .brc-fld { display: block; min-width: 0; }
/* The label and — after a Save that found a problem — the short reason share
   one line, so a flagged box never pushes anything down. */
.buy-receipt-customer-host .brc-lab { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; height: 17px; margin-bottom: 5px; font-size: 11.5px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-on-surface-variant, #4d4635); white-space: nowrap; }
.buy-receipt-customer-host .brc-lab > span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.buy-receipt-customer-host .brc-lab i { font-style: normal; font-weight: 500; letter-spacing: 0.04em; text-transform: none; color: #8a8372; }
.buy-receipt-customer-host .brc-why { flex: none; font-size: 12.5px; font-weight: 600; letter-spacing: 0; text-transform: none; color: var(--color-error, #ba1a1a); }
.buy-receipt-customer-host .brc-fld input {
  display: block;
  width: 100%;
  height: 52px;
  margin: 0;
  padding: 0 13px;
  border: 1.5px solid var(--color-outline-variant, #d0c5af);
  border-radius: 11px;
  background: #ffffff;
  color: var(--color-on-surface, #1a1c1c);
  font-family: inherit;
  /* 16px or iOS zooms the page on every tap into a box. */
  font-size: 16px;
  line-height: normal;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
}
.buy-receipt-customer-host .brc-fld input:focus { border-color: var(--color-primary, #735c00); box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.28); }
.buy-receipt-customer-host .brc-fld.brc-bad input { border-color: var(--color-error, #ba1a1a); background: #fff6f5; }
.buy-receipt-customer-host .brc-fld.brc-bad .brc-lab { color: var(--color-error, #ba1a1a); }

/* Sideways tablet / laptop: three rows. */
.buy-receipt-customer-host .brc-f-name { grid-column: span 7; }
.buy-receipt-customer-host .brc-f-phone { grid-column: span 5; }
.buy-receipt-customer-host .brc-f-street { grid-column: span 5; }
.buy-receipt-customer-host .brc-f-city { grid-column: span 3; }
.buy-receipt-customer-host .brc-f-state { grid-column: span 2; }
.buy-receipt-customer-host .brc-f-zip { grid-column: span 2; }
.buy-receipt-customer-host .brc-f-email { grid-column: span 5; }
.buy-receipt-customer-host .brc-opts { grid-column: span 7; }

/* The two small boxes belong to the email: beside it, and there only once an
   email has been typed. Hidden, they keep their space so nothing jumps. */
.buy-receipt-customer-host .brc-opts { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 26px; margin-top: 22px; min-height: 52px; visibility: hidden; }
.buy-receipt-customer-host .brc-opts.brc-on { visibility: visible; }
.buy-receipt-customer-host .brc-opt { display: inline-flex; align-items: center; gap: 10px; font-size: 15.5px; white-space: nowrap; cursor: pointer; }
.buy-receipt-customer-host .brc-opt input { width: 24px; height: 24px; margin: 0; flex: none; accent-color: var(--color-primary, #735c00); }

.buy-receipt-customer-host .brc-bar { flex: none; background: #ffffff; border-top: 1px solid var(--color-outline-variant, #d0c5af); padding: 0 34px env(safe-area-inset-bottom, 0px); }
.buy-receipt-customer-host .brc-bar .brc-in { display: flex; align-items: center; gap: 14px; height: 86px; }
.buy-receipt-customer-host .brc-staff { flex: none; display: inline-flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #8a8372; background: transparent; border: 1px solid #ded7c6; border-radius: 999px; padding: 9px 14px; cursor: pointer; }
.buy-receipt-customer-host .brc-staff svg { width: 13px; height: 13px; }
.buy-receipt-customer-host .brc-msg { flex: 1; min-width: 0; font-size: 15px; font-weight: 600; line-height: 1.3; color: var(--color-error, #ba1a1a); text-align: right; }
.buy-receipt-customer-host .brc-save { flex: none; height: 54px; min-width: 210px; padding: 0 30px; border: 0; border-radius: 999px; background: linear-gradient(135deg, #dcb336, #b5890c); color: #ffffff; font-size: 15px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; cursor: pointer; box-shadow: 0 12px 26px rgba(181, 137, 12, 0.22); }
.buy-receipt-customer-host .brc-unf { flex: none; height: 54px; padding: 0 20px; border: 1px solid rgba(115, 92, 0, 0.5); border-radius: 999px; background: rgba(255, 255, 255, 0.72); color: var(--color-primary, #735c00); font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; cursor: pointer; }
.buy-receipt-customer-host .brc-save:focus-visible, .buy-receipt-customer-host .brc-unf:focus-visible, .buy-receipt-customer-host .brc-staff:focus-visible, .buy-receipt-customer-host .brc-keys button:focus-visible, .buy-receipt-customer-host .brc-link:focus-visible { outline: 2px solid #1a1c1c; outline-offset: 2px; }

/* Upright tablet: four rows, and the two small boxes under the email. */
@media (max-width: 899px) {
  .buy-receipt-customer-host .brc-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .buy-receipt-customer-host .brc-f-name { grid-column: span 4; }
  .buy-receipt-customer-host .brc-f-phone { grid-column: span 2; }
  .buy-receipt-customer-host .brc-f-street { grid-column: span 6; }
  .buy-receipt-customer-host .brc-f-city, .buy-receipt-customer-host .brc-f-state, .buy-receipt-customer-host .brc-f-zip { grid-column: span 2; }
  .buy-receipt-customer-host .brc-f-email, .buy-receipt-customer-host .brc-opts { grid-column: span 6; }
  .buy-receipt-customer-host .brc-opts { margin-top: -4px; min-height: 40px; }
}

/* The keyboard is up (class set from the visible height, see the component):
   the brand strip and the heading tuck away, the boxes tighten, and Save stays
   in view just above the keys. */
.buy-receipt-customer-host.brc-kbd .brc-top, .buy-receipt-customer-host.brc-kbd .brc-title { display: none; }
.buy-receipt-customer-host.brc-kbd .brc-main { padding-top: 10px; }
.buy-receipt-customer-host.brc-kbd .brc-grid { gap: 7px 16px; }
.buy-receipt-customer-host.brc-kbd .brc-lab { height: 14px; margin-bottom: 3px; font-size: 10.5px; }
.buy-receipt-customer-host.brc-kbd .brc-why { font-size: 11.5px; }
.buy-receipt-customer-host.brc-kbd .brc-fld input { height: 44px; }
.buy-receipt-customer-host.brc-kbd .brc-opts { margin-top: 17px; min-height: 44px; }
.buy-receipt-customer-host.brc-kbd .brc-bar .brc-in { height: 52px; }
.buy-receipt-customer-host.brc-kbd .brc-save { height: 40px; min-width: 150px; font-size: 13.5px; box-shadow: none; }
.buy-receipt-customer-host.brc-kbd .brc-unf { height: 40px; padding: 0 14px; font-size: 11px; }
.buy-receipt-customer-host.brc-kbd .brc-staff { padding: 6px 11px; }
.buy-receipt-customer-host.brc-kbd .brc-msg { font-size: 13px; }
@media (max-width: 899px) {
  .buy-receipt-customer-host.brc-kbd .brc-opts { margin-top: 0; min-height: 34px; }
}

/* A phone: the boxes stack. This is the one layout where the form area may move. */
@media (max-width: 699px) {
  .buy-receipt-customer-host .brc-top { padding: 0 16px; }
  .buy-receipt-customer-host .brc-top .brc-in { height: 52px; }
  .buy-receipt-customer-host .brc-top img { height: 32px; }
  .buy-receipt-customer-host .brc-brand { font-size: 17px; }
  .buy-receipt-customer-host .brc-tag { display: none; }
  .buy-receipt-customer-host .brc-main { padding: 16px 16px 12px; }
  .buy-receipt-customer-host .brc-title { margin-bottom: 14px; }
  .buy-receipt-customer-host .brc-title h2 { font-size: 24px; }
  .buy-receipt-customer-host .brc-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .buy-receipt-customer-host .brc-f-name, .buy-receipt-customer-host .brc-f-phone, .buy-receipt-customer-host .brc-f-street,
  .buy-receipt-customer-host .brc-f-city, .buy-receipt-customer-host .brc-f-email, .buy-receipt-customer-host .brc-opts { grid-column: span 2; }
  .buy-receipt-customer-host .brc-f-state, .buy-receipt-customer-host .brc-f-zip { grid-column: span 1; }
  .buy-receipt-customer-host .brc-opts { margin-top: 0; min-height: 0; gap: 12px; }
  .buy-receipt-customer-host .brc-opt { white-space: normal; }
  .buy-receipt-customer-host .brc-bar { padding: 0 16px env(safe-area-inset-bottom, 0px); }
  .buy-receipt-customer-host .brc-bar .brc-in { height: auto; min-height: 68px; flex-wrap: wrap; gap: 8px 10px; padding: 9px 0; }
  .buy-receipt-customer-host .brc-msg { order: -1; flex: 0 0 100%; text-align: left; font-size: 14px; }
  .buy-receipt-customer-host .brc-msg:empty { display: none; }
  .buy-receipt-customer-host .brc-save { flex: 1; min-width: 0; height: 48px; padding: 0 16px; }
  .buy-receipt-customer-host .brc-unf { height: 48px; padding: 0 12px; font-size: 10.5px; }
  .buy-receipt-customer-host.brc-kbd .brc-bar .brc-in { height: auto; min-height: 52px; padding: 6px 0; }
}

/* ── Keypad and thank-you ── */
/* Centred with auto margins, not justify-content: on a screen too short to hold
   it, the top must stay reachable instead of being cut off above the fold. */
.buy-receipt-customer-host .brc-center { padding: 16px; text-align: center; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; }
.buy-receipt-customer-host .brc-center-in { margin: auto; display: flex; flex-direction: column; align-items: center; }
.buy-receipt-customer-host .brc-badge { display: flex; align-items: center; justify-content: center; width: 58px; height: 58px; flex: none; border-radius: 50%; border: 1.5px solid var(--color-primary, #735c00); background: #fbf5dd; color: var(--color-primary, #735c00); }
.buy-receipt-customer-host .brc-badge svg { width: 25px; height: 25px; }
.buy-receipt-customer-host .brc-center h2 { margin-top: 12px; font-family: var(--font-headline, Georgia), Georgia, serif; font-size: 30px; line-height: 1.15; font-weight: 700; }
.buy-receipt-customer-host .brc-sub { margin-top: 6px; max-width: 30em; font-size: 16px; color: var(--color-on-surface-variant, #4d4635); }
.buy-receipt-customer-host .brc-who { margin-top: 16px; font-size: 11.5px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: var(--color-primary, #735c00); }
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
  .buy-receipt-customer-host .brc-who { margin-top: 10px; }
  .buy-receipt-customer-host .brc-keys { grid-template-columns: repeat(3, 76px); gap: 8px; }
  .buy-receipt-customer-host .brc-keys button { height: 52px; }
  .buy-receipt-customer-host .brc-thanks h2 { font-size: 30px; }
  .buy-receipt-customer-host .brc-thanks .brc-sub { font-size: 17px; }
  .buy-receipt-customer-host .brc-thanks .brc-staff { margin-top: 28px; }
}
`;
