-- Phase 2 of the per-listing Quantity feature: let a buyer purchase more than
-- one unit of the same listing, and decrement stock atomically at capture.
--
-- Depends on product-quantity-2026-07.sql (adds products.quantity). Run this
-- AFTER that file and AFTER no-reservation-checkout.sql. Safe to re-run.
--
-- What this migration does:
--   1. Adds order_items.quantity (how many units of that line the buyer bought).
--   2. Rewrites create_paypal_order to store the per-line quantity and to reject
--      an order whose requested quantity exceeds the live stock (snapshot check,
--      no lock — the capture step below is the authoritative, serialized gate).
--   3. Rewrites capture_paypal_order to, under the existing per-product row lock,
--      verify sufficient remaining stock for every line and then DECREMENT
--      products.quantity by the purchased amount (flipping status to 'sold' only
--      when a product's remaining quantity reaches 0), instead of the old
--      always-mark-'sold' one-of-a-kind logic.
--
-- The capture function keeps the same return signature
-- (order_id, order_number, already_paid, item_conflict), so `create or replace`
-- is sufficient — no drop needed.

-- ---------------------------------------------------------------------------
-- 1. order_items.quantity
-- ---------------------------------------------------------------------------
alter table public.order_items
  add column if not exists quantity integer not null default 1;

alter table public.order_items drop constraint if exists order_items_quantity_check;
alter table public.order_items add constraint order_items_quantity_check
      check (quantity >= 1) not valid;

-- ---------------------------------------------------------------------------
-- 2. create_paypal_order: store per-line quantity + snapshot stock check.
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
-- 3. capture_paypal_order: lock product rows, verify sufficient remaining stock
-- for every line, then decrement products.quantity by the purchased amount
-- (marking a product 'sold' only when its remaining quantity hits 0).
-- ---------------------------------------------------------------------------
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
  -- the same item. The second caller blocks here until the first commits.
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

grant execute on function public.create_paypal_order(jsonb, jsonb) to service_role;
grant execute on function public.capture_paypal_order(uuid, text, jsonb) to service_role;
