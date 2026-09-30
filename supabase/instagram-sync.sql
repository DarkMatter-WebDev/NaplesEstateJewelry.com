-- Instagram auto-posting: connection/token storage, product <-> post mapping and
-- state machine, and an audit/dead-letter log.
--
-- Design notes (see project-docs/features/instagram-posting-plan.md):
--   * Uses the "Instagram API with Instagram Login" variant: an Instagram User
--     access token against graph.instagram.com. No Facebook Page is involved.
--   * Token acquisition is PASTE-THEN-AUTO-REFRESH rather than a redirect OAuth
--     dance. Instagram requires HTTPS redirect URIs (no http://localhost), which
--     would make the owner's LAN/dev testing impossible, and this is a single
--     owner-operated professional account on a development-mode app where Meta's
--     own documented path is dashboard token generation. The long-lived token
--     lasts 60 days and is refreshed indefinitely by a scheduled function, so
--     the paste happens once. A redirect OAuth flow can be layered on later
--     without changing these tables (add an instagram_oauth_states table).
--   * All three tables are SERVICE-ROLE ONLY: RLS enabled with NO policies
--     (deny-all to anon/authenticated), matching etsy_*/ebay_*. Every
--     /api/admin/instagram/* route verifies the signed-in Supabase user is an
--     admin BEFORE touching these tables, then uses the service-role client.
--     RLS is the backstop, not the primary gate.
--   * No image bytes and no buyer PII are stored here — only IDs, sync state,
--     hashes, the caption we published, and redacted operator-facing messages.
--
-- Run in the Supabase SQL Editor. Safe to re-run (idempotent).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- instagram_connection — single-row token + posting policy
-- ---------------------------------------------------------------------------
create table if not exists public.instagram_connection (
  id                      int primary key default 1 check (id = 1), -- single row
  status                  text not null default 'disconnected',
    -- 'disconnected' | 'connected' | 'needs_reauth'
  ig_user_id              text,                       -- Instagram professional account id
  username                text,                       -- @handle, for display only
  account_type            text,                       -- BUSINESS | MEDIA_CREATOR
  scopes                  text[],                     -- granted scope set, informational
  access_token_enc        text,                       -- AES-256-GCM, key in INSTAGRAM_TOKEN_ENC_KEY
  token_expires_at        timestamptz,                -- long-lived tokens last 60 days
  token_refreshed_at      timestamptz,                -- refresh allowed >= 24h after this

  -- Posting policy (owner-editable in Admin -> Settings -> Instagram).
  -- Defaults encode the owner's 2026-07-31 decisions.
  auto_publish            boolean not null default false, -- review-first, like Etsy/eBay
  caption_include_price   boolean not null default true,  -- "≈ $X at time of posting"
  caption_spanish_line    boolean not null default true,  -- EN caption + one ES line
  caption_cta             text,                           -- trailing call-to-action line
  base_hashtags           text[]  not null default '{}',  -- merged with per-product tags
  sold_comment_enabled    boolean not null default true,  -- auto-comment when an item sells
  sold_comment_text       text    not null default 'SOLD',

  connected_at            timestamptz,
  updated_at              timestamptz not null default now()
);

-- Seed the single row so reads always find it (status defaults to 'disconnected').
insert into public.instagram_connection (id)
values (1)
on conflict (id) do nothing;

alter table public.instagram_connection enable row level security;
-- No policies: service-role only (deny-all to anon/authenticated).

-- ---------------------------------------------------------------------------
-- instagram_posts — product <-> Instagram media mapping + state machine
--
-- Instagram publishing is a two-step container flow, and unpublished containers
-- EXPIRE AFTER 24 HOURS. That is why container ids are checkpointed here with an
-- explicit expiry: a run interrupted between "children created" and "publish"
-- can resume, and a stale container is discarded rather than published blind.
-- ---------------------------------------------------------------------------
create table if not exists public.instagram_posts (
  product_id            text primary key references public.products(id) on delete cascade,
  sync_state            text not null default 'pending',
    -- 'pending'      queued by an admin, nothing prepared yet
    -- 'review'       renditions + caption prepared locally, awaiting go-live
    -- 'publishing'   containers created remotely, publish not yet confirmed
    -- 'published'    live on Instagram (ig_media_id set)
    -- 'out_of_date'  published, but caption/image inputs have since changed
    -- 'deleted'      media removed from Instagram
    -- 'error'        last attempt failed; see last_error/error_count
  ig_media_id           text unique,           -- set once published
  permalink             text,                  -- public post URL

  -- Two-step container checkpoints (see note above)
  child_container_ids   jsonb not null default '[]',
  carousel_container_id text,
  container_expires_at  timestamptz,

  -- Square JPEG renditions we uploaded to Supabase Storage for Meta to fetch.
  -- Retained so the Storage GC reference scan can see them and so a delete path
  -- can clean them up. Paths only, never bytes.
  rendition_paths       jsonb not null default '[]',

  content_hash          text,                  -- sha256 of caption inputs + image source keys
  posted_caption        text,                  -- exactly what we published (captions are immutable on IG)
  posted_price          numeric,               -- price quoted in the caption, if any
  posted_at             timestamptz,

  sold_comment_id       text,                  -- id of the auto "SOLD" comment
  sold_comment_at       timestamptz,

  queued_at             timestamptz,           -- when the admin approved this queue entry
  scheduled_for         timestamptz,           -- target publish time; worker never posts early
  last_error            text,                  -- redacted, operator-facing
  error_count           int not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists instagram_posts_sync_state_idx
  on public.instagram_posts (sync_state);
-- Drip queue ordering: oldest approved item first.
create index if not exists instagram_posts_queued_at_idx
  on public.instagram_posts (queued_at)
  where queued_at is not null;
create index if not exists instagram_posts_scheduled_for_idx
  on public.instagram_posts (scheduled_for, queued_at)
  where queued_at is not null and scheduled_for is not null;

alter table public.instagram_posts enable row level security;
-- No policies: service-role only.

-- ---------------------------------------------------------------------------
-- instagram_sync_log — audit trail + dead letters (same shape as etsy_sync_log)
-- ---------------------------------------------------------------------------
create table if not exists public.instagram_sync_log (
  id          bigint generated by default as identity primary key,
  product_id  text,                    -- nullable: connection-level events too
  media_id    text,
  action      text not null,           -- connect|prepare|publish|verify|delete|sold_comment|token_refresh|...
  outcome     text not null,           -- 'ok' | 'warning' | 'error'
  message     text,                    -- redacted operator-facing summary
  detail      jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists instagram_sync_log_product_created_idx
  on public.instagram_sync_log (product_id, created_at desc);

alter table public.instagram_sync_log enable row level security;
-- No policies: service-role only.

-- ---------------------------------------------------------------------------
-- claim_next_pending_instagram_post — atomic queue claim
--
-- FOR UPDATE SKIP LOCKED inside the UPDATE so two admin tabs (or a scheduled
-- drip run racing a manual publish) can never grab the same product.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Grants — service_role only, mirroring the Etsy/eBay trust model.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.instagram_connection to service_role;
grant select, insert, update, delete on public.instagram_posts       to service_role;
grant select, insert, update, delete on public.instagram_sync_log    to service_role;
grant usage, select on sequence public.instagram_sync_log_id_seq     to service_role;
