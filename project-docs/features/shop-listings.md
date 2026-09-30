# Feature: Shop Listings - Product Runbook

> How to add, edit, audit, and retire listings in the current Next.js/Supabase
> shop. Last updated: **2026-07-24**.

## Source Of Truth

- Product rows live in Supabase `products`.
- Product type/status/image contracts live in `next-app/src/types/product.ts`.
- Product Admin lives at `/admin` and is implemented mainly in
  `next-app/src/components/admin/AdminShell.tsx`.
- Public listing/detail rendering lives under
  `next-app/src/app/[locale]/shop/` and `next-app/src/components/shop/`.
- Product photos should live in Supabase Storage (`product-images/products`) for
  new uploads. Some legacy products still reference local
  `next-app/public/assets/images/shop/*` files.

Do not reintroduce the retired static `window.SHOP_PRODUCTS` catalog.

## Listing Fields

Keep these fields especially consistent:

- `id`: permanent public identifier used in URLs, carts, favorites, orders, and
  admin references.
- `inventory_number`: visible inventory number. Fix duplicate live values before
  enforcing the unique migration.
- `status`: lifecycle status (`draft`, `available`, `pending_payment`, `sold`,
  `archived`).
- `product_type` / `jewelry_type`: broad item form. Admin supports curated
  options plus concise custom product type strings.
- `chain_type`: link type, scoped to necklace/bracelet products.
- `length`: bare canonical numeric/string measurement; Add/Edit and AI inputs
  accept plain or inch-suffixed forms (`24`, `24 in`, `24 inches`, `24"`) and
  normalize them before storage. Buyer-facing code adds units when appropriate.
- `width_mm`: optional physical width across a necklace chain or bracelet
  chain/band, stored as a positive millimeter value. It is null for other
  product types or when unknown.
- `category`: legacy pricing category (`Gold`/`Silver`).
- `metal_type`: broader metal family.
- `metal_variant`: merchandising color/subtype such as yellow gold, white gold,
  rose gold, silver, vermeil, or platinum.
- `images` / `image_urls`: URL/path string arrays only. No inline image data.

## Add A Listing

1. Open `/admin` as an admin user.
2. Choose Add Product.
3. Fill title, metal/pricing fields, product type, brand, size/length, optional
   necklace/bracelet width in millimeters, notes, status, and Spanish copy when
   available.
4. Upload photos in the drawer. New files are compressed to WebP and uploaded to
   Supabase Storage.
5. Put the intended cover photo first. Drag/reorder images in the drawer if
   needed.
6. Use Crop only when necessary. Crop creates a new Storage object and replaces
   the URL in the form state.
7. Use image padding controls for product-card/detail frame color when a photo
   needs a white/black/custom-color background.
8. Save. The normal save path writes metadata and image URL/path strings to
   Supabase. Length/size is normalized again at this boundary before both the
   `length` column and legacy `len:` tag are written.
9. Verify the product on `/shop` and `/shop/[id]`.

### Smart Listing Assistant

The assistant fills the form; it does not ask for approval (the accept/keep
review layer was removed 2026-09-09 on the owner's word — "it should simply
fill out the form for me"):

1. Add at least one photo, then type or speak the item details (optional).
2. **Generate Listing.** Every field the model can support goes straight into
   the form. A short **notes** box (≤ 5 lines) says what it could not fill and
   what it was unsure of; the notice line lists the fields it filled. The one
   deterministic note names the pricing facts a listing cannot be priced
   without (purity/weight on spot mode, a price on manual).
3. Correct it your way: **clear any field that is wrong**, type or speak the
   correction or the missing fact, and press **Update Listing**. The three
   rules the model runs under (`ITERATIVE_LISTING_CONTRACT`): a field still
   filled in the form is correct and is returned unchanged; every empty field
   is filled from the photos and everything said so far; an explicit
   statement or instruction in the note ("the weight is 4.2 grams", "shorten
   the title") wins over a filled field.
4. **Undo AI Fill** restores the form as it was before the last run. Save
   through the standard editor action; nothing is persisted until then.

Only the admin's own earlier inputs for the item are re-sent on later passes
(`priorInputs`, bounded); the assistant's notes are not evidence and never
travel. Context lives only while that editor is open; opening another Add/Edit
editor resets it. Nothing is stored in Supabase.

The non-overridable safeguards still apply on every run: buyer-facing copy
cannot promote seller guesses as facts (a stripped claim becomes a note);
length is normalized to one bare numeric value; width is populated only for
necklaces/bracelets and only from explicit reliable evidence; status and
location are never AI-controlled. There is no read-aloud in the panel any more
(the `/api/admin/ai-speech` route remains, uncalled).

## Edit A Listing

- Preserve `id` unless the owner explicitly accepts URL/saved-state breakage.
- Prefer changing `status` over deleting products with sales/order history.
- Keep `image_urls` and `images` aligned until the compatibility field strategy
  changes.
- When replacing photos, verify the old uploaded Storage object is no longer
  referenced before deleting it.
- Run the relevant SQL migrations before relying on newer fields such as
  product type, brand, metal variants, per-photo padding, and unique inventory
  numbers in production.
- `supabase/product-width-mm-2026-07.sql` was applied and verified on
  2026-07-22. The admin still refuses to silently discard a non-null width if a
  different environment is missing the column.

## Retire Or Mark Sold

- Use `sold` for sold inventory.
- Use `archived` for internal records that should not appear publicly.
- Use `pending_payment` only for an admin/manual unpaid-order workflow that
  deliberately holds inventory. Public PayPal checkout has no reservation; the
  first successful capture moves the product directly from Available to Sold.
- Avoid hard delete if the product has order, invoice, saved-item, or inquiry
  history.

## Image Audit Checklist

For a storage cleanup pass:

1. Query `products.images` and `products.image_urls`.
2. Normalize Storage paths from URLs containing
   `/storage/v1/object/public/product-images/`.
3. Compare those paths with objects listed in Supabase Storage bucket
   `product-images`, folder `products`.
4. Treat DB-referenced missing objects as broken product images.
5. Treat unreferenced objects as cleanup candidates only after checking whether
   they are draft/recovery/recently replaced assets.
6. Confirm there are no `data:` entries in product image arrays.

2026-06-20 audit found no DB-referenced missing Storage objects and 91
unreferenced Storage objects.

## Verification

For code/schema changes:

```bash
cd next-app
npm run lint
npm run build
```

For documentation-only or data-audit sessions, update project memory and record
the exact audit counts/date.
