import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STORE_HOURS,
  FACEBOOK_URL,
  INSTAGRAM_URL,
  SAME_AS,
  WEEK_ORDER,
  hoursSegmentsCompact,
  type StoreHoursSchedule,
} from '@/lib/business-location';

// `/card` is the URL printed on the business cards (2026-09-03); `/kittcard`
// is the second employee's (2026-09-16). Both are two-line routes over ONE
// component, `CardLanding`. Two things must not regress silently: they are
// noindex utility pages that stay OUT of the sitemap, and they carry no site
// chrome by design.

import { CARD_HOLDERS, CARD_HOLDER_PATHS } from '@/lib/card-holders';

const APP = join(process.cwd(), 'src', 'app');
const PAGE = readFileSync(join(process.cwd(), 'src', 'components', 'card', 'CardLanding.tsx'), 'utf8');
const ROUTES = {
  card: readFileSync(join(APP, '[locale]', 'card', 'page.tsx'), 'utf8'),
  kittcard: readFileSync(join(APP, '[locale]', 'kittcard', 'page.tsx'), 'utf8'),
};
const SITEMAP = readFileSync(join(APP, 'sitemap.ts'), 'utf8');

function schedule(open: Partial<Record<(typeof WEEK_ORDER)[number], [string, string]>>): StoreHoursSchedule {
  return Object.fromEntries(
    WEEK_ORDER.map((day) => {
      const times = open[day];
      return [day, { open: Boolean(times), opens: times?.[0] ?? '11:00', closes: times?.[1] ?? '15:00' }];
    }),
  ) as StoreHoursSchedule;
}

describe('/card page — search and chrome rules', () => {
  it('is noindex and never listed in the sitemap — every card holder', () => {
    expect(PAGE).toContain('robots: { index: false, follow: false }');
    for (const path of CARD_HOLDER_PATHS) expect(SITEMAP).not.toContain(`'${path}'`);
    expect(SITEMAP).not.toContain('kittcard');
  });

  it('every card route is a thin wrapper over the shared CardLanding with its own holder', () => {
    for (const [key, source] of Object.entries(ROUTES)) {
      expect(source).toContain("from '@/components/card/CardLanding'");
      expect(source).toContain(`CARD_HOLDERS.${key}`);
      expect(source).toContain('cardMetadata(HOLDER, locale)');
      // No page-specific copy: the wrapper must not carry buttons of its own.
      expect(source).not.toContain('dark-button');
      expect(source).not.toContain('sms:');
    }
    // The person-specific values are the ONLY things that may differ.
    expect(PAGE).not.toContain('404-8505');
    expect(PAGE).not.toContain('Chris');
    expect(PAGE).toContain('holder.phoneDigits');
    expect(PAGE).toContain('holder.firstName');
    expect(PAGE).toContain('`/es${holder.path}`');
  });

  it("Kitt's card shows Chris's details until his own number is ready (owner, 2026-09-16)", () => {
    expect(CARD_HOLDERS.card.path).toBe('/card');
    expect(CARD_HOLDERS.kittcard.path).toBe('/kittcard');
    expect(CARD_HOLDERS.kittcard.phoneDigits).toBe(CARD_HOLDERS.card.phoneDigits);
    expect(CARD_HOLDERS.kittcard.firstName).toBe(CARD_HOLDERS.card.firstName);
    expect(CARD_HOLDERS.card.phoneDigits).toBe('2394048505');
    expect(CARD_HOLDERS.kittcard.email).toBe(CARD_HOLDERS.card.email);
  });

  it('shows the email address as a readable mailto line, paid for by the shorter storefront photo (owner, 2026-09-24, Option B)', () => {
    // The address comes from the holder like the name and number — never typed into the page.
    expect(CARD_HOLDERS.card.email).toBe('info@naplesestatejewelry.com');
    expect(PAGE).toContain('mailto:${holder.email}');
    expect(PAGE).toContain('{holder.email}');
    expect(PAGE).not.toContain('info@naplesestatejewelry.com');
    // The subject marks the lead as a card lead, like the prefilled text.
    expect(PAGE).toContain("'Su tarjeta — Naples Estate Jewelry' : 'Your card — Naples Estate Jewelry'");
    // The line's height came out of the photo, not the page: 16:9 → 2:1, mt-3 → mt-2.
    expect(PAGE).toMatch(/<StorefrontPhoto [^>]*aspect="2:1"[^>]*className="mt-2"/);
    expect(PAGE).not.toContain('aspect="16:9"');
  });

  it('renders no site header, footer or breadcrumb (the page is the buttons)', () => {
    expect(PAGE).not.toContain('SiteHeader');
    expect(PAGE).not.toContain('SiteFooter');
    expect(PAGE).not.toContain('BreadcrumbTrail');
  });

  it('opts out of the cookie notice via the page attribute + the :has() rule', () => {
    // Two halves that cannot see each other: the page declares, the stylesheet
    // resolves. Losing either brings the banner back over the address.
    const GLOBALS = readFileSync(join(APP, 'globals.css'), 'utf8');
    expect(PAGE).toMatch(/<main [^>]*data-no-cookie-notice[ >]/);
    expect(GLOBALS).toContain('body:has(main[data-no-cookie-notice]) [data-cookie-notice]');
  });

  it('offers Join the List as a full-width tinted tile that opens the homepage window (owner, 2026-09-15, Option C)', () => {
    expect(PAGE).toContain('className={`${tileClass} col-span-2`}');
    // Never gold: the review ask stays the one filled button on the card.
    expect(PAGE).not.toMatch(/CardJoinListButton[^/]*gold-button/);
    const button = readFileSync(join(process.cwd(), 'src/components/card/CardJoinListButton.tsx'), 'utf8');
    expect(button).toContain("import('@/components/home/HomeSubscribeModal')");
    expect(button).toContain("'Unirse a la Lista' : 'Join the List'");
  });

  it('uses the cross-platform sms body form and the shared social URLs', () => {
    expect(PAGE).toContain('?&body=');
    expect(PAGE).toContain('INSTAGRAM_URL');
    expect(PAGE).toContain('FACEBOOK_URL');
    // The named constants feed sameAs too — one place for each URL.
    expect(SAME_AS).toContain(INSTAGRAM_URL);
    expect(SAME_AS).toContain(FACEBOOK_URL);
  });
});

describe('hoursSegmentsCompact — day/time pairs for the bolded hours line', () => {
  it('compresses the default week to one segment in both languages', () => {
    expect(hoursSegmentsCompact(DEFAULT_STORE_HOURS, false)).toEqual([{ days: 'Mon–Sat', times: '11am–3pm' }]);
    expect(hoursSegmentsCompact(DEFAULT_STORE_HOURS, true)).toEqual([{ days: 'Lun–Sáb', times: '11 a.m. – 3 p.m.' }]);
  });

  it('splits on a time change and keeps single days as one abbreviation', () => {
    const real = schedule({
      Monday: ['11:00', '15:00'],
      Tuesday: ['11:00', '15:00'],
      Wednesday: ['11:00', '15:00'],
      Thursday: ['11:00', '15:00'],
      Friday: ['11:00', '15:00'],
      Saturday: ['11:00', '16:00'],
    });
    expect(hoursSegmentsCompact(real, false)).toEqual([
      { days: 'Mon–Fri', times: '11am–3pm' },
      { days: 'Sat', times: '11am–4pm' },
    ]);
    expect(hoursSegmentsCompact(real, true)).toEqual([
      { days: 'Lun–Vie', times: '11 a.m. – 3 p.m.' },
      { days: 'Sáb', times: '11 a.m. – 4 p.m.' },
    ]);
  });

  it('keeps non-zero minutes and returns nothing for an all-closed week', () => {
    expect(hoursSegmentsCompact(schedule({ Tuesday: ['11:30', '15:45'] }), true)).toEqual([
      { days: 'Mar', times: '11:30 a.m. – 3:45 p.m.' },
    ]);
    expect(hoursSegmentsCompact(schedule({}), false)).toEqual([]);
  });
});
