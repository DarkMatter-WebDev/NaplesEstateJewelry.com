-- Re-slug the six auto-named "new-listing-0X" products to keyword URLs.
-- The product `id` IS the /shop/[id] URL, so this renames the id (and slug).
--
-- Run ONCE, and deploy the matching next.config redirects together
-- (next-app/next.config.ts maps each old id → the new id below with a 301).
--
-- These six are all AVAILABLE (unsold) items, so they should have no
-- order_items rows and no children referencing them. If this transaction errors
-- with a foreign-key violation, one of them IS referenced by an order or
-- inquiry — stop, do NOT force it, and report back so a constraint-aware
-- version (that updates the child rows too) can be provided.
--
-- Note: this is a deliberate, documented exception to the "product ids are
-- permanent" invariant — the old ids were auto-generated junk, and 301s cover
-- any existing links.

begin;

update public.products set id = 'italian-14k-two-tone-cuban-link-ring-station-necklace',
       slug = 'italian-14k-two-tone-cuban-link-ring-station-necklace' where id = 'new-listing-01';
update public.products set id = '14k-gold-round-box-link-chain-necklace',
       slug = '14k-gold-round-box-link-chain-necklace'                where id = 'new-listing-02';
update public.products set id = '10k-gold-monaco-cuban-link-necklace',
       slug = '10k-gold-monaco-cuban-link-necklace'                   where id = 'new-listing-03';
update public.products set id = '14k-gold-rope-chain-necklace',
       slug = '14k-gold-rope-chain-necklace'                          where id = 'new-listing-04';
update public.products set id = '10k-gold-rope-chain-necklace',
       slug = '10k-gold-rope-chain-necklace'                          where id = 'new-listing-05';
update public.products set id = '14k-gold-semi-solid-cuban-link-chain-necklace',
       slug = '14k-gold-semi-solid-cuban-link-chain-necklace'         where id = 'new-listing-06';

commit;

-- Verify: should return the six new ids, zero rows still named new-listing-*.
-- select id, title from public.products where id like '%rope-chain%' or id like '%cuban%' or id like '%box-link%';
-- select count(*) from public.products where id like 'new-listing-%';  -- expect 0
