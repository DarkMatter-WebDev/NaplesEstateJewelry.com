-- Exact-time social queue scheduling for Instagram and Facebook.
-- Safe rollout: existing queued rows are assigned to the next established
-- channel window, never to NOW(), so applying this migration cannot trigger an
-- immediate public post when the five-minute workers are deployed.

alter table public.instagram_posts
  add column if not exists scheduled_for timestamptz;

alter table public.facebook_posts
  add column if not exists scheduled_for timestamptz;

update public.instagram_posts
   set scheduled_for = (
     select candidate
       from (
         select (
           date_trunc('day', now() at time zone 'America/New_York') + slot
         ) at time zone 'America/New_York' as candidate
           from (values
             (interval '18 hours'),
             (interval '20 hours'),
             (interval '22 hours'),
             (interval '24 hours'),
             (interval '42 hours')
           ) as slots(slot)
       ) candidates
      where candidate > now()
      order by candidate
      limit 1
   )
 where queued_at is not null
   and scheduled_for is null;

update public.facebook_posts
   set scheduled_for = (
     select candidate
       from (
         select (
           date_trunc('day', now() at time zone 'America/New_York') + slot
         ) at time zone 'America/New_York' as candidate
           from (values
             (interval '18 hours'),
             (interval '20 hours'),
             (interval '22 hours'),
             (interval '24 hours'),
             (interval '42 hours')
           ) as slots(slot)
       ) candidates
      where candidate > now()
      order by candidate
      limit 1
   )
 where queued_at is not null
   and scheduled_for is null;

create index if not exists instagram_posts_scheduled_for_idx
  on public.instagram_posts (scheduled_for, queued_at)
  where queued_at is not null and scheduled_for is not null;

create index if not exists facebook_posts_scheduled_for_idx
  on public.facebook_posts (scheduled_for, queued_at)
  where queued_at is not null and scheduled_for is not null;

-- Keep the legacy atomic claim helper aligned even though the current runner
-- performs its bounded due-row selection through the service-role client.
create or replace function public.claim_next_pending_instagram_post()
returns public.instagram_posts
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.instagram_posts;
begin
  update public.instagram_posts p
     set sync_state = 'publishing',
         updated_at = now()
   where p.product_id = (
     select c.product_id
       from public.instagram_posts c
      where c.sync_state in ('pending', 'review')
        and c.queued_at is not null
        and c.scheduled_for is not null
        and c.scheduled_for <= now()
      order by c.scheduled_for asc, c.queued_at asc
      limit 1
      for update skip locked
   )
  returning p.* into claimed;

  return claimed;
end;
$$;

revoke all on function public.claim_next_pending_instagram_post() from public, anon, authenticated;
grant execute on function public.claim_next_pending_instagram_post() to service_role;
