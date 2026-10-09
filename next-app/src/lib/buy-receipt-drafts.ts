import {
  BUY_RECEIPT_COLUMNS,
  BUY_RECEIPT_DESCRIPTION_MAX,
  BUY_RECEIPT_MAX_ITEMS,
  BUY_RECEIPT_MAX_PAYMENTS,
  BUY_RECEIPT_NOTES_MAX,
  BUY_RECEIPT_REFERENCE_MAX,
  draftTotal,
  type BuyReceiptDraft,
  type BuyReceiptRow,
} from '@/lib/buy-receipts';

/**
 * Buy receipt DRAFTS (owner, 2026-10-09: "start on ipad, then pick up and
 * finish on the laptop where i can use the thumbprint reader").
 *
 * A draft is a real `buy_receipts` row with `status = 'draft'`. It takes its
 * BUY number the moment it is first saved (owner: "number at draft time") and
 * needs nothing but the seller's name (owner: "name only"). Until it is
 * finished, the row's own receipt columns stay empty: the form, exactly as
 * typed, is kept whole in `draft_form`, so a half-written row ("14K chain" with
 * no amount yet) never has to pass for a real item. Finishing runs the normal
 * validator, writes the real columns, sets `status = 'recorded'` and clears
 * `draft_form`.
 *
 * Pure, and safe to import from client components.
 * SQL: supabase/buy-receipts-drafts-2026-10.sql.
 */

/** The form as it was when "Save draft" was pressed: every box as typed, and the two small ticks. */
export type BuyReceiptDraftForm = {
  v: 1;
  draft: BuyReceiptDraft;
  emailCopy: boolean;
  mailingList: boolean;
};

/**
 * `draft_form` is read ONLY where a draft is opened. It is deliberately not in
 * `BUY_RECEIPT_COLUMNS`: every receipt page, the Log and the station select
 * that list, and a column the database does not have yet would break all of
 * them. This way only "Save draft" itself depends on the drafts SQL.
 */
export const BUY_RECEIPT_DRAFT_COLUMNS = `${BUY_RECEIPT_COLUMNS}, draft_form`;
export type BuyReceiptDraftRow = BuyReceiptRow & { draft_form: unknown };

export const BUY_RECEIPT_DRAFT_NAME_NEEDED = "Enter the seller's name to save a draft.";
/** What the routes answer when the draft row could not be written (the usual cause on a fresh deploy: the drafts SQL has not been run). */
export const DRAFT_NOT_SAVED = 'Could not save the draft. Nothing was recorded.';

const SELLER_TEXT_MAX = 200;
const SHORT_TEXT_MAX = 30;

const SELLER_FIELDS = [
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
] as const;

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function rows(value: unknown, max: number): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object').slice(0, max);
}

/**
 * Anything → a form the paper can draw. Nothing is REFUSED here (a draft is
 * unfinished by definition); a value of the wrong kind becomes an empty box and
 * an over-long one is cut, so what comes back always has the form's shape.
 */
export function sanitizeBuyReceiptDraft(raw: unknown): BuyReceiptDraft {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const seller = {} as Record<(typeof SELLER_FIELDS)[number], string>;
  for (const key of SELLER_FIELDS) seller[key] = text(source[key], SELLER_TEXT_MAX);

  const items = rows(source.items, BUY_RECEIPT_MAX_ITEMS).map((row) => ({
    qty: text(row.qty, SHORT_TEXT_MAX),
    description: text(row.description, BUY_RECEIPT_DESCRIPTION_MAX),
    amount: text(row.amount, SHORT_TEXT_MAX),
  }));
  const payments = rows(source.payments, BUY_RECEIPT_MAX_PAYMENTS).map((row) => ({
    method: text(row.method, SHORT_TEXT_MAX),
    reference: text(row.reference, BUY_RECEIPT_REFERENCE_MAX),
    amount: text(row.amount, SHORT_TEXT_MAX),
  }));

  return {
    ...seller,
    // The paper always has at least one row of each to type in.
    items: items.length > 0 ? items : [{ qty: '', description: '', amount: '' }],
    payments: payments.length > 0 ? payments : [{ method: '', reference: '', amount: '' }],
    notes: text(source.notes, BUY_RECEIPT_NOTES_MAX),
  };
}

/** What the database holds in `draft_form` → the form, or null for anything that is not one. */
export function readBuyReceiptDraftForm(raw: unknown): BuyReceiptDraftForm | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  if (source.v !== 1 || !source.draft || typeof source.draft !== 'object') return null;
  return {
    v: 1,
    draft: sanitizeBuyReceiptDraft(source.draft),
    emailCopy: source.emailCopy === true,
    mailingList: source.mailingList === true,
  };
}

export type BuyReceiptDraftSave = {
  sellerName: string;
  /** The amounts typed so far, added up — for the Log. Rows that do not parse yet count as 0. */
  total: number;
  form: BuyReceiptDraftForm;
};

/**
 * "Save draft": the form runs it before posting and the routes run it again.
 * The ONE thing a draft needs is the seller's name (owner, 2026-10-09). Nothing
 * else is checked — that is what finishing the receipt is for.
 */
export function normalizeBuyReceiptDraftSave(body: unknown): { value: BuyReceiptDraftSave } | { error: string } {
  const source = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const draft = sanitizeBuyReceiptDraft(source);
  const sellerName = draft.sellerName.replace(/\s+/g, ' ').trim();
  if (!sellerName) return { error: BUY_RECEIPT_DRAFT_NAME_NEEDED };
  return {
    value: {
      sellerName,
      total: draftTotal(draft),
      form: { v: 1, draft, emailCopy: source.emailCopy === true, mailingList: source.mailingList === true },
    },
  };
}

/** The columns a draft row carries: its name, its running total, and the form itself. */
export function buyReceiptDraftColumns(save: BuyReceiptDraftSave) {
  return { seller_name: save.sellerName, total: save.total, draft_form: save.form };
}

export function isDraftReceipt(row: Pick<BuyReceiptRow, 'status'>): boolean {
  return row.status === 'draft';
}

/** Where a draft is opened to carry on with it — on any device. */
export function draftContinuePath(adminBasePath: string, id: string): string {
  return `${adminBasePath}/buy-receipts?draft=${id}`;
}

/** The row as every other part of the app knows it: without the stored form. */
export function receiptOfDraftRow(row: BuyReceiptDraftRow): BuyReceiptRow {
  const copy: Partial<BuyReceiptDraftRow> = { ...row };
  delete copy.draft_form;
  return copy as BuyReceiptRow;
}

/** The form a draft opens with. A draft whose stored form cannot be read still opens, with the name it was saved under. */
export function draftFormFromRow(row: BuyReceiptDraftRow): BuyReceiptDraftForm {
  return (
    readBuyReceiptDraftForm(row.draft_form) ?? {
      v: 1,
      draft: sanitizeBuyReceiptDraft({ sellerName: row.seller_name, sellerState: row.seller_state ?? 'FL' }),
      emailCopy: false,
      mailingList: false,
    }
  );
}
