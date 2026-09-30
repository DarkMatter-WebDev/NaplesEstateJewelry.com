-- Etsy sync: owner-supplied custom tags per product (2026-07-08).
--
-- Adds etsy_listings.extra_tags — a list of custom Etsy tags the owner enters in
-- the product drawer's Etsy section ("Additional tags"). These are merged into
-- the auto-generated tags by lib/etsy/mapping.ts mapTags() (owner's tags first),
-- within Etsy's 13-tag cap. Null/absent means "no custom tags".
--
-- Idempotent; safe to re-run. Reads degrade gracefully before this runs (the
-- feature is simply off — the column is absent, so mapTags gets no extra tags).

alter table public.etsy_listings
  add column if not exists extra_tags text[];
