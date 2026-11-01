# Shipping Tiers

> Status: **implemented and provisioned.** Checkout and both marketplace
> integrations use the value-based fee contract below. Historical rate research
> and design iterations live in `project-docs/CHANGELOG.md`.

## Source of truth

`next-app/src/lib/checkout-shipping.ts` is the single checkout tier catalog.
`getCheckoutShippingFee(method, merchandiseSubtotal)` resolves the fee only after
the server computes the merchandise subtotal. `checkout-pricing.ts`, order
creation, PayPal totals, `OrderSummary`, and the cart estimate all consume that
shared result.

Local Pickup remains $0. The database still stores the broad
`'pickup' | 'shipping'` method while the charged amount snapshots into
`orders.shipping_fee`.

## Standard insured shipping

| Merchandise subtotal | Charge | Intended service |
|---|---:|---|
| Under $100 | $19 | USPS Priority + carrier insurance |
| $100–$249 | $25 | USPS Priority + carrier insurance |
| $250–$599 | $29 | USPS Priority + carrier insurance |
| $600–$999 | $35 | USPS Priority + carrier insurance |
| $1,000–$2,499 | $59 | USPS Priority + carrier insurance |
| $2,500–$4,999 | $99 | USPS Priority + carrier insurance |
| $5,000–$14,999 | $99 | USPS Registered Mail |
| $15,000+ | $165 | USPS Registered Mail |

At $5,000+, buyer-facing labels and delivery estimates must describe insured
shipping with a 2–10-business-day window. Re-verify pricing and coverage before
listing any future item above approximately $40,000; Registered Mail's absolute
coverage ceiling is $50,000.

## Express insured shipping

| Merchandise subtotal | Charge |
|---|---:|
| Under $1,000 | $55 |
| $1,000–$2,499 | $79 |
| $2,500–$4,999 | $119 |
| $5,000+ | Not offered |

Express above $5,000 is hidden client-side and rejected server-side rather than
silently substituted because ordinary USPS Express insurance cannot cover the
full value.

## Marketplace provisioning

`supabase/marketplace-shipping-tiers-2026-07.sql` is applied. Settings exposes
idempotent provisioning actions that create one Etsy profile/eBay flat-rate
policy per distinct standard fee and store the mapping in
`marketplace_shipping_profiles`.

- **eBay policies:** `fee-19` → `252701344026`, `fee-25` → `252701345026`,
  `fee-29` → `252701346026`, `fee-35` → `252701347026`, `fee-59` →
  `252701348026`, `fee-99` → `252701349026`, `fee-165` → `252701350026`.
- **Etsy profiles:** `fee-19` → `312257322074`, `fee-25` → `312257322442`,
  `fee-29` → `312311477117`, `fee-35` → `312257322688`, `fee-59` →
  `312311477379`, `fee-99` → `312257323028`, `fee-165` → `312257323843`.

New Etsy drafts receive the price-band profile, and update/price-only paths
reconcile it only when necessary. eBay keeps the resolved policy in the content
hash so a tier-boundary crossing marks the listing out of date. Both channels
fall back to the connection's legacy default policy/profile when a mapping is
unavailable.

One controlled listing update per marketplace remains open in `TASKS.md`.

## Operating rules

1. Never insure jewelry through ShipStation ParcelGuard/Shipsurance; its policy
   excludes jewelry and watches. Select USPS carrier insurance where applicable.
2. Never rely on more than $1,000 liability from ordinary FedEx for jewelry or
   watches without an approved high-value program.
3. USPS Registered Mail shipments must use a plain sturdy box and
   water-activated kraft paper tape so postmarks can cross every seam. Do not use
   padded, Tyvek/plastic, glossy, or ordinary self-sealing packaging.
4. The normal thin product box may travel inside a Priority Mail Express
   flat-rate envelope only when the envelope closes within its normal folds.
5. Florida tax, PayPal breakdowns, and create-order total revalidation must
   continue consuming the shared computed shipping fee.

## Deferred Phase 2

Evaluate Parcel Pro, JM Shipping Solution, or FedEx Declared Value Advantage for
cheaper high-value insurance and faster fully insured service above $5,000. No
such provider is currently enabled.
