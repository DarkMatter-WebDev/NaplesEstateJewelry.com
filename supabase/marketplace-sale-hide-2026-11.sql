-- Delete eBay / Etsy sales from Admin → Orders (2026-11-18).
--
-- Owner: "Give me the option to manually delete orders from eBay / Etsy (like
-- we have for normal orders) ... so they just don't exist on the Naples Estate
-- Jewelry site" — the one-time fill-in brought in old sales that have nothing
-- to do with this site.
--
-- ⛔ A "deleted" sale is HIDDEN, never erased. Each `marketplace_sale_events`
-- row is also the sales sweep's only record that it has already seen that sale
-- (unique (channel, external_order_id, external_line_id) — apply_marketplace_sale
-- inserts "on conflict do nothing"). Erasing the row would let the next re-read
-- record the sale again and, for a matched product, mark it sold again.
--
--   deleted_at — in the Orders Recycle Bin (Restore puts it back).
--   purged_at  — "Delete Forever": never shown anywhere on the site again;
--                the row stays only as the sweep's "already seen" marker.
--                (No buyer data either way — see marketplace-sale-records-2026-11.sql.)
--
-- Nothing else reads these columns: the sweep never clears them, and deleting
-- a sale never touches a product or the eBay / Etsy order itself.
--
-- Safe to re-run. Run in the Supabase SQL editor as the project owner.
-- Safe before OR after the site deploy: until this runs, the Orders page works
-- as before and simply shows no Delete buttons on eBay / Etsy rows.
-- No new grant: the service role already has select/update on this table
-- (marketplace-sale-records-2026-11.sql); browsers still get nothing.

alter table public.marketplace_sale_events
  add column if not exists deleted_at timestamptz,
  add column if not exists purged_at  timestamptz;

-- Check: ONE row, every value true.
select
  (select count(*) = 2 from information_schema.columns
     where table_schema = 'public' and table_name = 'marketplace_sale_events'
       and column_name in ('deleted_at', 'purged_at')) as hide_columns,
  has_table_privilege('service_role', 'public.marketplace_sale_events', 'select')
    and has_table_privilege('service_role', 'public.marketplace_sale_events', 'update') as server_can_read_update,
  not has_table_privilege('anon', 'public.marketplace_sale_events', 'select')
    and not has_table_privilege('authenticated', 'public.marketplace_sale_events', 'update') as browsers_cannot_touch;
