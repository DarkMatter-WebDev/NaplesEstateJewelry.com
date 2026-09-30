-- ============================================================================
-- Restrict which profile columns `authenticated` can READ.
-- Complements security-hardening-2026-07.sql (which restricted writes).
-- Idempotent; safe to re-run.
-- ============================================================================
--
-- Problem (audit M1): `authenticated` had table-wide SELECT on profiles, and the
-- "Users read own profile" RLS policy let a customer read their OWN row — which
-- includes `internal_notes` (private staff notes about that customer) and
-- `account_type`. Re-grant SELECT on every column EXCEPT those two.
--
-- KEPT readable on purpose (the app needs them under the authenticated role):
--   is_admin  — read by requireAdmin() + every admin page guard
--   is_vip    — shown in the admin users list
--   email, name, phone, address, marketing_* — account + checkout prefill
-- The admin *users list* runs under the admin's own authenticated session, so it
-- must keep reading is_vip/is_admin; RLS still limits non-admins to their own row.

revoke select on public.profiles from authenticated;

do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ')
    into cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'profiles'
     and column_name not in ('internal_notes', 'account_type');
  execute format('grant select (%s) on public.profiles to authenticated', cols);
end $$;

-- ---------------------------------------------------------------------------
-- NOTE (audit M3, NOT done here — needs an app change): profiles.email is still
-- user-writable (AccountProfileForm upserts it), so a user can set their profile
-- email to someone else's. This is low impact (it's their own row; the real login
-- email lives in auth.users and is unaffected). To close it, stop the form from
-- writing `email`, sync it from auth.users, then add `email` to the excluded
-- write-columns in security-hardening-2026-07.sql. Left as a follow-up.
-- ---------------------------------------------------------------------------

-- ROLLBACK (uncomment to revert):
-- grant select on public.profiles to authenticated;
