import {
  calculateFlSalesTax,
  chargesFlSalesTax,
  formatCheckoutCurrency,
  round2,
} from '@/lib/checkout-pricing';
import {
  getCheckoutShippingFee,
  getCheckoutShippingOption,
  isCheckoutShippingMethod,
} from '@/lib/checkout-shipping';

/**
 * "Make an Offer" on the site shop — the pure rules (owner, 2026-10-15,
 * mockup v2). Shared by the buyer pages, the routes, the admin and the tests.
 *
 * The model is eBay's: the buyer's offer HOLDS the full amount (offer +
 * shipping + tax) through PayPal; the owner's Accept charges that hold at once,
 * so a buyer cannot back out of an accepted offer. Decline, 72 hours or the
 * item selling another way releases the hold. A counter releases the hold and
 * sends the buyer a private link to buy at the counter price for 72 hours.
 *
 * ⛔ No automatic accept, decline or floor price — every offer reaches the
 * owner and is their decision (same rule as eBay Best Offer, 2026-10-14).
 */

/** How long the owner has to answer — PayPal's full 3-day guaranteed hold. */
export const OFFER_WINDOW_HOURS = 72;
/** How long a counter-offer's Buy-now link works. */
export const COUNTER_WINDOW_HOURS = 72;
/** A pending offer whose PayPal window was never approved is closed after this. */
export const OFFER_ABANDON_AFTER_MINUTES = 180;
export const OFFER_MESSAGE_MAX = 500;
/** The owner's message to a buyer on a counter or a decline (both live in `counter_note`). */
export const OWNER_NOTE_MAX = 300;
/** @deprecated name kept for older imports — the same limit as OWNER_NOTE_MAX. */
export const COUNTER_NOTE_MAX = OWNER_NOTE_MAX;

const HOUR_MS = 60 * 60 * 1000;

export const OFFER_STATUSES = [
  'pending',
  'open',
  'accepted',
  'declined',
  'expired',
  'countered',
  'counter_bought',
  'counter_expired',
  'item_sold',
  'failed',
  'abandoned',
] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export function isOfferStatus(value: unknown): value is OfferStatus {
  return typeof value === 'string' && (OFFER_STATUSES as readonly string[]).includes(value);
}

/** The admin's words for each status (Offers page). */
export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  pending: 'Waiting for PayPal',
  open: 'Open',
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'Expired',
  countered: 'Countered',
  counter_bought: 'Bought at counter',
  counter_expired: 'Counter expired',
  item_sold: 'Item sold',
  failed: 'Payment failed',
  abandoned: 'Not completed',
};

/** The filter chips on Admin → Offers, and which statuses each shows. */
export const OFFER_FILTERS = ['open', 'countered', 'accepted', 'declined', 'expired', 'all'] as const;
export type OfferFilter = (typeof OFFER_FILTERS)[number];

export const OFFER_FILTER_LABELS: Record<OfferFilter, string> = {
  open: 'Open',
  countered: 'Countered',
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'Expired',
  all: 'All',
};

export function statusesForFilter(filter: OfferFilter): OfferStatus[] {
  switch (filter) {
    case 'open':
      return ['open'];
    case 'countered':
      return ['countered'];
    case 'accepted':
      return ['accepted', 'counter_bought'];
    case 'declined':
      return ['declined'];
    case 'expired':
      return ['expired', 'counter_expired', 'item_sold', 'failed'];
    case 'all':
      // A pending row never had money held and an abandoned one never will.
      return OFFER_STATUSES.filter((status) => status !== 'pending' && status !== 'abandoned');
  }
}

/**
 * The PayPal reference (reference_id / custom_id) on an offer's PayPal order.
 *
 * ⛔ Never the bare offer id. The PayPal webhook reads a uuid-shaped custom_id
 * as an ORDER id (`app/api/paypal/webhook/route.ts` → `uuidLike`); a bare offer
 * uuid there would send the capture event looking for an order that does not
 * exist. With the prefix it falls back to the PayPal order id, which the
 * accepted offer's order carries.
 */
export function offerPayPalReference(offerId: string): string {
  return `offer-${offerId}`;
}

/** "1,100", "$1,100.50", 1100 → 1100 / 1100.5. Null when not a positive amount. */
export function parseOfferAmount(input: unknown): number | null {
  if (typeof input === 'number') {
    return Number.isFinite(input) && input > 0 ? round2(input) : null;
  }
  if (typeof input !== 'string') return null;
  const cleaned = input.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? round2(value) : null;
}

export type OfferAmountProblem = 'missing' | 'too_low' | 'not_below_price';

/**
 * The only checks on an amount: it is a real amount, at least $1, and below the
 * item's current price (at or above it, the buyer should simply buy it). No
 * floor — the owner's ruling.
 */
export function offerAmountProblem(amount: number | null, listedPrice: number | null): OfferAmountProblem | null {
  if (amount == null) return 'missing';
  if (amount < 1) return 'too_low';
  if (listedPrice != null && listedPrice > 0 && amount >= listedPrice) return 'not_below_price';
  return null;
}

export function offerAmountMessage(problem: OfferAmountProblem, listedPrice: number | null, isEs: boolean): string {
  const price = listedPrice != null ? formatCheckoutCurrency(listedPrice) : null;
  switch (problem) {
    case 'missing':
      return isEs ? 'Escriba el monto de su oferta.' : 'Enter the amount of your offer.';
    case 'too_low':
      return isEs ? 'La oferta debe ser de al menos $1.00.' : 'An offer must be at least $1.00.';
    case 'not_below_price':
      return isEs
        ? `Su oferta debe ser menor que ${price}. A ese precio, simplemente agréguelo a su carrito.`
        : `Your offer must be below ${price}. At that price, just add it to your cart.`;
  }
}

export type OfferTotals = {
  subtotal: number;
  shippingFee: number;
  tax: number;
  total: number;
};

/**
 * What an offer holds (and charges if accepted): the offer as the merchandise
 * subtotal, the checkout's own shipping tier for that subtotal, and Florida tax
 * on merchandise + shipping when it applies. The SAME arithmetic as
 * `buildOrderDraft` (lib/checkout-pricing.ts) with the price replaced by the
 * offer, so the hold and the order written on Accept agree to the cent.
 * Null when the shipping method is unknown or not offered at this subtotal.
 */
export function computeOfferTotals(
  amount: number,
  shippingMethod: string,
  shippingState: string | null | undefined,
): OfferTotals | null {
  if (!(amount > 0) || !isCheckoutShippingMethod(shippingMethod)) return null;
  const subtotal = round2(amount);
  const shippingFee = getCheckoutShippingFee(shippingMethod, subtotal);
  if (shippingFee === null) return null;
  const tax = chargesFlSalesTax(shippingMethod, shippingState) ? calculateFlSalesTax(subtotal, shippingFee) : 0;
  return { subtotal, shippingFee, tax, total: round2(subtotal + shippingFee + tax) };
}

export function offerExpiresAt(authorizedAt: Date): Date {
  return new Date(authorizedAt.getTime() + OFFER_WINDOW_HOURS * HOUR_MS);
}

export function counterExpiresAt(sentAt: Date): Date {
  return new Date(sentAt.getTime() + COUNTER_WINDOW_HOURS * HOUR_MS);
}

/** Whole hours left, rounded down, never negative (the Offers page clock). */
export function hoursLeft(expiresAt: string | Date | null | undefined, now: Date = new Date()): number {
  if (!expiresAt) return 0;
  const end = typeof expiresAt === 'string' ? Date.parse(expiresAt) : expiresAt.getTime();
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, Math.floor((end - now.getTime()) / HOUR_MS));
}

function isPast(value: string | null | undefined, now: Date): boolean {
  if (!value) return true;
  const time = Date.parse(value);
  return !Number.isFinite(time) || time <= now.getTime();
}

/** An offer the owner can still accept, counter or decline. */
export function isOfferLive(offer: { status: string; expires_at: string | null }, now: Date = new Date()): boolean {
  return offer.status === 'open' && !isPast(offer.expires_at, now);
}

/** A counter whose Buy-now link still works. */
export function isCounterLive(
  offer: { status: string; counter_expires_at: string | null },
  now: Date = new Date(),
): boolean {
  return offer.status === 'countered' && !isPast(offer.counter_expires_at, now);
}

export type CounterAmountProblem = 'missing' | 'not_above_offer' | 'not_below_price';

/** A counter sits strictly between the buyer's offer and today's price. */
export function counterAmountProblem(
  counter: number | null,
  offerAmount: number,
  listedPrice: number | null,
): CounterAmountProblem | null {
  if (counter == null) return 'missing';
  if (counter <= offerAmount) return 'not_above_offer';
  if (listedPrice != null && listedPrice > 0 && counter >= listedPrice) return 'not_below_price';
  return null;
}

export function counterAmountMessage(problem: CounterAmountProblem, offerAmount: number, listedPrice: number | null): string {
  switch (problem) {
    case 'missing':
      return 'Enter the counter-offer amount.';
    case 'not_above_offer':
      return `The counter must be above their offer of ${formatCheckoutCurrency(offerAmount)}.`;
    case 'not_below_price':
      return `The counter must be below today's price of ${formatCheckoutCurrency(listedPrice ?? 0)}.`;
  }
}

/** 1100 of 1240 → 89. Null when there is no listed price to compare with. */
export function percentOfListed(amount: number, listedPrice: number | null): number | null {
  if (listedPrice == null || !(listedPrice > 0)) return null;
  return Math.round((amount / listedPrice) * 100);
}

/**
 * Whether the admin's words to the AI listing assistant are about offers at all.
 * The assistant may tick or untick "Accept offers" ONLY when the admin says so
 * (owner, 2026-10-15) — this is the deterministic guard behind the prompt rule:
 * without one of these words in what the admin said, the AI's value is dropped.
 */
export function mentionsOffers(text: string | null | undefined): boolean {
  if (!text) return false;
  return /\b(?:offers?|best offer|make offer|ofertas?)\b/i.test(text);
}

/**
 * Which buyer email a status sends. Null = none: accepted ones get the normal
 * PAID receipt; a failed charge is the owner's phone call ("not accepted" would
 * be untrue); an expired counter was dated in its own email.
 */
export type OfferBuyerEmail = 'received' | 'declined' | 'expired' | 'item_sold' | 'countered';

export function buyerEmailForStatus(status: OfferStatus): OfferBuyerEmail | null {
  switch (status) {
    case 'open':
      return 'received';
    case 'declined':
      return 'declined';
    case 'expired':
      return 'expired';
    case 'item_sold':
      return 'item_sold';
    case 'countered':
      return 'countered';
    default:
      return null;
  }
}

const EASTERN = 'America/New_York';

/** "Sun Oct 18, 3:12 PM" (Eastern) — the deadline line in emails, texts and the admin. */
export function formatOfferDeadline(value: string | Date | null | undefined, isEs = false): string {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat(isEs ? 'es-US' : 'en-US', {
    timeZone: EASTERN,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  const dayPeriod = part('dayPeriod').toUpperCase().replace(/\./g, '').replace(/\s+/g, '');
  return `${part('weekday').replace('.', '')} ${part('month').replace('.', '')} ${part('day')}, ${part('hour')}:${part('minute')} ${dayPeriod}`.trim();
}

export function shippingMethodLabel(method: string, isEs = false): string {
  const option = getCheckoutShippingOption(method);
  if (!option) return method;
  return isEs ? option.labelEs : option.labelEn;
}

/**
 * The text to the owner's cell when an offer arrives (owner's answer 5 on
 * 10-15: email + text). Plain words, one message.
 */
export function ownerOfferTextBody(input: {
  amount: number;
  title: string;
  inventoryNumber: string | null;
  listedPrice: number | null;
  customerName: string;
  shippingMethod: string;
  expiresAt: string | Date | null;
  adminUrl: string;
}): string {
  const item = input.inventoryNumber ? `${input.title} (#${input.inventoryNumber})` : input.title;
  const listed = input.listedPrice ? `, listed ${formatCheckoutCurrency(input.listedPrice)}` : '';
  const delivery = input.shippingMethod === 'local-pickup' ? 'pickup' : 'shipping';
  return `NEJ offer: ${formatCheckoutCurrency(input.amount)} on ${item}${listed}. ${input.customerName}, ${delivery}. Answer by ${formatOfferDeadline(input.expiresAt)}: ${input.adminUrl}`;
}

/**
 * Deleting an old offer (owner mockup v4, 2026-10-15) — the ONE rule, used by
 * the page (which buttons show) and the server (which rows really go).
 *  - Open: never — PayPal is holding the buyer's money; Decline releases it.
 *  - Countered with a live link: never — the buyer's Buy-now link would die
 *    with no word to them. Once the 72 hours pass it can go.
 *  - A hold still held or whose release PayPal refused (`release_failed`, the
 *    sweep is retrying): not yet — the row is how the retry finds it.
 *  - Everything else (accepted, bought at counter, declined, expired, counter
 *    expired, item sold, payment failed, abandoned): yes. An accepted offer's
 *    order stays under Orders (`orders.offer_id` goes to null).
 * Null = deletable; otherwise the reason, in the owner's words.
 */
export function offerDeleteBlock(
  offer: { status: string; hold_status?: string | null; counter_expires_at?: string | null },
  now: Date = new Date(),
): string | null {
  if (offer.status === 'open' || offer.status === 'pending') {
    return "Open offers can't be deleted — PayPal is holding the buyer's money. Decline releases it.";
  }
  if (offer.status === 'countered' && isCounterLive({ status: offer.status, counter_expires_at: offer.counter_expires_at ?? null }, now)) {
    return "This counter's Buy-now link is still live. It can be deleted once the 72 hours pass.";
  }
  if (offer.hold_status === 'held' || offer.hold_status === 'release_failed') {
    return 'PayPal has not released this hold yet — it can be deleted once the release goes through.';
  }
  return null;
}

/** At most this many offers per delete. */
export const OFFER_DELETE_MAX = 500;

/** At most this many items per "Set all accept offers / no offers" run. */
export const BULK_ACCEPTS_OFFERS_MAX = 1000;

/**
 * The body of the bulk "Set all accept offers" / "Set all no offers" action
 * (Products → select → Actions, owner 2026-10-15): unique, non-empty product
 * ids and an explicit on/off.
 */
export function parseBulkAcceptsOffers(body: unknown): { productIds: string[]; enabled: boolean } | { error: string } {
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  if (typeof input.enabled !== 'boolean') return { error: 'Say whether offers go on or off.' };
  const raw = Array.isArray(input.productIds) ? input.productIds : [];
  const productIds = Array.from(new Set(raw.filter((id): id is string => typeof id === 'string' && id.trim() !== '').map((id) => id.trim())));
  if (productIds.length === 0) return { error: 'Select at least one item.' };
  if (productIds.length > BULK_ACCEPTS_OFFERS_MAX) return { error: `Select at most ${BULK_ACCEPTS_OFFERS_MAX} items at a time.` };
  return { productIds, enabled: input.enabled };
}

/** The one line the Products page shows after the bulk action. */
export function bulkAcceptsOffersMessage(enabled: boolean, updated: number, openOffersLeft: number): string {
  const items = `${updated} ${updated === 1 ? 'item' : 'items'}`;
  if (enabled) return `Accept offers is on for ${items} — each shows Make an Offer on its page.`;
  const open = openOffersLeft > 0
    ? ` ${openOffersLeft} open ${openOffersLeft === 1 ? 'offer stays' : 'offers stay'} open until you answer ${openOffersLeft === 1 ? 'it' : 'them'} in Offers.`
    : '';
  return `Accept offers is off for ${items} — no Make an Offer button.${open}`;
}

/**
 * The buyer's name for the admin card: a word typed all in lower case gets a
 * capital first letter ("christopher surette" → "Christopher Surette"); a word
 * with any capital ("McDonald", "DeLuca") is left exactly as typed. Display
 * only — emails and orders keep what the buyer typed (owner, 2026-10-15).
 */
export function displayBuyerName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((word) => (word === word.toLowerCase() ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');
}

/** Bounded, single-spaced free text (the buyer's message, the owner's counter note). */
export function cleanOfferText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/\u0000/g, '').replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, max) : null;
}
