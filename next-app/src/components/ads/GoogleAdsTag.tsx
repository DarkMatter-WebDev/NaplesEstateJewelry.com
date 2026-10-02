'use client';

import { useEffect } from 'react';
import { startAdsMeasurement } from '@/lib/ads-tracking-browser';

/**
 * Google Ads conversion measurement, mounted ONCE in `[locale]/layout.tsx`.
 *
 * Renders nothing, and for a visitor who never clicked an ad it loads nothing:
 * the rules are in `lib/ads-tracking.ts` (`shouldLoadAdsTag`), the work in
 * `lib/ads-tracking-browser.ts`.
 *
 * ⛔ No `useSearchParams` here — it would client-render every static page up to
 * the nearest Suspense boundary (see the note on `RouteProgressBar` in the
 * layout). The effect reads `window.location` instead.
 */
export default function GoogleAdsTag() {
  useEffect(() => startAdsMeasurement(), []);
  return null;
}
