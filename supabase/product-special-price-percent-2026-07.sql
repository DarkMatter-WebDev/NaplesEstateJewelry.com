-- Adds a second way to override the "Own gold or silver? Put it toward this
-- piece and pay as little as ___" trade-in line on the product page. Before
-- this, an admin could only replace that line with a flat dollar amount
-- (special_price_override_amount). This adds a *mode* so the same override can
-- instead be expressed as a percentage over the item's spot/melt value, which
-- auto-tracks the live spot price instead of being a fixed number:
--
--   mode = 'amount'  → trade-in line shows special_price_override_amount (flat $)
--   mode = 'percent' → trade-in line shows meltValue * (1 + percent/100)
--
-- The override as a whole is still gated by special_price_override_enabled, and
-- the "Scrap value" box above the line keeps showing the real computed melt
-- value either way. Defaults keep every existing listing on the flat-amount
-- behavior it already had (mode defaults to 'amount').
--
-- Safe to re-run: IF NOT EXISTS guards a fresh install and a re-apply.
--
-- WHY THE EXPLICIT GRANTS BELOW ARE NEEDED: `security-hardening-2026-07.sql`
-- and `products-internal-columns-authenticated-2026-07.sql` revoked blanket
-- SELECT on public.products for anon/authenticated and replaced it with a
-- fixed column list. Any column added after that (like these two) is NOT
-- selectable by anon/authenticated until explicitly granted — the storefront's
-- column-listed query would otherwise fail with "permission denied for column
-- special_price_override_mode". Run this file AFTER those scripts (if they
-- haven't run yet on this database, this grant is a harmless duplicate of what
-- they'll already include).

alter table public.products
  add column if not exists special_price_override_mode text not null default 'amount',
  add column if not exists special_price_override_percent numeric(6,2);

alter table public.products drop constraint if exists products_special_price_override_mode_check;
alter table public.products add constraint products_special_price_override_mode_check
      check (special_price_override_mode in ('amount', 'percent')) not valid;

alter table public.products drop constraint if exists products_special_price_override_percent_check;
alter table public.products add constraint products_special_price_override_percent_check
      check (special_price_override_percent is null or special_price_override_percent >= 0) not valid;

grant select (special_price_override_mode, special_price_override_percent)
  on public.products to anon, authenticated;
