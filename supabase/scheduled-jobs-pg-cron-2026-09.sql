-- ============================================================
--  Scheduled jobs on Supabase pg_cron — run once in the Supabase
--  SQL editor (project evzluixourmsefwdsieu).
--
--  WHY: GitHub Actions `schedule` degraded on 2026-08-27 and has
--  created only ~6–16 of the ~64 expected runs/day since (the 30-min
--  marketplace reconcile fired 2–9×/day instead of 48; price pushes
--  landed 2–10 h late). Netlify Scheduled Functions never executed
--  at all. pg_cron runs on the database instance, minute-accurate.
--
--  WHAT: seven trigger jobs (+ one housekeeping job at the end of step 2),
--  identical routes / schedules / secret names to
--  .github/workflows/scheduled-jobs.yml. The Next routes are
--  trigger-agnostic and guarded by an `x-cron-secret` header, so
--  NO application code changes. Schedules are UTC (pg_cron default).
--
--  SECRETS never appear in this file. Store the four cron secrets in
--  Supabase Vault FIRST (step 1) — the jobs read them at fire time.
--
--  Safe to re-run: cron.schedule() upserts by job name.
-- ============================================================


-- ---------- step 0: extensions ----------
create extension if not exists pg_cron;
create extension if not exists pg_net;


-- ---------- step 1: secrets in Vault ----------
-- Preferred: Dashboard → Project Settings → Vault → "Add new secret",
-- one per row, NAME EXACTLY as below, value = the same value Netlify
-- holds for that variable (Netlify is authoritative; .env.local was
-- reconciled to it after the 2026-08-11 rotation).
--
--   ETSY_CRON_SECRET
--   EBAY_CRON_SECRET
--   INSTAGRAM_CRON_SECRET
--   FACEBOOK_CRON_SECRET
--
-- If you would rather do it here, uncomment and fill in — then clear
-- the SQL editor's query history afterwards so the values are not kept:
--
-- select vault.create_secret('<value>', 'ETSY_CRON_SECRET',      'x-cron-secret for /api/admin/etsy/*');
-- select vault.create_secret('<value>', 'EBAY_CRON_SECRET',      'x-cron-secret for /api/admin/ebay/*');
-- select vault.create_secret('<value>', 'INSTAGRAM_CRON_SECRET', 'x-cron-secret for /api/admin/instagram/*');
-- select vault.create_secret('<value>', 'FACEBOOK_CRON_SECRET',  'x-cron-secret for /api/admin/facebook/*');

-- Sanity check — must return 4 rows before step 2. (Names only.)
select name, created_at from vault.decrypted_secrets
 where name in ('ETSY_CRON_SECRET','EBAY_CRON_SECRET','INSTAGRAM_CRON_SECRET','FACEBOOK_CRON_SECRET')
 order by name;


-- ---------- step 2: the seven jobs ----------
-- Each job enqueues one POST through pg_net (asynchronous — the cron
-- run "succeeds" when the request is queued; the HTTP result lands in
-- net._http_response, and the app writes its own sync-log row).

-- Etsy price push — 11:15 UTC daily (7:15 a.m. EDT / 6:15 a.m. EST)
select cron.schedule(
  'nej-etsy-price-push',
  '15 11 * * *',
  $$
  select net.http_post(
    url := 'https://naplesestatejewelry.com/api/admin/etsy/price-push',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ETSY_CRON_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- eBay price push — 11:45 UTC daily (staggered 30 min after Etsy)
select cron.schedule(
  'nej-ebay-price-push',
  '45 11 * * *',
  $$
  select net.http_post(
    url := 'https://naplesestatejewelry.com/api/admin/ebay/price-push',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'EBAY_CRON_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- Instagram drip — hourly, 00–05 and 16–23 UTC (the seven Eastern reservations)
select cron.schedule(
  'nej-instagram-drip',
  '0 0-5,16-23 * * *',
  $$
  select net.http_post(
    url := 'https://naplesestatejewelry.com/api/admin/instagram/drip',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'INSTAGRAM_CRON_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- Facebook drip — same window as Instagram
select cron.schedule(
  'nej-facebook-drip',
  '0 0-5,16-23 * * *',
  $$
  select net.http_post(
    url := 'https://naplesestatejewelry.com/api/admin/facebook/drip',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'FACEBOOK_CRON_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- Instagram long-lived token refresh — Mondays 12:15 UTC
select cron.schedule(
  'nej-instagram-token-refresh',
  '15 12 * * 1',
  $$
  select net.http_post(
    url := 'https://naplesestatejewelry.com/api/admin/instagram/refresh-token',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'INSTAGRAM_CRON_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- eBay status-drift reconcile — every 30 min (safety net under the auto-delist hook)
select cron.schedule(
  'nej-ebay-reconcile-status',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://naplesestatejewelry.com/api/admin/ebay/reconcile-status',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'EBAY_CRON_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Etsy status-drift reconcile — every 30 min
select cron.schedule(
  'nej-etsy-reconcile-status',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://naplesestatejewelry.com/api/admin/etsy/reconcile-status',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ETSY_CRON_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);


-- Housekeeping — pg_cron keeps one row per run in cron.job_run_details and
-- prunes nothing by default (~70 rows/day at this schedule). Supabase's own
-- recommendation; keeps a week of history for troubleshooting.
-- (Run by the owner 2026-09-07 evening → jobid 8.)
select cron.schedule(
  'nej-cron-history-cleanup',
  '0 3 * * *',
  $$ delete from cron.job_run_details where end_time < now() - interval '7 days' $$
);


-- ---------- step 3: verify ----------
-- 3a. Eight active jobs (seven triggers + the history cleanup) with the schedules above.
select jobid, jobname, schedule, active from cron.job where jobname like 'nej-%' order by jobname;

-- 3b. Fire ONE reconcile by hand right now (harmless + idempotent — it is
--     the same call that runs 48×/day). Then wait ~10 s and run 3c.
select net.http_post(
  url := 'https://naplesestatejewelry.com/api/admin/etsy/reconcile-status',
  headers := jsonb_build_object(
    'content-type', 'application/json',
    'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ETSY_CRON_SECRET')
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 60000
);

-- 3c. Expect status_code 200 and a JSON body with scanned/drifted counts.
--     401 = the Vault value does not match Netlify's; 503 = the route's
--     secret is missing on Netlify; NULL status + error_msg = network/timeout.
select id, created, status_code, left(content, 200) as body, error_msg
  from net._http_response
 order by created desc
 limit 5;

-- 3d. After the first half-hour boundary: each scheduled run appears here.
select jobid, runid, status, return_message, start_time, end_time
  from cron.job_run_details
 where jobid in (select jobid from cron.job where jobname like 'nej-%')
 order by start_time desc
 limit 20;


-- ---------- rollback (if ever needed) ----------
-- select cron.unschedule(jobname) from cron.job where jobname like 'nej-%';


-- ---------- overlap cleanup — DONE 2026-09-13 ----------
-- The `schedule:` block is gone from .github/workflows/scheduled-jobs.yml
-- (manual "Run workflow" kept) and next-app/netlify/functions/ is deleted.
-- It was overdue: Netlify's scheduler started working around 2026-09-11, so
-- every job was firing three times. pg_cron is now the ONLY scheduler — do not
-- add another. Proof of "clean" going forward: one scheduled_drip row per
-- channel per hour in the drip window, one price-push row per channel per day
-- at 11:15 / 11:45 UTC, 48 reconcile_status rows per channel per day.
