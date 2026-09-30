-- Marketplace sales → site "Sold" (2026-09-12).
--
-- Owner: "an item sells on Etsy → automatically mark it sold on our site,
-- which in turn ends it on eBay, and the same for eBay." The 30-minute
-- reconcile sweeps (nej-etsy-reconcile-status / nej-ebay-reconcile-status)
-- read paid orders from each marketplace and call apply_marketplace_sale()
-- for every line that names one of our products. See
-- next-app/src/lib/marketplace-sales-sweep.ts and features/etsy-sync.md /
-- features/ebay-sync.md.
--
-- Safe to re-run. Run in the Supabase SQL editor as the project owner.

-- 1. Per-channel switch + Etsy's own cursor (eBay reuses orders_cursor from ebay-sync.sql).
alter table public.etsy_connection
  add column if not exists auto_mark_sold boolean not null default true,
  add column if not exists sales_cursor timestamptz;

alter table public.ebay_connection
  add column if not exists auto_mark_sold boolean not null default true;

-- 2. One row per marketplace order line ever applied — the once-only guard.
--    A sweep re-reads a 10-minute overlap on every run, so duplicates are
--    expected and must be inert.
create table if not exists public.marketplace_sale_events (
  id                 bigserial primary key,
  channel            text        not null check (channel in ('etsy', 'ebay')),
  external_order_id  text        not null,
  external_line_id   text        not null,
  product_id         text        references public.products (id) on delete set null,
  quantity           integer     not null default 1 check (quantity > 0),
  sale_price         numeric(12,2),
  outcome            text        not null,
  detail             jsonb,
  created_at         timestamptz not null default now(),
  unique (channel, external_order_id, external_line_id)
);

alter table public.marketplace_sale_events enable row level security;
-- Service-role only (same trust model as the etsy_*/ebay_* tables): no anon
-- or authenticated policies on purpose.
revoke all on public.marketplace_sale_events from anon, authenticated;

create index if not exists marketplace_sale_events_product_idx
  on public.marketplace_sale_events (product_id, created_at desc);

-- 3. Apply one sold line to its product, exactly the way checkout does
--    (capture_paypal_order in checkout-quantity-2026-07.sql): quantity goes
--    down by what sold; the product flips to 'sold' and takes the sale price
--    only when the remaining quantity reaches 0. Never touches a product
--    that is not 'available' (already sold, draft, archived) — nothing here
--    ever un-sells.
--
--    outcome: 'duplicate'      this order line was applied before (no change)
--             'missing_product' the product row is gone
--             'not_available'  product is not 'available' — already sold by hand, or a draft
--             'decremented'    quantity reduced, still in stock
--             'sold'           quantity hit 0 → status 'sold', sold_price set
create or replace function public.apply_marketplace_sale(
  p_channel            text,
  p_external_order_id  text,
  p_external_line_id   text,
  p_product_id         text,
  p_quantity           integer,
  p_sale_price         numeric
)
returns table (outcome text, status text, quantity integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted   boolean := false;
  v_status     text;
  v_quantity   integer;
  v_remaining  integer;
  v_outcome    text;
  v_qty        integer := greatest(coalesce(p_quantity, 1), 1);
begin
  -- Once-only guard. A duplicate line must not touch the product again.
  insert into public.marketplace_sale_events (channel, external_order_id, external_line_id, product_id, quantity, sale_price, outcome)
  values (p_channel, p_external_order_id, p_external_line_id, p_product_id, v_qty, p_sale_price, 'pending')
  on conflict (channel, external_order_id, external_line_id) do nothing;
  get diagnostics v_inserted = row_count;
  if not v_inserted then
    return query
      select 'duplicate'::text, p.status::text, coalesce(p.quantity, 1)
      from public.products p where p.id = p_product_id
      union all select 'duplicate'::text, null::text, null::integer
      limit 1;
    return;
  end if;

  select p.status, coalesce(p.quantity, 1)
    into v_status, v_quantity
  from public.products p
  where p.id = p_product_id
  for update;

  if not found then
    update public.marketplace_sale_events e set outcome = 'missing_product'
      where e.channel = p_channel and e.external_order_id = p_external_order_id and e.external_line_id = p_external_line_id;
    return query select 'missing_product'::text, null::text, null::integer;
    return;
  end if;

  if lower(coalesce(v_status, '')) <> 'available' then
    update public.marketplace_sale_events e set outcome = 'not_available', detail = jsonb_build_object('status', v_status)
      where e.channel = p_channel and e.external_order_id = p_external_order_id and e.external_line_id = p_external_line_id;
    return query select 'not_available'::text, v_status, v_quantity;
    return;
  end if;

  v_remaining := greatest(v_quantity - v_qty, 0);
  v_outcome := case when v_remaining = 0 then 'sold' else 'decremented' end;

  update public.products p
  set quantity   = v_remaining,
      status     = case when v_remaining = 0 then 'sold' else p.status end,
      -- Same rule as checkout: the sale price is locked in only when the item is gone.
      sold_price = case when v_remaining = 0 and p_sale_price is not null then p_sale_price else p.sold_price end
  where p.id = p_product_id;

  update public.marketplace_sale_events e set outcome = v_outcome
    where e.channel = p_channel and e.external_order_id = p_external_order_id and e.external_line_id = p_external_line_id;

  return query select v_outcome, case when v_remaining = 0 then 'sold' else v_status end, v_remaining;
end;
$$;

revoke all on function public.apply_marketplace_sale(text, text, text, text, integer, numeric) from public;
grant execute on function public.apply_marketplace_sale(text, text, text, text, integer, numeric) to service_role;
