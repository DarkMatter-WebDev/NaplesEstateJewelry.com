// Buy receipt "Customer input mode" — what the seller's screen asks for
// (owner, 2026-10-03). Pure and safe to import from client components.
//
// The owner's New receipt form is unchanged and still fills in everything by
// itself. This mode is the optional hand-over: the tablet shows the seller ONLY
// their own contact details, checks them, and gives the tablet back locked.
//
// Rules that live here so the screen, the form and the tests agree:
// - seven boxes, no more: name, phone, street, city, state, ZIP, email. ID
//   type, ID last 4, date of birth and the ID photo stay with the owner;
// - every box is required EXCEPT the email — but a typed email must look like one;
// - a box passes here only if the receipt's own validator
//   (`normalizeBuyReceiptInput`) will accept it too, so "Save" on the seller's
//   screen never hands the owner a form that then refuses to save.
import type { BuyReceiptDraft } from '@/lib/buy-receipts';
import { normalizePersonName } from '@/lib/person-name';
import { normalizePhoneNumber } from '@/lib/phone';

/** Where the browser keeps the form while the tablet is handed over, so a refresh loses nothing. sessionStorage: it dies with the tab. */
export const CUSTOMER_MODE_STORAGE_KEY = 'nej-buy-receipt-customer-mode';
export const CUSTOMER_MODE_API = '/api/admin/buy-receipts/customer-mode';
export const CUSTOMER_MODE_CODE_LENGTH = 4;

/** The boxes on the seller's screen, in the order they are typed. */
export const CUSTOMER_FIELDS = [
  'sellerName',
  'sellerPhone',
  'sellerStreet',
  'sellerCity',
  'sellerState',
  'sellerZip',
  'sellerEmail',
] as const;
export type CustomerField = (typeof CUSTOMER_FIELDS)[number];
export type CustomerValues = Pick<BuyReceiptDraft, CustomerField>;

/** What the owner's form calls the same boxes — used in the line shown when the tablet comes back. */
export const CUSTOMER_FIELD_FORM_NAMES: Record<CustomerField, string> = {
  sellerName: 'Name',
  sellerPhone: 'Phone',
  sellerStreet: 'Street',
  sellerCity: 'City',
  sellerState: 'State',
  sellerZip: 'ZIP',
  sellerEmail: 'Email',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function collapse(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function phoneDigits(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

/**
 * Why a box is not finished, in a few words that fit beside its label — or ''
 * when it is fine. An empty email is fine.
 */
export function customerFieldProblem(field: CustomerField, raw: unknown): string {
  const value = collapse(raw);
  if (field === 'sellerEmail') return value && !EMAIL_RE.test(value) ? 'Check this' : '';
  if (!value) return 'Needed';
  switch (field) {
    case 'sellerName':
      if (normalizePersonName(value)) return '';
      return value.includes(' ') ? 'Check this' : 'Add your last name';
    case 'sellerPhone':
      if (normalizePhoneNumber(value)) return '';
      return phoneDigits(value).length === 10 || value.startsWith('+') ? 'Check this' : '10 digits';
    case 'sellerState':
      return /^[A-Za-z]{2}$/.test(value) ? '' : '2 letters';
    case 'sellerZip':
      return /^\d{5}(-\d{4})?$/.test(value) ? '' : '5 digits';
    default:
      return '';
  }
}

export type CustomerProblem = { field: CustomerField; problem: string };

/** Every unfinished box, in screen order. Empty = the seller may save. */
export function customerProblems(values: CustomerValues): CustomerProblem[] {
  return CUSTOMER_FIELDS.flatMap((field) => {
    const problem = customerFieldProblem(field, values[field]);
    return problem ? [{ field, problem }] : [];
  });
}

/**
 * The seller types digits; the brackets and the dash appear by themselves.
 * Anything that is not a plain U.S. number in progress — a "+" for another
 * country, an "x12" extension the owner typed earlier — is left exactly as typed.
 */
export function formatCustomerPhone(raw: string): string {
  if (/[^\d\s().-]/.test(raw)) return raw;
  const digits = phoneDigits(raw.replace(/\D/g, '').slice(0, 11)).slice(0, 10);
  if (digits.length > 6) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length > 3) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return digits;
}

export function formatCustomerState(raw: string): string {
  return raw.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 2);
}

/** Five digits, or ZIP+4 with its dash. */
export function formatCustomerZip(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 9);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

/** The typing helper for a box, if it has one. */
export function formatCustomerField(field: CustomerField, raw: string): string {
  if (field === 'sellerPhone') return formatCustomerPhone(raw);
  if (field === 'sellerState') return formatCustomerState(raw);
  if (field === 'sellerZip') return formatCustomerZip(raw);
  return raw;
}

/** A finished form, tidied the way the receipt will store it. Only called when nothing is flagged. */
export function tidyCustomerValues(values: CustomerValues): CustomerValues {
  return {
    sellerName: normalizePersonName(values.sellerName) ?? collapse(values.sellerName),
    sellerPhone: normalizePhoneNumber(values.sellerPhone) ?? collapse(values.sellerPhone),
    sellerStreet: collapse(values.sellerStreet),
    sellerCity: collapse(values.sellerCity),
    sellerState: collapse(values.sellerState).toUpperCase(),
    sellerZip: collapse(values.sellerZip),
    sellerEmail: collapse(values.sellerEmail).toLowerCase(),
  };
}

/** "Thank you, Maria." — the first name only, or nothing when there is no name yet. */
export function customerFirstName(name: unknown): string {
  return collapse(name).split(' ')[0] ?? '';
}

/** How the tablet came back: a complete Save, "Submit unfinished", or the small Staff button. */
export type CustomerHandBackReason = 'saved' | 'unfinished' | 'staff';
export type CustomerHandBack = { kind: 'ok' | 'warn'; text: string };

/**
 * The one line the owner's form shows after the tablet comes back — and only
 * when there is something the owner needs to know. The owner's ruling
 * (2026-10-03) is that the form stays as it is and the button is the only
 * change to the page, so a hand-over that needs no follow-up leaves no line at
 * all: the details are simply in the boxes. A line appears for exactly two things:
 * - the seller asked for something that happens later (an emailed copy, the
 *   mailing list) — the form has no other place that says so;
 * - the form was accepted unfinished — which boxes still need the owner.
 * The form works it out afresh on every keystroke, so the list of boxes
 * shrinks as the owner finishes them and the line leaves when the last is done.
 * It also goes with "Clear" and with a saved receipt.
 */
export function customerHandBack(
  reason: CustomerHandBackReason,
  values: CustomerValues,
  asked: { emailCopy: boolean; mailingList: boolean },
): CustomerHandBack | null {
  const hasEmail = Boolean(collapse(values.sellerEmail));
  const copy = asked.emailCopy && hasEmail;
  const list = asked.mailingList && hasEmail;
  const asks = [
    copy ? 'The customer asked for an emailed copy — Email copy is ticked.' : '',
    list ? `${copy ? 'They also' : 'The customer'} asked to join the mailing list — they are added when you save the receipt.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (reason === 'unfinished') {
    const open = customerProblems(values).map((entry) => CUSTOMER_FIELD_FORM_NAMES[entry.field]);
    if (open.length > 0) {
      return { kind: 'warn', text: `Submitted unfinished with the staff code. Still to finish: ${open.join(', ')}.${asks ? ` ${asks}` : ''}` };
    }
  }
  return asks ? { kind: 'ok', text: asks } : null;
}

/** What a refresh must bring back while the tablet is handed over. */
export type CustomerModeSnapshot = {
  draft: BuyReceiptDraft;
  emailCopy: boolean;
  mailingList: boolean;
  phase: 'form' | 'thanks';
  tried: boolean;
};

const DRAFT_TEXT_FIELDS = [
  'sellerName',
  'sellerPhone',
  'sellerEmail',
  'sellerStreet',
  'sellerCity',
  'sellerState',
  'sellerZip',
  'sellerIdType',
  'sellerIdLast4',
  'sellerDob',
  'notes',
] as const;

function textRows<K extends string>(value: unknown, keys: readonly K[]): Record<K, string>[] | null {
  if (!Array.isArray(value)) return null;
  const rows: Record<K, string>[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return null;
    const row = {} as Record<K, string>;
    for (const key of keys) {
      const cell = (entry as Record<string, unknown>)[key];
      if (typeof cell !== 'string') return null;
      row[key] = cell;
    }
    rows.push(row);
  }
  return rows;
}

export function writeCustomerModeSnapshot(snapshot: CustomerModeSnapshot): string {
  return JSON.stringify({ v: 1, ...snapshot });
}

/**
 * The stored form, or null for anything that is not one. Storage is outside
 * the app's control, so nothing read from it is trusted to have the right shape.
 */
export function readCustomerModeSnapshot(raw: string | null | undefined): CustomerModeSnapshot | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const source = data as Record<string, unknown>;
  if (source.v !== 1 || !source.draft || typeof source.draft !== 'object') return null;
  const stored = source.draft as Record<string, unknown>;

  const text = {} as Record<(typeof DRAFT_TEXT_FIELDS)[number], string>;
  for (const key of DRAFT_TEXT_FIELDS) {
    if (typeof stored[key] !== 'string') return null;
    text[key] = stored[key] as string;
  }
  const items = textRows(stored.items, ['qty', 'description', 'amount'] as const);
  const payments = textRows(stored.payments, ['method', 'reference', 'amount'] as const);
  if (!items || !payments || items.length === 0 || payments.length === 0) return null;

  return {
    draft: { ...text, items, payments },
    emailCopy: source.emailCopy === true,
    mailingList: source.mailingList === true,
    phase: source.phase === 'thanks' ? 'thanks' : 'form',
    tried: source.tried === true,
  };
}
