-- Convert product inventory numbers from text to integer.
-- Run once in Supabase SQL Editor if products.inventory_number was created as text.
-- Non-numeric legacy values are cleared instead of blocking the migration.

drop index if exists products_inventory_number_idx;

alter table public.products
  alter column inventory_number drop default;

alter table public.products
  alter column inventory_number type integer
  using (
    case
      when inventory_number::text ~ '^[0-9]+$' then inventory_number::text::integer
      else null
    end
  );

create unique index if not exists products_inventory_number_unique_idx
  on public.products (inventory_number)
  where inventory_number is not null;
