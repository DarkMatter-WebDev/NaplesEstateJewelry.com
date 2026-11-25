// Admin → In-Store Sale: the owner's form → a validated sale (pure, testable).
//
// Why (2026-09-16): a sale made in the showroom used to mean "create the item,
// then run checkout" — minutes of typing while the customer waits. The card is
// taken on PayPal Zettle (card-present: cheaper, chip/tap fraud protection);
// this page only RECORDS the sale: one order row like a web sale, the item
// marked sold, the receipt emailed. The money never touches the site.
//
// Two item modes:
// - a LISTED item (an inventory number / title match): the product's row is
//   sold through the same `capture_paypal_order` path a web sale uses, so its
//   eBay/Etsy listings end and Deep Field mirrors the flip exactly as today;
// - NOT LISTED (never on the site): the order line carries the description and
//   price with no product row at all. No hidden product is created — nothing
//   can leak into the shop, the feed or the marketplaces, and there is no fake
//   inventory number to explain later.
//
// Pickup or ship (owner, 2026-10-20): a showroom sale is usually carried out
// the door (pickup, the default), but sometimes it is shipped to the customer
// afterwards. A shipped sale is stored exactly like a shipped web order:
// `shipping_method 'shipping'`, the address in `shipping_address`, the fee in
// `shipping_fee`, fulfillment left `pending`. It then goes through
// Orders → Mark Shipped + tracking like any other order.
//
// Instant Sale (owner, 2026-10-21): a sale carries ONE OR MORE items, each
// listed or not, each with an optional photo taken at the counter (stored in
// the product-images bucket, kept on the order line as `image_snapshot`). The
// same item rules serve the Remote sale (`lib/remote-sale.ts`), which emails
// an invoice instead of recording a payment.
import { calculateFlSalesTax, isFloridaState, round2 } from '@/lib/checkout-pricing';
import { getCheckoutShippingFee } from '@/lib/checkout-shipping';
import { normalizePersonName } from '@/lib/person-name';
import { normalizePhoneNumber } from '@/lib/phone';
import { PRODUCT_IMAGES_BUCKET, PRODUCT_IMAGES_PREFIX } from '@/lib/product-image-storage';
import { validateUsShippingAddress } from '@/lib/us-address';
import { normalizeTaxExemptSaleInput, type TaxExemptSaleChoice } from '@/lib/tax-exempt';

// Cash App, Venmo and store credit added 2026-10-20 (owner). Store credit is
// recorded as paid like the rest: the credit was issued earlier, outside the site.
export const IN_STORE_PAYMENT_METHODS = ['zettle', 'cash', 'zelle', 'check', 'cashapp', 'venmo', 'store_credit'] as const;
export type InStorePaymentMethod = (typeof IN_STORE_PAYMENT_METHODS)[number];
/**
 * Every method a recorded sale can carry: the form's list above, plus the
 * Trade-in sale's `trade_credit` (owner, 2026-11-21) — gold bought on a buy
 * receipt at the same counter, put toward this sale. Never offered on the
 * In-store or Remote forms (they list `IN_STORE_PAYMENT_METHODS`, and
 * `normalizeSalePayments` accepts only those); only `lib/trade-in-sale.ts` writes it.
 */
export type SalePaymentMethod = InStorePaymentMethod | 'trade_credit';
export const SALE_TRADE_CREDIT = 'trade_credit' as const;

export const IN_STORE_PAYMENT_LABELS: Record<SalePaymentMethod, string> = {
  zettle: 'Card · Zettle',
  cash: 'Cash',
  zelle: 'Zelle',
  check: 'Check',
  cashapp: 'Cash App',
  venmo: 'Venmo',
  store_credit: 'Store credit',
  trade_credit: 'Trade-in credit',
};

/**
 * How a sale was paid: one method, or `'split'` — two or more payments
 * (owner, 2026-11-16: "record multiple payment methods"), e.g. $500 cash +
 * the rest on Zettle. A split is stored as `payment_method in_store_split`
 * (or `remote_split`) with the parts in `orders.payment_response.payments`
 * and a readable `payment_reference`. No new column.
 */
export type SalePaidBy = SalePaymentMethod | 'split';

/** orders.payment_method value for an in-store sale, e.g. `in_store_zettle` / `in_store_split`. */
export function inStorePaymentMethodValue(method: SalePaidBy): string {
  return `in_store_${method}`;
}

/** Human label for ANY orders.payment_method value (PayPal, manual, in-store). */
export function paymentMethodLabel(value: string | null | undefined): string {
  if (!value) return '-';
  if (value === 'paypal') return 'PayPal';
  if (value === 'manual') return 'Manual';
  // A remote sale's invoice before it is paid (paid online it becomes 'paypal').
  if (value === 'invoice') return 'Invoice';
  const inStore = value.match(/^(in_store|remote)_(\w+)$/);
  if (inStore) {
    const method = inStore[2];
    const name = method === 'split' ? 'Split' : IN_STORE_PAYMENT_LABELS[method as SalePaymentMethod] ?? method;
    return `${inStore[1] === 'remote' ? 'Invoice' : 'In store'} · ${name}`;
  }
  return value;
}

/** orders.payment_method for a remote sale's invoice paid outside the site, e.g. `remote_zelle` / `remote_split`. */
export function remotePaymentMethodValue(method: SalePaidBy): string {
  return `remote_${method}`;
}

// ---- Split payment (owner, 2026-11-16) -----------------------------------

/** Payments on one sale (owner pick 2026-11-16). */
export const SALE_PAYMENTS_MAX = 4;
/**
 * One payment of a split. The same method may appear twice (two cards on Zettle).
 * `reference`: only on a trade-in credit — the buy receipt's number (BUY-00142).
 */
export type SalePaymentPart = { method: SalePaymentMethod; amount: number; reference?: string | null };

/** "Card · Zettle", or for a trade-in credit "Trade-in credit · BUY-00142". */
export function salePaymentPartLabel(part: Pick<SalePaymentPart, 'method' | 'reference'>): string {
  const label = IN_STORE_PAYMENT_LABELS[part.method] ?? part.method;
  return part.method === SALE_TRADE_CREDIT && part.reference ? `${label} · ${part.reference}` : label;
}

const PAYMENT_AMOUNT_MAX = 10_000_000;
const cents = (value: number) => Math.round(value * 100);

/** A typed payment amount: "$500", "1,302.00" → 500 / 1302; blank, zero or words → null. */
export function parseSalePaymentAmount(raw: unknown): number | null {
  const text = String(raw ?? '').replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0 || value > PAYMENT_AMOUNT_MAX) return null;
  return round2(value);
}

function money(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "The payments add up to $1,700.00 — $102.00 short of the $1,802.00 total." — one wording for the form and the server; null when it adds up. */
export function salePaymentsMismatch(sum: number, total: number): string | null {
  const gap = round2(total - sum);
  if (cents(gap) === 0) return null;
  return `The payments add up to ${money(sum)} — ${money(Math.abs(gap))} ${gap > 0 ? 'short of' : 'over'} the ${money(total)} total.`;
}

/**
 * How the sale was paid, checked against the total the SERVER computed:
 * `payments: [{ method, amount }, …]` (a split — must add up to the cent) or
 * the single `paidBy` the form always sent. A one-line `payments` list is a
 * single method. Every sale comes back with its parts (one part = the total).
 */
export function normalizeSalePayments(
  body: unknown,
  total: number,
): { value: { paidBy: SalePaidBy; payments: SalePaymentPart[] } } | { error: string } {
  const source = (body ?? {}) as Record<string, unknown>;
  if (Array.isArray(source.payments) && source.payments.length > 0) {
    const list = source.payments as unknown[];
    if (list.length > SALE_PAYMENTS_MAX) return { error: `Up to ${SALE_PAYMENTS_MAX} payments on one sale.` };
    const parts: SalePaymentPart[] = [];
    for (let index = 0; index < list.length; index += 1) {
      const row = (list[index] ?? {}) as Record<string, unknown>;
      const prefix = list.length > 1 ? `Payment ${index + 1}: ` : '';
      const method = String(row.method ?? '') as InStorePaymentMethod;
      if (!IN_STORE_PAYMENT_METHODS.includes(method)) return { error: `${prefix}${prefix ? 'pick' : 'Pick'} how it was paid.` };
      const amount = parseSalePaymentAmount(row.amount);
      if (amount == null) return { error: `${prefix}${prefix ? 'enter' : 'Enter'} the amount, e.g. 500.` };
      parts.push({ method, amount });
    }
    const mismatch = salePaymentsMismatch(round2(parts.reduce((sum, part) => sum + part.amount, 0)), total);
    if (mismatch) return { error: mismatch };
    return { value: { paidBy: parts.length > 1 ? 'split' : parts[0].method, payments: parts } };
  }
  const paidBy = String(source.paidBy ?? '') as InStorePaymentMethod;
  if (!IN_STORE_PAYMENT_METHODS.includes(paidBy)) return { error: 'Pick how it was paid.' };
  return { value: { paidBy, payments: [{ method: paidBy, amount: round2(total) }] } };
}

/** "Cash $500.00 + Card · Zettle $1,302.00". */
export function formatSalePayments(parts: SalePaymentPart[]): string {
  return parts.map((part) => `${salePaymentPartLabel(part)} ${money(part.amount)}`).join(' + ');
}

/** orders.payment_reference: "In store · Cash" or "In store · Cash $500.00 + Card · Zettle $1,302.00". */
export function salePaymentReference(prefix: 'In store' | 'Invoice', paidBy: SalePaidBy, parts: SalePaymentPart[]): string {
  if (paidBy === 'split') return `${prefix} · ${formatSalePayments(parts)}`;
  return `${prefix} · ${parts[0] ? salePaymentPartLabel(parts[0]) : IN_STORE_PAYMENT_LABELS[paidBy]}`;
}

const COLLECT_PHRASE: Record<SalePaymentMethod, string> = {
  zettle: 'on Zettle',
  cash: 'in cash',
  zelle: 'by Zelle',
  check: 'by check',
  cashapp: 'by Cash App',
  venmo: 'by Venmo',
  store_credit: 'in store credit',
  trade_credit: 'in trade-in credit',
};

/** "$1,302.00 on Zettle and $500.00 in cash" — the card first, as it is the one still to run. */
export function salePaymentsCollectPhrase(parts: SalePaymentPart[]): string {
  const ordered = [...parts].sort((a, b) => Number(b.method === 'zettle') - Number(a.method === 'zettle'));
  const phrases = ordered.map((part) => `${money(part.amount)} ${COLLECT_PHRASE[part.method]}`);
  return phrases.length > 1 ? `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}` : phrases[0] ?? '';
}

/**
 * The parts saved on an order (`payment_response.payments`), or null when they
 * are not readable. A split has two or more; a sale paid wholly by trade-in
 * credit keeps its one part (`minParts: 1`) for the receipt number it carries.
 */
export function readSalePaymentParts(value: unknown, minParts = 2): SalePaymentPart[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length < minParts) return null;
  const parts: SalePaymentPart[] = [];
  for (const row of value) {
    const source = (row ?? {}) as Record<string, unknown>;
    const method = String(source.method ?? '') as SalePaymentMethod;
    const amount = Number(source.amount);
    const known = (IN_STORE_PAYMENT_METHODS as readonly string[]).includes(method) || method === SALE_TRADE_CREDIT;
    if (!known || !Number.isFinite(amount) || amount <= 0) return null;
    const reference = method === SALE_TRADE_CREDIT && typeof source.reference === 'string' && source.reference.trim()
      ? source.reference.trim().slice(0, 30)
      : null;
    parts.push(reference ? { method, amount: round2(amount), reference } : { method, amount: round2(amount) });
  }
  return parts;
}

/**
 * Select alias for the parts: `payment_response->payments` only, never the
 * whole response (on a web order that is PayPal's full capture reply).
 */
export const SPLIT_PAYMENTS_COLUMN = 'split_payments:payment_response->payments';

/**
 * The "Paid by" lines for a receipt: one line per payment on a split
 * ("In store · Cash $500.00", "In store · Card · Zettle $1,302.00"), otherwise
 * the single label. `split_payments` is `SPLIT_PAYMENTS_COLUMN`'s value.
 */
export function paidByLines(order: { payment_method?: string | null; split_payments?: unknown }): string[] {
  const match = /^(in_store|remote)_(split|trade_credit)$/.exec(String(order.payment_method ?? ''));
  const parts = match ? readSalePaymentParts(order.split_payments, match[2] === 'split' ? 2 : 1) : null;
  if (!match || !parts) return [paymentMethodLabel(order.payment_method)];
  const prefix = match[1] === 'remote' ? 'Invoice' : 'In store';
  // Paid wholly by a trade-in: one line naming the buy receipt, no amount (it is the total).
  if (match[2] === 'trade_credit') return [`${prefix} · ${salePaymentPartLabel(parts[0])}`];
  return parts.map((part) => `${prefix} · ${salePaymentPartLabel(part)} ${money(part.amount)}`);
}

// ---- Trade-in sale (owner, 2026-11-21) ------------------------------------

/**
 * What the customer traded in, kept on the sale as `payment_response.trade`
 * so its receipt can say it. Select it with `TRADE_IN_COLUMN` (never the whole
 * response, like `SPLIT_PAYMENTS_COLUMN`).
 */
export type SaleTradeIn = { buy_receipt_id: string; receipt_number: string; description: string; value: number };
export const TRADE_IN_COLUMN = 'trade_in:payment_response->trade';

export function readSaleTradeIn(value: unknown): SaleTradeIn | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const receiptNumber = typeof source.receipt_number === 'string' ? source.receipt_number : '';
  const id = typeof source.buy_receipt_id === 'string' ? source.buy_receipt_id : '';
  const amount = Number(source.value);
  if (!receiptNumber || !id || !Number.isFinite(amount)) return null;
  return { buy_receipt_id: id, receipt_number: receiptNumber, description: String(source.description ?? ''), value: round2(amount) };
}

/** "Your trade-in: 14K yellow gold scrap · 18.2 g (receipt BUY-00142, $900.00)." — on the paper and the emailed receipt. */
export function tradeInReceiptLine(trade: SaleTradeIn): string {
  const what = trade.description.trim();
  return `Your trade-in: ${what ? `${what} ` : ''}(receipt ${trade.receipt_number}, ${money(trade.value)}).`;
}

// Platinum added 2026-11-24 (owner pick 4): platinum bullion is tax-free too.
export const IN_STORE_METALS = ['Gold', 'Silver', 'Platinum', 'Other'] as const;
export type InStoreMetal = (typeof IN_STORE_METALS)[number];

export const IN_STORE_TITLE_MAX = 120;
export const IN_STORE_NOTE_MAX = 300;
export const IN_STORE_PRICE_MAX = 250_000;
/** Items on one sale — a counter of pieces, not a cart; past this it is two sales. */
export const SALE_ITEMS_MAX = 20;

/**
 * `photoUrl`: a photo taken for THIS sale. Null = the listing's own photo (listed) or none (unlisted).
 * `bullion` (owner, 2026-11-24): "Bullion — no sales tax" was ticked, so this
 * item is left out of the Florida tax (see `inStoreTotals`). Absent = false.
 */
export type InStoreListedItem = { kind: 'listed'; productId: string; price: number; photoUrl: string | null; bullion?: boolean };
export type InStoreUnlistedItem = {
  kind: 'unlisted';
  title: string;
  metal: InStoreMetal;
  price: number;
  gramWeight: number | null;
  purity: string | null;
  photoUrl: string | null;
  bullion?: boolean;
};
export type InStoreItem = InStoreListedItem | InStoreUnlistedItem;

const SALE_PHOTO_MARKER = `/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/${PRODUCT_IMAGES_PREFIX}/`;

/**
 * A sale photo is the public URL `/api/admin/product-images` returned — the
 * site's own bucket and nothing else, because it is printed into the
 * customer's email and the Storage clean-up keeps only what it can recognise.
 */
export function isSalePhotoUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https:\/\/[^\s"'<>]+$/.test(value) && value.includes(SALE_PHOTO_MARKER);
}

// ---- Pickup or ship -------------------------------------------------------

/**
 * The shipping charge on a shipped in-store sale (owner picks 2026-10-20):
 * the website's own fees, no charge, or an amount typed at the counter.
 */
export const IN_STORE_SHIPPING_CHOICES = ['insured', 'express', 'none', 'custom'] as const;
export type InStoreShippingChoice = (typeof IN_STORE_SHIPPING_CHOICES)[number];

export const IN_STORE_SHIPPING_LABELS: Record<InStoreShippingChoice, string> = {
  insured: 'Insured shipping',
  express: 'Express overnight',
  none: 'No charge',
  custom: 'Custom amount',
};

export const IN_STORE_SHIPPING_FEE_MAX = 1000;

export type InStoreAddress = { line1: string; line2: string | null; city: string; state: string; postalCode: string };

/** A ship address is null only on a remote sale, where the customer types it when paying. */
export type InStoreDelivery =
  | { method: 'pickup'; address: InStoreAddress | null }
  | { method: 'ship'; address: InStoreAddress | null; shipping: InStoreShippingChoice; shippingFee: number };

/**
 * The website's fee for a table choice at this item price (`lib/checkout-shipping.ts`),
 * 0 for "No charge", and null for "Custom" (typed) or for a service not
 * offered at this price (Express at $5,000+, the USPS insurance cap, as online).
 */
export function inStoreTableShippingFee(choice: InStoreShippingChoice, price: number): number | null {
  if (choice === 'none') return 0;
  if (choice === 'insured') return getCheckoutShippingFee('priority-insured', price);
  if (choice === 'express') return getCheckoutShippingFee('express-overnight-insured', price);
  return null;
}

/**
 * Florida tax applies to a pickup (the sale completes in the store) and to a
 * shipment to a Florida address. A shipment out of state owes none. This is
 * the same rule as web checkout (`chargesFlSalesTax`) and the admin "Create
 * order" form (owner pick 2026-10-20). The state is the one typed on the form.
 */
export function inStoreChargesTax(method: 'pickup' | 'ship', shipState: string | null | undefined): boolean {
  return method === 'pickup' || isFloridaState(shipState);
}

export type InStoreSaleInput = {
  items: InStoreItem[];
  customer: { name: string; phone: string; email: string | null };
  delivery: InStoreDelivery;
  /** One method, or 'split' with the parts in `payments` (always filled: one part = the total). */
  paidBy: SalePaidBy;
  payments: SalePaymentPart[];
  note: string | null;
  /** "Email copy" (owner, 2026-10-21): send the receipt to the customer's email now. */
  emailCopy: boolean;
  /** "Tax-exempt sale" (owner, 2026-10-27): the Florida certificate, or null for a taxed sale. */
  taxExempt: TaxExemptSaleChoice | null;
  /** The Florida tax the certificate took off (0 when none, or when the sale owed none). */
  taxNotCharged: number;
  subtotal: number;
  shippingFee: number;
  tax: number;
  total: number;
  /** The bullion part of the subtotal, left out of the tax (2026-11-24); 0 when none. */
  taxFree: number;
  /** The item amount the 6% was figured on (subtotal − taxFree). */
  taxable: number;
};

/** "$1,460", "1460.50", " 1,460 " → 1460 / 1460.5; anything else → null. */
export function parseInStorePrice(raw: unknown): number | null {
  const text = String(raw ?? '').replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0 || value > IN_STORE_PRICE_MAX) return null;
  return round2(value);
}

/**
 * The totals the form shows and the route records, from one function.
 * Florida tax is on the item plus any shipping charged (the site's policy,
 * `calculateFlSalesTax`). `chargesTax: false` means shipped out of state.
 *
 * `taxFree` (owner, 2026-11-24): the part of the price that is BULLION — gold,
 * silver or platinum bullion and 99.5% gold / 99.9% silver coins, exempt from
 * Florida sales tax at any price (DOR TIP 25A01-03, TIP 26A01-08). Tax is on
 * the rest only, plus the rest's SHARE of the shipping (owner pick 3: an
 * all-bullion shipment carries no tax on shipping at all). `taxable` is the
 * item amount the 6% was figured on, for the "6% on $1,460.00" line.
 */
export function inStoreTotals(
  price: number,
  options: { shippingFee?: number; chargesTax?: boolean; taxFree?: number } = {},
): { subtotal: number; shippingFee: number; tax: number; total: number; taxFree: number; taxable: number } {
  const subtotal = round2(price);
  const shippingFee = round2(Math.max(0, options.shippingFee ?? 0));
  const taxFree = round2(Math.min(Math.max(0, options.taxFree ?? 0), subtotal));
  const taxable = round2(subtotal - taxFree);
  const taxableShipping = taxFree > 0 && subtotal > 0 ? round2((shippingFee * taxable) / subtotal) : shippingFee;
  const tax = options.chargesTax === false ? 0 : calculateFlSalesTax(taxable, taxableShipping);
  return { subtotal, shippingFee, tax, total: round2(subtotal + shippingFee + tax), taxFree, taxable };
}

/** The bullion part of a sale's price (items ticked "Bullion — no sales tax"), to the cent. */
export function saleTaxFreeSubtotal(items: Pick<InStoreItem, 'price' | 'bullion'>[]): number {
  return round2(items.reduce((sum, item) => sum + (item.bullion ? item.price : 0), 0));
}

/** The metals bullion comes in. An unlisted item ticked bullion must name one (Rule 12A-1.0371(6): the record names the metal). */
export const BULLION_METALS: readonly InStoreMetal[] = ['Gold', 'Silver', 'Platinum'];

/** Receipt + order-note wording for a bullion line (owner, 2026-11-24). */
export const BULLION_LINE_LABEL = { en: 'Bullion — not taxed', es: 'Lingote — sin impuesto' } as const;
type BullionReceiptLine = { price_snapshot: number; quantity?: number | null; discount?: number | null; tax_free_bullion?: boolean };

/** The items with `tax_free_bullion: true` on the ids `loadBullionLineIds` returned. */
export function withBullionFlags<T extends { id?: string }>(items: T[], bullionIds: ReadonlySet<string>): Array<T & { tax_free_bullion?: boolean }> {
  if (bullionIds.size === 0) return items;
  return items.map((item) => (item.id && bullionIds.has(item.id) ? { ...item, tax_free_bullion: true } : item));
}

/** The bullion lines' total on an order (after any line discount); 0 when none. */
export function orderBullionTaxFree(items: readonly BullionReceiptLine[]): number {
  return round2(items.reduce((sum, item) => {
    if (!item.tax_free_bullion) return sum;
    const qty = Math.max(1, Math.floor(Number(item.quantity ?? 1)) || 1);
    const line = Number(item.price_snapshot) * qty;
    return sum + line - Math.min(Math.max(0, Number(item.discount ?? 0)), line);
  }, 0));
}

/**
 * The receipt's tax label when the order has bullion lines (2026-11-24):
 * "FL sales tax · 6% on $1,460.00", or "· none — bullion" when every line is
 * bullion. `prefix` is the receipt's own word ("FL sales tax" / "Tax").
 */
export function bullionTaxLabel(
  order: { subtotal: number; discount?: number | null; tax: number },
  taxFree: number,
  prefix: string,
  language: 'en' | 'es' = 'en',
): string {
  const es = language === 'es';
  const taxable = round2(Math.max(0, Number(order.subtotal) - Math.max(0, Number(order.discount ?? 0)) - taxFree));
  if (!(Number(order.tax) > 0)) return `${prefix} · ${es ? 'ninguno — lingotes' : 'none — bullion'}`;
  return `${prefix} · 6% ${es ? 'sobre' : 'on'} ${money(taxable)}`;
}

/** The law line under a receipt's totals when any line is bullion (owner pick 5: keep it). */
export const BULLION_LAW_LINE = {
  en: 'Gold, silver and platinum bullion is exempt from Florida sales tax (s. 212.08(7)(ww), F.S.).',
  es: 'Los lingotes de oro, plata y platino están exentos del impuesto de ventas de Florida (s. 212.08(7)(ww), F.S.).',
} as const;

/** A typed shipping charge: "$25", "12.50" → 25 / 12.5. Zero is allowed, though "No charge" says it better. */
export function parseInStoreShippingFee(raw: unknown): number | null {
  const text = String(raw ?? '').replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0 || value > IN_STORE_SHIPPING_FEE_MAX) return null;
  return round2(value);
}

type AddressFields = { line1: string; line2: string; city: string; state: string; postalCode: string };

function addressFields(raw: unknown): AddressFields {
  const source = (raw ?? {}) as Record<string, unknown>;
  const text = (key: keyof AddressFields) => String(source[key] ?? '').replace(/\s+/g, ' ').trim();
  return { line1: text('line1'), line2: text('line2'), city: text('city'), state: text('state'), postalCode: text('postalCode') };
}

/** Checked with the web checkout's own validator (`lib/us-address.ts`): U.S. only, real state, real ZIP. */
function validateAddress(fields: AddressFields, incomplete: string): { address: InStoreAddress } | { error: string } {
  const result = validateUsShippingAddress({ ...fields, country: 'United States' });
  if (!result.address) {
    return { error: /complete shipping address/i.test(result.error) ? incomplete : result.error };
  }
  const a = result.address;
  return {
    address: {
      line1: a.line1.slice(0, 120),
      line2: a.line2 ? a.line2.slice(0, 60) : null,
      city: a.city.slice(0, 60),
      state: a.state,
      postalCode: a.postalCode,
    },
  };
}


/**
 * Pickup (the default, with an optional mailing address) or ship (address +
 * charge). `shipAddress: 'optional'` is the remote sale: the customer types
 * the address on the payment page, so a blank one is allowed here.
 */
export function normalizeSaleDelivery(
  raw: unknown,
  subtotal: number,
  options: { shipAddress?: 'required' | 'optional' } = {},
): { value: InStoreDelivery } | { error: string } {
  const source = (raw ?? {}) as Record<string, unknown>;
  const fields = addressFields(source.address);
  const blank = !Object.values(fields).some(Boolean);

  if (source.method !== 'ship') {
    // The optional mailing address: all blank = none; started = must be complete.
    if (blank) return { value: { method: 'pickup', address: null } };
    const checked = validateAddress(fields, 'Finish the mailing address (street, city, state, ZIP) or untick it.');
    return 'error' in checked ? checked : { value: { method: 'pickup', address: checked.address } };
  }

  let address: InStoreAddress | null = null;
  if (!blank || options.shipAddress !== 'optional') {
    const checked = validateAddress(
      fields,
      options.shipAddress === 'optional'
        ? 'Finish the ship-to address (street, city, state, ZIP) or leave it all blank for the customer to fill in.'
        : 'Enter the full ship-to address (street, city, state, ZIP).',
    );
    if ('error' in checked) return checked;
    address = checked.address;
  }
  const shipping = String(source.shipping ?? '') as InStoreShippingChoice;
  if (!IN_STORE_SHIPPING_CHOICES.includes(shipping)) return { error: 'Pick the shipping charge.' };
  const shippingFee = shipping === 'custom'
    ? parseInStoreShippingFee(source.shippingFee)
    : inStoreTableShippingFee(shipping, subtotal);
  if (shippingFee == null) {
    return shipping === 'custom'
      ? { error: `Enter the shipping charge, e.g. 25 (up to $${IN_STORE_SHIPPING_FEE_MAX.toLocaleString('en-US')}).` }
      : { error: 'Express overnight is not offered at $5,000 and up (USPS insurance limit). Pick Insured shipping or a custom amount.' };
  }
  return { value: { method: 'ship', address, shipping, shippingFee } };
}

function optionalText(value: unknown, max: number): string | null {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

function normalizeSaleItem(raw: unknown): { value: InStoreItem } | { error: string } {
  const itemSource = (raw ?? {}) as Record<string, unknown>;
  const price = parseInStorePrice(itemSource.price);
  if (price == null) return { error: 'Enter the price sold, e.g. 1460.' };

  const photoText = String(itemSource.photoUrl ?? '').trim();
  if (photoText && !isSalePhotoUrl(photoText)) return { error: 'That photo did not upload. Take or choose it again, or remove it.' };
  const photoUrl = photoText || null;
  const bullion = itemSource.bullion === true;

  if (itemSource.kind === 'listed') {
    const productId = String(itemSource.productId ?? '').trim();
    if (!productId) return { error: 'Pick the listed item.' };
    return { value: { kind: 'listed', productId, price, photoUrl, ...(bullion ? { bullion } : {}) } };
  }
  if (itemSource.kind === 'unlisted') {
    const title = String(itemSource.title ?? '').replace(/\s+/g, ' ').trim();
    if (!title) return { error: 'Describe what sold, e.g. "14K rope chain · 22 in · 18.4 g".' };
    if (title.length > IN_STORE_TITLE_MAX) return { error: `Keep the item under ${IN_STORE_TITLE_MAX} characters.` };
    const metal = String(itemSource.metal ?? 'Other') as InStoreMetal;
    if (!IN_STORE_METALS.includes(metal)) return { error: 'Pick Gold, Silver, Platinum or Other.' };
    if (bullion && !BULLION_METALS.includes(metal)) return { error: 'Bullion must be gold, silver or platinum — pick the metal.' };
    const weightText = String(itemSource.gramWeight ?? '').trim();
    let gramWeight: number | null = null;
    if (weightText) {
      const weight = Number(weightText);
      if (!Number.isFinite(weight) || weight <= 0 || weight > 100_000) return { error: 'Weight must be a number of grams.' };
      gramWeight = round2(weight);
    }
    return { value: { kind: 'unlisted', title, metal, price, gramWeight, purity: optionalText(itemSource.purity, 20), photoUrl, ...(bullion ? { bullion } : {}) } };
  }
  return { error: 'Choose a listed item or describe an unlisted one.' };
}

/**
 * The sale's items: `items: [...]`, or the single `item` the form sent before
 * 2026-10-21. With more than one, an error names the item ("Item 2: …").
 */
export function normalizeSaleItems(body: unknown): { value: InStoreItem[] } | { error: string } {
  const source = (body ?? {}) as Record<string, unknown>;
  const list = Array.isArray(source.items) ? source.items : source.item != null ? [source.item] : [];
  if (list.length === 0) return { error: 'Add the item that sold.' };
  if (list.length > SALE_ITEMS_MAX) return { error: `Up to ${SALE_ITEMS_MAX} items on one sale.` };
  const items: InStoreItem[] = [];
  for (let index = 0; index < list.length; index += 1) {
    const item = normalizeSaleItem(list[index]);
    if ('error' in item) return { error: list.length > 1 ? `Item ${index + 1}: ${item.error}` : item.error };
    items.push(item.value);
  }
  const listedIds = items.flatMap((item) => (item.kind === 'listed' ? [item.productId] : []));
  if (new Set(listedIds).size !== listedIds.length) return { error: 'The same listed item is on this sale twice.' };
  return { value: items };
}

/** Sum of the item prices, to the cent. */
export function saleSubtotal(items: Pick<InStoreItem, 'price'>[]): number {
  return round2(items.reduce((sum, item) => sum + item.price, 0));
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Name always; the cell is required in the store (the receipt's contact) and optional on an invoice. */
export function normalizeSaleCustomer(
  raw: unknown,
  options: { phone: 'required' | 'optional'; email: 'required' | 'optional' },
): { value: { name: string; phone: string | null; email: string | null } } | { error: string } {
  const source = (raw ?? {}) as Record<string, unknown>;
  const name = normalizePersonName(`${String(source.firstName ?? '')} ${String(source.lastName ?? '')}`);
  if (!name) return { error: "Enter the customer's first and last name." };
  const phoneText = String(source.phone ?? '').trim();
  const phone = phoneText ? normalizePhoneNumber(phoneText) : null;
  if (phoneText ? !phone : options.phone === 'required') return { error: 'Enter a valid cell number.' };
  const emailText = String(source.email ?? '').trim();
  if (!emailText && options.email === 'required') return { error: "Enter the customer's email — the invoice goes there." };
  if (emailText && !EMAIL_PATTERN.test(emailText)) {
    return { error: options.email === 'required' ? 'That email does not look right.' : 'That email does not look right (leave it blank for no receipt).' };
  }
  return { value: { name, phone, email: emailText ? emailText.toLowerCase() : null } };
}

export function normalizeInStoreSaleInput(body: unknown): { value: InStoreSaleInput } | { error: string } {
  const source = (body ?? {}) as Record<string, unknown>;

  const items = normalizeSaleItems(source);
  if ('error' in items) return items;
  const subtotal = saleSubtotal(items.value);

  const customer = normalizeSaleCustomer(source.customer, { phone: 'required', email: 'optional' });
  if ('error' in customer) return customer;
  const { name, phone, email } = customer.value;

  const delivery = normalizeSaleDelivery(source.delivery, subtotal);
  if ('error' in delivery) return delivery;

  const taxExempt = normalizeTaxExemptSaleInput(source.taxExempt);
  if ('error' in taxExempt) return taxExempt;

  const shippingFee = delivery.value.method === 'ship' ? delivery.value.shippingFee : 0;
  const taxFree = saleTaxFreeSubtotal(items.value);
  const owes = inStoreChargesTax(delivery.value.method, delivery.value.address?.state);
  const totals = inStoreTotals(subtotal, { shippingFee, chargesTax: owes && !taxExempt.value, taxFree });
  const taxNotCharged = owes && taxExempt.value ? inStoreTotals(subtotal, { shippingFee, chargesTax: true, taxFree }).tax : 0;
  // Checked against the total computed HERE, so a split the form showed as
  // adding up must still add up to what is recorded.
  const paid = normalizeSalePayments(source, totals.total);
  if ('error' in paid) return paid;
  return {
    value: {
      items: items.value,
      customer: { name, phone: phone as string, email },
      delivery: delivery.value,
      paidBy: paid.value.paidBy,
      payments: paid.value.payments,
      note: optionalText(source.note, IN_STORE_NOTE_MAX),
      // A request without the box (before 2026-10-21) kept the old rule: an email means a receipt.
      emailCopy: Boolean(email) && source.emailCopy !== false,
      taxExempt: taxExempt.value,
      taxNotCharged,
      ...totals,
    },
  };
}
