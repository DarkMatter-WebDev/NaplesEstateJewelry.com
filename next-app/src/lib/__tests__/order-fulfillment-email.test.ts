import { describe, expect, it } from 'vitest';
import { buildFulfillmentUpdateEmailContent } from '@/lib/order-fulfillment-email';

describe('fulfillment update email', () => {
  it('includes saved carrier and tracking details in shipped email text and HTML', () => {
    const content = buildFulfillmentUpdateEmailContent({
      order_number: 'NEJ-1001',
      customer_name: 'Avery',
      shipping_carrier: 'UPS & Co.',
      tracking_number: '1Z<&1001',
    }, 'shipped');

    expect(content.text).toContain('Carrier: UPS & Co.');
    expect(content.text).toContain('Tracking number: 1Z<&1001');
    expect(content.html).toContain('UPS &amp; Co.');
    expect(content.html).toContain('1Z&lt;&amp;1001');
  });

  it('omits the shipment block when an order has no saved tracking details', () => {
    const content = buildFulfillmentUpdateEmailContent({
      order_number: 'NEJ-1002',
      customer_name: null,
      shipping_carrier: null,
      tracking_number: null,
    }, 'packed');

    expect(content.text).not.toContain('Carrier:');
    expect(content.text).not.toContain('Tracking number:');
    expect(content.html).not.toContain('Tracking number</td>');
  });
});
