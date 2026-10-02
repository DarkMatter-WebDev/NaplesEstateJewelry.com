import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  AD_CLICK_COOKIE,
  AD_CLICK_ID_MAX_LENGTH,
  AD_CLICK_MAX_AGE_SECONDS,
  ADS_CONVERSIONS,
  GOOGLE_TAG_ID,
  GOOGLE_TAG_SCRIPT_URL,
  adClickFromCookie,
  adClickLines,
  adClickSubjectSuffix,
  adClickSummary,
  dialsBusinessNumber,
  hasAdClick,
  isAdsTagExcludedPath,
  isDirectionsHref,
  parseAdClickIds,
  parseStoredAdClick,
  sanitizeAdClickId,
  serializeStoredAdClick,
  shouldLoadAdsTag,
  type AdsTagContext,
} from '../ads-tracking';
import { GOOGLE_BUSINESS_PROFILE_URL, GOOGLE_REVIEW_URL, mapsEmbedUrl, mapsUrl } from '../business-location';
import { TEL_HREF, smsHref } from '../contact-links';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

// Google Ads conversion measurement (owner decision 2026-10-02, reversing the
// 2026-09-20 "no site tag" rule). What these tests hold in place:
//   - Google's script loads ONLY for a visit that came from an ad click;
//   - every call dials the real number and the number people see is never
//     replaced — calls are counted as taps, there is no phone snippet;
//   - a lead conversion fires once, after the server accepted a SELLER form;
//   - the security policy allows the tag in BOTH header files.

describe('ads tracking: the account values', () => {
  it('uses the tag ID and the three conversion labels the site fires', () => {
    expect(GOOGLE_TAG_ID).toBe('AW-18463845461');
    expect(GOOGLE_TAG_SCRIPT_URL).toBe('https://www.googletagmanager.com/gtag/js?id=AW-18463845461');
    expect(ADS_CONVERSIONS).toEqual({
      leadForm: 'AW-18463845461/KySvCNOCo44dENXYn-RE',
      callTap: 'AW-18463845461/4vRpCNmCo44dENXYn-RE',
      directions: 'AW-18463845461/kH-kCM6d5v4cENXYn-RE',
    });
    // The forwarding-number action exists in Google Ads and is deliberately not used.
    expect(JSON.stringify(ADS_CONVERSIONS)).not.toContain('FIP-CNaCo44dENXYn-RE');
  });
});

describe('ads tracking: click IDs', () => {
  it('keeps a real-looking ID and drops anything else', () => {
    expect(sanitizeAdClickId('Cj0KCQjw-_BwE')).toBe('Cj0KCQjw-_BwE');
    expect(sanitizeAdClickId('  test123  ')).toBe('test123');
    expect(sanitizeAdClickId('')).toBeNull();
    expect(sanitizeAdClickId('<script>')).toBeNull();
    expect(sanitizeAdClickId('a b')).toBeNull();
    expect(sanitizeAdClickId("x'; drop table inquiries;--")).toBeNull();
    expect(sanitizeAdClickId('a'.repeat(AD_CLICK_ID_MAX_LENGTH))).not.toBeNull();
    expect(sanitizeAdClickId('a'.repeat(AD_CLICK_ID_MAX_LENGTH + 1))).toBeNull();
    // A form field can be a File, a JSON body can carry anything.
    expect(sanitizeAdClickId({ name: 'photo.jpg' })).toBeNull();
    expect(sanitizeAdClickId(null)).toBeNull();
    expect(sanitizeAdClickId(42)).toBeNull();
  });

  it('reads gclid, gbraid and wbraid through any getter', () => {
    const params = new URLSearchParams('gclid=abc123&wbraid=WB_1&utm_source=x&gbraid=');
    expect(parseAdClickIds((name) => params.get(name))).toEqual({ gclid: 'abc123', wbraid: 'WB_1' });
    const body: Record<string, unknown> = { gbraid: 'GB-9', gclid: '<b>' };
    expect(parseAdClickIds((name) => body[name])).toEqual({ gbraid: 'GB-9' });
    expect(hasAdClick({ gclid: 'abc' })).toBe(true);
    expect(hasAdClick({})).toBe(false);
    expect(hasAdClick(null)).toBe(false);
  });

  it('says where a lead came from, and nothing for a lead that did not click an ad', () => {
    expect(adClickSummary({ gclid: 'abc123' })).toBe('Google ad — gclid abc123');
    expect(adClickSummary({ gclid: 'abc', wbraid: 'wb' })).toBe('Google ad — gclid abc · wbraid wb');
    expect(adClickLines({ gbraid: 'gb' })).toEqual(['Source: Google ad — gbraid gb']);
    expect(adClickSubjectSuffix({ gclid: 'abc' })).toBe(' · Google ad');
    expect(adClickSummary({})).toBeNull();
    expect(adClickLines({})).toEqual([]);
    expect(adClickSubjectSuffix({})).toBe('');
  });
});

describe('ads tracking: what the browser remembers', () => {
  const now = Date.UTC(2026, 9, 2);
  const day = 24 * 60 * 60 * 1000;

  it('remembers a click for 90 days and no longer', () => {
    expect(AD_CLICK_MAX_AGE_SECONDS).toBe(90 * 24 * 60 * 60);
    const stored = serializeStoredAdClick({ gclid: 'abc123', wbraid: 'wb1' }, now);
    expect(parseStoredAdClick(stored, now)).toEqual({ gclid: 'abc123', wbraid: 'wb1' });
    expect(parseStoredAdClick(stored, now + 90 * day)).toEqual({ gclid: 'abc123', wbraid: 'wb1' });
    expect(parseStoredAdClick(stored, now + 90 * day + 1)).toBeNull();
  });

  it('reads nothing from a missing, broken or tampered record', () => {
    expect(parseStoredAdClick(null, now)).toBeNull();
    expect(parseStoredAdClick('', now)).toBeNull();
    expect(parseStoredAdClick('{not json', now)).toBeNull();
    expect(parseStoredAdClick('"abc"', now)).toBeNull();
    expect(parseStoredAdClick(JSON.stringify({ gclid: 'abc' }), now)).toBeNull(); // no timestamp
    expect(parseStoredAdClick(JSON.stringify({ gclid: 'abc', at: now + day }), now)).toBeNull(); // from the future
    expect(parseStoredAdClick(JSON.stringify({ gclid: '<script>', at: now }), now)).toBeNull();
    expect(parseStoredAdClick(JSON.stringify({ at: now }), now)).toBeNull();
  });

  it('falls back to the gclid cookie', () => {
    expect(AD_CLICK_COOKIE).toBe('nej_gclid');
    expect(adClickFromCookie('NEXT_LOCALE=en; nej_gclid=abc123; other=1')).toEqual({ gclid: 'abc123' });
    expect(adClickFromCookie('nej_gclid=abc123')).toEqual({ gclid: 'abc123' });
    expect(adClickFromCookie('not_nej_gclid=abc123')).toBeNull();
    expect(adClickFromCookie('nej_gclid=')).toBeNull();
    expect(adClickFromCookie('')).toBeNull();
    expect(adClickFromCookie(null)).toBeNull();
  });
});

describe('ads tracking: when the Google tag may load', () => {
  const organic: AdsTagContext = {
    pathname: '/gold-services',
    search: '',
    cookie: 'NEXT_LOCALE=en',
    storedClick: null,
    measurementOff: false,
  };

  it('never loads for a visitor who did not click an ad', () => {
    expect(shouldLoadAdsTag(organic)).toBe(false);
    expect(shouldLoadAdsTag({ ...organic, pathname: '/' })).toBe(false);
    expect(shouldLoadAdsTag({ ...organic, search: '?utm_source=newsletter&sort=newest' })).toBe(false);
    // A click ID that is not one does not open the gate.
    expect(shouldLoadAdsTag({ ...organic, search: '?gclid=%3Cscript%3E' })).toBe(false);
    expect(shouldLoadAdsTag({ ...organic, search: '?gclid=' })).toBe(false);
  });

  it('loads when the visit arrives from an ad, in any of the three forms', () => {
    expect(shouldLoadAdsTag({ ...organic, search: '?gclid=test123' })).toBe(true);
    expect(shouldLoadAdsTag({ ...organic, search: '?gbraid=GB_1' })).toBe(true);
    expect(shouldLoadAdsTag({ ...organic, search: '?wbraid=WB-1&gad_source=1' })).toBe(true);
    expect(shouldLoadAdsTag({ ...organic, pathname: '/es/gold-services', search: '?gclid=test123' })).toBe(true);
  });

  it('keeps loading on later pages and visits while the click is remembered', () => {
    expect(shouldLoadAdsTag({ ...organic, storedClick: { gclid: 'abc123' } })).toBe(true);
    expect(shouldLoadAdsTag({ ...organic, cookie: 'NEXT_LOCALE=en; _gcl_aw=GCL.1.abc' })).toBe(true);
    expect(shouldLoadAdsTag({ ...organic, cookie: '_gcl_gb=GCL.1.abc' })).toBe(true);
    // Google's general linker cookie alone is not an ad click.
    expect(shouldLoadAdsTag({ ...organic, cookie: '_gcl_au=1.1.123' })).toBe(false);
  });

  it('loads for Google Tag Assistant, which opens the page with gtm_debug', () => {
    expect(shouldLoadAdsTag({ ...organic, search: '?gtm_debug=1790000000000' })).toBe(true);
  });

  it('stays off when the visitor switched measurement off, whatever else is true', () => {
    expect(
      shouldLoadAdsTag({
        ...organic,
        search: '?gclid=test123&gtm_debug=1',
        cookie: '_gcl_aw=GCL.1.abc',
        storedClick: { gclid: 'abc123' },
        measurementOff: true,
      }),
    ).toBe(false);
  });

  it.each(['/admin', '/admin/buy-receipts/123', '/es/admin', '/account', '/account/orders', '/checkout', '/es/checkout', '/order-lookup'])(
    'never starts on %s',
    (pathname) => {
      expect(isAdsTagExcludedPath(pathname)).toBe(true);
      expect(shouldLoadAdsTag({ ...organic, pathname, search: '?gclid=test123', storedClick: { gclid: 'abc' } })).toBe(false);
    },
  );

  it('excludes whole sections only, never a look-alike prefix', () => {
    for (const pathname of ['/', '/gold-services', '/free-evaluation', '/contact', '/shop', '/administrator', '/accounting', '/checkout-help']) {
      expect(isAdsTagExcludedPath(pathname)).toBe(false);
    }
    expect(isAdsTagExcludedPath(null)).toBe(false);
  });
});

describe('ads tracking: links', () => {
  it('counts the site’s directions links and nothing that only looks like one', () => {
    expect(isDirectionsHref(mapsUrl())).toBe(true);
    expect(isDirectionsHref('https://maps.app.goo.gl/abc123')).toBe(true);
    expect(isDirectionsHref('https://goo.gl/maps/abc123')).toBe(true);
    expect(isDirectionsHref('https://www.google.com/maps/dir/?api=1&destination=6240+Shirley+St')).toBe(true);
    // The Business Profile entity link, the embedded map and the review form are not directions.
    expect(isDirectionsHref(GOOGLE_BUSINESS_PROFILE_URL)).toBe(false);
    expect(isDirectionsHref(mapsEmbedUrl())).toBe(false);
    expect(isDirectionsHref(GOOGLE_REVIEW_URL)).toBe(false);
    expect(isDirectionsHref('https://www.google.com/search?q=maps')).toBe(false);
    expect(isDirectionsHref('https://example.com/maps')).toBe(false);
    expect(isDirectionsHref('/contact')).toBe(false);
    expect(isDirectionsHref(TEL_HREF)).toBe(false);
    expect(isDirectionsHref('')).toBe(false);
    expect(isDirectionsHref(null)).toBe(false);
  });

  it('counts a tap only when it dials the shop’s own number', () => {
    expect(dialsBusinessNumber(TEL_HREF)).toBe(true);
    expect(dialsBusinessNumber('tel:+12394048505')).toBe(true);
    expect(dialsBusinessNumber('tel:(239) 404-8505')).toBe(true);
    expect(dialsBusinessNumber('tel:2393046229')).toBe(false);
    expect(dialsBusinessNumber('tel:8884237522')).toBe(false);
    expect(dialsBusinessNumber(smsHref())).toBe(false);
    expect(dialsBusinessNumber(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Source guards
// ---------------------------------------------------------------------------

/** Every .ts/.tsx file under a directory, tests excluded. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__') continue;
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('ads tracking: wiring', () => {
  const browser = read('src', 'lib', 'ads-tracking-browser.ts');
  const tag = read('src', 'components', 'ads', 'GoogleAdsTag.tsx');
  const layout = read('src', 'app', '[locale]', 'layout.tsx');
  const allSource = sourceFiles(join(process.cwd(), 'src'));

  it('is mounted once, from the layout — never from a page file', () => {
    expect(layout.match(/<GoogleAdsTag \/>/g)?.length).toBe(1);
    const pages = allSource.filter((file) => /[\\/]page\.tsx$/.test(file));
    expect(pages.length).toBeGreaterThan(30); // positive control: the scan sees the pages
    for (const file of pages) {
      // Imports and JSX, not prose — a page's comment may name the module.
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toContain('<GoogleAdsTag');
      expect(source, file).not.toMatch(/from '@\/(lib\/ads-tracking|components\/ads)/);
    }
  });

  it('keeps Google’s script behind the gate, in one place', () => {
    // The script URL exists in exactly one file, and only `bootTag` injects it.
    const holders = allSource.filter((file) => /googletagmanager\.com\/gtag/.test(readFileSync(file, 'utf8')));
    expect(holders.map((file) => file.replace(/\\/g, '/').split('/src/')[1])).toEqual(['lib/ads-tracking.ts']);
    expect(browser).toMatch(/if \(load\) bootTag\(\);/);
    expect(browser).toContain('shouldLoadAdsTag({');
    expect(browser.match(/bootTag\(\)/g)?.length).toBe(2); // the definition and that one call
    // No <Script> / inline snippet anywhere else.
    expect(layout).not.toMatch(/gtag|dataLayer|next\/script/);
    expect(tag).not.toMatch(/next\/script/);
  });

  it('cannot deopt the static pages', () => {
    // The CALL and the import, not the word: the component's own comment names
    // `useSearchParams` to say why it is not used.
    for (const source of [tag, browser]) {
      expect(source).not.toMatch(/useSearchParams\(/);
      expect(source).not.toContain("from 'next/navigation'");
    }
    expect(tag).toContain('useEffect(() => startAdsMeasurement(), [])');
  });

  it('hands gtag.js the Arguments object, which is the only thing it reads', () => {
    expect(browser).toContain('dataLayer.push(arguments)');
    expect(browser).not.toMatch(/dataLayer\.push\(\[/);
    expect(browser).not.toMatch(/dataLayer\.push\(args\)/);
  });

  it('measures only: ad personalization is off', () => {
    expect(browser).toContain("win.gtag('set', 'allow_ad_personalization_signals', false)");
  });

  it('runs no phone snippet: every call dials the real number and nothing on the page is rewritten', () => {
    // Owner, 2026-10-02 evening: no forwarding number. The CALL (not a comment)
    // would be `gtag('config', …, { phone_conversion_number … })`.
    expect(browser).not.toMatch(/phone_conversion_number\s*:/);
    expect(browser).not.toMatch(/phone_conversion_callback\s*:/);
    expect(browser).not.toContain('phone_conversion_css_class');
    expect(browser).not.toMatch(/textContent\s*=|innerHTML\s*=|innerText\s*=/);
    expect(browser).not.toMatch(/setAttribute\('href'/);
    expect(browser).not.toContain('gstatic');
    // Only the shop's number counts as a call lead.
    expect(browser).toMatch(/if \(dialsBusinessNumber\(href\)\) sendAdsConversion\('callTap'\);/);
  });

  it('fires nothing unless the tag is running, and never blocks or changes a link', () => {
    expect(browser).toMatch(/export function sendAdsConversion[\s\S]*?if \(typeof window === 'undefined' \|\| !booted \|\| stopped\) return false;/);
    expect(browser).toMatch(/function onDocumentClick[\s\S]*?if \(!booted \|\| stopped\) return;/);
    expect(browser).not.toContain('preventDefault');
    expect(browser).not.toContain('stopPropagation');
    expect(browser).toContain("document.addEventListener('click', onDocumentClick, true)");
  });

  it('honours the visitor’s switch and Global Privacy Control', () => {
    expect(browser).toContain('globalPrivacyControl');
    expect(browser).toMatch(/export function isAdsMeasurementOff[\s\S]*?browserSendsPrivacySignal\(\) \|\| adsMeasurementSwitchedOff\(\)/);
    // Off also forgets the click and removes Google's click cookies.
    expect(browser).toMatch(/export function setAdsMeasurement[\s\S]*?removeItem\(AD_CLICK_STORAGE_KEY\)[\s\S]*?expireCookie\(name\)/);
    expect(browser).toMatch(/export function adClickFormValues[\s\S]*?if \(isAdsMeasurementOff\(\)\) return \{\};/);
  });
});

describe('ads tracking: the lead forms', () => {
  it.each([
    ['src/components/free-evaluation/EvalForm.tsx'],
    ['src/components/contact/MessageUsForm.tsx'],
  ])('%s counts a lead once, only after the server accepted it', (file) => {
    const source = read(...file.split('/'));
    expect(source.match(/sendAdsConversion\('leadForm'\)/g)?.length).toBe(1);
    const accepted = source.indexOf('if (!res.ok) throw new LeadSendError(res.status);');
    const fired = source.indexOf("sendAdsConversion('leadForm')");
    const caught = source.indexOf('} catch (error) {');
    expect(accepted).toBeGreaterThan(-1);
    expect(fired).toBeGreaterThan(accepted);
    expect(fired).toBeLessThan(caught);
    // Never from an effect or the reload-safe `submitted` flag.
    expect(source).not.toMatch(/useEffect\([\s\S]*?sendAdsConversion/);
    // The click rides along, added at send time — no hidden input in the page.
    expect(source).toContain('appendAdClickFields(fd)');
    expect(source).not.toMatch(/name="(gclid|gbraid|wbraid)"/);
  });

  it('does not count the shop’s product inquiry (a buyer) or Join the List', () => {
    const inquiry = read('src', 'components', 'contact', 'InquiryForm.tsx');
    expect(inquiry).not.toContain('sendAdsConversion');
    expect(inquiry).toContain('...adClickFormValues()');
    for (const file of ['HomeSubscribeModal.tsx', 'HomeSubscriberForm.tsx']) {
      expect(read('src', 'components', 'home', file)).not.toContain('ads-tracking');
    }
  });

  it('saves the click with the lead and tells the owner', () => {
    const inquire = read('src', 'app', 'api', 'inquire', 'route.ts');
    const message = read('src', 'app', 'api', 'contact-message', 'route.ts');
    // Both lead paths of /api/inquire and the contact-message route validate the IDs.
    expect(inquire.match(/parseAdClickIds\(/g)?.length).toBe(2);
    expect(message.match(/parseAdClickIds\(/g)?.length).toBe(1);
    for (const source of [inquire, message]) {
      expect(source).toContain('adClickLines(');
      expect(source).toContain('adClickSummary(adClick)');
      expect(source).toContain('adClickSubjectSuffix(adClick)');
    }
    // A database without the new columns still saves the lead.
    expect(inquire).toMatch(/const MISSING_COLUMN = \/[^\n]*gclid\|gbraid\|wbraid/);
    expect(inquire).toContain('inquiries-ad-click-2026-10.sql');
    // The customer's confirmation email never carries the click ID.
    const confirmation = inquire.slice(inquire.indexOf('// Confirm to customer'), inquire.indexOf('} catch (emailErr)'));
    expect(confirmation.length).toBeGreaterThan(100);
    expect(confirmation).not.toMatch(/sourceHtml|adClick/);
  });

  it('has the SQL for the three columns, with the same value rule', () => {
    const sql = read('..', 'supabase', 'inquiries-ad-click-2026-10.sql');
    for (const column of ['gclid', 'gbraid', 'wbraid']) {
      expect(sql).toMatch(new RegExp(`add column if not exists ${column}\\s+text`));
    }
    expect(sql.match(/\^\[A-Za-z0-9_-\]\{1,255\}\$/g)?.length).toBe(3);
    const admin = read('src', 'app', '[locale]', 'admin', 'inquiries', 'page.tsx');
    expect(admin).toContain('gclid, gbraid, wbraid');
    expect(read('src', 'components', 'admin', 'InquiriesPanel.tsx')).toContain("chip('Google Ad', false)");
  });
});

describe('ads tracking: the notice, the switch and the legal pages say what the site does', () => {
  const notice = read('src', 'components', 'legal', 'CookieNotice.tsx');
  const preferences = read('src', 'components', 'legal', 'CookiePreferencesClient.tsx');
  const privacyEn = read('src', 'app', '[locale]', 'privacy', 'page.tsx');
  const cookiesEn = read('src', 'app', '[locale]', 'cookie-preferences', 'page.tsx');
  const spanish = read('src', 'lib', 'spanish-legal-copy.ts');

  it('the notice offers a real "Essential only" that blocks the tag (owner, Option A, 2026-10-02)', () => {
    expect(notice).toMatch(/function essentialOnly\(\) \{\s*dismiss\(\);\s*setAdsMeasurement\(false\);/);
    expect(notice).toMatch(/function accept\(\) \{\s*dismiss\(\);\s*setAdsMeasurement\(true\);/);
    expect(notice).toContain("isEs ? 'Solo esenciales' : 'Essential only'");
    expect(notice).toContain("isEs ? 'De acuerdo' : 'Okay'");
    // The approved sentence, in both languages, and the title no longer says "Essential" only.
    expect(notice).toContain('Visits from our Google ads are also measured by Google.');
    expect(notice).toContain('Las visitas desde nuestros anuncios de Google también son medidas por Google.');
    expect(notice).toContain("isEs ? 'Cookies y almacenamiento' : 'Cookies and Storage'");
    // Still the SSR, attribute-gated banner the LCP work depends on.
    expect(notice).toContain('data-cookie-notice');
    expect(notice).not.toMatch(/useState\(/);
  });

  it('Cookie Preferences carries the working off switch, in both languages', () => {
    expect(preferences).toContain('data-ads-measurement');
    expect(preferences).toContain('switchAds(false)');
    expect(preferences).toContain('switchAds(true)');
    expect(preferences).toContain('adsMeasurementSwitchedOff()');
    expect(preferences).toContain('browserSendsPrivacySignal()');
    expect(preferences).toContain("'Turn off ad measurement'");
    expect(preferences).toContain("'Desactivar la medición de anuncios'");
  });

  it('no page still claims that no Google tag exists', () => {
    for (const source of [privacyEn, cookiesEn, spanish]) {
      expect(source).not.toMatch(/Google Tag Manager/);
      expect(source).not.toMatch(/no se encontró en el código/);
      expect(source).not.toMatch(/was found in the app source/);
    }
  });

  it('Privacy and Cookie Preferences describe the measurement, the real number, the switch and GPC — EN and ES', () => {
    for (const source of [privacyEn, cookiesEn]) {
      expect(source).toContain('Global Privacy Control');
      // No forwarding number is used (owner, 2026-10-02 evening), so the pages must not say one is.
      expect(source).not.toMatch(/forwarding/);
      expect(source).toMatch(/dials our regular number/);
      expect(source).toContain('October 2, 2026');
    }
    expect(privacyEn).toContain('Visitors who do not arrive from an ad do not load the Google tag.');
    expect(privacyEn).toContain('TradingView');
    expect(cookiesEn).toContain('nej_gclid');
    expect(cookiesEn).toContain('nej_ads_measurement_v1');
    // Spanish twins.
    expect(spanish).toContain('Global Privacy Control');
    expect(spanish).not.toMatch(/número de desvío/);
    expect(spanish).toMatch(/nuestro número habitual/);
    expect(spanish).toContain('TradingView');
    expect(spanish).toContain('nej_gclid');
    expect(spanish).toContain("updated: UPDATED_ADS_MEASUREMENT");
    expect(spanish.match(/UPDATED_ADS_MEASUREMENT/g)?.length).toBe(3); // the constant + privacy + cookie-preferences
  });
});

describe('ads tracking: the security policy allows the tag in BOTH header files', () => {
  const nextConfig = read('next.config.ts');
  const netlify = read('..', 'netlify.toml');

  /** `script: '…'` etc. from the GOOGLE_ADS_CSP block in next.config.ts. */
  function nextHosts(key: 'script' | 'img' | 'connect' | 'frame'): string[] {
    const block = nextConfig.slice(nextConfig.indexOf('const GOOGLE_ADS_CSP = {'), nextConfig.indexOf('} as const;'));
    const value = new RegExp(`${key}: '([^']+)'`).exec(block)?.[1] ?? '';
    return value.split(' ').filter(Boolean);
  }

  /** One directive of the ENFORCING policy in netlify.toml (not the commented rollback line). */
  function netlifyDirective(name: string): string[] {
    const policy = /^\s*Content-Security-Policy = "([^"]+)"/m.exec(netlify)?.[1] ?? '';
    const directive = policy.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name} `)) ?? '';
    return directive.split(' ').slice(1);
  }

  it.each([
    ['script', 'script-src'],
    ['img', 'img-src'],
    ['connect', 'connect-src'],
    ['frame', 'frame-src'],
  ] as const)('%s hosts are in both files', (key, directive) => {
    const hosts = nextHosts(key);
    expect(hosts.length).toBeGreaterThan(0);
    expect(hosts).toContain('https://www.googletagmanager.com');
    expect(nextConfig).toContain(`\${GOOGLE_ADS_CSP.${key}}`);
    const netlifyHosts = netlifyDirective(directive);
    expect(netlifyHosts.length).toBeGreaterThan(3); // positive control: the directive was found
    for (const host of hosts) {
      expect(netlifyHosts, `${directive} in netlify.toml`).toContain(host);
    }
  });

  it('adds only Google’s documented hosts, no wildcard', () => {
    for (const key of ['script', 'img', 'connect', 'frame'] as const) {
      for (const host of nextHosts(key)) {
        expect(host).toMatch(/^https:\/\/(www\.googletagmanager\.com|www\.googleadservices\.com|googleads\.g\.doubleclick\.net|pagead2\.googlesyndication\.com|www\.google\.com|ad\.doubleclick\.net)$/);
      }
    }
  });

  it('does not open the policy to the phone snippet’s host (no forwarding number is used)', () => {
    // https://www.gstatic.com/wcm/loader.js is what the phone snippet loads;
    // the owner ruled the forwarding number out on 2026-10-02. Adding the host
    // back is the signal that decision changed — do it in both files.
    expect(nextHosts('script')).not.toContain('https://www.gstatic.com');
    expect(netlifyDirective('script-src')).not.toContain('https://www.gstatic.com');
    expect(nextConfig).not.toMatch(/http:\/\/www\.gstatic\.com/);
  });
});
