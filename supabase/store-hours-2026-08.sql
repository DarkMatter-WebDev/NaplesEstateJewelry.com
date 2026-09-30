-- Admin-editable weekly showroom hours (2026-08).
--
-- Adds a single jsonb column to the existing single-row public.shop_settings
-- table. null = never configured; the app then serves its built-in
-- Tue–Sat 11:00–15:00 default (DEFAULT_STORE_HOURS in
-- next-app/src/lib/store-hours.ts), so this migration can land before or after
-- the app deploy without breaking anything.
--
-- Stored shape (all seven English day names, all three fields always present;
-- closed days keep their last times so reopening restores them):
--   { "Monday":  { "open": false, "opens": "11:00", "closes": "15:00" },
--     "Tuesday": { "open": true,  "opens": "11:00", "closes": "15:00" }, ... }
--
-- Reads: covered by the existing "Public reads shop settings" policy and the
-- table-level anon/authenticated SELECT grant — no new policy needed.
-- Writes: the admin API route only (service-role client, requireAdmin()).
--
-- Run in the Supabase SQL Editor. Safe to re-run (idempotent).

alter table public.shop_settings
  add column if not exists store_hours jsonb;

notify pgrst, 'reload schema';
