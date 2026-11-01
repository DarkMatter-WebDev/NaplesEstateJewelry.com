-- QR / short-link scan counter (2026-10-31) — Admin → Insights.
--
-- One row per counted visit: WHEN, and WHICH printed code (source). Nothing
-- else: no IP, no device, no cookie, nothing about the person.
--
--   source = 'magnet'    the vehicle magnets  → /magnet   (counted by /api/magnet, server side)
--            'card'      Chris's business card → /card    (counted by the page, POST /api/scan)
--            'kittcard'  Kitt's business card  → /kittcard
--   The list lives in next-app/src/lib/scan-sources.ts.
--
-- Bots, link previews, test tools and repeat loads in the same browser tab are
-- not counted (lib/scan-sources.ts → shouldCountScan, components/ScanBeacon.tsx).
-- RLS is on with NO policies: only the service role (the site's server code)
-- can read or write; the public anon key can do neither.
--
-- REPLACES supabase/magnet-scans-2026-10.sql (run 2026-10-31, never deployed,
-- 0 rows): that table is RENAMED to qr_scans and gains `source`. If it was never
-- created, this file creates qr_scans from scratch. Safe to re-run.
-- Run in the Supabase SQL Editor BEFORE or AFTER the deploy — until it runs the
-- links and pages still work; visits just aren't saved and Insights says so.

do $$
begin
  if to_regclass('public.magnet_scans') is not null and to_regclass('public.qr_scans') is null then
    alter table public.magnet_scans rename to qr_scans;
  end if;
end $$;

create table if not exists public.qr_scans (
  id         bigint generated always as identity primary key,
  scanned_at timestamptz not null default now()
);

alter table public.qr_scans
  add column if not exists source text not null default 'magnet';

alter table public.qr_scans drop constraint if exists qr_scans_source_format_check;
alter table public.qr_scans add constraint qr_scans_source_format_check
      check (source ~ '^[a-z0-9_-]{1,40}$');

drop index if exists public.magnet_scans_scanned_at_idx;
create index if not exists qr_scans_source_scanned_at_idx
  on public.qr_scans (source, scanned_at desc);

alter table public.qr_scans enable row level security;
revoke all on public.qr_scans from anon, authenticated;
-- The site's server code (service role) writes and reads the counts. This
-- project does NOT grant new tables to service_role automatically — without
-- this line every save and every Insights read fails with 42501 "permission
-- denied" (found 2026-10-31 by a live check after the first run of this file).
-- DELETE (added 2026-10-31, same day): Admin → Insights' per-code "Clear"
-- button (owner: "clear each page's visit counter"); the delete runs only
-- behind the admin check in /api/admin/insights/scans/[source].
grant select, insert, delete on public.qr_scans to service_role;

notify pgrst, 'reload schema';

-- Check: should return one row — qr_scans | true | (number of rows) — and
-- magnet_scans should no longer exist (second query returns null).
select c.relname as table_name, c.relrowsecurity as rls_on,
       (select count(*) from public.qr_scans) as scans
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'qr_scans';
select to_regclass('public.magnet_scans') as old_table_should_be_null;
-- Check: service_role must show DELETE, INSERT and SELECT; anon and authenticated nothing.
select grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'qr_scans'
 group by grantee
 order by grantee;
