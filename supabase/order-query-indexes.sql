-- Add indexes for common order, order item, and invoice admin/account lookups.
-- Safe to rerun.

create index if not exists orders_created_at_idx
  on public.orders (created_at desc);

create index if not exists orders_user_id_idx
  on public.orders (user_id);

create index if not exists order_items_order_id_idx
  on public.order_items (order_id);

create index if not exists order_items_product_id_idx
  on public.order_items (product_id);

create index if not exists invoices_order_id_idx
  on public.invoices (order_id);

create index if not exists invoices_user_id_idx
  on public.invoices (user_id);
