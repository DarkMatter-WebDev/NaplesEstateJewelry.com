-- ============================================================
--  Inquiries: location + preferred-contact fields — run once in the
--  Supabase SQL editor (project evzluixourmsefwdsieu) BEFORE deploying
--  the 2026-09-08 lead-form batch.
--
--  WHY: the owner was getting free-evaluation requests from outside
--  Southwest Florida with no way to tell before calling, and submissions
--  carrying both a phone and an email with no hint of which to use.
--
--  WHAT: three nullable columns on public.inquiries. Nullable on purpose —
--  every existing row stays valid, and the API keeps accepting a form that
--  was loaded before the deploy. The public forms make the fields required.
--
--  Allowed values mirror next-app/src/lib/inquiry-fields.ts exactly;
--  change both together.
--
--  Safe to re-run (IF NOT EXISTS / DROP-then-ADD constraints).
-- ============================================================

alter table public.inquiries
  add column if not exists location_area     text,
  add column if not exists location_detail   text,
  add column if not exists preferred_contact text;

alter table public.inquiries drop constraint if exists inquiries_location_area_check;
alter table public.inquiries add constraint inquiries_location_area_check
  check (location_area is null or location_area in (
    'naples', 'marco-island', 'bonita-springs', 'estero', 'fort-myers', 'cape-coral',
    'swfl-other', 'outside-swfl'
  ));

alter table public.inquiries drop constraint if exists inquiries_preferred_contact_check;
alter table public.inquiries add constraint inquiries_preferred_contact_check
  check (preferred_contact is null or preferred_contact in ('call', 'text', 'email'));

alter table public.inquiries drop constraint if exists inquiries_location_detail_len;
alter table public.inquiries add constraint inquiries_location_detail_len
  check (location_detail is null or char_length(location_detail) <= 120);

comment on column public.inquiries.location_area     is 'Where the sender said they are (service-area slug or a catch-all); see inquiry-fields.ts';
comment on column public.inquiries.location_detail   is 'City & state typed for the two catch-all areas only';
comment on column public.inquiries.preferred_contact is 'call | text | email — how the sender asked to be reached';

-- The anon INSERT grant and the admin SELECT/UPDATE grants are table-level
-- (supabase/inquiries.sql), so no new grants are needed for the new columns.

-- ---------- verify ----------
-- Expect three rows: location_area, location_detail, preferred_contact.
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'inquiries'
   and column_name in ('location_area', 'location_detail', 'preferred_contact')
 order by column_name;
