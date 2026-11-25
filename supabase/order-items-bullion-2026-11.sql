-- Naples Estate Jewelry - "Bullion - no sales tax" on a sale's items (2026-11-24).
-- Safe to re-run. Run ALL of it in the Supabase SQL Editor.
--
-- What it adds (owner, 2026-11-24, mockup 1 approved "Yes, build it"):
--   Admin -> Instant Sale (In-store, Remote, Trade-in): every item has a box
--   "Bullion - no sales tax". A ticked item is left out of the 6% Florida tax
--   and its receipt line says "Bullion - not taxed".
--   Law: Florida DOR TIP 25A01-03 (gold, silver and platinum bullion exempt
--   regardless of price from Aug 1, 2025) and TIP 26A01-08 (99.5% gold /
--   99.9% silver coins, rounds and bars from July 1, 2026).
--   Rule 12A-1.0371(6) F.A.C.: the dealer keeps the metal, quantity, form and
--   price of each bullion item - this column marks WHICH lines those are.
--
-- Run this BEFORE the push. Until it runs, a sale with a ticked bullion item
-- is refused with "run the SQL first" (sales without bullion work as always).
-- The web checkout never sets it: every existing line reads false.

alter table public.order_items
  add column if not exists tax_free_bullion boolean not null default false;  -- this line is bullion: no Florida sales tax

comment on column public.order_items.tax_free_bullion is
  'Gold/silver/platinum bullion or a 99.5%+ gold / 99.9%+ silver coin sold tax-free (FL s. 212.08(7)(ww); TIP 25A01-03, 26A01-08). Set by Admin -> Instant Sale "Bullion - no sales tax". Default false.';

notify pgrst, 'reload schema';

-- Verify ---------------------------------------------------------------------
-- The editor shows the LAST result: one row, every value true.
select
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'order_items' and column_name = 'tax_free_bullion')  as bullion_column,
  has_table_privilege('service_role', 'public.order_items', 'update')                                            as server_can_write,
  has_table_privilege('authenticated', 'public.order_items', 'select')                                           as admin_can_read;
