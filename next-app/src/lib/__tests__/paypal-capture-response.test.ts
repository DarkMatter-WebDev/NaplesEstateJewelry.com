import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isPayPalCaptureDecline, parsePayPalCaptureResponse, PAYPAL_DECLINE_ISSUES, paypalErrorInfo } from '@/lib/paypal';

describe('parsePayPalCaptureResponse', () => {
  it('extracts the capture status and authoritative amount', () => {
    const result = parsePayPalCaptureResponse({
      status: 'COMPLETED',
      purchase_units: [{
        payments: {
          captures: [{
            id: 'CAPTURE-123',
            status: 'COMPLETED',
            amount: { value: '835.25', currency_code: 'USD' },
          }],
        },
      }],
    });

    expect(result).toMatchObject({
      status: 'COMPLETED',
      captureId: 'CAPTURE-123',
      capturedAmount: 835.25,
      capturedCurrency: 'USD',
    });
  });

  it('preserves a pending capture instead of treating the order status as completed', () => {
    const result = parsePayPalCaptureResponse({
      status: 'COMPLETED',
      purchase_units: [{
        payments: {
          captures: [{ id: 'CAPTURE-456', status: 'PENDING' }],
        },
      }],
    });

    expect(result.status).toBe('PENDING');
    expect(result.captureId).toBe('CAPTURE-456');
  });
});

// 2026-10-28: a customer's card was declined twice at capture. The decline
// must read as "declined — not charged, try another card", never as the
// "status unknown — do not pay again" lock, and its reason must be loggable.
describe('PayPal capture declines', () => {
  const declineBody = {
    name: 'UNPROCESSABLE_ENTITY',
    details: [{ issue: 'INSTRUMENT_DECLINED', description: 'The instrument presented was either declined by the processor or bank.' }],
    message: 'The requested action could not be performed, semantically incorrect, or failed business validation.',
    debug_id: '0d176d3517649',
  };

  it('reads the issue codes and debug id out of a PayPal error body', () => {
    expect(paypalErrorInfo(declineBody)).toEqual({ issues: ['INSTRUMENT_DECLINED'], debugId: '0d176d3517649' });
    expect(paypalErrorInfo(null)).toEqual({ issues: [], debugId: null });
    expect(paypalErrorInfo({ details: 'nope' })).toEqual({ issues: [], debugId: null });
  });

  it('treats a named decline or a DECLINED/FAILED capture as a decline', () => {
    expect(isPayPalCaptureDecline(['INSTRUMENT_DECLINED'], null)).toBe(true);
    expect(isPayPalCaptureDecline(['TRANSACTION_REFUSED'], 'APPROVED')).toBe(true);
    expect(isPayPalCaptureDecline([], 'DECLINED')).toBe(true);
    expect(isPayPalCaptureDecline([], 'FAILED')).toBe(true);
  });

  it('never treats a pending, completed or unreadable capture as a decline', () => {
    expect(isPayPalCaptureDecline([], 'PENDING')).toBe(false);
    expect(isPayPalCaptureDecline([], 'COMPLETED')).toBe(false);
    expect(isPayPalCaptureDecline([], 'UNKNOWN')).toBe(false);
    expect(isPayPalCaptureDecline(['ORDER_NOT_APPROVED'], null)).toBe(false);
    expect(PAYPAL_DECLINE_ISSUES).toEqual(['INSTRUMENT_DECLINED', 'TRANSACTION_REFUSED']);
  });

  it('a declined capture record (with an id) parses as DECLINED, so the route sends card_declined', () => {
    const lookup = parsePayPalCaptureResponse({
      status: 'APPROVED',
      purchase_units: [{ payments: { captures: [{ id: 'CAPTURE-DECLINED-1', status: 'DECLINED' }] } }],
    });
    expect(lookup.captureId).toBe('CAPTURE-DECLINED-1');
    expect(isPayPalCaptureDecline([], lookup.status)).toBe(true);
  });

  it('the routes and the button handle the decline before the "do not pay again" lock', () => {
    const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8');
    const route = read('src', 'app', 'api', 'paypal', 'capture-order', 'route.ts');
    expect(route).toContain("code: 'card_declined'");
    const declineAt = route.indexOf('isPayPalCaptureDecline(issues, recovered.status)');
    const unknownAt = route.indexOf("error: 'PayPal is still resolving this payment.");
    expect(declineAt).toBeGreaterThan(0);
    expect(declineAt).toBeLessThan(unknownAt);
    expect(route).toContain("console.error('PayPal capture issue:'");

    const button = read('src', 'components', 'checkout', 'PayPalCheckoutButton.tsx');
    const buttonDecline = button.indexOf("result?.code === 'card_declined'");
    expect(buttonDecline).toBeGreaterThan(0);
    expect(buttonDecline).toBeLessThan(button.indexOf('result?.paymentCaptured || result?.paymentStatusUnknown'));
    // No automatic re-open of the PayPal window: the buyer taps again.
    expect(button).not.toContain('actions.restart');

    // A declined order can be paid again: site checkout reuse + the remote pay link.
    expect(read('src', 'app', 'api', 'paypal', 'create-order', 'route.ts')).toContain("order.payment_status === 'failed' ? { payment_status: 'unpaid' } : {}");
    const payLink = read('src', 'app', 'api', 'pay', '[token]', 'create-order', 'route.ts');
    expect(payLink).toContain(".in('payment_status', ['unpaid', 'failed'])");
    expect(payLink).toContain(".is('paypal_capture_id', null)");
  });
});
