'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  BUY_RECEIPT_COLUMNS,
  BUY_RECEIPT_DEFAULT_PRINT_SET,
  BUY_RECEIPT_PRINT_SETS,
  BUY_RECEIPT_PRINT_SET_KEYS,
  isPrintPending,
  type BuyReceiptPrintSetKey,
  type BuyReceiptRow,
} from '@/lib/buy-receipts';
import { useReceiptPrinter } from './BuyReceiptPrintHost';
import { markPrinted, printableIdPhoto, requestPrint, type PrintableIdPhoto } from './buy-receipt-client';

/**
 * Printing a SAVED receipt: which copies, "Send to desktop printer" and
 * "Print here" — used by the after-save panel and the receipt's own page.
 *
 * After a send, this watches that one row (straight from Supabase, every 2 s,
 * for up to a minute) so the laptop can say "Printed on the desktop" — or,
 * after 30 s with no station picking it up, that the Print Station window is
 * probably closed. The owner is standing at the counter with the seller; "did
 * it print?" must not need a walk to the back room.
 */

const WATCH_EVERY_MS = 2_000;
const WATCH_STALLED_MS = 30_000;
const WATCH_GIVE_UP_MS = 60_000;

type Phase = 'waiting' | 'printed' | 'stalled' | null;

/** Whether a print set can be used for this receipt: a with-ID copy needs a photo. */
export function printSetAllowed(key: BuyReceiptPrintSetKey, hasIdPhoto: boolean): boolean {
  return hasIdPhoto || BUY_RECEIPT_PRINT_SETS[key].withId === 0;
}

export function PrintSetSelect({
  value,
  hasIdPhoto,
  onChange,
  disabled,
}: {
  value: BuyReceiptPrintSetKey;
  hasIdPhoto: boolean;
  onChange: (key: BuyReceiptPrintSetKey) => void;
  disabled?: boolean;
}) {
  return (
    <select
      className="form-field"
      style={{ width: 'auto', maxWidth: '100%', padding: '0.45rem 0.6rem', fontSize: '0.8125rem' }}
      value={value}
      disabled={disabled}
      aria-label="What to print"
      onChange={(event) => onChange(event.target.value as BuyReceiptPrintSetKey)}
    >
      {BUY_RECEIPT_PRINT_SET_KEYS.map((key) => (
        <option key={key} value={key} disabled={!printSetAllowed(key, hasIdPhoto)}>
          Print: {BUY_RECEIPT_PRINT_SETS[key].label}
          {!printSetAllowed(key, hasIdPhoto) ? ' (needs an ID photo)' : ''}
        </option>
      ))}
    </select>
  );
}

export default function ReceiptPrintControls({
  receipt,
  onChanged,
  initialSet = BUY_RECEIPT_DEFAULT_PRINT_SET,
  autoAction = null,
}: {
  receipt: BuyReceiptRow;
  onChanged: (receipt: BuyReceiptRow) => void;
  initialSet?: BuyReceiptPrintSetKey;
  /** Do this once as soon as the panel appears (the form's "Save and send" / "Print here"). */
  autoAction?: 'send' | 'print' | null;
}) {
  const hasIdPhoto = Boolean(receipt.seller_id_photo_path);
  const [chosen, setChosen] = useState<BuyReceiptPrintSetKey>(initialSet);
  // A with-ID set chosen before the photo was removed falls back to the default.
  const setKey = printSetAllowed(chosen, hasIdPhoto) ? chosen : BUY_RECEIPT_DEFAULT_PRINT_SET;
  const copies = BUY_RECEIPT_PRINT_SETS[setKey];

  const [busy, setBusy] = useState<'send' | 'print' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>(null);
  const [watch, setWatch] = useState<{ startedAt: number; baseCount: number } | null>(null);
  const printer = useReceiptPrinter();
  const printReceipt = printer.print;

  const onChangedRef = useRef(onChanged);
  useEffect(() => {
    onChangedRef.current = onChanged;
  }, [onChanged]);

  const send = useCallback(async () => {
    setBusy('send');
    setError(null);
    const result = await requestPrint(receipt.id, { plain: copies.plain, withId: copies.withId, seller: copies.seller });
    setBusy(null);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    onChangedRef.current(result.receipt);
    setPhase('waiting');
    setWatch({ startedAt: Date.now(), baseCount: receipt.print_count });
  }, [receipt.id, receipt.print_count, copies.plain, copies.withId, copies.seller]);

  const printHere = useCallback(async () => {
    setBusy('print');
    setError(null);
    let idPhoto: PrintableIdPhoto | null = null;
    try {
      idPhoto = copies.withId > 0 ? await printableIdPhoto(receipt.seller_id_photo_path) : null;
      if (copies.withId > 0 && !idPhoto) {
        setError('The ID photo could not be loaded, so nothing was printed.');
        return;
      }
      const pages = await printReceipt(receipt, { plain: copies.plain, withId: copies.withId, seller: copies.seller }, idPhoto?.url ?? null);
      if (pages > 0) {
        const result = await markPrinted(receipt.id, pages);
        if ('error' in result) setError(result.error);
        else onChangedRef.current(result.receipt);
      }
    } finally {
      idPhoto?.release();
      setBusy(null);
    }
  }, [receipt, copies.plain, copies.withId, copies.seller, printReceipt]);

  // The form's "Save and send" / "Print here": run once when the panel appears.
  const autoRan = useRef(false);
  useEffect(() => {
    if (!autoAction || autoRan.current) return;
    // Marked inside the timer, not here: in development React mounts effects
    // twice, and the first pass's cleanup cancels its timer.
    const timer = window.setTimeout(() => {
      autoRan.current = true;
      if (autoAction === 'send') void send();
      else void printHere();
    }, 0);
    return () => window.clearTimeout(timer);
    // Run once for the receipt this panel was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Watch the row after a send until the station reports it printed.
  useEffect(() => {
    if (!watch) return;
    let cancelled = false;
    let timer = 0;
    const supabase = createClient();

    const tick = async () => {
      if (cancelled) return;
      const elapsed = Date.now() - watch.startedAt;
      await supabase.auth.getSession();
      const { data } = await supabase.from('buy_receipts').select(BUY_RECEIPT_COLUMNS).eq('id', receipt.id).maybeSingle();
      if (cancelled) return;
      const row = data as unknown as BuyReceiptRow | null;
      if (row) {
        if (!isPrintPending(row) && row.print_count > watch.baseCount) {
          onChangedRef.current(row);
          setPhase('printed');
          setWatch(null);
          return;
        }
        if (elapsed > WATCH_STALLED_MS && !row.print_claimed_at) setPhase('stalled');
      }
      if (elapsed > WATCH_GIVE_UP_MS) {
        setPhase('stalled');
        setWatch(null);
        return;
      }
      timer = window.setTimeout(tick, WATCH_EVERY_MS);
    };

    timer = window.setTimeout(tick, WATCH_EVERY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [watch, receipt.id]);

  const working = busy !== null || printer.printing;

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <PrintSetSelect value={setKey} hasIdPhoto={hasIdPhoto} onChange={setChosen} disabled={working} />
        <button type="button" className="outline-button text-xs" disabled={working} onClick={() => void printHere()}>
          {busy === 'print' ? 'Printing…' : 'Print here'}
        </button>
        <button type="button" className="gold-button text-xs" disabled={working} onClick={() => void send()}>
          {busy === 'send' ? 'Sending…' : 'Send to desktop printer'}
        </button>
      </div>
      {phase === 'waiting' && (
        <p role="status" className="text-right text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
          Sent. Waiting for the desktop…
        </p>
      )}
      {phase === 'printed' && (
        <p role="status" className="text-right text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>
          Printed on the desktop.
        </p>
      )}
      {phase === 'stalled' && (
        <p role="alert" className="text-right text-sm" style={{ color: 'var(--color-error)' }}>
          The desktop has not picked this up. Is the Print Station window open on the printer PC?
        </p>
      )}
      {error && (
        <p role="alert" className="text-right text-sm" style={{ color: 'var(--color-error)' }}>
          {error}
        </p>
      )}
      {printer.host}
    </div>
  );
}
