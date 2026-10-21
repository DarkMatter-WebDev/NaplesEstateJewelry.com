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
import { calculateFlSalesTax, isFloridaState, round2 } from '@/lib/checkout-pricing';
import { getCheckoutShippingFee } from '@/lib/checkout-shipping';
import { normalizePersonName } from '@/lib/person-name';
import { normalizePhoneNumber } from '@/lib/phone';
import { validateUsShippingAddress } from '@/lib/us-address';

// Cash App, Venmo and store credit added 2026-10-20 (owner). Store credit is
// recorded as paid like the rest: the credit was issued earlier, outside the site.
export const IN_STORE_PAYMENT_METHODS = ['zettle', 'cash', 'zelle', 'check', 'cashapp', 'venmo', 'store_credit'] as const;
export type InStorePaymentMethod = (typeof IN_STORE_PAYMENT_METHODS)[number];

export const IN_STORE_PAYMENT_LABELS: Record<InStorePaymentMethod, string> = {
  zettle: 'Card · Zettle',
  cash: 'Cash',
  zelle: 'Zelle',
  check: 'Check',
  cashapp: 'Cash App',
  venmo: 'Venmo',
  store_credit: 'Store credit',
};

/** orders.payment_method value for an in-store sale, e.g. `in_store_zettle`. */
export function inStorePaymentMethodValue(method: InStorePaymentMethod): string {
  return `in_store_${method}`;
}

/** Human label for ANY orders.payment_method value (PayPal, manual, in-store). */
export function paymentMethodLabel(value: string | null | undefined): string {
  if (!value) return '-';
  if (value === 'paypal') return 'PayPal';
  if (value === 'manual') return 'Manual';
  const inStore = value.match(/^in_store_(\w+)$/);
  if (inStore) {
    const method = inStore[1] as InStorePaymentMethod;
    return `In store · ${IN_STORE_PAYMENT_LABELS[method] ?? method}`;
  }
  return value;
}

export const IN_STORE_METALS = ['Gold', 'Silver', 'Other'] as const;
export type InStoreMetal = (typeof IN_STORE_METALS)[number];

export const IN_STORE_TITLE_MAX = 120;
export const IN_STORE_NOTE_MAX = 300;
export const IN_STORE_PRICE_MAX = 250_000;

export type InStoreListedItem = { kind: 'listed'; productId: string; price: number };
export type InStoreUnlistedItem = {
  kind: 'unlisted';
  title: string;
  metal: InStoreMetal;
  price: number;
  gramWeight: number | null;
  purity: string | null;
};

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

export type InStoreDelivery =
  | { method: 'pickup'; address: InStoreAddress | null }
  | { method: 'ship'; address: InStoreAddress; shipping: InStoreShippingChoice; shippingFee: number };

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
  item: InStoreListedItem | InStoreUnlistedItem;
  customer: { name: string; phone: string; email: string | null };
  delivery: InStoreDelivery;
  paidBy: InStorePaymentMethod;
  note: string | null;
  subtotal: number;
  shippingFee: number;
  tax: number;
  total: number;
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
 */
export function inStoreTotals(
  price: number,
  options: { shippingFee?: number; chargesTax?: boolean } = {},
): { subtotal: number; shippingFee: number; tax: number; total: number } {
  const subtotal = round2(price);
  const shippingFee = round2(Math.max(0, options.shippingFee ?? 0));
  const tax = options.chargesTax === false ? 0 : calculateFlSalesTax(subtotal, shippingFee);
  return { subtotal, shippingFee, tax, total: round2(subtotal + shippingFee + tax) };
}

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

/** Pickup (the default, with an optional mailing address) or ship (address + charge). */
function normalizeDelivery(raw: unknown, price: number): { value: InStoreDelivery } | { error: string } {
  const source = (raw ?? {}) as Record<string, unknown>;
  const fields = addressFields(source.address);

  if (source.method !== 'ship') {
    // The optional mailing address: all blank = none; started = must be complete.
    if (!Object.values(fields).some(Boolean)) return { value: { method: 'pickup', address: null } };
    const checked = validateAddress(fields, 'Finish the mailing address (street, city, state, ZIP) or untick it.');
    return 'error' in checked ? checked : { value: { method: 'pickup', address: checked.address } };
  }

  const checked = validateAddress(fields, 'Enter the full ship-to address (street, city, state, ZIP).');
  if ('error' in checked) return checked;
  const shipping = String(source.shipping ?? '') as InStoreShippingChoice;
  if (!IN_STORE_SHIPPING_CHOICES.includes(shipping)) return { error: 'Pick the shipping charge.' };
  const shippingFee = shipping === 'custom'
    ? parseInStoreShippingFee(source.shippingFee)
    : inStoreTableShippingFee(shipping, price);
  if (shippingFee == null) {
    return shipping === 'custom'
      ? { error: `Enter the shipping charge, e.g. 25 (up to $${IN_STORE_SHIPPING_FEE_MAX.toLocaleString('en-US')}).` }
      : { error: 'Express overnight is not offered at $5,000 and up (USPS insurance limit). Pick Insured shipping or a custom amount.' };
  }
  return { value: { method: 'ship', address: checked.address, shipping, shippingFee } };
}

function optionalText(value: unknown, max: number): string | null {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

export function normalizeInStoreSaleInput(body: unknown): { value: InStoreSaleInput } | { error: string } {
  const source = (body ?? {}) as Record<string, unknown>;
  const itemSource = (source.item ?? {}) as Record<string, unknown>;
  const customerSource = (source.customer ?? {}) as Record<string, unknown>;

  const price = parseInStorePrice(itemSource.price);
  if (price == null) return { error: 'Enter the price sold, e.g. 1460.' };

  let item: InStoreSaleInput['item'];
  if (itemSource.kind === 'listed') {
    const productId = String(itemSource.productId ?? '').trim();
    if (!productId) return { error: 'Pick the listed item.' };
    item = { kind: 'listed', productId, price };
  } else if (itemSource.kind === 'unlisted') {
    const title = String(itemSource.title ?? '').replace(/\s+/g, ' ').trim();
    if (!title) return { error: 'Describe what sold, e.g. "14K rope chain · 22 in · 18.4 g".' };
    if (title.length > IN_STORE_TITLE_MAX) return { error: `Keep the item under ${IN_STORE_TITLE_MAX} characters.` };
    const metal = String(itemSource.metal ?? 'Other') as InStoreMetal;
    if (!IN_STORE_METALS.includes(metal)) return { error: 'Pick Gold, Silver or Other.' };
    const weightText = String(itemSource.gramWeight ?? '').trim();
    let gramWeight: number | null = null;
    if (weightText) {
      const weight = Number(weightText);
      if (!Number.isFinite(weight) || weight <= 0 || weight > 100_000) return { error: 'Weight must be a number of grams.' };
      gramWeight = round2(weight);
    }
    item = { kind: 'unlisted', title, metal, price, gramWeight, purity: optionalText(itemSource.purity, 20) };
  } else {
    return { error: 'Choose a listed item or describe an unlisted one.' };
  }

  const name = normalizePersonName(`${String(customerSource.firstName ?? '')} ${String(customerSource.lastName ?? '')}`);
  if (!name) return { error: "Enter the customer's first and last name." };
  const phone = normalizePhoneNumber(String(customerSource.phone ?? ''));
  if (!phone) return { error: 'Enter a valid cell number.' };
  const emailText = String(customerSource.email ?? '').trim();
  if (emailText && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailText)) return { error: 'That email does not look right (leave it blank for no receipt).' };

  const paidBy = String(source.paidBy ?? '') as InStorePaymentMethod;
  if (!IN_STORE_PAYMENT_METHODS.includes(paidBy)) return { error: 'Pick how it was paid.' };

  const delivery = normalizeDelivery(source.delivery, price);
  if ('error' in delivery) return delivery;

  const totals = inStoreTotals(price, {
    shippingFee: delivery.value.method === 'ship' ? delivery.value.shippingFee : 0,
    chargesTax: inStoreChargesTax(delivery.value.method, delivery.value.address?.state),
  });
  return {
    value: {
      item,
      customer: { name, phone, email: emailText ? emailText.toLowerCase() : null },
      delivery: delivery.value,
      paidBy,
      note: optionalText(source.note, IN_STORE_NOTE_MAX),
      ...totals,
    },
  };
}
