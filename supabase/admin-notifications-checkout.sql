-- Admin notifications/messages and secure public checkout order creation.
-- Run in Supabase SQL Editor after sales-workflow.sql.

create extension if not exists "pgcrypto";

create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'order',
  title text not null,
  body text,
  order_id uuid references public.orders (id) on delete set null,
  customer_name text,
  customer_email text,
  image_urls jsonb not null default '[]'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- Customer-attached photos for message-center notifications (added after initial
-- deploy). Stores Storage URL strings only; see admin-notifications-image-urls.sql.
alter table public.admin_notifications
  add column if not exists image_urls jsonb not null default '[]'::jsonb;

create index if not exists admin_notifications_created_idx
  on public.admin_notifications (created_at desc);

create index if not exists admin_notifications_unread_idx
  on public.admin_notifications (is_read, created_at desc);

alter table public.order_items
  add column if not exists item_year_snapshot smallint;

alter table public.admin_notifications enable row level security;

drop policy if exists "Admins read notifications" on public.admin_notifications;
create policy "Admins read notifications"
  on public.admin_notifications for select
  using (public.is_admin_user(auth.uid()));

drop policy if exists "Admins update notifications" on public.admin_notifications;
create policy "Admins update notifications"
  on public.admin_notifications for update
  using (public.is_admin_user(auth.uid()))
  with check (public.is_admin_user(auth.uid()));

grant select, update on public.admin_notifications to authenticated;

create or replace function public.create_checkout_order(
  order_payload jsonb,
  items_payload jsonb
)
returns table(order_id uuid, order_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_order_id uuid;
  inserted_order_number text;
  item jsonb;
  product_ids text[];
begin
  if jsonb_typeof(items_payload) <> 'array' or jsonb_array_length(items_payload) = 0 then
    raise exception 'Order must include at least one item.';
  end if;

  select array_agg(value->>'product_id')
  into product_ids
  from jsonb_array_elements(items_payload)
  where value->>'product_id' is not null;

  if exists (
    select 1
    from public.products p
    where p.id = any(product_ids)
      and lower(replace(p.status, ' ', '_')) <> 'available'
  ) then
    raise exception 'One or more products are no longer available.';
  end if;

  insert into public.orders (
    order_number,
    user_id,
    customer_name,
    customer_email,
    customer_phone,
    subtotal,
    tax,
    shipping_fee,
    discount,
    total,
    payment_status,
    fulfillment_status,
    order_status,
    payment_method,
    shipping_method,
    shipping_address,
    billing_address,
    internal_notes,
    customer_notes
  )
  values (
    order_payload->>'order_number',
    nullif(order_payload->>'user_id', '')::uuid,
    order_payload->>'customer_name',
    order_payload->>'customer_email',
    order_payload->>'customer_phone',
    coalesce((order_payload->>'subtotal')::numeric, 0),
    coalesce((order_payload->>'tax')::numeric, 0),
    coalesce((order_payload->>'shipping_fee')::numeric, 0),
    coalesce((order_payload->>'discount')::numeric, 0),
    coalesce((order_payload->>'total')::numeric, 0),
    coalesce(order_payload->>'payment_status', 'unpaid'),
    coalesce(order_payload->>'fulfillment_status', 'pending'),
    coalesce(order_payload->>'order_status', 'open'),
    order_payload->>'payment_method',
    coalesce(order_payload->>'shipping_method', 'pickup'),
    order_payload->'shipping_address',
    order_payload->'billing_address',
    order_payload->>'internal_notes',
    order_payload->>'customer_notes'
  )
  returning id, orders.order_number into inserted_order_id, inserted_order_number;

  for item in select * from jsonb_array_elements(items_payload)
  loop
    insert into public.order_items (
      order_id,
      product_id,
      inventory_number,
      title_snapshot,
      item_year_snapshot,
      metal_snapshot,
      purity_snapshot,
      gram_weight_snapshot,
      price_snapshot,
      image_snapshot
    )
    values (
      inserted_order_id,
      item->>'product_id',
      item->>'inventory_number',
      item->>'title_snapshot',
      nullif(item->>'item_year_snapshot', '')::smallint,
      item->>'metal_snapshot',
      item->>'purity_snapshot',
      nullif(item->>'gram_weight_snapshot', '')::numeric,
      coalesce((item->>'price_snapshot')::numeric, 0),
      item->>'image_snapshot'
    );
  end loop;

  update public.products
  set status = 'pending_payment'
  where id = any(product_ids);

  insert into public.admin_notifications (
    type,
    title,
    body,
    order_id,
    customer_name,
    customer_email
  )
  values (
    'order',
    'New checkout order ' || inserted_order_number,
    coalesce(order_payload->>'customer_name', 'Customer') || ' submitted a checkout order for ' || jsonb_array_length(items_payload)::text || ' item(s).',
    inserted_order_id,
    order_payload->>'customer_name',
    order_payload->>'customer_email'
  );

  return query select inserted_order_id, inserted_order_number;
end;
$$;

grant execute on function public.create_checkout_order(jsonb, jsonb) to anon, authenticated;
