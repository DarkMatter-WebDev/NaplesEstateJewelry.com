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
  gap: 16px;
  padding-bottom: 12px;
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

.buy-receipt-sheet .sheet-section-title {
  margin: 16px 0 10px;
  padding-bottom: 4px;
  border-bottom: 1px solid #735c00;
  font-family: var(--font-headline, Georgia), Georgia, 'Times New Roman', serif;
  font-size: 15px;
  font-weight: 600;
  color: #1a1c1c;
}
.buy-receipt-sheet .brs-label {
  display: block;
  margin: 0 0 2px;
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
.buy-receipt-sheet .brs-attest { margin: 16px 0 0; font-size: 11.5px; line-height: 1.5; }
.buy-receipt-sheet .brs-signatures {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 18px 24px;
  margin-top: 22px;
  break-inside: avoid;
}
.buy-receipt-sheet .brs-sign-line { height: 30px; border-bottom: 1px solid #1a1c1c; }
.buy-receipt-sheet .brs-sign-label { margin-top: 4px; }

.buy-receipt-sheet .brs-sign-with-id {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 3.375in;
  gap: 24px;
  align-items: start;
  margin-top: 22px;
  break-inside: avoid;
}
.buy-receipt-sheet .brs-sign-stack { display: grid; gap: 18px; }
.buy-receipt-sheet .brs-id img {
  display: block;
  width: 3.375in;
  height: 2.125in;
  border: 1px solid #d5c697;
  object-fit: contain;
  background: #fbf9f2;
}

.buy-receipt-sheet .brs-thanks { margin: 18px 0 0; text-align: center; font-size: 11px; color: #746b5b; }

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

@media (max-width: 760px) {
  .buy-receipt-sheet { padding: 18px 14px; min-height: 0; }
  .buy-receipt-sheet .brs-head { flex-direction: column; }
  .buy-receipt-sheet .brs-meta { text-align: left; white-space: normal; }
  .buy-receipt-sheet .brs-grid > * { grid-column: span 6; }
  .buy-receipt-sheet .brs-grid > .brs-c5, .buy-receipt-sheet .brs-grid > .brs-c6 { grid-column: span 12; }
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
    width: 8.5in;
    min-height: 0;
    margin: 0;
    border: 0;
    box-shadow: none;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .buy-receipt-print-host .no-print { display: none !important; }
}
`;
