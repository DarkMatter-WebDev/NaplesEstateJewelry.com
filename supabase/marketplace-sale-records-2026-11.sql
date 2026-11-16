-- Marketplace sale RECORDS on Admin → Orders (2026-11-16).
--
-- Owner: "add a record in our orders on my site that shows / lists an item
-- that has sold on ebay / etsy.. no need to record buyer data though.. just a
-- simple record letting me know it sold, when, and how much". Option B: the
-- sales are mixed into the Orders list with an eBay / Etsy chip (they are NOT
-- rows in `orders` — no receipts, no tax totals, no buyer).
--
-- `marketplace_sale_events` (supabase/marketplace-sales-2026-09.sql) already
-- holds one row per applied sale line. This adds what the Orders list shows,
-- lets the sweep also record sales of items listed on eBay/Etsy by hand
-- (product_id null, outcome 'unmatched'), and lets the one-time fill-in of
-- past sales run once per marketplace.
--
-- ⛔ NO BUYER DATA goes in this table — only order/line ids, item title,
-- date, quantity and price (the basis of the eBay account-deletion opt-out,
-- granted 2026-11-16).
--
-- Safe to re-run. Run in the Supabase SQL editor as the project owner.
-- Safe before OR after the site deploy: the code skips the new columns and
-- the fill-in until they exist, and the Orders page simply shows no
-- marketplace rows until the grant below is in place.

-- 1. What the Orders list shows.
alter table public.marketplace_sale_events
  add column if not exists title              text,          -- the marketplace listing title (our own words)
  add column if not exists sold_at            timestamptz,   -- when the marketplace order was created
  add column if not exists item_reference     text,          -- eBay item id / Etsy listing id or SKU
  add column if not exists marketplace_status text;          -- null = sold; 'refunded' / 'cancelled' when seen later

-- 2. The server (service role) reads these for the Orders page and writes
--    the record-only rows. Found 2026-11-16: the service role had NO
--    privilege on this table ("permission denied") — only the SECURITY
--    DEFINER function apply_marketplace_sale could write it. Browsers still
--    get nothing (anon / authenticated stay revoked, RLS on, no policies).
grant select, insert, update on public.marketplace_sale_events to service_role;
grant usage, select on sequence public.marketplace_sale_events_id_seq to service_role;

-- 3. One-time fill-in of past sales: set when it has run for that marketplace.
alter table public.ebay_connection
  add column if not exists sales_backfilled_at timestamptz;
alter table public.etsy_connection
  add column if not exists sales_backfilled_at timestamptz;

-- 4. Check: ONE row, every value true.
select
  (select count(*) = 4 from information_schema.columns
     where table_schema = 'public' and table_name = 'marketplace_sale_events'
       and column_name in ('title', 'sold_at', 'item_reference', 'marketplace_status')) as record_columns,
  has_table_privilege('service_role', 'public.marketplace_sale_events', 'select')
    and has_table_privilege('service_role', 'public.marketplace_sale_events', 'insert')
    and has_table_privilege('service_role', 'public.marketplace_sale_events', 'update') as server_can_read_write,
  not has_table_privilege('anon', 'public.marketplace_sale_events', 'select')
    and not has_table_privilege('authenticated', 'public.marketplace_sale_events', 'select') as browsers_cannot_read,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ebay_connection' and column_name = 'sales_backfilled_at')
    and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'etsy_connection' and column_name = 'sales_backfilled_at') as backfill_markers;
