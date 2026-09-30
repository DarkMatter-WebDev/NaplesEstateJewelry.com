-- Public shop display settings (single-row).
--
-- Controls whether SOLD products are shown in the public shop gallery and whether
-- their customer-facing prices are replaced with "Sold". Defaults preserve the
-- existing behavior until an admin opts into price masking.
--
-- Reads: the public storefront needs this value, so anon/authenticated may SELECT.
-- Writes: only the admin API route (service-role client, gated by requireAdmin())
-- writes it, so no public write policy is needed. The service role bypasses RLS
-- but in this project still needs explicit table grants.
--
-- Run in the Supabase SQL Editor. Safe to re-run (idempotent).

create table if not exists public.shop_settings (
  id              boolean     primary key default true check (id),
  show_sold_items boolean     not null default true,
  hide_sold_item_prices boolean not null default false,
  -- Site-wide default for the product-page trade-in line — see
  -- shop-special-price-default-2026-07.sql. Off by default (plain melt value).
  special_price_default_enabled boolean not null default false,
  special_price_default_percent numeric,
  updated_at      timestamptz not null default now()
);

-- Additive columns for existing installs (no-op if the table was just created
-- above with them). Keeps this canonical script safe to run on an older DB.
alter table public.shop_settings
  add column if not exists hide_sold_item_prices boolean not null default false;
alter table public.shop_settings
  add column if not exists special_price_default_enabled boolean not null default false;
alter table public.shop_settings
  add column if not exists special_price_default_percent numeric;
-- Admin-editable weekly showroom hours — see store-hours-2026-08.sql.
-- null = app serves its built-in Tue–Sat 11:00–15:00 default.
alter table public.shop_settings
  add column if not exists store_hours jsonb;
-- Admin-editable homepage announcement banner — see home-banner-2026-08.sql.
-- null = app serves its built-in promo copy and /free-evaluation link.
alter table public.shop_settings
  add column if not exists home_banner jsonb;

-- Seed the single row so reads always find it.
insert into public.shop_settings (id, show_sold_items)
values (true, true)
on conflict (id) do nothing;

alter table public.shop_settings enable row level security;

-- Public read: the storefront (anon, cookie-free client) reads the toggle.
drop policy if exists "Public reads shop settings" on public.shop_settings;
create policy "Public reads shop settings"
  on public.shop_settings for select
  to anon, authenticated
  using (true);

grant select on public.shop_settings to anon, authenticated;

-- Admin writes go through the service role (RLS-bypassing) in the admin API.
grant select, insert, update on public.shop_settings to service_role;

notify pgrst, 'reload schema';
