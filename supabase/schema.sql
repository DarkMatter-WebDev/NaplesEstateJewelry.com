-- Naples Estate Jewelry customer account foundation.
-- Run in Supabase SQL Editor.
--
-- This does NOT move product listings into Supabase. Listings remain in the
-- site files and can keep being edited with AI assistance in Cursor.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text,
  last_name text,
  full_name text,
  email text,
  phone text,
  alternate_phone text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country text default 'United States',
  marketing_opt_in boolean not null default false,
  marketing_opt_out boolean not null default false,
  terms_accepted_at timestamptz,
  privacy_accepted_at timestamptz,
  policies_accepted_version text,
  interests text[] default '{}',
  budget_range text,
  is_vip boolean not null default false,
  is_admin boolean not null default false,  -- grants access to /admin panel
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_carts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

create index if not exists favorites_user_idx on public.favorites (user_id);

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists alternate_phone text,
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postal_code text,
  add column if not exists country text default 'United States',
  add column if not exists marketing_opt_in boolean not null default false,
  add column if not exists marketing_opt_out boolean not null default false,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists privacy_accepted_at timestamptz,
  add column if not exists policies_accepted_version text,
  add column if not exists is_admin boolean not null default false;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    first_name,
    last_name,
    full_name,
    email,
    phone,
    terms_accepted_at,
    privacy_accepted_at,
    policies_accepted_version
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    coalesce(new.phone, new.raw_user_meta_data->>'phone', ''),
    nullif(new.raw_user_meta_data->>'terms_accepted_at', '')::timestamptz,
    nullif(new.raw_user_meta_data->>'privacy_accepted_at', '')::timestamptz,
    nullif(new.raw_user_meta_data->>'policies_accepted_version', '')
  )
  on conflict (id) do update
  set
    terms_accepted_at = coalesce(public.profiles.terms_accepted_at, excluded.terms_accepted_at),
    privacy_accepted_at = coalesce(public.profiles.privacy_accepted_at, excluded.privacy_accepted_at),
    policies_accepted_version = coalesce(public.profiles.policies_accepted_version, excluded.policies_accepted_version);

  insert into public.customer_carts (user_id, items)
  values (new.id, '[]'::jsonb)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists customer_carts_updated_at on public.customer_carts;
create trigger customer_carts_updated_at
  before update on public.customer_carts
  for each row execute function public.set_updated_at();

create or replace function public.is_admin_user(user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = user_id
      and is_admin = true
  );
$$;

alter table public.profiles enable row level security;
alter table public.customer_carts enable row level security;
alter table public.favorites enable row level security;

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Admins read all profiles" on public.profiles;
create policy "Admins read all profiles"
  on public.profiles for select
  using (public.is_admin_user(auth.uid()));

drop policy if exists "Users insert own profile" on public.profiles;
create policy "Users insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Users manage own cart" on public.customer_carts;
create policy "Users manage own cart"
  on public.customer_carts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage own favorites" on public.favorites;
create policy "Users manage own favorites"
  on public.favorites for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Supabase RLS policies decide which rows a user can access, but the
-- authenticated role still needs table privileges.
grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.customer_carts to authenticated;
grant select, insert, update, delete on public.favorites to authenticated;
