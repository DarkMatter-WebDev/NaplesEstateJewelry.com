-- =====================================================================
--  FIX: deleting admin messages ("permission denied for table
--  admin_notifications"). Run this ENTIRE script once in the Supabase
--  SQL Editor, on project ref:  evzluixourmsefwdsieu
-- =====================================================================
--
--  Why this works when the plain GRANT did not:
--  This creates a SECURITY DEFINER function -- the EXACT same mechanism as
--  create_checkout_order(), which already runs successfully in this
--  database. A SECURITY DEFINER function executes with the privileges of
--  its OWNER (the postgres role), so it does NOT depend on service_role or
--  authenticated having a table-level DELETE grant. It does its own admin
--  check internally, then deletes.
--
--  Safe to re-run (create or replace + idempotent grant).
-- =====================================================================

create or replace function public.delete_admin_notifications(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  -- Only an admin may delete notifications.
  if not public.is_admin_user(auth.uid()) then
    raise exception 'Not authorized';
  end if;

  delete from public.admin_notifications
  where id = any(p_ids);

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

grant execute on function public.delete_admin_notifications(uuid[]) to authenticated;

-- Make PostgREST pick up the new function immediately.
notify pgrst, 'reload schema';

-- VERIFY -- should return one row naming the function. If zero rows, the
-- function did not get created (wrong project / no permission).
select proname
from pg_proc
where proname = 'delete_admin_notifications';
