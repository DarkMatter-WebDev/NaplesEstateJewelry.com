-- Text deals + Twilio (Step 2, 2026-09-15). Run in the Supabase SQL editor
-- AFTER text-subscribers-2026-09.sql and BEFORE deploying the Step 2 batch.
-- Safe to re-run.
--
-- What this adds:
--   homepage_subscribers   confirmation bookkeeping + the last deal sent
--   text_deals             one row per picture-message deal (photo, price, line,
--                          message, status draft → sending → sent → sold)
--   text_deal_sends        one row per recipient per deal — written BEFORE the
--                          send, so a frozen function can never double-text
--   text_inbound           every text that arrives on the toll-free number
--   text_system_messages   confirmations, tests and forwards we sent
--   nej-text-alerts-sweep  pg_cron every 15 min → /api/admin/text-alerts/sweep
--
-- All four tables are service-role only (same trust model as the Etsy/eBay
-- tables): Admin reads them through the API routes, never from the browser.

-- 1. Subscriber bookkeeping -------------------------------------------------
alter table public.homepage_subscribers
  add column if not exists sms_confirmation_sent_at      timestamptz,
  add column if not exists sms_confirmation_attempted_at timestamptz,
  add column if not exists sms_confirmation_attempts     integer not null default 0,
  add column if not exists sms_last_deal_id              uuid;

create index if not exists homepage_subscribers_sms_status_idx
  on public.homepage_subscribers (sms_status)
  where phone_e164 is not null;

-- 2. Deals ------------------------------------------------------------------
create table if not exists public.text_deals (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  price_text        text not null,
  message           text not null,
  photo_path        text,
  card_path         text,
  status            text not null default 'draft'
                    check (status in ('draft', 'sending', 'sent', 'sold')),
  recipients_count  integer not null default 0,
  sent_at           timestamptz,
  sold_at           timestamptz,
  sold_to_phone     text,
  sold_reply_text   text,
  created_by        uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter table public.text_deals enable row level security;
revoke all on public.text_deals from anon, authenticated;
create index if not exists text_deals_created_idx on public.text_deals (created_at desc);

-- 3. Sends (the once-only guard) -------------------------------------------
create table if not exists public.text_deal_sends (
  id             bigserial primary key,
  deal_id        uuid not null references public.text_deals (id) on delete cascade,
  subscriber_id  uuid,
  phone_e164     text not null,
  status         text not null default 'queued',
  message_sid    text,
  error_code     text,
  error_message  text,
  sent_at        timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (deal_id, phone_e164)
);
alter table public.text_deal_sends enable row level security;
revoke all on public.text_deal_sends from anon, authenticated;
create index if not exists text_deal_sends_deal_status_idx on public.text_deal_sends (deal_id, status);
create index if not exists text_deal_sends_sid_idx on public.text_deal_sends (message_sid);

-- 4. Inbound ----------------------------------------------------------------
create table if not exists public.text_inbound (
  id                 bigserial primary key,
  message_sid        text not null unique,
  from_phone         text not null,
  body               text,
  num_media          integer not null default 0,
  kind               text not null,
  subscriber_id      uuid,
  deal_id            uuid references public.text_deals (id) on delete set null,
  forwarded_at       timestamptz,
  forward_sid        text,
  forward_error      text,
  auto_reply_sent_at timestamptz,
  received_at        timestamptz not null default now()
);
alter table public.text_inbound enable row level security;
revoke all on public.text_inbound from anon, authenticated;
create index if not exists text_inbound_deal_idx on public.text_inbound (deal_id, received_at);
create index if not exists text_inbound_from_idx on public.text_inbound (from_phone, received_at desc);

-- 5. Everything else we sent ------------------------------------------------
create table if not exists public.text_system_messages (
  id             bigserial primary key,
  kind           text not null,            -- confirmation | deal_test | forward
  to_phone       text not null,
  subscriber_id  uuid,
  deal_id        uuid references public.text_deals (id) on delete set null,
  message_sid    text,
  status         text not null,
  error          text,
  created_at     timestamptz not null default now()
);
alter table public.text_system_messages enable row level security;
revoke all on public.text_system_messages from anon, authenticated;
create index if not exists text_system_messages_sid_idx on public.text_system_messages (message_sid);

-- 6. The 15-minute sweep ------------------------------------------------------
-- Store the secret in Vault FIRST (Dashboard → Project Settings → Vault),
-- name EXACTLY TEXT_ALERTS_CRON_SECRET, value = the same value Netlify holds.
-- Or, here (then clear the editor history):
-- select vault.create_secret('<value>', 'TEXT_ALERTS_CRON_SECRET', 'x-cron-secret for /api/admin/text-alerts/sweep');

select cron.schedule(
  'nej-text-alerts-sweep',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://naplesestatejewelry.com/api/admin/text-alerts/sweep',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'TEXT_ALERTS_CRON_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- 7. Verify -------------------------------------------------------------------
select jobname, schedule, active from cron.job where jobname = 'nej-text-alerts-sweep';
select name from vault.decrypted_secrets where name = 'TEXT_ALERTS_CRON_SECRET';
