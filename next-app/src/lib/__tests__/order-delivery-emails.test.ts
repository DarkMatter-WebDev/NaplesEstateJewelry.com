import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DELIVERY_EMAIL_SETTING,
  deliveryEmailUpdate,
  readDeliveryEmailSetting,
  scanAllowsDeliveryEmail,
  type DeliveryEmailSetting,
} from '@/lib/order-delivery-emails';
import { buildFulfillmentUpdateEmailContent } from '@/lib/order-fulfillment-email';

// "Send customer shipping updates" per order (owner, 2026-11-24, mockup 1).

const root = join(__dirname, '..', '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const ON: DeliveryEmailSetting = { on: true, onSince: null, ready: true };
const OFF: DeliveryEmailSetting = { on: false, onSince: null, ready: true };
const RESUMED: DeliveryEmailSetting = { on: true, onSince: '2026-11-24T15:00:00.000Z', ready: true };

describe('reading the setting', () => {
  it('reads on / off and the turned-on moment', () => {
    expect(readDeliveryEmailSetting({ delivery_emails: true, delivery_emails_on_at: null })).toEqual(ON);
    expect(readDeliveryEmailSetting({ delivery_emails: false, delivery_emails_on_at: null })).toEqual(OFF);
    expect(readDeliveryEmailSetting({ delivery_emails: true, delivery_emails_on_at: '2026-11-24T15:00:00.000Z' })).toEqual(RESUMED);
  });

  it('before the SQL (no row / no columns) reads as ON, not ready — exactly as the site behaved before', () => {
    expect(readDeliveryEmailSetting(null)).toEqual(DEFAULT_DELIVERY_EMAIL_SETTING);
    expect(DEFAULT_DELIVERY_EMAIL_SETTING).toEqual({ on: true, onSince: null, ready: false });
  });
});

describe('saving the setting', () => {
  const now = '2026-11-24T16:00:00.000Z';
  it('writes nothing when it does not change', () => {
    expect(deliveryEmailUpdate(ON, true, now)).toBeNull();
    expect(deliveryEmailUpdate(OFF, false, now)).toBeNull();
  });
  it('off just turns it off (keeps the old turned-on moment)', () => {
    expect(deliveryEmailUpdate(ON, false, now)).toEqual({ delivery_emails: false });
  });
  it('back on stamps the moment (owner pick 3: no catching up)', () => {
    expect(deliveryEmailUpdate(OFF, true, now)).toEqual({ delivery_emails: true, delivery_emails_on_at: now });
  });
});

describe('which carrier scans may send', () => {
  it('off: never', () => {
    expect(scanAllowsDeliveryEmail(OFF, '2026-11-25T10:00:00Z')).toBe(false);
    expect(scanAllowsDeliveryEmail(OFF, null)).toBe(false);
  });
  it('never turned off: always (as before, even with an unreadable scan time)', () => {
    expect(scanAllowsDeliveryEmail(ON, '2026-11-01T10:00:00Z')).toBe(true);
    expect(scanAllowsDeliveryEmail(ON, null)).toBe(true);
  });
  it('turned back on: only scans at or after that moment', () => {
    expect(scanAllowsDeliveryEmail(RESUMED, '2026-11-24T09:59:00-05:00')).toBe(false); // 14:59 Z, before
    expect(scanAllowsDeliveryEmail(RESUMED, '2026-11-24T10:00:00-05:00')).toBe(true); // 15:00 Z, same moment
    expect(scanAllowsDeliveryEmail(RESUMED, '2026-11-25T08:12:00')).toBe(true); // no offset = UTC (scanInstant)
    expect(scanAllowsDeliveryEmail(RESUMED, null)).toBe(false);
    expect(scanAllowsDeliveryEmail(RESUMED, 'garbage')).toBe(false);
  });
});

describe('the Shipped email only promises follow-ups when they will come', () => {
  const ORDER = { order_number: 'NEJ-1', customer_name: 'Margaret', shipping_carrier: 'USPS', tracking_number: '9405511206201234567890' };
  const promise = 'out for delivery and when it’s delivered';
  it('drops the promise line when shipping updates are off', () => {
    expect(buildFulfillmentUpdateEmailContent(ORDER, 'shipped', { deliveryUpdates: true && ON.on }).html).toContain(promise);
    expect(buildFulfillmentUpdateEmailContent(ORDER, 'shipped', { deliveryUpdates: true && OFF.on }).html).not.toContain(promise);
  });
  it('the send route, the rebuild route and the page preview all read the order setting', () => {
    expect(read('src/app/api/admin/orders/[id]/email-update/route.ts'))
      .toContain('isDeliveryTrackingConfigured() && (await loadDeliveryEmailSetting(supabase, id)).on');
    expect(read('src/app/api/admin/orders/[id]/emails/[emailId]/route.ts'))
      .toContain('isDeliveryTrackingConfigured() && (await loadDeliveryEmailSetting(admin.supabase, id)).on');
    expect(read('src/components/admin/OrderDetailPanel.tsx'))
      .toContain('deliveryUpdates: deliveryTrackingEnabled && deliveryEmails.on');
  });
});

describe('wiring (source checks)', () => {
  const server = read('src/lib/order-tracking-server.ts');
  const panel = read('src/components/admin/OrderDetailPanel.tsx');

  it('applyTrackerUpdate stops every automatic email when off, after storing the tracker', () => {
    const apply = server.slice(server.indexOf('export async function applyTrackerUpdate'), server.indexOf('/** Where each automatic email is claimed'));
    const store = apply.indexOf('.from(TABLE).update({');
    const gate = apply.indexOf("if (!setting.on) return");
    expect(store).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(store);
    expect(gate).toBeLessThan(apply.indexOf("sendDeliveryEmail(service, order, row, 'expected_delivery'"));
    // Each of the three emails also checks its own scan time.
    expect(apply.match(/scanAllowsDeliveryEmail\(setting,/g)).toHaveLength(3);
  });

  it('⛔ the columns are never in a shared select (a missing column would blank the page)', () => {
    expect(server).not.toMatch(/ORDER_COLUMNS = '[^']*delivery_emails/);
    expect(read('src/app/[locale]/admin/orders/[id]/page.tsx')).not.toMatch(/'delivery_emails/);
  });

  it('Save Fulfillment saves the setting BEFORE marking Shipped (registering can send at once)', () => {
    const confirm = panel.slice(panel.indexOf('async function confirmFulfillmentUpdate'), panel.indexOf('/** Save the order\'s shipping updates setting'));
    const save = confirm.indexOf('saveDeliveryEmails(sendShippingUpdates)');
    expect(save).toBeGreaterThan(-1);
    expect(save).toBeLessThan(confirm.indexOf('await updateFulfillment(status)'));
    expect(save).toBeLessThan(confirm.indexOf('/tracking`'));
  });

  it('the two boxes say what they do', () => {
    expect(panel).toContain('Update customer via email');
    expect(panel).toContain('Send customer shipping updates');
    expect(panel).toContain('This customer gets no automatic delivery emails for this order.');
  });
});
