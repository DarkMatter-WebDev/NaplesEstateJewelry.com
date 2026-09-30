-- ============================================================================
-- Partial-refund-aware apply_paypal_order_event.
-- Run AFTER no-reservation-checkout.sql and orders-refund-amount.sql. Idempotent.
-- ============================================================================
--
-- Problem (audit M4): PayPal fires PAYMENT.CAPTURE.REFUNDED for PARTIAL refunds
-- too, and the old 'refunded' branch unconditionally set payment_status +
-- order_status to 'refunded' and never recorded refund_amount — so a $10 partial
-- refund flipped a $2,000 order to fully refunded. This version reads the refund
-- amount from the event, accumulates it into orders.refund_amount, and only marks
-- the order fully 'refunded' once the cumulative refund reaches the order total;
-- a smaller refund is recorded as 'partially_refunded' and leaves order_status
-- alone. A refund event with no amount (shouldn't happen) is treated as full.
--
-- This same definition has also been folded into no-reservation-checkout.sql so a
-- future re-run of that file keeps the fix.

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
revoke execute on function public.apply_paypal_order_event(uuid, text, jsonb) from public;
