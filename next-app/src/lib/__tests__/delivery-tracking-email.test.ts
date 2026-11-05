import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildDeliveryUpdateEmailContent, buildFulfillmentUpdateEmailContent } from '@/lib/order-fulfillment-email';
import { verifyEasyPostSignature } from '@/lib/easypost';
import { GOOGLE_REVIEW_URL } from '@/lib/business-location';

const ORDER = {
  order_number: 'NEJ-20261105-K7QM2',
  customer_name: 'Margaret',
  shipping_carrier: 'USPS',
  tracking_number: '9405511206201234567890',
};

const root = join(__dirname, '..', '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('shipped email (mockup 4)', () => {
  it('has its own subject, title, progress line and Track button', () => {
    const content = buildFulfillmentUpdateEmailContent(ORDER, 'shipped', { deliveryUpdates: true });
    expect(content.subject).toBe('Your order NEJ-20261105-K7QM2 has shipped');
    expect(content.html).toContain('Your Order Has Shipped');
    expect(content.html).toContain('Out for delivery');
    expect(content.html).toContain('Track Your Package');
    expect(content.html).toContain('https://tools.usps.com/go/TrackConfirmAction?tLabels=9405511206201234567890');
    expect(content.html).toContain('9405 5112 0620 1234 5678 90');
    expect(content.text).toContain('Track your package: https://tools.usps.com/go/TrackConfirmAction?tLabels=9405511206201234567890');
  });

  it('promises the follow-up emails only when tracking is connected and there is a number', () => {
    const promise = 'out for delivery and when it’s delivered';
    expect(buildFulfillmentUpdateEmailContent(ORDER, 'shipped', { deliveryUpdates: true }).html).toContain(promise);
    expect(buildFulfillmentUpdateEmailContent(ORDER, 'shipped').html).not.toContain(promise);
    expect(buildFulfillmentUpdateEmailContent({ ...ORDER, tracking_number: null }, 'shipped', { deliveryUpdates: true }).html)
      .not.toContain(promise);
  });

  it('keeps the tracking number on one line when it fits, never wrapped (justify trick)', () => {
    const { html } = buildFulfillmentUpdateEmailContent(ORDER, 'shipped');
    expect(html).toMatch(/text-align:justify;font-size:0;line-height:0;/);
    expect(html).toMatch(/white-space:nowrap;">9405 5112 0620 1234 5678 90<\/div>/);
    expect(html).toContain('display:inline-block;width:100%;height:0;');
  });

  it('leaves every other status on the original Order Update email', () => {
    const packed = buildFulfillmentUpdateEmailContent(ORDER, 'packed');
    expect(packed.subject).toBe('Update on your order NEJ-20261105-K7QM2 from Naples Estate Jewelry');
    expect(packed.html).toContain('Order Update');
    expect(packed.html).not.toContain('Track Your Package');
  });
});

describe('out-for-delivery email', () => {
  const content = buildDeliveryUpdateEmailContent(ORDER, 'out_for_delivery', {
    when: { date: 'Thu, Nov 12', time: '7:42 AM' },
    place: 'Naples, FL 34102',
    where: null,
  });

  it('says it is on the truck, with the latest scan town and time on their own lines', () => {
    expect(content.subject).toBe('Your order NEJ-20261105-K7QM2 is out for delivery');
    expect(content.html).toContain('Out for Delivery Today');
    expect(content.html).toContain('should arrive today');
    expect(content.html).toContain('Latest scan');
    expect(content.html).toMatch(/Out for Delivery<br><span[^>]*white-space:nowrap;">Naples, FL 34102<\/span><br><span[^>]*white-space:nowrap;">7:42 AM<\/span>/);
  });

  it('always says someone must sign (every shipped order needs a signature)', () => {
    expect(content.html).toContain('Someone will need to be there to sign for it.');
    expect(content.text).toContain('USPS will leave a notice');
  });

  it('keeps labels on one line and lines values up on the label baseline', () => {
    expect(content.html).toMatch(/vertical-align:baseline;color:#746b5b;font-size:12px;line-height:20px;[^"]*white-space:nowrap;">Latest scan/);
    expect(content.html).toMatch(/vertical-align:baseline;color:#1d1a14;font-size:14px;line-height:20px;/);
  });
});

describe('delivered email', () => {
  const content = buildDeliveryUpdateEmailContent(ORDER, 'delivered', {
    when: { date: 'Thu, Nov 12', time: '2:14 PM' },
    place: null,
    where: 'Left with Individual',
  });

  it('shows when and where from the scan', () => {
    expect(content.subject).toBe('Your order NEJ-20261105-K7QM2 was delivered');
    expect(content.html).toContain('Your Order Was Delivered');
    expect(content.html).toContain('Thu, Nov 12 · 2:14 PM');
    expect(content.html).toContain('Left with Individual');
    expect(content.html).toContain('as reported by USPS');
  });

  it('has the owner’s “not in your hands yet” wording, phone kept on one line', () => {
    expect(content.html).toContain('Not in your hands yet?');
    expect(content.html).toContain('carriers sometimes record a package as delivered a little before it actually reaches the door');
    expect(content.html).toContain('If it still hasn’t arrived by the end of tomorrow');
    expect(content.html).toContain('<span style="white-space:nowrap;">(239) 404-8505</span>');
    expect(content.html).not.toContain('quota');
  });

  it('links the Google review page', () => {
    expect(content.html).toContain(GOOGLE_REVIEW_URL);
    expect(content.text).toContain(`Leave us a review: ${GOOGLE_REVIEW_URL}`);
  });

  it('drops the Where row when the scan does not say', () => {
    const plain = buildDeliveryUpdateEmailContent(ORDER, 'delivered', { when: null, place: null, where: null });
    expect(plain.html).not.toContain('>Where<');
    expect(plain.html).not.toContain('white-space:nowrap;">Delivered</td>');
  });

  it('escapes customer and carrier text', () => {
    const escaped = buildDeliveryUpdateEmailContent({ ...ORDER, customer_name: '<b>x</b>' }, 'delivered', {
      when: null, place: null, where: 'Porch <script>',
    });
    expect(escaped.html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(escaped.html).toContain('Porch &lt;script&gt;');
  });
});

describe('EasyPost webhook signature', () => {
  const secret = 'sécret-ﬁ';
  const sign = (body: string) =>
    `hmac-sha256-hex=${createHmac('sha256', Buffer.from(secret.normalize('NFKD'), 'utf8')).update(body, 'utf8').digest('hex')}`;

  it('accepts EasyPost’s signature over the raw body (NFKD secret)', () => {
    const body = '{"object":"Event","description":"tracker.updated","result":{"id":"trk_1"}}';
    expect(verifyEasyPostSignature(body, sign(body), secret)).toBe(true);
  });

  it('accepts the weight-corrected body the official client hashes', () => {
    const body = '{"result":{"id":"trk_1","weight":12}}';
    const corrected = '{"result":{"id":"trk_1","weight":12.0}}';
    expect(verifyEasyPostSignature(body, sign(corrected), secret)).toBe(true);
  });

  it('rejects a wrong, missing or unsigned request', () => {
    const body = '{"result":{"id":"trk_1"}}';
    expect(verifyEasyPostSignature(body, sign('{"result":{"id":"trk_2"}}'), secret)).toBe(false);
    expect(verifyEasyPostSignature(body, null, secret)).toBe(false);
    expect(verifyEasyPostSignature(body, sign(body), null)).toBe(false);
    expect(verifyEasyPostSignature(body, 'hmac-sha256-hex=00', secret)).toBe(false);
  });
});

describe('wiring guards', () => {
  it('the webhook verifies the signature and re-reads the tracker from EasyPost', () => {
    const route = read('src/app/api/webhooks/easypost/route.ts');
    expect(route).toContain('verifyEasyPostSignature(rawBody');
    expect(route).toContain('await retrieveTracker(trackerId)');
    expect(route).not.toMatch(/applyTrackerUpdate\(service,\s*event/);
  });

  it('each email is claimed before it is sent and released on failure', () => {
    const server = read('src/lib/order-tracking-server.ts');
    expect(server).toMatch(/\.is\(column, null\)/);
    expect(server).toMatch(/update\(\{ \[column\]: null \}\)/);
  });

  it('the SQL schedules the hourly sweep with the existing cron secret', () => {
    const sql = read('../supabase/order-tracking-2026-11.sql');
    expect(sql).toContain("'nej-order-tracking-sweep'");
    expect(sql).toContain('https://naplesestatejewelry.com/api/admin/orders/tracking-sweep');
    expect(sql).toContain("name = 'TEXT_ALERTS_CRON_SECRET'");
    const route = read('src/app/api/admin/orders/tracking-sweep/route.ts');
    expect(route).toContain('process.env.TEXT_ALERTS_CRON_SECRET');
  });
});
