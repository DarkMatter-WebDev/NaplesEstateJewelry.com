-- Etsy sync: OAuth connection, product<->listing mapping/state machine,
-- per-image checkpoints, and an audit/dead-letter log.
--
-- Source of truth for this schema: etsy-sync-plan/08-database-schema.md.
-- Additive only — no existing table/column is altered or dropped. All five
-- tables are SERVICE-ROLE ONLY: RLS enabled with NO policies (deny-all to
-- anon/authenticated), same trust model as public.webhook_events. Every
-- /api/admin/etsy/* route verifies the signed-in Supabase user is an admin
-- BEFORE touching these tables, then reads/writes with the service-role
-- client (see next-app/src/lib/etsy/store.ts) — RLS is the backstop, not the
-- primary gate.
--
-- No image bytes, no Etsy listing copy (titles/descriptions), and no buyer
-- PII are ever stored here — only IDs, sync state, hashes, and redacted
-- operator-facing messages (see etsy-sync-plan/15-compliance.md).
--
-- Run in the Supabase SQL Editor. Safe to re-run (idempotent).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- etsy_connection — single-row OAuth + shop defaults + sync policy
-- ---------------------------------------------------------------------------
create table if not exists public.etsy_connection (
  id                       int primary key default 1 check (id = 1), -- single row
  status                   text not null default 'disconnected',
    -- 'disconnected' | 'connected' | 'needs_reauth'
  etsy_user_id             bigint,
  shop_id                  bigint,
  shop_name                text,
  scopes                   text[],                       -- granted scope set
  access_token_enc         text,                         -- AES-256-GCM, key in ETSY_TOKEN_ENC_KEY (Netlify env)
  access_token_expires_at  timestamptz,
  refresh_token_enc        text,                         -- rotates on every refresh
  refresh_token_updated_at timestamptz,
  -- one-time shop defaults (see etsy-sync-plan/06-shop-prerequisites.md)
  shipping_profile_id      bigint,
  return_policy_id         bigint,
  readiness_state_id       bigint,
  section_map              jsonb not null default '{}',   -- product_type -> shop_section_id
  -- sync policy (owner-editable in admin, defaults per etsy-sync-plan/13-open-questions.md)
  auto_activate            boolean not null default false, -- draft-for-review default (Q1)
  auto_delist_on_sold      boolean not null default false,  -- Phase 2 flips this on
  price_push_enabled       boolean not null default false,
  price_push_threshold_pct numeric not null default 1.0,    -- Q4: push only when |delta| >= this
  price_markup_pct         numeric not null default 8,      -- Q5: Etsy-fee markup, site price untouched
  connected_at             timestamptz,
  updated_at               timestamptz not null default now()
);

-- Seed the single row so reads always find it (status defaults to 'disconnected').
insert into public.etsy_connection (id)
values (1)
on conflict (id) do nothing;

alter table public.etsy_connection enable row level security;
-- No policies: service-role only (deny-all to anon/authenticated).

-- ---------------------------------------------------------------------------
-- etsy_oauth_states — transient PKCE handshake state (10-minute TTL by convention)
-- ---------------------------------------------------------------------------
create table if not exists public.etsy_oauth_states (
  state          text primary key,           -- CSRF nonce
  code_verifier  text not null,              -- PKCE verifier (single-use)
  admin_user_id  uuid not null,              -- who initiated
  created_at     timestamptz not null default now()
    -- rows older than 10 min are invalid; callback deletes on use, connect
    -- route opportunistically purges expired rows (no cron dependency)
);

alter table public.etsy_oauth_states enable row level security;
-- No policies: service-role only.

-- ---------------------------------------------------------------------------
-- etsy_listings — product <-> Etsy listing mapping + sync state machine
-- ---------------------------------------------------------------------------
create table if not exists public.etsy_listings (
  product_id        text primary key references public.products (id) on delete cascade,
  etsy_listing_id   bigint unique,            -- null until draft created
  sync_state        text not null default 'pending',
    -- 'pending' | 'draft_created' | 'images_synced' | 'inventory_synced'
    -- | 'draft_review' | 'active' | 'out_of_date' | 'delisted' | 'error'
    -- (state machine: etsy-sync-plan/03-sync-lifecycle.md)
  listing_state     text,                     -- last known Etsy-side state we set/saw
                                              -- ('draft'|'active'|'inactive'|'ended')
  content_hash      text,                     -- hash of last successfully pushed mapped payload
  last_pushed_price numeric,                  -- for threshold-based price push (Q4)
  taxonomy_id       bigint,
  -- Manual per-product category override (added 2026-07-08): Etsy's real
  -- taxonomy has no generic "plain ring"/"plain necklace"/etc. leaf, so the
  -- automatic ETSY_TAXONOMY_MAP guess is sometimes wrong for a given item.
  -- When set, this wins over the product_type-based automatic lookup in
  -- lib/etsy/mapping.ts. taxonomy_override_path is stored purely so the admin
  -- UI can show the picked category without an extra Etsy taxonomy fetch.
  taxonomy_override_id   bigint,
  taxonomy_override_path text,
  -- Owner-supplied custom Etsy tags (added 2026-07-08): merged into the
  -- auto-generated tags by lib/etsy/mapping.ts mapTags() (owner's tags first),
  -- within Etsy's 13-tag cap. See supabase/etsy-listings-extra-tags-2026-07.sql.
  extra_tags        text[],
  last_synced_at    timestamptz,
  last_error        text,                     -- operator-friendly summary (redacted)
  error_count       int not null default 0,   -- consecutive failures, for backoff/giving up
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- deleting a product drops the mapping (on delete cascade) — the delist step
-- must run BEFORE product deletion (enforced in the guarded delete flow),
-- otherwise the listing is orphaned on Etsy (sync engine logs loudly).

create index if not exists etsy_listings_sync_state_idx
  on public.etsy_listings (sync_state);

alter table public.etsy_listings enable row level security;
-- No policies: service-role only.

-- ---------------------------------------------------------------------------
-- etsy_listing_images — per-image checkpoint + change detection
-- ---------------------------------------------------------------------------
create table if not exists public.etsy_listing_images (
  id                     bigint generated always as identity primary key,
  product_id             text not null references public.products (id) on delete cascade,
  etsy_listing_id        bigint not null,
  source_url             text not null,       -- exact entry from products.image_urls
  source_key             text not null,       -- storage path or /assets path (domain-stable)
  bytes_sha256           text,                -- computed during upload
  etsy_listing_image_id  bigint not null,
  rank                   int not null,
  uploaded_at            timestamptz not null default now(),
  unique (etsy_listing_id, source_key)
);

create index if not exists etsy_listing_images_product_idx
  on public.etsy_listing_images (product_id);

alter table public.etsy_listing_images enable row level security;
-- No policies: service-role only.

-- ---------------------------------------------------------------------------
-- etsy_sync_log — audit + dead-letter (retention: prune rows older than ~90
-- days via the sync engine's opportunistic housekeeping, no cron dependency)
-- ---------------------------------------------------------------------------
create table if not exists public.etsy_sync_log (
  id            bigint generated always as identity primary key,
  product_id    text,                         -- nullable: connection-level events too
  listing_id    bigint,
  action        text not null,                -- 'create_draft'|'upload_image'|'set_inventory'
                                               -- |'set_property'|'activate'|'update'|'delist'
                                               -- |'relist'|'price_push'|'order_ingest'|'connect'...
  outcome       text not null,                 -- 'ok' | 'warning' | 'error'
  message       text,                         -- operator-friendly, secrets redacted
  detail        jsonb,                        -- request/response summary (redacted), etsy error code
  created_at    timestamptz not null default now()
);

create index if not exists etsy_sync_log_product_idx
  on public.etsy_sync_log (product_id, created_at desc);

alter table public.etsy_sync_log enable row level security;
-- No policies: service-role only.

-- ---------------------------------------------------------------------------
-- Queue claim (Phase 2 bulk drain) — atomically claims one pending row so two
-- concurrent "Sync all" drains (two admin tabs, or a double-click) can never
-- grab the same product. The row lock + skip-locked live inside the SAME
-- statement as the update, so the claim is a single atomic operation.
-- ---------------------------------------------------------------------------
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

grant execute on function public.claim_next_pending_etsy_listing() to service_role;

-- Repair only already-linked listings that have incomplete pipeline work or
-- mapped-content drift. This never claims a new/unlinked pending product.
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

grant execute on function public.claim_next_repairable_etsy_listing() to service_role;

-- ---------------------------------------------------------------------------
-- Grants. Every /api/admin/etsy/* route and the sync engine use the
-- service-role client for direct table reads/writes. In this Supabase project
-- service_role bypasses RLS but still needs explicit table-level GRANTs (see
-- supabase/paypal-checkout.sql's identical grant block for webhook_events) —
-- this project's hardening scripts do not leave a blanket service_role grant.
-- No anon/authenticated grants anywhere: these tables are never reachable
-- from the browser.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.etsy_connection      to service_role;
grant select, insert, update, delete on public.etsy_oauth_states    to service_role;
grant select, insert, update, delete on public.etsy_listings        to service_role;
grant select, insert, update, delete on public.etsy_listing_images  to service_role;
grant select, insert, update, delete on public.etsy_sync_log        to service_role;

notify pgrst, 'reload schema';
