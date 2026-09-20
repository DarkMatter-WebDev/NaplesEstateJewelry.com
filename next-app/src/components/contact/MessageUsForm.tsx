'use client';

import { useState } from 'react';
import FormPrivacyNotice from '@/components/legal/FormPrivacyNotice';
import { LocationField, PreferredContactField } from '@/components/contact/InquiryPreferenceFields';
import { parsePreferredContact, preferredContactEmailErrorMessage, preferredContactNeedsEmail } from '@/lib/inquiry-fields';
import { isValidPhoneNumber, phoneErrorMessage } from '@/lib/phone';
import { leadPhotosTooLargeMessage, shrinkFormPhotos } from '@/lib/lead-photo-prep';
import { phoneHoursLabel } from '@/lib/business-location';
import { FormGrid, PageContainer, Section } from '@/components/layout/ResponsiveLayout';

interface Props {
  locale: string;
}

export default function MessageUsForm({ locale }: Props) {
  const isEs = locale === 'es';
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [photoCount, setPhotoCount] = useState(0);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const fd = new FormData(formEl);
    // Shared rule — this form used to carry its own looser "10 to 15 digits"
    // copy, which accepted unreachable strings like 0000000000.
    const phoneVal = String(fd.get('phone') ?? '').trim();
    if (!isValidPhoneNumber(phoneVal)) {
      setPhoneError(phoneErrorMessage(isEs));
      return;
    }
    setPhoneError('');
    // "Email" chosen as the way to reach them, but no email given.
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
      // Sent as multipart so optional photos ride along with the message.
      const res = await fetch('/api/contact-message', {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) throw new Error(await res.text());
      setDone(true);
    } catch {
      setErr(isEs
        ? 'Error al enviar. Por favor inténtelo de nuevo o llámenos.'
        : 'Failed to send. Please try again or call us.');
    } finally {
      setSending(false);
    }
  }

  return (
    <Section
      id="message-us"
      className="scroll-mt-28 border-b"
      style={{ background: 'var(--color-surface-container-lowest, #fff)', borderColor: 'var(--color-outline-variant)' }}
      aria-labelledby="message-us-heading"
    >
      <PageContainer max="narrow">
        <div className="text-center">
          <span
            className="text-xs font-bold uppercase tracking-[0.4em]"
            style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}
          >
            {isEs ? 'Mensaje Directo' : 'Direct Message'}
          </span>
          <h1
            id="message-us-heading"
            className="responsive-title-lg font-bold mt-4 mb-3 tracking-tight"
            style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
          >
            {isEs ? 'Envíenos un Mensaje Directamente' : 'Message Us Directly'}
          </h1>
          <p className="responsive-copy max-w-xl mx-auto mb-4" style={{ color: 'var(--color-on-surface-variant)' }}>
            {isEs
              ? 'Envíenos un mensaje y adjunte fotos si lo desea. Le responderemos lo antes posible.'
              : 'Send us a note and attach photos if you like. We\'ll get back to you as soon as we can.'}
          </p>
          <div className="mb-8 flex flex-col items-center gap-2">
            <a href="tel:2394048505" className="outline-button">
              {isEs ? 'Llamar (239) 404-8505' : 'Call (239) 404-8505'}
            </a>
            <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>{phoneHoursLabel(isEs)}</p>
          </div>
        </div>

        {done ? (
          <div
            className="rounded-2xl border px-8 py-16 text-center shadow-[0_18px_54px_rgba(38,28,6,0.07)]"
            style={{ background: 'rgba(255,255,255,0.86)', borderColor: 'rgba(115, 92, 0, 0.14)' }}
          >
            <div
              className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full text-xs font-bold uppercase tracking-[0.12em]"
              style={{ background: '#f7efd7', color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}
            >
              OK
            </div>
            <p
              className="text-xl font-bold mb-2"
              style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
            >
              {isEs ? '¡Mensaje enviado!' : 'Message sent!'}
            </p>
            <p style={{ color: 'var(--color-on-surface-variant)' }}>
              {isEs
                ? 'Gracias por escribirnos. Nos comunicaremos con usted pronto.'
                : 'Thanks for reaching out. We\'ll be in touch soon.'}
            </p>
          </div>
        ) : (
          <form
            name="message-us"
            onSubmit={handleSubmit}
            encType="multipart/form-data"
            className="grid gap-4 rounded-2xl border p-5 shadow-[0_18px_54px_rgba(38,28,6,0.07)] md:p-8"
            style={{ background: 'rgba(255,255,255,0.86)', borderColor: 'rgba(115, 92, 0, 0.14)' }}
          >
            <p className="sr-only" aria-hidden="true">
              <label>
                Do not fill this out if you are human:{' '}
                <input name="bot-field" tabIndex={-1} autoComplete="off" />
              </label>
            </p>

            <FormGrid>
              <div className="grid gap-1">
                <label htmlFor="message-name" className="form-label">
                  {isEs ? 'Su nombre' : 'Your name'}
                </label>
                <input
                  id="message-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  className="form-field"
                />
              </div>
              <div className="grid gap-1">
                <label htmlFor="message-email" className="form-label">
                  {isEs ? 'Correo electrónico' : 'Email'}
                </label>
                <input
                  id="message-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  aria-invalid={emailError !== ''}
                  className="form-field"
                  onChange={() => emailError && setEmailError('')}
                />
                {emailError && (
                  <p className="text-sm" style={{ color: 'var(--color-error, #b91c1c)' }}>{emailError}</p>
                )}
              </div>
            </FormGrid>

            <div className="grid gap-1">
              <label htmlFor="message-phone" className="form-label">
                {isEs ? 'Número de teléfono' : 'Phone number'} *
              </label>
              <input
                id="message-phone"
                name="phone"
                type="tel"
                inputMode="tel"
                placeholder="(239) 555-0123"
                autoComplete="tel"
                required
                aria-invalid={phoneError !== ''}
                className="form-field"
                onChange={() => phoneError && setPhoneError('')}
              />
              {phoneError && (
                <p className="text-sm" style={{ color: 'var(--color-error, #b91c1c)' }}>{phoneError}</p>
              )}
            </div>

            {/* Location + preferred contact (2026-09-08, owner-approved mockup option A) */}
            <LocationField locale={locale} idPrefix="message" />
            <PreferredContactField locale={locale} idPrefix="message" />

            <div className="grid gap-1">
              <label htmlFor="message-body" className="form-label">
                {isEs ? 'Su mensaje' : 'Your message'} *
              </label>
              <textarea
                id="message-body"
                name="message"
                required
                placeholder={
                  isEs
                    ? 'Escriba su mensaje aquí. Cuéntenos en qué podemos ayudarle.'
                    : 'Write your message here. Tell us how we can help.'
                }
                className="form-field"
                style={{ minHeight: '13rem', resize: 'vertical' }}
              />
            </div>

            {/* Optional photos */}
            <div className="grid gap-1">
              <label className="form-label" htmlFor="message-photos">
                {isEs ? 'Adjuntar fotos (opcional)' : 'Attach photos (optional)'}
              </label>
              <label
                htmlFor="message-photos"
                className="flex flex-col items-center justify-center rounded-2xl text-center cursor-pointer transition-colors"
                style={{
                  minHeight: '7rem',
                  border: '1.5px dashed rgba(115, 92, 0, 0.22)',
                  background: '#fffdf8',
                  color: 'var(--color-on-surface-variant)',
                  padding: '1.25rem',
                }}
              >
                <input
                  id="message-photos"
                  type="file"
                  name="photos"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={(e) => setPhotoCount(e.target.files?.length ?? 0)}
                />
                <span className="text-sm font-bold" style={{ color: 'var(--color-primary)' }}>
                  {isEs ? 'Toca para añadir fotos' : 'Tap to add photos'}
                </span>
                <span className="text-xs mt-1" style={{ color: 'var(--color-on-surface-variant)' }}>
                  {isEs ? 'Opcional — adjunte imágenes de su artículo' : 'Optional — attach images of your item'}
                </span>
                {photoCount > 0 && (
                  <span className="text-sm font-semibold mt-2" style={{ color: 'var(--color-primary)' }}>
                    {photoCount} {isEs
                      ? (photoCount === 1 ? 'foto seleccionada' : 'fotos seleccionadas')
                      : (photoCount === 1 ? 'photo selected' : 'photos selected')}
                  </span>
                )}
              </label>
            </div>

            <FormPrivacyNotice locale={locale} />

            {err && (
              <p className="text-sm" style={{ color: 'var(--color-error, #b91c1c)' }}>{err}</p>
            )}

            <div className="responsive-actions pt-1">
              <button type="submit" className="gold-button" disabled={sending}>
                {sending
                  ? (isEs ? 'Enviando…' : 'Sending…')
                  : (isEs ? 'Enviar mensaje' : 'Send message')}
              </button>
              <a href="tel:2394048505" className="outline-button">
                {isEs ? 'O llámenos' : 'Or call us'}
              </a>
            </div>
          </form>
        )}
      </PageContainer>
    </Section>
  );
}
