-- ============================================================
--  Follow-ups fix (2026-11-24 (10)): let the follow-ups sweep READ the few
--  buy-receipt columns it needs — and nothing else.
--
--  Found on the live site right after the push: Admin → Follow-ups said
--  "Could not read buy receipts: permission denied for table buy_receipts".
--  buy_receipts was built with NO service_role grant on purpose (it holds ID
--  data; buy-receipts-2026-09.sql lines 13-18), but the follow-ups sweep runs
--  every 15 minutes from pg_cron with no signed-in admin, so it must use the
--  service role. Until this runs, NO thank-you is queued — sellers OR buyers.
--
--  This grants SELECT on nine columns only. Still NO access to the ID type,
--  ID last 4, date of birth, address, ID photo, thumbprint, items, payments,
--  notes — and no insert / update / delete. Run ONCE in the Supabase SQL
--  Editor (project evzluixourmsefwdsieu). Safe to re-run.
-- ============================================================

grant select (
  id,
  receipt_number,
  seller_name,
  seller_email,
  seller_phone,
  seller_language,
  total,
  status,
  created_at
) on public.buy_receipts to service_role;

notify pgrst, 'reload schema';

-- Verify — expect ONE row: can_read_email = true, can_read_id_last4 = false,
-- can_read_dob = false, can_write = false.
select
  has_column_privilege('service_role', 'public.buy_receipts', 'seller_email', 'SELECT')    as can_read_email,
  has_column_privilege('service_role', 'public.buy_receipts', 'seller_id_last4', 'SELECT') as can_read_id_last4,
  has_column_privilege('service_role', 'public.buy_receipts', 'seller_dob', 'SELECT')      as can_read_dob,
  has_table_privilege('service_role', 'public.buy_receipts', 'UPDATE')                      as can_write;

-- Rollback (if ever needed):
-- revoke select (id, receipt_number, seller_name, seller_email, seller_phone, seller_language, total, status, created_at)
--   on public.buy_receipts from service_role;
