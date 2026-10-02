'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect } from 'react';
import {
  COOKIE_NOTICE_ACCEPTED,
  COOKIE_NOTICE_ATTR,
  COOKIE_NOTICE_KEY,
  applyStoredConsentGate,
} from '@/lib/cookie-consent';
import { setAdsMeasurement } from '@/lib/ads-tracking-browser';

/**
 * `useLayoutEffect` on the client, `useEffect` on the server.
 *
 * The re-stamp below MUST land before the browser paints, or the banner
 * flashes for an already-consented visitor on every language switch — the
 * exact defect it exists to fix. `useEffect` runs after paint and would show
 * that frame. But `useLayoutEffect` alone warns "does nothing on the server"
 * during SSR of this client component, so the choice is made once per
 * environment at module scope, which keeps hook order constant.
 */
const useGateEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * ⚠️ LCP-load-bearing: this banner must render in the SERVER HTML, visible by
 * default, with NO hydration gate.
 *
 * It used to render `null` until a post-hydration effect read localStorage.
 * On throttled mobile that made it pop in seconds after the page, and because
 * its paragraph out-measured every earlier paint candidate, Lighthouse crowned
 * the cookie notice itself the LCP element — render delay 2.4–6.2s, mobile
 * performance 80 (measured on production 2026-08-23, PSI + local Lighthouse
 * agreeing on `body > div.fixed > div.min-w-0 > p`). Painting it with first
 * paint is the fix; do not reintroduce a `visible` state that starts false.
 *
 * Returning visitors never see a flash: an inline <head> script in
 * `[locale]/layout.tsx` reads the same localStorage key BEFORE first paint and
 * stamps `data-nej-cookies-ok` on <html>; the CSS rule in globals.css hides
 * the banner via that attribute. Accept below stamps the same attribute, so
 * dismissal is instant without any React state.
 *
 * ⚠️ THREE writers stamp that attribute, and the third is not redundant.
 * The inline script only runs on a real page load, so a CLIENT-SIDE language
 * switch used to lose the gate entirely: `/` and `/es` are different `[locale]`
 * segments, so the switch remounts the root layout, React re-acquires <html>
 * and re-applies only the attributes it renders (`lang`, `class`, `style`),
 * and the imperative one is dropped with nothing to put it back. Measured
 * 2026-08-23: localStorage still read `accepted` throughout — consent was
 * never lost — but the banner reappeared in the new language and asked an
 * already-consented visitor to accept again, in both directions. Same-locale
 * navigation was unaffected, which is what isolated it to the remount.
 *
 * `--app-vh` is written by the same inline script and does NOT break, because
 * `ViewportHeightToken` re-applies it on mount. `useGateEffect` below is this
 * attribute's equivalent. ⚠️ Do not "simplify" it away as a duplicate of the
 * head script — they cover different events, and only this one survives a soft
 * navigation. `lib/__tests__/cookie-consent-gate.test.ts` guards it.
 *
 * Two buttons since 2026-10-02 (owner, Option A of the mockup): the site now
 * carries one optional thing — Google Ads measurement for visitors who arrive
 * from an ad (`lib/ads-tracking.ts`) — so the notice offers a real choice, as
 * the 2026-09-03 decision said it must the day that happened. "Essential only"
 * switches that measurement off in this browser and keeps it off; "Okay"
 * leaves it on. Both dismiss the notice the same way.
 */
export default function CookieNotice({ locale }: { locale: string }) {
  const isEs = locale === 'es';
  const prefix = isEs ? '/es' : '';

  // Keyed on `locale`, not `[]`: this re-applies whether React remounts the
  // component on the locale switch or merely re-renders it with a new prop.
  useGateEffect(() => {
    applyStoredConsentGate(document.documentElement);
  }, [locale]);

  function dismiss() {
    try {
      localStorage.setItem(COOKIE_NOTICE_KEY, COOKIE_NOTICE_ACCEPTED);
    } catch {
      // Storage blocked: the attribute below still hides it for this pageview.
    }
    document.documentElement.setAttribute(COOKIE_NOTICE_ATTR, '');
  }

  function accept() {
    dismiss();
    setAdsMeasurement(true);
  }

  function essentialOnly() {
    dismiss();
    setAdsMeasurement(false);
  }

  return (
    <div
      data-cookie-notice
      className="fixed bottom-3 left-3 right-3 z-[70] mx-auto max-w-4xl rounded-2xl border p-3.5 shadow-[0_18px_64px_rgba(38,28,6,0.18)] backdrop-blur md:bottom-5 md:flex md:items-center md:justify-between md:gap-5 md:p-5"
      style={{
        background: 'rgba(255,255,255,0.94)',
        borderColor: 'rgba(115, 92, 0, 0.16)',
        color: 'var(--color-on-surface)',
      }}
      role="region"
      aria-label={isEs ? 'Aviso de cookies' : 'Cookie notice'}
    >
      <div className="min-w-0 text-xs leading-snug md:text-sm md:leading-relaxed">
        <p className="text-[0.78rem] font-bold md:text-sm" style={{ fontFamily: 'var(--font-label)', color: 'var(--color-primary)' }}>
          {isEs ? 'Cookies y almacenamiento' : 'Cookies and Storage'}
        </p>
        <p style={{ color: 'var(--color-on-surface-variant)' }}>
          {isEs
            ? 'Usamos cookies esenciales y almacenamiento del navegador para inicio de sesión, carrito, favoritos, idioma y seguridad. Las visitas desde nuestros anuncios de Google también son medidas por Google.'
            : 'We use essential cookies and browser storage for sign-in, cart, favorites, language routing, and security. Visits from our Google ads are also measured by Google.'}
        </p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 md:mt-0 md:flex md:flex-shrink-0 md:flex-nowrap md:items-center">
        {/* ⚠️ These two do NOT prefetch, and this banner is the worst possible
            place to do so: it renders for FIRST-TIME visitors specifically —
            exactly the people already waiting on a cold, uncached page — and
            points at two legal pages almost nobody opens. Measured 2026-08-14,
            /cookie-preferences was the single most-prefetched route on the site
            (6x) with /privacy close behind. */}
        <Link href={`${prefix}/privacy`} prefetch={false} className="outline-button justify-center px-3 py-1.5 text-[0.62rem] md:px-4 md:py-2 md:text-[0.68rem]">
          {isEs ? 'Privacidad' : 'Privacy'}
        </Link>
        <Link href={`${prefix}/cookie-preferences`} prefetch={false} className="outline-button justify-center px-3 py-1.5 text-[0.62rem] md:px-4 md:py-2 md:text-[0.68rem]">
          {isEs ? 'Preferencias' : 'Preferences'}
        </Link>
        {/* The real choice (owner, 2026-10-02): this button actually blocks the
            Google tag — see DECISIONS.md → "Cookie banner". */}
        <button type="button" onClick={essentialOnly} className="outline-button justify-center px-3 py-1.5 text-[0.62rem] md:px-4 md:py-2 md:text-[0.68rem]">
          {isEs ? 'Solo esenciales' : 'Essential only'}
        </button>
        <button type="button" onClick={accept} className="gold-button justify-center px-3 py-1.5 text-[0.62rem] md:px-4 md:py-2 md:text-[0.68rem]">
          {/* Owner, 2026-09-03: 'Okay' rather than 'Accept' — it reads as acknowledgement. Since 2026-10-02 it also leaves ad measurement on. */}
          {isEs ? 'De acuerdo' : 'Okay'}
        </button>
      </div>
    </div>
  );
}
