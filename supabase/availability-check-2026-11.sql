-- Naples Estate Jewelry - "Check Availability" on items another dealer holds (2026-11-05).
-- Safe to re-run. ⛔ Run ALL of it in the Supabase SQL Editor BEFORE pushing the
-- deploy: the new code reads product_offers.kind on every offer screen and
-- sweep, so without this column Make an Offer and Admin -> Offers stop working
-- until it runs (they show "Run the SQL first").
--
-- How it works (owner, 2026-11-05, mockup 1):
--   * products.confirm_availability - the item's "Confirm availability first"
--     box (off by default). On a ticked item "Add to Cart" becomes "Check
--     Availability": the buyer sends name + email (phone and a message
--     optional), NO payment. The checkout refuses the item without a Buy link.
--   * Each request is a product_offers row with kind = 'availability': status
--     'open' (no PayPal hold), 72 hours to answer.
--   * "Available - send Buy link" = the counter-offer link at today's price,
--     good for 48 hours (status 'countered'; paid -> 'counter_bought').
--   * Kept off eBay and Etsy (their pre-flight refuses a ticked item). It STAYS
--     in the Instagram/Facebook shop (owner): a Buy tap there opens the item's
--     Check Availability form, never the cart.
--   * "Not available" = status 'declined' + a "this piece has sold" email,
--     optionally marking the item Sold.
--   * The existing 15-minute offers sweep (nej-offers-sweep) expires requests
--     and links - no new cron job.

-- 1. The item's box ----------------------------------------------------------
alter table public.products
  add column if not exists confirm_availability boolean not null default false;

comment on column public.products.confirm_availability is
  'Owner-set per item: "Check Availability" replaces Add to Cart; the buyer pays only through the private Buy link the owner sends. Kept off eBay and Etsy; a Meta shop Buy tap opens the ask-first form.';

-- The shop and item pages are read by visitors (anon) and signed-in buyers
-- (authenticated) through column grants, so the new column needs its own.
grant select (confirm_availability) on public.products to anon, authenticated;

-- 2. Which kind of request an offers row is -----------------------------------
alter table public.product_offers
  add column if not exists kind text not null default 'offer';

alter table public.product_offers drop constraint if exists product_offers_kind_check;
alter table public.product_offers
  add constraint product_offers_kind_check check (kind in ('offer', 'availability'));

comment on column public.product_offers.kind is
  'offer = Make an Offer (PayPal hold); availability = Check Availability (no payment; the answer is a Buy link or a "sold" email).';

-- PostgREST must see the new columns now, not on its next restart.
notify pgrst, 'reload schema';

-- 3. Verify -------------------------------------------------------------------
-- The editor shows the LAST result: one row, every value true.
select
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'products' and column_name = 'confirm_availability') as products_confirm_availability,
  has_column_privilege('anon', 'public.products', 'confirm_availability', 'select')                     as anon_can_read_flag,
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'product_offers' and column_name = 'kind')        as offers_kind,
  not has_table_privilege('anon', 'public.product_offers', 'select')                                    as offers_still_private,
  exists (select 1 from cron.job where jobname = 'nej-offers-sweep' and active)                         as sweep_still_scheduled;
