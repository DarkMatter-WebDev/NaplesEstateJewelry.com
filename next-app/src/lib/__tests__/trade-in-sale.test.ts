import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BUY_RECEIPT_PAYMENT_METHODS,
  blankBuyReceiptDraft,
  buyReceiptTrade,
  draftFromReceipt,
  normalizeBuyReceiptInput,
  paymentLabel,
  paymentsLine,
  sampleBuyReceipt,
} from '../buy-receipts';
import {
  IN_STORE_PAYMENT_METHODS,
  TRADE_IN_COLUMN,
  normalizeSalePayments,
  paidByLines,
  paymentMethodLabel,
  readSaleTradeIn,
  salePaymentReference,
  tradeInReceiptLine,
} from '../in-store-sale';
import { normalizeTradeInSaleInput, tradeInBalance, tradeInDescription, tradeInSaleTotals } from '../trade-in-sale';
import { buildPaperReceipt, type PaperReceiptOrder } from '../order-receipt-paper';
import { buildInvoiceEmailContent, type InvoiceEmailOrder } from '../order-invoice-email';

// Trade-in sale (owner, 2026-11-21, option C mockup 1 → "Yes, build it"):
// gold traded toward a purchase — one screen, one save, a buy receipt and a
// sale that name each other. These pin the money rules and the wording.
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

const now = new Date('2026-11-21T19:00:00Z');

function receipt(items: { description: string; amount: string }[], extra: Record<string, unknown> = {}) {
  return {
    ...blankBuyReceiptDraft(),
    sellerName: 'Maria Alvarez',
    sellerPhone: '(239) 555-0134',
    sellerEmail: 'maria@example.com',
    items: items.map((item) => ({ qty: '', ...item })),
    ...extra,
  };
}
const ring = { kind: 'unlisted', title: '18K diamond solitaire ring', metal: 'Gold', price: '2500' };
const chain = { kind: 'unlisted', title: '14K rope chain', metal: 'Gold', price: '1000' };

describe('trade-in sale: the money', () => {
  it('splits a trade into credit, what the customer pays and what is paid out', () => {
    expect(tradeInBalance(900, 2650)).toEqual({ credit: 900, customerPays: 1750, payout: 0 });
    expect(tradeInBalance(1400, 1060)).toEqual({ credit: 1060, customerPays: 0, payout: 340 });
    expect(tradeInBalance(1060, 1060)).toEqual({ credit: 1060, customerPays: 0, payout: 0 });
  });

  it('taxes the full price, like every pickup (owner pick 3 — until the accountant says otherwise)', () => {
    expect(tradeInSaleTotals(2500)).toEqual({ subtotal: 2500, shippingFee: 0, tax: 150, total: 2650 });
  });

  it('example A: $900 of gold toward a $2,500 ring — the customer pays $1,750 on Zettle', () => {
    const result = normalizeTradeInSaleInput({
      receipt: receipt([{ description: '14K scrap · 18.2 g', amount: '900' }]),
      sale: { items: [ring], paidBy: 'zettle', note: '' },
      emailCopy: true,
    }, now);
    if ('error' in result) throw new Error(result.error);
    const { value } = result;
    expect(value.balance).toEqual({ credit: 900, customerPays: 1750, payout: 0 });
    expect(value.receipt.payments).toEqual([{ method: 'trade_credit', reference: null, amount: 900 }]);
    expect(value.sale.collect).toEqual([{ method: 'zettle', amount: 1750 }]);
    expect(value.sale.total).toBe(2650);
    expect(value.sale.customer).toEqual({ name: 'Maria Alvarez', phone: '(239) 555-0134', email: 'maria@example.com' });
    expect(value.emailCopy).toBe(true);
  });

  it('example B: $1,400 of gold toward a $1,000 chain — the sale is covered, $340 is paid to the seller', () => {
    const result = normalizeTradeInSaleInput({
      receipt: receipt(
        [{ description: '14K scrap', amount: '900' }, { description: '14K Cuban bracelet', amount: '500' }],
        { payments: [{ method: 'cash', reference: '', amount: '' }] },
      ),
      sale: { items: [chain] },
    }, now);
    if ('error' in result) throw new Error(result.error);
    expect(result.value.balance).toEqual({ credit: 1060, customerPays: 0, payout: 340 });
    expect(result.value.receipt.payments).toEqual([
      { method: 'trade_credit', reference: null, amount: 1060 },
      { method: 'cash', reference: null, amount: 340 },
    ]);
    expect(result.value.sale.collect).toEqual([]);
    expect(result.value.tradeDescription).toBe('14K scrap; 14K Cuban bracelet');
  });

  it('a payout split across methods must add up to what is owed', () => {
    const base = {
      receipt: receipt([{ description: '14K scrap', amount: '1400' }], {
        payments: [{ method: 'cash', reference: '', amount: '200' }, { method: 'check', reference: '1042', amount: '100' }],
      }),
      sale: { items: [chain] },
    };
    expect(normalizeTradeInSaleInput(base, now)).toEqual({ error: 'The payments to the seller add up to $300.00 but $340.00 is owed.' });
    const fixed = { ...base, receipt: { ...base.receipt, payments: [{ method: 'cash', reference: '', amount: '240' }, { method: 'check', reference: '1042', amount: '100' }] } };
    const result = normalizeTradeInSaleInput(fixed, now);
    if ('error' in result) throw new Error(result.error);
    expect(result.value.receipt.payments.map((p) => [p.method, p.amount, p.reference])).toEqual([
      ['trade_credit', 1060, null], ['cash', 240, null], ['check', 100, '1042'],
    ]);
  });

  it('says what is missing, in the form\'s words', () => {
    expect(normalizeTradeInSaleInput({ receipt: receipt([{ description: 'Gold', amount: '1400' }]), sale: { items: [chain] } }, now))
      .toEqual({ error: 'Choose how the other $340.00 was paid to the seller.' });
    expect(normalizeTradeInSaleInput({ receipt: receipt([{ description: 'Gold', amount: '900' }], { sellerPhone: '' }), sale: { items: [ring], paidBy: 'zettle' } }, now))
      .toEqual({ error: "Enter the seller's phone — the sale needs a contact number." });
    expect(normalizeTradeInSaleInput({ receipt: receipt([{ description: 'Gold', amount: '900' }]), sale: { items: [] } }, now))
      .toEqual({ error: "What they're buying: add the item that sold." });
    // The customer's part cannot itself be paid "by trade-in".
    expect('error' in normalizeTradeInSaleInput({ receipt: receipt([{ description: 'Gold', amount: '900' }]), sale: { items: [ring], paidBy: 'trade_credit' } }, now)).toBe(true);
  });
});

describe('trade-in credit stays on the Trade-in screen', () => {
  it('is not offered on the plain forms', () => {
    expect(BUY_RECEIPT_PAYMENT_METHODS as readonly string[]).not.toContain('trade_credit');
    expect(IN_STORE_PAYMENT_METHODS as readonly string[]).not.toContain('trade_credit');
    expect(normalizeSalePayments({ paidBy: 'trade_credit' }, 100)).toEqual({ error: 'Pick how it was paid.' });
    const plain = normalizeBuyReceiptInput({ ...receipt([{ description: 'Gold', amount: '100' }]), payments: [{ method: 'trade_credit', reference: '', amount: '' }] }, now);
    expect(plain).toEqual({ error: 'Choose how the seller was paid.' });
  });

  it('a copy of a trade receipt is a plain receipt', () => {
    const row = { ...sampleBuyReceipt('2026-11-21T19:00:00Z'), payments: [{ method: 'trade_credit' as const, reference: 'NEJ-20261121-7KQ2M', amount: 150, order_id: 'o-1' }] };
    expect(buyReceiptTrade(row)).toEqual({ orderId: 'o-1', orderNumber: 'NEJ-20261121-7KQ2M', amount: 150 });
    expect(draftFromReceipt(row).payments).toEqual([{ method: '', reference: '', amount: '' }]);
    expect(buyReceiptTrade(sampleBuyReceipt('2026-11-21T19:00:00Z'))).toBeNull();
  });
});

describe('trade-in sale: what each paper says', () => {
  it('the buy receipt names the sale', () => {
    expect(paymentLabel('trade_credit', 'NEJ-20261121-7KQ2M')).toBe('Trade-in credit toward purchase NEJ-20261121-7KQ2M');
    expect(paymentLabel('trade_credit', 'NEJ-20261121-7KQ2M', 'es')).toBe('Crédito por intercambio para la compra NEJ-20261121-7KQ2M');
    expect(paymentsLine([
      { method: 'trade_credit', reference: 'NEJ-20261121-7KQ2M', amount: 1060 },
      { method: 'cash', reference: null, amount: 340 },
    ])).toBe('Trade-in credit toward purchase NEJ-20261121-7KQ2M $1,060.00 · Cash $340.00');
  });

  const credit = { method: 'trade_credit' as const, amount: 900, reference: 'BUY-00142' };
  const trade = { buy_receipt_id: 'r-1', receipt_number: 'BUY-00142', description: '14K scrap · 18.2 g', value: 900 };

  it('the sale names the buy receipt — split, and paid wholly by the trade', () => {
    expect(TRADE_IN_COLUMN).toBe('trade_in:payment_response->trade');
    expect(salePaymentReference('In store', 'split', [credit, { method: 'zettle', amount: 1750 }])).toBe('In store · Trade-in credit · BUY-00142 $900.00 + Card · Zettle $1,750.00');
    expect(paidByLines({ payment_method: 'in_store_split', split_payments: [credit, { method: 'zettle', amount: 1750 }] }))
      .toEqual(['In store · Trade-in credit · BUY-00142 $900.00', 'In store · Card · Zettle $1,750.00']);
    expect(paidByLines({ payment_method: 'in_store_trade_credit', split_payments: [{ ...credit, amount: 1060 }] })).toEqual(['In store · Trade-in credit · BUY-00142']);
    expect(paymentMethodLabel('in_store_trade_credit')).toBe('In store · Trade-in credit');
    expect(readSaleTradeIn(trade)).toEqual(trade);
    expect(readSaleTradeIn(null)).toBeNull();
    expect(tradeInReceiptLine(trade)).toBe('Your trade-in: 14K scrap · 18.2 g (receipt BUY-00142, $900.00).');
    expect(tradeInDescription([{ description: 'x'.repeat(200) }])).toHaveLength(158);
  });

  const order: PaperReceiptOrder = {
    order_number: 'NEJ-20261121-7KQ2M', customer_name: 'Maria Alvarez', customer_email: 'maria@example.com', customer_phone: '(239) 555-0134',
    subtotal: 2500, tax: 150, shipping_fee: 0, discount: 0, total: 2650,
    payment_status: 'paid', fulfillment_status: 'picked_up', payment_method: 'in_store_split', shipping_method: 'pickup', shipping_address: null,
    created_at: '2026-11-21T19:42:00Z', split_payments: [credit, { method: 'zettle', amount: 1750 }], trade_in: trade,
    order_items: [{ inventory_number: null, title_snapshot: '18K diamond solitaire ring', item_year_snapshot: null, metal_snapshot: 'Gold', purity_snapshot: '18K', gram_weight_snapshot: 3.1, price_snapshot: 2500, quantity: 1, discount: 0, image_snapshot: null }] as PaperReceiptOrder['order_items'],
  };

  it('the paper and the emailed receipt carry the trade-in line', () => {
    const { body } = buildPaperReceipt(order, { hoursLine: 'Mon–Sat 10am–4pm' });
    expect(body).toContain('In store · Trade-in credit · BUY-00142 $900.00<br>In store · Card · Zettle $1,750.00');
    expect(body).toContain('Your trade-in: 14K scrap · 18.2 g (receipt BUY-00142, $900.00).');
    const email = buildInvoiceEmailContent({ id: 'o1', ...order, order_status: 'completed' } as unknown as InvoiceEmailOrder, null);
    expect(email.note).toBe('Paid in full by Trade-in credit · BUY-00142 $900.00 and Card · Zettle $1,750.00 on November 21, 2026 — thank you. Your trade-in: 14K scrap · 18.2 g (receipt BUY-00142, $900.00).');
    const whole = buildInvoiceEmailContent({ id: 'o1', ...order, order_status: 'completed', payment_method: 'in_store_trade_credit', split_payments: [{ ...credit, amount: 2650 }] } as unknown as InvoiceEmailOrder, null);
    expect(whole.note).toContain('Paid in full by Trade-in credit · BUY-00142 on');
  });

  it('every reader of a sale receipt selects the trade alongside the parts', () => {
    for (const file of ['src/lib/order-receipt-paper-server.ts', 'src/lib/order-invoice-mailer.ts', 'src/app/[locale]/admin/orders/[id]/invoice/page.tsx', 'src/app/[locale]/admin/orders/[id]/page.tsx']) {
      expect(read(file), file).toContain('TRADE_IN_COLUMN');
    }
  });

  it('the route writes the receipt with the admin client and undoes it when the sale fails', () => {
    const route = read('src', 'app', 'api', 'admin', 'trade-in-sales', 'route.ts');
    expect(route).toContain(".from('buy_receipts')\n    .insert(");
    expect(route).not.toMatch(/service\s*\.from\('buy_receipts'\)/);
    expect(route.match(/await undoReceipt\(\)/g)?.length).toBe(2);
    expect(route).toContain('trade: tradeIn');
  });
});
