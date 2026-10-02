import type { Metadata } from 'next';
import LegalPolicyPage from '@/components/legal/LegalPolicyPage';
import CookiePreferencesClient from '@/components/legal/CookiePreferencesClient';
import { getLegalMetadata } from '@/lib/legal-metadata';
import { getSpanishLegalCopy } from '@/lib/spanish-legal-copy';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return getLegalMetadata('cookie-preferences', locale);
}

interface Props {
  params: Promise<{ locale: string }>;
}

// 2026-10-02: the site gained its first optional tool — Google Ads measurement
// for visitors who arrive from an ad (lib/ads-tracking.ts) — and this page is
// where the promised off switch lives (CookiePreferencesClient). Not exported:
// a page file may only export what Next.js knows.
const COOKIE_PREFERENCES_UPDATED = 'October 2, 2026';

export default async function CookiePreferencesPage({ params }: Props) {
  const { locale } = await params;
  const isEs = locale === 'es';
  const spanishCopy = getSpanishLegalCopy('cookie-preferences', locale);

  return (
    <LegalPolicyPage
      locale={locale}
      path="/cookie-preferences"
      title={spanishCopy?.title ?? 'Cookie Preferences'}
      updated={spanishCopy?.updated ?? COOKIE_PREFERENCES_UPDATED}
      intro={spanishCopy?.intro ?? [
        'This site uses essential cookies and browser storage to operate its core features. For visitors who arrive from one of our Google ads, it also loads the Google tag to measure whether the ad led to a phone call, a directions request, or a form submission. No other analytics or advertising tool is used.',
      ]}
      sections={spanishCopy?.sections ?? [
        {
          title: isEs ? 'Cookies y Almacenamiento Esenciales' : 'Essential Cookies and Storage',
          bullets: [
            'Supabase authentication cookies for sign-in and account sessions.',
            'Language routing cookies such as NEXT_LOCALE.',
            'Cart and favorites storage in the browser so shop features continue working between page views.',
            'Cookie notice storage so the notice does not repeatedly appear after acceptance.',
            'Your ad-measurement choice (nej_ads_measurement_v1), so the switch below is remembered.',
          ],
        },
        {
          title: isEs ? 'Medición de Google Ads (opcional)' : 'Google Ads Measurement (Optional)',
          body: [
            'The Google tag loads only when your visit starts from one of our Google ads (Google adds a click ID such as gclid to the address) and stays off for everyone else. On those visits it sets Google Ads cookies in your browser (_gcl_aw, _gcl_au), and Google may set its own cookies and browser storage on Google domains. We also keep the click ID in a cookie named nej_gclid and in browser storage for 90 days, so a form you send us can carry it.',
            'Ad personalization is turned off for this tag: it measures results and is not used to build advertising audiences. On those visits a call link may dial a Google call-forwarding number that rings our regular line.',
            'Use the switch below to turn this measurement off or back on. The "Essential only" button on the cookie notice turns it off as well, and we honor the Global Privacy Control signal.',
          ],
        },
        {
          title: isEs ? 'Administrar los Controles del Navegador' : 'Managing Browser Controls',
          body: [
            'You can also clear cookies and local storage in your browser settings. Doing so may sign you out, clear your local cart or favorites, reset your language choice, or cause the cookie notice to appear again.',
          ],
        },
      ]}
    >
      <CookiePreferencesClient locale={locale} />
    </LegalPolicyPage>
  );
}
