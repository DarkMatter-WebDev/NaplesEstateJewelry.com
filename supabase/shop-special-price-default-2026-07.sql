-- Site-wide default for the "Own gold or silver? … pay as little as ___"
-- customer trade-in price shown on each product page.
--
-- Historically that line defaults to the item's computed melt/spot value. These
-- two columns let an admin set ONE site-wide default for every item at once —
-- a percent over (or under) the melt value — without touching each listing. The
-- existing per-item override (products.special_price_override_*) still wins for
-- any individual item. When disabled (the default), behavior is unchanged: the
-- line shows the plain melt value.
--
--   special_price_default_enabled  — master on/off for the site-wide default
--   special_price_default_percent  — signed % applied to melt value:
--                                     advertised = melt * (1 + percent/100)
--                                     (negative = below spot, positive = above)
--
-- Reads: the public storefront reads these (anon/authenticated SELECT already
-- granted on shop_settings). Writes: admin API only (service role).
--
-- Run in the Supabase SQL Editor. Safe to re-run (idempotent).

alter table public.shop_settings
  add column if not exists special_price_default_enabled boolean not null default false;

alter table public.shop_settings
  add column if not exists special_price_default_percent numeric;

notify pgrst, 'reload schema';
