-- eBay sync: OAuth connection, account defaults (incl. the Q16 price-tiered
-- express-shipping policy pair), product<->listing mapping/state machine,
-- and an audit/dead-letter log.
--
-- Source of truth for this schema: ebay-sync-plan/08-database-schema.md.
-- Additive only — no existing table/column is altered or dropped. All four
-- tables are SERVICE-ROLE ONLY: RLS enabled with NO policies (deny-all to
-- anon/authenticated), same trust model as public.webhook_events and the
-- etsy_* tables. Every /api/admin/ebay/* route verifies the signed-in
-- Supabase user is an admin BEFORE touching these tables, then reads/writes
-- with the service-role client (see next-app/src/lib/ebay/store.ts) — RLS is
-- the backstop, not the primary gate.
--
-- One fewer table than etsy-sync.sql: there is no ebay_listing_images table.
-- eBay's Inventory API takes product.imageUrls[] directly (eBay itself
-- fetches and copies them to eBay Picture Services) — there are no per-image
-- upload calls or checkpoints to track (see ebay-sync-plan/05-image-pipeline.md).
--
-- No image bytes, no eBay listing copy (titles/descriptions), and no buyer
-- PII are ever stored here — only IDs, sync state, hashes, and redacted
-- operator-facing messages (see ebay-sync-plan/15-compliance.md).
--
-- products.id is TEXT (not uuid) — every FK below reflects that.
--
-- Run in the Supabase SQL Editor. Safe to re-run (idempotent).

-- ---------------------------------------------------------------------------
-- ebay_connection — single-row OAuth + account defaults + sync policy
-- ---------------------------------------------------------------------------
create table if not exists public.ebay_connection (
  id                        int primary key default 1 check (id = 1), -- single row
  status                    text not null default 'disconnected',
    -- 'disconnected' | 'connected' | 'needs_reauth'
  ebay_username             text,
  marketplace_id            text not null default 'EBAY_US',
  scopes                    text[],                       -- granted scope set
  access_token_enc          text,                         -- AES-256-GCM, key in EBAY_TOKEN_ENC_KEY (Netlify env)
  access_token_expires_at   timestamptz,                  -- ~2h horizon
  refresh_token_enc         text,                         -- NON-rotating (eBay) — no rotation-race guard needed
  refresh_token_expires_at  timestamptz,                  -- ~18 months; drives the reconnect countdown
  -- one-time account defaults (see ebay-sync-plan/06-account-prerequisites.md)
  fulfillment_policy_id     text,       -- standard shipping (live: "NEJ Insured Flat Rate")
  payment_policy_id         text,
  return_policy_id          text,
  merchant_location_key     text,
  -- price-tiered express shipping (Q16, added 2026-07-09)
  express_fulfillment_policy_id  text,       -- live: "NEJ Express High-Value" (FedEx 2Day, $50, 1-day handling)
  high_value_shipping_threshold  numeric not null default 1000, -- admin-editable
  -- cached selling-limit snapshot (refreshed on status reads; informational only — Q14)
  selling_limit_amount      numeric,
  selling_limit_quantity    int,
  selling_limit_checked_at  timestamptz,
  -- sync policy (owner-editable in admin; defaults = the decided answers in
  -- ebay-sync-plan/13-open-questions.md, 2026-07-09)
  auto_publish              boolean not null default false, -- Q1: review-first
  sold_handling             text not null default 'quantity_zero',
    -- 'quantity_zero' | 'withdraw'  (Q7: quantity-zero decided for sold-on-site;
    -- withdraw is still used directly for archived/deleted regardless of this flag)
  best_offer_enabled        boolean not null default false, -- Q9: off
  price_push_enabled        boolean not null default false,
  price_push_threshold_pct  numeric not null default 1.0,   -- Q3: same threshold model as Etsy
  price_markup_pct          numeric not null default 15,    -- Q2: admin-variable, seeded 15%
  -- Phase 3 order-poll cursor (column exists per the plan's seam; the
  -- orders-poll route itself is deliberately NOT built — Q15)
  orders_cursor             timestamptz,
  connected_at              timestamptz,
  updated_at                timestamptz not null default now()
);

-- Seed the single row so reads always find it (status defaults to 'disconnected').
insert into public.ebay_connection (id)
values (1)
on conflict (id) do nothing;

alter table public.ebay_connection enable row level security;
-- No policies: service-role only (deny-all to anon/authenticated).

-- ---------------------------------------------------------------------------
-- ebay_oauth_states — transient OAuth handshake state (10-minute TTL by
-- convention). No code_verifier column — eBay's authorization-code grant has
-- no PKCE (confidential client, Basic auth on the token exchange instead).
-- ---------------------------------------------------------------------------
create table if not exists public.ebay_oauth_states (
  state          text primary key,           -- CSRF nonce
  admin_user_id  text not null,              -- who initiated
  created_at     timestamptz not null default now()
    -- rows older than 10 min are invalid; callback deletes on use, connect
    -- route opportunistically purges expired rows (no cron dependency)
);

alter table public.ebay_oauth_states enable row level security;
-- No policies: service-role only.

-- ---------------------------------------------------------------------------
-- ebay_listings — product <-> SKU/offer/listing mapping + sync state machine
-- ---------------------------------------------------------------------------
create table if not exists public.ebay_listings (
  product_id        text primary key references public.products (id) on delete cascade,
  ebay_sku          text not null unique,     -- pushed SKU = products.id verbatim (Q11)
  ebay_offer_id     text unique,              -- null until offer created
  ebay_listing_id   text unique,              -- null until published; CHANGES on re-publish after withdraw
  sync_state        text not null default 'pending',
    -- 'pending' | 'item_synced' | 'offer_created' | 'review'
    -- | 'published' | 'out_of_date' | 'hidden_oos' | 'ended' | 'error'
    -- (state machine: ebay-sync-plan/03-sync-lifecycle.md)
  content_hash      text,                     -- hash of last successfully pushed mapped payload
                                              -- (includes the resolved fulfillment policy id — Q16)
  last_pushed_price numeric,                  -- for threshold-based price push (Q3)
  last_pushed_qty   int,
  category_id       text,                     -- pinned or admin-overridden eBay leaf
  last_error        text,                     -- operator-friendly summary (redacted)
  error_count       int not null default 0,   -- consecutive failures, for backoff/giving up
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- deleting a product drops the mapping (on delete cascade) — the withdraw
-- step must run BEFORE product deletion (enforced in the guarded delete
-- flow), otherwise the listing is orphaned LIVE on eBay (worse than Etsy's
-- draft orphan — a live listing is public and purchasable). Sync engine logs
-- loudly if a live ebay_listing_id exists at delete time.

create index if not exists ebay_listings_sync_state_idx
  on public.ebay_listings (sync_state);

alter table public.ebay_listings enable row level security;
-- No policies: service-role only.

-- ---------------------------------------------------------------------------
-- ebay_sync_log — audit + dead-letter (retention: prune rows older than ~90
-- days via the sync engine's opportunistic housekeeping, no cron dependency)
-- ---------------------------------------------------------------------------
create table if not exists public.ebay_sync_log (
  id            bigint generated always as identity primary key,
  product_id    text,                         -- nullable: connection-level events too
  listing_id    text,
  action        text not null,                -- 'put_item'|'create_offer'|'publish'|'update'
                                               -- |'price_push'|'hide_oos'|'withdraw'|'restore'
                                               -- |'order_ingest'|'connect'|'disconnect'
                                               -- |'account_deletion'|'compliance_sweep'...
  outcome       text not null,                -- 'ok' | 'warning' | 'error'
  message       text,                         -- operator-friendly, secrets redacted
  detail        jsonb,                        -- allowlisted request/response summary, ebay errorId(s)
  created_at    timestamptz not null default now()
);

create index if not exists ebay_sync_log_product_idx
  on public.ebay_sync_log (product_id, created_at desc);

alter table public.ebay_sync_log enable row level security;
-- No policies: service-role only.

-- ---------------------------------------------------------------------------
-- Queue claim (Phase 2 bulk drain) — atomically claims one pending row so two
-- concurrent "Sync all to eBay" drains (two admin tabs, or a double-click)
-- can never grab the same product. The row lock + skip-locked live inside the
-- SAME statement as the update, so the claim is a single atomic operation.
-- Mirrors claim_next_pending_etsy_listing(); the runaway-prevention fixes
-- that mechanism needed in production (effectiveMode='update' re-enqueue
-- detection, drain seen-guard, stall guard) are implemented in
-- next-app/src/lib/ebay/sync.ts from day one rather than as later fixes.
-- ---------------------------------------------------------------------------
create or replace function public.claim_next_pending_ebay_listing()
returns text
language sql
security definer
set search_path = public
as $$
  update public.ebay_listings
  set updated_at = now()
  where product_id = (
    select product_id
    from public.ebay_listings
    where sync_state = 'pending'
    order by updated_at asc
    for update skip locked
    limit 1
  )
  returning product_id;
$$;

grant execute on function public.claim_next_pending_ebay_listing() to service_role;

-- ---------------------------------------------------------------------------
-- Grants. Every /api/admin/ebay/* route and the sync engine use the
-- service-role client for direct table reads/writes. In this Supabase project
-- service_role bypasses RLS but still needs explicit table-level GRANTs (see
-- supabase/etsy-sync.sql's identical grant block) — this project's hardening
-- scripts do not leave a blanket service_role grant. No anon/authenticated
-- grants anywhere: these tables are never reachable from the browser.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.ebay_connection to service_role;
grant select, insert, update, delete on public.ebay_oauth_states to service_role;
grant select, insert, update, delete on public.ebay_listings to service_role;
grant select, insert, update, delete on public.ebay_sync_log to service_role;

notify pgrst, 'reload schema';
