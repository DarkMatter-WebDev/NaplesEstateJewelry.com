-- Naples Estate Jewelry - In-store sale receipts printed by the Print Station (2026-10-26).
-- Safe to re-run. Run ALL of it in the Supabase SQL Editor BEFORE the push.
-- Needs sales-workflow.sql (orders, is_admin_user) - already run long ago.
-- Until it runs, only "Record & send to desktop printer" / "Send to desktop
-- printer" on the In-store sale page fail (the sale itself is still recorded);
-- the Print Station keeps printing buy receipts as before.
--
-- How it works (owner, 2026-10-26: "record sale and print receipt from the
-- print station ... if the user records the sale on the laptop"):
--   * Each press of "Send to desktop printer" adds ONE row here: the order, and
--     the one-page paper receipt already built by the site (the same paper
--     "Record & print receipt" prints - lib/order-receipt-paper.ts).
--   * The Print Station (the desktop PC's open window) reads this table straight
--     from Supabase every 3 seconds under the admin sign-in, exactly as it reads
--     buy_receipts. It CLAIMS a row (compare-and-set on claimed_at) so two
--     station windows never print the same row, prints it, then sets printed_at.
--   * The laptop watches its row to say "Printed on the desktop".
-- Admin-only (RLS), like buy_receipts. The receipt holds no photos.

-- 1. Table ----------------------------------------------------------------------
create table if not exists public.sale_print_requests (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders(id) on delete cascade,
  order_number   text not null,
  customer_name  text,
  total          numeric(12, 2),
  -- The one-page receipt: { title, css, body } from buildPaperReceipt.
  paper          jsonb not null check (jsonb_typeof(paper) = 'object'),
  requested_at   timestamptz not null default now(),
  requested_by   text,
  claimed_at     timestamptz,
  claimed_by     text,
  printed_at     timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists sale_print_requests_waiting_idx
  on public.sale_print_requests (requested_at)
  where printed_at is null;
create index if not exists sale_print_requests_order_idx
  on public.sale_print_requests (order_id);

-- 2. RLS + grant (pattern: buy-receipts-2026-09.sql) -----------------------------
alter table public.sale_print_requests enable row level security;

drop policy if exists "Admins manage sale print requests" on public.sale_print_requests;
create policy "Admins manage sale print requests"
  on public.sale_print_requests for all
  using (public.is_admin_user(auth.uid()))
  with check (public.is_admin_user(auth.uid()));

revoke all on public.sale_print_requests from anon;
-- RLS narrows this to admins; without the grant Postgres refuses before it
-- ever looks at the policy.
grant select, insert, update, delete on public.sale_print_requests to authenticated;

-- 3. Verify -----------------------------------------------------------------------
-- Each should return what the comment says.

-- One row: the policy.
select policyname from pg_policies
where schemaname = 'public' and tablename = 'sale_print_requests';

-- Four rows: DELETE, INSERT, SELECT, UPDATE.
select privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'sale_print_requests' and grantee = 'authenticated'
order by privilege_type;

-- Zero rows: anon has nothing.
select privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'sale_print_requests' and grantee = 'anon';
