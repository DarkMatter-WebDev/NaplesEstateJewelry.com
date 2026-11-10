# Check Availability — pieces another dealer holds (2026-11-05)

> Status: **SQL RUN + DEPLOYED 2026-11-05 (owner: SQL first, then the push).**
> Not yet used for real — the first ticked item and its first request are the
> check (`TASKS.md`). Owner-approved design: mockup 1 (2026-11-05), defaults as drawn.

## What it does

Some listed pieces are physically with another dealer. Before promising one to a
buyer, the owner confirms the dealer still has it. Tick **Confirm availability
first** on the item and:

- **Add to Cart becomes Check Availability** (gold, same place), with the line
  "We'll confirm this piece is ready to ship — usually within the hour. **No
  payment needed to ask.**" Save, Call and Make an Offer stay. **Since
  2026-11-10:** the item page has no separate Inquire button (Check
  Availability is the inquiry), and the status chip on the card, list row and
  item page reads **INQUIRE** (gold), not "Available". The card button is one
  label, "Check Availability", with a mail icon (`DECISIONS.md` 2026-11-10).
- The buyer fills a short form (`/availability/<id>`): first + last name, email,
  phone (optional), message (optional). **No payment, no PayPal.** They see
  "We're checking on it — keep an eye on your email" and get the same by email.
- The owner gets an **email + text** ("Check with the dealer") and a card in
  **Admin → Offers** marked **Availability check**, with two buttons:
  - **Available — send Buy link** → the buyer is emailed "Good news — it's
    available" with a private **Buy now at $X** button: today's price, good for
    **48 hours**, optional note signed "— Chris". They pay through the normal
    checkout (pickup or shipping, card or PayPal) and the sale completes by
    itself. Nobody else can buy the piece meanwhile.
  - **Not available** → "This piece has sold — you were never charged" email,
    optional note, and the box **Also mark this item Sold** (ticked by default)
    marks it Sold the owner's normal way and closes any other request on it.
- No answer in **72 hours** → the request closes and the buyer gets "We couldn't
  confirm it in time — call or text us". A Buy link that runs out unused moves to
  Expired (no email, like a counter-offer).

## Where ticked items appear

| Place | What happens |
|---|---|
| Item page | Check Availability instead of Add to Cart |
| Shop grid / list | The card's cart button becomes Check Availability (the phone's small cart icon is hidden) |
| Checkout (`/api/paypal/create-order`) | ⛔ Refuses a ticked item unless it is paid through its Buy link (`check_availability_first`) — the enforcement; the buttons are convenience. Covers carts from before the box was ticked and the wishlist drawer |
| Instagram / Facebook shop | **Stays listed** (owner, 2026-11-05). A Buy tap lands on `/meta-checkout`, which sends a single ticked piece straight to its Check Availability form (a mixed cart shows "One more step" with a link per piece) |
| Google feed | Stays (it only links to the item page) |
| eBay, Etsy | **Kept off** — both pre-flights fail a ticked item ("Confirm availability first"). A listing already live there is **not** ended automatically — end it by hand |

## How it is built

- One flag: `products.confirm_availability` (anon/authenticated read grant).
- Requests live in `product_offers` with `kind = 'availability'` (column added
  by the same SQL; every existing row is `'offer'`). Status `open` (no hold,
  `hold_status 'none'`), `amount` = today's price, `shipping_method` =
  the checkout default (the buyer picks on the Buy link).
- **Available** = `sendAvailabilityLink` (`lib/offers-server.ts`): status
  `countered`, `counter_amount` = today's price, `counter_expires_at` = +48 h,
  hashed token. The Buy link IS the counter-offer link (`/offer/counter/<token>`,
  worded "It's available" for this kind) → `counter_bought` when paid.
- **Not available** = `declineOffer` + (optional) `adminUpdateProductStatus(id,
  'sold')` + `closeOffersForProducts` — route `api/admin/offers/[id]` action
  `unavailable` (`markSold`).
- Accept / Counter refuse an availability row; the 15-minute `nej-offers-sweep`
  expires requests and links and retries missed emails — no new cron.
- Emails: `buildAvailabilityBuyerEmail` / `buildOwnerAvailabilityEmail`
  (`lib/offer-emails.ts`); text `ownerAvailabilityTextBody` (`lib/offers.ts`).
  Buyers are never texted (offer texts stay shelved).

## Setup (once)

1. ⛔ Run `supabase/availability-check-2026-11.sql` in the Supabase SQL Editor.
   The last query must show ONE row, every value **true**.
2. Push + deploy.
3. Tick **Confirm availability first** on a partner piece (Admin → Products →
   edit, under "Accept offers"). The products table shows a **Check first** chip.

## Before the SQL runs

The new code reads `product_offers.kind` on every offer screen, so **until the
SQL runs, Make an Offer and Admin → Offers stop working** ("Run the SQL first";
the offer page says the piece isn't taking offers — measured on the dev server
2026-11-05). Everything else degrades by itself: the item page, shop and
checkout read the new product column on its own and act exactly as before.

## Files

`supabase/availability-check-2026-11.sql` · `src/lib/offers.ts` · `src/lib/offers-server.ts` ·
`src/lib/offer-emails.ts` · routes `api/availability`, `api/admin/offers/[id]`, `api/admin/offers`
(`?counts=1` → `confirmAvailability`), `api/paypal/create-order` · pages `[locale]/availability/[id]`,
`[locale]/offer/counter/[token]`, `[locale]/meta-checkout`, `[locale]/shop/[id]`, shop list renderer ·
UI `components/offers/AvailabilityRequestClient.tsx`, `OfferCheckoutClient.tsx`, `components/shop/CartButton.tsx`,
`ProductCard.tsx`, `ProductListRow.tsx`, `components/checkout/MetaCheckoutHandoff.tsx`,
`components/admin/OffersPanel.tsx`, `AdminShell.tsx` · `lib/ebay/mapping.ts`, `lib/etsy/mapping.ts` ·
test `lib/__tests__/availability-check.test.ts`.

## To turn it off

Untick the box on each item (they go back to Add to Cart at once). Removing the
feature entirely means reverting the files above; leave the two columns — they
are harmless.
