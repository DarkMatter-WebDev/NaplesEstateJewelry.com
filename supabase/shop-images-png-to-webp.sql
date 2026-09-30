-- Repoint DB-backed local shop product image paths from PNG to WebP.
-- Generated from confirmed files under next-app/public/assets/images/shop.
-- Safe to rerun. Does not touch non-shop assets or non-listed paths.

with image_path_map(old_path, new_path) as (
  values
    ('/assets/images/shop/shop-10k-cuban-chain-01.png', '/assets/images/shop/shop-10k-cuban-chain-01.webp'),
    ('/assets/images/shop/shop-10k-cuban-chain-02.png', '/assets/images/shop/shop-10k-cuban-chain-02.webp'),
    ('/assets/images/shop/shop-10k-cuban-chain-03.png', '/assets/images/shop/shop-10k-cuban-chain-03.webp'),
    ('/assets/images/shop/shop-10k-cuban-chain-04.png', '/assets/images/shop/shop-10k-cuban-chain-04.webp'),
    ('/assets/images/shop/shop-10k-cuban-chain-05.png', '/assets/images/shop/shop-10k-cuban-chain-05.webp'),
    ('/assets/images/shop/shop-10k-cuban-chain-06.png', '/assets/images/shop/shop-10k-cuban-chain-06.webp'),
    ('/assets/images/shop/shop-10k-hollow-cuban-chain-necklace-01.png', '/assets/images/shop/shop-10k-hollow-cuban-chain-necklace-01.webp'),
    ('/assets/images/shop/shop-10k-hollow-cuban-chain-necklace-02.png', '/assets/images/shop/shop-10k-hollow-cuban-chain-necklace-02.webp'),
    ('/assets/images/shop/shop-10k-hollow-cuban-chain-necklace-03.png', '/assets/images/shop/shop-10k-hollow-cuban-chain-necklace-03.webp'),
    ('/assets/images/shop/shop-10k-hollow-cuban-chain-necklace-04.png', '/assets/images/shop/shop-10k-hollow-cuban-chain-necklace-04.webp'),
    ('/assets/images/shop/shop-10k-hollow-cuban-chain-necklace-05.png', '/assets/images/shop/shop-10k-hollow-cuban-chain-necklace-05.webp'),
    ('/assets/images/shop/shop-10k-hollow-cuban-chain-necklace-06.png', '/assets/images/shop/shop-10k-hollow-cuban-chain-necklace-06.webp'),
    ('/assets/images/shop/shop-10k-hollow-cuban-chain-necklace-07.png', '/assets/images/shop/shop-10k-hollow-cuban-chain-necklace-07.webp'),
    ('/assets/images/shop/shop-10k-hollow-cuban-chain-necklace-08.png', '/assets/images/shop/shop-10k-hollow-cuban-chain-necklace-08.webp'),
    ('/assets/images/shop/shop-10k-monaco-edge-cuban-chain-01.png', '/assets/images/shop/shop-10k-monaco-edge-cuban-chain-01.webp'),
    ('/assets/images/shop/shop-10k-monaco-edge-cuban-chain-02.png', '/assets/images/shop/shop-10k-monaco-edge-cuban-chain-02.webp'),
    ('/assets/images/shop/shop-10k-monaco-edge-cuban-chain-03.png', '/assets/images/shop/shop-10k-monaco-edge-cuban-chain-03.webp'),
    ('/assets/images/shop/shop-10k-monaco-edge-cuban-chain-04.png', '/assets/images/shop/shop-10k-monaco-edge-cuban-chain-04.webp'),
    ('/assets/images/shop/shop-10k-monaco-edge-cuban-chain-05.png', '/assets/images/shop/shop-10k-monaco-edge-cuban-chain-05.webp'),
    ('/assets/images/shop/shop-10k-monaco-edge-cuban-chain-06.png', '/assets/images/shop/shop-10k-monaco-edge-cuban-chain-06.webp'),
    ('/assets/images/shop/shop-10k-monaco-edge-cuban-chain-07.png', '/assets/images/shop/shop-10k-monaco-edge-cuban-chain-07.webp'),
    ('/assets/images/shop/shop-10k-monaco-edge-cuban-chain-08.png', '/assets/images/shop/shop-10k-monaco-edge-cuban-chain-08.webp'),
    ('/assets/images/shop/shop-10k-monaco-edge-cuban-chain-09.png', '/assets/images/shop/shop-10k-monaco-edge-cuban-chain-09.webp'),
    ('/assets/images/shop/shop-10k-monaco-edge-cuban-chain-10.png', '/assets/images/shop/shop-10k-monaco-edge-cuban-chain-10.webp'),
    ('/assets/images/shop/shop-10k-monaco-edge-cuban-chain-11.png', '/assets/images/shop/shop-10k-monaco-edge-cuban-chain-11.webp'),
    ('/assets/images/shop/shop-10k-semi-solid-cuban-link-6mm-chain-01.png', '/assets/images/shop/shop-10k-semi-solid-cuban-link-6mm-chain-01.webp'),
    ('/assets/images/shop/shop-10k-semi-solid-cuban-link-6mm-chain-02.png', '/assets/images/shop/shop-10k-semi-solid-cuban-link-6mm-chain-02.webp'),
    ('/assets/images/shop/shop-10k-semi-solid-cuban-link-6mm-chain-03.png', '/assets/images/shop/shop-10k-semi-solid-cuban-link-6mm-chain-03.webp'),
    ('/assets/images/shop/shop-10k-semi-solid-cuban-link-6mm-chain-04.png', '/assets/images/shop/shop-10k-semi-solid-cuban-link-6mm-chain-04.webp'),
    ('/assets/images/shop/shop-10k-semi-solid-cuban-link-6mm-chain-05.png', '/assets/images/shop/shop-10k-semi-solid-cuban-link-6mm-chain-05.webp'),
    ('/assets/images/shop/shop-10k-semi-solid-cuban-link-6mm-chain-06.png', '/assets/images/shop/shop-10k-semi-solid-cuban-link-6mm-chain-06.webp'),
    ('/assets/images/shop/shop-10k-semi-solid-cuban-link-6mm-chain-07.png', '/assets/images/shop/shop-10k-semi-solid-cuban-link-6mm-chain-07.webp'),
    ('/assets/images/shop/shop-14k-byzantine-link-chain-01.png', '/assets/images/shop/shop-14k-byzantine-link-chain-01.webp'),
    ('/assets/images/shop/shop-14k-byzantine-link-chain-02.png', '/assets/images/shop/shop-14k-byzantine-link-chain-02.webp'),
    ('/assets/images/shop/shop-14k-byzantine-link-chain-03.png', '/assets/images/shop/shop-14k-byzantine-link-chain-03.webp'),
    ('/assets/images/shop/shop-14k-byzantine-link-chain-04.png', '/assets/images/shop/shop-14k-byzantine-link-chain-04.webp'),
    ('/assets/images/shop/shop-14k-byzantine-link-chain-05.png', '/assets/images/shop/shop-14k-byzantine-link-chain-05.webp'),
    ('/assets/images/shop/shop-14k-byzantine-link-chain-06.png', '/assets/images/shop/shop-14k-byzantine-link-chain-06.webp'),
    ('/assets/images/shop/shop-14k-curb-link-bracelet-01.png', '/assets/images/shop/shop-14k-curb-link-bracelet-01.webp'),
    ('/assets/images/shop/shop-14k-curb-link-bracelet-02.png', '/assets/images/shop/shop-14k-curb-link-bracelet-02.webp'),
    ('/assets/images/shop/shop-14k-curb-link-bracelet-03.png', '/assets/images/shop/shop-14k-curb-link-bracelet-03.webp'),
    ('/assets/images/shop/shop-14k-curb-link-bracelet-04.png', '/assets/images/shop/shop-14k-curb-link-bracelet-04.webp'),
    ('/assets/images/shop/shop-14k-curb-link-bracelet-05.png', '/assets/images/shop/shop-14k-curb-link-bracelet-05.webp'),
    ('/assets/images/shop/shop-14k-curb-link-bracelet-06.png', '/assets/images/shop/shop-14k-curb-link-bracelet-06.webp'),
    ('/assets/images/shop/shop-14k-curb-link-bracelet-07.png', '/assets/images/shop/shop-14k-curb-link-bracelet-07.webp'),
    ('/assets/images/shop/shop-14k-curb-link-bracelet-08.png', '/assets/images/shop/shop-14k-curb-link-bracelet-08.webp'),
    ('/assets/images/shop/shop-14k-curb-link-bracelet-09.png', '/assets/images/shop/shop-14k-curb-link-bracelet-09.webp'),
    ('/assets/images/shop/shop-14k-curb-link-bracelet-10.png', '/assets/images/shop/shop-14k-curb-link-bracelet-10.webp'),
    ('/assets/images/shop/shop-14k-heavy-diamond-cut-cuban-chain-01.png', '/assets/images/shop/shop-14k-heavy-diamond-cut-cuban-chain-01.webp'),
    ('/assets/images/shop/shop-14k-heavy-diamond-cut-cuban-chain-02.png', '/assets/images/shop/shop-14k-heavy-diamond-cut-cuban-chain-02.webp'),
    ('/assets/images/shop/shop-14k-heavy-diamond-cut-cuban-chain-03.png', '/assets/images/shop/shop-14k-heavy-diamond-cut-cuban-chain-03.webp'),
    ('/assets/images/shop/shop-14k-heavy-diamond-cut-cuban-chain-04.png', '/assets/images/shop/shop-14k-heavy-diamond-cut-cuban-chain-04.webp'),
    ('/assets/images/shop/shop-14k-heavy-diamond-cut-cuban-chain-05.png', '/assets/images/shop/shop-14k-heavy-diamond-cut-cuban-chain-05.webp'),
    ('/assets/images/shop/shop-14k-heavy-diamond-cut-cuban-chain-06.png', '/assets/images/shop/shop-14k-heavy-diamond-cut-cuban-chain-06.webp'),
    ('/assets/images/shop/shop-14k-heavy-diamond-cut-cuban-chain-07.png', '/assets/images/shop/shop-14k-heavy-diamond-cut-cuban-chain-07.webp'),
    ('/assets/images/shop/shop-14k-heavy-diamond-cut-cuban-chain-08.png', '/assets/images/shop/shop-14k-heavy-diamond-cut-cuban-chain-08.webp'),
    ('/assets/images/shop/shop-14k-infinity-rope-chain-01.png', '/assets/images/shop/shop-14k-infinity-rope-chain-01.webp'),
    ('/assets/images/shop/shop-14k-infinity-rope-chain-02.png', '/assets/images/shop/shop-14k-infinity-rope-chain-02.webp'),
    ('/assets/images/shop/shop-14k-infinity-rope-chain-03.png', '/assets/images/shop/shop-14k-infinity-rope-chain-03.webp'),
    ('/assets/images/shop/shop-14k-infinity-rope-chain-04.png', '/assets/images/shop/shop-14k-infinity-rope-chain-04.webp'),
    ('/assets/images/shop/shop-14k-infinity-rope-chain-05.png', '/assets/images/shop/shop-14k-infinity-rope-chain-05.webp'),
    ('/assets/images/shop/shop-14k-infinity-rope-chain-06.png', '/assets/images/shop/shop-14k-infinity-rope-chain-06.webp'),
    ('/assets/images/shop/shop-14k-oval-link-chain-necklace-01.png', '/assets/images/shop/shop-14k-oval-link-chain-necklace-01.webp'),
    ('/assets/images/shop/shop-14k-oval-link-chain-necklace-02.png', '/assets/images/shop/shop-14k-oval-link-chain-necklace-02.webp'),
    ('/assets/images/shop/shop-14k-oval-link-chain-necklace-03.png', '/assets/images/shop/shop-14k-oval-link-chain-necklace-03.webp'),
    ('/assets/images/shop/shop-14k-oval-link-chain-necklace-04.png', '/assets/images/shop/shop-14k-oval-link-chain-necklace-04.webp'),
    ('/assets/images/shop/shop-14k-oval-link-chain-necklace-05.png', '/assets/images/shop/shop-14k-oval-link-chain-necklace-05.webp'),
    ('/assets/images/shop/shop-14k-oval-link-chain-necklace-06.png', '/assets/images/shop/shop-14k-oval-link-chain-necklace-06.webp'),
    ('/assets/images/shop/shop-14k-oval-link-chain-necklace-07.png', '/assets/images/shop/shop-14k-oval-link-chain-necklace-07.webp'),
    ('/assets/images/shop/shop-14k-oval-link-chain-necklace-08.png', '/assets/images/shop/shop-14k-oval-link-chain-necklace-08.webp'),
    ('/assets/images/shop/shop-14k-vintage-diamond-cut-figaro-chain-01.png', '/assets/images/shop/shop-14k-vintage-diamond-cut-figaro-chain-01.webp'),
    ('/assets/images/shop/shop-14k-vintage-diamond-cut-figaro-chain-02.png', '/assets/images/shop/shop-14k-vintage-diamond-cut-figaro-chain-02.webp'),
    ('/assets/images/shop/shop-14k-vintage-diamond-cut-figaro-chain-03.png', '/assets/images/shop/shop-14k-vintage-diamond-cut-figaro-chain-03.webp'),
    ('/assets/images/shop/shop-14k-vintage-diamond-cut-figaro-chain-04.png', '/assets/images/shop/shop-14k-vintage-diamond-cut-figaro-chain-04.webp'),
    ('/assets/images/shop/shop-18k-heraldic-cross-ring-01.png', '/assets/images/shop/shop-18k-heraldic-cross-ring-01.webp'),
    ('/assets/images/shop/shop-18k-heraldic-cross-ring-02.png', '/assets/images/shop/shop-18k-heraldic-cross-ring-02.webp'),
    ('/assets/images/shop/shop-18k-italian-anchor-link-infinity-chain-01.png', '/assets/images/shop/shop-18k-italian-anchor-link-infinity-chain-01.webp'),
    ('/assets/images/shop/shop-18k-italian-anchor-link-infinity-chain-02.png', '/assets/images/shop/shop-18k-italian-anchor-link-infinity-chain-02.webp'),
    ('/assets/images/shop/shop-18k-italian-anchor-link-infinity-chain-03.png', '/assets/images/shop/shop-18k-italian-anchor-link-infinity-chain-03.webp'),
    ('/assets/images/shop/shop-18k-italian-anchor-link-infinity-chain-04.png', '/assets/images/shop/shop-18k-italian-anchor-link-infinity-chain-04.webp'),
    ('/assets/images/shop/shop-18k-italian-anchor-link-infinity-chain-05.png', '/assets/images/shop/shop-18k-italian-anchor-link-infinity-chain-05.webp'),
    ('/assets/images/shop/shop-18k-italian-anchor-link-infinity-chain-06.png', '/assets/images/shop/shop-18k-italian-anchor-link-infinity-chain-06.webp'),
    ('/assets/images/shop/shop-18k-rectangular-anchor-link-chain-01.png', '/assets/images/shop/shop-18k-rectangular-anchor-link-chain-01.webp'),
    ('/assets/images/shop/shop-18k-rectangular-anchor-link-chain-02.png', '/assets/images/shop/shop-18k-rectangular-anchor-link-chain-02.webp'),
    ('/assets/images/shop/shop-18k-rectangular-anchor-link-chain-03.png', '/assets/images/shop/shop-18k-rectangular-anchor-link-chain-03.webp'),
    ('/assets/images/shop/shop-new-listing-01-01.png', '/assets/images/shop/shop-new-listing-01-01.webp'),
    ('/assets/images/shop/shop-new-listing-01-02.png', '/assets/images/shop/shop-new-listing-01-02.webp'),
    ('/assets/images/shop/shop-new-listing-01-03.png', '/assets/images/shop/shop-new-listing-01-03.webp'),
    ('/assets/images/shop/shop-new-listing-01-04.png', '/assets/images/shop/shop-new-listing-01-04.webp'),
    ('/assets/images/shop/shop-new-listing-01-05.png', '/assets/images/shop/shop-new-listing-01-05.webp'),
    ('/assets/images/shop/shop-new-listing-02-01.png', '/assets/images/shop/shop-new-listing-02-01.webp'),
    ('/assets/images/shop/shop-new-listing-02-02.png', '/assets/images/shop/shop-new-listing-02-02.webp'),
    ('/assets/images/shop/shop-new-listing-02-03.png', '/assets/images/shop/shop-new-listing-02-03.webp'),
    ('/assets/images/shop/shop-new-listing-02-04.png', '/assets/images/shop/shop-new-listing-02-04.webp'),
    ('/assets/images/shop/shop-new-listing-02-05.png', '/assets/images/shop/shop-new-listing-02-05.webp'),
    ('/assets/images/shop/shop-new-listing-03-01.png', '/assets/images/shop/shop-new-listing-03-01.webp'),
    ('/assets/images/shop/shop-new-listing-03-02.png', '/assets/images/shop/shop-new-listing-03-02.webp'),
    ('/assets/images/shop/shop-new-listing-03-03.png', '/assets/images/shop/shop-new-listing-03-03.webp'),
    ('/assets/images/shop/shop-new-listing-03-04.png', '/assets/images/shop/shop-new-listing-03-04.webp'),
    ('/assets/images/shop/shop-new-listing-03-05.png', '/assets/images/shop/shop-new-listing-03-05.webp'),
    ('/assets/images/shop/shop-new-listing-03-06.png', '/assets/images/shop/shop-new-listing-03-06.webp'),
    ('/assets/images/shop/shop-new-listing-03-07.png', '/assets/images/shop/shop-new-listing-03-07.webp'),
    ('/assets/images/shop/shop-new-listing-04-01.png', '/assets/images/shop/shop-new-listing-04-01.webp'),
    ('/assets/images/shop/shop-new-listing-04-02.png', '/assets/images/shop/shop-new-listing-04-02.webp'),
    ('/assets/images/shop/shop-new-listing-04-03.png', '/assets/images/shop/shop-new-listing-04-03.webp'),
    ('/assets/images/shop/shop-new-listing-04-04.png', '/assets/images/shop/shop-new-listing-04-04.webp'),
    ('/assets/images/shop/shop-new-listing-05-01.png', '/assets/images/shop/shop-new-listing-05-01.webp'),
    ('/assets/images/shop/shop-new-listing-05-02.png', '/assets/images/shop/shop-new-listing-05-02.webp'),
    ('/assets/images/shop/shop-new-listing-05-03.png', '/assets/images/shop/shop-new-listing-05-03.webp'),
    ('/assets/images/shop/shop-new-listing-05-04.png', '/assets/images/shop/shop-new-listing-05-04.webp'),
    ('/assets/images/shop/shop-new-listing-05-05.png', '/assets/images/shop/shop-new-listing-05-05.webp'),
    ('/assets/images/shop/shop-new-listing-06-01.png', '/assets/images/shop/shop-new-listing-06-01.webp'),
    ('/assets/images/shop/shop-new-listing-06-02.png', '/assets/images/shop/shop-new-listing-06-02.webp'),
    ('/assets/images/shop/shop-new-listing-06-03.png', '/assets/images/shop/shop-new-listing-06-03.webp')
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
  where e.value like '/assets/images/shop/%.png'
  union
  select e.value as path
  from jsonb_array_elements_text(p.image_urls) as e(value)
  where e.value like '/assets/images/shop/%.png'
) as remaining
order by p.title, remaining.path;
