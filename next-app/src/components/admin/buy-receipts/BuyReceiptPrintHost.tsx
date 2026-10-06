'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { BUY_RECEIPT_PRINT_WATCHDOG_MS, type BuyReceiptCopies, type BuyReceiptRow } from '@/lib/buy-receipts';
import { waitForImages, waitForPrintLayout } from '@/lib/print-images';
import { signatureFont } from '@/lib/signature-font';
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

/**
 * The cursive signature face must be IN the browser before `print()` runs.
 * The seller's copy lives in a hidden holder, and a hidden element does not
 * make the browser fetch a font — so the first print of the evening went out in
 * the fallback face (owner, 2026-09-30: "my printed signature came out as
 * regular font"). Asking the font set to load it fetches the file regardless of
 * visibility; four seconds is the most a print will wait for it.
 */
export async function ensureSignatureFont(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const spec = `32px ${signatureFont.style.fontFamily}`;
  await Promise.race([
    document.fonts.load(spec).then(() => document.fonts.ready).then(() => undefined),
    new Promise<void>((resolve) => window.setTimeout(resolve, 4_000)),
  ]).catch(() => undefined);
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
/** How long `print()` kept the page waiting. A dialog blocks until it is dismissed; kiosk printing returns at once. */
const DIALOG_SUSPECTED_MS = 1_500;

function printOnce(): Promise<{ blockedMs: number }> {
  return new Promise((resolve) => {
    let settled = false;
    let blockedMs = 0;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener('afterprint', finish);
      window.clearTimeout(watchdog);
      resolve({ blockedMs });
    };
    const watchdog = window.setTimeout(finish, BUY_RECEIPT_PRINT_WATCHDOG_MS);
    window.addEventListener('afterprint', finish);
    try {
      const started = performance.now();
      window.print();
      blockedMs = performance.now() - started;
    } catch {
      finish();
    }
  });
}

/** One sheet per entry, in print order. */
type PrintSheet = { variant: 'shop' | 'seller'; showIdPhoto: boolean };
type PrintView = { receipt: BuyReceiptRow; idPhotoUrl: string | null; thumbprintUrl: string | null; sheets: PrintSheet[] };

/**
 * `print(receipt, copies, idPhotoUrl, thumbprintUrl)` sends ONE print job with one page per
 * copy — shop copies first (plain, then with the ID photo), then the seller's
 * copies with the printed signature — and resolves with how many pages were sent. (One job per copy, the
 * first version, meant the printer paused between copies; owner, 2026-09-30.)
 * The thumbprint, when there is one, is drawn on every SHOP copy; the sheet
 * itself keeps it off the seller's.
 * Render `host` somewhere in the component — it is the printout.
 *
 * No requestAnimationFrame anywhere: a covered or minimised window stops
 * painting, and the Print Station is usually behind other windows.
 */
export function useReceiptPrinter() {
  const [view, setView] = useState<PrintView | null>(null);
  /** True after a print that showed a dialog — this browser is not printing silently. */
  const [dialogSuspected, setDialogSuspected] = useState(false);
  const busyRef = useRef(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    // Warm the signature face now, so the first print does not have to wait for it.
    void ensureSignatureFont();
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const print = useCallback(
    async (receipt: BuyReceiptRow, copies: BuyReceiptCopies, idPhotoUrl: string | null, thumbprintUrl: string | null = null): Promise<number> => {
      if (busyRef.current) return 0;
      busyRef.current = true;
      let printed = 0;
      try {
        // No photo to print: a with-ID shop copy still comes out, as a plain shop copy.
        const plainShop = Math.max(0, copies.plain) + (idPhotoUrl ? 0 : Math.max(0, copies.withId));
        const sheets: PrintSheet[] = [
          ...Array.from({ length: plainShop }, () => ({ variant: 'shop' as const, showIdPhoto: false })),
          ...Array.from({ length: idPhotoUrl ? Math.max(0, copies.withId) : 0 }, () => ({ variant: 'shop' as const, showIdPhoto: true })),
          ...Array.from({ length: Math.max(0, copies.seller) }, () => ({ variant: 'seller' as const, showIdPhoto: false })),
        ];
        if (sheets.length > 0 && aliveRef.current) {
          // Commit every page to the DOM before looking for their images.
          flushSync(() => setView({ receipt, idPhotoUrl, thumbprintUrl, sheets }));
          const host = document.querySelector('.buy-receipt-print-host');
          await Promise.all([waitForImages(host ? Array.from(host.querySelectorAll('img')) : []), ensureSignatureFont()]);
          await waitForPrintLayout(window);
          const { blockedMs } = await printOnce();
          if (aliveRef.current) setDialogSuspected(blockedMs > DIALOG_SUSPECTED_MS);
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
      {view.sheets.map((sheet, index) => (
        <BuyReceiptSheet key={index} mode="print" variant={sheet.variant} receipt={view.receipt} idPhotoUrl={view.idPhotoUrl} showIdPhoto={sheet.showIdPhoto} thumbprintUrl={view.thumbprintUrl} />
      ))}
    </BuyReceiptPrintHost>
  ) : null;

  return { print, host, printing: view !== null, dialogSuspected };
}
