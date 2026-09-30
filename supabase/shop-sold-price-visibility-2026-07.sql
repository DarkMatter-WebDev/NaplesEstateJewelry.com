-- Optional customer-facing price mask for sold shop items.
-- Safe to run more than once.

alter table public.shop_settings
  add column if not exists hide_sold_item_prices boolean not null default false;

grant select on public.shop_settings to anon, authenticated;
grant select, insert, update on public.shop_settings to service_role;

notify pgrst, 'reload schema';
