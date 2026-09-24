# Architecture

> Update whenever significant structural changes occur. Last updated:
> **2026-08-11** — scheduled work moved from Netlify Scheduled Functions to
> GitHub Actions after the Netlify ones were found never to have executed.

## System Design

The active site is a **Next.js App Router** app in `next-app/`, deployed on
Netlify with `@netlify/plugin-nextjs`.

`next-app/netlify/edge-functions/api-rate-limit.ts` applies a broad per-IP and
domain limit before `/api/*` reaches Next.js. Sensitive public routes then use
the distributed Supabase counter in `next-app/src/lib/rate-limit.ts` for tighter
endpoint-specific windows.

`next-app/netlify/edge-functions/blocked-probes.ts` terminates only the listed
WordPress, XML-RPC, `.env`, `config.json`, and `.git` scanner paths with a 410
before framework routing. Root `netlify.toml` retains equivalent forced
redirects as a fallback.

**Request ordering (established by measurement 2026-08-05): `next-app/src/proxy.ts`
runs BEFORE `netlify.toml` redirect rules.** The proxy rewrites `/shop` to
`/en/shop`, and the netlify rule then splats that already-rewritten path — which
is why host-level redirects for the legacy domain (`naplesestatejewelry.co` and
its `www.` variant; `naplesantiquesllc.com` was removed 2026-09-21 when it became
a separate sister site) live in the proxy, above the
locale rewrite. Placing them only in `netlify.toml` produced two hops per legacy
link (`.co/shop` → `.com/en/shop` → `/shop`).

The netlify host rules are still required and must stay: paths outside the
proxy's matcher (`/api/*`, `robots.txt`, `sitemap`) never reach the proxy. That
exclusion is load-bearing for the `.co/api/*` carve-out, which must remain a
**200 rewrite** because webhook POSTs from Resend, PayPal, and eBay do not follow
redirects.

**Scheduled work is triggered by Supabase `pg_cron` + `pg_net` (cut over
2026-09-07)** — seven `nej-*` jobs defined in
`supabase/scheduled-jobs-pg-cron-2026-09.sql`, each POSTing the matching
secret-guarded Next route with the `x-cron-secret` read from Supabase Vault at
fire time. Run history: Supabase dashboard → Integrations → Cron, plus the
app's own run-summary log rows.

**pg_cron is the ONLY scheduler since 2026-09-13.** Netlify's scheduler started
executing the old `next-app/netlify/functions/*.mts` around 2026-09-11 and
GitHub's `schedule:` kept firing late, so every job ran three times; the social
drips claim nothing before publishing, so overlapping triggers could double-post.
The `schedule:` block was removed from `.github/workflows/scheduled-jobs.yml`
(its "Run workflow" button remains for manual runs) and
`next-app/netlify/functions/` was deleted. Never add a second scheduler. The two
paragraphs below are the 2026-08-11 record.

**Scheduled work is triggered by GitHub Actions, not Netlify** (cut over
2026-08-11). `.github/workflows/scheduled-jobs.yml` runs all five jobs — Etsy and
eBay price pushes, the Instagram and Facebook drips, and the Instagram token
refresh — on staggered UTC crons, reading each `*_CRON_SECRET` from GitHub
repository secrets and POSTing the matching secret-guarded Next route. The Next
route owns bounded provider work and writes a run-summary row to the existing
marketplace log.

The routes are deliberately **trigger-agnostic**: any external cron with the
shared secret can drive them, which is what made this swap a zero-code change.
`next-app/netlify/functions/*.mts` had the same schedules but **never once
executed** at the time — a Netlify platform fault, documented in CHANGELOG
2026-08-10. (They began executing ~2026-09-11 and were deleted 2026-09-13; see
above.)

⚠️ A Netlify "Scheduled" badge and a "Next execution" time prove registration,
never execution. That pair sat over a completely dead scheduler for weeks.

```text
Browser
  â”œâ”€â”€ Next localized routes (/ and /es)
  â”œâ”€â”€ React components and context (cart, wishlist, layout, admin, legal notice)
  â”œâ”€â”€ Next route handlers (/api/metal-prices, /api/inquire, /api/inquiries/:id,
  â”‚   /api/checkout/order, /api/paypal/create-order, /api/paypal/capture-order,
  â”‚   /api/paypal/webhook, /api/subscribe, /api/unsubscribe,
  â”‚   /api/admin/marketing/*, /api/webhooks/resend)
  â””â”€â”€ Public assets from next-app/public/assets
        â”‚
        â”œâ”€â”€> Supabase Auth + Postgres + Storage
        â”œâ”€â”€> gold-api.com via server-side spot-price helper
        â”œâ”€â”€> PayPal Orders API v2 (sandbox/live) for online payments
        â”œâ”€â”€> Resend for inquiry/order and direct marketing email when configured
        â””â”€â”€> Cloudflare Stream for direct resumable product-video upload,
              processing, playback, webhook state, and generated MP4
```

The old root `*.html`, `es/`, `scripts/`, root `assets/`, and
`netlify/functions/` runtime have been removed.

Shared UI icons render through `next-app/src/components/AppIcon.tsx`. It uses
direct Lucide React imports and emits inline SVG, so icons ship in
content-hashed application chunks rather than a separately cached ligature
font. There is no icon-font preload, subset asset, or font-regeneration step.
`src/lib/__tests__/app-icon-integrity.test.ts` prevents that infrastructure from
returning and verifies that every statically named icon has a mapping.

## Folder Structure

```text
NaplesEstateJewelry.com/
â”œâ”€â”€ AGENTS.md
â”œâ”€â”€ ACCOUNT_SETUP.md
â”œâ”€â”€ netlify.toml                 # Netlify parent config: base = next-app
â”œâ”€â”€ .gitignore
â”œâ”€â”€ project-docs/                # project memory
â”œâ”€â”€ supabase/                    # SQL schema/policy scripts
â””â”€â”€ next-app/
    â”œâ”€â”€ package.json
    â”œâ”€â”€ package-lock.json
    â”œâ”€â”€ netlify.toml             # app-local Netlify config
    â”œâ”€â”€ netlify/
    â”‚   â”œâ”€â”€ edge-functions/      # API limiting and blocked probes
    â”‚   â””â”€â”€ functions/           # legacy Netlify schedules (never ran; kept reversible)
    â”œâ”€â”€ next.config.ts
    â”œâ”€â”€ messages/                # next-intl messages
    â”œâ”€â”€ public/
    â”‚   â”œâ”€â”€ assets/              # local images/video
    â”‚   â””â”€â”€ netlify-forms.html
    â””â”€â”€ src/
        â”œâ”€â”€ app/                 # routes, metadata, APIs
        â”œâ”€â”€ components/          # layout/shop/admin/account/contact UI
        â”œâ”€â”€ context/             # cart + wishlist context
        â”œâ”€â”€ i18n/                # next-intl routing/request config
        â”œâ”€â”€ lib/                 # pricing, spot price, Supabase clients
        â””â”€â”€ types/               # shared TypeScript contracts
```

## Routing

Localized pages live under `next-app/src/app/[locale]/`. The localized
homepage route is grouped under `next-app/src/app/[locale]/(home)/` so its
branded loading fallback does not wrap every internal localized route.

Current route families include:

- `/` and `/es`
- `/about`, `/contact`, `/free-evaluation`, `/privacy`, `/terms`,
  `/cookie-preferences`, `/accessibility`, `/returns-refunds`, `/shipping`,
  `/auction-terms`, `/vendor-terms`, `/unsubscribe`, `/faq`
- `/estate-jewelry`, `/estate-services`, `/gold-services`,
  `/silver-services`, `/bullion`
- `/shop` and `/shop/[id]`
- `/account`, `/account/sign-in`, `/account/sign-up`
- `/card`, `/kittcard` (business-card QR landing pages; noindex, one shared component)
- `/order-lookup` (guest order page: order number + email/phone; noindex) → `POST /api/orders/lookup`
- `/admin`, `/admin/orders`, `/admin/orders/[id]`, `/admin/in-store-sale`, `/admin/messages`,
  `/admin/inquiries`, `/admin/subscribers`, `/admin/marketing`,
  `/admin/discount-codes`, `/admin/settings`, `/admin/users`,
  `/admin/users/[id]/invoices`, `/admin/orders/[id]/invoice`, and
  `/admin/orders/[id]/print`

## Responsive Canvas Tiers

`globals.css` owns three opt-in ultra-wide canvas classes, activated only at
2000px+: `ultrawide-page-medium` (1600px), `ultrawide-page` (1800px), and
`ultrawide-page-wide` (2200px), each bounded by `calc(100vw - 6rem)`. Shared
`PageContainer` content/wide/full modes select these automatically; explicit
shop, account, admin, marketplace-manager, service, sell, bullion, and footer
canvases opt in at their route/component boundary.

This is intentionally not a global rewrite of every `max-w-*` utility. Prose,
auth forms, checkout steps, confirmation/editor dialogs, and other focused
tasks keep their existing readable widths. `ultrawide-layout.test.ts` audits
all TSX sources so every future 6xl/7xl or established 1200-1800px large
canvas must opt into one of the tiers.

## Compliance Foundation

The shared footer (`next-app/src/components/layout/SiteFooter.tsx`) exposes a
Legal column on every page using the shared footer. Legal/policy pages share the
`LegalPolicyPage` renderer under `next-app/src/components/legal/`.

Marketing email uses `next-app/src/lib/marketing.ts` as the single audience and
send chokepoint. Newsletter subscribers are explicit opt-in via
`homepage_subscribers`; account holders are included by default unless
`profiles.marketing_opt_out = true`. Admin campaign pages and APIs use the
service-role Supabase client server-side only, require an admin profile check,
and refuse marketing sends until a physical mailing address is configured in
`marketing_settings`.

The locale layout mounts `CookieNotice`, which stores only a notice-accepted
flag in localStorage. `Cookie Preferences` lets visitors reset/accept that
notice. Source review on 2026-06-19 found no GA/GTM/Meta Pixel/Clarity/Hotjar
tracking code in the app; if non-essential tracking is added later, the policy
and cookie preference UI need a real opt-in/out update.

Account registration stores Terms/Privacy acceptance in Supabase Auth user
metadata. `supabase/compliance-consent.sql` and `supabase/schema.sql` add
matching `profiles` fields for acceptance timestamps and accepted policy version
so the live database can copy those values into profile records. Homepage
subscribers can opt out through `/unsubscribe`, which posts to
`/api/unsubscribe`. Subscribe/unsubscribe mutation RPCs are service-role-only;
public callers must pass through the Next routes' validation and distributed
IP limits.

## Carousel Hero

The **home page** hero (`next-app/src/components/home/HomeHero.tsx`) is the 3D
carousel widget (`next-app/carousel`), replacing the old MP4 ring video. Storefront
CTAs route directly to `/shop`; there is no intermediate `/store` chooser route.
The ring is **windowed/infinite** (only an admin-set number of cards exist at
once; the curated list cycles through), photos carry a per-photo **White/Black
group** that paints each card's own padding, the hero behind the ring is **one
solid admin-chosen color per slideshow** (the swept background was removed
2026-08-09), images go through `next/image`
with an off-screen preloader, and an `IntersectionObserver` pauses it offscreen.
Admin curation is at `/admin/settings` â†’ `Store Carousel Hero`, backed by
`next-app/carousel/lib/carouselData.ts`. The localized homepage reads
`carousel_selection` + `carousel_settings` through
`next-app/src/lib/home-carousel-server.ts`, caches the combined payload for
five minutes under the `home-carousel` tag, and passes that one initial set to
`HomeHero`. Successful Admin saves call the authenticated carousel revalidation
route; hardcoded products are used only when the server query fails or the
selection is empty. Setup SQL: `next-app/carousel/sql/setup.sql` (+
`add-per-item-bg.sql`, `add-visible-count.sql`, `add-visible-count-mobile.sql`,
`add-second-lineup.sql`, `add-third-lineup.sql`, `add-random-lineup-modes.sql`,
`add-slideshow-bg-colors.sql` — all run in production as of 2026-08-09).
Full detail: `project-docs/features/carousel-hero.md`.

## Customer-Facing Reveal Motion

The locale layout mounts `next-app/src/components/layout/CustomerReveal.tsx`
inside `data-customer-reveal-root`. It is a small client-side coordinator that
adds loaded-block entrance reveals on customer-facing localized pages while
skipping `/admin` routes. Each selected block waits for its own descendant
images, CSS background images, and `document.fonts.ready` before moving from
`data-customer-reveal="pending"` to `visible`; image errors count as complete so
content does not remain hidden. Large shop gallery parents are excluded because
product cards already have their own image-aware reveal and lazy offscreen
images should not block the whole gallery. Shared CSS lives in
`next-app/src/app/globals.css` and disables the motion for reduced-motion users
and print. The home carousel hero carries `data-customer-reveal-skip` because
the 3D carousel depends on unmodified ancestor transform/filter state and its
own admin-driven visible-count/windowing behavior. `HomeHero` owns a local
top-down readiness fade instead: after the server-provided visible ring image
URLs plus fonts are ready, the headline fades in first, the
carousel layer second, and the subscriber/actions layer last while preserving
the existing centered `translateX(-50%)` transforms.

Next-generated SEO endpoints:

- `/robots.txt` from `next-app/src/app/robots.ts`
- `/sitemap.xml` from `next-app/src/app/sitemap.ts`

Current route handlers include `/api/metal-prices`, `/api/inquire`,
`/api/inquiries/[id]`, `/api/checkout/order`, `/api/contact-message`,
`/api/subscribe`, `/api/unsubscribe`, the PayPal family
(`/api/paypal/create-order`, `/api/paypal/capture-order`,
`/api/paypal/webhook`), and admin-only routes
under `/api/admin/*` (`ai-product-fill`, `ai-settings`, `messages`,
`subscribers`, `translate`, `storage-gc`, `users/[id]`,
`orders/[id]/invoice`, `orders/[id]/email-invoice`,
`orders/[id]/email-update`, `marketing/*`). This
list is representative, not exhaustive â€” see `next-app/src/app/api/` for the
full route tree.

Product video routes add authenticated `/api/admin/product-video/*` lifecycle
handlers and the public signed webhook endpoint
`/api/webhooks/cloudflare-stream`. The browser POSTs only upload metadata to the
app, receives a one-time TUS URL, then sends video chunks directly to Stream.
Public product detail rendering reads a ready-only server projection; shop list
queries do not join/poll video state.

## Data Model

Supabase is the source for app data:

- `products` - shop catalog, pricing inputs, copy, lifecycle status, images,
  inventory/SKU fields, new primary Product Type (`product_type`) with legacy
  `jewelry_type` fallback, secondary Metal Type (`metal_type`) with legacy
  Gold/Silver `category` pricing fallback, Metal Color (`metal_variant`),
  necklace/bracelet Link Type (`chain_type`), location, featured flag, bilingual
  public notes (`public_notes` = Notes (EN), `public_notes_es` = Notes (ES),
  shown on the /es product page), and admin-only cost/acquisition fields. The
  legacy `internal_notes` column is retained for the `details` fold but no longer
  surfaced in the listing form.
- `product_videos` - one active Cloudflare Stream uid and metadata/playback URL
  set per product; video bytes never enter Postgres.
- `product_video_uploads` - short-lived admin-owned upload candidates, allowing
  new listings/replacements to remain uncommitted until Save and to be deleted
  on Cancel.
- `cloudflare_stream_webhook_events` - raw-body event hashes for idempotent,
  signature-verified processing callbacks.
- `orders` - order headers/customer totals/payment/fulfillment state, shipment
  details (`shipping_carrier`, `tracking_number`), plus PayPal
  references (`paypal_order_id`, `paypal_capture_id`, `payment_response`, `paid_at`)
  and legacy `reserved_until` compatibility data. `deleted_at` powers the admin Orders
  Recycle Bin (`/admin/orders?view=trash`). `customer_notes` and the `shipping_address` jsonb
  (line1/line2/city/state/postal_code/country) are shown on the order detail page and
  the invoice email.
- `order_items` - immutable product snapshots attached to orders (incl. `discount`).
- `discount_codes` - admin-managed checkout codes (`supabase/discount-codes-2026-08.sql`,
  ⚠️ **not yet applied**). Percentage or fixed-dollar, with optional minimum
  order subtotal, expiry, and a hard `max_redemptions` cap. Admin-only under RLS;
  never readable from the browser. Orders snapshot `discount_code` /
  `discount_type` / `discount_value` beside the existing `orders.discount`.
- `discount_code_redemptions` - one row per redemption, written inside
  `capture_paypal_order`. Audit trail plus the per-email reuse lookup. See
  `features/discount-codes.md`.
- `invoices` - invoice headers/totals/status for order-linked billing. New
  PayPal and manual admin orders generate a draft invoice row at order creation;
  paid capture updates the same row to `paid`; the order detail page can
  generate/refresh the row for older orders.
- `webhook_events` - idempotent log of PayPal (and future provider) webhook events,
  unique on `(provider, event_id)`. PayPal delivery attempts atomically claim
  new, prior-error, or stale-processing rows before applying business changes.
- `paypal_refunds` - PayPal refund ledger, unique by provider refund ID and
  deterministic request key. Completed refunds are applied to an order exactly
  once by `apply_paypal_refund` while pending provider states remain unapplied.
- `admin_notifications` - admin message center notifications for contact messages
  and inquiries. (PayPal order events no longer write here â€” paid orders surface on
  the Orders-tab badge instead.)
- `homepage_subscribers` - homepage subscriber CTA signups displayed in the
  admin Subscribers tab.
- `saved_items` - account-linked saved item records for the next account phase.
- `profiles` - customer profile/contact/address details plus admin/VIP flags.
- `favorites` / cart-related account data - customer saved state.
- `inquiries` - submitted seller/buyer inquiries.
- `ai_settings` - single-row table holding the optional admin override for the
  AI listing-assistant system prompt (NULL = use the built-in default).
- `carousel_selection` / `carousel_settings` - Carousel Hero curation. Selection:
  `product_id`, `position`, `bg_color` (per-photo White/Black group). Settings:
  `show_price`, `bg_color` (legacy default), `visible_count` (desktop ring size),
  `visible_count_mobile`.
- `etsy_connection` / `etsy_oauth_states` / `etsy_listings` /
  `etsy_listing_images` / `etsy_sync_log` - Etsy sync (2026-07-08, see
  "Etsy Sync" below). `supabase/etsy-sync.sql` and the resumable-queue
  hardening migration are applied.
- `ebay_connection` / `ebay_oauth_states` / `ebay_listings` /
  `ebay_sync_log` - eBay sync (2026-07-09, see "eBay Sync" below); one fewer
  table than Etsy (no per-image table — eBay takes image URLs directly).
  `supabase/ebay-sync.sql` is applied.

SQL setup and policy scripts live in `supabase/`.

Anonymous public reads should use `next-app/src/lib/supabase/public.ts`, which
creates a cookie-free Supabase anon client for server-side rendering. The
cookie-backed server client is reserved for user-state routes/actions that need
the logged-in Supabase session. As of 2026-06-22, the proxy refreshes Supabase
sessions only for account/admin/checkout paths so marketing/legal/service
pages can prerender and cache without harmless public reads forcing
request-time rendering.

Existing Supabase projects should run `supabase/profile-contact-fields.sql` to
add the full editable customer profile fields used by `/account` and checkout
prefill.

Existing Supabase projects should also run
`supabase/admin-profile-read-policy.sql` before using `/admin/users`; it adds a
security-definer admin check and an RLS policy so admin accounts can read the
complete `profiles` table.

Existing Supabase projects should run `next-app/sql/ai-settings-setup.sql` to
create the admin-only `ai_settings` table and the `is_app_admin()` helper that
back the editable AI listing-assistant prompt. Until it is run, the Settings
panel still shows the default prompt, but saving a custom prompt fails with a
clear "table not found" error.

Existing Supabase projects should run `supabase/sales-workflow.sql` before
using Orders/Sales, invoices, saved item records, guarded product delete, or the
new product lifecycle fields in production.

Existing Supabase projects should run `supabase/product-jewelry-type.sql` to add
and backfill `products.jewelry_type` for the separated Jewelry Type / Link Type
catalog model.

Existing Supabase projects should run `supabase/product-type-metal-type.sql` to
add and backfill nullable `products.product_type` and `products.metal_type`.
The app currently dual-writes these fields while preserving `jewelry_type` and
`category` for compatibility.

Existing Supabase projects should run
`supabase/admin-notifications-checkout.sql` after `sales-workflow.sql` before
using public checkout order submission or `/admin/messages` in production.

Existing Supabase projects should run `supabase/homepage-subscribers.sql`
before using the homepage subscriber CTA or `/admin/subscribers` in production.

Existing Supabase projects must run `supabase/order-item-line-discounts.sql`
(adds `order_items.discount`) â€” without it the admin Orders list query errors and
shows no orders â€” and the PayPal SQL runbook (`supabase/paypal-checkout.sql`, then
`supabase/no-reservation-checkout.sql`) before using PayPal checkout. Those scripts add
PayPal columns, the `webhook_events` table, current create/capture/event RPCs, and the
`service_role` table grants.

Existing Supabase projects should run `supabase/orders-recycle-bin.sql` before using
admin order deletion. Until `orders.deleted_at` exists, the app shows a migration notice
and blocks the Orders Recycle Bin delete/restore actions.

## Product Images

Products can use:

- local paths under `/assets/...`, served from `next-app/public/assets/...`
- Supabase Storage public URLs for uploaded admin images

Remote Supabase Storage images are allowed in `next-app/next.config.ts`.

Product image bytes are intentionally stored outside product rows. The
`products.images` and `products.image_urls` arrays store URL/path strings only;
new uploads go to Supabase Storage bucket `product-images` under `products/`.
The admin upload path compresses images to WebP before upload, then stores the
returned public URL on the product record. Public shop/card/detail rendering
prefers `image_urls` and falls back to `images`.

2026-06-20 live audit: 48 products, 321 entries in each image array, zero
`data:`/inline image payloads, 28 Storage-only products, 19 local-only legacy
products, 1 mixed product, and 202 DB-referenced Storage objects all present.
The subsequent confirmed Storage GC deleted 91 old unreferenced objects; the
follow-up dry-run reported 202 objects, 202 referenced paths, 0 orphans, and 0
deletable paths. The DB-backed local shop PNG paths were migrated to WebP and
the 114 repointed shop PNG originals were removed, leaving no PNG files under
`next-app/public/assets`.

## Pricing

Metal pricing is server-side:

- `next-app/src/lib/spot-price.ts` fetches gold/silver spot data from
  `api.gold-api.com` with a fallback.
- `next-app/src/app/api/metal-prices/route.ts` exposes the app API.
- `next-app/src/lib/pricing.ts` computes display pricing.

## Payments (PayPal)

Online payment runs through PayPal on the existing `/checkout` page (the older
manual unpaid-order endpoint `/api/checkout/order` is retired and returns
410 Gone; the legacy `/payment` placeholder page and its `PaymentClient`
component were removed on 2026-07-30). Full runbook:
`project-docs/features/paypal-checkout.md`.

- **Frontend:** `next-app/src/components/checkout/PayPalCheckoutButton.tsx` loads
  the PayPal JS SDK (client id passed from the server checkout page, not a
  `NEXT_PUBLIC_*` var) and renders the PayPal + card buttons. It validates contact
  (and, when shipping, address) fields in PayPal's `onClick` before opening the
  window. The shipping method is chosen on the Order Summary's "Shipping" row; the
  Shipping Address block sits in the left review column under the summary.
- **Server lib:** `next-app/src/lib/paypal.ts` (OAuth token cache, Orders v2
  create/capture, capture refunds, `verifyPayPalWebhook`) plus
  `next-app/src/lib/paypal-refunds.ts` (cent-based cumulative refund planning and
  deterministic request IDs) and `next-app/src/lib/paypal-webhook.ts` (capture-ID
  resolution and cumulative-refund parsing). `next-app/src/lib/checkout-pricing.ts`
  is the single source of truth for authoritative subtotal/6%-Florida-tax/
  shipping/total, `next-app/src/lib/checkout-shipping.ts` owns the allowed
  methods and fees, and `next-app/src/lib/us-address.ts` validates U.S.
  destinations. **No amounts or unvalidated destination fields are trusted from
  the browser.**
- **Routes:** `POST /api/paypal/create-order` (build authoritative order, create
  PayPal order â€” no inventory hold), `POST /api/paypal/capture-order`
  (capture, verify amount+currency, mark paid + products sold, resolve the
  concurrent-buyer race), `POST /api/paypal/webhook` (signature-verified,
  retryable/idempotent via `webhook_events`), and admin-authenticated
  `POST /api/admin/orders/[id]/refund` (full/additional partial PayPal refunds,
  blocked until the refund-ledger migration is ready).
- **Invoices:** PayPal create-order and manual admin order creation generate a
  draft invoice row with `upsertOrderInvoice`; paid capture calls the same helper
  so the existing row becomes `paid` instead of creating a duplicate. Admin order
  detail can generate/refresh this row for older orders.
- **Capture-on-approve (2026-07-03):** the sale is captured in the PayPal
  Buttons `onApprove` callback the moment the buyer hits **Pay Now** in the
  PayPal window; on return to our tab they land directly on the "Order Received"
  confirmation. There is no confirm-on-return review screen and no sessionStorage
  resume machinery (both removed â€” the earlier 2026-07-02 reload/eviction-resume
  approach with `GET /api/paypal/order-status` was reverted). Since nothing is
  reserved, a tab evicted after approval but before capture simply leaves the item
  available (buyer can retry / another buyer can purchase); the
  `PAYMENT.CAPTURE.COMPLETED` webhook still reconciles any capture that landed.
  Detail: `features/paypal-checkout.md`.
- **Inventory â€” whoever pays first gets the item (2026-07-03):** there is **no
  reservation**. `create_paypal_order` creates the order and leaves the one-of-one
  products `available`, so multiple buyers can check out the same piece at once.
  `capture_paypal_order` resolves the race: it row-locks the product rows, and if
  the item was already `sold` by a first buyer's capture it returns `item_conflict`
  (this order is flagged `failed` and retains its capture ID for a refund);
  otherwise it flips the
  products to `sold` and the order to `payment_status='paid'` /
  `order_status='completed'`. Capture + denial/refund webhook call
  `revalidateTag('shop-catalog', { expire: 0 })` so sold items leave the gallery
  promptly. The old 30-min `reserve_paypal_order` hold + expiry sweep were removed
  (`no-reservation-checkout.sql`). The active app has no manual admin **Reserved**
  product status.
- **Failure recovery and refunds (2026-07-20):** PayPal order creation uses a
  deterministic request ID. Capture evidence is saved before inventory
  finalization, and the buyer is blocked from paying again when PayPal captured
  money or its status remains unresolved. The route reconciles ambiguous calls
  through a PayPal order lookup, and a 24-hour same-cart browser lock survives
  reloads. Webhook RPC/finalization failures stay retryable; automatic buyer and
  owner emails use stable Resend idempotency keys.
  Admin PayPal refunds use deterministic request IDs plus the `paypal_refunds`
  ledger so the same cumulative target can be retried without moving money or
  incrementing `orders.refund_amount` twice. Capture-refunded webhooks calculate
  their incremental amount from PayPal's cumulative refunded total, while
  pending/failed refund resources update the ledger without changing order
  totals. `supabase/paypal-checkout-hardening-2026-07.sql` is applied; retain
  its verification probes and migration ordering for new environments.
- **Admin surfacing:** the admin **Orders** nav badge (`AdminOrdersLink`) counts active
  orders created after that admin/browser last viewed Orders; paid orders no longer
  surface in the Messages center.
- **Env:** `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV`
  (sandbox/live â€” creds must match the env), `PAYPAL_WEBHOOK_ID`.

## Etsy Sync (Phase 1/2 live)

One-way push (Supabase `products` → an Etsy shop, as a secondary sales
channel). The current technical contract, operator setup, and verification
limits live in `project-docs/features/etsy-sync.md`.

- **Module:** `next-app/src/lib/etsy/` — `client.ts` (fetch wrapper: x-api-key
  + bearer, throttle, 429/5xx backoff, typed `EtsyApiError`), `auth.ts` (OAuth
  2.0 + PKCE, AES-256-GCM token encryption, refresh with rotation), `mapping.ts`
  (pure `Product` → Etsy payload functions: title/tags/materials/`when_made`/
  price/taxonomy/pre-flight — unit-tested), `images.ts` (Supabase Storage/
  `/assets` fetch → `sharp` WebP→JPEG transcode → upload; image-diff
  planning), `sync.ts` (the step machine: draft → images → inventory →
  activate/draft-review, plus Phase 2 bulk queue drain, content-hash
  out-of-date detection, and the scheduled price push), `store.ts` (typed
  access to the `etsy_*` tables).
- **Tables (`supabase/etsy-sync.sql`, applied):**
  `etsy_connection` (single-row OAuth + shop defaults + sync policy),
  `etsy_oauth_states` (transient PKCE handshake), `etsy_listings`
  (product↔listing mapping + sync-state machine + content hash),
  `etsy_listing_images` (per-image checkpoint), `etsy_sync_log`
  (audit/dead-letter). All RLS-enabled, service-role-only (same trust model
  as `webhook_events`); `claim_next_pending_etsy_listing()` atomically claims
  every resumable state and `claim_next_repairable_etsy_listing()` provides a
  linked-only recovery queue. Both use `FOR UPDATE SKIP LOCKED`.
- **Routes (all under `/api/admin/etsy/`, admin-gated + service-role client,
  same pattern as `/api/admin/ai-settings`):** `connect`, `callback`,
  `status`, `disconnect`, `settings`, `shop-profiles`, `preview` (dry-run, no
  Etsy calls), `sync`, `sync-batch` (Phase 2 enqueue/drain plus repair drain),
  `repair-summary` (read-only linked recovery count), `delist`,
  `listings` (bulk status map for the product table), `eligibility-summary`
  (bulk pre-flight counts), `price-push` (Phase 2 scheduled push — guarded by
  a shared secret header, not an admin session, since a cron has no browser
  session). Phase 3's `/api/webhooks/etsy` (Etsy order ingest) is
  deliberately **not built** and remains out of scope.
- **Admin UI:** `EtsySettingsPanel.tsx` (composed into `/admin/settings` —
  connect/disconnect, shipping/return/readiness dropdowns, sync policy
  toggles, recent activity log), a per-product Etsy status chip + drawer
  section (`EtsyProductPanel.tsx`, wired into `AdminShell.tsx` — dry-run
  preview, sync/sync-updates, delist/reactivate), `EtsyBulkSyncModal.tsx`
  (Phase 2 sync with a pre-flight summary and cancellable progress), and
  `EtsyBulkRepairModal.tsx` (counted one-click continuation for linked
  interrupted/out-of-date listings).
- **Phase 2 automation:** auto-delist/relist is triggered from
  `handleProductStatusChange()` (`lib/etsy/sync.ts`), called from the
  existing revalidation chokepoints — `adminRevalidateProduct(s)`
  (`app/actions/admin-products.ts`), PayPal `capture-order`, and the PayPal
  webhook — rather than a new "who changes product status" audit. Always
  best-effort/non-throwing and gated off unless `auto_delist_on_sold` is on.
- **Current verification limits:** taxonomy leaves are pinned from the live
  seller taxonomy and unknown types have an explicit reviewed fallback.
  Two `TODO(etsy-verify)` items remain because Etsy's machine-readable spec
  does not publish them: image upload caps and rate-limit response-header
  names. The daily GitHub Actions job calls the trigger-agnostic route at
  11:15 UTC and is **confirmed firing on its own** (2026-08-11, 11 pushed / 0
  failed). Expect it ~40 min late — GitHub cron is best-effort.

## eBay Sync (partially live-verified)

One-way push (Supabase `products` → an eBay listing, as a secondary sales
channel), deliberately mirroring the Etsy Sync shape above. The current
technical contract, operator setup, and verification limits live in
`project-docs/features/ebay-sync.md`.

- **Module:** `next-app/src/lib/ebay/` — `client.ts` (fetch wrapper: Bearer
  auth, throttle, 429/5xx backoff, typed `EbayApiError`, cached
  client-credentials application token for Taxonomy/Metadata-class calls),
  `auth.ts` (OAuth 2.0 authorization-code, **no PKCE** — confidential
  client, Basic auth on token calls; AES-256-GCM token encryption;
  non-rotating ~18-month refresh token), `mapping.ts` (pure `Product` →
  `InventoryItem`+`Offer` payload functions: title/aspects/condition/
  category/price+markup/**Q16 price-tiered shipping-policy resolution**/
  pre-flight — unit-tested, 49 tests), `sync.ts` (the step machine:
  item → offer → review/published, plus Phase 2 bulk queue drain,
  content-hash out-of-date detection, and the scheduled price push —
  `drainQueueCore`/`shouldPushPrice` unit-tested, 9 tests), `store.ts`
  (typed access to the `ebay_*` tables). No `images.ts` — eBay's Inventory
  API takes public HTTPS image URLs directly, so the server never touches
  image bytes.
- **Tables (`supabase/ebay-sync.sql`, applied):**
  `ebay_connection` (single-row OAuth + account defaults, incl. the Q16
  express-shipping policy id + `high_value_shipping_threshold`),
  `ebay_oauth_states` (transient handshake state — no PKCE verifier column),
  `ebay_listings` (product↔SKU/offer/listing mapping + sync-state machine +
  content hash), `ebay_sync_log` (audit/dead-letter). All RLS-enabled,
  service-role-only; `claim_next_pending_ebay_listing()` RPC does the atomic
  `FOR UPDATE SKIP LOCKED` queue claim, with the re-enqueue/update detection
  and drain seen-guard built in from day one (a fix the Etsy build only
  added after a production incident).
- **Routes (all under `/api/admin/ebay/`, admin-gated, `{error:{code,message}}`
  error shape):** `connect`, `callback`, `status`, `disconnect`, `settings`,
  `account-profiles`, `preview` (dry-run, no eBay calls), `sync` (modes:
  `publish`/`update`/`price-only`/`publish-live`), `sync-batch` (Phase 2
  enqueue/drain), `delist` (hide/withdraw/restore), `listings` (bulk status
  map), `eligibility-summary`, `verify-listing`, `verify-all`, `price-push`
  (cron-secret-guarded), `push-prices`. Plus the Phase 0 compliance webhook
  `/api/webhooks/ebay-account-deletion` (GET challenge echo, POST
  signature-verified ack, reuses `webhook_events` for idempotency). Phase
  3's order-ingest route is deliberately **not built** and remains out of scope.
- **Admin UI:** `EbaySettingsPanel.tsx` (composed into `/admin/settings` next
  to `EtsySettingsPanel` — connect/disconnect, 5 policy fields incl. the
  Q16 express-shipping picker + threshold, markup save/stale-callout/
  push-now, recent activity), a per-product eBay status chip + drawer
  section (`EbayProductPanel.tsx`, wired into `AdminShell.tsx` next to the
  Etsy section — dry-run preview, sync/publish-on-eBay/price-only-push,
  hide/end/restore), and `EbayBulkSyncModal.tsx` (Phase 2 "Sync all to
  eBay" with a pre-flight summary and cancellable progress).
- **Price automation:** staggered daily GitHub Actions jobs call the
  cron-secret-guarded Etsy/eBay routes (they replaced Netlify scheduled
  functions, which never ran). Both price paths fail closed on
  fallback/missing relevant-metal spot data and write run summaries to their
  existing logs. Etsy uses a time-bounded oldest-first sweep; eBay plans only
  prices that still differ, updates at most 25 offers per provider call, and
  isolates failures from mixed bulk responses.
- **Phase 2 automation:** auto-hide (quantity-zero, Q7)/withdraw is
  triggered from `handleProductStatusChange()` (`lib/ebay/sync.ts`), added
  **next to** the existing Etsy call — never replacing it — at all three
  chokepoints: `adminRevalidateProduct(s)` (`app/actions/admin-products.ts`),
  PayPal `capture-order`, and the PayPal webhook. Always
  best-effort/non-throwing.
- **Structural differences from Etsy** (by design, not gaps): no draft
  state — `publishOffer` goes live immediately, so review-first (Q1) is
  enforced entirely by stopping the step machine at `review` until an
  explicit `publish-live` call; ~3-4 API calls per publish vs Etsy's ~12
  (no image upload calls); heavier one-time account prerequisites (Business
  Policy opt-in, inventory location, the account-deletion compliance gate)
  before the production keyset activates at all.
- **Current verification limits:** the account-deletion webhook, OAuth,
  selected status/relist reconciliation, controlled publishes/updates, and
  several live category/policy paths have been exercised. Fine, antique
  silver, and the catalog's verified Fashion leaves are pinned; unsupported
  future Fashion types still fail preflight rather than guessing. Remaining
  `TODO(ebay-verify)` items include some allowed aspect values, sandbox-host
  assumptions, and multi-SKU price batching. The
  external relist for inventory #82 remains intentionally write-blocked.

## Social Auto-Posting: Instagram + Facebook (fixed scheduling added 2026-08-02)

Two mirrored channels under `src/lib/instagram/` and `src/lib/facebook/`, each
with its own API client (`graph.instagram.com` Instagram-User token with weekly
refresh cron vs `graph.facebook.com` Page token with connect-time lifetime
inspection and no automatic refresh endpoint), AES-256-GCM
token storage, typed store (`instagram_posts`/`facebook_posts` +
connection/sync-log tables, RLS deny-all, service-role only), pure
product→post mapper, and a review-first curate → prepare → review →
publish/queue state machine. `lib/social-workflow.ts` computes the shared
owner-facing stage from persisted preparation, unsaved lineup changes, and an
edited caption opening; it prevents downstream actions from jumping past a
stale setup. A queue approval stores both the audit time (`queued_at`) and a
distinct intended publication time (`scheduled_for`). The shared scheduler
allows only noon, 2 PM, 4 PM, 6 PM, 8 PM, 10 PM, and midnight in
`America/New_York`; both the UI and queue APIs enforce those choices.

Scheduled Netlify drips run on the hour using the union of UTC hours required
for the seven Eastern slots in both EDT and EST. Workers select only rows where
`scheduled_for <= now()`, ordered by `scheduled_for` and then `queued_at`, and
process at most 25 due rows per invocation as a runtime-safety batch. There is no
local daily post cap; Instagram's provider-enforced 100-per-rolling-24-hour quota
is still checked by its publish step. Extra DST-covering invocations therefore
cannot publish early. `/admin/social-queues` is the cross-channel read
model: its server page reads the two scheduled queues, connection policies,
recent published timestamps and last drip activity, then
`components/admin/SocialQueuesDashboard.tsx` renders independent channel
sections plus channel-local ready-row selection and its bulk confirmation.
The same server page selects the 12 newest published receipts per channel plus
only their referenced product summaries. `SocialLatestPostsModal.tsx` renders
that bounded view and delegates comment, refresh, manage, and delete actions to
the existing guarded channel routes; comment routes call the shared channel
clients and audit outcomes without storing owner-written comment bodies.
`components/admin/SocialScheduleModal.tsx` is the shared date/slot editor;
`SocialQueueRowActions.tsx` handles edit, reschedule, and remove and hands a
confirmed immediate publish to `SocialBackgroundPublishProvider`. That
row action component also owns a two-column responsive sizing contract so its
labels cannot overflow when the table is viewed in a compact browser pane. The
provider is mounted once in `[locale]/layout.tsx`, so its task/widget survives
ordinary route navigation. `lib/social-background-publish.ts` owns both the
bounded channel request/processing loop and the sequential same-channel batch
runner. The provider owns the single-task guard, current/total progress,
persistent stop-and-resume failure state, five-second success notification, and
post-success `router.refresh()`. `lib/social-queue-schedule.ts`
owns Eastern slot conversion, default
selection, display labels, and server validation. Queue insertion writes the
prepared approval state as `pending`, so both drip queries accept `pending` and
`review` rows with both queue timestamps; the publish step still validates that
caption and renditions exist before any public write.

Facebook candidate tokens are inspected through Meta `/debug_token` using the
server-only `FACEBOOK_APP_SECRET` before encrypted storage. They must be valid
for the Naples Estate Jewelry Social app and have either no finite expiration
or at least 30 days remaining; longer finite expiry is persisted for truthful
Settings display. Connection fails closed when inspection is not configured.

Deliberately SHARED between the channels (one fix lands on both):

- Caption opening generation and validation in
  `lib/social-caption-opening.ts`, backed by the configured provider through
  `lib/ai-product-provider.ts`, plus pure caption helpers in
  `lib/instagram/mapping.ts` (`buildPublicSpecLine`, `formatSpotBasis`,
  `buildHashtags`, lineup resolution). Both captions use one structure — one
  short opening sentence combining availability + the title → specs
  → price sentence with spot basis, uniform blank-line rhythm, no description,
  no inventory number — differing
  only where the platforms force it (Facebook's clickable `Shop:` URL versus
  Instagram's adjacent `Store link in bio` + typeable `Item:` short-link block,
  served by `src/app/p/[code]/route.ts`, and hashtag volume).
  `buildHashtags` preserves relevance order for both, but the Facebook mapper
  slices the result to `FACEBOOK_MAX_HASHTAGS = 3`; Instagram keeps its own
  larger platform limit.
  `SocialPublishBothModal` delegates cross-channel opener selection to
  `lib/social-publish-both.ts`: when one side is ready and the other needs
  Prepare, `/api/admin/social/prepare-from-channel` reads the ready side's
  stored review caption server-side. The target Prepare copies that full body
  and `adaptSocialCaptionForTarget` substitutes only the destination link block
  and final hashtag line. The
  modal receives its opening manager as
  `sourceChannel`; a ready/ready opener mismatch disables publishing and exposes
  a target re-prepare action, preventing older divergent drafts from slipping
  through the combined publish flow.
  Preview loads are deterministic and do not call AI. The admin explicitly
  enters optional direction, selects one of six shared direction presets, and
  generates/regenerates through the preview route, or edits the opening field;
  the full preview changes locally and publishing
  stays hidden until Prepare stores the draft. Direction is session-only style
  guidance, limited to 400 characters, and is never posted or persisted.
  AI/browser text is treated as untrusted and must pass the shared structural
  validator. The provider uses a moderately creative temperature (`0.78`) and
  requires a conversational thought plus varied structure, not a title rewrite
  with “available now.” Generated text must identify the product but may
  paraphrase the catalog title naturally; both generated and edited paths reject “our,”
  links, hashtags, inventory numbers, quotes, extra sentences, and stale
  availability claims. Direct Prepare without a candidate uses the safe
  fallback and never triggers a model call.
  Both product panels turn the state into a guided UI: curation and caption
  changes must be saved into a fresh prepared upload before review, queue, or
  publishing actions appear. **Save & prepare** combines lineup persistence
  and rendition generation, and preserves a local caption draft across the
  lineup reload. The card-preview endpoint is not surfaced in this operator
  path: Prepare produces the single real card, then review exposes it.
- The rendition/card engine (`lib/instagram/images.ts`, `card.ts`,
  `backdrop.ts`): square 1080 JPEGs padded in the photo's own backdrop colour,
  and a generated Satori-typeset ad card (vendored static TTFs under
  `src/assets/fonts`, traced via `outputFileTracingIncludes`) that leads every
  post and REPLACES its source photo in the slides. Auto-crops never upscale.
  `components/admin/PreparedSlideViewer.tsx` is the shared ordered full-size
  prepared-slide review window: both panels pass their rendition URLs/card
  flags into it, and it supplies previous/next and keyboard navigation without
  giving the popup any publish or draft-mutation capability.

Deliberately SEPARATE: per-channel Storage prefixes
(`instagram-renditions/` / `facebook-renditions/`, both in the Storage GC
reference scan) and per-channel curation columns (lineup, crops, card
source/background) — shared objects would let one channel's re-prepare delete
files the other references. Cross-channel operator tools bridge the seam:
`/api/admin/social/copy-curation` (explicit copy, refused onto live posts),
a shared `SocialPublishBothModal` (Instagram publishes first — permanent
channel — then Facebook), and per-channel discard (drops the draft, keeps
curation). Per-channel admin routes now include a `refresh-status` read-back
endpoint, plus shared `card-preview` and crop-suggest endpoints; operator
panels are mirrored per product.

Key API asymmetry: Instagram posts can never be edited or deleted through the
API (review-first is load-bearing; removal is manual + "forget"); Facebook
delete genuinely works. Meta's linked-account auto-crossposting does not apply
to API-published posts, so the channels never double-post.

Published state is reconciled on manager open and on demand. Each channel reads
its stored remote id, then treats Meta's missing-object error as deletion only
after a same-token `/me` probe confirms the expected Page/account. Confirmed
deletions reuse the local forget cleanup (state `deleted`, remote ids and queued
metadata cleared, rendition objects removed). All ambiguous failures preserve
`published`. Facebook token connection additionally probes `/{pageId}/feed`
with `fields=id&limit=1`, making `pages_read_engagement` a validated connection
requirement rather than a setup note only. Connected-token replacement is
transactional at the application level: verify Page profile + feed read + exact
same-Page id first, then overwrite the encrypted token. For New Page Experience
posts, refresh may derive a second composite read id from a numeric Facebook
permalink when the stored id is ambiguous; deletion still requires same-Page
profile and feed-read proof before local cleanup.

## Text Alerts (Twilio) — sign-up confirmation + Text Deals (2026-09-15, Step 2 staged)

Owner-facing flow: homepage **Join the List** window → `homepage_subscribers`
row with `phone_e164`, `sms_status = 'pending'` → one confirmation text →
handset replies YES → `confirmed` → Admin → **Text Deals** sends a picture
message (the owner's photo with the price drawn on it) to confirmed numbers →
replies come back to the toll-free number and are forwarded to the owner's
cell. Pieces sold this way are never listed on the site; the reply is the
claim (`DECISIONS.md` → *"Text deals: the reply is the claim…"*).

- **Provider:** Twilio, toll-free +1 (888) 423-7522, Messages API over
  `fetch` (`src/lib/text-alerts/twilio.ts`), StatusCallback on every send.
  Credentials in Netlify (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
  `TWILIO_FROM_NUMBER`, `TWILIO_FORWARD_TO`); every sender no-ops while they
  are missing.
- **Inbound:** `POST /api/webhooks/twilio/inbound` (signature-checked,
  answers TwiML) — the number's "A message comes in" webhook. Delivery:
  `POST /api/webhooks/twilio/status`.
- **Tables** (service-role only): `text_deals` (photo_path, card_path,
  status draft/sending/sent/sold, sold_reply_text), `text_deal_sends`
  (unique deal+phone, queued→sending→sent/failed, message_sid),
  `text_inbound` (unique message_sid, kind confirm/stop/help/reply,
  deal_id, forwarded_at, auto_reply_sent_at), `text_system_messages`
  (confirmations, tests, forwards). Storage under
  `product-images/text-deals/<deal>/` (GC-referenced).
- **Scheduler:** pg_cron `nej-text-alerts-sweep` every 15 min →
  `/api/admin/text-alerts/sweep` (`x-cron-secret` = `TEXT_ALERTS_CRON_SECRET`
  from Vault): retries missed confirmations and finishes deals cut off
  mid-send. Same trigger-agnostic pattern as the marketplace reconciles.
- **Rendering:** `src/lib/text-alerts/card.ts` — sharp + Satori (next/og)
  with the vendored fonts, traced into the text-deals routes in
  `next.config.ts`.

## Public-shop cache invalidation (2026-07-02)

`/shop` is server-cached (`unstable_cache`, tag `shop-catalog`, `revalidate: 300`).
Any write to `products` from a **browser** Supabase client (admin order
cancel/reopen/mark-paid, delete-order return-to-inventory, archive/delete)
cannot itself purge that cache, so the gallery would keep serving a stale
status for up to 5 minutes. `next-app/src/app/actions/admin-products.ts`
exports `adminRevalidateProduct(id)` / `adminRevalidateProducts(ids)` (both
call `revalidateTag('shop-catalog', { expire: 0 })` + revalidate the EN/ES
product detail paths) â€” call one of these after every client-side `products`
write. Server-side writes (PayPal capture/webhook,
`adminUpdateProductStatus`) already revalidate inline.

## Authentication

Supabase Auth is configured through:

- `next-app/src/lib/supabase/client.ts`
- `next-app/src/lib/supabase/server.ts`
- `next-app/src/lib/supabase/public.ts` for anonymous server-side public reads.
- `next-app/src/proxy.ts`, which refreshes Supabase sessions during routing only
  for user-state route prefixes. It also owns, in this order: legacy-HOST 301s to
  the canonical `.com` origin, then retired-path redirects
  (`lib/legacy-redirects.ts`), then the locale rewrite. The order matters — see
  the request-ordering note near the top of this document.

Protected admin pages and shared admin server actions use
`next-app/src/lib/auth-claims.ts` to verify the JWT with Supabase `getClaims()`.
The current project uses ES256 signing, allowing cached-JWKS local verification;
authorization still requires a live `profiles.is_admin` database row. Never
replace that database role check with a claim or unverified session object.

Admin product loading is intentionally two-stage. `/admin` initially selects
the compact contract in `next-app/src/lib/admin-product-summary.ts`; full
service-role product rows are returned only by the guarded `adminGetProduct`
action for Edit/Duplicate/Pad/Delete workflows. `/admin/orders` similarly loads
manual-order product summaries and spot pricing only after Create Manual Order
is opened. Summary records keep the full canonical `image_urls` reference set
and omit the duplicate legacy `images` array.

Account routes live under `next-app/src/app/[locale]/account/`.

## AI Product Listing Assistant

The Product Admin Add/Edit drawer includes an integrated AI Listing Assistant
that accepts typed text or browser speech-recognition transcript text, requests
a structured product draft from the server, and applies every returned field
straight into the current form state, with a short notes list (what it could
not fill / was unsure of) and one Undo. The admin corrects by clearing a field
and re-running with the correction; there is no accept/keep review step
(removed 2026-09-09, see `features/shop-listings.md`). It does not write
directly to Supabase; the normal product Save flow remains the persistence
step. The older
manual Quick Fill workflow is currently disabled in the editor UI
(`SHOW_QUICK_FILL = false` in `AdminShell.tsx`), but its parser and gated panel
still live in `AdminShell.tsx` so it can be restored without carrying a stale
backup copy.

Provider and model details are isolated in
`next-app/src/lib/ai-product-provider.ts`. UI components, route handlers,
schema coercion, and form population code must stay provider-neutral.

The trust boundary is:

- `next-app/src/app/api/admin/ai-product-fill/route.ts` verifies the signed-in
  Supabase user is an admin, validates transcript/images/prior inputs,
  rate-limits per admin user (successful generations only), calls the
  provider-neutral draft function, coerces the result, and returns
  `{ fields, notes }`. The provider call aborts at `AI_TIMEOUT_MS` (default
  50 s — under Netlify's 60 s synchronous cap) with a readable message.
- `next-app/src/app/api/admin/ai-speech/route.ts` verifies the same admin
  boundary, validates and rate-limits response text, and streams OpenAI speech
  audio without exposing the API key to the browser. Since 2026-09-09 nothing
  in the editor calls it (read-aloud was removed with the review layer).
- `next-app/src/lib/ai-product-schema.ts` owns the provider-neutral schema,
  accepted field keys, enum coercion, and the notes list (model notes, the
  deterministic missing-pricing note, legacy warnings/uncertainties, and any
  seller claim stripped from buyer copy).
- `next-app/src/lib/ai-speech.ts` owns provider-independent speech-text
  validation. Browser device speech is a client-side availability fallback.
- `next-app/src/lib/ai-product-provider.ts` is the only file that may read AI
  API keys, know provider names/model names, construct provider requests, parse
  provider-specific responses, or store the default extraction prompt
  (`PRODUCT_EXTRACTION_SYSTEM_PROMPT`).

### Editable system prompt

The system prompt that drives extraction is editable by the admin at
`/admin/settings` (the "AI Listing Assistant Prompt" panel).
`PRODUCT_EXTRACTION_SYSTEM_PROMPT` in `ai-product-provider.ts` is the built-in
default; an optional override is stored in the single-row `ai_settings` table
and read server-side per request via `next-app/src/lib/ai-settings-store.ts`.
The admin-gated `next-app/src/app/api/admin/ai-settings/route.ts` (`GET`/`PUT`)
loads and saves the override; saving a blank value clears it and reverts to the
default. The fill route passes the override into the provider through the
`systemPrompt` input. If the `ai_settings` table is missing or the read fails,
the default prompt is used so generation never breaks. Required setup SQL lives
at `next-app/sql/ai-settings-setup.sql`.

Every provider request also appends the immutable
`BUYER_FACING_COPY_GUARDRAILS` from `ai-product-provider.ts`, so a saved/custom
prompt cannot put seller suggestions, opinions, guesses, or unverified
identifications into buyer-facing `title`, `description`, or `public_notes`.
The schema coercer applies a second conservative check for direct seller
attribution and preserves removed sentences in `uncertainties`.

The assistant sends the first allowed product images as visual context to the
provider layer. `AI_MAX_IMAGES` controls the count and defaults to 2; local
`/assets/...` product images and Supabase Storage `product-images` URLs are the
allowed sources.

Required live environment configuration before actual generation works:

```text
AI_PROVIDER=<openai|anthropic|google|local>
AI_MODEL=<configured model name>
OPENAI_API_KEY=... or ANTHROPIC_API_KEY=... or GOOGLE_AI_API_KEY=...
```

Optional controls include `AI_MODEL_FAST`, `AI_MODEL_ACCURATE`,
`AI_MODEL_PREMIUM`, `AI_MAX_IMAGES`, `AI_MAX_IMAGE_BYTES`,
`AI_RATE_LIMIT_HOURLY`, `AI_RATE_LIMIT_DAILY`, `AI_TIMEOUT_MS`, and
`AI_MAX_OUTPUT_TOKENS`. Read-aloud uses `OPENAI_API_KEY` even when another
listing provider is selected; optional `OPENAI_TTS_MODEL` and
`OPENAI_TTS_VOICE` override the defaults (`gpt-4o-mini-tts` and `marin`).

## Deployment

Root `netlify.toml`:

```toml
[build]
  base = "next-app"
  command = "npm run build"
  publish = ".next"
```

It keeps useful legacy image redirects that still land on
`next-app/public/assets`. Redirects to deleted legacy scripts were removed.
Browser security headers are defined in both root `netlify.toml` and
`next-app/next.config.ts` so SSR/API responses retain the policy if one
deployment layer's header processing is skipped.

## Verification

Primary check:

```bash
cd next-app
npm run build
```

Run `npm run lint` when touching TypeScript, React components, routing, or
shared UI behavior.

Current build state: `src/app/[locale]/shop/(list)/page.tsx` is a thin route
entry containing only valid Next exports. Shared rendering and metadata logic
live in the colocated `shop-page-renderer.tsx`, which is also reused by
`/shop-modern`. On 2026-08-03, Next.js 16.2.12 completed TypeScript, generated
all 443 pages, and exited 0; all 696 tests and lint passed in the same session.
