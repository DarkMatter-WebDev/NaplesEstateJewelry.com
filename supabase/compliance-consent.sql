-- Compliance foundation fields for account registration consent.
-- Run in Supabase SQL Editor after the base profile schema exists.

alter table public.profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists privacy_accepted_at timestamptz,
  add column if not exists policies_accepted_version text;

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

grant select, insert, update on public.profiles to authenticated;
