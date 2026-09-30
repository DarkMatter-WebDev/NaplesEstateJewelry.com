# Discount Codes

Admin-managed codes a shopper enters at checkout for a percentage or fixed
dollar amount off the merchandise subtotal. Built 2026-08-11.

Durable rules live in `DECISIONS.md` under *"Discount codes: the cap is the
control, 'once per email' is a speed bump"*. Read that before changing anything
here — several of the choices below look arbitrary and are not.

## Status

🟢 **LIVE IN PRODUCTION and verified end to end (2026-08-13.)** Deployed, proven
by a real purchase, and exercised through an authenticated admin session.

⚠️ **Two migrations, both applied:** `discount-codes-2026-08.sql` and
`discount-codes-grant-fix-2026-08-13.sql`. The second exists because the first
granted only `SELECT` to `authenticated`, so the admin page could read but not
write. A fresh environment only needs the first (now corrected), but run both if
in any doubt — they are idempotent.

The SQL has been run. A real $42.39 PayPal purchase with a 20% code passed all
18 checks, including the atomic redemption inside `capture_paypal_order` and
PayPal accepting the discount breakdown. Detail in CHANGELOG 2026-08-12.

⚠️ **When deploying, the SQL is already applied — do not re-run expecting it to
be pending.** (It is idempotent, so re-running is harmless.)

## Where things live

| Piece | File |
| --- | --- |
| Migration | `supabase/discount-codes-2026-08.sql` |
| Types, validation, formatting, bilingual copy | `src/lib/discount-codes.ts` |
| The discount math | `src/lib/checkout-pricing.ts` (`calculateDiscountAmount`) |
| Database lookup (service role) | `src/lib/discount-codes-server.ts` |
| Admin API | `src/app/api/admin/discount-codes/route.ts` |
| Admin page | `src/app/[locale]/admin/discount-codes/page.tsx` |
| Admin UI | `src/components/admin/DiscountCodesManager.tsx` |
| Checkout preview API | `src/app/api/checkout/discount-code/route.ts` |
| Checkout field | `src/components/checkout/DiscountCodeField.tsx` |
| Totals display | `src/components/checkout/OrderSummary.tsx` |
| Order creation | `src/app/api/paypal/create-order/route.ts` |

## Data model

`discount_codes` — `code` (unique, stored uppercase), `discount_type`
(`percent` | `fixed`), `discount_value`, and four optional fields:
`min_order_subtotal`, `expires_at`, `max_redemptions`, `notes`. Plus
`times_used`, `active`, timestamps.

`discount_code_redemptions` — one row per successful redemption; the audit trail
and the per-email lookup.

`orders` — `discount` (dollar amount, pre-existing) plus `discount_code`,
`discount_type`, `discount_value` snapshots so a historical order reads
correctly after the code is edited or deleted.

## The calculation

```
subtotal          $1,000.00   ← shipping tier + $5k Express cutoff key off THIS
                              ← min_order_subtotal compares against THIS
discount           -$150.00   ← 15% off, or a flat $150 — merchandise only
                              ← clamped to subtotal, never negative
shipping            +$35.00   ← tier from the $1,000, not the $850
tax (6% FL)         +$53.10   ← 6% of ($850 + $35), discounted base
total               $938.10
```

Pinned by `src/lib/__tests__/discount-codes.test.ts` (29 tests) and
`checkout-discount-draft.test.ts` (9 tests). The PayPal breakdown is covered in
`paypal-order-payload.test.ts`.

## Enforcement

Three separate things, easily confused:

1. **`/api/checkout/discount-code` is a PREVIEW.** It exists so the shopper sees
   the figure before paying. Rate-limited 20/hour/IP because an unlimited
   code-checking endpoint is an enumeration oracle.
2. **`buildOrderDraft` is the authoritative calculation.** It re-reads the code
   and recomputes from the server's own subtotal. Only the code string crosses
   the wire — no amount is ever read from the browser.
3. **`capture_paypal_order` is where the code is REDEEMED**, as one conditional
   `UPDATE … WHERE times_used < max_redemptions` inside the transaction that
   already row-locks products. Zero rows affected is the "limit reached" signal.

## Things that will look like bugs and are not

- **The same code works again from a different email.** By design. Guest
  checkout means email is the only identity available. The enforceable control
  is `max_redemptions`.
- **A code can be redeemed past its cap in one specific case:** if it fills
  between checkout and capture. The buyer already paid the discounted amount, so
  the discount is honored and `internal_notes` records it. Refusing there would
  strand a paid order.
- **Merchandise can show $0.** A fixed code larger than the cart clamps to the
  subtotal. Shipping and its tax keep the order chargeable.
- **A discount never re-enables Express over $5,000.** The cutoff prices
  insurance on the goods, not on what was paid.
- **Deleting a code deletes its redemption history** (cascade). Past orders keep
  their own snapshot. The admin UI warns and suggests deactivating instead.

## Operating notes

- Codes are case-insensitive for shoppers (`thankyou` === `THANKYOU`) and stored
  uppercase, so two codes differing only in case cannot both exist.
- An expiry date works **through the end of that day**.
- `max_redemptions` blank = unlimited until deactivated.
- `min_order_subtotal` is optional on both types but is worth setting on
  fixed-dollar codes, which do not self-scale.
- Deactivating is reversible and preserves history; deleting is not.
