import { describe, expect, it } from 'vitest';
import {
  EBAY_SALES_SCOPE,
  ETSY_SALES_SCOPE,
  countSaleOutcome,
  ebayOrderIsSale,
  emptySalesSweepSummary,
  etsyReceiptIsSale,
  formatSalesSweepSummary,
  hasSalesScope,
  salesReadFrom,
  salesSweepOutcomeLevel,
  selectEbaySaleLines,
  selectEtsySaleLines,
  type EbayOrder,
  type EtsyReceipt,
} from '../marketplace-sales';

// A sale on Etsy/eBay marks the product sold on the site (2026-09-12). These
// pin the pure rules: which order lines count, how they map to products, the
// unit price that becomes sold_price, and the cursor overlap.

const etsyListings = new Map<number, string>([[1001, 'gold-cuban-chain'], [1002, 'sterling-bead-necklace']]);

function receipt(overrides: Partial<EtsyReceipt> = {}): EtsyReceipt {
  return {
    receipt_id: 5551,
    status: 'Paid',
    is_paid: true,
    created_timestamp: 1_789_200_000,
    transactions: [
      { transaction_id: 91, listing_id: 1001, quantity: 1, title: 'Cuban Chain', price: { amount: 45425, divisor: 100, currency_code: 'USD' } },
    ],
    ...overrides,
  };
}

describe('Etsy receipts', () => {
  it('turns a paid receipt line into a sale of the linked product, with the unit price', () => {
    const { sales, unmatched, skippedReceipts } = selectEtsySaleLines([receipt()], etsyListings);
    expect(unmatched).toEqual([]);
    expect(skippedReceipts).toBe(0);
    expect(sales).toEqual([
      {
        channel: 'etsy',
        externalOrderId: '5551',
        externalLineId: '91',
        productId: 'gold-cuban-chain',
        quantity: 1,
        salePrice: 454.25,
        createdAt: new Date(1_789_200_000 * 1000).toISOString(),
        title: 'Cuban Chain',
      },
    ]);
  });

  it('skips cancelled, fully refunded and unpaid receipts — nothing ever un-sells', () => {
    expect(etsyReceiptIsSale(receipt({ status: 'Canceled' }))).toBe(false);
    expect(etsyReceiptIsSale(receipt({ status: 'Fully Refunded' }))).toBe(false);
    expect(etsyReceiptIsSale(receipt({ is_paid: false, status: 'Open' }))).toBe(false);
    expect(etsyReceiptIsSale(receipt({ status: 'Completed' }))).toBe(true);
    expect(etsyReceiptIsSale(receipt({ status: 'Partially Refunded' }))).toBe(true);
    const { sales, skippedReceipts } = selectEtsySaleLines([receipt({ status: 'canceled' })], etsyListings);
    expect(sales).toEqual([]);
    expect(skippedReceipts).toBe(1);
  });

  it('reports a line for a listing we never synced as unmatched instead of guessing', () => {
    const { sales, unmatched } = selectEtsySaleLines(
      [receipt({ transactions: [{ transaction_id: 92, listing_id: 4242, quantity: 1, title: 'Hand-listed brooch' }] })],
      etsyListings,
    );
    expect(sales).toEqual([]);
    expect(unmatched).toEqual([{ channel: 'etsy', externalOrderId: '5551', externalLineId: '92', reference: 'listing 4242', title: 'Hand-listed brooch' }]);
  });

  it('accepts the older create_timestamp spelling and a missing price', () => {
    const { sales } = selectEtsySaleLines(
      [receipt({ created_timestamp: undefined, create_timestamp: 1_700_000_000, transactions: [{ transaction_id: 93, listing_id: 1002, quantity: 2 }] })],
      etsyListings,
    );
    expect(sales[0].createdAt).toBe(new Date(1_700_000_000 * 1000).toISOString());
    expect(sales[0].salePrice).toBeNull();
    expect(sales[0].quantity).toBe(2);
  });
});

const ebaySkus = new Map<string, string>([['nej-82', 'gold-cuban-chain']]);
const ebayItems = new Map<string, string>([['110011', 'sterling-bead-necklace']]);

function order(overrides: Partial<EbayOrder> = {}): EbayOrder {
  return {
    orderId: '12-34567-89012',
    creationDate: '2026-09-12T18:00:00.000Z',
    orderPaymentStatus: 'PAID',
    cancelStatus: { cancelState: 'NONE_REQUESTED' },
    lineItems: [{ lineItemId: '7001', legacyItemId: '110022', sku: 'nej-82', quantity: 2, title: 'Cuban Chain', lineItemCost: { value: '908.50', currency: 'USD' } }],
    ...overrides,
  };
}

describe('eBay orders', () => {
  it('matches by SKU first and records the UNIT price (line cost ÷ quantity)', () => {
    const { sales, unmatched } = selectEbaySaleLines([order()], ebaySkus, ebayItems);
    expect(unmatched).toEqual([]);
    expect(sales).toEqual([
      {
        channel: 'ebay',
        externalOrderId: '12-34567-89012',
        externalLineId: '7001',
        productId: 'gold-cuban-chain',
        quantity: 2,
        salePrice: 454.25,
        createdAt: '2026-09-12T18:00:00.000Z',
        title: 'Cuban Chain',
      },
    ]);
  });

  it('falls back to the item id when the line has no SKU', () => {
    const { sales } = selectEbaySaleLines(
      [order({ lineItems: [{ lineItemId: '7002', legacyItemId: '110011', sku: null, quantity: 1 }] })],
      ebaySkus,
      ebayItems,
    );
    expect(sales[0].productId).toBe('sterling-bead-necklace');
    expect(sales[0].salePrice).toBeNull();
  });

  it('skips unpaid, failed, fully refunded and cancelled orders; a partial refund still sold', () => {
    expect(ebayOrderIsSale(order({ orderPaymentStatus: 'PENDING' }))).toBe(false);
    expect(ebayOrderIsSale(order({ orderPaymentStatus: 'FAILED' }))).toBe(false);
    expect(ebayOrderIsSale(order({ orderPaymentStatus: 'FULLY_REFUNDED' }))).toBe(false);
    expect(ebayOrderIsSale(order({ cancelStatus: { cancelState: 'CANCELED' } }))).toBe(false);
    expect(ebayOrderIsSale(order({ cancelStatus: { cancelState: 'IN_PROGRESS' } }))).toBe(false);
    expect(ebayOrderIsSale(order({ orderPaymentStatus: 'PARTIALLY_REFUNDED' }))).toBe(true);
    expect(ebayOrderIsSale(order({ cancelStatus: null }))).toBe(true);
  });

  it('reports a line for an item we do not track as unmatched', () => {
    const { sales, unmatched } = selectEbaySaleLines(
      [order({ lineItems: [{ lineItemId: '7003', legacyItemId: '999', sku: 'other', quantity: 1, title: 'Not ours' }] })],
      ebaySkus,
      ebayItems,
    );
    expect(sales).toEqual([]);
    expect(unmatched[0]).toMatchObject({ channel: 'ebay', externalLineId: '7003', reference: 'sku other', title: 'Not ours' });
  });
});

describe('scopes, cursor and summaries', () => {
  it('knows which scope each channel needs before orders can be read', () => {
    expect(hasSalesScope('etsy', ['listings_r', 'shops_r'])).toBe(false);
    expect(hasSalesScope('etsy', ['listings_r', ETSY_SALES_SCOPE])).toBe(true);
    expect(hasSalesScope('ebay', ['https://api.ebay.com/oauth/api_scope/sell.inventory'])).toBe(false);
    expect(hasSalesScope('ebay', [EBAY_SALES_SCOPE])).toBe(true);
    expect(hasSalesScope('ebay', null)).toBe(false);
  });

  it('reads from ten minutes before the cursor so a late order is never missed', () => {
    expect(salesReadFrom('2026-09-12T18:00:00.000Z').toISOString()).toBe('2026-09-12T17:50:00.000Z');
  });

  it('counts outcomes and words the summary for the activity log', () => {
    const summary = emptySalesSweepSummary();
    summary.ordersRead = 3;
    for (const outcome of ['sold', 'decremented', 'duplicate', 'not_available', 'error'] as const) countSaleOutcome(summary, outcome);
    expect(summary).toEqual({ ordersRead: 3, sold: 1, decremented: 1, alreadyHandled: 2, unmatched: 0, failed: 1 });
    expect(formatSalesSweepSummary('Etsy', summary)).toBe('Etsy sales: 3 orders read, 1 marked sold, 1 quantity reduced, 2 already handled, 0 not ours, 1 failed');
    expect(salesSweepOutcomeLevel(summary)).toBe('error');
    expect(salesSweepOutcomeLevel({ ...summary, failed: 0, unmatched: 1 })).toBe('warning');
    expect(salesSweepOutcomeLevel({ ...summary, failed: 0 })).toBe('ok');
  });
});
