// Who a printed business card belongs to — one entry per QR landing page.
//
// Why (2026-09-16): cards are printed once, people and numbers change. Each
// card holder gets their own URL (`/card`, `/kittcard`) so a reprint is never
// needed; the page behind it is the SAME component (`CardLanding`), and only
// the values here differ. Kitt's entry starts as Chris's details on purpose:
// customers who scan his card see exactly today's page until his own number
// is ready — then this file changes, nothing else.
//
// ⛔ Only these values may differ between the two pages. Layout, copy and
// links live in `components/card/CardLanding.tsx` so the cards cannot drift.

export type CardHolderKey = 'card' | 'kittcard';

export type CardHolder = {
  key: CardHolderKey;
  /** Locale-agnostic path printed on the card (the Spanish page is `/es` + this). */
  path: `/${CardHolderKey}`;
  /** First name used in "Text <name>" and the prefilled text message. */
  firstName: string;
  /** Formatted for the Call button label. */
  phoneDisplay: string;
  /** Digits only, for `tel:` and `sms:`. */
  phoneDigits: string;
  /**
   * Shown as a readable, tappable line on the card (owner, 2026-09-24, mockup
   * Option B) and used for the `mailto:`. The one monitored mailbox; a card
   * holder with their own inbox changes it here and nowhere else.
   */
  email: string;
};

const CHRIS = {
  firstName: 'Chris',
  phoneDisplay: '(239) 404-8505',
  phoneDigits: '2394048505',
  email: 'info@naplesestatejewelry.com',
} as const;

export const CARD_HOLDERS: Record<CardHolderKey, CardHolder> = {
  card: { key: 'card', path: '/card', ...CHRIS },
  // Kitt's cards link here. Until his own line is set up this deliberately
  // carries Chris's name and number; swap the three values when it is.
  kittcard: { key: 'kittcard', path: '/kittcard', ...CHRIS },
};

/** Every holder path, for the sitemap guard (none of these may ever be listed). */
export const CARD_HOLDER_PATHS = Object.values(CARD_HOLDERS).map((holder) => holder.path);
