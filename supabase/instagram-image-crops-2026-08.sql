-- Instagram: per-image crop rectangles.
--
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- Crops are normalized to 0..1 of the SOURCE image:
--     { "<image url>": { "x": 0.22, "y": 0.26, "w": 0.56, "h": 0.42 } }
--
-- Keyed by image URL rather than by position so a crop survives reordering the
-- lineup (image_selection). Normalized rather than pixels so it stays correct
-- if the source is ever re-encoded at another size.
--
-- Crops are applied ONLY when building Instagram renditions. The storefront,
-- Etsy and eBay all keep reading products.image_urls untouched.
--
-- No companion setting: the generated ad card is part of the posting pipeline
-- rather than an option, so there is no card_enabled column to add.

alter table public.instagram_posts
  add column if not exists image_crops jsonb;

comment on column public.instagram_posts.image_crops is
  'Normalized per-image crop rects keyed by image URL: {"url": {"x","y","w","h"}} in 0..1 of the source. Applied only to Instagram renditions.';
