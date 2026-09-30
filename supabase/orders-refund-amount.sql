-- Adds refund_amount to orders for tracking partial refunds.
-- Run in Supabase SQL Editor (safe to re-run — uses IF NOT EXISTS).
alter table public.orders
  add column if not exists refund_amount numeric(12,2);
