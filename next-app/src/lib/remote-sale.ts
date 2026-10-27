// Admin → Instant Sale → Remote sale (owner, mockup v2, 2026-10-21): the
// customer is NOT in the store. The admin sets up the items (the in-store item
// rules, `lib/in-store-sale.ts`), fills in what is known about the customer,
// and emails an INVOICE. It is a real unpaid order in Orders from the moment it
// is sent. The invoice offers the ways to pay the admin ticked:
//   - "Pay online": a private link to /pay/<token>, where the customer fills in
//     their details and pays through the site's own PayPal checkout (PayPal or
//     a card) — then the normal capture route marks it paid, sells the items,
//     ends the listings and sends the receipt, exactly like a web sale;
//   - Zelle, check, a call to pay by card: paid outside the site, then the
//     admin's "Record payment" records it the way an in-store sale is recorded.
// No reservation: listed items stay for sale until someone pays (the
// 2026-07-03 "whoever pays first" rule, as with counter-offers).
// Pure — no I/O; the routes and pages import it.
import { round2 } from '@/lib/checkout-pricing';
import {
  IN_STORE_METALS,
  IN_STORE_NOTE_MAX,
  IN_STORE_SHIPPING_CHOICES,
  IN_STORE_TITLE_MAX,
  SALE_ITEMS_MAX,
  isSalePhotoUrl,
  inStoreChargesTax,
  inStoreTotals,
  normalizeSaleCustomer,
  normalizeSaleDelivery,
  normalizeSaleItems,
  saleSubtotal,
  type InStoreDelivery,
  type InStoreItem,
  type InStoreMetal,
  type InStoreShippingChoice,
} from '@/lib/in-store-sale';
import { normalizePersonName } from '@/lib/person-name';
import { normalizePhoneNumber } from '@/lib/phone';
import { cityLine, streetLine } from '@/lib/business-location';
import { validateUsShippingAddress } from '@/lib/us-address';
import { normalizeTaxExemptSaleInput, type TaxExemptSaleChoice } from '@/lib/tax-exempt';

/**
 * Zelle (owner, 2026-10-21): the owner's own number "for now" — the business
 * Zelle is waiting for approval. When it is approved, change THIS line only.
 */
export const ZELLE_PAY_TO = '(239) 304-6229';
/** Checks (owner, 2026-10-21). */
export const CHECK_PAYABLE_TO = 'Naples Estate Jewelry';
export const PAY_BY_PHONE = '(239) 404-8505';

/** How long the Pay online link works. Resend starts the clock again. */
export const REMOTE_LINK_DAYS = [3, 7, 14] as const;
export type RemoteLinkDays = (typeof REMOTE_LINK_DAYS)[number];
export const REMOTE_LINK_DAYS_DEFAULT: RemoteLinkDays = 7;
export const REMOTE_MESSAGE_MAX = IN_STORE_NOTE_MAX;

export type RemotePayOptions = { online: boolean; zelle: boolean; check: boolean; phone: boolean };

export type RemoteSaleInput = {
  items: InStoreItem[];
  customer: { name: string; phone: string | null; email: string };
  delivery: InStoreDelivery;
  pay: RemotePayOptions;
  linkDays: RemoteLinkDays;
  message: string | null;
  note: string | null;
  /** "Tax-exempt sale" (owner, 2026-10-27): no Florida tax on the invoice or the pay page. */
  taxExempt: TaxExemptSaleChoice | null;
  /** The Florida tax the certificate took off, as the invoice stands (no address = taxed). */
  taxNotCharged: number;
  subtotal: number;
  shippingFee: number;
  tax: number;
  total: number;
};

/**
 * The invoice's tax rule = the web checkout's: a pickup is taxed; a shipment
 * is taxed to a Florida address and not elsewhere. With no address yet (the
 * customer types it when paying) the invoice is drawn WITH Florida tax, so the
 * total can only go down once an out-of-state address is in.
 */
export function remoteChargesTax(method: 'pickup' | 'ship', state: string | null | undefined): boolean {
  if (method === 'pickup' || !state) return true;
  return inStoreChargesTax('ship', state);
}

export function remoteTotals(
  subtotal: number,
  delivery: Pick<InStoreDelivery, 'method'> & { shippingFee?: number },
  state: string | null | undefined,
  /** A tax-exempt invoice (owner, 2026-10-27): no Florida tax, whatever the address. */
  taxExempt = false,
) {
  return inStoreTotals(subtotal, {
    shippingFee: delivery.method === 'ship' ? delivery.shippingFee ?? 0 : 0,
    chargesTax: !taxExempt && remoteChargesTax(delivery.method, state),
  });
}

function text(value: unknown, max: number): string | null {
  const clean = String(value ?? '').replace(/\s+/g, ' ').trim();
  return clean ? clean.slice(0, max) : null;
}

export function normalizeRemoteSaleInput(body: unknown): { value: RemoteSaleInput } | { error: string } {
  const source = (body ?? {}) as Record<string, unknown>;

  const items = normalizeSaleItems(source);
  if ('error' in items) return items;
  const subtotal = saleSubtotal(items.value);

  const customer = normalizeSaleCustomer(source.customer, { phone: 'optional', email: 'required' });
  if ('error' in customer) return customer;

  const delivery = normalizeSaleDelivery(source.delivery, subtotal, { shipAddress: 'optional' });
  if ('error' in delivery) return delivery;

  const payRaw = (source.pay ?? {}) as Record<string, unknown>;
  const pay: RemotePayOptions = {
    online: payRaw.online === true,
    zelle: payRaw.zelle === true,
    check: payRaw.check === true,
    phone: payRaw.phone === true,
  };
  if (!pay.online && !pay.zelle && !pay.check && !pay.phone) return { error: 'Tick at least one way for the customer to pay.' };

  const days = Number(source.linkDays ?? REMOTE_LINK_DAYS_DEFAULT) as RemoteLinkDays;
  if (!REMOTE_LINK_DAYS.includes(days)) return { error: 'Pick how long the link works.' };

  const message = String(source.message ?? '').trim();
  if (message.length > REMOTE_MESSAGE_MAX) return { error: `Keep the message under ${REMOTE_MESSAGE_MAX} characters.` };

  const taxExempt = normalizeTaxExemptSaleInput(source.taxExempt);
  if ('error' in taxExempt) return taxExempt;

  const owed = remoteTotals(subtotal, delivery.value, delivery.value.address?.state);
  const totals = taxExempt.value ? remoteTotals(subtotal, delivery.value, delivery.value.address?.state, true) : owed;
  return {
    value: {
      items: items.value,
      customer: { ...customer.value, email: customer.value.email as string },
      delivery: delivery.value,
      pay,
      linkDays: days,
      // Line breaks are kept in the message; runs of spaces are not.
      message: message ? message.replace(/[ \t]+/g, ' ') : null,
      note: text(source.note, IN_STORE_NOTE_MAX),
      taxExempt: taxExempt.value,
      taxNotCharged: taxExempt.value ? owed.tax : 0,
      ...totals,
    },
  };
}

// ---- Drafts (owner, 2026-10-21: "add save draft to the remote sale") -------
// "Save draft" keeps the form as typed in `remote_sale_drafts` — no order yet,
// so nothing shows in Orders. Any device can continue it; "Email invoice"
// from a draft deletes the draft. The form is cleaned and capped here so a
// stored draft can always be loaded back into the form.

export type RemoteDraftItem = {
  mode: 'listed' | 'unlisted';
  productId: string | null;
  title: string;
  metal: InStoreMetal;
  gramWeight: string;
  purity: string;
  price: string;
  photoUrl: string | null;
};

export type RemoteDraftForm = {
  items: RemoteDraftItem[];
  customer: { firstName: string; lastName: string; email: string; phone: string };
  delivery: {
    method: 'pickup' | 'ship';
    mailingOn: boolean;
    address: { line1: string; line2: string; city: string; state: string; zip: string };
    shipping: InStoreShippingChoice;
    customFee: string;
  };
  pay: RemotePayOptions;
  linkDays: RemoteLinkDays;
  message: string;
};

export type RemoteDraftCardData = { id: string; customer: string | null; itemCount: number; updatedAt: string };

function draftText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

/** Any stored or posted draft → a form the page can load. Never throws. */
export function sanitizeRemoteDraft(raw: unknown): RemoteDraftForm {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const items = (Array.isArray(source.items) ? source.items : []).slice(0, SALE_ITEMS_MAX).map((value) => {
    const item = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
    const metal = IN_STORE_METALS.includes(item.metal as InStoreMetal) ? (item.metal as InStoreMetal) : 'Gold';
    const productId = draftText(item.productId, 120).trim();
    return {
      mode: item.mode === 'unlisted' ? 'unlisted' : 'listed',
      productId: productId || null,
      title: draftText(item.title, IN_STORE_TITLE_MAX),
      metal,
      gramWeight: draftText(item.gramWeight, 20),
      purity: draftText(item.purity, 20),
      price: draftText(item.price, 20),
      photoUrl: isSalePhotoUrl(item.photoUrl) ? item.photoUrl : null,
    } satisfies RemoteDraftItem;
  });
  const customer = (source.customer && typeof source.customer === 'object' ? source.customer : {}) as Record<string, unknown>;
  const delivery = (source.delivery && typeof source.delivery === 'object' ? source.delivery : {}) as Record<string, unknown>;
  const address = (delivery.address && typeof delivery.address === 'object' ? delivery.address : {}) as Record<string, unknown>;
  const pay = (source.pay && typeof source.pay === 'object' ? source.pay : {}) as Record<string, unknown>;
  const shipping = IN_STORE_SHIPPING_CHOICES.includes(delivery.shipping as InStoreShippingChoice) ? (delivery.shipping as InStoreShippingChoice) : 'insured';
  const days = Number(source.linkDays) as RemoteLinkDays;
  return {
    items,
    customer: {
      firstName: draftText(customer.firstName, 80),
      lastName: draftText(customer.lastName, 80),
      email: draftText(customer.email, 160),
      phone: draftText(customer.phone, 40),
    },
    delivery: {
      method: delivery.method === 'ship' ? 'ship' : 'pickup',
      mailingOn: delivery.mailingOn === true,
      address: {
        line1: draftText(address.line1, 120),
        line2: draftText(address.line2, 60),
        city: draftText(address.city, 60),
        state: draftText(address.state, 20),
        zip: draftText(address.zip, 10),
      },
      shipping,
      customFee: draftText(delivery.customFee, 20),
    },
    // A draft saved with every box off reopens with the defaults (link + Zelle).
    pay: [pay.online, pay.zelle, pay.check, pay.phone].some((v) => v === true)
      ? { online: pay.online === true, zelle: pay.zelle === true, check: pay.check === true, phone: pay.phone === true }
      : { online: true, zelle: true, check: false, phone: false },
    linkDays: REMOTE_LINK_DAYS.includes(days) ? days : REMOTE_LINK_DAYS_DEFAULT,
    message: draftText(source.message, REMOTE_MESSAGE_MAX),
  };
}

/** Something worth keeping: a name, an email, or an item with anything in it. */
export function remoteDraftHasContent(form: RemoteDraftForm): boolean {
  const { firstName, lastName, email } = form.customer;
  return Boolean(firstName.trim() || lastName.trim() || email.trim())
    || form.items.some((item) => Boolean(item.productId || item.title.trim() || item.price.trim() || item.photoUrl));
}

/** The columns stored beside the form, for the Instant Sale list. */
export function remoteDraftSummary(form: RemoteDraftForm): { customer_name: string | null; item_count: number } {
  const name = `${form.customer.firstName.trim()} ${form.customer.lastName.trim()}`.trim();
  const counted = form.items.filter((item) => Boolean(item.productId || item.title.trim() || item.price.trim()));
  return { customer_name: name || null, item_count: counted.length };
}

/** Every sale photo a draft names — the Storage clean-up keeps these. */
export function remoteDraftPhotoUrls(raw: unknown): string[] {
  return sanitizeRemoteDraft(raw).items.flatMap((item) => (item.photoUrl ? [item.photoUrl] : []));
}

export function remoteLinkExpiry(from: Date, days: RemoteLinkDays): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

/** "Oct 28" in Naples time. */
export function formatRemoteDue(iso: string | Date, isEs = false): string {
  return new Date(iso).toLocaleDateString(isEs ? 'es-US' : 'en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
}

export type RemoteInvoiceState = 'open' | 'expired' | 'paid' | 'cancelled';

/** What the admin's invoice card shows. The pay link is admin-only data. */
export type RemoteInvoiceCardData = {
  id: string;
  orderId: string;
  orderNumber: string;
  customer: string;
  email: string | null;
  itemCount: number;
  total: number;
  ships: boolean;
  state: RemoteInvoiceState;
  expiresAt: string;
  sentCount: number;
  payUrl: string;
  payOnline: boolean;
};


export function remoteInvoiceState(
  row: { cancelled_at: string | null; expires_at: string },
  order: { payment_status: string | null; order_status: string | null },
  now: Date = new Date(),
): RemoteInvoiceState {
  const paid = ['paid', 'partially_refunded', 'refunded'].includes(String(order.payment_status ?? '').toLowerCase());
  if (paid) return 'paid';
  if (row.cancelled_at || String(order.order_status ?? '').toLowerCase() === 'cancelled') return 'cancelled';
  if (new Date(row.expires_at).getTime() <= now.getTime()) return 'expired';
  return 'open';
}

/** The "Other ways to pay" lines, the same in the email and on the pay page. */
export function remoteOtherWays(pay: RemotePayOptions, orderNumber: string): string[] {
  const lines: string[] = [];
  if (pay.zelle) lines.push(`Zelle to ${ZELLE_PAY_TO} — put ${orderNumber} in the memo.`);
  if (pay.check) lines.push(`Check payable to ${CHECK_PAYABLE_TO}, mailed to ${streetLine()}, ${cityLine()}, or brought to the showroom.`);
  if (pay.phone) lines.push(`Call ${PAY_BY_PHONE} to pay by card.`);
  return lines;
}

export function remotePayUrl(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/$/, '')}/pay/${encodeURIComponent(token)}`;
}

export type PayPageAddress = { line1: string; line2: string | null; city: string; state: string; postalCode: string };

export type PayPageCustomer = { name: string; email: string; phone: string; address: PayPageAddress | null };

/**
 * What the customer types on the pay page: name, email and cell always (the
 * receipt and the order's contact), the address only on a shipped invoice.
 */
export function normalizePayPageCustomer(
  raw: unknown,
  ships: boolean,
  isEs = false,
): { value: PayPageCustomer } | { error: string } {
  const source = (raw ?? {}) as Record<string, unknown>;
  const name = normalizePersonName(`${String(source.first_name ?? '')} ${String(source.last_name ?? '')}`);
  if (!name) return { error: isEs ? 'Escriba su nombre y apellido.' : 'Enter your first and last name.' };
  const email = String(source.email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: isEs ? 'Escriba un correo electrónico válido.' : 'Enter a valid email address.' };
  const phone = normalizePhoneNumber(String(source.phone ?? ''));
  if (!phone) return { error: isEs ? 'Escriba un número de celular válido.' : 'Enter a valid cell number.' };
  if (!ships) return { value: { name, email, phone, address: null } };

  const result = validateUsShippingAddress({
    line1: String(source.address_line1 ?? ''),
    line2: String(source.address_line2 ?? ''),
    city: String(source.city ?? ''),
    state: String(source.state ?? ''),
    postalCode: String(source.postal_code ?? ''),
    country: 'United States',
  });
  if (!result.address) return { error: result.error };
  const a = result.address;
  return {
    value: {
      name,
      email,
      phone,
      address: { line1: a.line1.slice(0, 120), line2: a.line2 ? a.line2.slice(0, 60) : null, city: a.city.slice(0, 60), state: a.state, postalCode: a.postalCode },
    },
  };
}

/**
 * The total for the address the customer has typed. Until a state is in, a
 * shipment shows WITH Florida tax — the figure the invoice email printed — so
 * the number only ever goes down (out of state), never up.
 */
export function payPageTotals(order: { subtotal: number; shipping_fee: number; shipping_method: string | null; tax_exempt?: boolean }, state: string | null) {
  const ships = order.shipping_method === 'shipping';
  return inStoreTotals(round2(order.subtotal), {
    shippingFee: ships ? order.shipping_fee : 0,
    // A tax-exempt invoice carries no Florida tax at any address.
    chargesTax: !order.tax_exempt && (ships ? remoteChargesTax('ship', state) : true),
  });
}
