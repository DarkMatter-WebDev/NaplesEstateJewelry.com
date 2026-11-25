// Admin → Instant Sale → Trade-in sale (owner, 2026-11-21, option C mockup 1):
// a customer trades gold toward a purchase. ONE screen, ONE save, TWO records
// that name each other:
// - the BUY RECEIPT (BUY-…) — the Florida secondhand-dealer record of the gold,
//   exactly the receipt the Buy Receipts form makes; its first "Paid by" line
//   is the trade-in credit, carrying the sale's order number;
// - the SALE (NEJ-…) — recorded like an In-store sale; its first payment is
//   the trade-in credit, carrying the buy receipt's number.
//
// Pure, testable, safe to import from client components: the screen and the
// route (`app/api/admin/trade-in-sales`) check the same rules with the same
// words. Owner decisions on the mockup ("Yes, build it", 2026-11-21):
// - pickup only (no shipping, no Remote version);
// - Florida tax on the FULL price, as every pickup today — the trade does not
//   come off first until the owner's accountant says otherwise (one place:
//   `tradeInSaleTotals`);
// - gold worth MORE than the purchase: the sale is paid wholly by the trade
//   and the rest is paid to the seller on the buy receipt;
// - no drafts in the first version.
import { round2 } from '@/lib/checkout-pricing';
import {
  BUY_RECEIPT_MAX_PAYMENTS,
  BUY_RECEIPT_PAYMENT_METHODS,
  BUY_RECEIPT_TRADE_CREDIT,
  normalizeBuyReceiptInput,
  parseBuyAmount,
  type BuyReceiptInput,
} from '@/lib/buy-receipts';
import {
  IN_STORE_NOTE_MAX,
  inStoreTotals,
  normalizeSaleItems,
  normalizeSalePayments,
  saleSubtotal,
  saleTaxFreeSubtotal,
  type InStoreItem,
  type SalePaymentPart,
} from '@/lib/in-store-sale';
import { formatCurrency } from '@/types/sales';

/** How the trade settles: the credit put toward the sale, what the customer still pays, what the shop pays out. */
export type TradeInBalance = { credit: number; customerPays: number; payout: number };

export function tradeInBalance(tradeValue: number, saleTotal: number): TradeInBalance {
  const credit = round2(Math.max(0, Math.min(tradeValue, saleTotal)));
  return { credit, customerPays: round2(saleTotal - credit), payout: round2(tradeValue - credit) };
}

/**
 * The sale's totals. Tax is 6% on the full price (owner pick 3, 2026-11-21):
 * if the accountant confirms that Florida taxes only the difference on a
 * trade-in, this is the one place that changes.
 */
export function tradeInSaleTotals(subtotal: number, taxFree = 0) {
  // `taxFree` (2026-11-24): the bullion items on the sale, never taxed.
  return inStoreTotals(subtotal, { chargesTax: true, taxFree });
}

/** "14K yellow gold scrap · 18.2 g; 14K Cuban bracelet · 11 g" — the receipt's lines, for the sale's receipt. */
export function tradeInDescription(items: readonly { description: string }[]): string {
  const text = items.map((item) => item.description.trim()).filter(Boolean).join('; ');
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}…` : text;
}

export type TradeInSaleInput = {
  /** The buy receipt, ready to store. `payments[0]` is the trade-in credit (its reference is filled in once the sale exists). */
  receipt: BuyReceiptInput;
  sale: {
    items: InStoreItem[];
    customer: { name: string; phone: string; email: string | null };
    /** What the customer paid on top of the credit — empty when the trade covers the sale. */
    collect: SalePaymentPart[];
    note: string | null;
    subtotal: number;
    shippingFee: number;
    tax: number;
    total: number;
    /** The bullion part of the subtotal, left out of the tax (2026-11-24). */
    taxFree: number;
    taxable: number;
  };
  balance: TradeInBalance;
  tradeDescription: string;
  /** One "Email copy" box (on the paper): both receipts go to the seller's email. */
  emailCopy: boolean;
  mailingList: boolean;
};

type PayoutRow = { method: string; reference: string; amount: string };

function payoutRows(raw: unknown): PayoutRow[] {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((row) => {
      const source = (row ?? {}) as Record<string, unknown>;
      return { method: String(source.method ?? '').trim(), reference: String(source.reference ?? ''), amount: String(source.amount ?? '') };
    })
    .filter((row) => row.method || row.amount.trim());
}

/**
 * The paid-to-seller rows when the gold is worth more than the purchase: what
 * the paper's "Paid by" lines say, checked against the payout. One row takes
 * the whole payout; two or more each carry an amount that must add up to it.
 */
function receiptPayments(
  raw: unknown,
  balance: TradeInBalance,
): { value: { method: string; reference: string; amount: string }[] } | { error: string } {
  const trade = { method: BUY_RECEIPT_TRADE_CREDIT, reference: '', amount: balance.credit.toFixed(2) };
  if (balance.payout <= 0) return { value: [trade] };
  const rows = payoutRows(raw);
  if (rows.length === 0) return { error: `Choose how the other ${formatCurrency(balance.payout)} was paid to the seller.` };
  if (rows.length > BUY_RECEIPT_MAX_PAYMENTS - 1) return { error: `The seller can be paid in up to ${BUY_RECEIPT_MAX_PAYMENTS - 1} ways besides the trade-in.` };
  for (const row of rows) {
    if (!(BUY_RECEIPT_PAYMENT_METHODS as readonly string[]).includes(row.method)) return { error: `Choose how the other ${formatCurrency(balance.payout)} was paid to the seller.` };
  }
  if (rows.length === 1) return { value: [trade, { ...rows[0], amount: balance.payout.toFixed(2) }] };
  let sum = 0;
  for (const row of rows) {
    const amount = parseBuyAmount(row.amount);
    if (amount == null) return { error: 'Enter an amount for each payment to the seller.' };
    sum = round2(sum + amount);
  }
  if (sum !== balance.payout) {
    return { error: `The payments to the seller add up to ${formatCurrency(sum)} but ${formatCurrency(balance.payout)} is owed.` };
  }
  return { value: [trade, ...rows] };
}

/**
 * The one validator for a trade-in sale. Body:
 * `{ receipt: <the buy-receipt form>, sale: { items, paidBy | payments, note }, emailCopy, mailingList }`.
 * The receipt's `payments` are only the paid-to-seller rows (used when the gold
 * is worth more); the sale's `paidBy` / `payments` are only what the customer
 * pays on top of the credit (used when the purchase is worth more).
 */
export function normalizeTradeInSaleInput(body: unknown, now: Date = new Date()): { value: TradeInSaleInput } | { error: string } {
  const source = (body ?? {}) as Record<string, unknown>;
  const receiptSource = (source.receipt ?? {}) as Record<string, unknown>;
  const saleSource = (source.sale ?? {}) as Record<string, unknown>;

  // The gold first — what it is worth decides everything else. Checked with the
  // receipt's own rules; the placeholder payment stands for "paid by the trade".
  const gold = normalizeBuyReceiptInput(
    { ...receiptSource, payments: [{ method: BUY_RECEIPT_TRADE_CREDIT, reference: '', amount: '' }] },
    now,
    { tradeCredit: true },
  );
  if ('error' in gold) return gold;

  const items = normalizeSaleItems(saleSource);
  if ('error' in items) return { error: `What they're buying: ${items.error.charAt(0).toLowerCase()}${items.error.slice(1)}` };
  const subtotal = saleSubtotal(items.value);
  const totals = tradeInSaleTotals(subtotal, saleTaxFreeSubtotal(items.value));
  const balance = tradeInBalance(gold.value.total, totals.total);

  const payments = receiptPayments(receiptSource.payments, balance);
  if ('error' in payments) return payments;
  const receipt = normalizeBuyReceiptInput({ ...receiptSource, payments: payments.value }, now, { tradeCredit: true });
  if ('error' in receipt) return receipt;

  // The sale's customer is the seller on the receipt — typed once.
  if (!receipt.value.sellerPhone) return { error: "Enter the seller's phone — the sale needs a contact number." };

  let collect: SalePaymentPart[] = [];
  if (balance.customerPays > 0) {
    const paid = normalizeSalePayments(saleSource, balance.customerPays);
    if ('error' in paid) return paid;
    collect = paid.value.payments;
  }

  const noteText = String(saleSource.note ?? '').replace(/\s+/g, ' ').trim();
  const email = receipt.value.sellerEmail;
  return {
    value: {
      receipt: receipt.value,
      sale: {
        items: items.value,
        customer: { name: receipt.value.sellerName, phone: receipt.value.sellerPhone, email },
        collect,
        note: noteText ? noteText.slice(0, IN_STORE_NOTE_MAX) : null,
        ...totals,
      },
      balance,
      tradeDescription: tradeInDescription(receipt.value.items),
      emailCopy: Boolean(email) && source.emailCopy === true,
      mailingList: Boolean(email) && source.mailingList === true,
    },
  };
}
