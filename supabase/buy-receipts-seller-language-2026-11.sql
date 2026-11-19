-- Buy receipts: the language of the seller's copy (2026-11-19). Run in the
-- Supabase SQL editor AFTER buy-receipts-2026-09.sql and BEFORE deploying the
-- Spanish-seller batch. ⛔ The app reads this column on every receipt page, in
-- the Log and in the print station (it is in BUY_RECEIPT_COLUMNS), so a deploy
-- without it shows "could not be loaded" and the station prints nothing until
-- it is run. Safe to re-run.
--
-- What this adds: one column, 'en' or 'es', default 'en'. Every existing
-- receipt becomes 'en' and prints exactly as before. 'es' prints the SELLER'S
-- copy (paper and email) in Spanish and adds the Spanish ownership statement
-- under the English one on the SHOP copy, which stays in English.
--
-- No void guard on purpose: the language changes how a copy is WORDED, not
-- what was bought. The app already refuses to edit a void receipt (PUT answers
-- 409), and the existing guard keeps every content column of a void row frozen.

-- 1. The column ---------------------------------------------------------------
alter table public.buy_receipts
  add column if not exists seller_language text not null default 'en';

alter table public.buy_receipts
  drop constraint if exists buy_receipts_seller_language_check;
alter table public.buy_receipts
  add constraint buy_receipts_seller_language_check check (seller_language in ('en', 'es'));

comment on column public.buy_receipts.seller_language is
  'Language of the seller''s copy: en (default) or es. The shop copy is always English.';

-- 2. Verify -------------------------------------------------------------------
-- One row: seller_language · text · NO · 'en'::text.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'buy_receipts' and column_name = 'seller_language';

-- One row: buy_receipts_seller_language_check.
select conname
from pg_constraint
where conrelid = 'public.buy_receipts'::regclass and conname = 'buy_receipts_seller_language_check';

-- Every receipt so far: 'en'.
select seller_language, count(*) from public.buy_receipts group by seller_language;
