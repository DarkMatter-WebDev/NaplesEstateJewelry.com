import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCardBillingAddress, cardFieldsProblem, EMPTY_BILLING_FORM } from '@/lib/card-billing';
import { offerDeclinedMessage } from '@/lib/offers';

// Make an Offer on the new pay box (2026-10-29, owner's mockup 1 + "Build as
// recommended"): card boxes + PayPal on the HOLD step; no Venmo / Apple Pay /
// Google Pay on offers; "Send offer · Hold $…"; a declined card = nothing
// charged, nothing held, the offer never opens.

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

const updates: Array<Record<string, unknown>> = [];
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({}) }));

const authorizeMock = vi.fn();
const lookupMock = vi.fn();
const orderMock = vi.fn();
vi.mock('@/lib/paypal', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/paypal')>();
  return {
    ...real,
    authorizePayPalOrder: (...args: unknown[]) => authorizeMock(...args),
    getPayPalOrderAuthorization: (...args: unknown[]) => lookupMock(...args),
    getPayPalOrder: (...args: unknown[]) => orderMock(...args),
    voidPayPalAuthorization: vi.fn(async () => ({ released: true })),
  };
});

function fakeService() {
  const row = { id: 'offer-1', status: 'pending', locale: 'en', product_id: 'p1', total: 190.8, amount: 180 };
  return {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
      update: (payload: Record<string, unknown>) => {
        updates.push(payload);
        const chain = { eq: () => chain, in: async () => ({ error: null }) };
        return chain;
      },
    }),
  } as never;
}

function declineError() {
  return Object.assign(new Error('PayPal authorize failed: declined (INSTRUMENT_DECLINED)'), {
    raw: { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'INSTRUMENT_DECLINED' }], debug_id: 'dbg-1' },
  });
}

describe('buildCardBillingAddress (shared by checkout + offers)', () => {
  const customer = { address_line1: ' 412 Palm Ave ', address_line2: '', city: 'Naples', state: 'Florida', postal_code: '34102' };

  it('Local Pickup asks only for the billing ZIP', () => {
    expect(buildCardBillingAddress({ shippingMethod: 'local-pickup', customer, billingSame: true, billing: EMPTY_BILLING_FORM, isEs: false }))
      .toEqual({ error: 'Enter the card’s billing ZIP code.' });
    expect(buildCardBillingAddress({ shippingMethod: 'local-pickup', customer, billingSame: true, billing: { ...EMPTY_BILLING_FORM, zip: '34109' }, isEs: false }))
      .toEqual({ value: { postalCode: '34109', countryCode: 'US' } });
  });

  it('"same as shipping" copies the shipping address', () => {
    expect(buildCardBillingAddress({ shippingMethod: 'priority-insured', customer, billingSame: true, billing: EMPTY_BILLING_FORM, isEs: false }))
      .toEqual({ value: { addressLine1: '412 Palm Ave', adminArea2: 'Naples', adminArea1: 'FL', postalCode: '34102', countryCode: 'US' } });
  });

  it('unticked names what is missing', () => {
    const result = buildCardBillingAddress({ shippingMethod: 'priority-insured', customer, billingSame: false, billing: { ...EMPTY_BILLING_FORM, line1: '1 Main' }, isEs: false });
    expect(result).toEqual({ error: 'Complete the billing address: city, state, ZIP code.' });
  });

  it('cardFieldsProblem names the bad boxes', () => {
    expect(cardFieldsProblem({ isFormValid: true, fields: {} }, false)).toBeNull();
    expect(cardFieldsProblem({ isFormValid: false, fields: { cardNumberField: { isValid: false }, cardExpiryField: { isValid: true }, cardCvvField: { isValid: false } } }, false))
      .toBe('Please check the card number, security code.');
  });
});

describe('authorizeOffer on a card', () => {
  beforeEach(() => {
    updates.length = 0;
    authorizeMock.mockReset();
    lookupMock.mockReset();
    orderMock.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('a declined card answers card_declined, sets the offer aside and never opens it', async () => {
    const { authorizeOffer } = await import('@/lib/offers-server');
    orderMock.mockResolvedValue({});
    authorizeMock.mockRejectedValue(declineError());
    lookupMock.mockResolvedValue({ status: 'UNKNOWN', authorizationId: null, amount: null, currency: null, createTime: null, raw: {} });
    const result = await authorizeOffer(fakeService(), 'PP-1', { paymentMethod: 'card' });
    expect(result).toEqual({ ok: false, status: 402, error: offerDeclinedMessage(false), code: 'card_declined' });
    expect(updates).toEqual([{ status: 'abandoned', last_error: 'Card declined: INSTRUMENT_DECLINED' }]);
  });

  it('a failed 3-D Secure check is a decline before any hold is asked for', async () => {
    const { authorizeOffer } = await import('@/lib/offers-server');
    orderMock.mockResolvedValue({
      payment_source: { card: { authentication_result: { three_d_secure: { enrollment_status: 'Y', authentication_status: 'N' } } } },
    });
    const result = await authorizeOffer(fakeService(), 'PP-2', { paymentMethod: 'card' });
    expect(result).toMatchObject({ ok: false, code: 'card_declined' });
    expect(authorizeMock).not.toHaveBeenCalled();
  });

  it('a DENIED authorization is a decline', async () => {
    const { authorizeOffer } = await import('@/lib/offers-server');
    authorizeMock.mockResolvedValue({ status: 'DENIED', authorizationId: 'A-1', amount: 190.8, currency: 'USD', createTime: null, raw: {} });
    const result = await authorizeOffer(fakeService(), 'PP-3');
    expect(result).toMatchObject({ ok: false, code: 'card_declined' });
    expect(orderMock).not.toHaveBeenCalled(); // PayPal-button holds skip the 3-D Secure lookup
  });

  it('the decline words say nothing was charged or held, in both languages', () => {
    expect(offerDeclinedMessage(false)).toContain('NOT charged and nothing is held');
    expect(offerDeclinedMessage(true)).toContain('NO se le cobró ni se retuvo nada');
  });
});

describe('source guards', () => {
  const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8');

  it('the offer SDK holds cards in our boxes, with no Venmo, Apple Pay or Google Pay', () => {
    const button = read('src', 'components', 'offers', 'PayPalOfferButton.tsx');
    expect(button).toContain("components: 'buttons,card-fields'");
    expect(button).toContain("'disable-funding': 'paylater,credit,venmo'");
    expect(button).toContain('[funding.PAYPAL, ...(cardOk ? [] : [funding.CARD])]');
    expect(button).toContain("body: JSON.stringify({ paypalOrderId, paymentMethod: method })");
    expect(button).toContain('Send offer · Hold ${heldAmount}');
    expect(button).not.toMatch(/Applepay|Googlepay|apple-pay-button/);
  });

  it('the authorize route passes the method; the offer page passes the total', () => {
    expect(read('src', 'app', 'api', 'offers', 'authorize', 'route.ts')).toContain('authorizeOffer(createServiceClient(), paypalOrderId, { paymentMethod })');
    expect(read('src', 'components', 'offers', 'OfferCheckoutClient.tsx')).toContain('amount={totals?.total ?? null}');
  });

  it('checkout and offers share one billing component and one address builder', () => {
    for (const file of [['checkout', 'PayPalCheckoutButton.tsx'], ['offers', 'PayPalOfferButton.tsx']]) {
      const src = read('src', 'components', ...file);
      expect(src).toContain('<CardBillingInputs');
      expect(src).toContain('buildCardBillingAddress(');
    }
  });
});
