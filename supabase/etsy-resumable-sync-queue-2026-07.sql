-- Etsy sync: keep bounded multi-request work claimable until completion.
-- Idempotent; safe to run after the canonical etsy-sync.sql migration.

create or replace function public.claim_next_pending_etsy_listing()
returns text
language sql
security definer
set search_path = public
as $$
  update public.etsy_listings
  set updated_at = now()
  where product_id = (
    select product_id
    from public.etsy_listings
    where sync_state in ('pending', 'draft_created', 'images_synced', 'inventory_synced', 'out_of_date')
    order by updated_at asc
    for update skip locked
    limit 1
  )
  returning product_id;
$$;

create or replace function public.claim_next_repairable_etsy_listing()
returns text
language sql
security definer
set search_path = public
as $$
  update public.etsy_listings
  set updated_at = now()
  where product_id = (
    select product_id
    from public.etsy_listings
    where etsy_listing_id is not null
      and sync_state in ('draft_created', 'images_synced', 'inventory_synced', 'out_of_date')
    order by updated_at asc
    for update skip locked
    limit 1
  )
  returning product_id;
$$;

revoke all on function public.claim_next_pending_etsy_listing() from public, anon, authenticated;
revoke all on function public.claim_next_repairable_etsy_listing() from public, anon, authenticated;
grant execute on function public.claim_next_pending_etsy_listing() to service_role;
grant execute on function public.claim_next_repairable_etsy_listing() to service_role;

notify pgrst, 'reload schema';
