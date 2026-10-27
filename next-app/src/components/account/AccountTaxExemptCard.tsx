'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { prepareLeadPhotos } from '@/lib/lead-photo-prep';
import { STORE_TEXT_HREF, STORE_TEXT_NUMBER, TAX_CERT_MAX_BYTES, TAX_EXEMPT_TEXT_US_MINUTES } from '@/lib/tax-exempt';

type SavedView = { businessName: string | null; typeLabel: string; masked: string; validThrough: string | null; approvedOn: string | null };
type RequestView = {
  token: string;
  status: 'pending' | 'declined';
  ref: string | null;
  businessName: string | null;
  tag: string;
  submittedAt: string | null;
  declineReason: string | null;
  storeOpen: boolean | null;
  opensLabel: string | null;
};
type ReadView = { businessName: string | null; typeLabel: string | null; certNumber: string | null; validThrough: string | null };

export type AccountTaxExempt = {
  certificate: SavedView | null;
  expired: SavedView | null;
  request: RequestView | null;
  /** The phone on the profile, to prefill "Mobile number". */
  defaultPhone: string | null;
  /** Arrived from the homepage link (`?taxExempt=start`): open the upload at once. */
  startOpen: boolean;
};

type Phase = 'idle' | 'open' | 'reading' | 'rejected' | 'read' | 'sending';

const GREEN = '#16653c';

/**
 * My Account → "Tax-exempt status".
 *
 * 2026-10-27 (owner): "allow customers to save tax ID status in their account
 * for future purchases and make sure they can see that in their account" —
 * shows the saved Florida certificate (never the full number or the photo)
 * and lets the customer remove it.
 *
 * Mockup v3 (owner, same day: "upload and get their tax ID cert verified
 * directly from their account (before going through checkout)"): Verify my
 * certificate → Take photo / Upload → the AI reads it (the same read and the
 * same automatic refusals as checkout) → mobile number + certify → Send for
 * verification → the owner gets a text "for their account, no order yet" →
 * this card waits (checking every few seconds) and turns Approved. Also
 * "Replace with a new certificate" and "Expired: upload your new one".
 *
 * ⛔ Nothing here makes anything tax-free by itself: the owner approves every
 * certificate, and checkout decides on the server.
 */
export default function AccountTaxExemptCard({ locale, initial }: { locale: string; initial: AccountTaxExempt }) {
  const isEs = locale === 'es';
  const [certificate, setCertificate] = useState(initial.certificate);
  const [expired, setExpired] = useState(initial.expired);
  const [request, setRequest] = useState(initial.request);
  // The homepage link opens the upload only when there is nothing to show yet
  // (an approved or waiting certificate is shown instead).
  const [phase, setPhase] = useState<Phase>(
    initial.startOpen && !initial.certificate && initial.request?.status !== 'pending' ? 'open' : 'idle',
  );
  const [token, setToken] = useState<string | null>(null);
  const [read, setRead] = useState<ReadView | null>(null);
  const [phone, setPhone] = useState(initial.defaultPhone ?? '');
  const [certify, setCertify] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const cardRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // The homepage link lands here: bring the card into view, and drop the
  // parameter so a reload does not reopen the upload.
  useEffect(() => {
    if (!initial.startOpen) return;
    cardRef.current?.scrollIntoView({ block: 'center' });
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('taxExempt');
      window.history.replaceState(window.history.state, '', url.toString());
    } catch {
      /* the parameter simply stays */
    }
  }, [initial.startOpen]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/tax-exempt/saved?locale=${locale}`, { cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.signedIn) return;
      setCertificate(data.certificate ?? null);
      setExpired(data.expired ?? null);
      setRequest(data.request ?? null);
    } catch {
      /* try again on the next tick */
    }
  }, [locale]);

  // Waiting: check every 5 s for 15 minutes, then every 15 s.
  const waiting = request?.status === 'pending';
  useEffect(() => {
    if (!waiting) return;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      setNow(Date.now());
      await refresh();
      timer = setTimeout(tick, Date.now() - started > 15 * 60_000 ? 15_000 : 5_000);
    };
    timer = setTimeout(tick, 5_000);
    return () => clearTimeout(timer);
  }, [waiting, refresh]);

  async function upload(file: File) {
    setMessage(null);
    let body: Blob = file;
    if (file.type !== 'application/pdf') {
      try {
        body = (await prepareLeadPhotos([file])).files[0] ?? file;
      } catch {
        body = file;
      }
    }
    if (body.size > TAX_CERT_MAX_BYTES) {
      setMessage(isEs ? 'El archivo es muy grande (máximo 5 MB). Tome una foto en su lugar.' : 'That file is too large (5 MB at most). Take a photo instead.');
      return;
    }
    const replacing = phase === 'read' ? token : null;
    setPhase('reading');
    const form = new FormData();
    form.set('certificate', body, file.name || 'certificate');
    form.set('locale', locale);
    if (replacing) form.set('replaceToken', replacing);
    try {
      const res = await fetch('/api/tax-exempt/read', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error ?? (isEs ? 'No pudimos leer el certificado.' : "We couldn't read the certificate."));
        setPhase(res.status === 422 ? 'rejected' : 'open');
        return;
      }
      setToken(data.token);
      setRead(data.read);
      setCertify(false);
      setPhase('read');
    } catch {
      setMessage(isEs ? 'Se perdió la conexión. Intente de nuevo.' : 'The connection dropped. Please try again.');
      setPhase('open');
    }
  }

  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void upload(file);
  }

  async function send() {
    if (!token) return;
    setMessage(null);
    if (!phone.trim()) {
      setMessage(isEs ? 'Escriba su número de celular.' : 'Enter your mobile number.');
      return;
    }
    if (!certify) {
      setMessage(isEs ? 'Marque la casilla de certificación.' : 'Tick the box to certify.');
      return;
    }
    setPhase('sending');
    try {
      const res = await fetch('/api/tax-exempt/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, certify: true, phone, locale }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.request) {
        setMessage(data.error ?? (isEs ? 'No se pudo enviar.' : 'Could not send it.'));
        setPhase('read');
        return;
      }
      setRequest(data.request);
      setToken(null);
      setRead(null);
      setNow(Date.now());
      setPhase('idle');
    } catch {
      setMessage(isEs ? 'Se perdió la conexión. Intente de nuevo.' : 'The connection dropped. Please try again.');
      setPhase('read');
    }
  }

  /** Close the upload; a draft that was read but never sent is thrown away. */
  async function closeUpload() {
    const t = token;
    setPhase('idle');
    setToken(null);
    setRead(null);
    setMessage(null);
    if (t) await fetch('/api/tax-exempt/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t }) }).catch(() => undefined);
  }

  async function cancelRequest() {
    if (!request) return;
    setBusy(true);
    await fetch('/api/tax-exempt/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: request.token }) }).catch(() => undefined);
    setRequest(null);
    setBusy(false);
    void refresh();
  }

  async function remove() {
    if (!window.confirm(isEs ? '¿Quitar el certificado de su cuenta? Ya no se aplicará al pagar.' : 'Remove the certificate from your account? It will no longer be applied at checkout.')) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/tax-exempt/saved', { method: 'DELETE' });
      if (!res.ok) { setMessage(isEs ? 'No se pudo quitar. Intente de nuevo.' : 'Could not remove it. Please try again.'); return; }
      setCertificate(null);
      setExpired(null);
    } catch {
      setMessage(isEs ? 'Se perdió la conexión.' : 'The connection dropped.');
    } finally {
      setBusy(false);
    }
  }

  const hint = { color: 'var(--color-on-surface-variant)' } as const;
  const link = 'text-xs underline justify-self-start';
  const startButton = (label: string) => (
    <button type="button" className="gold-button text-xs justify-self-start" onClick={() => { setMessage(null); setPhase('open'); }}>{label}</button>
  );
  const textUs = (
    <a href={STORE_TEXT_HREF} className="font-bold underline underline-offset-2" style={{ color: 'var(--color-primary)', whiteSpace: 'nowrap' }}>{STORE_TEXT_NUMBER}</a>
  );
  const errorLine = message ? <p role="alert" style={{ color: 'var(--color-error)' }}>{message}</p> : null;

  let body: React.ReactNode;
  if (phase === 'open' || phase === 'reading' || phase === 'rejected') {
    body = (
      <>
        {phase === 'rejected' && message ? (
          <div role="alert" className="grid gap-1 text-sm" style={{ border: '1px solid #e6b4b4', background: '#fdf4f4', borderRadius: 14, padding: '0.8rem 0.9rem', color: 'var(--color-error)' }}>
            {message}
            <span className="text-xs" style={hint}>{isEs ? 'No se guardó nada y no se envió nada.' : 'Nothing was saved or sent.'}</span>
          </div>
        ) : (
          <p>{isEs ? 'Una foto del certificado completo, plano y con buena luz. Nosotros lo leemos: no hay nada que escribir.' : "One photo of the whole certificate, flat and in good light. We read it for you, so there's nothing to type."}</p>
        )}
        {phase === 'reading' ? (
          <span className="flex items-center gap-2 text-sm" role="status">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2" style={{ borderColor: '#e2d9f7', borderTopColor: '#5a3fa0' }} aria-hidden="true" />
            {isEs ? 'Leyendo su certificado…' : 'Reading your certificate…'}
          </span>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="gold-button text-xs" onClick={() => photoRef.current?.click()}>{isEs ? 'Tomar foto' : 'Take photo'}</button>
            <button type="button" className="outline-button text-xs" onClick={() => fileRef.current?.click()}>{isEs ? 'Subir foto / PDF' : 'Upload photo / PDF'}</button>
          </div>
        )}
        {phase !== 'rejected' && errorLine}
        <span className="text-xs" style={hint}>
          {isEs
            ? 'Solo certificados emitidos por Florida. Máximo 5 MB. Se guarda en privado y solo se usa para sus compras y nuestros registros. '
            : 'Florida-issued certificates only. 5 MB at most. Kept private and used only for your purchases and our records. '}
          <button type="button" className="underline" onClick={() => void closeUpload()}>{isEs ? 'Cancelar' : 'Cancel'}</button>
        </span>
      </>
    );
  } else if (phase === 'read' || phase === 'sending') {
    body = (
      <>
        {read ? (
          <>
            <p><strong>{isEs ? '¿Es correcto?' : 'Is this right?'}</strong></p>
            <div className="grid gap-0.5 rounded-xl border bg-white p-3 text-sm" style={{ borderColor: 'var(--color-outline-variant)' }}>
              <strong>{read.businessName ?? (isEs ? 'Nombre no legible' : 'Name not readable')}</strong>
              {read.typeLabel && <span>{read.typeLabel}</span>}
              <span>{[read.certNumber, read.validThrough ? `${isEs ? 'válido hasta' : 'valid through'} ${read.validThrough}` : null].filter(Boolean).join(' · ')}</span>
            </div>
            <span className="text-sm" style={{ color: GREEN }}>✓ {isEs ? 'Certificado de Florida' : 'Florida certificate'}{read.validThrough ? ` · ✓ ${isEs ? 'Vigente' : 'Still valid'}` : ''}</span>
          </>
        ) : (
          // Past the daily AI limit: received unread, the owner reads it.
          <p><strong>{isEs ? 'Certificado recibido.' : 'Certificate received.'}</strong> {isEs ? 'Lo leeremos nosotros al revisarlo. Florida solo acepta certificados emitidos por Florida.' : "We'll read it ourselves when we review it. Florida accepts only Florida-issued certificates."}</p>
        )}
        <span className="text-xs" style={hint}>
          {isEs ? '¿No es correcto? ' : 'Not right? '}
          <button type="button" className="underline" onClick={() => fileRef.current?.click()} disabled={phase === 'sending'}>{isEs ? 'Subir otro' : 'Retake or upload another'}</button>
        </span>
        <label className="grid gap-1">
          <span className="form-label">{isEs ? 'Número de celular' : 'Mobile number'}</span>
          <input className="form-field" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(239) 555-0134" />
          <span className="text-xs" style={hint}>{isEs ? 'Para enviarle un texto si tenemos una pregunta.' : 'So we can text you if we have a question.'}</span>
        </label>
        <label className="flex items-start gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={certify} onChange={(e) => setCertify(e.target.checked)} className="mt-0.5 h-4 w-4" style={{ accentColor: 'var(--color-primary)' }} />
          <span>{isEs
            ? 'Certifico que lo que compre sin impuesto con este certificado es para reventa, o para la organización exenta nombrada en él.'
            : 'I certify that what I buy tax-exempt with this certificate is for resale, or for the exempt organization named on it.'}</span>
        </label>
        <span className="text-xs" style={hint}>{isEs ? 'Se guardará en su cuenta. Puede quitarlo aquí cuando quiera.' : 'It will be saved to your account. You can remove it here anytime.'}</span>
        {errorLine}
        <button type="button" className="gold-button text-xs" onClick={() => void send()} disabled={phase === 'sending'}>
          {phase === 'sending' ? (isEs ? 'Enviando…' : 'Sending…') : (isEs ? 'Enviar para verificación' : 'Send for verification')}
        </button>
        <button type="button" className={link} style={hint} onClick={() => void closeUpload()} disabled={phase === 'sending'}>{isEs ? 'Cancelar' : 'Cancel'}</button>
      </>
    );
  } else if (request?.status === 'pending' && !certificate) {
    const waited = request.submittedAt ? (now - new Date(request.submittedAt).getTime()) / 60_000 : 0;
    const late = waited >= TAX_EXEMPT_TEXT_US_MINUTES;
    const textLine = (
      <div className="text-sm" style={{ borderLeft: '3px solid #d4af37', background: late ? '#fff3cf' : '#fbf7e8', padding: '0.6rem 0.75rem', borderRadius: 10 }}>
        {isEs ? `¿No se aprobó en ${TAX_EXEMPT_TEXT_US_MINUTES} minutos? Envíenos un mensaje de texto al ` : `Not approved within ${TAX_EXEMPT_TEXT_US_MINUTES} minutes? Text us at `}
        {textUs}
        {request.ref ? <>{isEs ? ' y mencione la solicitud ' : ' and mention request '}<strong>{request.ref}</strong></> : null}.
      </div>
    );
    body = (
      <>
        {late && textLine}
        <div className="flex items-start gap-3" role="status">
          <span className="mt-1 inline-block h-5 w-5 flex-shrink-0 animate-spin rounded-full border-[3px]" style={{ borderColor: '#f1e4b3', borderTopColor: '#b5890c' }} aria-hidden="true" />
          <div className="grid gap-1">
            <strong style={{ color: '#7a5600' }}>{isEs ? 'Esperando verificación' : 'Waiting for verification'}</strong>
            <span className="text-sm">{[request.ref, request.businessName, request.tag].filter(Boolean).join(' · ')}</span>
          </div>
        </div>
        <p>
          {request.storeOpen === false
            ? (isEs
              ? `Ahora estamos cerrados. Lo verificaremos cuando abramos${request.opensLabel ? ` (${request.opensLabel})` : ''} y le enviaremos un correo.`
              : `We're closed right now. We'll verify it when we open${request.opensLabel ? ` at ${request.opensLabel}` : ''} and email you.`)
            : (isEs
              ? 'La aprobación normalmente toma solo unos minutos. No necesita quedarse aquí: le enviaremos un correo cuando esté aprobado y se verá en esta tarjeta.'
              : "Approval usually takes just a few minutes. You don't need to stay here: we'll email you when it's approved, and it will show on this card.")}
        </p>
        {!late && textLine}
        <button type="button" className={link} style={hint} onClick={() => void cancelRequest()} disabled={busy}>{isEs ? 'Cancelar solicitud' : 'Cancel request'}</button>
      </>
    );
  } else if (certificate) {
    body = (
      <>
        <p>
          <strong style={{ color: GREEN }}>{isEs ? 'Aprobado · ' : 'Approved · '}</strong>
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
        {request?.status === 'pending' && (
          <p className="text-xs" role="status">
            {isEs
              ? `Su nuevo certificado (${request.ref ?? ''}) está esperando aprobación. El actual sigue aplicándose hasta entonces.`
              : `Your new certificate (${request.ref ?? ''}) is waiting for approval. This one keeps working until then.`}{' '}
            <button type="button" className="underline" onClick={() => void cancelRequest()} disabled={busy}>{isEs ? 'Cancelar' : 'Cancel'}</button>
          </p>
        )}
        {request?.status === 'declined' && (
          <p className="text-xs" role="alert" style={{ color: 'var(--color-error)' }}>
            {isEs ? 'No pudimos aprobar su nuevo certificado' : "We couldn't approve your new certificate"}{request.declineReason ? `: "${request.declineReason}"` : '.'}
          </p>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {request?.status !== 'pending' && (
            <button type="button" className="text-xs underline" style={{ color: 'var(--color-primary)' }} onClick={() => { setMessage(null); setPhase('open'); }}>
              {isEs ? 'Reemplazar con un certificado nuevo' : 'Replace with a new certificate'}
            </button>
          )}
          <button type="button" className="text-xs underline" style={hint} onClick={() => void remove()} disabled={busy}>
            {busy ? (isEs ? 'Quitando…' : 'Removing…') : (isEs ? 'Quitar de mi cuenta' : 'Remove from my account')}
          </button>
        </div>
        {errorLine}
      </>
    );
  } else {
    body = (
      <>
        {request?.status === 'declined' && (
          <div role="alert" className="grid gap-1 text-sm" style={{ border: '1px solid #e6b4b4', background: '#fdf4f4', borderRadius: 14, padding: '0.8rem 0.9rem' }}>
            <span><strong style={{ color: 'var(--color-error)' }}>{isEs ? 'No aprobado' : 'Not approved'}</strong>{request.declineReason ? `: "${request.declineReason}"` : '.'}</span>
            <span className="text-xs" style={hint}>{isEs ? '¿Preguntas? Envíenos un texto al ' : 'Questions? Text us at '}{textUs}.</span>
          </div>
        )}
        {expired && request?.status !== 'declined' ? (
          <p>
            <strong style={{ color: 'var(--color-error)' }}>{isEs ? 'Vencido' : 'Expired'}{expired.validThrough ? ` ${expired.validThrough}` : ''}: </strong>
            {isEs
              ? `suba su certificado nuevo${expired.businessName ? ` de ${expired.businessName}` : ''} para seguir comprando sin impuesto.`
              : `upload your new certificate${expired.businessName ? ` for ${expired.businessName}` : ''} to keep buying tax-exempt.`}
          </p>
        ) : request?.status !== 'declined' ? (
          <p>
            {isEs
              ? '¿Compra para reventa o para una organización exenta? Verifique su certificado de Florida ahora. Cuando lo aprobemos, el impuesto de Florida se quita solo cada vez que pague con su sesión iniciada.'
              : 'Buying for resale or for an exempt organization? Get your Florida certificate verified now. Once we approve it, Florida sales tax comes off automatically whenever you check out signed in.'}
          </p>
        ) : null}
        {startButton(request?.status === 'declined'
          ? (isEs ? 'Enviar otro certificado' : 'Send another certificate')
          : (isEs ? 'Verificar mi certificado' : 'Verify my certificate'))}
        <span className="text-xs" style={hint}>
          {isEs
            ? 'Solo certificados emitidos por Florida (Reventa anual DR-13 o Exención del consumidor DR-14). Normalmente se aprueba en pocos minutos en horario de tienda.'
            : "Florida-issued certificates only (Annual Resale DR-13 or Consumer's Certificate of Exemption DR-14). Usually approved within a few minutes during store hours."}
        </span>
      </>
    );
  }

  return (
    <div ref={cardRef} id="tax-exempt" className="account-card account-side-card" style={{ scrollMarginTop: '7rem' }}>
      <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
      <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onFile} />
      <h2>{isEs ? 'Exención de impuestos' : 'Tax-exempt status'}</h2>
      {/* One piece per line (owner, 2026-10-27: the button sat beside its note). */}
      <div className="tax-exempt-body grid gap-3">{body}</div>
    </div>
  );
}
