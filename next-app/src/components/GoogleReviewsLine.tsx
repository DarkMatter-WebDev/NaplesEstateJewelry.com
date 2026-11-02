import { googleReviewsLine, type GoogleReviewsSettings } from '@/lib/google-reviews';
import GoogleWordmark from '@/components/GoogleWordmark';

// "★★★★★ 50+ Google reviews · All five stars" (owner, 2026-11-01, mockup 1).
// The count comes from Admin → Settings → Google Reviews; this component is
// also the admin panel's preview, so the two can never disagree. No hooks —
// renders on the server for the site and in the client panel alike.

function Star() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="block">
      <path fill="#d4af37" d="M12 2.5l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17.4l-6.1 3.5 1.5-6.8L2.2 9.5l6.9-.7z" />
    </svg>
  );
}

export default function GoogleReviewsLine({
  settings,
  isEs,
  small = false,
  googleLogo = false,
  className = '',
}: {
  settings: GoogleReviewsSettings;
  isEs: boolean;
  /** The admin preview's second (Spanish) line. */
  small?: boolean;
  /** Google's own wordmark in place of the word (/sellbymail, 2026-11-01). */
  googleLogo?: boolean;
  className?: string;
}) {
  const line = googleReviewsLine(settings, isEs);
  const [beforeGoogle, afterGoogle] = line.count.split('Google');
  const count = googleLogo && afterGoogle !== undefined
    ? <>{beforeGoogle}<GoogleWordmark />{afterGoogle}</>
    : line.count;
  return (
    <p
      className={`flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 ${small ? 'text-[0.75rem]' : 'text-[0.9rem]'} ${className}`}
      style={{ fontFamily: 'var(--font-label)', color: 'var(--color-on-surface)' }}
    >
      {/* Five drawn stars only while every review is five stars — never a
          partial claim. The words carry the meaning for screen readers.
          A star's gold sits mostly in its lower half, so centred stars read
          low. On a computer they are pinned to the TOP of the line and
          lowered 0.06em, which puts their visual weight on the middle of the
          capitals (measured by the pixels; owner picked this, "Option 1",
          2026-11-01). Pinned to the top, not centred: centring leaves them
          1.8px down the line, and the browser then rounds stars and text
          differently, so they jumped 1px depending on where the line landed.
          Phones keep the small 0.04em raise — the owner judged those already
          looked right. */}
      {settings.allFiveStar && (
        <span className="inline-flex gap-0.5 -translate-y-[0.04em] lg:self-start lg:translate-y-[0.06em]" aria-hidden="true">
          <Star />
          <Star />
          <Star />
          <Star />
          <Star />
        </span>
      )}
      <strong className="font-extrabold">{count}</strong>
      {/* Explicit spaces around the dot for screen readers and text
          extractors; whitespace-only nodes add no flex items. */}
      {line.stars && (
        <>
          {' '}
          <span aria-hidden="true" style={{ color: 'var(--color-outline)' }}>·</span>
          {' '}
          <span>{line.stars}</span>
        </>
      )}
    </p>
  );
}
