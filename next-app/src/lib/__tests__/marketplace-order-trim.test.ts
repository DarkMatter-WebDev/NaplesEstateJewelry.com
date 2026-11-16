import { describe, expect, it } from 'vitest';
import { trimEbayOrder } from '@/lib/ebay/client';
import { trimEtsyReceipt } from '@/lib/etsy/client';
import type { EbayOrder, EtsyReceipt } from '@/lib/marketplace-sales';

// 2026-11-16: the site does not keep eBay or Etsy buyer data (the basis of the
// eBay Marketplace Account Deletion opt-out). Orders are trimmed to their
// non-personal fields the moment they arrive; these tests pin that no buyer
// field survives the trim, whatever the marketplace sends.

const PERSONAL = ['buyer', 'fulfillmentStartInstructions', 'shipTo', 'name', 'first_line', 'buyer_email', 'buyer_user_id', 'formatted_address', 'Jane', 'jane@example.com', '555-0100', 'jbuyer99'];

function assertNoPersonalData(value: unknown) {
  const text = JSON.stringify(value);
  for (const needle of PERSONAL) expect(text).not.toContain(needle);
}

describe('trimEbayOrder', () => {
  const raw = {
    orderId: '01-15423-03542',
    creationDate: '2026-11-08T23:41:00.000Z',
    orderPaymentStatus: 'PAID',
    cancelStatus: { cancelState: 'NONE_REQUESTED', cancelRequests: [] },
    buyer: { username: 'jbuyer99', buyerRegistrationAddress: { fullName: 'Jane Buyer', email: 'jane@example.com' } },
    fulfillmentStartInstructions: [{ shippingStep: { shipTo: { fullName: 'Jane Buyer', primaryPhone: { phoneNumber: '555-0100' } } } }],
    lineItems: [{
      lineItemId: '10077384593112',
      legacyItemId: '800872360759',
      sku: 'NEJ-151',
      title: 'Montblanc Meisterstuck 149 Fountain Pen',
      quantity: 1,
      lineItemCost: { value: '425.00', currency: 'USD' },
      deliveryCost: { shippingCost: { value: '0.0' } },
    }],
  } as unknown as EbayOrder;

  it('keeps only order id, date, status, and line item / sku / title / quantity / price', () => {
    const trimmed = trimEbayOrder(raw);
    expect(trimmed).toEqual({
      orderId: '01-15423-03542',
      creationDate: '2026-11-08T23:41:00.000Z',
      orderPaymentStatus: 'PAID',
      cancelStatus: { cancelState: 'NONE_REQUESTED' },
      lineItems: [{
        lineItemId: '10077384593112',
        legacyItemId: '800872360759',
        sku: 'NEJ-151',
        title: 'Montblanc Meisterstuck 149 Fountain Pen',
        quantity: 1,
        lineItemCost: { value: '425.00', currency: 'USD' },
      }],
    });
    assertNoPersonalData(trimmed);
  });
});

describe('trimEtsyReceipt', () => {
  const raw = {
    receipt_id: 4176386677,
    status: 'Paid',
    is_paid: true,
    created_timestamp: 1789000000,
    name: 'Jane Buyer',
    first_line: '1 Main St',
    formatted_address: 'Jane Buyer\n1 Main St',
    buyer_email: 'jane@example.com',
    buyer_user_id: 12345,
    transactions: [{
      transaction_id: 5221099481,
      listing_id: 999,
      sku: 'NEJ-82',
      title: '18k Anchor Link Chain',
      quantity: 1,
      price: { amount: 191064, divisor: 100, currency_code: 'USD' },
      buyer_user_id: 12345,
    }],
  } as unknown as EtsyReceipt;

  it('keeps only receipt id, status, date, and listing / sku / title / quantity / price', () => {
    const trimmed = trimEtsyReceipt(raw);
    expect(trimmed.receipt_id).toBe(4176386677);
    expect(trimmed.transactions?.[0]).toEqual({
      transaction_id: 5221099481,
      listing_id: 999,
      sku: 'NEJ-82',
      title: '18k Anchor Link Chain',
      quantity: 1,
      price: { amount: 191064, divisor: 100, currency_code: 'USD' },
    });
    assertNoPersonalData(trimmed);
  });
});
