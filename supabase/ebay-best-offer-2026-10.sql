-- Naples Estate Jewelry - eBay Best Offer, chosen per item (2026-10-14).
-- Safe to re-run. Run in the Supabase SQL Editor (before or after the deploy:
-- without this column every eBay listing keeps going up as Buy It Now only and
-- only the item's "Allow offers" box fails to save).
--
-- ON = the item's eBay listing shows "Make Offer" (no auto-accept or
-- auto-decline price; the owner answers offers on eBay). The admin's eBay
-- drawer section edits it, through /api/admin/ebay/best-offer with the service
-- role, and every offer the sync sends to eBay carries it
-- (next-app/src/lib/ebay/sync.ts → offerBody).
--
-- It lives on products, not ebay_listings, on purpose: an ebay_listings row in
-- state 'pending' is what the publish queue claims, so creating one just to
-- hold this choice would stage the item for eBay.
--
-- No anon / authenticated grant: admin-only, read through the service role.
-- The old account-wide ebay_connection.best_offer_enabled column is unused
-- from today (it was never sent to eBay) and is left in place.

alter table public.products
  add column if not exists ebay_best_offer boolean not null default false;

comment on column public.products.ebay_best_offer is
  'eBay listing allows Best Offer ("Make Offer"); no auto-accept/decline prices. Admin-only.';

select
  column_name,
  data_type,
  column_default,
  is_nullable,
  has_column_privilege('anon', 'public.products', 'ebay_best_offer', 'select') as anon_can_read
from information_schema.columns
where table_schema = 'public'
  and table_name = 'products'
  and column_name = 'ebay_best_offer';
