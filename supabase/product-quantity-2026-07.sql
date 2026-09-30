-- Per-listing stock count. Most items are still one-of-a-kind (quantity 1,
-- the default), but some listings (e.g. bullion rounds, a matched set of
-- identical pieces) legitimately have more than one unit. `quantity` is the
-- number of units currently in stock for this listing. The app treats a
-- product as purchasable only when BOTH status = 'available' AND
-- quantity > 0 (see isProductPurchasable() in types/product.ts) — the admin
-- editor also auto-flips status to 'sold' the moment quantity is saved at 0.
--
-- Phase 1 of this feature (this migration): the field itself, admin editing,
-- AI listing-assistant autofill, and storefront "in stock" display /
-- purchasability gating. A later phase will let a buyer choose a quantity at
-- checkout and atomically decrement stock in the PayPal capture RPC — until
-- then, quantity only goes down via a manual admin edit.
--
-- Safe to re-run: IF NOT EXISTS guards a fresh install and a re-apply.
--
-- WHY THE EXPLICIT GRANT BELOW IS NEEDED: `security-hardening-2026-07.sql`
-- and `products-internal-columns-authenticated-2026-07.sql` revoked blanket
-- SELECT on public.products for anon/authenticated and replaced it with a
-- column list computed from information_schema *at the time those scripts
-- ran*. Any column added after that (like this one) is NOT selectable by
-- anon/authenticated until explicitly granted — the storefront's
-- column-listed query for it would otherwise fail with "permission denied
-- for column quantity". Run this file AFTER both of the scripts above (if
-- they haven't run yet on this database, this grant is a harmless no-op
-- duplicate of what they'll already include).

alter table public.products
  add column if not exists quantity integer not null default 1;

alter table public.products drop constraint if exists products_quantity_check;
alter table public.products add constraint products_quantity_check
      check (quantity >= 0) not valid;

grant select (quantity) on public.products to anon, authenticated;
