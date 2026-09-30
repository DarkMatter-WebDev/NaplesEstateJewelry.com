# Feature: eBay Sync

> **Account-change reset (built 2026-07-30):** Settings → eBay Sync has a
> "Reset listing state (account change)…" action for switching to a different
> eBay seller account. It is dry-run-first (shows a count-by-state summary
> and how many rows reference live listings) and on explicit confirm deletes
> every local `ebay_listings` row plus the account-scoped orders cursor —
> never touching listings on eBay itself; the action logs to `ebay_sync_log`.
> Full account-change runbook: 1) delist the old account's listings through
> the app while still connected, 2) disconnect / connect the new account,
> 3) re-pick payment/return policies + re-run location setup + re-click tier
> provisioning, 4) run this reset, 5) Sync All (mind the new account's
> selling limits). Without the reset, existing rows are treated as updates
> against the old account's offers, which the new token cannot see.

> **Shipping tiers (built 2026-07-30, provisioned 2026-08-01):** offer
> shipping now follows the site's value-based tiers. Settings → eBay Sync has
> a "Provision tiered shipping policies" action that creates/updates one
> FLAT_RATE fulfillment policy per distinct tier fee ($19–$165, canonical
> names "NEJ Insured Shipping $N") and maps them in
> `marketplace_shipping_profiles` (`supabase/marketplace-shipping-tiers-2026-07.sql`
> is applied). In current behavior,
> `resolveFulfillmentPolicyId` prefers the tier policy for the item's price
> band (payload `shippingTier: 'tiered'`); the policy id stays in the content
> hash (Q16), so a price crossing a tier boundary flags the listing
> `out_of_date` for the normal review-first update. Missing mappings still fall
> back to the legacy standard/express threshold pair. All seven policy IDs are
> recorded in `features/shipping-tiers.md`; one controlled listing update
> remains open.

> Status: **code-complete; the Phase 0 account-deletion webhook and listing
> status/relist reconciliation are confirmed live.** Phase 1/2 write behavior
> is only partially live-tested; see "Verification status" below.
> This document is the current technical contract and operator runbook.
> Implementation history lives in `project-docs/CHANGELOG.md`. The integration
> mirrors Etsy's shape but is independent; neither channel depends on the other.

## What this is

**2026-09-24 manual hold (STAGED, deploy owed):** the reconcile sweep's and the
status hook's `restore` branch (available, in-stock product + `hidden_oos`
listing → `restoreListingQuantity`) no longer fires for a listing the owner
hid. `hideListingQuantityZero(…, source)` records `manual:`/`auto:` in the
`hide_oos` log message (`EBAY_HIDE_MESSAGE`); the drawer's Hide is `manual`,
the sold-handling `quantity_zero` path is `auto`. `detectEbayStatusDrift`
takes a third `manualHold` argument; `isEbayManualHold(latestHideMessage)`
releases the hold only for an `auto:` row — no row (quantity zeroed on eBay
itself and mapped from `OUT_OF_STOCK`, or hidden before this rule) and every
`manual:` row keep the listing hidden. `getLatestHideMessages` (store) feeds
the sweep in one query for restore candidates only. Withdraw/End (`ended`)
was never auto-restored and still is not; the `delist` branches and the
write-blocked quarantine are unchanged. Owner ruling + Etsy twin:
`CHANGELOG.md` 2026-09-24 (1)–(2), `DECISIONS.md` "Etsy and eBay".

**2026-09-07 reconcile-on-refusal:** a refused withdraw / quantity-zero /
restore (eBay answers HTTP 400 on a listing it has already ended — a
`Completed` item) no longer loops. The hook's `status_change_hook` error row
now carries `{status, code, response}` in `detail`; the 30-minute sweep then
runs the read-only status check (`reconcileEbayStateFromOffer` + the relist
chain) and counts the listing as **reconciled**, not repaired (inventory #75
landed on `hidden_oos`, which eBay reports for the ended item and which is
not a drift for a sold product). Summary row: `N scanned, D drifted, R
repaired, C reconciled, F failed, X deferred`. Shared pure bookkeeping:
`src/lib/marketplace-drift-repair.ts`.

**2026-07-21 status-drift fix:** An active eBay status check preserves local
`out_of_date` instead of replacing it with `published`. Remote lifecycle and
local content freshness remain independent, and the result reports **Live,
updates needed** until a successful sync refreshes the content hash. Inventory
#53 live-verified the fix after its mapped fulfillment policy crossed the
$1,000 high-value threshold.

**2026-07-21 status-to-post route:** Each product in the selected status
dialog's eBay Not listed detail has **Post to eBay**. It scopes the existing
selected eBay sync dialog to that product, where the admin still chooses
immediate sync or review-first submission. Closing or completing that route
returns to a newly reconciled combined status summary without clearing the
original table selection.

**2026-09-12 (night, staged — needs SQL + reconnect) eBay sale → site sold:**
the 30-minute `reconcile-status` sweep first reads paid orders (Sell
Fulfillment `getOrders`, scope `sell.fulfillment.readonly`), maps each line
by `sku` → `ebay_listings.ebay_sku` (else `legacyItemId` → `ebay_listing_id`),
and applies it with `apply_marketplace_sale()` (checkout's rule); a product
that becomes sold has its eBay row marked `hidden_oos` here and the Etsy
status hook delists the Etsy listing. Cancelled / fully refunded orders are
skipped; a partial refund still counts. Armed from the first run after the
reconnect — `ebay_connection.orders_cursor`, the column that waited since
the original build, is finally the cursor; switch `auto_mark_sold` in
Settings. `lib/marketplace-sales*.ts`, `supabase/marketplace-sales-2026-09.sql`;
`CHANGELOG.md` 2026-09-12 (night).

**2026-09-12 (staged) edit in the review window:** the review step's Aspects
line is a list, one aspect per line, and every aspect fed by a product column
(Metal, Metal Purity, Type, Brand, Year Manufactured, Item Weight, Main Stone,
Chain Type, Chain Length / Ring Size) has a pencil that saves the product
through `PUT /api/admin/products/fields` and re-runs the preflight; aspects
the mapper skipped for an empty field still get a "—" row. Style stays fixed
("Classic"); Condition, Shipping and Category are read-only with a note
saying where they come from. `mapAspects` and the description now convert a
`mm`/`cm` length to inches, and the description prints `Purity: 14K` / `925`.
`CHANGELOG.md` 2026-09-12.

**2026-07-20 selected review-first sync:** Selected products can either use the
existing immediate eBay batch queue or open a sequential review flow. Each step
loads the real eBay preview checks, condition, shipping, aspects, and mapped
fields, then runs the established bounded single-product sync endpoint only
after explicit submission. Terminal success advances; failures stay on the
current item for refresh/retry, and explicit skips are counted. The flow keeps
eBay's existing review/publish/update semantics and is independently selectable
after Etsy in Sync to both.

**2026-07-20 selected reconciliation:** The Admin Products Actions modal has a
channel-specific **Check eBay status** action for the selected products. It
calls `verify-all` with an optional deduplicated `productIds` list and returns
a final state for every selected product independently from Etsy. The default
view reduces those records to clickable Listed, Not listed, and Needs attention
totals. A nonzero total opens only its matching products and translates eBay
state into Live, Draft, Not listed, Ended, Hidden (sold), Out of date, or a
check/error result; Back restores the totals without another request. The
internal local-update count remains in the API contract but is not displayed.
It performs marketplace reads and local reconciliation only, preserves the
selection, and pushes no listing content. A failed eBay check can be retried
without discarding a successful Etsy result. A live mixed-status check showed
one Listed and one Not listed, and both drill-downs passed.

**2026-07-19 description-banner preparation:** A shared banner was optimized
to `next-app/public/assets/marketplaces/ebay-description-banner.webp` (1400x468
WebP, 113,460 bytes), but it is not part of `mapDescription()` or any live
listing. The supplied art visibly includes the business phone number and
off-eBay domain, so it must be replaced with a policy-safe branding-only
variant before integration. A future compliant banner must use a public HTTPS
asset, stay non-clickable and responsive, appear only in the HTML description
(not `imageUrls`), and pass one controlled desktop/mobile listing check before
bulk Sync Updates.

**2026-07-16 full API audit:** All 79 linked offers were read from eBay, plus
per-SKU offer lookups: 73 were published/active, 5 unpublished/out-of-stock,
and one was inventory #82's known ended predecessor. No duplicate SKU offers or
API errors were found. Shared write paths now validate each entry in bulk HTTP
200 responses, include the required fixed-price `listingDuration: GTC`, capture
new listing IDs after publish/restore, distinguish Inventory-offer 404s from
Trading-item failures, and resolve detached relists before writes. Crash
recovery only adopts exact-marketplace fixed-price offers. Focused regression
tests and guarded admin-browser actions cover these cases; destructive live
write scenarios remain subject to the verification notes below.

**2026-07-16 relist correction:** Inventory `getOffer` can remain attached to
an ended item after that item is relisted outside the offer. Status verification
now uses seller-authenticated Trading `GetItem` to follow the bounded
`RelistedItemID` chain, requires the same seller SKU at each hop, and adopts the
latest active listing ID. A detached relist is displayed as Live with an admin
warning, while app-side sync, price, and delist writes are blocked until an
owner-approved reattachment is completed. Inventory #82 was live-tested twice
against active relist `800354878200` without drifting back to Ended.

A one-way push (Supabase `products` → an eBay listing) as a secondary sales
channel, same trust model as Etsy sync: `products` stays the source of
truth, eBay is never authoritative, and the only inbound flow (eBay → us) is
the optional, **not built**, Phase 3 order-ingest poll (Q15 — manual
handling is fine).

Two structural differences from Etsy that shaped the whole design:

1. **No draft state.** `publishOffer` makes a listing live and buyable
   immediately — there is no private eBay-side draft to review before
   publish. The dry-run preview is the only review surface, and Phase 1
   defaults to review-first (Q1): sync stops at `review`, and a distinct
   `publish-live` action (with UI copy that says so) is required to go
   public.
2. **Far fewer API calls per publish** (~3-4 vs Etsy's ~12) because eBay's
   Inventory API takes `product.imageUrls[]` directly and fetches/copies
   them itself — this build's server never downloads, transcodes, or
   uploads a single image byte. There is no `images.ts` and no per-image
   table, unlike Etsy.

## Operator setup and recovery

- Required Netlify variables are `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`,
  `EBAY_RUNAME`, `EBAY_TOKEN_ENC_KEY`, `EBAY_VERIFICATION_TOKEN`, and
  `EBAY_ENV=production`. `EBAY_CRON_SECRET` is required only for scheduled price
  pushes. Never record their values in the project.
- The production RuName and callback URLs must exactly match the eBay Developer
  portal. The account-deletion endpoint must use the same verification token and
  remain active; its GET challenge and signed POST test have been confirmed live.
- Before the first write, Business Policies must provide the payment, return,
  and fulfillment policies selected in Admin Settings, and the merchant
  inventory location must be initialized. Use Preview first; eBay has no draft
  state, so only the explicit **Publish on eBay** action makes the offer public.
- Disconnecting clears local credentials but never deletes remote listings. For
  an account change, delist while still connected to the old account, reconnect,
  reselect policies/location, provision shipping tiers, then use the dry-run-first
  local listing-state reset before syncing against the new account.
- Listings must not steer buyers off eBay. The mapper is allowlist-based so
  private acquisition, cost, minimum-price, internal-note, and spot-snapshot
  fields cannot enter provider payloads.

## Module layout (`next-app/src/lib/ebay/`)

- **`client.ts`** — fetch wrapper: `Authorization: Bearer`, `Content-Language:
  en-US` on writes, throttle (~3.5 req/s courtesy pace) + 429/5xx backoff
  (1s/2s/4s + jitter, up to 3 retries), typed `EbayApiError` (`status`,
  `code`, `operatorMessage`, `retryable`, `errorId`/`category` from eBay's
  error envelope, redacted `detail`), and a cached client-credentials
  application token (`getApplicationToken()`) for Taxonomy/Metadata/
  Notification-public-key-class calls that don't need a seller's user
  token.
- **`auth.ts`** — OAuth 2.0 authorization-code grant, **no PKCE** (eBay
  requires a confidential client — HTTP Basic `client_id:client_secret` on
  every token call, so the exchange is server-side only). AES-256-GCM token
  encryption (`EBAY_TOKEN_ENC_KEY`, SHA-256-derived key, `iv.tag.ciphertext`
  storage format — same scheme as `etsy/auth.ts`, copied not imported).
  Refresh is on-demand (2-minute skew window), with a cheap single-flight
  guard on `access_token_expires_at` rather than Etsy's refresh-token
  rotation CAS, since **eBay refresh tokens don't rotate** (~18-month hard
  expiry instead).
- **`mapping.ts`** — pure, unit-tested (49 tests)
  `Product → InventoryItem + Offer` payload functions. Allowlist-by-
  construction, same discipline as Etsy's mapper: `buildMappedPayload()`
  only ever reads named fields into a fresh object, never spreads
  `...product`, so `cost_basis`/`minimum_price`/`internal_notes`/etc.
  structurally cannot leak (asserted by test). Key pieces:
  - `mapTitle` — 80-char word-boundary truncation (tighter than Etsy's 140).
  - `mapAspects` — best-effort `{Metal, Metal Purity, Type, Brand, Chain
    Length | Ring Size, Year Manufactured, Item Weight}` (see "Build-time
    resolutions and known gaps" below — not validated against eBay's live
    value lists).
  - `resolveCategory` — Fine vs Fashion Jewelry routing (Q4): solid metals
    → pinned Fine Jewelry leaf ids; `metal_variant === 'vermeil'` → Fashion
    Jewelry (unpinned, see gaps below — resolves to `null`, blocking
    pre-flight rather than guessing). Coin/Bullion → `null` always (Q6).
  - `computeEbayPrice` — reuses `calcSpotPriceValue`/
    `parseManualPriceLabelValue` (`lib/pricing.ts`, never reimplemented),
    applies the eBay-specific admin-variable markup (Q2, seeded 15%). No
    platform price floor (unlike Etsy's $0.20).
  - `resolveFulfillmentPolicyId` — **Q16**: compares the flattened price
    against `ebay_connection.high_value_shipping_threshold` (seeded $1000);
    over threshold → `express_fulfillment_policy_id` ("NEJ Express
    High-Value"), else → `fulfillment_policy_id` ("NEJ Insured Flat Rate").
    Pure mapping-time branch, no extra API call. The resolved policy id is
    part of `computeContentHash()`'s input, so a price crossing the
    threshold triggers an update push.
  - `buildPreflightChecks` — connected / account defaults present / not
    Coin-or-Bullion (Q6) / `status === 'available'` / quantity ≥ 1 / price
    computable / has images / category resolved (with an approximate-flag
    warning) — all no-eBay-call, all shown in the dry-run preview.
- **`sync.ts`** — the step machine (`item → offer → review|published →
  out_of_date|hidden_oos|ended|error`), Phase 2 bulk queue drain
  (`drainQueueCore`, dependency-injected and unit-tested — 9 tests), the
  scheduled/manual price push, and `handleProductStatusChange()` (the Q7
  auto-hide/withdraw hook). Runaway-prevention (a bulk re-enqueue of an
  already-published item reinterpreted as `mode: 'update'` instead of a
  fresh publish, plus a drain seen-guard) is built in **from day one** here
  — on Etsy this was a fix added after a real production incident
  (`CHANGELOG.md` 2026-07-08, seventeenth addendum).
- **`guards.ts`** — client-safe home of `EBAY_BULK_ENQUEUE_LIMIT` (25), kept
  out of `sync.ts` (which is `server-only`) so the admin bulk-sync modal can
  state the same cap the server enforces. Re-exported from `sync.ts`, so
  existing imports are unchanged.
- **`store.ts`** — typed access to `ebay_connection` / `ebay_oauth_states` /
  `ebay_listings` / `ebay_sync_log` (service-role only; same
  schema-not-migrated defensive pattern as `etsy/store.ts`).

## Database (`supabase/ebay-sync.sql` - applied)

One fewer table than Etsy (no `ebay_listing_images` — see "no image bytes"
above):

- **`ebay_connection`** — single row (`id=1`): OAuth tokens (encrypted),
  account defaults (`fulfillment_policy_id`, `express_fulfillment_policy_id`,
  `high_value_shipping_threshold`, `payment_policy_id`, `return_policy_id`,
  `merchant_location_key`), selling-limit snapshot (informational, Q14),
  sync policy (`auto_publish` Q1, `sold_handling` Q7, `best_offer_enabled`
  Q9, `price_push_enabled`/`price_push_threshold_pct` Q3,
  `price_markup_pct` Q2), and `orders_cursor` (column exists for the Phase 3
  seam; unused — no route reads/writes it).
- **`ebay_oauth_states`** — transient CSRF state, 10-minute TTL by
  convention, no PKCE verifier column (eBay's grant has no PKCE).
- **`ebay_listings`** — `product_id` (text, PK, FK → `products.id`)
  ↔ `ebay_sku` (= `products.id` verbatim, Q11) ↔ `ebay_offer_id` ↔
  `ebay_listing_id`; `sync_state` (`pending | item_synced | offer_created |
  review | published | out_of_date | hidden_oos | ended | error`);
  `content_hash`; `last_pushed_price`/`last_pushed_qty`; `category_id`;
  `last_error`/`error_count`.
- **`ebay_sync_log`** — audit/dead-letter, same shape as Etsy's.
- **`claim_next_pending_ebay_listing()`** — `FOR UPDATE SKIP LOCKED` RPC,
  mirrors `claim_next_pending_etsy_listing()`.

All four tables: RLS enabled, **no policies** (service-role only, same trust
model as `webhook_events`).

## API routes (all under `/api/admin/ebay/*`, admin-gated via `requireAdmin()`
+ service-role client; errors shaped `{ error: { code, message } }` — note
this differs from the Etsy routes' plain `{ error: string }`)

`connect` (GET, starts OAuth) · `callback` (GET, code exchange) · `status`
(GET) · `disconnect` (POST) · `settings` (PUT, partial patch) ·
`account-profiles` (GET, policy/location dropdowns) · `preview` (POST,
dry-run) · `sync` (POST, modes `publish`/`update`/`price-only`/
`publish-live`) · `sync-batch` (POST, Phase 2 `enqueue`/
`enqueue-all-eligible`/`drain`) · `delist` (POST, `hide`/`withdraw`/
`restore`) · `listings` (GET, bulk chip map) · `eligibility-summary` (GET) ·
`verify-listing` (POST) · `verify-all` (POST; all linked listings or
optional validated `productIds`) · `price-push` (POST,
`x-cron-secret` header, not admin-gated — a cron has no browser session) ·
`push-prices` (POST, admin-gated manual push).

Plus, outside `/api/admin/ebay/`: **`/api/webhooks/ebay-account-deletion`**
(Phase 0 compliance endpoint, not admin-gated — eBay calls it directly). GET
answers the challenge (`hex(sha256(challengeCode + EBAY_VERIFICATION_TOKEN +
endpointUrl))`, exact concatenation order, unit-tested). POST verifies
`X-EBAY-SIGNATURE`, records a sanitized notification in `webhook_events`
(`provider='ebay'`, unique on `(provider, event_id)`) for idempotency, and
acks 200. The stored payload keeps only notification metadata
(`notificationId`, event/publish dates, publish attempt count) and strips eBay
user identifiers (`username`, `userId`, `eiasToken`) before persistence. We
store no eBay buyer data (no Phase 3), so the handler is close to a no-op by
design.

**2026-09-13:** the receipt is now ONE insert written already `processed`.
The handler no longer writes an `account_deletion` row to `ebay_sync_log` or
updates the receipt afterwards. Those rows were ~1,760/day, 97% of the log, and
never read; the admin log's `excludeActions: ['account_deletion']` filter stays
for the old rows until retention removes them. Guarded by
`__tests__/post-success.test.ts`. Retention for old receipts (30 days) and old
`account_deletion` log rows (7 days) is `supabase/log-retention-2026-09.sql`
(owner-run SQL).

**2026-07-16 correction:** the first live implementation stored raw
account-deletion payloads in `webhook_events.payload`; a read-only audit found
10,922 existing rows with eBay user identifiers. Code is fixed for future rows,
but the existing rows need the owner-confirmed scrub tracked in `TASKS.md`.

Phase 3's order-ingest route is **not built** (Q15 — deferred, manual
handling is fine; the `orders_cursor` column is the only seam left in
place).

## Admin UX

- **`EbaySettingsPanel.tsx`** (composed into `/admin/settings`, next to
  `EtsySettingsPanel`): connect/reconnect/disconnect, 18-month
  reconnect-by countdown, 5 policy fields — standard shipping, **express
  shipping (Q16, new — no Etsy precedent)**, **high-value threshold $
  (Q16)**, payment, return — plus a read-only inventory-location display,
  selling-limit readout, sync-policy toggles (auto-publish, sold-handling,
  best-offer, price-push), and the markup field with the **exact same**
  explicit-Save / `pricesStale` callout / gold "Push prices to eBay now"
  button interaction the Etsy panel settled on (Q2 explicitly required
  this).
- **`EbayProductPanel.tsx`** (drawer section next to the Etsy one): sync
  state chip, pre-flight checklist, mapped-payload preview (title, price,
  condition, category + approximate flag, aspects, image count, **which
  shipping tier this item resolves to**), and action buttons — Refresh
  Preview, Sync to eBay / Sync Updates (stall-guarded polling loop),
  **Publish on eBay** (only enabled once `syncState === 'review'`, copy
  makes clear it's live immediately), Push price only, Check eBay Status,
  Hide / End / Restore. **Since 2026-09-13** Quantity and every
  product-backed aspect (Metal, Metal Purity, Type, Brand, Year Manufactured,
  Item Weight, Main Stone, Chain Type, Chain Length / Ring Size — empty ones
  included) have the review window's pencil editors (shared
  `ProductFieldInlineEditor.tsx` → `PUT /api/admin/products/fields`); the
  preview re-runs after a save, and inside the open listing editor the value is
  merged into the form so its Save cannot revert it. Style and the category
  stay read-only (Type moves the category). Same panel on the Manage eBay page.
- **`EbayBulkSyncModal.tsx`** (Phase 2, toolbar button "Sync all to eBay"):
  eligibility summary (`"{eligible} eligible · {ineligible} ineligible ·
  {upToDate} up to date · {errors} errors"`, with Coin/Bullion items
  showing up under "ineligible" with the Q6 reason), enqueue + drain with
  live progress and a cooperative "Stop after current item" cancel.
- **Product Admin selected Actions** — **Check eBay** reconciles only the
  selected linked offers, reports checked/updated/reset/error/skipped totals,
  refreshes eBay chips on close, and keeps the selection for a follow-up sync.
- **Price automation:** the daily 11:45 UTC trigger is **Supabase pg_cron**
  (`supabase/scheduled-jobs-pg-cron-2026-09.sql`), which POSTs the
  `EBAY_CRON_SECRET`-guarded route — the only scheduler since 2026-09-13. The
  GitHub workflow keeps a manual "Run workflow" button; its `schedule:` and the
  old `netlify/functions/ebay-price-push.mts` were removed after both started
  firing alongside pg_cron (history: GitHub 2026-08-11 → pg_cron 2026-09-07). Scheduled/manual planners bulk-load price inputs, reject
  fallback or missing relevant-metal spot values, and use eBay's 25-entry bulk
  update with per-item fallback for mixed failures. Admin Settings shows the last
  scheduled result, and since 2026-08-10 a never-run or overdue schedule renders
  as a red fault there rather than a green "Ready for…".
  🟢 The price-push toggle is enabled and the automation is **confirmed working
  2026-08-11**: first-ever `scheduled_price_push` row read *"50 pushed, 67
  unchanged, 1 blocked, 0 failed, 6 deferred"* (the 1 blocked is #82). Note the
  GitHub secret must match Netlify's `EBAY_CRON_SECRET`; a mismatch returns
  `401 {"code":"unauthorized","message":"Invalid cron secret."}`.
  ⚠️ **Bookkeeping is BATCHED and the budget is an ABSOLUTE deadline** since
  2026-08-21 — recording each push individually cost 100 Supabase round-trips
  (15.7s of a 22.2s run) and the loop-relative budget could not bound the
  request, which together drew a gateway 504 *after* all 50 prices had landed.
  See DECISIONS, *"Marketplace bookkeeping is batched"*. Do not unpick either;
  `lib/__tests__/marketplace-price-push-batching.test.ts` guards them.
- **Not built:** a dedicated "eBay: out of date / error / not listed"
  product-table filter chip — there's no existing single-marketplace filter
  control on the Etsy side to extend, so this was skipped rather than
  inventing a new filtering convention. The status chip + drawer + bulk
  modal cover the required surfaces.

## Lifecycle summary

`unlinked → pending → item_synced → offer_created → review (Q1 default) →
published → out_of_date (content hash mismatch) → published` (update loop);
`published → hidden_oos` (sold on-site, Q7 quantity-zero default) `→
published` (restocked); `→ ended` (withdraw, for archived/deleted or if Q7
is set to withdraw-on-sold) `→ pending` (re-publish mints a **new**
`ebay_listing_id`).

Phase 2 automation (`handleProductStatusChange`) is wired in **next to** the
existing Etsy call — never replacing it — at all three chokepoints that
change product status: `adminRevalidateProduct(s)`
(`app/actions/admin-products.ts`), PayPal `capture-order`, and the PayPal
webhook. Always best-effort/non-throwing (`void ...().catch(() => {})`), so
an eBay hiccup never blocks cache revalidation or a buyer's checkout
confirmation.

## Field mapping highlights

Same `products` → marketplace boundary as Etsy: `title_es`/`description_es`/
`tags_es`/`public_notes_es` never sync (eBay US listings are EN-only, no
per-listing translation write API); `tags` has no eBay equivalent (search
keywords live in title + aspects); `cost_basis`/`minimum_price`/
`internal_notes`/`private_price_label`/`melt_value`/`live_spot_snapshot`/
`acquisition_*` never leave the system (allowlist guarantee, test-asserted);
`sku` (the column) is unused — the eBay SKU key is `products.id` (Q11).
Condition is fixed: `USED_EXCELLENT` (id `3000`, "Pre-owned") + one standard
`conditionDescription` template for every item (Q5) — no per-item authoring.

## Shipping-tier campaign — COMPLETE (2026-08-11)

**85 of 86 available listings carry the correct tier.** The exception is #82
(write-blocked; fixable only on eBay). Verified on the live public listings
across two bands: $714.80 → **$35.00** ($600–1,000) and $10,098.83 → **$99.00
"Signed"** ($5,000–15,000, where the band's Registered Mail treatment shows up in
eBay's own wording). Both the single-item drawer path and the bulk path were
confirmed, which closes the long-standing "one controlled listing update remains
open" gate.

Two lessons from running it, both now encoded:

- **A capped bulk run also needs an ORDER.** `enqueueProducts` used to take
  `allowed.slice(0, 25)` with no notion of what still needed writing, so "select
  all → sync → repeat" re-queued the same 25 every time (measured: the second run
  redid 21 of 23). `orderEnqueueCandidates` now sorts **stale → error →
  published** before slicing. Ordering, not filtering, so a deliberate
  force-re-push of live items still works.
- **eBay errorId 25604 ("Availability not found") is TRANSIENT.** The failing
  pair rotated every run and each recovered on a later attempt — roughly 2 per
  25. Do not chase it as an item-specific defect; re-run and it clears.

## Products deliberately not on eBay

Two independent mechanisms, easy to confuse:

| Constant | Meaning |
| --- | --- |
| `EBAY_WRITE_BLOCKED_PRODUCT_IDS` | Live on eBay but unsafe to write to (#82, detached relist) |
| `EBAY_EXCLUDED_PRODUCT_IDS` | Not sold on this channel at all (#83/#84, the Rolexes) |

Both are dropped by `enqueueProducts`; the excluded ids additionally fail
pre-flight `eligibility` with "This item is not listed on eBay per owner
decision".

⚠️ **The exclusion is PER ITEM, not a `Watch` category rule** (owner: "just those
two items… other watches maybe in the future"). Folding it into
`isEbayIneligibleProductType` beside Coin/Bullion would silently block any future
watch; a test pins this by asserting an unrelated watch stays eligible. Both
Rolexes would also fail publish anyway — eBay category 31387 requires a
`Department` aspect `mapAspects` does not send — and **that `TODO(ebay-verify)`
is answered, not outstanding**: do not implement it. See DECISIONS, *"Watches are
not listed on eBay"*.

## Bulk-write guards (2026-08-04)

Three filters run before any bulk enqueue stages a write, in this order
(`enqueueProducts`, `sync.ts`):

1. **Pinned write-block.** `EBAY_WRITE_BLOCKED_PRODUCT_IDS`
   ([sync.ts:62](../../next-app/src/lib/ebay/sync.ts)) holds inventory #82's
   product id. The older detached-relist guard inferred its block from
   `last_error` still equalling `RELISTED_LISTING_WARNING`, which evaporates the
   moment anything overwrites that column. `isEbayWriteBlocked(productId,
   listing)` now asks both questions and is the single check every write path
   calls — `runSyncStep`, `publishLiveStep`, `priceOnlyStep`, `runDelist`, and
   `planEbayPricePush`. Unit-tested against a cleared, replaced, and missing
   `last_error`.
2. **Availability.** Non-`available` products are dropped before queueing. They
   would fail pre-flight anyway ("Only available items can be published to
   eBay"), but only after flipping to `error` and writing a log line each — 36
   sold listings would have buried the genuine failures.
3. **Batch cap.** `EBAY_BULK_ENQUEUE_LIMIT = 25`
   ([guards.ts](../../next-app/src/lib/ebay/guards.ts)) is the "never blanket
   re-sync" rule made mechanical. A policy or template change can flag the whole
   catalog at once; unbounded, one click would rewrite every live listing before
   anyone could spot-check the first.

`enqueueProducts` / `enqueueAllEligible` return `{ queued, blocked,
notAvailable, withheld }`, and `EbayBulkSyncModal` states the cap before the run
and the withheld/skipped counts after it, so a capped batch never reads as a
finished job.

### Freshness scan never hashes a sold piece

`resolveFreshnessScanAction(listing, productStatus)` decides each row before any
hashing: `hash` (available, not yet flagged), `skip` (not available, or already
flagged), or `repair-hidden`. `out_of_date` means "needs a content push", and a
sold piece must never be pushed, so hashing one can only produce a false flag.
Until 2026-08-04 the scan included `hidden_oos` rows and the tier policy change
flipped all 36 sold-and-hidden listings, inflating the campaign by a third.
`repair-hidden` restores those, gated on `last_pushed_qty === 0` — written by
`hideListingQuantityZero()`, never touched by the scan, so it proves the hide
actually happened and distinguishes a mis-flagged row from a just-sold row whose
auto-hide has not run yet.

**Why the daily price push cannot clear a shipping-policy flag:** it sends
price/quantity only (`bulkUpdatePriceQuantity`). `fulfillmentPolicyId` travels
on the full offer body, so only a `runSyncStep` update applies a new tier
policy. A shipping-policy change therefore requires deliberate batched syncs.

**Price-push eligibility (2026-08-08).** `planEbayPricePush` skips a listing
when any of these hold, in addition to the existing write-block and
missing-offer checks:

- the product's **current status is not `available`** — a sold product's listing
  stays `out_of_date` forever while its offer is already withdrawn (quantity 0),
  so every push is a guaranteed HTTP 400. This was 36 of 124 listings and ~33
  failures per run. Keyed on live product status, so relisting revives it.
- `error_count >= MAX_PRICE_PUSH_ATTEMPTS` (3). A successful push resets the
  count, so the ceiling un-sticks itself once the underlying problem is fixed.

Failures now increment `error_count`, set `last_error`, and persist the eBay
`detail` (status, code, errorId, category, response, offer id, SKU, attempted
price). Before this they wrote a no-op `{}` patch and logged only the operator
sentence, which is why 140 rows read `eBay API error (HTTP 400).` with no cause.

## Current constraints and verification

- The account-deletion webhook, production keyset, OAuth, previews, controlled
  publishes/updates, category and fulfillment-policy paths, and selected
  status/relist reconciliation have been exercised live.
- `EBAY_FASHION_CATEGORY_MAP` contains the live-verified catalog leaves.
  Unsupported future Fashion types fail preflight instead of guessing, and
  selected aspect values can still fail loudly at provider validation.
- `ebay_username` remains intentionally unavailable with the granted scopes;
  Admin Settings shows connection time and refresh-token countdown instead.
- Current `TODO(ebay-verify)` items cover sandbox-host assumptions, selected
  allowed aspect values, and multi-SKU price batching. Controlled write-path,
  idempotency, external relist #82, and shipping-tier checks remain in
  `TASKS.md`; do not blanket re-sync to test them.
- The scheduled price function is secret-guarded, fails closed on missing or
  fallback spot data, and records a run summary. Use the Admin last-run card and
  provider listing after any deliberate live run.
- The full incident and verification history remains in `CHANGELOG.md`.
