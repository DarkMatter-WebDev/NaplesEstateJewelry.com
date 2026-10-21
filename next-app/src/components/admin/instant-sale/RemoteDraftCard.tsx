'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { RemoteDraftCardData } from '@/lib/remote-sale';

const hintStyle = { color: 'var(--color-on-surface-variant)' } as const;

function savedLabel(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
}

/** One saved Remote sale draft on Instant Sale: who, how many items, when — Continue or Delete (owner, 2026-10-21). */
export default function RemoteDraftCard({ draft, adminBasePath }: { draft: RemoteDraftCardData; adminBasePath: string }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/remote-sales/drafts/${draft.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? 'Could not delete the draft.'); return; }
      setGone(true);
    } catch {
      setError('Could not reach the server. Nothing was deleted.');
    } finally {
      setBusy(false);
    }
  }

  if (gone) {
    return <p className="rounded-2xl border bg-white p-4 text-xs" style={{ borderColor: 'var(--color-outline-variant)', ...hintStyle }}>Draft deleted.</p>;
  }

  return (
    <div className="grid gap-2 rounded-2xl border border-dashed bg-white p-4" style={{ borderColor: 'var(--color-outline-variant)' }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm"><strong>{draft.customer ?? 'No name yet'}</strong></span>
        <span className="inline-block rounded-full px-2.5 py-1 text-[0.6rem] font-bold uppercase tracking-[0.12em]" style={{ background: '#f1ede2', color: '#6b5d33', fontFamily: 'var(--font-label)' }}>Draft</span>
      </div>
      <span className="text-xs" style={hintStyle}>
        {draft.itemCount} item{draft.itemCount === 1 ? '' : 's'} · saved {savedLabel(draft.updatedAt)} · not sent, not in Orders
      </span>
      {confirming ? (
        <div className="grid gap-2 rounded-xl border p-3" style={{ borderColor: '#e6b4b4', background: '#fdf6f6' }}>
          <span className="text-xs" style={{ color: 'var(--color-on-surface)' }}>Delete this draft? Nothing was sent, so nobody is told.</span>
          <div className="flex gap-2">
            <button type="button" className="outline-button text-xs" onClick={() => setConfirming(false)} disabled={busy}>Keep it</button>
            <button type="button" className="gold-button text-xs" style={{ background: '#a32d2d' }} onClick={() => void remove()} disabled={busy}>{busy ? 'Deleting…' : 'Delete draft'}</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Link href={`${adminBasePath}/instant-sale/remote?draft=${draft.id}`} className="gold-button text-xs">Continue</Link>
          <button type="button" className="outline-button text-xs" style={{ color: 'var(--color-error)', borderColor: '#e6b4b4' }} onClick={() => setConfirming(true)}>Delete</button>
        </div>
      )}
      {error && <span className="text-xs" role="alert" style={{ color: 'var(--color-error)' }}>{error}</span>}
    </div>
  );
}
