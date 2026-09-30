-- =====================================================================
--  Recycle Bin for admin messages (soft delete).
--  Run this ENTIRE script once in the Supabase SQL Editor,
--  on project ref:  evzluixourmsefwdsieu
-- =====================================================================
--
--  "Delete Selected" now moves messages to a Recycle Bin (sets deleted_at)
--  instead of removing them. From the bin, an admin can Restore them or
--  Delete Forever. All three mutations run through SECURITY DEFINER
--  functions -- the same proven pattern as create_checkout_order and
--  delete_admin_notifications -- so they never depend on table-level
--  grants to service_role / authenticated.
--
--  Safe to re-run (idempotent).
-- =====================================================================

-- 1) Soft-delete column.
alter table public.admin_notifications
  add column if not exists deleted_at timestamptz;

-- Partial index so the inbox query (deleted_at is null) stays fast.
create index if not exists admin_notifications_active_idx
  on public.admin_notifications (created_at desc)
  where deleted_at is null;

-- 2) Move to Recycle Bin. Also marks read so trashed items stop counting
--    toward the unread badge (which keys off is_read = false everywhere).
create or replace function public.trash_admin_notifications(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare affected integer;
begin
  if not public.is_admin_user(auth.uid()) then
    raise exception 'Not authorized';
  end if;

  update public.admin_notifications
  set deleted_at = now(), is_read = true
  where id = any(p_ids) and deleted_at is null;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- 3) Restore from Recycle Bin back to the inbox.
create or replace function public.restore_admin_notifications(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare affected integer;
begin
  if not public.is_admin_user(auth.uid()) then
    raise exception 'Not authorized';
  end if;

  update public.admin_notifications
  set deleted_at = null
  where id = any(p_ids);

  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- 4) delete_admin_notifications(uuid[]) already exists from the previous
--    migration and performs the permanent "Delete Forever" hard delete.
--    (Re-created here for completeness in case this script is run first.)
create or replace function public.delete_admin_notifications(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare affected integer;
begin
  if not public.is_admin_user(auth.uid()) then
    raise exception 'Not authorized';
  end if;

  delete from public.admin_notifications
  where id = any(p_ids);

  get diagnostics affected = row_count;
  return affected;
end;
$$;

grant execute on function public.trash_admin_notifications(uuid[]) to authenticated;
grant execute on function public.restore_admin_notifications(uuid[]) to authenticated;
grant execute on function public.delete_admin_notifications(uuid[]) to authenticated;

notify pgrst, 'reload schema';

-- VERIFY -- should return three rows.
select proname
from pg_proc
where proname in (
  'trash_admin_notifications',
  'restore_admin_notifications',
  'delete_admin_notifications'
)
order by proname;
