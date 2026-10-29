/**
 * "How did you hear about us?" — the one optional question on the Order
 * Received screen (2026-10-29, owner's mockup 2). ONE answer per order, saved
 * as an English KEY on `orders.heard_about` (+ `heard_about_other` for typed
 * text) so a Spanish answer counts the same as an English one. Shown in Admin
 * → Orders → the order's Customer card as "Heard about us".
 *
 * ⛔ Keys are stored data: never rename one. To drop a choice, remove it from
 * HEARD_ABOUT_CHOICES but keep it readable in `heardAboutAdminLabel` (old
 * orders still carry it). SQL: `supabase/order-heard-about-2026-10.sql`.
 */

export const HEARD_ABOUT_OTHER_MAX = 80;

export const HEARD_ABOUT_CHOICES = [
  { key: 'google_search', en: 'Google Search', es: 'Búsqueda de Google' },
  { key: 'google_maps', en: 'Google Maps', es: 'Google Maps' },
  { key: 'instagram', en: 'Instagram', es: 'Instagram' },
  { key: 'facebook', en: 'Facebook', es: 'Facebook' },
  { key: 'tiktok', en: 'TikTok', es: 'TikTok' },
  { key: 'yelp', en: 'Yelp', es: 'Yelp' },
  { key: 'nextdoor', en: 'Nextdoor', es: 'Nextdoor' },
  { key: 'ai_assistant', en: 'ChatGPT / AI assistant', es: 'ChatGPT / asistente de IA' },
  { key: 'friend_family', en: 'Friend or family', es: 'Amigo o familiar' },
  { key: 'showroom', en: 'Passed the showroom', es: 'Pasé frente a la tienda' },
  { key: 'ebay_etsy', en: 'eBay or Etsy', es: 'eBay o Etsy' },
] as const;

export const HEARD_ABOUT_OTHER = { key: 'other', en: 'Other…', es: 'Otro…' } as const;

export type HeardAboutKey = (typeof HEARD_ABOUT_CHOICES)[number]['key'] | typeof HEARD_ABOUT_OTHER.key;

const KNOWN_KEYS = new Set<string>([...HEARD_ABOUT_CHOICES.map((c) => c.key), HEARD_ABOUT_OTHER.key]);

export type HeardAboutAnswer = { heardAbout: HeardAboutKey; heardAboutOther: string | null };

/**
 * Validates a submitted answer. A known key only; "other" needs non-empty
 * typed text (trimmed, whitespace collapsed, capped); any other key drops the
 * text. Returns null when the answer is unusable.
 */
export function normalizeHeardAbout(key: unknown, other: unknown): HeardAboutAnswer | null {
  if (typeof key !== 'string' || !KNOWN_KEYS.has(key)) return null;
  if (key !== HEARD_ABOUT_OTHER.key) return { heardAbout: key as HeardAboutKey, heardAboutOther: null };
  const text = typeof other === 'string' ? other.replace(/\s+/g, ' ').trim().slice(0, HEARD_ABOUT_OTHER_MAX).trim() : '';
  if (!text) return null;
  return { heardAbout: 'other', heardAboutOther: text };
}

/** Admin line: "Instagram", or "Other — “Naples farmers market”". Null when unanswered. */
export function heardAboutAdminLabel(key: string | null | undefined, other: string | null | undefined): string | null {
  if (!key) return null;
  if (key === HEARD_ABOUT_OTHER.key) return other ? `Other — “${other}”` : 'Other';
  return HEARD_ABOUT_CHOICES.find((c) => c.key === key)?.en ?? key;
}
