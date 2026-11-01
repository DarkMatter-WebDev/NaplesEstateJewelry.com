import 'server-only';

import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';
import { SHOP_SETTINGS_TABLE } from '@/lib/shop-settings';
import { DEFAULT_GOOGLE_REVIEWS, parseGoogleReviews, type GoogleReviewsSettings } from '@/lib/google-reviews';

/**
 * Server-side read of the admin-edited Google review count.
 *
 * Storage: `shop_settings.google_reviews` (jsonb, single row, added by
 * `supabase/google-reviews-2026-11.sql`). Anything unexpected — column
 * missing, null, malformed, network failure — degrades to
 * `DEFAULT_GOOGLE_REVIEWS`, so the line always renders something true.
 * Same shape as `home-banner-server.ts`.
 *
 * ⛔ Server-only. The admin panel imports the PURE half (`google-reviews.ts`).
 */

export const GOOGLE_REVIEWS_CACHE_TAG = 'google-reviews';

const fetchCachedGoogleReviews = unstable_cache(
  async (): Promise<GoogleReviewsSettings | null> => {
    try {
      const { data, error } = await createPublicClient()
        .from(SHOP_SETTINGS_TABLE)
        .select('google_reviews')
        .eq('id', true)
        .maybeSingle();
      if (error) return null;
      return parseGoogleReviews(data?.google_reviews);
    } catch {
      return null;
    }
  },
  // v1: bump if GoogleReviewsSettings' shape changes.
  ['google-reviews-v1'],
  {
    tags: [GOOGLE_REVIEWS_CACHE_TAG],
    revalidate: 300,
  },
);

export async function getGoogleReviews(): Promise<GoogleReviewsSettings> {
  try {
    return (await fetchCachedGoogleReviews()) ?? DEFAULT_GOOGLE_REVIEWS;
  } catch {
    return DEFAULT_GOOGLE_REVIEWS;
  }
}
