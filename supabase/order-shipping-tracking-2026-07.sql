-- Shipment details for admin-managed order fulfillment.
-- Safe to run more than once.

alter table public.orders
  add column if not exists shipping_carrier text,
  add column if not exists tracking_number text;

comment on column public.orders.shipping_carrier is
  'Carrier saved by an admin when an order is marked shipped.';

comment on column public.orders.tracking_number is
  'Carrier tracking number saved by an admin for buyer fulfillment updates.';
