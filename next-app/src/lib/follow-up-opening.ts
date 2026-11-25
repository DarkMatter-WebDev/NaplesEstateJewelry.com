/**
 * The thank-you's opening line, written per person by the AI (owner,
 * 2026-11-25: "integrate our AI agent to build each email… analyze what I put
 * on the receipt or in the order"). This file is the pure part: what the AI is
 * given, what it is told, and the checks its answer must pass before it is
 * stored. The calls and the database are `lib/follow-up-opening-server.ts`.
 *
 * Only the OPENING (1–2 sentences after "Hi Margaret,") is written per person.
 * The review request, the help box and the sign-off stay the same for everyone
 * (Google's review policy — see lib/follow-ups.ts).
 *
 * ⛔ The AI gets the first name, the language, the item NAMES (prices, weights
 * and quantities cut out first) and the owner's "Note for the thank-you
 * email". Never the receipt's printed Notes, never an amount, an address, an
 * ID detail, a phone number or an email.
 */

import type { FollowUpAudience, FollowUpLanguage } from '@/lib/follow-ups';

export const OPENING_MAX = 320;
export const OPENING_MIN = 20;
/** Owner-typed opening in Upcoming → Edit. */
export const OWNER_OPENING_MAX = 400;
/** A row whose AI answer failed this many times gets the standard line (no more calls). */
export const OPENING_MAX_TRIES = 3;
export const OPENING_SOURCES = ['ai', 'owner', 'standard'] as const;
export type OpeningSource = (typeof OPENING_SOURCES)[number];

export type OpeningInput = {
  audience: FollowUpAudience;
  language: FollowUpLanguage;
  firstName: string | null;
  /** Item names as cleaned by `cleanItemForAi`, at most 8. */
  pieces: string[];
  /** The owner's "Note for the thank-you email", or null. */
  note: string | null;
};

const MONEY = /(?:US)?\$\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d{2})\s?(?:usd|dollars?)\b/gi;
const WEIGHT = /\b\d+(?:[.,]\d+)?\s?(?:g|gr|grs|gram|grams|gramos|dwt|ozt|oz|ounces?|onzas?|ct|cts|ctw|tcw|carats?|kilates?\s+de\s+diamante|mm|cm|in|inch|inches|")(?![a-z])/gi;
const QTY_PREFIX = /^\s*(?:\d{1,3}\s?[x×]\s+|\(\d{1,3}\)\s*|qty\s*\d+\s*)/i;
/**
 * A measurement together with the little word in front of it (2026-11-25):
 * cutting only "5mm" out of "…Hueco de 5mm de Oro de 10K" left "Hueco de de
 * Oro" — the translated Spanish title was right; this cleaner made the typo.
 */
// Only the size / "of" words — never "with" / "con" ("ring with 1 ct diamonds" keeps its "with").
const LEAD_WORD = String.raw`(?:\b(?:de|del|of|x)\s+)?`;
const MONEY_WITH_LEAD = new RegExp(String.raw`(?:\b(?:for|por|at)\s+)?` + `(?:${MONEY.source})`, 'gi');
const WEIGHT_WITH_LEAD = new RegExp(LEAD_WORD + `(?:${WEIGHT.source})`, 'gi');
/** "de de", "of of" — a doubled little word, whatever left it behind. */
const DOUBLED_WORD = /\b(de|del|of|the|con|with|en|in|y|and)\s+\1\b/gi;

/**
 * "1 × 14K yellow gold sapphire ring, 4.2 g — $380.00" → "14K yellow gold sapphire ring".
 * Money, weights, sizes and quantity prefixes are cut out; what is left is the name.
 */
export function cleanItemForAi(description: string | null | undefined): string {
  let text = String(description ?? '').replace(/\s+/g, ' ').trim();
  text = text.replace(QTY_PREFIX, '');
  text = text.replace(MONEY_WITH_LEAD, ' ').replace(WEIGHT_WITH_LEAD, ' ').replace(/\s+/g, ' ').replace(DOUBLED_WORD, '$1');
  // what a cut leaves behind: "ring, , —" → "ring"
  text = text
    .replace(/\s*[—–-]\s*(?=[,;]|$)/g, '')
    .replace(/(?:\s*[,;:/|]\s*){2,}/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;:/|.\-–—]+|[\s,;:/|.\-–—]+$/g, '')
    .trim();
  return text.length > 90 ? `${text.slice(0, 87).trimEnd()}…` : text;
}

/** The pieces list the AI sees: cleaned, empty ones dropped, at most 8. */
export function piecesForAi(descriptions: Array<string | null | undefined>): string[] {
  return descriptions.map(cleanItemForAi).filter((piece) => piece.length > 0).slice(0, 8);
}

export const OPENING_SYSTEM_PROMPT = `You write the opening of a short thank-you email from Chris, the owner of Naples Estate Jewelry, a small local shop in Naples, Florida that buys and sells estate jewelry, gold, silver, coins, watches and antiques.

The email already starts with a greeting ("Hi Margaret,") and, after your text, asks for a Google review, gives the phone number and signs off. Write ONLY the opening: 1 or 2 sentences.

How it should read:
- Warm, plain and personal, in the first person ("I" or "we"), like a short note from a real person. No sales language.
- A SELLER sold us their things: thank them for coming in and trusting us with what they brought, naming the pieces in plain, everyday words. Start with something like "It was a pleasure meeting you {when}." and vary the wording.
- A BUYER bought something from us: thank them for choosing the piece and wish them joy with it. They may have bought online and had it shipped, so never say where or when they bought it, never say they came in, and do not use {when}.
- Do not use their name — the greeting already has it.
- For a seller, where you mention when you met, write the placeholder {when} exactly as written (it becomes "yesterday", "on Monday", "today" or "recently"). Never write a day or a date yourself.
- Name pieces simply: "your sapphire ring", "the sterling tea set", "your gold and the Silver Eagles". With many pieces, name two or three or group them ("your gold and silver pieces").
- If there is an owner's note, use it to make the line personal, gently and respectfully. Never invent facts, feelings or details that are not in the input.

Never:
- mention prices, amounts, weights, sizes, numbers of any kind (a karat mark like 14K is fine), how anything was priced or valued, or payment;
- mention reviews, Google, ratings, stars, discounts, offers, gifts or promises;
- write a greeting, a sign-off, a link, an emoji, or more than one exclamation mark.

Write in the language given. Spanish: formal "usted", natural Latin American Spanish.
Reply with the opening text only — no quotes, no notes.`;

/** The user message: the facts, as JSON. */
export function openingUserPrompt(input: OpeningInput): string {
  return JSON.stringify({
    audience: input.audience,
    language: input.language === 'es' ? 'Spanish' : 'English',
    first_name: input.firstName,
    pieces: input.pieces,
    owner_note: input.note && input.note.trim() ? input.note.trim() : null,
  });
}

const FORBIDDEN: Array<[RegExp, string]> = [
  [/https?:|www\.|@|\.com\b/i, 'a link or address'],
  [/\$|€|£/, 'money'],
  [/\b(?:reviews?|google|rating|rate us|stars?|reseñas?|calificaci[oó]n|estrellas?)\b/i, 'the review'],
  [/\bif you (?:enjoyed|loved|liked|were happy|had a (?:good|great))|\bsi (?:le gust[oó]|disfrut[oó]|qued[oó] contento)/i, 'review gating'],
  [/\b(?:price[sd]?|pricing|paid|pay|payment|offers?|melt|spot|worth|valued?|valuation|apprais\w*|cash|check|dollars?|precios?|pagamos|pag[oó]|pago|ofertas?|valor|tasaci[oó]n|efectivo|cheque|d[oó]lares)\b/i, 'money or pricing'],
  [/\b(?:discounts?|coupons?|deals?|sale|% off|guarantee[sd]?|free|descuentos?|cup[oó]n|garant\w*|gratis)\b/i, 'an offer or promise'],
  [/\b(?:today|yesterday|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|hoy|ayer|mañana|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/i, 'a day (must be {when})'],
  [/^(?:hi|hello|dear|hey|good (?:morning|afternoon)|hola|estimad[oa]|querid[oa])\b/i, 'a greeting'],
  [/\b(?:thank you again|best regards|sincerely|cordialmente|saludos)\b/i, 'a sign-off'],
  [/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'an emoji'],
];

/** Karat marks are the one number allowed: 14K, 18 kt, 22-karat, 10k. */
const KARAT = /\b\d{1,2}\s?-?\s?(?:k|kt|karat|quilates?)\b/gi;

export type OpeningCheck = { ok: true; text: string } | { ok: false; reason: string };

/**
 * The AI's answer, made safe to store, or why it is refused. A refused answer
 * is tried again (up to OPENING_MAX_TRIES), then the standard line is used.
 */
export function checkAiOpening(raw: string | null | undefined): OpeningCheck {
  let text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  // wrapping quotes the model sometimes adds
  text = text.replace(/^["“'‘]+|["”'’]+$/g, '').trim();
  if (text.length < OPENING_MIN) return { ok: false, reason: 'too short' };
  if (text.length > OPENING_MAX) return { ok: false, reason: 'too long' };

  // Only {when} may stand in braces, at most once.
  const braces = text.match(/\{[^}]*\}|[{}]/g) ?? [];
  if (braces.some((part) => part !== '{when}')) return { ok: false, reason: 'an unknown fill-in word' };
  if (braces.length > 1) return { ok: false, reason: '{when} more than once' };

  const plain = text.replace(/\{when\}/g, ' ');
  for (const [pattern, reason] of FORBIDDEN) {
    if (pattern.test(plain)) return { ok: false, reason };
  }
  if (/\d/.test(plain.replace(KARAT, ' '))) return { ok: false, reason: 'a number' };
  if ((plain.match(/!/g) ?? []).length > 1) return { ok: false, reason: 'too many exclamation marks' };
  const sentences = plain.split(/[.!?]+(?:\s|$)/).filter((part) => part.trim().length > 0);
  if (sentences.length > 3) return { ok: false, reason: 'too many sentences' };
  return { ok: true, text };
}

/** Upcoming → Edit: the owner's own words. Plain text; {when} / {first_name} / {item} allowed. */
export function normalizeOwnerOpening(raw: unknown): { value: string } | { error: string } {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return { error: 'Type the opening line, or use "Standard wording".' };
  if (text.length > OWNER_OPENING_MAX) return { error: `Keep it under ${OWNER_OPENING_MAX} characters.` };
  const unknown = (text.match(/\{[^}]*\}/g) ?? []).find((token) => !['{when}', '{first_name}', '{item}'].includes(token));
  if (unknown) return { error: `${unknown} is not a fill-in word here. Use {when}, {first_name} or {item}, or plain words.` };
  return { value: text };
}

export function isOpeningSource(value: unknown): value is OpeningSource {
  return typeof value === 'string' && (OPENING_SOURCES as readonly string[]).includes(value);
}

/** What Upcoming says under the opening. */
export function openingLabel(source: OpeningSource | null | undefined, aiOn: boolean): string {
  if (source === 'ai') return 'Written by the AI for this person';
  if (source === 'owner') return 'Your wording';
  if (source === 'standard') return 'Standard wording';
  return aiOn ? 'The AI writes this shortly (standard wording until then)' : 'Standard wording (AI openings are off)';
}
