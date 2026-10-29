-- "This is a gift" at checkout (2026-10-29).
--
-- A buyer may tick "This is a gift". Shipping: they give the RECIPIENT's name
-- (the package and PayPal's shipping name use it) and an optional message.
-- Local Pickup: message only. Admin → Orders → the order shows a GIFT tag, the
-- recipient, the message and a "Print gift slip" button (no prices).
--
--   is_gift              = true when the box was ticked (default false)
--   gift_recipient_name  = "Mary Smith" (shipping gifts only; ≤ 120 chars)
--   gift_message         = the buyer's message, as typed (≤ 250 chars)
--
-- Writes: only POST /api/paypal/create-order (service role), right after the
-- order row is created or resumed. Reads: the buyer's receipt email, Admin →
-- Orders and the gift slip (admin session; existing orders RLS). No new grants.
--
-- Run in the Supabase SQL Editor BEFORE deploying the matching app code. Safe
-- to re-run (idempotent). Until it runs, checkout still works: a gift order's
-- recipient + message are written into the order's customer notes instead.

alter table public.orders
  add column if not exists is_gift boolean not null default false;

alter table public.orders
  add column if not exists gift_recipient_name text;

alter table public.orders
  add column if not exists gift_message text;

alter table public.orders drop constraint if exists orders_gift_recipient_name_length_check;
alter table public.orders add constraint orders_gift_recipient_name_length_check
      check (gift_recipient_name is null or char_length(gift_recipient_name) <= 120);

alter table public.orders drop constraint if exists orders_gift_message_length_check;
alter table public.orders add constraint orders_gift_message_length_check
      check (gift_message is null or char_length(gift_message) <= 250);

notify pgrst, 'reload schema';

-- Check: should list all three new columns.
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'orders'
   and column_name in ('is_gift', 'gift_recipient_name', 'gift_message')
 order by column_name;
