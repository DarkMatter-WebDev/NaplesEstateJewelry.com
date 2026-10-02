-- ============================================================
--  Inquiries: Google Ads click IDs — run once in the Supabase SQL editor
--  (project evzluixourmsefwdsieu). Before OR after the 2026-10-02 deploy:
--  until it has run, an ad lead's click ID is kept in the message text
--  instead of these columns, and nothing is lost.
--
--  WHY: the owner now measures which leads come from the Google Ads
--  campaign (2026-10-02; DECISIONS.md -> "Google Ads conversion tracking").
--  A lead sent by a visitor who arrived from an ad carries the ad's click
--  ID, so Admin -> Inquiries can mark it "Google Ad", and so a later
--  offline-conversion import can tell Google which leads became purchases.
--
--  WHAT: three nullable columns on public.inquiries. Null on every lead
--  that did not come from an ad. gbraid / wbraid are what an iPhone click
--  can carry instead of gclid.
--
--  Values are validated in next-app/src/lib/ads-tracking.ts
--  (letters, digits, "_" and "-", at most 255 characters); change both
--  together.
--
--  Safe to re-run (IF NOT EXISTS / DROP-then-ADD constraint).
-- ============================================================

alter table public.inquiries
  add column if not exists gclid  text,
  add column if not exists gbraid text,
  add column if not exists wbraid text;

alter table public.inquiries drop constraint if exists inquiries_ad_click_format;
alter table public.inquiries add constraint inquiries_ad_click_format
  check (
    (gclid  is null or gclid  ~ '^[A-Za-z0-9_-]{1,255}$') and
    (gbraid is null or gbraid ~ '^[A-Za-z0-9_-]{1,255}$') and
    (wbraid is null or wbraid ~ '^[A-Za-z0-9_-]{1,255}$')
  );

comment on column public.inquiries.gclid  is 'Google Ads click ID the sender arrived with (auto-tagging); null when the lead did not come from an ad';
comment on column public.inquiries.gbraid is 'Google Ads click ID variant an iOS click can carry instead of gclid';
comment on column public.inquiries.wbraid is 'Google Ads click ID variant an iOS click can carry instead of gclid';

-- The anon INSERT grant and the admin SELECT/UPDATE grants are table-level
-- (supabase/inquiries.sql), so no new grants are needed for the new columns.

-- ---------- verify ----------
-- Expect three rows: gbraid, gclid, wbraid — all text, all nullable (YES).
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'inquiries'
   and column_name in ('gclid', 'gbraid', 'wbraid')
 order by column_name;
