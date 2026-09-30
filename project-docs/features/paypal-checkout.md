# PayPal Checkout

Live PayPal payment processing on the existing `/checkout` page. Replaced the old
manual "Submit Order" (unpaid contact-to-buy) button. **Status: LIVE in production since 2026-07-09** (`PAYPAL_ENV=live` with the matching live app credentials in Netlify) â€” see the
go-live checklist below (completed; retained as a re-verification runbook) and
the remaining owner-run live recovery/refund/race test matrix in `TASKS.md`.

## Flow

1. **Checkout page** (`src/app/[locale]/checkout/page.tsx`) reads
   `process.env.PAYPAL_CLIENT_ID` server-side and passes it to `CheckoutClient` as
   the `paypalClientId` prop (the id ships to the browser inside the SDK URL, but is
   not a `NEXT_PUBLIC_*` var).
2. **`CheckoutClient`** collects name/email/phone + shipping (cart comes from the
   `nej-cart` localStorage cart context). It renders
   `components/checkout/PayPalCheckoutButton.tsx` only when the cart has items and
   the three contact fields are filled (`payReady`).
3. **PayPalCheckoutButton** loads the PayPal JS SDK (`components=buttons`, gold pill,
   PayPal + card; PayLater/credit disabled) and wires the Buttons callbacks. It never
   sends prices.
   - `createOrder` â†’ `POST /api/paypal/create-order` with `{ productIds, customer,
     shippingMethod, orderId }`. Stores the returned internal `orderId` in an in-memory
     ref (reused if the buyer cancels and retries in the same tab, so we don't
     create duplicate unpaid orders; invalidated if the cart/shipping changes after cancel). Returns
     the PayPal order id.
   - `onApprove` (fires when the buyer hits **Pay Now** in the PayPal window) â†’
     `POST /api/paypal/capture-order` with `{ paypalOrderId }`. The sale is captured
     here â€” there is no separate confirm-on-return step.
   - `onSuccess` â†’ `CheckoutClient` clears the cart and shows the existing inline
     "Order Received" confirmation (order number).
   - `onCancel`/`onError` â†’ clean message; the order stays unpaid. `onCancel` also sends a
     fire-and-forget keepalive POST to `/api/paypal/cancel-order`, which
     soft-cancels the abandoned unpaid order so it does not linger as an open
     sale in Admin (see Routes below); the internal order id is kept so an
     immediate same-cart retry reuses the order. Nothing is held
     (no reservation), so the item simply remains available to any buyer. If
     PayPal reports a completed capture but local reconciliation fails, the
     button enters a recovery state and explicitly blocks another payment. The
     same-cart lock survives a reload for 24 hours and clears when the cart changes.

   **Shipping address authority (2026-07-16).** For a real delivery method,
   create-order sends the already validated checkout address as
   `purchase_units[].shipping` and uses `SET_PROVIDED_ADDRESS`; PayPal displays
   that destination but does not let the buyer replace it with a different
   wallet address. Local Pickup uses `NO_SHIPPING`. A retry of an unpaid PayPal
   order refreshes its saved customer/address fields before creating the new
   PayPal order, so edited checkout details remain consistent everywhere.

   **Checkout amount precision (2026-07-21).** Cart and checkout financial
   breakdowns always display two decimal places and round estimated tax and
   totals through `round2`, matching authoritative order creation and PayPal's
   cents precision. Storefront merchandise price labels may still intentionally
   use whole-dollar display, but subtotal, tax, shipping, line totals, and grand
   total never hide fractional dollars.

   **Domestic address and shipping hardening (2026-07-23).**
   Delivery checkout is U.S.-only. State is selected from all 50 states plus
   D.C., ZIP accepts five digits or ZIP+4, and Country is fixed to United
   States. `lib/us-address.ts` is shared with the create-order route, which
   independently canonicalizes state names to USPS codes, normalizes ZIP+4,
   and rejects state typos, invalid ZIPs, international destinations, and
   incomplete addresses before creating an order.

   `lib/checkout-shipping.ts` is the sole definition of shipping methods and
   fees. As of 2026-07-30 fees are value-based tiers keyed to the order's
   merchandise subtotal (see `features/shipping-tiers.md`): Local Pickup
   $0; Standard Insured $19-$165 across eight bands (USPS Registered Mail at
   $5,000+, stated as 2-10 business days); Express Overnight $55/$79/$119 and
   not offered at $5,000+ (USPS insurance cap — the server rejects it with a
   clear 400 rather than substituting). UI labels and estimates, the default,
   server fee lookup and whitelist, and database fulfillment mapping consume
   the same catalog; `buildOrderDraft` resolves the fee after computing the
   subtotal.

   `buildOrderDraft` collects 6% Florida tax for Local Pickup or a validated FL
   destination and zero Florida tax for other states. Per the owner's
   2026-07-23 policy decision, the Florida taxable base is discounted taxable
   merchandise plus the charged shipping fee. Local Pickup adds no shipping to
   the base because its fee is $0. This deliberately uses the conservative
   collection policy even though Florida DOR guidance and Rule 12A-1.045 provide
   an exception for separately stated delivery that the buyer can avoid.

   The remaining Florida gap is destination-county surtax. It generally follows
   the delivery county and is capped to the first $5,000 of each single tangible
   item. That work was explicitly deferred. Non-Florida collection still
   depends on nexus and registration in the destination state; do not collect
   another state's tax merely by applying Florida's rate.

   The 2026 direct website history currently contains one paid shipped order,
   $1,986.61 of merchandise to California. This alone is far below California's
   $500,000 economic-nexus threshold, but California includes marketplace sales
   in that test. Before implementation, combine website, Etsy, eBay, offline,
   and related-entity destination totals and have an accountant confirm
   registrations. See the checkout-tax Backlog item in `TASKS.md`.

   **Payment-stage messaging (2026-07-21).** The page distinguishes PayPal's
   hosted details/approval phase from capture. While PayPal login or card fields
   are open, the buyer is told that payment will not be processed until review
   and submission. `onApprove` is the boundary that changes the status to
   processing and begins capture. Cancellation and error/recovery paths reset
   the page status to idle. English and Spanish use the same semantics.

   **Capture-on-approve (2026-07-03).** The sale completes when the buyer clicks Pay
   Now in the PayPal window; on return to our tab they land directly on the "Order
   Received" screen. There is no intermediate "Confirm Your Order" review screen and
   no client-side capture-on-confirm. This replaced the 2026-07-02 approach (a
   review/confirm screen plus a sessionStorage hand-off + `GET /api/paypal/order-status`
   resume route to restore that screen after a mobile tab eviction) â€” see CHANGELOG
   2026-07-03. If a tab is evicted before the capture request reaches the server,
   nothing is captured and the item stays available. If the request did reach
   PayPal, the `PAYMENT.CAPTURE.COMPLETED` webhook reconciles any capture that
   landed; the same-cart recovery lock is a do-not-pay-again guard, not a
   return-to-review flow.

## Routes (`src/app/api/paypal/*`)

- **`create-order`** (server/cookie client): builds the authoritative order via
  `lib/checkout-pricing.ts#buildOrderDraft` (loads products, verifies all are
  purchasable, computes subtotal + 6% FL tax + shipping snapshot prices), calls the
  `create_paypal_order` RPC (creates the order + items â€” **no inventory hold**; the
  products stay `available`), creates the PayPal order with line items, saves
  `paypal_order_id`, and returns it. On a PayPal API failure it cancels the order
  record it just created. A `orderId` in the body takes a retry path that recreates
  the PayPal order for the existing unpaid order. More than 50 cart lines are
  rejected rather than silently truncated. PayPal creation uses a deterministic
  `PayPal-Request-Id`, and the route never returns a PayPal order unless its ID
  was associated with the local order successfully.
- **`capture-order`** (service-role client): finds the internal order by
  `paypal_order_id` (idempotent if already paid), captures via the PayPal API,
  verifies `COMPLETED` + amount within 1Â¢ + currency `USD`, then calls
  `capture_paypal_order`. On amount/currency mismatch it records the capture, sets
  `payment_status='pending'`, posts an admin notification, and does **not** auto-sell.
  Capture ID/response are persisted before `capture_paypal_order` runs. If that
  write or RPC fails after PayPal moved money, the response includes
  `paymentCaptured=true` and checkout prevents a second submission. A failed or
  ambiguous capture response is checked with `GET /v2/checkout/orders/{id}`;
  a recovered completed capture continues through normal reconciliation, while
  an unresolved/pending capture returns `paymentStatusUnknown=true` and blocks
  another submission. Amount mismatches and inventory-race losers also return
  the captured-payment recovery flag. If the RPC
  returns `item_conflict` (another buyer's capture sold the item first), the
  order is flagged `failed`, retains its capture ID for refunding, and the buyer
  gets a clear 409 "just purchased by another buyer" message. Already-paid
  retries also retry missing invoice/receipt finalization without duplicating an
  automatic receipt; automatic receipt and owner sends carry stable Resend
  idempotency keys.
- **`cancel-order`** (service-role client): fire-and-forget soft-cancel for the
  unpaid order a buyer abandoned before approving (closed the PayPal window).
  It flips `order_status`/`fulfillment_status` to `cancelled` only and never
  touches `payment_status`. It refuses to modify any order that is paid or
  carries a capture id, and the update itself repeats those predicates so a
  capture racing in between the select and the write is never cancelled. An
  unknown/missing order id is a silent no-op (the client call is best-effort
  keepalive). A later retry through create-order's reuse path flips the order
  back to `open`/`pending`.
- **`webhook`** (service-role client): `verifyPayPalWebhook` (calls PayPal's
  verify-webhook-signature with `PAYPAL_WEBHOOK_ID`; fails closed if unset), logs to
  `webhook_events` (unique `(provider, event_id)`). New, prior-error, and stale
  processing rows are atomically claimed; currently processing events return 503
  and completed duplicates are a no-op. Every business RPC error is checked before
  the event is marked processed. The handler then
  applies `PAYMENT.CAPTURE.COMPLETED` (backstop capture), `.DECLINED`/`.DENIED`
  (mark failed), `.REFUNDED`/`.REVERSED` (refund), `PAYMENT.REFUND.PENDING`/
  `.FAILED` (ledger state), and `CUSTOMER.DISPUTE.*` (note). Capture-refunded
  payloads describe the capture, so the handler derives the incremental refund
  from `seller_receivable_breakdown.total_refunded_amount`; it never mistakes
  the original capture `amount` for a refund amount. Refund and dispute events
  resolve the order from the capture resource, supplementary related IDs,
  refund `up` link, or disputed seller transaction ID.

## Automatic invoices need the service-role grant (found 2026-09-16)

`public.invoices` was granted to `authenticated` only, so `upsertOrderInvoice`
called with the SERVICE client (after every capture in `lib/order-finalize.ts`,
at order creation in `create-order`, and after an in-store sale) failed with
"permission denied for table invoices" — logged, never surfaced; receipts
still sent. Run `supabase/invoices-service-role-grant-2026-09.sql` once.
Until then the order page reads "No invoice generated yet" until an admin
clicks Generate invoice (which uses the admin's own session and works).

## Guest order lookup (2026-09-17)

`/order-lookup` shows a customer their order from the order number plus the
email or phone on the order — no account. `POST /api/orders/lookup` returns
only `toPublicOrderView()` (`lib/order-lookup.ts`), rate-limited per IP and
per order number, one generic not-found. The receipt and fulfillment emails
link there with `?order=<number>` and print the domain as
`NaplesEstateJewelry.com` (`order-email-branding.ts`).

## In-store sales (2026-09-16)

A sale made in the showroom is paid on **PayPal Zettle** (Tap to Pay on the
iPhone), not through the site. `/admin/in-store-sale` then records it:
`POST /api/admin/in-store-sales` calls `create_paypal_order` and
`capture_paypal_order` in the same order checkout does — so a listed item is
sold with the same row lock, `sold_price`, marketplace/Deep Field hooks and
`finalizePaidOrder` receipt — and then stamps the in-store values back
(`payment_method in_store_<method>`, no PayPal capture id, reference
"In store · …", `fulfillment_status picked_up`). An unlisted piece is an order
line with `product_id null`; no product row is created. The refund route
ignores these orders (`payment_method !== 'paypal'`); refund by hand in the
Zettle app. Pure helpers + tests: `src/lib/in-store-sale.ts`. Rules:
`DECISIONS.md` → *"In-store sales: Zettle takes the card…"*.

## Admin refunds

`POST /api/admin/orders/[id]/refund` is the only path that moves money for an
admin refund. It requires an authenticated admin and checks
`paypal_refund_hardening_ready()` before calling PayPal. The request supplies a
cumulative target refund amount; `lib/paypal-refunds.ts` converts that into the
additional cents due and a deterministic `PayPal-Request-Id`. The route refunds
the stored capture through PayPal and calls `apply_paypal_refund`, whose locked
ledger update increments `orders.refund_amount` exactly once per PayPal refund.

The order-detail UI asks for confirmation before a full PayPal refund. Partial
refund input is an **additional** amount and shows the amount already refunded
plus the remaining maximum. Manual/non-PayPal orders retain local bookkeeping
controls. Refunds never restore product inventory automatically; that remains a
separate explicit admin action. A different cumulative target is rejected while
a provider refund is pending; the exact same target remains safely retryable.

## Server library â€” `src/lib/paypal.ts`

OAuth token (cached ~9h), `createPayPalOrder`, `capturePayPalOrder`,
`getPayPalOrderCapture` (ambiguous-response reconciliation),
`refundPayPalCapture` (all money-moving/create calls send deterministic
`PayPal-Request-Id` values), and `verifyPayPalWebhook`. Base URL switches on
`PAYPAL_ENV` (`sandbox` â†’ `api-m.sandbox.paypal.com`, else live). Server-only.

## Inventory / concurrency â€” whoever pays first gets the item (2026-07-03)

**There is no inventory reservation.** Estate pieces are one-of-one, but checkout
does **not** hold them â€” items stay `available` all the way through the PayPal
window, so any number of buyers can be in checkout for the same piece at once. The
sale is decided at **capture**: whoever's payment captures first gets it.

`create_paypal_order` (SECURITY DEFINER) does a snapshot availability check (no
lock) and creates the order (`unpaid`/`pending`/`open`) + items, leaving the
products `available`. `capture_paypal_order` is where the race is resolved: it
`SELECT â€¦ FOR UPDATE` row-locks the product rows so concurrent captures for the
same item serialize, then â€” if the item is already `sold` to a different order â€”
returns `item_conflict=true`, flags this order `failed`, stores the capture ID
needed by the refund route, and does **not** sell. The winning capture flips the products
to `sold` and the order to `payment_status='paid'` + `order_status='completed'`
(mirrors admin "Mark Paid"). This is a rare edge (two buyers paying for the same
one-of-one within seconds); the loser's money is captured and the admin uses the
same idempotent PayPal refund action as any other order.

`supabase/product-sold-price-lock-2026-07.sql` (applied 2026-07-20) adds a product-status trigger that
copies a paid order line's exact `price_snapshot` into `products.sold_price`
when checkout marks the item Sold. That amount remains the item's displayed and
exported price through Sold/Archived/Pending Payment states. Returning it to
Available clears the lock and resumes current manual or live spot pricing.

The old 30-minute `reserve_paypal_order` hold + `release_expired_paypal_reservations`
sweep were removed (`supabase/no-reservation-checkout.sql`); the vestigial
`reserved_until`/`reserved_order_id` columns are left in place (always null) to avoid
a destructive schema change. There is no manual admin Reserved product status in the
active app.

The public shop only shows `available`/`sold` (`isProductVisibleInShop`), so an
item stays visible until its capture sells it. The `/shop` catalog read is wrapped in
`unstable_cache` (tag `shop-catalog`, `revalidate: 300`), so capture and the
denial/refund webhook call `revalidateTag('shop-catalog', { expire: 0 })`
(Next 16 two-arg form, immediate expiration) to refresh the gallery promptly
instead of waiting out the 300s TTL. **As of 2026-07-02, every admin order-flow
write to `products` also busts this cache** â€” cancel/reopen/mark-paid/unpaid,
delete-order return-to-inventory, create-order, and archive/hard-delete
all call `adminRevalidateProduct(s)` from
`next-app/src/app/actions/admin-products.ts` right after the write (those are
client-side Supabase writes, which otherwise can't reach a server cache).
See `project-docs/CHANGELOG.md` 2026-07-02 for the bug this fixed
(items stayed "sold" in the public gallery after being returned to available in
admin).

## Database â€” `supabase/paypal-checkout.sql`

`orders`: `paypal_order_id` (unique), `paypal_capture_id`, `payment_response`,
`paid_at`, `reserved_until` (vestigial). `products`: `reserved_until`,
`reserved_order_id` (both vestigial â€” always null now). New `webhook_events` table
(admins read; service role writes).

**Run order:** `paypal-checkout.sql` (after `sales-workflow.sql` and
`admin-notifications-checkout.sql`), **then `supabase/no-reservation-checkout.sql`,
`supabase/checkout-quantity-2026-07.sql`,
`supabase/product-sold-price-lock-2026-07.sql`, and
`supabase/paypal-checkout-hardening-2026-07.sql`.**
The second file is the current inventory model: it adds `create_paypal_order`,
replaces `capture_paypal_order` (adds the `item_conflict` return) and
`apply_paypal_order_event`, and **drops** the old `reserve_paypal_order` +
`release_expired_paypal_reservations` reservation functions. Both are idempotent;
if you ever re-run `paypal-checkout.sql` (which recreates the reservation
functions), re-run `no-reservation-checkout.sql` afterward to drop them again.

The hardening migration creates `paypal_refunds`,
`paypal_refund_hardening_ready()`, and `apply_paypal_refund()`. It also installs
the current capture function (race-loser capture evidence, refund-state replay
guard, exact winning-line sold price) and limits sold-price fallback selection
to paid orders. Refund application rejects a capture ID that disagrees with the
order, and multi-item capture locks use deterministic product-ID order. The
admin refund API intentionally returns 503 before contacting
PayPal when this migration is absent.

The current hardening file also adds the legacy `orders.refund_amount` dependency
with `IF NOT EXISTS`. Its readiness RPC verifies that column, the refund ledger,
the refund RPC, and the capture RPC. The corrected self-contained copy was
applied and verified in production on 2026-07-20.

## Customer order-history addresses

The account order dialog treats a checkout address containing only the default
country as absent. Pickup orders therefore omit the Additional Details section
when no customer notes, billing address, or meaningful optional address exists.
When a pickup buyer did enter a real optional address, the dialog labels it
Address rather than Shipping address. Local-delivery and shipped orders retain
delivery-specific address labels.

## Admin fulfillment and shipment tracking

Admin order detail stores optional shipment details on the order when fulfillment
is marked Shipped:

- `orders.shipping_carrier`
- `orders.tracking_number`

`supabase/order-shipping-tracking-2026-07.sql` was applied in production on 2026-07-20.
The admin UI displays and permits later edits to saved shipment details. Buyer
fulfillment-update emails include both values when present, and the email API
loads them from the database rather than accepting them from the client payload.
Order detail retains a legacy-column fallback for older databases, but the
production database now has the columns.

Admin invoice/receipt printing uses a print-only 98% zoom in both the generated
Print Now window and direct browser-print media. The screen invoice and preview
stay full size; the small print reduction keeps the standard invoice on one
Letter page without requiring a manual printer scale adjustment.

## Environment variables

`next-app/.env.local` (and Netlify): `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`,
`PAYPAL_ENV` (`sandbox`/`live`), `PAYPAL_WEBHOOK_ID`. The client id is also passed to
the browser via the checkout page prop.

**The credential set must match `PAYPAL_ENV`.** A Live app's client id/secret only
authenticate against `api-m.paypal.com`; a Sandbox app's only against
`api-m.sandbox.paypal.com`. Using Live creds with `PAYPAL_ENV=sandbox` (or vice
versa) yields `401 invalid_client` ("Client Authentication failed") at the token
step and every create-order returns 502. Sandbox creds come from PayPal Developer â†’
*Apps & Credentials â†’ Sandbox â†’ your app*. After editing `.env.local`, restart the
dev server (env is read at boot).

## Troubleshooting

- **create-order 502 with PayPal `422 UNPROCESSABLE_ENTITY` ("failed business
  validation")** â€” the `amount.breakdown` didn't reconcile. All money is rounded to
  cents at the source (`checkout-pricing.ts#round2` in `buildOrderDraft`) and the
  PayPal `value` is derived from the rounded `item_total + tax_total + shipping`
  (`paypal.ts#createPayPalOrder`), so item lines, the order total, and the PayPal
  amount always agree. Don't reintroduce an independently-rounded total.
- **capture-order 500 with `42702 column reference "order_id" is ambiguous`** â€” a
  PL/pgSQL function that `RETURNS TABLE(order_id â€¦)` must qualify any table
  `order_id` in its body (e.g. `order_items.order_id`) so it doesn't collide with
  the output column. Fixed in `capture_paypal_order`. Symptom: PayPal captures the
  money but the order never flips to paid; the `PAYMENT.CAPTURE.COMPLETED` webhook
  is the backstop that reconciles it.
- **`401 invalid_client` / create-order 502** â€” credential/env mismatch (see above).
- **`42501 permission denied for table orders/products/webhook_events`** â€” the
  service_role table grants at the bottom of `paypal-checkout.sql` weren't applied.
  Re-run the migration (idempotent), then re-run `no-reservation-checkout.sql`.
- **`function create_paypal_order(...) does not exist` / create-order 500** â€”
  `supabase/no-reservation-checkout.sql` may not be applied on that database.
  Run it after `paypal-checkout.sql`. The production current copy was run on
  2026-07-20.
- **Admin refund 503 mentioning `paypal-checkout-hardening-2026-07.sql`** - the
  durable refund ledger is not installed. Apply that migration and confirm
  `select public.paypal_refund_hardening_ready();` returns `true`. Do not bypass
  the check or issue the same refund manually while an app attempt is unresolved.

## Go-live checklist (completed 2026-07-09; retained for re-verification)

1. SQL status: `supabase/paypal-checkout.sql` and the current
   `supabase/no-reservation-checkout.sql` copy are applied in production. The
   corrected `supabase/paypal-checkout-hardening-2026-07.sql` is also applied and
   its readiness function returns `true`. If
   `paypal-checkout.sql` is ever re-run, re-run `no-reservation-checkout.sql`
   and then the hardening migration afterward.
2. Set the four env vars in Netlify.
3. Register the webhook at `https://naplesestatejewelry.com/api/paypal/webhook`
   (capture completed/declined/refunded/reversed, refund pending/failed, and
   dispute created); match `PAYPAL_WEBHOOK_ID`. Domain-switch status
   (completed 2026-08-01): the live webhook URL was updated in place to `.com`
   and retained the same stored webhook ID, so no environment change was
   required. The `.co/api/*` carve-out remains for backward compatibility.
4. Sandbox test matrix: success, cancel, declined capture, duplicate webhook,
   failed-then-retried webhook, ambiguous capture-response recovery,
   capture/local-RPC recovery, refund pending/failed, blocked overlapping target,
   concurrent-buyers race (two captures for the same item â†’ second gets
   `item_conflict` 409, flagged for refund), amount mismatch (flagged, not sold),
   partial refund, same-target refund retry, and full remaining refund.
5. Swap to a live PayPal app, set `PAYPAL_ENV=live`, redeploy, re-test once.
