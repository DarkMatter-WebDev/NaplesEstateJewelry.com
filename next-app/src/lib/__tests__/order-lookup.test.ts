import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contactMatches, normalizeOrderNumber, toPublicOrderView, trackingUrl } from '../order-lookup';
import { buildOrderEmailFooterHtml, buildOrderEmailFooterTextLines, SITE_DOMAIN_LABEL } from '../order-email-branding';
import type { Order, OrderItem } from '@/types/sales';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

describe('normalizeOrderNumber', () => {
  it('accepts the ways people type it', () => {
    for (const raw of ['NEJ-20260917-ZIZCI', ' nej-20260917-zizci ', 'NEJ 20260917 ZIZCI', 'nej20260917zizci', 'NEJ--20260917--ZIZCI']) {
      expect(normalizeOrderNumber(raw)).toBe('NEJ-20260917-ZIZCI');
    }
  });
  it('rejects anything that is not an order number', () => {
    for (const raw of ['', 'NEJ-2026-ZIZCI', 'ABC-20260917-ZIZCI', 'NEJ-20260917-ZIZC', '1234', null]) expect(normalizeOrderNumber(raw)).toBeNull();
  });
});

describe('contactMatches — the second factor', () => {
  const order = { customer_email: 'Arthur@Example.com', customer_phone: '(603) 224-7191' } as Order;
  it('matches the email in any case and the phone in any format', () => {
    expect(contactMatches(order, 'arthur@example.com')).toBe(true);
    expect(contactMatches(order, ' ARTHUR@EXAMPLE.COM ')).toBe(true);
    expect(contactMatches(order, '603-224-7191')).toBe(true);
    expect(contactMatches(order, '+1 (603) 224-7191')).toBe(true);
  });
  it('refuses a blank, a different email or a different phone', () => {
    expect(contactMatches(order, '')).toBe(false);
    expect(contactMatches(order, 'someone@else.com')).toBe(false);
    expect(contactMatches(order, '(239) 404-8505')).toBe(false);
    expect(contactMatches({ customer_email: null, customer_phone: null } as Order, 'arthur@example.com')).toBe(false);
  });
});

describe('toPublicOrderView — what a customer may see', () => {
  const order = {
    id: 'uuid', order_number: 'NEJ-20260917-ZIZCI', user_id: null, customer_name: 'Arthur Anderson',
    customer_email: 'arthur@example.com', customer_phone: '(603) 224-7191',
    subtotal: 570, tax: 0, shipping_fee: 29, discount: 0, total: 599,
    payment_status: 'paid', fulfillment_status: 'shipped', order_status: 'completed',
    payment_method: 'paypal', payment_reference: 'CAPTURE-123', shipping_method: 'shipping',
    shipping_carrier: 'UPS', tracking_number: '1Z23H15V4228906036',
    shipping_address: { address_line1: '940 Chestnut St', city: 'Manchester', state: 'NH', postal_code: '03104-2314', country: 'United States' },
    billing_address: null, internal_notes: 'cost basis 300', customer_notes: null, created_at: '2026-09-17T22:00:05Z',
    order_items: [{ id: 'i', order_id: 'uuid', product_id: 'brooch-1', inventory_number: '12', title_snapshot: 'Chimera Brooch', item_year_snapshot: null, metal_snapshot: '14K Yellow Gold', purity_snapshot: '14K', gram_weight_snapshot: 8.2, price_snapshot: 570, quantity: 1, discount: 0, image_snapshot: '/assets/images/shop/x.webp', created_at: '' }] as OrderItem[],
  } as unknown as Order & { order_items: OrderItem[]; created_at: string };

  it('keeps the order facts and derives the delivery service from the fee', () => {
    const view = toPublicOrderView(order);
    expect(view).toMatchObject({ orderNumber: 'NEJ-20260917-ZIZCI', firstName: 'Arthur', deliveryKind: 'priority', total: 599, carrier: 'UPS' });
    expect(view.items[0]).toMatchObject({ title: 'Chimera Brooch', unitPrice: 570, quantity: 1 });
    expect(view.shippingAddress).toContain('Manchester');
    expect(view.shippingAddress).toContain('940 Chestnut St');
    // Checkout stores the street as `line1`, not `address_line1` — it must survive.
    const checkoutShape = toPublicOrderView({ ...order, shipping_address: { line1: '940 Chestnut St', line2: null, city: 'Manchester', state: 'NH', postal_code: '03104-2314', country: 'United States' } });
    expect(checkoutShape.shippingAddress).toBe('940 Chestnut St, Manchester, NH, 03104-2314, United States');
    expect(view.trackingUrl).toBe('https://www.ups.com/track?tracknum=1Z23H15V4228906036');
  });
  it('never leaks internal fields', () => {
    const json = JSON.stringify(toPublicOrderView(order));
    for (const secret of ['internal_notes', 'cost basis', 'CAPTURE-123', 'payment_reference', 'user_id', 'customer_email', 'arthur@example.com', '"id"']) {
      expect(json).not.toContain(secret);
    }
  });
  it('drops the address for a pickup order', () => {
    expect(toPublicOrderView({ ...order, shipping_method: 'pickup' }).shippingAddress).toBeNull();
  });
});

describe('trackingUrl', () => {
  it('links the carriers we use and returns null otherwise', () => {
    expect(trackingUrl('USPS', '9400 1000')).toContain('tools.usps.com');
    expect(trackingUrl('FedEx Ground', '1234')).toContain('fedex.com');
    expect(trackingUrl('Hand delivered', '1')).toBeNull();
    expect(trackingUrl('UPS', '')).toBeNull();
  });
});

describe('order emails point guests at the lookup, with the brand-cased domain', () => {
  it('footer html + text lines carry the lookup link with the order number prefilled', () => {
    const html = buildOrderEmailFooterHtml('NEJ-20260917-ZIZCI');
    expect(html).toContain('/order-lookup?order=NEJ-20260917-ZIZCI');
    expect(html).toContain('NaplesEstateJewelry.com/order-lookup');
    expect(html).not.toContain('manage your account');
    const lines = buildOrderEmailFooterTextLines('NEJ-20260917-ZIZCI');
    expect(lines[0]).toContain('/order-lookup?order=NEJ-20260917-ZIZCI');
    expect(lines).toContain('NaplesEstateJewelry.com');
    expect(SITE_DOMAIN_LABEL).toBe('NaplesEstateJewelry.com');
  });
  it('both order emails pass the order number through', () => {
    expect(read('src', 'lib', 'order-invoice-email.ts')).toContain('buildOrderEmailFooterHtml(orderNumber)');
    expect(read('src', 'lib', 'order-invoice-email.ts')).toContain('buildOrderEmailFooterTextLines(order.order_number)');
    expect(read('src', 'lib', 'order-fulfillment-email.ts')).toContain('buildOrderEmailFooterHtml(order.order_number)');
  });
});

describe('/order-lookup page — utility page rules', () => {
  it('is noindex, off the sitemap, and linked from the footer', () => {
    const page = read('src', 'app', '[locale]', 'order-lookup', 'page.tsx');
    expect(page).toContain('robots: { index: false, follow: false }');
    expect(read('src', 'app', 'sitemap.ts')).not.toContain('order-lookup');
    expect(read('src', 'components', 'layout', 'SiteFooter.tsx')).toContain("p('/order-lookup')");
  });
  it('the route rate-limits by IP and by order number and answers one generic not-found', () => {
    const route = read('src', 'app', 'api', 'orders', 'lookup', 'route.ts');
    expect(route).toContain('`order-lookup:${ip}`');
    expect(route).toContain('`order-lookup:${orderNumber}`');
    expect(route).toContain(".is('deleted_at', null)");
    expect((route.match(/NOT_FOUND/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});
