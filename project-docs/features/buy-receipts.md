# Feature: Buy Receipts (Admin)

> Status: **DEPLOYED 2026-09-30** (SQL run and pushed by the owner; signed-out
> checks pass on production). Everything behind the admin login (saving, the webcam,
> the photo upload, the print station's live loop, the real printer) is
> **unverified until the owner's first use** — see *Verification* at the end.
> 2026-10-03: the desktop shortcut text was one character too long for Windows
> — fixed (short address `/admin/station`; the old cut-off shortcut is
> forwarded too). Same day: **Cash App and PayPal** added to "Paid by", and a
> **Delete** button on every Log row (see *Deleting*). Deployed the same
> afternoon (owner: "pushed and deployed, verified live"); no SQL.
> 2026-10-03, later: **Customer input mode** — one optional button on the New
> receipt form that hands the tablet to the seller on a locked screen (see
> *Customer input mode*). BUILT + gated + STAGED, awaiting the push; no SQL, no
> env vars. ⛔ Not yet tried with a real sign-in or on the real iPad.

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
- **Paid by**: Cash, Check (asks for the check number), Zelle, Venmo, Cash App,
  PayPal, Bank transfer, Store credit / trade (Cash App and PayPal added
  2026-10-03; the list is `BUY_RECEIPT_PAYMENT_METHODS`, and the database
  keeps payments as a free list, so a new method needs no SQL). The **+**
  button adds another method for a split payment; with two or more, each gets
  an amount and they must add up to the total.
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

## Label placement

Field labels sit **under** their line, on the form and on every printed copy
(owner, 2026-10-01); the items table keeps its column headings on top. The
email box is a short **Email copy** on the same line as the *Email (optional)*
label (screen only).

## The Log keeps itself current

A row tagged **Waiting for the desktop** is watched: the Log re-reads just the
waiting rows from Supabase (every 3 s for two minutes, then every 15 s, up to
half an hour; immediately when the tab comes back to the front) and the tag
changes to *Printed ×N* without a refresh. Nothing is read while no row is
waiting or while the tab is hidden. Code: `BuyReceiptLog.tsx` (the watch),
`pendingReceiptIds` / `mergeFreshReceipts` in `src/lib/buy-receipts.ts`.

## Emailing the seller their copy

Under the Email field: **Email a copy to the seller when saved** (greyed out
until an email is typed). The seller's copy goes out through Resend as the
receipt is saved — a light, compact receipt (small octopus logo, one details
list, "Items purchased by Naples Estate Jewelry", the statement in the third
person — "The seller certifies…" — Paid by and Total on one bold line,
"Received by:" above the owner's printed signature, which shares one underline
with the date, and a three-line centred footer), **never the ID photo**. The
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

## Customer input mode (2026-10-03)

Owner: *"i want to be able to enter a 'customer input mode' on the buy receipt
input… show the customer entry fields only… lock the screen to be
unscrollable, especially on tablet mode… a 'save' button at the bottom… if
they try to save without filling out all fields it flags the unfinished field…
a button to submit unfinished but asks them to hand back to admin for override
code… the goal is an unscrollable form where they cant access other parts of
the website back end."* Then, after two mockups: *"make sure the buy receipt
form stays as it is in production now… the customer input mode is optional…
allow us to stay on the normal input form if we want to… keep the date of birth
with the admin like the ID… the only change we should see to the page is the
new button."*

### What it is

**The form is unchanged and still fills in everything by itself.** The one new
thing on the page is a small **Customer input mode** button at the right end
of the tabs row (New receipt · Log · Print station). Ignore it and nothing is
different. Tap it and the tablet shows the **seller** a locked screen with only
their own contact boxes; when it comes back, the form simply has those details
in it.

1. (Optional) type whatever you like on the form first — items, prices, the ID
   part. It all stays.
2. Tap **Customer input mode**. The button says *Locking…* for a moment: the
   server locks the browser first (below). If that fails, a red line says the
   tablet is **not** locked and must not be handed over.
3. Hand the tablet over. The seller sees **Your information** with seven
   boxes: first and last name · phone · street address · city · state (starts
   as `FL`) · ZIP · email *(optional)*. **No ID type, no ID last 4, no date of
   birth, no ID photo, no items, no prices** — those stay on the form for the
   owner.
4. **Save** at the bottom.
   - Something unfinished: each such box turns red with a short reason beside
     its label (*Needed*, *Add your last name*, *10 digits*, *2 letters*,
     *5 digits*, *Check this*), the bar says *Please finish the N highlighted
     boxes*, and only now a **Submit unfinished** button appears. It asks to
     hand the tablet to staff and needs the staff code. It disappears again
     once every box is right.
   - Everything finished: the screen locks on **Thank you, <first name>.
     Please hand this tablet back to our staff.** → **Staff: unlock** → the
     staff code.
5. A small **Staff** button (bottom left) leaves the mode at any time — with
   the staff code. What was typed is kept.
6. Back on the form, the seller's boxes are filled in. Add the ID part, the
   items and the payment (if not already there), and save as always.

**Email is optional.** An empty email is never flagged; a half-typed one is.
Once an email is typed, two small boxes appear beside it, both unticked:
**Email me a copy of my receipt** (ticks the form's own *Email copy* box) and
**Add me to the mailing list**. Clearing the email hides and unticks both.

**What the form shows afterwards.** Nothing, unless there is something to act
on — the owner's ruling is that the button is the only change to the page. A
line above the sheet appears for exactly two things: the seller **asked for
something** (*"The customer asked to join the mailing list — they are added
when you save the receipt."*), or the form came back **unfinished**
(*"Submitted unfinished with the staff code. Still to finish: Name, City,
ZIP."*). The unfinished list shrinks as the owner completes the boxes and the
line leaves with the last one. It also goes with **Clear** and with a saved
receipt.

**Typing helpers.** The phone formats itself as digits are typed
(`(239) 404-8505`; a leading `1` is dropped), the state is upper-cased, the
ZIP keeps its digits (ZIP+4 gets its dash), Return steps to the next box and
closes the keyboard after the last. A box passes on the seller's screen only
if the receipt's own validator would accept it too, so a seller's "Save" never
hands back a form that then refuses to save.

### The mailing list

The seller's email joins the **same list as the homepage's "Join the List"**
(`homepage_subscribers`, through the same `subscribe_homepage_v2` function),
marked `buy_receipt` — the Subscribers page shows those as **Buy receipt**.
It happens **when the owner saves the receipt**, not when the seller taps Save,
so an email corrected on the form is the one that joins. Email only — never a
text sign-up (that needs its own consent wording and a "reply YES"). The saved
panel then shows *Mailing list: Added*, or says it could not be added (the
receipt is saved either way). If the receipt is never saved, nobody is added;
add them by hand under Subscribers.

### The staff code

One code for all three staff actions (submit unfinished, unlock after Save,
the Staff button). ⛔ **It lives in exactly one place:
`next-app/src/lib/buy-receipt-staff-code.ts`.** The tablet sends the digits to
the server, which checks them, so the code is never inside the page the seller
is holding. To change it, change that one line and deploy. Five tries per half
minute (per signed-in admin); after that the keypad pauses for half a minute,
and the server refuses even the right code until the pause is over.

### How it is locked

The owner's goal is that a seller holding a signed-in admin tablet cannot reach
the back end. Covering the page is not enough — anyone can type an address — so
the lock is on the **server**:

- **A cookie.** Starting the mode sets `nej_customer_mode` on that browser
  (HttpOnly — page scripts cannot clear it; 12 hours, so a tablet nobody
  unlocked frees itself overnight). Only the staff code removes it.
- **Pages.** While the cookie is there, `src/proxy.ts` sends **every admin page
  and every account page** on that browser back to the New receipt page, which
  opens straight into the seller's screen. The only two it lets through are
  that page and the sign-in page (so an ended sign-in can be renewed).
  ⛔ `/account/security` and `/account/reset-password` are bounced on purpose:
  both can change the signed-in password without asking for the old one.
- **Admin API calls.** `requireAdmin()` answers **423** to a locked browser, so
  typing an API address shows nothing either. Only the mode's own route
  (`api/admin/buy-receipts/customer-mode`) is exempt.
- **Other tabs.** A tab that was already open on an admin or account page asks
  the server for nothing, so the server cannot refuse it. `CustomerModeTabGuard`
  (on every admin page through the admin menu, and on every account page) hears
  the mode start, asks the server whether the lock is real, and if so hides the
  page and goes to the New receipt page. A stale note is simply deleted.
- **The screen itself.** It is the only thing displayed (every other part of
  the page is `display: none`, so there is nothing to scroll to or tab to), it
  is sized to the part of the screen the keyboard leaves visible, a finger
  dragged across it moves nothing, the Back button stays on it, and a refresh
  comes back to it with everything typed (kept in that tab's session storage
  and wiped when the mode ends).
- **Every other computer is unaffected.** The lock is per browser: the Print
  Station, the laptop and the phone never notice it.

⛔ **What a web page cannot do:** remove the browser's own bar. A seller can
still open a different website or another app — just not this site's back end.
The iPad's own **Guided Access** closes that (next section).

### One-time iPad setup: Guided Access (optional, recommended)

Guided Access pins the iPad to one app and can switch off parts of the screen.

Once:

1. **Settings → Accessibility → Guided Access** → turn it **on**.
2. **Passcode Settings → Set Guided Access Passcode** — a code only staff
   know. (Face ID / Touch ID can be allowed to end a session too.)

Each time (after tapping **Customer input mode**, before handing over):

1. **Triple-click the top button** (the Home button on an iPad that has one).
2. On the setup screen, **draw a circle around the browser's bar at the top**
   so it stops answering touches.
3. **Options** (bottom left): leave **Touch** and **Keyboards** **ON** — with
   Keyboards off, the seller cannot type at all.
4. Tap **Start**.

To end: triple-click the top button, enter the Guided Access passcode, tap
**End**. Then unlock the customer screen with the staff code as usual.

### If something goes wrong

| What you see | What to do |
|---|---|
| The tablet shows the customer screen and you want out | **Staff** (bottom left) → the staff code. |
| "Too many tries. Wait half a minute…" | Wait 30 seconds; the keypad comes back by itself. |
| "The sign-in on this device has ended. Sign in again…" | Tap **Sign in** in that message, sign in, enter the code. Nothing typed is lost. |
| Every admin page on the tablet jumps to Buy Receipts | The tablet is still locked. Open Buy Receipts → the staff code. It also frees itself after 12 hours. |
| Another tab shows a blank customer screen | That tab stepped aside when the mode started. Enter the code there, or just reload it once the tablet is unlocked. |
| A red line: "The tablet is not locked — do not hand it over yet" | The lock could not be set (no connection). Try the button again. |

### Code

| Piece | File |
|---|---|
| The lock: cookie name, what a locked browser may open, limits (⛔ no imports — the proxy loads it on every request) | `next-app/src/lib/customer-mode-lock.ts` |
| The seven boxes, their rules, typing helpers, the hand-back line, the stored snapshot (pure) | `next-app/src/lib/buy-receipt-customer-mode.ts` |
| ⛔ The staff code (server-only, the ONE place) | `next-app/src/lib/buy-receipt-staff-code.ts` |
| Mailing-list sign-up (server-only; the feature's only service-role call, never on `buy_receipts`) | `next-app/src/lib/buy-receipt-mailing-list.ts` |
| Start / end / "am I locked?" | `next-app/src/app/api/admin/buy-receipts/customer-mode/route.ts` |
| The 423 for a locked browser | `next-app/src/lib/admin-auth.ts` |
| The page bounce | `next-app/src/proxy.ts` (`customerModeRedirect`) |
| The seller's screen + its styles | `components/admin/buy-receipts/BuyReceiptCustomerMode.tsx`, `buy-receipt-customer-css.ts` |
| The button, the hand-over, the line afterwards | `components/admin/buy-receipts/BuyReceiptForm.tsx` |
| Other tabs step aside | `components/admin/buy-receipts/CustomerModeTabGuard.tsx` — the hook `useCustomerModeTabGuard()` is called by `components/admin/AdminHeader.tsx` (every admin page with the menu); the component is rendered by the two admin pages with no menu (`admin/orders/[id]/print/page.tsx`, `…/invoice/page.tsx`) and by `app/[locale]/account/layout.tsx` (every account page). ⛔ There is no `app/[locale]/admin/layout.tsx` and there must not be one (`STRUCTURE.md` → *Phone listing editor*); a test fails if an admin page has neither the menu nor the guard |
| "Try counter" that can tell *limited* from *unreachable* | `rateLimitState` in `next-app/src/lib/rate-limit.ts` |
| Tests | `lib/__tests__/buy-receipt-customer-mode.test.ts` (38), `api/admin/buy-receipts/customer-mode/route.test.ts` (8), `lib/__tests__/admin-auth.test.ts` (5), plus 2 in `rate-limit.test.ts` |

### ⛔ Rules for this mode

- **The form is not to change.** `BuyReceiptSheet.tsx` knows nothing about the
  mode (a test checks it never mentions it). Anything the mode needs goes
  around the sheet, never into it.
- **Seven boxes.** Never add ID type, ID last 4, date of birth, the ID photo,
  items or money to the seller's screen (owner: *"i will do the ID stuff"*,
  *"keep the date of birth with the admin like the ID"*).
- **Lock first, show second.** `enterCustomerMode` awaits the server before the
  screen appears. A screen without the server lock is a curtain, not a lock.
- **The code stays on the server, in one file.** Never compare it in the
  browser, never put it in a client component, never in a second place.
- **Every admin route that answers a typed address (GET) must go through
  `requireAdmin()`** — that is what refuses a locked browser. The twelve routes
  with their own inline check are all POST/DELETE or cron-secret routes; a new
  GET route written that way would be readable from a locked tablet.
- **`duringCustomerMode: true` belongs to the customer-mode route only.**
- **Never let the bounce target be a guarded page**, and never send a locked
  non-admin to `/account` (`requireBuyReceiptsAdmin` sends them home instead) —
  either is an endless redirect.
- **No `dvh`** on the screen (`viewport-units.test.ts`): the component sets the
  height from the visible viewport before the first paint.
- **A new admin page must show the admin menu (or render `<CustomerModeTabGuard />`).**
  That is how a tab already open on it learns to step aside. ⛔ Not through an
  admin `layout.tsx` — that file is forbidden (`STRUCTURE.md` → *Phone listing
  editor*); the first build of this mode used one and it was taken out.
- The two login-free preview pages used for checking (`[locale]/zz-customer-mode-preview`,
  `[locale]/admin/zz-guard-preview`) must never be deployed; a test fails while
  either exists.

### Verification (2026-10-03)

Done:

- `npx tsc --noEmit` 0 · `npm run lint` 0 errors (3 older warnings) ·
  `npx vitest run` **1704/1704** (159 files; 53 new) · `npm run build` 0, the
  same 88 prerendered pages as before.
- **Dev server, signed out, with and without the lock cookie (curl):** with it,
  `/admin`, `/admin/orders`, `/admin/buy-receipts/log`, `/account`,
  `/account/security`, `/account/reset-password` and `/es/admin/orders` all
  answer 307 to the New receipt page (language kept); that page, the sign-in
  page and the public site load; without it every answer is what it was before.
  The mode's route answers 401 to a signed-out caller on all three methods.
- **The real components in headless Chrome** (a temporary login-free copy of
  the page whose two server calls were answered by the test; deleted
  afterwards) — **108/108**: the form takes typing in all ten seller boxes by
  itself; the button is on the tabs row and makes it no taller, the sheet sits
  where it did; lock-then-show; the seller's screen never mentions ID, birth,
  items or money; flags, reasons and "Submit unfinished"; wrong code, pause,
  ended sign-in, the laptop keyboard on the keypad; Thank-you; Back pressed
  repeatedly; a real reload while locked, then unlock with no second reload;
  the two small boxes; the mailing-list request on the save call and only
  then; a plain hand-over leaves no line and the sheet 20 px under the tabs;
  nothing scrolls and every box and Save are in view at 1024×694, 1024×296
  (keyboard), 768×950, 768×620 (keyboard), 1133×670, 1133×270 (keyboard),
  1366×650; a phone (390×760) scrolls only its form area.
- **Touch emulation — 11/11:** taps reach every control; a finger dragged
  across the screen or the bottom bar moves nothing; a finger inside a box is
  left alone; boxes are 16 px.
- **Two real tabs of one browser — 11/11:** starting the mode in one tab makes
  an admin tab and an account tab leave by themselves; the sign-in page and the
  public site are untouched; a stale note heals; an unclear answer keeps the
  admin page hidden.

Not verified — needs the owner:

1. **With a real admin sign-in:** the button actually setting the lock, a typed
   admin address landing back on the customer screen, the staff code unlocking,
   a saved receipt adding the seller to the mailing list (Subscribers → *Buy
   receipt*).
2. **On the real iPad in Safari** (a desktop browser cannot prove WebKit's
   keyboard and touch behaviour — `DECISIONS.md` → *"Admin on a phone
   (2026-09-02)"*): the boxes and Save stay above the keyboard both ways up;
   nothing drags or bounces; Safari offers no previous seller's details;
   Guided Access as described. ⛔ Try it once yourself before handing it to a
   seller. If anything is off, simply do not use the button — the form itself
   is unchanged.

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
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="%LOCALAPPDATA%\NEJStation" --kiosk-printing --disable-backgrounding-occluded-windows --disable-background-timer-throttling --app=https://naplesestatejewelry.com/admin/station
   ```

   (`/admin/station` is a short address that forwards to
   `/admin/buy-receipts/station` — see the length note below. The station page
   shows this same text with a Copy button.)

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
- **247 characters. Windows keeps 259 of a shortcut target and silently drops
  the rest.** With the full station address the text was 260, so Windows cut
  the final "n" and the shortcut opened `…/buy-receipts/statio` — a dead page
  (owner, 2026-10-03; the "253" written here on 09-30 was a miscount). Fixed
  two ways: the shortcut now opens the short address `/admin/station`, and
  both `/admin/station` and the cut-off `/admin/buy-receipts/statio` forward to
  the station (`lib/legacy-redirects.ts`), so **the shortcut made on 09-30
  works as it is — it does not need to be re-made.** The text is built by
  `stationShortcutTarget` in `lib/buy-receipts.ts`; its length is pinned in
  `lib/__tests__/buy-receipts.test.ts`, so it is counted by the test, never by
  hand.
- ⛔ `%LOCALAPPDATA%\NEJStation` must stay as it is: the station's sign-in and
  its "this computer is the print station" choice live in that Chrome profile.
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

## Deleting (2026-10-03)

The Log has a red trash-can button on every row (owner: *"add a 'delete' option
to the log of receipts"*). It is for **test and mistaken entries**; a real
purchase that was reversed should be **voided**, which keeps the record.

- It always asks first, in the same pop-up window Void uses: seller, date and
  total, "cannot be undone", "the number will not be used again", and a line
  pointing to Void. Buttons **Keep it** / **Delete this receipt**.
- Delete is permanent and works on recorded **and** void receipts. The row
  goes, and so does the seller's ID photo.
- ⛔ **The ID photo is removed FIRST** (`DELETE /api/admin/buy-receipts/[id]`).
  The private bucket has no garbage collector, so a photo whose row is gone
  would stay there for ever. If the photo cannot be removed, nothing is
  deleted. The receipt's whole folder (`receipts/<id>/`) is cleared, not just
  the path on the row.
- No SQL was needed: the table already grants DELETE to `authenticated` behind
  the admin-only policy, `duplicated_from` is `on delete set null` (a copy made
  from a deleted receipt simply loses its "duplicated from" link), and the guard
  trigger only watches updates.
- A receipt deleted while it waits for the desktop is simply never printed: the
  station finds no request.
- The only trace is one line in the server log (`[buy-receipts] deleted
  BUY-000NN by <email>`). There is no recycle bin for receipts.
- The button is an icon, not the word, because a fourth worded button made the
  row too wide for an iPad on its side; below 1100 px the table also tightens
  its side padding so all four controls fit (1013 px → 958 px at 1024).

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
| Tests (52) incl. source guards | `next-app/src/lib/__tests__/buy-receipts.test.ts` |
| Routes (eight) | `next-app/src/app/api/admin/buy-receipts/` — `route.ts` (POST, GET), `[id]/route.ts` (GET, PUT, DELETE), `[id]/print-request`, `[id]/printed`, `[id]/void`, `[id]/id-photo` (POST, DELETE), `[id]/email`, `customer-mode` (GET, POST, DELETE — see *Customer input mode → Code*) |
| Pages | `next-app/src/app/[locale]/admin/buy-receipts/` — `page.tsx`, `log/`, `[id]/`, `station/` |
| The paper (edit + print) | `components/admin/buy-receipts/BuyReceiptSheet.tsx` + `buy-receipt-sheet-css.ts` |
| Printing in place | `components/admin/buy-receipts/BuyReceiptPrintHost.tsx` (`useReceiptPrinter`) |
| Print set, send, print here, "did it print?" | `components/admin/buy-receipts/ReceiptPrintControls.tsx` |
| Form / receipt page / log | `BuyReceiptForm.tsx`, `BuyReceiptDetail.tsx`, `BuyReceiptLog.tsx` |
| Webcam + photo strip | `IdPhotoCapture.tsx`, `IdPhotoField.tsx` |
| Browser calls, signed links, print-sized photo | `buy-receipt-client.ts` |
| Station | `PrintStation.tsx` |
| Gate + page frame + tabs | `BuyReceiptsShell.tsx`, `BuyReceiptTabs.tsx` — on the New receipt page the FORM draws the tabs (`showTabs={false}` on the shell) so its Customer input mode button can sit at the end of their row; Log, station and the receipt page keep the shell's tabs |
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
