-- Naples Estate Jewelry sales workflow foundation.
-- Run in Supabase SQL Editor after schema.sql/products.sql.
-- Safe to re-run.

create extension if not exists "pgcrypto";

create or replace function public.is_admin_user(user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = user_id
      and is_admin = true
  );
$$;

-- Product lifecycle fields. These are additive so the existing product admin
-- and public shop can migrate gradually from the original compact product row.
alter table public.products
  add column if not exists inventory_number integer,
  add column if not exists product_type text,
  add column if not exists metal_type text,
  add column if not exists metal_variant text not null default 'yellow_gold',
  add column if not exists sku text,
  add column if not exists slug text,
  add column if not exists metal text,
  add column if not exists gram_weight numeric(8,2),
  add column if not exists stone_details text,
  add column if not exists brand text,
  add column if not exists jewelry_type text not null default 'Necklace',
  add column if not exists chain_type text,
  add column if not exists length text,
  add column if not exists image_urls jsonb not null default '[]'::jsonb,
  add column if not exists cost_basis numeric(12,2),
  add column if not exists melt_value numeric(12,2),
  add column if not exists asking_price numeric(12,2),
  add column if not exists minimum_price numeric(12,2),
  add column if not exists live_spot_snapshot jsonb,
  add column if not exists location text not null default 'showcase',
  add column if not exists acquisition_date date,
  add column if not exists acquisition_source text,
  add column if not exists internal_notes text,
  add column if not exists public_notes text,
  add column if not exists item_year smallint,
  add column if not exists featured boolean not null default false;

update public.products
set
  inventory_number = coalesce(inventory_number, null),
  sku = coalesce(sku, nullif(id, '')),
  slug = coalesce(slug, nullif(id, '')),
  metal = coalesce(metal, category),
  metal_type = coalesce(nullif(metal_type, ''), nullif(category, ''), nullif(metal, ''), 'Gold'),
  metal_variant = coalesce(
    nullif(metal_variant, ''),
    case when category = 'Silver' then 'silver' else 'yellow_gold' end
  ),
  gram_weight = coalesce(gram_weight, weight_grams),
  product_type = coalesce(nullif(product_type, ''), nullif(jewelry_type, ''), 'Other'),
  jewelry_type = case
    when jewelry_type is not null and jewelry_type <> '' and jewelry_type <> 'Necklace' then jewelry_type
    when lower(coalesce(title, '') || ' ' || coalesce(title_es, '') || ' ' || coalesce(chain_type, '')) like '%bracelet%' then 'Bracelet'
    when lower(coalesce(title, '') || ' ' || coalesce(title_es, '') || ' ' || coalesce(chain_type, '')) like '%ring%' then 'Ring'
    when lower(coalesce(title, '') || ' ' || coalesce(title_es, '') || ' ' || coalesce(chain_type, '')) like '%pendant%' then 'Pendant'
    when lower(coalesce(title, '') || ' ' || coalesce(title_es, '') || ' ' || coalesce(chain_type, '')) like '%earring%' then 'Earrings'
    when lower(coalesce(title, '') || ' ' || coalesce(title_es, '') || ' ' || coalesce(chain_type, '')) like '%watch%'
      or lower(coalesce(title, '') || ' ' || coalesce(title_es, '') || ' ' || coalesce(chain_type, '')) like '%wristwatch%'
      or lower(coalesce(title, '') || ' ' || coalesce(title_es, '') || ' ' || coalesce(chain_type, '')) like '%wrist watch%'
      or lower(coalesce(title, '') || ' ' || coalesce(title_es, '') || ' ' || coalesce(chain_type, '')) like '%timepiece%' then 'Watch'
    when lower(coalesce(title, '') || ' ' || coalesce(title_es, '') || ' ' || coalesce(chain_type, '')) like '%chain%' then 'Necklace'
    when lower(coalesce(title, '') || ' ' || coalesce(title_es, '') || ' ' || coalesce(chain_type, '')) like '%necklace%' then 'Necklace'
    else coalesce(nullif(jewelry_type, ''), 'Other')
  end,
  image_urls = case
    when image_urls = '[]'::jsonb then images
    else image_urls
  end
where true;

drop index if exists products_inventory_number_idx;
create unique index if not exists products_inventory_number_unique_idx
  on public.products (inventory_number)
  where inventory_number is not null;
create index if not exists products_metal_variant_idx on public.products (metal_variant);
create index if not exists products_brand_idx on public.products (brand);
create index if not exists products_item_year_idx on public.products (item_year);
create index if not exists products_product_type_idx on public.products (product_type);
create index if not exists products_metal_type_idx on public.products (metal_type);
create index if not exists products_jewelry_type_idx on public.products (jewelry_type);
create index if not exists products_sku_idx on public.products (sku);
create index if not exists products_slug_idx on public.products (slug);
create index if not exists products_location_idx on public.products (location);
create index if not exists products_featured_idx on public.products (featured);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  user_id uuid references auth.users (id) on delete set null,
  customer_name text,
  customer_email text,
  customer_phone text,
  subtotal numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  shipping_fee numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  payment_status text not null default 'unpaid',
  fulfillment_status text not null default 'pending',
  order_status text not null default 'open',
  payment_method text,
  payment_reference text,
  shipping_method text not null default 'pickup',
  shipping_carrier text,
  tracking_number text,
  shipping_address jsonb,
  billing_address jsonb,
  internal_notes text,
  customer_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id text references public.products (id) on delete set null,
  inventory_number text,
  title_snapshot text not null,
  item_year_snapshot smallint,
  metal_snapshot text,
  purity_snapshot text,
  gram_weight_snapshot numeric(8,2),
  price_snapshot numeric(12,2) not null default 0,
  quantity integer not null default 1,
  image_snapshot text,
  created_at timestamptz not null default now()
);

alter table public.order_items
  add column if not exists item_year_snapshot smallint;

-- Per-line purchase quantity (units of this listing bought on this order).
-- price_snapshot is the UNIT price; the line total is price_snapshot * quantity.
alter table public.order_items
  add column if not exists quantity integer not null default 1;

-- Preserve the final storefront price after a product is sold. Checkout writes
-- the order snapshot before changing product status, so this trigger can copy
-- the authoritative unit price without relying on a live metal quote in SQL.
create or replace function public.apply_product_sold_price_lock()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if lower(coalesce(new.status, '')) = 'available' then
    new.sold_price := null;
    return new;
  end if;

  if lower(coalesce(new.status, '')) = 'sold'
     and new.sold_price is null
     and (tg_op = 'INSERT' or lower(coalesce(old.status, '')) <> 'sold') then
    select oi.price_snapshot
      into new.sold_price
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
     where oi.product_id = new.id
       and o.payment_status = 'paid'
     order by oi.created_at desc
     limit 1;
  end if;

  return new;
end;
$$;

drop trigger if exists products_sold_price_lock on public.products;
create trigger products_sold_price_lock
  before insert or update of status, sold_price on public.products
  for each row execute function public.apply_product_sold_price_lock();

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  order_id uuid references public.orders (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  customer_name text,
  customer_email text,
  business_name text not null default 'Naples Estate Jewelry',
  business_contact text not null default '(239) 404-8505',
  invoice_date date not null default current_date,
  due_date date,
  subtotal numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  shipping_fee numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  status text not null default 'draft',
  invoice_pdf_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.saved_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id text not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

alter table public.inquiries
  add column if not exists user_id uuid references auth.users (id) on delete set null,
  add column if not exists inquiry_type text not null default 'general',
  add column if not exists product_id text references public.products (id) on delete set null,
  add column if not exists item_description text,
  add column if not exists uploaded_image_urls jsonb not null default '[]'::jsonb,
  add column if not exists estimated_offer numeric(12,2),
  add column if not exists internal_notes text;

alter table public.profiles
  add column if not exists account_type text not null default 'customer',
  add column if not exists internal_notes text;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

drop trigger if exists invoices_updated_at on public.invoices;
create trigger invoices_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.invoices enable row level security;
alter table public.saved_items enable row level security;

drop policy if exists "Users read own orders" on public.orders;
create policy "Users read own orders"
  on public.orders for select
  using (auth.uid() = user_id or public.is_admin_user(auth.uid()));

drop policy if exists "Admins manage orders" on public.orders;
create policy "Admins manage orders"
  on public.orders for all
  using (public.is_admin_user(auth.uid()))
  with check (public.is_admin_user(auth.uid()));

drop policy if exists "Users read own order items" on public.order_items;
create policy "Users read own order items"
  on public.order_items for select
  using (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
        and (orders.user_id = auth.uid() or public.is_admin_user(auth.uid()))
    )
  );

drop policy if exists "Admins manage order items" on public.order_items;
create policy "Admins manage order items"
  on public.order_items for all
  using (public.is_admin_user(auth.uid()))
  with check (public.is_admin_user(auth.uid()));

drop policy if exists "Users read own invoices" on public.invoices;
create policy "Users read own invoices"
  on public.invoices for select
  using (auth.uid() = user_id or public.is_admin_user(auth.uid()));

drop policy if exists "Admins manage invoices" on public.invoices;
create policy "Admins manage invoices"
  on public.invoices for all
  using (public.is_admin_user(auth.uid()))
  with check (public.is_admin_user(auth.uid()));

drop policy if exists "Users manage own saved items" on public.saved_items;
create policy "Users manage own saved items"
  on public.saved_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Admins read saved items" on public.saved_items;
create policy "Admins read saved items"
  on public.saved_items for select
  using (public.is_admin_user(auth.uid()));

grant select, insert, update, delete on public.orders to authenticated;
grant select, insert, update, delete on public.order_items to authenticated;
grant select, insert, update, delete on public.invoices to authenticated;
grant select, insert, update, delete on public.saved_items to authenticated;
