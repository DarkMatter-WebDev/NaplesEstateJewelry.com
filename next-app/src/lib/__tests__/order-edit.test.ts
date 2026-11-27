import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addressFields,
  addressObject,
  computeEditTotals,
  defaultChargesTax,
  describeChanges,
  editRefusal,
  editStateFromOrder,
  editTotals,
  keepFixedMoney,
  moneyChanged,
  orderEditRules,
  readEditBody,
  refundPaymentStatus,
  settlePayments,
  taxReason,
  totalsChanges,
  type EditItem,
  type OrderEditState,
  type OrderRowForEdit,
} from '@/lib/order-edit';

function order(patch: Partial<OrderRowForEdit> = {}): OrderRowForEdit {
  return {
    payment_status: 'unpaid',
    payment_method: null,
    refund_amount: 0,
    deleted_at: null,
    tax_exempt: false,
    subtotal: 2450,
    discount: 0,
    shipping_fee: 0,
    tax: 147,
    total: 2597,
    customer_name: 'Mary Conversano',
    customer_email: 'mary@example.com',
    customer_phone: '(239) 555-011',
    shipping_address: { line1: '1200 Gulf Shore Blvd N', city: 'Naples', state: 'FL', postal_code: '34102', country: 'United States' },
    billing_address: null,
    shipping_method: 'shipping',
    customer_notes: null,
    order_items: [{ id: 'item-1', product_id: 'prod-1', inventory_number: '2214', title_snapshot: 'Marco Bicego Lariat Chain & Braceleter -', price_snapshot: 2450, quantity: 1, discount: 0 }],
    ...patch,
  };
}

const item = (patch: Partial<EditItem> = {}): EditItem => ({ id: null, productId: null, title: 'Ring', price: 100, quantity: 1, discount: 0, bullion: false, removed: false, ...patch });

/** NEJ-20261124-LL8G0 as it was on 2026-11-26: $2,076 + $124.56 tax = $2,200.56, split cash + Zelle, a refund only marked. */
function dennis(): OrderRowForEdit {
  return order({
    payment_status: 'refunded',
    order_status: 'refunded',
    payment_method: 'in_store_split',
    refund_amount: 2200.56,
    subtotal: 2076,
    tax: 124.56,
    total: 2200.56,
    shipping_method: 'pickup',
    shipping_address: null,
    split_payments: [{ method: 'cash', amount: 800 }, { method: 'zelle', amount: 1400.56 }],
    order_items: [{ id: 'bar', product_id: null, title_snapshot: 'gold bullion bar', price_snapshot: 2076, quantity: 1, discount: 0, tax_free_bullion: false }],
  });
}

describe('full control (owner, 2026-11-26: "near god mode") — warnings, never locks', () => {
  it('unpaid: everything; no "Paid by" / Refunded', () => {
    expect(orderEditRules(order())).toMatchObject({ paid: false, paymentsEditable: false, refundEditable: false, notes: [] });
  });

  it('paid in store (split): "Paid by" and Refunded can be edited', () => {
    expect(orderEditRules(dennis())).toMatchObject({ paid: true, paymentsEditable: true, paymentPrefix: 'in_store', refundEditable: true });
    expect(orderEditRules(order({ payment_status: 'paid', payment_method: 'remote_zelle' })).paymentPrefix).toBe('remote');
  });

  it('PayPal: editable with a warning; "Paid by" and Refunded stay PayPal\'s', () => {
    const rules = orderEditRules(order({ payment_status: 'paid', payment_method: 'paypal' }));
    expect(rules).toMatchObject({ paymentsEditable: false, refundEditable: false, paypal: true });
    expect(rules.notes.join(' ')).toMatch(/doesn't charge or refund anything in PayPal/);
  });

  it('Trade-in: editable with a warning naming the credit', () => {
    const rules = orderEditRules(order({ payment_status: 'paid', payment_method: 'in_store_split', trade_in: { buy_receipt_id: 'r1', receipt_number: 'BUY-1', description: 'gold', value: 500 } }));
    expect(rules.paymentsEditable).toBe(true);
    expect(rules.notes.join(' ')).toMatch(/BUY-1 credited \$500\.00/);
  });

  it('PayPal / unpaid keep their payments and refund; a Trade-in credit part always stays as saved', () => {
    const paypal = order({ payment_status: 'paid', payment_method: 'paypal', refund_amount: 0 });
    const before = editStateFromOrder(paypal, null);
    const kept = keepFixedMoney(orderEditRules(paypal), before, { ...before, refundAmount: 99, payments: [{ method: 'cash', amount: 1 }] });
    expect(kept).toMatchObject({ refundAmount: 0, payments: [] });

    const trade = order({ payment_status: 'paid', payment_method: 'in_store_split', total: 1000, split_payments: [{ method: 'trade_credit', amount: 600, reference: 'BUY-1' }, { method: 'cash', amount: 400 }] });
    const tBefore = editStateFromOrder(trade, null);
    const tKept = keepFixedMoney(orderEditRules(trade), tBefore, { ...tBefore, payments: [{ method: 'trade_credit', amount: 1, reference: 'BUY-9' }, { method: 'zelle', amount: 400 }] });
    expect(tKept.payments).toEqual([{ method: 'trade_credit', amount: 600, reference: 'BUY-1' }, { method: 'zelle', amount: 400 }]);
  });
});

describe('the tax follows every change at once', () => {
  const state = (patch: Partial<OrderEditState> = {}): OrderEditState => ({ ...editStateFromOrder(order({ shipping_method: 'pickup', shipping_address: null }), null), ...patch });

  it('ticking "Bullion — no sales tax" takes the tax off right away', () => {
    const s = state();
    expect(editTotals(s, false).tax).toBe(147);
    const bullion = { ...s, items: s.items.map((i) => ({ ...i, bullion: true })) };
    expect(editTotals(bullion, false)).toMatchObject({ tax: 0, total: 2450 });
    expect(taxReason(bullion, editTotals(bullion, false), false)).toBe('none: bullion, no sales tax');
    expect(moneyChanged(s, bullion)).toBe(true);
  });

  it('Pickup → Ship out of state: no tax (the problem the owner hit); to Florida: taxed with shipping', () => {
    const s = state();
    const georgia = { ...s, shippingMethod: 'shipping' as const, shippingAddress: { ...s.shippingAddress, state: 'GA' } };
    expect(editTotals(georgia, false).tax).toBe(0);
    expect(taxReason(georgia, editTotals(georgia, false), false)).toBe('none: ships out of state (GA)');
    expect(moneyChanged(s, georgia)).toBe(true);
    const florida = { ...s, shippingMethod: 'shipping' as const, shippingFee: 25, shippingAddress: { ...s.shippingAddress, state: 'Florida' } };
    expect(editTotals(florida, false).tax).toBe(148.5);
  });

  it('Ship with no state yet keeps the tax; the box turns it off by hand', () => {
    const s = state();
    expect(editTotals({ ...s, shippingMethod: 'shipping' }, false).tax).toBe(147);
    expect(editTotals({ ...s, chargesTax: false }, false).tax).toBe(0);
    expect(taxReason({ ...s, chargesTax: false }, editTotals({ ...s, chargesTax: false }, false), false)).toBe('none: turned off for this order');
  });

  it('a saved out-of-state order with no tax starts with the box ON (the rule gives none anyway)', () => {
    const shippedGa = order({ tax: 0, total: 2450, shipping_address: { line1: '1 Peach St', city: 'Atlanta', state: 'GA', postal_code: '30301' } });
    expect(defaultChargesTax(shippedGa)).toBe(true);
    expect(editTotals(editStateFromOrder(shippedGa, null), false).tax).toBe(0);
  });
});

describe("Dennis's order, fixed in one save (2026-11-26)", () => {
  it('starts with the split payments and the marked refund', () => {
    const before = editStateFromOrder(dennis(), null);
    expect(before.payments).toEqual([{ method: 'cash', amount: 800 }, { method: 'zelle', amount: 1400.56 }]);
    expect(before.refundAmount).toBe(2200.56);
    expect(before.chargesTax).toBe(true);
  });

  it('$2,200 bullion, no tax, Zelle $1,400, refund 0 → saves, and the order is Paid again', () => {
    const o = dennis();
    const rules = orderEditRules(o);
    const before = editStateFromOrder(o, null);
    const typed: OrderEditState = {
      ...before,
      items: before.items.map((i) => ({ ...i, price: 2200, bullion: true })),
      payments: [{ method: 'cash', amount: 800 }, { method: 'zelle', amount: 1400 }],
      refundAmount: 0,
    };
    const totals = editTotals(typed, false);
    expect(totals).toMatchObject({ subtotal: 2200, tax: 0, total: 2200 });
    const after = { ...typed, payments: settlePayments(typed.payments, totals.total) };
    expect(editRefusal(rules, after, totals)).toBeNull();
    expect(refundPaymentStatus(after.refundAmount, totals.total)).toBe('paid');
    expect([...describeChanges(before, after), ...totalsChanges(o, totals)]).toEqual([
      { label: 'Price · gold bullion bar', before: '$2,076.00', after: '$2,200.00' },
      { label: 'Bullion, no sales tax · gold bullion bar', before: 'No', after: 'Yes' },
      { label: 'Paid by', before: 'Cash $800.00 + Zelle $1,400.56', after: 'Cash $800.00 + Zelle $1,400.00' },
      { label: 'Refunded', before: '$2,200.56', after: 'none' },
      { label: 'FL sales tax', before: '$124.56', after: '$0.00' },
      { label: 'Total', before: '$2,200.56', after: '$2,200.00' },
    ]);
  });

  it('payments that do not add up wait; a refund over the total is refused', () => {
    const o = dennis();
    const rules = orderEditRules(o);
    const before = editStateFromOrder(o, null);
    const typed = { ...before, items: before.items.map((i) => ({ ...i, price: 2200, bullion: true })), refundAmount: 0 };
    const totals = editTotals(typed, false);
    expect(editRefusal(rules, typed, totals)).toMatch(/\$0\.56 over the \$2,200\.00 total/);
    const fixed = { ...typed, payments: [{ method: 'cash' as const, amount: 800 }, { method: 'zelle' as const, amount: 1400 }] };
    expect(editRefusal(rules, { ...fixed, refundAmount: 2500 }, totals)).toMatch(/can't be more than/);
  });

  it('one payment follows the total by itself', () => {
    expect(settlePayments([{ method: 'zelle', amount: 2200.56 }], 2200)).toEqual([{ method: 'zelle', amount: 2200 }]);
    const cash = order({ payment_status: 'paid', payment_method: 'in_store_cash', total: 500 });
    expect(editStateFromOrder(cash, null).payments).toEqual([{ method: 'cash', amount: 500 }]);
  });

  it('refund status: none → paid, part → partially refunded, all → refunded', () => {
    expect(refundPaymentStatus(0, 100)).toBe('paid');
    expect(refundPaymentStatus(40, 100)).toBe('partially_refunded');
    expect(refundPaymentStatus(100, 100)).toBe('refunded');
  });
});

describe('totals', () => {
  it('6% Florida tax on (subtotal − discount + shipping)', () => {
    const t = computeEditTotals({ items: [item({ price: 2450 })], orderDiscount: 0, shippingFee: 0, chargesTax: true, taxExempt: false });
    expect(t).toMatchObject({ subtotal: 2450, discount: 0, tax: 147, total: 2597 });
    const t2 = computeEditTotals({ items: [item({ price: 1000, quantity: 2, discount: 100 })], orderDiscount: 50, shippingFee: 25, chargesTax: true, taxExempt: false });
    // subtotal 2000, discount 150, base 1850, + 25 shipping → tax 112.50
    expect(t2).toMatchObject({ subtotal: 2000, discount: 150, shippingFee: 25, tax: 112.5, total: 1987.5 });
  });

  it('removed items drop out; bullion lines are not taxed (with their shipping share)', () => {
    const t = computeEditTotals({ items: [item({ price: 1000 }), item({ price: 500, removed: true }), item({ price: 1000, bullion: true })], orderDiscount: 0, shippingFee: 20, chargesTax: true, taxExempt: false });
    expect(t.subtotal).toBe(2000);
    // taxable 1000 + half of the 20 shipping → 6% of 1010
    expect(t.tax).toBe(60.6);
  });

  it('tax exempt: no tax, records the tax not charged', () => {
    const t = computeEditTotals({ items: [item({ price: 1000 })], orderDiscount: 0, shippingFee: 0, chargesTax: true, taxExempt: true });
    expect(t).toMatchObject({ tax: 0, total: 1000, taxNotCharged: 60 });
  });

  it('keeps "no tax" when the order had none (e.g. shipped out of state)', () => {
    expect(defaultChargesTax(order({ tax: 0 }))).toBe(false);
    expect(defaultChargesTax(order())).toBe(true);
    expect(defaultChargesTax(order({ tax_exempt: true }))).toBe(false);
  });
});

describe('state, changes and refusals', () => {
  it('reads the order; order discount = total discount − line discounts', () => {
    const state = editStateFromOrder(order({ discount: 75, order_items: [{ id: 'a', product_id: null, title_snapshot: 'A', price_snapshot: 500, quantity: 1, discount: 25 }] }), null);
    expect(state.orderDiscount).toBe(50);
    expect(state.shippingAddress.postalCode).toBe('34102');
  });

  it('describes a name fix + phone fix and calls it "no money"', () => {
    const before = editStateFromOrder(order(), null);
    const after = { ...before, customerPhone: '(239) 555-0110', items: before.items.map((i) => ({ ...i, title: 'Marco Bicego Lariat Chain & Bracelet' })) };
    const changes = describeChanges(before, after);
    expect(changes).toEqual([
      { label: 'Phone', before: '(239) 555-011', after: '(239) 555-0110' },
      { label: 'Item name', before: 'Marco Bicego Lariat Chain & Braceleter -', after: 'Marco Bicego Lariat Chain & Bracelet' },
    ]);
    expect(moneyChanged(before, after)).toBe(false);
  });

  it('a paid PayPal order takes price, item and shipping changes now (2026-11-26)', () => {
    const paid = order({ payment_status: 'paid', payment_method: 'paypal' });
    const rules = orderEditRules(paid);
    const before = editStateFromOrder(paid, null);
    for (const after of [
      { ...before, items: before.items.map((i) => ({ ...i, price: 2000 })) },
      { ...before, items: [...before.items, item()] },
      { ...before, shippingFee: 25 },
    ]) {
      expect(editRefusal(rules, after, editTotals(after, false))).toBeNull();
    }
  });

  it('a deleted order cannot be edited', () => {
    const deleted = order({ deleted_at: '2026-11-24T00:00:00Z' });
    const before = editStateFromOrder(deleted, null);
    const after = { ...before, customerName: 'X' };
    expect(editRefusal(orderEditRules(deleted), after, editTotals(after, false))).toMatch(/Recycle Bin/);
  });

  it('reads the request and refuses bad input', () => {
    const before = editStateFromOrder(order(), null);
    expect('state' in readEditBody(before)).toBe(true);
    expect(readEditBody({ ...before, customerEmail: 'not-an-email' })).toEqual({ error: 'That email address does not look right.' });
    expect(readEditBody({ ...before, items: [{ ...before.items[0], removed: true }] })).toHaveProperty('error');
    expect(readEditBody({ ...before, items: [{ ...before.items[0], quantity: 0 }] })).toHaveProperty('error');
    expect(readEditBody({ ...before, shippingFee: -5 })).toHaveProperty('error');
  });
});

describe('addresses', () => {
  it('reads both stored shapes and saves the checkout shape', () => {
    expect(addressFields({ address_line1: '1 Main', city: 'Naples', state: 'FL', postal_code: '34109' }).line1).toBe('1 Main');
    expect(addressObject({ line1: '1 Main', line2: '', city: 'Naples', state: 'FL', postalCode: '34109', country: '' }))
      .toEqual({ line1: '1 Main', line2: null, city: 'Naples', state: 'FL', postal_code: '34109', country: 'United States' });
    expect(addressObject({ line1: '', line2: '', city: '', state: '', postalCode: '', country: 'United States' })).toBeNull();
  });
});

describe('wiring', () => {
  const src = (path: string) => readFileSync(join(process.cwd(), 'src', path), 'utf8');
  it('the order page has Edit order, Fix name and Change history', () => {
    const panel = src('components/admin/OrderDetailPanel.tsx');
    expect(panel).toContain('✎ Edit order');
    expect(panel).toContain('<FixItemName');
    expect(panel).toContain('<OrderChangeHistory');
    expect(src('app/[locale]/admin/orders/[id]/page.tsx')).toContain('orderChanges={await loadOrderChanges(supabase, id)}');
  });
  it('the save route re-checks the rules on the server and saves the new money fields', () => {
    const server = src('lib/order-edit-server.ts');
    expect(server).toContain('keepFixedMoney(rules, before,');
    expect(server).toContain('editRefusal(rules, after, totals)');
    expect(server).toContain('update.tax_free_bullion = item.bullion');
    expect(server).toContain('bullionColumnReady(service)');
    expect(server).toContain("adminUpdateProductsStatus(addedProductIds, 'pending_payment')");
    expect(server).toContain("adminUpdateProductsStatus(addedProductIds, 'sold', soldPrices)");
    expect(server).toContain('refundPaymentStatus(after.refundAmount, totals.total)');
    expect(server).toContain('salePaymentReference(');
  });
  it('the window has the bullion box, the tax reason, Paid by and Refunded — and no locks', () => {
    const win = src('components/admin/order-edit/EditOrderWindow.tsx');
    for (const text of ['Bullion — no sales tax', 'taxReason(after, totals, taxExempt)', 'Charge FL sales tax when it applies', 'Paid by', '+ Add a payment', 'Refunded', 'Editing never charges or refunds anyone']) {
      expect(win).toContain(text);
    }
    expect(win).not.toContain('moneyAllowed');
    expect(win).not.toContain('🔒');
  });
  it('"Mark Refunded" asks first on orders not paid through PayPal', () => {
    const panel = src('components/admin/OrderDetailPanel.tsx');
    expect(panel).toContain('This only writes it down; no money moves.');
    expect(panel).not.toMatch(/\} else \{\s*void markRefunded\(\);/);
  });
});
