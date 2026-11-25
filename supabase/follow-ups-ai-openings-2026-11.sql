-- ============================================================
--  Follow-ups: the blended thank-you email + AI-written opening lines
--  (owner, 2026-11-25, mockup 1 → "Yes, both together").
--
--  1. buy_receipts.thank_you_note / orders.thank_you_note — the owner's
--     optional "Note for the thank-you email" (e.g. "her late mother's ring").
--     ⛔ INTERNAL ONLY: never printed on either paper copy, never in the
--     receipt email, never on an invoice / print-out / gift slip. Only the AI
--     that writes the thank-you's opening reads it.
--  2. The follow-ups sweep (service role) may also READ the receipt's item
--     lines and that note — still no ID type, ID last 4, date of birth,
--     address, ID photo, thumbprint, payments or notes, and no writes.
--  3. follow_up_messages: the opening line, who wrote it, and how many tries.
--  4. follow_up_settings.ai_openings — the on/off switch (on).
--
--  Run ONCE in the Supabase SQL Editor (project evzluixourmsefwdsieu), all of
--  it. Safe to re-run. Before it runs, everything still works: the emails
--  use the standard opening and the note box says "run the SQL".
-- ============================================================

-- 1. The note ------------------------------------------------------------
alter table public.buy_receipts add column if not exists thank_you_note text;
alter table public.orders       add column if not exists thank_you_note text;

alter table public.buy_receipts drop constraint if exists buy_receipts_thank_you_note_len;
alter table public.buy_receipts add constraint buy_receipts_thank_you_note_len
  check (thank_you_note is null or char_length(thank_you_note) <= 300);
alter table public.orders drop constraint if exists orders_thank_you_note_len;
alter table public.orders add constraint orders_thank_you_note_len
  check (thank_you_note is null or char_length(thank_you_note) <= 300);

comment on column public.buy_receipts.thank_you_note is
  'Owner''s note for the thank-you email (follow-ups AI opening only). INTERNAL: never printed, never emailed as-is.';
comment on column public.orders.thank_you_note is
  'Owner''s note for the thank-you email (follow-ups AI opening only). INTERNAL: never printed, never emailed as-is.';

-- (buy_receipts: `authenticated` already has a table grant behind the admin-only
-- policy, so the admin pages can read and save the new column with no new grant.)

-- 2. What the sweep may read on a buy receipt -----------------------------
grant select (items, thank_you_note) on public.buy_receipts to service_role;

-- 3. The opening line on each follow-up -----------------------------------
alter table public.follow_up_messages add column if not exists opening        text;
alter table public.follow_up_messages add column if not exists opening_source text;
alter table public.follow_up_messages add column if not exists opening_at     timestamptz;
alter table public.follow_up_messages add column if not exists opening_tries  smallint not null default 0;

alter table public.follow_up_messages drop constraint if exists follow_up_messages_opening_source_check;
alter table public.follow_up_messages add constraint follow_up_messages_opening_source_check
  check (opening_source is null or opening_source in ('ai', 'owner', 'standard'));

-- 4. The switch -----------------------------------------------------------
alter table public.follow_up_settings add column if not exists ai_openings boolean not null default true;

notify pgrst, 'reload schema';

-- Verify — expect ONE row, every value true except the last two (false):
select
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'buy_receipts' and column_name = 'thank_you_note') as receipt_note,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'thank_you_note')       as order_note,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'follow_up_messages' and column_name = 'opening')  as opening_column,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'follow_up_settings' and column_name = 'ai_openings') as ai_switch,
  has_column_privilege('service_role', 'public.buy_receipts', 'items', 'SELECT')           as sweep_reads_items,
  has_column_privilege('service_role', 'public.buy_receipts', 'thank_you_note', 'SELECT')  as sweep_reads_note,
  has_column_privilege('service_role', 'public.buy_receipts', 'seller_id_last4', 'SELECT') as sweep_reads_id_last4,
  has_table_privilege('service_role', 'public.buy_receipts', 'UPDATE')                     as sweep_can_write;

-- Rollback (if ever needed):
-- revoke select (items, thank_you_note) on public.buy_receipts from service_role;
-- alter table public.follow_up_settings drop column if exists ai_openings;
-- alter table public.follow_up_messages drop column if exists opening, drop column if exists opening_source,
--   drop column if exists opening_at, drop column if exists opening_tries;
-- alter table public.orders drop column if exists thank_you_note;
-- alter table public.buy_receipts drop column if exists thank_you_note;
