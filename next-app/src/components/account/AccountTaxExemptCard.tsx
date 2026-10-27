'use client';

import { useState } from 'react';
import Link from 'next/link';

export type AccountTaxExempt = {
  certificate: { businessName: string | null; typeLabel: string; masked: string; validThrough: string | null; approvedOn: string | null } | null;
  /** A request saved to this account that is still waiting for the store's approval. */
  pending: boolean;
};

/**
 * My Account → "Tax-exempt status" (owner, 2026-10-27: "allow customers to
 * save tax ID status in their account for future purchases and make sure they
 * can see that in their account"). Shows the saved Florida certificate (never
 * the full number or the photo) and lets the customer remove it from their
 * account. The store keeps its own record either way.
 */
export default function AccountTaxExemptCard({ locale, initial }: { locale: string; initial: AccountTaxExempt }) {
  const isEs = locale === 'es';
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm(isEs ? '¿Quitar el certificado de su cuenta? Ya no se aplicará al pagar.' : 'Remove the certificate from your account? It will no longer be applied at checkout.')) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/tax-exempt/saved', { method: 'DELETE' });
      if (!res.ok) { setError(isEs ? 'No se pudo quitar. Intente de nuevo.' : 'Could not remove it. Please try again.'); return; }
      setState({ certificate: null, pending: false });
    } catch {
      setError(isEs ? 'Se perdió la conexión.' : 'The connection dropped.');
    } finally {
      setBusy(false);
    }
  }

  const { certificate } = state;
  return (
    <div className="account-card account-side-card">
      <h2>{isEs ? 'Exención de impuestos' : 'Tax-exempt status'}</h2>
      {certificate ? (
        <>
          <p>
            <strong style={{ color: '#16653c' }}>{isEs ? 'Aprobado · ' : 'Approved · '}</strong>
            {isEs ? 'se aplica solo al pagar mientras esté vigente.' : 'applied automatically at checkout while it is valid.'}
          </p>
          <div className="account-detail-grid">
            <div>
              <span>{isEs ? 'Empresa' : 'Business'}</span>
              <strong>{certificate.businessName ?? '—'}</strong>
            </div>
            <div>
              <span>{isEs ? 'Certificado' : 'Certificate'}</span>
              <strong>{`Florida ${certificate.typeLabel} ${certificate.masked}`.trim()}</strong>
            </div>
            <div>
              <span>{isEs ? 'Válido hasta' : 'Valid through'}</span>
              <strong>{certificate.validThrough ?? '—'}</strong>
            </div>
          </div>
          <button type="button" className="text-xs underline" style={{ color: 'var(--color-on-surface-variant)' }} onClick={() => void remove()} disabled={busy}>
            {busy ? (isEs ? 'Quitando…' : 'Removing…') : (isEs ? 'Quitar de mi cuenta' : 'Remove from my account')}
          </button>
          {error && <p role="alert" style={{ color: 'var(--color-error)' }}>{error}</p>}
        </>
      ) : state.pending ? (
        <p>
          {isEs
            ? 'Su certificado de Florida está esperando nuestra aprobación. Se guardará aquí cuando lo aprobemos.'
            : 'Your Florida certificate is waiting for our approval. It will be saved here once we approve it.'}
        </p>
      ) : (
        <p>
          {isEs
            ? '¿Compra para reventa o para una organización exenta? Al pagar, suba su certificado de Florida y marque “Guardar en mi cuenta”. Después de aprobarlo, se aplica solo en sus próximas compras.'
            : 'Buying for resale or for an exempt organization? At checkout, upload your Florida certificate and tick “Save to my account”. Once we approve it, it is applied automatically on future purchases.'}{' '}
          <Link href={isEs ? '/es/shop' : '/shop'} className="underline">{isEs ? 'Ver tienda' : 'Browse the shop'}</Link>
        </p>
      )}
    </div>
  );
}
