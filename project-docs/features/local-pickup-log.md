# Local Pickup log + pickup sheet (2026-11-21)

Owner, 2026-11-21: *"when a customer purchases an item on the website and
chooses local pickup … allow admin to print a pickup sheet … log pickup …
webcam pic of the customer's id … a field for them to sign … a disclaimer
line"*, then *"a version that is totally digital … sign with their finger on
an iPhone or iPad"*, *"print a customer copy"*, *"a checkbox … to email them
it"*, *"no need to lock the finger sign feature"*, and on mockup 1: *"yes,
build it, but fill the id info with AI like we do on the buy receipt"*.

Mockup: scratchpad `pickup-mockup/pickup-mockup-1.html` (session only).

## Where

Admin → Orders → a **Local Pickup** order → the **Pickup** card, right under
Fulfillment. Shown when `shipping_method = 'pickup'` and the order is NOT an
in-store sale (`payment_method` not `in_store_*` — the customer carried it out
at the counter). So: checkout Local Pickup, Make an Offer, Instagram/Facebook
checkout, Remote sale set to pickup. Shipped orders look as before.

## Using it

1. **Log Pickup** opens the window:
   - **Who is picking up?** The buyer (name from the order), or **Someone
     else** (type their name — a gift recipient, a spouse).
   - **ID photo** — the buy receipt's own strip and webcam window (Use webcam
     → Capture → Use this photo; or Choose a photo).
   - **Fill from ID** (ticked by default): the AI reads the photo through the
     buy receipt's route (`/api/admin/buy-receipts/id-read`) and fills the
     EMPTY boxes — ID type, ID last 4, and the "Someone else" name if it has
     none. Never a box that already has something in it. If the name on the ID
     does not look like the buyer's, an orange line says so with a **Someone
     else is picking up** button — it never switches by itself.
   - **ID type**, **ID last 4**.
   - **How will they sign?** With a finger on this iPad / iPhone, or on paper.
   - **Email the customer their pickup copy** (ticked when the order has an
     email; greyed out when not). Goes to the BUYER even when someone else
     picks up. First log only.
2. Finger: **Customer Signs Here →** opens the full-screen signing screen.
   Hand them the device: items (no prices), the statement, the signing box,
   Printed name. **Clear** wipes the box, **Cancel** saves nothing, **Done**
   saves everything. iPhone upright → "Turn the phone sideways"; sideways the
   box takes the screen and Done needs no scrolling.
   Paper: **Save & Print** saves, then prints the chosen print set here.
3. Saving marks the order **Picked Up** (server-side). The Fulfillment card's
   own "picked up" email is NOT sent — the pickup email replaces it.
4. After: the card shows when, who, ID (type · last 4 · photo thumbnail),
   signed (signature thumbnail, or "On paper"), the email. **Print set**
   (Store + customer / Store only / Customer only) → **Send to Desktop
   Printer** (the Print Station) or **Print Here**; **Email Now / Email
   Again**; **Edit Pickup**; **Customer Signs Again** (replaces the signature).
5. Before a pickup: **Print Blank Pickup Sheet** = the store copy with empty ID
   and signature boxes, for a paper-only pickup.

## The paper

Same look as the one-page receipt (`order-receipt-paper.ts`). Both copies go
out as ONE print job, store first, one letter sheet each up to ~6 items
(checked in headless Chrome, 2026-11-21: 6 items → 2 pages for both copies;
2-item paper pickup → 2; blank → 1).

| | Store copy (kept on file) | Customer copy (handed over) |
|---|---|---|
| Header, order #, ordered date, items (no prices) | ✅ | ✅ |
| Picked up by | name + "(the buyer)" + ID type ····last 4 | name only |
| ID photo | ✅ card size, with order # + printed time beside it | ⛔ never |
| Statement | ✅ | ✅ |
| Finger signature | printed in + name + date + "Signed electronically…" + Staff line | printed in + name + date |
| Paper signature | blank Customer signature / Printed name / Date / Staff | no signature row |
| Footer | — | Thank you · 5-day returns · hours · landmark |

The statement (`PICKUP_STATEMENT`, `lib/order-pickup.ts`):
> I confirm I am the buyer named on this order, or a person the buyer
> authorized to collect it, and the ID shown is mine. I received the item(s)
> listed above, have inspected them, and accept them in the condition
> described. Returns follow Naples Estate Jewelry's posted policy: call or
> text within 5 days of pickup.

## The email

`buildPickupEmail` (`lib/order-pickup-email.ts`): "Your pickup receipt — Order
…", the buy-receipt email's light look: logo, details (order, ordered, picked
up, picked up by), items with thumbnails (no prices), "✓ Signed
electronically by … on …" (or "Signed in person at the showroom on …"), the
statement, the returns line, footer. Logged in the order's email history as
**Pickup Receipt** (`order_emails.email_type = 'pickup_receipt'`).
⛔ Never the ID photo, ID type / last 4, the signature picture or prices.

## Private files

- ID photo + signature live in the EXISTING private bucket `buy-receipt-ids`
  (admin-only policies) under `order-pickups/<order id>/` — `id-<uuid>.webp`
  (quality 82) and `signature-<uuid>.webp` (lossless, trimmed). Both
  re-encoded with sharp and CHECKED to be WebP before upload. A new name on
  every upload; a replaced file is removed after the row points at the new one.
- The row stores PATHS (`order_pickups.id_photo_path`, `signature_path`).
  Pictures are shown only through 10-minute signed links.
- The paper carries them as `<img data-nej-private="path">`. Whatever prints
  (Print Here on the order page, or the Print Station) swaps each for a
  print-sized picture (`fillPrivatePaper` in `components/admin/pickup/pickup-client.ts`,
  using the buy receipt's `printableIdPhoto`).
- Delete Forever on an order (Orders → Recycle Bin) removes the row (cascade)
  and the folder (`removeOrderPickupFiles`, best effort).
- The Storage GC lists only `product-images`, so it never touches these.

## Database

`supabase/order-pickups-2026-11.sql` → `public.order_pickups`, one row per
order (`order_id` PK → orders, cascade): `picked_up_by`, `picked_up_by_buyer`,
`id_type` (the buy receipt's list), `id_last4` (`^[A-Z0-9]{4}$`),
`id_photo_path`, `sign_method` (`digital` | `paper`), `signature_path`,
`signed_name`, `signed_at`, `picked_up_at` (first log; never moves),
`emailed_at`, `emailed_to`, `logged_by_email`, `updated_by_email`, timestamps.
Admin-only RLS + grants. Until it runs the Pickup card says "needs the SQL"
and nothing else on the order page changes.

## Code map

- `src/lib/order-pickup.ts` — pure: types, `PICKUP_STATEMENT`, `isPickupOrder`,
  paths, `normalizePickupDetails`, `idNameMatchesBuyer`, `buildPickupPaper`,
  `privateImagePaths` / `withPrivateImages`.
- `src/lib/order-pickup-email.ts` — pure email builder.
- `src/lib/order-pickup-server.ts` — `loadPickupOrder`, `loadOrderPickup`,
  `sendPickupEmail`.
- `src/app/api/admin/orders/[id]/pickup/route.ts` — POST multipart (details
  JSON + optional photo + optional signature): save, files, mark Picked Up,
  first-log email.
- `…/pickup/email/route.ts` — Email Now / Again.
- `…/pickup/print-request/route.ts` — queue for the Print Station
  (`sale_print_requests`, via `queueSalePrint`; `{ copies, blank? }`).
- `src/components/admin/pickup/` — `OrderPickupPanel.tsx` (the card),
  `LogPickupWindow.tsx`, `PickupSignatureScreen.tsx`, `pickup-client.ts`.
- Reused, lightly extended: `IdPhotoField.tsx` (`words` prop),
  `SaleStationPrint.tsx` (`endpoint`/`body`/`label`/`buttonClassName`),
  `PrintStation.tsx` (fills private pictures before printing a sale paper),
  `OrdersPanel.tsx` (file cleanup on Delete Forever).
- CSS: `globals.css` → *Pickup signing screen* (phone upright / sideways).
- Tests: `src/lib/__tests__/order-pickup.test.ts` (25).

## Verification (2026-11-21)

- `npx tsc --noEmit` 0 · `npm run lint` 0 errors (the 4 old `<img>` warnings
  in `TextDealsManager.tsx`) · `npx vitest run` **2461/2461** (210 files) ·
  `npm run build` exit 0 (608 pages; the three new routes listed).
- Real components on a temporary dev page (deleted after; `.next/dev`
  cleared): the three card states; Log Pickup window; signing screen with a
  real mouse-drawn signature → Done sent a real `image/png` (1200 × 545) with
  the right details (save call intercepted — nothing written); card flipped to
  Picked up. Phone: 375 × 812 no sideways overflow, "turn sideways" shown;
  812 × 375 everything fits (scrollHeight 375), Done on screen.
- Papers printed to PDF in headless Chrome (letter, 0.5 in): see *The paper*.
  Email rendered and matches the mockup.
- The three routes answer **401** signed out.
- ⚠️ NOT verified: anything behind the admin sign-in (real save, upload, the
  AI read on a real ID, email send, the Print Station print), and real
  iPad / iPhone Safari touch signing (Chromium cannot prove WebKit touch) —
  the owner's first use is the check.
