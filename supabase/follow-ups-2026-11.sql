-- ============================================================
--  Follow-ups (2026-11-24): one thank-you email after every buy
--  receipt (sellers) and every paid order (shop buyers), with a
--  queue the owner can step into, and a log of what went out.
--  Admin → Follow-ups. Run ONCE in the Supabase SQL editor
--  (project evzluixourmsefwdsieu). Safe to re-run.
--
--  Adds:
--    1. follow_up_settings  — one row: auto-send on/off, the four steps
--                             on/off, delays, the owner's edited email text
--    2. follow_up_messages  — the queue AND the log: one row per email
--                             (scheduled / waiting / sent / skipped / …)
--    3. follow_up_stops     — emails that must never get a follow-up
--                             (unsubscribed, or "Stop all" on a person)
--    4. pg_cron job nej-follow-ups-sweep — every 15 minutes POSTs
--       /api/admin/follow-ups/sweep with the TEXT_ALERTS_CRON_SECRET that
--       is ALREADY in Vault and on Netlify (same as the tracking sweep).
--       No new secret, no new environment variable.
--
--  Nothing here touches buy_receipts, orders, buyers or any existing email.
-- ============================================================


-- ---------- 1. settings (one row) ----------
create table if not exists public.follow_up_settings (
  id               boolean primary key default true check (id),
  auto_send        boolean not null default true,
  seller_step1     boolean not null default true,
  seller_step2     boolean not null default false,
  buyer_step1      boolean not null default true,
  buyer_step2      boolean not null default false,
  seller_delay     text not null default 'next_morning'
                   check (seller_delay in ('next_morning', '24h', '48h', '72h')),
  buyer_delay      text not null default 'next_morning'
                   check (buyer_delay in ('next_morning', '24h', '48h', '72h')),
  -- The owner's edited wording, keyed "seller-1-en", "buyer-2-es", … →
  -- { "subject": "...", "body": "..." }. Missing key = the built-in default.
  templates        jsonb not null default '{}'::jsonb,
  started_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by_email text
);

insert into public.follow_up_settings (id) values (true) on conflict (id) do nothing;

comment on table public.follow_up_settings is
  'Admin → Follow-ups settings (one row). Written by the server after an admin check.';


-- ---------- 2. the queue + log ----------
create table if not exists public.follow_up_messages (
  id                uuid primary key default gen_random_uuid(),
  email             text not null,
  name              text,
  audience          text not null check (audience in ('seller', 'buyer')),
  step              smallint not null check (step in (1, 2)),
  source_type       text not null check (source_type in ('buy_receipt', 'order')),
  source_id         uuid not null,
  source_ref        text,                       -- BUY-00187 / NEJ-1093, for the page
  source_note       text,                       -- "$1,240.00 paid" / "14K rope chain"
  language          text not null default 'en' check (language in ('en', 'es')),
  status            text not null default 'scheduled'
                    check (status in ('waiting', 'scheduled', 'sending', 'sent', 'skipped', 'not_sent', 'failed', 'cancelled')),
  wait_reason       text,                       -- 'pickup' | 'shipping' | 'delivery'
  waiting_since     timestamptz,
  event_at          timestamptz,                -- the visit / pickup / delivery the email thanks them for
  send_at           timestamptz,
  reason            text,                       -- why skipped / not sent / cancelled / failed
  subject           text,                       -- the copy as it went out
  body_html         text,
  body_text         text,
  resend_id         text,
  sent_at           timestamptz,
  sent_by_email     text,                       -- null = sent automatically
  click_token       uuid not null default gen_random_uuid(),
  review_clicked_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint follow_up_messages_source_step_key unique (source_type, source_id, step),
  constraint follow_up_messages_click_token_key unique (click_token)
);

create index if not exists follow_up_messages_due_idx   on public.follow_up_messages (status, send_at);
create index if not exists follow_up_messages_email_idx on public.follow_up_messages (lower(email));
create index if not exists follow_up_messages_sent_idx  on public.follow_up_messages (sent_at desc);

comment on table public.follow_up_messages is
  'Admin → Follow-ups: every thank-you / later-step email, scheduled or sent, with its saved copy. Written by the server only.';


-- ---------- 3. never-follow-up list ----------
create table if not exists public.follow_up_stops (
  email            text primary key,            -- lower-case
  reason           text not null check (reason in ('admin', 'unsubscribed')),
  stopped_at       timestamptz not null default now(),
  stopped_by_email text
);

comment on table public.follow_up_stops is
  'Emails that never get a follow-up: unsubscribed (any marketing unsubscribe) or stopped by the owner.';


-- ---------- row security: admins read, the server writes ----------
alter table public.follow_up_settings enable row level security;
alter table public.follow_up_messages enable row level security;
alter table public.follow_up_stops    enable row level security;

drop policy if exists "Admins read follow-up settings" on public.follow_up_settings;
create policy "Admins read follow-up settings" on public.follow_up_settings
  for select using (public.is_admin_user(auth.uid()));

drop policy if exists "Admins read follow-up messages" on public.follow_up_messages;
create policy "Admins read follow-up messages" on public.follow_up_messages
  for select using (public.is_admin_user(auth.uid()));

drop policy if exists "Admins read follow-up stops" on public.follow_up_stops;
create policy "Admins read follow-up stops" on public.follow_up_stops
  for select using (public.is_admin_user(auth.uid()));

grant select on public.follow_up_settings, public.follow_up_messages, public.follow_up_stops to authenticated;
grant select, insert, update, delete on public.follow_up_settings, public.follow_up_messages, public.follow_up_stops to service_role;

notify pgrst, 'reload schema';


-- ---------- 4. the 15-minute sweep ----------
-- Needs TEXT_ALERTS_CRON_SECRET in Vault — it is already there (the text
-- alerts, offers and tracking sweeps use it).
select cron.schedule(
  'nej-follow-ups-sweep',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://naplesestatejewelry.com/api/admin/follow-ups/sweep',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'TEXT_ALERTS_CRON_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);


-- ---------- 5. verify — expect ONE row, every value true ----------
select
  exists (select 1 from public.follow_up_settings where id)                                   as settings_row,
  to_regclass('public.follow_up_messages') is not null                                        as messages_table,
  to_regclass('public.follow_up_stops') is not null                                           as stops_table,
  has_table_privilege('service_role', 'public.follow_up_messages', 'INSERT')                  as server_can_write,
  has_table_privilege('authenticated', 'public.follow_up_messages', 'SELECT')                 as admin_can_read,
  exists (select 1 from cron.job where jobname = 'nej-follow-ups-sweep' and active)           as sweep_scheduled;


-- ---------- rollback (if ever needed) ----------
-- select cron.unschedule('nej-follow-ups-sweep');
-- drop table if exists public.follow_up_messages, public.follow_up_stops, public.follow_up_settings;
