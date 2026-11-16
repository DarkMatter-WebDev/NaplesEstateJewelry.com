import { describe, expect, it } from 'vitest';
import {
  buildMarketplaceSaleRecords,
  marketplaceOrderUrl,
  marketplaceRecordMatches,
  mergeOrdersAndMarketplace,
  type MarketplaceSaleEventRow,
} from '@/lib/marketplace-sale-records';
import {
  linesBefore,
  saleRecordInsert,
  selectEbaySaleLines,
  selectReversedOrders,
  type EbayOrder,
  type EtsyReceipt,
} from '@/lib/marketplace-sales';

// 2026-11-16 (owner, option B): eBay / Etsy sales are listed among the site
// orders on Admin → Orders — what sold, when, how much; never buyer data.

const row = (over: Partial<MarketplaceSaleEventRow>): MarketplaceSaleEventRow => ({
  channel: 'ebay',
  external_order_id: '01-15423-03542',
  external_line_id: '1',
  product_id: null,
  quantity: 1,
  sale_price: '100.00',
  outcome: 'unmatched',
  title: 'Montblanc 149',
  sold_at: '2026-11-08T23:41:00.000Z',
  marketplace_status: null,
  created_at: '2026-11-09T00:00:08.000Z',
  ...over,
});

describe('buildMarketplaceSaleRecords', () => {
  it('groups lines into one record per marketplace order, newest first, totals price × quantity', () => {
    const records = buildMarketplaceSaleRecords([
      row({ external_line_id: '1', sale_price: '100.00' }),
      row({ external_line_id: '2', title: 'Cufflinks', quantity: 2, sale_price: 25 }),
      row({ channel: 'etsy', external_order_id: '4176386677', product_id: 'chain', title: null, sale_price: '1910.64', outcome: 'sold', sold_at: null, created_at: '2026-09-18T01:00:09.000Z' }),
    ], new Map([['chain', '18K Gold Rectangular Anchor Link Chain Necklace']]));
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual({
      key: 'ebay:01-15423-03542',
      channel: 'ebay',
      externalOrderId: '01-15423-03542',
      items: ['Montblanc 149', 'Cufflinks ×2'],
      soldAt: '2026-11-08T23:41:00.000Z',
      total: 150,
      status: 'sold',
    });
    // Row written before the title column: the product's title, the time the site saw it.
    expect(records[1].items).toEqual(['18K Gold Rectangular Anchor Link Chain Necklace']);
    expect(records[1].soldAt).toBe('2026-09-18T01:00:09.000Z');
    expect(records[1].total).toBe(1910.64);
  });

  it('shows a refund, skips half-written rows, and keeps an unknown price as null', () => {
    const records = buildMarketplaceSaleRecords([
      row({ marketplace_status: 'refunded', sale_price: null }),
      row({ external_order_id: 'x', outcome: 'pending' }),
    ]);
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe('refunded');
    expect(records[0].total).toBeNull();
  });

  it('decodes Etsy\'s HTML-encoded titles for display', () => {
    const [record] = buildMarketplaceSaleRecords([row({ title: 'Armani &quot;Esmeralda&quot; Sculpture &amp; Base &#39;95' })]);
    expect(record.items).toEqual(['Armani "Esmeralda" Sculpture & Base \'95']);
  });

  it('a record carries no buyer field at all', () => {
    const [record] = buildMarketplaceSaleRecords([row({})]);
    expect(Object.keys(record).sort()).toEqual(['channel', 'externalOrderId', 'items', 'key', 'soldAt', 'status', 'total']);
  });
});

describe('marketplace record helpers', () => {
  const [record] = buildMarketplaceSaleRecords([row({})]);

  it('links to the seller order page on each marketplace', () => {
    expect(marketplaceOrderUrl('ebay', '01-15423-03542')).toBe('https://www.ebay.com/mesh/ord/details?mode=SH&orderid=01-15423-03542');
    expect(marketplaceOrderUrl('etsy', '4176386677')).toBe('https://www.etsy.com/your/orders/sold?order_id=4176386677');
  });

  it('search matches order id, item and marketplace name', () => {
    expect(marketplaceRecordMatches(record, 'montblanc')).toBe(true);
    expect(marketplaceRecordMatches(record, '15423')).toBe(true);
    expect(marketplaceRecordMatches(record, 'ebay')).toBe(true);
    expect(marketplaceRecordMatches(record, 'etsy')).toBe(false);
  });

  it('mixes site orders and marketplace records by date, newest first', () => {
    const orders = [{ id: 'a', created_at: '2026-11-09T12:00:00Z' }, { id: 'b', created_at: '2026-10-30T12:00:00Z' }];
    const merged = mergeOrdersAndMarketplace(orders, [record]);
    expect(merged.map((e) => (e.kind === 'order' ? e.order.id : e.record.externalOrderId))).toEqual(['a', '01-15423-03542', 'b']);
  });
});

describe('sale records written by the sweep', () => {
  const orders = [
    {
      orderId: 'old', creationDate: '2026-10-01T00:00:00Z', orderPaymentStatus: 'PAID', cancelStatus: { cancelState: 'NONE_REQUESTED' },
      lineItems: [{ lineItemId: 'L1', legacyItemId: '800872360759', sku: null, title: 'Montblanc 149', quantity: 1, lineItemCost: { value: '425.00' } }],
    },
    {
      orderId: 'new', creationDate: '2026-11-16T16:00:00Z', orderPaymentStatus: 'PAID', cancelStatus: { cancelState: 'NONE_REQUESTED' },
      lineItems: [{ lineItemId: 'L2', sku: 'NEJ-1', title: 'Chain', quantity: 1, lineItemCost: { value: '50' } }],
    },
    {
      orderId: 'gone', creationDate: '2026-10-02T00:00:00Z', orderPaymentStatus: 'FULLY_REFUNDED', cancelStatus: { cancelState: 'NONE_REQUESTED' },
      lineItems: [],
    },
  ] as EbayOrder[];
  const selection = selectEbaySaleLines(orders, new Map([['NEJ-1', 'chain']]), new Map());

  it('an item listed by hand is recorded with its price and date, product untouched', () => {
    expect(saleRecordInsert(selection.unmatched[0])).toEqual({
      channel: 'ebay',
      external_order_id: 'old',
      external_line_id: 'L1',
      product_id: null,
      quantity: 1,
      sale_price: 425,
      outcome: 'unmatched',
      title: 'Montblanc 149',
      sold_at: '2026-10-01T00:00:00Z',
      item_reference: 'item 800872360759',
    });
  });

  it('a matched past sale is recorded only ("recorded"), never applied', () => {
    expect(saleRecordInsert(selection.sales[0]).outcome).toBe('recorded');
    expect(saleRecordInsert(selection.sales[0]).product_id).toBe('chain');
  });

  it('the fill-in leaves lines the regular read covers to the regular sweep', () => {
    const before = new Date('2026-11-16T15:50:00Z');
    expect(linesBefore(selection.sales, before)).toHaveLength(0);
    expect(linesBefore(selection.unmatched, before)).toHaveLength(1);
  });

  it('an Etsy "Partially Refunded" receipt whose refunds cover the item is a return (the 09-17 chain)', () => {
    const chain = {
      receipt_id: 4176386677,
      status: 'Partially Refunded',
      is_paid: true,
      transactions: [{ transaction_id: 1, listing_id: 1, quantity: 1, price: { amount: 191064, divisor: 100 } }],
      refunds: [{ amount: { amount: 203722, divisor: 100 } }],
    } as EtsyReceipt;
    const smallRefund = { ...chain, receipt_id: 5, refunds: [{ amount: { amount: 1500, divisor: 100 } }] } as EtsyReceipt;
    expect(selectReversedOrders('etsy', [chain, smallRefund])).toEqual([
      { channel: 'etsy', externalOrderId: '4176386677', status: 'refunded' },
    ]);
  });

  it('spots refunded / cancelled orders on both marketplaces', () => {
    expect(selectReversedOrders('ebay', orders)).toEqual([{ channel: 'ebay', externalOrderId: 'gone', status: 'refunded' }]);
    const receipts = [
      { receipt_id: 4176386677, status: 'Fully Refunded', is_paid: true },
      { receipt_id: 2, status: 'Canceled', is_paid: false },
      { receipt_id: 3, status: 'Completed', is_paid: true },
    ] as EtsyReceipt[];
    expect(selectReversedOrders('etsy', receipts)).toEqual([
      { channel: 'etsy', externalOrderId: '4176386677', status: 'refunded' },
      { channel: 'etsy', externalOrderId: '2', status: 'cancelled' },
    ]);
  });
});
