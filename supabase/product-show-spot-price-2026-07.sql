-- Per-item toggle: whether the product page shows the scrap/melt-value +
-- spot-per-oz callout box (and the matching "own gold/silver, put it toward
-- this piece" line). Off for items that aren't 100% precious metal (mixed
-- metal, gemstones, plating…), where a melt value computed off the full item
-- weight would overstate what the piece is actually worth in scrap. When off,
-- the product page shows a short note instead. Defaults to true so every
-- existing listing keeps its current behavior.
--
-- Safe to re-run: IF NOT EXISTS guards a fresh install and a re-apply.
--
-- WHY THE EXPLICIT GRANTS BELOW ARE NEEDED: `security-hardening-2026-07.sql`
-- and `products-internal-columns-authenticated-2026-07.sql` revoked blanket
-- SELECT on public.products for anon/authenticated and replaced it with a
-- column list computed from information_schema *at the time those scripts
-- ran*. Any column added after that (like this one) is NOT selectable by
-- anon/authenticated until explicitly granted — the storefront's column-listed
-- query for it would otherwise fail with "permission denied for column
-- show_spot_price". Run this file AFTER both of the scripts above (if they
-- haven't run yet on this database, this grant is a harmless no-op duplicate
-- of what they'll already include).

alter table public.products
  add column if not exists show_spot_price boolean not null default true;

grant select (show_spot_price) on public.products to anon, authenticated;
