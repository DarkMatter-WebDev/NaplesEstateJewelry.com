-- Grant Storage GC reference reads to the service-role API client.
-- Safe to rerun.

grant select on public.products to service_role;
grant select on public.order_items to service_role;
grant select on public.inquiries to service_role;
