/**
 * Admin → Orders → "Edit order" + "Fix name": the pure rules, shared by the
 * edit window (live preview) and the save route (`lib/order-edit-server.ts`).
 *
 * FULL CONTROL (owner, 2026-11-26, mockup 1 "Yes, build it" — "near god mode"):
 * nothing is locked on a paid order any more (the 2026-11-24 (11) money locks
 * are gone). Details, items, prices, quantities, discounts, the shipping fee,
 * "Bullion — no sales tax" per line, the tax, how it was paid ("Paid by") and
 * the Refunded amount can all change. Editing NEVER moves money: it records
 * what really happened.
 *
 * - TAX follows every change at once, by the same rule as Instant Sale and web
 *   checkout (`inStoreChargesTax`): pickup / local delivery / a Florida address
 *   = 6% on items + shipping; shipped out of state = none; bullion lines = none
 *   (with their share of shipping); a tax-exempt certificate = none. Ship with
 *   no state typed yet keeps the tax on. "Charge FL sales tax when it applies"
 *   (`chargesTax`) turns it off by hand.
 * - PAID BY (orders paid outside the site: `in_store_*` / `remote_*`): the
 *   payments must add up to the new total to save (owner pick 1). One payment
 *   follows the total by itself. A Trade-in credit part stays as it is (it is
 *   the buy receipt's amount).
 * - REFUNDED (paid, not PayPal): a refund that was only marked can be set back
 *   to 0. ⛔ PayPal orders keep "Paid by" and Refunded read-only — PayPal's own
 *   refunds (`apply_paypal_refund`) keep that number right — and get a warning
 *   that changing the total charges / refunds nothing in PayPal.
 */

import {
  IN_STORE_PAYMENT_METHODS,
  inStoreChargesTax,
  inStoreTotals,
  readSalePaymentParts,
  readSaleTradeIn,
  SALE_PAYMENTS_MAX,
  SALE_TRADE_CREDIT,
  salePaymentPartLabel,
  salePaymentsMismatch,
  formatSalePayments,
  type SalePaymentMethod,
  type SalePaymentPart,
} from '@/lib/in-store-sale';
import { normalizeUsState } from '@/lib/us-address';

export const ORDER_CHANGES_SQL_FILE = 'supabase/order-changes-2026-11.sql';

export const EDIT_LIMITS = {
  name: 120,
  phone: 40,
  addressField: 120,
  title: 250,
  notes: 1000,
  giftMessage: 500,
  price: 250_000,
  quantity: 99,
  items: 30,
} as const;

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const money = (value: number) => `$${round2(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export type ShippingMethodValue = 'pickup' | 'shipping' | 'local_delivery';
export const SHIPPING_METHOD_LABELS: Record<ShippingMethodValue, string> = {
  pickup: 'Pickup',
  shipping: 'Ship',
  local_delivery: 'Local delivery',
};

export type EditableAddress = { line1: string; line2: string; city: string; state: string; postalCode: string; country: string };

export const EMPTY_ADDRESS: EditableAddress = { line1: '', line2: '', city: '', state: '', postalCode: '', country: '' };

/** Reads both address shapes (checkout `line1`, older / manual `address_line1`). */
export function addressFields(value: unknown): EditableAddress {
  if (!value || typeof value !== 'object') return { ...EMPTY_ADDRESS };
  const a = value as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');
  return {
    line1: s(a.line1 ?? a.address_line1),
    line2: s(a.line2 ?? a.address_line2),
    city: s(a.city),
    state: s(a.state),
    postalCode: s(a.postal_code ?? a.zip),
    country: s(a.country),
  };
}

export function addressIsEmpty(address: EditableAddress): boolean {
  return !address.line1 && !address.line2 && !address.city && !address.state && !address.postalCode;
}

/** One line for the change list / history. */
export function addressLine(address: EditableAddress): string {
  if (addressIsEmpty(address)) return '—';
  const cityLine = [address.city, [address.state, address.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [address.line1, address.line2, cityLine].filter(Boolean).join(', ');
}

/** The saved shape (checkout's): `line1 … postal_code`, country kept as typed (or United States). */
export function addressObject(address: EditableAddress): Record<string, string | null> | null {
  if (addressIsEmpty(address)) return null;
  return {
    line1: address.line1 || null,
    line2: address.line2 || null,
    city: address.city || null,
    state: address.state || null,
    postal_code: address.postalCode || null,
    country: address.country || 'United States',
  };
}

// ---- What can change ---------------------------------------------------------

export type OrderForEdit = {
  payment_status: string | null;
  payment_method: string | null;
  refund_amount: number | null;
  deleted_at?: string | null;
  tax_exempt?: boolean | null;
  subtotal: number;
  discount: number;
  shipping_fee: number;
  tax: number;
  total: number;
  order_status?: string | null;
  /** `payment_response->trade` (a Trade-in sale) — any truthy value. */
  trade_in?: unknown;
  /** `payment_response->payments` (split payment parts). */
  split_payments?: unknown;
};

export type OrderEditRules = {
  paid: boolean;
  deleted: boolean;
  paypal: boolean;
  tradeIn: boolean;
  /** Paid outside the site (`in_store_*` / `remote_*`): "Paid by" can be edited. */
  paymentsEditable: boolean;
  /** `in_store` / `remote` — the prefix a changed payment method is saved with. */
  paymentPrefix: 'in_store' | 'remote' | null;
  /** Paid, not PayPal: the Refunded amount can be edited (e.g. a refund only marked). */
  refundEditable: boolean;
  /** Warnings shown in the window — never locks (owner, 2026-11-26). */
  notes: string[];
};

export function isPaidStatus(status: string | null | undefined): boolean {
  const s = String(status ?? '').toLowerCase();
  return s === 'paid' || s === 'refunded' || s === 'partially_refunded';
}

const OFFLINE_METHOD = /^(in_store|remote)_(\w+)$/;

export function orderEditRules(order: OrderForEdit): OrderEditRules {
  const paid = isPaidStatus(order.payment_status);
  const trade = readSaleTradeIn(order.trade_in);
  const tradeIn = Boolean(order.trade_in);
  const paypal = String(order.payment_method ?? '').toLowerCase() === 'paypal';
  const offline = OFFLINE_METHOD.exec(String(order.payment_method ?? ''));
  const paymentsEditable = paid && Boolean(offline);
  const notes: string[] = [];
  if (paid && paypal) {
    notes.push(`PayPal charged ${money(Number(order.total) || 0)}. Changing the total here doesn't charge or refund anything in PayPal — it only changes our record. To give money back, use Refund in PayPal (it can't return more than PayPal took).`);
  }
  if (tradeIn) {
    notes.push(trade
      ? `Trade-in ${trade.receipt_number} credited ${money(trade.value)} toward this sale. That credit stays ${money(trade.value)} (it is the buy receipt's amount) — change the other payments so they add up to the new total.`
      : 'This is a Trade-in sale: its trade credit stays as it is — change the other payments so they add up to the new total.');
  }
  return {
    paid,
    deleted: Boolean(order.deleted_at),
    paypal,
    tradeIn,
    paymentsEditable,
    paymentPrefix: offline ? (offline[1] as 'in_store' | 'remote') : null,
    refundEditable: paid && !paypal,
    notes,
  };
}

/**
 * Does Florida sales tax apply to this order? The same rule as Instant Sale and
 * web checkout: pickup and local delivery yes; a shipment yes when it goes to
 * Florida OR no state is typed yet (a half-typed address never drops the tax),
 * no when it ships out of state.
 */
export function taxApplies(state: Pick<OrderEditState, 'shippingMethod' | 'shippingAddress'>): { applies: boolean; stateCode: string | null } {
  if (state.shippingMethod !== 'shipping') return { applies: true, stateCode: null };
  const stateCode = normalizeUsState(state.shippingAddress.state);
  if (!stateCode) return { applies: true, stateCode: null };
  return { applies: inStoreChargesTax('ship', stateCode), stateCode };
}

/** The order's numbers for an edit state: `computeEditTotals` with the tax rule applied. */
export function editTotals(state: OrderEditState, taxExempt: boolean): EditTotals {
  return computeEditTotals({
    items: state.items,
    orderDiscount: state.orderDiscount,
    shippingFee: state.shippingFee,
    chargesTax: state.chargesTax && taxApplies(state).applies,
    taxExempt,
  });
}

/** Why the tax line reads what it does — shown under "FL sales tax" in the window. */
export function taxReason(state: OrderEditState, totals: EditTotals, taxExempt: boolean): string {
  if (taxExempt) return 'none: tax-exempt certificate on file';
  const rule = taxApplies(state);
  if (!rule.applies) return `none: ships out of state (${rule.stateCode})`;
  if (!state.chargesTax) return 'none: turned off for this order';
  const live = state.items.filter((item) => !item.removed);
  const bullion = live.some((item) => item.bullion);
  if (totals.tax <= 0) return bullion ? 'none: bullion, no sales tax' : 'none: nothing taxable';
  const where = state.shippingMethod === 'shipping' ? (rule.stateCode ? `ships to ${rule.stateCode}` : 'no ship-to state yet') : state.shippingMethod === 'local_delivery' ? 'local delivery' : 'pickup';
  return `6%${totals.shippingFee > 0 ? ' on items + shipping' : ''}${bullion ? ', bullion left out' : ''} · ${where}`;
}

/**
 * The starting "Charge FL sales tax when it applies" box: on, unless the order
 * was saved with NO tax where the rule would charge some (a choice made then is
 * kept). Exempt orders: off (the certificate decides).
 */
function chargesTaxFor(order: OrderRowForEdit, base: OrderEditState): boolean {
  if (order.tax_exempt) return false;
  if (Number(order.tax) > 0) return true;
  return editTotals({ ...base, chargesTax: true }, false).tax <= 0;
}

/** Was Florida tax meant to be charged on this order? (see `chargesTaxFor`) */
export function defaultChargesTax(order: OrderRowForEdit): boolean {
  return chargesTaxFor(order, baseStateFromOrder(order, null));
}

// ---- Items + totals ------------------------------------------------------------

export type EditItem = {
  /** Existing `order_items.id`; null = added in this edit. */
  id: string | null;
  productId: string | null;
  title: string;
  price: number;
  quantity: number;
  discount: number;
  /** "Bullion — no sales tax": this line is left out of the Florida tax (editable since 2026-11-26). */
  bullion: boolean;
  removed: boolean;
  /** Listing number shown under a listed piece. */
  inventoryNumber?: string | null;
};

export function lineSubtotal(item: Pick<EditItem, 'price' | 'quantity'>): number {
  return round2(Math.max(0, Number(item.price) || 0) * Math.max(0, Math.floor(Number(item.quantity) || 0)));
}

function lineDiscount(item: Pick<EditItem, 'price' | 'quantity' | 'discount'>): number {
  return round2(Math.min(Math.max(0, Number(item.discount) || 0), lineSubtotal(item)));
}

export type EditTotals = { subtotal: number; discount: number; shippingFee: number; tax: number; total: number; taxNotCharged: number };

/**
 * The order's numbers after an edit — the same arithmetic the order already
 * uses: subtotal before discounts; discount = line discounts + order discount;
 * 6% Florida tax on (subtotal − discount + shipping), bullion lines left out
 * with their share of shipping (`inStoreTotals`); exempt orders charge none but
 * record the tax not charged.
 */
export function computeEditTotals(input: {
  items: EditItem[];
  orderDiscount: number;
  shippingFee: number;
  chargesTax: boolean;
  taxExempt: boolean;
}): EditTotals {
  const live = input.items.filter((item) => !item.removed);
  const subtotal = round2(live.reduce((sum, item) => sum + lineSubtotal(item), 0));
  const lineDiscounts = round2(live.reduce((sum, item) => sum + lineDiscount(item), 0));
  const discount = round2(Math.min(subtotal, lineDiscounts + Math.max(0, Number(input.orderDiscount) || 0)));
  const base = round2(subtotal - discount);
  const bullion = round2(live.filter((item) => item.bullion).reduce((sum, item) => sum + lineSubtotal(item) - lineDiscount(item), 0));
  const taxFree = Math.min(bullion, base);
  const shippingFee = round2(Math.max(0, Number(input.shippingFee) || 0));
  const charged = inStoreTotals(base, { shippingFee, chargesTax: input.chargesTax && !input.taxExempt, taxFree });
  const asIfCharged = input.taxExempt ? inStoreTotals(base, { shippingFee, chargesTax: true, taxFree }).tax : 0;
  return { subtotal, discount, shippingFee: charged.shippingFee, tax: charged.tax, total: round2(base + charged.shippingFee + charged.tax), taxNotCharged: asIfCharged };
}

// ---- The editable state + the change list -------------------------------------------

export type OrderEditState = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: EditableAddress;
  billingAddress: EditableAddress;
  shippingMethod: ShippingMethodValue;
  shippingFee: number;
  orderDiscount: number;
  /** "Charge FL sales tax when it applies" — the rule (`taxApplies`) still decides where it applies. */
  chargesTax: boolean;
  items: EditItem[];
  isGift: boolean;
  giftRecipient: string;
  giftMessage: string;
  customerNotes: string;
  /** "Paid by" (orders paid outside the site; empty otherwise). One part follows the total. */
  payments: SalePaymentPart[];
  /** Money given back (0 = none). */
  refundAmount: number;
};

export type OrderRowForEdit = OrderForEdit & {
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  shipping_address: unknown;
  billing_address: unknown;
  shipping_method: string | null;
  customer_notes: string | null;
  order_items: Array<{
    id: string;
    product_id: string | null;
    inventory_number?: string | null;
    title_snapshot: string;
    price_snapshot: number;
    quantity?: number | null;
    discount?: number | null;
    tax_free_bullion?: boolean;
  }>;
};

export function normalizeShippingMethod(value: unknown): ShippingMethodValue {
  return value === 'shipping' || value === 'local_delivery' ? value : 'pickup';
}

/** The "Paid by" an order starts with: its saved parts, or its one method for the whole total. */
function paymentsFromOrder(order: OrderRowForEdit): SalePaymentPart[] {
  if (!orderEditRules(order).paymentsEditable) return [];
  const parts = readSalePaymentParts(order.split_payments, 1);
  if (parts) return parts;
  const method = OFFLINE_METHOD.exec(String(order.payment_method ?? ''))?.[2] ?? '';
  const known = (IN_STORE_PAYMENT_METHODS as readonly string[]).includes(method) || method === SALE_TRADE_CREDIT;
  return known ? [{ method: method as SalePaymentMethod, amount: round2(Number(order.total) || 0) }] : [];
}

export function editStateFromOrder(order: OrderRowForEdit, gift: { recipientName: string | null; message: string | null } | null): OrderEditState {
  const base = baseStateFromOrder(order, gift);
  return { ...base, chargesTax: chargesTaxFor(order, base) };
}

function baseStateFromOrder(order: OrderRowForEdit, gift: { recipientName: string | null; message: string | null } | null): OrderEditState {
  const items: EditItem[] = (order.order_items ?? []).map((item) => ({
    id: item.id,
    productId: item.product_id,
    title: item.title_snapshot ?? '',
    price: round2(Number(item.price_snapshot) || 0),
    quantity: Math.max(1, Math.floor(Number(item.quantity ?? 1) || 1)),
    discount: round2(Number(item.discount ?? 0) || 0),
    bullion: Boolean(item.tax_free_bullion),
    removed: false,
    inventoryNumber: item.inventory_number ?? null,
  }));
  const lineDiscounts = round2(items.reduce((sum, item) => sum + lineDiscount(item), 0));
  return {
    customerName: order.customer_name ?? '',
    customerEmail: order.customer_email ?? '',
    customerPhone: order.customer_phone ?? '',
    shippingAddress: addressFields(order.shipping_address),
    billingAddress: addressFields(order.billing_address),
    shippingMethod: normalizeShippingMethod(order.shipping_method),
    shippingFee: round2(Number(order.shipping_fee) || 0),
    orderDiscount: round2(Math.max(0, (Number(order.discount) || 0) - lineDiscounts)),
    chargesTax: true,
    items,
    isGift: Boolean(gift),
    giftRecipient: gift?.recipientName ?? '',
    giftMessage: gift?.message ?? '',
    customerNotes: order.customer_notes ?? '',
    payments: paymentsFromOrder(order),
    refundAmount: round2(Math.max(0, Number(order.refund_amount ?? 0) || 0)),
  };
}

/** One payment (not a trade credit) follows the total by itself; several are kept as typed. */
export function settlePayments(payments: SalePaymentPart[], total: number): SalePaymentPart[] {
  if (payments.length === 1 && payments[0].method !== SALE_TRADE_CREDIT) return [{ ...payments[0], amount: round2(total) }];
  return payments.map((part) => ({ ...part, amount: round2(Number(part.amount) || 0) }));
}

/** How "Paid by" reads in the change list: one payment by its name, several with their amounts. */
function paymentsText(payments: SalePaymentPart[]): string {
  if (payments.length === 0) return '—';
  if (payments.length === 1 && payments[0].method !== SALE_TRADE_CREDIT) return salePaymentPartLabel(payments[0]);
  return formatSalePayments(payments);
}

/** "Paid by" changed (after settling both against their totals). */
export function paymentsChanged(before: OrderEditState, after: OrderEditState): boolean {
  return paymentsText(before.payments) !== paymentsText(after.payments);
}

export type OrderChange = { label: string; before: string; after: string };

const shown = (value: string) => (value.trim() ? value.trim() : '—');

/** Every difference, worded for the "What will change" list and the history. */
export function describeChanges(before: OrderEditState, after: OrderEditState): OrderChange[] {
  const changes: OrderChange[] = [];
  const text = (label: string, a: string, b: string) => {
    if (a.trim() !== b.trim()) changes.push({ label, before: shown(a), after: shown(b) });
  };
  text('Name', before.customerName, after.customerName);
  text('Email', before.customerEmail.toLowerCase(), after.customerEmail.toLowerCase());
  text('Phone', before.customerPhone, after.customerPhone);
  if (before.shippingMethod !== after.shippingMethod) {
    changes.push({ label: 'Delivery', before: SHIPPING_METHOD_LABELS[before.shippingMethod], after: SHIPPING_METHOD_LABELS[after.shippingMethod] });
  }
  text('Ship to', addressLine(before.shippingAddress), addressLine(after.shippingAddress));
  text('Billing address', addressLine(before.billingAddress), addressLine(after.billingAddress));

  const beforeById = new Map(before.items.filter((item) => item.id).map((item) => [item.id as string, item]));
  for (const item of after.items) {
    const was = item.id ? beforeById.get(item.id) : undefined;
    if (!was) {
      if (!item.removed) changes.push({ label: 'Item added', before: '—', after: `${item.title} · ${money(item.price)} × ${item.quantity}` });
      continue;
    }
    if (item.removed) {
      changes.push({ label: 'Item removed', before: `${was.title} · ${money(was.price)} × ${was.quantity}`, after: '—' });
      continue;
    }
    if (was.title.trim() !== item.title.trim()) changes.push({ label: 'Item name', before: was.title, after: item.title.trim() });
    if (round2(was.price) !== round2(item.price)) changes.push({ label: `Price · ${item.title.trim()}`, before: money(was.price), after: money(item.price) });
    if (was.quantity !== item.quantity) changes.push({ label: `Qty · ${item.title.trim()}`, before: String(was.quantity), after: String(item.quantity) });
    if (round2(was.discount) !== round2(item.discount)) changes.push({ label: `Line discount · ${item.title.trim()}`, before: money(was.discount), after: money(item.discount) });
    if (was.bullion !== item.bullion) changes.push({ label: `Bullion, no sales tax · ${item.title.trim()}`, before: was.bullion ? 'Yes' : 'No', after: item.bullion ? 'Yes' : 'No' });
  }

  if (round2(before.shippingFee) !== round2(after.shippingFee)) changes.push({ label: 'Shipping fee', before: money(before.shippingFee), after: money(after.shippingFee) });
  if (round2(before.orderDiscount) !== round2(after.orderDiscount)) changes.push({ label: 'Order discount', before: money(before.orderDiscount), after: money(after.orderDiscount) });
  if (before.chargesTax !== after.chargesTax) changes.push({ label: 'Charge FL sales tax when it applies', before: before.chargesTax ? 'On' : 'Off', after: after.chargesTax ? 'On' : 'Off' });
  if (paymentsChanged(before, after)) changes.push({ label: 'Paid by', before: paymentsText(before.payments), after: paymentsText(after.payments) });
  if (round2(before.refundAmount) !== round2(after.refundAmount)) {
    changes.push({ label: 'Refunded', before: before.refundAmount > 0 ? money(before.refundAmount) : 'none', after: after.refundAmount > 0 ? money(after.refundAmount) : 'none' });
  }
  if (before.isGift) {
    text('Gift recipient', before.giftRecipient, after.giftRecipient);
    text('Gift message', before.giftMessage, after.giftMessage);
  }
  text("Customer's note", before.customerNotes, after.customerNotes);
  return changes;
}

/** "FL sales tax" and "Total" lines, from the order as saved to the new totals (only the ones that move). */
export function totalsChanges(saved: { tax: number; total: number }, totals: EditTotals): OrderChange[] {
  const changes: OrderChange[] = [];
  if (round2(Number(saved.tax) || 0) !== round2(totals.tax)) changes.push({ label: 'FL sales tax', before: money(Number(saved.tax) || 0), after: money(totals.tax) });
  if (round2(Number(saved.total) || 0) !== round2(totals.total)) changes.push({ label: 'Total', before: money(Number(saved.total) || 0), after: money(totals.total) });
  return changes;
}

/**
 * True when the edit touches the order's numbers (items, prices, quantities,
 * discounts, shipping fee, bullion marks, the tax box, or a delivery / state
 * change that moves the tax rule) — then the totals are worked out again.
 */
export function moneyChanged(before: OrderEditState, after: OrderEditState): boolean {
  if (round2(before.shippingFee) !== round2(after.shippingFee)) return true;
  if (round2(before.orderDiscount) !== round2(after.orderDiscount)) return true;
  if (before.chargesTax !== after.chargesTax) return true;
  if (taxApplies(before).applies !== taxApplies(after).applies) return true;
  const beforeById = new Map(before.items.filter((item) => item.id).map((item) => [item.id as string, item]));
  for (const item of after.items) {
    const was = item.id ? beforeById.get(item.id) : undefined;
    if (!was) {
      if (!item.removed) return true;
      continue;
    }
    if (item.removed) return true;
    if (round2(was.price) !== round2(item.price) || was.quantity !== item.quantity || round2(was.discount) !== round2(item.discount) || was.bullion !== item.bullion) return true;
  }
  return false;
}

/** The payment status a refund amount gives a paid order. */
export function refundPaymentStatus(refundAmount: number, total: number): 'paid' | 'partially_refunded' | 'refunded' {
  if (round2(refundAmount) <= 0) return 'paid';
  return round2(refundAmount) >= round2(total) ? 'refunded' : 'partially_refunded';
}

// ---- Reading the request ---------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function num(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function readAddress(value: unknown): EditableAddress {
  const a = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    line1: str(a.line1, EDIT_LIMITS.addressField),
    line2: str(a.line2, EDIT_LIMITS.addressField),
    city: str(a.city, EDIT_LIMITS.addressField),
    state: str(a.state, EDIT_LIMITS.addressField),
    postalCode: str(a.postalCode, 20),
    country: str(a.country, 60),
  };
}

/**
 * The edit window's full state, checked. Item ids must be the order's own
 * (checked by the caller); a new item is `id: null` with a title and price.
 */
export function readEditBody(body: unknown): { state: Omit<OrderEditState, 'isGift'> } | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Nothing to save.' };
  const b = body as Record<string, unknown>;
  const customerEmail = str(b.customerEmail, 200).toLowerCase();
  if (customerEmail && !EMAIL_RE.test(customerEmail)) return { error: 'That email address does not look right.' };
  const shippingFee = num(b.shippingFee);
  const orderDiscount = num(b.orderDiscount);
  if (shippingFee === null || shippingFee < 0 || shippingFee > EDIT_LIMITS.price) return { error: 'Enter a shipping fee of $0 or more.' };
  if (orderDiscount === null || orderDiscount < 0 || orderDiscount > EDIT_LIMITS.price) return { error: 'Enter an order discount of $0 or more.' };
  if (!Array.isArray(b.items)) return { error: 'The items are missing.' };
  if (b.items.length > EDIT_LIMITS.items) return { error: `At most ${EDIT_LIMITS.items} items on one order.` };

  const items: EditItem[] = [];
  for (const raw of b.items) {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const title = str(r.title, EDIT_LIMITS.title);
    const price = num(r.price);
    const quantity = num(r.quantity);
    const discount = num(r.discount ?? 0);
    const removed = r.removed === true;
    if (!removed) {
      if (!title) return { error: 'Every item needs a name.' };
      if (price === null || price < 0 || price > EDIT_LIMITS.price) return { error: `Check the price of "${title}".` };
      if (quantity === null || !Number.isInteger(quantity) || quantity < 1 || quantity > EDIT_LIMITS.quantity) return { error: `Check the quantity of "${title}" (1–${EDIT_LIMITS.quantity}).` };
      if (discount === null || discount < 0) return { error: `Check the line discount of "${title}".` };
    }
    items.push({
      id: typeof r.id === 'string' && r.id ? r.id : null,
      productId: typeof r.productId === 'string' && r.productId ? r.productId : null,
      title,
      price: round2(price ?? 0),
      quantity: Math.floor(quantity ?? 1),
      discount: round2(discount ?? 0),
      bullion: r.bullion === true,
      removed,
    });
  }
  if (!items.some((item) => !item.removed)) return { error: 'An order needs at least one item. To drop the whole sale, Cancel the order instead.' };

  const payments: SalePaymentPart[] = [];
  const rawPayments = Array.isArray(b.payments) ? b.payments : [];
  if (rawPayments.length > SALE_PAYMENTS_MAX) return { error: `Up to ${SALE_PAYMENTS_MAX} payments on one order.` };
  for (const raw of rawPayments) {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const method = String(r.method ?? '');
    if (!(IN_STORE_PAYMENT_METHODS as readonly string[]).includes(method) && method !== SALE_TRADE_CREDIT) return { error: 'Pick how each payment was made.' };
    const amount = num(r.amount);
    if (amount === null || amount < 0 || amount > EDIT_LIMITS.price) return { error: 'Check the payment amounts.' };
    const reference = typeof r.reference === 'string' && r.reference.trim() ? r.reference.trim().slice(0, 30) : null;
    payments.push(reference ? { method: method as SalePaymentMethod, amount: round2(amount), reference } : { method: method as SalePaymentMethod, amount: round2(amount) });
  }
  const refundAmount = num(b.refundAmount ?? 0);
  if (refundAmount === null || refundAmount < 0 || refundAmount > EDIT_LIMITS.price) return { error: 'Enter a refunded amount of $0 or more.' };

  return {
    state: {
      customerName: str(b.customerName, EDIT_LIMITS.name),
      customerEmail,
      customerPhone: str(b.customerPhone, EDIT_LIMITS.phone),
      shippingAddress: readAddress(b.shippingAddress),
      billingAddress: readAddress(b.billingAddress),
      shippingMethod: normalizeShippingMethod(b.shippingMethod),
      shippingFee: round2(shippingFee),
      orderDiscount: round2(orderDiscount),
      chargesTax: b.chargesTax !== false,
      items,
      giftRecipient: str(b.giftRecipient, EDIT_LIMITS.name),
      giftMessage: str(b.giftMessage, EDIT_LIMITS.giftMessage),
      customerNotes: str(b.customerNotes, EDIT_LIMITS.notes),
      payments,
      refundAmount: round2(refundAmount),
    },
  };
}

/**
 * The parts of a request the rules keep as saved (the server applies this
 * before anything else): PayPal / unpaid orders keep their "Paid by" and
 * Refunded; a Trade-in credit part always stays exactly as saved.
 */
export function keepFixedMoney(rules: OrderEditRules, before: OrderEditState, after: OrderEditState): OrderEditState {
  const tradeParts = before.payments.filter((part) => part.method === SALE_TRADE_CREDIT);
  const payments = rules.paymentsEditable
    ? [...tradeParts, ...after.payments.filter((part) => part.method !== SALE_TRADE_CREDIT)]
    : before.payments;
  return { ...after, payments, refundAmount: rules.refundEditable ? after.refundAmount : before.refundAmount };
}

/**
 * What an edit cannot save (null = fine) — nothing is locked any more
 * (2026-11-26); these keep the record readable. Run on settled payments.
 */
export function editRefusal(rules: OrderEditRules, after: OrderEditState, totals: EditTotals): string | null {
  if (rules.deleted) return 'This order is in the Recycle Bin. Restore it before editing.';
  if (rules.paymentsEditable) {
    if (after.payments.length === 0) return 'Add how this order was paid ("Paid by").';
    if (after.payments.length > 1 && after.payments.some((part) => part.amount <= 0)) return 'Every payment needs an amount (or remove it).';
    const sum = round2(after.payments.reduce((total, part) => total + part.amount, 0));
    const mismatch = salePaymentsMismatch(sum, totals.total);
    if (mismatch) return `${mismatch} Fix a payment so the receipt's "Paid by" matches.`;
  }
  if (rules.refundEditable && round2(after.refundAmount) > round2(totals.total)) return `The refund can't be more than the ${money(totals.total)} total.`;
  return null;
}
