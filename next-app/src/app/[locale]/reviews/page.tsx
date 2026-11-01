import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import type { Crumb } from '@/lib/breadcrumb-ld';
import { GOOGLE_REVIEWS_URL, TESTIMONIALS } from '@/lib/testimonials';
import SiteHeader from '@/components/layout/SiteHeader';
import SiteFooter from '@/components/layout/SiteFooter';
import BreadcrumbJsonLd from '@/components/BreadcrumbJsonLd';
import BreadcrumbTrail from '@/components/BreadcrumbTrail';
import { PageContainer } from '@/components/layout/ResponsiveLayout';
import TestimonialCard from '@/components/home/TestimonialCard';
import { AppIcon } from '@/components/AppIcon';
import GoogleReviewsLine from '@/components/GoogleReviewsLine';
import { getGoogleReviews } from '@/lib/google-reviews-server';

/**
 * `/reviews` — every curated Google review on one page (owner, 2026-09-08;
 * mockup approved). Built as a page rather than a link to the Google profile
 * so a visitor who tapped "Read Our Reviews" on the business card stays on the
 * site, in their language, with a way back — the profile link opens the Maps
 * app on most phones and shows Spanish speakers a machine translation.
 *
 * Rules, all carried over from the homepage band:
 *
 * - The list IS `lib/testimonials.ts` — verbatim Google reviews, reconciled
 *   against the live profile. Nothing is typed here; a review is added or
 *   removed in that one file and every surface follows.
 * - Every card links to the original on Google (the shared `TestimonialCard`),
 *   and the page ends with "See All Reviews on Google": nobody is trapped in a
 *   curated list, and the rating that counts is Google's.
 * - ⛔ No `aggregateRating` / `Review` schema for the business's own reviews.
 *   Google treats self-serving review markup on a LocalBusiness as a
 *   structured-data manual-action risk (rule recorded with `/review`).
 * - "Leave a Review" is the plain `<a href="/review">` the band uses: a route
 *   handler that 302s to Google, so never a Next `<Link>`.
 *
 * Listed in the sitemap at 0.5 (a destination, not a ranking page) and linked
 * from the About menu, the footer and `/card`. Guarded by
 * `lib/__tests__/reviews-page.test.ts`.
 */

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const isEs = locale === 'es';
  // No count in the title/description. The page itself carries the rating
  // line (owner, 2026-11-01, reversing 09-08's "no count anywhere": "50+, all
  // five stars" cannot read as "only N"; the count is admin-edited and rounded
  // down, so it does not drift above the Google total).
  return pageMetadata({
    title: isEs ? 'Reseñas de Clientes' : 'Customer Reviews',
    description: isEs
      ? 'Reseñas de Google de personas que vendieron o compraron con Naples Estate Jewelry en Naples, FL — citadas palabra por palabra, cada una enlazada a la original en Google.'
      : 'Google reviews from people who sold to or bought from Naples Estate Jewelry in Naples, FL — quoted word for word, each linked to the original on Google.',
    path: '/reviews',
    locale,
  });
}

export default async function ReviewsPage({ params }: Props) {
  const { locale } = await params;
  const isEs = locale === 'es';

  const crumbs: Crumb[] = [{ name: isEs ? 'Reseñas' : 'Reviews', path: '/reviews' }];
  const reviews = await getGoogleReviews();

  return (
    <>
      <BreadcrumbJsonLd locale={locale} crumbs={crumbs} />
      <SiteHeader />
      <main className="site-header-offset">
        {/* Light, centred opener — same eyebrow + headline the band uses, so
            the page reads as the band's full version, not a new surface. */}
        <section
          className="border-b"
          style={{ borderColor: 'var(--color-outline-variant)', background: 'var(--color-surface-container-lowest)' }}
        >
          <PageContainer max="content" className="py-14 text-center md:py-20">
            <BreadcrumbTrail locale={locale} crumbs={crumbs} tone="light" align="center" />
            <p
              className="mb-3 text-[0.65rem] font-bold uppercase tracking-[0.35em]"
              style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}
            >
              {isEs ? 'Lo Que Dicen Los Clientes' : 'What Clients Say'}
            </p>
            <h1
              className="text-4xl font-bold tracking-tight md:text-5xl"
              style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
            >
              {isEs ? 'Reseñas' : 'Reviews'}
            </h1>
            <GoogleReviewsLine settings={reviews} isEs={isEs} className="mt-4" />
            <p
              className="mx-auto mt-5 max-w-2xl text-base leading-relaxed md:text-lg"
              style={{ color: 'var(--color-on-surface-variant)' }}
            >
              {isEs
                ? 'Reseñas de Google, citadas palabra por palabra. Cada tarjeta abre la original en Google, y la calificación que cuenta es la de allí.'
                : 'Google reviews, quoted word for word. Every card opens the original on Google, and the rating there is the one that counts.'}
            </p>
          </PageContainer>
        </section>

        <section className="py-12 md:py-16">
          <PageContainer max="content">
            {/* `.reviews-grid` (globals.css): one column on phones, two from
                640px, and the band's 8-line clamp lifted — on this page the
                whole quote is the content, not a teaser. */}
            <div className="reviews-grid">
              {TESTIMONIALS.map((review) => (
                <TestimonialCard key={review.name} review={review} isEs={isEs} />
              ))}
            </div>

            <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
              <a
                href="/review"
                target="_blank"
                rel="noopener noreferrer"
                className="gold-button"
                style={{ gap: '0.5rem' }}
                aria-label={
                  isEs
                    ? 'Dejar una Reseña en Google (se abre en una pestaña nueva)'
                    : 'Leave a Review on Google (opens in a new tab)'
                }
              >
                <AppIcon name="star" className="text-[1.05rem]" />
                {isEs ? 'Dejar una Reseña en Google' : 'Leave a Review on Google'}
              </a>
              <a
                href={GOOGLE_REVIEWS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="outline-button"
                aria-label={
                  isEs
                    ? 'Ver Todas las Reseñas en Google (se abre en una pestaña nueva)'
                    : 'See All Reviews on Google (opens in a new tab)'
                }
              >
                {isEs ? 'Ver Todas las Reseñas en Google' : 'See All Reviews on Google'}
              </a>
              {/* The Spanish note is honest about translation: except for one
                  review written in Spanish, the ES quotes are our translations
                  of the English originals (rule in lib/testimonials.ts). */}
              <p className="mt-2 w-full text-center text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                {isEs
                  ? 'Las reseñas en inglés se citan tal como fueron escritas en Google; las versiones en español son nuestra traducción.'
                  : 'Shown exactly as written on Google, spelling included.'}
              </p>
            </div>
          </PageContainer>
        </section>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
