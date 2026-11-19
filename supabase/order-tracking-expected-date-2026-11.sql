-- Naples Estate Jewelry - expected delivery date email (2026-11-19).
-- Safe to re-run. Run ALL of it in the Supabase SQL Editor.
--
-- What it adds (owner, 2026-11-19, "the 4-email plan", mockup 1 approved):
--   Shipped -> EXPECTED DELIVERY DATE (new) -> Out for delivery -> Delivered.
--   The first time the carrier's tracking carries a delivery date while the
--   package is in transit, the customer gets ONE email with that date. Never
--   again when the date moves; skipped if the package is already out for
--   delivery / delivered, or the date has already passed.
--
-- Order does not matter: until this runs, the site simply does not send the
-- new email (every other delivery email keeps working). After it runs, the
-- next tracking update (webhook or the hourly sweep) can send it.
--
-- The date is stored as TEXT "YYYY-MM-DD" exactly as the carrier gives it
-- (EasyPost carrier_detail.est_delivery_date_local, else the date part of
-- est_delivery_date) - a timestamptz would shift it across midnight.

alter table public.order_tracking
  add column if not exists est_delivery_date text,          -- latest carrier estimate, "2026-11-24"
  add column if not exists expected_email_at timestamptz;   -- set when that email went (claimed before sending)

comment on column public.order_tracking.est_delivery_date is
  'Carrier''s latest estimated delivery date, YYYY-MM-DD as the carrier gives it (EasyPost). Text on purpose: no time-zone shift.';
comment on column public.order_tracking.expected_email_at is
  'When the one-time "expected delivery date" email went (claimed before sending, released on a failed send).';

notify pgrst, 'reload schema';

-- Verify ---------------------------------------------------------------------
-- The editor shows the LAST result: one row, every value true.
select
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'order_tracking' and column_name = 'est_delivery_date')  as date_column,
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'order_tracking' and column_name = 'expected_email_at')  as email_column,
  not has_table_privilege('anon', 'public.order_tracking', 'select')                                               as hidden_from_public,
  not has_table_privilege('authenticated', 'public.order_tracking', 'update')                                      as browsers_cannot_write,
  has_table_privilege('service_role', 'public.order_tracking', 'update')                                           as server_can_write;
