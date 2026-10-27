'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { prepareLeadPhotos } from '@/lib/lead-photo-prep';
import { STORE_TEXT_HREF, STORE_TEXT_NUMBER, TAX_CERT_MAX_BYTES, TAX_EXEMPT_TEXT_US_MINUTES } from '@/lib/tax-exempt';

/**
 * Checkout → buy tax-exempt with a Florida certificate, in the same cart
 * (owner, mockup v2 2026-10-27: "complete the sale at the same sitting… in the
 * same flow / cart, without having to re-do it all").
 *
 * Steps: link under the totals → Take photo / Upload → the AI reads it and the
 * buyer sees what was read (nothing to type) → "I certify…" + Send for
 * approval → waiting (the owner got a text; this polls every few seconds) →
 * approved: the parent re-quotes with the token and the tax line reads
 * "exempt". A signed-in buyer with a saved certificate skips all of it.
 *
 * ⛔ Nothing here changes a price. It only hands the parent a token (or "use my
 * saved certificate"); the quote and create-order routes decide on the server.
 */

export type CheckoutExemptionChoice = { token?: string; useSaved?: boolean } | null;

type SavedView = { id: string; businessName: string | null; typeLabel: string; masked: string; validThrough: string | null };
type ReadView = { businessName: string | null; typeLabel: string | null; certNumber: string | null; validThrough: string | null };
type Phase = 'idle' | 'open' | 'reading' | 'read' | 'sending' | 'pending' | 'approved' | 'declined' | 'rejected';

const STORAGE_KEY = 'nej-tax-exempt-token';
const GREEN = '#16653c';

function remember(token: string | null) {
  try {
    if (token) window.localStorage.setItem(STORAGE_KEY, token);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private window: the token lives in memory only */
  }
}

function recalled(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export default function CheckoutTaxExempt({
  isEs,
  locale,
  taxApplies,
  customer,
  cart,
  onChange,
}: {
  isEs: boolean;
  locale: string;
  /** Florida tax applies to this cart as it stands (pickup or a Florida address). */
  taxApplies: boolean;
  customer: { name: string; email: string; phone: string };
  cart: { items: { id: string; quantity: number }[]; shippingMethod: string; shippingState: string; discountCode: string | null };
  /** The exemption to send with the quote and the order, and whether payment should wait. */
  onChange: (choice: CheckoutExemptionChoice, busy: boolean) => void;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [token, setToken] = useState<string | null>(null);
  const [read, setRead] = useState<ReadView | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [certify, setCertify] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [saveToAccount, setSaveToAccount] = useState(true);
  const [saved, setSaved] = useState<SavedView | null>(null);
  const [useSaved, setUseSaved] = useState(true);
  const [status, setStatus] = useState<{ ref: string | null; email: string | null; tag: string; businessName: string | null; submittedAt: string | null; storeOpen: boolean | null; opensLabel: string | null; declineReason: string | null }>({
    ref: null, email: null, tag: '', businessName: null, submittedAt: null, storeOpen: null, opensLabel: null, declineReason: null,
  });
  const [now, setNow] = useState(() => Date.now());
  const photoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Tell the parent what applies. Busy = payment waits while a certificate is being handled.
  useEffect(() => {
    const busy = phase === 'reading' || phase === 'read' || phase === 'sending' || phase === 'pending';
    if (phase === 'approved' && token) onChange({ token }, false);
    else if (saved && useSaved && phase === 'idle') onChange({ useSaved: true }, false);
    else onChange(null, busy);
  }, [phase, token, saved, useSaved, onChange]);

  const applyStatus = useCallback((data: Record<string, unknown>) => {
    setStatus({
      ref: (data.ref as string) ?? null,
      email: (data.email as string) ?? null,
      tag: (data.tag as string) ?? '',
      businessName: (data.businessName as string) ?? null,
      submittedAt: (data.submittedAt as string) ?? null,
      storeOpen: typeof data.storeOpen === 'boolean' ? data.storeOpen : null,
      opensLabel: (data.opensLabel as string) ?? null,
      declineReason: (data.declineReason as string) ?? null,
    });
    const next = data.status;
    if (next === 'pending') setPhase('pending');
    else if (next === 'approved') setPhase('approved');
    else if (next === 'declined') setPhase('declined');
    else return false;
    return true;
  }, []);

  const fetchStatus = useCallback(async (t: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/tax-exempt/status?token=${encodeURIComponent(t)}&locale=${locale}`, { cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) return false;
      return applyStatus(data);
    } catch {
      return false;
    }
  }, [applyStatus, locale]);

  // On arrival: the approval email's link (?taxExempt=…), a request this
  // browser already sent, and the signed-in buyer's saved certificate.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fromUrl = new URLSearchParams(window.location.search).get('taxExempt');
      const candidate = fromUrl || recalled();
      if (candidate) {
        const live = await fetchStatus(candidate);
        if (cancelled) return;
        if (live) {
          setToken(candidate);
          remember(candidate);
        } else {
          remember(null);
        }
      }
      try {
        const res = await fetch('/api/tax-exempt/saved', { cache: 'no-store' });
        const data = await res.json().catch(() => null);
        if (cancelled || !data) return;
        setSignedIn(Boolean(data.signedIn));
        setSaved(data.certificate ?? null);
      } catch {
        /* no saved certificate */
      }
    })();
    return () => { cancelled = true; };
  }, [fetchStatus]);

  // Waiting: check every 5 s for 15 minutes, then every 15 s.
  useEffect(() => {
    if (phase !== 'pending' || !token) return;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      setNow(Date.now());
      await fetchStatus(token);
      timer = setTimeout(tick, Date.now() - started > 15 * 60_000 ? 15_000 : 5_000);
    };
    timer = setTimeout(tick, 5_000);
    return () => clearTimeout(timer);
  }, [phase, token, fetchStatus]);

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
    setPhase('reading');
    const form = new FormData();
    form.set('certificate', body, file.name || 'certificate');
    form.set('locale', locale);
    if (token && phase === 'read') form.set('replaceToken', token);
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
    if (!customer.name.trim() || !customer.email.trim() || !customer.phone.trim()) {
      setMessage(isEs ? 'Primero complete su nombre, correo y teléfono arriba.' : 'Fill in your name, email and phone above first.');
      return;
    }
    if (!certify) {
      setMessage(isEs ? 'Marque la casilla de certificación.' : 'Tick the box to certify the purchase.');
      return;
    }
    setPhase('sending');
    try {
      const res = await fetch('/api/tax-exempt/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, certify: true, saveToAccount: signedIn && saveToAccount, customer, cart, locale }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error ?? (isEs ? 'No se pudo enviar.' : 'Could not send it.'));
        setPhase('read');
        return;
      }
      remember(token);
      setNow(Date.now());
      applyStatus({ ...data, email: customer.email.trim().toLowerCase(), tag: '', businessName: read?.businessName ?? null });
    } catch {
      setMessage(isEs ? 'Se perdió la conexión. Intente de nuevo.' : 'The connection dropped. Please try again.');
      setPhase('read');
    }
  }

  async function cancel() {
    const t = token;
    setPhase('idle');
    setToken(null);
    setRead(null);
    setMessage(null);
    remember(null);
    if (t) await fetch('/api/tax-exempt/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t }) }).catch(() => undefined);
  }

  const panel = (tone: 'gold' | 'ok' | 'bad', children: React.ReactNode, role?: string) => (
    <div
      role={role}
      className="grid gap-3 text-sm"
      style={{
        padding: '0.9rem',
        borderRadius: 'var(--radius-lg, 14px)',
        border: `1px solid ${tone === 'ok' ? '#9fd1b2' : tone === 'bad' ? '#e6b4b4' : '#e9c349'}`,
        background: tone === 'ok' ? '#f1f9f4' : tone === 'bad' ? '#fdf4f4' : '#fffcf0',
        color: 'var(--color-on-surface)',
      }}
    >
      {children}
    </div>
  );
  const hint = { color: 'var(--color-on-surface-variant)' } as const;
  const smallButton = 'outline-button text-xs';
  const inputs = (
    <>
      <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
      <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onFile} />
    </>
  );
  const textUs = (
    <a href={STORE_TEXT_HREF} className="font-bold underline underline-offset-2" style={{ color: 'var(--color-primary)', whiteSpace: 'nowrap' }}>{STORE_TEXT_NUMBER}</a>
  );
  const emailMismatch = status.email && customer.email.trim() && status.email !== customer.email.trim().toLowerCase();

  // A saved certificate (signed in) — applied unless the buyer opts out this time.
  if (saved && phase === 'idle') {
    if (!taxApplies) return null;
    return panel(useSaved ? 'ok' : 'gold', (
      <>
        <span>
          <strong>{isEs ? 'Su certificado de Florida está registrado.' : 'Your Florida certificate is on file.'}</strong>{' '}
          {[saved.businessName, `${saved.typeLabel} ${saved.masked}`.trim(), saved.validThrough ? `${isEs ? 'válido hasta' : 'valid through'} ${saved.validThrough}` : null].filter(Boolean).join(' · ')}
        </span>
        <button type="button" className="text-xs underline justify-self-start" style={hint} onClick={() => setUseSaved(!useSaved)}>
          {useSaved
            ? (isEs ? '¿No compra para reventa esta vez? Pagar con impuesto' : 'Not buying for resale this time? Pay with tax')
            : (isEs ? 'Usar mi certificado registrado' : 'Use my certificate on file')}
        </button>
      </>
    ));
  }

  if (phase === 'idle') {
    if (!taxApplies) return null;
    return (
      <div className="text-xs leading-relaxed" style={hint}>
        {isEs ? '¿Compra para reventa o para una organización exenta? ' : 'Buying for resale or for an exempt organization? '}
        <button type="button" className="font-bold underline underline-offset-2" style={{ color: 'var(--color-primary)' }} onClick={() => setPhase('open')}>
          {isEs ? 'Use su certificado de Florida →' : 'Use your Florida certificate →'}
        </button>
      </div>
    );
  }

  if (phase === 'open' || phase === 'rejected' || phase === 'reading') {
    return panel(phase === 'rejected' ? 'bad' : 'gold', (
      <>
        {inputs}
        <strong style={{ fontFamily: 'var(--font-headline)', fontSize: '1rem' }}>{isEs ? 'Comprar sin impuesto' : 'Buy tax-exempt'}</strong>
        {phase === 'rejected' && message ? (
          <span role="alert" style={{ color: 'var(--color-error)' }}>{message}</span>
        ) : (
          <span style={hint}>
            {isEs
              ? 'Suba su Certificado anual de reventa o Certificado de exención del consumidor de Florida. Lo leemos, lo aprobamos (normalmente en pocos minutos) y su total se actualiza aquí.'
              : "Upload your Florida Annual Resale Certificate or Consumer's Certificate of Exemption. We read it, approve it (usually within a few minutes), and your total updates right here."}
          </span>
        )}
        {phase === 'reading' ? (
          <span className="flex items-center gap-2" role="status">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2" style={{ borderColor: '#e2d9f7', borderTopColor: '#5a3fa0' }} aria-hidden="true" />
            {isEs ? 'Leyendo su certificado…' : 'Reading your certificate…'}
          </span>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="gold-button text-xs" onClick={() => photoRef.current?.click()}>{isEs ? 'Tomar foto' : 'Take photo'}</button>
            <button type="button" className={smallButton} onClick={() => fileRef.current?.click()}>{isEs ? 'Subir foto / PDF' : 'Upload photo / PDF'}</button>
          </div>
        )}
        {phase !== 'rejected' && message && <span role="alert" style={{ color: 'var(--color-error)' }}>{message}</span>}
        <span className="text-xs" style={hint}>
          {isEs
            ? 'Florida solo acepta certificados emitidos por Florida. Se guarda en privado y solo se usa para su compra y nuestros registros. '
            : 'Florida accepts only Florida-issued certificates. Kept private, used only for your purchase and our records. '}
          <button type="button" className="underline" onClick={() => void cancel()}>{isEs ? 'Cancelar' : 'Cancel'}</button>
        </span>
      </>
    ));
  }

  if (phase === 'read' || phase === 'sending') {
    return panel('gold', (
      <>
        {inputs}
        <strong style={{ fontFamily: 'var(--font-headline)', fontSize: '1rem' }}>{isEs ? 'Leímos su certificado' : 'We read your certificate'}</strong>
        <div className="grid gap-0.5 rounded-xl border bg-white p-3" style={{ borderColor: 'var(--color-outline-variant)' }}>
          <strong>{read?.businessName ?? (isEs ? 'Nombre no legible' : 'Name not readable')}</strong>
          {read?.typeLabel && <span>{read.typeLabel}</span>}
          <span>{[read?.certNumber, read?.validThrough ? `${isEs ? 'válido hasta' : 'valid through'} ${read.validThrough}` : null].filter(Boolean).join(' · ')}</span>
        </div>
        <span style={{ color: GREEN }}>✓ {isEs ? 'Certificado de Florida' : 'Florida certificate'}{read?.validThrough ? ` · ✓ ${isEs ? 'Vigente' : 'Still valid'}` : ''}</span>
        <span className="text-xs" style={hint}>
          {isEs ? '¿No es correcto? ' : 'Not right? '}
          <button type="button" className="underline" onClick={() => fileRef.current?.click()} disabled={phase === 'sending'}>{isEs ? 'Subir otro' : 'Retake or upload another'}</button>
        </span>
        <label className="flex items-start gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={certify} onChange={(e) => setCertify(e.target.checked)} className="mt-0.5 h-4 w-4" style={{ accentColor: 'var(--color-primary)' }} />
          <span>{isEs ? 'Certifico que esta compra es para reventa, o para la organización exenta nombrada en el certificado.' : 'I certify this purchase is for resale, or for the exempt organization named on the certificate.'}</span>
        </label>
        {signedIn ? (
          <label className="flex items-start gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={saveToAccount} onChange={(e) => setSaveToAccount(e.target.checked)} className="mt-0.5 h-4 w-4" style={{ accentColor: 'var(--color-primary)' }} />
            <span>{isEs
              ? 'Guardar este certificado en mi cuenta para futuras compras sin impuesto. Puede quitarlo cuando quiera en Mi Cuenta.'
              : 'Save this certificate to my account for future tax-exempt purchases. You can remove it anytime in My Account.'}</span>
          </label>
        ) : (
          <span className="text-xs" style={hint}>
            {isEs
              ? '¿Tiene cuenta? Inicie sesión antes de enviarlo y podrá guardarlo para la próxima vez.'
              : 'Have an account? Sign in before sending and you can save it for next time.'}
          </span>
        )}
        {message && <span role="alert" style={{ color: 'var(--color-error)' }}>{message}</span>}
        <button type="button" className="gold-button text-xs" onClick={() => void send()} disabled={phase === 'sending'}>
          {phase === 'sending' ? (isEs ? 'Enviando…' : 'Sending…') : (isEs ? 'Enviar para aprobación' : 'Send for approval')}
        </button>
        <button type="button" className="text-xs underline justify-self-start" style={hint} onClick={() => void cancel()}>{isEs ? 'Cancelar y pagar con impuesto' : 'Cancel and pay with tax'}</button>
      </>
    ));
  }

  if (phase === 'pending') {
    const waited = status.submittedAt ? (now - new Date(status.submittedAt).getTime()) / 60_000 : 0;
    const late = waited >= TAX_EXEMPT_TEXT_US_MINUTES;
    const textLine = (
      <div className="text-sm" style={{ borderLeft: '3px solid #d4af37', background: late ? '#fff3cf' : '#fbf7e8', padding: '0.6rem 0.75rem', borderRadius: 10 }}>
        {isEs ? `¿No se aprobó en ${TAX_EXEMPT_TEXT_US_MINUTES} minutos? Envíenos un mensaje de texto al ` : `Not approved within ${TAX_EXEMPT_TEXT_US_MINUTES} minutes? Text us at `}
        {textUs}
        {status.ref ? <>{isEs ? ' y mencione la solicitud ' : ' and mention request '}<strong>{status.ref}</strong></> : null}.
      </div>
    );
    return panel('gold', (
      <>
        {late && textLine}
        <div className="flex items-start gap-3" role="status">
          <span className="mt-1 inline-block h-5 w-5 flex-shrink-0 animate-spin rounded-full border-[3px]" style={{ borderColor: '#f1e4b3', borderTopColor: '#b5890c' }} aria-hidden="true" />
          <div className="grid gap-1">
            <strong style={{ fontFamily: 'var(--font-headline)', fontSize: '1rem' }}>{isEs ? 'Esperando aprobación' : 'Waiting for approval'}</strong>
            <span style={hint}>
              {status.storeOpen === false
                ? (isEs
                  ? `Ahora estamos cerrados. Lo aprobaremos cuando abramos${status.opensLabel ? ` (${status.opensLabel})` : ''} y le enviaremos un enlace por correo para terminar su pedido.`
                  : `We're closed right now. We'll approve it when we open${status.opensLabel ? ` at ${status.opensLabel}` : ''} and email you a link to finish your order.`)
                : (isEs
                  ? 'La aprobación normalmente toma solo unos minutos. Mantenga esta página abierta y su total se actualizará aquí solo.'
                  : 'Approval usually takes just a few minutes. Keep this page open and your total will update here by itself.')}
            </span>
          </div>
        </div>
        {!late && textLine}
        {emailMismatch && (
          <span className="text-xs" role="alert" style={{ color: 'var(--color-error)' }}>
            {isEs ? `La aprobación es para ${status.email}. Use ese correo para conservarla.` : `The approval is for ${status.email}. Keep that email on the order to use it.`}
          </span>
        )}
        <button type="button" className="text-xs underline justify-self-start" style={hint} onClick={() => void cancel()}>{isEs ? 'Cancelar y pagar con impuesto' : 'Cancel and pay with tax instead'}</button>
      </>
    ));
  }

  if (phase === 'approved') {
    return panel('ok', (
      <>
        <span style={{ color: GREEN }}>
          <strong>✓ {isEs ? 'Exención aprobada.' : 'Tax exemption approved.'}</strong>{' '}
          <span style={{ color: 'var(--color-on-surface)' }}>{[status.businessName, status.tag].filter(Boolean).join(' · ')}</span>
        </span>
        {emailMismatch && (
          <span className="text-xs" role="alert" style={{ color: 'var(--color-error)' }}>
            {isEs ? `La aprobación es para ${status.email}. Use ese correo en el pedido para que se aplique.` : `The approval is for ${status.email}. Use that email on the order for it to apply.`}
          </span>
        )}
        <button type="button" className="text-xs underline justify-self-start" style={hint} onClick={() => void cancel()}>{isEs ? 'Pagar con impuesto en su lugar' : 'Pay with tax instead'}</button>
      </>
    ), 'status');
  }

  // declined
  return panel('bad', (
    <>
      {inputs}
      <span role="alert">
        <strong>{isEs ? 'No pudimos aprobar este certificado.' : "We couldn't approve this certificate."}</strong>
        {status.declineReason ? <> &ldquo;{status.declineReason}&rdquo;</> : null}
      </span>
      <span className="text-xs" style={hint}>{isEs ? 'Puede pagar con impuesto, subir otro, o enviarnos un texto al ' : 'You can pay with tax, upload another, or text us at '}{textUs}.</span>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={smallButton} onClick={() => { setToken(null); remember(null); setPhase('open'); }}>{isEs ? 'Subir otro' : 'Upload another'}</button>
        <button type="button" className={smallButton} onClick={() => void cancel()}>{isEs ? 'Pagar con impuesto' : 'Pay with tax'}</button>
      </div>
    </>
  ));
}
