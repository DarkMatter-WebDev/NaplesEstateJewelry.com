import { describe, expect, it } from 'vitest';
import {
  CHECKOUT_SHIPPING_OPTIONS,
  DEFAULT_SHIPPING_METHOD,
  EXPRESS_SHIPPING_MAX_SUBTOTAL,
  EXPRESS_SHIPPING_TIERS,
  getCheckoutShippingFee,
  getMarketplaceShippingTier,
  getMarketplaceStandardShippingFee,
  getShippingServiceNote,
  isCheckoutShippingMethod,
  isShippingMethodAvailable,
  MARKETPLACE_SHIPPING_TIERS,
  shippingMethodForDb,
  STANDARD_SHIPPING_TIERS,
  usesRegisteredMail,
} from '@/lib/checkout-shipping';

describe('checkout shipping catalog', () => {
  it('keeps methods, labels, and the default in one definition', () => {
    expect(CHECKOUT_SHIPPING_OPTIONS.map((option) => option.value)).toEqual([
      'local-pickup',
      'express-overnight-insured',
      'priority-insured',
    ]);
    expect(DEFAULT_SHIPPING_METHOD).toBe('priority-insured');
  });

  it('rejects unknown methods instead of converting them to free shipping', () => {
    expect(isCheckoutShippingMethod('priority-insured')).toBe(true);
    expect(isCheckoutShippingMethod('free-international')).toBe(false);
    expect(getCheckoutShippingFee('free-international', 500)).toBeNull();
    expect(isShippingMethodAvailable('free-international', 500)).toBe(false);
  });

  it('maps checkout methods to the existing database fulfillment values', () => {
    expect(shippingMethodForDb('local-pickup')).toBe('pickup');
    expect(shippingMethodForDb('priority-insured')).toBe('shipping');
    expect(shippingMethodForDb('express-overnight-insured')).toBe('shipping');
  });
});

describe('value-based standard shipping tiers', () => {
  it('charges the approved fee at every tier boundary', () => {
    const cases: Array<[number, number]> = [
      [0, 19],
      [49, 19],
      [99.99, 19],
      [100, 25],
      [249.99, 25],
      [250, 29],
      [599.99, 29],
      [600, 35],
      [999.99, 35],
      [1000, 59],
      [2499.99, 59],
      [2500, 99],
      [4999.99, 99],
      [5000, 99],
      [14999.99, 99],
      [15000, 165],
      [34999, 165],
    ];
    for (const [subtotal, fee] of cases) {
      expect(getCheckoutShippingFee('priority-insured', subtotal)).toBe(fee);
    }
  });

  it('covers every subtotal with exactly one tier and no gaps', () => {
    for (let i = 1; i < STANDARD_SHIPPING_TIERS.length; i++) {
      expect(STANDARD_SHIPPING_TIERS[i].min).toBe(STANDARD_SHIPPING_TIERS[i - 1].max);
    }
    expect(STANDARD_SHIPPING_TIERS[0].min).toBe(0);
    expect(STANDARD_SHIPPING_TIERS[STANDARD_SHIPPING_TIERS.length - 1].max).toBeNull();
  });

  it('keeps local pickup free at every subtotal and rejects invalid input', () => {
    expect(getCheckoutShippingFee('local-pickup', 0)).toBe(0);
    expect(getCheckoutShippingFee('local-pickup', 34999)).toBe(0);
    expect(getCheckoutShippingFee('priority-insured', Number.NaN)).toBeNull();
    expect(getCheckoutShippingFee('priority-insured', -1)).toBeNull();
  });
});

describe('express overnight availability and tiers', () => {
  it('charges the approved express fee below the insurance cap', () => {
    const cases: Array<[number, number]> = [
      [0, 55],
      [999.99, 55],
      [1000, 79],
      [2499.99, 79],
      [2500, 119],
      [4999.99, 119],
    ];
    for (const [subtotal, fee] of cases) {
      expect(getCheckoutShippingFee('express-overnight-insured', subtotal)).toBe(fee);
    }
  });

  it('is not offered at or above the USPS insurance cap — never substituted', () => {
    expect(EXPRESS_SHIPPING_MAX_SUBTOTAL).toBe(5000);
    expect(EXPRESS_SHIPPING_TIERS[EXPRESS_SHIPPING_TIERS.length - 1].max).toBe(5000);
    expect(getCheckoutShippingFee('express-overnight-insured', 5000)).toBeNull();
    expect(isShippingMethodAvailable('express-overnight-insured', 4999.99)).toBe(true);
    expect(isShippingMethodAvailable('express-overnight-insured', 5000)).toBe(false);
    expect(isShippingMethodAvailable('priority-insured', 5000)).toBe(true);
  });
});

describe('registered mail service at $5,000+', () => {
  it('switches standard shipping to Registered Mail wording at the cap', () => {
    expect(usesRegisteredMail('priority-insured', 4999.99)).toBe(false);
    expect(usesRegisteredMail('priority-insured', 5000)).toBe(true);
    expect(usesRegisteredMail('express-overnight-insured', 5000)).toBe(false);
    expect(getShippingServiceNote('priority-insured', 4999.99, false)).toBeNull();
    expect(getShippingServiceNote('priority-insured', 5000, false)).toMatch(/Registered Mail/);
    expect(getShippingServiceNote('priority-insured', 5000, true)).toMatch(/Registered Mail/);
  });
});

describe('marketplace shipping tiers', () => {
  it('maps a single listing price to the standard tier fee', () => {
    expect(getMarketplaceStandardShippingFee(49)).toBe(19);
    expect(getMarketplaceStandardShippingFee(599)).toBe(29);
    expect(getMarketplaceStandardShippingFee(5182)).toBe(99);
    expect(getMarketplaceStandardShippingFee(34999)).toBe(165);
  });

  it('returns null for unusable prices instead of guessing a fee', () => {
    expect(getMarketplaceStandardShippingFee(0)).toBeNull();
    expect(getMarketplaceStandardShippingFee(-5)).toBeNull();
    expect(getMarketplaceStandardShippingFee(Number.NaN)).toBeNull();
  });

  it('exposes one tier per DISTINCT fee with stable ascending keys', () => {
    expect(MARKETPLACE_SHIPPING_TIERS.map((tier) => tier.fee)).toEqual([19, 25, 29, 35, 59, 99, 165]);
    expect(MARKETPLACE_SHIPPING_TIERS.map((tier) => tier.key)).toEqual([
      'fee-19', 'fee-25', 'fee-29', 'fee-35', 'fee-59', 'fee-99', 'fee-165',
    ]);
  });

  it('resolves a listing price to its tier identity', () => {
    expect(getMarketplaceShippingTier(49)).toEqual({ key: 'fee-19', fee: 19, minDeliveryDays: 1, maxDeliveryDays: 5 });
    // Both $99 bands ($2,500-$4,999 Priority and $5,000+ Registered) share one
    // marketplace tier object — so it must quote the SLOWER Registered window
    // (2-10 business days) rather than over-promise Priority transit.
    expect(getMarketplaceShippingTier(3000)).toEqual({ key: 'fee-99', fee: 99, minDeliveryDays: 2, maxDeliveryDays: 10 });
    expect(getMarketplaceShippingTier(8203)).toEqual({ key: 'fee-99', fee: 99, minDeliveryDays: 2, maxDeliveryDays: 10 });
    expect(getMarketplaceShippingTier(34999)).toEqual({ key: 'fee-165', fee: 165, minDeliveryDays: 2, maxDeliveryDays: 10 });
    expect(getMarketplaceShippingTier(0)).toBeNull();
  });
});
