-- Social posting: per-post card background override.
--
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- Null means AUTO: the card samples the backdrop from the cropped region
-- immediately around the product (not the frame corners — studio photos have
-- lighting falloff, cream at the corners and near-white behind the piece,
-- which made a corner-sampled card visibly mismatch). A hex value like
-- '#ffffff' forces that background; the admin picks it in the panel.

alter table public.instagram_posts
  add column if not exists card_background text;

alter table public.facebook_posts
  add column if not exists card_background text;

comment on column public.instagram_posts.card_background is
  'Hex background override for the generated card (e.g. #ffffff); null = auto-detect.';

comment on column public.facebook_posts.card_background is
  'Hex background override for the generated card (e.g. #ffffff); null = auto-detect.';
