-- Product inquiry tracking table
-- Run in Supabase SQL Editor

create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  item_title text not null,
  name text not null,
  phone text not null,
  email text,
  message text not null,
  status text not null default 'new',  -- new | read | replied
  created_at timestamptz not null default now()
);

alter table public.inquiries enable row level security;

drop policy if exists "Public insert inquiries" on public.inquiries;
create policy "Public insert inquiries"
  on public.inquiries for insert
  with check (true);

drop policy if exists "Admins read inquiries" on public.inquiries;
create policy "Admins read inquiries"
  on public.inquiries for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "Admins update inquiries" on public.inquiries;
create policy "Admins update inquiries"
  on public.inquiries for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

grant usage on schema public to anon;
grant insert on public.inquiries to anon;
grant select, update on public.inquiries to authenticated;
