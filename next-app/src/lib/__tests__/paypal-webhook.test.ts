import { describe, expect, it } from 'vitest';
import { payPalCumulativeRefund, relatedPayPalCaptureId } from '@/lib/paypal-webhook';

describe('relatedPayPalCaptureId', () => {
  it('uses the capture resource id for events that carry the capture', () => {
    for (const eventType of [
      'PAYMENT.CAPTURE.COMPLETED',
      'PAYMENT.CAPTURE.DENIED',
      'PAYMENT.CAPTURE.DECLINED',
      'PAYMENT.CAPTURE.PENDING',
    ]) {
      expect(relatedPayPalCaptureId(eventType, { id: 'CAPTURE-123' })).toBe('CAPTURE-123');
    }
  });

  // REGRESSION (2026-08-12). This case previously asserted the OPPOSITE — that a
  // REFUNDED event's resource.id is the capture id — which pinned a real bug in
  // place: PAYMENT.CAPTURE.REFUNDED delivers a REFUND resource, so resource.id
  // is the refund id. Feeding that to apply_paypal_refund made the RPC refuse
  // the write ("PayPal capture % does not match order %") and every refund
  // silently failed to record while the money moved correctly in PayPal.
  //
  // The payload below is the real shape from capture 5DH54631BL586554F.
  it('reads the capture id from links for refund-shaped capture events', () => {
    const refundResource = {
      id: '9BE63976RW9553018', // the REFUND id, not the capture
      status: 'COMPLETED',
      custom_id: 'cfbb1ba4-bc06-40b7-98c0-55f9766f1344',
      links: [
        { rel: 'self', href: 'https://api.paypal.com/v2/payments/refunds/9BE63976RW9553018' },
        { rel: 'up', href: 'https://api.paypal.com/v2/payments/captures/5DH54631BL586554F' },
      ],
    };

    expect(relatedPayPalCaptureId('PAYMENT.CAPTURE.REFUNDED', refundResource))
      .toBe('5DH54631BL586554F');
    expect(relatedPayPalCaptureId('PAYMENT.CAPTURE.REVERSED', refundResource))
      .toBe('5DH54631BL586554F');
  });

  it('prefers supplementary related ids over links when both are present', () => {
    expect(relatedPayPalCaptureId('PAYMENT.CAPTURE.REFUNDED', {
      id: 'REFUND-1',
      supplementary_data: { related_ids: { capture_id: 'CAPTURE-FROM-SUPPLEMENTARY' } },
      links: [{ rel: 'up', href: 'https://api.paypal.com/v2/payments/captures/CAPTURE-FROM-LINK' }],
    })).toBe('CAPTURE-FROM-SUPPLEMENTARY');
  });

  it('finds capture ids in refund links and dispute transactions', () => {
    expect(relatedPayPalCaptureId('PAYMENT.REFUND.PENDING', {
      id: 'REFUND-123',
      links: [{ rel: 'up', href: 'https://api-m.paypal.com/v2/payments/captures/CAPTURE-456' }],
    })).toBe('CAPTURE-456');

    expect(relatedPayPalCaptureId('CUSTOMER.DISPUTE.CREATED', {
      disputed_transactions: [{ seller_transaction_id: 'CAPTURE-789' }],
    })).toBe('CAPTURE-789');
  });
});

describe('payPalCumulativeRefund', () => {
  it('reads the cumulative refund from a capture resource', () => {
    expect(payPalCumulativeRefund({
      amount: { value: '100.00', currency_code: 'USD' },
      seller_receivable_breakdown: {
        total_refunded_amount: { value: '25.50', currency_code: 'USD' },
      },
    })).toEqual({ amount: 25.5, currency: 'USD' });
  });

  it('does not mistake the original capture amount for a refund amount', () => {
    expect(payPalCumulativeRefund({
      amount: { value: '100.00', currency_code: 'USD' },
    })).toBeNull();
  });

  // The distinction the whole refund ledger rests on. Confirmed against live
  // PayPal data 2026-08-13: after $0.50 then $0.56 on a $1.06 capture, the
  // FIRST refund object reported amount $0.50 with total_refunded_amount $1.06.
  it('reads the CUMULATIVE total, which differs from this refund\'s own amount', () => {
    const secondPartial = {
      id: 'REFUND-2',
      amount: { value: '0.56', currency_code: 'USD' },
      seller_payable_breakdown: {
        total_refunded_amount: { value: '1.06', currency_code: 'USD' },
      },
    };

    expect(payPalCumulativeRefund(secondPartial)).toEqual({ amount: 1.06, currency: 'USD' });
    // `resource.amount` is this refund alone — never the running total.
    expect(Number(secondPartial.amount.value)).toBe(0.56);
  });
});

/**
 * Ledger semantics, pinned as documentation rather than exercised code: the
 * behaviour itself lives in the `apply_paypal_refund` Postgres function and is
 * covered by an integration run against the real database. These assertions
 * exist so the INTENT is discoverable from the test suite, and so a future
 * change that reverts to deriving the amount reads as a contradiction here.
 *
 * See DECISIONS, "paypal_refunds.amount is this refund's own amount".
 */
describe('refund ledger semantics', () => {
  it('derives a WRONG own-amount when an earlier refund was not yet recorded', () => {
    // The old code did: increment = cumulative - alreadyRefunded.
    // Out-of-order delivery makes `alreadyRefunded` stale, so the increment
    // stops equalling the refund's own amount.
    const ownAmount = 0.56;
    const cumulative = 1.06;

    const alreadyRefundedInOrder = 0.50;   // first refund recorded
    const alreadyRefundedOutOfOrder = 0;   // first refund's webhook is late

    expect(cumulative - alreadyRefundedInOrder).toBeCloseTo(ownAmount, 2);
    expect(cumulative - alreadyRefundedOutOfOrder).not.toBeCloseTo(ownAmount, 2);
  });

  it('takes the own amount straight from the payload instead', () => {
    const resource = {
      amount: { value: '0.56', currency_code: 'USD' },
      seller_payable_breakdown: { total_refunded_amount: { value: '1.06', currency_code: 'USD' } },
    };
    // No subtraction, no dependency on what was recorded before.
    expect(Math.round(Number(resource.amount.value) * 100) / 100).toBe(0.56);
  });
});
