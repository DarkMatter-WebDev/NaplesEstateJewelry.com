-- Second way to set the SITE-WIDE "Own gold or silver? … pay as little as ___"
-- trade-in line (Admin → Settings → Customer Trade-in Price). Before this, the
-- site-wide default could only be a signed % over the item's melt value
-- (special_price_default_percent, `shop-special-price-default-2026-07.sql`).
-- This adds a choice of BASIS so the same default can instead be a % OFF the
-- item's asking price (the same number the shop shows and checkout charges):
--
--   basis = 'melt'   → advertised = melt  * (1 + special_price_default_percent/100)
--   basis = 'asking' → advertised = asking * (1 - special_price_default_discount_percent/100)
--
-- Each basis keeps its own number, so switching back and forth loses nothing.
-- The per-item override (products.special_price_override_*) still wins, and
-- with basis 'melt' (the default) behavior is exactly as before.
--
-- Reads: the public storefront reads these (anon/authenticated SELECT already
-- granted on shop_settings). Writes: admin API only (service role).
--
-- Run in the Supabase SQL Editor BEFORE deploying the matching app code. Safe
-- to re-run (idempotent). Until it runs, the app keeps the melt-only behavior.

alter table public.shop_settings
  add column if not exists special_price_default_basis text not null default 'melt';

alter table public.shop_settings
  add column if not exists special_price_default_discount_percent numeric;

alter table public.shop_settings drop constraint if exists shop_settings_special_price_default_basis_check;
alter table public.shop_settings add constraint shop_settings_special_price_default_basis_check
      check (special_price_default_basis in ('melt', 'asking'));

alter table public.shop_settings drop constraint if exists shop_settings_special_price_default_discount_percent_check;
alter table public.shop_settings add constraint shop_settings_special_price_default_discount_percent_check
      check (special_price_default_discount_percent is null
             or (special_price_default_discount_percent >= 0 and special_price_default_discount_percent <= 100));

notify pgrst, 'reload schema';

-- Check: should list both new columns.
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'shop_settings'
   and column_name in ('special_price_default_basis', 'special_price_default_discount_percent')
 order by column_name;
