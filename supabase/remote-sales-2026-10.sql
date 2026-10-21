-- Naples Estate Jewelry - Instant Sale -> Remote sale (2026-10-21).
-- Safe to re-run. Run ALL of it in the Supabase SQL Editor. Order does not
-- matter for the rest of the site: until it runs, only "Email invoice" and
-- "Save draft" on the Remote sale page fail and the open-invoices / drafts
-- lists are empty. The In-store sale and every other page work as before.
-- (Section 2, drafts, was added the same day after section 1 had been run:
-- running the whole file again is the way to add it.)
--
-- How it works (owner, mockup v2, 2026-10-21):
--   * "Email invoice" creates a normal UNPAID order (orders + order_items, the
--     same create_paypal_order RPC the checkout uses) and ONE row here.
--   * The row holds the invoice's private pay link, how long it works, the ways
--     to pay that were ticked, and the owner's message.
--   * Paid online: the customer's PayPal payment goes through the normal capture
--     route (the order is matched by its paypal_order_id) - nothing here changes.
--   * Paid by Zelle / check: the admin's "Record payment" marks the order paid.
--   * Nothing is reserved: listed items stay for sale until someone pays.
--
-- The pay token is kept as written (not hashed, unlike a counter-offer's) so the
-- admin can "Copy pay link" at any time. It only opens a page to pay that one
-- invoice. The table is private: no anon / authenticated access, ever.

-- 1. Invoices -------------------------------------------------------------------
create table if not exists public.remote_sale_invoices (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null unique references public.orders(id) on delete cascade,
  pay_token         text not null unique check (length(pay_token) >= 32),
  expires_at        timestamptz not null,
  link_days         smallint not null default 7 check (link_days in (3, 7, 14)),
  pay_online        boolean not null default true,
  pay_zelle         boolean not null default false,
  pay_check         boolean not null default false,
  pay_phone         boolean not null default false,
  message           text check (message is null or length(message) <= 300),
  sent_count        integer not null default 1,
  last_sent_at      timestamptz,
  cancelled_at      timestamptz,
  created_by        uuid,
  created_by_email  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists remote_sale_invoices_open_idx
  on public.remote_sale_invoices (created_at desc)
  where cancelled_at is null;

alter table public.remote_sale_invoices enable row level security;
revoke all on public.remote_sale_invoices from anon, authenticated;
grant select, insert, update, delete on public.remote_sale_invoices to service_role;

create or replace function public.remote_sale_invoices_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists remote_sale_invoices_touch_updated_at on public.remote_sale_invoices;
create trigger remote_sale_invoices_touch_updated_at
  before update on public.remote_sale_invoices
  for each row execute function public.remote_sale_invoices_touch_updated_at();

comment on table public.remote_sale_invoices is
  'Instant Sale -> Remote sale: one emailed invoice per unpaid order - its private pay link (/pay/<token>), expiry, the ways to pay offered and the owner''s message. Private (service role only).';

-- 2. Drafts (added 2026-10-21, the owner's "add save draft"): "Save draft" on
-- the Remote sale form keeps the form here - NO order is created until
-- "Email invoice", so a draft never shows in Orders. `form` is the form as
-- typed (items incl. photo URLs, customer, pickup/ship, ways to pay, message);
-- the Storage clean-up keeps the photos it names. Re-running this file after
-- section 1 already ran is fine: it only adds what is missing.
create table if not exists public.remote_sale_drafts (
  id                uuid primary key default gen_random_uuid(),
  form              jsonb not null check (jsonb_typeof(form) = 'object' and pg_column_size(form) < 65536),
  customer_name     text,
  item_count        integer not null default 0,
  created_by        uuid,
  created_by_email  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists remote_sale_drafts_updated_idx on public.remote_sale_drafts (updated_at desc);

alter table public.remote_sale_drafts enable row level security;
revoke all on public.remote_sale_drafts from anon, authenticated;
grant select, insert, update, delete on public.remote_sale_drafts to service_role;

drop trigger if exists remote_sale_drafts_touch_updated_at on public.remote_sale_drafts;
create trigger remote_sale_drafts_touch_updated_at
  before update on public.remote_sale_drafts
  for each row execute function public.remote_sale_invoices_touch_updated_at();

comment on table public.remote_sale_drafts is
  'Instant Sale -> Remote sale: "Save draft" - the form as typed, before any order exists. Private (service role only).';

-- Check: both tables, 0 rows the first time (a second run shows whatever exists).
select
  (select count(*) from public.remote_sale_invoices) as remote_sale_invoices_rows,
  (select count(*) from public.remote_sale_drafts)   as remote_sale_drafts_rows;
