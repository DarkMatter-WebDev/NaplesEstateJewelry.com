-- Naples Estate Jewelry - "Send customer shipping updates" per order (2026-11-24).
-- Safe to re-run. Run ALL of it in the Supabase SQL Editor.
--
-- What it adds (owner, 2026-11-24, mockup 1 approved "Yes, build it"):
--   Admin -> Orders -> an order -> Mark Shipped now has TWO boxes:
--     [x] Update customer via email        (the Shipped email, sent by hand - unchanged)
--     [x] Send customer shipping updates   (NEW - the automatic carrier emails:
--                                           expected delivery date, out for
--                                           delivery, delivered)
--   Unticked, the order gets NONE of the automatic emails (the package is
--   still tracked, so the order page still shows where it is). The Delivery
--   line has a Turn off / Turn on button to change it later.
--   Turned back ON later = only carrier scans AFTER that moment send an email
--   (owner pick 3: no catching up on skipped emails).
--
-- Order does not matter: until this runs every order behaves exactly as
-- before (updates on) and the new box shows a "run the SQL" note instead.
-- Every existing order reads as ON (the default), so nothing changes until
-- the owner unticks a box.

alter table public.orders
  add column if not exists delivery_emails boolean not null default true,  -- automatic shipping update emails on/off
  add column if not exists delivery_emails_on_at timestamptz;              -- when they were last turned back ON (null = never turned off)

comment on column public.orders.delivery_emails is
  'Send the automatic shipping update emails (expected date / out for delivery / delivered) for this order. Owner box "Send customer shipping updates". Default on.';
comment on column public.orders.delivery_emails_on_at is
  'When the owner last turned shipping updates back ON. Only carrier scans at or after this moment send an email (no catching up). Null = never turned off.';

notify pgrst, 'reload schema';

-- Verify ---------------------------------------------------------------------
-- The editor shows the LAST result: one row, every value true.
select
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'orders' and column_name = 'delivery_emails')        as setting_column,
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'orders' and column_name = 'delivery_emails_on_at')  as turned_on_column,
  has_table_privilege('service_role', 'public.orders', 'update')                                               as server_can_write;
