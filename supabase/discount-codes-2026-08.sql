-- Discount codes: admin-managed percentage or fixed-dollar codes a buyer can
-- redeem at checkout.
--
-- Run this AFTER checkout-quantity-2026-07.sql (the current definition of
-- create_paypal_order / capture_paypal_order, both restated below). Safe to
-- re-run.
--
-- ⚠️ THIS MUST BE RUN IN SUPABASE BEFORE THE APPLICATION CODE DEPLOYS. The
-- checkout code reads public.discount_codes; without this table a discount
-- lookup errors and checkout breaks.
--
-- What this migration does:
--   1. Creates public.discount_codes (one row per redeemable code).
--   2. Creates public.discount_code_redemptions (audit trail + the per-email
--      reuse check).
--   3. Adds the discount snapshot columns to public.orders.
--   4. Rewrites create_paypal_order to persist the discount snapshot.
--   5. Rewrites capture_paypal_order to redeem the code ATOMICALLY, inside the
--      same transaction that already locks the product rows.
--
-- Design notes that matter if this is ever edited:
--   * ONE table with (discount_type, discount_value) rather than separate
--     nullable percent/amount columns, so "both set" and "neither set" are
--     unrepresentable rather than something the UI has to prevent.
--   * The code is stored UPPERCASE and matched uppercase, so `thankyou` and
--     `THANKYOU` are the same code and cannot both be created.
--   * Redemption is a conditional UPDATE, never read-then-write. Zero rows
--     affected IS the "limit reached" signal. A read-check followed by an
--     increment is a TOCTOU race that lets concurrent captures both pass.

-- ---------------------------------------------------------------------------
-- 1. discount_codes
-- ---------------------------------------------------------------------------
create table if not exists public.discount_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  discount_type text not null,
  discount_value numeric(12,2) not null,
  -- Optional guard rail. Most useful for fixed-dollar codes, which do not
  -- self-scale the way a percentage does ($100 off is $100 off a $120 ring).
  min_order_subtotal numeric(12,2),
  expires_at timestamptz,
  -- null = unlimited until deactivated. A number is a HARD ceiling enforced by
  -- the conditional update in capture_paypal_order.
  max_redemptions integer,
  times_used integer not null default 0,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Case-insensitive uniqueness: the code is normalized to uppercase on write,
-- so a plain unique index on the stored value is sufficient and lets the
-- lookup use the index.
create unique index if not exists discount_codes_code_key
  on public.discount_codes (code);

alter table public.discount_codes drop constraint if exists discount_codes_type_check;
alter table public.discount_codes add constraint discount_codes_type_check
      check (discount_type in ('percent', 'fixed'));

-- The value's valid range depends on the type. A percent is 1-100; a fixed
-- amount is any positive dollar value.
alter table public.discount_codes drop constraint if exists discount_codes_value_check;
alter table public.discount_codes add constraint discount_codes_value_check
      check (
        (discount_type = 'percent' and discount_value >= 1 and discount_value <= 100)
        or (discount_type = 'fixed' and discount_value > 0)
      );

alter table public.discount_codes drop constraint if exists discount_codes_min_order_check;
alter table public.discount_codes add constraint discount_codes_min_order_check
      check (min_order_subtotal is null or min_order_subtotal >= 0);

alter table public.discount_codes drop constraint if exists discount_codes_max_redemptions_check;
alter table public.discount_codes add constraint discount_codes_max_redemptions_check
      check (max_redemptions is null or max_redemptions >= 1);

alter table public.discount_codes drop constraint if exists discount_codes_times_used_check;
alter table public.discount_codes add constraint discount_codes_times_used_check
      check (times_used >= 0);

-- ---------------------------------------------------------------------------
-- 2. discount_code_redemptions
--
-- One row per successful redemption. Two jobs: an audit trail the admin can
-- read, and the lookup behind the per-email limit. Note that the per-email
-- check is a SPEED BUMP, not a guarantee — with guest checkout the only
-- identity available is the email the buyer typed, so a second email defeats
-- it. The hard control is max_redemptions above.
-- ---------------------------------------------------------------------------
create table if not exists public.discount_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  discount_code_id uuid not null references public.discount_codes (id) on delete cascade,
  order_id uuid references public.orders (id) on delete set null,
  -- Stored lowercased/trimmed by the application so the comparison is stable.
  customer_email text,
  discount_amount numeric(12,2) not null default 0,
  redeemed_at timestamptz not null default now()
);

create index if not exists discount_code_redemptions_code_idx
  on public.discount_code_redemptions (discount_code_id);
create index if not exists discount_code_redemptions_email_idx
  on public.discount_code_redemptions (discount_code_id, customer_email);
create index if not exists discount_code_redemptions_order_idx
  on public.discount_code_redemptions (order_id);

-- ---------------------------------------------------------------------------
-- 3. orders discount snapshot
--
-- orders.discount (the resolved dollar amount) already exists from
-- sales-workflow.sql and needs no change. These three record WHICH code was
-- used and on what terms, so a historical order still reads correctly after
-- the code is edited or deleted.
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists discount_code text,
  add column if not exists discount_type text,
  add column if not exists discount_value numeric(12,2);

-- ---------------------------------------------------------------------------
-- 4. RLS — admin-only. The storefront never reads this table directly; code
-- validation and redemption both run server-side through the service role.
-- ---------------------------------------------------------------------------
alter table public.discount_codes enable row level security;
alter table public.discount_code_redemptions enable row level security;

drop policy if exists "Admins manage discount codes" on public.discount_codes;
create policy "Admins manage discount codes" on public.discount_codes
  for all
  using (public.is_admin_user(auth.uid()))
  with check (public.is_admin_user(auth.uid()));

drop policy if exists "Admins read discount redemptions" on public.discount_code_redemptions;
create policy "Admins read discount redemptions" on public.discount_code_redemptions
  for select
  using (public.is_admin_user(auth.uid()));

-- ⚠️ RLS POLICIES ALONE ARE NOT ENOUGH. Postgres checks table-level GRANTS
-- BEFORE it ever consults RLS, so `authenticated` needs the base write grant
-- too — the admin-only policy above is what actually narrows it to admins.
-- (Same note as `buyers-2026-07.sql`; the admin API calls run through
-- requireAdmin()'s REQUEST-SCOPED client, which is the `authenticated` role,
-- not the service role.)
--
-- Fixed 2026-08-13: this originally granted only SELECT, which let the admin
-- page LOAD while every create/edit/delete failed with
-- "permission denied for table discount_codes". Reads worked, so the page
-- looked healthy — which is exactly why it survived to production.
--
-- `anon` gets nothing: a shopper must never enumerate codes. Code validation at
-- checkout goes through the server route on the service client.
revoke all on public.discount_codes from anon, authenticated;
revoke all on public.discount_code_redemptions from anon, authenticated;
grant select, insert, update, delete on public.discount_codes to authenticated;
-- Redemptions are written by capture_paypal_order (service role) and only READ
-- by admin; the cascade from discount_codes handles their removal.
grant select on public.discount_code_redemptions to authenticated;
grant all on public.discount_codes to service_role;
grant all on public.discount_code_redemptions to service_role;

-- ---------------------------------------------------------------------------
-- 5. create_paypal_order: persist the discount snapshot.
--
-- Identical to checkout-quantity-2026-07.sql except for the three new columns
-- in the orders insert. Same signature, so `create or replace` is sufficient.
-- ---------------------------------------------------------------------------
create or replace function public.create_paypal_order(
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
  unavailable_titles text;
begin
  if jsonb_typeof(items_payload) <> 'array' or jsonb_array_length(items_payload) = 0 then
    raise exception 'Order must include at least one item.';
  end if;

  -- Snapshot availability + stock check (no lock — concurrent buyers are allowed
  -- through; the capture RPC serializes the final sale with row-level locking).
  select string_agg(p.title, ', ')
  into unavailable_titles
  from jsonb_array_elements(items_payload) as elem
  join public.products p on p.id = elem->>'product_id'
  where lower(replace(coalesce(p.status, ''), ' ', '_')) <> 'available'
     or coalesce(p.quantity, 1) < coalesce(nullif(elem->>'quantity', '')::int, 1);

  if unavailable_titles is not null then
    raise exception 'One or more items are no longer available: %', unavailable_titles
      using errcode = 'P0001';
  end if;

  insert into public.orders (
    order_number, user_id, customer_name, customer_email, customer_phone,
    subtotal, tax, shipping_fee, discount, total,
    discount_code, discount_type, discount_value,
    payment_status, fulfillment_status, order_status,
    payment_method, shipping_method, shipping_address, billing_address,
    internal_notes, customer_notes
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
    nullif(order_payload->>'discount_code', ''),
    nullif(order_payload->>'discount_type', ''),
    nullif(order_payload->>'discount_value', '')::numeric,
    'unpaid',
    'pending',
    'open',
    coalesce(order_payload->>'payment_method', 'paypal'),
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
      order_id, product_id, inventory_number, title_snapshot, item_year_snapshot,
      metal_snapshot, purity_snapshot, gram_weight_snapshot, price_snapshot,
      quantity, image_snapshot
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
      greatest(coalesce(nullif(item->>'quantity', '')::int, 1), 1),
      item->>'image_snapshot'
    );
  end loop;

  -- Products intentionally NOT reserved — they stay 'available'.

  return query select inserted_order_id, inserted_order_number;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. capture_paypal_order: redeem the discount code atomically.
--
-- Identical to checkout-quantity-2026-07.sql except for the redemption block
-- in the success path. Same return signature.
--
-- WHY THE REDEMPTION LIVES HERE and not in the validation route: this function
-- already runs inside the transaction that row-locks products to resolve the
-- two-buyer race. Redeeming anywhere earlier means the count can be incremented
-- for an order that is never paid, and checking-then-incrementing in the
-- application lets two concurrent captures both pass the check.
--
-- An exhausted code does NOT fail the capture. The money is already taken at
-- this point; refusing here would leave a paid order in an unrecoverable state.
-- The order is flagged for admin review instead — the same treatment the
-- inventory race already gets.
-- ---------------------------------------------------------------------------
create or replace function public.capture_paypal_order(
  p_order_id uuid,
  p_capture_id text,
  p_payment_response jsonb
)
returns table(order_id uuid, order_number text, already_paid boolean, item_conflict boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing record;
  conflicted_titles text;
  order_row record;
  redeemed_code_id uuid;
begin
  -- Lock the order row first.
  select id, orders.order_number, payment_status
  into existing
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order % not found.', p_order_id using errcode = 'P0002';
  end if;

  if existing.payment_status in ('paid', 'partially_refunded', 'refunded') then
    return query select existing.id, existing.order_number, true, false;
    return;
  end if;

  -- Lock the product rows to prevent two concurrent captures from overselling
  -- the same item. The second caller blocks here until the first commits.
  perform 1
    from public.products p
    join public.order_items oi on oi.product_id = p.id
   where oi.order_id = p_order_id and oi.product_id is not null
   order by p.id
   for update;

  -- After acquiring locks, check whether any line can no longer be fully
  -- fulfilled.
  select string_agg(p.title, ', ')
  into conflicted_titles
  from public.products p
  join public.order_items oi on oi.product_id = p.id
  where oi.order_id = p_order_id
    and oi.product_id is not null
    and (
      lower(replace(coalesce(p.status, ''), ' ', '_')) <> 'available'
      or coalesce(p.quantity, 1) < coalesce(oi.quantity, 1)
    );

  if conflicted_titles is not null then
    update public.orders
    set payment_status  = 'failed',
        payment_reference = p_capture_id,
        paypal_capture_id = p_capture_id,
        internal_notes  = coalesce(internal_notes || ' | ', '') ||
                          'Payment captured but item(s) no longer in sufficient stock: ' ||
                          conflicted_titles || '. PayPal refund required.',
        payment_response = p_payment_response,
        paid_at = coalesce(paid_at, now())
    where id = p_order_id;

    return query select existing.id, existing.order_number, false, true;
    return;
  end if;

  -- Clear — mark the order paid.
  update public.orders
  set payment_status    = 'paid',
      order_status      = 'completed',
      payment_method    = 'paypal',
      payment_reference = p_capture_id,
      paypal_capture_id = p_capture_id,
      payment_response  = p_payment_response,
      paid_at           = now(),
      reserved_until    = null
  where id = p_order_id;

  -- Decrement stock per line, flipping a product to 'sold' only when its
  -- remaining quantity reaches 0.
  update public.products p
  set quantity          = greatest(coalesce(p.quantity, 1) - coalesce(oi.quantity, 1), 0),
      status            = case
                            when coalesce(p.quantity, 1) - coalesce(oi.quantity, 1) <= 0 then 'sold'
                            else p.status
                          end,
      sold_price        = case
                            when coalesce(p.quantity, 1) - coalesce(oi.quantity, 1) <= 0 then oi.price_snapshot
                            else p.sold_price
                          end,
      reserved_until    = null,
      reserved_order_id = null
  from public.order_items oi
  where oi.order_id = p_order_id
    and oi.product_id is not null
    and oi.product_id = p.id;

  -- ---- Discount redemption (atomic).
  select discount_code, discount, customer_email
  into order_row
  from public.orders
  where id = p_order_id;

  if order_row.discount_code is not null and coalesce(order_row.discount, 0) > 0 then
    -- Conditional increment. If the cap is already reached, zero rows are
    -- updated and redeemed_code_id stays null — we do NOT fail the capture.
    update public.discount_codes
    set times_used = times_used + 1,
        updated_at = now()
    where code = upper(order_row.discount_code)
      and (max_redemptions is null or times_used < max_redemptions)
    returning id into redeemed_code_id;

    if redeemed_code_id is not null then
      insert into public.discount_code_redemptions (
        discount_code_id, order_id, customer_email, discount_amount
      )
      values (
        redeemed_code_id,
        p_order_id,
        lower(trim(coalesce(order_row.customer_email, ''))),
        order_row.discount
      );
    else
      -- The code ran out between checkout and capture (or was deleted). The
      -- buyer already paid the discounted amount, so the discount stands; the
      -- owner is told so the overage is visible rather than silent.
      update public.orders
      set internal_notes = coalesce(internal_notes || ' | ', '') ||
                           'Discount code ' || order_row.discount_code ||
                           ' was applied but could not be redeemed (inactive, deleted, or redemption limit reached). ' ||
                           'The discount was honored on this order.'
      where id = p_order_id;
    end if;
  end if;

  return query select existing.id, existing.order_number, false, false;
end;
$$;

revoke execute on function public.create_paypal_order(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.capture_paypal_order(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_paypal_order(jsonb, jsonb) to service_role;
grant execute on function public.capture_paypal_order(uuid, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 7. updated_at maintenance
-- ---------------------------------------------------------------------------
drop trigger if exists discount_codes_set_updated_at on public.discount_codes;
create trigger discount_codes_set_updated_at
  before update on public.discount_codes
  for each row execute function public.set_updated_at();
