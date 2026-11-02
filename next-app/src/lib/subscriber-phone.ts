/**
 * Text-alert sign-ups: the phone number rules, the channel choice and the
 * consent wording — pure, so the API route, the homepage window and the
 * admin table all agree and the rules are testable without a browser.
 *
 * Numbers are US only for now (the showroom's whole audience) and are stored
 * in the international form (+1 and ten digits) so a later texting provider
 * takes them as-is. Anything that is not a dialable US number is rejected
 * rather than "cleaned up" into a wrong one.
 *
 * ⛔ The consent text is what the visitor SAW when they ticked the box. It is
 * stored on the row (`sms_consent_text`) as the record of consent, so a
 * rewording here must bump `SMS_CONSENT_VERSION` — old rows keep the wording
 * they agreed to. Carriers ask for this exact set of statements before they
 * approve a business texting number: who is texting, that it is recurring
 * automated marketing, not a condition of purchase, frequency, rates, STOP /
 * HELP, and links to the privacy policy and the text terms.
 */

export type SubscribeChannel = 'email' | 'text' | 'both';
export type SmsStatus = 'pending' | 'confirmed' | 'stopped';

export const SUBSCRIBE_CHANNELS: readonly SubscribeChannel[] = ['email', 'text', 'both'];

/** Parses the channel a sign-up asked for; anything unrecognised is email-only, as the old form was. */
export function parseSubscribeChannel(value: unknown): SubscribeChannel {
  return value === 'text' || value === 'both' ? value : 'email';
}

export function channelWantsEmail(channel: SubscribeChannel): boolean {
  return channel === 'email' || channel === 'both';
}

export function channelWantsText(channel: SubscribeChannel): boolean {
  return channel === 'text' || channel === 'both';
}

/**
 * A dialable US number in E.164 (`+12395550148`), or null.
 *
 * Accepts the ways people type a number — spaces, dashes, dots, brackets, a
 * leading 1 or +1 — and rejects the rest: fewer or more than ten digits after
 * the country code, an area code or exchange starting with 0 or 1 (not valid
 * in the North American plan), or the 555-01XX fiction block.
 */
export function normalizeUsPhone(input: unknown): string | null {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  // Only digits, and the characters people use as separators, are allowed;
  // letters or other symbols mean this is not a phone number at all.
  if (!/^[+\d\s().\-]+$/.test(raw)) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return null;
  if (/^\d{3}555(01\d{2})$/.test(digits)) return null;
  return `+1${digits}`;
}

/** `+12395550148` → `(239) 555-0148`; any other shape is returned untouched. */
export function formatUsPhone(e164: string | null | undefined): string {
  if (!e164) return '';
  const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  if (!match) return e164;
  return `(${match[1]}) ${match[2]}-${match[3]}`;
}

export const SMS_CONSENT_VERSION = 1;

/**
 * The consent statement shown under the text checkbox, per language. Links
 * are rendered by the window from `SMS_CONSENT_LINKS`; the stored text carries
 * the link labels in place so the record reads as the visitor saw it.
 */
export const SMS_CONSENT_TEXT: Record<'en' | 'es', string> = {
  en: 'By checking the box you agree to receive recurring automated marketing texts from Naples Estate Jewelry at this number. Consent is not a condition of purchase. Message frequency varies. Msg & data rates may apply. Reply STOP to cancel, HELP for help. Privacy Policy · Text Message Terms.',
  es: 'Al marcar la casilla acepta recibir mensajes de texto de marketing automatizados y recurrentes de Naples Estate Jewelry en este número. El consentimiento no es condición de compra. La frecuencia de mensajes varía. Pueden aplicarse tarifas de mensajes y datos. Responda STOP para cancelar, HELP para ayuda. Política de Privacidad · Términos de Mensajes de Texto.',
};

/** The two link labels inside the consent text, and where they go (locale-agnostic paths). */
export const SMS_CONSENT_LINKS = {
  privacy: { path: '/privacy', label: { en: 'Privacy Policy', es: 'Política de Privacidad' } },
  terms: { path: '/terms#text-messages', label: { en: 'Text Message Terms', es: 'Términos de Mensajes de Texto' } },
} as const;

export function smsConsentText(locale: string): string {
  return locale === 'es' ? SMS_CONSENT_TEXT.es : SMS_CONSENT_TEXT.en;
}

/** The tick box in Admin → Subscribers → Add Subscriber (owner wording, 2026-11-02). */
export const ADMIN_SMS_CONSENT_LABEL = 'Sign them up for text deals.';

/**
 * The record of consent stored for a number the owner adds by hand, because
 * the customer asked in person or on the phone (owner, 2026-11-02). It is not
 * the website statement — the customer never saw that box — so it carries no
 * `SMS_CONSENT_VERSION`. The double opt-in still applies: the row is
 * `pending` and gets the same "reply YES" text as a web sign-up; nothing else
 * is sent until the customer answers YES from their own phone.
 */
export const ADMIN_SMS_CONSENT_TEXT =
  `Added by the shop in Admin > Subscribers at the customer's request ("${ADMIN_SMS_CONSENT_LABEL}" ticked). The customer confirms by replying YES to the confirmation text; no deals are sent before that.`;

/** "Email", "Text" or "Both" for the admin table, from the row's stored fields. */
export function subscriberChannelLabel(row: { email: string | null; phone: string | null }): 'Email' | 'Text' | 'Both' | '—' {
  const hasEmail = Boolean(row.email);
  const hasPhone = Boolean(row.phone);
  if (hasEmail && hasPhone) return 'Both';
  if (hasPhone) return 'Text';
  if (hasEmail) return 'Email';
  return '—';
}

export function smsStatusLabel(status: SmsStatus | null | undefined): string {
  switch (status) {
    case 'confirmed':
      return 'Confirmed';
    case 'pending':
      return 'Pending YES';
    case 'stopped':
      return 'Stopped';
    default:
      return '';
  }
}
