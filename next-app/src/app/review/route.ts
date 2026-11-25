import { NextResponse } from 'next/server';
import { GOOGLE_REVIEW_URL } from '@/lib/business-location';

export const runtime = 'nodejs';

/**
 * `/review` -> the one-click Google review form, so asking for a review is a short
 * spoken URL ("naplesestatejewelry.com slash review") and a printable QR target
 * rather than a 90-character Google link nobody can dictate across a counter.
 *
 * Review COUNT is the business's weakest competitive signal — a same-named
 * competitor in Naples carries roughly double the reviews at the same 5.0
 * rating — so the cost of leaving one must be as close to zero as possible.
 *
 * ⛔ This is deliberately NOT a Next `redirects()` entry. On Netlify the plugin
 * rewrites locale-less paths to `/en/...` before config redirects run, so those
 * never fire — 22 dead ones sat in production until 2026-08-02. A route handler
 * is the only form that works here, which is why /p/<code> is built the same
 * way. `/review` must also stay excluded from the proxy matcher in proxy.ts, or
 * next-intl rewrites it to a `/[locale]/review` page that does not exist.
 *
 * 302, not 301: Google's short review links are opaque and can be reissued, and
 * a permanent redirect cached in a visitor's browser would outlive such a swap.
 *
 * ⛔ Do NOT pair this with `aggregateRating` markup for the business's own
 * reviews. Google disallows self-serving review markup on LocalBusiness and it
 * risks a structured-data manual action.
 */
export async function GET(req: Request) {
  // `/review?f=<token>` = the link in a Follow-ups thank-you email (2026-11-24):
  // mark "clicked review link" on that email's log row, then go to Google as
  // always. Best effort — a failure never stops the redirect.
  const token = new URL(req.url).searchParams.get('f');
  if (token) {
    try {
      const [{ createServiceClient }, { recordReviewClick }] = await Promise.all([
        import('@/lib/supabase/service'),
        import('@/lib/follow-ups-server'),
      ]);
      await recordReviewClick(createServiceClient(), token);
    } catch {
      // ignore
    }
  }
  return NextResponse.redirect(GOOGLE_REVIEW_URL, 302);
}
