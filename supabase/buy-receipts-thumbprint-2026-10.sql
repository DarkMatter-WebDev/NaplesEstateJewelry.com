-- Buy receipts: the seller's thumbprint (2026-10-06). Run in the Supabase SQL
-- editor AFTER buy-receipts-2026-09.sql and BEFORE deploying the thumbprint
-- batch — the app reads this column on every receipt page, in the Log and in
-- the print station, so a deploy without it shows "could not be loaded" until
-- it is run. Safe to re-run.
--
-- What this adds: one column holding the PATH of the thumbprint picture. The
-- picture itself goes in the existing PRIVATE bucket `buy-receipt-ids`, in the
-- receipt's own folder beside the ID photo, so the bucket, its four admin-only
-- policies and its allowed types (WebP) need no change, and deleting a receipt
-- (which empties that folder first) takes the thumbprint with it.

-- 1. The column ---------------------------------------------------------------
alter table public.buy_receipts
  add column if not exists seller_thumbprint_path text;

comment on column public.buy_receipts.seller_thumbprint_path is
  'Object path inside the PRIVATE bucket buy-receipt-ids. A path, never a URL.';

-- 2. Guard: a VOID receipt keeps its thumbprint -------------------------------
-- The main guard (guard_buy_receipt_update, buy-receipts-2026-09.sql) freezes a
-- void receipt column by column and does not know this one. This is its own
-- small trigger rather than an edit to that function, so re-running the main
-- file can never quietly drop the rule.
create or replace function public.guard_buy_receipt_thumbprint()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'void' and new.seller_thumbprint_path is distinct from old.seller_thumbprint_path then
    raise exception 'Void receipts cannot be edited — duplicate it instead';
  end if;
  return new;
end;
$$;

drop trigger if exists buy_receipts_thumbprint_guard on public.buy_receipts;
create trigger buy_receipts_thumbprint_guard
  before update on public.buy_receipts
  for each row execute function public.guard_buy_receipt_thumbprint();

-- 3. Verify -------------------------------------------------------------------
-- One row: seller_thumbprint_path · text · YES.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'buy_receipts' and column_name = 'seller_thumbprint_path';

-- One row: buy_receipts_thumbprint_guard.
select tgname
from pg_trigger
where tgrelid = 'public.buy_receipts'::regclass and tgname = 'buy_receipts_thumbprint_guard';

-- One row, public = false, and image/webp among the allowed types (unchanged by this file).
select id, public, allowed_mime_types from storage.buckets where id = 'buy-receipt-ids';
