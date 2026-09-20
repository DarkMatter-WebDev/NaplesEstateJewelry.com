// The site's Call / Text / Directions hrefs for customer-facing contact CTAs.
//
// Why (2026-09-20): four places on the site say "call or text" but only ever
// dialled, and the phone contact bar needs the same three links. The phone
// number was never centralised for the older `tel:` links (see the note at the
// top of `business-location.ts`); new CTAs read it from here so that mistake is
// not repeated.
//
// ⛔ Customer-facing Call and Text links ALWAYS use the owner's cell below. The
// toll-free Twilio number that sends text deals is an outbound marketing sender
// whose replies run through the YES/STOP handler — a seller who texts it never
// reaches Chris. It must never appear in a `tel:` or `sms:` href
// (`DECISIONS.md` → "Text deals: the reply is the claim…").

import { mapsUrl } from './business-location';

/** Digits only — the form every existing `tel:` href on the site uses. */
export const CONTACT_PHONE_DIGITS = '2394048505';

export const CONTACT_PHONE_DISPLAY = '(239) 404-8505';

export const TEL_HREF = `tel:${CONTACT_PHONE_DIGITS}`;

/**
 * A text-message link, optionally with a prefilled opening line.
 *
 * `?&body=`: iOS wants `&`, Android wants `?`; this form satisfies both (the
 * same form the business-card page has used since 2026-09-03).
 */
export function smsHref(body?: string): string {
  const text = body?.trim();
  return text
    ? `sms:${CONTACT_PHONE_DIGITS}?&body=${encodeURIComponent(`${text} `)}`
    : `sms:${CONTACT_PHONE_DIGITS}`;
}

/** The opening line a seller's text starts with — they finish the sentence. */
export function sellerTextBody(isEs: boolean): string {
  return isEs
    ? 'Hola, tengo algo que quisiera vender. Le envío fotos:'
    : 'Hi, I have something I’d like to sell. Sending photos:';
}

/** Google Maps directions to the showroom, built from the one address source. */
export function directionsHref(): string {
  return mapsUrl();
}
