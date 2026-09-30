-- Run this once in Supabase SQL Editor to upgrade existing projects.
-- Adds complete editable customer profile/contact fields used by the Next app.

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
  add column if not exists marketing_opt_in boolean not null default false;
alter table public.profiles
  add column if not exists marketing_opt_out boolean not null default false;

update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id
  and (p.email is null or p.email = '');

update public.profiles
set
  first_name = nullif(split_part(full_name, ' ', 1), ''),
  last_name = nullif(trim(substr(full_name, length(split_part(full_name, ' ', 1)) + 1)), '')
where full_name is not null
  and full_name <> ''
  and (first_name is null or first_name = '')
  and (last_name is null or last_name = '');

alter table public.profiles enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users insert own profile" on public.profiles;
create policy "Users insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
