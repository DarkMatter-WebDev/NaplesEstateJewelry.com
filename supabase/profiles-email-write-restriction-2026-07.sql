-- ============================================================================
-- Stop the browser (authenticated role) from writing profiles.email  (audit M3).
-- Run AFTER security-hardening-2026-07.sql (which grants the column list incl.
-- email) and AFTER the AccountProfileForm change that stops sending email is
-- deployed. Idempotent.
-- ============================================================================
--
-- profiles.email is populated at signup by handle_new_user() from auth.users.email
-- (that trigger runs as the table owner, so it is unaffected by these column
-- grants), and admin/service-role writes bypass column grants too. Only the
-- self-service profile form wrote it — which let a user set their own row's email
-- to an arbitrary third-party address that the marketing audience query keys on.

revoke insert (email), update (email) on public.profiles from authenticated;

-- ROLLBACK (uncomment to revert):
-- grant insert (email), update (email) on public.profiles to authenticated;
