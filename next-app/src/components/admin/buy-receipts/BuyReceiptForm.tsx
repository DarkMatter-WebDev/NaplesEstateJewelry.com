'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BUY_RECEIPT_DEFAULT_PRINT_SET,
  BUY_RECEIPT_ONE_PAGE_LINES,
  blankBuyReceiptDraft,
  draftPaperLines,
  normalizeBuyReceiptInput,
  paymentsLine,
  type BuyReceiptDraft,
  type BuyReceiptPrintSetKey,
  type BuyReceiptRow,
} from '@/lib/buy-receipts';
import { formatCurrency } from '@/types/sales';
import BuyReceiptSheet from './BuyReceiptSheet';
import IdPhotoField from './IdPhotoField';
import ReceiptPrintControls, { PrintSetSelect, printSetAllowed } from './ReceiptPrintControls';
import { createReceipt, emailReceipt, uploadIdPhoto } from './buy-receipt-client';

/**
 * Admin → Buy Receipts → New receipt (owner mockups 2026-09-29/30).
 *
 * The form IS the receipt: the paper with underlined fields, and one row of
 * buttons under it. Saving goes: receipt → ID photo → print. The photo is held
 * in the browser until the receipt exists, so an abandoned form leaves nothing
 * behind in storage; and a photo that fails to upload never costs the receipt —
 * the after-save panel says so and offers a retry.
 */

type Action = 'save' | 'send' | 'print';
type Saved = { receipt: BuyReceiptRow; action: 'send' | 'print' | null; setKey: BuyReceiptPrintSetKey };
type EmailState = { status: 'sent'; to: string } | { status: 'failed'; error: string } | null;

const hintStyle = { color: 'var(--color-on-surface-variant)' } as const;
const cardStyle = { borderColor: 'var(--color-outline-variant)' } as const;

export default function BuyReceiptForm({
  adminBasePath,
  nowIso,
  initialDraft,
  duplicatedFrom = null,
}: {
  adminBasePath: string;
  /** The server's clock at render, so the date on the blank paper matches on both sides of hydration. */
  nowIso: string;
  initialDraft?: BuyReceiptDraft;
  duplicatedFrom?: { id: string; number: string } | null;
}) {
  const [draft, setDraft] = useState<BuyReceiptDraft>(() => initialDraft ?? blankBuyReceiptDraft());
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [chosenSet, setChosenSet] = useState<BuyReceiptPrintSetKey>(BUY_RECEIPT_DEFAULT_PRINT_SET);
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [photoFailed, setPhotoFailed] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [emailCopy, setEmailCopy] = useState(false);
  const [emailState, setEmailState] = useState<EmailState>(null);
  const [emailing, setEmailing] = useState(false);

  const hasPhoto = photo !== null;
  const setKey = printSetAllowed(chosenSet, hasPhoto) ? chosenSet : BUY_RECEIPT_DEFAULT_PRINT_SET;

  useEffect(() => {
    const url = photo?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [photo]);

  function pickPhoto(blob: Blob) {
    setPhoto({ blob, url: URL.createObjectURL(blob) });
  }

  function startOver() {
    setDraft(blankBuyReceiptDraft());
    setPhoto(null);
    setChosenSet(BUY_RECEIPT_DEFAULT_PRINT_SET);
    setError(null);
    setSaved(null);
    setPhotoFailed(null);
    setEmailCopy(false);
    setEmailState(null);
  }

  async function submit(action: Action) {
    if (busy) return;
    const check = normalizeBuyReceiptInput(draft);
    if ('error' in check) {
      setError(check.error);
      return;
    }
    const wantsEmail = emailCopy && Boolean(draft.sellerEmail.trim());
    setBusy(action);
    setError(null);

    const created = await createReceipt(draft, duplicatedFrom?.id ?? null, wantsEmail);
    if ('error' in created) {
      setError(`${created.error} Nothing was saved.`);
      setBusy(null);
      return;
    }

    let receipt = created.receipt;
    if (wantsEmail) {
      setEmailState(
        created.emailed
          ? { status: 'sent', to: receipt.emailed_to ?? draft.sellerEmail.trim() }
          : { status: 'failed', error: created.emailError ?? 'The receipt could not be emailed.' },
      );
    }
    if (photo) {
      const uploaded = await uploadIdPhoto(receipt.id, photo.blob);
      if ('error' in uploaded) setPhotoFailed(uploaded.error);
      else receipt = uploaded.receipt;
    }

    const usableSet = printSetAllowed(setKey, Boolean(receipt.seller_id_photo_path)) ? setKey : BUY_RECEIPT_DEFAULT_PRINT_SET;
    setSaved({ receipt, action: action === 'save' ? null : action, setKey: usableSet });
    setBusy(null);
  }

  async function retryPhoto() {
    if (!saved || !photo || retrying) return;
    setRetrying(true);
    const uploaded = await uploadIdPhoto(saved.receipt.id, photo.blob);
    setRetrying(false);
    if ('error' in uploaded) {
      setPhotoFailed(uploaded.error);
      return;
    }
    setPhotoFailed(null);
    setSaved({ ...saved, receipt: uploaded.receipt });
  }

  async function emailNow() {
    if (!saved || emailing) return;
    setEmailing(true);
    const result = await emailReceipt(saved.receipt.id);
    setEmailing(false);
    if ('error' in result) {
      setEmailState({ status: 'failed', error: result.error });
      return;
    }
    setEmailState({ status: 'sent', to: result.receipt.emailed_to ?? saved.receipt.seller_email ?? '' });
    setSaved({ ...saved, receipt: result.receipt });
  }

  if (saved) {
    const { receipt } = saved;
    return (
      <div className="mx-auto grid max-w-xl gap-4" role="status">
        <div className="grid justify-items-center gap-2 pt-2 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full border" style={{ borderColor: 'var(--color-primary)', background: '#fbf5dd' }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
          </span>
          <h2 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>Receipt saved</h2>
          <span className="text-xs" style={hintStyle}>Receipt <strong>{receipt.receipt_number}</strong></span>
        </div>

        <div className="grid gap-2 rounded-[1.25rem] border bg-white p-5 text-sm" style={cardStyle}>
          <div className="flex justify-between gap-3"><span style={hintStyle}>Seller</span><span className="text-right">{receipt.seller_name}</span></div>
          <div className="flex justify-between gap-3"><span style={hintStyle}>Items</span><span className="text-right">{receipt.items.length}</span></div>
          <div className="flex justify-between gap-3"><span style={hintStyle}>Paid by</span><span className="text-right">{paymentsLine(receipt.payments)}</span></div>
          <div className="flex justify-between gap-3"><span style={hintStyle}>ID photo</span><span className="text-right">{receipt.seller_id_photo_path ? 'Attached' : 'None'}</span></div>
          <div className="flex items-center justify-between gap-3">
            <span style={hintStyle}>Email</span>
            <span className="flex items-center gap-2 text-right">
              {emailState?.status === 'sent' ? (
                <span style={{ color: 'var(--color-primary)' }}>Emailed to {emailState.to}</span>
              ) : emailState?.status === 'failed' ? (
                <span style={{ color: 'var(--color-error)' }}>{emailState.error}</span>
              ) : (
                <span>{receipt.seller_email ? 'Not emailed' : 'No email address'}</span>
              )}
              {receipt.seller_email && emailState?.status !== 'sent' && (
                <button type="button" className="outline-button text-xs" disabled={emailing} onClick={() => void emailNow()}>
                  {emailing ? 'Sending…' : 'Email now'}
                </button>
              )}
            </span>
          </div>
          <div className="flex justify-between gap-3 border-t pt-3 text-xl font-bold" style={{ ...cardStyle, fontFamily: 'var(--font-headline)' }}><span>Total paid</span><span>{formatCurrency(receipt.total)}</span></div>
        </div>

        {photoFailed && (
          <div role="alert" className="grid gap-2 rounded-[1.25rem] border p-4 text-sm" style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)' }}>
            <span>The receipt is saved, but the ID photo did not upload. {photoFailed}</span>
            <button type="button" className="outline-button text-xs justify-self-start" disabled={retrying} onClick={() => void retryPhoto()}>
              {retrying ? 'Uploading…' : 'Try the photo again'}
            </button>
          </div>
        )}

        <div className="rounded-[1.25rem] border bg-white p-5" style={cardStyle}>
          <ReceiptPrintControls
            receipt={receipt}
            initialSet={saved.setKey}
            autoAction={saved.action}
            onChanged={(next) => setSaved((current) => (current ? { ...current, receipt: next } : current))}
          />
        </div>

        <div className="grid gap-2 pt-1 sm:grid-cols-2">
          <button type="button" className="gold-button text-xs" onClick={startOver}>New receipt</button>
          <Link href={`${adminBasePath}/buy-receipts/${receipt.id}`} className="outline-button text-xs">Open {receipt.receipt_number}</Link>
        </div>
      </div>
    );
  }

  const longReceipt = draftPaperLines(draft) > BUY_RECEIPT_ONE_PAGE_LINES;

  return (
    <form
      // Enter in a field must never save a half-filled receipt: every action is a button.
      onSubmit={(event) => event.preventDefault()}
    >
      {duplicatedFrom && (
        <p className="mb-3 text-sm" style={hintStyle}>
          Copy of <strong>{duplicatedFrom.number}</strong>. It saves as a new receipt with its own number.
        </p>
      )}

      <BuyReceiptSheet
        mode="edit"
        draft={draft}
        onChange={setDraft}
        receiptNumber={null}
        dateIso={nowIso}
        idPhotoSlot={
          <IdPhotoField previewUrl={photo?.url ?? null} onPick={pickPhoto} onRemove={() => setPhoto(null)} />
        }
        emailCopy={emailCopy}
        onEmailCopyChange={setEmailCopy}
      />

      <div className="mx-auto mt-4 grid gap-2" style={{ width: 'min(8.5in, 100%)' }}>
        {error && (
          <p role="alert" className="border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)', background: 'color-mix(in srgb, var(--color-error) 8%, transparent)' }}>
            {error}
          </p>
        )}
        {longReceipt && (
          <p className="text-xs" style={hintStyle}>
            This receipt is long and may run onto a second page.
          </p>
        )}
        {/* What prints, on its own line: beside the buttons it pushed the main button onto a second row. */}
        <div className="flex justify-end">
          <PrintSetSelect value={setKey} hasIdPhoto={hasPhoto} onChange={setChosenSet} disabled={busy !== null} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="outline-button text-xs" disabled={busy !== null} onClick={startOver}>
            Clear
          </button>
          <span className="flex-1" />
          <button type="button" className="outline-button text-xs" disabled={busy !== null} onClick={() => void submit('print')}>
            {busy === 'print' ? 'Saving…' : 'Print here'}
          </button>
          <button type="button" className="outline-button text-xs" disabled={busy !== null} onClick={() => void submit('save')}>
            {busy === 'save' ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="gold-button text-xs" disabled={busy !== null} onClick={() => void submit('send')}>
            {busy === 'send' ? 'Saving…' : 'Save and send to desktop printer'}
          </button>
        </div>
        <p className="text-xs" style={hintStyle}>
          The number is assigned when the receipt is saved. The buttons and the ID photo strip are not printed.
        </p>
      </div>
    </form>
  );
}
