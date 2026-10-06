// Styles for the buy-receipt paper and its print host.
//
// Everything is scoped under `.buy-receipt-sheet` on purpose: the form shows
// the paper INSIDE the normal admin page, so nothing here may touch `body`,
// `header` or any other page element (the order print page styles those
// globally, which is fine there because that page is only the printout).
//
// Two levels of type, owner ruling 2026-09-30: section titles ("Seller",
// "Items purchased") are larger and near-black with a gold rule; field labels
// stay small, uppercase and muted so the title clearly outranks them.
//
// Field labels sit UNDER their line (owner, 2026-10-01: the way a paper form
// reads, and how the signature lines already worked). Table column headings
// stay on top — they head a column, they do not label one blank.
//
// The form (edit mode) differs from the printed paper in ONE thing (owner,
// 2026-10-03, "layout B"): the Email box is one column wider and the Name box
// one narrower, so the two small boxes "Email copy" and "Mailing list" fit on
// the Email label's line. The printed paper keeps Name 5 / Phone 3 / Email 4.
//
// The seller's view (customer input mode) is this same paper with the owner's
// parts faded and switched off — see the block near the end.

/**
 * How faint the owner's parts of the paper are while the seller has the tablet.
 * Owner, 2026-10-03: "make the grey-out a little stronger so its very obvious
 * which fields they need to input" (the mockup had 0.36). The one number to
 * change.
 */
export const BUY_RECEIPT_CUSTOMER_DIM = 0.22;

export const BUY_RECEIPT_SHEET_CSS = `
.buy-receipt-sheet {
  position: relative;
  box-sizing: border-box;
  width: min(8.5in, 100%);
  min-height: 11in;
  margin: 0 auto;
  padding: 0.5in;
  background: #ffffff;
  color: #1a1c1c;
  border: 1px solid #d5c697;
  box-shadow: 0 10px 34px rgba(60, 48, 0, 0.12);
  font-family: var(--font-body, Arial), Arial, Helvetica, sans-serif;
  font-size: 13px;
  line-height: 1.4;
  overflow: hidden;
}
.buy-receipt-sheet *, .buy-receipt-sheet *::before, .buy-receipt-sheet *::after { box-sizing: border-box; }

.buy-receipt-sheet .brs-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding-bottom: 10px;
  border-bottom: 2px solid #735c00;
}
.buy-receipt-sheet .brs-brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
.buy-receipt-sheet .brs-logo { height: 46px; width: auto; flex: none; }
.buy-receipt-sheet .brs-name {
  font-family: var(--font-headline, Georgia), Georgia, 'Times New Roman', serif;
  font-size: 21px;
  line-height: 1.1;
  color: #735c00;
}
.buy-receipt-sheet .brs-contact { margin-top: 3px; font-size: 12px; color: #746b5b; }
.buy-receipt-sheet .brs-meta { text-align: right; font-size: 12px; white-space: nowrap; }
.buy-receipt-sheet .brs-doc {
  font-family: var(--font-headline, Georgia), Georgia, 'Times New Roman', serif;
  font-size: 16px;
  color: #735c00;
  margin-bottom: 4px;
}
.buy-receipt-sheet .brs-muted { color: #746b5b; }
.buy-receipt-sheet .brs-copy-tag { margin-top: 3px; font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase; color: #746b5b; }

.buy-receipt-sheet .sheet-section-title {
  margin: 12px 0 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid #735c00;
  font-family: var(--font-headline, Georgia), Georgia, 'Times New Roman', serif;
  font-size: 15px;
  font-weight: 600;
  color: #1a1c1c;
}
.buy-receipt-sheet .brs-label {
  display: block;
  margin: 2px 0 0;
  font-size: 10.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #746b5b;
}

.buy-receipt-sheet .brs-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 8px 12px; }
.buy-receipt-sheet .brs-c1 { grid-column: span 1; }
.buy-receipt-sheet .brs-c2 { grid-column: span 2; }
.buy-receipt-sheet .brs-c3 { grid-column: span 3; }
.buy-receipt-sheet .brs-c4 { grid-column: span 4; }
.buy-receipt-sheet .brs-c5 { grid-column: span 5; }
.buy-receipt-sheet .brs-c6 { grid-column: span 6; }

.buy-receipt-sheet .sheet-input {
  display: block;
  width: 100%;
  height: 30px;
  padding: 0 6px;
  border: 0;
  border-bottom: 1px solid #d5c697;
  border-radius: 0;
  background: #fbf9f2;
  color: #1a1c1c;
  font: inherit;
  font-size: 13px;
  line-height: 30px;
  outline: none;
}
.buy-receipt-sheet select.sheet-input { padding: 0 2px; }
.buy-receipt-sheet textarea.sheet-input {
  height: 30px;
  min-height: 30px;
  padding: 5px 6px;
  line-height: 20px;
  resize: none;
  overflow: hidden;
}
.buy-receipt-sheet .sheet-input:focus { border-bottom-color: #735c00; background: #fffdf3; box-shadow: 0 1px 0 #735c00; }
.buy-receipt-sheet .sheet-input::placeholder { color: #a79e8b; }
.buy-receipt-sheet .brs-right { text-align: right; }
/* The Email label and the two short boxes, "Email copy" and "Mailing list", share one line under the field. */
.buy-receipt-sheet .brs-label-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.buy-receipt-sheet .brs-email-copy { display: flex; flex: none; align-items: center; gap: 5px; margin-top: 2px; font-size: 11.5px; line-height: 1.3; white-space: nowrap; color: #746b5b; cursor: pointer; }
.buy-receipt-sheet .brs-email-copy input { width: 14px; height: 14px; margin: 0; accent-color: #735c00; }
.buy-receipt-sheet .brs-email-copy:has(input:disabled) { opacity: 0.55; cursor: default; }
/* That line holds the label and both boxes in full words down to about 264px. Narrower (a tablet
   held upright), the word "(optional)" leaves the label in place — nothing stacks, nothing moves.
   Measured against the Email box itself, not the window: the same paper is also shown, wider, in
   the seller's view. (A browser without container queries keeps the word.) */
.buy-receipt-sheet .brs-cell-email { container-type: inline-size; }
@container (max-width: 270px) {
  .buy-receipt-sheet .brs-two .brs-opt { display: none; }
}

.buy-receipt-sheet .brs-value {
  display: block;
  min-height: 24px;
  padding: 2px 4px;
  border-bottom: 1px solid #cfc3a0;
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.buy-receipt-sheet .brs-items { width: 100%; border-collapse: collapse; table-layout: fixed; }
.buy-receipt-sheet .brs-items th {
  padding: 2px 6px 4px;
  border-bottom: 1px solid #735c00;
  font-size: 10.5px;
  font-weight: 400;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-align: left;
  color: #746b5b;
}
.buy-receipt-sheet .brs-items td { padding: 4px 6px; border-bottom: 1px solid #eadfbd; vertical-align: middle; }
.buy-receipt-sheet .brs-items .brs-num { width: 28px; color: #746b5b; }
.buy-receipt-sheet .brs-items .brs-qty { width: 58px; }
.buy-receipt-sheet .brs-items .brs-amount { width: 118px; text-align: right; }
.buy-receipt-sheet .brs-items .brs-tools { width: 30px; padding-left: 0; padding-right: 0; text-align: center; border-bottom-color: transparent; }
.buy-receipt-sheet .brs-items td.brs-text { height: 30px; overflow-wrap: anywhere; }

.buy-receipt-sheet .brs-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid #d5c697;
  border-radius: 4px;
  background: #ffffff;
  color: #735c00;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}
.buy-receipt-sheet .brs-icon-button.is-quiet { border-color: transparent; background: transparent; color: #746b5b; }
.buy-receipt-sheet .brs-icon-button:hover { border-color: #735c00; color: #735c00; }
.buy-receipt-sheet .brs-icon-button:disabled { opacity: 0.35; cursor: default; }
.buy-receipt-sheet .brs-link-button {
  margin-top: 6px;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: #735c00;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.buy-receipt-sheet .brs-total {
  display: flex;
  justify-content: flex-end;
  align-items: baseline;
  gap: 24px;
  margin-top: 6px;
  padding: 8px 6px 0;
  border-top: 2px solid #735c00;
  font-family: var(--font-headline, Georgia), Georgia, 'Times New Roman', serif;
}
.buy-receipt-sheet .brs-total-label { font-size: 14px; }
.buy-receipt-sheet .brs-total-value { min-width: 106px; text-align: right; font-size: 16px; font-weight: 600; }

.buy-receipt-sheet .brs-pay { margin-top: 8px; }
.buy-receipt-sheet .brs-pay-row {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1fr) 28px;
  gap: 8px 12px;
  align-items: end;
  margin-top: 6px;
}
.buy-receipt-sheet .brs-hint { margin: 6px 0 0; font-size: 11.5px; }
.buy-receipt-sheet .brs-hint.is-ok { color: #3b6d11; }
.buy-receipt-sheet .brs-hint.is-off { color: #a32d2d; }

.buy-receipt-sheet .brs-notes { margin-top: 10px; }
.buy-receipt-sheet .brs-attest { margin: 12px 0 0; font-size: 11.5px; line-height: 1.45; }
.buy-receipt-sheet .brs-signatures {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 12px 24px;
  margin-top: 14px;
  break-inside: avoid;
}
.buy-receipt-sheet .brs-sign-line { height: 30px; border-bottom: 1px solid #1a1c1c; }
.buy-receipt-sheet .brs-sign-label { margin-top: 4px; }
.buy-receipt-sheet .brs-sign-line.brs-signature-ink { display: flex; align-items: flex-end; height: 40px; padding: 0 6px 2px; }
.buy-receipt-sheet .brs-signature { font-size: 34px; line-height: 1; color: #1f2540; }
.buy-receipt-sheet .brs-signature-date { font-size: 13px; line-height: 1.2; }

/* The SHOP copy's signatures (owner, 2026-10-06): the seller's line and the shop's printed signature
   on ONE level, side by side, each with its date. The halves are 272 : 328 and split 170 + 90 and
   226 + 90, measured for the printed page (6.5 in of content): the seller keeps a 1.77 in line to
   sign on, and the cursive signature fits its own line at 30px (208px wide in 226px) — at the 34px
   it has on the seller's copy it is 236px and broke into two lines over the label above it. Both
   lines are 40px tall so they sit on one level. (.brs-signatures, above, is now the seller's copy
   only: one signature, full width, 34px.) */
.buy-receipt-sheet .brs-sign-row {
  display: grid;
  grid-template-columns: 272fr 328fr;
  gap: 24px;
  margin-top: 14px;
  break-inside: avoid;
}
.buy-receipt-sheet .brs-sign-pair { display: grid; gap: 12px; align-items: start; }
.buy-receipt-sheet .brs-sign-seller { grid-template-columns: 170fr 90fr; }
.buy-receipt-sheet .brs-sign-shop { grid-template-columns: 226fr 90fr; }
.buy-receipt-sheet .brs-sign-row .brs-sign-line { height: 40px; }
.buy-receipt-sheet .brs-sign-row .brs-signature { font-size: 30px; white-space: nowrap; }

/* The pictures a shop copy carries — the ID photo (a copy that asked for it) and the seller's
   thumbprint — side by side UNDER the signatures (owner, 2026-10-06). They come last so that on a
   long receipt they are the first thing to move to a second sheet; break-inside keeps the two
   together and whole.
   The padding/negative-margin pair: there is no @page margin (see the print host), so a block that
   starts a new page starts at the paper's very edge, where the owner's printer cuts. A margin is
   dropped at a page break and padding is not — so on the first sheet the two cancel to the normal
   14px gap, and on a second sheet the pictures start 0.6in down. Read back from the PDF, 2026-10-06. */
.buy-receipt-sheet .brs-pictures {
  display: flex;
  gap: 24px;
  align-items: flex-start;
  break-inside: avoid;
  padding-top: 0.6in;
  margin-top: calc(14px - 0.6in);
}
.buy-receipt-sheet .brs-id img {
  display: block;
  width: 3.375in;
  height: 2.125in;
  border: 1px solid #d5c697;
  object-fit: contain;
  background: #fbf9f2;
}

/* The seller's thumbprint (owner, 2026-10-06): SHOP copies only. As tall as the ID card it sits
   beside (the reader's picture is 3 : 4, so 1.59 x 2.125 in), and the same size when a copy carries
   no ID photo. */
.buy-receipt-sheet .brs-thumbprint img {
  display: block;
  width: 1.59375in;
  height: 2.125in;
  border: 1px solid #d5c697;
  object-fit: contain;
  background: #ffffff;
}
.buy-receipt-sheet .brs-thumbprint .brs-label { white-space: nowrap; }

.buy-receipt-sheet .brs-thanks { margin: 12px 0 0; text-align: center; font-size: 11px; color: #746b5b; }

.buy-receipt-sheet .brs-void-mark {
  position: absolute;
  top: 38%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(-24deg);
  font-family: var(--font-headline, Georgia), Georgia, serif;
  font-size: 150px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: rgba(163, 45, 45, 0.13);
  pointer-events: none;
  user-select: none;
}
.buy-receipt-sheet .brs-void-line { margin: 8px 0 0; font-size: 12px; font-weight: 600; color: #a32d2d; }

/* ── The seller's view of this same paper (customer input mode; owner, 2026-10-03) ──
   Nothing here touches the owner's form or a printed sheet: every rule hangs on a class or an
   attribute that only the seller's view adds.
   The owner's parts — ID type, ID last 4, date of birth, the ID photo, the items, the money, the
   notes, the signatures — are faded and cannot be touched (they are also switched off in the
   markup: disabled + inert). The seven seller boxes keep the paper's normal look. */
.buy-receipt-sheet .brs-off { opacity: ${BUY_RECEIPT_CUSTOMER_DIM}; pointer-events: none; -webkit-user-select: none; user-select: none; }
.buy-receipt-sheet fieldset.brs-rest { display: block; min-width: 0; margin: 0; padding: 0; border: 0; }
/* A switched-off box keeps the paper's own ink (iOS would otherwise fade it a second time), so the
   one fade above greys every part evenly. */
.buy-receipt-sheet .brs-off .sheet-input:disabled { opacity: 1; color: #1a1c1c; -webkit-text-fill-color: #1a1c1c; }
/* A flagged seller box, in the paper's own language: a red line; "Needed" inside an empty box;
   the reason beside the label of one that is filled in but not right. Nothing changes size. */
.buy-receipt-sheet .sheet-input[aria-invalid="true"] { border-bottom-color: #ba1a1a; background: #fff6f5; box-shadow: 0 1px 0 #ba1a1a; }
.buy-receipt-sheet .sheet-input[aria-invalid="true"]::placeholder { color: #ba1a1a; opacity: 1; }
.buy-receipt-sheet .sheet-input[aria-invalid="true"] + .brs-label,
.buy-receipt-sheet .sheet-input[aria-invalid="true"] + .brs-label-row > .brs-label { color: #ba1a1a; }
/* One line, always: a reason too long for its box is cut short rather than pushing the paper down. */
.buy-receipt-sheet .sheet-input[aria-invalid="true"] + .brs-label { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.buy-receipt-sheet .brs-why { font-weight: 600; letter-spacing: 0; text-transform: none; }

/* Layout B (see the top of this file): only where the paper has its full twelve columns. The two
   narrower layouts below keep their rows exactly as they were. */
@media screen and (min-width: 761px) {
  .buy-receipt-sheet .brs-grid > .brs-cell-name { grid-column: span 4; }
  .buy-receipt-sheet .brs-grid > .brs-cell-email { grid-column: span 5; }
}

/* screen ONLY. When a print dialog applies its own margins the page is about 740px wide; without the
   word screen this rule stacked the header and halved the field rows ON PAPER and pushed the last line to a second sheet
   (owner's print, 2026-09-30). */
/* Tablet: the paper fills the screen, the header stacks, fields go two per row. */
@media screen and (max-width: 760px) {
  .buy-receipt-sheet { padding: 18px 14px; min-height: 0; }
  .buy-receipt-sheet .brs-head { flex-direction: column; }
  .buy-receipt-sheet .brs-meta { text-align: left; white-space: normal; }
  .buy-receipt-sheet .brs-grid > * { grid-column: span 6; }
  .buy-receipt-sheet .brs-grid > .brs-c5, .buy-receipt-sheet .brs-grid > .brs-c6 { grid-column: span 12; }
}

/* Under 640px the shop's half of the signature row is narrower than the signature itself (it needs
   a 220px line): the seller's line, then the shop's, one under the other. screen ONLY, as above. */
@media screen and (max-width: 640px) {
  .buy-receipt-sheet .brs-sign-row { grid-template-columns: 1fr; gap: 14px; }
}

/* Phone (owner, 2026-09-30: usable on tablet and mobile too). One field per row;
   each item row becomes a small block — description across, then qty, amount and
   the remove button; each payment row the same. */
@media screen and (max-width: 520px) {
  .buy-receipt-sheet { padding: 14px 10px; font-size: 14px; }
  .buy-receipt-sheet .brs-grid { gap: 8px; }
  .buy-receipt-sheet .brs-grid > * { grid-column: span 12; }
  .buy-receipt-sheet .brs-items thead { display: none; }
  .buy-receipt-sheet .brs-items,
  .buy-receipt-sheet .brs-items tbody { display: block; }
  .buy-receipt-sheet .brs-items tr {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) minmax(0, 1fr) 30px;
    grid-template-areas: 'num desc desc desc' 'num qty amount tools';
    gap: 4px 6px;
    padding: 6px 0;
    border-bottom: 1px solid #eadfbd;
  }
  .buy-receipt-sheet .brs-items td { display: block; width: auto; padding: 0; border: 0; }
  .buy-receipt-sheet .brs-items td.brs-num { grid-area: num; align-self: start; padding-top: 6px; }
  .buy-receipt-sheet .brs-items td.brs-qty { grid-area: qty; }
  .buy-receipt-sheet .brs-items td.brs-amount { grid-area: amount; }
  .buy-receipt-sheet .brs-items td.brs-tools { grid-area: tools; align-self: center; text-align: right; }
  .buy-receipt-sheet .brs-items td.brs-desc { grid-area: desc; }
  .buy-receipt-sheet .brs-items .brs-qty input::placeholder { color: #a79e8b; }
  .buy-receipt-sheet .brs-pay-row {
    grid-template-columns: minmax(0, 1fr) 28px;
    grid-template-areas: 'method tools' 'reference reference' 'amount amount';
    /* No row gap: the two optional rows are usually empty, and their gaps pushed the "Paid by" label away from its line. */
    row-gap: 0;
  }
  .buy-receipt-sheet .brs-pay-row > input { margin-top: 8px; }
  .buy-receipt-sheet .brs-pay-row > select { grid-area: method; }
  .buy-receipt-sheet .brs-pay-row > :nth-child(2) { grid-area: reference; }
  .buy-receipt-sheet .brs-pay-row > :nth-child(3) { grid-area: amount; }
  .buy-receipt-sheet .brs-pay-row > :nth-child(4) { grid-area: tools; }
  .buy-receipt-sheet .brs-pay-row > span:empty { display: none; }
  .buy-receipt-sheet .brs-total { gap: 12px; }
  .buy-receipt-sheet .brs-signatures { grid-template-columns: 1fr; gap: 14px; }
  .buy-receipt-sheet .brs-pictures { flex-wrap: wrap; }
  .buy-receipt-sheet .brs-signature,
  .buy-receipt-sheet .brs-sign-row .brs-signature { font-size: 28px; }
}

/* Touch screens: 16px inputs, or iOS zooms the page on every tap into a field. */
@media screen and (hover: none) and (pointer: coarse) {
  .buy-receipt-sheet .sheet-input { font-size: 16px; }
}
`;

/**
 * The print host is a direct child of <body> (a portal). On paper it is the
 * ONLY thing shown, so the admin page around the form never prints.
 *
 * ⛔ `@page { margin: 0 }` is deliberate: with any page margin Chrome prints its
 * own header and footer (date, page title, web address). The Print Station runs
 * Chrome with --kiosk-printing, where no dialog exists to untick them. The
 * paper's own 0.5in padding is the margin.
 */
export const BUY_RECEIPT_PRINT_HOST_CSS = `
.buy-receipt-print-host { display: none; }
@page { size: letter; margin: 0; }
@media print {
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    height: auto !important;
    min-height: 0 !important;
    background: #ffffff !important;
  }
  body > *:not(.buy-receipt-print-host) { display: none !important; }
  .buy-receipt-print-host { display: block !important; }
  .buy-receipt-print-host .buy-receipt-sheet {
    width: 100%;
    max-width: none;
    min-height: 0;
    margin: 0;
    /* The paper's own margin (there is no @page margin, see above). The owner's printer cut the
       edges at half an inch; they asked for bigger again after 0.7 in (2026-09-30). */
    /* Top 0.85in (owner: more room at the top), bottom 0.45in, sides 1in. Not more in total: every
       tenth of an inch here is paper the receipt cannot use. (The old reason — a file copy with the
       ID beside its signature lines had to fit one page — went with that layout on 2026-10-06: the
       pictures now sit under the signatures and move to a second sheet when they do not fit.) */
    padding: 0.85in 1in 0.45in;
    border: 0;
    box-shadow: none;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .buy-receipt-print-host .no-print { display: none !important; }
  /* Several copies in ONE print job: one sheet per page. (~ not +: each sheet brings its own <style> tag.) */
  .buy-receipt-print-host .buy-receipt-sheet ~ .buy-receipt-sheet { break-before: page; }
}
/* A print dialog whose margin setting overrides ours makes the page box narrower than Letter's 816px. The
   browser's margin (about 0.4in) is then most of the margin; the paper adds only what is missing. */
@media print and (max-width: 800px) {
  .buy-receipt-print-host .buy-receipt-sheet { padding: 0.45in 0.6in 0.05in; }
}
`;
