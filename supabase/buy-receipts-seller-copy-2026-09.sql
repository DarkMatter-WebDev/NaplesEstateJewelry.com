-- Buy receipts: the seller's copy (2026-09-30). Run in the Supabase SQL editor
-- AFTER buy-receipts-2026-09.sql and BEFORE deploying the seller's-copy batch —
-- the app reads this column on every receipt page and in the print station,
-- so a deploy without it shows "could not be loaded" until it is run.
-- Safe to re-run.
--
-- What this adds: a print request now carries three counts — shop copies
-- (blank signature lines), shop copies with the ID photo, and seller's copies
-- (the owner's signature printed). The first two columns already exist.

alter table public.buy_receipts
  add column if not exists print_copies_seller integer not null default 1
    constraint buy_receipts_copies_seller_check check (print_copies_seller between 0 and 3);

-- Verify: one row, data_type integer, column_default 1.
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'buy_receipts' and column_name = 'print_copies_seller';
