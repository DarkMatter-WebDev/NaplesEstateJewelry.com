'use client';

import { useState } from 'react';
import Link from 'next/link';
import AdminModal from '@/components/admin/AdminModal';
import {
  BUY_RECEIPT_VOID_REASON_MAX,
  draftFromReceipt,
  formatReceiptDateTime,
  normalizeBuyReceiptInput,
  receiptPrintLabel,
  type BuyReceiptDraft,
  type BuyReceiptRow,
} from '@/lib/buy-receipts';
import BuyReceiptSheet from './BuyReceiptSheet';
import IdPhotoField from './IdPhotoField';
import ReceiptPrintControls from './ReceiptPrintControls';
import { removeIdPhoto, updateReceipt, uploadIdPhoto, useIdPhotoUrl, voidReceipt } from './buy-receipt-client';

/**
 * One saved receipt: the paper, its ID photo, and what can be done with it —
 * print (here or on the desktop), edit, duplicate, void.
 *
 * Owner ruling 2026-09-30: a saved receipt can be edited. A VOID one cannot
 * (the database refuses it too); duplicate it to record the corrected purchase.
 */

const hintStyle = { color: 'var(--color-on-surface-variant)' } as const;
const cardStyle = { borderColor: 'var(--color-outline-variant)' } as const;

export default function BuyReceiptDetail({ adminBasePath, initialReceipt }: { adminBasePath: string; initialReceipt: BuyReceiptRow }) {
  const [receipt, setReceipt] = useState(initialReceipt);
  const [draft, setDraft] = useState<BuyReceiptDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoNote, setPhotoNote] = useState<{ text: string; ok: boolean } | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voidError, setVoidError] = useState<string | null>(null);
  const [voidBusy, setVoidBusy] = useState(false);

  const idPhotoUrl = useIdPhotoUrl(receipt.seller_id_photo_path);
  const isVoid = receipt.status === 'void';
  const editing = draft !== null;

  async function saveEdit() {
    if (!draft || saving) return;
    const check = normalizeBuyReceiptInput(draft);
    if ('error' in check) {
      setError(check.error);
      return;
    }
    setSaving(true);
    setError(null);
    const result = await updateReceipt(receipt.id, draft);
    setSaving(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setReceipt(result.receipt);
    setDraft(null);
  }

  async function pickPhoto(photo: Blob) {
    setPhotoBusy(true);
    setPhotoNote(null);
    const result = await uploadIdPhoto(receipt.id, photo);
    setPhotoBusy(false);
    if ('error' in result) {
      setPhotoNote({ text: result.error, ok: false });
      return;
    }
    setReceipt(result.receipt);
  }

  async function removePhoto() {
    if (!window.confirm('Remove the ID photo from this receipt? This cannot be undone.')) return;
    setPhotoBusy(true);
    setPhotoNote(null);
    const result = await removeIdPhoto(receipt.id);
    setPhotoBusy(false);
    if ('error' in result) {
      setPhotoNote({ text: result.error, ok: false });
      return;
    }
    setReceipt(result.receipt);
  }

  async function confirmVoid() {
    if (voidBusy) return;
    if (voidReason.trim().length < 3) {
      setVoidError('Say why this receipt is being voided.');
      return;
    }
    setVoidBusy(true);
    setVoidError(null);
    const result = await voidReceipt(receipt.id, voidReason);
    setVoidBusy(false);
    if ('error' in result) {
      setVoidError(result.error);
      return;
    }
    setReceipt(result.receipt);
    setDraft(null);
    setVoiding(false);
    setVoidReason('');
  }

  const photoField = isVoid ? null : (
    <IdPhotoField
      previewUrl={idPhotoUrl}
      busy={photoBusy}
      note={photoNote ?? (receipt.seller_id_photo_path && !idPhotoUrl ? { text: 'Loading the photo…', ok: true } : null)}
      onPick={(photo) => void pickPhoto(photo)}
      onRemove={() => void removePhoto()}
    />
  );

  return (
    <div>
      {editing && draft ? (
        <BuyReceiptSheet
          mode="edit"
          draft={draft}
          onChange={setDraft}
          receiptNumber={receipt.receipt_number}
          dateIso={receipt.created_at}
          idPhotoSlot={photoField}
        />
      ) : (
        <BuyReceiptSheet mode="print" receipt={receipt} />
      )}

      <div className="mx-auto mt-4 grid gap-3" style={{ width: 'min(8.5in, 100%)' }}>
        {error && (
          <p role="alert" className="border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)', background: 'color-mix(in srgb, var(--color-error) 8%, transparent)' }}>
            {error}
          </p>
        )}

        {editing ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" className="outline-button text-xs" disabled={saving} onClick={() => { setDraft(null); setError(null); }}>
              Cancel
            </button>
            <button type="button" className="gold-button text-xs" disabled={saving} onClick={() => void saveEdit()}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        ) : (
          <>
            {/* The photo strip lives on the paper while editing; here it sits under it. */}
            {photoField}
            {isVoid && receipt.seller_id_photo_path && idPhotoUrl && (
              <div className="border bg-white p-3 text-sm" style={cardStyle}>
                <span style={hintStyle}>Seller ID photo on file</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={idPhotoUrl} alt="Seller ID" className="mt-2" style={{ width: 200, border: '1px solid #d5c697' }} />
              </div>
            )}

            <div className="border bg-white p-4" style={cardStyle}>
              <ReceiptPrintControls receipt={receipt} onChanged={setReceipt} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link href={`${adminBasePath}/buy-receipts/log`} className="outline-button text-xs">Back to the log</Link>
              <span className="flex-1" />
              <Link href={`${adminBasePath}/buy-receipts?from=${receipt.id}`} className="outline-button text-xs">Duplicate</Link>
              {!isVoid && (
                <>
                  <button type="button" className="outline-button text-xs" onClick={() => { setDraft(draftFromReceipt(receipt)); setError(null); }}>
                    Edit
                  </button>
                  <button type="button" className="outline-button text-xs" style={{ color: 'var(--color-error)', borderColor: 'var(--color-error)' }} onClick={() => setVoiding(true)}>
                    Void
                  </button>
                </>
              )}
            </div>
          </>
        )}

        <div className="grid gap-1 border bg-white p-4 text-sm" style={cardStyle}>
          <div className="flex justify-between gap-3"><span style={hintStyle}>Recorded</span><span className="text-right">{formatReceiptDateTime(receipt.created_at)}{receipt.created_by_email ? ` by ${receipt.created_by_email}` : ''}</span></div>
          {receipt.updated_at !== receipt.created_at && (
            <div className="flex justify-between gap-3"><span style={hintStyle}>Last change</span><span className="text-right">{formatReceiptDateTime(receipt.updated_at)}{receipt.updated_by_email ? ` by ${receipt.updated_by_email}` : ''}</span></div>
          )}
          <div className="flex justify-between gap-3"><span style={hintStyle}>Printing</span><span className="text-right">{receiptPrintLabel(receipt)}{receipt.printed_at ? ` · last ${formatReceiptDateTime(receipt.printed_at)}` : ''}</span></div>
          {isVoid && (
            <div className="flex justify-between gap-3" style={{ color: 'var(--color-error)' }}><span>Void</span><span className="text-right">{receipt.void_reason}{receipt.voided_at ? ` · ${formatReceiptDateTime(receipt.voided_at)}` : ''}</span></div>
          )}
        </div>
      </div>

      {voiding && (
        <AdminModal title={`Void ${receipt.receipt_number}`} onClose={() => setVoiding(false)}>
          <div className="grid gap-3">
            <p className="text-sm" style={hintStyle}>
              The receipt keeps its number and stays in the log, marked VOID. It can no longer be edited and this cannot be undone. To record the corrected purchase, duplicate it.
            </p>
            <label className="block">
              <span className="form-label" style={{ color: 'var(--color-primary)' }}>Reason</span>
              <textarea className="form-field" rows={3} maxLength={BUY_RECEIPT_VOID_REASON_MAX} value={voidReason} onChange={(event) => setVoidReason(event.target.value)} />
            </label>
            {voidError && <p role="alert" className="text-sm" style={{ color: 'var(--color-error)' }}>{voidError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="outline-button text-xs" disabled={voidBusy} onClick={() => setVoiding(false)}>Keep it</button>
              <button type="button" className="gold-button text-xs" disabled={voidBusy} onClick={() => void confirmVoid()}>
                {voidBusy ? 'Voiding…' : 'Void this receipt'}
              </button>
            </div>
          </div>
        </AdminModal>
      )}
    </div>
  );
}
