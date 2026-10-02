// Google Ads conversion measurement — the PURE half: the tag ID, the conversion
// labels, and every rule about when the tag may load and what counts.
// The browser half (storage, the tag itself, the click listener) lives in
// `ads-tracking-browser.ts`; the API routes import only this file.
//
// Owner decisions, 2026-10-02 (`DECISIONS.md` → "Google Ads conversion
// tracking…"). They reverse the 2026-09-20 "no site tag" rule, on these terms:
//
// - The Google tag loads ONLY for a visit that came from an ad click (now, or
//   within the 90 days the click is remembered). Organic visitors, Google's
//   crawler and PageSpeed get the site with no Google script and no new cookie.
// - ⛔ The phone number people SEE is never replaced. Google's forwarding
//   numbers "can change or be reassigned" (Google's wording), and the site says
//   "call or text" beside the number. Only what a TAP dials is swapped.
// - The lead-form conversion counts the two SELLER forms (free evaluation,
//   contact message). The shop's product inquiry is a buyer; Join the List is
//   not a lead.
// - Ad personalization is off: the tag measures results and builds no
//   remarketing audiences.

import { stripLocalePrefix } from './contact-bar-paths';
import { CONTACT_PHONE_DIGITS } from './contact-links';

export const GOOGLE_TAG_ID = 'AW-18463845461';

/** The script the tag loads from — the only third-party script this feature adds. */
export const GOOGLE_TAG_SCRIPT_URL = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_TAG_ID}`;

/** `send_to` values of the conversion actions created in Google Ads (2026-10-02). */
export const ADS_CONVERSIONS = {
  /** Primary. A seller form the server accepted. */
  leadForm: `${GOOGLE_TAG_ID}/KySvCNOCo44dENXYn-RE`,
  /** Primary. A call through Google's forwarding number, 60+ seconds — Google counts it, the site never fires it. */
  websiteCall: `${GOOGLE_TAG_ID}/FIP-CNaCo44dENXYn-RE`,
  /** Secondary. A tap on any `tel:` link. */
  callTap: `${GOOGLE_TAG_ID}/4vRpCNmCo44dENXYn-RE`,
  /** Secondary. A click on a Google Maps directions link. */
  directions: `${GOOGLE_TAG_ID}/kH-kCM6d5v4cENXYn-RE`,
} as const;

/** The conversions the site itself fires as events. */
export type AdsEventConversion = Exclude<keyof typeof ADS_CONVERSIONS, 'websiteCall'>;

// ---------------------------------------------------------------------------
// Ad click identifiers
// ---------------------------------------------------------------------------

/**
 * What Google appends to an ad's landing URL when auto-tagging is on. `gbraid`
 * and `wbraid` are what an iPhone click can carry instead of `gclid`.
 */
export const AD_CLICK_PARAMS = ['gclid', 'gbraid', 'wbraid'] as const;
export type AdClickParam = (typeof AD_CLICK_PARAMS)[number];
export type AdClickIds = Partial<Record<AdClickParam, string>>;

export const AD_CLICK_ID_MAX_LENGTH = 255;

// Google's IDs are URL-safe base64. Anything else is not stored: the value ends
// up in a database row, an email and a cookie.
const AD_CLICK_ID_PATTERN = new RegExp(`^[A-Za-z0-9_-]{1,${AD_CLICK_ID_MAX_LENGTH}}$`);

export function sanitizeAdClickId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  return AD_CLICK_ID_PATTERN.test(value) ? value : null;
}

/** Reads the three IDs through any getter: URL params, a form, a JSON body. */
export function parseAdClickIds(get: (name: AdClickParam) => unknown): AdClickIds {
  const ids: AdClickIds = {};
  for (const name of AD_CLICK_PARAMS) {
    const value = sanitizeAdClickId(get(name));
    if (value) ids[name] = value;
  }
  return ids;
}

export function hasAdClick(ids: AdClickIds | null | undefined): boolean {
  return !!ids && AD_CLICK_PARAMS.some((name) => !!ids[name]);
}

/**
 * Where a lead came from, for the owner's email and the message center:
 * "Google ad — gclid Cj0K…". The full IDs are kept because a later
 * offline-conversion import needs them. Null when no ad was clicked.
 */
export function adClickSummary(ids: AdClickIds | null | undefined): string | null {
  if (!ids) return null;
  const parts = AD_CLICK_PARAMS.filter((name) => ids[name]).map((name) => `${name} ${ids[name]}`);
  return parts.length ? `Google ad — ${parts.join(' · ')}` : null;
}

/** The same fact as a plain-text line ("Source: Google ad — …"), or nothing. */
export function adClickLines(ids: AdClickIds | null | undefined): string[] {
  const summary = adClickSummary(ids);
  return summary ? [`Source: ${summary}`] : [];
}

/** Email subject suffix, so an ad lead reads as one from the inbox list. */
export function adClickSubjectSuffix(ids: AdClickIds | null | undefined): string {
  return hasAdClick(ids) ? ' · Google ad' : '';
}

// ---------------------------------------------------------------------------
// What the browser remembers
// ---------------------------------------------------------------------------

/** localStorage: `{ gclid?, gbraid?, wbraid?, at }`. */
export const AD_CLICK_STORAGE_KEY = 'nej_ad_click_v1';
/** First-party cookie holding the `gclid` alone — the fallback when storage is unavailable. */
export const AD_CLICK_COOKIE = 'nej_gclid';
/** 90 days — the same life as Google's own click cookie. */
export const AD_CLICK_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

/** localStorage: `off` once the visitor switched ad measurement off. Absent = on. */
export const ADS_MEASUREMENT_KEY = 'nej_ads_measurement_v1';
export const ADS_MEASUREMENT_OFF = 'off';

export function serializeStoredAdClick(ids: AdClickIds, now: number): string {
  return JSON.stringify({ ...ids, at: now });
}

/** The remembered click, or null when there is none, it is malformed, or it is older than 90 days. */
export function parseStoredAdClick(raw: string | null | undefined, now: number): AdClickIds | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as Record<string, unknown>;
  const at = typeof record.at === 'number' ? record.at : NaN;
  if (!Number.isFinite(at) || at > now || now - at > AD_CLICK_MAX_AGE_SECONDS * 1000) return null;
  const ids = parseAdClickIds((name) => record[name]);
  return hasAdClick(ids) ? ids : null;
}

/** The `gclid` from a `document.cookie` string. */
export function adClickFromCookie(cookie: string | null | undefined): AdClickIds | null {
  const match = (cookie ?? '').match(new RegExp(`(?:^|;\\s*)${AD_CLICK_COOKIE}=([^;]*)`));
  const gclid = match ? sanitizeAdClickId(match[1]) : null;
  return gclid ? { gclid } : null;
}

// ---------------------------------------------------------------------------
// When the tag may load
// ---------------------------------------------------------------------------

/**
 * Sections where the tag never starts: no ad lands there, and their URLs can
 * carry order numbers and admin record IDs that Google has no business seeing.
 */
export const ADS_TAG_EXCLUDED_SECTIONS = ['/admin', '/account', '/checkout', '/order-lookup'] as const;

export function isAdsTagExcludedPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const path = stripLocalePrefix(pathname).replace(/\/+$/, '') || '/';
  return ADS_TAG_EXCLUDED_SECTIONS.some((section) => path === section || path.startsWith(`${section}/`));
}

export interface AdsTagContext {
  pathname: string;
  /** `location.search` */
  search: string;
  /** `document.cookie` */
  cookie: string;
  /** The click this browser remembers, if any. */
  storedClick: AdClickIds | null;
  /** The visitor switched measurement off, or the browser sends Global Privacy Control. */
  measurementOff: boolean;
}

/**
 * ⛔ The gate. A visitor who never clicked an ad never loads Google's script —
 * that is what keeps the pages that rank exactly as they were for everyone
 * else (owner's "organic visibility is the overriding rule").
 */
export function shouldLoadAdsTag(context: AdsTagContext): boolean {
  if (context.measurementOff) return false;
  if (isAdsTagExcludedPath(context.pathname)) return false;
  const params = new URLSearchParams(context.search);
  if (hasAdClick(parseAdClickIds((name) => params.get(name)))) return true;
  // Google Tag Assistant opens the page with this parameter; without it the
  // tool would report "no tag" on a site that loads the tag conditionally.
  if (params.has('gtm_debug')) return true;
  if (hasAdClick(context.storedClick)) return true;
  // Google's own click cookies, in case ours was cleared and theirs was not.
  return /(?:^|;\s*)_gcl_(?:aw|gb)=/.test(context.cookie);
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

/** A link that opens Google Maps to find or route to the showroom. */
export function isDirectionsHref(href: string | null | undefined): boolean {
  if (!href) return false;
  let url: URL;
  try {
    url = new URL(href, 'https://naplesestatejewelry.com');
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (host === 'maps.app.goo.gl') return true;
  if (host === 'goo.gl') return url.pathname.startsWith('/maps');
  if (!/^(?:www\.|maps\.)?google\.[a-z.]+$/.test(host)) return false;
  // The Business Profile entity link (`?cid=`) and the embedded map are not a
  // request for directions.
  if (url.searchParams.has('cid') || url.searchParams.get('output') === 'embed') return false;
  return host.startsWith('maps.') || url.pathname.startsWith('/maps');
}

/** A `tel:` link to the shop's own number — the only one Google forwards. */
export function dialsBusinessNumber(href: string | null | undefined): boolean {
  if (!href || !/^tel:/i.test(href)) return false;
  const digits = href.replace(/\D/g, '');
  return digits === CONTACT_PHONE_DIGITS || digits === `1${CONTACT_PHONE_DIGITS}`;
}

/**
 * The `tel:` href for the forwarding number Google hands the phone snippet's
 * callback. Null when it is not a usable number, or is simply our own (Google
 * had no forwarding number to give).
 */
export function forwardingTelHref(mobileNumber: unknown): string | null {
  if (typeof mobileNumber !== 'string') return null;
  const plus = mobileNumber.trim().startsWith('+') ? '+' : '';
  const digits = mobileNumber.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  if (digits.endsWith(CONTACT_PHONE_DIGITS)) return null;
  return `tel:${plus}${digits}`;
}
