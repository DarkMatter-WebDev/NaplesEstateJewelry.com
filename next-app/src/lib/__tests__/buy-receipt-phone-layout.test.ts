import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUY_RECEIPT_SHEET_CSS } from '../../components/admin/buy-receipts/buy-receipt-sheet-css';

// The buy receipt on a phone (owner mockup v1, 2026-10-20). The rules live in the paper's
// stylesheet, inside the screen-only phone block, so the printed paper and the computer/iPad
// layouts never see them.
const dir = join(process.cwd(), 'src', 'components', 'admin', 'buy-receipts');
const read = (file: string) => readFileSync(join(dir, file), 'utf8');

function phoneBlock(): string {
  const start = BUY_RECEIPT_SHEET_CSS.indexOf('@media screen and (max-width: 520px) {');
  expect(start).toBeGreaterThan(-1);
  // The block ends at the first "}" on a line of its own.
  const end = BUY_RECEIPT_SHEET_CSS.indexOf('\n}', start);
  return BUY_RECEIPT_SHEET_CSS.slice(start, end);
}
const compact = (css: string) => css.replace(/\s+/g, ' ');

describe('buy receipt phone layout', () => {
  it('keeps each item on one line on a phone: number, description, amount, remove', () => {
    const css = compact(phoneBlock());
    expect(css).toContain("grid-template-areas: 'num desc amount tools';");
    expect(css).toContain('grid-template-columns: 22px minmax(0, 1fr) 96px 24px;');
    // The computer's fixed cell widths must not apply, or the amount spills over the ×.
    expect(css).toContain('.buy-receipt-sheet .brs-items td.brs-tools { width: auto; min-width: 0; }');
    // An older saved receipt that really has a quantity keeps it on the same line.
    expect(css).toContain(".brs-items tr:has(> td.brs-qty) { grid-template-columns: 22px 34px minmax(0, 1fr) 96px; grid-template-areas: 'num qty desc amount'; }");
  });

  it('has no Qty box on the form at any size; the paper prints Qty only for a real quantity', () => {
    const sheet = read('BuyReceiptSheet.tsx');
    expect(sheet).not.toContain('quantity` }');
    expect(sheet).not.toContain('{ qty: e.target.value }');
    // One shared rule for the paper and the seller's email (lib/buy-receipts.ts).
    expect(sheet).toContain('const showQty = buyReceiptShowsQty(items);');
    expect(readFileSync(join(process.cwd(), 'src', 'lib', 'buy-receipt-email.ts'), 'utf8')).toContain('const showQty = buyReceiptShowsQty(items);');
    expect(sheet).toContain('{showQty && <th className="brs-qty">Qty</th>}');
    expect(sheet).toContain('{showQty && <td className="brs-qty brs-text">{item.qty}</td>}');
    // Exactly one Qty heading in the file: the paper's, behind showQty.
    expect(sheet.split('>Qty</th>').length - 1).toBe(1);
  });

  it('keeps "Items purchased by Naples Estate Jewelry" on one line, shrinking in place', () => {
    expect(compact(phoneBlock())).toContain('.brs-items-title { white-space: nowrap; font-size: min(15px, 3.6vw); }');
    expect(read('BuyReceiptSheet.tsx').split('sheet-section-title brs-items-title').length - 1).toBe(2);
  });

  it('pairs State + ZIP and ID type + ID last 4 with new, unused class names', () => {
    const css = compact(phoneBlock());
    expect(css).toContain('.brs-grid > .brs-cell-state { grid-column: span 4; }');
    expect(css).toContain('.brs-grid > .brs-cell-zip { grid-column: span 8; }');
    expect(css).toContain('.brs-grid > .brs-cell-idtype { grid-column: span 7; }');
    expect(css).toContain('.brs-grid > .brs-cell-idlast4 { grid-column: span 5; }');
    const sheet = read('BuyReceiptSheet.tsx');
    for (const name of ['brs-cell-state', 'brs-cell-zip', 'brs-cell-idtype', 'brs-cell-idlast4']) {
      // Exactly one cell carries each (a reused paper class once restyled the Name box).
      expect(sheet.split(name).length - 1).toBe(1);
    }
  });

  it('lays the ID photo and thumbprint strips out by class, overriding the cancelled min-width', () => {
    const css = compact(phoneBlock());
    expect(css).toContain('.brs-strip > .brs-strip-text { flex: 1 1 50%; min-width: 0; }');
    expect(css).toContain('.brs-strip > .brs-strip-btn { flex: 1 1 calc(50% - 6px); align-self: stretch; min-height: 40px;');
    for (const file of ['IdPhotoField.tsx', 'ThumbprintField.tsx']) {
      const source = read(file);
      expect(source).toContain('className="brs-strip no-print');
      expect(source).toContain('className="brs-strip-text');
      expect(source).toContain("const buttonClass = 'brs-strip-btn ");
    }
    expect(read('IdPhotoField.tsx')).toContain('className="brs-strip-check ');
  });

  it('stacks the buttons under the paper in the approved order', () => {
    const css = compact(phoneBlock());
    expect(css).toContain('.brs-actions > .brs-actions-row { display: contents; }');
    const order = ['brs-act-draft', 'brs-act-clear', 'brs-act-print', 'brs-act-save', 'brs-act-send'].map((name) => {
      const match = css.match(new RegExp(`\\.${name} \\{[^}]*order: (\\d+)`));
      return Number(match?.[1]);
    });
    expect(order).toEqual([2, 3, 4, 5, 6]);
    const form = read('BuyReceiptForm.tsx');
    for (const name of ['brs-actions mx-auto', 'brs-act-draft', 'brs-act-clear', 'brs-act-print', 'brs-act-save', 'brs-act-send']) {
      expect(form).toContain(name);
    }
  });

  it('keeps every phone rule off paper and off the computer layout', () => {
    // No new class appears outside the screen-only phone block.
    const outside = BUY_RECEIPT_SHEET_CSS.replace(phoneBlock(), '');
    for (const name of ['brs-strip', 'brs-actions', 'brs-act-', 'brs-items-title', 'brs-cell-state', 'brs-cell-zip', 'brs-cell-idtype', 'brs-cell-idlast4']) {
      expect(outside).not.toContain(name);
    }
  });
});
