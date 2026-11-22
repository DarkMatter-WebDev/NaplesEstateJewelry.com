# Instant Sale (Admin) — In-store sale + Remote sale + Trade-in sale

> Built 2026-10-21 from owner mockups v1 + v2. Was "In-Store Sale" (2026-09-16).
> Rules: `DECISIONS.md` → *"Instant Sale"*. Payment flow detail:
> `features/paypal-checkout.md` → *In-store sales* and *Remote sale invoices*.
> Files: `STRUCTURE.md` → *Instant Sale* row.

## Where

- Admin menu → **Instant Sale** (`/admin/instant-sale`). Three cards — **In-store
  sale**, **Remote sale** and (2026-11-21) **Trade-in sale** — and the list of
  **Open invoices** (unpaid remote sales, expired links included).
- `/admin/in-store-sale` (old bookmarks, the desktop shortcut) forwards to Instant Sale.

## In-store sale — the customer is here and pays now

1. **Items.** One card per item: **Listed item** (type the inventory # or part
   of the title, pick it) or **Not listed** (describe it, metal, price; weight
   and purity optional). Every new card starts on **Not listed** (owner,
   2026-10-27, both In-store and Remote). **＋ Add another item** for more (up to 20). **Remove**
   on any card when there is more than one.
2. **Photo (optional), per item.** **Take photo** opens the iPad's / phone's
   camera, or on a computer the same webcam window as Buy Receipts. **Choose
   photo** picks a file. A listed item shows its listing photo until you take
   one; yours replaces it on **this sale's order and receipt only** — the
   listing is not touched.
3. **Customer.** First / last name and cell as before. **Email** is optional;
   **Email copy** ticks itself as soon as an email is typed. Untick it to keep
   the email on the order but send no receipt now (send it later from the order).
4. **Pickup or ship**, **Paid by**, **Note**. Shipping fees go by the
   items' total. **Paid by** is one method (tap the chip) or — 2026-11-16 —
   **＋ Split payment** for two or more: each line is a method + an amount
   (up to 4 lines; the same method may repeat, e.g. two cards on Zettle).
   The **last line fills itself with what is left** (type $500 cash and the
   card line shows the rest) until you type in it. The green bar says when it
   adds up; a red bar says how much is still to assign (or too much) and the
   Record buttons stay off until it matches the total to the cent. Removing
   lines down to one = one method again; **Back to one method** does the same.
   The Total panel lists each payment and says what to collect
   ("Collect $1,302.00 on Zettle and $500.00 in cash before recording").
5. Take the card on Zettle (the total is on the button), then **Record sale** —
   or **Record & print receipt**: it records the sale and opens the print
   dialog with the one-page receipt (date, how it was paid, the items with
   photos). **Print receipt** on the "Sale recorded" screen prints it again.
   Email copy still follows its own box.
6. **Record & send to desktop printer** (2026-10-26) — for a sale recorded on
   the laptop: it records the sale the same way and sends the same one-page
   receipt (one copy) to the **Print Station** on the desktop PC — the window
   that prints buy receipts (`features/buy-receipts.md` → *The print station*).
   The screen then says *Sent. Waiting for the desktop…* → *Printed on the
   desktop.*; after 30 s with nothing picking it up: *The desktop has not
   picked this up. Is the Print Station window open on the printer PC?* The
   "Sale recorded" screen also has **Send to desktop printer** — each press
   prints one more copy. If the send fails, the sale is still recorded and the
   red line says why (press Send to desktop printer to try again).

### The desktop printer for sales — how it works (2026-10-26)

- One row in `sale_print_requests` per send: the order and its one-page paper,
  built by the site at that moment (`lib/sale-print-requests.ts`,
  `lib/sale-print-requests-server.ts`, routes `api/admin/in-store-sales`
  (`sendToStation: true`) and `api/admin/in-store-sales/[id]/print-request`).
- The Print Station checks that table in the same 3-second loop as buy
  receipts, straight from Supabase (no site calls while idle), claims a row
  (compare-and-set, 90 s take-over like buy receipts), prints it through the
  same hidden frame as **Record & print receipt**, then sets `printed_at`. Buy
  receipts go first; one job per check. Its page lists **Sale receipts today**
  with **Print again** (a local reprint; it changes nothing).
- ⛔ SQL first: `supabase/sale-print-requests-2026-10.sql`. Until it runs, only
  the two send buttons fail ("…needs supabase/sale-print-requests-2026-10.sql
  run in Supabase first"); the station skips the missing table and keeps
  printing buy receipts.
- After a deploy, **reload the Print Station window** once (it is a page left
  open all day; it does not load new code by itself).
- A queued receipt is a snapshot: if the order is edited before it prints, the
  station prints what was sent. Rows are tiny and kept (a deleted order takes
  its rows with it).

## Remote sale — email an invoice

1. **Items** — the same item cards and photos as in store.
2. **Customer** — name and **email** (the invoice goes there). Cell optional:
   the customer types it when paying.
3. **Pickup or ship.** On **Ship** the address is optional — left blank, the
   customer types it on the payment page. Until an address is in, the invoice
   shows the total **with** Florida tax; an out-of-state address takes it off.
4. **How they can pay** (tick any):
   - **Pay online link** — PayPal or any debit / credit card through the site.
   - **Zelle** to **(239) 304-6229** — ⚠️ the owner's own number "for now";
     when the business Zelle is approved, change `ZELLE_PAY_TO` in
     `next-app/src/lib/remote-sale.ts` (one line; a test pins it — update both).
   - **Check** payable to **Naples Estate Jewelry**, mailed to the showroom
     address or brought in.
   - **Call to pay by card** — (239) 404-8505.
   - **Link good for** 3 / 7 / 14 days (default 7). **Message** (optional,
     ≤ 300 characters) is printed in the email, signed "— Chris".
5. **Email invoice.** It becomes an **unpaid order** in Orders at once, and its
   card appears under Open invoices.

### Save draft — finish later, on any device

- **Save draft** (beside Email invoice) keeps the form as typed — items, photos,
  customer, pickup/ship, the ways to pay, the message. **No order is made** and
  nothing is sent; Orders does not show it.
- Instant Sale lists it under **Drafts** with **Continue** (opens the form as you
  left it, on any device) and **Delete**.
- **Email invoice** from a draft sends it and removes the draft.
- A listed piece that sold since the draft was saved comes back unpicked, with
  a note — pick another or remove it.

### After sending — the invoice card

- **Copy pay link** — paste it into a text if the customer cannot find the email.
- **Resend email** — sends it again and gives the link a fresh period (the link
  itself stays the same).
- **Record payment** — for Zelle, a check, cash… Pick how it was paid and
  record it: items sold, listings end, the customer gets the receipt. The order
  then reads "Invoice · Zelle". **＋ Split payment** (2026-11-16) works as on
  the In-store form (e.g. $1,000 check + the rest by Zelle); the button reads
  "Record $1,802.00 · Split" and the order "Invoice · Split".

### Split payment — where it shows (2026-11-16)

- **Paper receipt** and **emailed receipt:** one "Paid by" line per payment
  ("In store · Cash $500.00", "In store · Card · Zettle $1,302.00"); the email
  says "Paid in full by Cash $500.00 and Card · Zettle $1,302.00 on …".
- **Admin → Orders → the order:** *Payment method: In store · Split* and
  *Reference: In store · Cash $500.00 + Card · Zettle $1,302.00*.
- Saved as `payment_method in_store_split` / `remote_split`, the parts in
  `payment_response.payments` — no new column, no SQL. Online checkout is never
  split (`DECISIONS.md` 2026-11-16 split-payment entry).
- **Cancel invoice** — the link stops working and the unpaid order is cancelled.
  Nothing is emailed.
- Paid **online**, the invoice closes by itself: the customer gets the normal
  receipt, you get the new-order email, and the card leaves the list.

### Things to know

- **Nothing is held.** A listed item on an invoice stays for sale on the site,
  eBay and Etsy until someone pays (the counter-offer rule). If it sells first,
  the payment page says so and takes no money.
- A remote **pickup** stays "Fulfillment: Pending" until you mark it picked up.
- The payment page (`/pay/<link>`) is private: never indexed, no referrer.

## Receipt language — English | Español (2026-11-21)

In-store sale and Remote sale have **Receipt language: English | Español** under
the customer's boxes (starts on English). Español = the receipt you print, the
emails the customer gets (receipt / invoice and its Pay page, later updates,
tracking, pickup) in Spanish; your copy of the order stays English. On a
**Trade-in sale** the buy receipt's switch, labelled **Both receipts**, sets both.
Change it later on the order page (Customer card → Language). Rules:
`DECISIONS.md` → *"Spanish receipts"*.

## Trade-in sale — gold traded toward a purchase (2026-11-21)

Owner option C, mockup 1 → *"Yes, build it"*. Rules: `DECISIONS.md` → *"Trade-in sale"*.
Record: `CHANGELOG.md` 2026-11-21 (5). No SQL.

**Where:** Instant Sale → third card **Trade-in sale** (`/admin/instant-sale/trade`),
or **Trade-in sale →** at the end of the Buy Receipts tabs.

**At the counter:**

1. **Left — the buy receipt**, exactly as on Buy Receipts: seller boxes (or
   **Customer input mode**), ID photo + Fill from ID, thumbprint, the gold and
   what you pay for it. **Paid by** starts with a locked line, *Trade-in credit
   toward this sale* — it fills in from the right side.
2. **Right — what they buy** (starts on *Listed item*). A listing that shows a
   trade-in price ("pay as little as ___") fills that price; type over it if
   needed. The customer's name / phone / email come from the receipt — the
   **phone is required** for the sale.
3. **The difference** works itself out (6% tax on the full price, as on every pickup):
   - gold worth less → **Customer pays $X** → collect it (Zettle, cash, split…, as In-store);
   - gold worth more → **You pay <name> $X** → choose how under the receipt's
     Paid by (cash, check #, Zelle… — split with +);
   - equal → *Even trade*.
4. **Email copy** on the receipt emails BOTH receipts. **Save trade** ·
   **Save & print both** (buy receipt print set first, then the sale's
   one-page receipt) · **Save & send both to desktop printer**.

**What each paper says:** buy receipt — *Trade-in credit toward purchase
NEJ-…* (+ the payout line); sale receipt — *In store · Trade-in credit ·
BUY-00142 $900.00*, *Card · Zettle $1,750.00*, and *Your trade-in: … (receipt
BUY-00142, $900.00).* The order page shows **Trade-in: $900 of gold on BUY-00142 ›**.

**Mistakes:** a trade receipt cannot be edited or deleted on its own. Void it
(its dialog offers an unticked *Also move sale NEJ-… to the Recycle Bin*), or
move the order to the Recycle Bin (its confirm offers an unticked *Also void
BUY-…*), then record the trade again. Moving the sale to the Recycle Bin keeps
the item sold — use *Move to Recycle Bin and return to inventory* on the order
when the piece is back in the case.

**Good to know:** pickup only (ship it? do two receipts); no drafts; no
store-credit balance — leftover value is paid out the same day. A refresh while
the tablet is locked in Customer input mode lands on Buy Receipts (the seller's
boxes come back; re-enter the sale half). Code: `lib/trade-in-sale.ts`,
`app/api/admin/trade-in-sales/route.ts`, `components/admin/instant-sale/TradeInSaleForm.tsx`
(+ `BuyReceiptForm`'s `trade` prop).

## Tax-exempt sale (2026-10-27)

Both forms have a **Tax-exempt sale (Florida certificate)** box in *2. Customer*:
a certificate on file, or Take photo / Choose photo or PDF (the AI fills the
details), or "Customer showed me the physical certificate" (no photo needed).
Tax comes off the whole sale; the certificate is noted on the order, the
receipt and **Admin → Tax Exempt**. A Remote sale draft does not keep the box.
Full runbook: `features/tax-exempt.md` (⛔ needs `supabase/tax-exempt-2026-10.sql`).

## Setup — ⛔ one SQL file before the first Remote sale

Run **`supabase/remote-sales-2026-10.sql`** in the Supabase SQL Editor (safe to
re-run). Section 1 = invoices, section 2 = drafts (added the same day — if you
ran the file before drafts existed, run it once more). Without it only "Email
invoice" / "Save draft" fail and the Open invoices / Drafts lists stay empty;
the In-store sale and the rest of the site work as before. No new environment variables (the pay page
uses the existing PayPal and Resend settings).
