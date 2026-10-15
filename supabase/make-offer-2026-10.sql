-- Naples Estate Jewelry - "Make an Offer" on the site shop (2026-10-15).
-- Safe to re-run. Run ALL of it in the Supabase SQL Editor (before or after the
-- deploy: until it runs, the "Accept offers" box cannot be saved, no item shows
-- "Make an Offer", and Admin -> Offers says the table is missing - everything
-- else on the site works as before).
--
-- How it works (owner, 2026-10-15, mockup v2):
--   * products.accepts_offers - the item's "Accept offers" box (off by default).
--   * A buyer's offer HOLDS the full amount (offer + shipping + tax) through
--     PayPal (intent AUTHORIZE). Accept = the hold is charged at once and a
--     normal paid order is created; Decline / 72 hours / item sold = the hold is
--     released.
--   * Counter = the hold is released and the buyer gets a private link to buy
--     at the counter price through the normal checkout, for 72 hours.
--   * The 15-minute sweep (section 4) expires offers and counters and releases
--     holds that are still open on a sold item.

-- 1. The item's box ----------------------------------------------------------
alter table public.products
  add column if not exists accepts_offers boolean not null default false;

comment on column public.products.accepts_offers is
  'Shows "Make an Offer" on the item''s shop page (owner-set per item; the AI listing assistant may set it only when told to).';

-- The shop page is read by visitors (anon) and signed-in buyers (authenticated);
-- both read products through column grants, so the new column needs its own.
grant select (accepts_offers) on public.products to anon, authenticated;

-- 2. The offers ----------------------------------------------------------------
create table if not exists public.product_offers (
  id                   uuid primary key default gen_random_uuid(),
  product_id           text not null references public.products(id) on delete cascade,
  -- pending       = created, PayPal window not approved yet (no money held)
  -- open          = money held, waiting for the owner
  -- accepted      = charged; order_id is the paid order
  -- declined      = owner declined; hold released
  -- expired       = 72 hours passed; hold released
  -- countered     = owner countered; hold released; buyer has a Buy-now link
  -- counter_bought  = buyer paid the counter price; order_id is the paid order
  -- counter_expired = the Buy-now link ran out unused
  -- item_sold     = the item sold another way while the offer was open
  -- failed        = PayPal refused the charge on Accept; item still available
  -- abandoned     = the buyer never approved the PayPal window
  status               text not null default 'pending'
                       check (status in ('pending', 'open', 'accepted', 'declined', 'expired', 'countered',
                                         'counter_bought', 'counter_expired', 'item_sold', 'failed', 'abandoned')),
  amount               numeric(12, 2) not null check (amount > 0),
  listed_price         numeric(12, 2),
  shipping_method      text not null,
  subtotal             numeric(12, 2) not null,
  tax                  numeric(12, 2) not null,
  shipping_fee         numeric(12, 2) not null,
  total                numeric(12, 2) not null check (total > 0),
  customer_name        text not null,
  customer_email       text not null,
  customer_phone       text not null,
  shipping_address     jsonb,
  message              text,
  locale               text not null default 'en',
  user_id              uuid,
  -- The order_items rows to write on Accept (create_paypal_order's items_payload).
  order_snapshot       jsonb not null,
  paypal_order_id      text unique,
  authorization_id     text,
  authorized_at        timestamptz,
  expires_at           timestamptz,
  -- none | held | released | captured | release_failed
  hold_status          text not null default 'none',
  counter_amount       numeric(12, 2),
  counter_note         text,
  counter_token_hash   text unique,
  counter_sent_at      timestamptz,
  counter_expires_at   timestamptz,
  order_id             uuid references public.orders(id) on delete set null,
  decided_at           timestamptz,
  last_error           text,
  owner_notified_at    timestamptz,
  -- The last status the buyer was emailed about (the sweep retries a miss).
  notified_status      text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists product_offers_product_status_idx on public.product_offers (product_id, status);
create index if not exists product_offers_status_expires_idx on public.product_offers (status, expires_at);
create index if not exists product_offers_created_idx on public.product_offers (created_at desc);
-- One open offer per buyer per item.
create unique index if not exists product_offers_one_open_per_buyer
  on public.product_offers (product_id, lower(customer_email))
  where status = 'open';

alter table public.product_offers enable row level security;
revoke all on public.product_offers from anon, authenticated;
grant select, insert, update, delete on public.product_offers to service_role;

create or replace function public.product_offers_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists product_offers_touch_updated_at on public.product_offers;
create trigger product_offers_touch_updated_at
  before update on public.product_offers
  for each row execute function public.product_offers_touch_updated_at();

-- 3. Which order came from an offer -------------------------------------------
alter table public.orders
  add column if not exists offer_id uuid references public.product_offers(id) on delete set null;
create index if not exists orders_offer_id_idx on public.orders (offer_id) where offer_id is not null;

-- 4. The 15-minute sweep ------------------------------------------------------
-- Uses the TEXT_ALERTS_CRON_SECRET already in Vault (the same value Netlify
-- holds) - no new secret.
select cron.schedule(
  'nej-offers-sweep',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://naplesestatejewelry.com/api/admin/offers/sweep',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'TEXT_ALERTS_CRON_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- 5. Verify -------------------------------------------------------------------
-- The editor shows the LAST result: one row, every value true.
select
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'products' and column_name = 'accepts_offers') as products_accepts_offers,
  has_column_privilege('anon', 'public.products', 'accepts_offers', 'select')                         as anon_can_read_accepts_offers,
  exists (select 1 from information_schema.tables
           where table_schema = 'public' and table_name = 'product_offers')                            as offers_table,
  not has_table_privilege('anon', 'public.product_offers', 'select')                                   as offers_private,
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'orders' and column_name = 'offer_id')      as orders_offer_id,
  exists (select 1 from cron.job where jobname = 'nej-offers-sweep' and active)                        as sweep_scheduled;
