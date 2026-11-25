'use client';

import { useEffect, useState } from 'react';
import AdminModal from '@/components/admin/AdminModal';
import { formatFollowUpTime } from '@/lib/follow-ups';
import { formatItemMoney, type FollowUpItemsView } from '@/lib/follow-up-items';
import type { FollowUpMessageRow } from '@/lib/follow-ups-server';
import { callJson, LABEL_CLASS, MUTED, SMALL_BUTTON } from './shared';

/**
 * Upcoming → "View items" (owner, 2026-11-25, mockup 1): the original item
 * lines behind one thank-you, in the standard admin pop-up (✕ · Esc · click
 * outside · Close). Read-only. Shows the owner's internal note and exactly
 * what the AI reads, so an opening line can be checked against its source.
 */
export default function FollowUpItemsModal({
  row,
  adminBasePath,
  onClose,
}: {
  row: FollowUpMessageRow;
  adminBasePath: string;
  onClose: () => void;
}) {
  const [view, setView] = useState<FollowUpItemsView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void callJson<FollowUpItemsView>(`/api/admin/follow-ups/${row.id}/items`, { method: 'GET' }).then(({ ok, data }) => {
      if (!live) return;
      if (ok) setView(data);
      else setError(data.error ?? 'Could not load the items.');
    });
    return () => {
      live = false;
    };
  }, [row.id]);

  const isReceipt = row.source_type === 'buy_receipt';
  const href = isReceipt ? `${adminBasePath}/buy-receipts/${row.source_id}` : `${adminBasePath}/orders/${row.source_id}`;
  const ref = view?.ref ?? row.source_ref ?? (isReceipt ? 'Buy receipt' : 'Order');
  const showQty = !!view && (view.kind === 'receipt' || view.lines.some((line) => line.qty !== null));
  const cell = 'px-2 py-2 align-top';
  const head = `px-2 py-1.5 text-left text-[10.5px] font-bold uppercase tracking-[0.14em]`;

  return (
    <AdminModal title={`${ref} · Items`} onClose={onClose} maxWidth="max-w-xl">
      <div className="text-sm">
        {error && <p role="alert" className="font-semibold" style={{ color: 'var(--color-error)' }}>{error}</p>}
        {!view && !error && <p style={MUTED}>Loading…</p>}
        {view && (
          <>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[15px] font-semibold">{view.name || row.name || row.email}</div>
                <div className="text-xs" style={MUTED}>
                  {view.kind === 'receipt' ? 'Buy receipt' : 'Order'}
                  {view.at ? ` · ${formatFollowUpTime(view.at)}` : ''}
                  {view.state ? ` · ${view.state}` : ''}
                </div>
              </div>
              {row.status === 'scheduled' && row.send_at && (
                <div className="text-right text-xs" style={MUTED}>Thank-you queued<br />{formatFollowUpTime(row.send_at)}</div>
              )}
            </div>

            {view.lines.length === 0 ? (
              <p style={MUTED}>No item lines on this {view.kind === 'receipt' ? 'receipt' : 'order'}.</p>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--color-outline-variant)', ...MUTED }}>
                    {showQty && <th className={head}>Qty</th>}
                    <th className={head}>{view.kind === 'receipt' ? 'Description' : 'Item'}</th>
                    <th className={`${head} text-right`}>{view.kind === 'receipt' ? 'Amount' : 'Price'}</th>
                  </tr>
                </thead>
                <tbody>
                  {view.lines.map((line, index) => (
                    <tr key={index} className="border-b" style={{ borderColor: '#ece8de' }}>
                      {showQty && <td className={cell}>{line.qty ?? 1}</td>}
                      <td className={cell}>{line.description}</td>
                      <td className={`${cell} whitespace-nowrap text-right`}>{formatItemMoney(line.amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 font-bold" style={{ borderColor: 'var(--color-on-surface)' }}>
                    {showQty && <td className={cell} />}
                    <td className={cell}>{view.kind === 'receipt' ? 'Total paid to seller' : 'Order total'}</td>
                    <td className={`${cell} whitespace-nowrap text-right`}>{formatItemMoney(view.total)}</td>
                  </tr>
                </tbody>
              </table>
            )}

            {view.note && (
              <div className="mt-4 border px-3 py-2.5 text-[13.5px]" style={{ borderColor: '#e7dfcf', background: '#fcfaf4' }}>
                <span className={`block ${LABEL_CLASS}`} style={MUTED}>Note for the thank-you email · internal</span>
                {view.note}
              </div>
            )}
            {row.step === 1 && view.aiPieces.length > 0 && (
              <div className="mt-3 text-[13px]" style={{ color: '#444' }}>
                <span className={`block ${LABEL_CLASS}`} style={MUTED}>What the AI reads (prices, weights and counts cut out)</span>
                {view.aiPieces.join(' · ')}
              </div>
            )}
          </>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <a href={href} target="_blank" rel="noopener" className="text-[13px] font-bold underline underline-offset-2" style={{ color: 'var(--color-primary)' }}>
            Open the {isReceipt ? 'receipt' : 'order'} ↗
          </a>
          <button type="button" className="outline-button" style={SMALL_BUTTON} onClick={onClose}>Close</button>
        </div>
      </div>
    </AdminModal>
  );
}
