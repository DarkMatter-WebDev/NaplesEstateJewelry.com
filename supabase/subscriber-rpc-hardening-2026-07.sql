-- Prevent direct PostgREST calls from bypassing the app's validation and
-- per-IP rate limits. The Next.js subscribe/unsubscribe routes use the service
-- role after this migration. Idempotent and safe to re-run.

revoke execute on function public.subscribe_homepage(text, text, text)
  from public, anon, authenticated;
grant execute on function public.subscribe_homepage(text, text, text)
  to service_role;

revoke execute on function public.unsubscribe_homepage(text)
  from public, anon, authenticated;
grant execute on function public.unsubscribe_homepage(text)
  to service_role;

-- Verification: both rows should report false.
select
  has_function_privilege('anon', 'public.subscribe_homepage(text,text,text)', 'execute')
    as anon_can_subscribe,
  has_function_privilege('authenticated', 'public.subscribe_homepage(text,text,text)', 'execute')
    as authenticated_can_subscribe;
