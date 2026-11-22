-- Orders: the language of the customer's receipts and emails (2026-11-21,
-- Spanish receipts). Run in the Supabase SQL editor BEFORE deploying the
-- Spanish-receipts batch. Safe to re-run.
--
-- What this adds: one column, 'en' or 'es', default 'en'. Every existing order
-- becomes 'en' and prints exactly as before. 'es' prints the customer's emails
-- (receipt / invoice, fulfillment updates, delivery tracking, pickup) and the
-- customer printouts (one-page receipt, Print Order, gift slip, pickup customer
-- copy) in Spanish. Shop copies and owner emails stay English.
--
-- Set by: website checkout on /es (automatic), the "Receipt language" switch on
-- Instant Sale (In-store / Remote / Trade-in), and the Language switch on the
-- order page. Before this runs the app skips the write and reads every order as
-- English — nothing breaks; Spanish simply does not stick.

-- 1. The column ---------------------------------------------------------------
alter table public.orders
  add column if not exists customer_language text not null default 'en';

alter table public.orders
  drop constraint if exists orders_customer_language_check;
alter table public.orders
  add constraint orders_customer_language_check check (customer_language in ('en', 'es'));

comment on column public.orders.customer_language is
  'Language of the customer''s receipts and emails: en (default) or es. Shop copies are always English.';

-- 2. Verify -------------------------------------------------------------------
-- One row: customer_language · text · NO · 'en'::text.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'orders' and column_name = 'customer_language';

-- One row: orders_customer_language_check.
select conname
from pg_constraint
where conrelid = 'public.orders'::regclass and conname = 'orders_customer_language_check';

-- Every order so far: 'en'.
select customer_language, count(*) from public.orders group by customer_language;
