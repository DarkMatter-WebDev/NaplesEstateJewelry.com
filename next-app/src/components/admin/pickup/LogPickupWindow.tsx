'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import IdPhotoField from '@/components/admin/buy-receipts/IdPhotoField';
import { readIdPhoto, useIdPhotoUrl } from '@/components/admin/buy-receipts/buy-receipt-client';
import {
  cleanIdLast4,
  cleanPickupEmail,
  idNameMatchesBuyer,
  PICKUP_COPIES_OPTIONS,
  PICKUP_ID_TYPES,
  type OrderPickupRow,
  type PickupCopies,
  type PickupDetailsInput,
  type PickupSignMethod,
} from '@/lib/order-pickup';
import { savePickup, type SavePickupResult } from './pickup-client';

/**
 * Log Pickup / Edit Pickup (owner, 2026-11-21, mockup 1): who is picking up,
 * the ID photo (webcam or file — the buy receipt's own strip and camera
 * window), ID type + last 4, how they will sign, and "Email the customer their
 * pickup copy".
 *
 * Email the pickup copy (owner, 2026-11-22, mockup 1): two boxes — "To the
 * email on the order" (ticked, as before) and "To a different email" (opens a
 * box to type the address the customer asks for). One, the other, or both; a
 * line under them says where it will go. The typed address is used for this
 * email only — never saved onto the order.
 *
 * "Fill from ID" (owner: "fill the id info with AI like we do on the buy
 * receipt"): ticked, a new photo is read by the AI through the buy receipt's
 * own route and the EMPTY boxes fill — ID type, last 4, and the name when
 * "Someone else" has none yet. Never a box that already has something in it.
 * When the name on the ID does not look like the buyer's, a line says so and
 * offers "Someone else" — it never switches by itself.
 *
 * Its own overlay (not AdminModal): Escape inside the webcam window must not
 * also close this one and lose what was typed.
 */

export type LogPickupOrder = {
  id: string;
  order_number: string;
  customer_name: string | null;
  customer_email: string | null;
};

export default function LogPickupWindow({
  order,
  existing,
  onClose,
  onSaved,
  onSignHere,
}: {
  order: LogPickupOrder;
  existing: OrderPickupRow | null;
  onClose: () => void;
  /** After a paper save: the result, and which copies to print now (null = no print). */
  onSaved: (result: Extract<SavePickupResult, { pickup: OrderPickupRow }>, print: PickupCopies | null) => void;
  /** Digital: the details + new photo wait while the customer signs. */
  onSignHere: (draft: { details: PickupDetailsInput; photo: Blob | null }) => void;
}) {
  const buyerName = (order.customer_name ?? '').trim();
  const hasEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((order.customer_email ?? '').trim());
  const [buyer, setBuyer] = useState(existing ? existing.picked_up_by_buyer : Boolean(buyerName));
  const [otherName, setOtherName] = useState(existing && !existing.picked_up_by_buyer ? existing.picked_up_by : '');
  const [idType, setIdType] = useState<string>(existing?.id_type ?? '');
  const [idLast4, setIdLast4] = useState(existing?.id_last4 ?? '');
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const storedPhotoUrl = useIdPhotoUrl(existing && !removePhoto ? existing.id_photo_path : null);
  const [fillFromId, setFillFromId] = useState(true);
  const [reading, setReading] = useState(false);
  const [idNote, setIdNote] = useState<{ text: string; ok: boolean } | null>(null);
  const [idName, setIdName] = useState<string | null>(null);
  const [signMethod, setSignMethod] = useState<PickupSignMethod>(existing?.sign_method ?? 'digital');
  const [email, setEmail] = useState(hasEmail);
  const [otherOn, setOtherOn] = useState(false);
  const [otherEmail, setOtherEmail] = useState('');
  const [otherError, setOtherError] = useState<string | null>(null);
  const [copies, setCopies] = useState<PickupCopies>('both');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readRun = useRef(0);

  // The object URL of a new photo is freed when it is replaced or the window closes.
  useEffect(() => () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  const previewUrl = photoUrl ?? storedPhotoUrl;
  const name = buyer ? buyerName : otherName.trim();
  const nameMismatch = Boolean(idName && buyer && !idNameMatchesBuyer(idName, buyerName));

  async function pickPhoto(blob: Blob) {
    setPhoto(blob);
    setPhotoUrl(URL.createObjectURL(blob));
    setRemovePhoto(false);
    setIdNote(null);
    setIdName(null);
    if (!fillFromId) return;
    const run = ++readRun.current;
    setReading(true);
    const read = await readIdPhoto(blob);
    if (run !== readRun.current) return;
    setReading(false);
    if ('error' in read) {
      setIdNote({ text: read.error, ok: false });
      return;
    }
    const fields = read.fields;
    // Only boxes that are still empty — the same rule as the buy receipt.
    setIdType((current) => current || fields.idType || '');
    setIdLast4((current) => current || fields.idLast4 || '');
    if (fields.name) {
      setIdName(fields.name);
      setOtherName((current) => current || (!buyer ? fields.name ?? '' : current));
    }
    setIdNote({ text: fields.name ? `Read from the ID: ${fields.name}. Check the boxes against the card.` : 'Read from the ID. Check the boxes against the card.', ok: true });
  }

  function dropPhoto() {
    readRun.current += 1;
    setReading(false);
    setPhoto(null);
    setPhotoUrl(null);
    setIdName(null);
    setIdNote(null);
    if (existing?.id_photo_path) setRemovePhoto(true);
  }

  function details(): PickupDetailsInput | null {
    if (!name) {
      setError(buyer ? 'The order has no buyer name. Choose "Someone else" and type the name.' : 'Type the name of the person picking up.');
      return null;
    }
    if (cleanIdLast4(idLast4) === 'invalid') {
      setError('ID last 4 must be four letters or digits.');
      return null;
    }
    const sendOther = !existing && otherOn;
    const other = sendOther ? cleanPickupEmail(otherEmail) : null;
    if (sendOther && !other) {
      const text = otherEmail.trim()
        ? 'That email address does not look right.'
        : 'Type the other email address, or untick "To a different email".';
      // Shown under the address box only (not twice).
      setOtherError(text);
      return null;
    }
    return {
      buyer,
      name,
      idType,
      idLast4,
      signMethod,
      signedName: existing?.signed_name ?? name,
      email: !existing && hasEmail && email,
      emailOther: other ?? '',
      removePhoto: removePhoto && !photo,
    };
  }

  async function save(print: PickupCopies | null) {
    setError(null);
    const input = details();
    if (!input) return;
    setBusy(true);
    const result = await savePickup(order.id, input, { photo });
    setBusy(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    onSaved(result, print);
  }

  function signHere() {
    setError(null);
    const input = details();
    if (!input) return;
    onSignHere({ details: { ...input, signMethod: 'digital' }, photo });
  }

  // Digital with no signature yet → the customer signs first; anything else saves.
  const needsSignature = signMethod === 'digital' && !existing?.signature_path;
  // Where the pickup copy will go — the line under the two email boxes.
  const orderEmail = (order.customer_email ?? '').trim();
  const toOrder = hasEmail && email;
  const typed = otherEmail.trim();
  const sameAsOrder = Boolean(typed) && typed.toLowerCase() === orderEmail.toLowerCase();
  const sendsTo: ReactNode = toOrder && otherOn && !sameAsOrder
    ? <>Sends to <strong>both</strong>: {orderEmail} and <strong>{typed || 'the address you type'}</strong>.</>
    : toOrder
      ? <>Sends to <strong>{orderEmail}</strong></>
      : otherOn
        ? <>Sends to <strong>{typed || 'the address you type'}</strong>{hasEmail ? <> only — not to {orderEmail}.</> : '.'}</>
        : 'No email will be sent.';
  const choice = (selected: boolean) => ({
    borderColor: selected ? 'var(--color-primary)' : 'var(--color-outline-variant)',
    background: selected ? '#fbf6e6' : '#fff',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-3 py-6 md:py-10" style={{ background: 'rgba(0,0,0,0.52)' }} role="dialog" aria-modal="true" aria-label="Log Pickup">
      <div className="w-full max-w-xl border bg-white" style={{ borderColor: 'var(--color-outline-variant)' }}>
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--color-outline-variant)' }}>
          <h3 className="text-[0.7rem] font-bold uppercase tracking-[0.2em]" style={{ fontFamily: 'var(--font-label)' }}>
            {existing ? 'Edit Pickup' : 'Log Pickup'} · Order {order.order_number}
          </h3>
          <button type="button" onClick={onClose} aria-label="Close" className="lift-icon px-2 text-xl leading-none" style={{ color: 'var(--color-outline)' }} disabled={busy}>×</button>
        </div>

        <div className="grid gap-4 px-4 py-4 md:px-5">
          <fieldset className="grid gap-2">
            <legend className="form-label">Who is picking up?</legend>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm" style={choice(buyer)}>
              <input type="radio" name="pickup-who" className="mt-1" checked={buyer} disabled={!buyerName} onChange={() => setBuyer(true)} style={{ accentColor: '#735c00' }} />
              <span><strong>{buyerName || 'The buyer'}</strong> — the buyer{!buyerName && <span className="block text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>The order has no buyer name.</span>}</span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm" style={choice(!buyer)}>
              <input type="radio" name="pickup-who" className="mt-1" checked={!buyer} onChange={() => setBuyer(false)} style={{ accentColor: '#735c00' }} />
              <span className="grid flex-1 gap-2">
                <span><strong>Someone else</strong><span className="block text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>A gift recipient, a spouse. The ID photo is theirs.</span></span>
                {!buyer && (
                  <input className="form-field" value={otherName} maxLength={120} placeholder="Their full name" onChange={(event) => setOtherName(event.target.value)} autoComplete="off" />
                )}
              </span>
            </label>
          </fieldset>

          <div>
            <span className="form-label">ID photo</span>
            <IdPhotoField
              previewUrl={previewUrl}
              busy={busy}
              note={idNote}
              onPick={(blob) => void pickPhoto(blob)}
              onRemove={dropPhoto}
              autoFill={{ checked: fillFromId, onChange: setFillFromId, reading }}
              words={{ name: 'ID photo', hint: 'Private — never emailed, never on the customer copy.', fill: 'Fill from ID' }}
            />
            {nameMismatch && idName && (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded px-3 py-2 text-sm" style={{ background: '#fdf1e7', color: '#8a3b12' }}>
                <span>Name on the ID: <strong>{idName}</strong> — not the buyer.</span>
                <button
                  type="button"
                  className="outline-button text-xs"
                  onClick={() => {
                    setBuyer(false);
                    setOtherName(idName);
                  }}
                >
                  Someone else is picking up
                </button>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="form-label">ID type</span>
              <select className="form-field" value={idType} onChange={(event) => setIdType(event.target.value)}>
                <option value="">—</option>
                {PICKUP_ID_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="form-label">ID last 4</span>
              <input
                className="form-field"
                value={idLast4}
                maxLength={4}
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                onChange={(event) => setIdLast4(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
              />
            </label>
          </div>

          <fieldset className="grid gap-2">
            <legend className="form-label">How will they sign?</legend>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm" style={choice(signMethod === 'digital')}>
              <input type="radio" name="pickup-sign" className="mt-1" checked={signMethod === 'digital'} onChange={() => setSignMethod('digital')} style={{ accentColor: '#735c00' }} />
              <span><strong>With a finger, on this iPad or iPhone</strong><span className="block text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>{existing?.signature_path ? 'Already signed — "Customer Signs Again" on the card replaces it.' : 'Opens the signing screen. Hand them the device; Done saves it.'}</span></span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm" style={choice(signMethod === 'paper')}>
              <input type="radio" name="pickup-sign" className="mt-1" checked={signMethod === 'paper'} onChange={() => setSignMethod('paper')} style={{ accentColor: '#735c00' }} />
              <span><strong>On paper, after printing</strong><span className="block text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Saves the pickup, then prints. They sign the store copy by hand.{existing?.signature_path ? ' The finger signature is removed.' : ''}</span></span>
            </label>
          </fieldset>

          {signMethod === 'paper' && (
            <label className="grid gap-1">
              <span className="form-label">Print set</span>
              <select className="form-field" value={copies} onChange={(event) => setCopies(event.target.value as PickupCopies)}>
                {PICKUP_COPIES_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          )}

          {!existing && (
            <div className="grid gap-2.5">
              <span className="form-label" style={{ marginBottom: 0 }}>Email the pickup copy</span>
              <label className={`flex items-start gap-3 text-sm ${hasEmail ? 'cursor-pointer' : 'opacity-50'}`}>
                <input type="checkbox" className="mt-0.5" checked={hasEmail && email} disabled={!hasEmail} onChange={(event) => setEmail(event.target.checked)} style={{ width: 18, height: 18, flex: 'none', accentColor: '#735c00' }} />
                <span>
                  <strong>To the email on the order</strong>
                  <span className="block text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                    {hasEmail ? `${order.customer_email} — the buyer, even when someone else picks up.` : 'This order has no email address.'}
                  </span>
                </span>
              </label>
              <div>
                <label className="flex cursor-pointer items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={otherOn}
                    onChange={(event) => {
                      setOtherOn(event.target.checked);
                      setOtherError(null);
                    }}
                    style={{ width: 18, height: 18, flex: 'none', accentColor: '#735c00' }}
                  />
                  <span>
                    <strong>To a different email</strong>
                    <span className="block text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                      When they ask — the person picking up, or another address. Used for this email only; the order keeps its email.
                    </span>
                  </span>
                </label>
                {otherOn && (
                  <div className="mt-2" style={{ marginLeft: 30 }}>
                    <input
                      className="form-field"
                      type="email"
                      inputMode="email"
                      autoCapitalize="none"
                      autoComplete="off"
                      spellCheck={false}
                      autoFocus
                      maxLength={254}
                      placeholder="name@example.com"
                      aria-label="Different email address"
                      aria-invalid={Boolean(otherError)}
                      value={otherEmail}
                      onChange={(event) => {
                        setOtherEmail(event.target.value);
                        setOtherError(null);
                      }}
                      style={otherError ? { borderColor: 'var(--color-error)' } : undefined}
                    />
                    {otherError && <p className="mt-1.5 text-xs font-semibold" style={{ color: 'var(--color-error)' }}>{otherError}</p>}
                  </div>
                )}
              </div>
              <p className="rounded-md px-2.5 py-2 text-[0.8rem]" style={{ background: '#f6f2e4', color: 'var(--color-on-surface-variant)' }}>{sendsTo}</p>
            </div>
          )}

          {error && <p role="alert" className="text-sm font-semibold" style={{ color: 'var(--color-error)' }}>{error}</p>}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t px-4 py-3" style={{ borderColor: 'var(--color-outline-variant)', background: '#fcfbf7' }}>
          <button type="button" className="outline-button text-sm" onClick={onClose} disabled={busy}>Cancel</button>
          {needsSignature ? (
            <button type="button" className="gold-button text-sm" onClick={signHere} disabled={busy || reading}>Customer Signs Here →</button>
          ) : existing ? (
            <button type="button" className="gold-button text-sm" onClick={() => void save(null)} disabled={busy || reading}>{busy ? 'Saving…' : 'Save Changes'}</button>
          ) : (
            <button type="button" className="gold-button text-sm" onClick={() => void save(copies)} disabled={busy || reading}>{busy ? 'Saving…' : 'Save & Print'}</button>
          )}
        </div>
      </div>
    </div>
  );
}
