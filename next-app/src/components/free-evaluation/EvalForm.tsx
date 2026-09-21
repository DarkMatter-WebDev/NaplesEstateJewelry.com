'use client';

import { useRef, useState } from 'react';
import FormPrivacyNotice from '@/components/legal/FormPrivacyNotice';
import { LocationField, PreferredContactField } from '@/components/contact/InquiryPreferenceFields';
import { parsePreferredContact, preferredContactEmailErrorMessage, preferredContactNeedsEmail } from '@/lib/inquiry-fields';
import { isValidPhoneNumber, phoneErrorMessage } from '@/lib/phone';
import FormSuccessPanel, { scrollToFormStart } from '@/components/contact/FormSuccessPanel';
import LeadPhotoCount from '@/components/contact/LeadPhotoCount';
import { LeadSendError, leadSendErrorMessage } from '@/lib/lead-form-errors';
import { leadPhotoCapHint } from '@/lib/lead-photo-limits';
import { leadPhotosTooLargeMessage, shrinkFormPhotos } from '@/lib/lead-photo-prep';

interface Props {
  locale: string;
  submitted: boolean;
}

export default function EvalForm({ locale, submitted }: Props) {
  const isEs = locale === 'es';
  const [photoCount, setPhotoCount] = useState(0);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(submitted);
  const [err, setErr] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [emailError, setEmailError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  // "Send another": the fields are unmounted while the success panel shows, so
  // they come back empty — only our own state needs clearing.
  function sendAnother() {
    setDone(false);
    setPhotoCount(0);
    setErr('');
    setPhoneError('');
    setEmailError('');
    scrollToFormStart(formRef.current);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const fd = new FormData(formEl);
    // Photos are optional, but a submission needs *something* to act on — require
    // at least one photo or a short description so the lead isn't empty.
    const description = (fd.get('description') as string | null)?.trim() ?? '';
    if (photoCount === 0 && description === '') {
      setErr(isEs
        ? 'Añada al menos una foto o una breve descripción de lo que tiene.'
        : 'Please add at least one photo or a short description of what you have.');
      return;
    }
    // Before sending: the server rejects this too, but an inline message points
    // at the field instead of showing a generic "failed to send".
    if (!isValidPhoneNumber(String(fd.get('phone') ?? ''))) {
      setPhoneError(phoneErrorMessage(isEs));
      return;
    }
    setPhoneError('');
    // "Email" chosen as the way to reach them, but no email given — point at
    // the email box instead of sending (the server answers the same with a 400).
    if (preferredContactNeedsEmail(parsePreferredContact(fd.get('preferred_contact')), String(fd.get('email') ?? ''))) {
      setEmailError(preferredContactEmailErrorMessage(isEs));
      return;
    }
    setEmailError('');
    setSending(true);
    setErr('');
    try {
      // Camera originals would blow Netlify's 6 MB request cap after two
      // photos (see lead-photo-prep.ts) — shrink them to fit one request.
      const photos = await shrinkFormPhotos(fd);
      if (!photos.fits) {
        setErr(leadPhotosTooLargeMessage(isEs));
        return;
      }
      fd.append('source', 'free-evaluation');
      const res = await fetch('/api/inquire', { method: 'POST', body: fd });
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

  return (
    <form
      ref={formRef}
      id="fe-eval-form"
      name="free-evaluation-request"
      onSubmit={handleSubmit}
      encType="multipart/form-data"
      // mx-auto: the form is capped at 540px and now sits in a centred section,
      // so without auto margins it hugs the left edge of its container. It was
      // only ever flush-left because it used to live in the left-aligned hero.
      className="grid gap-4 rounded-2xl border p-5 shadow-[0_22px_70px_rgba(38,28,6,0.18)] md:p-6 mx-auto w-full scroll-mt-28"
      style={{
        background: 'rgba(255,255,255,0.9)',
        borderColor: 'rgba(115, 92, 0, 0.16)',
        maxWidth: 540,
      }}
    >
      <p className="sr-only" aria-hidden="true">
        <label>Do not fill this out if you are human:{' '}
          <input name="bot-field" tabIndex={-1} autoComplete="off" /></label>
      </p>

      {done ? (
        <div className="py-8 px-4">
          <FormSuccessPanel
            isEs={isEs}
            kind="submission"
            body={isEs
              ? 'Revisaremos su información y nos comunicaremos con usted pronto.'
              : "We'll review your submission and be in touch soon."}
            onSendAnother={sendAnother}
          />
        </div>
      ) : (
        <>
          {/* Photo upload */}
          <div className="grid gap-1">
            <span
              className="text-[0.7rem] font-bold uppercase tracking-[0.14em]"
              style={{ color: '#5e5e5d', fontFamily: 'var(--font-label)' }}
            >
              {isEs ? 'Fotos — opcionales, pero ayudan' : 'Photos — optional but helpful'}
            </span>
            <label
              className="flex flex-col items-center justify-center rounded-2xl text-center cursor-pointer transition-colors"
              style={{
                minHeight: '10rem',
                border: '1.5px dashed rgba(115, 92, 0, 0.24)',
                background: '#fffdf8',
                color: '#735c00',
                padding: '1.5rem',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = '#735c00';
                (e.currentTarget as HTMLElement).style.background = '#fbf5e7';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(115, 92, 0, 0.24)';
                (e.currentTarget as HTMLElement).style.background = '#fffdf8';
              }}
            >
              <input
                id="fe-photos"
                type="file"
                name="photos"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => setPhotoCount(e.target.files?.length ?? 0)}
              />
              <span className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-[#f7efd7]" aria-hidden="true">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="#735c00" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4.5 8.5h3l1.5-2h6l1.5 2h3A1.5 1.5 0 0 1 21 10v7a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17v-7a1.5 1.5 0 0 1 1.5-1.5Z" />
                  <circle cx="12" cy="13.5" r="3.2" />
                </svg>
              </span>
              <span className="text-base font-bold block">
                {isEs ? 'Toca para añadir fotos' : 'Tap to add photos'}
              </span>
              <span className="text-sm block mt-1" style={{ color: '#7a7060' }}>
                {isEs
                  ? 'Selecciona varias a la vez desde tu rollo de cámara o archivos'
                  : 'Select multiple at once from your camera roll or files'}
                {' — '}{leadPhotoCapHint(isEs)}
              </span>
              <LeadPhotoCount isEs={isEs} selected={photoCount} color="#735c00" />
            </label>
          </div>

          {/* Description */}
          <div className="grid gap-1">
            <label
              htmlFor="fe-description"
              className="text-[0.7rem] font-bold uppercase tracking-[0.14em]"
              style={{ color: '#5e5e5d', fontFamily: 'var(--font-label)' }}
            >
              {isEs ? '¿Qué está enviando?' : 'What are you submitting?'}
            </label>
            <textarea
              id="fe-description"
              name="description"
              rows={2}
              placeholder={isEs
                ? 'Cadena de oro, anillo de diamante, colección de monedas — cualquier detalle ayuda.'
                : 'Gold chain, diamond ring, coin collection — any details help.'}
              className="w-full rounded-xl px-3 py-2 text-sm"
              style={{
                border: '1px solid #d8d0c2',
                background: 'white',
                color: '#1a1c1c',
                minHeight: '4.5rem',
                resize: 'vertical',
                outline: 'none',
              }}
            />
          </div>

          {/* Name + Phone */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="grid gap-1">
              <label
                htmlFor="fe-name"
                className="text-[0.7rem] font-bold uppercase tracking-[0.14em]"
                style={{ color: '#5e5e5d', fontFamily: 'var(--font-label)' }}
              >
                {isEs ? 'Su nombre' : 'Your name'} *
              </label>
              <input
                id="fe-name"
                name="name"
                type="text"
                autoComplete="name"
                required
                className="w-full rounded-xl px-3 py-2 text-sm"
                style={{ border: '1px solid #d8d0c2', background: 'white', color: '#1a1c1c' }}
              />
            </div>
            <div className="grid gap-1">
              <label
                htmlFor="fe-phone"
                className="text-[0.7rem] font-bold uppercase tracking-[0.14em]"
                style={{ color: '#5e5e5d', fontFamily: 'var(--font-label)' }}
              >
                {isEs ? 'Teléfono' : 'Phone'} *
              </label>
              <input
                id="fe-phone"
                name="phone"
                type="tel"
                inputMode="tel"
                placeholder="(239) 555-0123"
                autoComplete="tel"
                required
                aria-invalid={phoneError !== ''}
                className="w-full rounded-xl px-3 py-2 text-sm"
                style={{ border: '1px solid #d8d0c2', background: 'white', color: '#1a1c1c' }}
                onChange={() => phoneError && setPhoneError('')}
              />
              {phoneError && (
                <p className="text-sm" style={{ color: 'var(--color-error, #b91c1c)' }}>{phoneError}</p>
              )}
            </div>
          </div>

          {/* Email */}
          <div className="grid gap-1">
            <label
              htmlFor="fe-email"
              className="text-[0.7rem] font-bold uppercase tracking-[0.14em]"
              style={{ color: '#5e5e5d', fontFamily: 'var(--font-label)' }}
            >
              {isEs ? 'Correo electrónico' : 'Email'}
            </label>
            <input
              id="fe-email"
              name="email"
              type="email"
              autoComplete="email"
              aria-invalid={emailError !== ''}
              className="w-full rounded-xl px-3 py-2 text-sm"
              style={{ border: '1px solid #d8d0c2', background: 'white', color: '#1a1c1c' }}
              onChange={() => emailError && setEmailError('')}
            />
            {emailError && (
              <p className="text-sm" style={{ color: 'var(--color-error, #b91c1c)' }}>{emailError}</p>
            )}
          </div>

          {/* Location + preferred contact (2026-09-08, owner-approved mockup option A) */}
          <LocationField locale={locale} tone="eval" idPrefix="fe" />
          <PreferredContactField locale={locale} tone="eval" idPrefix="fe" />

          <FormPrivacyNotice locale={locale} />

          {err && (
            <p className="text-sm" style={{ color: 'var(--color-error, #b91c1c)' }}>{err}</p>
          )}

          <button type="submit" className="gold-button w-full" disabled={sending}>
            {sending
              ? (isEs ? 'Enviando…' : 'Sending…')
              : (isEs ? 'Enviar para Tasación Gratuita' : 'Send for Free Appraisal')}
          </button>
        </>
      )}
    </form>
  );
}
