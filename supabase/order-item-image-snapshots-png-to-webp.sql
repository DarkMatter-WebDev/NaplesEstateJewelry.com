-- Repoint historical order item image snapshots from deleted local shop PNGs to WebP.
-- Safe to rerun. Scope is intentionally limited to local /assets/images/shop/*.png snapshots.
-- Keep the runtime normalizer in the app for browser localStorage cart/wishlist snapshots.

with updated as (
  update public.order_items
  set image_snapshot = regexp_replace(image_snapshot, '\.png$', '.webp', 'i')
  where image_snapshot like '/assets/images/shop/%.png'
  returning id, order_id, product_id, image_snapshot
)
select count(*) as updated_order_items
from updated;

-- Verification: should return zero rows after the update above.
select id, order_id, product_id, title_snapshot, image_snapshot
from public.order_items
where image_snapshot like '/assets/images/shop/%.png'
order by order_id, id;
