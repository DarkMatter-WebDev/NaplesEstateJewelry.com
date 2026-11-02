import { PageContainer, Section } from '@/components/layout/ResponsiveLayout';
import { BAND_TESTIMONIALS } from '@/lib/testimonials';
import { getGoogleReviews } from '@/lib/google-reviews-server';
import GoogleReviewsLine from '@/components/GoogleReviewsLine';
import TestimonialCard from './TestimonialCard';
import TestimonialMarqueeBand from './TestimonialMarqueeBand';
import GoogleWordmark from '@/components/GoogleWordmark';

// Curated customer testimonials, shared by the homepage and product pages so
// there is exactly one review list (src/lib/testimonials.ts) and one card
// (TestimonialCard.tsx — the /reviews page renders the same card). Both pages
// show ONE scrolling band (owner, 2026-10-25: product pages used a static 2/4
// grid until then). The cards are server-rendered; the client island
// TestimonialMarqueeBand moves the track — scrolls by itself, stops on hover,
// drags left/right. Renders nothing at all if the curated list is ever
// emptied — an empty "reviews" section is worse than none.

type Props = {
  locale: string;
  /**
   * Product-page presentation: tighter vertical rhythm and a smaller heading,
   * so the band reads as a footnote to the piece rather than a second hero.
   */
  compact?: boolean;
};

/**
 * Cards visible in one half of the marquee track, at minimum.
 *
 * The loop works by translating the track exactly -50%, so the track holds two
 * identical halves and each half must be wide enough to cover the viewport on
 * its own — otherwise a gap of empty space walks across the screen once per
 * cycle. Eight cards at 20rem is ~2720px, which clears any realistic display.
 */
const MIN_CARDS_PER_HALF = 8;

/**
 * Seconds a single card takes to cross its own width. Duration is derived from
 * the card count rather than hardcoded, so adding reviews makes the band longer
 * instead of making it faster.
 */
const SECONDS_PER_CARD = 7;

/** How many times the list repeats per half, and the seconds per half — shared with /sellbymail's trust band. */
export function marqueeLayout(cardCount: number): { repeatsPerHalf: number; durationSeconds: number } {
  const repeatsPerHalf = Math.max(1, Math.ceil(MIN_CARDS_PER_HALF / cardCount));
  return { repeatsPerHalf, durationSeconds: repeatsPerHalf * cardCount * SECONDS_PER_CARD };
}

export default async function TestimonialsSection({ locale, compact = false }: Props) {
  const isEs = locale === 'es';
  if (BAND_TESTIMONIALS.length === 0) return null;
  // "★★★★★ 50+ Google reviews · All five stars" — homepage only (owner,
  // 2026-11-01); the count is admin-edited (Admin → Settings → Google Reviews).
  const reviews = compact ? null : await getGoogleReviews();
  // Google's own wordmark, ONCE in this section (owner rule, 2026-11-01): on
  // the homepage the rating line carries it; product pages (compact) have no
  // rating line, so the note under the band does. Cards keep the word.

  const heading = (
    <>
      <p
        className="text-center text-[0.65rem] font-bold uppercase tracking-[0.35em] mb-3"
        style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-label)' }}
      >
        {isEs ? 'Lo Que Dicen Los Clientes' : 'What Clients Say'}
      </p>
      <h2
        className={`text-center font-bold tracking-tight ${compact ? 'text-2xl mb-8' : 'responsive-title-lg mb-4'}`}
        style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
      >
        {isEs ? 'De Confianza en el Suroeste de Florida' : 'Trusted Across Southwest Florida'}
      </h2>
      {reviews && <GoogleReviewsLine settings={reviews} isEs={isEs} googleLogo className="mb-9" />}
    </>
  );

  /**
   * The review CTA under the band (homepage and product pages).
   *
   * A plain <a>, never next/link: `/review` is a route handler that 302s to
   * Google, and a client-side navigation has no page to render. `_blank` keeps
   * the visitor's place on the site, matching the per-card "Read on Google".
   *
   * ⚠️ The aria-label must BEGIN with the visible text or axe flags
   * label-content-name-mismatch — same rule as the card links below.
   */
  const footnote = (
    <div className="mt-8 text-center">
      <a
        href="/review"
        className="outline-button"
        target="_blank"
        rel="noopener noreferrer"
        aria-label={
          isEs
            ? 'Dejar una Reseña en Google (se abre en una pestaña nueva)'
            : 'Leave a Review on Google (opens in a new tab)'
        }
      >
        {isEs ? 'Dejar una Reseña' : 'Leave a Review'}
      </a>
      <p className="mt-3 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
        {compact ? (
          <>{isEs ? 'Reseñas de clientes en ' : 'Client reviews on '}<GoogleWordmark height="1.3em" />.</>
        ) : isEs ? 'Reseñas de clientes en Google.' : 'Client reviews on Google.'}
      </p>
    </div>
  );

  const { repeatsPerHalf, durationSeconds } = marqueeLayout(BAND_TESTIMONIALS.length);

  return (
    <Section className="border-t" style={{ borderColor: 'var(--color-outline-variant)' }}>
      <PageContainer>{heading}</PageContainer>

      {/* Deliberately OUTSIDE PageContainer. `Section` carries only vertical
          padding, so the band runs edge to edge — a marquee that stopped at
          the text column would read as a widget, not a banner.

          `data-customer-reveal-skip` (on the band) is required, not cosmetic.
          CustomerReveal matches `main [class*="card"]` and stamps every match
          `data-customer-reveal="pending"` (opacity 0) until an observer
          reveals it. Inside a moving track, the cards that start off-screen
          may never be observed, so the band would scroll a procession of
          invisible cards. `closest()` is what CustomerReveal tests, so this
          one attribute on the wrapper excludes every card beneath it. */}
      <TestimonialMarqueeBand durationSeconds={durationSeconds}>
        {Array.from({ length: repeatsPerHalf * 2 }).flatMap((_, pass) =>
          BAND_TESTIMONIALS.map((review) =>
            <TestimonialCard key={`${review.name}-${pass}`} review={review} isEs={isEs} isRepeat={pass > 0} />,
          ),
        )}
      </TestimonialMarqueeBand>

      <PageContainer>{footnote}</PageContainer>
    </Section>
  );
}
