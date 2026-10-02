// Google Ads conversion measurement — the BROWSER half. The IDs and every rule
// live in `ads-tracking.ts`; this is the only file that touches storage, loads
// Google's script, or fires a conversion. Every export is safe to call on the
// server (it does nothing there).

import {
  AD_CLICK_COOKIE,
  AD_CLICK_MAX_AGE_SECONDS,
  AD_CLICK_PARAMS,
  AD_CLICK_STORAGE_KEY,
  ADS_CONVERSIONS,
  ADS_MEASUREMENT_KEY,
  ADS_MEASUREMENT_OFF,
  GOOGLE_TAG_ID,
  GOOGLE_TAG_SCRIPT_URL,
  adClickFromCookie,
  dialsBusinessNumber,
  forwardingTelHref,
  hasAdClick,
  isAdsTagExcludedPath,
  isDirectionsHref,
  parseAdClickIds,
  parseStoredAdClick,
  serializeStoredAdClick,
  shouldLoadAdsTag,
  type AdClickIds,
  type AdsEventConversion,
} from './ads-tracking';
import { CONTACT_PHONE_DISPLAY } from './contact-links';

type Gtag = (...args: unknown[]) => void;
type AdsWindow = Window & { dataLayer?: unknown[]; gtag?: Gtag };

// Module state, so it survives the layout remount a language switch causes.
let booted = false;
/** The visitor switched measurement off during this page session. */
let stopped = false;
/** `tel:` href of Google's forwarding number, once the phone snippet has one. */
let forwardingHref: string | null = null;

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The browser sends Global Privacy Control — honoured as "off". */
export function browserSendsPrivacySignal(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

/** The visitor's own switch (Cookie Preferences / the notice), without the browser signal. */
export function adsMeasurementSwitchedOff(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return safeStorage()?.getItem(ADS_MEASUREMENT_KEY) === ADS_MEASUREMENT_OFF;
  } catch {
    return false;
  }
}

export function isAdsMeasurementOff(): boolean {
  if (typeof window === 'undefined') return true;
  return browserSendsPrivacySignal() || adsMeasurementSwitchedOff();
}

function expireCookie(name: string): void {
  const host = window.location.hostname;
  const parts = host.split('.');
  // gtag writes its cookies on the registrable domain; ours is host-only.
  const domains = ['', host, `.${host}`, ...(parts.length > 2 ? [`.${parts.slice(-2).join('.')}`] : [])];
  for (const domain of domains) {
    document.cookie = `${name}=; Max-Age=0; Path=/${domain ? `; Domain=${domain}` : ''}`;
  }
}

/** The click this browser remembers: storage first, the `gclid` cookie as the fallback. */
export function readStoredAdClick(): AdClickIds | null {
  if (typeof window === 'undefined') return null;
  let stored: AdClickIds | null = null;
  try {
    stored = parseStoredAdClick(safeStorage()?.getItem(AD_CLICK_STORAGE_KEY), Date.now());
  } catch {
    stored = null;
  }
  return stored ?? adClickFromCookie(document.cookie);
}

/**
 * Remember the click this visit arrived with, for 90 days. A page loaded
 * WITHOUT a click ID never touches what is already remembered.
 */
function captureAdClick(): void {
  const params = new URLSearchParams(window.location.search);
  const ids = parseAdClickIds((name) => params.get(name));
  if (!hasAdClick(ids)) return;
  try {
    safeStorage()?.setItem(AD_CLICK_STORAGE_KEY, serializeStoredAdClick(ids, Date.now()));
  } catch {
    // Storage blocked: the cookie below still carries a gclid.
  }
  if (ids.gclid) {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${AD_CLICK_COOKIE}=${ids.gclid}; Max-Age=${AD_CLICK_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
  } else {
    // A newer click without a gclid replaces an older click's cookie.
    expireCookie(AD_CLICK_COOKIE);
  }
}

/** The click IDs to send with a lead — empty when measurement is off or no ad was clicked. */
export function adClickFormValues(): AdClickIds {
  if (isAdsMeasurementOff()) return {};
  return readStoredAdClick() ?? {};
}

/**
 * Adds the click IDs to a lead form at SEND time. Not hidden inputs: the forms
 * sit on pages that rank, and this way their HTML does not change.
 */
export function appendAdClickFields(form: FormData): void {
  const ids = adClickFormValues();
  for (const name of AD_CLICK_PARAMS) {
    const value = ids[name];
    if (value) form.set(name, value);
  }
}

function bootTag(): void {
  if (booted) return;
  booted = true;
  const win = window as AdsWindow;
  const dataLayer = (win.dataLayer = win.dataLayer ?? []);
  // ⚠️ gtag.js reads the Arguments object itself — an array pushed here is
  // silently ignored, so this cannot be written with rest parameters.
  win.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    dataLayer.push(arguments);
  };
  win.gtag('js', new Date());
  // Measurement only: no remarketing audiences are built from this tag.
  win.gtag('set', 'allow_ad_personalization_signals', false);
  win.gtag('config', GOOGLE_TAG_ID);
  win.gtag('config', ADS_CONVERSIONS.websiteCall, {
    phone_conversion_number: CONTACT_PHONE_DISPLAY,
    // ⛔ With a callback the tag does NOT rewrite the number on the page — the
    // visible number stays the shop's own. The forwarding number is kept here
    // and used only as the dial target of a tap (`onDocumentClick`).
    phone_conversion_callback: (_formatted: unknown, mobile: unknown) => {
      forwardingHref = forwardingTelHref(mobile);
    },
  });
  const script = document.createElement('script');
  script.async = true;
  script.src = GOOGLE_TAG_SCRIPT_URL;
  document.head.appendChild(script);
}

/**
 * Fire one conversion. Does nothing unless the tag is running, so callers
 * need no checks of their own: an organic visitor's form or tap sends nothing.
 */
export function sendAdsConversion(kind: AdsEventConversion): boolean {
  if (typeof window === 'undefined' || !booted || stopped) return false;
  const gtag = (window as AdsWindow).gtag;
  if (typeof gtag !== 'function') return false;
  gtag('event', 'conversion', { send_to: ADS_CONVERSIONS[kind] });
  return true;
}

// One listener for every call and directions link on the site, present and
// future. Capture phase, so it runs before the browser follows the link; it
// never prevents or delays the link.
function onDocumentClick(event: MouseEvent): void {
  if (!booted || stopped) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const anchor = target.closest('a[href]');
  if (!(anchor instanceof HTMLAnchorElement)) return;
  const href = anchor.getAttribute('href') ?? '';
  if (/^tel:/i.test(href)) {
    sendAdsConversion('callTap');
    if (forwardingHref && dialsBusinessNumber(href)) {
      // This tap dials Google's forwarding number, which rings the shop's own
      // line; the link's text is untouched and its href is put back after.
      anchor.setAttribute('href', forwardingHref);
      window.setTimeout(() => anchor.setAttribute('href', href), 2000);
    }
    return;
  }
  if (isDirectionsHref(href)) sendAdsConversion('directions');
}

/**
 * Called once, from `components/ads/GoogleAdsTag.tsx` in the locale layout.
 * Remembers an ad click, starts the tag if this visit qualifies, and listens
 * for call and directions taps. Returns the cleanup.
 */
export function startAdsMeasurement(): () => void {
  if (typeof window === 'undefined') return () => {};
  const { pathname, search } = window.location;
  const measurementOff = isAdsMeasurementOff();
  stopped = measurementOff;
  if (!measurementOff && !isAdsTagExcludedPath(pathname)) captureAdClick();
  const load = shouldLoadAdsTag({
    pathname,
    search,
    cookie: document.cookie,
    storedClick: readStoredAdClick(),
    measurementOff,
  });
  if (load) bootTag();
  document.addEventListener('click', onDocumentClick, true);
  return () => document.removeEventListener('click', onDocumentClick, true);
}

/**
 * The visitor's switch. Off takes effect at once: no more conversions from
 * this page, the remembered click is forgotten, and Google's click cookies are
 * removed. The script already in memory goes with the next page load.
 */
export function setAdsMeasurement(on: boolean): void {
  if (typeof window === 'undefined') return;
  const storage = safeStorage();
  try {
    if (on) storage?.removeItem(ADS_MEASUREMENT_KEY);
    else storage?.setItem(ADS_MEASUREMENT_KEY, ADS_MEASUREMENT_OFF);
  } catch {
    // Storage blocked: the choice still holds for this page.
  }
  stopped = !on || browserSendsPrivacySignal();
  if (on) return;
  forwardingHref = null;
  try {
    storage?.removeItem(AD_CLICK_STORAGE_KEY);
  } catch {
    // Nothing was stored.
  }
  for (const pair of document.cookie.split(';')) {
    const name = pair.split('=')[0].trim();
    if (name === AD_CLICK_COOKIE || /^_gcl_|^_gac_/.test(name)) expireCookie(name);
  }
}
