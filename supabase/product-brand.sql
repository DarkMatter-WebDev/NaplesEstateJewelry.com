-- Product Brand support.
-- Run in Supabase SQL Editor for existing projects.
-- Safe to re-run.

alter table public.products
  add column if not exists brand text;

create index if not exists products_brand_idx
  on public.products (brand);
