-- Admin-editable homepage announcement banner (2026-08).
--
-- Adds a single jsonb column to the existing single-row public.shop_settings
-- table. null = never configured; the app then serves its built-in promo copy
-- (DEFAULT_HOME_BANNER in next-app/src/lib/home-banner.ts), so this migration
-- can land before or after the app deploy without breaking anything.
--
-- Stored shape:
--   { "enabled": true,
--     "eyebrowEn": "Summer special",
--     "messageEn": "Schedule a free evaluation",
--     "eyebrowEs": "Oferta de verano",     -- '' falls back to the EN string
--     "messageEs": "Programe una evaluación gratuita",
--     "linkEnabled": true,
--     "linkPath": "/free-evaluation" }     -- locale-less; '/es' is prefixed at render
--
-- ⚠️ The strip is `white-space: nowrap` with a fitted type clamp. The combined
-- per-locale text has a MEASURED budget (see BANNER_SAFE_CHARS /
-- BANNER_MAX_CHARS in home-banner.ts); the admin panel enforces it. Do not
-- hand-write long copy straight into this column.
--
-- Reads: covered by the existing "Public reads shop settings" policy and the
-- table-level anon/authenticated SELECT grant — no new policy needed.
-- Writes: the admin API route only (service-role client, requireAdmin()).
--
-- Run in the Supabase SQL Editor. Safe to re-run (idempotent).

alter table public.shop_settings
  add column if not exists home_banner jsonb;

notify pgrst, 'reload schema';
