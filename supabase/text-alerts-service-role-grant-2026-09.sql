-- Text alerts: the service role could not touch its own tables (found
-- 2026-09-17, the day Twilio verified the number).
--
-- text-deals-2026-09.sql created text_deals, text_deal_sends, text_inbound
-- and text_system_messages with RLS on and `revoke all … from anon,
-- authenticated` — correct, the browser must never read them — but it never
-- GRANTED service_role, and service_role bypasses RLS, not table privileges.
-- Every server path (the confirmation sender, the 15-minute sweep, the Text
-- Deals admin, both Twilio webhooks) uses the service client, so on first
-- real use each one would fail with "permission denied for table …". Same
-- class of gap as invoices-service-role-grant-2026-09.sql.
--
-- Rev 2 (same day): the first "Send to 1" failed with "permission denied for
-- sequence text_deal_sends_id_seq" — every bigserial id needs its sequence
-- granted too, not only text_system_messages'. This revision grants every
-- sequence owned by the four tables, whatever it is called.
--
-- Run once in the Supabase SQL Editor. Safe to re-run.

grant select, insert, update, delete on public.text_deals          to service_role;
grant select, insert, update, delete on public.text_deal_sends     to service_role;
grant select, insert, update, delete on public.text_inbound        to service_role;
grant select, insert, update, delete on public.text_system_messages to service_role;

-- Every sequence any of the four tables owns (bigserial ids).
do $$
declare seq record;
begin
  for seq in
    select s.relname
    from pg_class s
    join pg_depend d on d.objid = s.oid and d.deptype = 'a'
    join pg_class t on t.oid = d.refobjid
    join pg_namespace n on n.oid = t.relnamespace and n.nspname = 'public'
    where s.relkind = 'S'
      and t.relname in ('text_deals', 'text_deal_sends', 'text_inbound', 'text_system_messages')
  loop
    execute format('grant usage, select on sequence public.%I to service_role', seq.relname);
  end loop;
end $$;

-- The subscriber list is read and updated by the same code (pending → confirmed,
-- attempt counters, STOP). Harmless if already granted.
grant select, insert, update on public.homepage_subscribers to service_role;

-- Verify (expect four rows of SELECT/INSERT/UPDATE/DELETE per table, and one
-- USAGE row per sequence):
-- select table_name, privilege_type from information_schema.role_table_grants
--  where grantee = 'service_role' and table_name like 'text_%' order by 1, 2;
-- select sequence_name from information_schema.sequences where sequence_schema = 'public' and sequence_name like 'text_%';
