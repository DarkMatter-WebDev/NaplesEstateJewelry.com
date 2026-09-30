-- Product Jewelry Type support.
-- Run in Supabase SQL Editor for existing projects.
-- Safe to re-run.

alter table public.products
  add column if not exists jewelry_type text not null default 'Necklace';

update public.products
set jewelry_type = case
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
end;

create index if not exists products_jewelry_type_idx
  on public.products (jewelry_type);
