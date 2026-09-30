-- Remove product reservation from the checkout flow.
-- Items stay 'available' until payment is actually captured.
-- "Whoever pays first gets the item."
--
-- This migration is the canonical inventory model for PayPal checkout. It
-- supersedes the 30-minute-hold model from paypal-checkout.sql: it adds the
-- no-reservation create/capture RPCs AND tears down the old reservation
-- machinery (the reserve_paypal_order hold + the release-expired sweep), so no
-- 30-minute inventory reservation can be created anymore.
--
-- Run in the Supabase SQL Editor AFTER paypal-checkout.sql. Safe to re-run.
-- NOTE: paypal-checkout.sql is marked "safe to re-run" and RECREATES
-- reserve_paypal_order / release_expired_paypal_reservations. If you ever re-run
-- paypal-checkout.sql, re-run THIS file afterward to drop them again.

-- ---------------------------------------------------------------------------
-- create_paypal_order: create order + order_items without reserving products.
-- Products remain 'available' so concurrent buyers can all proceed to PayPal;
-- the capture step resolves any race atomically.
-- ---------------------------------------------------------------------------
create or replace function public.create_paypal_order(
  order_payload jsonb,
  items_payload jsonb
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
  unavailable_titles text;
begin
  if jsonb_typeof(items_payload) <> 'array' or jsonb_array_length(items_payload) = 0 then
    raise exception 'Order must include at least one item.';
  end if;

  -- Snapshot availability + stock check (no lock — concurrent buyers are allowed
  -- through; the capture RPC serializes the final sale with row-level locking).
  -- An item is unavailable if its status isn't 'available' OR the live stock is
  -- less than the quantity this order wants.
  select string_agg(p.title, ', ')
  into unavailable_titles
  from jsonb_array_elements(items_payload) as elem
  join public.products p on p.id = elem->>'product_id'
  where lower(replace(coalesce(p.status, ''), ' ', '_')) <> 'available'
     or coalesce(p.quantity, 1) < coalesce(nullif(elem->>'quantity', '')::int, 1);

  if unavailable_titles is not null then
    raise exception 'One or more items are no longer available: %', unavailable_titles
      using errcode = 'P0001';
  end if;

  insert into public.orders (
    order_number, user_id, customer_name, customer_email, customer_phone,
    subtotal, tax, shipping_fee, discount, total,
    payment_status, fulfillment_status, order_status,
    payment_method, shipping_method, shipping_address, billing_address,
    internal_notes, customer_notes
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
    order_payload->>'customer_notes'
  )
  returning id, orders.order_number into inserted_order_id, inserted_order_number;

  for item in select * from jsonb_array_elements(items_payload)
  loop
    insert into public.order_items (
      order_id, product_id, inventory_number, title_snapshot, item_year_snapshot,
      metal_snapshot, purity_snapshot, gram_weight_snapshot, price_snapshot,
      quantity, image_snapshot
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
      greatest(coalesce(nullif(item->>'quantity', '')::int, 1), 1),
      item->>'image_snapshot'
    );
  end loop;

  -- Products intentionally NOT reserved — they stay 'available'.

  return query select inserted_order_id, inserted_order_number;
end;
$$;

-- ---------------------------------------------------------------------------
-- capture_paypal_order (updated): lock product rows to serialize concurrent
-- captures, detect items already sold to another buyer, and return an
-- item_conflict flag so the route can surface an appropriate error.
-- Must drop first because the return type gains a new column (item_conflict).
-- ---------------------------------------------------------------------------
drop function if exists public.capture_paypal_order(uuid, text, jsonb);
create or replace function public.capture_paypal_order(
  p_order_id uuid,
  p_capture_id text,
  p_payment_response jsonb
)
returns table(order_id uuid, order_number text, already_paid boolean, item_conflict boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing record;
  conflicted_titles text;
begin
  -- Lock the order row first.
  select id, orders.order_number, payment_status
  into existing
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order % not found.', p_order_id using errcode = 'P0002';
  end if;

  if existing.payment_status in ('paid', 'partially_refunded', 'refunded') then
    return query select existing.id, existing.order_number, true, false;
    return;
  end if;

  -- Lock the product rows to prevent two concurrent captures from overselling
  -- the same item. The second caller blocks here until the first transaction commits.
  perform 1
    from public.products p
    join public.order_items oi on oi.product_id = p.id
   where oi.order_id = p_order_id and oi.product_id is not null
   order by p.id
   for update;

  -- After acquiring locks, check whether any line can no longer be fully
  -- fulfilled: the product isn't 'available', or its remaining stock is less
  -- than the quantity this order is buying.
  select string_agg(p.title, ', ')
  into conflicted_titles
  from public.products p
  join public.order_items oi on oi.product_id = p.id
  where oi.order_id = p_order_id
    and oi.product_id is not null
    and (
      lower(replace(coalesce(p.status, ''), ' ', '_')) <> 'available'
      or coalesce(p.quantity, 1) < coalesce(oi.quantity, 1)
    );

  if conflicted_titles is not null then
    -- Another buyer took the remaining stock first. Flag this order for admin
    -- review + refund. Keep the capture reference even though fulfillment lost
    -- the inventory race so the payment can be refunded safely.
    update public.orders
    set payment_status  = 'failed',
        payment_reference = p_capture_id,
        paypal_capture_id = p_capture_id,
        internal_notes  = coalesce(internal_notes || ' | ', '') ||
                          'Payment captured but item(s) no longer in sufficient stock: ' ||
                          conflicted_titles || '. PayPal refund required.',
        payment_response = p_payment_response,
        paid_at = coalesce(paid_at, now())
    where id = p_order_id;

    return query select existing.id, existing.order_number, false, true;
    return;
  end if;

  -- Clear — mark the order paid.
  update public.orders
  set payment_status    = 'paid',
      order_status      = 'completed',
      payment_method    = 'paypal',
      payment_reference = p_capture_id,
      paypal_capture_id = p_capture_id,
      payment_response  = p_payment_response,
      paid_at           = now(),
      reserved_until    = null
  where id = p_order_id;

  -- Decrement stock per line, flipping a product to 'sold' only when its
  -- remaining quantity reaches 0.
  update public.products p
  set quantity          = greatest(coalesce(p.quantity, 1) - coalesce(oi.quantity, 1), 0),
      status            = case
                            when coalesce(p.quantity, 1) - coalesce(oi.quantity, 1) <= 0 then 'sold'
                            else p.status
                          end,
      sold_price        = case
                            when coalesce(p.quantity, 1) - coalesce(oi.quantity, 1) <= 0 then oi.price_snapshot
                            else p.sold_price
                          end,
      reserved_until    = null,
      reserved_order_id = null
  from public.order_items oi
  where oi.order_id = p_order_id
    and oi.product_id is not null
    and oi.product_id = p.id;

  return query select existing.id, existing.order_number, false, false;
end;
$$;

-- Grant the new creation function to service_role only (called from server-side
-- API routes, not from the browser). The old reserve_paypal_order grant to
-- anon/authenticated is intentionally NOT carried over.
grant execute on function public.create_paypal_order(jsonb, jsonb) to service_role;

-- capture_paypal_order already has a service_role grant from paypal-checkout.sql.
-- Re-grant to be safe after the replace.
grant execute on function public.capture_paypal_order(uuid, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- apply_paypal_order_event (updated): drop the reservation-release step from the
-- 'denied' branch. Nothing is reserved anymore, so a denied capture simply marks
-- the order failed — there is no held product to return to the shop (a product
-- only ever leaves 'available' via a successful capture, which sets it 'sold').
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
        payment_response = coalesce(p_payment_response, payment_response)
    where id = p_order_id and payment_status <> 'paid';

  elsif p_event = 'refunded' then
    -- Partial-refund aware (see orders-partial-refund-2026-07.sql): accumulate the
    -- refunded amount and only mark the order fully 'refunded' once cumulative
    -- refunds reach the total; a smaller refund is 'partially_refunded'.
    update public.orders
    set refund_amount = coalesce(refund_amount, 0)
          + coalesce(nullif(p_payment_response->'resource'->'amount'->>'value', '')::numeric, total),
        payment_status = case
            when nullif(p_payment_response->'resource'->'amount'->>'value', '') is null then 'refunded'
            when coalesce(refund_amount, 0)
                 + (p_payment_response->'resource'->'amount'->>'value')::numeric >= coalesce(total, 0)
              then 'refunded'
            else 'partially_refunded'
        end,
        order_status = case
            when nullif(p_payment_response->'resource'->'amount'->>'value', '') is null then 'refunded'
            when coalesce(refund_amount, 0)
                 + (p_payment_response->'resource'->'amount'->>'value')::numeric >= coalesce(total, 0)
              then 'refunded'
            else order_status
        end,
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

grant execute on function public.apply_paypal_order_event(uuid, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Tear down the old 30-minute reservation machinery so no reservation can be
-- created. These functions are no longer called by any app route (create-order
-- uses create_paypal_order above). Dropping them also drops their grants.
--
-- The vestigial products.reserved_until / products.reserved_order_id /
-- orders.reserved_until columns are intentionally LEFT in place (always null now)
-- to avoid a destructive schema change; the capture RPC still null-clears them
-- harmlessly and the admin delete-order path tolerates them. Drop them later if
-- you want a fully clean schema.
-- ---------------------------------------------------------------------------
drop function if exists public.reserve_paypal_order(jsonb, jsonb, integer);
drop function if exists public.release_expired_paypal_reservations();
