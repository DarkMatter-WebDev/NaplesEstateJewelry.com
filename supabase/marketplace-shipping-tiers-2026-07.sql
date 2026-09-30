-- ============================================================================
-- Marketplace shipping-tier mapping (2026-07-30). Idempotent.
--
-- One row per (marketplace, fee tier): stores the id of the provisioned Etsy
-- shipping profile / eBay fulfillment policy that charges that tier's fee, so
-- listing syncs can assign shipping from the same value-based tier table the
-- site checkout uses (next-app/src/lib/checkout-shipping.ts,
-- project-docs/features/shipping-tiers-plan.md).
--
-- Rows are written only by the admin "Provision shipping tiers" actions in
-- Settings -> Etsy Sync / eBay Sync. Until a marketplace has rows here, its
-- sync keeps using the single default profile/policy exactly as before.
--
-- Run AFTER etsy-sync.sql / ebay-sync.sql (service-role conventions match).
-- ============================================================================

create table if not exists public.marketplace_shipping_profiles (
  marketplace text not null check (marketplace in ('etsy', 'ebay')),
  fee_key text not null,
  fee numeric(8,2) not null check (fee >= 0),
  external_id text not null,
  label text,
  updated_at timestamptz not null default now(),
  primary key (marketplace, fee_key)
);

alter table public.marketplace_shipping_profiles enable row level security;

-- Service-role only: no anon/authenticated policies on purpose. Admin routes
-- and the sync engines use the service client, matching etsy_*/ebay_* tables.
revoke all on public.marketplace_shipping_profiles from public, anon, authenticated;
grant select, insert, update, delete on public.marketplace_shipping_profiles to service_role;

notify pgrst, 'reload schema';
