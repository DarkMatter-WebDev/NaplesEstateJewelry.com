'use client';

import { useState } from 'react';
import { editStateFromOrder, EDIT_LIMITS, type OrderRowForEdit } from '@/lib/order-edit';

/**
 * "✎ Fix name" beside an item on the order page (owner, 2026-11-24 (11),
 * mockup 1 + 2): corrects the item's name on THIS order only — the thank-you
 * email, reprinted invoices / receipts and the customer's account page read
 * it; emails already sent keep their saved copy. Saves through the same route
 * as Edit order (source `fix_name`), so it lands in Change history.
 */
export default function FixItemName({
  order,
  gift,
  taxExempt,
  itemId,
  title,
  onSaved,
}: {
  order: OrderRowForEdit & { id: string };
  gift: { recipientName: string | null; message: string | null } | null;
  taxExempt: boolean;
  itemId: string;
  title: string;
  onSaved: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const next = value.trim();
    if (!next) {
      setError('The name cannot be empty.');
      return;
    }
    if (next === title.trim()) {
      setOpen(false);
      return;
    }
    setBusy(true);
    setError(null);
    const state = editStateFromOrder({ ...order, tax_exempt: taxExempt }, gift);
    const body = { ...state, items: state.items.map((item) => (item.id === itemId ? { ...item, title: next } : item)) };
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/edit?source=fix_name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Could not save the name.');
        setBusy(false);
        return;
      }
      onSaved(`Item name corrected: "${next}".`);
    } catch {
      setError('Could not reach the server. The name did not change.');
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setValue(title); setError(null); setOpen(true); }}
        className="ml-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 align-middle text-[0.6rem] font-bold uppercase tracking-[0.08em] transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-[0_6px_14px_rgba(38,28,6,0.1)] active:translate-y-0 focus-visible:outline focus-visible:outline-2"
        style={{ borderColor: '#d9cfae', color: 'var(--color-primary)', background: 'white' }}
        title="Fix this item's name on this order"
      >
        ✎ Fix name
      </button>
    );
  }

  return (
    <div className="mt-1 grid gap-1.5" style={{ maxWidth: 520 }}>
      <input
        className="form-field"
        autoFocus
        value={value}
        maxLength={EDIT_LIMITS.title}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void save();
          if (event.key === 'Escape') setOpen(false);
        }}
        aria-label="New item name"
      />
      <span className="text-[11.5px] font-normal" style={{ color: 'var(--color-on-surface-variant)' }}>
        Was: <s style={{ color: 'var(--color-error)' }}>{title}</s>
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <button type="button" className="gold-button" style={{ padding: '0.45rem 0.9rem', fontSize: '0.6rem' }} disabled={busy} aria-busy={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save name'}
        </button>
        <button type="button" className="outline-button" style={{ padding: '0.45rem 0.9rem', fontSize: '0.6rem' }} disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
        <span className="text-[11.5px] font-normal" style={{ color: 'var(--color-on-surface-variant)' }}>Changes this order only. Already-sent emails keep their saved copy.</span>
      </span>
      {error && <span role="alert" className="text-xs font-semibold" style={{ color: 'var(--color-error)' }}>{error}</span>}
    </div>
  );
}
