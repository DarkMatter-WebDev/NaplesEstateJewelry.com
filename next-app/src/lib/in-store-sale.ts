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
  // A remote sale's invoice before it is paid (paid online it becomes 'paypal').
  if (value === 'invoice') return 'Invoice';
  const inStore = value.match(/^(in_store|remote)_(\w+)$/);
  if (inStore) {
    const method = inStore[2] as InStorePaymentMethod;
    return `${inStore[1] === 'remote' ? 'Invoice' : 'In store'} · ${IN_STORE_PAYMENT_LABELS[method] ?? method}`;
  }
  return value;
}

/** orders.payment_method for a remote sale's invoice paid outside the site, e.g. `remote_zelle`. */
export function remotePaymentMethodValue(method: InStorePaymentMethod): string {
  return `remote_${method}`;
}

export const IN_STORE_METALS = ['Gold', 'Silver', 'Other'] as const;
export type InStoreMetal = (typeof IN_STORE_METALS)[number];

export const IN_STORE_TITLE_MAX = 120;
export const IN_STORE_NOTE_MAX = 300;
export const IN_STORE_PRICE_MAX = 250_000;
/** Items on one sale — a counter of pieces, not a cart; past this it is two sales. */
export const SALE_ITEMS_MAX = 20;

/** `photoUrl`: a photo taken for THIS sale. Null = the listing's own photo (listed) or none (unlisted). */
export type InStoreListedItem = { kind: 'listed'; productId: string; price: number; photoUrl: string | null };
export type InStoreUnlistedItem = {
  kind: 'unlisted';
  title: string;
  metal: InStoreMetal;
  price: number;
  gramWeight: number | null;
  purity: string | null;
  photoUrl: string | null;
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
  paidBy: InStorePaymentMethod;
  note: string | null;
  /** "Email copy" (owner, 2026-10-21): send the receipt to the customer's email now. */
  emailCopy: boolean;
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

  if (itemSource.kind === 'listed') {
    const productId = String(itemSource.productId ?? '').trim();
    if (!productId) return { error: 'Pick the listed item.' };
    return { value: { kind: 'listed', productId, price, photoUrl } };
  }
  if (itemSource.kind === 'unlisted') {
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
    return { value: { kind: 'unlisted', title, metal, price, gramWeight, purity: optionalText(itemSource.purity, 20), photoUrl } };
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

  const paidBy = String(source.paidBy ?? '') as InStorePaymentMethod;
  if (!IN_STORE_PAYMENT_METHODS.includes(paidBy)) return { error: 'Pick how it was paid.' };

  const delivery = normalizeSaleDelivery(source.delivery, subtotal);
  if ('error' in delivery) return delivery;

  const totals = inStoreTotals(subtotal, {
    shippingFee: delivery.value.method === 'ship' ? delivery.value.shippingFee : 0,
    chargesTax: inStoreChargesTax(delivery.value.method, delivery.value.address?.state),
  });
  return {
    value: {
      items: items.value,
      customer: { name, phone: phone as string, email },
      delivery: delivery.value,
      paidBy,
      note: optionalText(source.note, IN_STORE_NOTE_MAX),
      // A request without the box (before 2026-10-21) kept the old rule: an email means a receipt.
      emailCopy: Boolean(email) && source.emailCopy !== false,
      ...totals,
    },
  };
}
