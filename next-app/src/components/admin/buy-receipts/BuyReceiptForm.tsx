'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { draftContinuePath, normalizeBuyReceiptDraftSave, type BuyReceiptDraftForm } from '@/lib/buy-receipt-drafts';
import { applyIdReadToDraft } from '@/lib/buy-receipt-id-read';
import {
  BUY_RECEIPT_ONE_PAGE_LINES,
  blankBuyReceiptDraft,
  defaultPrintSet,
  draftPaperLines,
  formatReceiptDateTime,
  normalizeBuyReceiptInput,
  paymentsLine,
  type BuyReceiptDraft,
  type BuyReceiptPrintSetKey,
  type BuyReceiptRow,
} from '@/lib/buy-receipts';
import {
  CUSTOMER_MODE_STORAGE_KEY,
  customerHandBack,
  readCustomerModeSnapshot,
  writeCustomerModeSnapshot,
  type CustomerHandBackReason,
} from '@/lib/buy-receipt-customer-mode';
import { CUSTOMER_MODE_MARKER_KEY } from '@/lib/customer-mode-lock';
import { formatCurrency } from '@/types/sales';
import BuyReceiptCustomerMode, { releaseCustomerModePage } from './BuyReceiptCustomerMode';
import BuyReceiptSheet, { type BuyReceiptCustomerView } from './BuyReceiptSheet';
import BuyReceiptTabs from './BuyReceiptTabs';
import IdPhotoField from './IdPhotoField';
import ReceiptPrintControls, { PrintSetSelect, printSetAllowed } from './ReceiptPrintControls';
import ThumbprintField from './ThumbprintField';
import {
  createReceipt,
  emailReceipt,
  finishDraftReceipt,
  readIdPhoto,
  removeIdPhoto,
  removeThumbprint,
  saveDraftReceipt,
  startCustomerMode,
  uploadIdPhoto,
  uploadThumbprint,
  useIdPhotoUrl,
} from './buy-receipt-client';
import { CUSTOMER_MODE_PAGE_CSS } from './buy-receipt-customer-css';

/**
 * Admin → Buy Receipts → New receipt (owner mockups 2026-09-29/30).
 *
 * The form IS the receipt: the paper with underlined fields, and one row of
 * buttons under it. Saving goes: receipt → ID photo → thumbprint → print. The
 * photo and the thumbprint (owner, 2026-10-06) are held in the browser until
 * the receipt exists, so an abandoned form leaves nothing behind in storage;
 * and one that fails to upload never costs the receipt — the after-save panel
 * says so and offers a retry.
 *
 * "Customer input mode" (owner, 2026-10-03) is OPTIONAL: one small button on
 * the tabs row hands the tablet to the seller. They see this same paper,
 * locked to the whole screen, with only their own contact boxes switched on
 * and everything else faded (`BuyReceiptCustomerMode` is the locked screen; it
 * draws the paper through `sheet()` below, so it is the very same paper on the
 * very same draft). When the tablet comes back the form simply has the details
 * in it. The owner can equally ignore the button and type everything here.
 *
 * "Mailing list" (owner, 2026-10-03) is the second small box beside "Email
 * copy": ticked — by the owner here, or by the seller in customer input mode —
 * the email joins the mailing list when the receipt is saved.
 *
 * "Save draft" (owner, 2026-10-09: "start on ipad, then pick up and finish on
 * the laptop where i can use the thumbprint reader"): saves the form as typed
 * under a real BUY number, with nothing but the seller's name required. From
 * then on the form is LINKED to that draft (`linked`): the ID photo and the
 * thumbprint are stored the moment they are picked, "Save draft" saves it
 * again, and the three save buttons FINISH it — the full check, then a
 * recorded receipt under the same number. The same form opens a draft from the
 * Log on any device (`draftReceipt` + `draftForm`, from the page).
 */

type Action = 'save' | 'send' | 'print';
type Saved = { receipt: BuyReceiptRow; action: 'send' | 'print' | null; setKey: BuyReceiptPrintSetKey };
type EmailState = { status: 'sent'; to: string } | { status: 'failed'; error: string } | null;
/** The tablet is with the seller: on their boxes, or on the locked Thank-you screen. */
type CustomerMode = { phase: 'form' | 'thanks'; tried: boolean };

const hintStyle = { color: 'var(--color-on-surface-variant)' } as const;
const cardStyle = { borderColor: 'var(--color-outline-variant)' } as const;

export default function BuyReceiptForm({
  adminBasePath,
  nowIso,
  initialDraft,
  duplicatedFrom = null,
  startInCustomerMode = false,
  draftReceipt = null,
  draftForm = null,
}: {
  adminBasePath: string;
  /** The server's clock at render, so the date on the blank paper matches on both sides of hydration. */
  nowIso: string;
  initialDraft?: BuyReceiptDraft;
  duplicatedFrom?: { id: string; number: string } | null;
  /** This browser carries the customer-mode lock (a refresh, or a bounced address): open straight into the seller's screen. */
  startInCustomerMode?: boolean;
  /** A saved draft opened to carry on with it (`?draft=<id>`), and the form it was saved with. */
  draftReceipt?: BuyReceiptRow | null;
  draftForm?: BuyReceiptDraftForm | null;
}) {
  const [draft, setDraft] = useState<BuyReceiptDraft>(() => draftForm?.draft ?? initialDraft ?? blankBuyReceiptDraft());
  /** The saved draft this form belongs to; null on a receipt that has never been saved. */
  const [linked, setLinked] = useState<BuyReceiptRow | null>(draftReceipt);
  const [draftBusy, setDraftBusy] = useState(false);
  /** Said under the draft line after a save: only when something did not go with it. */
  const [draftNote, setDraftNote] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoNote, setPhotoNote] = useState<string | null>(null);
  const [thumbprintBusy, setThumbprintBusy] = useState(false);
  const [thumbprintNote, setThumbprintNote] = useState<string | null>(null);
  // A linked draft's pictures are already in the private bucket: shown through the ten-minute signed link.
  const storedPhotoUrl = useIdPhotoUrl(linked?.seller_id_photo_path);
  const storedThumbprintUrl = useIdPhotoUrl(linked?.seller_thumbprint_path);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [thumbprint, setThumbprint] = useState<{ blob: Blob; url: string } | null>(null);
  /** "Fill form from ID" (owner, 2026-10-09): ticked on every new receipt; unticked, the photo is sent nowhere. */
  const [fillFromId, setFillFromId] = useState(true);
  const [readingId, setReadingId] = useState(false);
  const [idReadFailed, setIdReadFailed] = useState<string | null>(null);
  /** Counts the reads asked for, so an answer that arrives after the photo was replaced or removed is dropped. */
  const idReadRun = useRef(0);
  /** What the owner picked in "What to print"; null until they pick, so the default can follow the ID photo. */
  const [chosenSet, setChosenSet] = useState<BuyReceiptPrintSetKey | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [photoFailed, setPhotoFailed] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [thumbprintFailed, setThumbprintFailed] = useState<string | null>(null);
  const [retryingThumbprint, setRetryingThumbprint] = useState(false);
  const [emailCopy, setEmailCopy] = useState(draftForm?.emailCopy ?? false);
  const [emailState, setEmailState] = useState<EmailState>(null);
  const [emailing, setEmailing] = useState(false);
  const [customerMode, setCustomerMode] = useState<CustomerMode | null>(startInCustomerMode ? { phase: 'form', tried: false } : null);
  /** Browser storage has been read: the seller's screen may be drawn, and the form may be stored again. */
  const [restored, setRestored] = useState(false);
  const [modeBusy, setModeBusy] = useState(false);
  const [modeError, setModeError] = useState<string | null>(null);
  /** "Mailing list" is ticked (by the owner on this form, or by the seller in customer input mode); acted on when the receipt is saved. */
  const [mailingList, setMailingList] = useState(draftForm?.mailingList ?? false);
  const [listState, setListState] = useState<'added' | 'failed' | null>(null);
  /** How the tablet last came back; the line it may leave on the form is worked out from this, live. */
  const [handBackReason, setHandBackReason] = useState<CustomerHandBackReason | null>(null);

  const hasPhoto = linked ? Boolean(linked.seller_id_photo_path) : photo !== null;
  // Nobody picked (or the pick needs a photo that is gone): the default — with the ID photo as soon as there is one.
  const setKey = chosenSet && printSetAllowed(chosenSet, hasPhoto) ? chosenSet : defaultPrintSet(hasPhoto);

  useEffect(() => {
    const url = photo?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [photo]);

  useEffect(() => {
    const url = thumbprint?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [thumbprint]);

  useEffect(() => {
    // A refresh in customer input mode: bring back what was typed (the owner's
    // items as well as the seller's boxes). Browser storage only exists after
    // mount — reading it here, post-hydration, is the intended pattern, so the
    // set-state-in-effect flag is a false positive.
    try {
      if (startInCustomerMode) {
        // The note other tabs listen for (see CustomerModeTabGuard).
        window.localStorage.setItem(CUSTOMER_MODE_MARKER_KEY, '1');
        const snapshot = readCustomerModeSnapshot(window.sessionStorage.getItem(CUSTOMER_MODE_STORAGE_KEY));
        if (snapshot) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setDraft(snapshot.draft);
          setEmailCopy(snapshot.emailCopy);
          setMailingList(snapshot.mailingList);
          setCustomerMode({ phase: snapshot.phase, tried: snapshot.tried });
        }
      } else {
        // Not locked: anything still stored belongs to a hand-over that has ended.
        window.sessionStorage.removeItem(CUSTOMER_MODE_STORAGE_KEY);
        window.localStorage.removeItem(CUSTOMER_MODE_MARKER_KEY);
      }
    } catch {
      // No storage (private mode): the mode still works, a refresh just starts the boxes empty.
    }
    setRestored(true);
  }, [startInCustomerMode]);

  useEffect(() => {
    if (!restored || !customerMode) return;
    try {
      window.sessionStorage.setItem(
        CUSTOMER_MODE_STORAGE_KEY,
        writeCustomerModeSnapshot({ draft, emailCopy, mailingList, phase: customerMode.phase, tried: customerMode.tried }),
      );
    } catch {
      // See above.
    }
  }, [restored, customerMode, draft, emailCopy, mailingList]);

  /** Any answer still on its way is for a photo (or a form) that is no longer the current one: drop it. */
  function dropIdRead() {
    idReadRun.current += 1;
    setReadingId(false);
    setIdReadFailed(null);
  }

  /** Have the AI read the ID and fill the seller boxes that are still empty. Never overwrites a box. */
  async function fillFromPhoto(blob: Blob) {
    const run = ++idReadRun.current;
    setReadingId(true);
    setIdReadFailed(null);
    const read = await readIdPhoto(blob);
    if (run !== idReadRun.current) return;
    setReadingId(false);
    if ('error' in read) {
      setIdReadFailed(read.error);
      return;
    }
    // Against the form as it is NOW: a box typed while the ID was being read stays as typed.
    setDraft((current) => applyIdReadToDraft(current, read.fields));
  }

  /** On a saved draft a picked photo is stored at once, like on a saved receipt's page; before that it waits in the browser. */
  async function storePhoto(id: string, blob: Blob) {
    setPhotoBusy(true);
    setPhotoNote(null);
    const result = await uploadIdPhoto(id, blob);
    setPhotoBusy(false);
    if ('error' in result) setPhotoNote(result.error);
    else setLinked(result.receipt);
  }

  function pickPhoto(blob: Blob) {
    if (fillFromId) void fillFromPhoto(blob);
    else dropIdRead();
    if (linked) void storePhoto(linked.id, blob);
    else setPhoto({ blob, url: URL.createObjectURL(blob) });
  }

  async function removePhoto() {
    if (!linked) {
      dropIdRead();
      setPhoto(null);
      return;
    }
    if (!window.confirm('Remove the ID photo from this draft? This cannot be undone.')) return;
    dropIdRead();
    setPhotoBusy(true);
    setPhotoNote(null);
    const result = await removeIdPhoto(linked.id);
    setPhotoBusy(false);
    if ('error' in result) setPhotoNote(result.error);
    else setLinked(result.receipt);
  }

  /** Ticking the box with a photo already attached reads that photo; unticking it stops a read on its way. */
  function changeFillFromId(checked: boolean) {
    setFillFromId(checked);
    if (checked && photo) void fillFromPhoto(photo.blob);
    else dropIdRead();
  }

  async function pickThumbprint(blob: Blob) {
    if (!linked) {
      setThumbprint({ blob, url: URL.createObjectURL(blob) });
      return;
    }
    setThumbprintBusy(true);
    setThumbprintNote(null);
    const result = await uploadThumbprint(linked.id, blob);
    setThumbprintBusy(false);
    if ('error' in result) setThumbprintNote(result.error);
    else setLinked(result.receipt);
  }

  async function dropThumbprint() {
    if (!linked) {
      setThumbprint(null);
      return;
    }
    if (!window.confirm('Remove the thumbprint from this draft? This cannot be undone.')) return;
    setThumbprintBusy(true);
    setThumbprintNote(null);
    const result = await removeThumbprint(linked.id);
    setThumbprintBusy(false);
    if ('error' in result) setThumbprintNote(result.error);
    else setLinked(result.receipt);
  }

  /** The address bar follows the form: a draft's own address while it is one, the plain New receipt address otherwise. A refresh then opens the same thing. */
  function showAddress(path: string) {
    try {
      window.history.replaceState(null, '', path);
    } catch {
      // The address is a convenience; the draft is in the Log either way.
    }
  }

  /**
   * "Save draft": the seller's name is all it needs. The first save creates the
   * draft (it takes its BUY number now) and sends up the photo and thumbprint
   * held in the browser; from then on the form is linked to it.
   */
  async function saveDraft() {
    if (busy || draftBusy) return;
    const check = normalizeBuyReceiptDraftSave({ ...draft, emailCopy, mailingList });
    if ('error' in check) {
      setError(check.error);
      return;
    }
    setDraftBusy(true);
    setError(null);
    setDraftNote(null);
    const result = await saveDraftReceipt(draft, { id: linked?.id ?? null, duplicatedFrom: duplicatedFrom?.id ?? null, emailCopy, mailingList });
    if ('error' in result) {
      setError(`${result.error} ${linked ? 'The draft is as it was last saved.' : 'Try again.'}`);
      setDraftBusy(false);
      return;
    }

    let receipt = result.receipt;
    const missed: string[] = [];
    if (!linked) {
      if (photo) {
        const uploaded = await uploadIdPhoto(receipt.id, photo.blob);
        if ('error' in uploaded) missed.push('ID photo');
        else receipt = uploaded.receipt;
      }
      if (thumbprint) {
        const uploaded = await uploadThumbprint(receipt.id, thumbprint.blob);
        if ('error' in uploaded) missed.push('thumbprint');
        else receipt = uploaded.receipt;
      }
      // From here the pictures live with the draft, not in this browser.
      setPhoto(null);
      setThumbprint(null);
      showAddress(draftContinuePath(adminBasePath, receipt.id));
    }
    setLinked(receipt);
    setDraftNote(missed.length > 0 ? `The ${missed.join(' and the ')} did not upload — add ${missed.length > 1 ? 'them' : 'it'} again.` : null);
    setDraftBusy(false);
  }

  function startOver() {
    if (linked) showAddress(`${adminBasePath}/buy-receipts`);
    setLinked(null);
    setDraftNote(null);
    setPhotoNote(null);
    setThumbprintNote(null);
    setDraft(blankBuyReceiptDraft());
    setPhoto(null);
    dropIdRead();
    setFillFromId(true);
    setThumbprint(null);
    setThumbprintFailed(null);
    setChosenSet(null);
    setError(null);
    setSaved(null);
    setPhotoFailed(null);
    setEmailCopy(false);
    setEmailState(null);
    setMailingList(false);
    setListState(null);
    setHandBackReason(null);
    setModeError(null);
  }

  /** Lock this browser on the server FIRST; only then is the tablet safe to hand over. */
  async function enterCustomerMode() {
    // Not on a saved draft: a refresh while locked lands on the plain New receipt
    // address, and the form would come back without its draft.
    if (modeBusy || busy || draftBusy || linked) return;
    setModeBusy(true);
    setModeError(null);
    const started = await startCustomerMode();
    setModeBusy(false);
    if ('error' in started) {
      setModeError(`${started.error} The tablet is not locked — do not hand it over yet.`);
      return;
    }
    try {
      // Tells this browser's other tabs to leave their admin pages (see CustomerModeTabGuard).
      window.localStorage.setItem(CUSTOMER_MODE_MARKER_KEY, '1');
    } catch {
      // No storage: the server-side lock still holds for anything those tabs load.
    }
    setError(null);
    setHandBackReason(null);
    setCustomerMode({ phase: 'form', tried: false });
  }

  /** The server accepted the staff code: back to this form, with what the seller typed in it. */
  function leaveCustomerMode(reason: CustomerHandBackReason) {
    try {
      window.sessionStorage.removeItem(CUSTOMER_MODE_STORAGE_KEY);
      window.localStorage.removeItem(CUSTOMER_MODE_MARKER_KEY);
    } catch {
      // See above.
    }
    releaseCustomerModePage();
    setHandBackReason(reason);
    setCustomerMode(null);
  }

  async function submit(action: Action) {
    if (busy || draftBusy) return;
    const check = normalizeBuyReceiptInput(draft);
    if ('error' in check) {
      setError(check.error);
      return;
    }
    const wantsEmail = emailCopy && Boolean(draft.sellerEmail.trim());
    const wantsList = mailingList && Boolean(draft.sellerEmail.trim());
    setBusy(action);
    setError(null);

    // A saved draft is FINISHED by this save (same number); anything else is a new receipt.
    const created = linked
      ? await finishDraftReceipt(linked.id, draft, wantsEmail, wantsList)
      : await createReceipt(draft, duplicatedFrom?.id ?? null, wantsEmail, wantsList);
    if ('error' in created) {
      setError(linked ? created.error : `${created.error} Nothing was saved.`);
      setBusy(null);
      return;
    }
    // No longer a draft: a refresh must not ask for one.
    if (linked) showAddress(`${adminBasePath}/buy-receipts`);

    let receipt = created.receipt;
    if (wantsEmail) {
      setEmailState(
        created.emailed
          ? { status: 'sent', to: receipt.emailed_to ?? draft.sellerEmail.trim() }
          : { status: 'failed', error: created.emailError ?? 'The receipt could not be emailed.' },
      );
    }
    setListState(wantsList ? (created.mailingList ?? 'failed') : null);
    if (photo) {
      const uploaded = await uploadIdPhoto(receipt.id, photo.blob);
      if ('error' in uploaded) setPhotoFailed(uploaded.error);
      else receipt = uploaded.receipt;
    }
    if (thumbprint) {
      const uploaded = await uploadThumbprint(receipt.id, thumbprint.blob);
      if ('error' in uploaded) setThumbprintFailed(uploaded.error);
      else receipt = uploaded.receipt;
    }

    // The photo may have failed to upload: a with-ID choice then falls back to the plain default.
    const savedWithPhoto = Boolean(receipt.seller_id_photo_path);
    const usableSet = printSetAllowed(setKey, savedWithPhoto) ? setKey : defaultPrintSet(savedWithPhoto);
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

  async function retryThumbprint() {
    if (!saved || !thumbprint || retryingThumbprint) return;
    setRetryingThumbprint(true);
    const uploaded = await uploadThumbprint(saved.receipt.id, thumbprint.blob);
    setRetryingThumbprint(false);
    if ('error' in uploaded) {
      setThumbprintFailed(uploaded.error);
      return;
    }
    setThumbprintFailed(null);
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

  // After a hand-over: a line only if the owner has something to finish (see customerHandBack).
  const handBack = handBackReason ? customerHandBack(handBackReason, draft) : null;

  // THE paper. Drawn once by this form, always; and a second time, in its seller's
  // view, by the locked screen while the tablet is handed over. One function, so the
  // two can never drift apart: same draft, same boxes, same ticks, same ID photo.
  const sheet = (customer?: BuyReceiptCustomerView) => (
    <BuyReceiptSheet
      mode="edit"
      draft={draft}
      onChange={setDraft}
      receiptNumber={linked?.receipt_number ?? null}
      dateIso={linked?.created_at ?? nowIso}
      idPhotoSlot={
        <IdPhotoField
          previewUrl={linked ? storedPhotoUrl : (photo?.url ?? null)}
          busy={photoBusy}
          note={
            photoNote
              ? { text: photoNote, ok: false }
              : idReadFailed
                ? { text: idReadFailed, ok: false }
                : linked?.seller_id_photo_path && !storedPhotoUrl
                  ? { text: 'Loading the photo…', ok: true }
                  : null
          }
          onPick={pickPhoto}
          onRemove={() => void removePhoto()}
          autoFill={{ checked: fillFromId, onChange: changeFillFromId, reading: readingId }}
        />
      }
      thumbprintSlot={
        <ThumbprintField
          previewUrl={linked ? storedThumbprintUrl : (thumbprint?.url ?? null)}
          busy={thumbprintBusy}
          note={
            thumbprintNote
              ? { text: thumbprintNote, ok: false }
              : linked?.seller_thumbprint_path && !storedThumbprintUrl
                ? { text: 'Loading the thumbprint…', ok: true }
                : null
          }
          onPick={(print) => void pickThumbprint(print)}
          onRemove={() => void dropThumbprint()}
        />
      }
      emailCopy={emailCopy}
      onEmailCopyChange={setEmailCopy}
      mailingList={mailingList}
      onMailingListChange={setMailingList}
      customer={customer}
    />
  );

  // The tabs are drawn here, not by the page shell, because the one new button
  // sits at the right end of their row and needs this form's state. Small on
  // purpose: the form is the main thing, the hand-over is optional.
  const tabs = (
    <BuyReceiptTabs
      adminBasePath={adminBasePath}
      active="new"
      end={
        // Offered on a receipt that has not been saved yet — not after a save, and not on a saved draft (see enterCustomerMode).
        saved || linked ? null : (
          <button
            type="button"
            className="outline-button"
            style={{ padding: '0.5rem 0.95rem', fontSize: '0.64rem' }}
            title="Hand the tablet to the seller: they see only their own name, phone, address and email"
            disabled={modeBusy || busy !== null || draftBusy}
            aria-busy={modeBusy}
            onClick={() => void enterCustomerMode()}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="4" y="2.5" width="16" height="19" rx="2.5" />
              <path d="M11 18h2" />
            </svg>
            {modeBusy ? 'Locking…' : 'Customer input mode'}
          </button>
        )
      }
    />
  );

  if (saved) {
    const { receipt } = saved;
    return (
      <>
      {tabs}
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
          <div className="flex justify-between gap-3"><span style={hintStyle}>Thumbprint</span><span className="text-right">{receipt.seller_thumbprint_path ? 'Attached' : 'None'}</span></div>
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
          {listState && (
            <div className="flex justify-between gap-3">
              <span style={hintStyle}>Mailing list</span>
              {listState === 'added' ? (
                <span className="text-right" style={{ color: 'var(--color-primary)' }}>Added</span>
              ) : (
                <span className="text-right" style={{ color: 'var(--color-error)' }}>Could not be added — add them under Subscribers</span>
              )}
            </div>
          )}
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

        {thumbprintFailed && (
          <div role="alert" className="grid gap-2 rounded-[1.25rem] border p-4 text-sm" style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)' }}>
            <span>The receipt is saved, but the thumbprint did not upload. {thumbprintFailed}</span>
            <button type="button" className="outline-button text-xs justify-self-start" disabled={retryingThumbprint} onClick={() => void retryThumbprint()}>
              {retryingThumbprint ? 'Uploading…' : 'Try the thumbprint again'}
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
      </>
    );
  }

  const longReceipt = draftPaperLines(draft) > BUY_RECEIPT_ONE_PAGE_LINES;
  /** A save of either kind is on its way: every button waits. */
  const working = busy !== null || draftBusy;

  return (
    <>
    {tabs}
    {modeError && (
      <p role="alert" className="mx-auto mb-3 border px-3 py-2 text-sm" style={{ width: 'min(8.5in, 100%)', borderColor: 'var(--color-error)', color: 'var(--color-error)', background: 'color-mix(in srgb, var(--color-error) 8%, transparent)' }}>
        {modeError}
      </p>
    )}
    {/* The only trace a hand-over leaves above the form, and only when boxes were left unfinished. */}
    {handBack && (
      <p role="status" className="mx-auto mb-3 px-3 py-2 text-sm" style={{ width: 'min(8.5in, 100%)', borderRadius: '0.625rem', background: '#fdf1d6', color: '#6a4a00' }}>
        {handBack}
      </p>
    )}
    {/* A saved draft says so, with its number and when it was last saved. */}
    {linked && (
      <p role="status" className="mx-auto mb-3 px-3 py-2 text-sm" style={{ width: 'min(8.5in, 100%)', borderRadius: '0.625rem', background: '#fbf5dd', color: '#5c4a00' }}>
        <strong>Draft {linked.receipt_number}</strong> · saved {formatReceiptDateTime(linked.updated_at)}. Open it from the Log on any device to finish it.
        {draftNote && <span className="block" style={{ color: 'var(--color-error)' }}>{draftNote}</span>}
      </p>
    )}
    {/* In the server's HTML too, so a refresh in the mode never paints the admin page first. */}
    {customerMode && <style>{CUSTOMER_MODE_PAGE_CSS}</style>}
    {customerMode && restored && (
      <BuyReceiptCustomerMode
        values={draft}
        onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
        emailCopy={emailCopy}
        mailingList={mailingList}
        onAsk={(patch) => {
          if (patch.emailCopy !== undefined) setEmailCopy(patch.emailCopy);
          if (patch.mailingList !== undefined) setMailingList(patch.mailingList);
        }}
        phase={customerMode.phase}
        tried={customerMode.tried}
        onProgress={setCustomerMode}
        onUnlocked={leaveCustomerMode}
        lockPath={`${adminBasePath}/buy-receipts`}
        paper={sheet}
      />
    )}
    <form
      // Enter in a field must never save a half-filled receipt: every action is a button.
      onSubmit={(event) => event.preventDefault()}
    >
      {duplicatedFrom && (
        <p className="mb-3 text-sm" style={hintStyle}>
          Copy of <strong>{duplicatedFrom.number}</strong>. It saves as a new receipt with its own number.
        </p>
      )}

      {sheet()}

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
        {/* What prints, on its own line: beside the buttons it pushed the main button onto a second row.
            "Save draft" shares this line for the same reason (measured 2026-10-09: as a fifth button in
            the row below, the gold button dropped to a second row on an iPad held upright). */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" className="outline-button text-xs" disabled={working} title="Keep it to finish later, on this or another device. Only the seller's name is needed." onClick={() => void saveDraft()}>
            {draftBusy ? 'Saving…' : 'Save draft'}
          </button>
          <span className="flex-1" />
          <PrintSetSelect value={setKey} hasIdPhoto={hasPhoto} onChange={setChosenSet} disabled={working} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* A saved draft is not cleared from here: it stays in the Log, where Delete removes it. */}
          {linked ? (
            <Link href={`${adminBasePath}/buy-receipts/log`} className="outline-button text-xs">Back to the log</Link>
          ) : (
            <button type="button" className="outline-button text-xs" disabled={working} onClick={startOver}>
              Clear
            </button>
          )}
          <span className="flex-1" />
          <button type="button" className="outline-button text-xs" disabled={working} onClick={() => void submit('print')}>
            {busy === 'print' ? 'Saving…' : 'Print here'}
          </button>
          <button type="button" className="outline-button text-xs" disabled={working} onClick={() => void submit('save')}>
            {busy === 'save' ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="gold-button text-xs" disabled={working} onClick={() => void submit('send')}>
            {busy === 'send' ? 'Saving…' : 'Save and send to desktop printer'}
          </button>
        </div>
        <p className="text-xs" style={hintStyle}>
          {linked ? 'This draft keeps its number when it is finished.' : 'The number is assigned when the receipt is saved.'} The buttons and the ID photo and thumbprint strips are not printed; the thumbprint itself prints on the shop copy only.
        </p>
      </div>
    </form>
    </>
  );
}
