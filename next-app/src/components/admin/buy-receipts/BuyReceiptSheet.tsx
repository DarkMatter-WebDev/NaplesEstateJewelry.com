'use client';

import { useId, useLayoutEffect, useRef } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { BUSINESS_NAME, cityLine, streetLine } from '@/lib/business-location';
import {
  CUSTOMER_FIELDS,
  CUSTOMER_FIELD_CAPITALS,
  customerFlagNote,
  customerFlagPlaceholder,
  type CustomerField,
} from '@/lib/buy-receipt-customer-mode';
import { BUSINESS_EMAIL, BUSINESS_PHONE } from '@/lib/order-email-branding';
import { signatureFont } from '@/lib/signature-font';
import {
  BUY_RECEIPT_ATTESTATION,
  BUY_RECEIPT_ID_TYPES,
  BUY_RECEIPT_MAX_ITEMS,
  BUY_RECEIPT_MAX_PAYMENTS,
  BUY_RECEIPT_NOTES_MAX,
  BUY_RECEIPT_PAYMENT_LABELS,
  BUY_RECEIPT_PAYMENT_METHODS,
  BUY_RECEIPT_SIGNER_NAME,
  draftTotal,
  formatDob,
  formatReceiptDate,
  formatReceiptDateTime,
  paymentsBalance,
  paymentsLine,
  type BuyReceiptDraft,
  type BuyReceiptDraftItem,
  type BuyReceiptDraftPayment,
  type BuyReceiptRow,
} from '@/lib/buy-receipts';
import { formatCurrency } from '@/types/sales';
import { BUY_RECEIPT_SHEET_CSS } from './buy-receipt-sheet-css';

/**
 * THE buy-receipt paper (owner mockups 2026-09-29/30).
 *
 * One layout, two modes, so what the owner fills in is what prints:
 * - `edit`: the same paper with underlined fields (the laptop form);
 * - `print`: the same paper as text (the log, "Print here", the Print Station).
 * (One difference, owner 2026-10-03: on the form the Email box is a column
 * wider and the Name box a column narrower, to seat the two small boxes "Email
 * copy" and "Mailing list" on the Email label's line. The printed paper has no
 * such boxes and keeps Name 5 / Phone 3 / Email 4.)
 *
 * Two printed variants (owner, 2026-09-30):
 * - `shop` — the copy kept on file: blank signature lines, signed by hand by
 *   both; may carry the seller's ID photo (`showIdPhoto`);
 * - `seller` — the copy handed over: the owner's signature printed in cursive
 *   on the "Received by" line, no seller line, never the ID photo.
 *
 * And one more way to show the `edit` paper (owner, 2026-10-03): the SELLER's
 * view, for customer input mode — the same paper, with only the seven seller
 * boxes and the two small email boxes switched on and every other part faded
 * and switched off. It is a prop (`customer`), given only by the locked screen
 * (`BuyReceiptCustomerMode`). Without it — the owner's form, the edit view of a
 * saved receipt — this component draws exactly what it always drew.
 */

/** What the locked screen hands the paper so it can draw the seller's view. */
export type BuyReceiptCustomerView = {
  /** The boxes the last "Save" found unfinished, each with its short reason. */
  flags: Partial<Record<CustomerField, string>>;
  /** The seller typed in one of their boxes (the screen formats phone, state and ZIP as they go). */
  onType: (field: CustomerField, input: HTMLInputElement) => void;
  /** The seller left one of their boxes. */
  onLeave: (field: CustomerField) => void;
};

type EditProps = {
  mode: 'edit';
  draft: BuyReceiptDraft;
  onChange: (draft: BuyReceiptDraft) => void;
  /** `BUY-00042`, or null while the receipt has not been saved yet. */
  receiptNumber: string | null;
  dateIso: string;
  /** The "Seller ID photo" strip: a screen-only control, never printed. */
  idPhotoSlot?: ReactNode;
  /** The "Seller thumbprint" strip under it (owner, 2026-10-06): a screen-only control too. */
  thumbprintSlot?: ReactNode;
  /** "Send via email" (owner, 2026-09-30): a screen-only box under the email field. */
  emailCopy?: boolean;
  onEmailCopyChange?: (checked: boolean) => void;
  /** "Mailing list" (owner, 2026-10-03): a second screen-only box beside it; the email joins the list when the receipt is saved. */
  mailingList?: boolean;
  onMailingListChange?: (checked: boolean) => void;
  /** Draw the seller's view (customer input mode). Leave out everywhere else. */
  customer?: BuyReceiptCustomerView;
};

type PrintProps = {
  mode: 'print';
  receipt: BuyReceiptRow;
  /** `shop` (default) keeps the blank lines; `seller` prints the owner's signature. */
  variant?: 'shop' | 'seller';
  idPhotoUrl?: string | null;
  showIdPhoto?: boolean;
  /** The seller's thumbprint (owner, 2026-10-06): drawn under the signatures of a SHOP copy, beside the ID photo when that copy carries one; never on the seller's. */
  thumbprintUrl?: string | null;
};

export type BuyReceiptSheetProps = EditProps | PrintProps;

function AutoGrowTextarea({
  value,
  onChange,
  maxLength,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // One line tall until the owner types more (keeps the receipt on one page).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(30, el.scrollHeight)}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      className="sheet-input"
      value={value}
      maxLength={maxLength}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function Header({ receiptNumber, dateIso, copyTag }: { receiptNumber: string | null; dateIso: string; copyTag?: string }) {
  return (
    <div className="brs-head">
      <div className="brs-brand">
        {/* A plain <img>: it must be in the document's image list so printing can wait for it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brs-logo" src="/assets/images/branding/nav-logo.webp" width={157} height={120} alt="" />
        <div>
          <div className="brs-name">{BUSINESS_NAME}</div>
          <div className="brs-contact">
            {streetLine()} · {cityLine()}
            <br />
            {BUSINESS_PHONE} · {BUSINESS_EMAIL}
          </div>
        </div>
      </div>
      <div className="brs-meta">
        <div className="brs-doc">Purchase receipt</div>
        <div>No. {receiptNumber ?? <span className="brs-muted">assigned on save</span>}</div>
        <div>Date: {formatReceiptDateTime(dateIso)}</div>
        {copyTag && <div className="brs-copy-tag">{copyTag}</div>}
      </div>
    </div>
  );
}

/** The seller's copy: the shop has already signed and dated. */
/**
 * "Received by": the owner's signature and the receipt's date, printed — on
 * EVERY copy (owner, 2026-09-30: "so i dont ever have to sign anything"). The
 * date is the receipt's own date, the one already printed at the top.
 * Two grid cells: the caller's grid gives them their widths.
 */
function SignedReceivedBy({ dateIso }: { dateIso: string }) {
  return (
    <>
      <div>
        <div className="brs-sign-line brs-signature-ink">
          <span className={`${signatureFont.className} brs-signature`}>{BUY_RECEIPT_SIGNER_NAME}</span>
        </div>
        <span className="brs-label brs-sign-label">Received by — {BUY_RECEIPT_SIGNER_NAME}, {BUSINESS_NAME}</span>
      </div>
      <div>
        <div className="brs-sign-line brs-signature-ink">
          <span className="brs-signature-date">{formatReceiptDate(dateIso)}</span>
        </div>
        <span className="brs-label brs-sign-label">Date</span>
      </div>
    </>
  );
}

/** The seller signs and dates by hand. Two grid cells. */
function SellerSignAndDate() {
  return (
    <>
      <div>
        <div className="brs-sign-line" />
        <span className="brs-label brs-sign-label">Seller signature</span>
      </div>
      <div>
        <div className="brs-sign-line" />
        <span className="brs-label brs-sign-label">Date</span>
      </div>
    </>
  );
}

/** The seller's copy: only the shop's printed signature. */
function SignedBlock({ dateIso }: { dateIso: string }) {
  return (
    <div className="brs-signatures">
      <SignedReceivedBy dateIso={dateIso} />
    </div>
  );
}

/**
 * The shop copy (and the form, which is that copy): the seller's line and the
 * shop's printed signature on ONE level, side by side, each with its date
 * (owner, 2026-10-06 — they were stacked before, and beside the ID photo the
 * cursive signature did not fit its line and printed over the label above it).
 */
function SignatureBlock({ dateIso }: { dateIso: string }) {
  return (
    <div className="brs-sign-row">
      <div className="brs-sign-pair brs-sign-seller">
        <SellerSignAndDate />
      </div>
      <div className="brs-sign-pair brs-sign-shop">
        <SignedReceivedBy dateIso={dateIso} />
      </div>
    </div>
  );
}

function Value({ children }: { children?: ReactNode }) {
  return <span className="brs-value">{children || ' '}</span>;
}

function EditSheet({
  draft,
  onChange,
  receiptNumber,
  dateIso,
  idPhotoSlot,
  thumbprintSlot,
  emailCopy = false,
  onEmailCopyChange,
  mailingList = false,
  onMailingListChange,
  customer,
}: EditProps) {
  // Set when the owner picks "Check", so the check-number field takes focus as it appears.
  const focusCheckRow = useRef<number | null>(null);
  const emailId = useId();

  const set = (patch: Partial<BuyReceiptDraft>) => onChange({ ...draft, ...patch });

  // ── The seller's view (customer input mode). Each of the three helpers gives
  // nothing at all on the owner's form, so that form is drawn exactly as before. ──
  /** What one of the seven seller boxes gains: the typing helpers, and its flag after a Save that found it unfinished. */
  const seat = (field: CustomerField) => {
    if (!customer) return undefined;
    const problem = customer.flags[field];
    const placeholder = customerFlagPlaceholder(field, problem);
    return {
      'data-customer-field': field,
      // One seller must never be offered another's details, and nothing here is to be remembered.
      autoCorrect: 'off',
      autoCapitalize: CUSTOMER_FIELD_CAPITALS[field],
      spellCheck: false,
      'data-1p-ignore': '',
      'data-lpignore': 'true',
      'data-form-type': 'other',
      enterKeyHint: field === CUSTOMER_FIELDS[CUSTOMER_FIELDS.length - 1] ? ('done' as const) : ('next' as const),
      'aria-invalid': problem ? true : undefined,
      onChange: (event: ChangeEvent<HTMLInputElement>) => customer.onType(field, event.currentTarget),
      onBlur: () => customer.onLeave(field),
      ...(placeholder ? { placeholder } : null),
    };
  };
  /** The reason beside a flagged box's label: "NAME — add your last name". */
  const why = (field: CustomerField) => {
    const words = customer ? customerFlagNote(field, customer.flags[field]) : '';
    return words ? <span className="brs-why"> — {words}</span> : null;
  };
  /** The owner's parts are switched off (and faded, `brs-off`) while the seller has the tablet. */
  const off = customer ? true : undefined;
  const offCell = customer ? ' brs-off' : '';

  const setItem = (index: number, patch: Partial<BuyReceiptDraftItem>) =>
    set({ items: draft.items.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  const setPayment = (index: number, patch: Partial<BuyReceiptDraftPayment>) =>
    set({ payments: draft.payments.map((payment, i) => (i === index ? { ...payment, ...patch } : payment)) });

  const addItem = () => set({ items: [...draft.items, { qty: '', description: '', amount: '' }] });
  const removeItem = (index: number) => {
    const next = draft.items.filter((_, i) => i !== index);
    set({ items: next.length > 0 ? next : [{ qty: '', description: '', amount: '' }] });
  };
  const addPayment = () => set({ payments: [...draft.payments, { method: '', reference: '', amount: '' }] });
  const removePayment = (index: number) => {
    const next = draft.payments.filter((_, i) => i !== index);
    // Back to one method: it takes the whole total, so its amount is cleared.
    set({ payments: next.length === 1 ? [{ ...next[0], amount: '' }] : next });
  };

  const total = draftTotal(draft);
  const balance = paymentsBalance(draft);
  const split = draft.payments.length > 1;

  // Everything under the seller's boxes — the ID photo and thumbprint strips, the items, the money,
  // the notes, the signatures. One piece, so the seller's view can switch the whole of it off at once.
  const ownerPart = (
    <>
      {idPhotoSlot}
      {thumbprintSlot}

      <h2 className="sheet-section-title">Items purchased by {BUSINESS_NAME}</h2>
      <table className="brs-items">
        <thead>
          <tr>
            <th className="brs-num">#</th>
            <th className="brs-qty">Qty</th>
            <th>Description</th>
            <th className="brs-amount">Amount</th>
            <th className="brs-tools" aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {draft.items.map((item, index) => (
            <tr key={index}>
              <td className="brs-num">{index + 1}</td>
              <td className="brs-qty">
                <input className="sheet-input" value={item.qty} inputMode="numeric" placeholder="1" aria-label={`Row ${index + 1} quantity`} onChange={(e) => setItem(index, { qty: e.target.value })} />
              </td>
              <td className="brs-desc">
                <input className="sheet-input" value={item.description} placeholder="Description" aria-label={`Row ${index + 1} description`} onChange={(e) => setItem(index, { description: e.target.value })} />
              </td>
              <td className="brs-amount">
                <input className="sheet-input brs-right" value={item.amount} inputMode="decimal" placeholder="0.00" aria-label={`Row ${index + 1} amount`} onChange={(e) => setItem(index, { amount: e.target.value })} />
              </td>
              <td className="brs-tools">
                <button type="button" className="brs-icon-button is-quiet" aria-label={`Remove row ${index + 1}`} onClick={() => removeItem(index)}>
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {draft.items.length < BUY_RECEIPT_MAX_ITEMS && (
        <button type="button" className="brs-link-button" onClick={addItem}>
          + Add item
        </button>
      )}

      <div className="brs-total">
        <span className="brs-total-label">Total paid to seller</span>
        <span className="brs-total-value">{formatCurrency(total)}</span>
      </div>

      <div className="brs-pay">
        {draft.payments.map((payment, index) => (
          <div className="brs-pay-row" key={index}>
            <select
              className="sheet-input"
              value={payment.method}
              aria-label={split ? `Payment ${index + 1} method` : 'Payment method'}
              onChange={(e) => {
                if (e.target.value === 'check') focusCheckRow.current = index;
                setPayment(index, { method: e.target.value, reference: e.target.value === 'check' ? payment.reference : '' });
              }}
            >
              <option value="">Choose…</option>
              {BUY_RECEIPT_PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>{BUY_RECEIPT_PAYMENT_LABELS[method]}</option>
              ))}
            </select>
            {payment.method === 'check' ? (
              <input
                className="sheet-input"
                value={payment.reference}
                inputMode="numeric"
                placeholder="Check #"
                aria-label="Check number"
                ref={(el) => {
                  if (el && focusCheckRow.current === index) {
                    focusCheckRow.current = null;
                    el.focus();
                  }
                }}
                onChange={(e) => setPayment(index, { reference: e.target.value })}
              />
            ) : (
              <span />
            )}
            {split ? (
              <input className="sheet-input brs-right" value={payment.amount} inputMode="decimal" placeholder="0.00" aria-label={`Payment ${index + 1} amount`} onChange={(e) => setPayment(index, { amount: e.target.value })} />
            ) : (
              <span />
            )}
            {index === 0 ? (
              <button type="button" className="brs-icon-button" aria-label="Add another payment method" title="Add another payment method" disabled={draft.payments.length >= BUY_RECEIPT_MAX_PAYMENTS} onClick={addPayment}>
                +
              </button>
            ) : (
              <button type="button" className="brs-icon-button is-quiet" aria-label={`Remove payment ${index + 1}`} title="Remove this payment" onClick={() => removePayment(index)}>
                ×
              </button>
            )}
          </div>
        ))}
        <span className="brs-label">Paid by</span>
        {split && (
          <p className={`brs-hint ${balance.matches ? 'is-ok' : 'is-off'}`} role="status">
            {balance.message}
          </p>
        )}
      </div>

      <div className="brs-notes">
        <AutoGrowTextarea value={draft.notes} maxLength={BUY_RECEIPT_NOTES_MAX} ariaLabel="Notes" onChange={(notes) => set({ notes })} />
        <span className="brs-label">Notes (optional)</span>
      </div>

      <p className="brs-attest">{BUY_RECEIPT_ATTESTATION}</p>
      <SignatureBlock dateIso={dateIso} />
      <p className="brs-thanks">Thank you for choosing {BUSINESS_NAME}.</p>
    </>
  );

  return (
    <div className="buy-receipt-sheet">
      <Header receiptNumber={receiptNumber} dateIso={dateIso} />

      <h2 className="sheet-section-title">Seller</h2>
      <div className="brs-grid">
        {/* `brs-cell-name` / `brs-cell-email`: layout B — on the form the Email box is one column wider, the Name box one narrower. */}
        <label className="brs-c5 brs-cell-name">
          <input className="sheet-input" value={draft.sellerName} autoComplete="off" onChange={(e) => set({ sellerName: e.target.value })} {...seat('sellerName')} />
          <span className="brs-label">Name{why('sellerName')}</span>
        </label>
        <label className="brs-c3">
          <input className="sheet-input" value={draft.sellerPhone} inputMode="tel" autoComplete="off" onChange={(e) => set({ sellerPhone: e.target.value })} {...seat('sellerPhone')} />
          <span className="brs-label">Phone{why('sellerPhone')}</span>
        </label>
        <div className="brs-c4 brs-cell-email">
          <input id={emailId} className="sheet-input" value={draft.sellerEmail} inputMode="email" autoComplete="off" placeholder="name@example.com" onChange={(e) => set({ sellerEmail: e.target.value })} {...seat('sellerEmail')} />
          {/* `brs-two`: with both small boxes on the line, "(optional)" gives way when the box is narrow (see the styles). */}
          <div className={onEmailCopyChange && onMailingListChange ? 'brs-label-row brs-two' : 'brs-label-row'}>
            <label className="brs-label" htmlFor={emailId}>Email<span className="brs-opt"> (optional)</span></label>
            {onEmailCopyChange && (
              <label className="no-print brs-email-copy" title="Email a copy to the seller when saved">
                <input
                  type="checkbox"
                  checked={emailCopy}
                  disabled={!draft.sellerEmail.trim()}
                  aria-label="Email a copy to the seller when saved"
                  onChange={(e) => onEmailCopyChange(e.target.checked)}
                />
                <span>Email copy</span>
              </label>
            )}
            {onMailingListChange && (
              <label className="no-print brs-email-copy" title="Add this email to the mailing list when saved">
                <input
                  type="checkbox"
                  checked={mailingList}
                  disabled={!draft.sellerEmail.trim()}
                  aria-label="Add this email to the mailing list when saved"
                  onChange={(e) => onMailingListChange(e.target.checked)}
                />
                <span>Mailing list</span>
              </label>
            )}
          </div>
        </div>
        <label className="brs-c6">
          <input className="sheet-input" value={draft.sellerStreet} autoComplete="off" onChange={(e) => set({ sellerStreet: e.target.value })} {...seat('sellerStreet')} />
          <span className="brs-label">Street{why('sellerStreet')}</span>
        </label>
        <label className="brs-c3">
          <input className="sheet-input" value={draft.sellerCity} autoComplete="off" onChange={(e) => set({ sellerCity: e.target.value })} {...seat('sellerCity')} />
          <span className="brs-label">City{why('sellerCity')}</span>
        </label>
        <label className="brs-c1">
          <input className="sheet-input" value={draft.sellerState} maxLength={2} autoComplete="off" onChange={(e) => set({ sellerState: e.target.value.toUpperCase() })} {...seat('sellerState')} />
          <span className="brs-label">State</span>
        </label>
        <label className="brs-c2">
          <input className="sheet-input" value={draft.sellerZip} inputMode="numeric" maxLength={10} autoComplete="off" onChange={(e) => set({ sellerZip: e.target.value })} {...seat('sellerZip')} />
          <span className="brs-label">ZIP{why('sellerZip')}</span>
        </label>
        {/* From here down the paper is the owner's: off (and faded) in the seller's view. */}
        <label className={`brs-c4${offCell}`} inert={off}>
          <select className="sheet-input" value={draft.sellerIdType} disabled={off} onChange={(e) => set({ sellerIdType: e.target.value })}>
            <option value="">Choose…</option>
            {BUY_RECEIPT_ID_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <span className="brs-label">ID type</span>
        </label>
        <label className={`brs-c2${offCell}`} inert={off}>
          <input className="sheet-input" value={draft.sellerIdLast4} maxLength={4} autoComplete="off" disabled={off} onChange={(e) => set({ sellerIdLast4: e.target.value })} />
          <span className="brs-label">ID last 4</span>
        </label>
        <label className={`brs-c3${offCell}`} inert={off}>
          <input className="sheet-input" type="date" value={draft.sellerDob} disabled={off} onChange={(e) => set({ sellerDob: e.target.value })} />
          <span className="brs-label">Date of birth</span>
        </label>
      </div>
      {customer ? (
        // One switch for everything below the seller's boxes: a disabled fieldset turns off every
        // control inside it — the ID photo buttons included — on every browser.
        <fieldset className="brs-off brs-rest" disabled inert>
          {ownerPart}
        </fieldset>
      ) : (
        ownerPart
      )}
    </div>
  );
}

/** The seller's thumbprint on a shop copy, as tall as the ID photo it sits beside. */
function ThumbprintBlock({ url }: { url: string }) {
  return (
    <div className="brs-thumbprint">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Seller thumbprint" loading="eager" />
      <span className="brs-label brs-sign-label">Seller thumbprint</span>
    </div>
  );
}

function PrintSheet({ receipt, idPhotoUrl, showIdPhoto, thumbprintUrl, variant = 'shop' }: PrintProps) {
  const items = receipt.items ?? [];
  const sellerCopy = variant === 'seller';
  const withId = !sellerCopy && Boolean(showIdPhoto && idPhotoUrl);
  // The seller's copy never carries the thumbprint either.
  const thumbprint = !sellerCopy && thumbprintUrl ? thumbprintUrl : null;
  const cityStateZip = [[receipt.seller_city, receipt.seller_state].filter(Boolean).join(', '), receipt.seller_zip]
    .filter(Boolean)
    .join(' ');
  const isVoid = receipt.status === 'void';

  return (
    <div className="buy-receipt-sheet">
      {isVoid && <div className="brs-void-mark" aria-hidden="true">VOID</div>}
      <Header receiptNumber={receipt.receipt_number} dateIso={receipt.created_at} copyTag={sellerCopy ? "Seller's copy" : 'Shop copy'} />
      {isVoid && <p className="brs-void-line">VOID{receipt.void_reason ? ` — ${receipt.void_reason}` : ''}</p>}

      <h2 className="sheet-section-title">Seller</h2>
      <div className="brs-grid">
        <div className="brs-c5"><Value>{receipt.seller_name}</Value><span className="brs-label">Name</span></div>
        <div className="brs-c3"><Value>{receipt.seller_phone}</Value><span className="brs-label">Phone</span></div>
        <div className="brs-c4"><Value>{receipt.seller_email}</Value><span className="brs-label">Email</span></div>
        <div className="brs-c6"><Value>{receipt.seller_street}</Value><span className="brs-label">Street</span></div>
        <div className="brs-c6"><Value>{cityStateZip}</Value><span className="brs-label">City, state, ZIP</span></div>
        <div className="brs-c4"><Value>{receipt.seller_id_type}</Value><span className="brs-label">ID type</span></div>
        <div className="brs-c2"><Value>{receipt.seller_id_last4}</Value><span className="brs-label">ID last 4</span></div>
        <div className="brs-c3"><Value>{formatDob(receipt.seller_dob)}</Value><span className="brs-label">Date of birth</span></div>
      </div>

      <h2 className="sheet-section-title">Items purchased by {BUSINESS_NAME}</h2>
      <table className="brs-items">
        <thead>
          <tr>
            <th className="brs-num">#</th>
            <th className="brs-qty">Qty</th>
            <th>Description</th>
            <th className="brs-amount">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={index}>
              <td className="brs-num brs-text">{index + 1}</td>
              <td className="brs-qty brs-text">{item.qty}</td>
              <td className="brs-desc brs-text">{item.description}</td>
              <td className="brs-amount brs-text">{formatCurrency(item.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="brs-total">
        <span className="brs-total-label">Total paid to seller</span>
        <span className="brs-total-value">{formatCurrency(receipt.total)}</span>
      </div>

      <div className="brs-pay">
        <Value>{paymentsLine(receipt.payments)}</Value>
        <span className="brs-label">Paid by</span>
      </div>

      <div className="brs-notes">
        <Value>{receipt.notes}</Value>
        <span className="brs-label">Notes</span>
      </div>

      <p className="brs-attest">{BUY_RECEIPT_ATTESTATION}</p>
      {sellerCopy && <SignedBlock dateIso={receipt.created_at} />}
      {!sellerCopy && <SignatureBlock dateIso={receipt.created_at} />}
      {/* The pictures this copy carries, side by side UNDER the signatures (owner, 2026-10-06). They are
          the last thing on the sheet on purpose: when a receipt is too long for one page they are the
          first thing to move to a second sheet, together, and the signatures stay with the items. */}
      {(withId || thumbprint) && (
        <div className="brs-pictures">
          {withId && (
            <div className="brs-id">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={idPhotoUrl ?? undefined} alt="Seller ID" loading="eager" />
              <span className="brs-label brs-sign-label">Seller ID · file copy only</span>
            </div>
          )}
          {thumbprint && <ThumbprintBlock url={thumbprint} />}
        </div>
      )}

      {/* The thank-you line is for the seller; the shop copy stays in the shop and needs the room. */}
      {sellerCopy && <p className="brs-thanks">Thank you for choosing {BUSINESS_NAME}.</p>}
    </div>
  );
}

export default function BuyReceiptSheet(props: BuyReceiptSheetProps) {
  return (
    <>
      <style>{BUY_RECEIPT_SHEET_CSS}</style>
      {props.mode === 'edit' ? <EditSheet {...props} /> : <PrintSheet {...props} />}
    </>
  );
}
