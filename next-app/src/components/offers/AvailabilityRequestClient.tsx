'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppIcon } from '@/components/AppIcon';
import FormPrivacyNotice from '@/components/legal/FormPrivacyNotice';
import { OFFER_MESSAGE_MAX } from '@/lib/offers';
import { normalizePhoneNumber } from '@/lib/phone';
import { composeFullName, formatFullName } from '@/lib/person-name';

/**
 * The buyer's side of Check Availability (owner, 2026-11-05, mockup 1): name +
 * email, optional phone and message, NO payment. On send: the "We're checking
 * on it" screen with the keep-an-eye-on-your-email note (the offer page's
 * pattern — buyers are never texted).
 */

const GOLD = '#735c00';

export type AvailabilityItem = {
  id: string;
  title: string;
  image: string | null;
  /** Today's price, already formatted ("$6,009"). */
  price: string;
};

export default function AvailabilityRequestClient({ locale, item }: { locale: string; item: AvailabilityItem }) {
  const isEs = locale === 'es';
  const prefix = isEs ? '/es' : '';
  const productHref = `${prefix}/shop/${encodeURIComponent(item.id)}`;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [triedSend, setTriedSend] = useState(false);
  const [sent, setSent] = useState(false);

  // The short "sent" screen replaces the form while the page is scrolled down
  // to the button — start the buyer at the top (the offer page's 10-18 fix).
  useEffect(() => {
    if (sent) window.scrollTo({ top: 0, behavior: 'auto' });
  }, [sent]);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const phoneOk = phone.trim() === '' || normalizePhoneNumber(phone) !== null;
  const missing = [
    firstName.trim() === '' ? (isEs ? 'Nombre' : 'First Name') : null,
    lastName.trim() === '' ? (isEs ? 'Apellido' : 'Last Name') : null,
    !emailOk ? (isEs ? 'Correo electrónico' : 'Email') : null,
    !phoneOk ? (isEs ? 'Teléfono válido (o en blanco)' : 'Valid phone (or leave it blank)') : null,
  ].filter((label): label is string => Boolean(label));

  async function send() {
    setTriedSend(true);
    setError(null);
    if (missing.length > 0 || sending) return;
    setSending(true);
    try {
      const res = await fetch('/api/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: item.id,
          customer: {
            name: composeFullName(firstName, lastName) ?? formatFullName(firstName, lastName),
            email: email.trim(),
            phone: phone.trim() ? normalizePhoneNumber(phone) ?? phone.trim() : '',
          },
          message,
          locale,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? (isEs ? 'No se pudo enviar. Llame al (239) 404-8505.' : 'Could not send. Please call (239) 404-8505.'));
      setSent(true);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : String(sendError));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="availability-root">
      {sent ? (
      <div className="availability-sent">
        <p className="availability-eyebrow">{isEs ? 'Solicitud enviada' : 'Request sent'}</p>
        <h1 className="availability-h1 availability-h1-center">{isEs ? 'Lo estamos verificando' : 'We’re checking on it'}</h1>
        <p className="mb-5" style={{ color: 'var(--color-on-surface)' }}>
          {isEs
            ? <>Gracias, {firstName.trim()}. Estamos confirmando que <strong>{item.title}</strong> esté lista para enviar. No se le ha cobrado nada.</>
            : <>Thank you, {firstName.trim()}. We’re confirming <strong>{item.title}</strong> is ready to ship. You haven’t been charged anything.</>}
        </p>
        <div className="availability-watch">
          <AppIcon name="mail" style={{ fontSize: '22px', color: GOLD }} aria-hidden="true" />
          <p className="font-bold">{isEs ? 'Esté atento a su correo electrónico.' : 'Keep an eye on your email.'}</p>
          <p>
            {isEs
              ? 'Normalmente respondemos en menos de una hora. Si está disponible, su enlace privado de '
              : 'We usually reply within an hour. If it’s available, your private '}
            <strong>{isEs ? 'Comprar ahora' : 'Buy now'}</strong>
            {isEs ? ' llegará a ' : ' link goes to '}
            <strong className="availability-watch-email">{email.trim()}</strong>.
          </p>
          <p className="availability-watch-spam">
            {isEs ? '¿No lo ve? Revise la carpeta de spam o correo no deseado.' : 'Not there? Check your spam or junk folder.'}
          </p>
        </div>
        <a href={`${prefix}/shop`} className="gold-button">{isEs ? 'Volver a la tienda' : 'Back to Shop'}</a>
      </div>
      ) : (
    <div className="availability-page">
      <div className="availability-shell">
        <Link href={productHref} className="hover-underline-grow text-xs font-bold uppercase tracking-widest" style={{ color: GOLD, fontFamily: 'var(--font-label)' }}>
          {isEs ? '< Volver a la pieza' : '< Back to the piece'}
        </Link>
        <h1 className="availability-h1">{isEs ? 'Consultar disponibilidad' : 'Check Availability'}</h1>
        <p className="availability-lede">
          {isEs
            ? 'Confirmaremos que esta pieza esté lista para enviar y le enviaremos por correo un enlace privado para comprarla, normalmente en menos de una hora. '
            : 'We’ll confirm this piece is ready to ship and email you a private link to buy it — usually within the hour. '}
          <strong style={{ color: 'var(--color-on-surface)' }}>{isEs ? 'No se necesita pago para preguntar.' : 'No payment needed to ask.'}</strong>
        </p>

        <section className="availability-card">
          <div className="availability-item">
            {item.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image} alt="" width={72} height={72} />
            ) : null}
            <div className="min-w-0">
              <p className="font-bold leading-snug" style={{ color: 'var(--color-on-surface)' }}>{item.title}</p>
              <p className="mt-0.5 font-bold" style={{ color: GOLD }}>{item.price}</p>
            </div>
          </div>
        </section>

        <form
          className="availability-form"
          noValidate
          onSubmit={(event) => { event.preventDefault(); void send(); }}
        >
          <div className="responsive-form-grid">
            <div>
              <label className="form-label" htmlFor="availability-first-name">{isEs ? 'Nombre' : 'First Name'} *</label>
              <input id="availability-first-name" className="form-field" autoComplete="given-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
            </div>
            <div>
              <label className="form-label" htmlFor="availability-last-name">{isEs ? 'Apellido' : 'Last Name'} *</label>
              <input id="availability-last-name" className="form-field" autoComplete="family-name" value={lastName} onChange={(event) => setLastName(event.target.value)} />
            </div>
          </div>
          <div>
            <label className="form-label" htmlFor="availability-email">{isEs ? 'Correo electrónico' : 'Email'} *</label>
            <input id="availability-email" type="email" className="form-field" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} aria-describedby="availability-email-hint" />
            <p id="availability-email-hint" className="availability-hint">{isEs ? 'Nuestra respuesta llega a este correo.' : 'Our answer comes to this email.'}</p>
          </div>
          <div>
            <label className="form-label" htmlFor="availability-phone">{isEs ? 'Teléfono (opcional)' : 'Phone (optional)'}</label>
            <input
              id="availability-phone"
              type="tel"
              inputMode="tel"
              placeholder="(239) 555-0123"
              className="form-field"
              autoComplete="tel"
              aria-invalid={!phoneOk}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </div>
          <div>
            <label className="form-label" htmlFor="availability-message">{isEs ? 'Mensaje (opcional)' : 'Message (optional)'}</label>
            <textarea
              id="availability-message"
              className="form-field"
              rows={3}
              maxLength={OFFER_MESSAGE_MAX}
              placeholder={isEs ? 'Cualquier pregunta sobre la pieza' : 'Anything you’d like to ask about the piece'}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </div>

          {triedSend && missing.length > 0 && (
            <p role="alert" className="text-sm" style={{ color: 'var(--color-error)' }}>
              {isEs ? 'Falta: ' : 'Still needed: '}{missing.join(', ')}.
            </p>
          )}
          {error && <p role="alert" className="text-sm" style={{ color: 'var(--color-error)' }}>{error}</p>}

          <button type="submit" className="gold-button availability-submit" disabled={sending}>
            {sending ? (isEs ? 'Enviando…' : 'Sending…') : (isEs ? 'Consultar disponibilidad' : 'Check Availability')}
          </button>
          <p className="text-center text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
            {isEs ? '¿Prefiere hablar? Llame o envíe un texto al ' : 'Prefer to talk? Call or text '}
            <a href="tel:2394048505" className="font-bold" style={{ color: 'var(--color-on-surface)', whiteSpace: 'nowrap' }}>(239) 404-8505</a>.
          </p>
          <FormPrivacyNotice locale={locale} />
        </form>
      </div>
    </div>
      )}
      <style jsx>{`
  .availability-page {
    padding: 2.25rem 0 4rem;
    background:
      linear-gradient(180deg, rgba(255, 253, 248, 0.94) 0%, rgba(249, 247, 239, 0.98) 46%, #f9f7ef 100%),
      radial-gradient(circle at top right, rgba(212, 175, 55, 0.18), transparent 34%);
  }
  .availability-shell {
    width: 100%;
    max-width: 40rem;
    margin: 0 auto;
    padding-inline: clamp(1rem, 4vw, 2rem);
  }
  .availability-h1 {
    margin: 0.5rem 0 0.4rem;
    font-family: var(--font-headline);
    font-size: clamp(1.75rem, 1.3rem + 2vw, 2.4rem);
    font-weight: 700;
    line-height: 1.15;
    color: var(--color-on-surface);
  }
  .availability-h1-center { text-align: center; margin-top: 0.75rem; }
  .availability-lede {
    margin: 0 0 1.25rem;
    line-height: 1.55;
    color: var(--color-on-surface-variant);
  }
  .availability-card {
    padding: 1rem;
    border: 1px solid rgba(216, 208, 194, 0.94);
    background: rgba(255, 255, 255, 0.9);
    box-shadow: 0 14px 36px rgba(75, 60, 24, 0.07);
  }
  .availability-item {
    display: flex;
    gap: 0.9rem;
    align-items: center;
  }
  .availability-item img {
    width: 72px;
    height: 72px;
    object-fit: cover;
    border: 1px solid var(--color-outline-variant);
    flex-shrink: 0;
  }
  .availability-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-top: 1.25rem;
  }
  .availability-hint {
    margin-top: 0.35rem;
    font-size: 0.75rem;
    color: var(--color-on-surface-variant);
  }
  .availability-submit {
    width: 100%;
    justify-content: center;
    margin-top: 0.25rem;
  }
  .availability-sent {
    max-width: 40rem;
    margin: 0 auto;
    padding: 3.5rem 1.25rem 4rem;
    text-align: center;
  }
  .availability-eyebrow {
    font-family: var(--font-label);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #735c00;
  }
  .availability-watch {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    max-width: 30rem;
    margin: 0 auto 2rem;
    padding: 0.85rem 1rem;
    background: #fff7dd;
    border: 1px solid #ecd58a;
    text-align: center;
    font-size: 0.9rem;
    line-height: 1.5;
    color: var(--color-on-surface);
  }
  .availability-watch-email { overflow-wrap: anywhere; }
  .availability-watch-spam { margin-top: 0.25rem; font-size: 0.8rem; color: var(--color-on-surface-variant); }
`}</style>
    </div>
  );
}
