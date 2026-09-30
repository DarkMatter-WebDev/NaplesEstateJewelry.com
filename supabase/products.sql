-- Naples Estate Jewelry — Products table setup.
-- Run once in Supabase SQL Editor (safe to re-run: uses IF NOT EXISTS / OR REPLACE).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Products table ────────────────────────────────────────────────────────

create table if not exists public.products (
  id                   text        primary key,
  category             text        not null default 'Gold',
  metal_type           text,
  metal_variant        text        not null default 'yellow_gold',
  title                text        not null,
  title_es             text,
  price_label          text,
  manual_price_label   text,
  price_mode           text        not null default 'spot-multiplier',
  purity               integer,
  weight_grams         numeric(8,2),
  inventory_number     integer,
  sku                  text,
  slug                 text,
  metal                text,
  gram_weight          numeric(8,2),
  stone_details        text,
  brand                text,
  product_type         text,
  jewelry_type         text        not null default 'Necklace',
  chain_type           text,
  length               text,
  width_mm              numeric(8,2),
  pricing_multiplier   numeric(5,3),
  sold_price           numeric(12,2),
  status               text        not null default 'available',
  location             text        not null default 'showcase',
  images               jsonb       not null default '[]',
  image_urls           jsonb       not null default '[]',
  image_padding        text        not null default 'none',
  image_padding_by_image jsonb     not null default '{}'::jsonb,
  description          text,
  description_es       text,
  details              jsonb       not null default '[]',
  details_es           jsonb       not null default '[]',
  tags                 jsonb       not null default '[]',
  tags_es              jsonb       not null default '[]',
  private_price_label  text,
  gender               text        not null default 'Unisex',
  item_year            smallint,
  cost_basis           numeric(12,2),
  melt_value           numeric(12,2),
  asking_price         numeric(12,2),
  minimum_price        numeric(12,2),
  live_spot_snapshot   jsonb,
  acquisition_date     date,
  acquisition_source   text,
  internal_notes       text,
  public_notes         text,
  public_notes_es      text,
  featured             boolean     not null default false,
  show_spot_price      boolean     not null default true,
  special_price_override_enabled boolean not null default false,
  special_price_override_amount  numeric(12,2),
  special_price_override_mode    text    not null default 'amount',
  special_price_override_percent numeric(6,2),
  quantity             integer     not null default 1,
  sort_order           integer     not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ── 1b. Add columns introduced after initial deploy ─────────────────────────
-- Safe to re-run: IF NOT EXISTS prevents errors on fresh installs.
alter table public.products
  add column if not exists gender text not null default 'Unisex',
  add column if not exists item_year smallint,
  add column if not exists metal_type text,
  add column if not exists metal_variant text not null default 'yellow_gold',
  add column if not exists inventory_number integer,
  add column if not exists sku text,
  add column if not exists slug text,
  add column if not exists metal text,
  add column if not exists gram_weight numeric(8,2),
  add column if not exists stone_details text,
  add column if not exists brand text,
  add column if not exists product_type text,
  add column if not exists jewelry_type text not null default 'Necklace',
  add column if not exists chain_type text,
  add column if not exists length text,
  add column if not exists width_mm numeric(8,2),
  add column if not exists image_urls jsonb not null default '[]'::jsonb,
  add column if not exists image_padding text not null default 'none',
  add column if not exists image_padding_by_image jsonb not null default '{}'::jsonb,
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
  add column if not exists public_notes_es text,
  add column if not exists featured boolean not null default false,
  add column if not exists show_spot_price boolean not null default true,
  add column if not exists special_price_override_enabled boolean not null default false,
  add column if not exists special_price_override_amount numeric(12,2),
  add column if not exists special_price_override_mode text not null default 'amount',
  add column if not exists special_price_override_percent numeric(6,2),
  add column if not exists sold_price numeric(12,2),
  add column if not exists quantity integer not null default 1;

alter table public.products drop constraint if exists products_sold_price_check;
alter table public.products add constraint products_sold_price_check
      check (sold_price is null or sold_price >= 0) not valid;

alter table public.products drop constraint if exists products_quantity_check;
alter table public.products add constraint products_quantity_check
      check (quantity >= 0) not valid;

alter table public.products drop constraint if exists products_width_mm_check;
alter table public.products add constraint products_width_mm_check
      check (width_mm is null or (width_mm > 0 and width_mm <= 1000)) not valid;

alter table public.products drop constraint if exists products_special_price_override_mode_check;
alter table public.products add constraint products_special_price_override_mode_check
      check (special_price_override_mode in ('amount', 'percent')) not valid;

alter table public.products drop constraint if exists products_special_price_override_percent_check;
alter table public.products add constraint products_special_price_override_percent_check
      check (special_price_override_percent is null or special_price_override_percent >= 0) not valid;

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

-- ── 2. Auto-update updated_at ────────────────────────────────────────────────

-- set_updated_at() is already defined in schema.sql; reuse it here.
drop trigger if exists products_updated_at on public.products;
create trigger products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ── 3. Useful indexes ────────────────────────────────────────────────────────

create index if not exists products_status_idx    on public.products (status);
create index if not exists products_category_idx  on public.products (category);
create index if not exists products_metal_type_idx on public.products (metal_type);
create index if not exists products_metal_variant_idx on public.products (metal_variant);
create index if not exists products_brand_idx    on public.products (brand);
create index if not exists products_item_year_idx on public.products (item_year);
create index if not exists products_product_type_idx on public.products (product_type);
create index if not exists products_jewelry_type_idx on public.products (jewelry_type);
create index if not exists products_sort_idx      on public.products (sort_order);
drop index if exists products_inventory_number_idx;
create unique index if not exists products_inventory_number_unique_idx
  on public.products (inventory_number)
  where inventory_number is not null;
create index if not exists products_sku_idx       on public.products (sku);
create index if not exists products_slug_idx      on public.products (slug);
create index if not exists products_location_idx  on public.products (location);
create index if not exists products_featured_idx  on public.products (featured);

-- ── 4. Row Level Security ────────────────────────────────────────────────────

alter table public.products enable row level security;

-- Anyone (including anonymous visitors) can read the full catalogue.
drop policy if exists "Anyone can read products" on public.products;
create policy "Anyone can read products"
  on public.products for select
  using (true);

-- Only admins can insert new products.
drop policy if exists "Admins can insert products" on public.products;
create policy "Admins can insert products"
  on public.products for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

-- Only admins can update products.
-- Both USING (row filter) and WITH CHECK (new-row filter) are set so that
-- the admin can also SELECT the row after the update without PGRST116 errors.
drop policy if exists "Admins can update products" on public.products;
create policy "Admins can update products"
  on public.products for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

-- Only admins can delete products.
drop policy if exists "Admins can delete products" on public.products;
create policy "Admins can delete products"
  on public.products for delete
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

-- ── 5. Table grants ──────────────────────────────────────────────────────────

-- Public catalogue roles can read only customer-facing columns. Admin catalogue
-- reads use the server-side service client; authenticated browser sessions must
-- never expose acquisition cost, minimum price, or internal notes.
revoke select on public.products from anon, authenticated;

do $$
declare public_columns text;
begin
  select string_agg(quote_ident(column_name), ', ')
    into public_columns
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'products'
     and column_name not in (
       'cost_basis', 'minimum_price', 'acquisition_date', 'acquisition_source',
       'internal_notes', 'private_price_label', 'live_spot_snapshot'
     );

  execute format('grant select (%s) on public.products to anon, authenticated', public_columns);
end $$;

-- RLS still limits these writes to admins.
grant insert, update, delete on public.products to authenticated;

-- ── 6. Storage bucket: product-images ───────────────────────────────────────
-- Create this once via the Supabase dashboard (Storage → New bucket):
--   Name:   product-images
--   Public: true
--
-- Then add the following storage policies in the dashboard or paste into
-- the SQL editor:

-- Allow anyone to read uploaded images (public bucket).
drop policy if exists "Public read product images" on storage.objects;
create policy "Public read product images"
  on storage.objects for select
  using (bucket_id = 'product-images');

-- Only admins may upload images.
drop policy if exists "Admins upload product images" on storage.objects;
create policy "Admins upload product images"
  on storage.objects for insert
  with check (
    bucket_id = 'product-images'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

-- Only admins may delete images.
drop policy if exists "Admins delete product images" on storage.objects;
create policy "Admins delete product images"
  on storage.objects for delete
  using (
    bucket_id = 'product-images'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );
