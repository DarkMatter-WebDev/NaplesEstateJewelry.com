-- Buyers directory for the admin Buyers tab. A row per unique customer email,
-- auto-populated from every order that reaches payment_status = 'paid' — via a
-- trigger on public.orders, so it covers BOTH the PayPal RPC path
-- (create_paypal_order / capture_paypal_order in no-reservation-checkout.sql)
-- and the admin's own "Create Manual Order" flow (a direct client-side insert
-- into public.orders, with no shared code path with PayPal). A trigger on the
-- table itself is the only thing that reliably sees every write regardless of
-- which code path made it.
-- Run in Supabase SQL Editor.

create table if not exists public.buyers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  phone text,
  user_id uuid references auth.users (id) on delete set null,
  order_count integer not null default 0,
  total_spent numeric(12,2) not null default 0,
  first_order_at timestamptz not null default now(),
  last_order_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists buyers_last_order_at_idx on public.buyers (last_order_at desc);

alter table public.buyers enable row level security;

drop policy if exists "Admins manage buyers" on public.buyers;
create policy "Admins manage buyers"
  on public.buyers for all
  using (public.is_admin_user(auth.uid()))
  with check (public.is_admin_user(auth.uid()));

-- RLS policies alone are not enough — Postgres checks table-level grants
-- before it ever consults RLS, so `authenticated` also needs the base grant
-- (matches the existing `grant ... on public.orders to authenticated` in
-- sales-workflow.sql; the RLS policy above is what actually narrows this to
-- admins only).
grant select, insert, update, delete on public.buyers to authenticated;

drop trigger if exists buyers_updated_at on public.buyers;
create trigger buyers_updated_at
  before update on public.buyers
  for each row execute function public.set_updated_at();

-- Upserts a buyer row whenever an order transitions INTO payment_status =
-- 'paid'. Guards against double-counting: an update that leaves payment_status
-- at 'paid' (e.g. a later fulfillment_status edit) does not re-fire the count/
-- total accumulation, because it only fires on a real transition into 'paid'.
-- Does not decrement on a later refund — total_spent/order_count are a
-- lifetime-paid summary, not a live balance (matches how the rest of this
-- app treats refunds as a separate, explicitly-flagged state rather than
-- unwinding earlier side effects).
--
-- Fails open: the whole body is wrapped in an exception handler so a bug or
-- edge case here can NEVER roll back the underlying order write (a PayPal
-- capture, a webhook, or an admin's manual order save) — same "best-effort,
-- never blocks the critical path" principle this app already applies to the
-- receipt/owner-notification emails in finalizePaidOrder().
create or replace function public.upsert_buyer_from_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text;
begin
  if new.payment_status is distinct from 'paid' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.payment_status = 'paid' then
      return new;
    end if;
  end if;

  if new.customer_email is null or trim(new.customer_email) = '' then
    return new;
  end if;

  normalized_email := lower(trim(new.customer_email));

  insert into public.buyers (
    email, name, phone, user_id,
    order_count, total_spent, first_order_at, last_order_at
  )
  values (
    normalized_email,
    nullif(trim(coalesce(new.customer_name, '')), ''),
    nullif(trim(coalesce(new.customer_phone, '')), ''),
    new.user_id,
    1,
    coalesce(new.total, 0),
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (email) do update
  set
    name = coalesce(nullif(trim(coalesce(new.customer_name, '')), ''), public.buyers.name),
    phone = coalesce(nullif(trim(coalesce(new.customer_phone, '')), ''), public.buyers.phone),
    user_id = coalesce(new.user_id, public.buyers.user_id),
    order_count = public.buyers.order_count + 1,
    total_spent = public.buyers.total_spent + coalesce(new.total, 0),
    last_order_at = now(),
    updated_at = now();

  return new;
exception
  when others then
    raise warning 'upsert_buyer_from_order failed for order %: %', new.id, sqlerrm;
    return new;
end;
$$;

drop trigger if exists orders_upsert_buyer on public.orders;
create trigger orders_upsert_buyer
  after insert or update of payment_status on public.orders
  for each row execute function public.upsert_buyer_from_order();

-- One-time backfill so the Buyers tab starts populated with existing customer
-- history, not just orders placed after this migration runs. Safe to re-run —
-- "on conflict do nothing" skips any email the trigger above already recorded
-- (e.g. a real order paid between two runs of this same migration file).
insert into public.buyers (email, name, phone, user_id, order_count, total_spent, first_order_at, last_order_at)
select
  lower(trim(o.customer_email)) as email,
  (array_agg(o.customer_name order by o.created_at desc))[1] as name,
  (array_agg(o.customer_phone order by o.created_at desc))[1] as phone,
  (array_agg(o.user_id order by o.created_at desc))[1] as user_id,
  count(*) as order_count,
  coalesce(sum(o.total), 0) as total_spent,
  min(o.created_at) as first_order_at,
  max(o.created_at) as last_order_at
from public.orders o
where o.payment_status = 'paid'
  and o.customer_email is not null
  and trim(o.customer_email) <> ''
group by lower(trim(o.customer_email))
on conflict (email) do nothing;
