-- Automatic invoices never got written (found 2026-09-16).
--
-- `public.invoices` was granted to `authenticated` only (sales-workflow.sql),
-- so the admin "Generate invoice" button works, but every AUTOMATIC upsert
-- made with the service role — after a PayPal capture (capture-order route
-- and the webhook backstop, via lib/order-finalize.ts), at PayPal order
-- creation (create-order route) and now after an in-store sale — has failed
-- with "permission denied for table invoices" and was only logged. The
-- receipt email still went out (order_emails is granted), which is why nobody
-- noticed: the order page just shows "No invoice generated yet" until an
-- admin clicks Generate invoice.
--
-- service_role bypasses RLS but NOT table privileges (see DECISIONS.md, the
-- PayPal gotchas). Run once in the Supabase SQL Editor. Safe to re-run.

grant select, insert, update on public.invoices to service_role;

-- The invoice number sequence, if the table uses one for invoice_number
-- defaults: grant usage so an insert can take the next value.
do $$
declare seq record;
begin
  for seq in
    select s.relname
    from pg_class s
    join pg_depend d on d.objid = s.oid and d.deptype = 'a'
    join pg_class t on t.oid = d.refobjid and t.relname = 'invoices'
    join pg_namespace n on n.oid = t.relnamespace and n.nspname = 'public'
    where s.relkind = 'S'
  loop
    execute format('grant usage, select on sequence public.%I to service_role', seq.relname);
  end loop;
end $$;

-- Verify (expect a row per privilege):
-- select privilege_type from information_schema.role_table_grants
--  where table_schema = 'public' and table_name = 'invoices' and grantee = 'service_role';
