-- Allow admin accounts to read the full account profile table.
-- Run in Supabase SQL Editor for existing projects.

alter table public.profiles enable row level security;

create or replace function public.is_admin_user(user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = user_id
      and is_admin = true
  );
$$;

drop policy if exists "Admins read all profiles" on public.profiles;
create policy "Admins read all profiles"
  on public.profiles for select
  using (public.is_admin_user(auth.uid()));

grant select on public.profiles to authenticated;
