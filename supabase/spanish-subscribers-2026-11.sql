-- Spanish for the email list and text deals (2026-11-22). Run in the Supabase
-- SQL editor BEFORE deploying that batch. Safe to re-run. Changes no data
-- except tidying any subscriber language that is not 'en' / 'es' (none are
-- expected) to 'en'.
--
-- Each subscriber already has a language (`homepage_subscribers.locale`, set to
-- 'es' by a sign-up on the Spanish site). This file adds the Spanish copy of
-- what gets SENT:
--
--   text_deals
--     title_es, size_text_es, description_es, message_es
--                           the Spanish words of the deal (translated on
--                           Preview, editable by the owner)
--     sold_reply_text_es    the Spanish "spoken for" line
--     card_path_es, detail_media_paths_es
--                           the Spanish pictures ("Foto 2 de 5", "Oro amarillo
--                           14K"), rendered beside the English ones
--     es_source_hash, es_machine_hash
--                           what the translation was made from / what the
--                           machine wrote — so the app knows whether the
--                           English changed since, and whether the owner
--                           corrected the Spanish
--   email_campaigns
--     subject_es, html_es   the Spanish version of an email (empty = Spanish
--                           subscribers get the English one)
--
-- The tables stay service-role only (the existing grants are on the tables, so
-- they cover new columns). Until this runs, the site keeps working: Spanish
-- subscribers get Spanish fixed texts, and deal / email words fall back to
-- English.

-- 1. Text deals -----------------------------------------------------------------
alter table public.text_deals
  add column if not exists title_es              text   not null default '',
  add column if not exists size_text_es          text   not null default '',
  add column if not exists description_es        text   not null default '',
  add column if not exists message_es            text   not null default '',
  add column if not exists sold_reply_text_es    text,
  add column if not exists card_path_es          text,
  add column if not exists detail_media_paths_es text[] not null default '{}',
  add column if not exists es_source_hash        text,
  add column if not exists es_machine_hash       text;

-- 2. Email campaigns ------------------------------------------------------------
alter table public.email_campaigns
  add column if not exists subject_es text,
  add column if not exists html_es    text;

-- 3. Subscriber language: only 'en' or 'es' -----------------------------------
update public.homepage_subscribers set locale = 'en' where locale is null or locale not in ('en', 'es');

alter table public.homepage_subscribers
  drop constraint if exists homepage_subscribers_locale_check;
alter table public.homepage_subscribers
  add constraint homepage_subscribers_locale_check check (locale in ('en', 'es'));

-- 4. Verify ---------------------------------------------------------------------
-- ONE row, every value true.
select
  (select count(*) = 9 from information_schema.columns
     where table_schema = 'public' and table_name = 'text_deals'
       and column_name in ('title_es', 'size_text_es', 'description_es', 'message_es', 'sold_reply_text_es',
                           'card_path_es', 'detail_media_paths_es', 'es_source_hash', 'es_machine_hash')) as deal_columns,
  (select count(*) = 2 from information_schema.columns
     where table_schema = 'public' and table_name = 'email_campaigns'
       and column_name in ('subject_es', 'html_es')) as email_columns,
  exists (select 1 from pg_constraint
            where conrelid = 'public.homepage_subscribers'::regclass
              and conname = 'homepage_subscribers_locale_check') as locale_check,
  not has_table_privilege('anon', 'public.text_deals', 'select') as deals_hidden_from_public;

-- How many subscribers are Spanish today (for the record).
select locale, count(*) from public.homepage_subscribers group by locale order by locale;
