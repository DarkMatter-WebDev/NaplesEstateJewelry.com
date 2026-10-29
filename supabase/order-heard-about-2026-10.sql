-- "How did you hear about us?" on the Order Received screen (2026-10-29).
--
-- After a website checkout is paid, the buyer may tap ONE answer (or type their
-- own under "Other…"). The answer is saved on that order and shown as a
-- "Heard about us" line in Admin → Orders → the order's Customer card.
--
--   heard_about        = the choice KEY, always English (google_search,
--                        google_maps, instagram, facebook, tiktok, yelp,
--                        nextdoor, ai_assistant, friend_family, showroom,
--                        ebay_etsy, other) — the list lives in
--                        next-app/src/lib/order-heard-about.ts, so a Spanish
--                        answer counts the same as an English one.
--   heard_about_other  = what they typed when heard_about = 'other' (≤ 80 chars)
--
-- Writes: only POST /api/orders/heard-about (service role), once per paid order.
-- Reads: Admin → Orders (admin session; existing orders RLS). No new grants.
--
-- Run in the Supabase SQL Editor BEFORE deploying the matching app code. Safe
-- to re-run (idempotent). Until it runs, the card still shows but Send answers
-- "could not save" quietly, and the admin page simply shows no line.

alter table public.orders
  add column if not exists heard_about text;

alter table public.orders
  add column if not exists heard_about_other text;

alter table public.orders drop constraint if exists orders_heard_about_format_check;
alter table public.orders add constraint orders_heard_about_format_check
      check (heard_about is null or heard_about ~ '^[a-z_]{1,40}$');

alter table public.orders drop constraint if exists orders_heard_about_other_length_check;
alter table public.orders add constraint orders_heard_about_other_length_check
      check (heard_about_other is null or char_length(heard_about_other) <= 80);

notify pgrst, 'reload schema';

-- Check: should list both new columns.
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'orders'
   and column_name in ('heard_about', 'heard_about_other')
 order by column_name;
