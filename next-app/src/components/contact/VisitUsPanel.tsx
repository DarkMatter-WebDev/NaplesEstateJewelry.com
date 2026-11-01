import {
  cityLine,
  mapsUrl,
  phoneHoursLabel,
  streetLine,
} from '@/lib/business-location';
import { AppIcon } from '@/components/AppIcon';
import ShowroomMap from '@/components/ShowroomMap';
import ShowroomHours from '@/components/ShowroomHours';
import StorefrontPhoto from '@/components/StorefrontPhoto';
import CopyAddressButton from '@/components/CopyAddressButton';
import { PageContainer } from '@/components/layout/ResponsiveLayout';
import { SocialFollowTiles } from '@/components/SocialFollow';

interface Props {
  locale?: string;
}

/**
 * The showroom's address and hours, for the contact page.
 *
 * Server component apart from the map's zoom buttons and the today badge — it
 * is otherwise static text and must not cost the contact page a client bundle.
 * All strings come from `lib/business-location`.
 *
 * ## Layout
 *
 * Two columns, matching the homepage "Visit Us" block (2026-08-23, owner
 * request): details on the left, orientation and the map on the right. The two
 * blocks are the same information, and a visitor moving between them should not
 * have to re-learn where to look. Keep them in step — if one changes shape, so
 * does the other.
 *
 * ⚠️ The shared-suite landmark ("inside Sharon Lynch Collections") was REMOVED
 * from this panel on 2026-08-23 at the owner's request, along with the homepage
 * block and the order-email footer. A comment here previously called it
 * load-bearing and said "do not trim it to just the street address" — that was
 * a real concern (the sign out front is the other business's) and it has been
 * overridden deliberately, not lost. It still appears on the About page via
 * `wayfindingSentence()`. Do not re-add it here without asking.
 */
export default function VisitUsPanel({ locale = 'en' }: Props) {
  const isEs = locale === 'es';

  return (
    <section
      className="border-t"
      style={{ borderColor: 'var(--color-outline-variant)', background: 'var(--color-surface-container-low)' }}
      aria-labelledby="visit-us-heading"
    >
      {/* `PageContainer max="content"`, never a hand-rolled wide div: the shared
          container carries the `ultrawide-page` opt-in that
          `lib/__tests__/ultrawide-layout.test.ts` requires of any large canvas.
          It caught exactly that here. It also matches the homepage block this
          panel mirrors.

          ⚠️ That guard does NOT strip comments, so naming the raw Tailwind
          width class in prose anywhere in this file fails it — which is how
          this comment came to be worded around it. */}
      <PageContainer max="content" className="py-14 md:py-20">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-start lg:gap-16">

          {/* LEFT — what a visitor acts on. */}
          <div>
            <p
              className="flex items-center gap-3 text-[0.65rem] font-bold uppercase tracking-[0.32em]"
              style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}
            >
              <span aria-hidden="true" className="inline-block h-px w-8 flex-shrink-0" style={{ background: 'var(--color-primary)' }} />
              {isEs ? 'Visítenos' : 'Visit Us'}
            </p>

            <h2
              id="visit-us-heading"
              className="responsive-title-md mt-4 font-bold tracking-tight"
              style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)', lineHeight: 1.06 }}
            >
              {isEs ? 'Nuestro Salón' : 'Our Naples'}
              <span className="block" style={{ color: 'var(--color-primary)' }}>
                {isEs ? 'en Naples.' : 'Showroom.'}
              </span>
            </h2>

            {/* ⚠️ The copy button is a SIBLING of the maps link and sits OUTSIDE
                the <address>: a <button> nested in an <a> is invalid HTML, and
                the element is the address itself — a control is not part of one. */}
            <div className="mt-8 flex items-start gap-2">
              <address className="not-italic">
                <a
                  href={mapsUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover-underline-grow text-[1.35rem] font-bold leading-tight sm:text-2xl"
                  style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
                >
                  {streetLine()}
                </a>
                <span className="mt-2 block text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                  {cityLine()}
                </span>
              </address>
              <CopyAddressButton locale={locale} className="mt-1" />
            </div>

            {/* All seven days, with today marked after mount in the SHOWROOM's
                timezone. This is the page someone opens to ask "are you open
                today", so it is the surface that most earns the badge. */}
            <ShowroomHours
              locale={locale}
              layout="rows"
              highlightToday
              className="mt-8"
            />

            {/* ⚠️ Every one of these must be TRUE and traceable to something the
                site already says, and this row must stay identical to the
                homepage's. "Free parking" is deliberately absent: true, but the
                owner's call is that it is assumed in this area. */}
            <ul
              className="mt-8 flex flex-wrap gap-x-6 gap-y-2.5 border-t pt-6"
              style={{ borderColor: 'var(--color-outline-variant)' }}
            >
              {(isEs
                ? ['Sin cita previa', 'Citas privadas', 'Recogida local gratis', 'Visitas a domicilio a pedido']
                : ['Walk-Ins Welcome', 'Private Appointments', 'Free Local Pickup', 'Home Visits on Request']
              ).map((feature) => (
                <li
                  key={feature}
                  className="text-[0.62rem] font-bold uppercase tracking-[0.16em]"
                  style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}
                >
                  {feature}
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-wrap gap-3">
              <a href={mapsUrl()} target="_blank" rel="noopener noreferrer" className="gold-button">
                {isEs ? 'Cómo Llegar' : 'Get Directions'}
              </a>
              <a href="tel:2394048505" className="dark-button">
                <AppIcon name="call" />
                (239) 404-8505
              </a>
            </div>
            <p className="mt-3 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>{phoneHoursLabel(isEs)}</p>

            {/* Follow Us (owner, 2026-11-01). Here, under the showroom details —
                never at the top of /contact, where it would push the message
                form down. 2 × 2 at every width: the column is narrow. */}
            <SocialFollowTiles isEs={isEs} label={isEs ? 'Síganos' : 'Follow Us'} align="start" twoColumn className="mt-7" />
          </div>

          {/* RIGHT — orientation, then the map. */}
          <div>
            <p className="responsive-copy" style={{ color: 'var(--color-on-surface-variant)' }}>
              {isEs
                ? 'Estamos en Shirley St, justo al norte de Pine Ridge Rd, con estacionamiento en la puerta. Pase durante el horario de atención, o llámenos antes y concertamos una cita privada.'
                : 'We’re on Shirley St just north of Pine Ridge Rd, with parking right at the door. Walk in during showroom hours, or call ahead and we’ll set a private appointment.'}
            </p>

            {/* Still square and still lazy — both recorded decisions. This page
                is the one someone opens to answer "where are you", so it gets a
                slightly larger cap than the homepage's. */}
            {/* The door itself, above the pin (owner, 2026-09-08; no caption). */}
            <StorefrontPhoto locale={locale} aspect="4:3" className="mx-auto mt-7 max-w-[34rem]" sizes="(min-width: 1024px) 34rem, 100vw" />
            <ShowroomMap locale={locale} maxWidth="34rem" className="mt-5" />

            <p className="responsive-copy mt-7" style={{ color: 'var(--color-on-surface-variant)' }}>
              {isEs
                ? 'Para patrimonios grandes o si prefiere no transportar objetos de valor, seguimos ofreciendo visitas privadas a domicilio a pedido.'
                : 'For larger estates, or if you would rather not transport valuables, we still make private home visits on request.'}
            </p>
          </div>
        </div>
      </PageContainer>
    </section>
  );
}
