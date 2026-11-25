import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SaleItemsEditor, {
  isBullionProduct,
  newSaleItem,
  saleItemPayload,
  saleItemsProblem,
  saleItemsTaxFree,
  type SaleItemDraft,
} from '@/components/admin/instant-sale/SaleItemsEditor';
import {
  BULLION_LAW_LINE,
  IN_STORE_METALS,
  bullionTaxLabel,
  inStoreTotals,
  normalizeInStoreSaleInput,
  orderBullionTaxFree,
  saleTaxFreeSubtotal,
  withBullionFlags,
} from '../in-store-sale';
import { normalizeRemoteSaleInput, payPageTotals, sanitizeRemoteDraft } from '../remote-sale';
import { tradeInSaleTotals } from '../trade-in-sale';
import { buildPaperReceipt, type PaperReceiptOrder } from '../order-receipt-paper';
import { buildInvoiceEmailContent, type InvoiceEmailOrder } from '../order-invoice-email';

// "Bullion — no sales tax" on a sale's items (owner, 2026-11-24, mockup 1 +
// "Yes, build it"). Florida: bullion is exempt at any price since Aug 1, 2025
// (DOR TIP 25A01-03); 99.5% gold / 99.9% silver coins since July 1, 2026
// (TIP 26A01-08). Tax is on the rest + the rest's share of shipping (pick 3).

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

describe('inStoreTotals with bullion', () => {
  it('matches the mockup: $4,150 Maple Leaf (bullion) + $1,460 chain → tax on $1,460 only', () => {
    expect(inStoreTotals(5610, { taxFree: 4150 })).toEqual({ subtotal: 5610, shippingFee: 0, tax: 87.6, total: 5697.6, taxFree: 4150, taxable: 1460 });
  });

  it('is unchanged with no bullion', () => {
    expect(inStoreTotals(5610)).toEqual({ subtotal: 5610, shippingFee: 0, tax: 336.6, total: 5946.6, taxFree: 0, taxable: 5610 });
    expect(inStoreTotals(1460, { shippingFee: 59 })).toMatchObject({ tax: 91.14, total: 1610.14 });
  });

  it('an all-bullion sale carries no tax, on the items or the shipping', () => {
    expect(inStoreTotals(4150, { taxFree: 4150, shippingFee: 59 })).toMatchObject({ tax: 0, total: 4209 });
  });

  it('a mixed shipment taxes only the jewelry share of the shipping', () => {
    // $1,000 sale, $600 bullion, $50 shipping → 6% of ($400 + $20) = $25.20.
    expect(inStoreTotals(1000, { taxFree: 600, shippingFee: 50 })).toMatchObject({ tax: 25.2, total: 1075.2, taxable: 400 });
  });

  it('never lets taxFree exceed the subtotal or go negative', () => {
    expect(inStoreTotals(100, { taxFree: 500 })).toMatchObject({ tax: 0, taxFree: 100 });
    expect(inStoreTotals(100, { taxFree: -5 })).toMatchObject({ tax: 6, taxFree: 0 });
  });

  it('out of state stays at no tax', () => {
    expect(inStoreTotals(1000, { taxFree: 600, shippingFee: 50, chargesTax: false })).toMatchObject({ tax: 0, total: 1050 });
  });
});

describe('sale items with the bullion box', () => {
  const customer = { firstName: 'Maria', lastName: 'Lopez', phone: '(239) 555-0134', email: 'Maria@Example.com' };
  const coin = { kind: 'unlisted', title: '1 oz Gold Maple Leaf · .9999', metal: 'Gold', price: '4150', bullion: true };
  const chain = { kind: 'unlisted', title: '14K rope chain', metal: 'Gold', price: '1460' };

  it('Platinum is on the metal list (pick 4)', () => {
    expect(IN_STORE_METALS).toContain('Platinum');
  });

  it('records the bullion item and leaves it out of the tax', () => {
    const result = normalizeInStoreSaleInput({ items: [coin, chain], customer, paidBy: 'zettle' });
    expect('value' in result && result.value).toMatchObject({ subtotal: 5610, tax: 87.6, total: 5697.6, taxFree: 4150 });
    expect('value' in result && result.value.items[0]).toMatchObject({ bullion: true });
    expect('value' in result && result.value.items[1]).not.toHaveProperty('bullion');
    expect(saleTaxFreeSubtotal('value' in result ? result.value.items : [])).toBe(4150);
  });

  it('a split payment must add up to the BULLION-adjusted total', () => {
    const ok = normalizeInStoreSaleInput({ items: [coin, chain], customer, payments: [{ method: 'cash', amount: '5000' }, { method: 'zettle', amount: '697.60' }] });
    expect('value' in ok).toBe(true);
    const old = normalizeInStoreSaleInput({ items: [coin, chain], customer, payments: [{ method: 'cash', amount: '5000' }, { method: 'zettle', amount: '946.60' }] });
    expect(old).toEqual({ error: 'The payments add up to $5,946.60 — $249.00 over the $5,697.60 total.' });
  });

  it('only true ticks it (a string "true" or a missing box stays taxed)', () => {
    const result = normalizeInStoreSaleInput({ items: [{ ...coin, bullion: 'true' }], customer, paidBy: 'cash' });
    expect('value' in result && result.value).toMatchObject({ tax: 249, taxFree: 0 });
  });

  it('refuses unlisted bullion with metal Other — the record must name the metal', () => {
    expect(normalizeInStoreSaleInput({ items: [{ ...coin, metal: 'Other' }], customer, paidBy: 'cash' }))
      .toEqual({ error: 'Bullion must be gold, silver or platinum — pick the metal.' });
    const platinum = normalizeInStoreSaleInput({ items: [{ ...coin, title: '1 oz Platinum bar', metal: 'Platinum' }], customer, paidBy: 'cash' });
    expect('value' in platinum && platinum.value).toMatchObject({ tax: 0, total: 4150 });
  });

  it('a listed item can be bullion too', () => {
    const result = normalizeInStoreSaleInput({ items: [{ kind: 'listed', productId: 'eagle-1', price: '4100', bullion: true }], customer, paidBy: 'cash' });
    expect('value' in result && result.value).toMatchObject({ tax: 0, total: 4100, items: [{ kind: 'listed', bullion: true }] });
  });

  it('a tax-exempt certificate still takes off only the tax that was owed', () => {
    const result = normalizeInStoreSaleInput({
      items: [coin, chain], customer, paidBy: 'cash',
      taxExempt: { enabled: true, physicalCopySeen: true, paperCopyKept: true },
    });
    expect('value' in result && result.value).toMatchObject({ tax: 0, total: 5610, taxNotCharged: 87.6 });
  });
});

describe('Remote sale + pay page + trade-in with bullion', () => {
  const customer = { firstName: 'Margaret', lastName: 'Collins', email: 'm@example.com', phone: '' };
  const pay = { online: true, zelle: false, check: false, phone: false };
  const coin = { kind: 'unlisted', title: '10 oz Silver bar · .999', metal: 'Silver', price: '400', bullion: true };
  const chain = { kind: 'unlisted', title: '14K rope chain', metal: 'Gold', price: '1460' };

  it('the invoice is drawn with tax on the jewelry only', () => {
    const result = normalizeRemoteSaleInput({ items: [coin, chain], customer, pay });
    expect('value' in result && result.value).toMatchObject({ subtotal: 1860, tax: 87.6, total: 1947.6, taxFree: 400 });
  });

  it('the pay page re-figures with the bullion left out at any address', () => {
    const order = { subtotal: 1860, shipping_fee: 0, shipping_method: 'pickup' };
    expect(payPageTotals(order, null, 400)).toMatchObject({ tax: 87.6, total: 1947.6 });
    expect(payPageTotals(order, null)).toMatchObject({ tax: 111.6 });
    expect(payPageTotals({ ...order, shipping_method: 'shipping' }, 'GA', 400)).toMatchObject({ tax: 0, total: 1860 });
  });

  it('a draft keeps the box', () => {
    const draft = sanitizeRemoteDraft({ items: [{ mode: 'unlisted', title: 'bar', metal: 'Platinum', price: '1000', bullion: true }, { mode: 'unlisted', title: 'ring', price: '5' }] });
    expect(draft.items[0]).toMatchObject({ metal: 'Platinum', bullion: true });
    expect(draft.items[1]).toMatchObject({ bullion: false });
  });

  it('the trade-in sale leaves bullion out of the 6% (full price on the rest)', () => {
    expect(tradeInSaleTotals(1860, 400)).toMatchObject({ tax: 87.6, total: 1947.6 });
    expect(tradeInSaleTotals(1860)).toMatchObject({ tax: 111.6 });
  });
});

describe('receipts name the bullion lines', () => {
  const coin = { id: 'line-coin', product_id: null, inventory_number: null, title_snapshot: '1 oz Gold Maple Leaf · .9999', item_year_snapshot: null, metal_snapshot: 'Gold', purity_snapshot: null, gram_weight_snapshot: null, price_snapshot: 4150, quantity: 1, discount: 0, image_snapshot: null };
  const chain = { id: 'line-chain', product_id: null, inventory_number: null, title_snapshot: '14K rope chain', item_year_snapshot: null, metal_snapshot: 'Gold', purity_snapshot: '14K', gram_weight_snapshot: 18.4, price_snapshot: 1460, quantity: 1, discount: 0, image_snapshot: null };
  const items = withBullionFlags([coin, chain], new Set(['line-coin']));
  const paper: PaperReceiptOrder = {
    order_number: 'NEJ-20261124-BUL01', customer_name: 'Jane Rivera', customer_email: null, customer_phone: '(239) 555-0134',
    subtotal: 5610, tax: 87.6, shipping_fee: 0, discount: 0, total: 5697.6,
    payment_status: 'paid', fulfillment_status: 'picked_up', payment_method: 'in_store_cash', shipping_method: 'pickup', shipping_address: null,
    created_at: '2026-11-24T19:42:00Z',
    order_items: items as PaperReceiptOrder['order_items'],
  };

  it('withBullionFlags marks only the listed ids', () => {
    expect(items[0].tax_free_bullion).toBe(true);
    expect(items[1]).not.toHaveProperty('tax_free_bullion');
    expect(withBullionFlags([coin], new Set())).toEqual([coin]);
    expect(orderBullionTaxFree(items)).toBe(4150);
  });

  it('the paper: line label, "6% on $1,460.00", and the law line', () => {
    const { body } = buildPaperReceipt(paper);
    expect(body).toContain('Gold · Bullion — not taxed');
    expect(body).toContain('FL sales tax · 6% on $1,460.00');
    expect(body).toContain(BULLION_LAW_LINE.en);
    expect(body.match(/Bullion — not taxed/g)).toHaveLength(1);
  });

  it('the paper in Spanish', () => {
    const { body } = buildPaperReceipt(paper, { language: 'es' });
    expect(body).toContain('Lingote — sin impuesto');
    expect(body).toContain('Impuesto de ventas de FL · 6% sobre $1,460.00');
    expect(body).toContain(BULLION_LAW_LINE.es);
  });

  it('an all-bullion paper says no tax; a paper with no bullion is unchanged', () => {
    const all = buildPaperReceipt({ ...paper, subtotal: 4150, tax: 0, total: 4150, order_items: withBullionFlags([coin], new Set(['line-coin'])) as PaperReceiptOrder['order_items'] });
    expect(all.body).toContain('FL sales tax · none — bullion');
    const plain = buildPaperReceipt({ ...paper, tax: 336.6, total: 5946.6, order_items: [coin, chain] as PaperReceiptOrder['order_items'] });
    expect(plain.body).toContain('FL sales tax · 6%<');
    expect(plain.body).not.toContain('Bullion');
    expect(plain.body).not.toContain('212.08');
  });

  it('the emailed receipt: line detail, tax label and the law line (text too)', () => {
    const order = {
      id: 'o1', order_number: 'NEJ-20261124-BUL01', user_id: null, customer_name: 'Jane', customer_email: 'jane@example.com', customer_phone: null,
      subtotal: 5610, tax: 87.6, shipping_fee: 0, discount: 0, total: 5697.6, payment_status: 'paid', fulfillment_status: 'picked_up', order_status: 'open',
      payment_method: 'in_store_cash', payment_reference: null, shipping_method: 'pickup', shipping_address: null, billing_address: null,
      internal_notes: null, customer_notes: null, refund_amount: null, created_at: '2026-11-24T19:42:00Z', updated_at: '2026-11-24T19:42:00Z',
      order_items: items.map((item) => ({ ...item, order_id: 'o1', created_at: '2026-11-24T19:42:00Z' })),
    } as unknown as InvoiceEmailOrder;
    const content = buildInvoiceEmailContent(order);
    expect(content.items[0].details).toContain('Bullion — not taxed');
    expect(content.items[1].details).not.toContain('Bullion');
    expect(content.totals.taxLabel).toBe('Tax · 6% on $1,460.00');
    expect(content.totals.bullionLine).toBe(BULLION_LAW_LINE.en);
    expect(content.html).toContain('212.08(7)(ww)');
    expect(content.text).toContain('212.08(7)(ww)');
    const plain = buildInvoiceEmailContent({ ...order, order_items: [{ ...coin, order_id: 'o1', created_at: '' }] } as unknown as InvoiceEmailOrder);
    expect(plain.totals.taxLabel).toBe('Tax');
    expect(plain.totals.bullionLine).toBeNull();
  });

  it('bullionTaxLabel takes a discount off the taxed amount', () => {
    expect(bullionTaxLabel({ subtotal: 5610, discount: 100, tax: 81.6 }, 4150, 'Tax')).toBe('Tax · 6% on $1,360.00');
  });
});

describe('the item card (rendered)', () => {
  const noop = () => undefined;
  const render = (items: SaleItemDraft[]) => renderToStaticMarkup(createElement(SaleItemsEditor, {
    items, setItems: noop, products: [], spotData: null, priceLabel: 'Price sold (before tax)', listedNote: 'Marked sold when recorded.',
  }));

  it('every item has the box, unticked by default; ticked shows the chip', () => {
    const plain = render([{ ...newSaleItem(), title: '14K rope chain', price: '1460' }]);
    expect(plain).toContain('Bullion — no sales tax');
    expect(plain).toContain('Not jewelry, sterling or collectibles.');
    expect(plain).not.toContain('Bullion · no tax');
    expect(plain).toMatch(/<input type="checkbox"(?![^>]*checked)[^>]*>/);
    expect(plain).toContain('<option value="Platinum">Platinum</option>');

    const ticked = render([{ ...newSaleItem(), title: '1 oz Gold Maple Leaf', price: '4150', bullion: true }]);
    expect(ticked).toContain('Bullion · no tax');
    expect(ticked).toMatch(/<input type="checkbox"[^>]*checked/);
    expect(ticked).not.toContain('Pick the metal');
  });

  it('unlisted bullion on "Other" is flagged on the card and blocks the form', () => {
    const item = { ...newSaleItem(), title: 'bar', price: '100', metal: 'Other' as const, bullion: true };
    expect(render([item])).toContain('Pick the metal — bullion is gold, silver or platinum.');
    expect(saleItemsProblem([item])).toBe('pick the metal — bullion is gold, silver or platinum.');
  });

  it('the payload carries the box; the form total leaves ticked prices out', () => {
    const coin = { ...newSaleItem(), title: 'coin', price: '4,150', bullion: true };
    const chain = { ...newSaleItem(), title: 'chain', price: '1460' };
    expect(saleItemPayload(coin)).toMatchObject({ kind: 'unlisted', bullion: true });
    expect(saleItemPayload(chain)).toMatchObject({ bullion: false });
    expect(saleItemsTaxFree([coin, chain])).toBe(4150);
  });

  it('listed Coin / Bullion pieces start ticked (owner pick 2); everything else does not', () => {
    expect(isBullionProduct({ jewelry_type: 'Bullion' })).toBe(true);
    expect(isBullionProduct({ jewelry_type: 'Coin' })).toBe(true);
    expect(isBullionProduct({ jewelry_type: 'Chain' })).toBe(false);
    expect(isBullionProduct(null)).toBe(false);
  });
});

describe('wiring (source checks)', () => {
  const routes = ['in-store-sales', 'remote-sales', 'trade-in-sales'];

  it.each(routes)('%s refuses a bullion sale before the SQL, BEFORE anything is written, and marks the lines after create', (name) => {
    const src = read('src', 'app', 'api', 'admin', name, 'route.ts');
    const blocked = src.indexOf('bullionNotReadyError(service, sale.items)');
    expect(blocked).toBeGreaterThan(0);
    expect(blocked).toBeLessThan(src.indexOf("rpc('create_paypal_order'"));
    if (name === 'trade-in-sales') expect(blocked).toBeLessThan(src.indexOf(".from('buy_receipts')"));
    expect(src.indexOf('markBullionLines(service, orderId, lines.payloads)')).toBeGreaterThan(src.indexOf("rpc('create_paypal_order'"));
    expect(src).toContain('bullionInternalNote(lines.payloads)');
  });

  it('the in-store + trade-in routes mark the lines before the payment step emails the receipt', () => {
    for (const name of ['in-store-sales', 'trade-in-sales']) {
      const src = read('src', 'app', 'api', 'admin', name, 'route.ts');
      expect(src.indexOf('markBullionLines(')).toBeLessThan(src.indexOf('recordOfflinePayment(service'));
    }
  });

  it('the checkout RPC is NOT redefined; the SQL only adds the column', () => {
    const sql = read('..', 'supabase', 'order-items-bullion-2026-11.sql');
    expect(sql).toContain('add column if not exists tax_free_bullion boolean not null default false');
    expect(sql).not.toMatch(/create_paypal_order/i);
    expect(sql).toContain("notify pgrst, 'reload schema'");
  });

  it('the pay page and its create-order route both leave bullion out', () => {
    expect(read('src', 'app', 'api', 'pay', '[token]', 'create-order', 'route.ts')).toContain('loadBullionTaxFree(service, order.id)');
    expect(read('src', 'app', '[locale]', 'pay', '[token]', 'page.tsx')).toContain('loadBullionLineIds(service, order.id)');
  });

  it('no existing item select names the new column (pages work before the SQL)', () => {
    for (const file of [
      ['src', 'lib', 'order-receipt-paper-server.ts'],
      ['src', 'lib', 'order-invoice-mailer.ts'],
      ['src', 'app', '[locale]', 'admin', 'orders', '[id]', 'page.tsx'],
    ]) {
      expect(read(...file)).not.toMatch(/order_items\([^)]*tax_free_bullion/);
    }
  });
});
