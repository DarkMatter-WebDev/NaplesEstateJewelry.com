import { BUY_RECEIPT_ID_TYPES, easternDayKey, type BuyReceiptDraft, type BuyReceiptIdType } from '@/lib/buy-receipts';

/**
 * "Fill form from ID" on the buy receipt (owner, 2026-10-09).
 *
 * With the box ticked, the photo of the seller's ID is read by the AI and the
 * seller boxes that are still EMPTY are filled in. Anything already typed — by
 * the owner, or by the seller in customer input mode — is left exactly as it
 * is. Phone and email are not on a license, so they are never filled.
 *
 * This file is the pure half: what the AI is asked for, how its answer is
 * checked, and which boxes may be written. The call itself lives in
 * `buy-receipt-id-read-provider.ts` (server only).
 *
 * ⛔ The model's answer is never trusted as it comes: every value goes through
 * `coerceIdRead`, and a value that does not have the shape the form accepts is
 * dropped (the box stays empty) rather than written.
 */

/** What can be read off an ID, in the form's own shapes. `null` = not read; the box stays as it is. */
export type IdReadFields = {
  name: string | null;
  street: string | null;
  city: string | null;
  /** Two capital letters. */
  state: string | null;
  /** `12345` or `12345-6789`. */
  zip: string | null;
  idType: BuyReceiptIdType | null;
  /** The last four letters or digits of the ID number; the full number never leaves the server. */
  idLast4: string | null;
  /** `YYYY-MM-DD`. */
  dob: string | null;
};

export const EMPTY_ID_READ: IdReadFields = {
  name: null,
  street: null,
  city: null,
  state: null,
  zip: null,
  idType: null,
  idLast4: null,
  dob: null,
};

/** The state a blank receipt starts with (`blankBuyReceiptDraft`). */
const DEFAULT_STATE = 'FL';

export const ID_READ_PROMPT_VERSION = 'buy-receipt-id-read-v1';

export const ID_READ_SYSTEM_PROMPT = `You transcribe the printed text of a government-issued photo ID for a licensed secondhand-goods dealer in Florida. The dealer must record the seller's identity on every purchase receipt. A staff member photographed the ID with the seller present and checks every value against the card afterwards.

Transcribe only what is printed on the card. Never guess: if a value is missing, cut off, blurred or you are not sure of every character, return null for that value. A wrong digit is worse than an empty box.

Respond with a single raw JSON object (no markdown, no commentary), shaped exactly:
{"name": string|null, "street": string|null, "city": string|null, "state": string|null, "zip": string|null, "idType": string|null, "idNumber": string|null, "dob": string|null}

- name: the holder's full name in natural order, "First Middle Last" (cards usually print LAST, FIRST MIDDLE), including a suffix such as Jr or III. Normal capitalisation, e.g. "Maria T Lopez", not capitals.
- street: the street line of the address, with any apartment or unit. Normal capitalisation, e.g. "1250 Pine Ridge Rd Apt 4".
- city: the city of the address, normal capitalisation.
- state: the two-letter postal abbreviation of the state in the ADDRESS, in capitals.
- zip: the ZIP code of the address, "12345" or "12345-6789".
- idType: exactly one of ${BUY_RECEIPT_ID_TYPES.map((type) => `"${type}"`).join(', ')}. A driver license or learner permit is "Driver license"; a state identification card is "State ID"; use "Other" for any other government ID.
- idNumber: the license or ID number exactly as printed.
- dob: the date of birth as YYYY-MM-DD (US cards print MM/DD/YYYY).

If the picture does not show an ID, or nothing on it can be read, return the object with every value null.`;

function collapse(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

/** "MARIA T LOPEZ" → "Maria T Lopez". Only applied when the text came back with no lower-case letter at all. */
function titleCase(text: string): string {
  return text.toLowerCase().replace(/(^|[\s\-'’./])(\p{L})/gu, (_match, lead: string, letter: string) => lead + letter.toUpperCase());
}

function cleanText(value: unknown, max: number): string | null {
  const text = collapse(value);
  if (!text || !/\p{L}/u.test(text)) return null;
  const cased = /\p{Ll}/u.test(text) ? text : titleCase(text);
  return cased.slice(0, max);
}

function cleanState(value: unknown): string | null {
  const text = collapse(value).toUpperCase();
  return /^[A-Z]{2}$/.test(text) ? text : null;
}

function cleanZip(value: unknown): string | null {
  const text = collapse(value);
  if (/^\d{5}(-\d{4})?$/.test(text)) return text;
  // Some cards print the nine digits with a space, or run together.
  const digits = text.replace(/[\s-]/g, '');
  if (/^\d{9}$/.test(digits)) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return null;
}

function cleanIdType(value: unknown): BuyReceiptIdType | null {
  const text = collapse(value).toLowerCase();
  return BUY_RECEIPT_ID_TYPES.find((type) => type.toLowerCase() === text) ?? null;
}

/** The whole number comes back from the model; only its last four characters are kept. */
function cleanIdLast4(value: unknown): string | null {
  const characters = collapse(value).replace(/[^A-Za-z0-9]/g, '');
  return characters.length >= 4 ? characters.slice(-4).toUpperCase() : null;
}

function cleanDob(value: unknown, now: Date): string | null {
  const text = collapse(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < 1900) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return text > easternDayKey(now) ? null : text;
}

/** The model's reply as text → an object, or null. Tolerates a code fence or a sentence around the JSON. */
export function parseIdReadJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Whatever came back → values the form accepts, or null for each one that does not qualify. */
export function coerceIdRead(raw: unknown, now: Date = new Date()): IdReadFields {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...EMPTY_ID_READ };
  const source = raw as Record<string, unknown>;
  return {
    name: cleanText(source.name, 120),
    street: cleanText(source.street, 120),
    city: cleanText(source.city, 80),
    state: cleanState(source.state),
    zip: cleanZip(source.zip),
    idType: cleanIdType(source.idType),
    idLast4: cleanIdLast4(source.idNumber ?? source.idLast4),
    dob: cleanDob(source.dob, now),
  };
}

export function idReadIsEmpty(fields: IdReadFields): boolean {
  return Object.values(fields).every((value) => value === null);
}

/**
 * Write what was read into the boxes that are still empty. Never overwrites.
 *
 * State is the one box a blank receipt does not start empty: it starts "FL".
 * That default gives way to the ID's state only when nobody has typed any part
 * of the address — otherwise an out-of-state license would put "OH" beside a
 * Naples street the seller typed themselves.
 */
export function applyIdReadToDraft(draft: BuyReceiptDraft, fields: IdReadFields): BuyReceiptDraft {
  const empty = (value: string) => value.trim() === '';
  const fill = (current: string, read: string | null) => (empty(current) && read ? read : current);
  const addressUntouched = empty(draft.sellerStreet) && empty(draft.sellerCity) && empty(draft.sellerZip);
  const stateOpen = empty(draft.sellerState) || (draft.sellerState.trim().toUpperCase() === DEFAULT_STATE && addressUntouched);

  return {
    ...draft,
    sellerName: fill(draft.sellerName, fields.name),
    sellerStreet: fill(draft.sellerStreet, fields.street),
    sellerCity: fill(draft.sellerCity, fields.city),
    sellerState: stateOpen && fields.state ? fields.state : draft.sellerState,
    sellerZip: fill(draft.sellerZip, fields.zip),
    sellerIdType: fill(draft.sellerIdType, fields.idType),
    sellerIdLast4: fill(draft.sellerIdLast4, fields.idLast4),
    sellerDob: fill(draft.sellerDob, fields.dob),
  };
}
