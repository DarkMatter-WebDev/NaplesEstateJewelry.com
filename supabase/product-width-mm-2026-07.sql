-- Naples Estate Jewelry - optional necklace/bracelet width in millimeters.
-- Safe to re-run. Run in the Supabase SQL Editor before entering width values.

alter table public.products
  add column if not exists width_mm numeric(8,2);

alter table public.products drop constraint if exists products_width_mm_check;
alter table public.products add constraint products_width_mm_check
  check (width_mm is null or (width_mm > 0 and width_mm <= 1000)) not valid;

-- Product reads use column-level grants for both anonymous and signed-in buyers.
grant select (width_mm) on public.products to anon, authenticated;

comment on column public.products.width_mm is
  'Physical necklace or bracelet width in millimeters; null for other products or when unknown.';

select
  column_name,
  data_type,
  numeric_precision,
  numeric_scale,
  has_column_privilege('anon', 'public.products', 'width_mm', 'select') as anon_can_read,
  has_column_privilege('authenticated', 'public.products', 'width_mm', 'select') as authenticated_can_read
from information_schema.columns
where table_schema = 'public'
  and table_name = 'products'
  and column_name = 'width_mm';
