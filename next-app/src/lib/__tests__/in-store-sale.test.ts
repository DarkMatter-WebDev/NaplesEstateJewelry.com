import { describe, expect, it } from 'vitest';
import {
  inStoreChargesTax,
  inStorePaymentMethodValue,
  inStoreTableShippingFee,
  inStoreTotals,
  isSalePhotoUrl,
  normalizeInStoreSaleInput,
  parseInStorePrice,
  parseInStoreShippingFee,
  paymentMethodLabel,
  remotePaymentMethodValue,
  SALE_ITEMS_MAX,
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
    expect(inStoreTotals(1460)).toEqual({ subtotal: 1460, shippingFee: 0, tax: 87.6, total: 1547.6 });
    expect(inStoreTotals(1026)).toEqual({ subtotal: 1026, shippingFee: 0, tax: 61.56, total: 1087.56 });
  });
  it('taxes item + shipping in Florida and nothing out of state (the web checkout rule)', () => {
    expect(inStoreTotals(1460, { shippingFee: 59 })).toEqual({ subtotal: 1460, shippingFee: 59, tax: 91.14, total: 1610.14 });
    expect(inStoreTotals(1460, { shippingFee: 59, chargesTax: false })).toEqual({ subtotal: 1460, shippingFee: 59, tax: 0, total: 1519 });
  });
});

describe('shipping charge and tax rules', () => {
  it('uses the website fee table, with Express withheld at $5,000+', () => {
    expect(inStoreTableShippingFee('insured', 1460)).toBe(59);
    expect(inStoreTableShippingFee('express', 1460)).toBe(79);
    expect(inStoreTableShippingFee('none', 1460)).toBe(0);
    expect(inStoreTableShippingFee('custom', 1460)).toBeNull();
    expect(inStoreTableShippingFee('insured', 6000)).toBe(99);
    expect(inStoreTableShippingFee('express', 5000)).toBeNull();
  });
  it('parses a typed charge and refuses nonsense', () => {
    expect(parseInStoreShippingFee('$25')).toBe(25);
    expect(parseInStoreShippingFee(' 12.50 ')).toBe(12.5);
    expect(parseInStoreShippingFee('0')).toBe(0);
    for (const raw of ['', 'free', '-5', '1001', '1.234']) expect(parseInStoreShippingFee(raw)).toBeNull();
  });
  it('charges tax on pickups and Florida shipments only', () => {
    expect(inStoreChargesTax('pickup', 'GA')).toBe(true);
    expect(inStoreChargesTax('ship', 'FL')).toBe(true);
    expect(inStoreChargesTax('ship', 'Florida')).toBe(true);
    expect(inStoreChargesTax('ship', 'GA')).toBe(false);
  });
});

describe('normalizeInStoreSaleInput · pickup or ship', () => {
  const base = { item: { kind: 'unlisted', title: 'Rope chain', metal: 'Gold', price: '1460' }, customer, paidBy: 'zettle' };
  const flAddress = { line1: '4100 Gulf Shore Blvd N', line2: 'Unit 702', city: 'Naples', state: 'fl', postalCode: '34103' };
  const gaAddress = { line1: '2840 Peachtree Rd NW', line2: '', city: 'Atlanta', state: 'Georgia', postalCode: '30305' };

  it('defaults to pickup with no address (the request shape before 2026-10-20)', () => {
    const result = normalizeInStoreSaleInput(base);
    expect('value' in result && result.value).toMatchObject({ delivery: { method: 'pickup', address: null }, shippingFee: 0, total: 1547.6 });
  });

  it('keeps an optional mailing address on a pickup, still taxed', () => {
    const result = normalizeInStoreSaleInput({ ...base, delivery: { method: 'pickup', address: gaAddress } });
    expect('value' in result && result.value).toMatchObject({
      delivery: { method: 'pickup', address: { line1: '2840 Peachtree Rd NW', line2: null, city: 'Atlanta', state: 'GA', postalCode: '30305' } },
      tax: 87.6,
      total: 1547.6,
    });
  });

  it('refuses a half-typed mailing address on a pickup', () => {
    expect(normalizeInStoreSaleInput({ ...base, delivery: { method: 'pickup', address: { city: 'Naples' } } }))
      .toEqual({ error: 'Finish the mailing address (street, city, state, ZIP) or untick it.' });
  });

  it('ships to Florida with the table fee and taxes item + shipping', () => {
    const result = normalizeInStoreSaleInput({ ...base, delivery: { method: 'ship', address: flAddress, shipping: 'insured' } });
    expect('value' in result && result.value).toMatchObject({
      delivery: { method: 'ship', shipping: 'insured', shippingFee: 59, address: { state: 'FL', line2: 'Unit 702' } },
      subtotal: 1460,
      shippingFee: 59,
      tax: 91.14,
      total: 1610.14,
    });
  });

  it('ships out of state with no Florida tax', () => {
    const result = normalizeInStoreSaleInput({ ...base, delivery: { method: 'ship', address: gaAddress, shipping: 'express' } });
    expect('value' in result && result.value).toMatchObject({ shippingFee: 79, tax: 0, total: 1539 });
  });

  it('takes a typed custom charge and "No charge"', () => {
    const custom = normalizeInStoreSaleInput({ ...base, delivery: { method: 'ship', address: flAddress, shipping: 'custom', shippingFee: '$25' } });
    expect('value' in custom && custom.value).toMatchObject({ shippingFee: 25, tax: 89.1, total: 1574.1 });
    const free = normalizeInStoreSaleInput({ ...base, delivery: { method: 'ship', address: gaAddress, shipping: 'none' } });
    expect('value' in free && free.value).toMatchObject({ shippingFee: 0, tax: 0, total: 1460 });
  });

  it('refuses a shipment it could not fulfil or record honestly', () => {
    const ship = (delivery: Record<string, unknown>) => normalizeInStoreSaleInput({ ...base, delivery: { method: 'ship', address: flAddress, shipping: 'insured', ...delivery } });
    expect(ship({ address: {} })).toEqual({ error: 'Enter the full ship-to address (street, city, state, ZIP).' });
    expect(ship({ address: { ...flAddress, state: 'ZZ' } })).toEqual({ error: 'Select a valid U.S. state.' });
    expect(ship({ address: { ...flAddress, postalCode: '341' } })).toHaveProperty('error');
    expect(ship({ shipping: 'drone' })).toEqual({ error: 'Pick the shipping charge.' });
    expect(ship({ shipping: 'custom', shippingFee: '' })).toHaveProperty('error');
    expect(normalizeInStoreSaleInput({ ...base, item: { ...base.item, price: '6000' }, delivery: { method: 'ship', address: flAddress, shipping: 'express' } }))
      .toHaveProperty('error');
  });
});

describe('normalizeInStoreSaleInput', () => {
  it('records a listed item with the price sold, not the listed price', () => {
    const result = normalizeInStoreSaleInput({ item: { kind: 'listed', productId: 'tiffany-ladle-53', price: '$1,000' }, customer, paidBy: 'zettle', note: ' cash discount ' });
    expect('value' in result && result.value).toMatchObject({
      items: [{ kind: 'listed', productId: 'tiffany-ladle-53', price: 1000, photoUrl: null }],
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
      items: [{ kind: 'unlisted', title: '14K rope chain · 22 in · 18.4 g', metal: 'Gold', price: 1460, gramWeight: 18.4, purity: '14K', photoUrl: null }],
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
    for (const paidBy of ['cashapp', 'venmo', 'store_credit']) {
      expect(normalizeInStoreSaleInput({ ...base, paidBy })).toHaveProperty('value.paidBy', paidBy);
    }
    expect(normalizeInStoreSaleInput({ ...base, item: { kind: 'other', price: '100' } })).toHaveProperty('error');
  });
});

describe('payment method values and labels', () => {
  it('stores in-store methods under one recognisable prefix and labels every method', () => {
    expect(inStorePaymentMethodValue('zettle')).toBe('in_store_zettle');
    expect(paymentMethodLabel('in_store_zettle')).toBe('In store · Card · Zettle');
    expect(paymentMethodLabel('in_store_cash')).toBe('In store · Cash');
    expect(paymentMethodLabel('in_store_cashapp')).toBe('In store · Cash App');
    expect(paymentMethodLabel('in_store_venmo')).toBe('In store · Venmo');
    expect(paymentMethodLabel('in_store_store_credit')).toBe('In store · Store credit');
    expect(inStorePaymentMethodValue('store_credit')).toBe('in_store_store_credit');
    expect(paymentMethodLabel('paypal')).toBe('PayPal');
    expect(paymentMethodLabel('manual')).toBe('Manual');
    expect(paymentMethodLabel(null)).toBe('-');
  });

  it('labels a remote-sale invoice before and after it is paid outside the site (2026-10-21)', () => {
    expect(paymentMethodLabel('invoice')).toBe('Invoice');
    expect(remotePaymentMethodValue('zelle')).toBe('remote_zelle');
    expect(paymentMethodLabel('remote_zelle')).toBe('Invoice · Zelle');
    expect(paymentMethodLabel('remote_check')).toBe('Invoice · Check');
  });
});

// Instant Sale (owner, 2026-10-21): several items, an optional photo each, and "Email copy".
describe('normalizeInStoreSaleInput · several items, photos, Email copy', () => {
  const photo = 'https://evzluixourmsefwdsieu.supabase.co/storage/v1/object/public/product-images/products/1729-abc.webp';
  const ring = { kind: 'listed', productId: 'halo-ring-212', price: '1,150', photoUrl: photo };
  const chain = { kind: 'unlisted', title: '14K rope chain', metal: 'Gold', price: '1460' };
  const bangle = { kind: 'unlisted', title: 'Sterling bangle', metal: 'Silver', price: '95' };
  const base = { customer, paidBy: 'zettle' };

  it('adds the items up and taxes the total, like the mockup (1,150 + 1,460 + 95)', () => {
    const result = normalizeInStoreSaleInput({ ...base, items: [ring, chain, bangle] });
    expect('value' in result && result.value).toMatchObject({
      items: [
        { kind: 'listed', productId: 'halo-ring-212', price: 1150, photoUrl: photo },
        { kind: 'unlisted', title: '14K rope chain', price: 1460, photoUrl: null },
        { kind: 'unlisted', title: 'Sterling bangle', metal: 'Silver', price: 95 },
      ],
      subtotal: 2705,
      tax: 162.3,
      total: 2867.3,
    });
  });

  it('prices shipping from the items\' total, not one item', () => {
    const address = { line1: '4100 Gulf Shore Blvd N', city: 'Naples', state: 'FL', postalCode: '34103' };
    const result = normalizeInStoreSaleInput({ ...base, items: [ring, chain], delivery: { method: 'ship', address, shipping: 'insured' } });
    // $2,610 of items sits in the $2,500–$5,000 band: $99.
    expect('value' in result && result.value).toMatchObject({ subtotal: 2610, shippingFee: 99, tax: 162.54, total: 2871.54 });
  });

  it('names the item that is wrong, and refuses the same listed piece twice', () => {
    expect(normalizeInStoreSaleInput({ ...base, items: [ring, { ...chain, price: '' }] })).toEqual({ error: 'Item 2: Enter the price sold, e.g. 1460.' });
    expect(normalizeInStoreSaleInput({ ...base, items: [ring, { ...ring, photoUrl: '' }] })).toEqual({ error: 'The same listed item is on this sale twice.' });
    expect(normalizeInStoreSaleInput({ ...base, items: [] })).toEqual({ error: 'Add the item that sold.' });
    expect(normalizeInStoreSaleInput({ ...base, items: Array.from({ length: SALE_ITEMS_MAX + 1 }, () => chain) })).toHaveProperty('error');
  });

  it('takes a photo only from the site\'s own product-images bucket', () => {
    expect(isSalePhotoUrl(photo)).toBe(true);
    expect(isSalePhotoUrl('https://example.com/storage/v1/object/public/buy-receipt-ids/x.webp')).toBe(false);
    expect(isSalePhotoUrl('javascript:alert(1)')).toBe(false);
    expect(isSalePhotoUrl('http://evzluixourmsefwdsieu.supabase.co/storage/v1/object/public/product-images/products/a.webp')).toBe(false);
    expect(normalizeInStoreSaleInput({ ...base, items: [{ ...chain, photoUrl: 'https://evil.example/x.jpg' }] }))
      .toEqual({ error: 'That photo did not upload. Take or choose it again, or remove it.' });
  });

  it('sends the receipt only when Email copy is ticked (a request without the box keeps the old rule)', () => {
    const ticked = normalizeInStoreSaleInput({ ...base, items: [chain], emailCopy: true });
    const unticked = normalizeInStoreSaleInput({ ...base, items: [chain], emailCopy: false });
    const legacy = normalizeInStoreSaleInput({ ...base, item: chain });
    const noEmail = normalizeInStoreSaleInput({ ...base, customer: { ...customer, email: '' }, items: [chain], emailCopy: true });
    expect('value' in ticked && ticked.value.emailCopy).toBe(true);
    expect('value' in unticked && unticked.value.emailCopy).toBe(false);
    // Unticked, the email is still kept on the order (the tracking email uses it).
    expect('value' in unticked && unticked.value.customer.email).toBe('maria@example.com');
    expect('value' in legacy && legacy.value.emailCopy).toBe(true);
    expect('value' in noEmail && noEmail.value.emailCopy).toBe(false);
  });
});
