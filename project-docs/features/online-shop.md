# Feature: Online Shop

> Current Next.js/Supabase shop behavior. Last updated: **2026-08-03**.

## Summary

The shop is the public storefront for curated estate inventory. It lives in the
Next.js app at `/shop` and `/shop/[id]`, with Spanish equivalents under `/es`.
The catalog is backed by the Supabase `products` table and priced live against
gold/silver spot data.

Customer controls acknowledge clicks immediately. Shop URL changes share an
instant loading overlay across filters, sort, year, view, and pagination.
Active view choices are disabled, cart checkout displays a busy label while
resolving authentication, and custom icon/plain buttons have a shared pressed
state. Async forms and PayPal retain their action-specific loading labels and
messages.

There is no active root static `shop.html`, `product.html`, or
`scripts/shop/shop-products.js` catalog anymore.

## Key Files

- `next-app/src/app/[locale]/shop/(list)/page.tsx` - shared shop listing
  renderer, filtering, sorting, pagination, hero, and server-side product query.
- `next-app/src/app/[locale]/shop/[id]/page.tsx` - product detail route.
- `next-app/src/components/shop/ProductCard.tsx` - public product card,
  image rendering, cart/wishlist affordances.
- `next-app/src/components/shop/ProductImageGallery.tsx` - product detail
  mixed image/video gallery, lazy Stream iframe, lightbox, and zoom behavior.
- `next-app/src/lib/product-gallery-thumbnails.ts` - circular thumbnail clone
  ordering and wrap-direction helpers shared by the gallery behavior and tests.
- `project-docs/features/product-videos.md` - Cloudflare Stream lifecycle,
  deployment, cleanup, and marketplace validation gates.
- `next-app/src/components/shop/ShopFilters.tsx` - public filter controls.
- `next-app/src/components/shop/ShopNavigationProgress.tsx` - shared pending
  navigation state and in-flight query composition for shop controls.
- `next-app/src/lib/shop-filter-state.ts` - category/type classification,
  conflicting-state normalization, and category/type URL transitions.
- `next-app/src/components/admin/AdminShell.tsx` - Product Admin inventory
  editor, image uploads, crop workflow, product save path.
- `next-app/src/types/product.ts` - product/status/taxonomy/image-padding
  contract.
- `next-app/src/lib/pricing.ts` and `next-app/src/lib/spot-price.ts` - display
  price and spot-price logic.
- `supabase/products.sql` plus additive migrations in `supabase/` - database
  schema and storage policies.

## Product Data

Supabase `products` is the source of truth. Important fields include:

- identity/order: `id`, `slug`, `inventory_number`, `sku`, `sort_order`
- status/location: `status`, `location`, `featured`
- copy: `title`, `title_es`, `description`, `description_es`, `public_notes`,
  `internal_notes`
- catalog taxonomy: `product_type`, `jewelry_type`, `chain_type`, `length`,
  `width_mm`, `brand`, `gender`
- metal/pricing: `category`, `metal_type`, `metal_variant`, `purity`,
  `weight_grams`, `gram_weight`, `price_mode`, `pricing_multiplier`,
  `manual_price_label` (`asking_price` remains a legacy DB fallback only)
- images: `images`, `image_urls`, `image_padding`,
  `image_padding_by_image`
- arrays: `tags`, `tags_es`, `details`, `details_es`

`image_urls` is preferred at render time, with `images` kept as compatibility
fallback. The current admin save path mirrors the same URL/path list into both
fields.

## Product Images

Image bytes are not stored in product rows.

- New admin uploads are compressed to WebP in the browser and uploaded to the
  Supabase Storage bucket `product-images`, under the `products/` folder.
- Product rows store only public Storage URLs or legacy local `/assets/...`
  paths.
- Local product/page images live under `next-app/public/assets`.
- `next-app/next.config.ts` allows the Supabase Storage public object host for
  optimized `next/image` rendering.

2026-06-20 audit:

- 48 live products.
- 321 image entries in `products.images` and 321 in `products.image_urls`.
- 0 `data:`/base64 inline image payloads.
- 28 products are Supabase Storage-only.
- 19 products are local-asset-only.
- 1 product mixes local assets and Storage URLs.
- All 202 DB-referenced Storage objects exist.
- The 91 old unreferenced Storage objects found by the audit were archived,
  deleted with a confirmed GC run, and followed by a dry-run showing 0 orphans
  and 0 deletable paths.
- DB-backed local shop PNG paths were migrated to WebP; the 114 repointed shop
  PNG originals were deleted, and no PNG files remain under
  `next-app/public/assets`.

2026-07-23 pre-deploy thumbnail audit:

- Gallery cards mount one cover initially and only the active image plus its
  immediate neighbors after carousel interaction.
- The 96-item view mounts 96 image elements, not every image in every product
  carousel. First-row covers are preloaded; later covers use native lazy
  loading, and offscreen cards use `content-visibility`.
- Eighty-one current covers use responsive Next image optimization. The 15
  legacy local covers remain unoptimized WebPs but are only 17.3-56.5 KiB.
- Normal desktop and mobile scrolling kept every visible image decoded. Very
  large synthetic scroll jumps briefly outran lazy loading, with visible images
  completing within 250 ms.
- A live sampled 256 px Netlify transform was a 3,992-byte WebP with a one-hour
  public cache and a confirmed edge hit.
- Development emitted no runtime errors. Two lazy-image LCP warnings remain a
  minor optional tuning target for the desktop second row and synthetic jump
  case.

Product-detail thumbnail rail:

- The page gallery and full-screen lightbox use the same circular rail.
  Advancing, selecting, or using keyboard arrows scrolls the active thumbnail
  and its logical next thumbnail into view.
- Two edge clones on each side make first/last boundary transitions continuous;
  clones are hidden from accessibility and the rail silently normalizes back
  to the equivalent original after scrolling.
- Horizontal touch scrolling remains enabled, but the platform scrollbar is
  hidden. Resize correction and reduced-motion handling keep the behavior
  stable from 320px mobile through wide desktop.
- The page and lightbox rail viewports snap down to an exact number of complete
  64px cards plus 8px gaps (up to six visible cards). Scroll offsets use the
  same card stride, so neither resting positions nor circular boundary wraps
  expose cut-off cards at the rail edges.
- Selection changes animate the real rail offset with an eased
  requestAnimationFrame flow (about 300 ms for one card). New input cancels and
  continues from the current offset; resize normalization pauses during motion;
  and edge-clone wraps normalize only from the animation completion callback.
  Reduced-motion preference bypasses the animation.

Product-detail summary metadata:

- Availability is an independent badge. Metal/purity and length are wrapped in
  one no-wrap specification group, so a constrained row moves both specs
  beneath the badge rather than leaving only length on a new line.
- The grouping is content-aware instead of tied to one viewport breakpoint,
  which preserves the compact one-line row whenever English or Spanish content
  genuinely fits and also handles narrow tablet grid columns.

## Pricing Logic

For spot-multiplier products:

```text
meltValue = spotPerGram * purityRatio * gramWeight
displayPrice = meltValue * pricingMultiplier
```

Gold and silver spot data are fetched server-side by `spot-price.ts` and exposed
through `/api/metal-prices`. Product detail pages also show melt/scrap context
and the spot basis used for the calculation. Manual-priced products use
`manual_price_label` instead of live multiplier pricing; checkout still keeps a
legacy `asking_price` fallback for older rows that have no label.
The product price-update ticker keeps its entire localized last-update,
countdown, and next-update sequence on one line. Fluid 8-9.92px label type,
compact tracking, and no-wrap styling preserve the full English and Spanish
copy from 320px phones through the narrow tablet product column without
clipping or truncation.
Bare numeric manual labels are normalized by `pricing.ts` (`1` -> `$1`,
`1200` -> `$1,200`) and parsed by the same helper in shop display, cart,
checkout, and order snapshots. New Item's **Quick add** mode sets manual fixed
pricing and skips spot-pricing requirements, supporting a basic title + price
listing without purity/weight/multiplier inputs.

## Structured Data (Product JSON-LD)

- Every product page emits `Product` + `Offer` JSON-LD built by
  `src/lib/product-ld.ts` (`productOfferLd`) from the canonical price value
  (`getProductPriceValue`) — never from the storefront label.
- Sold items: `price` = the recorded `sold_price` (else the last asking
  price) + `availability: SoldOut`, no `priceValidUntil`. The visible page
  still shows "Sold" / "Vendido" when "hide sold item prices" is on.
- In stock: live price + `InStock` + a two-day `priceValidUntil`.
- No numeric price at all (a manual "Contact for price" label): the page
  emits no Product schema (breadcrumb + store schema remain).
- Why (2026-09-16): Google requires `price` on every Offer; sold pages used
  to drop it and were flagged in Search Console. `DECISIONS.md` → *"Product
  schema: the Offer price is the canonical value…"*.

## Public Browse Behavior

- `/shop` is the single storefront entry route.
- The retired `/store` chooser and `/silver-tableware` merchandising route were
  removed on 2026-06-19.
- The modern shop page participates in the shared customer-facing loaded-block
  reveal for its hero/filter surfaces. Product cards keep their dedicated
  image-aware row-by-row reveal; broad gallery parents are excluded so lazy
  product images cannot hold the page hidden. Reduced-motion users skip the
  entrance animation.
- Multi-image modern gallery cards autoplay through photos while the image is
  hovered and show a three-pixel gold progress fill on the photo's bottom edge;
  the unfilled portion is transparent. The fill is
  `(active image + 1) / total images`, so arrow and autoplay changes
  remain synchronized and the final image is 100%. The indicator is absent
  from list view and single-image cards and removes its transition for reduced
  motion.
- Filters are URL-backed and include item group/type, metal, metal color,
  purity, brand, gender, length/size, width, price range, status, sort,
  and pagination.
- Status is a mutually exclusive Available/Sold radio pair. Available is the
  default for bare, cleared, and invalid URLs and is not counted as an extra
  active filter. Sold is selected only explicitly and is preserved as
  `?status=sold`. Spanish uses `Disponible` / `Vendido`.
- Necklace and Bracelet reveal their Link Type, Length, and Width controls
  immediately below Item Type and before Brand. Length accepts current readable
  URL values plus unitless, decimal-equivalent, `inches`, and quoted legacy
  forms; selected and stored values are compared as canonical positive inches.
  Add/Edit and AI writes store the same measurement as a bare canonical number.
- Width is a nullable millimeter measurement for Necklaces and Bracelets. The
  filter exposes Under 3 mm, 3-4.9 mm, 5-6.9 mm, 7-9.9 mm, and 10 mm+ as
  left-aligned checkbox buttons. Multiple ranges combine with OR semantics,
  then intersect normally with Length and all other active filters. Products
  with no width are excluded only while a Width range is active.
- Category (`Jewelry & Watches` / `Everything Else`) is an explicit optional
  scope. Selecting an Item Type does not infer a category or metal; it releases
  an active category because the specific type is the narrower visible intent.
- Item Type options are derived once from the full public (`available` or
  `sold`) catalog before shopper filters are applied. Types with zero public
  products are hidden, while every represented type remains visible as
  Category and other filters change. Cross-category type changes therefore
  never require Clear Filters.
- Brand options also remain catalog-wide while a category is active, so a
  selected brand never disappears from the menu.
- A direct/shared URL selecting an Item Type no longer represented in public
  inventory falls back to All items and clears type-owned chain/length/width
  state, avoiding an invisible zero-result constraint.
- Contradictory direct-link state is normalized before catalog filtering:
  Item Type wins over Category; when it supersedes Everything Else, that
  category's auto-owned Silver/color/purity constraints are removed too.
  Category-owned Silver/Gender rules are otherwise enforced, incompatible metal
  color/purity is ignored, and hidden link/length/width state is removed when
  the selected type cannot use it.
- Gallery tiles show eligible Necklace/Bracelet width beside the existing
  product measurements. List view renders the same width through the shared
  formatter as a fourth spec pill immediately after Length, preserving the
  view's denser layout while keeping buyer-visible attributes consistent.
- Text actions that need hover emphasis, including gallery and list product
  titles, use the shared `hover-underline-grow` interaction: a one-pixel line
  reveals left to right over 190 ms on hover or keyboard focus. Reduced-motion
  users receive the final state without animation; persistent/active
  underlines are not replaced.
- Filters, Sort, View, Year, and Pagination compose against one shared in-flight
  query state. A second change made before the first server render completes
  preserves the first change instead of replacing it from stale URL params.
- Pagination shows all pages for short result sets. Longer result sets retain
  the first, last, current, and adjacent pages and insert non-interactive
  ellipses for omitted ranges; a single missing page is shown directly. At
  440 px and below, the number sequence becomes localized `Page X of Y` text
  between Previous/Next arrows. Page links remain URL-backed, preserve active
  filters, show shared navigation progress, and return shoppers to the top of
  the results after navigation.
- At the same 440 px breakpoint, the results toolbar uses a dedicated
  view/count row and a full-width Sort row so long English/Spanish option text
  cannot be squeezed by the neighboring controls.
- Public gallery shows only `available`/`sold`; it excludes `pending_payment`,
  `draft`, and `archived` (`pending_payment` comes from admin-created unpaid orders;
  PayPal checkout no longer holds inventory; see the no-hold model in
  `features/paypal-checkout.md`). A sold item drops out of the cached catalog
  promptly via `revalidateTag('shop-catalog', { expire: 0 })` on capture.
  Every admin order-flow write to `products` (cancel/reopen/mark-paid,
  delete-order return-to-inventory, archive/delete) calls the same tag
  through `adminRevalidateProduct(s)` in
  `next-app/src/app/actions/admin-products.ts` â€” see
  `features/paypal-checkout.md`.

## Admin Workflow

Admins manage inventory from `/admin`.

1. Add/edit a product in Product Admin.
2. Upload photos through the product drawer. The browser compresses each photo
   to WebP and uploads it to Supabase Storage.
3. Save the product. The database stores image URLs/paths and product metadata,
   not binary image payloads.
4. Use crop/padding controls when needed. Cropping uploads a replacement image
   and attempts to remove the old uploaded Storage object when no product still
   references it.
5. Product ordering is managed by drag-to-reorder in the admin table.

On mobile, the Admin Products toolbar exposes **Open Product Table**. It turns
the existing inventory table into a full-screen dynamic-viewport dialog rather
than duplicating table state. The dialog provides its own vertical/horizontal
scroll surface, keeps the selection edge, product image, and row actions pinned,
and allows inventory number, title, and all statistics to pan. The persistent
image acts as the row identifier even at distant fields. The dialog includes
Close/Escape, background-scroll locking, focus containment, and desktop-
breakpoint dismissal. Closing returns to the unchanged compact inline table and
current filters. On the mobile toolbar, the compact launcher sits beside **Add
Product** without truncating either label, while Search is the first control in
the expanded Filters panel and contributes to the mobile Filters badge when
active. The visible/total product count is in the table utility row beside
Reset/status, applying equally to the inline and full-screen table. The drag-
reorder explanation is hidden in both mobile table presentations; the reset
action and active saving status remain available when relevant. Desktop retains
its original search/count toolbar and reorder instruction.

New Item and Edit Item both offer Draft status. The main Products-table Actions
menu also lets an admin move any non-draft item to Draft and move a draft item
back to Available. Draft keeps the listing content editable in Product Admin
but excludes the product from public browse and checkout until it is Available.

For quick fixed-price listings, admins can check **Quick add** on New Item, enter a
title and price label, and save without entering spot-pricing fields. The save path
normalizes the manual price label and stores `price_mode='manual'`.

## Verification

After shop/admin/product code, route, schema-contract, or config changes:

```bash
cd next-app
npm run lint
npm run build
```

For data-only image/storage audits, verify against live Supabase before deleting
objects. Destructive Storage cleanup must stay dry-run-first, include the
reference set in the report, respect the 24-hour safety threshold, and be
followed by a second dry-run after any confirmed delete.

For product-gallery changes, additionally verify both locales, the page rail
and lightbox, forward and reverse end wraps, rapid clicks, keyboard arrows, and
that the active + next thumbnail pair stays visible without page overflow from
320px mobile through wide desktop.
