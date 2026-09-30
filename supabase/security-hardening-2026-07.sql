-- Naples Estate Jewelry — Security hardening (2026-07 audit).
-- Run ONCE in the Supabase SQL Editor. Every section is independent and
-- re-runnable. A rollback block is at the very bottom (commented out).
--
-- Pairs with app changes in the same audit:
--   * next-app/src/app/api/checkout/order/route.ts  (calls create_checkout_order
--     via the service-role client — required by section 2)
--   * next-app/src/lib/checkout-pricing.ts          ($0 line-item guard, CODE-D01)
--
-- Fixes: CODE-S01 (admin self-promotion), CODE-S02/D03 (anon checkout RPC),
--        CODE-D04 (anon reading internal product columns), CODE-D07
--        (missing product constraints). See the audit for full context.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CODE-S01 (CRITICAL): stop customers from making themselves admin.
--    `profiles` had a blanket UPDATE/INSERT grant to `authenticated`, so the
--    "Users update own profile" RLS policy (using auth.uid() = id) let anyone
--    set is_admin = true on their own row. Re-grant every column EXCEPT the
--    privileged ones. The app never writes is_admin/is_vip/account_type/
--    internal_notes from the browser (admin promotion is done directly in the
--    DB / via the service role, which bypasses column grants), so this is
--    transparent to the app. The account profile form only writes name, phone,
--    address, and marketing prefs — all still granted.
-- ─────────────────────────────────────────────────────────────────────────────
revoke insert, update on public.profiles from authenticated;

do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ')
    into cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'profiles'
     and column_name not in ('is_admin', 'is_vip', 'account_type', 'internal_notes');
  execute format('grant insert (%s) on public.profiles to authenticated', cols);
  execute format('grant update (%s) on public.profiles to authenticated', cols);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CODE-S02 / CODE-D03 (HIGH): the public checkout RPC was EXECUTE-able by
--    anon, letting anyone flip every product to pending_payment (removing the
--    catalog from sale) and inject fake "paid" orders. Restrict it to the
--    service role. The /api/checkout/order route is updated to call it with the
--    service client; totals are already computed server-side, so nothing is
--    lost. (create_paypal_order was already service-role-only — good.)
-- ─────────────────────────────────────────────────────────────────────────────
revoke execute on function public.create_checkout_order(jsonb, jsonb) from anon, authenticated;
grant  execute on function public.create_checkout_order(jsonb, jsonb) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CODE-D04 (HIGH): the public browser anon key could read EVERY product
--    column via a direct REST call (select=*), including cost_basis,
--    minimum_price, internal_notes, acquisition_*, private_price_label,
--    live_spot_snapshot. Re-grant anon SELECT on every column EXCEPT those
--    internal ones. The public shop (grid + detail) selects only public columns
--    via the anon key, so the gallery is unaffected.
--
--    RESIDUAL (follow-up, not fixed here): logged-in `authenticated` users can
--    still read these columns, because the admin editor reads them from the
--    browser under the same role. Closing that fully needs admin product reads
--    moved to the service role, or the internal columns split into an
--    admin-only table. Since account signup is open, treat this as still-open
--    until that refactor lands.
-- ─────────────────────────────────────────────────────────────────────────────
revoke select on public.products from anon;

do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ')
    into cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'products'
     and column_name not in (
       'cost_basis', 'minimum_price', 'acquisition_date', 'acquisition_source',
       'internal_notes', 'private_price_label', 'live_spot_snapshot'
     );
  execute format('grant select (%s) on public.products to anon', cols);
end $$;

-- Remove the redundant duplicate policies that shadow the canonical ones from
-- products.sql ("Anyone can read products" + the three admin policies). These
-- two orphans are not defined in any migration file.
drop policy if exists products_public_read on public.products;
drop policy if exists products_admin_all   on public.products;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CODE-D07 (HIGH): add the DB-level guards the app assumed but never had.
--    Added NOT VALID so the migration cannot fail on any unexpected legacy row;
--    they are still enforced on every INSERT/UPDATE from now on. Run the
--    optional VALIDATE statements afterward once you've confirmed existing data
--    is clean (they will error and name the bad row if not).
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.products drop constraint if exists products_price_mode_check;
alter table public.products add  constraint products_price_mode_check
      check (price_mode in ('spot-multiplier', 'manual')) not valid;

alter table public.products drop constraint if exists products_status_check;
alter table public.products add  constraint products_status_check
      check (status in ('draft','available','pending_payment','sold','archived','Available','Sold')) not valid;

alter table public.products drop constraint if exists products_nonneg_amounts_check;
alter table public.products add  constraint products_nonneg_amounts_check
      check (
        (asking_price       is null or asking_price       >= 0) and
        (minimum_price      is null or minimum_price      >= 0) and
        (cost_basis         is null or cost_basis         >= 0) and
        (melt_value         is null or melt_value         >= 0) and
        (weight_grams       is null or weight_grams       >= 0) and
        (gram_weight        is null or gram_weight        >= 0) and
        (pricing_multiplier is null or pricing_multiplier >= 0) and
        (purity             is null or purity             >= 0)
      ) not valid;

-- Align the column default with the app's lowercase convention (was 'Available').
alter table public.products alter column status set default 'available';

-- Optional: verify existing rows satisfy the new checks, then mark them valid.
-- Run these one at a time; an error names the offending row to fix first.
-- alter table public.products validate constraint products_price_mode_check;
-- alter table public.products validate constraint products_status_check;
-- alter table public.products validate constraint products_nonneg_amounts_check;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (uncomment and run to revert this file):
-- ─────────────────────────────────────────────────────────────────────────────
-- grant insert, update on public.profiles to authenticated;
-- grant execute on function public.create_checkout_order(jsonb, jsonb) to anon, authenticated;
-- grant select on public.products to anon;
-- alter table public.products drop constraint if exists products_price_mode_check;
-- alter table public.products drop constraint if exists products_status_check;
-- alter table public.products drop constraint if exists products_nonneg_amounts_check;
-- alter table public.products alter column status set default 'Available';
