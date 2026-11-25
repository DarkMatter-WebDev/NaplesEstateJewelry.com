import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { pageMetadata } from '@/lib/seo';
import { CARD_HOLDERS } from '@/lib/card-holders';
import { MAGNET_DIRECTORY_ID, MAGNET_LANDING_PATH, type MagnetTruckPhoto } from '@/lib/magnet-landing';
import { AppIcon } from '@/components/AppIcon';
import ShowroomAddress from '@/components/ShowroomAddress';
import CopyAddressButton from '@/components/CopyAddressButton';
import CardTodayHours from '@/components/card/CardTodayHours';
import CardJoinListButton from '@/components/card/CardJoinListButton';
import ScanBeacon from '@/components/ScanBeacon';
import StorefrontPhoto from '@/components/StorefrontPhoto';
import ScrollCue from '@/components/magnet/ScrollCue';
import { byAppointmentLabel, hoursRows, hoursSegmentsCompact, mapsUrl, phoneHours } from '@/lib/business-location';
import { getStoreHours } from '@/lib/store-hours';

/**
 * The landing page behind the QR code on the vehicle magnets (`/magnet`).
 * Owner-approved 2026-11-23 — mockup 4, "C1": Option B's layout with the
 * business name on top, logo beside it, "Naples, FL" dropped, and a floating
 * "more below" arrow. Live only once the truck photo is set
 * (`lib/magnet-landing.ts`); until then /magnet still 302s to /free-evaluation.
 *
 * Built like /card (`components/card/CardLanding.tsx`), on purpose:
 *
 * - **No site header, footer or cookie notice; noindex, off the sitemap.** A
 *   person who just scanned a truck wants one tap, and a thin utility page must
 *   never compete with /free-evaluation or /sell in search.
 * - **The truck first, then Chris.** The photo tells the scanner they landed
 *   in the right place; the round face on its edge and "Hi, I'm Chris" make it
 *   personal. The facts in the hello are the ones the /free-evaluation hero
 *   already states — nothing new is claimed here.
 * - **Schedule a Free Evaluation is the gold button** and opens
 *   /free-evaluation (where the magnets landed before this page). Call is the
 *   dark pill, Text the outline — the three fit the first iPhone screen
 *   together with today's hours (the strip is 25:8 to make that so).
 * - **Text is prefilled** ("… I saw your truck …"): the owner knows the lead
 *   came from the magnet; the scan counter (Admin → Insights) only counts.
 * - **The directory is for sellers**: What We Buy · Today's Gold Price · Our
 *   Reviews · Shop · Join the List. No social tiles (unlike /card).
 * - Every fact (hours, address, phone) comes from `business-location.ts`, the
 *   admin-editable hours and `card-holders.ts` — nothing here can drift.
 */

/** Same as /card's primary pills. */
const BIG_BUTTON: CSSProperties = {
  width: '100%',
  minHeight: '2.6rem',
  fontSize: '0.74rem',
  gap: '0.6rem',
};

const OWNER = CARD_HOLDERS.card;

export function magnetMetadata(locale: string): Metadata {
  const isEs = locale === 'es';
  return {
    ...pageMetadata({
      title: isEs ? 'Escaneó Mi Camioneta' : 'You Scanned My Truck',
      description: isEs
        ? 'Agende una tasación gratuita, llame o envíe un mensaje — Naples Estate Jewelry, 6240 Shirley St, Ste 104, Naples, FL.'
        : 'Schedule a free evaluation, call, or text — Naples Estate Jewelry, 6240 Shirley St, Ste 104, Naples, FL.',
      path: MAGNET_LANDING_PATH,
      locale,
    }),
    // The QR landing page is a utility, not content: never index it.
    robots: { index: false, follow: false },
  };
}

export default async function MagnetLanding({ locale, truck }: { locale: string; truck: MagnetTruckPhoto }) {
  const isEs = locale === 'es';
  const prefix = isEs ? '/es' : '';
  const schedule = await getStoreHours();
  const rows = hoursRows(schedule, isEs);
  const segments = hoursSegmentsCompact(schedule, isEs);

  const smsBody = isEs
    ? `Hola ${OWNER.firstName}, vi su camioneta y quisiera preguntar sobre `
    : `Hi ${OWNER.firstName}, I saw your truck and I’d like to ask about `;
  // `?&body=`: iOS wants `&`, Android wants `?`; this form satisfies both (as on /card).
  const smsHref = `sms:${OWNER.phoneDigits}?&body=${encodeURIComponent(smsBody)}`;

  const tileClass =
    'lift-tile flex items-center justify-center gap-2 rounded-xl border px-2 py-2.5 text-center text-[0.7rem] font-semibold uppercase leading-tight tracking-[0.08em] no-underline';
  const tileStyle: CSSProperties = {
    background: 'var(--color-surface-container-lowest)',
    borderColor: 'var(--color-outline-variant)',
    color: 'var(--color-on-surface)',
    fontFamily: 'var(--font-label)',
  };
  const tileIconStyle: CSSProperties = { color: 'var(--color-primary)' };
  const tiles = [
    { href: `${prefix}/sell`, icon: 'diamond', label: isEs ? 'Qué Compramos' : 'What We Buy' },
    { href: `${prefix}/spot-prices`, icon: 'monitoring', label: isEs ? 'Precio del Oro Hoy' : 'Today’s Gold Price' },
    { href: `${prefix}/reviews`, icon: 'forum', label: isEs ? 'Nuestras Reseñas' : 'Our Reviews' },
    { href: `${prefix}/shop`, icon: 'shopping_bag', label: isEs ? 'Tienda' : 'Shop' },
  ] as const;

  return (
    // `data-no-cookie-notice`: hidden on this page, as on /card (globals.css).
    <main className="flex flex-1 flex-col" data-no-cookie-notice style={{ background: 'var(--color-background)' }}>
      {/* One visit per tab → Admin → Insights ("Car magnets"; time only). */}
      <ScanBeacon source="magnet" />

      {/* Language toggle — the magnet prints /magnet only (same as /card). */}
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
              href={lang === 'es' ? `/es${MAGNET_LANDING_PATH}` : MAGNET_LANDING_PATH}
              prefetch
              hrefLang={lang}
              lang={lang}
              aria-current={current ? 'page' : undefined}
              className="hover-text px-6 py-1.5 text-[0.7rem] font-bold uppercase tracking-[0.16em] no-underline"
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

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        {/* Brand — ONE row: the octopus beside the name and the line under it
            (owner: saves height; "Naples, FL" dropped, the name says Naples). */}
        <Link
          href={prefix || '/'}
          prefetch={false}
          className="hover-dim flex items-center justify-center gap-2.5 px-4 py-2.5 no-underline"
          style={{ color: 'inherit' }}
        >
          <Image
            src="/assets/images/branding/nav-logo.webp"
            alt=""
            width={157}
            height={120}
            priority
            className="h-[42px] w-auto flex-shrink-0"
          />
          <span className="text-left">
            <span
              className="block whitespace-nowrap text-[1.06rem] uppercase leading-none tracking-[0.06em]"
              style={{ color: 'var(--color-on-surface)', fontFamily: 'var(--font-headline)' }}
            >
              Naples Estate Jewelry
            </span>
            <span
              className="mt-[5px] block text-[0.7rem] font-bold uppercase leading-tight tracking-[0.12em]"
              style={{ color: 'var(--color-on-surface)', fontFamily: 'var(--font-label)' }}
            >
              {isEs ? 'Compradores de Oro, Plata y Joyas' : 'Gold, Sterling & Jewelry Buyers'}
            </span>
          </span>
        </Link>

        {/* The truck — a 10:3 strip (MAGNET_TRUCK_STRIP_RATIO), edge to edge,
            with Chris's face on its bottom edge. The strip's height is what
            keeps the three buttons and today's hours on the first iPhone
            screen (mockup 3–4); the owner took it from 25:8 down to 10:3
            (117 px on a 390 px phone) on truck mockup 4, 2026-11-24. */}
        <div className="relative">
          <div className="relative aspect-[10/3] w-full overflow-hidden" style={{ background: 'var(--color-surface-container)' }}>
            <Image
              src={truck.src}
              alt={isEs ? 'La camioneta de Naples Estate Jewelry' : 'The Naples Estate Jewelry truck'}
              fill
              priority
              sizes="(min-width: 448px) 28rem, 100vw"
              className="object-cover"
              style={{ objectPosition: truck.position }}
            />
          </div>
          <Image
            src="/assets/images/pages/chris-owner-face.webp"
            alt={isEs ? 'Chris, propietario' : 'Chris, the owner'}
            width={68}
            height={68}
            priority
            className="absolute bottom-[-34px] left-1/2 h-[68px] w-[68px] -translate-x-1/2 rounded-full object-cover"
            style={{ border: '3px solid #ffffff', boxShadow: '0 6px 16px rgba(0, 0, 0, 0.18)' }}
          />
        </div>

        <div className="flex flex-1 flex-col px-6 pb-6">
          {/* The hello — the /free-evaluation hero's own facts, shortened. */}
          <div className="mt-[42px] text-center">
            <h1 className="text-[1.25rem] leading-tight" style={{ color: 'var(--color-on-surface)', fontFamily: 'var(--font-headline)' }}>
              {isEs ? 'Hola, soy Chris — acaba de escanear mi camioneta.' : 'Hi, I’m Chris — you just scanned my truck.'}
            </h1>
            <p className="mt-1.5 px-1.5 text-[0.84rem] leading-snug" style={{ color: 'var(--color-on-surface-variant)' }}>
              {isEs
                ? 'Más de 15 años tasando joyería de patrimonio en el suroeste de Florida. Oro, plata, diamantes, relojes, monedas o una colección completa — sin obligación de vender.'
                : '15+ years appraising estate jewelry across Southwest Florida. Gold, silver, diamonds, watches, coins or a whole collection — no obligation to sell.'}
            </p>
          </div>

          {/* The three taps */}
          {/* `data-cue-avoid`: the "more below" arrow never sits on these
              (ScrollCue's clearSpot) — the buttons, then the hours below. */}
          <div className="mt-3 flex flex-col gap-1.5" data-cue-avoid="box">
            <Link href={`${prefix}/free-evaluation`} prefetch={false} className="gold-button" style={BIG_BUTTON}>
              <AppIcon name="event_available" className="text-[1.15rem]" />
              {isEs ? 'Agendar Tasación Gratuita' : 'Schedule a Free Evaluation'}
            </Link>
            <a href={`tel:${OWNER.phoneDigits}`} className="dark-button" style={BIG_BUTTON}>
              <AppIcon name="call" className="text-[1.15rem]" />
              {isEs ? `Llamar ${OWNER.phoneDisplay}` : `Call ${OWNER.phoneDisplay}`}
            </a>
            <a href={smsHref} className="outline-button" style={BIG_BUTTON}>
              <AppIcon name="sms" className="text-[1.15rem]" />
              {isEs ? 'Mensaje de Texto' : `Text ${OWNER.firstName}`}
            </a>
          </div>

          {/* Hours — the same three lines as /card, minus the email line. */}
          <div className="mt-3 text-center" data-cue-avoid="text">
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
              {segments.map((segment) => (
                <span key={segment.days} className="whitespace-nowrap">
                  <b className="font-bold" style={{ color: 'var(--color-on-surface)' }}>{segment.days}</b>{' '}
                  {segment.times}
                  <span aria-hidden="true" className="ml-1.5 opacity-60">·</span>
                </span>
              ))}
              <span className="whitespace-nowrap">{byAppointmentLabel(isEs)}</span>
            </p>
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
          </div>

          {/* The directory — where the "more below" arrow glides to. */}
          <div id={MAGNET_DIRECTORY_ID} className="mt-3 grid scroll-mt-3 grid-cols-2 gap-2.5">
            {tiles.map((tile) => (
              <Link key={tile.href} href={tile.href} prefetch={false} className={tileClass} style={tileStyle}>
                <AppIcon name={tile.icon} className="flex-shrink-0 text-[1.25rem]" style={tileIconStyle} />
                {tile.label}
              </Link>
            ))}
            <CardJoinListButton
              locale={locale}
              className={`${tileClass} col-span-2`}
              style={{ ...tileStyle, background: '#fffbe8', borderColor: '#e9c349' }}
            />
          </div>

          {/* Address, the door, directions — as on /card. */}
          <div className="mt-5 text-center text-[0.9rem] leading-relaxed" style={{ color: 'var(--color-on-surface)' }}>
            <div className="flex items-start justify-center gap-2">
              <ShowroomAddress locale={locale} />
              <CopyAddressButton locale={locale} className="mt-0.5" />
            </div>
            <StorefrontPhoto locale={locale} aspect="2:1" className="mt-2" sizes="(min-width: 448px) 28rem, 100vw" />
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
      </div>

      <ScrollCue targetId={MAGNET_DIRECTORY_ID} label={isEs ? 'Ver más abajo' : 'Scroll down for more'} />
    </main>
  );
}
