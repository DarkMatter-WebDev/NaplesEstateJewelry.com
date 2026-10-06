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
> *Customer input mode*). **DEPLOYED** that evening (owner: "pushed and
> deployed, manually verified in production"); no SQL, no env vars.
> 2026-10-03, night — 🟢 **DEPLOYED** (owner, ~10 PM: "pushed and deployed";
> `TASKS.md` 2026-10-03 (8), `CHANGELOG.md` 2026-10-03 (10)–(11)): a **"Mailing
> list" box beside "Email copy"** on the form (the Email box is one column
> wider, the Name box one narrower — the owner's "layout B"), and **customer
> input mode is now the form itself** — the same paper locked to the screen,
> with everything except the seller's seven boxes greyed out and switched off
> — instead of its own big-box screen. No SQL, no env vars. The *Customer
> input mode* section below describes this build. ⚠️ Deployed on the owner's
> word; not yet reported as tried on the iPad, behind the real sign-in, or on
> paper — see *Verification — the same-form build*.

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
new button."* Then, after using it live (2026-10-03 evening): *"Add the add to
mailing list checkbox near the email to the regular form too. And let's adjust
the customer input form so that it looks exactly like the regular form but just
locks to the full screen of the tablet or the computer we're viewing it on. And
most of the other fields are grayed out."* On the mockup: *"use layout b"* ·
may the customer see the greyed parts, items and amounts included — *"yes"* ·
*"make the grey-out a little stronger so its very obvious which fields they
need to input"*.

### What it is

**The form still fills in everything by itself.** On the page there is a small
**Customer input mode** button at the right end of the tabs row (New receipt ·
Log · Print station). Ignore it and nothing is different. Tap it and the tablet
shows the **seller** this same form, locked to the whole screen, with only
their own contact boxes switched on; when it comes back, the form simply has
those details in it.

1. (Optional) type whatever you like on the form first — items, prices, the ID
   part. It all stays (and the seller will see it, greyed).
2. Tap **Customer input mode**. The button says *Locking…* for a moment: the
   server locks the browser first (below). If that fails, a red line says the
   tablet is **not** locked and must not be handed over.
3. Hand the tablet over. The seller sees **the receipt form itself** — the
   letterhead, "Seller", the same boxes with their labels underneath — filling
   the screen. The admin menu, the page title, the tabs and the form's own
   buttons are gone. **Seven boxes can be used**: name · phone · email
   *(optional)* · street · city · state (starts as `FL`) · ZIP — plus the two
   small boxes on the Email line. **Everything else is greyed out and cannot be
   touched**: ID type, ID last 4, date of birth, the ID photo strip, the items,
   the total, how it was paid, the notes, the signatures. The seller can *see*
   those parts (owner: yes — it is their own sale); they cannot change them.
   The page does not scroll: the seller's boxes are at the top of the paper and
   the rest runs off the bottom behind the bar.
4. The bar at the bottom says *Please fill in the boxes under "Seller", then
   tap Save.* and holds **Save**.
   - Something unfinished: each such box gets a red line and a pale red fill;
     an empty one says **Needed** inside itself; one that is filled in but not
     right gets the reason beside its label (*NAME — add your last name*,
     *PHONE — 10 digits*, *ZIP — 5 digits*, *— check this*). State and Email
     have no room for words beside their labels: the red line and red label say
     it. Nothing on the paper changes size. The bar turns to *Please finish the
     highlighted boxes*, and only now a **Submit unfinished** button appears.
     It asks to hand the tablet to staff and needs the staff code. A flag
     leaves its box as soon as the seller starts fixing it; the button goes
     once every box is right.
   - Everything finished: the screen locks on **Thank you, <first name>.
     Please hand this tablet back to our staff.** → **Staff: unlock** → the
     staff code.
5. A small **Staff** button (bottom left) leaves the mode at any time — with
   the staff code. What was typed is kept.
6. Back on the form, the seller's boxes are filled in. Add the ID part, the
   items and the payment (if not already there), and save as always.

**Email is optional.** An empty email is never flagged; a half-typed one is.
The two small boxes on the Email line — **Email copy** and **Mailing list** —
are the form's own; in the seller's view the seller can tick them. They are
greyed until an email is typed, both start unticked, and emptying the email in
the seller's view unticks both.

**How faint the greyed parts are** is one number, `BUY_RECEIPT_CUSTOMER_DIM`
in `buy-receipt-sheet-css.ts` (0.22; the mockup had 0.36 and the owner asked
for stronger). Smaller = fainter.

**With the tablet's keyboard up.** Upright, and on a computer, everything
already fits. Sideways, the keyboard takes more than half the screen, so the
paper slides up just far enough (about 49 px on a 10-inch iPad) to keep the
"Seller" heading, all seven boxes and the bar with Save above the keys; it
slides back when the keyboard goes. On a phone the seven boxes stack and
cannot all fit above a keyboard: there, and only there, the page may be moved
with a finger — and the paper ends right after the last seller box.

**What the form shows afterwards.** Nothing, unless boxes were left
unfinished: then one line above the sheet says *"Submitted unfinished with the
staff code. Still to finish: Name, City, ZIP."* The list shrinks as the owner
completes the boxes and the line leaves with the last one. It also goes with
**Clear** and with a saved receipt. (What the seller asked for needs no line:
the ticks are on the form itself.)

**Typing helpers.** The phone formats itself as digits are typed
(`(239) 404-8505`; a leading `1` is dropped), the state is upper-cased, the
ZIP keeps its digits (ZIP+4 gets its dash), Return steps to the next box in
the paper's order (name → phone → email → street → city → state → ZIP) and
closes the keyboard after the last. A box passes in the seller's view only if
the receipt's own validator would accept it too, so a seller's "Save" never
hands back a form that then refuses to save.

### The mailing list

**"Mailing list" is a small box on the form, beside "Email copy"** (owner,
2026-10-03). Tick it — you on the form, or the seller in customer input mode —
and the seller's email joins the **same list as the homepage's "Join the
List"** (`homepage_subscribers`, through the same `subscribe_homepage_v2`
function), marked `buy_receipt` — the Subscribers page shows those as **Buy
receipt**. It happens **when the owner saves the receipt**, not when the box
is ticked or the seller taps Save, so an email corrected on the form is the
one that joins. Email only — never a text sign-up (that needs its own consent
wording and a "reply YES"). The saved panel then shows *Mailing list: Added*,
or says it could not be added (the receipt is saved either way). If the
receipt is never saved, nobody is added; add them by hand under Subscribers.
Like "Email copy", the box is greyed until an email is typed, is never
printed, and resets with **Clear**.

**Where it sits ("layout B").** The Email label's line was already full, so on
the form the Email box is **one column wider and the Name box one narrower**
(Name 4 · Phone 3 · Email 5 of 12) and the line reads *Email (optional)* ·
*Email copy* · *Mailing list*. When the Email box is narrower than about
270 px (a tablet held upright), the word *(optional)* leaves the label in
place — nothing stacks or moves. Below 761 px the form's two narrower layouts
are the ones from before. ⛔ The **printed paper is unchanged**: it has no
small boxes and keeps Name 5 · Phone 3 · Email 4. The edit view of a saved
receipt uses the same widths as the form but has no small boxes.

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
- **The paper on it.** It is the form's own paper, drawn a second time by the
  same component on the same draft. The owner's parts are switched off three
  ways at once — `disabled` controls (the three ID boxes one by one, everything
  below them inside one disabled `fieldset`), `inert`, and `pointer-events:
  none` — so no tap, no Tab key and no "next field" arrow on a tablet keyboard
  reaches them. The paper area is clipped (`overflow: clip`), which is not a
  scroller at all: nothing can move it except the measured keyboard slide.
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
| The seven boxes (in the paper's order), their rules, typing helpers, what a flag says and where (`customerFlagPlaceholder`, `customerFlagNote`), the hand-back line, the stored snapshot (pure) | `next-app/src/lib/buy-receipt-customer-mode.ts` |
| ⛔ The staff code (server-only, the ONE place) | `next-app/src/lib/buy-receipt-staff-code.ts` |
| Mailing-list sign-up (server-only; the feature's only service-role call, never on `buy_receipts`) | `next-app/src/lib/buy-receipt-mailing-list.ts` |
| Start / end / "am I locked?" | `next-app/src/app/api/admin/buy-receipts/customer-mode/route.ts` |
| The 423 for a locked browser | `next-app/src/lib/admin-auth.ts` |
| The page bounce | `next-app/src/proxy.ts` (`customerModeRedirect`) |
| The locked screen: the frame around the paper — page lock, Back trap, the bar (Staff · message · Submit unfinished · Save), where the paper sits (keyboard slide, phone scroll), keypad, Thank-you — and its styles | `components/admin/buy-receipts/BuyReceiptCustomerMode.tsx`, `buy-receipt-customer-css.ts` |
| The paper's **seller's view**: the `customer` prop (`BuyReceiptCustomerView`), `seat()` on the seven boxes, `why()` beside their labels, `off` / `brs-off` on the owner's parts, `ownerPart` inside a disabled `fieldset` | `components/admin/buy-receipts/BuyReceiptSheet.tsx` |
| How the seller's view LOOKS (the fade `BUY_RECEIPT_CUSTOMER_DIM`, a flagged box), the "Mailing list" box, layout B, the `(optional)` container rule | `components/admin/buy-receipts/buy-receipt-sheet-css.ts` |
| The button, the hand-over, the ONE `sheet()` function that draws the paper for the form and for the locked screen, the line afterwards | `components/admin/buy-receipts/BuyReceiptForm.tsx` |
| Other tabs step aside | `components/admin/buy-receipts/CustomerModeTabGuard.tsx` — the hook `useCustomerModeTabGuard()` is called by `components/admin/AdminHeader.tsx` (every admin page with the menu); the component is rendered by the two admin pages with no menu (`admin/orders/[id]/print/page.tsx`, `…/invoice/page.tsx`) and by `app/[locale]/account/layout.tsx` (every account page). ⛔ There is no `app/[locale]/admin/layout.tsx` and there must not be one (`STRUCTURE.md` → *Phone listing editor*); a test fails if an admin page has neither the menu nor the guard |
| "Try counter" that can tell *limited* from *unreachable* | `rateLimitState` in `next-app/src/lib/rate-limit.ts` |
| Tests | `lib/__tests__/buy-receipt-customer-mode.test.ts` (44), `api/admin/buy-receipts/customer-mode/route.test.ts` (8), `lib/__tests__/admin-auth.test.ts` (5), plus 2 in `rate-limit.test.ts` |

### ⛔ Rules for this mode

- **One paper.** The seller's view is `BuyReceiptSheet` itself with the
  `customer` prop — never a second form that imitates it. The form draws the
  paper through one `sheet()` function and hands that same function to the
  locked screen, so the two cannot drift apart.
- **The owner's form is drawn exactly as before.** Everything the seller's view
  adds comes from three helpers in the sheet (`seat`, `why`, `off`) that give
  nothing without the `customer` prop, and the owner's part is drawn bare — no
  wrapper, no extra element (tests check all of it). Only the locked screen
  passes `customer`; the edit view of a saved receipt never does.
  *(This replaces the first build's rule "the paper knows nothing about the
  mode": the owner asked for the customer's screen to BE the form.)*
- **Seven boxes switched on.** ID type, ID last 4, date of birth, the ID photo,
  items and money are the owner's (*"i will do the ID stuff"*, *"keep the date
  of birth with the admin like the ID"*): the seller may see them greyed, and
  must never be able to change them. A new field on the paper goes inside
  `ownerPart` (or gets `disabled={off}`) unless the owner says it is the
  seller's.
- **The frame does not style the paper.** `buy-receipt-customer-css.ts` has no
  rule that reaches into the sheet; how the paper looks in the seller's view
  lives in `buy-receipt-sheet-css.ts`, on classes and attributes that only
  that view adds.
- **The paper area is clipped, never a scroller** (`overflow: clip` on
  `.brc-page`, and on the cut paper in the phone layout). As a scroller, a
  browser bringing a focused box into view moves the paper — found in testing:
  the cut paper slid inside its own frame and showed the greyed rows. The
  keyboard slide is worked out from layout offsets (`offsetTop`), never from
  the position of a box that is already moved.
- ⛔ **A class name on the paper must be new.** `.brs-name` is the letterhead's
  business name (headline type, 21 px, gold); the Name box was given that class
  for a moment and was set in the wrong face. The two layout-B cells are
  `brs-cell-name` / `brs-cell-email`.
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

### Verification — the same-form build and the "Mailing list" box (2026-10-03, night)

🟢 **DEPLOYED 2026-10-03 ~10 PM** (owner: *"pushed and deployed"*). Claude did
not check production (not asked to). Done before the push:

- `npx tsc --noEmit` 0 · `npm run lint` 0 errors (3 older warnings) ·
  `npx vitest run` **1710/1710** (159 files; 6 more than before) ·
  `npm run build` 0, the same 88 prerendered pages, no preview page in the build.
- **The real components in headless Chrome** (a temporary login-free copy of
  the page, its server calls answered by the page itself with a test code;
  deleted afterwards) — **77/77 with a mouse, and 77/77 again as a touch
  tablet** (16 px typing, no scrollbar gutter):
  - *The form:* built as before — same parts in the same order, no wrapper,
    nothing switched off, the same type in every box; Name 231 px · Phone
    170 px · Email 292 px on a sideways tablet and a computer; the label and
    both small boxes share one line at 1024, 768, 1366, 700 and 390 px wide
    (need 264 px of 292 sideways; upright *(optional)* gives way: 198 of
    239–246); under 761 px the rows are the old ones; both boxes greyed until
    an email is typed; a save sends `mailingList: true`; Clear resets them.
  - *The seller's view:* fills the screen exactly, admin page gone, nothing
    scrolls; the same paper with the same box widths; exactly seven boxes on,
    in the paper's order; the three ID boxes and everything below faded to
    0.22, `disabled`, `inert`, untouchable; a wheel or a tap on a greyed box
    does nothing; phone, state and ZIP format as typed; Return steps through
    the seven and lets go; flags (red line, "Needed" inside, reasons beside
    labels, one line, no change of size); a flag leaves on the first
    keystroke; Thank-you; wrong code refused; the right code brings the form
    back with the details and both ticks; the unfinished path and its line;
    emptying the email unticks both boxes; a reload while locked comes back
    with what was typed; Back stays; the Staff button.
  - *Sizes:* sideways tablet with a keyboard (296 px left) — slide 49 px,
    heading at 100, boxes 134–236, bar from 243; upright with and without a
    keyboard — no slide; computer; phone 390×664 — all seven boxes fit with a
    small slide; phone with a keyboard (330 px left) — the page may move, the
    box being typed in comes into view, the paper ends right after ZIP.
- **Two faults found by looking at the screenshots, both fixed and now
  tested:** the Name box was set in the letterhead's typeface (a class-name
  collision, see the rules above); on a phone with the keyboard up the cut
  paper slid inside its own frame and showed greyed rows (it was a scroller;
  now clipped).

**Not checked, and why it matters:**

1. **No real admin sign-in.** The lock, the bounce, the staff code and the
   mailing-list call are the deployed code, untouched by this build — but this
   build was only ever run on the login-free copy.
2. **No real iPad.** Chromium cannot prove Safari's keyboard and touch
   behaviour (`DECISIONS.md` → *"Admin on a phone (2026-09-02)"*). The owner's
   list is in `TASKS.md` 2026-10-03 (8).
3. **No print run.** The printed paper's markup and rules are untouched: the
   build only ADDS style rules, each on a class or attribute that the form or
   the seller's view adds; a test pins the printed Seller rows (Name 5 ·
   Email 4). If a printed copy ever looks different, this is the first place
   to look.

As of the deploy the owner has not reported any of the three back; the
try-out list is `TASKS.md` 2026-10-03 (8), items 2–4.

### Verification (2026-10-03) — the first build (the big-box screen, since replaced)

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

**Verified in production by the owner, 2026-10-03 evening** (*"pushed and
deployed, manually verified in production. Period."*). Claude never checked
these two, and they are listed so the next change knows what only the owner
can confirm:

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

## Seller thumbprint (2026-10-06)

Owner, after buying a SecuGen Hamster Pro 20 reader: *"i want to explore how we
can use the capture on my buyer form without using the api paid software"*;
on the mockup: *"print it on the shops paper copy as well... label it seller
thumbprint.. 1 and 2 mockups look good.."*. 🟡 **Built 2026-10-06, not yet
deployed, and the folder watch has never run on the owner's laptop** (see
*Verification* below).

### Why it works the way it does

- SecuGen's own way for a web page to talk to the reader (**SecuGen WebAPI**,
  a local program the page calls) is free for 60 days and then needs a licence
  key per site address. Not used.
- What IS free: the driver and SecuGen's **Device Diagnostic Utility**
  (`sgdx_v508.exe`, signed by SecuGen; the owner has it on the laptop). Its
  **File → Save Image (BMP)** writes the captured print as a 300 × 400
  greyscale BMP (121 KB) and asks only for a folder and a file name. It has no
  "save automatically" setting, and it asks Windows for administrator
  permission each time it starts — leave it open for the day.
- So the print comes in as a **file**, and the form **watches the folder** it is
  saved into.

### At the counter (Chrome on the Windows laptop)

1. On the form, under the ID photo strip: **Wait for a print**. The first time
   on a computer, Chrome asks which folder to watch and whether the site may
   change files in it — pick the folder the prints will be saved into and
   allow it. Chrome remembers the folder; after a restart it may ask to allow
   it again.
2. In the SecuGen window: **Init** (once), seller's thumb on the reader,
   **Capture** (or tick *Auto Capture*), then **File → Save Image (BMP)** into
   that folder, any name.
3. The print appears on the strip by itself within a second or two, and the
   saved file is **removed from the folder** (a thumbprint left lying in a
   folder on the laptop helps nobody).

- ⛔ **Only a file saved AFTER the button was pressed is taken.** An older file
  in the folder is the previous seller's print. So: press the button first,
  then save. A print saved before the press is attached with **Choose a file**.
- **Choose a file** does the same by hand (BMP, PNG or JPEG) and is the only
  button on a browser that cannot watch a folder — the iPad, Safari, Firefox.
  A receipt started on the iPad gets its print added afterwards from the
  laptop, on the receipt's own page.
- While waiting, the strip names the folder and has **Change folder** and
  **Stop**. A wait nobody finishes stops by itself after ten minutes.
- Optional, like the ID photo: a receipt saves without one.
- On a new receipt the print is held in the browser until the receipt is saved
  (so an abandoned form leaves nothing in storage); if its upload fails the
  after-save panel says so and offers **Try the thumbprint again**. On a saved
  receipt it uploads at once.
- In customer input mode the strip is part of the owner's greyed, switched-off
  part of the form, like the ID photo strip.

### Where it is kept, and where it is never shown

- ⛔ **Private, exactly like the ID photo:** the same bucket `buy-receipt-ids`,
  in the receipt's own folder (`receipts/<id>/thumbprint-<uuid>.webp`); the row
  stores the **path** (`buy_receipts.seller_thumbprint_path`); shown only
  through a ten-minute signed link.
- ⛔ **Never on the seller's copy, never in the seller's email, never public.**
  The sheet drops it for the seller's copy even when it is handed the picture;
  the email builder never reads the column (a test checks both).
- Stored as a **lossless** greyscale WebP: the ridges are the record, and a
  lossy encode smears exactly those. The browser first turns the BMP into a PNG
  (the server's encoder cannot open a BMP) and checks it really got a PNG; the
  server checks it really produced WebP.
- Deleting the receipt removes it (it lives in the folder the delete empties
  first). **Remove** on the strip deletes it alone. A void receipt keeps it,
  frozen (route + database trigger).

### On paper

- ⚠️ **The layout below replaced the first build the same day** (owner, on
  mockup 2: signatures side by side, the pictures side by side under them, the
  pictures the first thing to move to a second sheet; then *"1 yes second sheet
  is fine, 2. update plain shop copy to new layout.. if we have thumbprint we
  will have id photo going forward"*). The first build put the print to the
  right of two stacked signature lines (1.05 × 1.4 in) and, beside the ID,
  small under them (0.54 × 0.72 in); none of that is in the code any more.
- **Every shop copy — and the form, which is that copy — has ONE signature
  row:** *Seller signature* + *Date* on the left, *Received by* (your printed
  cursive signature) + *Date* on the right, both lines on one level. The
  seller's line is 1.77 in on paper. The printed signature is 30 px here
  (34 px on the seller's copy) so that it fits its line in one piece.
- **Under that row, side by side:** the ID photo at card size (a copy that
  asked for it) and the thumbprint, as tall as the ID (1.59 × 2.125 in),
  labelled *Seller thumbprint*. A copy with only one of them shows that one;
  a copy with neither shows nothing there.
- **The pictures come last on the sheet, so they are the first thing to move
  to a second sheet**, together and whole; the items, the total and both
  signatures stay on sheet 1. On sheet 2 they start 0.6 in from the top edge
  (the printer cuts the first half inch).
- **What fits one sheet** (real PDFs, one-line items, one-line note): with
  either picture, **2 items**; from 3 to 10 items it is two sheets (never
  three). With no picture, at least **10 items** (it was 9 with the stacked
  lines; 12 is two sheets, 11 was not measured). With 0.4 in browser margins
  (a print dialog adding its own): 5 items with pictures.
- **The default print choice follows the ID photo** (owner, 2026-10-06:
  *"switch the default to with-ID when there's a photo"*). No photo: "Shop
  copy + seller's copy". A photo: "Shop copy with ID photo + seller's copy" —
  so the ID and the thumbprint come out side by side without anyone choosing.
  It applies to the form's "What to print" (which switches by itself when a
  photo is attached, and back when it is removed), the print panel, the Log's
  two quick buttons, and a print request that names no copies. A choice made
  by hand is kept. One function: `defaultPrintSet` in `lib/buy-receipts.ts`.
- Every way of printing carries it: the print panel, the Log's **Print here**,
  and the Print Station. The panel and the Log refuse to print if the picture
  cannot be loaded; the station — nobody is there to retry — prints without it
  and says so in its notice.
- The receipt's own page shows the shop copy as it is on file, thumbprint
  included.

### Code

| Piece | File |
|---|---|
| Which file in the folder is the new print (pure, tested) | `next-app/src/lib/buy-receipt-thumbprint.ts` |
| The strip + the folder watch | `components/admin/buy-receipts/ThumbprintField.tsx` |
| BMP → PNG, upload, remove, print-sized copy | `buy-receipt-client.ts` (`prepareThumbprint`, `uploadThumbprint`, `removeThumbprint`, `printableThumbprint`) |
| Store / remove | `app/api/admin/buy-receipts/[id]/thumbprint/route.ts` (POST, DELETE) |
| On the paper | `BuyReceiptSheet.tsx` (`SignatureBlock` = the signature row, `ThumbprintBlock`, `thumbprintSlot`, `thumbprintUrl`) + `.brs-sign-row` / `.brs-sign-seller` / `.brs-sign-shop` / `.brs-pictures` / `.brs-thumbprint` in `buy-receipt-sheet-css.ts` |
| SQL | `supabase/buy-receipts-thumbprint-2026-10.sql` |
| Tests (20) | `next-app/src/lib/__tests__/buy-receipt-thumbprint.test.ts` |

### ⛔ Rules

- ⛔ SQL first, then the deploy: `seller_thumbprint_path` is in the one select
  list every receipt page, the Log and the station use.
- ⛔ The folder watch takes a file only if it was saved at or after the press
  (`pickFreshPrint`), and only once its size has stopped changing.
- ⛔ Never store the thumbprint lossy, never in `product-images`, never behind
  a public link, never in an email.
- ⛔ Measure the signature row and the pictures in the PRINT layout (6.5 in of
  content), not on screen: the screen's paper is an inch wider and the numbers
  differ. The row's halves (272 : 328, split 170 + 90 and 226 + 90) are sized
  for paper; under 640 px of screen the halves stack.
- ⛔ The pictures block stays LAST on the shop copy and keeps `break-inside:
  avoid` — that is what makes it the first thing to wrap, in one piece. Its
  `padding-top: 0.6in` + `margin-top: calc(14px - 0.6in)` is not a typo: there
  is no `@page` margin, a margin is dropped at a page break and padding is not,
  so the pair is 14 px on sheet 1 and 0.6 in of clear paper on sheet 2.
- ⛔ The printed signature on a shop copy is 30 px and `nowrap`. At 34 px it is
  236 px wide; in any line narrower than that it breaks in two and prints over
  the label above (it did, beside the ID photo, until 2026-10-06). The seller's
  copy has a full-width line and keeps 34 px.
- The folder handle is kept in the browser's IndexedDB (`nej-buy-receipts`);
  nothing about the folder reaches the server.
- Whether a scanned print on the shop copy satisfies Florida's secondhand-dealer
  record rule (s. 538.04 asks for the seller's right thumbprint on the
  transaction form) is for the owner's attorney or the sheriff's office.

### Verification (2026-10-06)

Done, on the dev server, real components on a temporary login-free page
(deleted; a test fails while it exists), headless Chrome driven over CDP —
**33/33**:

- The folder watch, against a browser-private test folder standing in for the
  picked one: an older file is ignored over three looks; a new BMP is attached
  in under 2 s as a PNG, 300 × 400; that file is removed and the others are
  left; Stop ends the wait and later files stay; Remove clears it.
- **Choose a file with the owner's real SecuGen BMP** (8-bit, 300 × 400): read
  and shown. A file that is not a picture is refused in words.
- (First build, since replaced: real PDFs of the stacked layout — one page at
  6 items for the shop copy with a thumbprint, at 4 and 5 for the with-ID copy.)
- **The layout now in the code (second run, same method — 25 of 27 in the
  script, the other two read from the PDF by a second script after the first
  one's pattern failed to match):** one signature row on every shop copy, both
  lines level, the signature on one line (208 px in a 226 px line) clear of
  every label, the seller's line 1.77 in; ID and thumbprint side by side 14 px
  under the row at 3.375 × 2.125 in and 1.59 × 2.125 in; each picture alone
  when the other is absent; nothing there when neither is.
- Real PDFs for 1, 2, 3, 4, 6, 8, 10, 12 and 14 items, all five copies: with a
  picture one sheet at 1–2 items and two at 3–10; the same receipts without
  pictures one sheet through 10 (so only the pictures moved). Sheet 2 of a
  4-item receipt, read from its drawing commands: two images and their two
  labels, the ID at x 98 px / 59 px from the top, the thumbprint beside it at
  x 445 px / 59 px; sheet 1 has no image but the logo.
- **The seller's copy is unchanged:** its own block, the 34 px signature on one
  line, no seller line, no pictures even when both are handed to it.
- On screen at 1280, 820, 600 and 390 px (the saved receipt) and 1280, 700 and
  390 px (the form): side by side above 640 px, stacked under it, the
  signature inside its line, nothing wider than the paper.

⛔ **Not verified — needs the owner:**

- **The real folder picker on the laptop** (Chrome's "which folder" window,
  its "let the site edit files" question, being remembered next time). The
  test used a browser-private folder because that window cannot be driven.
- **The SecuGen program saving into the watched folder**, and the file really
  being deleted afterwards (the program may keep it open).
- **Anything behind the admin sign-in:** the upload, the private bucket, the
  signed link, the SQL. The route was type-checked, linted and built, never
  called.
- **Real paper** from the owner's printer.

## What prints

The **print set** dropdown (form, after-save panel, receipt page):

| Choice | Pages |
|---|---|
| Shop copy + seller's copy **(default while there is no ID photo)** | shop (blank lines) + seller's (signed) |
| Shop copy with ID photo + seller's copy **(default once there is an ID photo — 2026-10-06)** | shop with the ID + seller's |
| Shop copy only | 1 |
| Shop copy with ID photo only | 1 |
| Seller's copy only | 1 |

The two "with ID photo" choices are greyed out until a photo is attached. On
the shop copy with the ID, the photo sits **beside the signature lines**, at
card size (3.375 × 2.125 in). ⚠️ With the current margins that copy needs a
second sheet once a receipt has about five or more items (the signature-and-ID
block moves whole to the next page); up to four items it is one page.
⚠️ **That paragraph describes the layout until 2026-10-06 and is no longer
true.** Since then every shop copy has its signatures in one row and its
pictures UNDER them (*Seller thumbprint → On paper*): a copy with a picture is
one sheet up to 2 items and two sheets from 3, by the owner's choice (*"yes
second sheet is fine"*). The old beside-the-lines layout also had a fault that
went with it: the cursive signature did not fit its 176 px line there, broke
into two lines and printed over the "Seller signature" label.

- **Save and send to desktop printer** saves, uploads the photo, then asks the
  print station to print. The laptop then shows *Sent. Waiting for the
  desktop…* → *Printed on the desktop.* If nothing picks it up in 30 seconds:
  *The desktop has not picked this up. Is the Print Station window open on the
  printer PC?*
- **Print here** prints on the computer you are using (the normal print
  dialog, unless that browser was started with the shortcut below).
- The Log's **Send to printer** and **Print here** both use the default set: 2
  copies — and since 2026-10-06 the shop copy is the one WITH the ID photo
  when the receipt has a photo (*Seller thumbprint → On paper*).

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
  goes, and so do the seller's ID photo and thumbprint (2026-10-06: the
  thumbprint lives in the same folder, and the window names whichever the
  receipt has).
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
`print_copies_seller` column, and
`supabase/buy-receipts-thumbprint-2026-10.sql` (2026-10-06) adds
`seller_thumbprint_path` plus a small trigger of its own that freezes it on a
void receipt (its own function, so re-running the first file cannot drop the
rule; the bucket and its policies are untouched). ⛔ Each of these is run
**before** the deploy that reads its column. The first file creates:

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
| Tests (53) incl. source guards | `next-app/src/lib/__tests__/buy-receipts.test.ts` |
| Routes (nine) | `next-app/src/app/api/admin/buy-receipts/` — `route.ts` (POST, GET), `[id]/route.ts` (GET, PUT, DELETE), `[id]/print-request`, `[id]/printed`, `[id]/void`, `[id]/id-photo` (POST, DELETE), `[id]/thumbprint` (POST, DELETE — see *Seller thumbprint → Code*), `[id]/email`, `customer-mode` (GET, POST, DELETE — see *Customer input mode → Code*) |
| Pages | `next-app/src/app/[locale]/admin/buy-receipts/` — `page.tsx`, `log/`, `[id]/`, `station/` |
| The paper (edit + print) | `components/admin/buy-receipts/BuyReceiptSheet.tsx` + `buy-receipt-sheet-css.ts` |
| Printing in place | `components/admin/buy-receipts/BuyReceiptPrintHost.tsx` (`useReceiptPrinter`) |
| Print set, send, print here, "did it print?" | `components/admin/buy-receipts/ReceiptPrintControls.tsx` |
| Form / receipt page / log | `BuyReceiptForm.tsx`, `BuyReceiptDetail.tsx`, `BuyReceiptLog.tsx` |
| Webcam + photo strip | `IdPhotoCapture.tsx`, `IdPhotoField.tsx` |
| Thumbprint strip + folder watch | `ThumbprintField.tsx`, `next-app/src/lib/buy-receipt-thumbprint.ts` |
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
