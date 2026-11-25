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
  moneyChanged,
  orderEditRules,
  readEditBody,
  type EditItem,
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

describe('what can change (option B + owner changes, 2026-11-24 (11))', () => {
  it('unpaid: everything', () => {
    const rules = orderEditRules(order());
    expect(rules).toMatchObject({ paid: false, moneyAllowed: true, shippingFeeAllowed: true, moneyLockReason: null });
  });

  it('paid by PayPal: money AND shipping fee locked (refund works from the total)', () => {
    const rules = orderEditRules(order({ payment_status: 'paid', payment_method: 'paypal' }));
    expect(rules.moneyAllowed).toBe(false);
    expect(rules.shippingFeeAllowed).toBe(false);
    expect(rules.shippingLockReason).toMatch(/PayPal/);
  });

  it('paid in store, one payment: shipping fee CAN change (owner), items cannot', () => {
    const rules = orderEditRules(order({ payment_status: 'paid', payment_method: 'cash' }));
    expect(rules).toMatchObject({ moneyAllowed: false, shippingFeeAllowed: true, shippingLockReason: null });
  });

  it('paid in several parts, or already refunded: shipping fee locked', () => {
    expect(orderEditRules(order({ payment_status: 'paid', payment_method: 'split', split_payments: [{ method: 'cash', amount: 1 }, { method: 'zelle', amount: 2 }] })).shippingFeeAllowed).toBe(false);
    expect(orderEditRules(order({ payment_status: 'partially_refunded', payment_method: 'cash', refund_amount: 50 })).shippingFeeAllowed).toBe(false);
  });

  it('Trade-in: money and shipping locked even while unpaid (owner: "your recommendation on 5")', () => {
    const rules = orderEditRules(order({ trade_in: { buy_receipt_id: 'r1', receipt_number: 'BUY-1', value: 500 } }));
    expect(rules.moneyAllowed).toBe(false);
    expect(rules.shippingFeeAllowed).toBe(false);
    expect(rules.moneyLockReason).toMatch(/Trade-in/);
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

  it('a paid order refuses item / price changes but takes a name fix', () => {
    const paid = order({ payment_status: 'paid', payment_method: 'paypal' });
    const rules = orderEditRules(paid);
    const before = editStateFromOrder(paid, null);
    const renamed = { ...before, items: before.items.map((i) => ({ ...i, title: 'Fixed' })) };
    expect(editRefusal(rules, before, renamed)).toBeNull();
    const repriced = { ...before, items: before.items.map((i) => ({ ...i, price: 2000 })) };
    expect(editRefusal(rules, before, repriced)).toMatch(/Paid orders keep/);
    const added = { ...before, items: [...before.items, item()] };
    expect(editRefusal(rules, before, added)).toMatch(/Paid orders keep/);
    const shipped = { ...before, shippingFee: 25 };
    expect(editRefusal(rules, before, shipped)).toMatch(/PayPal/);
  });

  it('a deleted order cannot be edited', () => {
    const deleted = order({ deleted_at: '2026-11-24T00:00:00Z' });
    const before = editStateFromOrder(deleted, null);
    expect(editRefusal(orderEditRules(deleted), before, { ...before, customerName: 'X' })).toMatch(/Recycle Bin/);
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
  it('the save route re-checks the rules on the server', () => {
    const server = src('lib/order-edit-server.ts');
    expect(server).toContain('editRefusal(rules, before, after)');
    expect(server).toContain("adminUpdateProductsStatus(addedProductIds, 'pending_payment')");
  });
});
