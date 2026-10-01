-- Buy receipts: emailing the seller a copy (2026-09-30). Run in the Supabase
-- SQL editor AFTER buy-receipts-seller-copy-2026-09.sql and BEFORE deploying
-- the email batch — every receipt read selects these columns.
-- Safe to re-run.
--
-- What this adds: when the receipt was emailed to the seller, and to which
-- address. The Log shows "Emailed"; the receipt page offers "Email to seller".

alter table public.buy_receipts
  add column if not exists emailed_at timestamptz,
  add column if not exists emailed_to text;

-- Verify: two rows.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'buy_receipts' and column_name in ('emailed_at', 'emailed_to')
order by column_name;
