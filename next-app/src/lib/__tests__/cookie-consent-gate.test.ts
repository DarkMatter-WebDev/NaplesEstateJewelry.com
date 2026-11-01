import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COOKIE_NOTICE_ACCEPTED,
  COOKIE_NOTICE_ATTR,
  COOKIE_NOTICE_KEY,
  applyStoredConsentGate,
  hasStoredConsent,
} from '@/lib/cookie-consent';

// Guard for the cookie-consent gate.
//
// The bug this exists for, measured 2026-08-23: switching language re-showed
// the cookie banner to a visitor who had already accepted, in both directions.
// Consent was never lost — localStorage read `accepted` the whole time — but
// `/` and `/es` are different `[locale]` segments, so the switch remounts the
// root layout, React re-acquires <html> and re-applies only the attributes it
// renders, and `data-nej-cookies-ok` was dropped with nothing to put it back.
// The inline <head> script that normally stamps it does not re-run on a soft
// navigation. Same-locale navigation was unaffected, which is what isolated it.
//
// Two independent things have to hold, and neither is visible from the other's
// file, which is why they are pinned together here:
//
//   1. The banner re-stamps the attribute BEFORE PAINT on a locale change.
//      After paint (a plain `useEffect`) still fixes the consent, but shows a
//      frame of banner on every switch — a visible flash rather than a silent
//      correction.
//   2. Every copy of the two magic strings agrees. The inline script and the
//      CSS selector cannot import the constants, so they hardcode them.

const CONSENT_MODULE = join(process.cwd(), 'src', 'lib', 'cookie-consent.ts');
const COOKIE_NOTICE = join(process.cwd(), 'src', 'components', 'legal', 'CookieNotice.tsx');
const LOCALE_LAYOUT = join(process.cwd(), 'src', 'app', '[locale]', 'layout.tsx');
const GLOBALS = join(process.cwd(), 'src', 'app', 'globals.css');

/**
 * The file with its comments blanked out.
 *
 * ⚠️ Load-bearing, not tidying — the same trap `viewport-units.test.ts`
 * documents. This repo mixes CRLF and LF, and in JavaScript `\r` is a line
 * terminator, so splitting CRLF text on `\n` leaves a `\r` that stops the `//`
 * pattern matching and every line comment survives the strip. Every assertion
 * below would then pass on the PROSE above them: this file's own header names
 * `data-nej-cookies-ok`, and `CookieNotice.tsx` explains its `useLayoutEffect`
 * at length directly above the call.
 */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\r\n?/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');
}

describe('cookie consent — stored state', () => {
  const accepted = { getItem: () => COOKIE_NOTICE_ACCEPTED };
  const empty = { getItem: () => null };

  it('reads recorded consent', () => {
    expect(hasStoredConsent(accepted)).toBe(true);
  });

  it('reads a missing value as no consent', () => {
    expect(hasStoredConsent(empty)).toBe(false);
  });

  it('reads any other value as no consent', () => {
    // Not a boolean-ish check: only the exact recorded token counts, so a
    // half-written or migrated value fails closed and asks again.
    expect(hasStoredConsent({ getItem: () => 'true' })).toBe(false);
  });

  it('treats unreachable storage as no consent rather than throwing', () => {
    // What a browser with storage disabled does — it throws on ACCESS, not
    // just on read, which is why the caller cannot simply null-check.
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(hasStoredConsent(blocked)).toBe(false);
    expect(hasStoredConsent(null)).toBe(false);
  });
});

describe('cookie consent — re-applying the gate', () => {
  function fakeRoot() {
    const attributes: Record<string, string> = {};
    return {
      attributes,
      setAttribute: (name: string, value: string) => {
        attributes[name] = value;
      },
    };
  }

  it('stamps the attribute when consent is recorded', () => {
    const root = fakeRoot();
    expect(applyStoredConsentGate(root, { getItem: () => COOKIE_NOTICE_ACCEPTED })).toBe(true);
    expect(root.attributes[COOKIE_NOTICE_ATTR]).toBe('');
  });

  it('leaves the banner alone when there is no consent', () => {
    // The negative control for the whole fix: a first-time visitor must still
    // get the banner after switching language.
    const root = fakeRoot();
    expect(applyStoredConsentGate(root, { getItem: () => null })).toBe(false);
    expect(root.attributes).toEqual({});
  });

  it('never removes the attribute', () => {
    // ⛔ Additive only, deliberately. A "sync both ways" version could UN-hide
    // a banner the Accept handler just hid in a browser with storage blocked,
    // where the write cannot be read back.
    expect(code(CONSENT_MODULE)).not.toMatch(/removeAttribute/);
  });
});

describe('cookie consent — the banner re-stamps before paint', () => {
  it('uses a layout effect, not a post-paint effect', () => {
    // The whole point: after paint the switch shows a frame of banner.
    //
    // ⚠️ Asserted against the ALIAS ASSIGNMENT, not a bare `useLayoutEffect`
    // anywhere in the file. `useLayoutEffect` is also on the import line, so
    // the loose version of this passes even after the gate is downgraded to a
    // plain `useEffect` — it was written that way first and caught here.
    expect(code(COOKIE_NOTICE)).toMatch(/const useGateEffect\s*=[^;]*useLayoutEffect/);
  });

  it('runs the gate through that effect', () => {
    expect(code(COOKIE_NOTICE)).toMatch(/useGateEffect\(\(\) => \{/);
  });

  it('re-applies the gate from the banner itself', () => {
    expect(code(COOKIE_NOTICE)).toMatch(/applyStoredConsentGate\(document\.documentElement\)/);
  });

  it('keys the re-stamp on the locale', () => {
    // Not `[]`: this has to re-run whether React remounts the component on the
    // switch or merely re-renders it with a new prop.
    expect(code(COOKIE_NOTICE)).toMatch(/\}, \[locale\]\)/);
  });
});

describe('cookie consent — the copies that cannot import the constants', () => {
  it('the inline head script uses the same storage key and value', () => {
    const layout = code(LOCALE_LAYOUT);
    expect(layout).toContain(`localStorage.getItem('${COOKIE_NOTICE_KEY}')==='${COOKIE_NOTICE_ACCEPTED}'`);
  });

  it('the inline head script stamps the same attribute', () => {
    expect(code(LOCALE_LAYOUT)).toContain(`setAttribute('${COOKIE_NOTICE_ATTR}','')`);
  });

  it('the stylesheet hides the banner on the same attribute', () => {
    // A rename that misses this selector leaves the attribute stamped and the
    // banner still visible — the gate fails OPEN and nothing else reports it.
    expect(code(GLOBALS)).toContain(`html[${COOKIE_NOTICE_ATTR}]`);
  });

  it('positive control: the scan can actually see the files it asserts on', () => {
    // ⚠️ A zero proves nothing without this. Every assertion above is a
    // `toContain` against a file read by path — a moved or renamed file would
    // throw here rather than silently passing an empty scan.
    expect(code(LOCALE_LAYOUT)).toContain('data-nej-cookies-ok');
    expect(code(GLOBALS).length).toBeGreaterThan(1000);
    expect(code(COOKIE_NOTICE)).toContain('data-cookie-notice');
  });
});
