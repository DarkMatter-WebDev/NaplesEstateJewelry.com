-- =====================================================================
--  Recycle Bin for admin orders (soft delete).
--  Run this ENTIRE script once in the Supabase SQL Editor,
--  on project ref:  evzluixourmsefwdsieu
-- =====================================================================
--
--  Admin "Delete Order" now moves orders to a Recycle Bin by setting
--  orders.deleted_at instead of deleting the row. Restoring clears deleted_at.
--  "Delete Forever" in the bin still performs the existing hard delete, which
--  cascades order_items through the existing foreign key.
--
--  Safe to re-run (idempotent).
-- =====================================================================

alter table public.orders
  add column if not exists deleted_at timestamptz;

create index if not exists orders_active_idx
  on public.orders (created_at desc)
  where deleted_at is null;

create index if not exists orders_deleted_idx
  on public.orders (deleted_at desc)
  where deleted_at is not null;

notify pgrst, 'reload schema';

-- VERIFY -- should return the deleted_at column.
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'orders'
  and column_name = 'deleted_at';
