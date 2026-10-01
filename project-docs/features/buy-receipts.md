# Feature: Buy Receipts (Admin)

> Status: **DEPLOYED 2026-09-30** (SQL run and pushed by the owner; signed-out
> checks pass on production). Everything behind the admin login (saving, the webcam,
> the photo upload, the print station's live loop, the real printer) is
> **unverified until the owner's first use** — see *Verification* at the end.

The receipt for something the shop **buys** from a customer at the counter.
The owner fills it in on a laptop beside the seller, it is saved to a log in
Admin, and it prints on the desktop PC that has the printer. The seller signs
the printed copy by hand.

Admin → **Buy Receipts** has three tabs:

| Tab | URL | What it is |
|---|---|---|
| New receipt | `/admin/buy-receipts` | The form, shaped like the paper |
| Log | `/admin/buy-receipts/log` | Every saved receipt, newest first; search by number, seller, phone |
| Print station | `/admin/buy-receipts/station` | The page left open on the printer PC |

A saved receipt has its own page, `/admin/buy-receipts/<id>`: print it again,
edit it, duplicate it, void it, add or replace the ID photo.

## What is on the receipt

- Header: the logo mark, **Naples Estate Jewelry**, the showroom address,
  phone and email (`business-location.ts`, `order-email-branding.ts`). No LLC
  line (owner, 2026-09-29).
- Receipt number (`BUY-00042`, assigned on save) and the date/time in Eastern.
- **Seller**: name, phone, email (optional), street, city, state, ZIP, ID type,
  ID last 4, date of birth.
- **Items purchased**: quantity, description, amount. The form starts with one
  row ("+ Add item" for more) and the paper prints only the rows entered. ⛔ The amount is the
  **line total** as typed; there is no unit price. The total is the sum.
- **Paid by**: Cash, Check (asks for the check number), Zelle, Venmo, Bank
  transfer, Store credit / trade. The **+** button adds another method for a
  split payment; with two or more, each gets an amount and they must add up to
  the total.
- Notes: one line tall, grows only if more is typed.
- The ownership statement (`BUY_RECEIPT_ATTESTATION` in `lib/buy-receipts.ts`).
  ⚠️ Owner: confirm this wording with your attorney.
- **Shop copy**: blank *Seller signature | Date* lines for the seller, kept on
  file. Below them, *Received by — Christopher Surette, Naples Estate Jewelry*
  with the name printed in cursive (Alex Brush, `src/lib/signature-font.ts`;
  name in `BUY_RECEIPT_SIGNER_NAME`) and the receipt date beside it.
- **Seller's copy**: the same printed Received-by line, no seller line, never
  the ID photo. **The owner never signs anything**; the seller signs once.

Only the seller's **first and last name**, **one item** and **how it was paid**
are required. Everything else may be left blank so the form never holds up a
sale.

## Emailing the seller their copy

Under the Email field: **Email a copy to the seller when saved** (greyed out
until an email is typed). The seller's copy goes out through Resend as the
receipt is saved — a light, compact receipt (small octopus logo, one details
list, "Items purchased by Naples Estate Jewelry", the statement in the third
person — "The seller certifies…" — and the owner's printed Received-by
signature sharing one underline with the date), **never the ID photo**. The
logo is `public/assets/images/branding/email-logo.png` (PNG: Outlook cannot
show WebP). The after-save panel says *Emailed
to …* or shows the error with **Email now**; the receipt page has **Email to
seller** / **Email again**; the Log shows an **Emailed** tag. A void receipt is
not emailed. SQL: `supabase/buy-receipts-email-2026-09.sql` (`emailed_at`,
`emailed_to`). Code: `src/lib/buy-receipt-email.ts` (the email, pure),
`src/lib/buy-receipt-mailer.ts` (Resend + the stamp),
`app/api/admin/buy-receipts/[id]/email/route.ts`.

## On a tablet or a phone

The form reflows: on a tablet the header stacks and fields go two per row; on
a phone (under 520 px) one field per row, each item row becomes a small block
(description, then qty / amount / remove), payments stack, and inputs are 16 px
so iOS does not zoom. The webcam starts with the rear camera there. The print
output is unchanged — every reflow rule is `@media screen`.

## Seller ID photo

- "Use webcam" opens a capture window (live picture, a card-shaped guide,
  Capture → Retake / Use this photo). "Choose a photo" takes a picture file,
  e.g. one taken on a phone.
- Optional. A receipt without one shows a **No ID photo** tag in the Log; it
  can be added later from the receipt's page.
- ⛔ **Private.** It goes to the Storage bucket `buy-receipt-ids` (not public,
  admin-only policies). The row stores the object **path**
  (`buy_receipts.seller_id_photo_path`), never a link. It is shown only through
  a signed link that expires in ten minutes. Never the public `product-images`
  bucket, never an email attachment, never a public URL.
- It is **never printed on the seller's copy**. It prints only on a copy the
  owner asked to carry it (next section).
- The browser downsizes a chosen file first (the lead-form shrink); the server
  re-encodes to WebP with sharp and checks the result really is WebP
  (`api/admin/buy-receipts/[id]/id-photo/route.ts`). Replacing a photo uploads
  under a new name and deletes the old object; removing deletes it.
- The Storage garbage collector (`api/admin/storage-gc`) lists only
  `product-images`, so it never touches this bucket. Nothing else needs to.

### The camera permission

- The site's `Permissions-Policy` header was `camera=()` — no page could use a
  camera at all. It is now `camera=(self)` in **both** `next-app/next.config.ts`
  and root `netlify.toml` (the two-file header rule; a test guards both). The
  browser still asks the person the first time.
- The camera only works on a secure page: `https://naplesestatejewelry.com` or
  `http://localhost:3007`. ⛔ It does **not** work on the LAN address
  (`http://10.0.0.208:3007`).

## What prints

The **print set** dropdown (form, after-save panel, receipt page):

| Choice | Pages |
|---|---|
| Shop copy + seller's copy **(default)** | shop (blank lines) + seller's (signed) |
| Shop copy with ID photo + seller's copy | shop with the ID + seller's |
| Shop copy only | 1 |
| Shop copy with ID photo only | 1 |
| Seller's copy only | 1 |

The two "with ID photo" choices are greyed out until a photo is attached. On
the shop copy with the ID, the photo sits **beside the signature lines**, at
card size (3.375 × 2.125 in). ⚠️ With the current margins that copy needs a
second sheet once a receipt has about five or more items (the signature-and-ID
block moves whole to the next page); up to four items it is one page.

- **Save and send to desktop printer** saves, uploads the photo, then asks the
  print station to print. The laptop then shows *Sent. Waiting for the
  desktop…* → *Printed on the desktop.* If nothing picks it up in 30 seconds:
  *The desktop has not picked this up. Is the Print Station window open on the
  printer PC?*
- **Print here** prints on the computer you are using (the normal print
  dialog, unless that browser was started with the shortcut below).
- The Log's **Send to printer** and **Print here** both use the default set (2
  copies, no ID photo).

Printing never opens a pop-up window. The receipt is placed in a hidden holder
directly under the page body, and the print stylesheet hides everything else.
All copies of one request go out as **one print job**, one page per copy —
shop copies first, then the seller's copy.
The printed sheet keeps 1 in at the sides, 0.85 in at the top and 0.45 in at
the bottom (the owner's printer cut the edges at half an inch; then more room
was wanted at the top). Not more in total: a six-item file copy with the ID
photo must still fit one page.

## The print station (the desktop PC)

### One-time setup on the printer PC

1. In Windows, make the receipt printer the **default printer**, and set its
   default paper to **Letter, portrait**.
2. Create a desktop shortcut with this target (one line):

   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="%LOCALAPPDATA%\NEJStation" --kiosk-printing --disable-backgrounding-occluded-windows --disable-background-timer-throttling --app=https://naplesestatejewelry.com/admin/buy-receipts/station
   ```

3. Open it. Sign in once (the sign-in stays in that separate Chrome profile).
4. Click **Use this computer as the print station**.
5. Click **Test print**. One page should come out with no web address or date
   printed in the margins.

### Why each part of the shortcut matters

- `--kiosk-printing` makes Chrome print straight to the default printer with
  no dialog.
- `--user-data-dir=…` gives the station its **own Chrome**. Without it, if the
  everyday Chrome is already open, Windows just hands it the address and the
  kiosk switch is silently ignored — the dialog comes back.
- 253 characters: the Windows "Create Shortcut" wizard cuts a target off at
  259 (the owner hit it, 2026-09-30).
- The two `--disable-…` switches are the cure for a slow print: Chrome holds a
  covered or background window's `print()` and slows its timers. A job sent from
  the laptop sat for over a minute when the station ran as a background tab in
  the everyday Chrome (2026-09-30). Keep the station in its own window from
  this shortcut, and do not minimise it.
- `--app=…` opens it as a plain window with no address bar.
- ⛔ Always open the station from the shortcut. Opened from the everyday Chrome
  it still works, but it shows the print dialog.
- To change printers, change the Windows default printer. There is no printer
  choice in the page.

### If the desktop still shows the print dialog

A web page cannot skip the dialog; only Chrome started with `--kiosk-printing`
prints silently. The station measures how long `window.print()` blocked: a
dialog blocks until dismissed, kiosk printing returns at once. After a print
that took longer than 1.5 s it shows an amber notice and opens the
"Set up printing with no dialog" box (the shortcut target with a Copy button).
The three usual causes: the station was opened in the everyday Chrome; the
shortcut's Chrome was already running without the switch; or the Windows
default printer is "Microsoft Print to PDF" or none.

### How it behaves

- ⛔ It does nothing until **that browser** is chosen as the station (a flag in
  that browser's local storage, `nej-buy-receipt-station`). Opening the tab on
  the laptop is harmless: it just says "This computer is not the print
  station".
- It checks for new print requests every 3 seconds, straight from Supabase
  under the admin sign-in. It does **not** go through the website's server, so
  a station left open all day costs no Netlify function calls.
- Before printing it **claims** the request (a compare-and-set update), so two
  station windows can never print the same request. A claim from a window that
  crashed is taken over after 90 seconds.
- If the "printed" update fails after a page has printed, the station retries
  that update on every check and will not print the receipt again.
- "Check now" checks at once. "Test print" prints a sample and saves nothing.
  "Print again" on a row prints one plain copy.
- Signed out (after a long power-off, a password change): it says so and goes
  to the sign-in page, then comes straight back.
- Status pill: green *Connected*, red *Disconnected · retrying* (it backs off
  to every 30 seconds and recovers by itself).

## Editing, voiding, duplicating

- A saved receipt **can be edited** (owner, 2026-09-30). The number and the
  date never change.
- **Void** needs a reason. A void receipt keeps its number, stays in the log,
  reprints with a VOID mark, and can no longer be edited or un-voided. The
  database enforces this too (trigger `buy_receipts_guard`), because the print
  station has direct update rights.
- **Duplicate** opens a new form pre-filled from a receipt. It saves as a new
  receipt with its own number. Void + duplicate is how a mistake on a receipt
  that has already been handed over gets corrected.
- Receipt numbers can skip (BUY-00004 → BUY-00006) when a save fails part-way.
  That is normal. ⛔ Never reuse a number.

## Database

`supabase/buy-receipts-2026-09.sql` — run once in the Supabase SQL editor
**before** the deploy. Safe to re-run. Then
`supabase/buy-receipts-seller-copy-2026-09.sql` (2026-09-30) adds the
`print_copies_seller` column. The first file creates:

- `public.buy_receipts` with admin-only RLS (`is_admin_user`) **and** the table
  grant to `authenticated`. Both are required: the admin routes run on
  `requireAdmin()`'s request-scoped client, and the print station talks to the
  table directly (`DECISIONS.md` → *"An RLS policy without a table GRANT…"*).
  Nothing uses the service role; `anon` has nothing.
- The guard trigger (number/creation facts never change; void receipts frozen;
  a void needs a reason).
- The private bucket `buy-receipt-ids` and its four admin-only policies.

The file ends with verify queries and says what each should return.

## Code map

| Piece | File |
|---|---|
| Rules, types, validator, print sets, dates | `next-app/src/lib/buy-receipts.ts` |
| Tests (42) incl. source guards | `next-app/src/lib/__tests__/buy-receipts.test.ts` |
| Routes | `next-app/src/app/api/admin/buy-receipts/` — `route.ts` (POST, GET), `[id]/route.ts` (GET, PUT), `[id]/print-request`, `[id]/printed`, `[id]/void`, `[id]/id-photo` (POST, DELETE), `[id]/email` |
| Pages | `next-app/src/app/[locale]/admin/buy-receipts/` — `page.tsx`, `log/`, `[id]/`, `station/` |
| The paper (edit + print) | `components/admin/buy-receipts/BuyReceiptSheet.tsx` + `buy-receipt-sheet-css.ts` |
| Printing in place | `components/admin/buy-receipts/BuyReceiptPrintHost.tsx` (`useReceiptPrinter`) |
| Print set, send, print here, "did it print?" | `components/admin/buy-receipts/ReceiptPrintControls.tsx` |
| Form / receipt page / log | `BuyReceiptForm.tsx`, `BuyReceiptDetail.tsx`, `BuyReceiptLog.tsx` |
| Webcam + photo strip | `IdPhotoCapture.tsx`, `IdPhotoField.tsx` |
| Browser calls, signed links, print-sized photo | `buy-receipt-client.ts` |
| Station | `PrintStation.tsx` |
| Gate + page frame + tabs | `BuyReceiptsShell.tsx`, `BuyReceiptTabs.tsx` |
| Image wait shared with the order invoice | `next-app/src/lib/print-images.ts` |

## Rules worth keeping

- ⛔ Anything printed from the hidden holder that needs a web font must call
  `ensureSignatureFont()` (or the same pattern) before `print()`: a hidden
  element never fetches a font, and printing does not wait for one. The
  owner's first signature printed in a plain face because of this (2026-09-30).
- ⛔ Responsive CSS on the paper is `@media screen and (…)` only. A print dialog
  that applies its own margins makes the page about 740 px wide; an unqualified
  `max-width` rule then restyles the PRINTOUT (stacked header, a second page —
  the owner's first print, 2026-09-30). The printed sheet is `width: 100%` and
  drops its own padding when the page box is narrower than Letter.
- Check print output by rendering the real PDF, with margins 0 AND with 0.4 in
  browser margins. An emulated-print screenshot shows neither.
- ⛔ `@page { margin: 0 }` on the print host is deliberate. With any page
  margin Chrome prints its own header and footer (date, title, web address),
  and the kiosk print has no dialog to switch them off. The paper's own
  half-inch padding is the margin.
- ⛔ All paper CSS is scoped under `.buy-receipt-sheet`. The form shows the
  paper inside the normal admin page, so it must not style `body` or `header`.
- ⛔ No `requestAnimationFrame` in the print path, and the station's clock is a
  Web Worker. A covered or minimised window stops painting and slows page
  timers to once a minute.
- ⛔ The station must call `supabase.auth.getSession()` before its first query,
  or the query goes out as `anon` and RLS answers "nothing" forever.
- The ID photo is handed to the printer as a print-sized JPEG held in memory
  (`printableIdPhoto`). A stored WebP printed as-is goes into the print job as
  raw pixels: a 1600 px photo made a 4.3 MB job; the JPEG is a few hundred KB.
- PostgREST cannot compare two columns, so "requested after it last printed"
  is decided in the browser (`isPrintPending`) and the station clears
  `print_requested_at` when it finishes.

## Verification (2026-09-30)

Done:

- `npx tsc --noEmit` 0 · `npm run lint` 0 errors (3 older warnings in
  `TextDealsManager.tsx`) · `npm run test` 1591/1591 (42 new) · `npm run build` 0.
- Signed out, dev server: the four pages answer 307 to sign-in (also `/es/…`),
  the six routes answer 401, the home page sends
  `Permissions-Policy: camera=(self), microphone=(self), …`.
- The paper, on a temporary preview page (deleted afterwards): section titles
  15 px / 600 / near-black, labels 10.5 px muted; Notes 30 px growing to 50 px
  with a long note; Check reveals and focuses the check-number field; split
  payments show the red/green line; every validation message fires; Save
  reaches the API.
- Real print output, headless Chrome (`Page.printToPDF`, zero margins): the
  plain copy and the with-ID copy are each **one Letter page**; in print layout
  the only visible child of `<body>` is the print host; "2 plain + 1 with ID"
  calls `print()` three times in that order; with no print running an ordinary
  Ctrl+P is untouched.

Not verified — needs the owner (admin login, a camera, the printer):

1. Saving a receipt (the table does not exist until the SQL is run).
2. The webcam capture on the laptop, and the photo upload.
3. The station: choosing the PC, a receipt sent from the laptop printing by
   itself, two copies, the file copy with the ID.
4. Silent printing through the shortcut on the real printer, and that no web
   address prints in the margins.
