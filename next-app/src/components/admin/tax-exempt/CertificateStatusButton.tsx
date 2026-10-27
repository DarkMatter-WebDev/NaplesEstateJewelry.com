'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Admin → Tax Exempt: withdraw a certificate (or undo it). Nothing is deleted. */
export default function CertificateStatusButton({ id, status }: { id: string; status: 'approved' | 'revoked' }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const revoke = status === 'approved';

  async function run() {
    if (revoke && !window.confirm('Withdraw this certificate? It stops being offered in Instant Sale and at checkout. The record, the photo and past orders stay.')) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/tax-exempt/certificates/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: revoke ? 'revoke' : 'restore' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? 'Could not update it.'); return; }
      router.refresh();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" className="text-xs underline" style={{ color: revoke ? 'var(--color-error)' : 'var(--color-primary)' }} onClick={() => void run()} disabled={busy}>
        {busy ? 'Saving…' : revoke ? 'Withdraw' : 'Restore'}
      </button>
      {error && <span className="text-xs" role="alert" style={{ color: 'var(--color-error)' }}>{error}</span>}
    </span>
  );
}
