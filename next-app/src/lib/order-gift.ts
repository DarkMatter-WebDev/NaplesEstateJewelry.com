import { composeFullName } from '@/lib/person-name';

/**
 * "This is a gift" at checkout (owner-approved mockup, 2026-10-29).
 *
 * Shipping: the buyer names the RECIPIENT (the package and PayPal's shipping
 * name use it, so PayPal Seller Protection still matches where it went) and
 * may add a message. Local Pickup: message only. The owner prints a gift slip
 * from admin — item names, the message, the order number, no prices.
 *
 * Columns `orders.is_gift`, `gift_recipient_name`, `gift_message`
 * (`supabase/order-gift-2026-10.sql`). Pure + client-safe; the server side is
 * `order-gift-server.ts`.
 */

export const GIFT_MESSAGE_MAX = 250;
export const GIFT_NAME_MAX = 120;

export interface OrderGift {
  /** Null on a Local Pickup gift. */
  recipientName: string | null;
  message: string | null;
}

/** What checkout posts as `gift` (absent or `isGift: false` = not a gift). */
export interface GiftInput {
  isGift?: unknown;
  recipientFirst?: unknown;
  recipientLast?: unknown;
  message?: unknown;
}

function cleanMessage(value: unknown): string | null {
  const text = String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, GIFT_MESSAGE_MAX)
    .trim();
  return text || null;
}

/**
 * The server's reading of the checkbox. A shipped gift needs the recipient's
 * first AND last name (same rule as the buyer's own name); a pickup gift
 * never carries one.
 */
export function normalizeGift(
  input: unknown,
  needsShipping: boolean,
): { gift: OrderGift | null } | { error: string } {
  const raw = (input && typeof input === 'object' ? input : {}) as GiftInput;
  if (raw.isGift !== true) return { gift: null };
  const message = cleanMessage(raw.message);
  if (!needsShipping) return { gift: { recipientName: null, message } };
  const recipientName = composeFullName(raw.recipientFirst, raw.recipientLast);
  if (!recipientName) return { error: giftRecipientMissingMessage(false) };
  return { gift: { recipientName: recipientName.slice(0, GIFT_NAME_MAX), message } };
}

export function giftRecipientMissingMessage(isEs: boolean): string {
  return isEs
    ? 'Escriba el nombre y el apellido de la persona que recibe el regalo.'
    : 'Enter the gift recipient’s first and last name.';
}

/**
 * Written into `customer_notes` when the gift columns are missing (SQL not run
 * yet), so the owner still sees it on the order.
 */
export function giftNotesFallback(gift: OrderGift, existingNotes: string | null): string {
  const line = [
    '🎁 GIFT',
    gift.recipientName ? `for ${gift.recipientName}` : null,
    gift.message ? `— message: “${gift.message}”` : null,
    '— print a gift slip, no prices in the box.',
  ].filter(Boolean).join(' ');
  return existingNotes ? `${line}\n\n${existingNotes}` : line;
}

/** The line on the buyer's receipt email (English, like the rest of it). */
export function giftReceiptNote(gift: OrderGift): string {
  const message = gift.message ? ` Your message: “${gift.message}”.` : '';
  return gift.recipientName
    ? `🎁 A gift for ${gift.recipientName}.${message} The package will have a gift slip with your message and no prices.`
    : `🎁 A gift.${message} We’ll hand it over with a gift slip — no prices.`;
}

/** The line on the Order Received screen. */
export function giftReceivedLine(gift: OrderGift, isEs: boolean): string {
  if (gift.recipientName) {
    return isEs
      ? `🎁 Regalo para ${gift.recipientName}: el paquete llevará su mensaje y ningún precio. Su recibo está en su correo.`
      : `🎁 Gift for ${gift.recipientName} — the package will have your message and no prices. Your receipt is in your email.`;
  }
  return isEs
    ? '🎁 Regalo: lo entregaremos con una tarjeta de regalo, sin precios. Su recibo está en su correo.'
    : '🎁 Gift — we’ll hand it over with a gift slip, no prices. Your receipt is in your email.';
}
