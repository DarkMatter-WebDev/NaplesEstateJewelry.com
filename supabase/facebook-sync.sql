-- Facebook Page auto-posting: connection/token storage, product <-> post mapping
-- and state machine, and an audit log. Mirrors instagram-sync.sql deliberately —
-- the two channels stay independent (DECISIONS.md), but the shape is copied so
-- an operator or agent who knows one immediately knows the other.
--
-- Differences from Instagram, all driven by how the Facebook Graph API behaves:
--   * Publishing uses a PAGE access token against graph.facebook.com. A page
--     token derived from a long-lived user token DOES NOT EXPIRE, so there is
--     no refresh schedule and no token_refresh cron — token_expires_at stays
--     null in the normal case and the connection only needs re-pasting if Meta
--     invalidates it (password change, permission revocation).
--   * A post is built from UNPUBLISHED PHOTOS (published=false) attached to a
--     single feed post. Unpublished photo ids are only usable for ~24h, so they
--     are checkpointed with an expiry exactly like Instagram's containers.
--   * Facebook CAN delete posts through the API, and post text is editable.
--     The delete path is therefore real (no manual-delete detour), but posting
--     stays review-first anyway — publishing is still a public act.
--   * image_selection and image_crops are baked in from day one (Instagram
--     grew them through later migrations).
--
-- All three tables are SERVICE-ROLE ONLY: RLS enabled with NO policies
-- (deny-all to anon/authenticated). Every /api/admin/facebook/* route verifies
-- the signed-in Supabase user is an admin BEFORE touching these tables, then
-- uses the service-role client. RLS is the backstop, not the primary gate.
--
-- Run in the Supabase SQL Editor. Safe to re-run (idempotent).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- facebook_connection — single-row token + posting policy
-- ---------------------------------------------------------------------------
create table if not exists public.facebook_connection (
  id                      int primary key default 1 check (id = 1), -- single row
  status                  text not null default 'disconnected',
    -- 'disconnected' | 'connected' | 'needs_reauth'
  page_id                 text,                       -- Facebook Page id
  page_name               text,                       -- Page display name
  scopes                  text[],                     -- informational only
  access_token_enc        text,                       -- AES-256-GCM, key in FACEBOOK_TOKEN_ENC_KEY
  token_expires_at        timestamptz,                -- null: page tokens do not expire
  token_refreshed_at      timestamptz,                -- last paste/validation time

  -- Posting policy (owner-editable in Admin -> Settings -> Facebook).
  auto_publish            boolean not null default false, -- review-first, like every channel
  caption_include_price   boolean not null default true,  -- "≈ $X at time of posting"
  caption_spanish_line    boolean not null default true,
  caption_cta             text,                           -- trailing call-to-action line
  base_hashtags           text[]  not null default '{}',
  sold_comment_enabled    boolean not null default true,
  sold_comment_text       text    not null default 'SOLD',

  connected_at            timestamptz,
  updated_at              timestamptz not null default now()
);

insert into public.facebook_connection (id)
values (1)
on conflict (id) do nothing;

alter table public.facebook_connection enable row level security;
-- No policies: service-role only (deny-all to anon/authenticated).

-- ---------------------------------------------------------------------------
-- facebook_posts — product <-> Facebook post mapping + state machine
-- ---------------------------------------------------------------------------
create table if not exists public.facebook_posts (
  product_id            text primary key references public.products(id) on delete cascade,
  sync_state            text not null default 'pending',
    -- 'pending'      queued by an admin, nothing prepared yet
    -- 'review'       renditions + caption prepared locally, awaiting go-live
    -- 'publishing'   unpublished photos created remotely, feed post not confirmed
    -- 'published'    live on Facebook (fb_post_id set)
    -- 'out_of_date'  published, but caption/image inputs have since changed
    -- 'deleted'      post removed from Facebook
    -- 'error'        last attempt failed; see last_error/error_count
  fb_post_id            text unique,           -- set once published
  permalink             text,                  -- public post URL

  -- Unpublished-photo checkpoints. Photos uploaded with published=false are
  -- only attachable for ~24h; a run interrupted between "photos created" and
  -- "feed post" resumes from here, and stale ids are discarded, not published.
  photo_ids             jsonb not null default '[]',
  photos_expire_at      timestamptz,

  -- Square JPEG renditions uploaded to Supabase Storage for Meta to fetch,
  -- under facebook-renditions/ (never shared with Instagram's objects, so one
  -- channel re-preparing can never delete files the other still references).
  -- The Storage GC reference scan reads this column.
  rendition_paths       jsonb not null default '[]',

  -- Facebook-only ordered image lineup; null means "use the product's order".
  image_selection       jsonb,
  -- Normalized per-image crop rects keyed by image URL (same contract as
  -- instagram_posts.image_crops).
  image_crops           jsonb,

  content_hash          text,
  posted_caption        text,                  -- exactly what we published
  posted_price          numeric,
  posted_at             timestamptz,

  sold_comment_id       text,
  sold_comment_at       timestamptz,

  queued_at             timestamptz,           -- when the admin approved this queue entry
  scheduled_for         timestamptz,           -- target publish time; worker never posts early
  last_error            text,                  -- redacted, operator-facing
  error_count           int not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists facebook_posts_sync_state_idx
  on public.facebook_posts (sync_state);
create index if not exists facebook_posts_queued_at_idx
  on public.facebook_posts (queued_at)
  where queued_at is not null;
create index if not exists facebook_posts_scheduled_for_idx
  on public.facebook_posts (scheduled_for, queued_at)
  where queued_at is not null and scheduled_for is not null;

alter table public.facebook_posts enable row level security;
-- No policies: service-role only.

-- ---------------------------------------------------------------------------
-- facebook_sync_log — audit trail (same shape as instagram_sync_log)
-- ---------------------------------------------------------------------------
create table if not exists public.facebook_sync_log (
  id          bigint generated by default as identity primary key,
  product_id  text,
  post_id     text,
  action      text not null,           -- connect|prepare|publish|delete|sold_comment|scheduled_drip|...
  outcome     text not null,           -- 'ok' | 'warning' | 'error'
  message     text,
  detail      jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists facebook_sync_log_product_created_idx
  on public.facebook_sync_log (product_id, created_at desc);

alter table public.facebook_sync_log enable row level security;
-- No policies: service-role only.

-- ---------------------------------------------------------------------------
-- Grants — service_role only, mirroring the Instagram/Etsy/eBay trust model.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.facebook_connection to service_role;
grant select, insert, update, delete on public.facebook_posts      to service_role;
grant select, insert, update, delete on public.facebook_sync_log   to service_role;
grant usage, select on sequence public.facebook_sync_log_id_seq    to service_role;
