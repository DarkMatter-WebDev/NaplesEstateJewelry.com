-- Cloudflare Stream product videos (one active video per product).
-- Idempotent. Run in the Supabase SQL Editor before enabling admin uploads.

create extension if not exists pgcrypto;

create table if not exists public.product_videos (
  product_id text primary key references public.products(id) on update cascade on delete cascade,
  cloudflare_uid text not null unique,
  status text not null default 'uploading'
    check (status in ('uploading', 'processing', 'ready', 'failed', 'delete_failed')),
  duration_seconds numeric,
  width integer,
  height integer,
  thumbnail_url text,
  poster_url text,
  poster_source text not null default 'first_photo'
    check (poster_source in ('first_photo', 'cloudflare_thumbnail')),
  preview_url text,
  iframe_url text,
  playback_hls_url text,
  playback_dash_url text,
  download_url text,
  download_status text,
  source_filename text,
  source_size_bytes bigint check (source_size_bytes is null or source_size_bytes between 0 and 157286400),
  source_content_type text,
  error_code text,
  error_text text,
  pending_delete_uid text,
  cleanup_error text,
  uploaded_at timestamptz,
  ready_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Upload sessions let a resumable direct upload exist before the listing Save
-- commits it. product_id is intentionally not a foreign key because a brand-new
-- listing does not exist in products until the editor is saved.
create table if not exists public.product_video_uploads (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  product_id text,
  cloudflare_uid text not null unique,
  status text not null default 'uploading'
    check (status in ('uploading', 'processing', 'ready', 'failed', 'cancelled', 'committed')),
  source_filename text not null,
  source_size_bytes bigint not null check (source_size_bytes between 1 and 157286400),
  source_content_type text,
  client_duration_seconds numeric,
  duration_seconds numeric,
  width integer,
  height integer,
  thumbnail_url text,
  preview_url text,
  iframe_url text,
  playback_hls_url text,
  playback_dash_url text,
  download_url text,
  download_status text,
  error_code text,
  error_text text,
  cleanup_error text,
  expires_at timestamptz not null,
  committed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_video_uploads_admin_created_idx
  on public.product_video_uploads (admin_user_id, created_at desc);
create index if not exists product_video_uploads_expiry_idx
  on public.product_video_uploads (expires_at)
  where committed_at is null;

create table if not exists public.cloudflare_stream_webhook_events (
  event_hash text primary key,
  cloudflare_uid text,
  status text,
  received_at timestamptz not null default now()
);

create or replace function public.set_product_video_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_product_videos_updated_at on public.product_videos;
create trigger set_product_videos_updated_at
before update on public.product_videos
for each row execute function public.set_product_video_updated_at();

drop trigger if exists set_product_video_uploads_updated_at on public.product_video_uploads;
create trigger set_product_video_uploads_updated_at
before update on public.product_video_uploads
for each row execute function public.set_product_video_updated_at();

alter table public.product_videos enable row level security;
alter table public.product_video_uploads enable row level security;
alter table public.cloudflare_stream_webhook_events enable row level security;

-- All reads/writes flow through authenticated server routes. Public product
-- pages receive only a deliberately projected playback object from the server.
revoke all on table public.product_videos from anon, authenticated;
revoke all on table public.product_video_uploads from anon, authenticated;
revoke all on table public.cloudflare_stream_webhook_events from anon, authenticated;

grant all on table public.product_videos to service_role;
grant all on table public.product_video_uploads to service_role;
grant all on table public.cloudflare_stream_webhook_events to service_role;

comment on table public.product_videos is
  'One active Cloudflare Stream video per product. Metadata/URLs only; never video bytes.';
comment on table public.product_video_uploads is
  'Short-lived resumable-upload candidates pending product editor Save/Cancel.';

