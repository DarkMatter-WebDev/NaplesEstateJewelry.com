import { describe, expect, it } from 'vitest';
import { buildPayPalRefundPlan } from '@/lib/paypal-refunds';

describe('buildPayPalRefundPlan', () => {
  it('converts a cumulative target into the exact additional refund', () => {
    const plan = buildPayPalRefundPlan(
      '7cd7b5da-d266-4bf6-995b-36befa32a8f4',
      25,
      100,
      70.25,
    );

    expect(plan.currentAmount).toBe(25);
    expect(plan.targetAmount).toBe(70.25);
    expect(plan.refundAmount).toBe(45.25);
    expect(plan.requestId).toBe('refund-7cd7b5dad2664bf6-7025');
    expect(plan.requestId.length).toBeLessThanOrEqual(38);
  });

  it('reuses the same request id for a retry of the same cumulative target', () => {
    const first = buildPayPalRefundPlan('order-123', 10, 100, 25);
    const retry = buildPayPalRefundPlan('order-123', 10, 100, 25.001);

    expect(retry.requestId).toBe(first.requestId);
    expect(retry.refundAmount).toBe(first.refundAmount);
  });

  it('rejects duplicate, backwards, and oversized targets', () => {
    expect(() => buildPayPalRefundPlan('order-123', 25, 100, 25)).toThrow(/greater/);
    expect(() => buildPayPalRefundPlan('order-123', 25, 100, 20)).toThrow(/greater/);
    expect(() => buildPayPalRefundPlan('order-123', 25, 100, 100.01)).toThrow(/exceed/);
  });
});
