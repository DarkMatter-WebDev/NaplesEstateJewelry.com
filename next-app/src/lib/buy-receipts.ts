// Admin → Buy Receipts: the counter form → a validated purchase record (pure,
// testable, safe to import from client components).
//
// Why (2026-09-30): the site records what the shop SELLS (in-store-sale.ts) but
// had no record of what it BUYS from a customer at the counter. The owner fills
// this in on a laptop beside the seller, it is saved to a log, and it prints on
// the desktop PC that has the printer (the Print Station).
//
// Rules that live here so the form, the routes, the paper and the tests agree:
// - an item's `amount` is the LINE total as typed — there is no unit price;
//   the receipt total is the sum of the amounts, recomputed on the server;
// - "Paid by" is a list. One row takes the whole total; two or more rows each
//   carry an amount and must add up to the total;
// - only the seller's name and one item are required. The paper is what gets
//   signed, so the form must never block a sale over an optional field;
// - the seller's ID photo is a PATH in a private bucket, never a URL, and it is
//   printed only on a copy the owner asked to carry it.
import { round2 } from '@/lib/checkout-pricing';
import { normalizePersonName } from '@/lib/person-name';
import { normalizePhoneNumber } from '@/lib/phone';
import { formatCurrency } from '@/types/sales';

export const BUY_RECEIPT_TIME_ZONE = 'America/New_York';
/** PRIVATE Storage bucket for seller ID photos (supabase/buy-receipts-2026-09.sql). */
export const BUY_RECEIPT_ID_BUCKET = 'buy-receipt-ids';
/** Printed on the seller's copy as the shop's signature (owner, 2026-09-30, in the cursive face of `signature-font.ts`). */
export const BUY_RECEIPT_SIGNER_NAME = 'Christopher Surette';

/** localStorage flag: this browser is the print station. An un-armed browser never polls or claims. */
export const BUY_RECEIPT_STATION_KEY = 'nej-buy-receipt-station';

/** The station page, and the short address the desktop shortcut opens (redirected in `legacy-redirects.ts`). */
export const BUY_RECEIPT_STATION_PATH = '/admin/buy-receipts/station';
export const BUY_RECEIPT_STATION_SHORT_PATH = '/admin/station';
/** Windows keeps this many characters of a shortcut's target and silently drops the rest. */
export const WINDOWS_SHORTCUT_TARGET_MAX = 259;

/**
 * What the owner pastes into Windows' Create Shortcut box on the printer PC.
 *
 * It must fit `WINDOWS_SHORTCUT_TARGET_MAX`: with the full station address it
 * was 260 characters and Windows dropped the final "n" — the shortcut opened
 * `…/statio`, a dead page (owner, 2026-10-03; an earlier count of "253" was
 * wrong). The short address brings it to 247. The length is pinned in
 * `buy-receipts.test.ts`, so it is counted by the test, never by hand.
 *
 * The two background switches stay because they are the cure for "it took a
 * minute to print": Chrome holds a covered or background window's print() and
 * slows its timers (a job sat for over a minute in the everyday Chrome,
 * 2026-09-30). `--disable-renderer-backgrounding` was dropped to fit.
 * ⛔ `%LOCALAPPDATA%\NEJStation` must not change: the station's sign-in and its
 * "this computer is the station" flag live in that Chrome profile.
 */
export function stationShortcutTarget(siteUrl: string): string {
  return (
    '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" '
    + '--user-data-dir="%LOCALAPPDATA%\\NEJStation" '
    + '--kiosk-printing '
    + '--disable-backgrounding-occluded-windows --disable-background-timer-throttling '
    + `--app=${siteUrl.replace(/\/$/, '')}${BUY_RECEIPT_STATION_SHORT_PATH}`
  );
}

export const BUY_RECEIPT_ID_TYPES = ['Driver license', 'State ID', 'Passport', 'Military ID', 'Other'] as const;
export type BuyReceiptIdType = (typeof BUY_RECEIPT_ID_TYPES)[number];

export const BUY_RECEIPT_PAYMENT_METHODS = ['cash', 'check', 'zelle', 'venmo', 'bank_transfer', 'store_credit'] as const;
export type BuyReceiptPaymentMethod = (typeof BUY_RECEIPT_PAYMENT_METHODS)[number];

export const BUY_RECEIPT_PAYMENT_LABELS: Record<BuyReceiptPaymentMethod, string> = {
  cash: 'Cash',
  check: 'Check',
  zelle: 'Zelle',
  venmo: 'Venmo',
  bank_transfer: 'Bank transfer',
  store_credit: 'Store credit / trade',
};

/**
 * Printed above the seller's signature. Owner-approved mockup wording
 * (2026-09-29); the owner confirms it with their attorney before relying on it.
 */
export const BUY_RECEIPT_ATTESTATION =
  'I certify that I am the lawful owner of the items listed above, that they are not stolen or subject to any lien, '
  + 'and that I have the right to sell them. I am 18 years of age or older.';

/**
 * The same statement in the third person, for the emailed copy — "I certify" under the
 * owner's printed signature read as if the owner were certifying (owner, 2026-09-30).
 */
export const BUY_RECEIPT_ATTESTATION_SELLER =
  'The seller certifies that they are the lawful owner of the items listed above, that the items are not stolen or '
  + 'subject to any lien, that they have the right to sell them, and that they are 18 years of age or older.';

export const BUY_RECEIPT_MAX_ITEMS = 20;
/** Item rows a form starts with. Owner, 2026-09-30: one, not three — "+ Add item" adds more. */
export const BUY_RECEIPT_FORM_ROWS = 1;
export const BUY_RECEIPT_MAX_PAYMENTS = 4;
export const BUY_AMOUNT_MAX = 250_000;
export const BUY_QTY_MAX = 999;
export const BUY_RECEIPT_DESCRIPTION_MAX = 200;
export const BUY_RECEIPT_NOTES_MAX = 500;
export const BUY_RECEIPT_REFERENCE_MAX = 30;
export const BUY_RECEIPT_VOID_REASON_MAX = 300;
/** Item rows + note lines past this usually push the signatures onto a second page. */
export const BUY_RECEIPT_ONE_PAGE_LINES = 16;

export const BUY_RECEIPT_STATION_POLL_MS = 3_000;
export const BUY_RECEIPT_STATION_BACKOFF_MAX_MS = 30_000;
/** A claim older than this belongs to a station tab that died mid-print; another tab may take it. */
export const BUY_RECEIPT_CLAIM_STALE_MS = 90_000;
export const BUY_RECEIPT_PRINT_WATCHDOG_MS = 20_000;

/**
 * What one "send to printer" produces (owner, 2026-09-30):
 * - the SHOP copy: blank signature lines, signed by hand by both, kept on file
 *   (`plain`, or `withId` when it carries the seller's ID photo);
 * - the SELLER'S copy: the owner's signature printed, no seller line, handed over.
 */
export const BUY_RECEIPT_PRINT_SETS = {
  shop_and_seller: { label: "Shop copy + seller's copy", plain: 1, withId: 0, seller: 1 },
  shop_id_and_seller: { label: "Shop copy with ID photo + seller's copy", plain: 0, withId: 1, seller: 1 },
  shop_only: { label: 'Shop copy only', plain: 1, withId: 0, seller: 0 },
  shop_id_only: { label: 'Shop copy with ID photo only', plain: 0, withId: 1, seller: 0 },
  seller_only: { label: "Seller's copy only", plain: 0, withId: 0, seller: 1 },
} as const;
export type BuyReceiptPrintSetKey = keyof typeof BUY_RECEIPT_PRINT_SETS;
export const BUY_RECEIPT_PRINT_SET_KEYS = Object.keys(BUY_RECEIPT_PRINT_SETS) as BuyReceiptPrintSetKey[];
export const BUY_RECEIPT_DEFAULT_PRINT_SET: BuyReceiptPrintSetKey = 'shop_and_seller';

/** Shop copies without / with the ID photo, and seller's copies. */
export type BuyReceiptCopies = { plain: number; withId: number; seller: number };

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/**
 * The copies a print request may ask for. A shop copy with the ID photo is
 * impossible without a photo, so it becomes a plain shop copy — and a request
 * that would print nothing becomes one shop copy rather than silently doing nothing.
 */
export function resolvePrintCopies(input: unknown, hasIdPhoto: boolean): BuyReceiptCopies {
  const source = (input ?? {}) as Record<string, unknown>;
  const fallback = BUY_RECEIPT_PRINT_SETS[BUY_RECEIPT_DEFAULT_PRINT_SET];
  let plain = clampInt(source.plain, 0, 3, fallback.plain);
  let withId = clampInt(source.withId, 0, 2, fallback.withId);
  const seller = clampInt(source.seller, 0, 3, fallback.seller);
  if (!hasIdPhoto) {
    plain = Math.min(3, plain + withId);
    withId = 0;
  }
  if (plain + withId + seller === 0) plain = 1;
  return { plain, withId, seller };
}

export type BuyReceiptItem = { qty: number; description: string; amount: number };
export type BuyReceiptPayment = { method: BuyReceiptPaymentMethod; reference: string | null; amount: number };
export type BuyReceiptStatus = 'recorded' | 'void';

/** The form's state: every field a string, exactly as typed. */
export type BuyReceiptDraftItem = { qty: string; description: string; amount: string };
export type BuyReceiptDraftPayment = { method: string; reference: string; amount: string };
export type BuyReceiptDraft = {
  sellerName: string;
  sellerPhone: string;
  sellerEmail: string;
  sellerStreet: string;
  sellerCity: string;
  sellerState: string;
  sellerZip: string;
  sellerIdType: string;
  sellerIdLast4: string;
  /** `YYYY-MM-DD`, the value of an `<input type="date">`. */
  sellerDob: string;
  items: BuyReceiptDraftItem[];
  payments: BuyReceiptDraftPayment[];
  notes: string;
};

/** A validated receipt, ready to store. */
export type BuyReceiptInput = {
  sellerName: string;
  sellerPhone: string | null;
  sellerEmail: string | null;
  sellerStreet: string | null;
  sellerCity: string | null;
  sellerState: string | null;
  sellerZip: string | null;
  sellerIdType: BuyReceiptIdType | null;
  sellerIdLast4: string | null;
  sellerDob: string | null;
  items: BuyReceiptItem[];
  total: number;
  payments: BuyReceiptPayment[];
  notes: string | null;
};

/** One `public.buy_receipts` row. */
export type BuyReceiptRow = {
  id: string;
  seq: number;
  receipt_number: string;
  status: BuyReceiptStatus;
  seller_name: string;
  seller_phone: string | null;
  seller_email: string | null;
  seller_street: string | null;
  seller_city: string | null;
  seller_state: string | null;
  seller_zip: string | null;
  seller_id_type: string | null;
  seller_id_last4: string | null;
  seller_dob: string | null;
  seller_id_photo_path: string | null;
  items: BuyReceiptItem[];
  total: number;
  payments: BuyReceiptPayment[];
  notes: string | null;
  print_requested_at: string | null;
  print_requested_by: string | null;
  print_copies_plain: number;
  print_copies_with_id: number;
  print_copies_seller: number;
  emailed_at: string | null;
  emailed_to: string | null;
  print_claimed_at: string | null;
  print_claimed_by: string | null;
  printed_at: string | null;
  print_count: number;
  void_reason: string | null;
  voided_at: string | null;
  voided_by: string | null;
  duplicated_from: string | null;
  created_by: string | null;
  created_by_email: string | null;
  updated_by_email: string | null;
  created_at: string;
  updated_at: string;
};

/** One select list for the routes, the pages and the station. */
export const BUY_RECEIPT_COLUMNS =
  'id, seq, receipt_number, status, seller_name, seller_phone, seller_email, seller_street, seller_city, seller_state, '
  + 'seller_zip, seller_id_type, seller_id_last4, seller_dob, seller_id_photo_path, items, total, payments, notes, '
  + 'print_requested_at, print_requested_by, print_copies_plain, print_copies_with_id, print_copies_seller, emailed_at, emailed_to, print_claimed_at, '
  + 'print_claimed_by, printed_at, print_count, void_reason, voided_at, voided_by, duplicated_from, created_by, '
  + 'created_by_email, updated_by_email, created_at, updated_at';

/** "$1,460", "1460.50", " 1,460 " → 1460 / 1460.5; anything else → null. */
export function parseBuyAmount(raw: unknown): number | null {
  const text = String(raw ?? '').replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0 || value > BUY_AMOUNT_MAX) return null;
  return round2(value);
}

/** Blank → 1 (most rows are one piece); otherwise a whole number 1–999. */
export function parseBuyQty(raw: unknown): number | null {
  const text = String(raw ?? '').trim();
  if (!text) return 1;
  if (!/^\d{1,3}$/.test(text)) return null;
  const value = Number(text);
  return value >= 1 && value <= BUY_QTY_MAX ? value : null;
}

export function buyReceiptTotal(items: readonly { amount: number }[]): number {
  return round2(items.reduce((sum, item) => sum + item.amount, 0));
}

export function blankBuyReceiptDraft(): BuyReceiptDraft {
  return {
    sellerName: '',
    sellerPhone: '',
    sellerEmail: '',
    sellerStreet: '',
    sellerCity: '',
    sellerState: 'FL',
    sellerZip: '',
    sellerIdType: '',
    sellerIdLast4: '',
    sellerDob: '',
    items: Array.from({ length: BUY_RECEIPT_FORM_ROWS }, () => ({ qty: '', description: '', amount: '' })),
    payments: [{ method: '', reference: '', amount: '' }],
    notes: '',
  };
}

function moneyText(value: number): string {
  return value.toFixed(2);
}

/** A saved receipt back into form state — for editing it and for duplicating it. */
export function draftFromReceipt(row: BuyReceiptRow): BuyReceiptDraft {
  const items: BuyReceiptDraftItem[] = (row.items ?? []).map((item) => ({
    qty: String(item.qty ?? 1),
    description: item.description ?? '',
    amount: moneyText(Number(item.amount ?? 0)),
  }));
  while (items.length < BUY_RECEIPT_FORM_ROWS) items.push({ qty: '', description: '', amount: '' });

  const saved = row.payments ?? [];
  const payments: BuyReceiptDraftPayment[] = saved.map((payment) => ({
    method: payment.method,
    reference: payment.reference ?? '',
    // A single payment is the whole total, so its amount field stays hidden.
    amount: saved.length > 1 ? moneyText(Number(payment.amount ?? 0)) : '',
  }));
  if (payments.length === 0) payments.push({ method: '', reference: '', amount: '' });

  return {
    sellerName: row.seller_name ?? '',
    sellerPhone: row.seller_phone ?? '',
    sellerEmail: row.seller_email ?? '',
    sellerStreet: row.seller_street ?? '',
    sellerCity: row.seller_city ?? '',
    sellerState: row.seller_state ?? '',
    sellerZip: row.seller_zip ?? '',
    sellerIdType: row.seller_id_type ?? '',
    sellerIdLast4: row.seller_id_last4 ?? '',
    sellerDob: row.seller_dob ?? '',
    items,
    payments,
    notes: row.notes ?? '',
  };
}

/** The sum of the amounts typed so far; rows that do not parse yet count as 0. */
export function draftTotal(draft: Pick<BuyReceiptDraft, 'items'>): number {
  return round2(draft.items.reduce((sum, item) => sum + (parseBuyAmount(item.amount) ?? 0), 0));
}

export type PaymentsBalance = { split: boolean; total: number; paid: number; matches: boolean; message: string };

/** The green/red line under a split payment. Only meaningful with two or more rows. */
export function paymentsBalance(draft: Pick<BuyReceiptDraft, 'items' | 'payments'>): PaymentsBalance {
  const total = draftTotal(draft);
  const split = draft.payments.length > 1;
  const paid = round2(draft.payments.reduce((sum, payment) => sum + (parseBuyAmount(payment.amount) ?? 0), 0));
  const matches = split && total > 0 && paid === total;
  const message = matches
    ? `Payments add up to ${formatCurrency(paid)}`
    : `Payments add up to ${formatCurrency(paid)} but the total is ${formatCurrency(total)}`;
  return { split, total, paid, matches, message };
}

function collapse(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function optionalText(value: unknown, max: number): string | null {
  const text = collapse(value);
  return text ? text.slice(0, max) : null;
}

/** `YYYY-MM-DD` in the showroom's time zone. */
export function easternDayKey(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUY_RECEIPT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function isRealDate(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < 1900) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * The one validator: the form runs it before posting and the routes run it
 * again, so the messages match. `now` is only for tests.
 */
export function normalizeBuyReceiptInput(
  body: unknown,
  now: Date = new Date(),
): { value: BuyReceiptInput } | { error: string } {
  const source = (body ?? {}) as Record<string, unknown>;

  const sellerName = normalizePersonName(source.sellerName);
  if (!sellerName) return { error: "Enter the seller's first and last name." };

  const phoneText = collapse(source.sellerPhone);
  const sellerPhone = phoneText ? normalizePhoneNumber(phoneText) : null;
  if (phoneText && !sellerPhone) return { error: 'That phone number does not look right.' };

  const emailText = collapse(source.sellerEmail).toLowerCase();
  if (emailText && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailText)) {
    return { error: 'That email does not look right (leave it blank if there is none).' };
  }

  const stateText = collapse(source.sellerState).toUpperCase();
  if (stateText && !/^[A-Z]{2}$/.test(stateText)) return { error: 'State is two letters, e.g. FL.' };

  const zipText = collapse(source.sellerZip);
  if (zipText && !/^\d{5}(-\d{4})?$/.test(zipText)) return { error: 'ZIP code is five digits, e.g. 34109.' };

  const idTypeText = collapse(source.sellerIdType);
  if (idTypeText && !(BUY_RECEIPT_ID_TYPES as readonly string[]).includes(idTypeText)) {
    return { error: 'Pick the ID type from the list.' };
  }

  const idLast4Text = String(source.sellerIdLast4 ?? '').replace(/\s+/g, '');
  if (idLast4Text && !/^[A-Za-z0-9]{1,4}$/.test(idLast4Text)) {
    return { error: 'ID last 4 is up to four letters or digits.' };
  }

  const dobText = collapse(source.sellerDob);
  if (dobText) {
    if (!isRealDate(dobText)) return { error: 'Date of birth is not a real date.' };
    if (dobText > easternDayKey(now)) return { error: 'Date of birth cannot be in the future.' };
  }

  const rawItems = Array.isArray(source.items) ? (source.items as unknown[]) : [];
  const items: BuyReceiptItem[] = [];
  for (let index = 0; index < rawItems.length; index += 1) {
    const row = (rawItems[index] ?? {}) as Record<string, unknown>;
    const description = collapse(row.description);
    const amountText = collapse(row.amount);
    // A row the owner never touched. Its quantity alone does not make it an item.
    if (!description && !amountText) continue;
    const rowNumber = index + 1;
    if (!description) return { error: `Row ${rowNumber} needs a description.` };
    if (description.length > BUY_RECEIPT_DESCRIPTION_MAX) {
      return { error: `Row ${rowNumber}: keep the description under ${BUY_RECEIPT_DESCRIPTION_MAX} characters.` };
    }
    const amount = parseBuyAmount(amountText);
    if (amount == null) return { error: `Row ${rowNumber} needs an amount, e.g. 120.` };
    const qty = parseBuyQty(row.qty);
    if (qty == null) return { error: `Row ${rowNumber}: quantity is a whole number from 1 to ${BUY_QTY_MAX}.` };
    items.push({ qty, description, amount });
  }
  if (items.length === 0) return { error: 'Add at least one item with a description and an amount.' };
  if (items.length > BUY_RECEIPT_MAX_ITEMS) return { error: `A receipt holds up to ${BUY_RECEIPT_MAX_ITEMS} items.` };

  // Never trusted from the client.
  const total = buyReceiptTotal(items);

  const rawPayments = Array.isArray(source.payments) ? (source.payments as unknown[]) : [];
  if (rawPayments.length === 0) return { error: 'Choose how the seller was paid.' };
  if (rawPayments.length > BUY_RECEIPT_MAX_PAYMENTS) {
    return { error: `A receipt holds up to ${BUY_RECEIPT_MAX_PAYMENTS} payment methods.` };
  }
  const split = rawPayments.length > 1;
  const payments: BuyReceiptPayment[] = [];
  for (const raw of rawPayments) {
    const row = (raw ?? {}) as Record<string, unknown>;
    const method = collapse(row.method) as BuyReceiptPaymentMethod;
    if (!BUY_RECEIPT_PAYMENT_METHODS.includes(method)) return { error: 'Choose how the seller was paid.' };
    let reference: string | null = null;
    if (method === 'check') {
      reference = optionalText(row.reference, BUY_RECEIPT_REFERENCE_MAX);
      if (!reference) return { error: 'Enter the check number.' };
    }
    let amount = total;
    if (split) {
      const parsed = parseBuyAmount(row.amount);
      if (parsed == null) return { error: 'Enter an amount for each payment.' };
      amount = parsed;
    }
    payments.push({ method, reference, amount });
  }
  if (split) {
    const paid = round2(payments.reduce((sum, payment) => sum + payment.amount, 0));
    if (paid !== total) {
      return { error: `Payments add up to ${formatCurrency(paid)} but the total is ${formatCurrency(total)}.` };
    }
  }

  const notesText = String(source.notes ?? '').replace(/\r\n/g, '\n').trim();

  return {
    value: {
      sellerName,
      sellerPhone,
      sellerEmail: emailText || null,
      sellerStreet: optionalText(source.sellerStreet, 120),
      sellerCity: optionalText(source.sellerCity, 80),
      sellerState: stateText || null,
      sellerZip: zipText || null,
      sellerIdType: (idTypeText as BuyReceiptIdType) || null,
      sellerIdLast4: idLast4Text ? idLast4Text.toUpperCase() : null,
      sellerDob: dobText || null,
      items,
      total,
      payments,
      notes: notesText ? notesText.slice(0, BUY_RECEIPT_NOTES_MAX) : null,
    },
  };
}

/** The content columns of a row, for both the insert and the update. */
export function buyReceiptContentColumns(input: BuyReceiptInput) {
  return {
    seller_name: input.sellerName,
    seller_phone: input.sellerPhone,
    seller_email: input.sellerEmail,
    seller_street: input.sellerStreet,
    seller_city: input.sellerCity,
    seller_state: input.sellerState,
    seller_zip: input.sellerZip,
    seller_id_type: input.sellerIdType,
    seller_id_last4: input.sellerIdLast4,
    seller_dob: input.sellerDob,
    items: input.items,
    total: input.total,
    payments: input.payments,
    notes: input.notes,
  };
}

/** "Cash" / "Check #2041". */
export function paymentLabel(method: string, reference: string | null | undefined): string {
  const label = BUY_RECEIPT_PAYMENT_LABELS[method as BuyReceiptPaymentMethod] ?? method;
  return method === 'check' && reference ? `${label} #${reference}` : label;
}

/** The "Paid by" line on the paper: one method alone, or each with its amount. */
export function paymentsLine(payments: readonly BuyReceiptPayment[] | null | undefined): string {
  const list = payments ?? [];
  if (list.length === 0) return '';
  if (list.length === 1) return paymentLabel(list[0].method, list[0].reference);
  return list
    .map((payment) => `${paymentLabel(payment.method, payment.reference)} ${formatCurrency(payment.amount)}`)
    .join(' · ');
}

/** "Sep 29, 2026" in Eastern time. */
export function formatReceiptDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: BUY_RECEIPT_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(typeof value === 'string' ? new Date(value) : value);
}

/** "2:14 PM" in Eastern time. */
export function formatReceiptTime(value: string | Date | null | undefined): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: BUY_RECEIPT_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(typeof value === 'string' ? new Date(value) : value);
}

/** "Sep 29, 2026 · 2:14 PM" in Eastern time. */
export function formatReceiptDateTime(value: string | Date | null | undefined): string {
  if (!value) return '';
  return `${formatReceiptDate(value)} · ${formatReceiptTime(value)}`;
}

/** `1961-04-18` → `04/18/1961`. String work only — a date of birth has no time zone. */
export function formatDob(value: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  return match ? `${match[2]}/${match[3]}/${match[1]}` : '';
}

/** A print was asked for and the station has not finished it yet. */
export function isPrintPending(row: Pick<BuyReceiptRow, 'print_requested_at' | 'printed_at'>): boolean {
  if (!row.print_requested_at) return false;
  return !row.printed_at || row.printed_at < row.print_requested_at;
}

/** No station holds this request, or the one that did went quiet. */
export function isClaimStale(row: Pick<BuyReceiptRow, 'print_claimed_at'>, nowMs: number): boolean {
  if (!row.print_claimed_at) return true;
  return nowMs - new Date(row.print_claimed_at).getTime() > BUY_RECEIPT_CLAIM_STALE_MS;
}

export function receiptPrintLabel(row: Pick<BuyReceiptRow, 'print_requested_at' | 'printed_at' | 'print_count'>): string {
  if (isPrintPending(row)) return 'Waiting for the desktop';
  if (row.print_count > 0) return row.print_count === 1 ? 'Printed' : `Printed ×${row.print_count}`;
  return 'Not printed';
}

/** The ids of the listed receipts that are waiting for the desktop — what the Log watches. */
export function pendingReceiptIds(rows: Pick<BuyReceiptRow, 'id' | 'print_requested_at' | 'printed_at'>[]): string[] {
  return rows.filter((row) => isPrintPending(row)).map((row) => row.id).sort();
}

/**
 * Fresh copies of some listed receipts folded into the list, order kept. Returns
 * the SAME array when nothing changed, so a poll that finds no news re-renders nothing.
 */
export function mergeFreshReceipts(current: BuyReceiptRow[], fresh: BuyReceiptRow[]): BuyReceiptRow[] {
  const byId = new Map(fresh.map((row) => [row.id, row]));
  let changed = false;
  const next = current.map((row) => {
    const update = byId.get(row.id);
    if (!update || update.updated_at === row.updated_at) return row;
    changed = true;
    return update;
  });
  return changed ? next : current;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A route param that can be a receipt id; anything else is a 404, not a database error. */
export function isReceiptId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Where a receipt's ID photo lives in the private bucket. A new name on every upload. */
export function buyReceiptIdPhotoPath(receiptId: string, fileId: string): string {
  return `receipts/${receiptId}/${fileId}.webp`;
}

/** Item rows plus wrapped note lines: past `BUY_RECEIPT_ONE_PAGE_LINES` the paper may need a second page. */
export function draftPaperLines(draft: Pick<BuyReceiptDraft, 'items' | 'notes'>): number {
  const noteLines = draft.notes.trim() ? Math.ceil(draft.notes.length / 95) + (draft.notes.match(/\n/g)?.length ?? 0) : 1;
  return Math.max(draft.items.length, BUY_RECEIPT_FORM_ROWS) + noteLines;
}

/** The Print Station's "Test print": a full-looking receipt that is never stored. */
export function sampleBuyReceipt(nowIso: string): BuyReceiptRow {
  return {
    id: 'test-print',
    seq: 0,
    receipt_number: 'BUY-TEST',
    status: 'recorded',
    seller_name: 'Test Print',
    seller_phone: '(239) 555-0100',
    seller_email: null,
    seller_street: '123 Sample St',
    seller_city: 'Naples',
    seller_state: 'FL',
    seller_zip: '34109',
    seller_id_type: 'Driver license',
    seller_id_last4: '0000',
    seller_dob: '1970-01-01',
    seller_id_photo_path: null,
    items: [
      { qty: 1, description: 'This is a test print. Nothing was saved.', amount: 100 },
      { qty: 2, description: 'Sample second line', amount: 50 },
    ],
    total: 150,
    payments: [{ method: 'cash', reference: null, amount: 150 }],
    notes: 'If this page has no web address printed at the top or bottom, the station is set up correctly.',
    print_requested_at: null,
    print_requested_by: null,
    print_copies_plain: 1,
    print_copies_with_id: 0,
    print_copies_seller: 0,
    emailed_at: null,
    emailed_to: null,
    print_claimed_at: null,
    print_claimed_by: null,
    printed_at: null,
    print_count: 0,
    void_reason: null,
    voided_at: null,
    voided_by: null,
    duplicated_from: null,
    created_by: null,
    created_by_email: null,
    updated_by_email: null,
    created_at: nowIso,
    updated_at: nowIso,
  };
}
