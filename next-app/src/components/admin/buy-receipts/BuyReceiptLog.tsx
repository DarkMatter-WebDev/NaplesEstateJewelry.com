'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  BUY_RECEIPT_DEFAULT_PRINT_SET,
  BUY_RECEIPT_PRINT_SETS,
  formatReceiptDate,
  formatReceiptTime,
  isPrintPending,
  paymentsLine,
  receiptPrintLabel,
  type BuyReceiptRow,
} from '@/lib/buy-receipts';
import { formatCurrency } from '@/types/sales';
import { useReceiptPrinter } from './BuyReceiptPrintHost';
import { markPrinted, requestPrint } from './buy-receipt-client';

/**
 * Admin → Buy Receipts → Log: every saved receipt, newest first. Search by
 * number, seller or phone. A row opens the receipt (print options, edit, void,
 * duplicate). "Send to printer" and "Print here" (owner, 2026-09-30) are quick
 * enough to keep on the row; both use the default set — a shop copy and a seller's copy.
 */

const SEARCH_DELAY_MS = 300;
const hintStyle = { color: 'var(--color-on-surface-variant)' } as const;

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

  async function send(row: BuyReceiptRow) {
    if (sendingId) return;
    setSendingId(row.id);
    setError(null);
    const set = BUY_RECEIPT_PRINT_SETS[BUY_RECEIPT_DEFAULT_PRINT_SET];
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
    try {
      const set = BUY_RECEIPT_PRINT_SETS[BUY_RECEIPT_DEFAULT_PRINT_SET];
      const pages = await printer.print(row, { plain: set.plain, withId: 0, seller: set.seller }, null);
      if (pages <= 0) return;
      const result = await markPrinted(row.id, pages);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      setRows((current) => current.map((item) => (item.id === row.id ? result.receipt : item)));
    } finally {
      setPrintingId(null);
    }
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
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse', minWidth: 760 }}>
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
                const pending = isPrintPending(row);
                return (
                  <tr key={row.id} className="border-t align-top" style={{ borderColor: 'var(--color-outline-variant)', color: isVoid ? 'var(--color-on-surface-variant)' : undefined }}>
                    <td className="px-4 py-3 font-semibold">
                      <Link href={`${adminBasePath}/buy-receipts/${row.id}`} style={{ color: isVoid ? 'inherit' : 'var(--color-primary)', textDecoration: isVoid ? 'line-through' : 'none' }}>
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
                        {row.items.length} {row.items.length === 1 ? 'item' : 'items'}
                        {row.items[0] ? ` · ${row.items[0].description}` : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3">{paymentsLine(row.payments)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{formatCurrency(row.total)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {isVoid && <Tag tone="red">Void</Tag>}
                        {pending ? <Tag tone="gold">Waiting for the desktop</Tag> : <Tag tone={row.print_count > 0 ? 'green' : 'grey'}>{receiptPrintLabel(row)}</Tag>}
                        {!row.seller_id_photo_path && <Tag tone="grey">No ID photo</Tag>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button type="button" className="outline-button text-xs" disabled={busy} onClick={() => void printHere(row)}>
                        {printingId === row.id ? 'Printing…' : 'Print here'}
                      </button>
                      <button type="button" className="outline-button ml-2 text-xs" disabled={busy} onClick={() => void send(row)}>
                        {sendingId === row.id ? 'Sending…' : 'Send to printer'}
                      </button>
                      <Link href={`${adminBasePath}/buy-receipts/${row.id}`} className="outline-button ml-2 text-xs">
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
