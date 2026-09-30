-- Naples Estate Jewelry - Product Type / Metal Type additive migration.
-- Run in Supabase SQL Editor. Safe to re-run.
--
-- This keeps existing production fields intact:
-- - category remains the Gold/Silver pricing field for now.
-- - jewelry_type remains for backward compatibility.
-- - metal_variant remains the Metal Color field.

alter table public.products
  add column if not exists brand text,
  add column if not exists product_type text,
  add column if not exists metal_type text;

update public.products
set
  product_type = coalesce(nullif(product_type, ''), nullif(jewelry_type, ''), 'Other'),
  metal_type = coalesce(nullif(metal_type, ''), nullif(category, ''), nullif(metal, ''), 'Gold')
where product_type is null
   or product_type = ''
   or metal_type is null
   or metal_type = '';

create index if not exists products_product_type_idx
  on public.products (product_type);

create index if not exists products_metal_type_idx
  on public.products (metal_type);

create index if not exists products_brand_idx
  on public.products (brand);
