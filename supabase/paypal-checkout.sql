-- PayPal checkout: order/payment columns, webhook events, and the capture RPC.
--
-- ⚠️ RESERVATION MODEL SUPERSEDED. This file still DEFINES the old 30-minute
-- reservation functions (reserve_paypal_order + release_expired_paypal_reservations)
-- for historical completeness, but they are NO LONGER USED. The current inventory
-- model is "whoever pays first gets the item" — see no-reservation-checkout.sql,
-- which replaces the create/capture RPCs and DROPS the two reservation functions.
-- Always run no-reservation-checkout.sql AFTER this file. If you re-run this file
-- (it is idempotent and recreates the reservation functions), re-run
-- no-reservation-checkout.sql afterward to drop them again.
--
-- Run in the Supabase SQL Editor AFTER sales-workflow.sql and
-- admin-notifications-checkout.sql, then run no-reservation-checkout.sql.
-- Safe to re-run (idempotent).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Schema additions
-- ---------------------------------------------------------------------------

-- PayPal references + the timeout window on the order record.
alter table public.orders
  add column if not exists paypal_order_id text,
  add column if not exists paypal_capture_id text,
  add column if not exists payment_response jsonb,
  add column if not exists paid_at timestamptz,
  add column if not exists reserved_until timestamptz;

create unique index if not exists orders_paypal_order_id_unique_idx
  on public.orders (paypal_order_id)
  where paypal_order_id is not null;

-- Per-product reservation hold. Because items can be one-of-one, a product is
-- flipped to 'reserved' for one order until reserved_until passes.
alter table public.products
  add column if not exists reserved_until timestamptz,
  add column if not exists reserved_order_id uuid references public.orders (id) on delete set null;

create index if not exists products_reserved_until_idx
  on public.products (reserved_until)
  where reserved_until is not null;

-- Durable, idempotent webhook log (PayPal + any future provider).
create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'paypal',
  event_id text not null,
  event_type text,
  resource_id text,
  order_id uuid references public.orders (id) on delete set null,
  payload jsonb,
  status text not null default 'received',
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_id)
);

create index if not exists webhook_events_created_idx
  on public.webhook_events (created_at desc);

alter table public.webhook_events enable row level security;

drop policy if exists "Admins read webhook events" on public.webhook_events;
create policy "Admins read webhook events"
  on public.webhook_events for select
  using (public.is_admin_user(auth.uid()));

-- service_role bypasses RLS; only admins can read. No public/authenticated write.

-- ---------------------------------------------------------------------------
-- Helper: free reservations whose hold has expired (returns products to the
-- shop and unpaid orders to a released state). Called inline by the reserve RPC
-- and exposed for a scheduled sweep.
-- ---------------------------------------------------------------------------
create or replace function public.release_expired_paypal_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  released_count integer;
begin
  with expired as (
    select id, reserved_order_id
    from public.products
    where reserved_until is not null
      and reserved_until < now()
      and lower(replace(coalesce(status, ''), ' ', '_')) in ('reserved', 'pending_payment')
    for update skip locked
  )
  update public.products p
  set status = 'available',
      reserved_until = null,
      reserved_order_id = null
  from expired
  where p.id = expired.id;

  get diagnostics released_count = row_count;

  -- Mark the now-abandoned orders so they are not left looking active. Only
  -- touch still-unpaid orders whose own hold has lapsed.
  update public.orders
  set order_status = 'cancelled',
      reserved_until = null,
      internal_notes = coalesce(internal_notes || ' | ', '') || 'Reservation expired; items released.'
  where payment_status = 'unpaid'
    and reserved_until is not null
    and reserved_until < now();

  return coalesce(released_count, 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- Reserve: atomically verify availability, create the internal order
-- (pending_payment / unpaid), and hold the products. Row-level locks serialize
-- concurrent buyers so the same one-of-one item cannot be reserved twice.
-- ---------------------------------------------------------------------------
create or replace function public.reserve_paypal_order(
  order_payload jsonb,
  items_payload jsonb,
  reserve_minutes integer default 30
)
returns table(order_id uuid, order_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_order_id uuid;
  inserted_order_number text;
  item jsonb;
  product_ids text[];
  hold_until timestamptz;
  unavailable_titles text;
begin
  if jsonb_typeof(items_payload) <> 'array' or jsonb_array_length(items_payload) = 0 then
    raise exception 'Order must include at least one item.';
  end if;

  hold_until := now() + make_interval(mins => greatest(reserve_minutes, 1));

  select array_agg(value->>'product_id')
  into product_ids
  from jsonb_array_elements(items_payload)
  where value->>'product_id' is not null;

  -- Free anything whose hold lapsed before we evaluate availability.
  perform public.release_expired_paypal_reservations();

  -- Lock the exact product rows for the duration of this transaction. A second
  -- concurrent reserve for the same product blocks here, then sees 'reserved'.
  perform 1
  from public.products
  where id = any(product_ids)
  for update;

  select string_agg(p.title, ', ')
  into unavailable_titles
  from public.products p
  where p.id = any(product_ids)
    and lower(replace(coalesce(p.status, ''), ' ', '_')) <> 'available';

  if unavailable_titles is not null then
    raise exception 'One or more items are no longer available: %', unavailable_titles
      using errcode = 'P0001';
  end if;

  insert into public.orders (
    order_number, user_id, customer_name, customer_email, customer_phone,
    subtotal, tax, shipping_fee, discount, total,
    payment_status, fulfillment_status, order_status,
    payment_method, shipping_method, shipping_address, billing_address,
    internal_notes, customer_notes, reserved_until
  )
  values (
    order_payload->>'order_number',
    nullif(order_payload->>'user_id', '')::uuid,
    order_payload->>'customer_name',
    order_payload->>'customer_email',
    order_payload->>'customer_phone',
    coalesce((order_payload->>'subtotal')::numeric, 0),
    coalesce((order_payload->>'tax')::numeric, 0),
    coalesce((order_payload->>'shipping_fee')::numeric, 0),
    coalesce((order_payload->>'discount')::numeric, 0),
    coalesce((order_payload->>'total')::numeric, 0),
    'unpaid',
    'pending',
    'open',
    coalesce(order_payload->>'payment_method', 'paypal'),
    coalesce(order_payload->>'shipping_method', 'pickup'),
    order_payload->'shipping_address',
    order_payload->'billing_address',
    order_payload->>'internal_notes',
    order_payload->>'customer_notes',
    hold_until
  )
  returning id, orders.order_number into inserted_order_id, inserted_order_number;

  for item in select * from jsonb_array_elements(items_payload)
  loop
    insert into public.order_items (
      order_id, product_id, inventory_number, title_snapshot, item_year_snapshot,
      metal_snapshot, purity_snapshot, gram_weight_snapshot, price_snapshot, image_snapshot
    )
    values (
      inserted_order_id,
      item->>'product_id',
      item->>'inventory_number',
      item->>'title_snapshot',
      nullif(item->>'item_year_snapshot', '')::smallint,
      item->>'metal_snapshot',
      item->>'purity_snapshot',
      nullif(item->>'gram_weight_snapshot', '')::numeric,
      coalesce((item->>'price_snapshot')::numeric, 0),
      item->>'image_snapshot'
    );
  end loop;

  update public.products
  set status = 'reserved',
      reserved_until = hold_until,
      reserved_order_id = inserted_order_id
  where id = any(product_ids);

  return query select inserted_order_id, inserted_order_number;
end;
$$;

-- ---------------------------------------------------------------------------
-- Capture: mark the order paid (mirrors the admin "Mark Paid" state:
-- payment_status='paid', order_status='completed'), record PayPal references,
-- and flip the held products to 'sold'. Idempotent — a repeat capture for an
-- already-paid order is a no-op and reports already_paid=true.
--
-- If no-reservation-checkout.sql has been applied, the live function has a
-- DIFFERENT return type (adds item_conflict), and CREATE OR REPLACE cannot
-- change a return type (error 42P13) — so drop first. ⚠️ This recreates the
-- OLD 3-column reservation-era version; ALWAYS re-run no-reservation-checkout.sql
-- after this file to restore the current no-reservation capture function.
-- ---------------------------------------------------------------------------
drop function if exists public.capture_paypal_order(uuid, text, jsonb);
create or replace function public.capture_paypal_order(
  p_order_id uuid,
  p_capture_id text,
  p_payment_response jsonb
)
returns table(order_id uuid, order_number text, already_paid boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing record;
begin
  select id, orders.order_number, payment_status
  into existing
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order % not found.', p_order_id using errcode = 'P0002';
  end if;

  if existing.payment_status = 'paid' then
    return query select existing.id, existing.order_number, true;
    return;
  end if;

  update public.orders
  set payment_status = 'paid',
      order_status = 'completed',
      payment_method = 'paypal',
      payment_reference = p_capture_id,
      paypal_capture_id = p_capture_id,
      payment_response = p_payment_response,
      paid_at = now(),
      reserved_until = null
  where id = p_order_id;

  update public.products
  set status = 'sold',
      reserved_until = null,
      reserved_order_id = null
  where id in (
    select oi.product_id from public.order_items oi
    where oi.order_id = p_order_id and oi.product_id is not null
  );

  -- Note: paid orders surface on the admin Orders tab (a "needs fulfillment"
  -- badge driven by orders.payment_status='paid' + fulfillment_status='pending'),
  -- NOT in the Messages center — so we intentionally do NOT insert an
  -- admin_notifications row here.

  return query select existing.id, existing.order_number, false;
end;
$$;

-- ---------------------------------------------------------------------------
-- Webhook status transitions for events that arrive out of band (denial,
-- refund, dispute). Captures are handled by capture_paypal_order; this covers
-- the rest without re-marking an already-correct order.
-- ---------------------------------------------------------------------------
create or replace function public.apply_paypal_order_event(
  p_order_id uuid,
  p_event text,
  p_payment_response jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_order_id is null then
    return;
  end if;

  if p_event = 'denied' then
    update public.orders
    set payment_status = 'failed',
        payment_response = coalesce(p_payment_response, payment_response),
        reserved_until = null
    where id = p_order_id and payment_status <> 'paid';

    -- Release the held items back to the shop on a hard denial.
    update public.products
    set status = 'available', reserved_until = null, reserved_order_id = null
    where reserved_order_id = p_order_id
      and lower(replace(coalesce(status, ''), ' ', '_')) = 'reserved';

  elsif p_event = 'refunded' then
    update public.orders
    set payment_status = 'refunded',
        order_status = 'refunded',
        payment_response = coalesce(p_payment_response, payment_response)
    where id = p_order_id;

  elsif p_event = 'dispute' then
    update public.orders
    set internal_notes = coalesce(internal_notes || ' | ', '') || 'PayPal dispute opened.',
        payment_response = coalesce(p_payment_response, payment_response)
    where id = p_order_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Reserve runs from the public checkout (anon/authenticated). Capture,
-- release, and event application run only from the server with the service
-- role.
-- ---------------------------------------------------------------------------
grant execute on function public.reserve_paypal_order(jsonb, jsonb, integer) to anon, authenticated;
grant execute on function public.capture_paypal_order(uuid, text, jsonb) to service_role;
grant execute on function public.apply_paypal_order_event(uuid, text, jsonb) to service_role;
grant execute on function public.release_expired_paypal_reservations() to service_role, authenticated;

-- The capture + webhook routes (and create-order's paypal_order_id save / hold
-- release) use the service-role client for DIRECT table reads/writes — find an
-- order by paypal_order_id, update payment state, release/sell products, log
-- events. In Supabase the service_role still needs table-level privileges
-- (it bypasses RLS, not GRANTs), and this project only granted these tables to
-- `authenticated`. Grant the service role explicitly so those paths work.
grant select, insert, update, delete on public.orders to service_role;
grant select, insert, update, delete on public.order_items to service_role;
grant select, insert, update, delete on public.products to service_role;
grant select, insert, update, delete on public.webhook_events to service_role;
grant select, insert, update on public.admin_notifications to service_role;
