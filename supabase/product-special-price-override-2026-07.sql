-- Per-item manual override for the "Own gold or silver? Put it toward this
-- piece and pay as little as ___" trade-in line on the product page. That
-- line normally defaults to the computed scrap/melt value (the same number
-- shown in the "Scrap value" box just above it). When the override is
-- enabled and a positive amount is set, the product page shows that custom
-- amount on the trade-in line instead — the scrap-value box itself keeps
-- showing the real computed value either way. Defaults to off so every
-- existing listing keeps its current (computed) behavior.
--
-- Safe to re-run: IF NOT EXISTS guards a fresh install and a re-apply.
--
-- WHY THE EXPLICIT GRANTS BELOW ARE NEEDED: `security-hardening-2026-07.sql`
-- and `products-internal-columns-authenticated-2026-07.sql` revoked blanket
-- SELECT on public.products for anon/authenticated and replaced it with a
-- column list computed from information_schema *at the time those scripts
-- ran*. Any column added after that (like these two) is NOT selectable by
-- anon/authenticated until explicitly granted — the storefront's
-- column-listed query for them would otherwise fail with "permission denied
-- for column special_price_override_enabled". Run this file AFTER both of
-- the scripts above (if they haven't run yet on this database, this grant is
-- a harmless no-op duplicate of what they'll already include).

alter table public.products
  add column if not exists special_price_override_enabled boolean not null default false,
  add column if not exists special_price_override_amount numeric(12,2);

alter table public.products drop constraint if exists products_special_price_override_amount_check;
alter table public.products add constraint products_special_price_override_amount_check
      check (special_price_override_amount is null or special_price_override_amount >= 0) not valid;

grant select (special_price_override_enabled, special_price_override_amount)
  on public.products to anon, authenticated;
