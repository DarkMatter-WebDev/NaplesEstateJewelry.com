-- Per-order email history. Records every email an admin sends from the order
-- detail page (invoice emails + fulfillment-update emails) so the history is
-- visible under the order summary.
--
-- Reads + writes run as the authenticated admin (the email routes and the order
-- detail page use the cookie-based server client), gated by RLS via the existing
-- is_admin_user() helper. Inserts are best-effort in the routes, so a missing
-- table/grant never blocks an email from sending.
--
-- Run in the Supabase SQL Editor. Safe to re-run (idempotent).

create extension if not exists "pgcrypto";

create table if not exists public.order_emails (
  id            uuid        primary key default gen_random_uuid(),
  order_id      uuid        not null references public.orders (id) on delete cascade,
  email_type    text        not null,          -- 'invoice' | 'fulfillment_update'
  recipient     text        not null,
  subject       text,
  status        text,                           -- fulfillment status for update emails
  sent_by       uuid        references public.profiles (id) on delete set null,
  sent_by_email text,
  created_at    timestamptz not null default now()
);

create index if not exists order_emails_order_id_created_idx
  on public.order_emails (order_id, created_at desc);

alter table public.order_emails enable row level security;

drop policy if exists "Admins read order emails" on public.order_emails;
create policy "Admins read order emails"
  on public.order_emails for select
  using (public.is_admin_user(auth.uid()));

drop policy if exists "Admins insert order emails" on public.order_emails;
create policy "Admins insert order emails"
  on public.order_emails for insert
  with check (public.is_admin_user(auth.uid()));

grant select, insert on public.order_emails to authenticated;
grant select, insert on public.order_emails to service_role;

notify pgrst, 'reload schema';
