-- Naples Estate Jewelry - eBay Best Offer MINIMUM, chosen per item (2026-11-01).
-- Safe to re-run. Run in the Supabase SQL Editor BEFORE pushing the deploy
-- (without these columns everything else keeps working; only the item's
-- "Minimum offer" box fails to save and no minimum is sent to eBay).
--
-- The owner's minimum for offers on an item's eBay listing. eBay declines any
-- offer under it automatically (eBay's auto-decline price); nothing is ever
-- accepted automatically. Three kinds, one column each so a number never
-- changes meaning:
--   off_amount  -> eBay price minus a dollar amount   (ebay_offer_min_off_amount)
--   off_percent -> eBay price minus a percentage      (ebay_offer_min_off_percent)
--   fixed       -> a dollar amount on its own         (ebay_offer_min_fixed)
-- ebay_offer_min_mode = null means no minimum. Switching kinds keeps the other
-- numbers, so switching back remembers them. The figure sent to eBay is worked
-- out from the CURRENT eBay price on every offer write
-- (next-app/src/lib/ebay/best-offer.ts → computeOfferMinimum), so it follows
-- spot. It only applies while the item's "Allow offers" box
-- (products.ebay_best_offer, supabase/ebay-best-offer-2026-10.sql) is on.
--
-- On products, never ebay_listings (an ebay_listings row in state 'pending' is
-- what the publish queue claims). No anon / authenticated grant: admin-only,
-- read and written through the service role (/api/admin/ebay/offer-minimum).

alter table public.products
  add column if not exists ebay_offer_min_mode text,
  add column if not exists ebay_offer_min_off_amount numeric(12, 2),
  add column if not exists ebay_offer_min_off_percent numeric(5, 2),
  add column if not exists ebay_offer_min_fixed numeric(12, 2);

alter table public.products drop constraint if exists products_ebay_offer_min_mode_check;
alter table public.products
  add constraint products_ebay_offer_min_mode_check
  check (ebay_offer_min_mode is null or ebay_offer_min_mode in ('off_amount', 'off_percent', 'fixed'));

alter table public.products drop constraint if exists products_ebay_offer_min_values_check;
alter table public.products
  add constraint products_ebay_offer_min_values_check
  check (
    (ebay_offer_min_off_amount is null or ebay_offer_min_off_amount > 0)
    and (ebay_offer_min_off_percent is null or (ebay_offer_min_off_percent > 0 and ebay_offer_min_off_percent < 100))
    and (ebay_offer_min_fixed is null or ebay_offer_min_fixed > 0)
  );

comment on column public.products.ebay_offer_min_mode is
  'eBay Best Offer minimum kind: off_amount | off_percent | fixed; null = no minimum. Sent as the auto-decline price. Admin-only.';
comment on column public.products.ebay_offer_min_off_amount is
  'eBay Best Offer minimum = eBay price minus this many dollars (mode off_amount). Admin-only.';
comment on column public.products.ebay_offer_min_off_percent is
  'eBay Best Offer minimum = eBay price minus this percent, rounded down to whole dollars (mode off_percent). Admin-only.';
comment on column public.products.ebay_offer_min_fixed is
  'eBay Best Offer minimum as a fixed dollar amount (mode fixed). Admin-only.';

-- Check 1: four rows, none readable by anon.
select
  column_name,
  data_type,
  is_nullable,
  has_column_privilege('anon', 'public.products', column_name, 'select') as anon_can_read
from information_schema.columns
where table_schema = 'public'
  and table_name = 'products'
  and column_name like 'ebay_offer_min_%'
order by column_name;

-- Check 2: two constraint rows.
select conname
from pg_constraint
where conrelid = 'public.products'::regclass
  and conname in ('products_ebay_offer_min_mode_check', 'products_ebay_offer_min_values_check')
order by conname;
