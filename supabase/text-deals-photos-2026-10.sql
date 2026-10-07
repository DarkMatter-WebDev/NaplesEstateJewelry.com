-- Text deals: several photos per deal (2026-10-07). Run in the Supabase SQL
-- editor BEFORE deploying that batch. Safe to re-run.
--
-- A deal keeps its main photo and its picture where they always were
-- (photo_path, card_path). This adds the detail shots beside them:
--   detail_photo_paths   the extra photos the owner uploaded (WebP), in order
--   detail_media_paths   their rendered pictures (JPEG), one per photo, as sent
--
-- Nothing else changes: the table stays service-role only (the grant in
-- text-alerts-service-role-grant-2026-09.sql is on the table, so it covers
-- new columns), and existing deals read as "no detail shots".

alter table public.text_deals
  add column if not exists detail_photo_paths text[] not null default '{}',
  add column if not exists detail_media_paths text[] not null default '{}';

-- Verify: expect two rows, both "ARRAY · NO".
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'text_deals'
  and column_name in ('detail_photo_paths', 'detail_media_paths')
order by column_name;
