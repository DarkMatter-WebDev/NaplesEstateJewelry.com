import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { pageMetadata } from '@/lib/seo';
import type { CardHolder } from '@/lib/card-holders';
import { AppIcon } from '@/components/AppIcon';
import ShowroomAddress from '@/components/ShowroomAddress';
import CopyAddressButton from '@/components/CopyAddressButton';
import CardTodayHours from '@/components/card/CardTodayHours';
import CardJoinListButton from '@/components/card/CardJoinListButton';
import StorefrontPhoto from '@/components/StorefrontPhoto';
import {
  FACEBOOK_URL,
  GOOGLE_REVIEW_URL,
  INSTAGRAM_URL,
  byAppointmentLabel,
  hoursRows,
  hoursSegmentsCompact,
  mapsUrl,
  phoneHours,
} from '@/lib/business-location';
import { getStoreHours } from '@/lib/store-hours';

/**
 * The landing page printed (as a QR code) on the business cards — ONE
 * component behind every card URL (`/card` = the owner, `/kittcard` = the
 * second employee; the
 * routes are two-line wrappers, the per-person values live in
 * `lib/card-holders.ts`). Split out 2026-09-16 so a second employee's cards
 * could carry their own URL without a second copy of this page to keep in
 * step; only the name and number may differ between cards.
 *
 * Why a page and not a redirect: cards are printed once, destinations change.
 * The URL on the card never moves; everything behind it is editable here or
 * in the admin panel (hours). Owner-approved mockup 2026-09-03, rev 3.
 *
 * Design rules, all deliberate:
 *
 * - **No site header, no footer, no breadcrumb.** Someone who just scanned a
 *   card wants one of four taps; the page IS the buttons. The domain link at
 *   the bottom is the way into the full site.
 * - **Slim English/Español toggle at the very top** (owner, 2026-09-03): the
 *   QR prints `/card` only, so a Spanish-speaking customer switches here.
 * - **Review is the gold button** (owner's pick): the card usually changes
 *   hands right after a sale, which is when a review ask lands. Call is the
 *   dark pill, as on the homepage Visit Us block.
 * - **Read Our Reviews sits directly under it** (owner, 2026-09-08): an
 *   outline pill to the site's own `/reviews` page, so the gold ask stays the
 *   one filled button. A paired half-width row was measured and rejected —
 *   "Leave a Review" was already 3px too wide for its half at 375px, and the
 *   Spanish label 25px too wide.
 * - **Join the List is a full-width tile under the grid** (owner, 2026-09-15,
 *   mockup Option C): tinted like the sign-up window's "Text-only deals"
 *   box, it opens the homepage's Email / Text / Both window
 *   (`CardJoinListButton`, the page's only client piece). To pay for the
 *   extra row the page was tightened the same night (owner ask): language
 *   bar 39 → 31px, pills 46 → 42px with 6px gaps, logo 44 → 40px, tiles 4px
 *   shorter. Measurements in `CHANGELOG.md` 2026-09-15 (late night, 3).
 * - **The bottom button says where it goes** ("View Full Website & Shop",
 *   owner, 2026-09-08). Spanish drops "Completo" in place: the full phrase
 *   measured 252 of the 256px available at 375px.
 * - **The email address is a readable line under the phone hours** (owner,
 *   2026-09-24, mockup Option B over a "Text | Email" half-pill row): it is the
 *   one contact a person can copy or type later, not only tap. The page did
 *   not grow — the storefront thumbnail went 16:9 → 2:1 (and 4px closer to the
 *   address) to pay for the line, to the pixel at 375px. The address lives in
 *   `card-holders.ts` like the name and number.
 * - **Text is prefilled** ("Hi <name>, I have your card …"): lowers the hurdle
 *   for someone unsure how to start, and tells the owner the lead came from a
 *   card — the site has no scan analytics. `sms:` + `?&body=` is the one
 *   form both iOS and Android honour.
 * - **noindex and OFF the sitemap.** A thin utility page must never compete
 *   with `/contact` or `/sell` in search. Guarded by `card-page.test.ts`.
 * - Every fact on the page comes from `business-location.ts` and the
 *   admin-editable hours — nothing here can drift from the rest of the site.
 */

type CardLandingProps = {
  locale: string;
  holder: CardHolder;
};

/** The route's metadata: same title/description for every card, the holder's own path. */
export function cardMetadata(holder: CardHolder, locale: string): Metadata {
  const isEs = locale === 'es';
  return {
    ...pageMetadata({
      title: isEs ? 'Tarjeta de Contacto' : 'Contact Card',
      description: isEs
        ? 'Llame, envíe un mensaje, obtenga indicaciones o deje una reseña — Naples Estate Jewelry, 6240 Shirley St, Ste 104, Naples, FL.'
        : 'Call, text, get directions, or leave a review — Naples Estate Jewelry, 6240 Shirley St, Ste 104, Naples, FL.',
      path: holder.path,
      locale,
    }),
    // The QR landing page is a utility, not content: never index it.
    robots: { index: false, follow: false },
  };
}

/** The primary pills: full width, thumb-height, a step larger than the site's default pill. */
const BIG_BUTTON: CSSProperties = {
  width: '100%',
  minHeight: '2.6rem',
  fontSize: '0.74rem',
  gap: '0.6rem',
};

function InstagramGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function FacebookGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

export default async function CardLanding({ locale, holder }: CardLandingProps) {
  const isEs = locale === 'es';
  const schedule = await getStoreHours();
  const rows = hoursRows(schedule, isEs);
  const segments = hoursSegmentsCompact(schedule, isEs);

  const smsBody = isEs
    ? `Hola ${holder.firstName}, tengo su tarjeta y quisiera preguntar sobre `
    : `Hi ${holder.firstName}, I have your card and I’d like to ask about `;
  // `?&body=`: iOS wants `&`, Android wants `?`; this form satisfies both.
  const smsHref = `sms:${holder.phoneDigits}?&body=${encodeURIComponent(smsBody)}`;
  const phoneTel = `tel:${holder.phoneDigits}`;
  // Prefilled subject for the same reason the text is prefilled: the site has
  // no scan analytics, so the message itself says the lead came from a card.
  const mailSubject = isEs ? 'Su tarjeta — Naples Estate Jewelry' : 'Your card — Naples Estate Jewelry';
  const mailHref = `mailto:${holder.email}?subject=${encodeURIComponent(mailSubject)}`;

  const prefix = isEs ? '/es' : '';
  const tileClass =
    'flex items-center justify-center gap-2 rounded-xl border px-2 py-2.5 text-[0.7rem] font-semibold uppercase tracking-[0.08em] no-underline';
  const tileStyle: CSSProperties = {
    background: 'var(--color-surface-container-lowest)',
    borderColor: 'var(--color-outline-variant)',
    color: 'var(--color-on-surface)',
    fontFamily: 'var(--font-label)',
  };
  const tileIconStyle: CSSProperties = { color: 'var(--color-primary)' };

  return (
    // `data-no-cookie-notice`: the sitewide banner is hidden on this page by a
    // `body:has(main[data-no-cookie-notice])` rule in globals.css (owner,
    // 2026-09-03). Server-rendered and JS-free, so there is no flash; the
    // banner still shows on every page the visitor taps through to.
    <main className="flex flex-1 flex-col" data-no-cookie-notice style={{ background: 'var(--color-background)' }}>
      {/* Language toggle — slim, at the very top, both languages always
          visible. Next <Link>, not a plain anchor (owner, 2026-09-04: the
          full-document reload showed as a blip/flash on the switch). A client
          navigation keeps the document and swaps the tree; the alternate
          locale's route is prefetched (it is one tiny static page), so the
          switch is instant. The header's own language link works the same way. */}
      <nav
        aria-label={isEs ? 'Idioma' : 'Language'}
        className="flex items-stretch justify-center border-b"
        style={{ borderColor: 'var(--color-outline-variant)', background: 'var(--color-surface-container-lowest)' }}
      >
        {(['en', 'es'] as const).map((lang) => {
          const current = lang === locale;
          return (
            <Link
              key={lang}
              href={lang === 'es' ? `/es${holder.path}` : holder.path}
              prefetch
              hrefLang={lang}
              lang={lang}
              aria-current={current ? 'page' : undefined}
              className="px-6 py-1.5 text-[0.7rem] font-bold uppercase tracking-[0.16em] no-underline"
              style={{
                fontFamily: 'var(--font-label)',
                color: current ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
                borderBottom: `2px solid ${current ? 'var(--color-primary)' : 'transparent'}`,
                marginBottom: '-1px',
              }}
            >
              {lang === 'es' ? 'Español' : 'English'}
            </Link>
          );
        })}
      </nav>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-6 pt-5">
        {/* Brand — name above the mark (owner, 2026-09-03), in the header's
            Caslon uppercase so it reads as the same wordmark. */}
        <div className="flex flex-col items-center text-center">
          {/* The wordmark is a home link, as on every other page. */}
          <Link href={prefix || '/'} prefetch={false} className="flex flex-col items-center no-underline" style={{ color: 'inherit' }}>
          <h1
            className="text-[1.2rem] uppercase leading-none tracking-[0.08em]"
            style={{ color: 'var(--color-on-surface)', fontFamily: 'var(--font-headline)' }}
          >
            Naples Estate Jewelry
          </h1>
          <Image
            src="/assets/images/branding/nav-logo.webp"
            alt=""
            width={157}
            height={120}
            priority
            className="mt-1.5 h-10 w-auto"
          />
          </Link>
          {/* Two deliberate lines: the full phrase cannot fit one line at
              375px at this size, and a wrap leaves the separator dangling. */}
          <p
            className="mt-2 text-[0.8125rem] font-bold uppercase leading-snug tracking-[0.12em]"
            style={{ color: 'var(--color-on-surface)', fontFamily: 'var(--font-label)' }}
          >
            {isEs ? 'Compradores de Oro, Plata y Joyas' : 'Gold, Sterling & Jewelry Buyers'}
            <span
              className="mt-0.5 block text-[0.7rem] font-semibold tracking-[0.18em]"
              style={{ color: 'var(--color-on-surface-variant)' }}
            >
              Naples, FL
            </span>
          </p>
        </div>

        {/* Hours */}
        <div className="mt-4 text-center">
          <CardTodayHours
            rows={rows}
            openLabel={isEs ? 'Abierto hoy' : 'Open today'}
            closedLabel={isEs ? 'Cerrado hoy' : 'Closed today'}
            badgeLabel={isEs ? 'Hoy' : 'Today'}
          />
          <p
            className="mt-1 flex flex-wrap items-center justify-center gap-x-1.5 text-[0.8125rem]"
            style={{ color: 'var(--color-on-surface-variant)' }}
          >
            {/* Separators TRAIL each segment rather than lead the next one:
                the Spanish line wraps at 375px, and a wrapped line must not
                start with a lone middot. */}
            {segments.map((segment) => (
              <span key={segment.days} className="whitespace-nowrap">
                <b className="font-bold" style={{ color: 'var(--color-on-surface)' }}>{segment.days}</b>{' '}
                {segment.times}
                <span aria-hidden="true" className="ml-1.5 opacity-60">·</span>
              </span>
            ))}
            <span className="whitespace-nowrap">{byAppointmentLabel(isEs)}</span>
          </p>
          {/* When the phone is answered — a different fact from the showroom
              hours above (owner, 2026-09-08, "Option C": GBP hours stay the
              showroom's; phone availability is said in words here and in the
              GBP description). Same muted size as the hours line; the phone
              glyph marks it as a different fact. Mockup approved. */}
          {(() => {
            const ph = phoneHours(isEs, 'compact');
            return (
              <p
                className="mt-1.5 flex items-center justify-center gap-1.5 text-[0.78rem]"
                style={{ color: 'var(--color-on-surface-variant)' }}
              >
                <AppIcon name="call" className="text-[0.85rem]" style={{ color: 'var(--color-primary)' }} />
                <span>
                  {ph.before}
                  <b className="font-semibold" style={{ color: 'var(--color-on-surface)' }}>{ph.time}</b>
                  {ph.after}
                </span>
              </p>
            );
          })()}
          {/* Email — the one contact on the page a person can READ, not only
              tap: someone who wants to write from a computer later needs the
              address itself (owner, 2026-09-24, mockup Option B; the half-pill
              "Text | Email" row was Option A and lost). Same muted size as the
              two lines above it, the mail glyph in gold marks it as a link.
              ⛔ The page did not get taller: this line (~23px at 375px) is
              paid for by the storefront photo below, cropped 16:9 → 2:1 and
              pulled up 4px — measured in CHANGELOG.md 2026-09-24. */}
          <a
            href={mailHref}
            className="mt-1 flex items-center justify-center gap-1.5 text-[0.78rem] font-semibold no-underline"
            style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}
          >
            <AppIcon name="mail" className="text-[0.85rem]" />
            <span
              style={{
                textDecoration: 'underline',
                textUnderlineOffset: '2px',
                textDecorationColor: 'color-mix(in srgb, var(--color-primary) 45%, transparent)',
              }}
            >
              {holder.email}
            </span>
          </a>
        </div>

        {/* The primary taps */}
        <div className="mt-3 flex flex-col gap-1.5">
          <a href={phoneTel} className="dark-button" style={BIG_BUTTON}>
            <AppIcon name="call" className="text-[1.15rem]" />
            {isEs ? `Llamar ${holder.phoneDisplay}` : `Call ${holder.phoneDisplay}`}
          </a>
          <a href={smsHref} className="outline-button" style={BIG_BUTTON}>
            <AppIcon name="sms" className="text-[1.15rem]" />
            {isEs ? 'Mensaje de Texto' : `Text ${holder.firstName}`}
          </a>
          <a href={GOOGLE_REVIEW_URL} target="_blank" rel="noopener noreferrer" className="gold-button" style={BIG_BUTTON}>
            <AppIcon name="star" className="text-[1.15rem]" />
            {isEs ? 'Dejar una Reseña en Google' : 'Leave a Google Review'}
          </a>
          {/* Read the reviews, right under the ask to leave one. An internal
              page, so a Next Link like the tiles; outline, not gold, so the
              review ask keeps the hierarchy. */}
          <Link href={`${prefix}/reviews`} prefetch={false} className="outline-button" style={BIG_BUTTON}>
            <AppIcon name="forum" className="text-[1.15rem]" />
            {isEs ? 'Leer Nuestras Reseñas' : 'Read Our Reviews'}
          </Link>
        </div>

        {/* Secondary links */}
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <Link href={`${prefix}/sell`} prefetch={false} className={tileClass} style={tileStyle}>
            <AppIcon name="diamond" className="text-[1.25rem]" style={tileIconStyle} />
            {isEs ? 'Qué Compramos' : 'What We Buy'}
          </Link>
          <Link href={`${prefix}/shop`} prefetch={false} className={tileClass} style={tileStyle}>
            <AppIcon name="shopping_bag" className="text-[1.25rem]" style={tileIconStyle} />
            {isEs ? 'Tienda' : 'Shop'}
          </Link>
          <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className={tileClass} style={tileStyle}>
            <span style={tileIconStyle}><InstagramGlyph /></span>
            Instagram
          </a>
          <a href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer" className={tileClass} style={tileStyle}>
            <span style={tileIconStyle}><FacebookGlyph /></span>
            Facebook
          </a>
          {/* Join the List — full-width, tinted like the sign-up window's
              "Text-only deals" box; opens that window (Email / Text / Both). */}
          <CardJoinListButton
            locale={locale}
            className={`${tileClass} col-span-2`}
            style={{ ...tileStyle, background: '#fffbe8', borderColor: '#e9c349' }}
          />
        </div>

        {/* Address — pinned to the bottom of the screen on a tall phone. The
            landmark line is included on purpose (approved in the mockup): the
            sign out front is the other business's, and this page is read by
            someone standing in the parking lot. */}
        <div className="mt-5 text-center text-[0.9rem] leading-relaxed" style={{ color: 'var(--color-on-surface)' }}>
          <div className="flex items-start justify-center gap-2">
            <ShowroomAddress locale={locale} />
            <CopyAddressButton locale={locale} className="mt-0.5" />
          </div>
          {/* The door, for someone standing in the parking lot (owner,
              2026-09-08; no caption). Lazy — the buttons above must not wait
              for it — and a thumbnail, not a hero. 16:9 until 2026-09-24, now
              2:1 with a 4px smaller top margin: those ~25px are what paid for
              the email line above the buttons (owner: the line must not add
              height to the page). The crop keeps the bottom of the frame, so
              the door and the curb number stay in the picture. */}
          <StorefrontPhoto locale={locale} aspect="2:1" className="mt-2" sizes="(min-width: 448px) 28rem, 100vw" />
          {/* Directions live with the address they point at (owner, 2026-09-03). */}
          <a
            href={mapsUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="outline-button mt-3"
            style={{ width: '100%', minHeight: '2.6rem', fontSize: '0.72rem', gap: '0.5rem' }}
          >
            <AppIcon name="location_on" className="text-[1.05rem]" />
            {isEs ? 'Cómo Llegar' : 'Get Directions'}
          </a>
        </div>

        {/* An unmistakable way off the card and into the full site (owner ask).
            The label names both destinations because the Shop tile above is
            easy to miss; the Spanish drops "Completo" in place (measured, see
            the header comment). */}
        <Link
          href={prefix || '/'}
          prefetch={false}
          className="outline-button mt-2.5"
          style={{ width: '100%', minHeight: '2.6rem', fontSize: '0.72rem', gap: '0.5rem' }}
        >
          {isEs ? 'Ver Sitio Web y Tienda' : 'View Full Website & Shop'}
          <AppIcon name="trending_flat" className="text-[1rem]" />
        </Link>
      </div>
    </main>
  );
}
