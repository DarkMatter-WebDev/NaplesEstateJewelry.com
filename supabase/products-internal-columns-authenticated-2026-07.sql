-- Naples Estate Jewelry — CODE-D04 residual: hide internal product columns from
-- the `authenticated` role too (the 2026-07 hardening already did this for anon).
--
-- Run ONCE in the Supabase SQL Editor, AFTER deploying the matching code changes:
--   * next-app/src/app/[locale]/admin/page.tsx  (reads products via service role)
--   * next-app/src/components/admin/AdminShell.tsx  (insert no longer .select()s)
-- Deploy-order matters: ship the code first. If this runs while the old code is
-- live, the admin products page (old cookie-client select('*')) and new-product
-- insert (old .select().single()) would hit permission-denied on the internal
-- columns. The service-role admin read is unaffected by these grants.
--
-- WHY: RLS on products is `using (true)` for SELECT, so column privileges — not
-- row policies — are what keep internal columns private. anon was already
-- column-restricted; `authenticated` still had full-table SELECT, and since
-- account signup is open, any signed-up visitor could read cost_basis /
-- minimum_price / internal_notes / acquisition_* / private_price_label /
-- live_spot_snapshot via a direct REST select. Admin WRITES are unaffected
-- (INSERT/UPDATE grants + the admin-only RLS write policies stay as-is); only
-- SELECT of the internal columns is removed.

revoke select on public.products from authenticated;

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
  execute format('grant select (%s) on public.products to authenticated', cols);
end $$;

-- Verification: every value should be false.
select
  has_column_privilege('authenticated', 'public.products', 'cost_basis', 'select') as authenticated_can_read_cost_basis,
  has_column_privilege('authenticated', 'public.products', 'minimum_price', 'select') as authenticated_can_read_minimum_price,
  has_column_privilege('authenticated', 'public.products', 'internal_notes', 'select') as authenticated_can_read_internal_notes;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (uncomment to revert):
-- ─────────────────────────────────────────────────────────────────────────────
-- grant select on public.products to authenticated;
