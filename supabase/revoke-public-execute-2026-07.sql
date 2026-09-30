-- ============================================================================
-- CRITICAL — Revoke the default PUBLIC EXECUTE grant on sensitive RPCs.
-- Run AFTER security-hardening-2026-07.sql and
-- products-internal-columns-authenticated-2026-07.sql.
-- ============================================================================
--
-- Why this exists: Postgres grants EXECUTE on every function to the built-in
-- PUBLIC role by default, and PostgREST exposes those functions to the `anon`
-- role. `REVOKE EXECUTE ... FROM anon, authenticated` (as in
-- security-hardening-2026-07.sql) does NOT remove the PUBLIC grant, so an
-- anonymous caller can still reach these SECURITY DEFINER functions via
-- POST /rest/v1/rpc/<name>. For the payment functions that means an anonymous
-- visitor with a known order UUID could mark an order paid + products sold
-- without paying, force a refund, or flip the whole catalog to pending_payment.
--
-- This migration removes the PUBLIC grant on exactly the sensitive functions and
-- stops future functions from inheriting a PUBLIC execute grant. It is idempotent
-- and safe to re-run.
--
-- ---------------------------------------------------------------------------
-- BEFORE (optional) — confirm the hole is/was live. Any row whose proacl is NULL
-- or contains "=X/" is executable by PUBLIC:
--   select proname, proacl
--   from pg_proc
--   where pronamespace = 'public'::regnamespace and prosecdef
--   order by proname;
-- ---------------------------------------------------------------------------

-- Payment / order money-movement functions: service_role only.
revoke execute on function public.create_checkout_order(jsonb, jsonb) from public;
revoke execute on function public.create_paypal_order(jsonb, jsonb) from public;
revoke execute on function public.capture_paypal_order(uuid, text, jsonb) from public;
revoke execute on function public.apply_paypal_order_event(uuid, text, jsonb) from public;

grant execute on function public.create_checkout_order(jsonb, jsonb) to service_role;
grant execute on function public.create_paypal_order(jsonb, jsonb) to service_role;
grant execute on function public.capture_paypal_order(uuid, text, jsonb) to service_role;
grant execute on function public.apply_paypal_order_event(uuid, text, jsonb) to service_role;

-- unsubscribe_homepage: the app's /api/unsubscribe route uses the service role +
-- a direct table update, NOT this RPC. Left anon-callable it is a marketing-
-- suppression primitive AND an account-existence oracle (its boolean return
-- reflects whether the email has a profile row). Lock it to service_role.
-- (subscribe_homepage is intentionally left anon-callable — /api/subscribe calls
--  it as the anon role; that route is now IP rate-limited in app code.)
do $$
begin
  if exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace and proname = 'unsubscribe_homepage'
  ) then
    execute 'revoke execute on function public.unsubscribe_homepage(text) from public, anon, authenticated';
    execute 'grant execute on function public.unsubscribe_homepage(text) to service_role';
  end if;
end $$;

-- Stop NEW functions created in this schema (by the current role) from being
-- granted EXECUTE to PUBLIC automatically. Does not affect existing functions.
alter default privileges in schema public revoke execute on functions from public;

-- ---------------------------------------------------------------------------
-- AFTER — re-run the probe above; the four payment functions (and
-- unsubscribe_homepage) should no longer show a PUBLIC "=X/" entry.
-- ---------------------------------------------------------------------------
