-- Naples Estate Jewelry - saved copies of customer emails (2026-11-21).
-- Safe to re-run. Run ALL of it in the Supabase SQL Editor (before or after
-- the push - either order is safe: until it runs the site sends exactly as
-- before and the viewer rebuilds what it can).
--
-- What it adds (owner, 2026-11-21, mockup 2 approved): click a row in an
-- order's Email History (or a buy receipt's "Emailed to ..." line) and see the
-- email that went out, in a pop-up. Until now only who / when / subject were
-- kept, so every email now also keeps its own HTML + plain text.
--
-- Text only (about 10-30 KB a row): pictures inside the emails stay as links
-- to the site. The pickup ID photo and signature are never in an email, so
-- never in a copy.

alter table public.order_emails
  add column if not exists body_html text,
  add column if not exists body_text text;

comment on column public.order_emails.body_html is
  'The email exactly as sent (HTML), for the order page''s Email History viewer (2026-11-21). Null = sent before copies were kept.';
comment on column public.order_emails.body_text is
  'The plain-text part of the same email.';

-- A buy receipt keeps the copy of its LATEST email (Email again replaces it).
alter table public.buy_receipts
  add column if not exists emailed_html text,
  add column if not exists emailed_text text;

comment on column public.buy_receipts.emailed_html is
  'The seller''s-copy email as last sent (HTML), for the receipt page''s viewer (2026-11-21). Null = sent before copies were kept, or never emailed.';

notify pgrst, 'reload schema';

-- Verify ---------------------------------------------------------------------
-- The editor shows the LAST result: one row, every value true.
select
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'order_emails' and column_name = 'body_html')    as order_html,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'order_emails' and column_name = 'body_text')    as order_text,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'buy_receipts' and column_name = 'emailed_html') as receipt_html,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'buy_receipts' and column_name = 'emailed_text') as receipt_text,
  not has_table_privilege('anon', 'public.order_emails', 'select')                                                                                 as hidden_from_public;
