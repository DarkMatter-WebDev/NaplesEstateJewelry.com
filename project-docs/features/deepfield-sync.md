# Feature: Deep Field Gallery Product Sync

## Summary

A **one-way, server-side push** of the product catalog from Naples Estate
Jewelry (NEJ) to **Deep Field Gallery**, a separate site with its own database
and Supabase project.

- **NEJ pushes; Deep Field pulls nothing.** NEJ POSTs product payloads to a
  Deep Field HTTP receiver and never touches the Deep Field database, storage,
  or SQL.
- **Credential boundary is one shared bearer token.** NEJ holds no Deep Field
  Supabase key; Deep Field holds no NEJ key. Neither side's service role crosses
  the line.
- **Fire-and-forget.** Every call site is best-effort and non-throwing. A Deep
  Field outage must never fail a customer's payment or block an admin save.
- **Inert until configured.** With `DEEPFIELD_SYNC_URL` / `DEEPFIELD_SYNC_TOKEN`
  unset, `syncProductsToDeepField` returns immediately and nothing is sent.

Deep Field owns its own database writes, image copying, pricing validation, and
audit/storage verification.

## Key Files

- `next-app/src/lib/deepfield/payload.ts` — pure, I/O-free payload construction:
  the field allow-list, image URL absolutization, and price resolution. Unit
  tested in `src/lib/__tests__/deepfield-payload.test.ts`.
- `next-app/src/lib/deepfield/sync.ts` — transport. Service-role read, batching,
  the POST, and the non-throwing `queueDeepFieldSync` entry point.

## Call Sites (the three chokepoints)

Every path that can change product state fires the sync:

| Location | Covers |
|---|---|
| `src/app/actions/admin-products.ts` → `adminRevalidateProducts` | bulk status changes, order flows |
| `src/app/actions/admin-products.ts` → `adminRevalidateProduct` | single create/edit/archive/delete |
| `src/app/api/paypal/capture-order/route.ts` | checkout sold-flip |
| `src/app/api/paypal/webhook/route.ts` | sold-flip backstop when the browser never confirms |

The checkout hooks are **not** redundant with the admin ones. The sold flip
happens inside the `capture_paypal_order` Postgres function, so no application
code observes it — `adminRevalidateProduct(s)` is never called on that path.
Hooking only the admin chokepoint would leave Deep Field showing sold items as
available. This mirrors exactly how Etsy and eBay already hook in.

Verified against the schema: with the no-reservation checkout, **only**
`capture_paypal_order` writes product `status`/`quantity`. Denials, cancels, and
refunds do not touch `products`, so they need no hook. A refund that should
re-list an item goes through the admin status change, which is covered.

## Payload Contract

**Durable key is `products.id`.** Never `sku` — `sku = "21"` is on two different
products. `inventory_number` is genuinely unique if a secondary key is wanted.

**53 catalog fields + 5 derived price fields.** The field list is an
**allow-list** (`DEEPFIELD_PRODUCT_FIELDS`), so a column added to `products`
later is excluded by default rather than silently shipped to another company.

Never sent, enforced twice — absent from the allow-list, and asserted against
`DEEPFIELD_FORBIDDEN_FIELDS` which throws rather than leaks:

`cost_basis`, `minimum_price`, `private_price_label`, `live_spot_snapshot`,
`acquisition_date`, `acquisition_source`, `internal_notes`, `reserved_until`,
`reserved_order_id`.

Also excluded: **`price_label`** — a dead legacy column. Nothing renders it and
every save writes null, but stale values survive on ~19 rows including `"$0.00"`
on a product that sells for $450. Sending it invites a wrong price downstream.

Archived products are never pushed — `archived` is NEJ's soft-delete.

## Pricing (the part that must not diverge)

Deep Field computes spot pricing **on its own side**; NEJ ships both the inputs
and a fallback snapshot.

Resolution order, matching the storefront exactly (`src/lib/pricing.ts` is
imported rather than reimplemented, so the two cannot drift):

1. **Sold lock** — a non-available product with `sold_price` is frozen there.
2. **Manual** — parse `manual_price_label`.
3. **Spot multiplier** — `meltValue × pricing_multiplier`, where
   `meltValue = grams × purityFraction × (spotPerOz / 31.1034768)`.

Roughly **60 of 128** products are spot-multiplier with *no stored price of any
kind* — the price exists only as a render-time computation. `pricing_multiplier`,
`purity`, `gram_weight`, `weight_grams`, `category`, and `price_mode` are all
shipped so Deep Field can compute live.

Derived fields (namespaced `nej_` so they are never confused with columns):
`nej_price_usd`, `nej_price_source` (`spot|manual|sold_lock`),
`nej_melt_value_usd`, `nej_spot_snapshot`, `nej_price_unavailable_reason`.

**Fail-closed on spot.** When live metal pricing is unavailable, a spot-priced
product ships a **null** price plus a reason — never a fallback-rate guess.
Shipping a fabricated number into another company's storefront is worse than
shipping none. Same rule `getMarketplaceSpotPriceError` already enforces for
Etsy/eBay. Manual and sold-locked prices are unaffected, so a spot outage
degrades rather than blocks.

## Images

- Absolute Supabase Storage URLs pass through untouched.
- Site-relative `/assets/...` paths (113 of 974 refs) are rewritten to
  `https://naplesestatejewelry.com/assets/...` and **percent-encoded per
  segment** — a few filenames contain spaces and parentheses.
- Already-absolute URLs are **never** re-encoded, or an escaped URL would
  double-escape.
- Deep Field copies the bytes into its own bucket. Hotlinking would break:
  NEJ hard-deletes storage objects once no NEJ product references them, and the
  storage-GC reference scan does not know Deep Field exists.

## Configuration

Server-only environment variables, set in Netlify. **No `NEXT_PUBLIC_` prefix** —
that is what keeps the token out of the browser bundle.

| Variable | Meaning |
|---|---|
| `DEEPFIELD_SYNC_URL` | receiver endpoint, e.g. `https://deepfieldgallery.com/api/integrations/naples/products` |
| `DEEPFIELD_SYNC_TOKEN` | shared bearer token issued by Deep Field |
| `DEEPFIELD_SYNC_DRY_RUN` | optional. `true` → send `dryRun: true, copyImages: false`; anything else → live |

**These belong to NEJ, not Deep Field.** NEJ is the sender and the only side that
reads them. Deep Field holds the same secret under its own name
(`NAPLES_PRODUCT_SYNC_SECRET`) and compares against it, so
`DEEPFIELD_SYNC_TOKEN` must carry that identical value.

URL and token unset → the sync no-ops. This is the safe default and is how the
code behaves until deliberately configured.

### Testing with production parity

`DEEPFIELD_SYNC_DRY_RUN=true` exercises the **entire** path — service-role read,
payload build, field-policy assert, batching, auth, HTTP round trip — while
telling the receiver to validate and discard. Verified against the live
receiver: dry run returns `imageCopyMode: "dry_run"` with `copiedImageCount: 0`
and `wouldCopyImageCount: 9`; live returns `"copied"` with the inverse.

Only the exact string `true` (any case) enables it. `1`, `yes`, and an empty
value all mean live — the flag fails toward normal behavior, so a typo cannot
silently disable a production sync.

**Why this exists:** local dev shares production's Supabase database, so an
admin save in dev is a real product change. Without the flag, pointing dev at
the live receiver to test the hooks would write real rows and copy real images
into the live gallery.

Recommended per environment:

| NEJ environment | `DEEPFIELD_SYNC_URL` | `DEEPFIELD_SYNC_DRY_RUN` |
|---|---|---|
| Netlify Production | production Deep Field | unset |
| Netlify Deploy Previews / Branch | production Deep Field | `true` |
| Local `.env.local` | `http://127.0.0.1:3000/...` | unset (local receiver, safe to write) |
| Local, pointed at production | production Deep Field | **`true` — mandatory** |

## Reconciliation endpoint (the correctness floor)

```
GET /api/integrations/deepfield/product-ids
Authorization: Bearer <DEEPFIELD_SYNC_TOKEN>   ← the same token the push uses
```

Read-only, no side effects, safe to poll. Deliberately reuses the push token so
the integration stays ONE credential in both directions.

```json
{
  "generatedAt": "2026-08-08T18:44:17.981Z",
  "count": 128,
  "products": [
    {
      "id": "10k-cuban-link-chain-01",
      "status": "available",
      "updated_at": "2026-08-07T13:00:55.669721+00:00",
      "image_count": 6
    }
  ]
}
```

**Why it exists.** The push is fire-and-forget with no durable queue, and NEJ
supports a hard delete that leaves no tombstone. Two failure classes are
therefore invisible to the push and to NEJ itself:

- a **hard delete** — the row is gone before the hook re-reads it, so no push is
  possible by construction;
- a **dropped delivery** — after 3 retries the change is abandoned. There is no
  database record and no alert; the only trace is a `console.error` naming the
  affected product ids in a Netlify log that expires in ~24h.

Archived rows are excluded from the feed, so an archive is visible to the
consumer both as an explicit push (`status: 'archived'`) and as absence here.
Those must be idempotent on the consumer's side; they are, verified in both
orders.

**Failure modes are deliberately distinguishable from an empty catalog**, because
"empty" would read as *delete everything*: **503** `not_configured`, **401**
`unauthorized`, **502** `read_failed` — none carry a `products` key. Only a 200
carrying `products` is authoritative.

**`image_count`** (2026-08-08) catches a **partial image copy**, which neither
of the other signals can see: the id matches and `updated_at` does not move when
image copying fails. Always an integer, never omitted — including for a null or
malformed `images` array, because the consumer treats absent as "not comparable"
and omitting it would disable the check on exactly the rows most likely to be
broken. The `images` array itself is never emitted.

**`updated_at` is RAW Postgres output** — microsecond precision with a `+00:00`
offset, NOT millisecond ISO. **Do not normalize it in either direction.** The
consumer persists a millisecond copy, so the comparison relies on `Date.parse`
TRUNCATING the surplus digits rather than rounding. Truncation is universal in
practice, but ECMAScript specifies only three fractional digits and leaves the
rest implementation-defined; under a rounding runtime roughly half the catalog
would compare as permanently stale and real drift would drown in false
positives. Pinned with a comment at the emitting line.

## Gotchas

- **Batch cap is 25**, enforced by the receiver — but **25 is unreachable in
  production**. The receiver copies images inside the request, so wall-clock
  scales with IMAGES, not products (2–19 per product, avg 7.6). A 3-product
  batch carrying 38 images died at a gateway "Inactivity Timeout" while one
  carrying 17 succeeded. Batches are budgeted by
  `IMAGE_BUDGET_PER_REQUEST` / `MAX_PRODUCTS_PER_REQUEST` in
  `src/lib/deepfield/sync.ts`; see `chunkByImageBudget`.
- **The image budget was raised 18 -> 30 on 2026-08-08** after Deep Field made
  image copying concurrent (6 at a time) and reported measurements. Two
  corrections mattered on the way to that number, both from checking rather than
  accepting:
  - My "1.7–2x faster" claim was measured against their *undeployed* sequential
    code; their 404/401 evidence showed the deployed path already differed.
    Retracted.
  - I modelled cold cost as `0.64s/image` when it is a **~9.1s fixed** overhead
    plus a small per-image term. Per-image models overstate small batches badly.

  30 is the conservative end of the bracket. Their measurements support up to
  ~50, which stays parked until a timeout line from their dashboard confirms the
  real ceiling — the cost of guessing high is a gateway timeout mid-import, and
  the cost of guessing low is a slower import nobody is waiting on.

  The batching tests deliberately pass budgets in as **explicit arguments**
  rather than importing the constants, so retuning production cannot silently
  re-baseline them. **Known gap:** nothing currently pins the production default
  values themselves — see TASKS.
- **A full batch takes minutes** because Deep Field copies every image before
  responding. Node's `fetch` (undici) has a hard **5-minute header timeout** that
  is not adjustable without the undici Agent API; the one-off import script hit
  `HeadersTimeoutError` on live requests the server was still processing. The
  in-app sync sets a 5-minute `AbortController` deliberately — it is
  fire-and-forget, so an abort costs nothing, and a hung socket should not leak.
- **Deletes leave no tombstone.** NEJ supports a hard delete, so a periodic
  full-id reconciliation is the only way Deep Field learns about removals.
  `updated_at` (maintained by a `BEFORE UPDATE` trigger, so it bumps on every
  write including the in-database sold flip) is a sound watermark for everything
  else.
- Do not add a `NEXT_PUBLIC_` variant of the token under any circumstances.

## Status (2026-08-08)

**Production bulk import: complete and reconciled.** 128 products / 974 images
into production Deep Field across 67 requests, all HTTP 200, 0 failed. 128 sent,
128 acknowledged, 0 missing, 0 unexpected, 0 id remapping. One transient
`Bad Request` on a single image cleared on a re-send of that product.

Getting there took three attempts and is why the image budget exists: a
25-product run died at a gateway timeout, then a 3-product run died at batch 17
(38 images). See Gotchas.

**Live hooks: ARMED in production, and proven.** `DEEPFIELD_SYNC_URL` and
`DEEPFIELD_SYNC_TOKEN` are set on the NEJ Netlify project across all deploy
contexts. A product saved in admin logs `[deepfield] synced 1 product(s)` and
the receiver returns 200 — verified end to end from local dev.

Because the vars are set for **all 5 contexts**, Deploy Previews also push to
the live gallery. Intended (dev shares production Supabase, so a dev save IS a
real change), but it means **no environment writes to a sandbox** — set
`DEEPFIELD_SYNC_DRY_RUN=true` locally if a safe one is ever needed.

**Undeployed at time of writing:** the archived-product push, `image_count`, and
the `returnTo` visibility fix. Until they ship, archives reach Deep Field only by
vanishing from the reconciliation feed.

**Deep Field side:** reconciliation poll built (hourly, comparing `updated_at`
and presence, with a 20% shrink guard) but **not yet running in production** —
they poll manually. Their first run found real drift: `test-item-111-131` was
displaying as available after being archived on NEJ, exactly the gap the push
could not cover. Their image copying is content-addressed with `upsert: true`,
so the repeated import attempts produced zero duplicate objects.
