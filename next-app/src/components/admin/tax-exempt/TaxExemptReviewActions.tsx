'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FL_CERT_VERIFY_URL, TAX_EXEMPT_DECLINE_MAX, TAX_EXEMPT_DECLINE_REASONS } from '@/lib/tax-exempt';

/**
 * Approve / Decline on the review page the owner's text links to. Big,
 * phone-sized buttons; the name and number can be corrected before Approve.
 */
export default function TaxExemptReviewActions({
  requestId,
  businessName,
  certNumber,
}: {
  requestId: string;
  businessName: string | null;
  certNumber: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(businessName ?? '');
  const [number, setNumber] = useState(certNumber ?? '');
  const [auth, setAuth] = useState('');
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<'approve' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(action: 'approve' | 'decline') {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/admin/tax-exempt/requests/${requestId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'approve'
          ? { action, businessName: name, certNumber: number, flAuthNumber: auth }
          : { action, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? 'Could not save it. Try again.'); return; }
      router.refresh();
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(null);
    }
  }

  const label = 'form-label';
  const labelStyle = { color: 'var(--color-primary)' } as const;
  const hint = { color: 'var(--color-on-surface-variant)' } as const;

  return (
    <div className="grid gap-3">
      <label className="block">
        <span className={label} style={labelStyle}>Name on certificate</span>
        <input className="form-field" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      </label>
      <label className="block">
        <span className={label} style={labelStyle}>Certificate number</span>
        <input className="form-field" value={number} onChange={(e) => setNumber(e.target.value)} autoComplete="off" />
        <span className="mt-1 block text-xs" style={hint}>Read by AI — glance at it against the photo.</span>
      </label>
      <a href={FL_CERT_VERIFY_URL} target="_blank" rel="noopener noreferrer" className="outline-button text-xs justify-center">Verify with FL Revenue ↗</a>
      <label className="block">
        <span className={label} style={labelStyle}>Florida authorization #<span style={{ ...hint, letterSpacing: '0.06em' }}> optional</span></span>
        <input className="form-field" value={auth} onChange={(e) => setAuth(e.target.value)} placeholder="Paste it after checking" autoComplete="off" />
      </label>
      {error && <div className="rounded-lg px-3 py-2 text-sm" role="alert" style={{ background: '#fdf4f4', color: 'var(--color-error)' }}>{error}</div>}
      <button type="button" className="gold-button text-sm justify-center" style={{ padding: '1rem' }} onClick={() => void decide('approve')} disabled={Boolean(busy)}>
        {busy === 'approve' ? 'Approving…' : 'Approve'}
      </button>
      {!declining ? (
        <button type="button" className="outline-button text-xs justify-center" style={{ color: 'var(--color-error)', borderColor: 'rgba(186,26,26,.42)' }} onClick={() => setDeclining(true)} disabled={Boolean(busy)}>
          Decline…
        </button>
      ) : (
        <div className="grid gap-2 rounded-xl border p-3" style={{ borderColor: '#e6b4b4', background: '#fdf4f4' }}>
          <span className="text-xs font-bold" style={{ color: 'var(--color-error)' }}>Why? The buyer sees this on their checkout (or My Account card) and by email.</span>
          <div className="flex flex-wrap gap-2">
            {TAX_EXEMPT_DECLINE_REASONS.map((pick) => (
              <button key={pick} type="button" onClick={() => setReason(pick)} className="rounded-full border bg-white px-3 py-1.5 text-xs text-left" style={{ borderColor: reason === pick ? 'var(--color-error)' : 'var(--color-outline-variant)' }}>
                {pick}
              </button>
            ))}
          </div>
          <textarea className="form-field" rows={2} maxLength={TAX_EXEMPT_DECLINE_MAX} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Or type a reason" />
          <div className="flex gap-2">
            <button type="button" className="outline-button text-xs" style={{ color: 'var(--color-error)', borderColor: 'rgba(186,26,26,.42)' }} onClick={() => void decide('decline')} disabled={Boolean(busy)}>
              {busy === 'decline' ? 'Declining…' : 'Decline and tell the buyer'}
            </button>
            <button type="button" className="text-xs underline" style={hint} onClick={() => setDeclining(false)}>Back</button>
          </div>
        </div>
      )}
    </div>
  );
}
