# Tax-exempt sales (Florida certificates)

> Built 2026-10-27 from owner mockup v2 + "build it all". Record:
> `CHANGELOG.md` 2026-10-27 (2). Rules: `DECISIONS.md` → *"Tax-exempt sales"*.
> Files: `STRUCTURE.md` → *Tax-exempt sales* row.
> ⛔ Needs `supabase/tax-exempt-2026-10.sql` run in Supabase BEFORE the deploy.

Florida's 6% comes off a sale only when the store holds a **Florida-issued**
Annual Resale Certificate (DR-13) or Consumer's Certificate of Exemption
(DR-14) for the buyer. Out-of-state certificates are refused everywhere.

## 1. In the store — In-store sale and Remote sale

Instant Sale → section **2. Customer** → tick **Tax-exempt sale (Florida certificate)**.

- **Certificate:** "New certificate", or pick one **on file** (one pick, nothing
  to retype). Every new certificate is stored; "Save for next time" decides
  whether it shows in this list later.
- **Take photo / Choose photo or PDF** → the AI reads it in a few seconds and
  fills Type, Name, Number and Valid through (same AI set-up as "Fill form
  from ID"). ✓/✕ lines show: Florida, the form, still valid. If the AI was
  unsure of a digit the number box turns orange and recording waits for the
  **Number checked** tick. A non-Florida certificate blocks the sale until the
  box is unticked.
- **Customer showed me the physical certificate** — tick it and the photo is
  not needed; the details become optional (add the number if you can — it is
  what proves the exemption later). The order records that the physical copy
  was seen, by whom and when.
- **Florida authorization #** (optional) + **Verify with FL Revenue ↗**.
- The Total card reads **FL sales tax · exempt** and $0.00. Tax comes off the
  whole sale (items + shipping).
- Remote sale: the invoice email shows "Tax · exempt", and the customer's pay
  page shows a *Tax-exempt sale* note — a Florida address adds no tax.
- ⚠️ A Remote sale **draft** does not keep the tax-exempt box. Tick it when
  you send.

## 2. On the website — the buyer stays in the same checkout

1. Checkout charges Florida tax (pickup or a Florida address) → under the
   totals: *"Buying for resale or for an exempt organization? Use your Florida
   certificate →"*.
2. **Take photo / Upload photo or PDF** (5 MB at most). The AI reads it. The
   checks run **before anything reaches you**: Florida-issued, DR-13 or DR-14,
   not expired, readable. Any "no" → the buyer sees the plain reason (e.g.
   *"This is a Georgia certificate. Florida only accepts Florida-issued…"*),
   nothing is stored, no text is sent.
3. The buyer sees what was read (types nothing), ticks *"I certify…"*, and —
   if signed in — sees *"Save this certificate to my account for future
   tax-exempt purchases. You can remove it anytime in My Account."* (ticked;
   they can untick). Guests see a line inviting them to sign in to save it.
4. **Send for approval** → **you get a text** (from the Twilio number that
   texts you about offers): business, last 4 of the number, valid-to, cart
   total and tax, buyer name + phone, and the link. If Twilio is down, an
   email to info@ goes instead.
5. The buyer's screen: *"Waiting for approval — Approval usually takes just a
   few minutes. Keep this page open and your total will update here by
   itself."* + *"Not approved within 10 minutes? Text us at (239) 404-8505 and
   mention request TX-1042."* After 10 minutes that line moves to the top.
   When the store is **closed** (admin store hours) it says instead: *"We're
   closed right now. We'll approve it when we open at 11 AM and email you a
   link to finish your order."* PayPal waits meanwhile (or they press *Cancel
   and pay with tax*).
6. You open the link → **Admin → Tax Exempt → TX-…** (phone-sized): the
   certificate photo, the checks, the buyer, the cart (Available / Sold per
   piece), Verify with FL Revenue, optional authorization #, **Approve** or
   **Decline…** (quick reasons or your own words).
7. **Approve:** the certificate is stored (and saved to the buyer's account if
   they asked); the buyer's checkout drops the tax within ~5 seconds; they also
   get an email *"Your tax exemption is approved — Finish your order"* that
   reopens checkout with it applied. The approval is good for **24 hours**, for
   **the same email** only.
8. **Decline:** the reason shows on their checkout and goes out by email.

The shop never holds pieces: during the wait the item is still for sale to
anyone (same as any cart).

## 3. Repeat buyers — saved to the account

- A **signed-in** buyer whose approved certificate is saved to their account
  sees *"Your Florida certificate is on file"* at checkout and the tax comes
  off at once, until the certificate expires (an undated one: a year after
  approval). *"Not buying for resale this time? Pay with tax"* turns it off for
  that order.
- **My Account** → side card **Tax-exempt status**: Approved, business,
  "Florida Annual Resale Certificate ··6789", valid through — and **Remove from
  my account** (the store keeps its record; it just stops applying). While a
  saved request waits for you, the card says so.
- Guests are never auto-exempt: an email address alone is easy to borrow.

## 4. Where the record lives

- **Admin → Tax Exempt** (menu, after Instant Sale): requests waiting, every
  certificate on file (photo **View certificate**, physical copy, source, who
  approved, saved-to-account, the orders that used it, **Withdraw / Restore**),
  the tax-exempt orders with "tax not charged", recent website requests.
- **The order:** `orders.tax_exempt` + `tax_exempt_certificate_id` +
  `tax_exempt_snapshot` (a copy that stays readable if the certificate is
  later withdrawn). The admin order page shows a **Tax exemption** card;
  Summary reads "Tax · exempt".
- **Receipts:** the one-page paper receipt and the emailed receipt/invoice
  print "FL sales tax · exempt" + a line *"Tax-exempt sale · Florida Annual
  Resale Certificate 78-… · Coastal Jewelers LLC · valid through 12/31/2026"*.
- **Files:** private bucket `tax-certificates` (`certificates/` from Instant
  Sale, `requests/` from the website). Photos are WebP (verified); PDFs kept
  as uploaded. Admins open them through a 5-minute signed link. ⛔ Never
  auto-deleted once used. A website upload never sent is removed after 7 days;
  a retake removes the replaced upload unless a certificate uses it.

## Setup

- ⛔ Run **`supabase/tax-exempt-2026-10.sql`** in the Supabase SQL editor
  BEFORE the deploy (safe to re-run; the bottom has verify queries). Without
  it: the checkout link still shows but an upload fails with *"…has not been
  run yet"*; Instant Sale's box errors on record; everything else (receipts,
  pay page, order page, taxed checkout) works as before.
- No new environment variables: the AI read uses `AI_PROVIDER=anthropic`,
  `ANTHROPIC_API_KEY`, `AI_ID_READ_MODEL`/`AI_MODEL` (as "Fill form from ID");
  the owner text uses the existing Twilio settings (`TWILIO_FORWARD_TO`).

## Not covered (by design)

- Make an Offer holds/captures and the Instagram/Facebook checkout keep
  charging tax as before. A counter-offer Buy-now link stays taxed.
- No automatic check against the Florida Department of Revenue — the owner
  uses the Verify link and may paste the authorization number.
