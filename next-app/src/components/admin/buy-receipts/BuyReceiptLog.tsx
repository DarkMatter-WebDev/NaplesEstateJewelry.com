'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AdminModal from '@/components/admin/AdminModal';
import { AppIcon } from '@/components/AppIcon';
import { createClient } from '@/lib/supabase/client';
import { draftContinuePath, isDraftReceipt } from '@/lib/buy-receipt-drafts';
import {
  BUY_RECEIPT_COLUMNS,
  BUY_RECEIPT_PRINT_SETS,
  defaultPrintSet,
  formatReceiptDate,
  formatReceiptTime,
  isPrintPending,
  mergeFreshReceipts,
  paymentsLine,
  pendingReceiptIds,
  receiptPrintLabel,
  type BuyReceiptRow,
} from '@/lib/buy-receipts';
import { formatCurrency } from '@/types/sales';
import { useReceiptPrinter } from './BuyReceiptPrintHost';
import { deleteReceipt, markPrinted, printableIdPhoto, printableThumbprint, requestPrint, type PrintableIdPhoto } from './buy-receipt-client';

/**
 * Admin → Buy Receipts → Log: every saved receipt, newest first. Search by
 * number, seller or phone. A row opens the receipt (print options, edit, void,
 * duplicate). "Send to printer" and "Print here" (owner, 2026-09-30) are quick
 * enough to keep on the row; both use the default set — a shop copy and a seller's copy,
 * the shop copy WITH the ID photo when the receipt has one (owner, 2026-10-06).
 *
 * "Delete" (owner, 2026-10-03) removes a receipt for good, with its ID photo and thumbprint —
 * for test and mistaken entries. It always asks first, in the same pop-up
 * window Void uses, and says that Void is the one that keeps the record.
 *
 * A DRAFT (owner, 2026-10-09) sits in the same list with a "Draft" tag and one
 * button, "Continue", which opens it in the form on whatever device this is.
 * It has no print buttons — it is finished first — and Delete removes it.
 *
 * Rows that are "Waiting for the desktop" are WATCHED (owner, 2026-10-01: on the
 * iPad the tag stayed on "waiting" after the desktop had printed, until a manual
 * refresh). The page re-reads just those rows straight from Supabase — no
 * Netlify function — every 3 s for two minutes, then every 15 s for up to half
 * an hour, and at once when the tab comes back to the front (a tablet freezes
 * timers in the background). It stops by itself when nothing is waiting.
 */

const SEARCH_DELAY_MS = 300;
const WATCH_EVERY_MS = 3_000;
const WATCH_SLOW_EVERY_MS = 15_000;
const WATCH_FAST_FOR_MS = 2 * 60_000;
const WATCH_FOR_MS = 30 * 60_000;
const hintStyle = { color: 'var(--color-on-surface-variant)' } as const;

/** What goes with a deleted receipt, for the confirmation window: its ID photo, its thumbprint, both or neither. */
function deletedWith(row: Pick<BuyReceiptRow, 'seller_id_photo_path' | 'seller_thumbprint_path'>): string {
  const kept = [row.seller_id_photo_path ? 'ID photo' : null, row.seller_thumbprint_path ? 'thumbprint' : null].filter(Boolean);
  return kept.length > 0 ? `, together with its ${kept.join(' and ')}` : '';
}

function Tag({ children, tone }: { children: React.ReactNode; tone: 'gold' | 'red' | 'grey' | 'green' }) {
  const tones = {
    gold: { background: '#fbf5dd', color: '#735c00' },
    red: { background: '#fcebeb', color: '#791f1f' },
    grey: { background: '#f1efe8', color: '#5f5e5a' },
    green: { background: '#eaf3de', color: '#27500a' },
  } as const;
  return (
    <span className="inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold" style={tones[tone]}>
      {children}
    </span>
  );
}

export default function BuyReceiptLog({ adminBasePath, initialRows }: { adminBasePath: string; initialRows: BuyReceiptRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<BuyReceiptRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const printer = useReceiptPrinter();
  const firstRun = useRef(true);

  useEffect(() => {
    // The server already rendered the unfiltered list.
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/buy-receipts?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
        const data = (await res.json().catch(() => ({}))) as { receipts?: BuyReceiptRow[]; error?: string };
        if (!res.ok || !data.receipts) setError(data.error ?? 'Could not load the receipts.');
        else setRows(data.receipts);
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === 'AbortError')) setError('Could not reach the server.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, SEARCH_DELAY_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  // Watch the rows that are waiting for the desktop. Keyed by WHICH rows are
  // waiting, so a row that prints (or a new send) restarts or ends the watch.
  const pendingKey = pendingReceiptIds(rows).join(',');
  useEffect(() => {
    if (!pendingKey) return;
    const ids = pendingKey.split(',');
    const supabase = createClient();
    const startedAt = Date.now();
    let cancelled = false;
    let timer = 0;
    let reading = false;

    const refresh = async () => {
      if (reading) return;
      reading = true;
      try {
        // Hydrate the session first, or the read goes out as anon and RLS returns nothing.
        await supabase.auth.getSession();
        const { data } = await supabase.from('buy_receipts').select(BUY_RECEIPT_COLUMNS).in('id', ids);
        if (cancelled || !data) return;
        const fresh = data as unknown as BuyReceiptRow[];
        setRows((current) => mergeFreshReceipts(current, fresh));
      } catch {
        // A missed read is retried on the next tick.
      } finally {
        reading = false;
      }
    };
    const schedule = () => {
      const elapsed = Date.now() - startedAt;
      if (elapsed > WATCH_FOR_MS) return;
      timer = window.setTimeout(tick, elapsed < WATCH_FAST_FOR_MS ? WATCH_EVERY_MS : WATCH_SLOW_EVERY_MS);
    };
    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState === 'visible') await refresh();
      if (!cancelled) schedule();
    };
    const onReturn = () => {
      if (document.visibilityState === 'visible') void refresh();
    };

    schedule();
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);
    window.addEventListener('pageshow', onReturn);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
      window.removeEventListener('pageshow', onReturn);
    };
  }, [pendingKey]);

  async function send(row: BuyReceiptRow) {
    if (sendingId) return;
    setSendingId(row.id);
    setError(null);
    const set = BUY_RECEIPT_PRINT_SETS[defaultPrintSet(Boolean(row.seller_id_photo_path))];
    const result = await requestPrint(row.id, { plain: set.plain, withId: set.withId, seller: set.seller });
    setSendingId(null);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setRows((current) => current.map((item) => (item.id === row.id ? result.receipt : item)));
  }

  async function printHere(row: BuyReceiptRow) {
    if (sendingId || printingId) return;
    setPrintingId(row.id);
    setError(null);
    let idPhoto: PrintableIdPhoto | null = null;
    let thumbprint: PrintableIdPhoto | null = null;
    try {
      // The default set: with the ID photo when the receipt has one.
      const set = BUY_RECEIPT_PRINT_SETS[defaultPrintSet(Boolean(row.seller_id_photo_path))];
      if (set.withId > 0) {
        idPhoto = await printableIdPhoto(row.seller_id_photo_path);
        if (!idPhoto) {
          setError(`${row.receipt_number}: the ID photo could not be loaded, so nothing was printed.`);
          return;
        }
      }
      // The shop copy carries the seller's thumbprint when the receipt has one.
      if (set.plain + set.withId > 0 && row.seller_thumbprint_path) {
        thumbprint = await printableThumbprint(row.seller_thumbprint_path);
        if (!thumbprint) {
          setError(`${row.receipt_number}: the thumbprint could not be loaded, so nothing was printed.`);
          return;
        }
      }
      const pages = await printer.print(row, { plain: set.plain, withId: set.withId, seller: set.seller }, idPhoto?.url ?? null, thumbprint?.url ?? null);
      if (pages <= 0) return;
      const result = await markPrinted(row.id, pages);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      setRows((current) => current.map((item) => (item.id === row.id ? result.receipt : item)));
    } finally {
      idPhoto?.release();
      thumbprint?.release();
      setPrintingId(null);
    }
  }

  function askDelete(row: BuyReceiptRow) {
    setDeleteError(null);
    setNotice(null);
    setDeleting(row);
  }

  function closeDelete() {
    if (deleteBusy) return;
    setDeleting(null);
    setDeleteError(null);
  }

  async function confirmDelete() {
    if (!deleting || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const result = await deleteReceipt(deleting.id);
    setDeleteBusy(false);
    if ('error' in result) {
      setDeleteError(result.error);
      return;
    }
    setRows((current) => current.filter((item) => item.id !== deleting.id));
    setNotice(`${deleting.receipt_number} was deleted.`);
    setDeleting(null);
  }

  const busy = sendingId !== null || printingId !== null;

  return (
    <div>
      {printer.host}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          className="form-field"
          style={{ maxWidth: 360 }}
          type="search"
          value={query}
          placeholder="Search by number, seller or phone"
          aria-label="Search receipts"
          onChange={(event) => setQuery(event.target.value)}
        />
        <span className="text-sm" style={hintStyle}>
          {loading ? 'Searching…' : `${rows.length} ${rows.length === 1 ? 'receipt' : 'receipts'}`}
        </span>
      </div>

      {error && (
        <p role="alert" className="mb-3 border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)' }}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mb-3 border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-outline-variant)', color: 'var(--color-on-surface)' }}>
          {notice}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="border bg-white px-5 py-10 text-center" style={{ borderColor: 'var(--color-outline-variant)' }}>
          <p className="text-lg" style={{ fontFamily: 'var(--font-headline)' }}>
            {query.trim() ? 'No receipts match that search' : 'No receipts yet'}
          </p>
          <p className="mt-1 text-sm" style={hintStyle}>
            {query.trim() ? 'Try a seller name, a phone number or a receipt number.' : 'Saved receipts appear here, newest first.'}
          </p>
          {!query.trim() && (
            <Link href={`${adminBasePath}/buy-receipts`} className="gold-button mt-4 inline-flex text-xs">
              New receipt
            </Link>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto border bg-white" style={{ borderColor: 'var(--color-outline-variant)' }}>
          {/* Below 1100px (an iPad on its side is 1024) the row was 7px too wide even before the
              Delete button existed, and with it the button sat off the edge of the table. So on
              those screens only, the cells and the three worded buttons give up a little side
              padding: 1013px → about 905px, which fits the 958px the page leaves. Wider screens
              are untouched. Plain CSS on purpose — a Tailwind utility cannot out-rank the
              `.outline-button` rule in globals.css. */}
          <style>{`
            @media (max-width: 1100px) {
              .brl-table th, .brl-table td { padding-left: 0.75rem; padding-right: 0.75rem; }
              .brl-table .brl-actions .outline-button { padding-left: 0.85rem; padding-right: 0.85rem; }
            }
          `}</style>
          <table className="brl-table w-full text-sm" style={{ borderCollapse: 'collapse', minWidth: 760 }}>
            <thead>
              <tr className="text-left text-[0.65rem] uppercase tracking-[0.14em]" style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}>
                <th className="px-4 py-3">Receipt</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Seller</th>
                <th className="px-4 py-3">Paid by</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isVoid = row.status === 'void';
                // A draft (2026-10-09) is not a receipt yet: it opens in the form, and is never printed from here.
                const isDraft = isDraftReceipt(row);
                const openHref = isDraft ? draftContinuePath(adminBasePath, row.id) : `${adminBasePath}/buy-receipts/${row.id}`;
                const pending = isPrintPending(row);
                return (
                  <tr key={row.id} className="border-t align-top" style={{ borderColor: 'var(--color-outline-variant)', color: isVoid ? 'var(--color-on-surface-variant)' : undefined }}>
                    <td className="px-4 py-3 font-semibold">
                      <Link href={openHref} style={{ color: isVoid ? 'inherit' : 'var(--color-primary)', textDecoration: isVoid ? 'line-through' : 'none' }}>
                        {row.receipt_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatReceiptDate(row.created_at)}
                      <span className="block text-xs" style={hintStyle}>{formatReceiptTime(row.created_at)}</span>
                    </td>
                    <td className="px-4 py-3">
                      {row.seller_name}
                      <span className="block text-xs" style={hintStyle}>
                        {isDraft ? (
                          'Not finished'
                        ) : (
                          <>
                            {row.items.length} {row.items.length === 1 ? 'item' : 'items'}
                            {row.items[0] ? ` · ${row.items[0].description}` : ''}
                          </>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3">{isDraft ? '—' : paymentsLine(row.payments)}</td>
                    {/* A draft shows the amounts typed so far, or a dash while there are none. */}
                    <td className="px-4 py-3 text-right whitespace-nowrap">{isDraft && row.total === 0 ? '—' : formatCurrency(row.total)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {isVoid && <Tag tone="red">Void</Tag>}
                        {isDraft ? (
                          <Tag tone="gold">Draft</Tag>
                        ) : pending ? (
                          <Tag tone="gold">Waiting for the desktop</Tag>
                        ) : (
                          <Tag tone={row.print_count > 0 ? 'green' : 'grey'}>{receiptPrintLabel(row)}</Tag>
                        )}
                        {!row.seller_id_photo_path && <Tag tone="grey">No ID photo</Tag>}
                        {row.emailed_at && <Tag tone="green">Emailed</Tag>}
                      </div>
                    </td>
                    <td className="brl-actions px-4 py-3 text-right whitespace-nowrap">
                      {isDraft ? (
                        <Link href={openHref} className="gold-button text-xs">
                          Continue
                        </Link>
                      ) : (
                        <>
                          <button type="button" className="outline-button text-xs" disabled={busy} onClick={() => void printHere(row)}>
                            {printingId === row.id ? 'Printing…' : 'Print here'}
                          </button>
                          <button type="button" className="outline-button ml-2 text-xs" disabled={busy} onClick={() => void send(row)}>
                            {sendingId === row.id ? 'Sending…' : 'Send to printer'}
                          </button>
                          <Link href={openHref} className="outline-button ml-2 text-xs">
                            Open
                          </Link>
                        </>
                      )}
                      {/* A trash-can, not a fourth worded button: with "Delete" spelled out the
                          row was too wide for an iPad and the button sat off the edge of the
                          table (measured 2026-10-03). The pop-up window names the receipt. */}
                      <button
                        type="button"
                        className="outline-button ml-2 text-xs"
                        style={{ color: 'var(--color-error)', borderColor: 'var(--color-error)', paddingLeft: '0.7rem', paddingRight: '0.7rem' }}
                        disabled={busy}
                        aria-label={`Delete ${row.receipt_number}`}
                        title="Delete"
                        onClick={() => askDelete(row)}
                      >
                        <AppIcon name="delete" className="text-[1rem]" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {deleting && (
        <AdminModal title={`Delete ${deleting.receipt_number}`} onClose={closeDelete}>
          <div className="grid gap-3">
            <p className="text-sm font-semibold">
              {deleting.seller_name} · {formatReceiptDate(deleting.created_at)} · {formatCurrency(deleting.total)}
            </p>
            <p className="text-sm" style={hintStyle}>
              This removes the receipt from the log for good{deletedWith(deleting)}. It cannot be
              undone, and the number {deleting.receipt_number} will not be used again.
            </p>
            {/* A draft never was a purchase on record, so Void is not its alternative. */}
            {!isDraftReceipt(deleting) && (
              <p className="text-sm" style={hintStyle}>
                For a real purchase that was reversed, open the receipt and use <strong>Void</strong> instead — a void receipt stays in the log.
              </p>
            )}
            {deleteError && <p role="alert" className="text-sm" style={{ color: 'var(--color-error)' }}>{deleteError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="outline-button text-xs" disabled={deleteBusy} onClick={closeDelete}>Keep it</button>
              <button
                type="button"
                className="gold-button text-xs"
                style={{ background: 'var(--color-error)', boxShadow: 'none' }}
                disabled={deleteBusy}
                onClick={() => void confirmDelete()}
              >
                {deleteBusy ? 'Deleting…' : 'Delete this receipt'}
              </button>
            </div>
          </div>
        </AdminModal>
      )}
    </div>
  );
}
