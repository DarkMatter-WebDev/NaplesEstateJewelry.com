// The Google review count shown on the site (owner, 2026-11-01: "make the #
// of reviews on the new line a variable accessible from the admin settings").
// PURE — client-safe, used by the admin panel's live preview and by the
// server read (./google-reviews-server.ts). Stored as
// `shop_settings.google_reviews` (supabase/google-reviews-2026-11.sql).
//
// ⛔ The line never claims more than the profile has: the exact count is
// rounded DOWN to the nearest 10 with "+" (51 → "50+"), so it stays true
// between the owner's updates. "All five stars" shows only while the owner's
// box says every review is five stars. ⛔ Never add aggregateRating / Review
// schema from this number (self-serving review markup — DECISIONS.md).

export interface GoogleReviewsSettings {
  /** Exact count read off Google Maps. */
  count: number;
  /** Every review on the profile is five stars. */
  allFiveStar: boolean;
  /** YYYY-MM-DD of the last save (shown in Admin). */
  updatedAt: string | null;
}

/** Read off Google Maps on 2026-11-01: 51 reviews — 5★ 51, 4★–1★ 0. */
export const DEFAULT_GOOGLE_REVIEWS: GoogleReviewsSettings = {
  count: 51,
  allFiveStar: true,
  updatedAt: '2026-11-01',
};

export const GOOGLE_REVIEWS_MAX_COUNT = 100_000;

export function isValidReviewCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= GOOGLE_REVIEWS_MAX_COUNT;
}

/** Null for anything malformed — the caller falls back to the default. */
export function parseGoogleReviews(raw: unknown): GoogleReviewsSettings | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (!isValidReviewCount(record.count) || typeof record.allFiveStar !== 'boolean') return null;
  const updatedAt = typeof record.updatedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(record.updatedAt) ? record.updatedAt : null;
  return { count: record.count, allFiveStar: record.allFiveStar, updatedAt };
}

/**
 * "50+" for 51, "60+" for 63, "50+" for exactly 50 (true: 50 or more). Under
 * 10 there is no round number to stand on, so the line shows no count at all.
 */
export function reviewCountLabel(count: number): string | null {
  if (!Number.isFinite(count) || count < 10) return null;
  return `${Math.floor(count / 10) * 10}+`;
}

export interface GoogleReviewsLineText {
  /** "50+ Google reviews" / "50+ reseñas en Google"; "Google reviews" with no count under 10. */
  count: string;
  /** "All five stars" / "Todas de cinco estrellas", or null when not every review is five stars. */
  stars: string | null;
}

/** The rating line under the reviews heading (homepage) and on /reviews. */
export function googleReviewsLine(settings: GoogleReviewsSettings, isEs: boolean): GoogleReviewsLineText {
  const label = reviewCountLabel(settings.count);
  return {
    count: label
      ? isEs ? `${label} reseñas en Google` : `${label} Google reviews`
      : isEs ? 'Reseñas en Google' : 'Google reviews',
    stars: settings.allFiveStar ? (isEs ? 'Todas de cinco estrellas' : 'All five stars') : null,
  };
}

/** The label over the three quotes on /free-evaluation. */
export function freeEvaluationReviewsLabel(settings: GoogleReviewsSettings, isEs: boolean): string {
  const label = reviewCountLabel(settings.count);
  if (!label) return isEs ? 'Reseñas de Google' : 'From our Google reviews';
  if (isEs) return settings.allFiveStar ? `${label} reseñas de cinco estrellas en Google` : `${label} reseñas en Google`;
  return settings.allFiveStar ? `From our ${label} five-star Google reviews` : `From our ${label} Google reviews`;
}
