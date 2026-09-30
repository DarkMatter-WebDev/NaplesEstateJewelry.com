-- Adds customer-attached photo URLs to admin message-center notifications.
--
-- Used by the public "Message Us Directly" contact form (/api/contact-message) so
-- photos submitted with a message surface in /admin/messages. Photo bytes live in
-- Supabase Storage (product-images bucket, under the messages/ prefix); this column
-- stores URL strings only, matching the products/order_items/inquiries pattern.
--
-- The Storage GC reference scan (/api/admin/storage-gc) reads this column so these
-- message photos are never treated as orphans.
--
-- Safe to re-run.

alter table public.admin_notifications
  add column if not exists image_urls jsonb not null default '[]'::jsonb;
