-- Naples Estate Jewelry product metal subtype support.
-- Run once in Supabase SQL Editor. Safe to re-run.

alter table public.products
  add column if not exists metal_variant text not null default 'yellow_gold';

update public.products
set metal_variant = case
  when category = 'Silver' and (metal_variant is null or metal_variant = '' or metal_variant = 'yellow_gold') then 'silver'
  when category = 'Gold' and (metal_variant is null or metal_variant = '') then 'yellow_gold'
  else metal_variant
end
where true;

alter table public.products
  drop constraint if exists products_metal_variant_check;

alter table public.products
  add constraint products_metal_variant_check
  check (
    metal_variant in (
      'yellow_gold',
      'white_gold',
      'rose_gold',
      'tricolor_gold',
      'bicolor_gold',
      'silver',
      'vermeil',
      'platinum'
    )
  );

create index if not exists products_metal_variant_idx
  on public.products (metal_variant);
