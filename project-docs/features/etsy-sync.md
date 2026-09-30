# Feature: Etsy Sync

> **Shipping tiers (built 2026-07-30, provisioned 2026-08-02):** listing
> shipping now follows the site's value-based tiers. Settings → Etsy Sync has
> a "Provision tiered shipping profiles" action that creates/updates one Etsy
> shipping profile per distinct tier fee ($19–$165, canonical titles
> "NEJ Insured Shipping $N", origin ZIP 34116) and maps them in
> `marketplace_shipping_profiles` (`supabase/marketplace-shipping-tiers-2026-07.sql`
> is applied). Current behavior:
> new drafts are created with the price-band profile, update/price-only syncs
> reconcile the profile off the existing listing GET (PATCH only on change,
> logged as `shipping_tier`), and bulk/scheduled price pushes re-profile only
> when a price crosses a tier boundary. Missing mappings still fail safely to
> the connection's default profile. All seven profile IDs are recorded in
> `features/shipping-tiers.md`; one controlled listing update remains open.

> **2026-09-12 (night, staged — needs SQL + reconnect) — Etsy sale → site
> sold:** the 30-minute `reconcile-status` sweep first reads paid receipts
> (`getShopReceipts`, scope `transactions_r`), maps each line by
> `listing_id` → `etsy_listings`, and applies it with
> `apply_marketplace_sale()` (checkout's quantity/sold/sold_price rule); a
> product that becomes sold has its Etsy row marked `delisted` here and the
> eBay status hook ends the eBay listing. Armed from the first run after
> the reconnect (`etsy_connection.sales_cursor`); switch
> `auto_mark_sold` in Settings. `lib/marketplace-sales*.ts`,
> `supabase/marketplace-sales-2026-09.sql`; `CHANGELOG.md` 2026-09-12 (night).
> **Phase 3 (order webhooks) is still not built and not needed** — polling
> every 30 minutes is the design.

> **2026-09-12 (staged) — edit in the review window:** "Review before
> submitting to Etsy" now edits product fields in place (quantity, length /
> ring size / height, brand, year → When made, metal colour + purity →
> Materials, type) through `PUT /api/admin/products/fields`, shows the extra
> tags field, and picks the category from `EtsyCategoryDropdown` (Jewelry's
> 82 leaves grouped by branch, search over all 2,503, parent path always
> visible, craft-supply groups flagged). Etsy has no finished-jewelry
> "Pendants" leaf — both "Pendants" entries are craft-supply components —
> so `Pendant → Pendant Necklaces (1229)` stays the default. Length accepts
> `mm`/`cm` and converts to inches before the Length property push; the
> description prints `Purity: 14K` / `925` and the product page's
> `Length/Size` wording. `CHANGELOG.md` 2026-09-12; rules in `DECISIONS.md`
> → *"Review-window edits write to the product"*.

> Status: **Phase 1 + Phase 2 built and confirmed live end to end.** Phase 3
> (Etsy order webhooks) is out of scope and not built. This document is the
> current technical contract and operator runbook; implementation history lives
> in `project-docs/CHANGELOG.md`.

## What this is

**2026-07-21 resumable queue fix:** Bounded four-image work remains claimable
across requests after a row advances from `pending` to `draft_created`,
`images_synced`, or `inventory_synced`; `out_of_date` updates use the same
durable continuation contract. Normal and repair drains have separate atomic
claim RPCs. Admin Actions exposes a counted **Repair all Etsy sync issues**
flow that checks remote lifecycle and resumes only linked interrupted/drifted
rows. `supabase/etsy-resumable-sync-queue-2026-07.sql` is applied and the first
live run repaired all 36 affected listings with zero remaining/error rows.
Successful update-mode inventory writes also persist `last_pushed_price`, so a
completed recovery establishes both content and price baselines.

**2026-07-21 reviewed category correction:** The selected-products sequential
review form exposes Etsy's full exact-category picker and saves the established
per-product taxonomy override, then reloads that item's preflight before submit.
Live seller-taxonomy mappings cover Grape Shears/Serving Set (1052), Coaster
(1060), and Matchbox Holder/Vesta Case (closest leaf 1867). Any future unknown
custom type uses approximate generic collectible leaf 69 instead of blocking;
the visible warning and picker let the admin correct it before posting. Existing
Error rows from the old unmapped preflight clear on their next successful sync.

**2026-07-21 review-warning fix:** Etsy upload advisories identify the photo
rank and deduplicate repeated text within one photo. The sequential review flow
retains a unique accumulated warning set across all bounded image requests and
does not use display text alone as a React key, preventing identical source-size
advisories from triggering the Next.js duplicate-key overlay.

**2026-09-24 manual hold (STAGED, deploy owed):** the reconcile sweep's
`restore` branch (available product + `delisted` listing → `runReactivate`) no
longer fires for a listing the owner deactivated. `runDelist(productId, source)`
records `manual:`/`auto:` in the delist log message; `detectEtsyStatusDrift`
takes a third `manualHold` argument and `isEtsyManualHold(latestDelistMessage)`
releases the hold only for an `auto:` row — no row (deactivated on Etsy's side,
or before this rule) and every `manual:` row keep the listing off Etsy.
`getLatestDelistMessages` (store) feeds the sweep in one query for restore
candidates only; the hook and the repair after-check read per product. The
`delist` branch is unchanged. Trigger: 33 listings with melt > $300 were
deactivated from the admin on the owner's instruction and the next sweep would
have restored all of them; *Auto-delist when sold/archived* is OFF until the
deploy is live (`CHANGELOG.md` 2026-09-24 (1), `DECISIONS.md` Etsy).

**2026-09-07 reconcile-on-refusal:** a refused delist/relist (Etsy will not
change the state of a listing it already closed — a sold single-quantity
listing sits in `edit`, quantity 0, and `updateListing` answers "/quantity :
cannot be empty") no longer loops. The hook logs the refusal as a
`status_change_hook` error row (was console-only); the 30-minute sweep then
runs the read-only status check, which maps `edit`/`sold_out` → `delisted`,
and counts the listing as **reconciled**, not repaired. Summary row:
`N scanned, D drifted, R repaired, C reconciled, F failed, X deferred`.
Shared pure bookkeeping: `src/lib/marketplace-drift-repair.ts`.

**2026-07-21 status-drift fix:** An active Etsy status check preserves local
`out_of_date` instead of replacing it with `active`. Remote lifecycle and local
content freshness remain independent, and the result explains that the listing
is active while local updates still need to be synced. A successful update,
which refreshes the content hash, remains the path that clears the flag.

**2026-07-21 status-to-post route:** Each product in the selected status
dialog's Etsy Not listed detail has **Post to Etsy**. It scopes the existing
selected Etsy sync dialog to that product, where the admin still chooses
immediate sync or review-first submission. Closing or completing that route
returns to a newly reconciled combined status summary without clearing the
original table selection.

**2026-07-20 selected review-first sync:** Selected products can either use the
existing immediate Etsy batch queue or open a sequential review flow. Each step
loads the real Etsy preview checks and mapped fields, chooses publish versus
update from the local listing summary, and runs the existing bounded Etsy sync
endpoint only after the admin submits. Terminal success advances to the next
item; the current item remains available for refresh/retry on failure, and an
explicit skip is counted. In Sync to both, completing or skipping the Etsy set
hands the same selection to the eBay method chooser.

**2026-07-20 selected reconciliation:** The Admin Products Actions modal has a
channel-specific **Check Etsy status** action for the selected products. It
calls `verify-all` with an optional deduplicated `productIds` list and returns
a final state for every selected product independently from eBay. The default
view reduces those records to clickable Listed, Not listed, and Needs attention
totals. A nonzero total opens only its matching products and translates Etsy
state into Live, Draft, Not listed, Inactive, Out of date, or a check/error
result; Back restores the totals without another request. The internal
local-update count remains in the API contract but is not displayed. It only
reads Etsy and reconciles local state; it does not push listing content, and a
failed Etsy check can be retried without discarding a successful eBay result.
The selection remains active for a follow-up sync. A live mixed-status check
showed one Listed and one Not listed, and both drill-downs passed.

**2026-07-17 progress correction:** The admin product panel converts Etsy's
bounded four-operation image responses into cumulative progress against the
first response's fixed total. The displayed numerator advances across requests,
the denominator stays fixed, and partial failures count only successful work.

**2026-07-16 full API audit:** All 83 linked listings were read from Etsy: 70
active, 7 in Etsy's `edit` state, and 6 initially rate-limited listings that
all returned active on individual retry. Inventory #83's local `out_of_date`
state is intentional because app content changed; no unexplained drift was
found. Existing-listing update and price-only writes now fetch remote state and
proceed only for writable active/draft listings. Reactivation always sends the
remote active-state request, and manual/scheduled batch summaries count returned
sync errors as failures instead of reporting a false push.

A one-way push of the Naples Estate Jewelry catalog (Supabase `products`,
which stays the sole source of truth) to the owner's Etsy shop as a secondary,
admin-driven sales channel. Nothing on Etsy is ever authoritative for catalog
data; the only planned Etsy → us data flow (order events) is Phase 3, which is
explicitly out of scope for this build.

## Operator setup and recovery

- Required Netlify variables are `ETSY_API_KEY`, `ETSY_SHARED_SECRET`,
  `ETSY_TOKEN_ENC_KEY`, and `ETSY_REDIRECT_URI`. `ETSY_CRON_SECRET` is required
  only for scheduled price pushes. Never record their values in the project.
- The redirect URI must exactly match the Etsy app registration and the deployed
  callback. Every API request uses `x-api-key: <keystring>:<shared-secret>`;
  omitting the shared secret makes every provider call fail.
- Wearable length and ring size sync by default. Set
  `ETSY_SYNC_BRACELET_LENGTH=false` or `ETSY_SYNC_RING_SIZE=false` only to
  disable those mappings.
- After connecting in Admin Settings, select the shop shipping profile, return
  policy, and readiness state before the first sync. Use Preview first, create a
  draft, verify title/category/properties/photos/price on Etsy, and activate only
  after review.
- Disconnecting clears local credentials but never deletes remote listings.
  Sold/delist/relist automation remains best-effort and should be checked through
  the per-product status and sync log after any ambiguous provider response.
- Listings must not steer buyers off Etsy. The mapper is allowlist-based so
  private acquisition, cost, minimum-price, internal-note, and spot-snapshot
  fields cannot enter provider payloads.

## Module layout

```text
next-app/src/lib/etsy/
  client.ts   fetch wrapper: x-api-key + bearer auth, ~4 req/s throttle,
              429/5xx backoff (1s/2s/4s), typed EtsyApiError with an
              redacted operator-facing messages
  auth.ts     OAuth 2.0 + PKCE (connect/callback), AES-256-GCM token
              encryption (key: ETSY_TOKEN_ENC_KEY, SHA-256-derived so any
              non-empty string works), refresh-on-demand with rotation and a
              conditional-update race guard
  mapping.ts  PURE functions, unit-tested: Product -> Etsy payload. Title
              truncation (140 char, word boundary) + "&"-once rule (Etsy
              allows one "&" per title; the rest become "and" — live 400 fix,
              CHANGELOG.md session 9 twelfth addendum), tags (13 x 20 chars,
              WORD-BOUNDARY truncation — never chops a word mid-way, see
              CHANGELOG.md 2026-07-08 session 9 seventh addendum;
              jt:/ct:/len: prefix stripping, composed buyer-searchable
              phrases, paired vintage/antique category tags — jewelry-level
              + metal-specific, always all-or-nothing per pair), materials,
              when_made buckets + vintage fallback,
              price flattening + 8% markup + $0.20 floor, taxonomy
              resolution (ETSY_TAXONOMY_MAP coarse types + an
              ETSY_KEYWORD_TAXONOMY fallback that maps granular silver
              holloware/flatware/serveware types — "Berry Spoon", "Coffee
              Pot", "Koma Clasp", … — to real Etsy leaves so they're no
              longer stuck ineligible; CHANGELOG.md session 9 eleventh
              addendum), pre-flight checks (incl. a non-blocking
              title↔product_type mismatch warning via titleImpliedJewelryType
              — CHANGELOG.md session 9 sixteenth addendum), content-hash. Also
              mapProperties(): structured category properties (Material,
              Gold purity/solidity) — see "Structured category properties"
              below for what's covered and what's deliberately never
              guessed. Allowlist-based: only ever reads named Product fields
              into a fresh object, so cost_basis/minimum_price/
              internal_notes/etc. cannot structurally leak into a payload.
  images.ts   Supabase Storage / legacy /assets fetch (resolveImageUrl()
              resolves a relative path against getSiteUrl() first — Node's
              fetch() has no implicit origin like a browser does; see
              CHANGELOG.md 2026-07-08 session 9 fourth addendum) -> sharp
              WebP->JPEG transcode (quality 90, flattened to white for
              alpha, format sniffed from bytes not extension, resized
              down-only to 2400px) -> multipart upload; pure image-diff
              planning (planImageDiff — deletes before uploads) and
              crash-window reconciliation. Since 2026-09-13 every photo pass
              first reads the listing's live images and drops checkpoint rows
              Etsy no longer has (partitionRowsByLiveImages, so those photos
              re-upload), and recovery adopts only images no row tracks
              (planImageAdoptions) — the inv #33/#82 "photos never uploaded"
              bug; see DECISIONS.md → "Etsy photo checkpoints are verified".
              A sync that finds the listing deleted on Etsy resets it to
              not-listed (resetDeletedEtsyListing in sync.ts).
              computeUploadWarnings() checks against Etsy's own photo
              guidance (both-dimensions 2000px, first-photo 635px, 1MB file
              size) — non-blocking, see CHANGELOG.md 2026-07-08 (session 6)
  sync.ts     the step machine (pending -> draft_created -> images_synced ->
              inventory_synced -> active|draft_review), Phase 2 bulk queue
              (enqueue/drain), content-hash out-of-date scan, scheduled price
              push, handleProductStatusChange() (auto-delist/relist hook),
              and pushListingProperties() (best-effort structured-property
              push, part of the inventory step, never blocks the sync) —
              also calls length-experiment.ts's attemptLengthSync() unless
              ETSY_SYNC_BRACELET_LENGTH=false and ring-size-experiment.ts's
              attemptRingSizeSync() unless ETSY_SYNC_RING_SIZE=false (both ON
              by default as of session 9)
  length-experiment.ts
              Wearable length (2026-07-08 session 7, generalized session 9
              beyond Bracelet to every length-bearing category — Necklace/
              Pendant/Charm/Earrings/Brooch/Cufflinks/Watch/Coin/Bullion/
              Silverware) — a dynamic discover-write-verify cycle, see
              "Structured category properties" below. Live-resolves the
              real property/scale/value ids every time (never hardcoded),
              and reads every write back to verify before calling it a
              success.
  ring-size-experiment.ts
              Ring size ONLY (2026-07-08 session 9) — a genuinely different,
              enumerated property (real possible_values, e.g. "7 1/2",
              scoped to a region scale). Same write-then-verify discipline
              as length-experiment.ts, but never uses a placeholder — only a
              real, matched chart entry, or reports unsupported for that
              value. See "Structured category properties" below.
  store.ts    typed access to the five etsy_* tables (service-role only)
```

## Structured category properties (mapProperties, 2026-07-08 sessions 3 & 5)

Etsy's own listing editor shows "Suggested:" chips for several category
attributes (Material, Gold purity, Gemstone, Bracelet width/length,
Adjustable) when a seller edits a listing by hand. The v3 API has **no
endpoint that returns those UI suggestions** (confirmed by a full spec
search — only `allow_suggested_title`/`suggested_title` exists, a title
suggestion, not attributes). `mapProperties()` in `mapping.ts` pushes the
same *kind* of values ourselves via `updateListingProperty`
(`client.ts`), computed from data already on the product record, via a new
best-effort sub-step in `sync.ts`'s inventory step
(`pushListingProperties()` — per-property try/catch, a failure becomes a
`warnings[]` entry, never a thrown error).

Covers every `ETSY_TAXONOMY_MAP` product type, not just Bracelet:

| Property | Applies to | Notes |
| --- | --- | --- |
| Material (`148789511893`) | every product type | same id/value vocabulary across every pinned category — **confirmed correct on the owner's live listing** (session 5) |
| Gold solidity (`570246213608`) / Gold purity (`570246213609`) | every jewelry category **except** Cufflinks, Coin/Bullion, Silverware | those 3 categories have no such property on their taxonomy node at all — pushing either would 400. **Confirmed correct live** (session 5: "Solid gold"/"14k" both landed right) |

**Never guessed** (no source column anywhere in the product schema):
Gemstone, Bracelet/Pendant width, Adjustable, Jewelry closure type, Watch
band material. Fabricating any of these on a live listing for a business
priced on real melt value/purity would be worse than leaving Etsy's own
manual "Suggested" chip for the seller to fill in by hand.

### Length (`length-experiment.ts`, not `mapProperties()`)

Session 5 removed a hardcoded guess (`value_ids` mirroring the scale_id)
after it returned HTTP 200 but silently stored **"Gray"** (a color from
Etsy's shared global value vocabulary, completely unrelated to the Length
property) instead of "7.75" — proof that a wrong guess here corrupts the
live listing rather than failing safely into a warning, unlike every other
property above. Session 7 rebuilt it as a dynamic discover-write-verify
cycle: nothing is ever hardcoded (property id, scale id, and — where
applicable — value id are all resolved fresh from a live
`getPropertiesByTaxonomyId` call every time), `value_ids` is never derived
from the length number, and every write is immediately read back and
compared before being treated as a success.

**🟢 Confirmed working live (session 8):** `value_ids: ['']` — an
empty-string placeholder, never a guessed number — causes Etsy to
auto-generate and assign its own real, shop-scoped `value_id` for the custom
length value. Read back via `getListingProperties` (the "General Release"
list endpoint — the singular `getListingProperty` this originally used is a
non-production stub per its own spec description, "Development in progress,
will only return a 501"; that mistake caused a false-alarm 404 before the
fix) and independently verified correct: property "Length", scale "Inches",
value "7.75".

**🟡 Generalized (session 9) to every length-bearing category** — Necklace,
Bracelet, Pendant, Charm, Earrings, Brooch, Cufflinks, Watch, Coin, Bullion,
Silverware (Ring excluded — see Ring size below). The mechanism never
depended on Bracelet specifically, only the gating did. **ON by default in
the regular sync pipeline as of session 9 (seventh addendum)** — the owner
confirmed it works and asked for automatic pushing, so it now runs on every
length-bearing sync with no env var needed; set
`ETSY_SYNC_BRACELET_LENGTH=false` to disable it (env var name kept as-is to
avoid a rename). Every write still goes through discover→write→read-back→
verify, so a bad value fails closed into a warning. The computed length that
will push is shown in the dry-run preview (Length row) for review before
syncing — the old manual "Test Length" button was removed (session 9, ninth
addendum) as redundant once length auto-syncs. Full story:
`project-docs/CHANGELOG.md` 2026-07-08 (sessions 7-9).

### Ring size (`ring-size-experiment.ts`, session 9)

A fundamentally different kind of property than Length: Etsy's "Ring size"
is a **real enumerated chart** (230 possible_values confirmed live for
taxonomy 1240) — fraction-notation sizes ("6", "6 1/2", "7 1/4"...), each
scoped to a region scale (US/CA, UK/AU, FR, DE). **UK/AU uses letter
notation entirely** ("A", "A 1/2", "B"...) for physically different sizes
than the same-looking US/CA number (confirmed via `equal_to`
cross-references) — real proof scale-scoping isn't optional caution here.

Because every standard size already has a real, discoverable `value_id`,
this **never needs Length's empty-string placeholder** — `buildRingSizePayload`
only ever uses a genuine possible_values match (scoped to the US/CA scale)
or returns `null` (unsupported for that specific value) when none exists,
never a guess or a fallback. Source data is the same `products.length`
field Length uses, parsed via the same dual-format acceptance already
established in `types/product.ts`. Runs only through the regular sync
pipeline (`attemptRingSizeSync`), ON by default unless
`ETSY_SYNC_RING_SIZE=false`; the computed size that will push is shown in the
dry-run preview (Ring size row) for review before syncing.

**🟢 Confirmed working live (session 9, addendum):** size 10.5 → "10 1/2" →
matched real chart entry `value_id 1604` (never invented) → written → read
back and independently verified correct (property "Ring size", scale
"US/CA", value "10 1/2"). Ran against a manually-overridden taxonomy leaf
("Multi-Stone Rings"), not the automatic guess — stronger proof the dynamic
discovery genuinely works per-listing, not just for one hardcoded default.
**ON by default in the regular sync pipeline as of session 9 (eighth
addendum)** — the owner asked for it to auto-push (same as Length); it now
runs on every Ring sync with no env var needed. Set `ETSY_SYNC_RING_SIZE=false`
to disable it. `buildRingSizePayload` only ever uses a real matched chart
value (never a guess/placeholder), and every write is read back and verified,
so a bad size fails closed into a warning. Full detail:
`project-docs/CHANGELOG.md` 2026-07-08 (session 9, addendum + eighth addendum).

## Database (`supabase/etsy-sync.sql` - applied)

Five additive tables, RLS-enabled with **no** anon/authenticated policies
(service-role only, same trust model as `webhook_events`):

- `etsy_connection` — single row (`id=1`): OAuth tokens (encrypted),
  shop id/name, shop defaults (shipping profile/return policy/readiness
  state), and sync policy (`auto_activate`, `auto_delist_on_sold`,
  `price_push_enabled`, `price_push_threshold_pct`, `price_markup_pct`).
- `etsy_oauth_states` — transient PKCE handshake rows (10-min TTL,
  opportunistically purged).
- `etsy_listings` — `product_id` (PK, FK to `products`, cascade) ↔
  `etsy_listing_id`, `sync_state` (the state machine), `content_hash`,
  `last_pushed_price`, `taxonomy_id`, `last_error`, `error_count`.
- `etsy_listing_images` — per-image checkpoint: `source_url`/`source_key`
  (change-detection identity), `etsy_listing_image_id`, `rank`,
  `bytes_sha256`.
- `etsy_sync_log` — audit/dead-letter: action, outcome, redacted message/detail.
- `claim_next_pending_etsy_listing()` — a `FOR UPDATE SKIP LOCKED` RPC so two
  concurrent normal drains cannot grab the same product. It claims `pending`,
  `draft_created`, `images_synced`, `inventory_synced`, and `out_of_date`, so
  bounded work stays queued until terminal completion.
- `claim_next_repairable_etsy_listing()` — the same atomic contract restricted
  to linked `draft_created`, `images_synced`, `inventory_synced`, and
  `out_of_date` rows. It powers the explicit global repair without creating
  unrelated new Etsy drafts.
- `supabase/etsy-resumable-sync-queue-2026-07.sql` idempotently installs both
  claim functions and their service-role-only grants.

## API routes (`/api/admin/etsy/*`, admin-gated, service-role client)

| Route | Method | Purpose |
| --- | --- | --- |
| `connect` | GET | Start OAuth (PKCE), redirect to Etsy consent |
| `callback` | GET | Code exchange, resolve shop, persist connection |
| `status` | GET | Connection status, defaults, policy, recent activity log |
| `disconnect` | POST | Clear stored tokens (listings on Etsy untouched) |
| `settings` | PUT | Save shop defaults + sync policy |
| `shop-profiles` | GET | Proxy-read shipping profiles/return policies/readiness states |
| `preview` | POST | Dry-run: pre-flight + mapped payload, zero Etsy calls |
| `sync` | POST | One bounded step-machine invocation (`publish`\|`update`\|`price-only`) |
| `sync-batch` | POST | Phase 2: `enqueue` \| `enqueue-all-eligible` \| `drain` \| `drain-repair` |
| `delist` | POST | Deactivate or reactivate a linked listing |
| `listings` | GET | Bulk `product_id -> sync_state` map (product table chip) |
| `eligibility-summary` | GET | Bulk pre-flight counts for the "Sync All" confirm screen |
| `repair-summary` | GET | Read-only drift scan and count of linked interrupted/out-of-date listings |
| `verify-listing` | POST | Reconcile ONE listing's local state with Etsy's real state (read-only; clears a stale error, resets a 404 to not-listed) |
| `verify-all` | POST | Reconcile all linked listings or only optional validated `productIds` (`checkAllListingStatuses`); read-only, no content re-push |
| `price-push` | POST | Phase 2 scheduled price push — secret-header-guarded, not admin-session-gated |
| `push-prices` | POST | Manual "Push prices now" — one bounded batch of the price-only push across live listings whose price drifted (ignores the daily threshold); client polls until done. See CHANGELOG.md session 9 thirteenth addendum |

`/api/webhooks/etsy` (Phase 3, order ingest) is **not built** — the plan
documents `webhook_events` reuse for it but explicitly scopes it out of this
build.

**Price-push eligibility (2026-08-08).** `planEtsyPricePush` now also skips a
listing when the product's current status is not `available`, or when
`error_count >= MAX_PRICE_PUSH_ATTEMPTS` (3, reset by a successful push).

This is **defence in depth on Etsy, not a live fix**: Etsy's auto-delist moves a
sold product's listing to `delisted`, which sits outside the price-push
selection, so 0 of its 90 candidates were non-available when this was measured.
The eBay twin leaves them `out_of_date` — inside its selection — which is how
eBay ended up sending ~33 guaranteed-400 price updates every run. Etsy's
protection is a side effect of a different code path, so it is now checked here
explicitly too.

Failures also increment `error_count`, set `last_error`, and persist the Etsy
`detail` (status, code, response, listing id, attempted price). Previously the
failure path wrote a no-op `{}` patch and dropped `err.detail`, the field
`EtsyApiError` documents as safe to store in `etsy_sync_log.detail`.

## Admin UX

- **`/admin/settings` → Etsy Sync panel** (`EtsySettingsPanel.tsx`):
  connect/disconnect, shipping/return/readiness dropdowns, sync-policy
  toggles (auto-activate, auto-delist, price push + threshold), the markup %
  with an explicit **Save** button (it re-prices the whole catalog, so it
  commits deliberately, not on blur), a **Push prices to Etsy now** button
  (batched price-only re-push across all live listings, ignores the daily
  threshold), recent activity log, and the required Etsy trademark
  attribution line. Saving a *new* markup value marks prices stale and shows a
  highlighted callout above the push button (button turns gold) — because
  "Sync All" skips already-live items, "Push prices to Etsy now" is the tool
  that actually applies a markup change to live listings; the callout clears
  once the push completes (session 9, twentieth addendum).
- **Product Admin table** — a per-row Etsy status chip (Not listed / Draft /
  Needs review / Active / Out of date / Delisted / Error), fed by one bulk
  `/api/admin/etsy/listings` fetch (a local DB read, no Etsy API). Fetched on
  mount via a `refreshEtsyChips` callback, then re-run when the bulk sync modal
  closes and after any per-item drawer action (`onSynced` prop on
  `EtsyProductPanel`) so chips don't go stale after a sync (session 9,
  twentieth addendum).
- **Product Admin selected Actions** — **Check Etsy** reconciles only the
  selected linked listings, reports checked/updated/reset/error/skipped totals,
  refreshes Etsy chips on close, and keeps the selection for a follow-up sync.
- **Product Admin Actions** — **Repair all Etsy sync issues** is global and
  remains available without a table selection. Its confirmation counts linked
  repairable rows; the bounded drain checks Etsy state first, keeps live rows
  live and drafts as drafts, skips unavailable listings, and supports
  stop-after-current without abandoning partial image work.
- **Product edit drawer → Etsy section** (`EtsyProductPanel.tsx`): dry-run
  preview (pre-flight checklist + mapped title/price/tags/materials/
  when_made/category/photo count, plus the computed Length or Ring size that
  will auto-push on sync — session 9, ninth addendum, which replaced the old
  separate "Test Length"/"Test Ring Size" manual buttons), Sync to Etsy /
  Sync Updates with inline step progress, Deactivate/Reactivate on Etsy, a
  link to the live listing, and a per-item **Push price** button (lean
  price-only re-push for that one listing). Gated behind "save this listing
  first" for unsaved new products. **Since 2026-09-13** the product-backed
  rows carry the review window's pencil editors (shared
  `ProductFieldInlineEditor.tsx`): Quantity, Materials (metal + purity), When
  made (item year), Length / Ring size, and the category pencil (grouped
  `EtsyCategoryDropdown`). Saves write the product row, the preview re-runs,
  and inside the open listing editor the value is merged into the form so its
  Save cannot revert it. The same panel renders on the Manage Etsy page.
- **Toolbar → "Sync All to Etsy"** (`EtsyBulkSyncModal.tsx`, Phase 2): a free
  pre-flight summary ("N eligible · N ineligible · N up to date · N errors",
  with an expandable ineligibility sample list) before confirming, then
  enqueue + drain with live progress and a "stop after current item" cancel.

None of the admin UI is localized via next-intl — matches the rest of
`AdminShell.tsx`/`AdminSettingsPanel.tsx`, which are English-only by existing
convention.

## Lifecycle summary

Pre-flight (no Etsy calls) → create draft → upload images (checkpointed,
~4/invocation to stay inside a Netlify function's time budget) → set
inventory (price/qty) → activate or hold as `draft_review` (Q1 default:
draft-for-review, no auto-activate). Every step reads its DB checkpoint
first and is safe to repeat. All nonterminal publish/update states remain in
the atomic queue until `done:true`, even when a four-image request returns
partial progress. **SKU is deliberately never pushed to Etsy**
(removed 2026-07-08, session 9, fifth addendum — Etsy's 32-char cap
rejected this catalog's longer slugs, and the owner has no use for it on
Etsy's side); this also means the SKU-adoption crash-recovery guard that
used to prevent a duplicate draft if a prior invocation died between
creating the Etsy draft and saving `etsy_listing_id` no longer applies — see
DECISIONS.md for the accepted trade-off.

Phase 2 adds: incremental updates via content-hash diff,
bulk enqueue/drain, auto-delist/relist wired into
`adminRevalidateProduct(s)`/PayPal capture/webhook, and a daily scheduled
price push gated by a ≥1%-of-last-pushed-price threshold (Q4).
⚠️ **Bookkeeping is BATCHED and the budget is an ABSOLUTE deadline** since
2026-08-21. Etsy has no bulk price endpoint, so the per-item API call stays, but
the two Supabase writes per listing were ~314ms of the measured 522ms/item —
enough that the run finished only 41 of 56 candidates and silently deferred
15–18 listings a day from 2026-08-20. See DECISIONS, *"Marketplace bookkeeping
is batched"*; `lib/__tests__/marketplace-price-push-batching.test.ts` guards it.

## Field mapping highlights

- **Vintage fallback (Q2):** `item_year` more than 20 years old maps to its
  real decade bucket; missing or newer than the cutoff pushes as `1990s`
  (owner-attested fallback), flagged (never blocking) in the dry-run. Cutoff
  is a rolling `currentYear - 20` in UTC, not a frozen year.
- **Price (Q5):** flattened via `calcSpotPriceValue`/`parseManualPriceLabelValue`
  (`lib/pricing.ts`), then an 8%-default Etsy-fee markup (admin-editable),
  rounded to 2 decimals, rejected under Etsy's $0.20 minimum. Site pricing is
  never touched.
- **Allowlist guarantee:** `cost_basis`, `minimum_price`, `internal_notes`,
  `private_price_label`, `melt_value`, `live_spot_snapshot`,
  `acquisition_date`, `acquisition_source` can never appear in a payload —
  enforced structurally (the mapper only ever reads named fields) and by a
  unit test.
- **Eligibility (Q7):** everything `available` syncs, including Coin/Bullion;
  a per-item Etsy rejection is a warning, never a batch-blocking failure.

## Current constraints and verification

- The API host is `openapi.etsy.com`; `x-api-key` must contain both the keystring
  and shared secret. OAuth, token refresh, draft creation, image upload,
  activation, delist/relist, interruption recovery, and multi-product dry-run
  have all been exercised live.
- Taxonomy leaves are pinned from the seller taxonomy. Approximate category
  matches are disclosed in Preview so the owner can review them before sync.
- Two provider-contract details remain intentionally explicit:
  `TODO(etsy-verify)` still covers image-upload size/format caps and rate-limit
  response-header names because neither is present in Etsy's machine-readable
  specification.
- The daily 11:15 UTC trigger is **Supabase pg_cron**
  (`supabase/scheduled-jobs-pg-cron-2026-09.sql`), which POSTs the
  `ETSY_CRON_SECRET`-guarded route — the only scheduler since 2026-09-13. The
  GitHub workflow keeps a manual "Run workflow" button; its `schedule:` and the
  old `netlify/functions/etsy-price-push.mts` were removed after both started
  firing alongside pg_cron (history: GitHub 2026-08-11 → pg_cron 2026-09-07).
  ⚠️ A Netlify "Scheduled" badge and a "Next execution" time prove registration,
  never execution — that is exactly what masked the dead Netlify scheduler for
  weeks. The run fails closed when relevant spot data is missing/fallback and
  records a `scheduled_price_push` summary.
  🟢 **Confirmed working 2026-08-11**: first-ever `scheduled_price_push` row read
  *"42 pushed, 32 unchanged, 0 blocked, 0 failed, 16 deferred"*. Deferred items
  are the 22-second budget and roll into the next run.
- Use the Etsy drawer or channel-specific Actions controls for normal and bulk
  work. The full incident and verification history remains in `CHANGELOG.md`.
