-- Repoint DB-backed local shop product image paths from JPG to WebP.
-- Covers the two listing-06 photos that were added as JPG (IMG_4939/IMG_4946)
-- and were NOT part of the earlier PNG→WebP migration.
-- Safe to rerun. Does not touch non-shop assets or non-listed paths.

with image_path_map(old_path, new_path) as (
  values
    ('/assets/images/shop/shop-new-listing-06-04.jpg', '/assets/images/shop/shop-new-listing-06-04.webp'),
    ('/assets/images/shop/shop-new-listing-06-05.jpg', '/assets/images/shop/shop-new-listing-06-05.webp')
), updated as (
  update public.products as p
  set
    images = coalesce((
      select jsonb_agg(to_jsonb(coalesce(m.new_path, e.value)) order by e.ordinality)
      from jsonb_array_elements_text(p.images) with ordinality as e(value, ordinality)
      left join image_path_map as m on m.old_path = e.value
    ), '[]'::jsonb),
    image_urls = coalesce((
      select jsonb_agg(to_jsonb(coalesce(m.new_path, e.value)) order by e.ordinality)
      from jsonb_array_elements_text(p.image_urls) with ordinality as e(value, ordinality)
      left join image_path_map as m on m.old_path = e.value
    ), '[]'::jsonb)
  where exists (
    select 1
    from jsonb_array_elements_text(p.images) as e(value)
    join image_path_map as m on m.old_path = e.value
  ) or exists (
    select 1
    from jsonb_array_elements_text(p.image_urls) as e(value)
    join image_path_map as m on m.old_path = e.value
  )
  returning p.id
)
select count(*) as updated_products
from updated;

-- Verification: should return zero rows after the update above.
select p.id, p.title, remaining.path
from public.products as p
cross join lateral (
  select e.value as path
  from jsonb_array_elements_text(p.images) as e(value)
  where e.value like '/assets/images/shop/shop-new-listing-06-0%.jpg'
  union
  select e.value as path
  from jsonb_array_elements_text(p.image_urls) as e(value)
  where e.value like '/assets/images/shop/shop-new-listing-06-0%.jpg'
) as remaining
order by p.title, remaining.path;
