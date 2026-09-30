import { describe, expect, it } from 'vitest';
import { quotedTotalHasDrifted, toOrderQuote, round2 } from '@/lib/checkout-pricing';
import type { OrderDraft } from '@/lib/checkout-pricing';

describe('quotedTotalHasDrifted', () => {
  it('accepts an exactly matching quote', () => {
    expect(quotedTotalHasDrifted(1066.55, 1066.55)).toBe(false);
  });

  // The real sibling numbers.
  it('rejects a quote that undercharges the business', () => {
    expect(quotedTotalHasDrifted(1070.60, 1066.55)).toBe(true);
  });

  // Drift must be caught in BOTH directions. The dangerous one is the buyer
  // being charged MORE than the page they agreed to.
  it('rejects a quote that would overcharge the customer', () => {
    expect(quotedTotalHasDrifted(1066.55, 1070.60)).toBe(true);
  });

  it('rejects a one-cent difference in either direction', () => {
    expect(quotedTotalHasDrifted(1066.55, 1066.56)).toBe(true);
    expect(quotedTotalHasDrifted(1066.56, 1066.55)).toBe(true);
  });

  // Float noise must NOT fire the guard: both sides are rounded upstream, but
  // 1066.5500000000002 !== 1066.55 would reject a perfectly matching quote and
  // make checkout impossible.
  it('is immune to float representation noise', () => {
    const noisy = 1066.55 + 0.0000000000002;
    expect(noisy).not.toBe(1066.55);           // the noise is real
    expect(quotedTotalHasDrifted(noisy, 1066.55)).toBe(false);
    expect(quotedTotalHasDrifted(0.1 + 0.2, 0.3)).toBe(false);
  });

  // "No opinion" — an older client or a dropped field must not be blocked by a
  // check it cannot satisfy. The server still charges its own price.
  it('treats a missing or unparseable quote as no opinion', () => {
    for (const absent of [undefined, null, '', 'abc', NaN, Infinity]) {
      expect(quotedTotalHasDrifted(absent, 1066.55)).toBe(false);
    }
  });

  it('accepts a numeric string that matches', () => {
    expect(quotedTotalHasDrifted('1066.55', 1066.55)).toBe(false);
    expect(quotedTotalHasDrifted('1070.60', 1066.55)).toBe(true);
  });

  it('compares in whole cents, so sub-cent noise never drifts', () => {
    expect(quotedTotalHasDrifted(1066.554, 1066.55)).toBe(false);
    expect(quotedTotalHasDrifted(1066.556, 1066.55)).toBe(true);
  });

  // A real spot move on one bracelet, measured 2026-08-13.
  it('catches the measured real-world drift', () => {
    expect(quotedTotalHasDrifted(6462.72, 6393.39)).toBe(true);
    expect(round2(6462.72 - 6393.39)).toBe(69.33);
  });
});

describe('toOrderQuote', () => {
  it('projects a draft into the wire shape, including per-item unit prices', () => {
    const draft = {
      items: [
        {
          product_id: 'p1', inventory_number: '1', title_snapshot: 'Chain',
          item_year_snapshot: null, metal_snapshot: 'gold', purity_snapshot: '14k',
          gram_weight_snapshot: 10, price_snapshot: 500, quantity: 2, image_snapshot: null,
        },
      ],
      subtotal: 1000, discount: 100, appliedDiscount: null,
      tax: 54, shippingFee: 0, total: 954,
    } as unknown as OrderDraft;

    expect(toOrderQuote(draft)).toEqual({
      items: [{ productId: 'p1', unitPrice: 500, quantity: 2, title: 'Chain' }],
      subtotal: 1000, discount: 100, tax: 54, shippingFee: 0, total: 954,
    });
  });
});
