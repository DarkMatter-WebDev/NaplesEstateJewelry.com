-- Enforce unique product inventory numbers.
--
-- Run the duplicate report first. If it returns rows, correct those products in
-- Product Admin before creating the unique index.

select
  inventory_number,
  count(*) as duplicate_count,
  array_agg(id order by sort_order, id) as product_ids,
  array_agg(title order by sort_order, id) as product_titles
from public.products
where inventory_number is not null
group by inventory_number
having count(*) > 1;

-- After the report above returns no rows, run the statements below.
drop index if exists public.products_inventory_number_idx;
drop index if exists public.products_inventory_number_unique_idx;

create unique index products_inventory_number_unique_idx
  on public.products (inventory_number)
  where inventory_number is not null;
