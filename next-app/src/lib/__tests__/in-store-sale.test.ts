import { describe, expect, it } from 'vitest';
import {
  inStorePaymentMethodValue,
  inStoreTotals,
  normalizeInStoreSaleInput,
  parseInStorePrice,
  paymentMethodLabel,
} from '../in-store-sale';

const customer = { firstName: 'Maria', lastName: 'Lopez', phone: '(239) 555-0134', email: 'Maria@Example.com' };

describe('parseInStorePrice', () => {
  it('accepts typed dollar amounts in the shapes the owner types', () => {
    expect(parseInStorePrice('$1,460')).toBe(1460);
    expect(parseInStorePrice('1460.50')).toBe(1460.5);
    expect(parseInStorePrice(' 1,026.00 ')).toBe(1026);
  });
  it('rejects blanks, words, zero and negatives', () => {
    for (const raw of ['', 'Sold', '0', '-5', '1.234', null, undefined]) expect(parseInStorePrice(raw)).toBeNull();
  });
});

describe('inStoreTotals', () => {
  it('applies the Florida rate the way local pickup does online', () => {
    expect(inStoreTotals(1460)).toEqual({ subtotal: 1460, tax: 87.6, total: 1547.6 });
    expect(inStoreTotals(1026)).toEqual({ subtotal: 1026, tax: 61.56, total: 1087.56 });
  });
});

describe('normalizeInStoreSaleInput', () => {
  it('records a listed item with the price sold, not the listed price', () => {
    const result = normalizeInStoreSaleInput({ item: { kind: 'listed', productId: 'tiffany-ladle-53', price: '$1,000' }, customer, paidBy: 'zettle', note: ' cash discount ' });
    expect('value' in result && result.value).toMatchObject({
      item: { kind: 'listed', productId: 'tiffany-ladle-53', price: 1000 },
      customer: { name: 'Maria Lopez', email: 'maria@example.com' },
      paidBy: 'zettle',
      note: 'cash discount',
      subtotal: 1000,
      tax: 60,
      total: 1060,
    });
  });

  it('records an unlisted item with no product reference', () => {
    const result = normalizeInStoreSaleInput({
      item: { kind: 'unlisted', title: '14K rope chain · 22 in · 18.4 g', metal: 'Gold', price: '1460', gramWeight: '18.4', purity: '14K' },
      customer: { ...customer, email: '' },
      paidBy: 'cash',
    });
    expect('value' in result && result.value).toMatchObject({
      item: { kind: 'unlisted', title: '14K rope chain · 22 in · 18.4 g', metal: 'Gold', price: 1460, gramWeight: 18.4, purity: '14K' },
      customer: { email: null },
      note: null,
      total: 1547.6,
    });
  });

  it('refuses the inputs that would leave a bad record', () => {
    const base = { item: { kind: 'unlisted', title: 'Chain', metal: 'Gold', price: '100' }, customer, paidBy: 'zettle' };
    expect(normalizeInStoreSaleInput({ ...base, item: { ...base.item, price: 'Sold' } })).toEqual({ error: 'Enter the price sold, e.g. 1460.' });
    expect(normalizeInStoreSaleInput({ ...base, item: { ...base.item, title: '' } })).toHaveProperty('error');
    expect(normalizeInStoreSaleInput({ ...base, item: { kind: 'listed', productId: '', price: '100' } })).toEqual({ error: 'Pick the listed item.' });
    expect(normalizeInStoreSaleInput({ ...base, customer: { ...customer, lastName: '' } })).toHaveProperty('error');
    expect(normalizeInStoreSaleInput({ ...base, customer: { ...customer, phone: '123' } })).toEqual({ error: 'Enter a valid cell number.' });
    expect(normalizeInStoreSaleInput({ ...base, customer: { ...customer, email: 'not-an-email' } })).toHaveProperty('error');
    expect(normalizeInStoreSaleInput({ ...base, paidBy: 'paypal' })).toEqual({ error: 'Pick how it was paid.' });
    expect(normalizeInStoreSaleInput({ ...base, item: { kind: 'other', price: '100' } })).toHaveProperty('error');
  });
});

describe('payment method values and labels', () => {
  it('stores in-store methods under one recognisable prefix and labels every method', () => {
    expect(inStorePaymentMethodValue('zettle')).toBe('in_store_zettle');
    expect(paymentMethodLabel('in_store_zettle')).toBe('In store · Card · Zettle');
    expect(paymentMethodLabel('in_store_cash')).toBe('In store · Cash');
    expect(paymentMethodLabel('paypal')).toBe('PayPal');
    expect(paymentMethodLabel('manual')).toBe('Manual');
    expect(paymentMethodLabel(null)).toBe('-');
  });
});
