-- Homepage subscriber capture for admin Subscribers tab.
-- Run in Supabase SQL Editor before using the homepage signup form.

create extension if not exists "pgcrypto";

create table if not exists public.homepage_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text,
  source text not null default 'homepage_hero',
  locale text not null default 'en',
  subscribed boolean not null default true,
  subscribed_at timestamptz not null default now(),
  consent_at timestamptz,
  unsubscribe_token uuid not null default gen_random_uuid(),
  unsubscribed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.homepage_subscribers
  add column if not exists subscribed boolean not null default true,
  add column if not exists consent_at timestamptz,
  add column if not exists unsubscribe_token uuid not null default gen_random_uuid(),
  add column if not exists unsubscribed_at timestamptz;

create index if not exists homepage_subscribers_subscribed_at_idx
  on public.homepage_subscribers (subscribed_at desc);

create unique index if not exists homepage_subscribers_unsubscribe_token_idx
  on public.homepage_subscribers (unsubscribe_token);

alter table public.homepage_subscribers enable row level security;

drop policy if exists "Admins read homepage subscribers" on public.homepage_subscribers;
create policy "Admins read homepage subscribers"
  on public.homepage_subscribers for select
  using (public.is_admin_user(auth.uid()));

grant select on public.homepage_subscribers to authenticated;

create or replace function public.subscribe_homepage(
  subscriber_email text,
  subscriber_name text default null,
  subscriber_locale text default 'en'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text;
begin
  normalized_email := lower(trim(subscriber_email));

  if normalized_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'A valid email address is required.';
  end if;

  insert into public.homepage_subscribers (
    email,
    full_name,
    source,
    locale,
    subscribed,
    subscribed_at,
    consent_at,
    unsubscribed_at,
    updated_at
  )
  values (
    normalized_email,
    nullif(trim(coalesce(subscriber_name, '')), ''),
    'homepage_hero',
    case when subscriber_locale = 'es' then 'es' else 'en' end,
    true,
    now(),
    now(),
    null,
    now()
  )
  on conflict (email) do update
  set
    full_name = coalesce(excluded.full_name, public.homepage_subscribers.full_name),
    locale = excluded.locale,
    source = excluded.source,
    subscribed = true,
    consent_at = coalesce(public.homepage_subscribers.consent_at, now()),
    unsubscribed_at = null,
    updated_at = now();
end;
$$;

revoke execute on function public.subscribe_homepage(text, text, text) from public, anon, authenticated;
grant execute on function public.subscribe_homepage(text, text, text) to service_role;

create or replace function public.unsubscribe_homepage(subscriber_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text;
  affected_count integer;
begin
  normalized_email := lower(trim(subscriber_email));

  if normalized_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'A valid email address is required.';
  end if;

  update public.homepage_subscribers
  set
    subscribed = false,
    unsubscribed_at = now(),
    updated_at = now()
  where email = normalized_email;

  update public.profiles
  set
    marketing_opt_out = true,
    marketing_opt_in = false,
    updated_at = now()
  where email = normalized_email;

  get diagnostics affected_count = row_count;
  return affected_count > 0;
end;
$$;

revoke execute on function public.unsubscribe_homepage(text) from public, anon, authenticated;
grant execute on function public.unsubscribe_homepage(text) to service_role;
