'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import FormPrivacyNotice from '@/components/legal/FormPrivacyNotice';
import {
  channelWantsEmail,
  channelWantsText,
  normalizeUsPhone,
  SMS_CONSENT_LINKS,
  smsConsentText,
  type SmsStatus,
  type SubscribeChannel,
} from '@/lib/subscriber-phone';

/**
 * The "Join the List" window opened from the homepage hero (owner mockup
 * approved 2026-09-15; rules in DECISIONS, "The hero sign-up is one button").
 *
 * Three ways to hear about new pieces — Email, Text, Both — chosen at the
 * top; the fields change to match. Text is preselected because text deals
 * are the point: pieces that never reach the website, sent as a photo with
 * the price, first reply wins. The consent box under the phone field is
 * NEVER pre-ticked (carriers reject a pre-ticked opt-in) and the statement
 * under it is the wording stored on the row as the record of consent
 * (`lib/subscriber-phone.ts`).
 *
 * Rendered through a portal into <body>: the hero overlay sits inside pinned,
 * transformed panes, where a fixed-position child would be positioned against
 * the pane instead of the window.
 *
 * Nothing here sends a text. After a text sign-up the visitor is told one
 * confirmation text will come BEFORE any deal — true today (nothing is sent
 * until the texting batch exists) and true after it (that batch sends it at
 * once).
 *
 * "¿Prefiere español?" (2026-11-22, owner: a Spanish-only customer joined from
 * the English site): one line at the top switches the window's language in
 * place ("Prefer English?" on the Spanish site). The person is saved in the
 * language they joined in, and every text and email then reaches them in it.
 */
export default function HomeSubscribeModal({ locale, onClose }: { locale: string; onClose: () => void }) {
  const [language, setLanguage] = useState<'en' | 'es'>(locale === 'es' ? 'es' : 'en');
  const isEs = language === 'es';
  const prefix = isEs ? '/es' : '';
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const [channel, setChannel] = useState<SubscribeChannel>('text');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [smsStatus, setSmsStatus] = useState<SmsStatus | null>(null);

  const wantsEmail = channelWantsEmail(channel);
  const wantsText = channelWantsText(channel);

  // Escape closes; focus moves into the window on open and back on close; the
  // page behind does not scroll while it is up.
  useEffect(() => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    panelRef.current?.focus();
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.documentElement.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus();
    };
  }, [onClose]);

  // Keep Tab inside the window while it is open.
  const trapTab = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !panelRef.current) return;
    const focusable = panelRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === 'saving') return;
    setMessage('');

    if (wantsText && !normalizeUsPhone(phone)) {
      setStatus('error');
      setMessage(isEs ? 'Ingrese un número de celular de EE. UU. válido.' : 'Please enter a valid US mobile number.');
      return;
    }
    if (wantsText && !consent) {
      setStatus('error');
      setMessage(isEs ? 'Marque la casilla para recibir mensajes de texto.' : 'Please tick the box to receive text alerts.');
      return;
    }

    setStatus('saving');
    const res = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel,
        fullName,
        email: wantsEmail ? email : undefined,
        phone: wantsText ? phone : undefined,
        smsConsent: wantsText ? consent : undefined,
        // The language the window is showing — what the person read and agreed to.
        locale: language,
      }),
    });
    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.success) {
      setStatus('error');
      setMessage(data?.error ?? (isEs ? 'No se pudo guardar.' : 'Could not save.'));
      return;
    }

    setSmsStatus(wantsText ? (data.smsStatus ?? 'pending') : null);
    setStatus('success');
  }

  const choices: { value: SubscribeChannel; label: string; hint: string | null }[] = [
    { value: 'email', label: isEs ? 'Correo' : 'Email', hint: isEs ? 'mensual, más o menos' : 'monthly-ish' },
    { value: 'text', label: isEs ? 'Texto' : 'Text', hint: isEs ? 'lo más rápido' : 'the fastest' },
    { value: 'both', label: isEs ? 'Ambos' : 'Both', hint: null },
  ];

  const consentStatement = smsConsentText(language);
  // The statement ends with the two link labels; render those as links and the
  // rest as text, so what is stored and what was shown are the same words.
  const privacyLabel = SMS_CONSENT_LINKS.privacy.label[isEs ? 'es' : 'en'];
  const termsLabel = SMS_CONSENT_LINKS.terms.label[isEs ? 'es' : 'en'];
  const statementBody = consentStatement.slice(0, consentStatement.indexOf(privacyLabel));

  const labelClass = 'mb-1 block text-[0.6rem] font-bold uppercase tracking-[0.2em]';
  const labelStyle = { color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' } as const;

  const content = (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto px-3 py-6 md:py-10"
      style={{ background: 'rgba(0,0,0,0.52)' }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        lang={language}
        onKeyDown={trapTab}
        className="home-subscribe-modal w-full max-w-[480px] border bg-white outline-none md:max-w-[580px]"
        style={{ borderColor: 'var(--color-outline-variant)', boxShadow: '0 24px 60px rgba(0,0,0,0.35)', color: 'var(--color-on-surface)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-1 md:px-8 md:pt-7 md:pb-2">
          <div>
            <p className="mb-2 text-[0.6rem] font-bold uppercase tracking-[0.3em] md:text-[0.66rem]" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}>
              Naples Estate Jewelry
            </p>
            <h2 id={titleId} className="text-2xl leading-tight md:text-[1.75rem]" style={{ fontFamily: 'var(--font-headline)' }}>
              {status === 'success'
                ? (isEs ? 'Ya está en la lista.' : "You're on the list.")
                : (isEs ? 'Reciba nuevas piezas primero' : 'Get First Look at New Pieces')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isEs ? 'Cerrar' : 'Close'}
            className="px-1 text-base font-bold"
            style={{ color: 'var(--color-on-surface-variant)' }}
          >
            ✕
          </button>
        </div>

        {status === 'success' ? (
          <div className="grid gap-3 px-5 pt-2 pb-5 md:gap-4 md:px-8 md:pt-3 md:pb-8">
            {smsStatus ? (
              <div className="grid gap-1.5 rounded-xl border px-4 py-3" style={{ borderColor: 'var(--color-outline-variant)', background: 'var(--color-background)' }}>
                <p className="text-lg" style={{ fontFamily: 'var(--font-headline)' }}>
                  {smsStatus === 'confirmed'
                    ? (isEs ? 'Su número ya estaba confirmado.' : 'Your number was already confirmed.')
                    : (isEs ? 'Un paso más para los textos' : 'One more step for texts')}
                </p>
                <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                  {smsStatus === 'confirmed'
                    ? (isEs ? 'Las ofertas por texto le llegarán a este número.' : 'Text deals will reach you at this number.')
                    : (isEs
                        ? 'Antes de que salga cualquier oferta, recibirá un solo texto pidiéndole que responda SÍ. No se envía nada hasta que lo haga.'
                        : "Before any deal goes out, you'll get one text asking you to reply YES. Nothing is sent until you do.")}
                </p>
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                {isEs ? 'Le avisaremos por correo cuando lleguen piezas nuevas.' : "We'll email you when new pieces come in."}
              </p>
            )}
            <button type="button" onClick={onClose} className="gold-button justify-self-start">
              {isEs ? 'Listo' : 'Done'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="grid gap-3.5 px-5 pt-2 pb-5 md:gap-5 md:px-8 md:pt-3 md:pb-8" noValidate>
            {/* Switch the window's language in place; the person is saved in the language they join in. */}
            <button
              type="button"
              onClick={() => { setLanguage(isEs ? 'en' : 'es'); setMessage(''); if (status === 'error') setStatus('idle'); }}
              lang={isEs ? 'en' : 'es'}
              className="lift-tile flex w-full items-center justify-between gap-2 rounded-full border py-1.5 pl-4 pr-1.5 text-left"
              style={{ borderColor: 'color-mix(in srgb, var(--color-primary) 35%, transparent)', background: 'color-mix(in srgb, var(--color-primary) 5%, white)' }}
            >
              <span className="text-[0.95rem] md:text-base" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
                {isEs ? 'Prefer English?' : '¿Prefiere español?'}
              </span>
              <span
                className="whitespace-nowrap rounded-full px-3 py-1.5 text-[0.6rem] font-extrabold uppercase tracking-[0.14em] md:text-[0.66rem]"
                style={{ background: 'var(--color-on-surface)', color: '#e9c349', fontFamily: 'var(--font-label)' }}
              >
                {isEs ? 'English →' : 'Español →'}
              </span>
            </button>
            <p className="text-sm md:text-[0.95rem]" style={{ color: 'var(--color-on-surface-variant)' }}>
              {isEs ? 'Las buenas piezas no duran. Elija cómo quiere enterarse.' : "Good pieces don't last. Choose how you want to hear about them."}
            </p>

            <div
              role="radiogroup"
              aria-label={isEs ? 'Cómo quiere enterarse' : 'How you want to hear'}
              className="grid grid-cols-3 overflow-hidden rounded-full border"
              style={{ borderColor: 'var(--color-outline-variant)' }}
            >
              {choices.map((choice) => {
                const on = channel === choice.value;
                return (
                  <button
                    key={choice.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setChannel(choice.value)}
                    className="px-1 py-2 text-center text-[0.62rem] font-bold uppercase tracking-[0.14em] outline-none focus-visible:ring-2 focus-visible:ring-inset md:py-3 md:text-[0.76rem]"
                    style={{
                      fontFamily: 'var(--font-label)',
                      background: on ? 'var(--color-on-surface)' : 'transparent',
                      color: on ? '#e9c349' : 'var(--color-primary)',
                    }}
                  >
                    {choice.label}
                    {choice.hint && (
                      <span className="block text-[0.55rem] font-semibold normal-case tracking-[0.06em] opacity-80 md:mt-0.5 md:text-[0.72rem]">{choice.hint}</span>
                    )}
                  </button>
                );
              })}
            </div>

            <label>
              <span className={labelClass} style={labelStyle}>{isEs ? 'Nombre' : 'Name'}</span>
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                autoComplete="name"
                className="form-field w-full"
                placeholder={isEs ? 'Opcional' : 'Optional'}
              />
            </label>

            {wantsEmail && (
              <label>
                <span className={labelClass} style={labelStyle}>{isEs ? 'Correo electrónico' : 'Email address'}</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  inputMode="email"
                  className="form-field w-full"
                  placeholder="you@example.com"
                />
              </label>
            )}

            {wantsText && (
              <>
                <label>
                  <span className={labelClass} style={labelStyle}>{isEs ? 'Número de celular' : 'Cell number'}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold" style={{ color: 'var(--color-on-surface-variant)' }} aria-hidden="true">+1</span>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      autoComplete="tel-national"
                      inputMode="tel"
                      className="form-field w-full"
                      placeholder="(239) 555-0148"
                    />
                  </div>
                </label>

                <div className="grid gap-2.5 rounded-xl border px-3.5 py-3 md:gap-3 md:px-5 md:py-4" style={{ borderColor: '#e9c349', background: '#fffbe8' }}>
                  <p className="text-[0.58rem] font-extrabold uppercase tracking-[0.24em]" style={{ color: '#8f6c06', fontFamily: 'var(--font-label)' }}>
                    {isEs ? 'Ofertas solo por texto' : 'Text-only deals'}
                  </p>
                  <p className="text-sm">
                    {isEs
                      ? 'Algunas piezas nunca llegan al sitio web. Enviamos una foto rápida con los detalles (metal, peso, medida) y el precio. Suelen ir a precio de metal o apenas por encima, nunca a precio completo, y la primera persona que responde se la lleva. Aquí las cosas se mueven rápido; el correo es demasiado lento para esto.'
                      : 'Some pieces never make it to the website. We text a quick photo with the details (metal, weight, size) and the price. These often go at scrap price or just above, never full price, and the first person to reply takes it. Things move quickly here; email is too slow for these.'}
                  </p>
                  <label className="grid grid-cols-[18px_1fr] items-start gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(event) => setConsent(event.target.checked)}
                      className="mt-0.5 h-[18px] w-[18px]"
                      style={{ accentColor: 'var(--color-primary)' }}
                    />
                    <span>
                      <b>{isEs ? 'Envíeme un texto en cuanto salga una buena oferta.' : 'Text me the moment a good deal drops.'}</b>{' '}
                      {isEs ? 'Las piezas se mueven rápido; la primera respuesta se la lleva.' : 'Pieces move fast; first reply takes it.'}
                    </span>
                  </label>
                  <p className="text-[0.66rem] leading-snug md:text-[0.72rem]" style={{ color: 'var(--color-on-surface-variant)' }}>
                    {statementBody}
                    <Link href={`${prefix}${SMS_CONSENT_LINKS.privacy.path}`} className="font-bold underline underline-offset-2" style={{ color: 'var(--color-primary)' }}>
                      {privacyLabel}
                    </Link>
                    {' · '}
                    <Link href={`${prefix}${SMS_CONSENT_LINKS.terms.path}`} className="font-bold underline underline-offset-2" style={{ color: 'var(--color-primary)' }}>
                      {termsLabel}
                    </Link>
                    .
                  </p>
                </div>
              </>
            )}

            {!wantsText && <FormPrivacyNotice locale={language} />}

            {message && (
              <p className="text-xs" role="alert" style={{ color: status === 'error' ? 'var(--color-error)' : 'var(--color-on-surface)' }}>
                {message}
              </p>
            )}

            <button type="submit" disabled={status === 'saving'} className="gold-button w-full py-3 disabled:opacity-60">
              {status === 'saving' ? (isEs ? 'Enviando…' : 'Joining…') : (isEs ? 'Unirse' : 'Join')}
            </button>
          </form>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
