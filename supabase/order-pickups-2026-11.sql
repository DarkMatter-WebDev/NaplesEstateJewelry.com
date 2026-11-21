-- Naples Estate Jewelry - Local Pickup log + pickup sheet (2026-11-21).
-- Safe to re-run. Run ALL of it in the Supabase SQL Editor BEFORE the push
-- (until it runs, the order page shows "needs the SQL" in its Pickup card and
-- nothing else changes).
--
-- What it adds (owner, 2026-11-21, mockup 1 approved):
--   Admin -> Orders -> a Local Pickup order -> Pickup card -> Log Pickup:
--   who picked up, the ID photo (+ AI fill of ID type / last 4), how they
--   signed (finger on the iPad / iPhone, or paper), and the email box. Then a
--   store copy + customer copy print, and the customer can be emailed theirs.
--
-- One row per order. The ID photo and the finger signature are PATHS in the
-- existing PRIVATE bucket `buy-receipt-ids` (admin-only policies, created by
-- buy-receipts-2026-09.sql), under `order-pickups/<order id>/`. Never a URL,
-- never the public product-images bucket. Deleting an order (Recycle Bin ->
-- Delete Forever) removes the row (cascade) and the site removes the folder.

create table if not exists public.order_pickups (
  order_id            uuid primary key references public.orders (id) on delete cascade,
  -- Who collected it: the buyer, or someone else (a gift recipient, a spouse).
  picked_up_by        text not null check (char_length(picked_up_by) between 1 and 120),
  picked_up_by_buyer  boolean not null default true,
  id_type             text check (id_type in ('Driver license', 'State ID', 'Passport', 'Military ID', 'Other')),
  -- Last four letters/digits only; the full ID number is never stored.
  id_last4            text check (id_last4 ~ '^[A-Z0-9]{4}$'),
  -- Object path in the PRIVATE bucket buy-receipt-ids. A path, never a URL.
  id_photo_path       text,
  -- 'digital' = signed with a finger on the device; 'paper' = signs the printed store copy.
  sign_method         text not null default 'paper' check (sign_method in ('digital', 'paper')),
  signature_path      text,
  signed_name         text check (signed_name is null or char_length(signed_name) between 1 and 120),
  signed_at           timestamptz,
  picked_up_at        timestamptz not null default now(),
  emailed_at          timestamptz,
  emailed_to          text,
  logged_by_email     text,
  updated_by_email    text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.order_pickups is
  'Local Pickup log (2026-11-21): who collected the order, their ID (type, last 4, photo path), and the signature (finger on the device, or paper). Admin only.';
comment on column public.order_pickups.id_photo_path is
  'Path in the PRIVATE bucket buy-receipt-ids (order-pickups/<order id>/...). Never a URL; shown only through a short-lived signed link.';
comment on column public.order_pickups.signature_path is
  'Finger signature (lossless WebP) in the PRIVATE bucket buy-receipt-ids. Printed on the store + customer copies; never emailed.';

alter table public.order_pickups enable row level security;

drop policy if exists "Admins manage order pickups" on public.order_pickups;
create policy "Admins manage order pickups"
  on public.order_pickups for all
  using (public.is_admin_user(auth.uid()))
  with check (public.is_admin_user(auth.uid()));

revoke all on public.order_pickups from anon;
-- RLS narrows this to admins; without the grant Postgres refuses before it
-- ever looks at the policy.
grant select, insert, update, delete on public.order_pickups to authenticated;
grant select, insert, update, delete on public.order_pickups to service_role;

drop trigger if exists order_pickups_updated_at on public.order_pickups;
create trigger order_pickups_updated_at
  before update on public.order_pickups
  for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';

-- Verify ---------------------------------------------------------------------
-- The editor shows the LAST result: one row, every value true.
select
  exists (select 1 from information_schema.tables
           where table_schema = 'public' and table_name = 'order_pickups')                       as table_exists,
  (select relrowsecurity from pg_class where oid = 'public.order_pickups'::regclass)             as rls_on,
  exists (select 1 from pg_policies
           where schemaname = 'public' and tablename = 'order_pickups')                          as admin_policy,
  not has_table_privilege('anon', 'public.order_pickups', 'select')                              as hidden_from_public,
  has_table_privilege('authenticated', 'public.order_pickups', 'insert')                         as admin_can_write,
  exists (select 1 from storage.buckets where id = 'buy-receipt-ids' and public = false)         as private_bucket_ready;
