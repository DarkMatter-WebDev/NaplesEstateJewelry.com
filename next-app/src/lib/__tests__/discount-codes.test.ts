import { describe, expect, it } from 'vitest';
import {
  calculateDiscountAmount,
  calculateFlSalesTax,
  round2,
} from '@/lib/checkout-pricing';
import {
  discountRejectionMessage,
  formatDiscountValue,
  isDiscountExhausted,
  isDiscountExpired,
  isValidDiscountCodeFormat,
  normalizeDiscountCode,
  normalizeDiscountEmail,
  validateDiscountCode,
  type DiscountCodeRecord,
} from '@/lib/discount-codes';

function makeCode(overrides: Partial<DiscountCodeRecord> = {}): DiscountCodeRecord {
  return {
    id: 'code-1',
    code: 'THANKYOU',
    discount_type: 'percent',
    discount_value: 15,
    min_order_subtotal: null,
    expires_at: null,
    max_redemptions: null,
    times_used: 0,
    active: true,
    notes: null,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

describe('discount amount calculation', () => {
  it('takes a percentage of the merchandise subtotal', () => {
    expect(calculateDiscountAmount('percent', 15, 1000)).toBe(150);
    expect(calculateDiscountAmount('percent', 10, 249.99)).toBe(25);
  });

  it('takes a flat dollar amount regardless of subtotal size', () => {
    expect(calculateDiscountAmount('fixed', 50, 1000)).toBe(50);
    expect(calculateDiscountAmount('fixed', 50, 200)).toBe(50);
  });

  // The clamp is the guard that keeps a fixed code from producing a negative
  // merchandise total, which would break the $0/negative rejection rule and
  // make the PayPal breakdown unsummable.
  it('clamps a fixed discount to the subtotal instead of going negative', () => {
    expect(calculateDiscountAmount('fixed', 100, 80)).toBe(80);
    expect(calculateDiscountAmount('fixed', 5000, 12.5)).toBe(12.5);
  });

  it('caps a 100% code at exactly the subtotal', () => {
    expect(calculateDiscountAmount('percent', 100, 432.1)).toBe(432.1);
  });

  it('rounds to whole cents', () => {
    // 33.333...% style rounding — the result must be a clean cent value.
    const amount = calculateDiscountAmount('percent', 15, 333.33);
    expect(amount).toBe(50);
    expect(round2(amount)).toBe(amount);
  });

  it('returns 0 for a zero/empty subtotal or a zero value', () => {
    expect(calculateDiscountAmount('percent', 15, 0)).toBe(0);
    expect(calculateDiscountAmount('fixed', 0, 100)).toBe(0);
    expect(calculateDiscountAmount('fixed', 50, 0)).toBe(0);
  });
});

describe('discount code normalization', () => {
  it('uppercases and trims so thankyou === THANKYOU', () => {
    expect(normalizeDiscountCode(' thankyou ')).toBe('THANKYOU');
    expect(normalizeDiscountCode('ThAnKyOu')).toBe('THANKYOU');
    expect(normalizeDiscountCode(null)).toBe('');
  });

  it('lowercases emails for the per-email reuse check', () => {
    expect(normalizeDiscountEmail('  Buyer@Example.COM ')).toBe('buyer@example.com');
  });

  it('accepts letters, digits, dashes and underscores only', () => {
    expect(isValidDiscountCodeFormat('THANKYOU')).toBe(true);
    expect(isValidDiscountCodeFormat('SUMMER-25')).toBe(true);
    expect(isValidDiscountCodeFormat('VIP_100')).toBe(true);
    expect(isValidDiscountCodeFormat('THANK YOU')).toBe(false);
    expect(isValidDiscountCodeFormat('-LEADING')).toBe(false);
    expect(isValidDiscountCodeFormat('')).toBe(false);
    expect(isValidDiscountCodeFormat('A'.repeat(41))).toBe(false);
  });
});

describe('expiry and exhaustion', () => {
  const now = new Date('2026-08-11T12:00:00Z');

  it('treats a null expiry as never expiring', () => {
    expect(isDiscountExpired(null, now)).toBe(false);
  });

  it('expires at or after the expiry instant', () => {
    expect(isDiscountExpired('2026-08-11T11:59:59Z', now)).toBe(true);
    expect(isDiscountExpired('2026-08-11T12:00:00Z', now)).toBe(true);
    expect(isDiscountExpired('2026-08-11T12:00:01Z', now)).toBe(false);
  });

  it('treats a null max_redemptions as unlimited', () => {
    expect(isDiscountExhausted({ max_redemptions: null, times_used: 9999 })).toBe(false);
  });

  it('is exhausted once times_used reaches the cap', () => {
    expect(isDiscountExhausted({ max_redemptions: 50, times_used: 49 })).toBe(false);
    expect(isDiscountExhausted({ max_redemptions: 50, times_used: 50 })).toBe(true);
    expect(isDiscountExhausted({ max_redemptions: 50, times_used: 51 })).toBe(true);
  });
});

describe('discount code validation', () => {
  it('accepts a healthy percent code and resolves the amount', () => {
    const result = validateDiscountCode({ record: makeCode(), subtotal: 1000 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.discount).toEqual({
      code: 'THANKYOU',
      type: 'percent',
      value: 15,
      amount: 150,
    });
  });

  it('accepts a healthy fixed code', () => {
    const record = makeCode({ code: 'FIFTYOFF', discount_type: 'fixed', discount_value: 50 });
    const result = validateDiscountCode({ record, subtotal: 400 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.discount.amount).toBe(50);
    expect(result.discount.type).toBe('fixed');
  });

  it('rejects a missing code', () => {
    expect(validateDiscountCode({ record: null, subtotal: 500 })).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  it('rejects an inactive code', () => {
    const result = validateDiscountCode({ record: makeCode({ active: false }), subtotal: 500 });
    expect(result).toEqual({ ok: false, reason: 'inactive' });
  });

  it('rejects an expired code', () => {
    const result = validateDiscountCode({
      record: makeCode({ expires_at: '2026-08-01T00:00:00Z' }),
      subtotal: 500,
      now: new Date('2026-08-11T00:00:00Z'),
    });
    expect(result).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects a code that has hit its redemption cap', () => {
    const result = validateDiscountCode({
      record: makeCode({ max_redemptions: 10, times_used: 10 }),
      subtotal: 500,
    });
    expect(result).toEqual({ ok: false, reason: 'exhausted' });
  });

  it('rejects a code already redeemed by this email', () => {
    const result = validateDiscountCode({
      record: makeCode(),
      subtotal: 500,
      alreadyUsedByEmail: true,
    });
    expect(result).toEqual({ ok: false, reason: 'already_used' });
  });

  it('rejects a cart below the code minimum and reports the threshold', () => {
    const record = makeCode({ discount_type: 'fixed', discount_value: 100, min_order_subtotal: 500 });
    const result = validateDiscountCode({ record, subtotal: 120 });
    expect(result).toEqual({ ok: false, reason: 'below_minimum', minOrderSubtotal: 500 });
  });

  it('accepts a cart exactly at the minimum', () => {
    const record = makeCode({ min_order_subtotal: 500 });
    expect(validateDiscountCode({ record, subtotal: 500 }).ok).toBe(true);
  });

  // Ordering matters: someone whose cart is merely too small should be told
  // that, not told the code is invalid.
  it('reports an inactive code as inactive even when the cart is also too small', () => {
    const record = makeCode({ active: false, min_order_subtotal: 500 });
    const result = validateDiscountCode({ record, subtotal: 10 });
    expect(result).toEqual({ ok: false, reason: 'inactive' });
  });
});

describe('discount interaction with tax and totals', () => {
  // The worked example from the plan. Locks the order of operations: the
  // discount comes off merchandise, tax is charged on the DISCOUNTED
  // merchandise plus shipping, and shipping is untouched by the discount.
  it('taxes the discounted merchandise plus shipping', () => {
    const subtotal = 1000;
    const discount = calculateDiscountAmount('percent', 15, subtotal);
    const shipping = 35;
    const discountedMerchandise = round2(subtotal - discount);
    const tax = calculateFlSalesTax(discountedMerchandise, shipping);
    const total = round2(discountedMerchandise + tax + shipping);

    expect(discount).toBe(150);
    expect(discountedMerchandise).toBe(850);
    expect(tax).toBe(53.1);
    expect(total).toBe(938.1);
  });

  it('produces the same total for an equivalent fixed code', () => {
    const subtotal = 1000;
    const shipping = 35;
    const fixed = calculateDiscountAmount('fixed', 150, subtotal);
    const merch = round2(subtotal - fixed);
    const total = round2(merch + calculateFlSalesTax(merch, shipping) + shipping);
    expect(total).toBe(938.1);
  });

  it('leaves a positive total when a fixed discount zeroes the merchandise', () => {
    const subtotal = 80;
    const shipping = 35;
    const discount = calculateDiscountAmount('fixed', 100, subtotal);
    const merch = round2(subtotal - discount);
    const total = round2(merch + calculateFlSalesTax(merch, shipping) + shipping);

    expect(discount).toBe(80);
    expect(merch).toBe(0);
    // Shipping and its tax are still owed, so the order stays chargeable and
    // never trips the `total <= 0` rejection in the create-order route.
    expect(total).toBeGreaterThan(0);
    expect(total).toBe(37.1);
  });
});

describe('discount labels and messages', () => {
  it('labels each type in both locales', () => {
    expect(formatDiscountValue('percent', 15)).toBe('15% off');
    expect(formatDiscountValue('fixed', 50)).toBe('$50.00 off');
    expect(formatDiscountValue('percent', 15, true)).toBe('15% de descuento');
    expect(formatDiscountValue('fixed', 50, true)).toBe('$50.00 de descuento');
  });

  it('has distinct non-empty copy for every rejection reason in both locales', () => {
    const reasons = [
      'not_found',
      'inactive',
      'expired',
      'exhausted',
      'below_minimum',
      'already_used',
    ] as const;

    for (const isEs of [false, true]) {
      const messages = reasons.map((reason) => discountRejectionMessage(reason, isEs));
      for (const message of messages) expect(message.length).toBeGreaterThan(0);
      expect(new Set(messages).size).toBe(reasons.length);
    }
  });

  it('names the threshold in the below-minimum message', () => {
    expect(discountRejectionMessage('below_minimum', false, 500)).toContain('$500.00');
    expect(discountRejectionMessage('below_minimum', true, 500)).toContain('$500.00');
  });
});
