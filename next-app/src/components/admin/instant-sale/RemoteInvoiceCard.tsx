'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatCurrency } from '@/types/sales';
import { IN_STORE_PAYMENT_LABELS, IN_STORE_PAYMENT_METHODS, type InStorePaymentMethod } from '@/lib/in-store-sale';
import { formatRemoteDue, type RemoteInvoiceCardData } from '@/lib/remote-sale';
import { copyTextToClipboard } from '@/lib/clipboard';

const hintStyle = { color: 'var(--color-on-surface-variant)' } as const;
const cardStyle = { borderColor: 'var(--color-outline-variant)' } as const;

type Done = { kind: 'recorded'; method: InStorePaymentMethod; receiptEmailed: boolean } | { kind: 'cancelled' };

/**
 * One remote-sale invoice (owner mockup v2, screen 6): who, what, the total,
 * the link's state, and Copy pay link · Resend email · Record payment ·
 * Cancel invoice. Record payment is for money taken outside the site (Zelle,
 * check…): recorded the way an in-store sale is. Paid online, the invoice
 * closes by itself and leaves this list.
 */
export default function RemoteInvoiceCard({ invoice: initial, adminBasePath }: { invoice: RemoteInvoiceCardData; adminBasePath: string }) {
  const [invoice, setInvoice] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [panel, setPanel] = useState<'record' | 'cancel' | null>(null);
  const [method, setMethod] = useState<InStorePaymentMethod>('zelle');
  const [done, setDone] = useState<Done | null>(null);

  async function act(action: 'resend' | 'cancel' | 'record') {
    if (busy) return;
    setBusy(action);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/remote-sales/${invoice.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'record' ? { action, paidBy: method } : { action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage({ text: data.error ?? 'That did not work. Try again.', ok: false }); return; }
      if (action === 'resend') {
        if (data.invoice) setInvoice(data.invoice);
        setMessage({ text: `Sent again to ${invoice.email ?? 'the customer'}.`, ok: true });
      } else if (action === 'cancel') {
        setDone({ kind: 'cancelled' });
      } else {
        setDone({ kind: 'recorded', method, receiptEmailed: Boolean(data.receiptEmailed) });
      }
      setPanel(null);
    } catch {
      setMessage({ text: 'Could not reach the server. Nothing changed — try again.', ok: false });
    } finally {
      setBusy(null);
    }
  }

  async function copyLink() {
    const ok = await copyTextToClipboard(invoice.payUrl);
    setMessage(ok ? { text: 'Pay link copied.', ok: true } : { text: invoice.payUrl, ok: true });
  }

  const expired = invoice.state === 'expired';
  const chip = (text: string, tone: 'unpaid' | 'link' | 'expired' | 'paid' | 'cancelled') => {
    const tones = {
      unpaid: { background: '#fff1cc', color: '#8a6400' },
      link: { background: '#eef3ff', color: '#2d4f9e' },
      expired: { background: '#f3e8e8', color: '#8a2f2f' },
      paid: { background: '#e4f4ea', color: '#0f7a4f' },
      cancelled: { background: '#ececec', color: '#555' },
    } as const;
    return (
      <span className="inline-block rounded-full px-2.5 py-1 text-[0.6rem] font-bold uppercase tracking-[0.12em]" style={{ ...tones[tone], fontFamily: 'var(--font-label)' }}>
        {text}
      </span>
    );
  };

  return (
    <div className="grid gap-2.5 rounded-2xl border bg-white p-4" style={cardStyle}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm"><strong>{invoice.customer}</strong></span>
        <span className="flex flex-wrap gap-1.5">
          {done?.kind === 'recorded'
            ? chip(`Paid · ${IN_STORE_PAYMENT_LABELS[done.method]}`, 'paid')
            : done?.kind === 'cancelled'
              ? chip('Cancelled', 'cancelled')
              : (
                <>
                  {chip('Unpaid', 'unpaid')}
                  {invoice.payOnline && (expired ? chip(`Link ended ${formatRemoteDue(invoice.expiresAt)}`, 'expired') : chip(`Link until ${formatRemoteDue(invoice.expiresAt)}`, 'link'))}
                </>
              )}
        </span>
      </div>
      <div className="flex justify-between gap-3 text-sm">
        <span style={hintStyle}>
          {invoice.itemCount} item{invoice.itemCount === 1 ? '' : 's'} · {invoice.ships ? 'ship' : 'pickup'} · <Link href={`${adminBasePath}/orders/${invoice.orderId}`} className="underline">{invoice.orderNumber}</Link>
        </span>
        <strong>{formatCurrency(invoice.total)}</strong>
      </div>
      {invoice.sentCount === 0 && !done && (
        <span className="text-xs" style={{ color: 'var(--color-error)' }}>The invoice email has not gone out yet — press Resend email.</span>
      )}

      {done ? (
        <span className="text-xs" style={hintStyle}>
          {done.kind === 'cancelled'
            ? 'Cancelled. The pay link no longer works and the order is cancelled.'
            : `Recorded. Listed items are marked sold and their listings end on the next sweep.${done.receiptEmailed ? ' The receipt was emailed.' : ''}`}
        </span>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {invoice.payOnline && (
              <button type="button" className="outline-button text-xs" disabled={Boolean(busy)} onClick={() => void copyLink()}>Copy pay link</button>
            )}
            <button type="button" className="outline-button text-xs" disabled={Boolean(busy)} onClick={() => void act('resend')}>
              {busy === 'resend' ? 'Sending…' : 'Resend email'}
            </button>
            <button type="button" className="outline-button text-xs" disabled={Boolean(busy)} onClick={() => setPanel(panel === 'record' ? null : 'record')}>Record payment</button>
            <button type="button" className="outline-button text-xs" style={{ color: 'var(--color-error)', borderColor: '#e6b4b4' }} disabled={Boolean(busy)} onClick={() => setPanel(panel === 'cancel' ? null : 'cancel')}>
              Cancel invoice
            </button>
          </div>
          {expired && <span className="text-xs" style={hintStyle}>The link ran out. Resend email gives it a fresh {invoice.payOnline ? 'period' : 'copy'}.</span>}
          {panel === 'record' && (
            <div className="grid gap-2 rounded-xl border p-3" style={{ ...cardStyle, background: 'var(--color-surface-container-low)' }}>
              <span className="text-xs" style={hintStyle}>Paid outside the site? Pick how, then record it. The items are marked sold and the customer gets the receipt.</span>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Paid by">
                {IN_STORE_PAYMENT_METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={method === m}
                    onClick={() => setMethod(m)}
                    className="rounded-full border px-3 py-1.5 text-[0.65rem] font-bold uppercase tracking-[0.08em]"
                    style={{ fontFamily: 'var(--font-label)', borderColor: method === m ? 'var(--color-primary)' : 'var(--color-outline-variant)', background: method === m ? '#fbf5dd' : '#fff', color: method === m ? 'var(--color-primary)' : 'var(--color-on-surface-variant)' }}
                  >
                    {IN_STORE_PAYMENT_LABELS[m]}
                  </button>
                ))}
              </div>
              <button type="button" className="gold-button text-xs" disabled={Boolean(busy)} onClick={() => void act('record')}>
                {busy === 'record' ? 'Recording…' : `Record ${formatCurrency(invoice.total)} · ${IN_STORE_PAYMENT_LABELS[method]}`}
              </button>
            </div>
          )}
          {panel === 'cancel' && (
            <div className="grid gap-2 rounded-xl border p-3" style={{ borderColor: '#e6b4b4', background: '#fdf6f6' }}>
              <span className="text-xs" style={{ color: 'var(--color-on-surface)' }}>Cancel this invoice? The pay link stops working and the unpaid order is cancelled. Nothing is emailed.</span>
              <div className="flex gap-2">
                <button type="button" className="outline-button text-xs" onClick={() => setPanel(null)} disabled={Boolean(busy)}>Keep it</button>
                <button type="button" className="gold-button text-xs" style={{ background: '#a32d2d' }} disabled={Boolean(busy)} onClick={() => void act('cancel')}>
                  {busy === 'cancel' ? 'Cancelling…' : 'Cancel invoice'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {message && (
        <span className="text-xs break-all" role={message.ok ? 'status' : 'alert'} style={{ color: message.ok ? 'var(--color-primary)' : 'var(--color-error)' }}>{message.text}</span>
      )}
    </div>
  );
}
