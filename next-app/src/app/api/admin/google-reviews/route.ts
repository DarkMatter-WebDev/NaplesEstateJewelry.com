import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { SHOP_SETTINGS_TABLE } from '@/lib/shop-settings';
import {
  DEFAULT_GOOGLE_REVIEWS,
  GOOGLE_REVIEWS_MAX_COUNT,
  isValidReviewCount,
  parseGoogleReviews,
  type GoogleReviewsSettings,
} from '@/lib/google-reviews';
import { GOOGLE_REVIEWS_CACHE_TAG } from '@/lib/google-reviews-server';

// Admin → Settings → Google Reviews (2026-11-01): the review count + "every
// review is five stars" behind the rating line (homepage, /reviews,
// /free-evaluation). Same pattern as /api/admin/home-banner.

export const runtime = 'nodejs';

const MIGRATION_HINT = 'Run supabase/google-reviews-2026-11.sql in the Supabase SQL Editor first.';

function isMissingColumnError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? '');
  return message.toLowerCase().includes('google_reviews');
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const service = createServiceClient();
    const { data, error: dbError } = await service
      .from(SHOP_SETTINGS_TABLE)
      .select('google_reviews')
      .eq('id', true)
      .maybeSingle();
    // Pre-migration (missing column) still serves the default so the panel
    // works; the save is what surfaces the migration message.
    const settings = dbError ? null : parseGoogleReviews(data?.google_reviews);
    return NextResponse.json({ settings: settings ?? DEFAULT_GOOGLE_REVIEWS, isDefault: settings === null });
  } catch {
    return NextResponse.json({ settings: DEFAULT_GOOGLE_REVIEWS, isDefault: true });
  }
}

export async function PUT(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = (await req.json().catch(() => null)) as { count?: unknown; allFiveStar?: unknown } | null;
  if (!isValidReviewCount(body?.count)) {
    return NextResponse.json({ error: `Enter the review count as a whole number from 0 to ${GOOGLE_REVIEWS_MAX_COUNT}.` }, { status: 400 });
  }
  if (typeof body?.allFiveStar !== 'boolean') {
    return NextResponse.json({ error: 'allFiveStar must be true or false.' }, { status: 400 });
  }

  const settings: GoogleReviewsSettings = {
    count: body.count as number,
    allFiveStar: body.allFiveStar,
    updatedAt: new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
  };

  try {
    const service = createServiceClient();
    const { error: dbError } = await service
      .from(SHOP_SETTINGS_TABLE)
      .upsert({ id: true, google_reviews: settings, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (dbError) {
      return NextResponse.json({ error: isMissingColumnError(dbError) ? MIGRATION_HINT : dbError.message }, { status: 500 });
    }
    // The line is on statically prerendered pages in both locales — same
    // always-correct sitewide regeneration as the banner and store hours.
    revalidateTag(GOOGLE_REVIEWS_CACHE_TAG, { expire: 0 });
    revalidatePath('/', 'layout');
    return NextResponse.json({ settings, isDefault: false });
  } catch (err) {
    return NextResponse.json(
      { error: isMissingColumnError(err) ? MIGRATION_HINT : err instanceof Error ? err.message : 'Failed to save.' },
      { status: 500 },
    );
  }
}
