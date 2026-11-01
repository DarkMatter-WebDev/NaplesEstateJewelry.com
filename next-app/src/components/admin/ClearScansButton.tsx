'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  source: string;
  label: string;
  total: number;
};

// Admin → Insights: clears ONE code's saved scans (owner, 2026-10-31).
export default function ClearScansButton({ source, label, total }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function clearScans() {
    if (busy) return;
    const confirmed = window.confirm(
      `Clear all ${total} ${total === 1 ? 'scan' : 'scans'} for ${label}?\n\nThe count starts again from 0. The other codes are not touched. This can't be undone.`,
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/admin/insights/scans/${source}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Could not clear the scans.');
      router.refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not clear the scans.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="rounded-full border px-3 py-1.5 text-[0.68rem] font-bold uppercase tracking-[0.12em] transition hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
      style={{
        borderColor: 'color-mix(in srgb, var(--color-error) 34%, var(--color-outline-variant))',
        color: 'var(--color-error)',
        fontFamily: 'var(--font-label)',
      }}
      disabled={busy}
      onClick={clearScans}
      title={`Clear the saved scans for ${label}`}
    >
      {busy ? 'Clearing...' : 'Clear'}
    </button>
  );
}
