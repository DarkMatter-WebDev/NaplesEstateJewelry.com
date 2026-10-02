'use client';

import { useEffect, useState } from 'react';
import {
  COOKIE_NOTICE_ACCEPTED,
  COOKIE_NOTICE_ATTR,
  COOKIE_NOTICE_KEY,
  hasStoredConsent,
} from '@/lib/cookie-consent';
import {
  adsMeasurementSwitchedOff,
  browserSendsPrivacySignal,
  setAdsMeasurement,
} from '@/lib/ads-tracking-browser';

const CARD_CLASS = 'mt-8 rounded-2xl border bg-white/80 p-5 shadow-[0_16px_44px_rgba(38,28,6,0.06)] md:p-6';
const CARD_STYLE = { borderColor: 'rgba(115, 92, 0, 0.14)' } as const;
const HEADING_CLASS = 'mb-3 font-[family-name:var(--font-headline)] text-2xl font-bold text-[#1a1c1c]';

export default function CookiePreferencesClient({ locale }: { locale: string }) {
  const isEs = locale === 'es';
  const [accepted, setAccepted] = useState(false);
  // Google Ads measurement (2026-10-02): the working off switch this page
  // promised the day an optional tool was added. State is read after mount —
  // it is this browser's choice, which the server cannot know.
  const [adsOff, setAdsOff] = useState(false);
  const [privacySignal, setPrivacySignal] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAccepted(hasStoredConsent());
      setAdsOff(adsMeasurementSwitchedOff());
      setPrivacySignal(browserSendsPrivacySignal());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Both handlers also sync `data-nej-cookies-ok` on <html>: the banner is
  // server-rendered and hidden purely by that attribute (see CookieNotice.tsx),
  // so without the sync a reset here would not bring it back until a reload.
  function acceptNotice() {
    localStorage.setItem(COOKIE_NOTICE_KEY, COOKIE_NOTICE_ACCEPTED);
    document.documentElement.setAttribute(COOKIE_NOTICE_ATTR, '');
    setAccepted(true);
  }

  function resetNotice() {
    localStorage.removeItem(COOKIE_NOTICE_KEY);
    document.documentElement.removeAttribute(COOKIE_NOTICE_ATTR);
    setAccepted(false);
  }

  function switchAds(on: boolean) {
    setAdsMeasurement(on);
    setAdsOff(!on);
  }

  const adsStatus = privacySignal
    ? (isEs
      ? 'Su navegador envía la señal Global Privacy Control, así que la medición de anuncios permanece desactivada en este navegador.'
      : 'Your browser sends the Global Privacy Control signal, so ad measurement stays off in this browser.')
    : adsOff
      ? (isEs
        ? 'La medición de anuncios está desactivada en este navegador.'
        : 'Ad measurement is off in this browser.')
      : (isEs
        ? 'La medición de anuncios está activada en este navegador. Solo funciona cuando llega desde uno de nuestros anuncios de Google.'
        : 'Ad measurement is on in this browser. It only runs when you arrive from one of our Google ads.');

  return (
    <>
      <div className={CARD_CLASS} style={CARD_STYLE}>
        <h2 className={HEADING_CLASS}>
          {isEs ? 'Preferencia actual' : 'Current Preference'}
        </h2>
        <p className="mb-4 text-sm leading-relaxed" style={{ color: 'var(--color-on-surface-variant)' }}>
          {accepted
            ? (isEs ? 'El aviso de cookies fue aceptado en este navegador.' : 'The cookie notice has been accepted in this browser.')
            : (isEs ? 'El aviso de cookies no está marcado como aceptado en este navegador.' : 'The cookie notice is not currently marked accepted in this browser.')}
        </p>
        <div className="flex flex-wrap gap-2.5">
          <button type="button" className="gold-button px-5 py-2.5" onClick={acceptNotice} disabled={accepted}>
            {isEs ? 'Aceptar aviso' : 'Accept Notice'}
          </button>
          <button type="button" className="outline-button px-5 py-2.5" onClick={resetNotice} disabled={!accepted}>
            {isEs ? 'Restablecer aviso' : 'Reset Notice'}
          </button>
        </div>
      </div>

      <div className={CARD_CLASS} style={CARD_STYLE} data-ads-measurement>
        <h2 className={HEADING_CLASS}>
          {isEs ? 'Medición de Google Ads' : 'Google Ads Measurement'}
        </h2>
        <p className="mb-4 text-sm leading-relaxed" style={{ color: 'var(--color-on-surface-variant)' }}>
          {adsStatus}
        </p>
        <div className="flex flex-wrap gap-2.5">
          <button type="button" className="outline-button px-5 py-2.5" onClick={() => switchAds(false)} disabled={adsOff || privacySignal}>
            {isEs ? 'Desactivar la medición de anuncios' : 'Turn off ad measurement'}
          </button>
          <button type="button" className="gold-button px-5 py-2.5" onClick={() => switchAds(true)} disabled={!adsOff || privacySignal}>
            {isEs ? 'Activar' : 'Turn on'}
          </button>
        </div>
      </div>
    </>
  );
}
