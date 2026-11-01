-- Per-item trade-in line: two more ways to set it, both OFF THE ASKING PRICE
-- (2026-10-31). The "Own gold or silver? Put it toward this piece and pay as
-- little as ___" line on the product page. The item's "Override Type" dropdown
-- already had:
--
--   mode = 'amount'         → special_price_override_amount (flat $ price)
--   mode = 'percent'        → meltValue * (1 + special_price_override_percent/100)
--
-- This adds:
--
--   mode = 'asking_percent' → askingPrice * (1 - special_price_override_discount_percent/100)   0–100
--   mode = 'asking_amount'  → askingPrice - special_price_override_discount_amount              > 0
--
-- The asking price is the price the shop shows and checkout charges. Each new
-- choice has its own column so it never borrows the meaning of another's number.
-- Nothing changes for existing items (their mode stays 'amount' or 'percent').
--
-- Run in the Supabase SQL Editor BEFORE the deploy. Safe to re-run.
--
-- WHY THE GRANT: public.products has COLUMN-level SELECT for anon/authenticated
-- (security-hardening-2026-07.sql); a new column is invisible to the storefront
-- until granted, and the product page's query would fail on it.

alter table public.products
  add column if not exists special_price_override_discount_percent numeric(5,2),
  add column if not exists special_price_override_discount_amount  numeric(12,2);

alter table public.products drop constraint if exists products_special_price_override_mode_check;
alter table public.products add constraint products_special_price_override_mode_check
      check (special_price_override_mode in ('amount', 'percent', 'asking_percent', 'asking_amount')) not valid;

alter table public.products drop constraint if exists products_special_price_override_discount_percent_check;
alter table public.products add constraint products_special_price_override_discount_percent_check
      check (special_price_override_discount_percent is null
             or (special_price_override_discount_percent >= 0 and special_price_override_discount_percent <= 100)) not valid;

alter table public.products drop constraint if exists products_special_price_override_discount_amount_check;
alter table public.products add constraint products_special_price_override_discount_amount_check
      check (special_price_override_discount_amount is null or special_price_override_discount_amount > 0) not valid;

grant select (special_price_override_discount_percent, special_price_override_discount_amount)
  on public.products to anon, authenticated;

notify pgrst, 'reload schema';

-- Check 1: both columns exist (two rows).
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'products'
   and column_name in ('special_price_override_discount_percent', 'special_price_override_discount_amount')
 order by column_name;
-- Check 2: the mode rule lists all four choices.
select pg_get_constraintdef(oid) as mode_rule
  from pg_constraint
 where conname = 'products_special_price_override_mode_check';
-- Check 3: the storefront can read both (anon AND authenticated, two rows each).
select grantee, column_name
  from information_schema.column_privileges
 where table_schema = 'public' and table_name = 'products' and privilege_type = 'SELECT'
   and grantee in ('anon', 'authenticated')
   and column_name in ('special_price_override_discount_percent', 'special_price_override_discount_amount')
 order by grantee, column_name;
