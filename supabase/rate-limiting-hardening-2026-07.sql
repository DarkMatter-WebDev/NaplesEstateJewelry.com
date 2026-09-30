-- Harden the distributed request limiter already installed by
-- rate-limiting-2026-07.sql. Idempotent and safe to re-run.

create index if not exists rate_limits_window_start_idx
  on public.rate_limits (window_start);

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

  if mod(hashtextextended(p_key, 0), 100) = 0 then
    delete from public.rate_limits
    where window_start < now() - interval '1 day';
  end if;

  return v_count <= p_max;
end;
$$;

revoke execute on function public.check_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer)
  to service_role;
