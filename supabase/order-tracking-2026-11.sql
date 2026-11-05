-- Naples Estate Jewelry - delivery tracking emails (2026-11-05).
-- Safe to re-run. Run ALL of it in the Supabase SQL Editor (before or after the
-- deploy: until it runs, the order page simply shows no tracking line and the
-- out-for-delivery / delivered emails do not send - everything else, including
-- the shipped email with its Track Your Package button, works as before).
--
-- How it works (owner, 2026-11-05, mockup 4 approved):
--   * Mark Shipped with a tracking number -> the site registers the package with
--     EasyPost (one row below per order).
--   * EasyPost calls /api/webhooks/easypost on every carrier scan; the site
--     re-reads the package from EasyPost and sends "Out for delivery" and
--     "Delivered" emails itself (from noreply@naplesestatejewelry.com, our own
--     wording) - each exactly once per order.
--   * The hourly sweep (section 3) registers anything that was missed and
--     re-checks packages still on their way, so a lost webhook never means a
--     lost email.
--
-- Scan times are stored as TEXT on purpose: EasyPost gives each scan in the
-- scan's own local time ("2026-11-12T14:14:00-05:00"); a timestamptz would
-- turn that into UTC and the email would show the wrong clock time.

-- 1. The table -----------------------------------------------------------------
create table if not exists public.order_tracking (
  order_id                   uuid primary key references public.orders(id) on delete cascade,
  tracking_number            text not null,          -- as the owner typed it on the order
  carrier                    text,                   -- as the owner typed it ("USPS")
  easypost_tracker_id        text unique,            -- trk_...; null until registered
  status                     text,                   -- EasyPost status: in_transit, out_for_delivery, delivered, ...
  status_detail              text,
  public_url                 text,
  last_event_message         text,                   -- "Delivered, Left with Individual"
  last_event_at              text,                   -- raw EasyPost datetime, local offset kept
  last_event_city            text,
  last_event_state           text,
  last_event_zip             text,
  out_for_delivery_at        text,
  delivered_at               text,
  delivered_message          text,
  register_error             text,                   -- last EasyPost error; cleared on success
  out_for_delivery_email_at  timestamptz,            -- set when that email went (claimed before sending)
  delivered_email_at         timestamptz,
  checked_at                 timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create index if not exists order_tracking_checked_idx on public.order_tracking (checked_at);

comment on table public.order_tracking is
  'One row per shipped order: its EasyPost tracker, the latest carrier scan, and when the out-for-delivery / delivered emails went. Written only by the server (service role).';

-- 2. Access: the owner reads it on the order page; only the server writes ------
alter table public.order_tracking enable row level security;

drop policy if exists "Admins read order tracking" on public.order_tracking;
create policy "Admins read order tracking"
  on public.order_tracking for select
  using (public.is_admin_user(auth.uid()));

revoke all on public.order_tracking from anon;
revoke insert, update, delete on public.order_tracking from authenticated;
grant select on public.order_tracking to authenticated;
grant select, insert, update, delete on public.order_tracking to service_role;

-- 3. The hourly sweep (at :20 past each hour) -----------------------------------
-- Uses the TEXT_ALERTS_CRON_SECRET already in Vault (the same value Netlify
-- holds) - no new secret.
select cron.schedule(
  'nej-order-tracking-sweep',
  '20 * * * *',
  $$
  select net.http_post(
    url := 'https://naplesestatejewelry.com/api/admin/orders/tracking-sweep',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'TEXT_ALERTS_CRON_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

notify pgrst, 'reload schema';

-- 4. Verify -------------------------------------------------------------------
-- The editor shows the LAST result: one row, every value true.
select
  exists (select 1 from information_schema.tables
           where table_schema = 'public' and table_name = 'order_tracking')                 as tracking_table,
  not has_table_privilege('anon', 'public.order_tracking', 'select')                        as hidden_from_public,
  not has_table_privilege('authenticated', 'public.order_tracking', 'insert')               as browsers_cannot_write,
  has_table_privilege('service_role', 'public.order_tracking', 'update')                    as server_can_write,
  exists (select 1 from cron.job where jobname = 'nej-order-tracking-sweep' and active)      as sweep_scheduled;
