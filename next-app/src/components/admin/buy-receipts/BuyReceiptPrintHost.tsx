'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { BUY_RECEIPT_PRINT_WATCHDOG_MS, type BuyReceiptCopies, type BuyReceiptRow } from '@/lib/buy-receipts';
import { waitForImages, waitForPrintLayout } from '@/lib/print-images';
import BuyReceiptSheet from './BuyReceiptSheet';
import { BUY_RECEIPT_PRINT_HOST_CSS } from './buy-receipt-sheet-css';

/**
 * Printing a buy receipt IN PLACE — no pop-up window (pop-up blockers stop a
 * window opened after a save finishes, and the Print Station has no one to
 * click "allow").
 *
 * The host is portalled straight into <body>. Its print stylesheet hides every
 * other child of <body>, so only the receipt reaches the paper; on screen the
 * host is invisible. It is mounted only while a print is running, so an
 * ordinary Ctrl+P on an admin page is untouched the rest of the time.
 */
export function BuyReceiptPrintHost({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="buy-receipt-print-host">
      <style>{BUY_RECEIPT_PRINT_HOST_CSS}</style>
      {children}
    </div>,
    document.body,
  );
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * One `window.print()`, resolved when the browser says it is done.
 *
 * In a normal Chrome window `print()` blocks until the dialog closes and then
 * fires `afterprint`. With --kiosk-printing (the Print Station) it returns at
 * once and `afterprint` fires when the job reaches the spooler. The watchdog
 * covers a driver that never fires the event, so the station cannot get stuck
 * on "Printing…".
 */
function printOnce(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener('afterprint', finish);
      window.clearTimeout(watchdog);
      resolve();
    };
    const watchdog = window.setTimeout(finish, BUY_RECEIPT_PRINT_WATCHDOG_MS);
    window.addEventListener('afterprint', finish);
    try {
      window.print();
    } catch {
      finish();
    }
  });
}

/** One sheet per entry: false = a plain copy, true = a copy carrying the seller's ID photo. */
type PrintView = { receipt: BuyReceiptRow; idPhotoUrl: string | null; sheets: boolean[] };

/**
 * `print(receipt, copies, idPhotoUrl)` sends ONE print job with one page per
 * copy — the plain copies first, then the copies that carry the seller's ID
 * photo — and resolves with how many pages were sent. (One job per copy, the
 * first version, meant the printer paused between copies; owner, 2026-09-30.)
 * Render `host` somewhere in the component — it is the printout.
 *
 * No requestAnimationFrame anywhere: a covered or minimised window stops
 * painting, and the Print Station is usually behind other windows.
 */
export function useReceiptPrinter() {
  const [view, setView] = useState<PrintView | null>(null);
  const busyRef = useRef(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const print = useCallback(
    async (receipt: BuyReceiptRow, copies: BuyReceiptCopies, idPhotoUrl: string | null): Promise<number> => {
      if (busyRef.current) return 0;
      busyRef.current = true;
      let printed = 0;
      try {
        const sheets = [
          ...Array.from({ length: Math.max(0, copies.plain) }, () => false),
          ...Array.from({ length: idPhotoUrl ? Math.max(0, copies.withId) : 0 }, () => true),
        ];
        if (sheets.length > 0 && aliveRef.current) {
          // Commit every page to the DOM before looking for their images.
          flushSync(() => setView({ receipt, idPhotoUrl, sheets }));
          const host = document.querySelector('.buy-receipt-print-host');
          await waitForImages(host ? Array.from(host.querySelectorAll('img')) : []);
          await waitForPrintLayout(window);
          await printOnce();
          printed = sheets.length;
          // Let the spooler take the job before the pages are torn down.
          await pause(400);
        }
      } finally {
        busyRef.current = false;
        if (aliveRef.current) setView(null);
      }
      return printed;
    },
    [],
  );

  const host = view ? (
    <BuyReceiptPrintHost>
      {view.sheets.map((showIdPhoto, index) => (
        <BuyReceiptSheet key={index} mode="print" receipt={view.receipt} idPhotoUrl={view.idPhotoUrl} showIdPhoto={showIdPhoto} />
      ))}
    </BuyReceiptPrintHost>
  ) : null;

  return { print, host, printing: view !== null };
}
