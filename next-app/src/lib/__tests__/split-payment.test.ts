import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SALE_PAYMENTS_MAX,
  SPLIT_PAYMENTS_COLUMN,
  formatSalePayments,
  inStorePaymentMethodValue,
  normalizeInStoreSaleInput,
  normalizeSalePayments,
  paidByLines,
  parseSalePaymentAmount,
  paymentMethodLabel,
  readSalePaymentParts,
  remotePaymentMethodValue,
  salePaymentReference,
  salePaymentsCollectPhrase,
  salePaymentsMismatch,
} from '../in-store-sale';
import { buildPaperReceipt, type PaperReceiptOrder } from '../order-receipt-paper';
import { buildInvoiceEmailContent, type InvoiceEmailOrder } from '../order-invoice-email';
import {
  newSalePayments,
  salePaymentLineAmounts,
  salePaymentParts,
  salePaymentsPayload,
  salePaymentsProblem,
  type SalePaymentsDraft,
} from '../../components/admin/instant-sale/SalePaymentsEditor';

// Split payment on Instant Sale (owner mockup 2026-11-16, decisions 1–4 all "yes"):
// $500 cash + the rest on Zettle, adding up to the total to the cent.

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

const customer = { firstName: 'Jane', lastName: 'Smith', phone: '(239) 555-0134', email: '' };
// $1,700 + 6% = $1,802.00 (the mockup's numbers).
const sale = { item: { kind: 'unlisted', title: '14K rope chain', metal: 'Gold', price: '1700' }, customer };

describe('normalizeSalePayments', () => {
  it('keeps the single method exactly as before (one part = the total)', () => {
    expect(normalizeSalePayments({ paidBy: 'zettle' }, 1802)).toEqual({ value: { paidBy: 'zettle', payments: [{ method: 'zettle', amount: 1802 }] } });
    expect(normalizeSalePayments({ paidBy: 'paypal' }, 1802)).toEqual({ error: 'Pick how it was paid.' });
  });

  it('records a split that adds up to the cent', () => {
    const result = normalizeSalePayments({ payments: [{ method: 'cash', amount: '$500' }, { method: 'zettle', amount: '1,302.00' }] }, 1802);
    expect(result).toEqual({ value: { paidBy: 'split', payments: [{ method: 'cash', amount: 500 }, { method: 'zettle', amount: 1302 }] } });
  });

  it('allows the same method twice (two cards on Zettle) and up to four payments', () => {
    const two = normalizeSalePayments({ payments: [{ method: 'zettle', amount: '901' }, { method: 'zettle', amount: '901' }] }, 1802);
    expect(two).toHaveProperty('value.paidBy', 'split');
    const four = normalizeSalePayments({ payments: [['cash', '2'], ['zelle', '0.01'], ['store_credit', '200'], ['zettle', '1599.99']].map(([method, amount]) => ({ method, amount })) }, 1802);
    expect(four).toHaveProperty('value.payments.length', 4);
    const five = normalizeSalePayments({ payments: Array.from({ length: SALE_PAYMENTS_MAX + 1 }, () => ({ method: 'cash', amount: '1' })) }, 5);
    expect(five).toEqual({ error: 'Up to 4 payments on one sale.' });
  });

  it('refuses a split that does not add up, saying by how much', () => {
    expect(normalizeSalePayments({ payments: [{ method: 'cash', amount: '500' }, { method: 'zettle', amount: '1200' }] }, 1802))
      .toEqual({ error: 'The payments add up to $1,700.00 — $102.00 short of the $1,802.00 total.' });
    expect(normalizeSalePayments({ payments: [{ method: 'cash', amount: '600' }, { method: 'zettle', amount: '1302' }] }, 1802))
      .toEqual({ error: 'The payments add up to $1,902.00 — $100.00 over the $1,802.00 total.' });
  });

  it('names the payment that is wrong', () => {
    expect(normalizeSalePayments({ payments: [{ method: 'cash', amount: '500' }, { method: 'bitcoin', amount: '1302' }] }, 1802)).toEqual({ error: 'Payment 2: pick how it was paid.' });
    expect(normalizeSalePayments({ payments: [{ method: 'cash', amount: '' }, { method: 'zettle', amount: '1302' }] }, 1802)).toEqual({ error: 'Payment 1: enter the amount, e.g. 500.' });
    expect(normalizeSalePayments({ payments: [{ method: 'cash', amount: '0' }, { method: 'zettle', amount: '1802' }] }, 1802)).toHaveProperty('error');
  });

  it('treats a one-line list as one method, still checked against the total', () => {
    expect(normalizeSalePayments({ payments: [{ method: 'venmo', amount: '1802' }] }, 1802)).toEqual({ value: { paidBy: 'venmo', payments: [{ method: 'venmo', amount: 1802 }] } });
    expect(normalizeSalePayments({ payments: [{ method: 'venmo', amount: '1800' }] }, 1802)).toHaveProperty('error');
  });

  it('parses amounts the way the owner types them', () => {
    expect(parseSalePaymentAmount('$1,302.50')).toBe(1302.5);
    for (const raw of ['', 'all', '-5', '0', '1.234', null]) expect(parseSalePaymentAmount(raw)).toBeNull();
    expect(salePaymentsMismatch(1802, 1802)).toBeNull();
    expect(salePaymentsMismatch(0.1 + 0.2 + 1801.7, 1802)).toBeNull();
  });
});

describe('normalizeInStoreSaleInput · split payment', () => {
  it('checks the split against the total the server computes (tax included)', () => {
    const ok = normalizeInStoreSaleInput({ ...sale, payments: [{ method: 'cash', amount: '500' }, { method: 'zettle', amount: '1302' }] });
    expect('value' in ok && ok.value).toMatchObject({ total: 1802, paidBy: 'split', payments: [{ method: 'cash', amount: 500 }, { method: 'zettle', amount: 1302 }] });
    // Forgot the tax: refused.
    expect(normalizeInStoreSaleInput({ ...sale, payments: [{ method: 'cash', amount: '500' }, { method: 'zettle', amount: '1200' }] }))
      .toEqual({ error: 'The payments add up to $1,700.00 — $102.00 short of the $1,802.00 total.' });
  });

  it('still records a single method with one part for the whole total', () => {
    const one = normalizeInStoreSaleInput({ ...sale, paidBy: 'cash' });
    expect('value' in one && one.value).toMatchObject({ paidBy: 'cash', payments: [{ method: 'cash', amount: 1802 }] });
  });
});

describe('split payment values, labels and receipt lines', () => {
  const parts = [{ method: 'cash' as const, amount: 500 }, { method: 'zettle' as const, amount: 1302 }];

  it('stores in_store_split / remote_split and labels them', () => {
    expect(inStorePaymentMethodValue('split')).toBe('in_store_split');
    expect(remotePaymentMethodValue('split')).toBe('remote_split');
    expect(paymentMethodLabel('in_store_split')).toBe('In store · Split');
    expect(paymentMethodLabel('remote_split')).toBe('Invoice · Split');
  });

  it('writes a readable reference and the counter hint', () => {
    expect(formatSalePayments(parts)).toBe('Cash $500.00 + Card · Zettle $1,302.00');
    expect(salePaymentReference('In store', 'split', parts)).toBe('In store · Cash $500.00 + Card · Zettle $1,302.00');
    expect(salePaymentReference('Invoice', 'zelle', [{ method: 'zelle', amount: 10 }])).toBe('Invoice · Zelle');
    expect(salePaymentsCollectPhrase(parts)).toBe('$1,302.00 on Zettle and $500.00 in cash');
    expect(salePaymentsCollectPhrase([...parts, { method: 'store_credit', amount: 50 }])).toBe('$1,302.00 on Zettle, $500.00 in cash and $50.00 in store credit');
  });

  it('reads the parts back for receipts, and only for a split order', () => {
    expect(SPLIT_PAYMENTS_COLUMN).toBe('split_payments:payment_response->payments');
    expect(paidByLines({ payment_method: 'in_store_split', split_payments: parts })).toEqual(['In store · Cash $500.00', 'In store · Card · Zettle $1,302.00']);
    expect(paidByLines({ payment_method: 'remote_split', split_payments: parts })).toEqual(['Invoice · Cash $500.00', 'Invoice · Card · Zettle $1,302.00']);
    expect(paidByLines({ payment_method: 'in_store_zettle', split_payments: parts })).toEqual(['In store · Card · Zettle']);
    expect(paidByLines({ payment_method: 'in_store_split', split_payments: null })).toEqual(['In store · Split']);
    expect(paidByLines({ payment_method: 'paypal' })).toEqual(['PayPal']);
    expect(readSalePaymentParts([{ method: 'cash', amount: 5 }])).toBeNull();
    expect(readSalePaymentParts([{ method: 'cash', amount: 5 }, { method: 'nope', amount: 5 }])).toBeNull();
  });

  const order: PaperReceiptOrder = {
    order_number: 'NEJ-20261116-SPL1T', customer_name: 'Jane Smith', customer_email: null, customer_phone: '(239) 555-0134',
    subtotal: 1700, tax: 102, shipping_fee: 0, discount: 0, total: 1802,
    payment_status: 'paid', fulfillment_status: 'picked_up', payment_method: 'in_store_split', shipping_method: 'pickup', shipping_address: null,
    created_at: '2026-11-16T19:42:00Z', split_payments: parts,
    order_items: [{ inventory_number: null, title_snapshot: '14K rope chain', item_year_snapshot: null, metal_snapshot: 'Gold', purity_snapshot: '14K', gram_weight_snapshot: 18.4, price_snapshot: 1700, quantity: 1, discount: 0, image_snapshot: null }] as PaperReceiptOrder['order_items'],
  };

  it('prints one "Paid by" line per payment on the paper receipt', () => {
    const { body } = buildPaperReceipt(order, { hoursLine: 'Mon–Sat 10am–4pm' });
    expect(body).toContain('<div class="lab">Paid by</div>In store · Cash $500.00<br>In store · Card · Zettle $1,302.00</div>');
  });

  it('names each payment in the emailed receipt', () => {
    const email = buildInvoiceEmailContent({ id: 'o1', ...order, order_status: 'completed' } as unknown as InvoiceEmailOrder, null, { pickupHours: 'Mon–Sat' });
    expect(email.note).toBe('Paid in full by Cash $500.00 and Card · Zettle $1,302.00 on November 16, 2026 — thank you.');
    const three = buildInvoiceEmailContent({ id: 'o1', ...order, order_status: 'completed', split_payments: [...parts, { method: 'venmo', amount: 1 }] } as unknown as InvoiceEmailOrder, null);
    expect(three.note).toContain('Paid in full by Cash $500.00, Card · Zettle $1,302.00 and Venmo $1.00 on');
  });

  it('every reader that prints "Paid by" selects the parts', () => {
    for (const file of ['src/lib/order-receipt-paper-server.ts', 'src/lib/order-invoice-mailer.ts', 'src/app/[locale]/admin/orders/[id]/invoice/page.tsx', 'src/app/[locale]/admin/orders/[id]/page.tsx']) {
      expect(read(file), file).toContain('SPLIT_PAYMENTS_COLUMN');
    }
    // The recorder saves the parts where SPLIT_PAYMENTS_COLUMN reads them.
    expect(read('src/lib/instant-sale-server.ts')).toContain("...(input.paidBy === 'split' ? { payments: input.payments } : {})");
  });
});

describe('the form side (SalePaymentsEditor helpers)', () => {
  const draft = (lines: Array<[string, string, boolean?]>): SalePaymentsDraft => ({
    paidBy: 'zettle',
    split: true,
    lines: lines.map(([method, amount, typed], index) => ({ key: `k${index}`, method: method as SalePaymentsDraft['paidBy'], amount, typed: typed ?? amount !== '' })),
  });

  it('fills the last line with what is left until it is typed in (decision 1)', () => {
    const d = draft([['cash', '500'], ['zettle', '', false]]);
    expect(salePaymentLineAmounts(d, 1802)).toEqual([500, 1302]);
    expect(salePaymentParts(d, 1802)).toEqual([{ method: 'cash', amount: 500 }, { method: 'zettle', amount: 1302 }]);
    expect(salePaymentsProblem(d, 1802)).toBeNull();
    expect(salePaymentsPayload(d, 1802)).toEqual({ payments: [{ method: 'cash', amount: 500 }, { method: 'zettle', amount: 1302 }] });
  });

  it('a typed last line stops filling itself and must add up', () => {
    const d = draft([['cash', '500'], ['zettle', '1200']]);
    expect(salePaymentsProblem(d, 1802)).toBe('The payments add up to $1,700.00 — $102.00 short of the $1,802.00 total.');
  });

  it('asks for a blank amount, and nothing is left for the last line when the others cover it', () => {
    expect(salePaymentsProblem(draft([['cash', ''], ['zettle', '', false]]), 1802)).toBe('Payment 1: enter the amount, e.g. 500.');
    expect(salePaymentLineAmounts(draft([['cash', '1802'], ['zettle', '', false]]), 1802)).toEqual([1802, null]);
  });

  it('one method sends paidBy as before', () => {
    expect(salePaymentsPayload(newSalePayments('cash'), 1802)).toEqual({ paidBy: 'cash' });
    expect(salePaymentsProblem(newSalePayments('cash'), 1802)).toBeNull();
  });
});
