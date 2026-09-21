'use client';

import { useRef, useState } from 'react';
import FormSuccessPanel, { scrollToFormStart } from '@/components/contact/FormSuccessPanel';
import FormPrivacyNotice from '@/components/legal/FormPrivacyNotice';
import { PreferredContactField } from '@/components/contact/InquiryPreferenceFields';
import { preferredContactEmailErrorMessage, preferredContactNeedsEmail, type PreferredContact } from '@/lib/inquiry-fields';
import { LeadSendError, leadSendErrorMessage } from '@/lib/lead-form-errors';
import { isValidPhoneNumber, phoneErrorMessage } from '@/lib/phone';

interface Props {
  locale: string;
  itemName: string;
  submitted: boolean;
}

export default function InquiryForm({ locale, itemName, submitted: initialSubmitted }: Props) {
  const isEs = locale === 'es';
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  // Buyers of a shop item: only the contact preference is asked here; their
  // location does not change the answer (owner decision 2026-09-08).
  const [preferredContact, setPreferredContact] = useState<PreferredContact | ''>('');
  const [emailError, setEmailError] = useState('');
  const defaultMessage = isEs ? `Estoy interesado/a en: ${itemName}. ` : `I'm interested in: ${itemName}. `;
  const [message, setMessage] = useState(defaultMessage);
  // Honeypot. Invisible to humans, so any value means a bot — the server drops
  // the submission silently. This form shipped WITHOUT one while the other two
  // inquiry forms had it, and it is the only one that got spammed (2026-08-22).
  const [botField, setBotField] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(initialSubmitted);
  const [err, setErr] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const sectionRef = useRef<HTMLElement>(null);

  // "Send another": this form's fields are controlled, so each one is cleared
  // here (the message goes back to its "I'm interested in…" opening).
  function sendAnother() {
    setDone(false);
    setName('');
    setPhone('');
    setEmail('');
    setPreferredContact('');
    setMessage(defaultMessage);
    setBotField('');
    setErr('');
    setPhoneError('');
    setEmailError('');
    scrollToFormStart(sectionRef.current);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Before sending: the server rejects this too, but an inline message points
    // at the field instead of showing a generic "failed to send".
    if (!isValidPhoneNumber(phone)) {
      setPhoneError(phoneErrorMessage(isEs));
      return;
    }
    setPhoneError('');
    if (preferredContactNeedsEmail(preferredContact || null, email)) {
      setEmailError(preferredContactEmailErrorMessage(isEs));
      return;
    }
    setEmailError('');
    setSending(true);
    setErr('');
    try {
      const res = await fetch('/api/inquire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: itemName, name, phone, email, message, preferred_contact: preferredContact, 'bot-field': botField }),
      });
      if (!res.ok) throw new LeadSendError(res.status);
      setDone(true);
    } catch (error) {
      setErr(leadSendErrorMessage(error, isEs, isEs
        ? 'Error al enviar. Por favor inténtelo de nuevo.'
        : 'Failed to send. Please try again.'));
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <section ref={sectionRef} className="py-16 md:py-24 scroll-mt-28" style={{ background: 'var(--color-background)' }}>
        <div className="container mx-auto px-6 md:px-8 max-w-2xl">
          <FormSuccessPanel
            isEs={isEs}
            kind="message"
            body={isEs
              ? 'Revisaremos su consulta y nos comunicaremos pronto.'
              : "We'll review your inquiry and be in touch soon."}
            onSendAnother={sendAnother}
          />
        </div>
      </section>
    );
  }

  return (
    <section ref={sectionRef} className="py-16 md:py-24 scroll-mt-28" style={{ background: 'var(--color-background)' }}>
      <div className="container mx-auto px-6 md:px-8 max-w-3xl">

        <div
          className="mb-8 rounded-2xl p-4 text-sm shadow-[0_12px_34px_rgba(38,28,6,0.05)]"
          style={{
            background: 'color-mix(in srgb, var(--color-primary) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-primary) 20%, transparent)',
            color: 'var(--color-on-surface)',
          }}
        >
          <span className="font-semibold" style={{ color: 'var(--color-primary)' }}>
            {isEs ? 'Artículo: ' : 'Item: '}
          </span>
          {itemName}
        </div>

        <form
          onSubmit={handleSubmit}
          className="grid gap-5 rounded-2xl border p-6 shadow-[0_18px_54px_rgba(38,28,6,0.07)] md:p-8"
          style={{ background: 'rgba(255,255,255,0.86)', borderColor: 'rgba(115, 92, 0, 0.14)' }}
        >
          <p className="sr-only" aria-hidden="true">
            <label>
              Do not fill this out if you are human:{' '}
              <input
                name="bot-field"
                tabIndex={-1}
                autoComplete="off"
                value={botField}
                onChange={(e) => setBotField(e.target.value)}
              />
            </label>
          </p>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="grid gap-1">
              <label htmlFor="inq-name" className="form-label">
                {isEs ? 'Su nombre' : 'Your name'} *
              </label>
              <input
                id="inq-name"
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="form-field"
              />
            </div>
            <div className="grid gap-1">
              <label htmlFor="inq-phone" className="form-label">
                {isEs ? 'Teléfono' : 'Phone'} *
              </label>
              <input
                id="inq-phone"
                type="tel"
                autoComplete="tel"
                required
                inputMode="tel"
                placeholder="(239) 555-0123"
                aria-invalid={phoneError !== ''}
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (phoneError) setPhoneError('');
                }}
                className="form-field"
              />
              {phoneError && (
                <p className="text-sm" style={{ color: 'var(--color-error, #b91c1c)' }}>{phoneError}</p>
              )}
            </div>
          </div>

          <div className="grid gap-1">
            <label htmlFor="inq-email" className="form-label">
              {isEs ? 'Correo electrónico' : 'Email'}
            </label>
            <input
              id="inq-email"
              type="email"
              autoComplete="email"
              value={email}
              aria-invalid={emailError !== ''}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError('');
              }}
              className="form-field"
            />
            {emailError && (
              <p className="text-sm" style={{ color: 'var(--color-error, #b91c1c)' }}>{emailError}</p>
            )}
          </div>

          <PreferredContactField
            locale={locale}
            idPrefix="inq"
            value={preferredContact}
            onChange={setPreferredContact}
          />

          <div className="grid gap-1">
            <label htmlFor="inq-message" className="form-label">
              {isEs ? 'Mensaje' : 'Message'} *
            </label>
            <textarea
              id="inq-message"
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="form-field"
              style={{ minHeight: '7rem', resize: 'vertical' }}
            />
          </div>

          {err && (
            <p className="text-sm" style={{ color: 'var(--color-error, #b91c1c)' }}>{err}</p>
          )}

          <FormPrivacyNotice locale={locale} />

          <div className="flex gap-3 items-center pt-1">
            <button type="submit" className="gold-button" disabled={sending}>
              {sending
                ? (isEs ? 'Enviando…' : 'Sending…')
                : (isEs ? 'Enviar consulta' : 'Send inquiry')}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
