-- Buy receipts (2026-09-30). Run in the Supabase SQL editor BEFORE deploying the
-- Admin -> Buy Receipts batch. Needs sales-workflow.sql (is_admin_user,
-- set_updated_at) to have run first — it has, since the orders tables exist.
-- Safe to re-run.
--
-- What this adds:
--   buy_receipts            one row per purchase FROM a customer at the counter:
--                           seller details, item lines, split payments, the
--                           print-station handshake, void bookkeeping
--   buy-receipt-ids         a PRIVATE Storage bucket for the photo of the
--                           seller's ID (the site's first private bucket)
--
-- Trust model: this table is read AND written by the `authenticated` role —
-- the admin API routes run on requireAdmin()'s request-scoped client, and the
-- Print Station browser tab polls and updates it directly. So it needs BOTH the
-- admin-only RLS policy AND the table grant (DECISIONS.md -> "An RLS policy
-- without a table GRANT is a page that reads but cannot write"). Nothing here
-- uses the service role, so there is no service_role grant on purpose. `anon`
-- gets nothing. No `alter publication supabase_realtime`: the station polls.

-- 1. Table ------------------------------------------------------------------
create table if not exists public.buy_receipts (
  id                   uuid primary key default gen_random_uuid(),
  -- Identity sequences never roll back, so a failed insert leaves a gap in the
  -- numbers (BUY-00004 -> BUY-00006). That is expected; never reuse a number.
  seq                  bigint generated always as identity,
  receipt_number       text generated always as ('BUY-' || lpad(seq::text, 5, '0')) stored,
  status               text not null default 'recorded'
                       constraint buy_receipts_status_check check (status in ('recorded', 'void')),

  -- Seller = the customer we are buying from. ID last 4 + date of birth are
  -- sensitive: admin-only through RLS, never selected by a public route.
  seller_name          text not null,
  seller_phone         text,
  seller_email         text,
  seller_street        text,
  seller_city          text,
  seller_state         text,
  seller_zip           text,
  seller_id_type       text,
  seller_id_last4      text constraint buy_receipts_id_last4_check
                       check (seller_id_last4 is null or seller_id_last4 ~ '^[A-Za-z0-9]{1,4}$'),
  seller_dob           date,
  -- Object path inside the PRIVATE bucket buy-receipt-ids. A path, never a URL.
  seller_id_photo_path text,

  -- [{ "qty": 1, "description": "14K rope chain, 18.4 g", "amount": 1010.00 }, ...]
  -- amount is the LINE total as typed; total = the sum of the amounts.
  items                jsonb not null default '[]'::jsonb
                       constraint buy_receipts_items_array check (jsonb_typeof(items) = 'array'),
  total                numeric(12,2) not null default 0
                       constraint buy_receipts_total_check check (total >= 0),
  -- [{ "method": "check", "reference": "2041", "amount": 750.00 }, ...]
  -- one to four rows; the amounts add up to `total`.
  payments             jsonb not null default '[]'::jsonb
                       constraint buy_receipts_payments_array check (jsonb_typeof(payments) = 'array'),
  notes                text,

  -- Print Station handshake. The laptop stamps a request; the desktop station
  -- claims it (compare-and-set), prints, then clears the request.
  print_requested_at   timestamptz,
  print_requested_by   text,
  print_copies_plain   integer not null default 2
                       constraint buy_receipts_copies_plain_check check (print_copies_plain between 0 and 3),
  print_copies_with_id integer not null default 0
                       constraint buy_receipts_copies_with_id_check check (print_copies_with_id between 0 and 2),
  print_claimed_at     timestamptz,
  print_claimed_by     text,
  printed_at           timestamptz,
  print_count          integer not null default 0,

  void_reason          text,
  voided_at            timestamptz,
  voided_by            text,

  duplicated_from      uuid references public.buy_receipts (id) on delete set null,
  created_by           uuid references auth.users (id) on delete set null,
  created_by_email     text,
  updated_by_email     text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- If the editor ever rejects the generated receipt_number column above, replace
-- that one line with `receipt_number text` and add a `before insert` trigger
-- that sets new.receipt_number := 'BUY-' || lpad(new.seq::text, 5, '0').

-- 2. Indexes ----------------------------------------------------------------
create unique index if not exists buy_receipts_receipt_number_key
  on public.buy_receipts (receipt_number);
create index if not exists buy_receipts_created_at_idx
  on public.buy_receipts (created_at desc);
-- The station's 3-second poll: almost always empty, so this stays tiny.
create index if not exists buy_receipts_print_pending_idx
  on public.buy_receipts (print_requested_at)
  where print_requested_at is not null;
create index if not exists buy_receipts_seller_name_idx
  on public.buy_receipts (lower(seller_name));

-- 3. RLS, grant, updated_at (pattern: buyers-2026-07.sql) --------------------
alter table public.buy_receipts enable row level security;

drop policy if exists "Admins manage buy receipts" on public.buy_receipts;
create policy "Admins manage buy receipts"
  on public.buy_receipts for all
  using (public.is_admin_user(auth.uid()))
  with check (public.is_admin_user(auth.uid()));

revoke all on public.buy_receipts from anon;
-- RLS narrows this to admins; without the grant Postgres refuses before it
-- ever looks at the policy.
grant select, insert, update, delete on public.buy_receipts to authenticated;

-- The identity sequence. Identity inserts do not need it, but granting it keeps
-- any future `nextval` path from failing with "permission denied for sequence".
do $$
declare
  seq_name text := pg_get_serial_sequence('public.buy_receipts', 'seq');
begin
  if seq_name is not null then
    execute format('grant usage, select on sequence %s to authenticated', seq_name);
  end if;
end $$;

drop trigger if exists buy_receipts_updated_at on public.buy_receipts;
create trigger buy_receipts_updated_at
  before update on public.buy_receipts
  for each row execute function public.set_updated_at();

-- 4. Guard: what may change after a receipt exists ----------------------------
-- The Print Station tab holds direct UPDATE rights through RLS, so these rules
-- live in the database and not only in the routes.
--   * the number and the creation facts never change;
--   * a VOID receipt is frozen (duplicate it instead) — only the print
--     bookkeeping columns may still move, so a void copy can be reprinted;
--   * voiding needs a reason.
create or replace function public.guard_buy_receipt_update()
returns trigger
language plpgsql
as $$
begin
  if new.seq is distinct from old.seq
     or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by then
    raise exception 'A buy receipt''s number and creation details cannot be changed';
  end if;

  if old.status = 'void' then
    if new.status is distinct from old.status
       or new.seller_name is distinct from old.seller_name
       or new.seller_phone is distinct from old.seller_phone
       or new.seller_email is distinct from old.seller_email
       or new.seller_street is distinct from old.seller_street
       or new.seller_city is distinct from old.seller_city
       or new.seller_state is distinct from old.seller_state
       or new.seller_zip is distinct from old.seller_zip
       or new.seller_id_type is distinct from old.seller_id_type
       or new.seller_id_last4 is distinct from old.seller_id_last4
       or new.seller_dob is distinct from old.seller_dob
       or new.seller_id_photo_path is distinct from old.seller_id_photo_path
       or new.items is distinct from old.items
       or new.total is distinct from old.total
       or new.payments is distinct from old.payments
       or new.notes is distinct from old.notes then
      raise exception 'Void receipts cannot be edited — duplicate it instead';
    end if;
  elsif new.status = 'void' and coalesce(btrim(new.void_reason), '') = '' then
    raise exception 'A void needs a reason';
  end if;

  return new;
end;
$$;

drop trigger if exists buy_receipts_guard on public.buy_receipts;
create trigger buy_receipts_guard
  before update on public.buy_receipts
  for each row execute function public.guard_buy_receipt_update();

-- 5. Private bucket for the seller's ID photo ---------------------------------
-- PRIVATE on purpose: product-images is a public bucket (lead-form photos sit
-- there behind unguessable names). A photo of a driver license must never be
-- reachable by URL alone, so it gets its own bucket, admin-only policies and
-- short-lived signed URLs. The Storage GC (api/admin/storage-gc) lists only
-- product-images and never touches this bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('buy-receipt-ids', 'buy-receipt-ids', false, 5242880, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins read buy receipt ids" on storage.objects;
create policy "Admins read buy receipt ids"
  on storage.objects for select to authenticated
  using (bucket_id = 'buy-receipt-ids' and public.is_admin_user(auth.uid()));

drop policy if exists "Admins upload buy receipt ids" on storage.objects;
create policy "Admins upload buy receipt ids"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'buy-receipt-ids' and public.is_admin_user(auth.uid()));

drop policy if exists "Admins update buy receipt ids" on storage.objects;
create policy "Admins update buy receipt ids"
  on storage.objects for update to authenticated
  using (bucket_id = 'buy-receipt-ids' and public.is_admin_user(auth.uid()))
  with check (bucket_id = 'buy-receipt-ids' and public.is_admin_user(auth.uid()));

drop policy if exists "Admins delete buy receipt ids" on storage.objects;
create policy "Admins delete buy receipt ids"
  on storage.objects for delete to authenticated
  using (bucket_id = 'buy-receipt-ids' and public.is_admin_user(auth.uid()));

-- 6. Verify -----------------------------------------------------------------
-- Each should return what the comment says.

-- One row: the policy.
select policyname from pg_policies
where schemaname = 'public' and tablename = 'buy_receipts';

-- Four rows: DELETE, INSERT, SELECT, UPDATE.
select privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'buy_receipts' and grantee = 'authenticated'
order by privilege_type;

-- Zero rows: anon has nothing.
select privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'buy_receipts' and grantee = 'anon';

-- One row, public = false.
select id, public, file_size_limit from storage.buckets where id = 'buy-receipt-ids';

-- Four rows: the bucket's policies.
select policyname from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname like '%buy receipt ids%'
order by policyname;

-- Empty until the first receipt is saved; then the newest numbers.
select receipt_number, status, total, created_at
from public.buy_receipts order by seq desc limit 3;
