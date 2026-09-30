-- Social posting: per-post card source image.
--
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- The generated lead card is built from the lineup's first image by default.
-- These columns let the admin pick a DIFFERENT product image as the card's
-- base — chosen in the Instagram/Facebook panel, one per channel, mirroring
-- how lineups and crops are stored. Null means "use the lineup's cover".
--
-- Stored as the source image URL (not an index) so the choice survives
-- reordering the lineup, same contract as image_crops keys.

alter table public.instagram_posts
  add column if not exists card_source_url text;

alter table public.facebook_posts
  add column if not exists card_source_url text;

comment on column public.instagram_posts.card_source_url is
  'Product image URL the generated lead card is built from; null = lineup cover.';

comment on column public.facebook_posts.card_source_url is
  'Product image URL the generated lead card is built from; null = lineup cover.';
