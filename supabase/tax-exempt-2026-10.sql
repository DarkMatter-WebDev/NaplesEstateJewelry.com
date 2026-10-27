-- Tax-exempt sales (2026-10-27, owner mockup v2 + "build it all"). Run in the
-- Supabase SQL editor BEFORE deploying the tax-exempt batch. Needs
-- sales-workflow.sql (orders, set_updated_at), which has run. Safe to re-run.
--
-- What this adds:
--   tax_exempt_certificates   every Florida certificate the store accepted: from
--                             an in-store sale, a Remote sale, or a website
--                             request the owner approved. The photo path, the
--                             "physical copy seen" box, who approved it, and the
--                             customer account it is saved to (if they chose).
--   tax_exempt_requests       a website buyer's upload at checkout: the AI read,
--                             the checks, the cart, and the owner's decision.
--   orders.tax_exempt*        the exemption NOTED ON THE ORDER: a flag, the
--                             certificate, and a snapshot that stays readable
--                             even if the certificate row changes later.
--   tax-certificates          a PRIVATE Storage bucket for the certificate
--                             photos / PDFs (never public, signed links only).
--
-- Trust model: everything here is read and written by the SERVICE ROLE only —
-- admin API routes, the checkout routes and the account page all go through
-- server code. So RLS is on with no policies for anon/authenticated, and the
-- service_role gets an explicit grant (lesson of 2026-09-17: a table without a
-- service_role grant answers 42501 even though service_role bypasses RLS).

-- 1. Certificates -------------------------------------------------------------
create table if not exists public.tax_exempt_certificates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 'approved' = may be used; 'revoked' = the owner withdrew it (kept for records).
  status text not null default 'approved' check (status in ('approved', 'revoked')),
  -- 'resale' = Annual Resale Certificate (DR-13); 'exemption' = Consumer's
  -- Certificate of Exemption (DR-14). Null only when a physical copy was seen
  -- and the details were not typed in.
  cert_type text check (cert_type is null or cert_type in ('resale', 'exemption')),
  business_name text,
  cert_number text,
  -- Florida accepts only Florida-issued certificates; kept as a column so the
  -- record says so explicitly.
  issuing_state text not null default 'FL',
  expires_on date,
  -- Object path inside the PRIVATE bucket tax-certificates. A path, never a URL.
  photo_path text,
  photo_mime text,
  -- The owner ticked "Customer showed me the physical certificate".
  physical_copy_seen boolean not null default false,
  -- From the Florida Department of Revenue's online verification (optional).
  fl_auth_number text,
  source text not null check (source in ('in_store', 'remote_sale', 'website')),
  request_id uuid,
  customer_name text,
  customer_email text,
  customer_phone text,
  -- Saved to this customer's account (they chose it at checkout). Null = not saved.
  user_id uuid references auth.users (id) on delete set null,
  -- Shown in Instant Sale's "Certificate on file" picker.
  saved_for_reuse boolean not null default true,
  approved_by_email text,
  approved_at timestamptz not null default now()
);

create index if not exists tax_exempt_certificates_user_idx
  on public.tax_exempt_certificates (user_id) where user_id is not null;
create index if not exists tax_exempt_certificates_created_idx
  on public.tax_exempt_certificates (created_at desc);

-- 2. Website requests ---------------------------------------------------------
create table if not exists public.tax_exempt_requests (
  id uuid primary key default gen_random_uuid(),
  -- The short number the buyer and the owner see: TX-1042.
  ref bigint generated always as identity (start with 1001),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The secret the buyer's browser holds. It only ever unlocks an exemption the
  -- owner approved, for the same email, for 24 hours.
  token text not null unique,
  status text not null default 'draft'
    check (status in ('draft', 'pending', 'approved', 'declined', 'cancelled')),
  locale text not null default 'en',
  photo_path text not null,
  photo_mime text,
  -- What the AI read, and the result of the checks (lib/tax-exempt.ts).
  ai_read jsonb,
  ai_checks jsonb,
  cert_type text,
  business_name text,
  cert_number text,
  expires_on date,
  customer_name text,
  customer_email text,
  customer_phone text,
  user_id uuid references auth.users (id) on delete set null,
  save_to_account boolean not null default false,
  -- The cart when it was sent: items, totals, shipping method and state.
  cart jsonb,
  certified_at timestamptz,
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by_email text,
  decline_reason text,
  approved_until timestamptz,
  certificate_id uuid references public.tax_exempt_certificates (id) on delete set null,
  owner_texted_at timestamptz,
  owner_emailed_at timestamptz,
  buyer_emailed_at timestamptz
);

create index if not exists tax_exempt_requests_status_idx
  on public.tax_exempt_requests (status, created_at desc);

-- 3. The exemption noted on the order -----------------------------------------
alter table public.orders add column if not exists tax_exempt boolean not null default false;
alter table public.orders add column if not exists tax_exempt_certificate_id uuid
  references public.tax_exempt_certificates (id) on delete set null;
alter table public.orders add column if not exists tax_exempt_snapshot jsonb;

create index if not exists orders_tax_exempt_idx on public.orders (created_at desc) where tax_exempt;

-- 4. RLS, grants, updated_at --------------------------------------------------
alter table public.tax_exempt_certificates enable row level security;
alter table public.tax_exempt_requests enable row level security;

revoke all on public.tax_exempt_certificates from anon, authenticated;
revoke all on public.tax_exempt_requests from anon, authenticated;
grant select, insert, update, delete on public.tax_exempt_certificates to service_role;
grant select, insert, update, delete on public.tax_exempt_requests to service_role;

do $$
declare
  seq_name text := pg_get_serial_sequence('public.tax_exempt_requests', 'ref');
begin
  if seq_name is not null then
    execute format('grant usage, select on sequence %s to service_role', seq_name);
  end if;
end $$;

drop trigger if exists tax_exempt_certificates_updated_at on public.tax_exempt_certificates;
create trigger tax_exempt_certificates_updated_at
  before update on public.tax_exempt_certificates
  for each row execute function public.set_updated_at();

drop trigger if exists tax_exempt_requests_updated_at on public.tax_exempt_requests;
create trigger tax_exempt_requests_updated_at
  before update on public.tax_exempt_requests
  for each row execute function public.set_updated_at();

-- 5. Private bucket for the certificate photos --------------------------------
-- PRIVATE, like buy-receipt-ids: a certificate carries a business's tax number.
-- Only the service role writes and reads it (signed links for the admin). The
-- Storage GC (api/admin/storage-gc) lists only product-images and never
-- touches this bucket. Photos are WebP; PDFs are kept as uploaded.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tax-certificates', 'tax-certificates', false, 6291456, array['image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 6. Verify -------------------------------------------------------------------
-- Each should return what the comment says.

-- Two rows, both true: RLS is on.
select relname, relrowsecurity from pg_class
where relname in ('tax_exempt_certificates', 'tax_exempt_requests');

-- Eight rows: DELETE, INSERT, SELECT, UPDATE for each table, grantee service_role.
select table_name, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'service_role'
  and table_name in ('tax_exempt_certificates', 'tax_exempt_requests')
order by table_name, privilege_type;

-- Zero rows: anon and authenticated have nothing.
select table_name, grantee, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
  and table_name in ('tax_exempt_certificates', 'tax_exempt_requests');

-- Three rows: the order columns.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'orders'
  and column_name in ('tax_exempt', 'tax_exempt_certificate_id', 'tax_exempt_snapshot');

-- One row, public = false.
select id, public from storage.buckets where id = 'tax-certificates';
