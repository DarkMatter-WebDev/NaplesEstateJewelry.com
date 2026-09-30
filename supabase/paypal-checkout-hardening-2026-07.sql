-- PayPal checkout failure-recovery and refund hardening.
-- Run after no-reservation-checkout.sql, checkout-quantity-2026-07.sql, and
-- product-sold-price-lock-2026-07.sql. Safe to re-run.

create extension if not exists "pgcrypto";

-- The refund ledger and both refund RPCs depend on this legacy additive column.
-- Keep it here as well as in orders-refund-amount.sql so this hardening file is
-- self-contained on databases that missed the earlier partial-refund migration.
alter table public.orders
  add column if not exists refund_amount numeric(12,2);

create table if not exists public.paypal_refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  request_key text,
  paypal_refund_id text not null,
  paypal_capture_id text,
  amount numeric(12,2),
  currency text not null default 'USD',
  status text not null default 'PENDING',
  payload jsonb,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (paypal_refund_id),
  unique (request_key)
);

alter table public.paypal_refunds enable row level security;
revoke all on table public.paypal_refunds from public, anon, authenticated;
grant select, insert, update, delete on table public.paypal_refunds to service_role;

drop policy if exists "Admins read PayPal refunds" on public.paypal_refunds;
create policy "Admins read PayPal refunds"
  on public.paypal_refunds for select
  using (public.is_admin_user(auth.uid()));
grant select on table public.paypal_refunds to authenticated;

create or replace function public.paypal_refund_hardening_ready()
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    to_regclass('public.paypal_refunds') is not null
    and exists (
      select 1
        from information_schema.columns
       where table_schema = 'public'
         and table_name = 'orders'
         and column_name = 'refund_amount'
    )
    and to_regprocedure(
      'public.apply_paypal_refund(uuid,text,text,numeric,text,text,text,jsonb)'
    ) is not null
    and to_regprocedure('public.capture_paypal_order(uuid,text,jsonb)') is not null;
$$;

create or replace function public.apply_paypal_refund(
  p_order_id uuid,
  p_refund_id text,
  p_capture_id text,
  p_amount numeric,
  p_currency text,
  p_status text,
  p_request_key text,
  p_payload jsonb
)
returns table(
  order_id uuid,
  refund_amount numeric,
  payment_status text,
  already_applied boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_order record;
  refund_row record;
  applied_amount numeric;
  next_refund_amount numeric;
  result_payment_status text;
begin
  if p_order_id is null then
    raise exception 'PayPal refund has no matching order.' using errcode = 'P0002';
  end if;
  if nullif(trim(coalesce(p_refund_id, '')), '') is null then
    raise exception 'PayPal refund id is required.' using errcode = '22023';
  end if;
  if upper(coalesce(p_currency, 'USD')) <> 'USD' then
    raise exception 'Unexpected PayPal refund currency: %', p_currency using errcode = '22023';
  end if;

  select id, total, coalesce(orders.refund_amount, 0) as refunded,
         orders.payment_status, orders.order_status, orders.paypal_capture_id
    into locked_order
    from public.orders
   where id = p_order_id
   for update;
  if not found then
    raise exception 'Order % not found.', p_order_id using errcode = 'P0002';
  end if;
  if nullif(trim(coalesce(p_capture_id, '')), '') is not null
     and nullif(trim(coalesce(locked_order.paypal_capture_id, '')), '') is not null
     and p_capture_id <> locked_order.paypal_capture_id then
    raise exception 'PayPal capture % does not match order %.', p_capture_id, p_order_id
      using errcode = '22023';
  end if;

  insert into public.paypal_refunds (
    order_id, request_key, paypal_refund_id, paypal_capture_id,
    amount, currency, status, payload, updated_at
  ) values (
    p_order_id, nullif(p_request_key, ''), p_refund_id,
    coalesce(nullif(p_capture_id, ''), locked_order.paypal_capture_id),
    p_amount, upper(coalesce(p_currency, 'USD')), upper(coalesce(p_status, 'PENDING')),
    p_payload, now()
  )
  on conflict (paypal_refund_id) do update
    set request_key = coalesce(public.paypal_refunds.request_key, excluded.request_key),
        paypal_capture_id = coalesce(public.paypal_refunds.paypal_capture_id, excluded.paypal_capture_id),
        amount = coalesce(excluded.amount, public.paypal_refunds.amount),
        currency = excluded.currency,
        status = excluded.status,
        payload = coalesce(excluded.payload, public.paypal_refunds.payload),
        updated_at = now()
  returning id, applied_at, status, amount into refund_row;

  if refund_row.applied_at is not null then
    return query select locked_order.id, locked_order.refunded,
      locked_order.payment_status, true;
    return;
  end if;

  if upper(coalesce(refund_row.status, 'PENDING')) <> 'COMPLETED' then
    return query select locked_order.id, locked_order.refunded,
      locked_order.payment_status, false;
    return;
  end if;

  applied_amount := coalesce(refund_row.amount, locked_order.total - locked_order.refunded);
  if applied_amount <= 0 then
    raise exception 'PayPal refund amount must be greater than zero.' using errcode = '22023';
  end if;

  next_refund_amount := least(
    round(locked_order.total::numeric, 2),
    round((locked_order.refunded + applied_amount)::numeric, 2)
  );

  update public.orders
     set refund_amount = next_refund_amount,
         payment_status = case
           when next_refund_amount >= round(total::numeric, 2) then 'refunded'
           else 'partially_refunded'
         end,
         order_status = case
           when next_refund_amount >= round(total::numeric, 2) then 'refunded'
           else order_status
         end,
         payment_response = coalesce(p_payload, payment_response)
   where id = p_order_id
  returning orders.payment_status into result_payment_status;

  update public.paypal_refunds
     set applied_at = now(), updated_at = now()
   where id = refund_row.id;

  return query select locked_order.id, next_refund_amount,
    result_payment_status, false;
end;
$$;

revoke execute on function public.paypal_refund_hardening_ready() from public, anon, authenticated;
revoke execute on function public.apply_paypal_refund(uuid, text, text, numeric, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.paypal_refund_hardening_ready() to service_role;
grant execute on function public.apply_paypal_refund(uuid, text, text, numeric, text, text, text, jsonb) to service_role;

-- Bind the sold-price fallback to an actually paid order. A newer unpaid
-- checkout for the same product must never supply the winning sold price.
create or replace function public.apply_product_sold_price_lock()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if lower(coalesce(new.status, '')) = 'available' then
    new.sold_price := null;
    return new;
  end if;

  if lower(coalesce(new.status, '')) = 'sold'
     and new.sold_price is null
     and (tg_op = 'INSERT' or lower(coalesce(old.status, '')) <> 'sold') then
    select oi.price_snapshot
      into new.sold_price
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
     where oi.product_id = new.id
       and o.payment_status = 'paid'
     order by oi.created_at desc
     limit 1;
  end if;

  return new;
end;
$$;

-- Recreate the capture RPC so a captured race loser retains the capture
-- reference needed for a refund, and the winning line supplies sold_price.
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

  perform 1
    from public.products p
    join public.order_items oi on oi.product_id = p.id
   where oi.order_id = p_order_id and oi.product_id is not null
   order by p.id
   for update;

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
    update public.orders
       set payment_status = 'failed',
           payment_reference = p_capture_id,
           paypal_capture_id = p_capture_id,
           payment_response = p_payment_response,
           paid_at = coalesce(paid_at, now()),
           internal_notes = coalesce(internal_notes || ' | ', '') ||
             'Payment captured but item(s) no longer in sufficient stock: ' ||
             conflicted_titles || '. PayPal refund required.'
     where id = p_order_id;

    return query select existing.id, existing.order_number, false, true;
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

  update public.products p
     set quantity = greatest(coalesce(p.quantity, 1) - coalesce(oi.quantity, 1), 0),
         status = case
           when coalesce(p.quantity, 1) - coalesce(oi.quantity, 1) <= 0 then 'sold'
           else p.status
         end,
         sold_price = case
           when coalesce(p.quantity, 1) - coalesce(oi.quantity, 1) <= 0 then oi.price_snapshot
           else p.sold_price
         end,
         reserved_until = null,
         reserved_order_id = null
    from public.order_items oi
   where oi.order_id = p_order_id
     and oi.product_id is not null
     and oi.product_id = p.id;

  return query select existing.id, existing.order_number, false, false;
end;
$$;

revoke execute on function public.capture_paypal_order(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.capture_paypal_order(uuid, text, jsonb) to service_role;

notify pgrst, 'reload schema';
