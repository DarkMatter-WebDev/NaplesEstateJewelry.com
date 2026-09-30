-- Instagram per-post image lineup.
--
-- Additive only. Run in the Supabase SQL Editor after instagram-sync.sql.
-- Safe to re-run.
--
-- Why a separate column instead of reusing the product's image order:
-- products.image_urls drives the storefront gallery, Etsy, and eBay. An
-- operator curating an Instagram carousel (dropping a duplicate angle, leading
-- with the most striking shot, and later leading with an AI-generated
-- on-model image) must not disturb any of those. This column is therefore an
-- Instagram-only override.
--
-- Semantics:
--   * NULL / empty  -> fall back to the product's own image order (default).
--   * Non-empty     -> an ORDERED, DEFINITIVE list of source image URLs.
--                      Images omitted here are deliberately excluded, so a
--                      photo later added to the product does not silently
--                      reappear in the carousel; the admin panel surfaces
--                      such images as "not included" so they can be added back
--                      on purpose.
-- Entries that no longer exist on the product are ignored at build time, so a
-- deleted product photo cannot break a lineup.

alter table public.instagram_posts
  add column if not exists image_selection jsonb;

comment on column public.instagram_posts.image_selection is
  'Ordered, definitive list of source image URLs for this Instagram post. NULL means use the product''s own image order.';
