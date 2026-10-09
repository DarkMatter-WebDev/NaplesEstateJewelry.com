-- Buy receipts: DRAFTS (2026-10-09). Run in the Supabase SQL editor AFTER
-- buy-receipts-2026-09.sql and buy-receipts-thumbprint-2026-10.sql. Safe to
-- re-run.
--
-- Owner: "can we save a receipt in progress as a draft so that i can easily
-- open it and continue it on a new device (start on ipad, then pick up and
-- finish on the laptop where i can use the thumbprint reader)" -> "build the
-- real draft, number at draft time, name only".
--
-- What this adds: a third status, 'draft', and one column, `draft_form`, that
-- holds the form exactly as typed while a receipt is unfinished. A draft is an
-- ordinary row: it takes its BUY number when it is first saved, its ID photo
-- and thumbprint go to the same private bucket, and Delete removes it like any
-- other receipt.
--
-- Order does not matter for the rest of the site: only "Save draft" needs this
-- file. Deployed without it, every existing page works as before and "Save
-- draft" answers "could not be saved" until it is run.

-- 1. The status ---------------------------------------------------------------
alter table public.buy_receipts
  drop constraint if exists buy_receipts_status_check;
alter table public.buy_receipts
  add constraint buy_receipts_status_check check (status in ('draft', 'recorded', 'void'));

-- 2. The form as typed --------------------------------------------------------
alter table public.buy_receipts
  add column if not exists draft_form jsonb;

comment on column public.buy_receipts.draft_form is
  'The New receipt form exactly as typed, while status = draft. Null once the receipt is recorded.';

-- Only a draft carries one.
alter table public.buy_receipts
  drop constraint if exists buy_receipts_draft_form_check;
alter table public.buy_receipts
  add constraint buy_receipts_draft_form_check check (status = 'draft' or draft_form is null);

-- 3. Guard --------------------------------------------------------------------
-- Its own small trigger rather than an edit to guard_buy_receipt_update, so
-- re-running the main file can never quietly drop these rules (the thumbprint
-- file does the same). The Print Station tab holds direct UPDATE rights through
-- RLS, so the rules live in the database and not only in the routes:
--   * a recorded or void receipt never goes back to being a draft;
--   * a draft is never sent to the printer — finish it first;
--   * a draft is deleted, not voided (it never was a purchase on record);
--   * the stored form leaves with the draft status, whoever makes the change.
create or replace function public.guard_buy_receipt_draft()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'draft' and old.status <> 'draft' then
    raise exception 'A recorded receipt cannot go back to a draft';
  end if;

  if new.status = 'draft' and new.print_requested_at is not null then
    raise exception 'A draft cannot be printed — finish it first';
  end if;

  if old.status = 'draft' and new.status = 'void' then
    raise exception 'A draft is deleted, not voided';
  end if;

  if new.status <> 'draft' then
    new.draft_form := null;
  end if;

  return new;
end;
$$;

drop trigger if exists buy_receipts_draft_guard on public.buy_receipts;
create trigger buy_receipts_draft_guard
  before update on public.buy_receipts
  for each row execute function public.guard_buy_receipt_draft();

-- 4. Verify -------------------------------------------------------------------
-- One row: draft_form · jsonb · YES.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'buy_receipts' and column_name = 'draft_form';

-- One row: buy_receipts_draft_guard.
select tgname
from pg_trigger
where tgrelid = 'public.buy_receipts'::regclass and tgname = 'buy_receipts_draft_guard';

-- Two rows. buy_receipts_status_check must name 'draft', 'recorded' and 'void';
-- buy_receipts_draft_form_check must read (status = 'draft') OR (draft_form IS NULL).
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.buy_receipts'::regclass
  and conname in ('buy_receipts_status_check', 'buy_receipts_draft_form_check')
order by conname;
