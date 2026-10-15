'use client';

import { useRef, useState } from 'react';
import {
  bestOfferBulkOutcome,
  bestOfferBulkSummary,
  countBestOfferBulk,
  type BestOfferBulkItemResult,
  type BestOfferBulkOutcome,
} from '@/lib/ebay/best-offer';

interface BulkItem {
  id: string;
  title: string;
}

interface ItemResponse extends BestOfferBulkItemResult {
  message?: string;
  error?: { code: string; message: string };
}

interface Row {
  id: string;
  title: string;
  outcome: BestOfferBulkOutcome;
  message: string;
}

// eBay routes return { error: { code, message } } — read via this helper
// rather than `data?.error` (see the note in EbaySettingsPanel.tsx).
function errorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === 'object' && 'error' in data) {
    const err = (data as { error?: unknown }).error;
    if (err && typeof err === 'object' && 'message' in err) {
      const message = (err as { message?: unknown }).message;
      if (typeof message === 'string' && message) return message;
    }
  }
  return fallback;
}

/**
 * Bulk "Best Offer on / off" for the items selected in the Products list
 * (2026-10-14). One call per item to /api/admin/ebay/best-offer, ONE AT A
 * TIME (each live item is a full eBay update and stays well under the 60 s
 * function cap), with skipIfUnchanged so items that already have the choice
 * are not touched. Same rules as the drawer's "Allow offers" box — the server
 * decides per item whether eBay is updated now or the choice is only saved.
 */
export default function EbayBestOfferBulkModal({
  items,
  enabled,
  onClose,
}: {
  items: BulkItem[];
  enabled: boolean;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<'confirm' | 'running' | 'done'>('confirm');
  const [rows, setRows] = useState<Row[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [stopped, setStopped] = useState(false);
  const stopRef = useRef(false);
  const choice = enabled ? 'on' : 'off';
  const count = items.length;

  const start = async () => {
    stopRef.current = false;
    setStopped(false);
    setRows([]);
    setPhase('running');
    for (const item of items) {
      if (stopRef.current) {
        setStopped(true);
        break;
      }
      setCurrent(item.title);
      let row: Row;
      try {
        const res = await fetch('/api/admin/ebay/best-offer', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ productId: item.id, enabled, skipIfUnchanged: true }),
        });
        const data = (await res.json().catch(() => null)) as ItemResponse | null;
        if (!res.ok || !data) throw new Error(errorMessage(data, 'The request failed.'));
        row = { id: item.id, title: item.title, outcome: bestOfferBulkOutcome(data, enabled), message: data.message ?? '' };
      } catch (err) {
        row = { id: item.id, title: item.title, outcome: 'failed', message: err instanceof Error ? err.message : 'The request failed.' };
      }
      setRows((done) => [...done, row]);
    }
    setCurrent(null);
    setPhase('done');
  };

  const counts = countBestOfferBulk(rows.map((row) => row.outcome));
  const attention = rows.filter((row) => row.outcome === 'failed' || row.outcome === 'check');

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto whitespace-normal p-4 sm:items-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div
        className="min-w-0 w-full max-w-md max-h-[calc(100svh-2rem)] overflow-y-auto border bg-white p-5 flex flex-col gap-4 [overflow-wrap:anywhere]"
        style={{ borderColor: 'var(--color-outline-variant)' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ebay-best-offer-bulk-title"
      >
        <h3 id="ebay-best-offer-bulk-title" className="text-lg font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
          {enabled ? 'Allow offers on eBay' : 'Turn offers off on eBay'}
        </h3>

        {phase === 'confirm' && (
          <>
            <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
              Best Offer <strong style={{ color: 'var(--color-primary)' }}>{choice}</strong> for{' '}
              <strong style={{ color: 'var(--color-primary)' }}>{count}</strong> selected item{count === 1 ? '' : 's'}.
            </p>
            <ul className="text-xs flex flex-col gap-1 list-disc pl-4" style={{ color: 'var(--color-on-surface-variant)' }}>
              <li>
                Live listings change on eBay right away ({enabled ? 'Make Offer appears' : 'back to Buy It Now only'}). Each one is a full update, like
                Sync Updates, so any other waiting change on that item goes too.
              </li>
              <li>Items not on eBay yet, or hidden, ended or in error, are saved and get it with their next sync.</li>
              <li>Items already {choice} are skipped.</li>
              {enabled && <li>No auto-accept or auto-decline — you answer offers on eBay.</li>}
            </ul>
            <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
              One item at a time — a few seconds each. Leave this open until it finishes.
            </p>
            <div className="flex justify-end gap-2 flex-wrap">
              <button type="button" onClick={onClose} className="outline-button text-sm">
                Cancel
              </button>
              <button type="button" onClick={() => void start()} disabled={count === 0} className="gold-button text-sm disabled:opacity-50">
                Turn {choice} for {count}
              </button>
            </div>
          </>
        )}

        {phase === 'running' && (
          <>
            <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }} role="status">
              {rows.length} of {count} done{current ? ` · now: ${current}` : ''}
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  stopRef.current = true;
                }}
                className="outline-button text-sm"
              >
                Stop after current item
              </button>
            </div>
          </>
        )}

        {phase === 'done' && (
          <>
            <p className="text-sm" style={{ color: attention.length ? 'var(--color-error)' : 'var(--color-on-surface-variant)' }} role="status">
              {bestOfferBulkSummary(enabled, counts, stopped)}
            </p>
            {attention.length > 0 && (
              <ul className="text-xs flex flex-col gap-2">
                {attention.map((row) => (
                  <li key={row.id}>
                    <strong style={{ color: 'var(--color-on-surface)' }}>{row.title}</strong>
                    <span className="block" style={{ color: 'var(--color-error)' }}>{row.message}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className="gold-button text-sm">
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
