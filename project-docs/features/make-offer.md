# Make an Offer (site shop)

> Built 2026-10-15 from the owner's mockup v2 (`CHANGELOG.md` 2026-10-15 (4)).
> Rules: `DECISIONS.md` → *"Make an Offer on the site shop"*. Code map:
> `STRUCTURE.md` → the *Make an Offer* row.

## What it does

Like eBay: **the buyer's payment is held when they make the offer, and charged
automatically the moment the owner accepts.** They cannot accept-then-back-out.
Decline, 72 hours with no answer, or the item selling another way releases the
hold — they are never charged.

| Owner's answers (10-15) | |
|---|---|
| Time to answer | **72 hours** (PayPal's full guaranteed hold) |
| Lowest offer | **No floor** — every offer reaches the owner |
| Counter-offers | **Yes** — the buyer gets a private **Buy now** link at the agreed price, good for 72 hours |
| Button | Full-width **Make an Offer** under the four product buttons |
| Alerts | **Email to info@ + a text to the owner's cell** (from the Text Deals number) |
| Table | An **Offers** column right after **Price** |

## For the owner — day to day

1. **Turn it on for an item:** Admin → Products → open the item (new or edit) →
   tick **Accept offers** (next to Featured in shop) → Save. Or tell the AI
   assistant "allow offers" / "accept offers" / "turn on make offer" — it ticks
   the box only when your words say so.
   **Many at once:** Products → tick the items → **Actions** → **Site offers** →
   **Set all accept offers** or **Set all no offers** (one step, no confirm; open
   offers are left alone when you turn it off).
2. **See which items have it:** the **Offers** column after Price — **On** in
   gold, "–" when off, and a gold **N open** when offers are waiting. The
   Featured filter has **Offers on / Offers off**.
3. **An offer arrives:** an email at info@ ("New offer: $1,100 on …") and a text
   to your cell. Admin → **Offers** (menu, with a count) lists it: the amount,
   the % of today's price, what PayPal is holding, the buyer's phone/email/note,
   and the hours left (red under 12).
   **Item details** (2026-10-18): the small button under the item name opens,
   inside the card, the spec chips (karat · weight · length · width · type ·
   year — the shop card's own formatting), three numbers — **Listed today**
   (with its ×N), **Melt today** (from the live spot price; "—" with no weight,
   or while the spot feed is down), **Your cost** (the item's cost field; "not
   entered" when empty; admin only) — the line "This offer is 1.68× melt and
   $2,600 over your cost" (red when under cost), the description (first lines
   + Show all) and **Open item page ↗** (the shop page, new tab). Every card
   starts closed. On a phone it opens under the name, above the amount.
4. **Answer it:**
   - **Accept & charge** → asks first → PayPal charges the hold at once; a normal
     **paid order** is created (Orders), the item turns **SOLD**, the buyer gets
     the usual receipt, the marketplaces delist it, and any other open offer on
     that item is declined and released.
   - **Counter** → type a price **between their offer and today's price** and an
     optional note → their hold is released and they are emailed a private
     **Buy now at $X** link for 72 hours. They pay through the normal checkout;
     the sale completes by itself. Until someone pays, the item stays for sale to
     everyone (first to pay gets it). If the email fails, the page shows the link
     to send yourself; **Send the link again** makes a fresh one.
   - **Decline** → asks first, with an optional **Message to <name>** (same box as
     Counter's) → hold released, polite email with your message signed "— Chris".
     The Declined / Countered tabs show "Your message: …".
5. Do nothing → after 72 hours the offer expires and releases by itself.
6. **Clear out old offers:** a red trash-can on each finished offer, or **Delete all N**
   on Accepted / Declined / Expired / All. Open offers (money held) and live
   counters (working link) can't be deleted — Decline or wait for the link to
   expire. Deleting an accepted offer keeps its paid order under Orders.

## The buyer's side

> **Watch your email (2026-10-18):** the offer form has "Our answer comes by email — usually within an hour." under the Email box; after sending, the Offer sent screen (which now opens at the top of the page) shows a centred gold "Keep an eye on your email" note with the address they typed and a spam-folder hint; the "We received your offer" email carries the same message as a centred line. Buyers are never texted (offer texts shelved — `DECISIONS.md`).

- `/offer/<item id>` (and `/es/…`): the amount (must be below today's price),
  an optional message, pickup or shipping (the checkout's own fees), contact
  details, the **binding box** ("…the held amount is charged automatically…"),
  then PayPal or a card through PayPal. The page shows exactly what is held:
  offer + shipping + Florida tax, from the checkout's own arithmetic.
- Emails: received (held, deadline) · declined · expired · item sold · counter
  (with the Buy-now link). An accepted offer's email IS the normal paid receipt.
  A **failed charge** sends no email — call the buyer.
- `/offer/counter/<token>`: the counter checkout — one piece, the agreed price,
  details prefilled from their offer, paid at once. Expired / used / sold links
  show a calm message; nothing is charged.

## How the money moves

| Step | PayPal call | Where |
|---|---|---|
| Buyer presses PayPal | Orders v2 **intent AUTHORIZE** (`createPayPalOrder({ intent: 'AUTHORIZE' })`) | `POST /api/offers` |
| Buyer approves | `POST /v2/checkout/orders/{id}/authorize` → the hold | `POST /api/offers/authorize` |
| Owner accepts | `create_paypal_order` RPC (order row) → `POST /v2/payments/authorizations/{id}/capture` → `capture_paypal_order` RPC (paid + SOLD) → `finalizePaidOrder` (receipt, invoice, owner email) | `POST /api/admin/offers/{id}` `accept` |
| Decline / expire / sold / counter | `POST /v2/payments/authorizations/{id}/void` | same route, the sweep |
| Counter paid | the normal checkout (`/api/paypal/create-order` with `counterToken` → capture) | |

- The offer's PayPal `reference_id`/`custom_id` is `offer-<uuid>`, **never a bare
  uuid** — the webhook reads a uuid custom_id as an order id. With the prefix, a
  capture webhook falls back to `orders.paypal_order_id`, which the accepted
  offer's order carries (set before the capture).
- `orders.offer_id` links an order to its offer; `finalizePaidOrder` (both the
  client capture and the webhook) calls `settleOffersAfterPaidOrder`, which marks
  the offer accepted / bought at counter and closes every other open offer on an
  item that just sold — **any** sale, including a normal checkout or the admin.
- PayPal guarantees an authorization's funds for 3 days; the 72-hour window keeps
  every Accept inside it. An offer past its deadline cannot be accepted.

## The 15-minute sweep

pg_cron `nej-offers-sweep` → `POST /api/admin/offers/sweep` with
`x-cron-secret` = **TEXT_ALERTS_CRON_SECRET** (already in Vault and Netlify — no
new secret). It: expires offers past 72 h (release + email) · closes open offers
and live counters on items no longer for sale · expires counter links · marks
never-approved PayPal windows abandoned after 3 h · retries releases PayPal
refused (`hold_status = release_failed`) · retries buyer emails and owner alerts
that did not go out. ⛔ A failed product read closes nothing.

## Setup (once)

1. Supabase → SQL editor → run all of `supabase/make-offer-2026-10.sql`. The last
   result is ONE row, every column `true`: `products_accepts_offers`,
   `anon_can_read_accepts_offers`, `offers_table`, `offers_private`,
   `orders_offer_id`, `sweep_scheduled`.
2. Push + deploy. No new environment variable.
3. **One real test** (the only proof that the live PayPal account allows
   hold-now-charge-later — most US business accounts do, but it cannot be checked
   from here): tick Accept offers on a cheap item → make an offer from a phone
   with your own PayPal → the info@ email and the text arrive → Admin → Offers →
   **Decline** → the PayPal account shows the hold released. Optionally a second
   offer → **Accept** → a paid order appears and the item is SOLD (refund it from
   the order page if it was only a test).

## Before the SQL runs

Everything tolerates the missing column/table: the Products page loads, the
Offers column reads "–", Admin → Offers says to run the SQL, the product page
shows no button, and ticking **Accept offers** says "Run supabase/make-offer-2026-10.sql…".

## Troubleshooting

- **"PayPal did not approve the payment hold"** on every try → the live account
  may not allow authorizations; check PayPal → Account Settings, or call PayPal.
- **Accept says "PayPal refused the charge"** → the offer reads *Payment failed*,
  the item stays available, the hold is released; call the buyer.
- **A hold still shows on the buyer's bank after a decline** → banks take days to
  drop a released hold; `hold_status = release_failed` on the row means PayPal
  refused the release and the sweep is retrying.
- **Counter email did not send** → the notice shows the link; send it yourself,
  or **Send the link again** (the old link stops working).
