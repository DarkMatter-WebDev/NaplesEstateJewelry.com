import { describe, it, expect } from 'vitest';
import { buildInvoiceEmailContent, type InvoiceEmailOrder } from '@/lib/order-invoice-email';

const BASE_ORDER: InvoiceEmailOrder = {
  id: 'order-1',
  order_number: 'NEJ-20260101-TEST',
  user_id: null,
  customer_name: 'Jane Buyer',
  customer_email: 'jane@example.com',
  customer_phone: '2395551234',
  subtotal: 100,
  tax: 6,
  shipping_fee: 0,
  discount: 0,
  total: 106,
  payment_status: 'paid',
  fulfillment_status: 'pending',
  order_status: 'open',
  payment_method: 'paypal',
  payment_reference: 'PAYID-TEST',
  shipping_method: 'pickup',
  shipping_address: {
    line1: '123 Main St',
    line2: '',
    city: 'Naples',
    state: 'FL',
    postal_code: '34102',
    country: 'United States',
  },
  billing_address: null,
  internal_notes: null,
  customer_notes: null,
  refund_amount: null,
  created_at: '2026-07-08T12:00:00.000Z',
  updated_at: '2026-07-08T12:00:00.000Z',
  order_items: [],
};

describe('buildInvoiceEmailContent - ship-to label', () => {
  it('labels the address block "Address" (not "Ship to") for local pickup orders', () => {
    const content = buildInvoiceEmailContent({ ...BASE_ORDER, shipping_method: 'pickup' });
    expect(content.text).toContain('Address:');
    expect(content.text).not.toContain('Ship to:');
    expect(content.html).toContain('>Address<');
    expect(content.html).not.toContain('>Ship to<');
  });

  it('keeps the "Ship to" label unchanged for real shipping methods', () => {
    const content = buildInvoiceEmailContent({ ...BASE_ORDER, shipping_method: 'shipping' });
    expect(content.text).toContain('Ship to:');
    expect(content.text).not.toContain('Address:');
    expect(content.html).toContain('>Ship to<');
    expect(content.html).not.toContain('>Address<');
  });

  it('shows no address block at all when no address is on file, regardless of method', () => {
    const content = buildInvoiceEmailContent({ ...BASE_ORDER, shipping_method: 'pickup', shipping_address: null });
    expect(content.text).not.toContain('Address:');
    expect(content.text).not.toContain('Ship to:');
    expect(content.html).not.toContain('>Address<');
    expect(content.html).not.toContain('>Ship to<');
  });
});

// ---------------------------------------------------------------------------
// Owner report, 2026-08-23, from a real receipt: the footer named the shared
// suite, the phone number broke across two lines, and the summary read
// "Shipping method: Shipping".

describe('buildInvoiceEmailContent - shipping method reads as a real service', () => {
  // `orders.shipping_method` is the NARROWED db value ('pickup' | 'shipping'),
  // so the tier is recovered from the subtotal + fee the catalog priced.
  it('names the standard tier instead of the word "Shipping"', () => {
    const content = buildInvoiceEmailContent({
      ...BASE_ORDER,
      shipping_method: 'shipping',
      subtotal: 1500,
      shipping_fee: 59, // STANDARD_SHIPPING_TIERS, 1000-2500 band
    });
    expect(content.html).toContain('Shipping method: Insured Shipping');
    expect(content.html).not.toContain('Shipping method: Shipping');
  });

  it('names the express tier when that is what was paid for', () => {
    const content = buildInvoiceEmailContent({
      ...BASE_ORDER,
      shipping_method: 'shipping',
      subtotal: 1500,
      shipping_fee: 79, // EXPRESS_SHIPPING_TIERS, same band, different fee
    });
    expect(content.html).toContain('Shipping method: Express Overnight Insured');
  });

  it('says Local Pickup for a pickup order', () => {
    const content = buildInvoiceEmailContent({ ...BASE_ORDER, shipping_method: 'pickup' });
    expect(content.html).toContain('Shipping method: Local Pickup');
  });

  it('falls back to the generic wording rather than guessing on an unknown fee', () => {
    // A pre-tier or re-priced order. It must NOT be relabelled as a service the
    // buyer did not choose — generic is the honest answer.
    const content = buildInvoiceEmailContent({
      ...BASE_ORDER,
      shipping_method: 'shipping',
      subtotal: 1500,
      shipping_fee: 15,
    });
    expect(content.html).toContain('Shipping method: Insured Shipping');
    expect(content.html).not.toContain('Express');
  });
});

describe('buildInvoiceEmailContent - footer address and phone', () => {
  it('drops the shared-suite landmark from the footer contact line', () => {
    const content = buildInvoiceEmailContent({ ...BASE_ORDER, shipping_method: 'shipping' });
    expect(content.html).toContain('6240 Shirley St, Ste 104, Naples, FL 34109');
    expect(content.html).not.toContain('Sharon Lynch');
    expect(content.text).not.toContain('Sharon Lynch');
  });

  it('keeps the landmark in the PICKUP directions, where it is wayfinding', () => {
    // Deliberate asymmetry: the sign on the door reads Sharon Lynch
    // Collections, so someone being sent to collect an order still needs it.
    const content = buildInvoiceEmailContent({ ...BASE_ORDER, shipping_method: 'pickup' });
    expect(content.pickup?.landmark).toContain('Sharon Lynch Collections');
  });

  it('never lets the phone number break across lines', () => {
    const content = buildInvoiceEmailContent({ ...BASE_ORDER, shipping_method: 'shipping' });
    // Every rendered occurrence is inside a nowrap span.
    const bare = content.html.split('<span style="white-space:nowrap;">(239) 404-8505</span>').join('');
    expect(bare).not.toContain('(239) 404-8505');
  });
});

// Owner request, 2026-08-23: the pickup details were one run-on sentence
// ("…thank you. Pick up at 6240 Shirley St, Ste 104, Naples, FL 34109 · inside
// Sharon Lynch Collections. Mon–Sat 11am–3pm, or by appointment. Call or text
// us at…"). They are now a laid-out block.

describe('buildInvoiceEmailContent - pickup block layout', () => {
  const pickupOrder = { ...BASE_ORDER, shipping_method: 'pickup' as const };

  it('sets the address on its own lines, envelope order', () => {
    const content = buildInvoiceEmailContent(pickupOrder);
    expect(content.pickup?.addressLines).toEqual(['6240 Shirley St, Ste 104', 'Naples, FL 34109']);
  });

  it('does NOT put the business name in the block', () => {
    // Owner call: on an envelope it would lead, but this email is FROM that
    // business, so it only pushed the street address down.
    const content = buildInvoiceEmailContent(pickupOrder);
    expect(content.pickup?.addressLines.join(' ')).not.toContain('Naples Estate Jewelry');
  });

  it('separates hours from the address, with the appointment note apart', () => {
    // ⚠️ No opts on purpose: this asserts the NO-DB fallback stays byte-
    // identical to the hours this email has always printed.
    const content = buildInvoiceEmailContent(pickupOrder);
    expect(content.pickup?.hours).toBe('Monday – Saturday, 11:00 AM – 3:00 PM');
    expect(content.pickup?.byAppointment).toBe('or by appointment');
  });

  it('prints admin-edited hours when the caller passes them', () => {
    const content = buildInvoiceEmailContent(pickupOrder, null, {
      pickupHours: 'Tuesday – Friday, 10:00 AM – 2:00 PM; Saturday 11:00 AM – 3:00 PM',
    });
    expect(content.pickup?.hours).toBe('Tuesday – Friday, 10:00 AM – 2:00 PM; Saturday 11:00 AM – 3:00 PM');
    expect(content.html).toContain('Tuesday – Friday, 10:00 AM – 2:00 PM; Saturday 11:00 AM – 3:00 PM');
    expect(content.text).toContain('HOURS\nTuesday – Friday, 10:00 AM – 2:00 PM; Saturday 11:00 AM – 3:00 PM');
  });

  it('no longer runs the address into the payment sentence', () => {
    const content = buildInvoiceEmailContent(pickupOrder);
    expect(content.note).toBe('Your payment has been received in full — thank you.');
    expect(content.note).not.toContain('Pick up at');
    expect(content.note).not.toContain('6240');
  });

  it('renders each address line as its own element in the HTML', () => {
    const content = buildInvoiceEmailContent(pickupOrder);
    expect(content.html).toContain('>6240 Shirley St, Ste 104<');
    expect(content.html).toContain('>Naples, FL 34109<');
    expect(content.html).toContain('>Pickup Location<');
    expect(content.html).toContain('>Hours<');
  });

  it('uses a table for the panel so Outlook keeps the padding and fill', () => {
    // A block-level div loses both in Word-rendered Outlook.
    const content = buildInvoiceEmailContent(pickupOrder);
    expect(content.html).toMatch(/<table[^>]*background:#fbfaf5[^>]*>/);
  });

  it('breaks the plain-text version onto separate lines too', () => {
    const content = buildInvoiceEmailContent(pickupOrder);
    expect(content.text).toContain('PICKUP LOCATION\n6240 Shirley St, Ste 104\nNaples, FL 34109\ninside Sharon Lynch Collections');
    expect(content.text).toContain('HOURS\nMonday – Saturday, 11:00 AM – 3:00 PM\nor by appointment');
  });

  it('shows no pickup block at all on a shipped order', () => {
    const content = buildInvoiceEmailContent({ ...BASE_ORDER, shipping_method: 'shipping' });
    expect(content.pickup).toBeNull();
    expect(content.html).not.toContain('Pickup Location');
    expect(content.text).not.toContain('PICKUP LOCATION');
  });

  it('still tells an UNPAID invoice where to collect', () => {
    // The payment sentence is empty when unpaid; the block must not ride on it.
    const content = buildInvoiceEmailContent({ ...pickupOrder, payment_status: 'pending' });
    expect(content.note).toBe('');
    expect(content.pickup?.addressLines).toHaveLength(2);
    expect(content.html).toContain('>Pickup Location<');
    expect(content.contactNote).toContain('payment');
  });
});
