import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDeliveryUpdateEmailContent, buildFulfillmentUpdateEmailContent } from '@/lib/order-fulfillment-email';
import { easternDayKey, formatExpectedDate, trackerExpectedDate } from '@/lib/shipment-tracking';

// The 4-email plan (owner, 2026-11-19, mockup 1): Shipped → EXPECTED DATE →
// Out for delivery → Delivered.

const ORDER = {
  order_number: 'NEJ-20261119-K7QM2',
  customer_name: 'Maria',
  shipping_carrier: 'USPS',
  tracking_number: '9405511206213412345678',
};

const root = join(__dirname, '..', '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('the carrier’s date — a day, never shifted by a time zone', () => {
  it('prefers carrier_detail.est_delivery_date_local, else the date part of est_delivery_date', () => {
    expect(trackerExpectedDate({ est_delivery_date: '2026-11-25T00:00:00Z', carrier_detail: { est_delivery_date_local: '2026-11-24' } }))
      .toBe('2026-11-24');
    // Midnight UTC stays the 24th (Eastern would read the 23rd).
    expect(trackerExpectedDate({ est_delivery_date: '2026-11-24T00:00:00Z' })).toBe('2026-11-24');
    expect(trackerExpectedDate({ est_delivery_date: null, carrier_detail: null })).toBeNull();
    expect(trackerExpectedDate({ est_delivery_date: 'soon' })).toBeNull();
    expect(trackerExpectedDate({ est_delivery_date: '2026-02-30T00:00:00Z' })).toBeNull();
    expect(trackerExpectedDate(null)).toBeNull();
  });

  it('words the day in full and short form', () => {
    expect(formatExpectedDate('2026-11-24')).toEqual({ long: 'Tuesday, November 24', short: 'Tue, Nov 24' });
    expect(formatExpectedDate('2027-01-01')).toEqual({ long: 'Friday, January 1', short: 'Fri, Jan 1' });
    expect(formatExpectedDate('nope')).toBeNull();
  });

  it('knows today in Eastern across midnight UTC and daylight saving', () => {
    // 2026-11-25 03:30 UTC = Nov 24, 10:30 PM EST.
    expect(easternDayKey(Date.UTC(2026, 10, 25, 3, 30))).toBe('2026-11-24');
    // 2026-07-04 03:30 UTC = Jul 3, 11:30 PM EDT.
    expect(easternDayKey(Date.UTC(2026, 6, 4, 3, 30))).toBe('2026-07-03');
    expect(easternDayKey(Date.UTC(2026, 10, 24, 15, 0))).toBe('2026-11-24');
  });
});

describe('expected-date email (mockup 1)', () => {
  const content = buildDeliveryUpdateEmailContent(ORDER, 'expected_delivery', {
    when: { date: 'Thu, Nov 19', time: '6:42 PM' },
    place: 'Naples, FL 34102',
    where: null,
    message: 'Accepted at USPS Origin Facility',
    expectedDate: '2026-11-24',
  });

  it('has the date in the subject, title and the big box', () => {
    expect(content.subject).toBe('Your order NEJ-20261119-K7QM2 is expected Tuesday, November 24');
    expect(content.html).toContain('Your Package Is on Its Way');
    expect(content.html).toContain('Order NEJ-20261119-K7QM2 - In Transit');
    expect(content.html).toContain('USPS has scanned your package and expects to deliver it on:');
    expect(content.html).toContain('Expected delivery');
    expect(content.html).toContain('USPS’s estimate — it can shift by a day');
  });

  it('breaks after the weekday on a phone, never inside “November 24”', () => {
    expect(content.html).toContain('Tuesday, <span style="white-space:nowrap;">November 24</span>');
  });

  it('shows the latest scan, carrier, number, signature line, Track button and the next promise', () => {
    expect(content.html).toMatch(/Accepted at USPS Origin Facility<br><span[^>]*white-space:nowrap;">Naples, FL 34102<\/span><br><span[^>]*white-space:nowrap;">6:42 PM<\/span>/);
    expect(content.html).toContain('9405 5112 0621 3412 3456 78');
    expect(content.html).toContain('Someone will need to be there to sign for it.');
    expect(content.html).toContain('If no one will be home that day, call or text us at <span style="white-space:nowrap;">(239) 404-8505</span>');
    expect(content.html).toContain('Track Your Package');
    expect(content.html).toContain('We’ll email you again the morning it’s out for delivery.');
    expect(content.text).toContain('Tuesday, November 24');
    expect(content.text).toContain('Latest scan: Accepted at USPS Origin Facility — Naples, FL 34102, 6:42 PM');
  });

  it('keeps the 3-step progress line with Shipped done', () => {
    expect(content.html).toContain('Out for delivery');
    expect((content.html.match(/&#10003;/g) ?? []).length).toBe(1);
  });

  it('names a different carrier and escapes the scan text', () => {
    const ups = buildDeliveryUpdateEmailContent({ ...ORDER, shipping_carrier: 'UPS', tracking_number: '1Z999AA10123456784' }, 'expected_delivery', {
      when: null, place: null, where: null, message: 'Origin <scan>', expectedDate: '2026-11-24',
    });
    expect(ups.html).toContain('UPS has scanned your package');
    expect(ups.html).toContain('UPS’s estimate');
    expect(ups.html).toContain('Origin &lt;scan&gt;');
  });
});

describe('shipped email promises the date email', () => {
  it('says the date email comes first, naming the carrier', () => {
    const { html, text } = buildFulfillmentUpdateEmailContent(ORDER, 'shipped', { deliveryUpdates: true });
    const line = 'We’ll email you the expected delivery date as soon as USPS has one, and again when it’s out for delivery and when it’s delivered.';
    expect(html).toContain(line);
    expect(text).toContain(line);
  });
});

describe('send rule guards (order-tracking-server.ts)', () => {
  const server = read('src/lib/order-tracking-server.ts');

  it('sends only for an in-transit tracker with a date not yet passed, once, before the later emails', () => {
    expect(server).toContain("status === 'in_transit'");
    expect(server).toContain('expectedDate >= easternDayKey(nowMs)');
    expect(server).toContain('!row.expected_email_at');
    expect(server).toContain('!row.out_for_delivery_email_at\n    && !row.delivered_email_at');
    expect(server).toContain("expected_delivery: 'expected_email_at'");
  });

  it('never lets the missing columns (SQL not run) break the update or the other emails', () => {
    expect(server).toContain("const expectedColumnsReady = 'expected_email_at' in row;");
    expect(server).toMatch(/if \(error\) console\.error\('\[tracking\] est_delivery_date not saved:'/);
  });

  it('the SQL adds both columns as text + timestamptz, no grant changes', () => {
    const sql = read('../supabase/order-tracking-expected-date-2026-11.sql');
    expect(sql).toContain('add column if not exists est_delivery_date text');
    expect(sql).toContain('add column if not exists expected_email_at timestamptz');
    expect(sql).not.toMatch(/\bgrant\b/i);
  });
});
