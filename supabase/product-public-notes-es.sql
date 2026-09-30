-- Adds the public Spanish notes field for product listings.
--
-- This is the Spanish counterpart to products.public_notes ("Notes (EN)" on the
-- add/edit listing form). It is buyer-facing: the Spanish (/es) product detail
-- page shows public_notes_es when present, falling back to the English
-- public_notes otherwise (mirroring how description_es falls back to description).
--
-- The admin form's former "Internal Notes" field is replaced by this "Notes (ES)"
-- field. The legacy products.internal_notes column is intentionally left in place
-- (it still receives folded legacy `details` values on save) and is simply no
-- longer surfaced in the listing UI. No data is moved into the new public field,
-- so previously-private internal notes are never exposed.
--
-- Safe to re-run: IF NOT EXISTS guards a fresh install and a re-apply.

alter table public.products
  add column if not exists public_notes_es text;
