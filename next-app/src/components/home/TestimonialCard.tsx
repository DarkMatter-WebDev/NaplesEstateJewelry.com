import { GOOGLE_REVIEWS_URL, type Testimonial } from '@/lib/testimonials';

/**
 * One review card — the single rendering of a testimonial. Shared by the
 * scrolling reviews band (homepage and product pages, through
 * `TestimonialsSection`) and by the /reviews page (2026-09-08), which is why
 * it was lifted out of the section: a review must look and link the same
 * wherever it appears, and the "Read on Google" link is part of that.
 *
 * `isRepeat` marks a duplicate rendered only to fill the loop. Those are
 * hidden from assistive tech and taken out of the tab order — a screen reader
 * reading the same reviews several times would be worse than not having the
 * band.
 */
type Props = {
  review: Testimonial;
  isEs: boolean;
  /** A duplicate rendered only to fill the marquee loop — hidden from AT and the tab order. */
  isRepeat?: boolean;
};

export default function TestimonialCard({ review, isEs, isRepeat = false }: Props) {
  return (
    // `product-light-surface`: this card is always white, so on a dark
    // product page (where these reviews also render) it has to restore
    // the light text tokens — otherwise the quote inherits near-white
    // type onto white. Inert everywhere else, including the homepage.
    <figure
      className={`testimonial-card product-light-surface rounded-2xl border bg-white${
        isRepeat ? ' testimonial-marquee-repeat' : ''
      }`}
      style={{ borderColor: 'var(--color-outline-variant)' }}
      aria-hidden={isRepeat || undefined}
    >
      <div className="testimonial-stars" aria-hidden="true" style={{ color: '#e9c349' }}>
        ★★★★★
      </div>
      {/* The quote is truncated in CSS (`-webkit-line-clamp`), never in
          JS. The full verbatim text stays in the DOM for screen readers
          and crawlers, and nothing here can accidentally become an
          edited version of a customer's words — the rule in
          `lib/testimonials.ts`. The card links to Google, where the
          untruncated review lives. */}
      <blockquote style={{ color: 'var(--color-on-surface)' }}>
        &ldquo;{isEs ? review.quoteEs : review.quote}&rdquo;
      </blockquote>
      <figcaption className="mt-auto pt-2" style={{ color: 'var(--color-on-surface-variant)' }}>
        <strong style={{ color: 'var(--color-on-surface)' }}>{review.name}</strong>
        {' · '}
        {isEs ? review.metaEs : review.meta}
      </figcaption>
      {/* The whole card is clickable via this link's stretched
          ::after overlay, rather than an <a> wrapping the figure. That
          keeps the figure/figcaption semantics intact and gives the
          link a short accessible name — wrapping the card would make
          the entire 480-character quote the link text.

          Do NOT rename this class to anything containing "card": that
          substring makes CustomerReveal stamp the anchor, which turns
          it into a containing block and silently collapses the overlay.
          Full explanation sits with the rule in globals.css. */}
      <a
        className="testimonial-google-link"
        href={GOOGLE_REVIEWS_URL}
        target="_blank"
        rel="noopener noreferrer"
        tabIndex={isRepeat ? -1 : undefined}
        // Must BEGIN with the visible text ("Read on Google") or axe flags
        // label-content-name-mismatch: the accessible name has to contain
        // the visible label as a contiguous run, so the reviewer's name goes
        // after the phrase, never inside it.
        aria-label={
          isEs
            ? `Leer en Google: reseña completa de ${review.name} (se abre en una pestaña nueva)`
            : `Read on Google: ${review.name}'s full review (opens in a new tab)`
        }
      >
        {isEs ? 'Leer en Google' : 'Read on Google'}
        <span aria-hidden="true"> →</span>
      </a>
    </figure>
  );
}
