import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

let buildPayPalOrderRequest: typeof import('@/lib/paypal').buildPayPalOrderRequest;
let payPalCreateRequestId: typeof import('@/lib/paypal').payPalCreateRequestId;

beforeAll(async () => {
  ({ buildPayPalOrderRequest, payPalCreateRequestId } = await import('@/lib/paypal'));
});

const BASE_INPUT = {
  currency: 'USD',
  subtotal: 100,
  tax: 7,
  shipping: 45,
  total: 152,
  items: [{ name: 'Estate ring', quantity: '1', unitAmount: 100, sku: '28' }],
  referenceId: 'order-123',
};

describe('buildPayPalOrderRequest', () => {
  it('locks a shipped order to the merchant-provided checkout address', () => {
    const payload = buildPayPalOrderRequest({
      ...BASE_INPUT,
      shippingAddress: {
        fullName: 'Buyer Name',
        addressLine1: '123 Main St',
        addressLine2: 'Unit 4',
        city: 'Naples',
        state: 'FL',
        postalCode: '34102',
        countryCode: 'US',
      },
    }) as {
      application_context: { shipping_preference: string };
      purchase_units: Array<{ shipping: unknown }>;
    };

    expect(payload.application_context.shipping_preference).toBe('SET_PROVIDED_ADDRESS');
    expect(payload.purchase_units[0].shipping).toEqual({
      name: { full_name: 'Buyer Name' },
      address: {
        address_line_1: '123 Main St',
        address_line_2: 'Unit 4',
        admin_area_2: 'Naples',
        admin_area_1: 'FL',
        postal_code: '34102',
        country_code: 'US',
      },
    });
  });

  it('keeps local pickup on NO_SHIPPING and omits PayPal shipping data', () => {
    const payload = buildPayPalOrderRequest(BASE_INPUT) as {
      application_context: { shipping_preference: string };
      purchase_units: Array<{ shipping?: unknown }>;
    };

    expect(payload.application_context.shipping_preference).toBe('NO_SHIPPING');
    expect(payload.purchase_units[0]).not.toHaveProperty('shipping');
  });

  it('uses a stable, bounded idempotency key for identical order details', () => {
    const first = payPalCreateRequestId(BASE_INPUT);
    const retry = payPalCreateRequestId({ ...BASE_INPUT, items: [...BASE_INPUT.items] });
    const changed = payPalCreateRequestId({ ...BASE_INPUT, shipping: 46, total: 153 });

    expect(retry).toBe(first);
    expect(changed).not.toBe(first);
    expect(first.length).toBeLessThanOrEqual(38);
  });

  // PayPal 422s an amount whose breakdown parts do not sum to amount.value, so
  // the discount has to be part of that arithmetic, not applied to the total.
  describe('discount breakdown', () => {
    type AmountPayload = {
      purchase_units: Array<{
        amount: {
          value: string;
          breakdown: {
            item_total: { value: string };
            tax_total: { value: string };
            shipping: { value: string };
            discount?: { value: string };
          };
        };
      }>;
    };

    function amountOf(input: Parameters<typeof buildPayPalOrderRequest>[0]) {
      return (buildPayPalOrderRequest(input) as AmountPayload).purchase_units[0].amount;
    }

    it('subtracts the discount from the total and reports it in the breakdown', () => {
      const amount = amountOf({ ...BASE_INPUT, discount: 15, total: 137 });

      expect(amount.breakdown.discount).toEqual({ currency_code: 'USD', value: '15.00' });
      expect(amount.value).toBe('137.00');

      const parts =
        Number(amount.breakdown.item_total.value)
        + Number(amount.breakdown.tax_total.value)
        + Number(amount.breakdown.shipping.value)
        - Number(amount.breakdown.discount!.value);
      expect(parts).toBeCloseTo(Number(amount.value), 2);
    });

    // Emitting "0.00" would change the request hash of every undiscounted
    // order and invalidate its existing idempotency key.
    it('omits the discount key entirely when there is no discount', () => {
      expect(amountOf(BASE_INPUT).breakdown).not.toHaveProperty('discount');
      expect(amountOf({ ...BASE_INPUT, discount: 0 }).breakdown).not.toHaveProperty('discount');
      expect(payPalCreateRequestId({ ...BASE_INPUT, discount: 0 })).toBe(
        payPalCreateRequestId(BASE_INPUT),
      );
    });

    it('clamps a discount larger than the item total and never goes negative', () => {
      const amount = amountOf({ ...BASE_INPUT, discount: 500, total: 52 });

      expect(amount.breakdown.discount).toEqual({ currency_code: 'USD', value: '100.00' });
      // Shipping and tax are still owed, so the charge stays positive.
      expect(Number(amount.value)).toBeGreaterThan(0);
      expect(amount.value).toBe('52.00');
    });
  });
});
