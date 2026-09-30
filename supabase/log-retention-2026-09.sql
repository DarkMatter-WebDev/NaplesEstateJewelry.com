-- ============================================================================
-- Log retention — 2026-09  ·  ⛔ DRAFT FOR OWNER REVIEW — NOT RUN
-- ============================================================================
--
-- WHY. Two tables grow forever, and 99.9% of that growth is ONE thing: eBay's
-- MARKETPLACE_ACCOUNT_DELETION compliance broadcast (eBay tells every developer
-- app whenever ANY eBay user deletes their account — nothing to do with this
-- shop). Each notice writes a sanitized receipt to webhook_events AND a
-- duplicate `account_deletion` row to ebay_sync_log
-- (next-app/src/app/api/webhooks/ebay-account-deletion/route.ts before
-- 2026-09-13). The duplicate sync-log row is removed in code from the 09-13
-- deploy on; the 7-day rule below clears the existing ones.
-- Measured 2026-09-13 20:46Z in the SQL editor (read-only):
--   webhook_events  117,178 rows · 92 MB · all but 50 are eBay (50 PayPal) · oldest 06-30
--   ebay_sync_log   120,563 rows · 43 MB · 117,136 account_deletion · oldest 07-10
--   ~1,760 notices/day, every day; reconcile/sales/price rows are ~100/day.
-- 22,552 of the eBay webhook rows (07-10 → 07-23) still hold deleted eBay users'
-- identifiers from before the 07-16 sanitize fix — the scrub owed in TASKS.md
-- (features/ebay-sync.md:305-308). The 30-day eBay rule below deletes all of them.
--
-- RULES (reasoning in CHANGELOG.md 2026-09-13 "log retention audit"):
--   webhook_events, provider 'ebay' account-deletion receipts ... keep 30 days
--       (dedupe needs hours: eBay redelivers ≤4 attempts, max gap 0.2 h)
--   webhook_events, provider 'paypal' ........................... KEEP ALL
--       (54 rows total; dedupe + dispute/refund audit; FK to orders)
--   ebay_sync_log, action 'account_deletion' .................... keep 7 days
--       (no reader: the admin log excludes it, store.ts / status route)
--   ebay / etsy / facebook / instagram sync logs, everything else  keep 90 days
--       (the SAME 90 days the app already prunes opportunistically —
--        store.ts pruneOldSyncLogs; TASKS.md: never shorten it)
--   cloudflare_stream_webhook_events ............................ keep 30 days
--       (dedupe hashes; signatures older than 5 min are rejected anyway)
-- NOT TOUCHED, deliberately: admin_notifications (inbox + refund-alert dedupe
-- + Storage GC reference set), marketplace_sale_events (once-only sale guard,
-- unbounded look-back), email_campaign_events (campaign stats), rate_limits
-- (self-cleans after 1 day), order_emails / paypal_refunds /
-- discount_code_redemptions (money + dedupe), cron.job_run_details (job 8).
--
-- SAFETY. Deletes run in batches of 5,000 with a COMMIT after each batch (a
-- procedure, not a DO block — a DO block is ONE transaction however it loops).
-- Nothing here changes jobs 1-8, the webhook handlers, or what gets written.
-- DELETE frees space for reuse inside each table (autovacuum); the files do
-- not shrink. Stopping growth is the goal — never VACUUM FULL.
-- Backups: daily physical backups visible 06 → 13 Sep 2026 (Dashboard →
-- Database → Backups). Point-in-time recovery is OFF (add-on not enabled), so
-- the newest daily backup (~09:00 UTC) is the restore point, and a restore is
-- whole-project. Treat deletes as final; step 4's 07:20 run happens ~2 h
-- BEFORE that day's backup, so the prior day's backup still holds every row.
--
-- DOUBLE-CHECKED 2026-09-13 (read-only): pg_cron 1.6.4 with
-- cron.use_background_workers = off (jobs run as top-level libpq commands, so
-- the procedure's COMMIT is allowed); the SQL editor also accepts COMMIT
-- (`do $$ begin commit; end $$` → Success); jobs run as `postgres`; NO
-- triggers, rules or realtime publications on any table below; no foreign key
-- points at them; the marketplace-sales "armed" state lives in
-- etsy/ebay connection cursors, not in log rows; PayPal's duplicate check
-- filters provider = 'paypal' (never touched here).
--
-- RUN ORDER (Supabase → SQL Editor). Run each step as its OWN run.
-- ============================================================================


-- ---------- step 0: before counts (read-only; keep the output) ----------
select 'webhook_events ebay >30d' as rule, count(*) from public.webhook_events
  where provider = 'ebay' and event_type = 'MARKETPLACE_ACCOUNT_DELETION' and created_at < now() - interval '30 days'
union all select 'ebay_sync_log account_deletion >7d', count(*) from public.ebay_sync_log
  where action = 'account_deletion' and created_at < now() - interval '7 days'
union all select 'ebay_sync_log any >90d', count(*) from public.ebay_sync_log where created_at < now() - interval '90 days'
union all select 'etsy_sync_log >90d', count(*) from public.etsy_sync_log where created_at < now() - interval '90 days'
union all select 'facebook_sync_log >90d', count(*) from public.facebook_sync_log where created_at < now() - interval '90 days'
union all select 'instagram_sync_log >90d', count(*) from public.instagram_sync_log where created_at < now() - interval '90 days'
union all select 'cloudflare_stream_webhook_events >30d', count(*) from public.cloudflare_stream_webhook_events where received_at < now() - interval '30 days';
-- 2026-09-13 20:46Z reading: ~62,298 · ~104,767 · 0 · 0 · 0 · 0 · 0


-- ---------- step 1: indexes (ONE statement per run) ----------
-- CONCURRENTLY never blocks webhook inserts, but it cannot run inside a
-- transaction — so paste and run these one at a time, not together.
-- webhook_events already has webhook_events_created_idx (created_at desc).
create index concurrently if not exists ebay_sync_log_action_created_idx
  on public.ebay_sync_log (action, created_at);
-- ↑ also serves getLastScheduledPricePush + logSkipOnce, which filter on
--   `action` today with no index (lib/ebay/store.ts:348, marketplace-sales-sweep.ts:209).
create index concurrently if not exists ebay_sync_log_created_idx
  on public.ebay_sync_log (created_at);
create index concurrently if not exists etsy_sync_log_created_idx
  on public.etsy_sync_log (created_at);
create index concurrently if not exists facebook_sync_log_created_idx
  on public.facebook_sync_log (created_at);
create index concurrently if not exists instagram_sync_log_created_idx
  on public.instagram_sync_log (created_at);
create index concurrently if not exists cloudflare_stream_webhook_events_received_idx
  on public.cloudflare_stream_webhook_events (received_at);
-- 1-check: all six valid (indisvalid true). An invalid one = drop it and re-run.
select c.relname, i.indisvalid
from pg_index i join pg_class c on c.oid = i.indexrelid
where c.relname in ('ebay_sync_log_action_created_idx', 'ebay_sync_log_created_idx',
  'etsy_sync_log_created_idx', 'facebook_sync_log_created_idx',
  'instagram_sync_log_created_idx', 'cloudflare_stream_webhook_events_received_idx');


-- ---------- step 2: the retention procedure (creates; deletes nothing) ----------
create or replace procedure public.nej_log_retention(
  p_batch_size  integer default 5000,
  p_max_batches integer default 60   -- 300k rows per run max; the backlog is ~167k
)
language plpgsql
-- ⛔ No `SET search_path` (or any SET clause) here: Postgres forbids COMMIT in
-- a procedure that has one ("invalid transaction termination"), which would
-- make every run fail and delete nothing. Every table below is written
-- schema-qualified (public.%I) instead.
as $proc$
declare
  r         record;
  v_deleted integer;
  v_rule    bigint;
  v_batches integer := 0;
  v_summary text := '';
begin
  for r in
    select * from (values
      ('webhook_events',                   'created_at',
         $f$provider = 'ebay' and event_type = 'MARKETPLACE_ACCOUNT_DELETION'$f$, interval '30 days'),
      ('ebay_sync_log',                    'created_at', $f$action = 'account_deletion'$f$, interval '7 days'),
      ('ebay_sync_log',                    'created_at', 'true', interval '90 days'),
      ('etsy_sync_log',                    'created_at', 'true', interval '90 days'),
      ('facebook_sync_log',                'created_at', 'true', interval '90 days'),
      ('instagram_sync_log',               'created_at', 'true', interval '90 days'),
      ('cloudflare_stream_webhook_events', 'received_at', 'true', interval '30 days')
    ) as t(tbl, ts_col, extra, keep)
  loop
    v_rule := 0;
    loop
      exit when v_batches >= p_max_batches;
      execute format(
        'delete from public.%I where ctid in (select ctid from public.%I where %I < $1 and (%s) limit $2)',
        r.tbl, r.tbl, r.ts_col, r.extra)
      using now() - r.keep, p_batch_size;
      get diagnostics v_deleted = row_count;
      commit;  -- each batch is its own small transaction
      v_batches := v_batches + 1;
      v_rule := v_rule + v_deleted;
      exit when v_deleted < p_batch_size;
    end loop;
    v_summary := v_summary || format('%s %s: %s · ', r.tbl, r.keep, v_rule);
  end loop;
  raise log 'nej_log_retention: % batches · %', v_batches, v_summary;
end;
$proc$;

-- Server-side only: no API role may call it.
revoke all on procedure public.nej_log_retention(integer, integer) from public, anon, authenticated, service_role;


-- ---------- step 3: smoke test — ONE batch (deletes at most 5,000 old eBay receipts) ----------
-- Proves the per-batch COMMIT works before anything is scheduled. Run it
-- alone. Expect "CALL". If it errors with "invalid transaction termination",
-- STOP — nothing was deleted; report back.
call public.nej_log_retention(5000, 1);
-- 3-check: step 0's first number dropped by exactly 5,000.


-- ---------- step 4: schedule it (job 9) ----------
-- 07:20 UTC = 3:20 AM Eastern: no drip (hours 16-05), not :00/:30 (reconcile),
-- clear of 03:00 (job 8), 11:15/11:45 (price pushes) and Mon 12:15 (token).
-- The FIRST run drains the whole backlog (~167k rows, 34 batches); every
-- run after that removes about one day's worth (~3.5k rows, 2 batches).
select cron.schedule(
  'nej-log-retention',
  '20 7 * * *',
  $$ call public.nej_log_retention() $$
);


-- ---------- step 5: verify (the morning after the first 07:20 run) ----------
-- 5a. The run succeeded.
select jobid, status, return_message, start_time, end_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'nej-log-retention')
order by start_time desc limit 3;
-- 5b. Re-run step 0: every number 0 (or a few hundred at most).
-- 5c. No deleted-user identifiers left anywhere:
select count(*) from public.webhook_events where provider = 'ebay' and (payload -> 'notification') ? 'data';
-- 5d. Autovacuum caught up (last_autovacuum after the run, n_dead_tup small):
select relname, n_live_tup, n_dead_tup, last_autovacuum
from pg_stat_user_tables
where relname in ('webhook_events', 'ebay_sync_log', 'etsy_sync_log');
-- 5e. Jobs 1-8 untouched: still 8 + this one, all active.
select jobid, jobname, schedule, active from cron.job order by jobid;


-- ---------- rollback ----------
-- select cron.unschedule('nej-log-retention');
-- drop procedure if exists public.nej_log_retention(integer, integer);
-- (Indexes are harmless to keep. Deleted rows come back only via a
--  whole-project backup restore.)
