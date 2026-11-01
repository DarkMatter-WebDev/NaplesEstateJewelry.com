import { describe, expect, it } from 'vitest';
import {
  BANNER_MAX_CHARS,
  BANNER_SAFE_CHARS,
  DEFAULT_HOME_BANNER,
  HOME_BANNER_LINK_OPTIONS,
  bannerLength,
  parseHomeBanner,
  resolveHomeBanner,
  type HomeBannerSettings,
} from '@/lib/home-banner';

const custom = (patch: Partial<HomeBannerSettings>): HomeBannerSettings => ({
  ...DEFAULT_HOME_BANNER,
  ...patch,
});

describe('DEFAULT_HOME_BANNER — the copy the strip shipped with', () => {
  it('resolves to the historical EN strip, link and arrow intact', () => {
    expect(resolveHomeBanner(DEFAULT_HOME_BANNER, false)).toEqual({
      fragments: ['Summer special', 'Schedule a free evaluation'],
      href: '/free-evaluation',
    });
  });

  it('resolves to the historical ES strip, with the /es prefix', () => {
    expect(resolveHomeBanner(DEFAULT_HOME_BANNER, true)).toEqual({
      fragments: ['Oferta de verano', 'Programe una evaluación gratuita'],
      href: '/es/free-evaluation',
    });
  });

  it('sits exactly ON the measured safe budget in Spanish', () => {
    // ⚠️ The 48-char budget IS the shipped Spanish length (measured 2026-08-14
    // at 30.4px slack of 304px). If this fails, the default copy changed and
    // the budget was not re-measured.
    expect(bannerLength(DEFAULT_HOME_BANNER.eyebrowEs, DEFAULT_HOME_BANNER.messageEs)).toBe(BANNER_SAFE_CHARS);
    expect(bannerLength(DEFAULT_HOME_BANNER.eyebrowEn, DEFAULT_HOME_BANNER.messageEn)).toBeLessThan(BANNER_SAFE_CHARS);
  });
});

describe('resolveHomeBanner — visibility, link toggle, ES fallback', () => {
  it('renders nothing when the banner is switched off', () => {
    expect(resolveHomeBanner(custom({ enabled: false }), false)).toBeNull();
  });

  it('renders nothing when there is no copy at all', () => {
    const empty = custom({ eyebrowEn: '', messageEn: '', eyebrowEs: '', messageEs: '' });
    expect(resolveHomeBanner(empty, false)).toBeNull();
    expect(resolveHomeBanner(empty, true)).toBeNull();
  });

  it('drops the href when the link is switched off (the arrow keys off this)', () => {
    const resolved = resolveHomeBanner(custom({ linkEnabled: false }), false);
    expect(resolved?.href).toBeNull();
    expect(resolved?.fragments).toHaveLength(2);
  });

  it('honours a custom destination in both locales', () => {
    expect(resolveHomeBanner(custom({ linkPath: '/shop' }), false)?.href).toBe('/shop');
    expect(resolveHomeBanner(custom({ linkPath: '/shop' }), true)?.href).toBe('/es/shop');
  });

  it('falls back to English PER FIELD, not per banner', () => {
    // Translating only the message must not lose that translation.
    const partial = custom({ eyebrowEs: '', messageEs: 'Tasación gratuita' });
    expect(resolveHomeBanner(partial, true)?.fragments).toEqual(['Summer special', 'Tasación gratuita']);
  });

  it('collapses to a single fragment when the eyebrow is blank', () => {
    expect(resolveHomeBanner(custom({ eyebrowEn: '' }), false)?.fragments).toEqual([
      'Schedule a free evaluation',
    ]);
  });

  it('trims whitespace-only copy rather than rendering a blank fragment', () => {
    expect(resolveHomeBanner(custom({ eyebrowEn: '   ' }), false)?.fragments).toEqual([
      'Schedule a free evaluation',
    ]);
  });
});

describe('parseHomeBanner — untrusted jsonb/PUT validation', () => {
  it('round-trips the default', () => {
    expect(parseHomeBanner({ ...DEFAULT_HOME_BANNER })).toEqual(DEFAULT_HOME_BANNER);
  });

  it('rejects non-objects, missing keys, and wrong types', () => {
    expect(parseHomeBanner(null)).toBeNull();
    expect(parseHomeBanner([])).toBeNull();
    expect(parseHomeBanner('Summer special')).toBeNull();
    const missing: Record<string, unknown> = { ...DEFAULT_HOME_BANNER };
    delete missing.enabled;
    expect(parseHomeBanner(missing)).toBeNull();
    expect(parseHomeBanner({ ...DEFAULT_HOME_BANNER, enabled: 'yes' })).toBeNull();
    expect(parseHomeBanner({ ...DEFAULT_HOME_BANNER, messageEn: 42 })).toBeNull();
  });

  it('rejects a destination outside the curated list', () => {
    // Guards against an open redirect / an off-site link smuggled into the row.
    expect(parseHomeBanner({ ...DEFAULT_HOME_BANNER, linkPath: 'https://evil.example' })).toBeNull();
    expect(parseHomeBanner({ ...DEFAULT_HOME_BANNER, linkPath: '/admin' })).toBeNull();
    expect(parseHomeBanner({ ...DEFAULT_HOME_BANNER, linkPath: '/es/shop' })).toBeNull();
  });

  it('accepts every curated destination', () => {
    for (const option of HOME_BANNER_LINK_OPTIONS) {
      expect(parseHomeBanner({ ...DEFAULT_HOME_BANNER, linkPath: option.path })).not.toBeNull();
    }
  });

  it('rejects copy past the overflow ceiling, in EITHER locale', () => {
    const long = 'x'.repeat(BANNER_MAX_CHARS + 1);
    expect(parseHomeBanner({ ...DEFAULT_HOME_BANNER, eyebrowEn: '', messageEn: long })).toBeNull();
    expect(parseHomeBanner({ ...DEFAULT_HOME_BANNER, eyebrowEs: '', messageEs: long })).toBeNull();
    // Exactly at the ceiling is allowed.
    const atLimit = 'x'.repeat(BANNER_MAX_CHARS);
    expect(parseHomeBanner({ ...DEFAULT_HOME_BANNER, eyebrowEn: '', messageEn: atLimit })).not.toBeNull();
  });

  it('counts the two fragments TOGETHER against the budget', () => {
    const half = 'x'.repeat(BANNER_MAX_CHARS - 2);
    expect(bannerLength(half, 'xxx')).toBe(BANNER_MAX_CHARS + 1);
    expect(parseHomeBanner({ ...DEFAULT_HOME_BANNER, eyebrowEn: half, messageEn: 'xxx' })).toBeNull();
  });

  it('trims stored values so padded copy cannot smuggle past the budget', () => {
    const parsed = parseHomeBanner({ ...DEFAULT_HOME_BANNER, messageEn: '  Schedule a free evaluation  ' });
    expect(parsed?.messageEn).toBe('Schedule a free evaluation');
  });
});
