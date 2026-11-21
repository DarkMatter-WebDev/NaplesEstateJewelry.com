'use client';

/* eslint-disable @next/next/no-img-element -- short-lived signed links to the private bucket; next/image cannot optimise them */
import { useState } from 'react';
import AdminModal from '@/components/admin/AdminModal';
import SaleStationPrint from '@/components/admin/instant-sale/SaleStationPrint';
import { useIdPhotoUrl } from '@/components/admin/buy-receipts/buy-receipt-client';
import { SHOWROOM_TIME_ZONE } from '@/lib/business-location';
import { paperDateLine } from '@/lib/order-receipt-paper';
import {
  buildPickupPaper,
  ORDER_PICKUP_SQL_FILE,
  PICKUP_COPIES_OPTIONS,
  pickupIdLine,
  type OrderPickupRow,
  type OrderPickupState,
  type PickupCopies,
  type PickupDetailsInput,
  type PickupPaperOrder,
} from '@/lib/order-pickup';
import LogPickupWindow from './LogPickupWindow';
import PickupSignatureScreen from './PickupSignatureScreen';
import { emailPickup, printPickupHere, savePickup, type PickupEmailEntry, type SavePickupResult } from './pickup-client';

/**
 * The Pickup card on a Local Pickup order (owner, 2026-11-21, mockup 1).
 *
 * Before: Log Pickup · Print Blank Pickup Sheet.
 * After:  when, who, ID (type · last 4 · photo), how it was signed, the email;
 *         Print set → Send to Desktop Printer / Print Here; Email Again;
 *         Edit Pickup; Customer Signs Again.
 *
 * Logging marks the order Picked Up on the server; the Fulfillment card's
 * own "picked up" email is not sent (one email, not two).
 */

const GOLD = '#735c00';
const BORDER = 'var(--color-outline-variant)';

export type PickupPanelOrder = PickupPaperOrder & { id: string };

function todayLabel(): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: SHOWROOM_TIME_ZONE }).format(new Date());
}

export default function OrderPickupPanel({
  order,
  initialPickup,
  pickupHours,
  onPickedUp,
  onEmailSent,
}: {
  order: PickupPanelOrder;
  initialPickup: OrderPickupState;
  pickupHours: string;
  /** The server marked the order Picked Up. */
  onPickedUp: () => void;
  /** A pickup email went out: add it to the order's email history. */
  onEmailSent: (entry: PickupEmailEntry) => void;
}) {
  const [pickup, setPickup] = useState<OrderPickupRow | null>(initialPickup.row);
  const [logOpen, setLogOpen] = useState(false);
  const [signing, setSigning] = useState<{ details: PickupDetailsInput; photo: Blob | null } | null>(null);
  const [signBusy, setSignBusy] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [copies, setCopies] = useState<PickupCopies>('both');
  const [printing, setPrinting] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [viewing, setViewing] = useState<'id' | 'signature' | null>(null);
  const idPhotoUrl = useIdPhotoUrl(pickup?.id_photo_path);
  const signatureUrl = useIdPhotoUrl(pickup?.signature_path);
  const hasEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((order.customer_email ?? '').trim());
  const itemCount = order.order_items.reduce((sum, item) => sum + Math.max(1, Math.floor(Number(item.quantity ?? 1)) || 1), 0);

  async function printHere(which: PickupCopies, row: OrderPickupRow | null) {
    setPrinting(true);
    try {
      await printPickupHere(buildPickupPaper(order, row, { copies: which, hoursLine: pickupHours, printedAt: new Date().toISOString() }));
    } catch {
      setMessage({ text: 'Printing did not start. Try Print Here again.', ok: false });
    } finally {
      setPrinting(false);
    }
  }

  function applySaved(result: Extract<SavePickupResult, { pickup: OrderPickupRow }>, first: boolean) {
    setPickup(result.pickup);
    if (result.fulfillmentStatus === 'picked_up') onPickedUp();
    if (result.email) onEmailSent(result.email);
    const emailed = result.email ? ` Emailed to ${result.email.recipient}.` : '';
    setMessage(
      result.emailError
        ? { text: `Pickup ${first ? 'logged' : 'saved'}, but the email did not go: ${result.emailError}`, ok: false }
        : { text: `Pickup ${first ? 'logged — the order is marked Picked Up' : 'saved'}.${emailed}`, ok: true },
    );
  }

  async function finishSigning(signature: Blob, signedName: string) {
    if (!signing) return;
    const first = !pickup;
    setSignBusy(true);
    setSignError(null);
    const result = await savePickup(order.id, { ...signing.details, signMethod: 'digital', signedName }, { photo: signing.photo, signature });
    setSignBusy(false);
    if ('error' in result) {
      setSignError(result.error);
      return;
    }
    setSigning(null);
    applySaved(result, first);
  }

  async function sendEmail() {
    setEmailing(true);
    setMessage(null);
    const result = await emailPickup(order.id);
    setEmailing(false);
    if ('error' in result) {
      setMessage({ text: result.error, ok: false });
      return;
    }
    setPickup(result.pickup);
    onEmailSent(result.email);
    setMessage({ text: `Pickup copy emailed to ${result.email.recipient}.`, ok: true });
  }

  function signAgain() {
    if (!pickup) return;
    setSignError(null);
    setSigning({
      details: {
        buyer: pickup.picked_up_by_buyer,
        name: pickup.picked_up_by,
        idType: pickup.id_type ?? '',
        idLast4: pickup.id_last4 ?? '',
        signMethod: 'digital',
        signedName: pickup.signed_name ?? pickup.picked_up_by,
        email: false,
        removePhoto: false,
      },
      photo: null,
    });
  }

  const label = 'form-label';
  const value = 'text-sm';

  return (
    <section className="border p-5" style={{ borderColor: pickup ? GOLD : BORDER, background: 'white' }}>
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: GOLD, fontFamily: 'var(--font-label)' }}>Pickup</h2>
        {pickup && <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white" style={{ background: '#0f7a4f' }}>Picked up</span>}
      </div>

      {!initialPickup.supported ? (
        <p className="text-sm" style={{ color: 'var(--color-error)' }}>
          The pickup log needs <code>{ORDER_PICKUP_SQL_FILE}</code> run in Supabase first.
        </p>
      ) : !pickup ? (
        <>
          <p className="text-sm"><strong>Local Pickup</strong> · not picked up yet</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
            {order.customer_name || 'No buyer name'} · {itemCount} item{itemCount === 1 ? '' : 's'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="gold-button text-sm" onClick={() => { setMessage(null); setLogOpen(true); }}>Log Pickup</button>
            <button type="button" className="outline-button text-sm" disabled={printing} onClick={() => void printHere('store', null)}>
              {printing ? 'Preparing…' : 'Print Blank Pickup Sheet'}
            </button>
          </div>
          <p className="mt-2 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
            The blank sheet has empty ID and signature boxes, for a paper-only pickup.
          </p>
        </>
      ) : (
        <>
          <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-[130px_1fr]">
            <dt className={label}>Picked up</dt>
            <dd className={value}>{paperDateLine(pickup.picked_up_at)}</dd>
            <dt className={label}>By</dt>
            <dd className={value}>{pickup.picked_up_by}{pickup.picked_up_by_buyer ? <span style={{ color: 'var(--color-on-surface-variant)' }}> (the buyer)</span> : <span style={{ color: 'var(--color-on-surface-variant)' }}> (not the buyer)</span>}</dd>
            <dt className={label}>ID</dt>
            <dd className={`${value} flex flex-wrap items-center gap-2`}>
              {pickup.id_photo_path && (
                <button type="button" onClick={() => setViewing('id')} aria-label="View the ID photo" className="shrink-0">
                  {idPhotoUrl
                    ? <img src={idPhotoUrl} alt="ID photo" style={{ width: 64, height: 40, objectFit: 'cover', border: '1px solid #d5c697' }} />
                    : <span className="inline-block" style={{ width: 64, height: 40, border: '1px solid #d5c697', background: '#f3f3f3' }} />}
                </button>
              )}
              <span>{pickupIdLine(pickup) || 'Not recorded'}{!pickup.id_photo_path && ' · no photo'}</span>
            </dd>
            <dt className={label}>Signed</dt>
            <dd className={`${value} flex flex-wrap items-center gap-2`}>
              {pickup.sign_method === 'digital' && pickup.signature_path ? (
                <>
                  <button type="button" onClick={() => setViewing('signature')} aria-label="View the signature" className="shrink-0">
                    {signatureUrl
                      ? <img src={signatureUrl} alt="Signature" style={{ width: 120, height: 40, objectFit: 'contain', borderBottom: '1px solid #999' }} />
                      : <span className="inline-block" style={{ width: 120, height: 40, borderBottom: '1px solid #999' }} />}
                  </button>
                  <span className="font-semibold" style={{ color: '#0f7a4f' }}>✓ with a finger{pickup.signed_at ? ` · ${paperDateLine(pickup.signed_at)}` : ''}</span>
                </>
              ) : (
                <span>On paper — the signed store copy is kept on file</span>
              )}
            </dd>
            <dt className={label}>Email</dt>
            <dd className={value}>
              {pickup.emailed_at
                ? <span><span style={{ color: '#0f7a4f' }}>✓</span> Emailed to {pickup.emailed_to} · {paperDateLine(pickup.emailed_at)}</span>
                : hasEmail ? 'Not emailed' : 'No email address on this order'}
            </dd>
          </dl>

          <div className="mt-4 grid gap-3 border-t pt-4" style={{ borderColor: BORDER }}>
            <label className="grid max-w-xs gap-1">
              <span className="form-label">Print set</span>
              <select className="form-field" value={copies} onChange={(event) => setCopies(event.target.value as PickupCopies)}>
                {PICKUP_COPIES_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <div className="flex flex-wrap items-start gap-2">
              <SaleStationPrint
                key={copies}
                orderId={order.id}
                endpoint={`/api/admin/orders/${order.id}/pickup/print-request`}
                body={{ copies }}
                label="Send to Desktop Printer"
                buttonClassName="gold-button text-sm"
              />
              <button type="button" className="outline-button text-sm" disabled={printing} onClick={() => void printHere(copies, pickup)}>
                {printing ? 'Preparing…' : 'Print Here'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {hasEmail && (
                <button type="button" className="outline-button text-sm" disabled={emailing} onClick={() => void sendEmail()}>
                  {emailing ? 'Sending…' : pickup.emailed_at ? 'Email Again' : 'Email Now'}
                </button>
              )}
              <button type="button" className="outline-button text-sm" onClick={() => { setMessage(null); setLogOpen(true); }}>Edit Pickup</button>
              <button type="button" className="outline-button text-sm" onClick={signAgain}>{pickup.signature_path ? 'Customer Signs Again' : 'Customer Signs Here'}</button>
            </div>
          </div>
        </>
      )}

      {message && (
        <p role={message.ok ? 'status' : 'alert'} className="mt-3 text-sm font-semibold" style={{ color: message.ok ? '#0f7a4f' : 'var(--color-error)' }}>{message.text}</p>
      )}

      {logOpen && (
        <LogPickupWindow
          order={order}
          existing={pickup}
          onClose={() => setLogOpen(false)}
          onSaved={(result, print) => {
            const first = !pickup;
            setLogOpen(false);
            applySaved(result, first);
            if (print) void printHere(print, result.pickup);
          }}
          onSignHere={(draft) => {
            setLogOpen(false);
            setSignError(null);
            setSigning(draft);
          }}
        />
      )}

      {signing && (
        <PickupSignatureScreen
          orderNumber={order.order_number}
          dateLabel={todayLabel()}
          pickedUpBy={signing.details.name}
          items={order.order_items}
          initialName={signing.details.signedName || signing.details.name}
          busy={signBusy}
          error={signError}
          onCancel={() => setSigning(null)}
          onDone={(signature, signedName) => void finishSigning(signature, signedName)}
        />
      )}

      {viewing && (
        <AdminModal title={viewing === 'id' ? 'ID photo' : 'Signature'} onClose={() => setViewing(null)} maxWidth="max-w-3xl">
          <img src={(viewing === 'id' ? idPhotoUrl : signatureUrl) ?? ''} alt={viewing === 'id' ? 'ID photo' : 'Signature'} className="mx-auto max-h-[75vh] w-auto max-w-full bg-white p-4" />
        </AdminModal>
      )}
    </section>
  );
}
