/**
 * Admin → Orders → "Edit order" + "Fix name" (owner, 2026-11-24 (11), mockup 2,
 * option B with two owner changes): the pure rules, shared by the edit window
 * (live preview) and the save route (`lib/order-edit-server.ts`).
 *
 * - DETAILS (customer, email, phone, addresses, item names, delivery, gift
 *   message, customer's note) can be fixed on ANY order.
 * - MONEY (items, prices, quantities, line / order discount, tax on/off) only
 *   while the order is UNPAID — then the totals are worked out again here.
 * - SHIPPING FEE (owner: "allow shipping fee to change"): unpaid orders, AND
 *   paid orders that were not paid through PayPal, are not split between
 *   several payments, and have no refund yet. ⛔ A PayPal order keeps it locked:
 *   PayPal charged a fixed amount and the refund button / ledger work from
 *   `orders.total` (`buildPayPalRefundPlan`, `apply_paypal_refund`).
 * - ⛔ TRADE-IN orders keep ALL money locked, paid or not (owner: "go with your
 *   recommendation on 5 if my choice will break things") — the buy receipt's
 *   trade credit is tied to the sale amount, exactly as buy-receipt editing
 *   already refuses (`api/admin/buy-receipts/[id]` 409).
 */

import { inStoreTotals } from '@/lib/in-store-sale';

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
  /** `payment_response->trade` (a Trade-in sale) — any truthy value. */
  trade_in?: unknown;
  /** `payment_response->payments` (split payment parts). */
  split_payments?: unknown;
};

export type OrderEditRules = {
  paid: boolean;
  moneyAllowed: boolean;
  shippingFeeAllowed: boolean;
  /** Why the money is locked (shown in the window), or null. */
  moneyLockReason: string | null;
  shippingLockReason: string | null;
  deleted: boolean;
};

export function isPaidStatus(status: string | null | undefined): boolean {
  const s = String(status ?? '').toLowerCase();
  return s === 'paid' || s === 'refunded' || s === 'partially_refunded';
}

function splitCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

export function orderEditRules(order: OrderForEdit): OrderEditRules {
  const paid = isPaidStatus(order.payment_status);
  const tradeIn = Boolean(order.trade_in);
  const paypal = String(order.payment_method ?? '').toLowerCase() === 'paypal';
  const refunded = Number(order.refund_amount ?? 0) > 0;
  const split = splitCount(order.split_payments) >= 2;
  const moneyAllowed = !paid && !tradeIn;

  let moneyLockReason: string | null = null;
  if (tradeIn) moneyLockReason = 'A Trade-in sale keeps its items, prices and totals: the buy receipt is tied to the amount. Names and details can still be fixed.';
  else if (paid) moneyLockReason = 'Paid orders keep their items, prices and quantities — only names can be fixed. To give money back use Refund; to change what was sold, Cancel the order and ring the sale again.';

  let shippingLockReason: string | null = null;
  if (!moneyAllowed) {
    if (tradeIn) shippingLockReason = 'Locked on a Trade-in sale.';
    else if (paypal) shippingLockReason = 'Locked: PayPal charged a fixed amount, and Refund works from the order total.';
    else if (refunded) shippingLockReason = 'Locked: this order already has a refund.';
    else if (split) shippingLockReason = 'Locked: paid in several parts — change it with a Refund or ring the sale again.';
  }

  return {
    paid,
    moneyAllowed,
    shippingFeeAllowed: moneyAllowed || (paid && shippingLockReason === null),
    moneyLockReason,
    shippingLockReason,
    deleted: Boolean(order.deleted_at),
  };
}

/** Was Florida tax charged on this order? (Exempt → no; tax > 0 → yes; nothing taxable yet → yes.) */
export function defaultChargesTax(order: Pick<OrderForEdit, 'tax_exempt' | 'tax' | 'subtotal' | 'discount' | 'shipping_fee'>): boolean {
  if (order.tax_exempt) return false;
  if (Number(order.tax) > 0) return true;
  return round2(Number(order.subtotal) - Number(order.discount) + Number(order.shipping_fee)) <= 0;
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
  /** "Bullion — not taxed" (existing lines keep their mark; read only here). */
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
  chargesTax: boolean;
  items: EditItem[];
  isGift: boolean;
  giftRecipient: string;
  giftMessage: string;
  customerNotes: string;
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

export function editStateFromOrder(order: OrderRowForEdit, gift: { recipientName: string | null; message: string | null } | null): OrderEditState {
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
    chargesTax: defaultChargesTax(order),
    items,
    isGift: Boolean(gift),
    giftRecipient: gift?.recipientName ?? '',
    giftMessage: gift?.message ?? '',
    customerNotes: order.customer_notes ?? '',
  };
}

export type OrderChange = { label: string; before: string; after: string };

const money = (value: number) => `$${round2(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  }

  if (round2(before.shippingFee) !== round2(after.shippingFee)) changes.push({ label: 'Shipping fee', before: money(before.shippingFee), after: money(after.shippingFee) });
  if (round2(before.orderDiscount) !== round2(after.orderDiscount)) changes.push({ label: 'Order discount', before: money(before.orderDiscount), after: money(after.orderDiscount) });
  if (before.chargesTax !== after.chargesTax) changes.push({ label: 'Florida sales tax', before: before.chargesTax ? 'Charged' : 'Not charged', after: after.chargesTax ? 'Charged' : 'Not charged' });
  if (before.isGift) {
    text('Gift recipient', before.giftRecipient, after.giftRecipient);
    text('Gift message', before.giftMessage, after.giftMessage);
  }
  text("Customer's note", before.customerNotes, after.customerNotes);
  return changes;
}

/** True when the edit touches money (items, prices, quantities, discounts, shipping fee, tax). */
export function moneyChanged(before: OrderEditState, after: OrderEditState): boolean {
  if (round2(before.shippingFee) !== round2(after.shippingFee)) return true;
  if (round2(before.orderDiscount) !== round2(after.orderDiscount)) return true;
  if (before.chargesTax !== after.chargesTax) return true;
  const beforeById = new Map(before.items.filter((item) => item.id).map((item) => [item.id as string, item]));
  for (const item of after.items) {
    const was = item.id ? beforeById.get(item.id) : undefined;
    if (!was) {
      if (!item.removed) return true;
      continue;
    }
    if (item.removed) return true;
    if (round2(was.price) !== round2(item.price) || was.quantity !== item.quantity || round2(was.discount) !== round2(item.discount)) return true;
  }
  return false;
}

/** True when anything other than item names / details changed in the items or money. */
export function itemsOtherThanNamesChanged(before: OrderEditState, after: OrderEditState): boolean {
  if (after.items.some((item) => !item.id && !item.removed)) return true;
  const beforeById = new Map(before.items.filter((item) => item.id).map((item) => [item.id as string, item]));
  return after.items.some((item) => {
    const was = item.id ? beforeById.get(item.id) : undefined;
    if (!was) return false;
    return item.removed || round2(was.price) !== round2(item.price) || was.quantity !== item.quantity || round2(was.discount) !== round2(item.discount);
  });
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
    },
  };
}

/**
 * What the rules refuse in an edit (null = fine). The UI never offers these;
 * this is the server's own check.
 */
export function editRefusal(rules: OrderEditRules, before: OrderEditState, after: OrderEditState): string | null {
  if (rules.deleted) return 'This order is in the Recycle Bin. Restore it before editing.';
  if (!rules.moneyAllowed) {
    if (itemsOtherThanNamesChanged(before, after)) return rules.moneyLockReason ?? 'The items on this order cannot change.';
    if (round2(before.orderDiscount) !== round2(after.orderDiscount) || before.chargesTax !== after.chargesTax) {
      return rules.moneyLockReason ?? 'The money on this order cannot change.';
    }
  }
  if (!rules.shippingFeeAllowed && round2(before.shippingFee) !== round2(after.shippingFee)) {
    return rules.shippingLockReason ?? 'The shipping fee on this order cannot change.';
  }
  return null;
}
