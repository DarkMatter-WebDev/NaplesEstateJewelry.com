-- Admin-editable Google review count (2026-11-01).
--
-- Adds a single jsonb column to the existing single-row public.shop_settings
-- table. null = never saved; the app then serves its built-in figure
-- (DEFAULT_GOOGLE_REVIEWS in next-app/src/lib/google-reviews.ts — 51 reviews,
-- all five stars, read off Google Maps on 2026-11-01), so this can land before
-- or after the deploy without breaking anything. Run it BEFORE the push anyway:
-- until it runs, Admin → Settings → Google Reviews cannot save.
--
-- Stored shape:
--   { "count": 51,              -- the exact count from Google Maps (integer)
--     "allFiveStar": true,      -- untick the day a review below 5 stars arrives
--     "updatedAt": "2026-11-01" }
--
-- The site shows the count ROUNDED DOWN to the nearest 10 with "+" (51 → "50+"),
-- so it never claims more reviews than the profile has between updates.
--
-- Reads: the existing "Public reads shop settings" policy and the table-level
-- anon/authenticated SELECT grant (a public review count — nothing private).
-- Writes: the admin API route only (service-role client, requireAdmin()).
--
-- Run in the Supabase SQL Editor. Safe to re-run (idempotent).

alter table public.shop_settings
  add column if not exists google_reviews jsonb;

notify pgrst, 'reload schema';

-- Check: one row, data_type jsonb.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'shop_settings' and column_name = 'google_reviews';
