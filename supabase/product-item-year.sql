-- Item Year field: the year the physical jewelry item was made (e.g. 1930),
-- NOT the date the listing was created. This replaces the old `item_date`
-- column (a calendar date that had been incorrectly backfilled with each
-- listing's created_at, which is why every product appeared to show its
-- listing-creation date).
--
-- Run order in the Supabase SQL Editor:
--   1. Run this file.
--   2. Re-run admin-notifications-checkout.sql so the create_checkout_order()
--      function writes item_year_snapshot (the old version references the now
--      dropped item_date_snapshot column and would fail at checkout).

-- Products: drop the old item_date column. Dropping it clears the incorrect
-- backfilled values and removes the dependent index in one step, then add a
-- year-only column with a sane range guard.
drop index if exists products_item_date_idx;
alter table public.products drop column if exists item_date;
alter table public.products add column if not exists item_year smallint;
alter table public.products drop constraint if exists products_item_year_range;
alter table public.products
  add constraint products_item_year_range
  check (item_year is null or (item_year between 1 and 2200));
create index if not exists products_item_year_idx on public.products (item_year);

-- Order item snapshots: switch the captured value from a date to a year.
alter table public.order_items drop column if exists item_date_snapshot;
alter table public.order_items add column if not exists item_year_snapshot smallint;
