-- ============================================================
--  Order change history (2026-11-24 (11)): every change made with
--  Admin → Orders → "Edit order" or "Fix name" — who, when, and each
--  field before → after. Shown in the order page's Change history card.
--  Run ONCE in the Supabase SQL Editor (project evzluixourmsefwdsieu).
--  Safe to re-run.
--
--  Without it, Edit order and Fix name still work; the page says the history
--  could not be kept until this runs. Nothing else is touched.
-- ============================================================

create table if not exists public.order_changes (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders(id) on delete cascade,
  changed_at       timestamptz not null default now(),
  changed_by_email text,
  source           text not null default 'edit' check (source in ('edit', 'fix_name')),
  -- [{ "label": "Phone", "before": "(239) 555-011", "after": "(239) 555-0110" }, …]
  changes          jsonb not null default '[]'::jsonb,
  money_changed    boolean not null default false
);

create index if not exists order_changes_order_idx on public.order_changes (order_id, changed_at desc);

comment on table public.order_changes is
  'Admin → Orders: Edit order / Fix name history (who, when, before → after). Written by the server only.';

alter table public.order_changes enable row level security;

drop policy if exists "Admins read order changes" on public.order_changes;
create policy "Admins read order changes" on public.order_changes
  for select using (public.is_admin_user(auth.uid()));

grant select on public.order_changes to authenticated;
grant select, insert on public.order_changes to service_role;

notify pgrst, 'reload schema';

-- Verify — expect ONE row, every value true.
select
  to_regclass('public.order_changes') is not null                              as history_table,
  has_table_privilege('service_role', 'public.order_changes', 'INSERT')       as server_can_write,
  has_table_privilege('authenticated', 'public.order_changes', 'SELECT')      as admin_can_read;

-- Rollback (if ever needed):
-- drop table if exists public.order_changes;
