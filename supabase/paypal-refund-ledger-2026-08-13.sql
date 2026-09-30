-- Settle what public.paypal_refunds.amount MEANS, and make the order's
-- refund_amount robust to webhook ordering.
--
-- Run in the Supabase SQL Editor. Safe to re-run. No data migration is needed:
-- public.paypal_refunds currently holds ZERO rows, which is precisely why this
-- is being done now rather than later.
--
-- ---------------------------------------------------------------------------
-- THE PROBLEM
-- ---------------------------------------------------------------------------
-- `amount` was written with two different meanings depending on the caller:
--
--   webhook PAYMENT.CAPTURE.REFUNDED  -> the INCREMENT applied
--   webhook PAYMENT.REFUND.PENDING    -> that refund's OWN amount
--   admin  /orders/[id]/refund        -> that refund's OWN amount
--
-- Those coincide on a capture's FIRST refund and diverge on every partial after
-- it, which is why the ledger could record a $0.50 refund as $0.56.
--
-- The increment was DERIVED (`cumulative - already_refunded`) even though the
-- refund's own amount sits right there in the webhook payload as
-- `resource.amount.value`. Deriving it made the value depend on whether every
-- earlier refund had already been recorded — and PayPal does not guarantee
-- webhook ORDER, so that assumption fails in normal operation.
--
-- ---------------------------------------------------------------------------
-- THE DECISION
-- ---------------------------------------------------------------------------
-- 1. `paypal_refunds.amount` means THIS REFUND'S OWN AMOUNT. One meaning, the
--    same one PayPal uses, and the one two of the three callers already passed.
--    The ledger becomes a faithful record of each individual refund.
--
-- 2. `orders.refund_amount` is SET from PayPal's cumulative
--    `total_refunded_amount`, not accumulated from increments. Cumulative is
--    authoritative and self-correcting: a missed or out-of-order event cannot
--    leave the order short, because the next event carries the true running
--    total. It is clamped monotonically (never decreases) so an out-of-order
--    OLDER event cannot walk the total backwards.
--
-- 3. An applied ledger row is IMMUTABLE in `amount`. The upsert used to rewrite
--    it before the `applied_at` guard ran, so a repeat call could silently
--    rewrite history.
--
-- Callers that do not know a cumulative (the admin refund route, and the
-- PENDING/FAILED webhook) pass NULL and keep the previous accumulate behaviour,
-- which is correct for them: they act synchronously on an accurate current
-- total.

-- ---------------------------------------------------------------------------
-- Replace the function. The parameter list changes, so the old signature must
-- be dropped explicitly; the new trailing parameter has a DEFAULT so existing
-- 8-argument callers continue to resolve without modification.
-- ---------------------------------------------------------------------------
drop function if exists public.apply_paypal_refund(uuid, text, text, numeric, text, text, text, jsonb);
drop function if exists public.apply_paypal_refund(uuid, text, text, numeric, text, text, text, jsonb, numeric);

create or replace function public.apply_paypal_refund(
  p_order_id uuid,
  p_refund_id text,
  p_capture_id text,
  p_amount numeric,               -- THIS refund's own amount
  p_currency text,
  p_status text,
  p_request_key text,
  p_payload jsonb,
  p_cumulative_refunded numeric default null  -- PayPal's total_refunded_amount
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
        -- An APPLIED row's amount is immutable. Previously this overwrote the
        -- recorded amount before the applied_at guard below ever ran, so a
        -- repeat call with a different figure silently rewrote history.
        amount = case
                   when public.paypal_refunds.applied_at is not null
                     then public.paypal_refunds.amount
                   else coalesce(excluded.amount, public.paypal_refunds.amount)
                 end,
        currency = excluded.currency,
        status = case
                   when public.paypal_refunds.applied_at is not null
                     then public.paypal_refunds.status
                   else excluded.status
                 end,
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

  if p_cumulative_refunded is not null then
    -- Authoritative path: PayPal told us the running total for this capture.
    -- greatest() keeps it monotonic so an out-of-order OLDER event cannot walk
    -- the order's refunded total backwards.
    next_refund_amount := least(
      round(locked_order.total::numeric, 2),
      greatest(round(locked_order.refunded::numeric, 2), round(p_cumulative_refunded::numeric, 2))
    );
  else
    -- Caller has no cumulative (admin refund, PENDING/FAILED events). These act
    -- synchronously against an accurate current total, so accumulating is right.
    next_refund_amount := least(
      round(locked_order.total::numeric, 2),
      round((locked_order.refunded + applied_amount)::numeric, 2)
    );
  end if;

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

revoke execute on function public.apply_paypal_refund(uuid, text, text, numeric, text, text, text, jsonb, numeric) from public, anon, authenticated;
grant execute on function public.apply_paypal_refund(uuid, text, text, numeric, text, text, text, jsonb, numeric) to service_role;

-- Verify:
--   select pg_get_function_identity_arguments(oid)
--     from pg_proc where proname = 'apply_paypal_refund';
-- Expect ONE row ending in ", p_cumulative_refunded numeric".
