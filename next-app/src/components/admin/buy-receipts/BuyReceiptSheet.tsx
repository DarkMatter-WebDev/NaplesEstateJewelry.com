'use client';

import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { BUSINESS_NAME, cityLine, streetLine } from '@/lib/business-location';
import { BUSINESS_EMAIL, BUSINESS_PHONE } from '@/lib/order-email-branding';
import {
  BUY_RECEIPT_ATTESTATION,
  BUY_RECEIPT_ID_TYPES,
  BUY_RECEIPT_MAX_ITEMS,
  BUY_RECEIPT_MAX_PAYMENTS,
  BUY_RECEIPT_NOTES_MAX,
  BUY_RECEIPT_PAYMENT_LABELS,
  BUY_RECEIPT_PAYMENT_METHODS,
  draftTotal,
  formatDob,
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
 *
 * The signature lines are always blank — they are signed by hand on the paper.
 * The seller's ID photo appears only when `showIdPhoto` is set, i.e. on a file
 * copy the owner asked for; the seller's own copy never carries it.
 */

type EditProps = {
  mode: 'edit';
  draft: BuyReceiptDraft;
  onChange: (draft: BuyReceiptDraft) => void;
  /** `BUY-00042`, or null while the receipt has not been saved yet. */
  receiptNumber: string | null;
  dateIso: string;
  /** The "Seller ID photo" strip: a screen-only control, never printed. */
  idPhotoSlot?: ReactNode;
};

type PrintProps = {
  mode: 'print';
  receipt: BuyReceiptRow;
  idPhotoUrl?: string | null;
  showIdPhoto?: boolean;
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

function Header({ receiptNumber, dateIso }: { receiptNumber: string | null; dateIso: string }) {
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
      </div>
    </div>
  );
}

function SignatureBlock() {
  return (
    <div className="brs-signatures">
      <div>
        <div className="brs-sign-line" />
        <span className="brs-label brs-sign-label">Seller signature</span>
      </div>
      <div>
        <div className="brs-sign-line" />
        <span className="brs-label brs-sign-label">Date</span>
      </div>
      <div>
        <div className="brs-sign-line" />
        <span className="brs-label brs-sign-label">Received by — {BUSINESS_NAME}</span>
      </div>
      <div />
    </div>
  );
}

function Value({ children }: { children?: ReactNode }) {
  return <span className="brs-value">{children || ' '}</span>;
}

function EditSheet({ draft, onChange, receiptNumber, dateIso, idPhotoSlot }: EditProps) {
  // Set when the owner picks "Check", so the check-number field takes focus as it appears.
  const focusCheckRow = useRef<number | null>(null);

  const set = (patch: Partial<BuyReceiptDraft>) => onChange({ ...draft, ...patch });
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

  return (
    <div className="buy-receipt-sheet">
      <Header receiptNumber={receiptNumber} dateIso={dateIso} />

      <h2 className="sheet-section-title">Seller</h2>
      <div className="brs-grid">
        <label className="brs-c5">
          <span className="brs-label">Name</span>
          <input className="sheet-input" value={draft.sellerName} autoComplete="off" onChange={(e) => set({ sellerName: e.target.value })} />
        </label>
        <label className="brs-c3">
          <span className="brs-label">Phone</span>
          <input className="sheet-input" value={draft.sellerPhone} inputMode="tel" autoComplete="off" onChange={(e) => set({ sellerPhone: e.target.value })} />
        </label>
        <label className="brs-c4">
          <span className="brs-label">Email (optional)</span>
          <input className="sheet-input" value={draft.sellerEmail} inputMode="email" autoComplete="off" placeholder="name@example.com" onChange={(e) => set({ sellerEmail: e.target.value })} />
        </label>
        <label className="brs-c6">
          <span className="brs-label">Street</span>
          <input className="sheet-input" value={draft.sellerStreet} autoComplete="off" onChange={(e) => set({ sellerStreet: e.target.value })} />
        </label>
        <label className="brs-c3">
          <span className="brs-label">City</span>
          <input className="sheet-input" value={draft.sellerCity} autoComplete="off" onChange={(e) => set({ sellerCity: e.target.value })} />
        </label>
        <label className="brs-c1">
          <span className="brs-label">State</span>
          <input className="sheet-input" value={draft.sellerState} maxLength={2} autoComplete="off" onChange={(e) => set({ sellerState: e.target.value.toUpperCase() })} />
        </label>
        <label className="brs-c2">
          <span className="brs-label">ZIP</span>
          <input className="sheet-input" value={draft.sellerZip} inputMode="numeric" maxLength={10} autoComplete="off" onChange={(e) => set({ sellerZip: e.target.value })} />
        </label>
        <label className="brs-c4">
          <span className="brs-label">ID type</span>
          <select className="sheet-input" value={draft.sellerIdType} onChange={(e) => set({ sellerIdType: e.target.value })}>
            <option value="">Choose…</option>
            {BUY_RECEIPT_ID_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>
        <label className="brs-c2">
          <span className="brs-label">ID last 4</span>
          <input className="sheet-input" value={draft.sellerIdLast4} maxLength={4} autoComplete="off" onChange={(e) => set({ sellerIdLast4: e.target.value })} />
        </label>
        <label className="brs-c3">
          <span className="brs-label">Date of birth</span>
          <input className="sheet-input" type="date" value={draft.sellerDob} onChange={(e) => set({ sellerDob: e.target.value })} />
        </label>
      </div>
      {idPhotoSlot}

      <h2 className="sheet-section-title">Items purchased</h2>
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
              <td>
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
        <span className="brs-label">Paid by</span>
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
        {split && (
          <p className={`brs-hint ${balance.matches ? 'is-ok' : 'is-off'}`} role="status">
            {balance.message}
          </p>
        )}
      </div>

      <div className="brs-notes">
        <span className="brs-label">Notes (optional)</span>
        <AutoGrowTextarea value={draft.notes} maxLength={BUY_RECEIPT_NOTES_MAX} ariaLabel="Notes" onChange={(notes) => set({ notes })} />
      </div>

      <p className="brs-attest">{BUY_RECEIPT_ATTESTATION}</p>
      <SignatureBlock />
      <p className="brs-thanks">Thank you for choosing {BUSINESS_NAME}.</p>
    </div>
  );
}

function PrintSheet({ receipt, idPhotoUrl, showIdPhoto }: PrintProps) {
  const items = receipt.items ?? [];
  const cityStateZip = [[receipt.seller_city, receipt.seller_state].filter(Boolean).join(', '), receipt.seller_zip]
    .filter(Boolean)
    .join(' ');
  const isVoid = receipt.status === 'void';

  return (
    <div className="buy-receipt-sheet">
      {isVoid && <div className="brs-void-mark" aria-hidden="true">VOID</div>}
      <Header receiptNumber={receipt.receipt_number} dateIso={receipt.created_at} />
      {isVoid && <p className="brs-void-line">VOID{receipt.void_reason ? ` — ${receipt.void_reason}` : ''}</p>}

      <h2 className="sheet-section-title">Seller</h2>
      <div className="brs-grid">
        <div className="brs-c5"><span className="brs-label">Name</span><Value>{receipt.seller_name}</Value></div>
        <div className="brs-c3"><span className="brs-label">Phone</span><Value>{receipt.seller_phone}</Value></div>
        <div className="brs-c4"><span className="brs-label">Email</span><Value>{receipt.seller_email}</Value></div>
        <div className="brs-c6"><span className="brs-label">Street</span><Value>{receipt.seller_street}</Value></div>
        <div className="brs-c6"><span className="brs-label">City, state, ZIP</span><Value>{cityStateZip}</Value></div>
        <div className="brs-c4"><span className="brs-label">ID type</span><Value>{receipt.seller_id_type}</Value></div>
        <div className="brs-c2"><span className="brs-label">ID last 4</span><Value>{receipt.seller_id_last4}</Value></div>
        <div className="brs-c3"><span className="brs-label">Date of birth</span><Value>{formatDob(receipt.seller_dob)}</Value></div>
      </div>

      <h2 className="sheet-section-title">Items purchased</h2>
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
              <td className="brs-text">{item.description}</td>
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
        <span className="brs-label">Paid by</span>
        <Value>{paymentsLine(receipt.payments)}</Value>
      </div>

      <div className="brs-notes">
        <span className="brs-label">Notes</span>
        <Value>{receipt.notes}</Value>
      </div>

      <p className="brs-attest">{BUY_RECEIPT_ATTESTATION}</p>
      {showIdPhoto && idPhotoUrl && (
        // File copy: the ID sits BESIDE the signature lines, at card size, so the
        // copy still fits one page (under them it ran onto a second sheet).
        <div className="brs-sign-with-id">
          <div className="brs-sign-stack">
            <div>
              <div className="brs-sign-line" />
              <span className="brs-label brs-sign-label">Seller signature</span>
            </div>
            <div>
              <div className="brs-sign-line" />
              <span className="brs-label brs-sign-label">Date</span>
            </div>
            <div>
              <div className="brs-sign-line" />
              <span className="brs-label brs-sign-label">Received by — {BUSINESS_NAME}</span>
            </div>
          </div>
          <div className="brs-id">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={idPhotoUrl} alt="Seller ID" loading="eager" />
            <span className="brs-label brs-sign-label">Seller ID · file copy only</span>
          </div>
        </div>
      )}
      {!(showIdPhoto && idPhotoUrl) && <SignatureBlock />}

      {/* The thank-you line is for the seller; the file copy (with the ID) stays in the shop and needs the room. */}

      {!(showIdPhoto && idPhotoUrl) && <p className="brs-thanks">Thank you for choosing {BUSINESS_NAME}.</p>}
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
