-- ============================================================================
-- Rate limiting infrastructure for unauthenticated endpoints.
-- Backs src/lib/rate-limit.ts (checkRateLimit). Until this runs, the app's
-- rate-limit checks FAIL OPEN (every request is allowed) — the endpoints still
-- work, they just aren't throttled. Idempotent; safe to re-run.
-- ============================================================================

create table if not exists public.rate_limits (
  key           text primary key,
  count         integer     not null default 0,
  window_start  timestamptz not null default now()
);

-- Only the service role (which bypasses RLS) ever touches this table, via the
-- function below. Enable RLS with no policies = default deny for anon/authenticated.
alter table public.rate_limits enable row level security;

create index if not exists rate_limits_window_start_idx
  on public.rate_limits (window_start);

-- Atomic check-and-increment. Returns TRUE when the caller is still within
-- `p_max` actions per rolling `p_window_seconds` window for `p_key`, FALSE when
-- the limit is exceeded. The single upsert makes it race-safe across concurrent
-- lambda instances.
create or replace function public.check_rate_limit(
  p_key text,
  p_max integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_key is null or length(p_key) > 200 or p_max < 1 or p_window_seconds < 1 then
    raise exception 'Invalid rate-limit parameters.';
  end if;

  insert into public.rate_limits (key, count, window_start)
    values (p_key, 1, now())
  on conflict (key) do update
    set count = case
                  when public.rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
                    then 1
                  else public.rate_limits.count + 1
                end,
        window_start = case
                  when public.rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
                    then now()
                  else public.rate_limits.window_start
                end
  returning count into v_count;

  -- Keep unique-IP/key traffic from growing this table forever without making
  -- every request perform a global delete. Roughly one percent of keys trigger
  -- an indexed cleanup of rows that have been stale for at least a day.
  if mod(hashtextextended(p_key, 0), 100) = 0 then
    delete from public.rate_limits
    where window_start < now() - interval '1 day';
  end if;

  return v_count <= p_max;
end;
$$;

-- service_role only. Explicitly deny PUBLIC/anon/authenticated so it can't be
-- called directly through PostgREST.
revoke execute on function public.check_rate_limit(text, integer, integer) from public;
grant  execute on function public.check_rate_limit(text, integer, integer) to service_role;

-- Optional extra housekeeping: safe to run on a schedule or manually.
--   delete from public.rate_limits where window_start < now() - interval '1 day';
