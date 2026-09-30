-- Add per-line item discounts for manual orders and invoice emails.
-- Safe to run multiple times.

alter table public.order_items
  add column if not exists discount numeric(12,2) not null default 0;
