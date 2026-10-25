-- Text deals: the new boxes on the deal form (2026-10-24). Run in the Supabase
-- SQL editor BEFORE deploying that batch. Safe to re-run.
--
-- Adds, beside the existing title (now "What it is"), price and message:
--   description            the longer text under the price (up to 1,000 characters, line breaks kept)
--   comparable_price_text  optional, e.g. "$2,400" → "Comparable retail: $2,400" in the text
--   metal                  e.g. "Yellow Gold"; 'none' = "Other / leave off"; '' = not picked yet
--   purity                 e.g. "14K", "925"; same 'none' / '' rules
--   size_text              optional, e.g. "22 in", "Ring size 7"
--
-- Nothing else changes: the table stays service-role only (the grant in
-- text-alerts-service-role-grant-2026-09.sql is on the table, so it covers
-- new columns). Existing deals read as "no details" and keep their line as
-- typed. Until this runs, a deal still saves as long as the new boxes are
-- empty; picking a metal fails with "Could not find the 'metal' column".

alter table public.text_deals
  add column if not exists description           text not null default '',
  add column if not exists comparable_price_text text,
  add column if not exists metal                 text not null default '',
  add column if not exists purity                text not null default '',
  add column if not exists size_text             text not null default '';

-- Verify: expect five rows.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'text_deals'
  and column_name in ('description', 'comparable_price_text', 'metal', 'purity', 'size_text')
order by column_name;
