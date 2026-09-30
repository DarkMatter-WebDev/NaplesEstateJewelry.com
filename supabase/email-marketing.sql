-- Email marketing, opt-out account audience, campaign audit, and compliance settings.
-- Run in Supabase SQL Editor before using Admin > Email Campaigns.

create extension if not exists "pgcrypto";

alter table public.profiles
  add column if not exists marketing_opt_out boolean not null default false;

-- Keep the legacy positive flag in sync where the column exists.
update public.profiles
set marketing_opt_out = false
where marketing_opt_out is null;

create table if not exists public.homepage_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text,
  source text not null default 'homepage_hero',
  locale text not null default 'en',
  subscribed boolean not null default true,
  subscribed_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.homepage_subscribers
  add column if not exists subscribed boolean not null default true,
  add column if not exists consent_at timestamptz,
  add column if not exists unsubscribed_at timestamptz,
  add column if not exists unsubscribe_token uuid not null default gen_random_uuid();

update public.homepage_subscribers
set consent_at = coalesce(consent_at, subscribed_at, now())
where consent_at is null;

create unique index if not exists homepage_subscribers_unsubscribe_token_idx
  on public.homepage_subscribers (unsubscribe_token);

create table if not exists public.marketing_settings (
  id boolean primary key default true check (id),
  mailing_address text,
  updated_at timestamptz not null default now()
);

insert into public.marketing_settings (id, mailing_address)
values (true, null)
on conflict (id) do nothing;

create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  html text not null,
  audience_scope text not null default 'all' check (audience_scope in ('subscribers', 'accounts', 'all')),
  sender_profile text not null default 'chris' check (sender_profile in ('no_reply', 'chris')),
  from_address text,
  reply_to text,
  transport text not null default 'direct' check (transport in ('direct', 'broadcast')),
  status text not null default 'draft' check (status in ('draft', 'sending', 'sent', 'failed')),
  provider_ref text,
  total_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table public.email_campaigns
  add column if not exists sender_profile text not null default 'chris',
  add column if not exists from_address text,
  add column if not exists reply_to text;

create table if not exists public.email_campaign_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  email text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  error text,
  sent_at timestamptz,
  unique (campaign_id, email)
);

create table if not exists public.email_campaign_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  email text not null,
  type text not null check (type in ('delivered', 'opened', 'clicked', 'bounced', 'complained')),
  url text,
  created_at timestamptz not null default now(),
  unique (campaign_id, email, type)
);

create index if not exists email_campaigns_created_at_idx on public.email_campaigns (created_at desc);
create index if not exists email_campaign_sends_campaign_id_idx on public.email_campaign_sends (campaign_id);
create index if not exists email_campaign_events_campaign_id_idx on public.email_campaign_events (campaign_id);

alter table public.marketing_settings enable row level security;
alter table public.email_campaigns enable row level security;
alter table public.email_campaign_sends enable row level security;
alter table public.email_campaign_events enable row level security;

grant select, insert, update, delete on public.marketing_settings to service_role;
grant select, insert, update, delete on public.email_campaigns to service_role;
grant select, insert, update, delete on public.email_campaign_sends to service_role;
grant select, insert, update, delete on public.email_campaign_events to service_role;
grant select, update on public.profiles to service_role;
grant select, insert, update, delete on public.homepage_subscribers to service_role;

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
