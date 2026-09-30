-- Lock a product's site price when it becomes Sold, and release the lock only
-- when it returns to Available. Safe to re-run.
--
-- Run in the Supabase SQL Editor after sales-workflow.sql (order_items must
-- exist). Deploy the matching app code before or immediately after this file;
-- the app remains compatible while the column is absent.

alter table public.products
  add column if not exists sold_price numeric(12,2);

alter table public.products drop constraint if exists products_sold_price_check;
alter table public.products add constraint products_sold_price_check
  check (sold_price is null or sold_price >= 0) not valid;

-- The public storefront and signed-in customer surfaces need the locked price,
-- while the value remains writeable only through the existing admin/service
-- product policies.
grant select (sold_price) on public.products to anon, authenticated;

create or replace function public.apply_product_sold_price_lock()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Relisting is the one event that releases a prior sale-price lock.
  if lower(coalesce(new.status, '')) = 'available' then
    new.sold_price := null;
    return new;
  end if;

  -- Checkout updates only the status/quantity. On the transition to Sold,
  -- capture the authoritative order-line unit price that already exists in the
  -- same database. Admin actions may provide NEW.sold_price explicitly; keep it.
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

-- Existing real sales have immutable order snapshots, so lock those historical
-- products to their latest recorded unit sale price. Manually marked Sold rows
-- with no order snapshot are intentionally left null because no historical
-- sale price can be reconstructed honestly; their next explicit Sold action
-- will capture the current price through the app.
update public.products p
   set sold_price = (
     select oi.price_snapshot
       from public.order_items oi
       join public.orders o on o.id = oi.order_id
      where oi.product_id = p.id
        and o.payment_status = 'paid'
      order by oi.created_at desc
      limit 1
   )
 where lower(coalesce(p.status, '')) = 'sold'
   and p.sold_price is null
   and exists (
      select 1
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
     where oi.product_id = p.id
       and o.payment_status = 'paid'
   );

alter table public.products validate constraint products_sold_price_check;
