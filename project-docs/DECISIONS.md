# Decisions

> Current durable decisions only. Superseded experiments and session-by-session
> reasoning remain in `CHANGELOG.md`. Older runbooks that cite a dated
> `DECISIONS.md` "session" or "addendum" should follow the same date/label in
> `CHANGELOG.md`; those historical entries moved there during the 2026-07-23
> compaction. Last reconciled: **2026-09-20**.

## Sister site Naples Antiques and Estate Services is kept clearly separate from NEJ (2026-09-21)

`naplesantiquesllc.com` (formerly NEJ's own legacy domain) became the separate
antiques/estate-contents site on 2026-09-20: same suite, same owner, own Netlify
project. Owner's rule: "#1 goal is to not threaten NEJ at all." Audit +
evidence: `SEO_LEAD_AUDIT.md` 2026-09-21.

- ⛔ No Google Business Profile or directory listings for it while it shares the
  suite. Revisit only with its own answered number, own permanent sign, primary
  category "Antique store" and a DBA.
- It uses the owner's cell (239) 304-6229 and never prints NEJ's (239) 404-8505;
  its JSON-LD is an `Organization` with NO address/hours and no reference to NEJ.
- It owns whole-house contents, antiques and antique silver as objects; NEJ owns
  jewelry, gold, coins, watches, diamonds and silver by weight. It 301s NEJ's old
  paths back to `.com` itself.
- NEJ links to it from ONE place: a body sentence on `/estate-services` (EN + ES).
  ⛔ Never from `/silver-services` or its guides (NEJ's best non-brand page), and
  never in schema/`sameAs`, the footer or the sitemap.

## Google Ads runs with NO site tag; the pages that rank are never edited for ads; the goal is any seller contact (2026-09-20)

Owner, 2026-09-19/20, while approving a $300–500/month Google Search
campaign for sellers:

- **Organic visibility is the overriding rule.** "We are now getting seen on
  google organically, and we dont want to do anything to the code that changes
  that… free evaluations brings us business, the gold buying side bring
  business… we dont want to mess that up." Sellers also arrive after asking AI
  assistants (Copilot, ChatGPT). ⛔ For ads, never change an existing page's
  URL, title, meta description, H1, body copy, FAQ, JSON-LD, canonical, sitemap
  entry or redirect, and do not bump `CONTENT_LAST_MODIFIED`. Ads land on the
  existing landers exactly as they are. Any site step taken alongside the ads
  is proven with a built-HTML diff of the ranking pages.
- **No ad tracking.** "I truly dont care about tracking the ads… i would
  naturally notice more business." → no Google tag / GTM / GA4, no conversion
  pixel, no thank-you URL, no lead-source capture. Consequently the cookie
  notice stays the one-button "Okay" (*"Cookie banner: one 'Okay' button"*
  below), and the Privacy / Cookie Preferences statements that the site runs no
  analytics or advertising pixel stay TRUE. Do not re-propose a tag unless the
  budget grows enough for conversion-based bidding — and then that rule's
  Accept / Essential-only requirement applies first.
- **Why that is fine at this budget:** Google's conversion bidding would have
  too little data to learn from, and Google still reports, with no site code,
  calls from the ad (call asset with a free forwarding number — the site and
  the Business Profile keep (239) 404-8505), Directions / click-to-call "local
  actions" once the Business Profile is linked as a location asset, spend,
  clicks and the search-terms report. Real *store visit* conversions and
  Performance Max for store goals need volume a single shop will not reach.
- **The goal is any seller contact, not calls alone** — walk-ins have been the
  strongest channel, then the form and calls. Ad copy sells the visit as much
  as the call; ads run about 7 AM–9 PM, only the call asset is limited to the
  9–6 phone hours. This broadens the 09-11 "rank work by its effect on calls"
  rule to "its effect on sellers reaching us".
- **Bid where we do NOT already rank.** "sell gold naples fl" is #1 organic
  with only Gold Silver Naples' paid slot above; defending it is a separate
  owner decision with its own price.
- **Spend gates:** the owner creates the account and owns billing (the "$500
  after $500 spend" credit is theirs to take or leave; never a reason to raise
  the budget). Campaigns are built PAUSED and go live only on the owner's
  approval of the exact daily number and the ad text. Weekly report for the
  first month.
- **Deploys:** "dont worry about netlify deploys.. i dont mind" (09-19) — small
  isolated deploys are fine, and preferred where isolation protects the
  rankings. This relaxes the 09-02 "bundle deploys" habit.

## Lead-form photos are shrunk in the browser to fit ONE request; the server makes them WebP; a photo is never silently lost (2026-09-20)

Netlify cuts a synchronous function request at 6 MB, and binary bodies are
base64-encoded on the way in, so ~4.5 MB of photos is the real ceiling. The
admin uploader has respected that since 09-09; the public lead forms posted
camera originals until 09-20, and no photo submission above 1.5 MB had ever
succeeded.

- The browser (`lib/lead-photo-prep.ts`) downsizes the whole set to
  `LEAD_PHOTO_BUDGET_BYTES` (3.8 MB), stepping 2048 → 1600 → 1280 → 1024 px as
  the count grows. ⛔ Do not raise the budget toward the cap, and do not remove
  the smaller tiers — ten photos must still fit.
- It asks the canvas for **JPEG**, not WebP: the server re-encodes anyway, and
  on WebKit a WebP request silently produces a slow PNG. `blob.type` is still
  the only truth.
- The server (`lib/lead-photo-encode.ts`) stores WebP (2048 cap, truthful name
  and contentType, owned buffer). Bytes sharp cannot read are stored as they
  arrived.
- ⛔ Never drop a photo silently. Undecodable → sent as it is; set still too big
  → nothing is posted and the form tells the seller to send fewer or text them
  to the cell.
- The picker stays `accept="image/*" multiple` with NO `capture` (that would
  force the camera and kill choosing several from the camera roll).
- **One cap, said out loud (2026-09-20 (9)):** `LEAD_PHOTO_MAX = 10` in
  `lib/lead-photo-limits.ts` is the only place the number lives — both forms,
  both routes and the browser shrink import it. The picker says "up to 10
  photos" before anything is chosen, and `LeadPhotoCount` turns red ("Only the
  first 10 will be sent") when more are picked. ⛔ A route must never carry its
  own `MAX_FILES` number again: `/contact` kept 6 and `/free-evaluation` 10,
  silently, until the owner counted the photos in the emails. A new form that
  takes photos uses the same three pieces.
- One request, not one-per-photo: a public per-photo upload endpoint would be an
  anonymous write surface into Storage.
- A dev server has no 6 MB cap — size behaviour is proven by measuring what the
  browser sends; the cap itself only shows on production.

## A sent lead form shows ONE shared success panel that puts itself on screen (2026-09-20)

`components/contact/FormSuccessPanel.tsx` — free appraisal, contact message,
product inquiry. Owner-approved mockup: "Success!" + check mark, "Send another",
"Need us sooner? Call or text".

- Swapping a tall form for a short panel collapses the page and strands the
  viewport below it, so the panel scrolls ITSELF to the centre on mount.
- ⛔ Instant (`behavior: 'auto'`), never `smooth`, never `requestAnimationFrame`:
  an animated scroll is cancelled by a closing phone keyboard and does nothing
  at all when frames are frozen. One re-check at 450 ms, moving only if cut off.
- "Send another" must return a CLEAN form (no re-send of old photos/fields) and
  put its top back on screen; the server's rate limits are the flood guard, and
  a 429 has its own wording (`lib/lead-form-errors.ts`).
- A new lead form uses this panel; ⛔ no hand-written success block.

## The phone contact bar is mounted from the layout by an allow-list of seller sections (2026-09-20)

Call · Text · Directions, phones only (`components/cta/MobileContactBar.tsx`,
owner-approved mockup version B). Directions is there because walk-ins lead.

- Pages come from `lib/contact-bar-paths.ts` `CONTACT_BAR_SECTIONS`. ⛔ Never
  mount it from a page file — the seller landers are the pages that rank and
  must not be edited to carry it. ⛔ Never on the homepage (hero budget), shop,
  checkout, account, `/card`, `/kittcard`, admin, `/contact`.
- `usePathname`, never `useSearchParams` (that would deopt every static page).
  The helper strips `/en` as well as `/es` so prerender and browser agree.
- The bar is at the very bottom; on a first visit the cookie notice is lifted
  ABOVE it (`body:has([data-mobile-contact-bar]) [data-cookie-notice]`), so the
  bar never jumps when "Okay" is tapped. z-30: under the header, the drawers and
  the notice.
- Spanish is "Llamar · Texto · Llegar" — "Cómo llegar" does not fit three across
  at 320 px. A label change means re-measuring 320 px in Spanish.
- ⛔ **Phones-only is enforced in `globals.css`, not by `md:hidden`** (corrected
  2026-09-20 (7)). A class in `globals.css` that sets `display` is unlayered CSS
  and always beats a Tailwind utility, so `class="mobile-contact-bar md:hidden"`
  rendered the bar on desktop in production. The base rule is `display: none`;
  only `@media (max-width: 767.98px)` sets `display: flex`. General rule: when a
  custom class sets `display`, put its breakpoint behaviour in the same CSS
  block — and check every "phones only" element at a desktop width as well as
  at 375 px before it ships.

## Customer Call / Text / Directions links come from `contact-links.ts`; a Text link always reaches the owner's cell (2026-09-20)

`src/lib/contact-links.ts` is the one source for NEW contact CTAs: `TEL_HREF`,
`smsHref(body?)`, `sellerTextBody(isEs)`, `directionsHref()`. The older 66
hand-written `tel:2394048505` links stay as they are (several are pinned by
count in `phone-hours.test.ts`); do not mass-rewrite them.

- `sms:2394048505?&body=…` — iOS wants `&`, Android wants `?`; this form
  satisfies both (in use on `/card` since 09-03).
- ⛔ Never the toll-free text-deals number in a `tel:` or `sms:` href: it is an
  outbound marketing sender whose replies run through the YES/STOP handler, so
  a seller who texted it would never reach Chris. Guarded by
  `lib/__tests__/contact-links.test.ts`.
- Where copy already says "call or text", the wording and the existing call
  link stay; the Text link is added beside it. The mobile header ROW takes no
  new icon (it is width-budgeted to the pixel) — Text goes in the menu panel.

## A fallen-through sale is reopened as a NEW deal; deleting a deal never touches a photo another deal shares (2026-09-18)

**Owner (2026-09-18):** reopen after Mark sold, edit the message, resend;
delete past deals; make the photo picker look like a button.

**Rules:**
- **Reopen = clone into a new draft** (`reopenDealAsDraft`): same title,
  price and photo object, `REOPEN_MESSAGE` prefilled, new picture on
  Preview. Never a resend on the old row — `text_deal_sends` is once per
  phone per deal, replies attach to the subscriber's last deal, and the
  sold row is history. *Mark still available* remains the no-text status
  flip for a mis-click.
- **Delete** refuses a deal that is `sending`; send rows cascade, replies
  and system messages keep their rows (`deal_id` null); stored objects are
  removed only when no other deal references them. ⛔ Never delete storage
  objects by deal folder — a reopened deal shares the source photo.
- File inputs in the admin are hidden (`sr-only`) behind a labelled
  `outline-button`; the input stays in the DOM for automation.

## Mark sold texts the buyer and everyone else who got the deal — once, as picture messages (2026-09-18)

**Owner (2026-09-17/18):** "when we mark it sold, it sends a confirmation
text to the winner… also send a 'sold' type text to all people that got a
message and didn't buy it."

**Rules:**
- Marking a deal sold stays a manual click (the reply is the claim, the
  owner closes the sale), but the click now sends two texts: the buyer gets
  `winnerText` ("It's yours - <line> - <price>. We'll text you shortly to
  arrange pickup at our Naples showroom or shipping."), everyone else the
  deal was delivered to gets `soldNoticeText` — the deal's own late-reply
  line, so the broadcast and the auto-reply say the same thing.
- Both are picture messages (`brandMediaUrl()`), like every customer text.
- **Once per phone per deal**, guarded by `text_system_messages` kinds
  `deal_winner` / `deal_sold`: Mark sold twice, or Mark available → Mark
  sold, never re-texts anyone. Mark available sends nothing.
- Best-effort: a failed send is logged (`status failed`) and the click
  still succeeds; the admin notice says "text them yourself" when the
  buyer text failed. Sends go in batches of 10 to stay inside Netlify's
  function limit.

## Guest order lookup needs the order number AND the email or phone on the order; order emails point there, as NaplesEstateJewelry.com (2026-09-17)

**Owner (2026-09-17):** "most people never make an account… an order lookup
with just their order number… update the website url at the bottom to
NaplesEstateJewelry.com."

**Rules:**
- `/order-lookup` opens an order with the **order number plus the email or
  phone on the order** — never the number alone. The number is printed in
  subject lines and receipts and can be guessed; the page shows a name, a
  home address and the purchase. Both facts are on the customer's own
  receipt, so nothing is harder for a real customer. ⛔ Do not relax to
  number-only.
- The route returns `toPublicOrderView()` and nothing else: no internal
  notes, payment references, ids, user id or the email itself. One generic
  not-found covers "no such order", "wrong contact" and a recycled order.
  Rate-limited per IP and per order number.
- The page is noindex and off the sitemap (a utility, like `/card`).
- **Order emails link to `/order-lookup?order=<number>`** in their footer
  instead of `/account`, and the domain line reads **`NaplesEstateJewelry.com`**
  (`SITE_DOMAIN_LABEL`) — the owner's casing everywhere the domain is
  printed for a customer. Account holders still see orders under My Account.

## Text alerts: every customer-facing text is a picture message (2026-09-17)

**Owner (2026-09-17), after the first live loop:** the iPhone showed the
texts in two threads — "+1 (888) 423-7522" for the plain texts and
"8884237522" for the picture deal. Chose: make every customer text an MMS.

**Rules:**
- The sign-up confirmation, the YES reply and the sold auto-reply carry
  `brandMediaUrl()` (`public/assets/images/branding/text-brand-wordmark-v5.jpg`); deals
  carry their own card. So every message a CUSTOMER receives is an MMS and
  threads together. ⛔ Do not add a new customer-facing text without the
  picture.
- The forwards to the owner's own cell stay plain SMS.
- The brand image says "Naples Estate Jewelry" only — never the retired
  "Naples Antiques & Estate Jewelry" wordmark (`logo2.webp`).
- Keep the image ≤ 800 px and well under 600 KB (carrier MMS limits). The
  iPhone preview bubble shows a picture at its own ratio up to roughly 16:9
  and CROPS anything wider to 16:9 (a 800×300 banner with a 700 px mark lost
  its first and last letters on the owner's phone, 2026-09-18; 4:3 showed
  whole but "too tall"): the canvas is 2:1 (800×400, the bubble is then as
  short as it gets) with the artwork inside the central 600 px, which
  survives the crop to ~711 px. Never widen the artwork past that band. ⛔ A changed picture needs a NEW file name (`/assets/*` is
  `immutable, max-age=1y` at the CDN and Twilio caches media by URL) — change
  `brandMediaUrl()` in `lib/text-alerts/config.ts` + the test guard, delete the
  old file.

## Business-card pages: one component, per-holder values — a card URL is printed once and never moves (2026-09-16)

**Owner (2026-09-16):** a second employee's cards must land on the same
page customers see today, and be switchable to his own name and number
later without reprinting.

**Rules:**
- **Every card holder gets their own URL** (`/card` = Chris, `/kittcard` =
  Kitt) and the URL is what is printed. Nothing about a person is encoded
  in the URL that could later be wrong.
- **One page component, `components/card/CardLanding.tsx`.** Layout, copy,
  buttons, links and every rule in its header comment apply to all cards
  at once. The routes are two-line wrappers. ⛔ Never copy the page to make
  a new card — add a holder.
- **Only three things may differ between cards** and they live in
  `lib/card-holders.ts`: first name (the "Text <name>" button and the
  prefilled message), display phone, and the digits behind `tel:`/`sms:`.
  Kitt's entry carries Chris's values until his own line exists.
- **Every card page is noindex/nofollow and off the sitemap** (guarded for
  every holder by `card-page.test.ts`), so adding a card can never touch
  Search Console.

## In-store sales: Zettle takes the card, the site only records the sale — and an unlisted piece is an order line, never a product (2026-09-16)

**Owner decisions (2026-09-16):** "go ahead with the mockup, zettle, no need
for paypal fallback, but we can use the simple sale recorder" → then "yes,
build it" with both item modes. Mockup:
https://claude.ai/artifact/5o6VdpQjChYp11JJPCqS8X.

**Rules:**
- **The card is taken on PayPal Zettle (Tap to Pay on the iPhone), never by
  typing a customer's card into the site's PayPal button.** A keyed card is
  card-not-present: ≈ 3.5% + 49¢ vs ≈ 2.3% + 9¢ card-present, no chip/tap
  liability shift, and many different cards keyed from one device is the
  pattern PayPal's risk system holds accounts for. Money stays in the same
  PayPal business account either way. ⛔ Do not add a PayPal card button
  to the in-store page.
- **`/admin/in-store-sale` records, it does not charge.** One paid,
  picked-up order per sale, `payment_method = in_store_<zettle|cash|zelle|check>`,
  `payment_reference = "In store · …"`, no PayPal capture id. It reuses
  `create_paypal_order` + `capture_paypal_order` so a LISTED item is sold
  exactly as a web sale sells it (row lock, quantity, `sold_price` = the
  price sold, eBay/Etsy end + Deep Field via `scheduleProductStatusHooks`,
  invoice + receipt + owner email via `finalizePaidOrder`). The capture RPC
  stamps `payment_method = 'paypal'`; the route restores the in-store
  values in one update afterwards. No new SQL.
- **An UNLISTED piece is an order line with `product_id null`** (title,
  metal, purity, weight, price as snapshots). No hidden product row: nothing
  can leak into the shop gallery (sold items show there by default), the
  merchant feed, Deep Field or the marketplaces, and there is no fake
  inventory number to explain later. The mockup's "hidden inventory record
  with the next number" was dropped for this reason.
- **Tax is always the 6% Florida rate**, the same rule local pickup uses
  online (`calculateFlSalesTax`); no tax-exempt option until the owner asks.
- **Cell required, email optional.** No email → no receipt (the order page
  can send one later); the owner's new-order email still goes out.
- **The page never signs the customer up** for email or text deals.
- Unlisted "Metal" is Gold / Silver / Other because `products.category` is
  Gold | Silver and an order line only needs a metal snapshot; the mockup's
  Diamonds / Watches / Coins choices were not a product field.

## Product schema: the Offer price is the canonical value, never the storefront label — and a page with no numeric price emits no Product schema (2026-09-16)

**Rule:** `shop/[id]/page.tsx` builds `offers` with `productOfferLd()`
(`src/lib/product-ld.ts`) from `getProductPriceValue(product, spot)` — the
same number checkout, PayPal, eBay, Etsy and the merchant feed use. A SOLD
item therefore reports its recorded `sold_price` (or, before one is
recorded, its last asking price) with `availability: SoldOut` and no
`priceValidUntil`; an in-stock item reports its live price with `InStock`
and a two-day `priceValidUntil`. The visible page is untouched: the admin
"hide sold item prices" setting still renders "Sold" / "Vendido".

**Why:** Google requires `price` on every Offer, sold out or not. The schema
used to copy the storefront LABEL and dropped `price` whenever that label
was not a number — which, with sold prices hidden, was every sold page. Two
sold items were flagged in Product snippets and Merchant listings ("Missing
field price", first detected 2026-08-30) and every future sale would have
added one. Owner (2026-09-16): fix it for good; no selling through Merchant
Center, but keep whatever helps visibility.

**Corollary — no numeric price → no Product schema.** A manual "Contact
for price" listing has nothing valid to emit: Google rejects an Offer without
a price AND a Product with none of offers/review/aggregateRating. Such a
page keeps its BreadcrumbList and store schema and is simply an indexed page
with no rich result. Do not "fix" that by inventing a price or a rating.

**Audit rule unchanged:** sold vs in-stock is still judged by
`"availability"` in the page's JSON-LD (the 2026-08-27 rule below) — a sold
page still has it, now with a price beside it.

## The hero sign-up is one button; the window offers Email, Text or Both, and text deals are pieces that never reach the site (2026-09-15)

**Owner answers on mockup v2** (https://claude.ai/artifact/Wnst13mirihcKMmoSgfT7B):
"1B, 2 text, 3 use store's phrasing, 4 go with recommended, 5 txts will be for
pieces never listed on the site, informal photos with price overlay … from
within admin, 6 twilio free, 7 explain better" → then "yes to both" (reply-YES
confirmation; Text Deals + claiming as drawn, with the late-reply auto-reply).

**The hero** (`HomeSubscriberForm.tsx`): today's caption ("Get first look at
new pieces") over ONE gold **Join the List** button — Option B, not the longer
"Get First Look at New Pieces" pill (Option A). The Name / Email / Join row and
the consent line are gone from the hero. The window loads on the tap
(`next/dynamic`, `ssr: false`, portalled into `<body>`) so it never joins the
homepage's first paint; a guard test pins that.
- ⛔ Do not put fields back in the hero. The three stacked phone fields were
  what made the block tall; with them gone the hero's compact limits were
  re-measured (entry below).

**The window** (`HomeSubscribeModal.tsx`): Email / Text / Both at the top,
**Text preselected** — text deals are the point of the change. Fields follow
the choice. The text pitch says what the texts ARE: "Some pieces never make it
to the website. We text a quick photo with the price, and the first person to
reply takes it. Things move quickly here; email is too slow for these." The
checkbox is the **store's** wording ("Text me the moment a good deal drops.
Pieces move fast; first reply takes it."), not the customer's-voice draft.
- ⛔ **Never pre-tick the consent box** and never trim the statement under it
  (`SMS_CONSENT_TEXT`, `lib/subscriber-phone.ts`): recurring automated
  marketing texts, not a condition of purchase, frequency varies, msg & data
  rates, STOP / HELP, Privacy Policy + Text Message Terms links. Carriers
  refuse a toll-free number without each of those. A rewording bumps
  `SMS_CONSENT_VERSION`; the server stores its own copy of the statement on
  the row as the record of consent (never text from the browser).
- **Text-only sign-ups are allowed** (owner: "either"): `email` is nullable,
  `phone_e164` unique, a row needs one or the other. US numbers only, stored
  `+1` + ten digits; anything not dialable is rejected, never "cleaned up".
- **Reply-YES confirmation (double opt-in): yes.** Only `sms_status =
  'confirmed'` numbers may ever be texted; a sign-up is `pending` until the
  handset replies YES. The window promises "one text BEFORE any deal", which
  is true before and after the texting batch exists.

**Text deals** (Step 2, not built): pieces that are NOT listed on the site — a
phone photo, a price and a line, the price drawn onto the photo on the server
in the brand fonts (a smaller version of `lib/instagram/card.ts`), sent as a
picture message; **the reply IS the claim** (first reply by the clock, flagged
in Admin, every reply forwarded to the owner's cell, "Mark sold" auto-replies
to later responders). No site link and no checkout involved, so the
no-reservation checkout rule is untouched. Provider: **Twilio toll-free,
pay-as-you-go** — the free trial only texts hand-verified numbers with a trial
stamp, so it is for testing only.

**Admin → Subscribers** shows Phone + Alerts (channel · Confirmed / Pending
YES / Stopped), three tiles, "Copy Confirmed Numbers" (YES-confirmed only) and
a text-list filter. Email campaigns still build from the email audience, which
skips rows without a valid email.

**Legal:** Terms gained a "Text Message Program" section (`#text-messages`,
EN + ES) and Privacy one bullet (STOP; mobile numbers never shared with third
parties for marketing) — both are what a toll-free reviewer checks for.

⚠️ **Deploy order:** run `supabase/text-subscribers-2026-09.sql` BEFORE the
batch goes live — the route calls `subscribe_homepage_v2`, and without it every
sign-up (email included) fails with "Could not save subscription."

## Text deals: the reply is the claim, only YES-confirmed numbers are texted, and every send is a row before it is a request (2026-09-15, Step 2)

Owner ("build step 2", after mockup v2 §3b/3c and "yes to both"):
- **Deals go out from the Twilio toll-free number +1 (888) 423-7522**, never
  the owner's cell (Twilio sends only from numbers it hosts; hosted-SMS is
  landline/toll-free only). Replies are **forwarded to the cell** and the
  owner answers from the phone or Admin; subscribers never see the cell.
- **Only `sms_status = 'confirmed'` numbers are ever sent a deal.** A
  sign-up is `pending` until the handset replies YES (any case, punctuation
  ignored: `classifyInbound`). The confirmation text is attempted at sign-up
  and by the 15-minute sweep (≤ 5 attempts, 6 h apart) — so nothing loops
  while Twilio has not approved the number.
- **STOP and HELP are answered by Twilio, not by us** (US numbers get
  Twilio's default opt-out handling); we only record them. Replying too
  would send two texts.
- **The picture is the owner's photo, only resized**, with the price (Caslon
  Bold), the line (Hanken), the brand mark and a "FIRST REPLY WINS" pill
  drawn on a dark band; ≤ ~600 KB JPEG so carriers deliver it. Same
  no-generative rule as the Instagram card.
- **Send discipline** (memory: `after()` is best-effort on Netlify): one
  `text_deal_sends` row per recipient is written first, each row is claimed
  `queued → sending` before its Twilio call, 40 per request, and the sweep
  finishes what a cut-off function left. Unique (deal, phone) makes a
  second "Send" click inert.
- **"Mark sold" answers late replies once per number** with the polite line
  (default "Sorry, that one is spoken for. Next one soon."; editable per
  deal). The first reply is by the clock (`text_inbound.received_at`), shown
  as `[1st]` in the forward and in Admin.
- **Deploy order:** run `supabase/text-deals-2026-09.sql`, set the five
  Netlify variables, push, THEN set the number's "A message comes in"
  webhook to `https://naplesestatejewelry.com/api/webhooks/twilio/inbound`
  (HTTP POST). Until the toll-free verification lands, Twilio refuses sends
  from the number; the code treats that as a failed attempt, not an error
  page.
- ⛔ Never mark a number confirmed from the website; only an inbound YES
  does. ⛔ Never send a deal to `pending` or `stopped`.

## The hero's compact limits were re-measured for the one-button sign-up block (2026-09-15)

The 09-13 limits (entries below) were measured against a block of caption +
Name / Email / Join + consent line — three stacked fields on phones. With the
block now a caption + one button it is ~70–100px shorter, the headline has
more room everywhere, and the old limits would have compacted screens that
now fit (the owner's rule: a hero that already fits is never touched). Same
method as 09-13 (headless Chrome over CDP, compact OFF, EN + ES, 84 widths
320–1920 × 15 heights 340–620; scripts were session scratch, method in
`CHANGELOG.md` 2026-09-15). Each limit is the HERO height of the tallest window
that was tight (< 16px) or overlapping, and must also sit below the height at
which every width in the band would reach a 16px gap — so nothing that fits is
compacted; a few windows just under each limit stay tight (never overlapping).
- ⚠️ **Measure only after the entrance animations finish.** The bottom block
  slides up 18px over 720ms after a 500ms delay; a first pass measured the
  low heights mid-slide, which shifted the block 9–17px and produced phantom
  "overlaps" and a phantom non-monotonic column at 349px. Wait for
  `document.getAnimations()` to settle before the first cell.

| Width | English (hero height ≤) | Spanish (hero height ≤) |
|---|---|---|
| ≤ 336 | 393 | 393 |
| 337–349 | 393 | 373 |
| 350–365 | 353 | 373 |
| 366–612 | 353 | 353 |
| 613–618 | 353 | 318 |
| 619–639 | 318 | 318 |
| exactly 640 | 328 (phone layout with the sm-sized button) | 328 |

- The 613/619–639 limit is 318, not the measured 308: at exactly 308 the
  hero measures a hair over the limit and the band never engaged (the
  compact-ON sweep left 614–639 × 400 overlapping by 3.4px). 318 is inside
  that band's 327 ceiling, so no fitting window is touched.
| 641–767 | 388 | 388 |
| ≥ 768 | 392 | 392 |

- `HomeHeroOverlay.tsx`: `COMPACT_BANDS_EN` / `COMPACT_BANDS_ES` +
  `COMPACT_BANDS_SHARED` (640 and up); the compact rule bodies lost the
  `-fields` / `-input` / `-privacy` hooks and keep `home-subscriber-label` +
  `home-subscriber-join`. Guard: `lib/__tests__/hero-short-screens.test.ts`
  pins the seven limits and rejects the old ones.
- The minimum hero heights (`--hero-min-vh`, entry below) were NOT lowered;
  they are still safe (shorter block, same floor) and changing them alters
  which tiny windows pin, which the owner did not ask for.
- The headline fit ratios (23.5 / 12.6) are unchanged — the wording did not.

## The homepage headline shrinks in place on a short window; its position never moves (2026-09-13)

**Owner chose "Option A"** from a before/after mockup
(https://claude.ai/code/artifact/510369b1-5f31-437c-a48f-d190ca776460) over the
recommended Option B ("move the headline up into the empty space, then fit").
Do not re-propose B unprompted.

**The collision is driven by window HEIGHT, not width.** Before the change the
headline met the sign-up form below about 670px tall at 320 wide, ~710 at 800,
~762 at 1024, ~792 at 1200 (the worst — 3 lines at nearly full size) and ~704 at
1366–1440. A 1366×768 laptop leaves ~657px of page: overlapped by 28px.
1024×609 overlapped by 92px.

**The rule** (`.home-hero-top h1`, `HomeHeroOverlay.tsx`): the font size is the
LARGEST of a one-, two- and three-line fit inside the headline's room, each
capped by the width that line count needs, then the old caps (8vw / 5.75rem;
phones 7vw / 2.5rem), floor 1.5rem. The room is a band centered where the
headline already sits (a quarter of the overlay down; phones: from the top
offset down) that stops 1.5rem (phones 1rem) above the sign-up block, minus the
eyebrow. A window with room renders exactly as before — verified identical at
1440×900 and 1920×1080.

- ⚠️ **The width ratios are this wording's measurements:** unwrapped, the
  headline is 22.4em (EN) / 22.1em (ES) wide → 23.5 for one line; 12.6 for two
  (from the 1152px two-line measurement below). A longer headline must
  re-measure them or it can wrap onto a line the fit did not budget for.
- ⚠️ **Never derive the hero height from `var(--app-vh) - var(--site-header-height)`.**
  The overlay is also short by the promo bar (~36px desktop, ~33px phones), so
  the fit reads real heights with container units instead.
- ⚠️ **The structure it depends on:** `.home-hero-overlay` is a size container
  and a two-row grid; `.home-hero-top-zone` (row 1, wraps the headline) is a
  size container that MUST carry `z-index: 5` — size containment makes it a
  stacking context, and without it the headline paints under the halo layers
  (z-index 4); `--hero-quarter` is registered with `@property` so `25cqh`
  resolves against the overlay, not the zone; the sign-up block is in flow in
  row 2 and held off the bottom by **`margin-bottom`, never `bottom:`** — a
  leftover `bottom:` on the phone rule stacked with the desktop margin and
  moved the form up 99px at 390×664 until it was removed.
- The fit sits inside `@supports (height: 1cqh)`; a browser without container
  units keeps the plain clamp.
- **Not solved:** an iPhone SE in Safari (375×552) still overlaps by 35px (was
  85) and 320×568 by 65px (was 87) at the 1.5rem floor. Per the phone rule in the
  hero-headline entry, that is fixed by shortening the headline, not smaller
  type — owner's call.

Measured after (gap below the headline; the form did not move at any size):
1024×609 38.7px, 1 line, 27px · 1366×657 47.7px, 1 line, 51px · 1200×700 and
1024×700 69.4px, 2 lines, 24px · 1024×768 72.2px, 2 lines, 62px · 1536×730
85px, 24px · 800×609 30px, 1 line, 32px · 390×664 27.3px, 3 lines, 22px ·
375×667 26.3px, 29px · Spanish 1024×609 38.7px, 1 line, 27px.

## The hero keeps a minimum height on the tiniest windows; compact heroes get smaller controls and a higher phone headline (2026-09-13)

**Owner approved "all three"** (option 1, smaller controls, option 2) from
https://claude.ai/code/artifact/6c60b170-a44f-47c5-ac60-c38f005f6cbc, then
narrowed it: **"keep anything that fits today, the same"** — so the smaller
controls apply ONLY where the hero does not fit (inside compact mode), not on
every small phone as the mockup showed. The common iPhone (390×664) keeps its
stacked fields.

**Smaller controls** (inside every compact band):
- Phones: Name / Email / Join on one 1.9rem row, Buy / Sell / Visit Us on one
  row of 0.62rem buttons, consent line 0.62rem.
- Laptops (and the 640px one-row form): fields and Join 2.25rem, buttons
  0.4rem padding with an 8rem minimum.
- Styled through class hooks in `HomeSubscriberForm` (`home-subscriber-label`,
  `-fields`, `-input`, `-join`, `-privacy`). The hero's rules are unlayered, so
  they beat the Tailwind utilities on those elements without `!important`.

**Option 1** (compact phones): the headline starts `1.5rem` under the promo bar
instead of `clamp(3rem, 11% of --app-vh, 6rem)`, and the fit room drops the
offset accordingly.

**Narrow-phone bands are per headline language** (since 2026-09-13, late). The
English and Spanish headlines wrap differently below 431px, so one shared band
either left a language overlapping or changed a size that fit in the other.
`HomeHeroOverlay` now holds `COMPACT_BANDS_EN` and `COMPACT_BANDS_ES` and each
page renders only its own (no CSS language selectors). Set from a fine sweep of
the previous layout at 320–375px wide:
- English: ≤348 wide at hero ≤580px · 349 at ≤540px · 350–430 at ≤520px.
- Spanish: ≤335 at ≤600px · 336–339 at ≤580px · 340–350 at ≤560px · 351–368
  at ≤540px · 369–430 at ≤520px.
- Widths between measured points (336–338, 369, …) keep the neighbouring limit
  that cannot change a fitting screen.
- ⚠️ English 349 wide × 660 tall stays tight (12px, no overlap): it does not fit
  at 620 or 660 but DOES fit at 640, and a height limit cannot skip 640 without
  changing a screen that fits.
From 431px up both languages share the table in the entry below.

**Option 2 — minimum hero height** (`HomeHeroStack`):
- `.home-hero-stack` redefines `--app-vh` for its subtree as
  `max(var(--app-vh-page), var(--hero-min-vh))`. `--hero-min-vh`: 400px ≤359
  wide · 360px 360–619 · 320px 620–639 · 400px 640–767 · 420px 768+ — each the
  shortest window where headline, compact form and buttons all fit.
- ⚠️ `--app-vh-page` is a copy of the token on `:root` (`globals.css`). A custom
  property cannot reference itself, so never write
  `--app-vh: max(var(--app-vh), …)`.
- Both runway heights multiply their extra length by a CSS 0-or-1 switch,
  `min(vh × 2.4 | 2.1, max(0px, (page − minimum + 1px) × 100000))`: 0 below the
  minimum (nothing pins, the page scrolls normally — the reduced-motion layout
  in CSS alone), exactly the old runway at or above it.
- The scroll script's zero-travel path now calls `settleOnPaneA()`, the same
  reset reduced motion uses, so a window shrunk mid-crossing cannot keep a
  crossing's transforms. The touch snap already skips a runway without travel.
- Slideshows B and C still arm on a tiny window (parked below the frame,
  paused) — deliberately, so a later resize to a tall window has them ready.

**Verified (live sweep, EN + ES, 34 widths × 40 heights):** of 870 (EN) / 867
(ES) sizes that fit before without compact mode, **0 changed**; every changed
size was already compact (473) or did not fit (12); 364 compact/short sizes
identical to the approved mockup; runway travel 0 below each minimum and
2.1 × window height elsewhere (0 errors). Left at that point: English 5 tight
windows, Spanish 2 overlaps at 349–350 × 620 and 6 tight — closed the same night
by the per-language bands above (fine re-sweep: 0 fitting sizes changed in
either language; only English 349 × 660 tight remains). Also checked then, EN +
ES at 276 sizes each from 320×240 to 1920×1000: 0 page sideways scroll, 0 hero
elements past a screen edge, 0 clipped button / label / headline text, 0
overlaps or cut-off buttons (including every height under 320px), and a window
shrunk mid-crossing below the minimum clears every pane transform and resumes
the exact crossing when grown back. Devices: iPhone SE Safari +1 → +191px,
iPhone sideways −49 → +16px with the buttons 7px below the first screen; the
other 11 unchanged. Guard: `lib/__tests__/hero-short-screens.test.ts`.

## A hero too short to fit goes "compact" — and a hero that already fits is never touched (2026-09-13)

**Owner: "choice a, leave screens that already fit the way they are (ex.
common laptop)"**, picked from the mockup
https://claude.ai/code/artifact/7c2e5401-5bc4-4c22-8bd5-28234b89e3a6 over
Choice B (compact on short laptops too — bigger headline, no eyebrow on
1280×720 / 1366×768 / iPad). Do not widen compact mode to screens that fit
without asking.

**What compact does** (`HomeHeroOverlay.tsx`, after every other hero rule):
the eyebrow ("One Piece or an Entire Estate") is hidden and the headline fit
stops reserving its space; the sign-up block's gaps drop 1.5rem → 0.75rem on
laptops and 0.85rem → 0.5rem on phones; on laptops the space under the
buttons drops from `clamp(5rem, …, 10rem)` to 1.5rem; New Arrivals' pull-up
margin is eased so it never touches the buttons.

**When** — a container query on the overlay (`hero-overlay`), at these HERO
heights, each set at the tallest window where the previous layout measured
tight (under 16px) or overlapping:

| Width | Compact at hero height | ≈ window height |
|---|---|---|
| ≤ 430, English | ≤348: 580px · 349: 540px · 350–430: 520px | per language since 2026-09-13 (late) — entry above |
| ≤ 430, Spanish | ≤335: 600px · 336–339: 580px · 340–350: 560px · 351–368: 540px · 369–430: 520px | per language since 2026-09-13 (late) — entry above |
| 431–614 | ≤ 498px | ≤ 580 |
| 615–639 | ≤ 478px | ≤ 560 |
| exactly 640 | ≤ 398px | ≤ 480 (the form's `sm` breakpoint puts Name / Email / Join on one row) |
| ≥ 641 | ≤ 460px | ≤ 560 (641–767 use the phone header) |

- ⚠️ **Never a `max-height` media query.** The overlay height comes from the
  frozen `--app-vh`; a media query follows the live window, which a mobile
  toolbar moves mid-scroll, so the hero would flip modes while scrolling.
- ⚠️ **"Leave what fits" is verified, not assumed** — live sweep 2026-09-13,
  EN + ES, 33 widths × 40 heights: 879 sizes above the limits identical to
  before, **0 sizes that already fit changed**, 321 compact sizes identical to
  the approved mockup. The limits depend on the sign-up block's height, the
  header and promo bar, and the headline wording — change any of those and
  re-sweep (method in `CHANGELOG.md` 2026-09-13).
- The 614/615 split follows the Spanish headline, which fits a few pixels
  narrower; English 615–619 wide at ~570–580 tall stays tight (5px) but never
  overlaps.
- Accepted with Choice A: a jump at the limit — 1366×540 gets a 68px two-line
  headline while 1366×580 keeps its 24px one-line headline.
- The leftovers listed here at first (phones upright ≤ ~540 tall, phones
  sideways, 320-wide phones, desktop windows ≤ ~420 tall) were closed the same
  day by the entry above; what is still left is recorded there.

## A marketplace sale marks the product sold on the site through the checkout rule, and only from the moment it was enabled (2026-09-12)

- **Decision.** The 30-minute reconcile sweeps read paid Etsy receipts and
  eBay orders and apply each line with `apply_marketplace_sale()` — the same
  quantity-down / sold-at-zero / `sold_price` rule as `capture_paypal_order`.
  Becoming `sold` fires the other channel's status hook, exactly as a manual
  Mark Sold does; that is what ends the eBay listing after an Etsy sale.
  Nothing ever un-sells: cancelled and fully refunded orders are skipped, and
  a product that is not `available` is left alone with a "no change" log line.
- **Cursor rule.** The first armed run stores "now" and reads nothing —
  the owner had already handled every earlier sale by hand. Every run
  re-reads a 10-minute overlap; `marketplace_sale_events` (one row per
  channel + order + line) makes the re-read inert. The cursor advances only
  after a successful read, so a failed run is retried, never skipped.
- **No detect-only stage.** The owner already gets the marketplace's own
  sale emails; a second email would be noise. The log rows are the audit.
- **Why not the listing-state signal the sweep already sees.** Etsy `edit`
  and eBay `Completed` also cover manual deactivation and expiry; an order
  is the only unambiguous "it sold", and it carries the price.
- **How to apply.** Reading orders needs `transactions_r` /
  `sell.fulfillment.readonly` — both are in the scope constants; a
  connection that lacks them keeps the sweep inert and the panel asks for a
  reconnect. Never call the selling channel's own delist after its sale (it
  already zeroed the listing — mark our row terminal instead). The sales
  pass is awaited inside the cron route; it is not the payment path, so
  `after()` is neither needed nor trusted there.

## Review-window edits write to the product, never to a marketplace-only override (2026-09-12)

- **Decision.** A field corrected in "Review before submitting to Etsy/eBay"
  (length, brand, year, weight, stone, chain type, purity, metal colour,
  type, quantity) is saved to the `products` row through
  `PUT /api/admin/products/fields`, then the preflight re-runs. The only
  channel-specific values are the ones that already were: the Etsy category
  (`etsy_listings.taxonomy_override_*`) and the extra Etsy tags.
- **Why.** The wrong value is wrong on the product page and on the other
  marketplace too, and the out-of-date scan re-hashes from the product — a
  per-channel value would be overwritten on the next sweep. Owner confirmed
  ("yes to all three") that fixing it once everywhere is what they want.
- **How to apply.** New editable rows go through `EDITABLE_PRODUCT_FIELDS`
  in `lib/product-field-edits.ts` with the listing editor's normalizers and
  the `jt:`/`ct:`/`len:` tag rebuild; never add a second write path from the
  window. Derived rows (price, photos, condition, shipping tier, Style, eBay
  category) stay read-only and say where the value comes from — the window
  must never imply a value can be changed there when it cannot.
- **Extended 2026-09-13 to every per-item preflight surface.** The Etsy/eBay
  accordions in the listing editor and the Manage Etsy/eBay pages use the same
  editors (`components/admin/ProductFieldInlineEditor.tsx`) and the same write
  path; never fork a second editor per surface. **Inside the open listing
  editor** a pencil save must also be copied into the form state, its separate
  type/chain/length inputs and the undo history
  (`applyFieldPatchToEditorState`, `AdminShell.applyDrawerFieldEdit`). The
  drawer's Save writes every field, so without that copy the next Save — or an
  Undo — would silently restore the old value.

## Etsy photo checkpoints are verified against the live listing; recovery never adopts a tracked image (2026-09-13)

- **Decision.** Before every Etsy photo pass, `sync.ts` reads the listing's
  live images and drops any `etsy_listing_images` row whose image Etsy no
  longer has (`partitionRowsByLiveImages`), so that photo uploads again.
  Crash-window recovery adopts a live image only if NO row tracks it
  (`planImageAdoptions`). Deletes run before uploads. A listing that 404s
  during a sync is reset to not-listed (`resetDeletedEtsyListing`) and is
  never re-created automatically.
- **Why.** Checkpoint rows were trusted blindly and adoption took any image at
  the planned rank. When the owner replaced photos (inv #33, 2026-09-11; #82,
  2026-07-10), the new photos were recorded against the old Etsy images, and
  the same pass deleted those images. Etsy silently lost photos, and every
  retry saw nothing to do. A deleted listing left the item stuck in `error`.
  Price pushes share the sync path, so an automatic re-create would bring back
  listings the owner deleted on purpose.
- **How to apply.** Never plan uploads from checkpoint rows without the live
  read; never adopt an image a row points at. An empty live answer drops
  nothing (no mass duplicate re-upload). A row with `bytes_sha256 IS NULL` was
  adopted, not uploaded by us. When photos look wrong on Etsy, compare those
  rows with `GET /v3/application/listings/{id}/images` before touching
  anything. Repairing a listing = "Sync Updates" (or "Sync to Etsy" after a
  reset), never hand-editing rows.

## Length is stored in inches; a value that carries `mm`/`cm` converts once, on the way in (2026-09-12)

- **Decision.** `products.length` stays inches (the product page, `len:`
  tag, Etsy Length property and eBay Chain Length all print inches). Input
  may carry a metric unit — `470 mm`, `47 cm` — and `parseLengthInches()` in
  `types/product.ts` converts it (2 decimals) everywhere the value enters:
  the editor, the AI autofill, the review window, and the marketplace
  mappers (so an old `470 mm` row pushes 18.5 in too). A bare number is
  inches, as it always was.
- **Why.** The owner measures in millimetres. The pipeline understood only
  inch suffixes, and the Smart Listing Assistant was told to return "one
  bare numeric string with no unit", so a 470 mm chain became "470 in" on
  the site and on both marketplaces (2026-09-12). Etsy does offer mm/cm
  scales, but pushing mm there alone would need the unit stored per row and
  would disagree with the site and eBay — the owner accepted inches.
- **How to apply.** Any new length input or prompt must either accept the
  unit and hand it to the shared parser, or say "inches" in its label. Never
  ask a model to strip a unit from a measurement. Ring sizes are not
  lengths and are never converted.

## Purity prints as "14K" / "925", never the bare column number (2026-09-12)

`formatProductPurityLabel()` is the one formatter for buyer-facing purity
text (Etsy and eBay description spec blocks). Karats ≤ 24 get a `K`; silver
fineness stays parts-per-thousand. Owner: "normalize it to 14k, 10k, etc
instead of just 14 or 10".

## `/free-evaluation` is the call/visit-first "Free Estate Jewelry Appraisal" page; buttons say "Free Appraisal" (2026-09-11)

- **Decision.** The page leads with the phone and the showroom. The form is
  the optional route, placed just above the closing CTA ("Prefer to Write?").
  A "Come to Us, or We Come to You" section offers the showroom (walk-ins
  fine; call ahead for larger collections) and free home visits in the six
  `SERVICE_AREAS` cities "and farther for larger collections". Never claim
  "no minimum" (owner, 09-11: "yes, minimum").
- **Wording.** Customer-facing labels say "appraisal" ("Free Appraisal" /
  "Tasación Gratuita"), because searchers use that word. The title carries
  the estate angle so it does not compete with `/jewelry-appraisal` ("Free
  Jewelry Appraisal in Naples, FL"). The page says plainly that a written
  insurance/probate appraisal is a different service.
- **The URL stays `/free-evaluation`** (inbound links, the GBP booking link,
  legacy `.html` 308s); the `freeEvaluation` message key stays too.
- **Footer:** this page's link reads "Free Estate Appraisal" so it never
  sits beside "Free Appraisals" (`/jewelry-appraisal`) as a near-duplicate.
- **Why.** The 09-11 investigation found many lost calls were for the free
  evaluation; plausible contributors include form-first CTAs and the
  in-home → walk-in reframing. Owner: people wanting a free evaluation do not
  want to deal with photos; they want a visit or to come in.
- **How to apply.** New buttons pointing here say "Free Appraisal"; the phone
  comes first wherever both appear; photos are never required; hours come
  from `getStoreHours()` and cities from `SERVICE_AREAS`, never hardcoded.
  Supersedes the 2026-08-09/10 "form in the second block" layout in
  `features/lead-capture.md`.

## The Turbopack build cache stays off (2026-09-10)

`experimental.turbopackFileSystemCacheForBuild` is pinned to `false` in
`next-app/next.config.ts`. Next 16.3 made it the default, and the cache it
writes (`.next/cache/turbopack/*.sst`) contains a snapshot of every
environment value — server-only secrets included. Netlify publishes `.next`
and scans it, so the first 16.3.4 deploy failed with 16 flagged secrets, all
in that one cache file, none in repo code. Faster incremental builds are not
worth a build artifact that carries the PayPal secret and the service-role key;
keep the flag off across future Next upgrades and re-run the build-output
secret grep from `INTEGRITY.md` after each one. Do NOT "fix" this with
`SECRETS_SCAN_OMIT_PATHS` — that hides the scanner from a real leak instead of
removing it. The dev cache (`.next/dev/…`) also holds the values but never
leaves the machine; it stays on.

## Seller acquisition emphasizes jewelry, gold and sterling; truthful phone availability (2026-09-10)

After the audit/reassessment, the owner authorized seller-focused website and
profile/ad changes. Gold, sterling and estate-jewelry copy welcomes ordinary
single pieces and collections, with clear call actions and the central daily
9 AM–6 PM phone-hours label. Showroom hours remain the actual visiting schedule.
Diamond marketing emphasizes evaluations of complete jewelry; the established
route remains, while the broad lab-grown/loose-stone invitation and footer link
are removed. This is marketing emphasis, not a new refusal policy or proof that
diamond discovery caused the earlier decline. The lab-grown buying decision
below still stands.

GBP keeps **Jewelry buyer** primary; secondary Diamond buyer removal was
accepted. Google Update copy has no actual telephone number; native **Call now**
uses the verified profile number. Check Pending versus Live before claiming
publication. Custom service names exclude phone numbers and prices. A rejected
post alone does not establish an account-wide ranking penalty. Yelp's phone-call
goal is now selected with **Free call reporting OFF**; no forwarding numbers
were activated. Keep the existing business number and verify visible saved
values, because AX/DOM output can omit a populated input. Full account state,
including the unconfirmed Yelp category removal, is in `SEO_LEAD_AUDIT.md`.

OpenAI's 14 Naples ZIP areas replace United States; $25/day remains unchanged.
Seller-only context hints and phone-hours ad copy lead to `/sell/naples`;
the saved ad remains Serving. Contexts do not guarantee exclusion of every
diamond search, and no conversion outcome was configured.
This is postal-area coverage, not an exact municipal-boundary geofence. Do not
infer organic assistant suppression or improved paid lead quality from these
edits. Aggregate impressions can conceal reduced exposure for previously
visible queries; retain the audit's sample/selection limits. Website deployment
and post-deployment IndexNow are owner-timed; no new SQL or env setup is needed.

## Diagnose seller calls with comparable, correctly defined evidence (2026-09-10)

`SEO_LEAD_AUDIT.md` supersedes the September 8 causal conclusion. GBP
interactions, call-button clicks, completed calls, qualified sellers and Yelp
lead actions are distinct measures. GSC query rows omit private queries;
material keyword groups are not complete source attribution. Exclude retained
spam/test inquiries before treating database rows as customer conversions.
Use equal date windows, preserve reporting cutoffs and separate observation
from hypothesis. Do not change code, categories, ad budgets or tracking on the
strength of the withdrawn “local-pack eligibility is the root cause” claim.
Exact-page GSC results and property-wide keyword cohorts are different scopes;
neither substitutes for the other. Preserve page, exact query, country and
device filters when comparing positions. Separate new-query/weight changes
from same-query changes, and report when detailed rows do not reconcile the
headline. With zero impressions, position is missing, never rank 0. The gold
page's specific U.S. desktop estate-query deterioration warrants follow-up
after deploying the tested copy, ahead of cosmetic home work; it does not
establish a broad gold-search loss, penalty or cause of fewer qualified calls.
The owner subsequently authorized and the project locally implemented only the
observed content/link gaps: a home gold-card context link, accurate and welcoming
estate buying/visit copy, and an inherited-guide link to the estate buyer page.
The follow-up changes three existing files in EN/ES, with no new estate FAQ/schema,
URLs or routes. The combined pending batch is 14 unique app source files plus
package manifests. Preserve direct conversion paths and truthful process claims;
the edits do not establish a diagnosis or promise ranking recovery. The extension
passes tests, TypeScript, lint, build and focused visual checks; dependency audit
is clean. Estate offer cards must grow with their text: a square/fixed-height
constraint clipped the expanded explanation at 320px and overlapped the visit CTA.
Google inspection/recrawl and consistent page/query/country/device comparisons
remain post-deployment work, with roughly two-/four-week measurement checkpoints.
At the owner's explicit request, missing-review recovery, honest new customer
reviews and legitimate local business mentions/links are later tasks. No outreach
or review requests in this phase; do not imply these actions are completed.
The owner requested the initial audit without code changes, then authorized
the separate implementation recorded above. The owner confirms September 2026 opening date was set
September 10 and Google review loss occurred after the original slowdown.

## The hero's "New Arrivals" is a text link under the trio, never a fourth button (2026-09-10)

Mocked three placements for a homepage entry to the newest-first shop view:
replace Buy, a four-button row (Buy · New Arrivals · Sell · Visit Us, a
clean 2×2 on phones), and a small underlined line beneath the trio. **The
owner chose the line** ("placement and style c, label it new arrivals").
Rules:

- **Buy · Sell · Visit Us stays exactly three.** The phone layout is a
  two-column grid whose "one down" rule keys on `.hero-cta:last-child`, so
  anything added INSIDE `.home-hero-actions` silently breaks the 2 + 1
  shape. The link is a sibling after that div.
- **It is a `<Link>`, not an `<a>`** — the opposite of the Visit Us anchor
  rule (*"An in-page jump is an `<a>`…"*). This one is a real navigation
  and should arm the route progress bar.
- **Label "New Arrivals →" / "Novedades →"**, matching the shop's
  "Newest arrivals" / "Novedades" sort option so the landing page reads as
  the same thing. Arrow is `aria-hidden`. Do not promote it to a button, a
  filled pill, or a badge without asking — the quiet weight was the choice.
- **Colour is `var(--hero-btn-color)`** so it cross-fades with the hero's
  light/dark theme exactly like the buttons; the underline is a 55%
  `color-mix` of the same colour so it never reads as a foreign accent.
- **Size is 0.85rem desktop / 0.78rem phone** (owner asked for "a tiny bit
  bigger" than the 0.75 / 0.7 it launched at, minutes after seeing it). It
  is still smaller than the 0.75rem-uppercase-tracked buttons read, which
  is the point; bigger than this and it becomes a fourth call to action.
- **The hero grew by one text line on phones** (bottom-anchored block, so
  the growth is upward into the open space; measured 24px clearance at
  375×812, 20px at 320×660). If the hero ever needs that height back, this
  line is the first thing to reconsider, not the buttons.

## "Newest arrivals" sorts by `created_at`, newest `sort_order` breaks ties (2026-09-10)

The shop's default "Inventory order" puts new listings LAST (the admin
assigns `sort_order = max + 1`), so a shopper could never see what just
came in. The Sort select now offers **"Newest arrivals"** (ES "Novedades";
`?sort=newest`) as its second option. Rules:

- **The timestamp is `created_at`.** There is no published/listed column
  on `products`, and listings go live minutes after creation in practice.
  Do not add a `listed_at` column unless the owner starts drafting days
  ahead of publishing; if that happens, add it with a status-change trigger
  and switch the comparator, keep the option value `newest`.
- **Ties fall to `sort_order` DESCENDING.** Bulk imports share a
  `created_at` (19 rows at 2026-06-12 16:28Z, 36 on 2026-07-20). Inside a
  tie the higher `sort_order` is the later listing, so the fallback must be
  the reverse of every other sort's fallback.
- **Available pieces still come first**, then the sort — same as every
  other option (the purchasable-first split is unchanged).
- **No "oldest first."** It is not a standard storefront control; add it
  only on request.
- Valid values live in ONE set (`VALID_SORTS`, `lib/shop-filter-state.ts`)
  and the option list in ONE component (`ShopSortSelect.tsx`, used by the
  gallery toolbar and the filter drawer). A sort added to one without the
  other is silently dropped from the URL.

## The storefront photo says "which door"; the homepage Visit Us block is a centred column with the photo and the square map beneath it (2026-09-08)

The owner supplied a photo of the storefront (orange two-story building,
white balcony, Suite 104 = the centre glass door, 104 on the curb) to
"help guide customers to the right unit". Rules from the mockups:

- **One component, `components/StorefrontPhoto.tsx`,** renders it
  everywhere (homepage Visit Us, contact `VisitUsPanel`, the `/sell/naples`
  showroom band, a 16:9 thumbnail on `/card`) — same file, same alt text,
  crops keep the lower half where the door and curb number are. A changed
  photo gets a NEW file name (CDN caches by URL).
- ⛔ **No caption on any surface** (owner). The alt text carries the cues
  for screen readers and Google Images; it does NOT name the neighbouring
  business (retired from these surfaces 2026-08-23) — the door sign in the
  photo shows it anyway.
- **Homepage Visit Us layout = centred column, then photo + map as two
  equal squares** (owner's "V2", after seeing a two-column-with-photo
  variant and a 4:3 pair). ⚠️ This REVERSES the 2026-08-23 decision that
  made the block two columns so seven hours rows would not push the map
  off the fold; the owner chose the stack knowingly — the photo-and-map
  pair is the payoff and the section sits at the foot of the homepage where
  the visitor is already scrolling. Do not restore the two columns without
  asking.
- **The map stays square.** A 4:3 map option was built for the V1 mockup
  and removed when V2 was chosen; the 2026-08-18 squareness rule stands,
  and `ShowroomMap` has no aspect prop.
- The photo shows the neon OPEN signs lit; the owner was asked whether to
  reshoot without them and kept this shot.

## Phone hours are stated in words, never as the Business Profile's main hours ("Option C", 2026-09-08)

The owner answers the phone 9 AM–6 PM, seven days; the showroom is open
Mon–Fri 11–3, Sat 11–4. Google's main hours mean customer-facing hours at
the location, and "open at time of search" is a pack-ranking factor — so
the temptation is to list 9–6. Decided against it: a walk-in at 5 pm
finding a locked door is the worst review there is, and mismatched hours
draw Google's user-suggested edits. Rules:

- **GBP main hours = showroom hours, always** (and they must keep matching
  the admin-editable schedule the site renders — NAP consistency).
- **Phone availability is said in words:** use factual availability in the
  GBP description and a number-free Update with native Call now. Google's
  explicit phone-number prohibition applies to post content; do not generalize
  it into an unsupported ban on every profile field. On the site, use the
  central label on `/card`, homepage Visit Us, `/spot-prices`, gold/silver/estate
  hero calls, Sell/city hero calls, Naples city showroom call group, footer,
  contact form introduction and visit-panel call area.
  `ContactPoint.hoursAvailable` remains distinct from the JewelryStore's
  showroom `openingHoursSpecification`.
- **One constant** — `PHONE_HOURS` in `lib/business-location.ts` — feeds
  every surface through `phoneHours()` / `phoneHoursLabel()` /
  `phoneContactPointSchema()`. Not an admin field (owner's call): it
  changes rarely. Guarded by `lib/__tests__/phone-hours.test.ts`.
- **Never a row in the hours table.** Each row there is a day; the phone
  line sits under "or by appointment", which already qualifies the table.
- The inspected More hours editor has no Phone hours type. Online service
  hours is real but is not verified as a substitute for telephone availability
  or as a way to override Closed. Preserve accurate showroom hours.

## Hero buttons on the buy-side landers include the phone (2026-09-08)

The September 8 review found the gold and silver heroes steered visitors
to a form — gold even had TWO buttons to the same form. It did not establish
the calls' source (corrected September 10). Rule: a buy-side lander's hero
offers the form AND the phone (`tel:2394048505`, in the hero's own outline
style, `AppIcon name="call"`); a secondary link that is not one of those
two (the silver "rates" link) becomes a small text link under the buttons.
The bottom CTA of each page already had this pair; the hero now matches.

## A meta description that carries the phone number stays near 150 characters (2026-09-08)

The buy-side landers (`/diamond-buyers`, `/watch-buyers`,
`/jewelry-appraisal`, and since 2026-09-08 `/gold-services` +
`/silver-services`) end their meta description with "Call (239) 404-8505"
so a searcher can dial from the result. Google truncates descriptions at
roughly 155–160 characters on phones, and the number is the LAST thing in
the string, so a long description cuts off exactly the part the phone is
there for — the first gold/silver drafts ran 176–192 and were rewritten to
149–155. Rule: phone last, whole string ≤ ~155 characters, claims only
from the page's own copy. The diamond, watch and appraisal descriptions
were trimmed to the same rule the same night (the watch page had no phone
at all); all five buy-side landers are now guarded by
`lib/__tests__/service-landers-faq.test.ts` (ends with the phone, ≤ 160).
FAQ blocks are rendered by `components/FaqSection.tsx` from one list so the
FAQPage markup can never describe a question the visitor cannot see.

## A language switch is a text swap, never an arrival — no entrance fade (2026-09-08)

Owner, on `/card` after the deploy: "I see the page change to Spanish, and
then I see a flash reload … might be a result of the fade in effect." It
was the fade. The English/Español toggle is a soft navigation, but the
`[locale]` segment changes, so React remounts the page's DOM, and
`CustomerReveal` (the site-wide entrance animation: opacity 0 + blur + 18px
→ 620ms fade, staggered) treated the new nodes as a new page. Rule, applied
in `components/layout/CustomerReveal.tsx` for EVERY page, including the
header's language link:

- A pathname change that differs only by its `/en` / `/es` prefix gets **no
  reveal**: the remounted nodes are stamped `done` and never hidden. Real
  page changes and first loads keep the animation unchanged.
- The decision is made in two places because of timing: in the OUTGOING
  page's observer sweep (it fires on the route commit, before React runs
  the old effect's cleanup) from `window.location.pathname`, and in the new
  effect run from a **module-scope** record of the last pathname
  (`CustomerReveal` itself remounts with the layout, so a ref would be
  empty). The decision is stored per pathname so StrictMode's double effect
  run in dev cannot flip it.
- Pure helpers `normalizeRevealPathname` / `isLocaleOnlyChange` are
  exported and guarded by `lib/__tests__/customer-reveal-locale-switch.test.ts`.
- Proof method for any future "flash" report: a `window` marker (survives
  = no reload) plus a MutationObserver counting `data-customer-reveal`
  stamps — a switch must count 0 `pending`.

## The `/reviews` page — the site's own review list, not a Google link (2026-09-08)

The business card's "Read Our Reviews" button opens `/reviews` (EN) /
`/es/reviews`, a page of our own, rather than the Google profile. Owner's
choice on a recommendation: the profile link opens the Maps app on most
phones with no way back, shows Spanish speakers a machine translation, and
the verbatim reviews plus their Spanish translations already existed in
`lib/testimonials.ts`. Rules:

- **The page renders `TESTIMONIALS` and nothing else.** No review is typed
  on the page. **No count anywhere** (owner, 2026-09-08, minutes after the
  deploy: "just say Google reviews, quoted word for word") — a number reads
  as "only N" and drifts against the Google total. The list stays reconciled against the live Google
  profile (the rule at the top of `testimonials.ts`) — on a page that
  invites verification, a vanished review is the same problem as an
  invented one.
- **One card everywhere.** `components/home/TestimonialCard.tsx` is the
  single rendering (homepage marquee, product-page grid, `/reviews`), each
  card linking to the original on Google. A change to how a review looks or
  links is made there, once.
- **Google stays one tap away.** The page ends with "Leave a Review on
  Google" (the plain `<a href="/review">` 302 handler — never a Next
  `<Link>`) and "See All Reviews on Google" (`GOOGLE_REVIEWS_URL`). Nobody
  is trapped in a curated list, and the copy says the rating that counts is
  Google's.
- ⛔ **No `aggregateRating` / `Review` schema** for the business's own
  reviews, here or anywhere (self-serving review markup on a LocalBusiness
  is a manual-action risk). BreadcrumbList only. Guarded by
  `lib/__tests__/reviews-page.test.ts`.
- **Honest about translation.** The Spanish page says the Spanish versions
  are our translation (one review, Mayelin Pérez, was written in Spanish and
  its English is the translation — `testimonials.ts` records which).
- **A destination, not a ranking page**: sitemap priority 0.5, linked from
  the About ▾ menu, the footer company column and `/card`. It is NOT added
  to the homepage band's footnote (the band's own "Leave a Review" CTA is
  the conversion path there).
- ⚠️ **`/reviews` is one letter from the `/review` route handler.** The
  proxy matcher's carve-out is `review$` (anchored) since 2026-09-08; the
  unanchored `review` prefix it replaced sent `/reviews` around the locale
  rewrite to a 404. The test above rebuilds the matcher regex from the
  source and pins both behaviours.

## Silver-marks photos: the shop's own first, eBay by the owner's call, provenance always recorded (2026-09-06)

The marks section shows 26 photographs. Rules:

- **Own product photos first.** The catalog already had usable mark shots
  for 16 of 26 slots (scan the listings before reaching for the web).
  Own tiles carry the "from our shop" tag; that tag is a provability
  claim — never put it on a borrowed photo.
- **Borrowed photos are eBay listing photos only**, chosen by the owner
  after a rights discussion (web/Google images and auction-house catalog
  photos carry real demand-letter risk; individual eBay sellers rarely
  enforce, but the exposure is not zero — not legal advice). Every
  borrowed image is listed with its listing URL and image id in
  `CHANGELOG.md` 2026-09-06 so it can be swapped or removed in minutes if
  anyone asks. Replace them with shop photos as plated / continental
  pieces cross the counter.
- **Captions state only what the photo shows** (reading of the mark,
  maker if stamped, city/date if the hallmark gives it). No attribution
  that is not on the piece.
- **Every tile expands to the whole photograph** (`MarkGallery`): tiles
  are tight crops, so the full image is the record. Native `<dialog>`,
  keyboard-openable tiles, full image loaded on open only.
- **eBay photo research: search the ITEM, then read the gallery (owner,
  2026-09-06).** "Dont directly search for a hallmark … a seller wont list
  it with that title." Search "14k gold", "9ct gold", "gold filled" etc. in
  sold + completed listings, pull every gallery image, and pick the stamp
  close-ups by eye at full size. The shop's own catalog is scanned first;
  it photographs pieces, not stamps, so expect only a handful of usable
  marks from it. Every chosen photo's listing URL + image id goes in the
  CHANGELOG so it can be swapped. The gold guide follows the silver-marks
  photo rules (captions say only what the photo shows; changed photo = new
  file name).
- **Live-prices page (`/spot-prices`, 2026-09-06).** A link target for
  social posts and the About menu, not a ranking page: the TradingView
  charts index as nothing, so the page carries the spot figures and the
  per-gram karat table as server-rendered text. Rules: every number is
  metal value at spot and is tagged "not an offer"; no buyer margin is ever
  stated; karat fractions must equal the gold-worth guide's
  (test-enforced); the feed returns NULLS on failure and the page says so —
  never print the pricing fallback from `fetchSpotData()` as if it were
  live; keep the embeds off the homepage and the Sell flow (PSI mobile is
  bimodal). `/live` is a 307 convenience alias; `/spot-prices` is canonical.
- **A changed photo gets a new file name.** `next/image` and the Netlify
  image CDN cache by URL; re-cropping or rotating a file under the same
  name showed the OLD picture to the owner twice on 2026-09-06. Suffix
  `-v2`, `-v3` … and update the key.
- Facts in the copy are checked against references before they ship
  (recorded in the CHANGELOG entry); the hallmarks guide at
  `/jewelry-appraisal/hallmarks` stays the sitewide reference and the
  section links to it rather than duplicating it.

## Hero text over photos is measured, not eyeballed — and a light hero needs a wash that covers the TEXT BOX (2026-09-06)

The silver hero shipped for weeks with body text at 1.06:1 on phones
(AA: 4.5:1) because its left→right gradient was designed on a desktop,
where the text stays in the solid left half. On a phone the text box is
~92% of the viewport and the same gradient leaves its right half on the
photo. Rules:

- **Any text over a photo is checked numerically at 375 / 768 / 1200 /
  1440** before it ships: composite the image (object-cover crop, filter,
  opacity), the overlay and the text colour, and take the WORST pixel
  contrast inside the text box, not the average. A screenshot on the
  desk monitor proves nothing about the phone. Script pattern: `sharp`
  crop → apply overlay alpha per x → WCAG luminance; run it from
  `next-app/` (it needs the app's `sharp`).
- **The overlay is defined relative to the TEXT BOX, not the viewport.**
  Below `lg` (where the text spans the width) use a flat wash (≥85% of
  the page background); from `lg` the gradient must stay ≥90% opaque past
  the text box's right edge (`max-w-2xl` = 704px at 1200) before fading.
- **Dark heroes are the site default** (#1a1c1c, photo at 40%, white
  text — gold, estate, diamonds, watches, appraisal). Silver is the one
  light hero and keeps that look by owner choice; the rules above are
  what make a light hero legible, not a reason to darken it.

## Homepage services strip: five cards, buy-side leads, 3 + 2 centered on desktop (2026-09-05)

The strip is Gold · **Buy Estate Jewelry** · Silver · Sell (shop) ·
Contact. The buy-side jewelry card exists because buying is the primary
business and the strip previously only said "We SELL Estate Jewelry" —
its title is a real `<h2>` and its link is the homepage's one descriptive
internal link to `/estate-jewelry`. Rules:

- **Card copy makes no claim the linked page does not make.** The buy
  card's body is lifted from `/estate-jewelry` (maker / gemstones / era;
  immediate payment upon agreement). Same rule as the silver card.
- **Desktop is 3 + 2 with the second row CENTERED** (owner chose this over
  five narrow columns). Implemented as six half-width tracks with
  `nth-child` pins in `.home-services-grid` — adding or removing a card
  means updating those pins, or the last row drifts left.
- A shared mark is acceptable as a stand-in, never as the final state —
  the card got its own `estate-jewelry` mark the same day.

## Illustrated marks: the owner's icon pack is the source, clay is the fallback set (2026-09-04)

The owner now supplies finished mark artwork (`icon pack/` → resized to
512px, WebP with alpha, `public/assets/images/icons/mark-<name>.webp`).
Four shipped 2026-09-04 and replaced the clay ring / flatware / goldbar /
phone sitewide. Rules:

- ⛔ **Never alter the artwork** — resize and encode only. No trim, crop,
  recolour, background pass or shadow bake. The float comes from the
  shared `.clay-mark` drop-shadow, not the file.
- **New marks go through `ClayMark`** (add the name to the union AND to
  `ILLUSTRATED_MARKS`); `clay-mark-files.test.ts` fails if the file is
  missing. Retire a clay name from the union when its replacement lands so
  `tsc` finds every usage.
- **No per-mark optical scale for icon-pack marks** unless a new one is
  genuinely hollow; the clay ring's boost went with the clay ring.
- **Reuse is reviewed, not assumed (2026-09-05):** the owner spot-checks
  every placement where a mark is a judgement call and wants to know
  whether it is unique or shared. Outcome table in `CHANGELOG.md`
  2026-09-05; `dollar` is the "money moment" CTA mark (appraisal + city
  CTAs), `cash` stays a list-item mark, `shield` is the confidentiality
  mark, `purity-test` / `xrf` are the gold page's testing marks.
- **The clay set is fully retired (later 2026-09-04)**: the owner supplied
  the rest, so every `ClayMarkName` resolves to `mark-<name>.webp` and the
  component has no `clay-` path at all. The pack has no shield and no
  microscope; those spots use the lock / flask / scale / gemstone / cash by
  context (recorded in `CHANGELOG.md`). `gemstone` is the diamond mark —
  the signet ring means rings/jewelry, not diamonds.

## Cookie banner: one "Okay" button, no Reject / "essential only" pair (2026-09-03)

Owner asked whether the banner should offer a quick Reject or "accept
essential only" like other sites. Answer, after re-checking the source:
**no, because there is nothing to reject.** The site stores only essential
items (Supabase auth cookies, the locale cookie, cart/favorites in browser
storage, the notice-dismissed flag) and loads no analytics, tag manager,
pixel or ad script; PayPal and Turnstile load only on checkout / sign-in to
do what the visitor asked. A "Reject" that rejects nothing while the same
cookies keep being set is the misleading pattern regulators call out.
Essential-only storage needs no consent, so the banner is an information
notice, and its button should read as acknowledgement, not agreement to
tracking. A "Got it" version was mocked up (two layouts, EN/ES) and
declined ("too informal and sloppy"); the owner then chose **"Okay"**.

- The button reads **"Okay" / "De acuerdo"**. Title, body copy, layout and
  the Privacy / Preferences links are unchanged; so is the dismissal
  mechanism (same storage key, same `<html>` attribute).
- ⛔ Do not add a Reject / "essential only" button while the site has no
  optional cookies. The day analytics or an ad pixel is added, that is the
  moment for a real Accept / Essential-only pair whose second button
  actually blocks the script — the Cookie Preferences page already says so.
- Not legal advice; a practical read of GDPR/CCPA-style rules for a site
  with essential-only storage.

## The `/card` page — the URL printed on the business cards (2026-09-03)

`naplesestatejewelry.com/card` is what the QR on the physical business
cards encodes. Cards are printed once; everything behind the URL is
editable. Rules that follow from that:

- ⛔ **The URL never moves.** No rename, no redirect chain, no locale
  prefix on the printed form (`/card` is English; `/es/card` is reached
  from the toggle at the top of the page). A broken `/card` is a stack of
  dead cards in customers' wallets.
- **noindex and OFF the sitemap, permanently.** It is a thin utility page
  and must not compete with `/contact` or `/sell` in search. Do not
  request indexing for it. Guarded by `lib/__tests__/card-page.test.ts`.
- **No site header, footer or breadcrumb.** The page IS the buttons; the
  wordmark and the "Visit Our Website" button are the way into the site.
  The same test asserts this.
- **Every fact comes from `business-location.ts` and the admin hours** —
  never retype the phone, address, landmark, hours or social URLs here.
  `INSTAGRAM_URL` / `FACEBOOK_URL` are the named constants (they also
  feed `SAME_AS`).
- **Leave a Google Review is the gold (primary) button** (owner's pick):
  the card changes hands right after a sale. Call is the dark pill, as on
  the homepage Visit Us block. Keep that hierarchy. **Get Directions sits
  under the address**, not in the primary stack (owner, 2026-09-03).
- **"Read Our Reviews" is an outline pill directly under the gold review
  ask** (owner, 2026-09-08), a `<Link prefetch={false}>` to the site's own
  `/reviews` page (see *"The /reviews page"*), so the gold button stays the
  one filled button. A paired half-width row was measured and rejected at
  375px: 112px per half against "Leave a Review" 115px / "Dejar una Reseña"
  137px. The icon is the `forum` speech bubbles (owner's pick).
- **The bottom button names both destinations: "View Full Website & Shop"**
  (owner, 2026-09-08). Spanish is "Ver Sitio Web y Tienda" — the full
  "Ver Sitio Web Completo y Tienda" measured 252 of the 256px available at
  375px, so it drops "Completo" in place (the shrink-in-place rule). Pill
  labels on this page are measured (canvas `measureText` with the pill's
  computed font), never eyeballed.
- **The Text button is prefilled** ("Hi Chris, I have your card and I'd
  like to ask about ") — the site has no scan analytics, and the phrase is
  how the owner knows a lead came from a card. Keep the `sms:…?&body=`
  form: `?&` is the one shape both iOS and Android honour.
- **A static QR only.** Never a paid "dynamic QR" service — the page is
  the dynamic part, and such services expire and take the cards with them.
- **The EN/ES toggle is a Next `<Link prefetch>`, never a plain anchor**
  (owner, 2026-09-04: a full reload on the switch read as a "blip / flash").
  Internal links on the page are `<Link prefetch={false}>`; `tel:`, `sms:`
  and external links stay `<a>`.
- **"Join the List" is a full-width tinted tile under the grid, never a
  fifth pill and never gold** (owner, 2026-09-15, mockup Option C of three:
  https://claude.ai/artifact/ApjXkZzv87eLAcwUVeaZoM). It opens the SAME
  Email / Text / Both window as the homepage (`CardJoinListButton.tsx`, the
  page's only client piece, lazy like the homepage launcher), so the card and
  the site grow one list with one consent record. The tint is the window's
  "Text-only deals" box, so it reads as different from Shop / Instagram
  without competing with the review ask. The tile is ONE line in both
  languages: the hint is short on purpose ("email or text deals" / "correo o
  texto") and truncates rather than wrapping. To pay for the extra row the
  page was tightened the same night (language bar 39 → 31px, pills 46 →
  42px with 6px gaps, logo 44 → 40px, tiles 4px shorter): at 375×812 the
  grid ends on the same 625px line it did with four tiles.
- **No cookie notice on `/card`** (owner, 2026-09-03): the banner covered
  the address and bottom buttons for every first-time scanner, and the
  page sets nothing of its own. The PAGE declares it (`data-no-cookie-notice`
  on its `<main>`) and `globals.css` resolves it with
  `body:has(main[data-no-cookie-notice]) [data-cookie-notice] { display: none }`
  — server-rendered, JS-free, flash-free; a browser without `:has()` just
  keeps the banner. ⛔ It never stamps `data-nej-cookies-ok`: consent is
  untouched and the banner still appears on the first site page they tap
  through to. This is the ONLY page that opts out; do not spread the
  attribute without asking. Guarded by `card-page.test.ts`.

## The Smart Listing Assistant fills the form (2026-09-09)

### The assistant fills the form; the admin corrects by clearing and re-running — no review step

Owner, 2026-09-09: "get rid of the whole accept-edits buttons … and the huge
long explanations; it should simply fill out the form for me, maybe give me a
short note on anything it was not able to fill or not certain on … I'll clear
any field that's not correct and re-input." This supersedes the v15–v18
"confirmation" design (auto-apply only high-confidence blanks, hold sensitive
/ uncertain / overwriting values as pending cards with Accept / Keep).

- **Contract = `{ fields, notes }`.** No per-field confidence, no
  `assistant_message`, no `follow_up_questions`, no `review`. Notes are ≤ 5
  plain lines (`MAX_PRODUCT_AUTOFILL_NOTES`): what could not be filled, what is
  unsure. ⛔ Never a summary of what was filled — the form shows that.
- **Three rules, in `ITERATIVE_LISTING_CONTRACT`:** (1) a field still filled
  in `currentListingFields` is correct and comes back unchanged; (2) every
  empty field is filled from the photos + everything the admin has said;
  (3) an explicit statement or instruction in the latest input WINS over a
  filled field ("the weight is 4.2 grams", "shorten the title"). The owner
  chose (3) over "empty fields only" so a correction never has to be typed
  twice. The rules are model-enforced; the server enforces only coercion.
- **Every returned field is applied** (`applyAiDraftToForm(fields,
  PRODUCT_AUTOFILL_FIELD_KEYS)`) behind one snapshot — **Undo AI Fill** is the
  safety net, as it was in June 2026.
- **Only the admin's words travel between passes** (`priorInputs`); the
  assistant's own notes are not evidence and are never re-sent.
- **The panel is only what is necessary:** mic, textarea, one button
  (Generate → Update Listing), the notice line, notes + Undo. No auto-read
  checkbox, no read-aloud, no photo-only banner, no chat thread. Do not
  re-add any of it without the owner asking.
- **Why it also fixed the failures:** the review layer had pushed output to
  ~1100 tokens ≈ 30 s, straight into our own 30 s abort. Fill-the-form runs at
  ~450–500 tokens ≈ 12–13 s (measured).

### Our provider abort must sit under Netlify's real cap — which is 60 s for synchronous functions, not 26

The 2026-09-09 "AI generation failed" run was **our** `withTimeout` at 30 s
(`This operation was aborted`), while the Netlify function was alive and
logging at 32.4 s. Current Netlify docs: **synchronous 60 s · scheduled 30 s ·
background 15 min, none configurable.** `DEFAULT_TIMEOUT_MS` is 50 000 with
headroom, exported and tested to stay within 40–55 s; the abort throws a
sentence naming the seconds. ⛔ Never set a provider timeout at or above the
platform cap, and never below the p95 of the call it guards. The "26 s"
figure in the drip entry below came from a scheduled function and is retained
there as history.

### Rate limits count successes, never attempts

A failed or timed-out generation must not consume a slot: the 15/hour budget
was being burned by retries of a broken run, which would have turned a
timeout into an hour-long lockout with a different error text.
`ai-product-fill` records usage only after a coerced draft exists (defaults
30/hr · 100/day).

## Thumbnail rails on wide displays (2026-09-02)

### The rail fit must save and restore `scrollLeft` around its width re-measure

`fitWholeThumbnailCards` clears the track's inline width for one layout to
measure its parent. On any display wider than the whole strip (26 cards ≈
1880px — every 1920px monitor for the lightbox, ~2008px+ for the page rail)
that layout has no overflow and the browser clamps `scrollLeft` to 0 for
good; the eased navigation then started from the first thumbnail on every
click. ⛔ Keep the read-before-clear / restore-after-snap pair (guarded by
`product-gallery-fit-scroll.test.ts`). ⚠️ This class of bug is invisible on
laptops, in the in-app pane at its default size, and on reduced-motion
machines — test rail behaviour at the widest display the owner actually
uses, and record `prefers-reduced-motion` with every measurement. Detail:
`CHANGELOG.md` 2026-09-02 (late night).

## Admin on a phone (2026-09-02) — ⛔ THE WHOLE BATCH WAS REVERTED the same night; the entries below are FINDINGS, not shipped rules

Owner's instruction after four failed rounds on Safari mobile: revert to
the pre-batch editor and plan from evidence. What still governs:

- ⛔ **No phone-editor change ships again without being measured on the
  owner's real Safari first.** Every Chromium measurement (pane replicas,
  the real editor in the owner's desk Chrome) passed while Safari failed,
  four times. Chromium cannot stand in for WebKit on scroll geometry or
  touch handling. The plan (`features/admin-listing-editor-mobile.md`)
  starts with an instrumented build read on the phone.
- The public site keeps its zoomable viewport regardless of what the admin
  does later (WCAG 1.4.4 / Lighthouse a11y 100).
- If a hide-on-scroll row is ever built again: an in-flow collapse must
  have a "show" trigger that does not depend on scroll events (a collapsed
  form can stop being scrollable the moment the row hides — that is the
  "never comes back" the owner saw); an overlay must be verified on Safari
  for the all-accordions-collapsed case specifically.
- Chrome iOS puts its bottom toolbar over an `h-svh` modal; any future
  editor sizing must account for it (`--app-vh` / `visualViewport`, see
  the plan), independent of the Save-row work.

### Option B chosen (owner, 2026-09-02): the phone action row is ONE compact line, in flow, with a ⋯ sheet — no hide-on-scroll

`Cancel · Save · Save & Close · ⋯` on phones; `Clone / Undo / Save + Add
Another` live in the ⋯ sheet (rendered inside the modal, above the row).
Desktop keeps the full row. This reclaims ~120px permanently with no
scroll coupling, which is what the hide-on-scroll request was for. Two
implementation rules: (1) phone/desktop visibility uses unlayered
`[data-desktop-only]` / `[data-phone-only]` CSS, because the pills' own
unlayered `display` beats a layered Tailwind `max-md:hidden`; (2) the row
is reviewed by the owner on Safari via the LAN dev server
(`desktop-ssfdjdu.local` — nip.io failed on the phone; Turnstile needs an
FQDN and `.local` is one) BEFORE it ships, per the rule above. The
16px-fields zoom fix ships with it; the viewport lock and touch guards do
not. **Option B passed that review 2026-09-02.**

### Portaled overlays inside a clickable row must `stopPropagation` (2026-09-02)

`createPortal` moves DOM, not React ancestry: a click on a portaled
backdrop or menu still bubbles to its React parents. The products table
row has `onClick={handleProductRowClick}` (opens the product actions
modal for any target that is not a button/link/menuitem), so the row
action menu's backdrop — a plain `<div>`, now portaled to `<body>` so it
paints above the sticky cells — closed the menu AND opened the modal.
Rule: any overlay rendered from inside that row (or any other element
with a row-level click handler) stops propagation on its backdrop and its
container. Also required on iOS: `cursor: pointer` on a backdrop whose
listener is delegated at `<body>`, or Safari never emits the click; and
close on `click` only — never pointerdown/touchend, which removes the
backdrop before the click is dispatched and lets it fall through.

### Option C on top of B (owner, 2026-09-02): hide-on-scroll for an IN-FLOW row needs show triggers that are not scroll events

Hiding an in-flow row grows the scroll area; with a short form the content
then FITS, no scroll event can fire, and a scroll-only "show" rule leaves
the row gone for good (the follow-up-3 failure). Rule for any collapsing
in-flow control: show on scroll-up AND on a downward finger drag (native
passive `touchmove` on the scroller) AND on a short idle after a hide that
left `scrollHeight <= clientHeight` AND when a menu attached to it opens;
ignore scroll events for ~300ms after each toggle; never force "show at
the end". `overflow: hidden` only in the hidden state so an attached
popover above the row is not clipped. Phones only (`< 768px`).

### (reverted) The viewport zoom lock is `/admin/*` ONLY — never lift it to the public site

`src/app/[locale]/admin/layout.tsx` exports `maximumScale: 1, userScalable:
false`. That is acceptable for the owner's own tool and NOT for customers:
disabling zoom on public pages is a WCAG 1.4.4 failure and Lighthouse
a11y drops from the 100 the site holds. The source guard in
`admin-mobile-editor.test.ts` fails if `userScalable`/`maximumScale` ever
appears in `[locale]/layout.tsx` or `app/layout.tsx`.

### "Accidental zoom" on iOS is tap-to-zoom on sub-16px inputs, not a pinch

Any `input`/`select`/`textarea` under 16px auto-zooms iOS Safari on focus,
and `.form-field` is 14px. `user-scalable=no` does NOT stop it (iOS ignores
it). The fix that works is the input size: `.product-editor-modal :is(input,
select, textarea) { font-size: 1rem }` under `@media (hover: none)`, kept
UNLAYERED so a Tailwind `text-xs` on the same element cannot win. ⛔ Do not
"tidy" that rule into `@layer` — it stops working silently.
**Since 2026-09-20 (10) this is SITEWIDE:** one rule directly above the two
scoped ones — `@media (hover: none) { :is(input, select, textarea):not(checkbox,
radio, range, file, hidden) { font-size: 1rem !important } }`. `!important`
because a bare element rule loses to `.form-field` and to inline `fontSize`
(checkout discount code, 13px). A new form needs nothing; ⛔ do not give a
field an inline or `!important` size under 16px on touch screens. Desktop keeps
14px. Guard `ios-input-zoom.test.ts`. Only an iPhone proves it. Pinch and
double-tap are handled separately (`touch-action: manipulation` + the
non-passive two-finger `touchmove` guard in `AdminShell`, because React's
touch props are passive and `preventDefault` there is a no-op).

### ⛔ Never put `touch-action: pan-x pan-y` on an ANCESTOR of a scroller — use `manipulation`

Shipped for one deploy on the editor modal (2026-09-02) and on Safari
mobile the editor's body could not be scrolled at all until an accordion
changed the layout. WebKit is unreliable about nested overflow scrollers
under `pan-*` values applied above them; `manipulation` (all pans + pinch,
minus double-tap zoom) is the value that never breaks scrolling, and pinch
is cancelled in JS instead. `pan-x pan-y` on the scroller ITSELF (the
products table) is fine. Guarded by `admin-mobile-editor.test.ts`.

### ⛔ The editor's Save row is IN FLOW on phones and hides by COLLAPSING — never an overlay (2026-09-02, follow-up 3)

Three overlay variants shipped and failed the same day: the row
absolutely positioned over the body with the space beneath it reserved by
(a) `padding-bottom`, (b) `padding-bottom` with a 14rem fallback written
before first paint, (c) a `::after` flex-item spacer. On Safari mobile,
with every accordion collapsed, the editor could not scroll and the last
accordions were trapped under the row — every time — while the same
markup measured healthy in Chromium (pane replica AND the real editor in
the owner's Chrome). The pre-batch layout (row in flow) had worked on that
phone for months. Rule: the row keeps its own space below the scroll area;
hide = `max-height: 0` (+ paddings/border to 0 `!important`, because the
row carries inline safe-area padding and border-box max-height cannot go
below padding) with a small slide, so the scroll area grows into it. The
handler must ignore scroll events for ~300 ms after a toggle (the browser
re-clamps `scrollTop` when the area changes) and must NOT force the row
visible at the end (it would oscillate against the growth). ⚠️ If a future
change reintroduces an overlay, it must be verified on real Safari before
it ships — Chromium cannot see this class of failure. Guarded by
`admin-mobile-editor.test.ts`.

### (superseded 2026-09-02 by the rule above — kept for the Safari facts) Overlaid controls must reserve their space from the FIRST painted frame — and as a flex ITEM, never `padding-bottom`

The Save row overlays the editor body on phones, so the body reserves the
row's height below its content. Two rules, each learned from a live
failure on 2026-09-02:

1. ⛔ **Never reserve it with `padding-bottom` on the scroll container.**
   The body is `display: flex; flex-direction: column; overflow-y: auto`,
   and **Safari (incl. iOS) discards the block-end padding of such a
   container** — Chrome honours it, so every desktop measurement and the
   pane replica looked healthy while the owner's phone had no reserved
   space at all: with every accordion collapsed nothing scrolled and the
   last accordions were trapped under the row. The space is
   `.product-editor-body::after { flex: none; height: … }`, which every
   engine counts in `scrollHeight`. Guarded by `admin-mobile-editor.test.ts`.
2. The height is written straight to the DOM in a `useLayoutEffect` (not
   via React state after a ResizeObserver), and the CSS fallback is a
   generous `14rem`, not `0px`, so the space exists on the first painted
   frame and even before JS. Too much costs blank scroll room; too little
   traps content.

⚠️ Measurement lesson: a scroll-geometry claim verified only in Chromium
is not verified for the owner's phone. When Safari is the reporting
engine, prefer constructs with no known WebKit divergence (real elements
over end-padding, explicit heights over intrinsic ones) and let the owner
confirm.

### The editor's Save row overlays and hides on scroll on PHONES only

Owner-requested, mockup-approved 2026-09-02. Below 768px
`.product-editor-footer` is absolute at the modal's bottom and translates
away after 12px of downward scroll, returning on 4px up and at either end
of the form; the body pads by a ResizeObserver-measured
`--editor-footer-h` so the last field is never trapped under it. Desktop
keeps the row in flow with no animation — a mouse wheel does not need the
space back. ⛔ Keep the "always shown at the bottom" rule: without it the
final field and the Save buttons are unreachable together on a short form.

## Media & hero loading (2026-08-31)

### Every Storage upload sets `cacheControl: '31536000'` — the CDN TTL IS the object metadata

Netlify's image CDN derives each transformed `/_next/image` response's
`Cache-Control` from the SOURCE object's stored `cacheControl` metadata, set
per object at upload time. Three traps proven the hard way: (1)
`images.minimumCacheTTL` in `next.config.ts` is a **no-op on Netlify** — the
2026-08-23 change never took effect in production; (2) the public Supabase
endpoint reports `Cache-Control: no-cache` for EVERY object regardless of its
metadata, so origin headers cannot distinguish good from bad — probe a
**fresh** `/_next/image` variant's `max-age` instead; (3) the supabase-js
default (`3600`) makes transforms expire hourly, which on a low-traffic site
means nearly every real visitor pays a cold derive. All 942 `product-images`
objects were backfilled to `31536000` on 2026-08-31 (197 re-uploaded
byte-identical, sha256-verified). Safe because upload filenames are
timestamped-unique — a replaced photo is a new URL. ⛔ Any new upload path or
bulk re-upload script MUST pass `cacheControl: '31536000'`.

### Hero reveal gates wait on the FIRST TWO card images + `decode()` — and the 1800 ms cap is untouchable

The blank-second-card symptom survived both the fetchPriority fix and the
cache backfill because the reveal gates (inline `nej-hero-go` script in
`(home)/page.tsx` + React gate in `HomeHero.tsx` — comments on both demand
they stay in step) waited on ALL 8 ring images, and on cold/stale loads the
slowest of eight always lost to the 1800 ms cap. Both gates now wait on the
first two card images only (the cards facing the visitor at reveal, both
preloaded high/auto) and await `img.decode()` so a loaded-but-undecoded frame
cannot paint blank. Deployed + owner-confirmed on a genuinely COLD load.
⛔ Never raise the 1800 ms cap (PSI mobile goes bimodal with a 9 s hero LCP —
2026-08-23) and never re-widen the gates to all slots. Reserve lever if a
slow connection still misses: slot 1 → `fetchPriority: 'high'`, only with
multi-run PSI evidence. ℹ️ A warm-load confirmation proves NOTHING about this
class of bug — only a cold load exercises the race (burned twice).

## SEO & GBP (2026-08-30)

### /sell/naples owns the buyer-noun family — never re-duplicate the homepage title

The Naples city page's templated title was two words away from the homepage's,
and GSC showed Google splitting the same queries across both (homepage 18.3 /
city page 49.6). The split is now deliberate: **homepage = sell-verb ("Sell
Jewelry, Gold & Silver in Naples"), /sell/naples = buyer-noun ("Jewelry Buyers
in Naples, FL"), /estate-jewelry = "Estate Jewelry Buyer"**. Implemented as
optional per-city override fields in `service-areas.ts` set ONLY on Naples —
the other five cities keep the template, because that template renders the
site's best-ranking pages. ⛔ Do not "harmonize" these titles back together,
and do not add overrides to other cities without the same evidence of a split.

### Premium-pattern framing: top tier only, and never discount the rest (owner rule)

Owner, 2026-08-30: only certain Tiffany and top-top-tier names (Georg Jensen
caliber) genuinely carry collector premiums — but copy must not negatively
price-anchor ordinary sets either, because that drives sellers away before
they come in. The wording that satisfies both: *"a small top tier — patterns
such as Tiffany Chrysanthemum, Georg Jensen — can carry genuine collector
premiums… we check every set against the collector market before we price it
as silver."* Used on `/silver-services/flatware-value`. ℹ️ The older
/silver-services card naming six makers (approved 2026-08-29) predates this
rule; aligning it is an open owner decision in `TASKS.md` — do not silently
rewrite it.

### /jewelry-appraisal: we do NOT sell written insurance appraisals — the honesty IS the differentiator

Owner decision 2026-08-30 ("build it, b"): the page says plainly that we do
free verbal market appraisals backed by a real offer, and REFER written
insurance appraisals to certified independent appraisers. ⛔ Do not soften
this into "we do everything" — the contrast with fee-based appraisers is the
page's positioning, and the GBP holds the appraisal pack slot it supports.

### Lab-grown diamonds: we buy them, priced against their (much lower) resale market

Owner decision 2026-08-30 ("a"): lab-grown stones can be bought at their much
lower resale value. On 2026-09-10 the owner requested removal of the broad
lab-grown marketing FAQ to emphasize estate jewelry, gold and sterling.
That FAQ requirement is superseded; the buying policy is not reversed. Keep
honest resale-versus-insurance-value explanations and invite callers with loose
stones to discuss them before travelling. Do not invent a refusal or minimum-value policy.

### GBP operational facts worth not re-discovering

- **Public Q&A is retired on this listing** (only "Ask Maps" remains, checked
  on both Search and Maps 2026-08-30). Seed FAQs on the site instead.
- GBP post images reject WebP — convert to JPG first.
- **Post photos: match the canvas to the surface's crop, never hand the
  platform a bare portrait shot.** GBP crops post photos to a WIDE box, Yelp
  to a 9:16 fullscreen whose TILES crop a centre square. Recipe used
  2026-09-11 for the same source photo: for GBP, the photo uncropped and
  centred on a 2500×1600 canvas; for Yelp, the photo scaled to fit the
  centre square of a 1302×2315 canvas. Both fill the remainder with the
  photo blown up, Gaussian-blurred ~45 and dimmed to 0.55–0.72. Pillow
  script pattern; always render the platform's crop locally and LOOK before
  uploading.
- **GBP photos have no caption field on desktop.** Checked 2026-09-11 in the
  owner's account: opening an uploaded photo in Business Profile Manager
  offers exactly one action, "Delete photo" — no caption, title or edit.
  The owner typed a caption while uploading and it did NOT apply, so the
  mobile caption box does not caption a business photo either. On the live
  profile an owner photo carries only "Photo · <month year>" — there is no
  caption line in the layout to render one. Google's current help page for
  managing Business Profile photos documents no caption feature at all.
  ⛔ Do not spend time hunting for this setting. Put the words in a POST
  (which has a description and a Call now button) beside the same photo.
  New photos also take 24–48 h to appear, so judge visibility a day later.
- ⛔ **No phone number anywhere in GBP post text** (Google: "we do not allow
  your post content to include a phone number"; the 08-30 post was removed
  and posting turned off for days). Use the **Call now** button. Also keep
  addresses, emails and URLs out of the text; never hide a number in the image.
- GBP's post preview is a wide box (~1.56:1). A portrait photo gets its
  top or bottom cut off — place it uncropped on a wide JPG canvas with
  blurred sides (done 2026-09-11) and check the composer preview.
- The post composer in Business Profile Manager is an iframe the Chrome
  tools cannot reach; open the frame's own URL as the page to attach files.
- Profile edits publish through a "pending review, up to ~1 day" state;
  services/categories/date all went through same-day.
- Google previously REJECTED the two wheelchair-accessibility attributes;
  leave them alone.
- Opening date is set to **January 2010** (owner gave the year; month is a
  required field and January was the neutral default — adjust only with a
  real month from the owner).

## Media (2026-08-30)

### `canvas.toBlob` silently returns PNG — the requested type is a REQUEST, not a result

⛔ **Never trust the `type` argument you passed to `toBlob`.** The spec says a
user agent that cannot encode the requested type falls back to `image/png`, with
no error and no warning. The upload path asked for `'image/webp'`, never read
`blob.type`, and hardcoded both a `.webp` filename and
`contentType: 'image/webp'` — so **PNG bytes were stored under WebP names for
months**, defeating the image optimizer and every audit that trusted the
extension.

**The rule: `blob.type` is the only truth.** Compare it to what you asked for,
and label the upload from the blob — never from intent. `src/lib/image-encode.ts`
owns this; both `AdminShell` encode sites go through it.

⛔ **The fallback must be JPEG, not PNG.** These are photographs: at 2048px a
lossless PNG is 1–3 MB against 20–60 KB for WebP and ~10× smaller than PNG for
JPEG. PNG is never an acceptable product-photo format here.

⚠️ **An intention in `AGENTS.md` is not a guarantee.** The optimization defaults
already said uploads must "encode to WebP with a longest-edge cap near 2048px".
The cap was honoured (files really were 2048px) and the encode silently was not.
A format requirement needs a *verification step*, not just a stated default.

### Measuring delivered image bytes: two traps that both give confident wrong answers

Both were hit on 2026-08-30, and each produced a stated conclusion that was
wrong.

1. ⛔ **A plain `curl` sends `Accept: */*`**, so an image CDN returns the
   unoptimized original — 2.3 MB reported where a browser receives 221 KB.
   Always send `Accept: image/avif,image/webp,...`.
2. ⛔ **`src` is a FALLBACK, not what the browser fetches.** Browsers use
   `srcset` + `sizes`. This site's `src` is `w=3840` while the real request is
   `w=640` — so measuring `src` measures bytes nobody downloads, and comparing
   `src` bytes against a `w=640` re-encode is not like-for-like.

**Resolve `sizes` to the actual width first, then measure with browser `Accept`
headers.** Anything else is not user impact.

⚠️ **And `extractChannel(3).stats()` does NOT return the alpha channel** — it
returns channel 0 (red). Reading it as alpha reported `min=0` on fully-opaque
images, which looks exactly like real transparency and nearly aborted a correct
1 GB repair. Use `stats.isOpaque`, or `stats.channels[3]`.

ℹ️ To separate "this photo is genuinely detailed" from "this source is wrong",
re-encode the real source **at the delivered width** and compare like with like.

## Buy-Side Channels (2026-08-30)

### ⛔ No mail-in / "ship us your items" page — REJECTED, do not re-propose

Proposed 2026-08-30 (a page explaining that customers nationwide can ship items
in, with immediate payout). **Owner rejected it after the research below.** Two
independent reasons, either one sufficient:

**1. Florida licenses it as a separate business class.** Ch. 538 **Part III**
(§538.31–.37) covers any FL business that contracts to buy precious metals or
jewelry "through an Internet website, the United States mail, or telemarketing".
It is a distinct registration from a standard secondhand dealer license
(Form DR-1S). It also carries real operating duties: the seller's government ID
number on file, a **sworn statement under penalty of perjury** before payment,
transaction reporting to law enforcement **within 24 hours**, 2-year record
retention, a **10-day hold** before resale, and — §538.33 — payment restricted
to **check to a lawful bank account or a licensed money services business**, so
**cash is not permitted** on a mail-in deal.

**2. The site already argues the opposite, in indexed copy.** A mail-in page
would have contradicted shipped production content:

- `sell/[city]/page.tsx:110` — *"We test and weigh everything in front of you —
  no mailing off your valuables."* (6 cities × 2 locales = 12 live pages)
- `sell/[city]/page.tsx:126` — *"typically more than a pawn shop or mail-in
  buyer"*, which is emitted into **FAQPage JSON-LD**, so it is in Google's index
- `PROJECT_OVERVIEW.md:24` names national mail-in buyers as the competitor the
  brand is positioned against
- sitewide `JewelryStore` `areaServed` lists exactly six Florida cities

⚠️ **If it is ever revisited**, the license is the gating question, not the
copy — and the copy sweep is 12+ pages plus schema, not a new route. A smaller
alternative was offered (an "I don't live in Naples" FAQ item + a `/sell` band,
needing no license) and was **also declined**; the owner chose to leave the
local positioning alone.

## Layout (2026-08-30)

### `SiteFooter`'s `locale` prop is REQUIRED — never give it a default again

`SiteFooter({ locale = 'en' })` silently degraded: omit the prop on a `/es`
page and the footer rendered English labels **and stripped `/es` from all 22
hrefs**, ejecting the visitor into the English site. It failed invisibly — the
page still built, still rendered, still passed tests. Five pages carried this
for an unknown length of time.

Both halves fixed 2026-08-30: the five call sites, then the signature itself
(`locale: string`, no default). A missing prop is now **TS2741 at the call
site** — mutation-tested by removing it from `bullion/page.tsx` and confirming
the error, then reverting.

⛔ **Do not reintroduce a default.** The compile error is the only check that
catches this class of bug; a default converts it back into silent breakage.

ℹ️ Making it required cost nothing, because all 21 call sites already passed
`locale={locale}` — the five broken ones were the only holdouts, and
`LegalPolicyPage` already required `locale` itself. An earlier note in this
file called the change a "build-wide refactor" and deferred it; **that
assessment was wrong** and the enumeration disproved it. Enumerate call sites
before sizing a signature change.

⚠️ A locale bug in *chrome* is invisible to page-level tests — nothing in the
1176-test suite caught it. It was found by parsing fetched HTML and counting
`/es`-prefixed footer hrefs against a known-good page. The first attempt at
that count was WRONG, because `'/estate-jewelry'.startsWith('/es')` is true.
Match `'/es'` exactly or `'/es/'`.

ℹ️ `/account/sign-in` legitimately renders no footer, so a footer audit must
treat "no footer element" as a signal to check for a redirect, not a failure.

### A locale assertion about CHROME must be scoped to that chrome element

⛔ Never verify a footer claim with a whole-page grep. Checking production
after the fix above with a page-wide `href="/es/` count produced **two
simultaneous false failures**: `/es/*` read 24 instead of 22 (header nav adds
`/es/sell`, `/es/bullion`, `/es/services`) and English pages read 1 instead of
0 (the **language switcher**, which every English page correctly has). Both
read as a failed deploy; the deploy was fine.

⚠️ **"An English page has zero `/es/` links" is FALSE as stated** — it is true
only of the footer. Any check phrased that way will manufacture a regression.
Extract the element first (`sed -n 's/.*<footer/<footer/p'`, or
`querySelector('footer')` in the browser), then count. Working command in
`TASKS.md`.

## Buy-Side Content Strategy (2026-08-29)

### Deep educational content lives ONCE, on the hub — never templated across city pages

The karat table, melt math, and before-you-sell guidance live on `/sell` only.
The six `/sell/[city]` pages measured **69% verbatim-identical** to each other
(sentence-level, city name normalised); adding shared content raises that
ratio. ⛔ Do not "finish the job" by copying the guide into the city template.

### The city template renders the WINNERS — restructure it never, extend it via data only

`sell/[city]/page.tsx` renders 12 pages at once, including the site's
best-ranking pages (`/es/sell/cape-coral` pos ~5, `/es/sell/bonita-springs`
~9). City differentiation goes into `service-areas.ts` intro strings (done
2026-08-29 with verifiable local grounding — Art District, drive times,
community character). ⛔ No invented customer history — "what people in X bring
us" claims require the owner's word first.

### /silver-services is the striking-distance page — content effort goes there before /sell/naples

At position ~12 it can plausibly reach page 1; `/sell/naples` at ~52 cannot be
copywritten onto page 1 (that ceiling is backlinks/authority). The flatware
band (silverplate marks, patterns-beat-melt with the owner-confirmed
"price both ways, pay the higher" claim, weighted pieces) exists for this.

### The homepage H1 says "Sterling", not "Sterling Silver" — decided on evidence 2026-09-01

Owner asked whether spelling it out would help SEO. **No, and it would cost a
line.** Search Console (16 months, `.com` URL-prefix property): queries
containing "sterling" = 15 impressions / 0 clicks, across three queries that
ALL already contain "silver" as a separate word — no bare-"sterling" query
reaches the site. Queries containing "silver" = 68 / 1, and by landing page
`/silver-services` takes 22 against the homepage's 8: the dedicated page
already owns the phrase (its title has carried it since 08-16). Meanwhile the
H1's character count is load-bearing (`HomeHeroOverlay.tsx` comment block):
46 chars is 2 lines on desktop only via the 72rem widening and already 3 on
phones; the documented 4-line threshold is ~48. "Sterling Silver" is 53.
⛔ Do not re-propose this from a keyword-density instinct; re-open it only
with new GSC evidence of bare-"sterling" queries, and re-measure the line
count first. "Sterling" alone is standard trade shorthand next to "Gold" and
"Jewelry Buyers"; Google's disambiguation does not need the second word.

### Every sibling sell page links to /silver-services once, in context — except /free-evaluation

Established 2026-09-01 after mapping the inbound graph. The 08-30/31 pages
had the crossover; the older ones (`/bullion`, `/gold-services`,
`/estate-jewelry`, `/faq`, `/about`, `/trade-in`) mentioned sterling without
linking it, and `/estate-jewelry` — the top-nav Sell target — never mentioned
silver at all. Rules that came out of it:

- **One contextual link per page, anchors varied** ("sterling silver",
  "sterling silver flatware", "…flatware and hollowware"), never the identical
  phrase six times. Nav + footer do not count as the contextual link.
- ⛔ **`/free-evaluation` gets NO outbound category links** even though it
  names sterling twice. It is the sendable landing page whose sorting detail
  is the substance (entry above); a link out is a leak from the funnel.
- **Copy that also feeds JSON-LD or a data array is never forked into JSX to
  add a link.** Use `components/LinkedPhrase.tsx` (`lib/link-phrase.ts`): it
  locates the literal phrase at render and links only that span, falling back
  to plain text if the phrase is reworded away. `/faq`'s items-we-buy answer
  and `/trade-in`'s step 1 use it. The alternative — a second copy of the
  sentence — is exactly how visible text drifts from the schema.
- **The homepage services strip is a design-gated change**, not a text edit:
  its cards are real `<h2>`s with deliberate "in Naples" headings. The
  fourth card — "We Buy Sterling Silver in Naples" → `/silver-services` —
  was mocked up, chosen by the owner (B over an inline link), and built
  2026-09-01. ℹ️ The 08-30 deferral of a homepage→silver link was about the
  HERO's BUY card (a stretched link — nested anchors break it); the strip
  cards are plain `<div>`s with one `<Link>`, so that objection does not
  apply there. LCP re-measurement after deploy does.

### The brand mark is the octopus, everywhere — including the JSON-LD `logo`; the "Naples Jewelry Buyers" artwork is gone

Owner, 2026-09-01: *"switch the logo… remove the naples jewelry buyers logo
entirely from this site."* Until then the sitewide JewelryStore `logo` (and
every `/sell/[city]` copy of it) pointed at `branding/logo.webp`, a 160×160
"Naples Jewelry Buyers" artwork — a different trading name, the one already
removed from `sameAs` on 08-28 — so Google was being told this business's
logo was another brand's. Now: `logo` = `/assets/images/branding/nav-logo.webp`
(the octopus the header and favicon use; 157×120 clears the 112px minimum),
`logo.webp` deleted, the `/logo.png` legacy redirect repointed.

- ⛔ Never reintroduce a "Naples Jewelry Buyers" or "Naples Antiques" mark
  as this site's logo, favicon, social card, or schema image. The brand is
  "Naples Estate Jewelry" (no "Co"), and its mark is the octopus.
- `logo2.webp` ("Naples Antiques & Estate Jewelry" wordmark) still exists
  only because the owner did not ask for it to go; it is reached solely by
  the `/logo2.png` legacy redirect. Remove on request.
- Upgrade path: a larger square octopus (+ wordmark) for schema and social
  previews, supplied by the owner — do not upscale the 157px source.

### `/watch-buyers` exists — every buy category now has a lander, and city cards link to all six

Built and approved 2026-09-01. Claims on it are limited to what the site
already said (city cards, `/free-evaluation`, the FAQ's signed-brand list)
plus objective secondary-market facts; add specifics (authentication
tooling, brand preferences, quartz/fashion watches) only with the owner's
word. The `/sell/[city]` watch card's `href: null` special case is gone —
if a category card ever needs to be unlinked again, that is a decision to
record here, not a silent `null`.

### Every sitemap page carries BreadcrumbList JSON-LD via ONE helper; the business schema has ONE name and no aliases

Decided 2026-09-02 after the owner asked why a competitor's brand search
shows Google sitelinks and ours does not. Sitelinks cannot be requested;
Google grants them algorithmically for navigational (brand) queries, and
its stated inputs are a clear page hierarchy, compact distinct titles, and
consistent internal links. "Naples estate jewelry" also reads as a generic
local query (ads + Yelp lists around us), so sitelinks may never show on
that phrase — this batch fixes the signals we control, not the query.

- **Breadcrumb schema is sitewide.** `lib/breadcrumb-ld.ts` builds the one
  shape (Home → parent → page, absolute URLs, `/es` prefix applied once);
  `components/BreadcrumbJsonLd.tsx` emits it. Every page in `sitemap.ts`
  except the homepage carries it, plus every product page; `LegalPolicyPage`
  takes a `path` prop for the six legal pages. Pages NOT in the sitemap
  (`/unsubscribe`, the noindex `shop-modern` preview) deliberately don't.
- **A VISIBLE trail accompanies the schema on every one of those pages**
  (`components/BreadcrumbTrail.tsx`, approved from a mockup the same day —
  Google's guideline is that breadcrumb markup reflect a trail the visitor
  can see). Rules: it renders from the SAME crumbs / LD object as the
  schema (`BreadcrumbTrail` for helper pages, `BreadcrumbTrailFromLd` for
  the hand-written ones) so the two cannot disagree; it sits directly
  above the eyebrow label of the opening section (contact: a slim strip at
  the top of `<main>`; shop list: top of the container; product page: above
  the back link; legal: inside the header card); `tone="dark"` on dark
  heroes, `"light"` on light sections; `align="center"` inside centered
  heroes; earlier crumbs are links, the current page is plain text with
  `aria-current="page"`; ⛔ never on the homepage; ⛔ no change to the
  header or its offset (hero heights and the PSI baseline are untouched).
  A new page gets both pieces or neither.
- **Crumb names are the page's short name, and a parent's name is the same
  on every page that cites it**: `/gold-services` = "Sell Gold" / "Vender
  Oro", `/silver-services` = "Sell Sterling Silver" / "Vender Plata
  Esterlina", `/estate-services` = "Estate Services" / "Servicios de
  Patrimonio", `/shop` = "Shop" / "Tienda", `/sell` = "Sell" / "Vender".
  New pages: use the helper, and pick the parent name from the parent's
  own crumb, never a new wording.
- ⛔ **No `alternateName` on the JewelryStore schema.** "Naples Jewelry
  Buyers" and "Naples Gold & Silver Buyer" were dropped (owner: "drop the
  aliases"). Google settles on ONE name per entity before it shows a site
  name or sitelinks; aliases work against that. The name is "Naples Estate
  Jewelry" — no "Co", no trading names, no legal-entity name.

### Guide pages live UNDER their parent service page, use the flatware-value template, and may only say what the site already says

Decided 2026-09-01 (owner: "what do you think about building out guide
pages for seo?" → "start the gold-worth pilot and all the rest"). Three
shipped in the 09-02 batch: `/gold-services/what-is-my-gold-worth`,
`/jewelry-appraisal/hallmarks`, `/estate-services/selling-inherited-jewelry`,
after `/silver-services/flatware-value` (08-30) proved the shape.

- **URL = parent path + topic slug.** A guide is nested under the service
  page it feeds (`/gold-services/…`, not `/guides/…` or `/blog/…`), so the
  breadcrumb, the internal-link path and the URL all say the same thing,
  and the parent lander stays the page that ranks for the money query.
- **Template:** hero with the clay mark → tables/cards that answer the
  question → worked math or ordered steps → the "worth more than melt /
  don't touch it first" turn → exactly one FAQ block (FAQPage schema, five
  questions) → one CTA to `/free-evaluation`. BreadcrumbList schema Home →
  parent → guide. Titles ≤ 60 with the brand suffix; EN descriptions ≤ 160.
- **Linking:** one guide-link line on the parent page and on `/sell`;
  guides cross-link each other. ⛔ Not in the footer (service landers only)
  and not on the homepage strip.
- ⛔ **Claims are limited to copy the site already ships or objective,
  checkable facts** (karat purities, the 925 standard, EPNS = plate). No
  pricing method, tooling, or brand preference the owner has not stated.
  Legal questions (probate, who may sell an estate's jewelry) are deferred
  to the family's attorney — never answered on the site. Written insurance
  appraisals stay "referred out" (see the 08-30 appraisal-page rule).
- **Photos of hallmarks must come from the shop's own bench.** Until the
  owner supplies them the guides use text tables only — no stock or scraped
  images of other makers' marks.
- **Owner reads the FAQ answers before push** — same rule as `/watch-buyers`.
  Done for all three on 2026-09-02; the owner's corrections are the facts
  below and override anything the site said before.
- ⛔ **Dental gold is never priced on the spot.** Owner, 2026-09-02: *"we
  have to send it off for testing to test the exact karat before we buy. I
  cannot determine the exact karat in store."* Any page, FAQ, GBP answer, or
  assistant prompt that mentions dental gold must say it is sent out for
  testing first and the offer follows the result — never "tested and paid
  in front of you" like jewelry gold.
- **Karat marks the guides must carry** (owner, same day): the low and
  obscure standards — 8k/333, 9k/375 (British, Irish, Australian; real gold
  below the US 10k minimum), 12k, 15k (older British), 20k, 21k, 23k
  (Middle Eastern / Thai) — plus the two marks customers misread most:
  **"14K HGE / 18K HGE" is heavy gold electroplate** (the karat describes
  the plating; no melt value) and **"14KP" is karat PLUMB, not plated**
  (exactly 14k, not a minimum). Both guides state these identically; keep
  them in sync if either changes.

### Column counts on a `CardGrid` are pinned with an UNLAYERED rule in `globals.css`, never a `grid-cols-*` utility

Found 2026-09-01 while adding the fourth services-strip card: the strip's
`md:grid-cols-3` had **never applied**. A CSSOM walk grouped by cascade
layer shows `.responsive-card-grid` (and `.responsive-grid`) are
**unlayered**, while every Tailwind `grid-cols-*` utility lives in
`@layer utilities` — and an unlayered declaration beats a layered one no
matter its order in the file or its specificity. The strip had always been
pure auto-fit; three columns was simply what auto-fit chose for three
cards. Four cards made it visible: auto-fit picks **3 tracks in the
~850–1150px band and strands the fourth alone**, measured at 900 and 1024.

The reviews grid hit exactly this in August and answered it with its own
unlayered `.testimonial-grid` ladder — that is the pattern:
`.home-services-grid` now pins the strip 1 / 2 / 4 (phones / ≥640px /
≥1024px). ⛔ Do not "simplify" either back to a utility class; it will look
like it works at whatever width you happen to check and be inert. If a
grid needs pinned columns, add a named unlayered rule beside those two.
⚠️ A related trap: after editing `globals.css` the new rule can be **absent
from every served stylesheet** in dev until the server is restarted
(Turbopack CSS staleness) — check the production bundle or restart before
concluding the CSS is wrong.

### Bing gets IndexNow pushes after every URL-changing deploy; the key is public by design

Decided 2026-09-01 after the BWT import showed ~15 of 198 URLs indexed and
the city pages uncrawled. Bing's own crawl of a small property is slow;
IndexNow is the sanctioned push (one POST fans out to Bing, Yandex, Seznam,
Naver). The pieces: `public/<key>.txt` at the site root, `txt` in the
`proxy.ts` matcher exclusions (a `.txt` URL never has a locale meaning —
without that the key file would be locale-rewritten and Bing could never
verify), and `npm run indexnow` (`scripts/indexnow-submit.mjs`), which reads
the LIVE sitemap and refuses to submit until it has read the key back from
production.

- ⛔ **The key is not a secret** — the protocol requires it to be readable
  at `keyLocation`. Do not move it to `.env`/Netlify; do not "fix" the
  public file. Rotating it means a new file + the constant in the script.
- **Run `npm run indexnow` after any deploy that adds, removes or retitles
  URLs.** The sitemap already drops sold products, so a run after a sale
  batch tells Bing to drop them too.
- Bing's manual "Request indexing" (URL Inspection) had a **100/day** quota
  on 2026-09-01 — far more generous than GSC's ~10 — and is driven fastest
  via `urlinspection?urlToInspect=<double-URL-encoded>` deep links.
- ⛔ **A page Bing fetches before its deploy lands is recorded as
  `noindex`** — the not-found page carries `<meta name="robots"
  content="noindex">` (correct), and Bing keeps that verdict until it
  re-fetches. `/jewelry-appraisal` and `/diamond-buyers` sat on "Indexing
  allowed: No" from a 31 Aug 10:36 crawl for a day. So: **the same day any
  deploy adds pages, request indexing for them in BWT or run
  `npm run indexnow`.** The sitemap alone does not un-stick them quickly.
- ℹ️ Automatic pings from the product-status hooks would be the next step;
  not built — it touches the payment-path hooks (see the `after()` rules).

### GSC Request Indexing quota: assume ~10/day, property-wide, HARSHER than rolling-24h

Confirmed across 3 days: shared across properties of the same site, and failed
attempts appear to extend the block. **Submit one URL first; continue only if
it succeeds.** The toast auto-dismisses in ~20 s — the durable success signal
is the button row flipping to "✓ Indexing requested". Manual requests are an
accelerator only: 2 of 19 product pages indexed organically with no request.

## Crawling & Indexing

### A page that can say `noindex` must NEVER also be blocked in `robots.txt`

Decided 2026-08-27 after finding `/account` and `/checkout` carrying both.
They are not belt-and-suspenders — they **cancel each other**. `robots.txt`
blocks the *fetch*; `noindex` is read *from the fetched page*. Block the fetch
and Googlebot can never see the tag, so the tag does nothing and the URL stays
eligible to be indexed from an inbound link, with no way for us to remove it.

The rule, in order of preference:

1. The route can render metadata → give it `robots: { index: false }` and
   **leave it out of `robots.txt`**. Let Google crawl it and obey the tag.
2. The route cannot render metadata (`/api`, a non-HTML asset) or genuinely
   must not be fetched at all → `robots.txt` is the only tool, and the page
   must not pretend to carry a `noindex`.

`robots.txt` therefore keeps only `/admin`, `/api`, `/shop-modern`,
`/en/admin`, `/es/admin`.

⛔ **`/admin` is the trap.** Inspecting it logged-out shows a `noindex`, but
that comes from the `/account/sign-in` page it redirects to — `admin/page.tsx`
declares `{ title: 'Admin - Products' }` and no robots directive. It has no
`noindex` of its own, so it stays blocked. Verify by reading the route's
metadata, never by curling the redirect target.

### Query-parameter URLs are controlled by canonical + `nofollow`, never by `robots.txt`

The product page generates one `/contact?item=<title>` URL per product per
locale; Google had crawled 127 of them. They resolve to `/contact` via its
canonical, which is *correct and working* — Google reports them as "Alternate
page with proper canonical tag", not as duplicates.

⛔ **Never add `Disallow: /contact?item=`.** Blocking the crawl removes
Google's ability to read the canonical that is doing the consolidation, which
can leave the variants indexed URL-only and competing with the real
`/contact`. This is the same failure as the `/account` rule above.

The chosen control is `rel="nofollow"` on the two inquire links
(`shop/[id]/page.tsx`). It is a hint, not a directive, and it does not
retroactively remove URLs already discovered — that is accepted. `/contact`
keeps 12 plain follow links including SiteHeader and SiteFooter, so it loses
no internal link equity.

⛔ **Do not move `item` to a URL fragment** to make the URLs disappear.
`/contact` reads the param **server-side** and passes it to `InquiryForm` for
prefill; a fragment never reaches the server, so the prefill would have to move
client-side — trading a working conversion path for a cosmetic crawl gain.

ℹ️ **Crawl budget is not a real constraint on this site.** ~400 URLs against
10.4K crawl requests per 90 days; the 127 parameter URLs are ~1.2% of that.
Google does not meaningfully ration crawl below ~10k URLs. Do not justify
future changes as "saving crawl budget" here.

### Every language version gets its OWN `<url>` entry in the sitemap

Decided 2026-08-27. Listing only the English URL and hanging Spanish off it as
an alternate is supported by Google but is the weaker pattern, and it meant the
best-ranking pages on the site were never submitted at all. `sitemap.ts` emits
one `<url>` per locale per path, each carrying the identical `en` / `es` /
`x-default` alternate set.

⛔ **The `noindex` filter must skip BOTH locales.** The six Spanish legal pages
carry the same `noindex` as the English ones, so a filter that only pruned the
English path would submit `/es/privacy` and friends — the same
sitemap-contradicts-the-page-header bug, doubled.

⛔ **Never emit an `/en` prefix.** It is not a route; it 307-redirects to the
bare path and only adds crawl noise.

ℹ️ Submitting more URLs raises GSC's "not indexed" count until Google crawls
them. That is arithmetic, not a regression — do not "fix" it by reverting.

### Judge product state by JSON-LD `availability`, never by grepping for "sold"

A text grep for `sold` matches all product pages regardless of state — the word
appears elsewhere in the markup — and on 2026-08-27 it nearly confirmed a false
theory that 20 unindexed products had been sold. The authoritative signal is
`"availability":"https://schema.org/InStock"` vs `.../SoldOut` in the page's own
JSON-LD, which is also exactly what Google reads.

Related, and worth not re-learning: **a sold product stays indexed.** Being
`SoldOut` does not cause "Discovered - currently not indexed"; sold pages
remain 200 and keep their index entry, and only drop out of `sitemap.xml`.

### Search Console: the "no access" screen does not mean a permissions problem

GSC renders the identical *"Oops, you don't have access to this property"* page
whether the account lacks permission **or** the property simply does not exist.
On 2026-08-27 that cost a wrong diagnosis: the account was a verified owner of
`https://naplesestatejewelry.com/` the whole time, and the failing URL was a
`sc-domain:` property that had never been created. Check the property picker
before concluding anything about access.

The site now has both a URL-prefix property (`https://naplesestatejewelry.com/`,
added Aug 2, holds all history) and a Domain property
(`sc-domain:naplesestatejewelry.com`, added Aug 27). Overlap is by design and
is not a conflict. ⚠️ Both verify off the same `google-site-verification` TXT
in the `.com` zone — **deleting that record breaks both**, in a zone that also
carries live Workspace MX, root SPF and `p=quarantine` DMARC.

ℹ️ **Request Indexing quota is per SITE, not per property** — roughly 10/day.
Adding a second property does not buy more; both return "Quota Exceeded"
together.

### Two `.com` properties (URL-prefix + Domain) are the recommended setup — they do not hurt (confirmed 2026-09-03)

Owner asked whether having both `https://naplesestatejewelry.com/` and
`sc-domain:naplesestatejewelry.com` is hurting the site. **No.** Search
Console properties are read-only *views* of Google's index; ranking,
crawling and indexing do not know how many properties observe a site. There
is no duplicate-content or split-signal effect. Google itself recommends a
Domain property (it is the superset: http, https, www, every subdomain) and
a URL-prefix property may coexist. What differs between ours:

- **History:** the URL-prefix property has data from Aug 2, 2026; the Domain
  property only from Aug 26. Read history in the URL-prefix property.
- **Settings:** "Search generative AI" is set to **Include** on the Domain
  property and the URL-prefix property shows *"Inherit from:
  naplesestatejewelry.com"* — the Domain property is where that control
  lives. Keep it for that reason alone.
- **Shared:** Request Indexing quota (per site), the sitemap row (submitted
  once, visible in both), the DNS TXT verification (one record, both
  properties). The Domain property lists that TXT as an "unused
  verification token" because its token owner (`info@naplesestatejewelry.com`)
  is not a listed user — the only listed owner on both properties is
  `info@surettesystems.com`, shown as "Devon Taylor" (an account nickname) — ⛔ **never REMOVE the token**; add `info@` as an
  owner if the notice bothers anyone.

Rule: keep both; do nothing to "fix" it; never delete a property.

### GSC inspect box — the sequence that works from Chrome MCP (2026-09-03)

`find` the "Inspect any URL" combobox once (its ref survives SPA
navigation) → `form_input` the full URL → `left_click` the box **by
coordinate, not by ref** → key `End` → key `Return` → wait ~10 s. After a
REQUEST INDEXING click, wait ~26 s for the toast, screenshot it, then press
`Escape` before anything else. ⛔ Never press `Return` while the row reads
"✓ Indexing requested · REQUEST AGAIN" — focus is on that button and it
re-submits (burned one quota unit today). A red "Oops! Something went wrong"
is transient (retry once); "Quota exceeded" is not (stop for the day). Deep
links to `/inspect?id=<url>` and `/change-of-address` return Google 404s —
drive the UI.

### Bing's "Indexing allowed: No" is an index-selection verdict, not proof of a `noindex` (2026-09-03)

The 09-01 reading — Bing crawled the new pages before the deploy and cached
the 404's `noindex` — was disproved on 09-03: `/sell/marco-island` (months
old, crawled 8/20) and `/jewelry-appraisal/hallmarks` (crawled 9/3 01:36,
after every deploy) both show "Crawl allowed: Yes · Page Fetch: Successful ·
**Indexing allowed: No**", while the server returns 200 with no robots
directive to a Bingbot UA under every header variant tried, and Bing's own
**Live URL test says "URL can be indexed by Bing"**. Bing shows the same
triad for pages it has simply not selected yet on a young property. Rules:

- ⛔ Do not chase this in app code (no robots changes, no header changes, no
  redeploy "to fix Bing"). Re-request the URL, resubmit the sitemap, wait.
- The one server-side check that would change the verdict is the Netlify
  request log filtered to `bingbot` for the affected paths — use it only if
  the crawl date advances and the verdict stays "No".
- ⛔ `site:naplesestatejewelry.com` on Bing redirects to junk (`rdr=1`); it is
  not an index count. Use URL Inspection per page.
- BWT dialogs (Request indexing → Submit, Submit sitemap) do not open from
  accessibility-ref clicks in Chrome MCP; drive them with `javascript_tool`
  (find the button by text, `.click()`, set inputs via the native value
  setter + `input` event). Deep link:
  `urlinspection?siteUrl=…&urlToInspect=<double-URL-encoded>`.

### Static `[param]` routes with `generateStaticParams` must set `dynamicParams = false` (2026-09-03)

`/sell/nowhere-xyz` returned a plain-text **500** in production even though
the page calls `notFound()` for an unknown slug: the route is fully static,
and Netlify's Next runtime rendering an unlisted param on demand surfaced the
not-found as a 500. `sell/[city]` now exports `dynamicParams = false`, so an
unknown slug 404s without rendering (prerender manifest: `fallback: false`).
Apply the same to any future static route whose params are fully enumerated.
`shop/[id]` is different — it is ISR (`revalidate = 300`) and must keep
accepting new product ids, and it already 404s correctly.

### The resale-vs-melt positioning: "we price it both ways", never "we pay more than melt" (2026-09-03)

Owner's insight: nearly every competing gold/silver buyer in Naples is a
melter (refiner-backed counter or mail-in). A melter can only pay a share of
metal value; a reseller with a showroom can price a piece as jewelry. That is
the one differentiator competitors structurally cannot copy, so it now has a
page (`/sell/dont-melt-it`) and a one-sentence hook on the homepage gold card
and in each city intro. Rules for anyone touching this copy:

- The promise is exactly the flatware wording the owner confirmed on
  2026-08-30: **"we price it both ways and pay whichever is higher."** ⛔ Never
  "we always pay more than melt", never a resale percentage or dollar figure,
  never a premium promise for a category. The page says plainly that some
  pieces are honestly melt.
- The melt example is the `/sell` example (20 g 14k, illustrative $2,600
  spot, ≈ $978). Change both or neither.
- Speak about the model ("melters", "melt-only counters", "mail-in buyers"),
  ⛔ never a competitor's name.
- Category lists were approved line by line by the owner on 09-03; designer
  names come from `/estate-jewelry`; dental gold and HGE rules from the gold
  guide apply. Class rings, coins and watches are deliberately unlisted —
  ask the owner before adding them.
- City pages: the hook lives in each city's OWN intro string with its own
  wording (`service-areas.ts`), never in the shared template — the 69%
  verbatim-identical rule. "pawn-shop" was retired from every intro in the
  same pass; the melt framing is the stronger and truer contrast.

### Adjacent inline elements need an explicit whitespace text node — JSX eats the newline (2026-09-03)

Google's snippet for `/shop` printed `(239) 404-8505info@naplesestatejewelry.com`.
The 08-15 explanation (Google concatenating structured-data fields) was wrong:
the served footer HTML was literally `…404-8505</a><a href="mailto:…`. JSX
removes the newline between sibling elements, the flex column hid it
visually, and text extractors (Google's snippet builder, screen readers,
copy-paste) saw one token. Block boundaries are respected by Google; only
abutting **inline** elements merge.

Rule: when two inline elements with text sit next to each other in JSX and
are separated only by CSS (flex/grid gap, margins), put `{' '}` between
them. Inside a flex or grid container the whitespace-only text node is not
rendered, so layout is unchanged; in an inline context it renders as a
normal space, which is also what you want. Do not "fix" this with CSS or by
changing the schema. ℹ️ Footer nav link lists are also adjacent anchors
(`Sell GoldSell Sterling Silver` to an extractor); left alone on 09-03
because Google does not build snippets from link lists — revisit only if a
snippet ever shows it.

## Homepage Announcement Banner

### The strip's copy is admin data, and its LENGTH is enforced, not remembered

Admin-editable since 2026-08-25 (Admin → Settings → Homepage Banner): both
fragments, per-locale with ES falling back to EN **per field**, a link on/off
toggle, an editable destination, and a master show/hide. Stored on
`shop_settings.home_banner` (jsonb, null = built-in copy). Same split as store
hours: pure/client-safe `home-banner.ts` (shape, default, resolve, parse,
budget) + server-only `home-banner-server.ts` (cached fetch, degrades to the
default on any error).

⚠️ **The strip is `nowrap` at a fitted type clamp — long copy overflows, it
does not wrap.** The 2026-08-14 measurement (320px viewport, ~304px usable;
shipped ES 48 chars / 273.6px; EN 40 chars / 228.3px; ≈5.66px per character)
is now encoded as `BANNER_SAFE_CHARS` (48, warns) and `BANNER_MAX_CHARS` (53,
blocks). The ceiling is enforced in `parseHomeBanner()` as well as the admin
panel, so a hand-edited DB row cannot break the mobile header either. ⛔ If
the type clamp or copy conventions ever change, RE-MEASURE at 320px in
Spanish and update both constants — do not nudge them to fit a new string.

### A banner that goes nowhere is a `<div>`, and loses its arrow

When the link is switched off the strip renders as a plain `<div>`, not an
anchor: no `href`, not focusable, and **no trailing `→`** — the arrow is the
only affordance telling a phone user the strip is tappable, so keeping it on
a static strip would lie. The hover/focus rules in `globals.css` are scoped
to `a.home-announcement` for the same reason; do not widen them back to the
bare class.

### The banner's destination is an ALLOW-LIST, never free text

`linkPath` is validated against `HOME_BANNER_LINK_OPTIONS` (9 curated
marketing routes) in both the API and the parser, and stored locale-less with
`/es` prefixed at render. This is deliberate: a free-text URL field on a
public banner is an open-redirect surface, and the admin does not need one.
Add routes to that constant rather than relaxing the check.

## Store Hours

### Showroom hours are DATA, and every formatter is pure

Since 2026-08-25 the weekly schedule lives in `shop_settings.store_hours`
(jsonb, single row; null = default) and is edited in Admin → Settings → Store
Hours. `business-location.ts` keeps every hours formatter PURE and sync —
each takes a `StoreHoursSchedule` first parameter — and the server-only
`store-hours.ts` owns fetching (`getStoreHours()`: `unstable_cache`, tag
`store-hours`, 300s, degrades to `DEFAULT_STORE_HOURS` on ANY error, so the
site can never render blank hours). Client components never fetch the
schedule; their server parent passes a formatted string prop
(`pickupHoursLine` on checkout/product, `pickupHours` on the order panel).

⛔ **Never format times with `Intl`** here: the site's byte conventions are EN
`11am` / `11:00 AM` and ES `11:00 a.m.` — Intl's es output is `a. m.` (extra
space) and would silently change shipped bytes. The hand-rolled formatter in
`business-location.ts` is deliberate; `store-hours-format.test.ts` asserts
byte-identity on the default schedule.

⛔ **`HOURS` stays** as the NAP-canonical fallback constant — its only
consumer is `DEFAULT_STORE_HOURS`. An hours edit in the admin panel must be
mirrored to the Google Business Profile, eBay merchant location, and Etsy
shop location the same day (the panel carries the warning permanently).

### An hours save busts the WHOLE page tree, deliberately — and it WORKS

The admin PUT runs `revalidateTag('store-hours', { expire: 0 })` then
`revalidatePath('/', 'layout')`. Hours print in the footer of every page in
both locales and most pages are statically prerendered, so enumerating paths
would be strictly more fragile; edits are rare enough that a sitewide
regeneration is cheap.

✅ **CONFIRMED in production 2026-08-25**, on the first real owner save (hours
AND banner): both propagated to the statically prerendered homepage in EN and
ES with no code change. ⛔ The `export const revalidate = 3600` fallback this
entry used to hold in reserve is **not needed — do not add per-page revalidate
windows for this.** The same mechanism backs the homepage banner.

### Prose never names the open days

The ~14 marketing/meta strings that used to say "Tue–Sat" were reworded ONCE
to day-agnostic copy ("during showroom hours or by appointment") rather than
derived from the schedule — meta descriptions should not churn with an hours
edit, and the two FAQ answers serialize into FAQPage JSON-LD. Do not
reintroduce day names into prose, metadata, or JSON-LD descriptions; the
exact schedule belongs only to the hours surfaces and
`openingHoursSpecification` (which is omitted entirely, not `[]`, when every
day is closed).

## Auth Abuse Protection

### Auth abuse is gated by Supabase-enforced CAPTCHA, and it is coupled to SMTP

**Live since 2026-08-24.** Bot signups (and reset-email abuse) POST straight to
Supabase `/auth/v1/*` with the public anon key, so no route, edge function, or
form heuristic of ours can be in the path — the only gate that works is one
GoTrue enforces itself: Attack Protection → CAPTCHA (Turnstile). The client
half is `TurnstileWidget.tsx` + `captchaToken` on all four auth calls, INERT
without `NEXT_PUBLIC_TURNSTILE_SITE_KEY`; the secret lives only in the
Supabase dashboard. Tokens are single-use — every auth failure path must
`reset()` the widget. CSP needs `challenges.cloudflare.com` in `script-src` +
`frame-src` in BOTH `next.config.ts` and root `netlify.toml`.

⚠️ **The gate and custom SMTP travel together.** Auth email moved to Resend
SMTP the same day (branded sender `noreply@naplesestatejewelry.com`,
sending-only key `supabase-auth-smtp`, 30/hr cap) — explicitly BECAUSE the
gate now fronts every email-triggering endpoint. Turning the CAPTCHA toggle
off while custom SMTP stays on re-opens a Resend email cannon against the
`.com` sending domain. Rollback of either setting must consider the other.

⛔ **Never load a page running the real Turnstile challenge in the in-app
Browser pane or any automated browser.** It hard-crashed the Claude app twice
(2 "Electron" challenges in Cloudflare analytics, 0 solved) and forced a
reinstall. The always-pass TEST key is safe locally and predicts nothing.
Verify those pages statically — curl the bundle chunks and CSP header — and
leave visual checks to a human in a real browser.


## Repository And Memory

### Source-of-truth folder has no git workflow

This folder is the user's repo-ready source of truth. Do not run git commands
here. The user copies it into a separate GitHub working folder manually.

Keep runtime code in `next-app/`, SQL in `supabase/`, and durable project memory
in `project-docs/`. Do not leave temporary reports, archives, logs, or generated
caches in the root.

### Startup memory is a snapshot, not a second changelog

`CURRENT_STATUS.md` describes the present system, `TASKS.md` contains open work,
and this file contains decisions still governing the project. Detailed
chronology belongs only in `CHANGELOG.md`; feature-specific implementation
detail belongs in `features/`.

Completed build prompts, proposed schemas/routes, rollout plans, kickoff notes,
and handoff reports are removed after their durable operating rules are merged
into the current feature documents. Historical names and chronology may remain
in `CHANGELOG.md`, but stale planning folders must never compete with current
code, applied SQL, `TASKS.md`, or feature runbooks as a source of truth.

### The wholesale copy must exclude agent worktrees

Background agent sessions create git worktrees under `.claude/worktrees/`. A
single one adds **~860 files**, and its `.git` is a **FILE** (a pointer to the
parent repo), so a `robocopy /XD .git` exclusion does **not** catch it — a `.git`
entry would be copied into the repo folder.

The staging command therefore excludes `"$src\.claude\worktrees"` by full path,
and `.gitignore` lists `.claude/worktrees/`. ⚠️ Robocopy does not read
`.gitignore`, so the `/XD` entry is what actually protects the copy. Never
exclude `.claude` wholesale — `.claude/launch.json` belongs in the repo.

⛔ **"0 Extras" is NOT a sufficient safety check for `/MIR`.** Extras only detects
files in the DESTINATION that are absent from the source; it was 0 while 1,122
stray files were queued to flow IN. Always read the file COUNT and sanity-check
it against what the session actually changed.

## Business Model

### The showroom is store-first; home visits continue by request

Owner opened a showroom at **6240 Shirley St, Ste 104, Naples, FL 34109**,
**Tue–Sat 11:00–15:00 or by appointment**, in space shared with **Sharon Lynch
Collections** (confirmed 2026-08-17). The site was built on the opposite
premise — "private, mobile, appointment-only, no physical storefront" — in 61
strings across 15 files, both locales.

The chosen model is **store-first with home visits by request**, not
store-only. That distinction is the whole reason the six `/sell/[city]` pages
survive: they exist almost entirely to rank on travel-to-you searches, and
deleting the travel framing would gut them for no gain. So `travelEn`/`travelEs`
in `lib/service-areas.ts` and the city pages get **reframed** ("serving <city>
from our Naples showroom, home visits on request"), never removed.

⚠️ **Name the shared space as a landmark, not as an arrangement.** The sign
out front reads Sharon Lynch Collections, so a customer looking for our name
drives past. Copy says "**inside** Sharon Lynch Collections" — a destination
that doubles as a wayfinding instruction. "We share a space with" was rejected:
it explains the business relationship and fails the customer trying to find the
door.

⚠️ Hours are a published fact in two places that must agree —
`openingHoursSpecification` in `[locale]/layout.tsx` and the Google Business
Profile. Both claimed Mon–Sat 10:00–17:00 in schema before this; a GBP/schema
mismatch is a self-inflicted local-SEO wound, so they change together.

⚠️ The `geo` block is the Naples-downtown approximation (26.142, -81.795),
miles from Shirley St. Take the real coordinates from Google Maps — do not
estimate them. A wrong pin is worse than no pin.

❌ **NAP consistency stops at the website and the Google Business Profile**
(owner, 2026-08-17). Three marketplace/citation surfaces were raised and
explicitly declined:

- **eBay item location** — driven by a hand-typed ZIP in the inventory
  location; may not read 34109. Owner: anywhere in Southwest Florida is fine.
- **Etsy shop location** — an Etsy account setting; no address exists in
  `src/lib/etsy/`.
- **`naplesjewelrybuyers.com`** — the related site in `sameAs`.

These are a deliberate accepted cost, not an oversight. A future session must
not re-open them as defects or "fix" them unprompted.

The CAN-SPAM marketing mailing address was solved in CODE rather than by data
entry: `getMarketingSettings()` falls back to `addressOneLine()`, so the Admin
field is an override and marketing email can never send without a physical
address. It uses the plain postal address, not the landmark form — "inside
Sharon Lynch Collections" helps a visitor find a door and has no place in a
legal footer.

Inventory and rollout order live in `TASKS.md` under *PHYSICAL LOCATION*.

### The showroom map is a keyless embed, pinned to GEO, and always lazy

`ShowroomMap` frames Google's classic keyless embed
(`maps.google.com/maps?...&output=embed`) via `mapsEmbedUrl()` in
`lib/business-location.ts`. The Maps Embed API was rejected because it needs a
billable API key, and this widget adds no information — every page carrying it
also prints the address, the hours and a directions link as text. A blocked or
failed frame therefore costs a visitor nothing.

**It pins the GEO coordinates, not the address string.** `GEO` is the
owner-supplied, verified door; a geocoder handed "6240 Shirley St, Ste 104" is
free to disagree with the suite, and the project has already been burned once by
a location that contradicted its own address (see the `GEO` comment — the
previous downtown pin sat 5.59 miles off). The address is used only as a
fallback if `GEO` is ever returned to `null`.

**Two CSP files must list two Google origins.** `frame-src` needs
`https://www.google.com` AND `https://maps.google.com`, in **both**
`next-app/next.config.ts` (serves dev) and root `netlify.toml` (serves
production). The request begins at `maps.google.com` and 301s to
`www.google.com/maps/embed`, so allowing one origin blanks the frame. A
CSP-blocked iframe fails quietly — it renders empty with only a console error —
so the symptom does not look like a security setting. If a map ever goes blank,
check these two lines before touching the component.

**Zoom buttons reload the frame, because nothing else can.** The iframe is
cross-origin, so no script of ours can zoom Google's map — zoom is a query
parameter, and each press re-requests the frame at a new `z`. Two guards are
mandatory and must not be removed as "extra complexity": a **300ms debounce**,
so a burst of clicks is one load; and **remounting the iframe via `key` rather
than changing `src`**, because changing a live iframe's `src` pushes a
session-history entry and would turn the browser Back button into a zoom-level
rewind. Range is z12–z20, default **z17**.

**`loading="lazy"` must stay.** First paint is an open performance item on this
site and the embed is a heavy third party; lazy is what keeps it off the
critical path. Removing it to "make the map appear sooner" trades a measured
site-wide problem for a decoration.

**The frame is SQUARE** (`aspect-ratio: 1 / 1`, sized by `maxWidth`). It was a
wide short band and showed a corridor of Shirley St with no context north or
south of the door; 1:1 roughly doubles the north-south extent at the same zoom.
⚠️ The cap is on width but binds height too — widening `maxWidth` also makes the
map taller.

**It is a third party, and `/privacy` says so.** Google receives the visitor's
IP and may set cookies once the frame loads. If the component is ever removed
sitewide, remove the Service Providers bullet with it.

### The homepage invites a visit, and the invitation is hours-conditional

The homepage CTA says **"Visit us today — walk into our Naples showroom during
opening hours, or call ahead and we'll set a private appointment."**

⚠️ It deliberately does **not** say "no appointment needed" or "we're open
today". "Today" is read on whatever day the visitor lands, and the showroom is
closed Sunday and Monday; an unconditional invitation is false two days in
seven. "During opening hours" is true every day, and the hours line rendered two
elements below is what completes it. **Do not separate the invitation from the
hours line, and do not strengthen the copy without adding a day check** — which
would mean making a server-rendered, cached page time-aware, a far larger change
than the sentence is worth.

The About page states the store exists but carries **no map**: its job is the
fact, not the wayfinding, and the contact page one click away does the picture
properly.

**Since 2026-08-23 that invitation is a two-column block, and the ADDRESS leads
it.** Owner's call, from a reference layout he supplied. Left column: eyebrow,
`<h2>`, address, all seven days of hours, four feature labels, Get Directions +
phone buttons, email. Right column: an orienting sentence and the map.

⛔ **This REVERSES the rule that governed the block until then** — the phone
number was the headline and everything else was deliberately kept quiet so it
"must not out-weigh the phone number this section exists to show". That was
right when there was no storefront to send anyone to. There is one now, the
phone keeps a full-size button, and the section finally contributes a real
`<h2>` to the page outline instead of opening on a styled `<p>`. **Do not
restore the old hierarchy as a "fix" — it is a decision, not drift.**

⚠️ Two constraints the width bought, and one it did not change:

- **All seven days now render here.** The grouped two-row form existed only
  because a single narrow column could not spend seven rows without pushing the
  map off the fold. It is still correct on the surfaces that use it.
- **The feature labels must be TRUE and traceable to existing site copy.**
  "Free parking" is deliberately absent: it is true, but the owner's call is
  that it is assumed in that area and not worth a slot. Do not pad the row.
- **The map is still SQUARE and still lazy.** Both are older recorded decisions
  (a letterbox showed a corridor of Shirley St with no context; lazy keeps a
  heavy third party off the critical path). It only grew to fill the column.

### "Today" on the hours list is a client-only fact, in the SHOWROOM's timezone

`ShowroomHours` shipped with no today-marker at all, for two reasons that still
hold and now shape how the opt-in one works. It is `highlightToday`, on only for
the homepage CTA, so the footer's copy stays a pure server component.

1. **These pages are statically prerendered.** A server-rendered "today" is
   whatever day the BUILD machine ran on — stale the moment it ships.
2. **It must answer for Naples, not the reader.** `ShowroomTodayBadge` reads
   `America/New_York`, never `new Date().getDay()`.

⚠️ Reason 2 is not theoretical: while this was being built, **UTC said Monday
while Naples said Sunday**, and the badge correctly marked Sunday. A naive
implementation is wrong for several hours of every day.

⚠️ It uses **`useSyncExternalStore`** with a `false` server snapshot, not state
set in an effect — that is the API for "a value the server cannot know", it
cannot mismatch during hydration, and the repo's lint rule rejects the effect
form. `lib/__tests__/showroom-today.test.ts` pins the timezone behaviour and the
English `dayKey`, which exists separately from the localized `day` precisely so
the comparison still works on the Spanish page.

### A display address is laid out; a prose address is a string

`addressWithLandmark()` joins the address and "inside Sharon Lynch Collections"
with a middot. **A middot is not a break opportunity**, so in a narrow column
the line broke wherever it ran out of room — the footer shipped
"… inside Sharon / Lynch Collections" until 2026-08-18. A business name split
across two lines reads as two things, and this name is the entire point of the
clause: it is the sign out front that the visitor is scanning for.

**Display surfaces use `<ShowroomAddress>`.** It puts the landmark on its own
line, drops the middot (a line break already separates the facts, and a leading
"·" on a wrapped line is worse than none), and marks it a qualifier with a step
down in weight.

🔴 **The landmark is being retired from the primary surfaces, by owner decision
(2026-08-23/24).** It has now been removed from the **order-email footer**, the
**homepage Visit Us block**, and the **contact page panel** — the last two no
longer use `<ShowroomAddress>` at all; they print `streetLine()` as a heading
with `cityLine()` under it. The wayfinding argument above was real and is
recorded as overridden, not forgotten.

Where it still appears, so a future sweep does not have to rediscover the list:
the **sitewide footer** (`<ShowroomAddress>`), the **About** page
(`wayfindingSentence()`), the **FAQ answers** on `/faq` and the homepage
(hardcoded in both locales), **`/shipping`**, the **checkout** pickup option,
**`ProductTrustSections`**, **`spanish-legal-copy`**, and the **order-email
pickup block** (`landmarkPhrase()`, deliberately kept — it is directions for
someone driving over). Ask before clearing the rest; several are prose where the
landmark still earns its place.

⚠️ **Only the business NAME is `nowrap`, never the whole clause.** An
unbreakable clause guarantees the line but creates an overflow cliff — at 320px
the Spanish version measures 190px in a 269px column, and a font bump or a
longer suite name would push it into horizontal scroll. The preposition wraps;
the name cannot.

⚠️ **`addressWithLandmark()` remains correct for prose and email** and was
deliberately left at its other call sites. A sentence ("Local pickup is free at
…") needs the string, and an email cannot take a React element. `landmarkParts()`
is the shared seam — `landmarkPhrase()` and `addressWithLandmark()` both compose
from it, so the layout and the string cannot drift.

### Hours are a day-by-day list, and closed days are part of the answer

`hoursLine()` ("Tue–Sat 11am–3pm, or by appointment") packs three facts into one
sentence, so "can I come Thursday?" costs a parse. Display surfaces use
`<ShowroomHours>`, a two-column day/time list.

- **Monday-first**, so the closed days bookend the week rather than opening the
  list with two "Closed" rows.
- **Closed days are shown, dimmed** — "Sunday — Closed" is the answer to a real
  question; an absent row is not.
- **Closed days are DERIVED from `HOURS.days`.** Never maintain a second list;
  the display and the schema must move together.
- **"or by appointment" sits under the list, never beside a row.** It qualifies
  every row, so putting it in the time column next to one day asserts something
  false about that day.
- **Today is not bolded**, unlike Google Maps. These pages are statically
  prerendered, so a server-rendered "today" is wrong for real visitors and a
  client-rendered one costs hydration on the footer of every page.

⚠️ **`hoursRowsGrouped()` (the 2-row form, homepage CTA only) hardcodes
"Sunday – Monday"** because that is what today's `HOURS.days` leaves over. If
the open days ever stop leaving a contiguous Sunday/Monday pair, it silently
lies — switch that surface to `hoursRows()`, which derives and cannot.

⚠️ **The string helpers survive on purpose.** `hoursLine()` and friends remain
correct in prose and email (checkout, shipping, product trust, invoice email,
Spanish legal copy) and were deliberately not converted. Both paths compose from
`hoursTimesLabel()`, so the list and the sentences cannot drift.

⚠️ **A seven-row list cannot live in a footer COLUMN.** It ran the brand column
to ~2x the height of the other three and left the right side of the footer
empty. The address and hours are therefore a centred band under the whole
column row, with the same rule and spacing as *Areas We Serve*. Measured after
the move: all four columns 222px, spread zero. Moving them back into a column
requires shortening the list first.

⚠️ **Address ABOVE hours, never beside them** (owner, 2026-08-18). Side by side
they read as two unrelated columns and the footer's centre line lands in the
empty gap between them; stacked, they read as one address block with its opening
times under it.

### Showroom detail emphasis is weight and opacity, never colour

`ShowroomAddress` and `ShowroomHours` render on four surfaces — footer, homepage
CTA, contact and About — each with a different inherited text colour. Their
internal hierarchy is therefore expressed only in **font-weight and opacity**,
which compose with any palette. A hardcoded colour inside either component
fights the footer's muted grey and must not be added.

The fixed relationships:

- Street line **600**; landmark explicitly **400** at 0.8 opacity. The 400 is a
  deliberate *reset*, not a default — it keeps the landmark a qualifier even
  when a surface sets the surrounding block bold.
- Day **600**; time **700**. The time is the answer, the day is the lookup key.
- Closed rows at **0.55 opacity**, with "Closed" dropped to 500, so open days
  carry the contrast.
- **Times use `font-variant-numeric: tabular-nums`.** Proportional digits drift
  and the shared right edge that makes the column scannable only holds by luck.

On the homepage CTA specifically, address and hours sit together under **one
hairline rule on top**. They are the same kind of fact — practical detail acted
on after the invitation — and grouping them is what stops the section flattening
into a grey list.

⚠️ **Two bolder versions were tried and rejected on owner review, both on
2026-08-18. Do not reintroduce them:**

- **The deck is colour-only, never bold.** At `fontWeight: 600` it read as
  shouting — two lines of bold immediately under a 30px phone number is two
  headlines arguing for the same job. The lift from muted to full-strength text
  colour is what separates it from the details below; that is sufficient.
- **The rule is on TOP only, never bracketed.** Closed top and bottom it read as
  a stray box, because it becomes a container competing with the map directly
  beneath it. A single short rule announces "detail follows" and lets the map
  supply the lower edge. It is also deliberately narrower than the map, so it
  reads as a divider rather than a container edge.

### The reviews marquee is CSS-only, and four details in it are load-bearing

The homepage review band scrolls continuously (`variant="marquee"`); product
pages keep the 2/4 grid, because a page about one item should not have a moving
element competing with its photography.

No JS moves it — no measurement, no rAF, no client component. The homepage has
an open first-paint budget and a marquee that cost JS to run would be paying for
decoration. The track is a flex row of two identical halves translated -50%.

⚠️ **These four are correctness, not style. Each fails silently.**

1. **Card spacing is `margin-inline-end`, never flex `gap`.** With `gap` the
   track measures `2n*card + (2n-1)*gap`, one gap short of two identical halves,
   so -50% misses the seam and the loop jerks once per cycle.
2. **`data-customer-reveal-skip` on the wrapper.** CustomerReveal stamps
   `main [class*="card"]` with `data-customer-reveal="pending"` (opacity 0)
   until observed; inside a moving track the off-screen cards may never be
   observed, and the band scrolls invisible cards. CustomerReveal tests with
   `closest()`, so the one attribute covers every card beneath it.
3. **Duplicate cards are `aria-hidden` + `tabIndex={-1}`.** They exist only to
   fill the loop; a screen reader reading the same reviews twice is worse than
   no band at all.
4. **`prefers-reduced-motion` removes the duplicates and makes it a scroller**,
   rather than merely stopping the animation — a stopped marquee is a row with
   most of its content permanently unreachable.

Duration is derived from the card count (`cardsPerHalf * 7s`), so adding reviews
lengthens the band instead of speeding it up.

### A review is published verbatim or not at all

`testimonials.ts` already forbade inventing or paraphrasing a quote. Two
corollaries were settled on 2026-08-18 while importing eight reviews from the
live profile:

- **Posted spelling and grammar are part of the quote.** "Jewelery", "he have
  lots of collection" and a double space after a full stop all ship as posted. A
  tidied quote is an invented one.
- **A review that cannot be published verbatim is not published** — with one
  owner-authorised exception, recorded below. Linda Cusumano's review ends with
  a stray "Hi baby" that is genuinely inside the review body on Google, not an
  extraction artifact (re-verified 2026-08-19 in the owner's own Reviews panel
  with the full text expanded — she had not edited it).

  🔴 **The owner overrode this on 2026-08-19** and chose to publish the review
  WITHOUT that line, having been shown the exact text and told plainly that it
  attributes edited words to a named real person. The entry in `testimonials.ts`
  carries the same explanation inline. Nothing else about the quote is altered,
  including the clipped "cannot say enough Chris Surette".

  ⛔ **This is one authorised exception, not a new policy.** Do not trim any
  other review on the strength of it, and do not "restore" the line — its
  absence is deliberate. If Linda edits her review on Google, replace the quote
  with the real text and delete the note.

Google's own UI chrome is not part of the quote either: a trailing "…" on a card
with no "More" expander is its emoji-collapse marker, and is dropped.

### An in-page jump is an `<a>`, an id constant, and a scroll-margin

The hero's third button jumps to the homepage's "Call or Visit Us Today" block.
Four rules, each of which fails quietly if broken:

- **The id is a constant** (`lib/home-anchors.ts`, `VISIT_ANCHOR_ID`), imported
  by both the link and the target. They live in different files, and a mismatch
  produces no error at all — the browser does nothing for an unknown hash, so
  the symptom is a dead button.
- **`scroll-margin-top: var(--site-header-height)` on the target.** The header
  is fixed; without it the block arrives underneath it. Use the TOKEN — it
  changes at the md breakpoint.
- **A plain `<a>`, never `<Link>`.** A hash is not a route change, and routing
  it arms the route progress bar for a navigation that never commits.
- **Smooth scrolling is JS on the click, never `scroll-behavior: smooth` on
  `html`.** That property applies to the scrolling container, so globally it
  would also animate the scroll-to-top of every route change. The handler
  honours `prefers-reduced-motion`; the `<a href="#...">` underneath still works
  without JS.

⚠️ **The hero no longer links to `/trade-in`.** That slot was Trade until
2026-08-18; the trade-in program now has no prominent entry point, only the
footer. Giving it one means finding a new home, not reclaiming this slot.

### The copy-address button copies the address, not the wayfinding

`CopyAddressButton` copies `addressOneLine()` — street and city only. The
landmark ("inside Sharon Lynch Collections") and the business name are
deliberately excluded: a copied address is nearly always pasted into a maps app
or a GPS, and the landmark is guidance for a human reading the page, not input
for a geocoder. It stays visible next to the button.

⚠️ **The button must stay a SIBLING of the maps link, never a child.** A
`<button>` inside an `<a>` is invalid HTML, and browsers resolve the conflict by
breaking one of them — typically leaving a control that navigates instead of
copying. Same reason it sits outside the `<address>` element on the contact
page: that element IS the address, and a control is not part of one.

It reuses `lib/clipboard.ts` rather than calling `navigator.clipboard` directly,
because that helper already carries the hidden-textarea/`execCommand` fallback
for non-secure contexts.

## Application Architecture

### Next.js under `next-app/` remains the only runtime

The old static root site is retired. Root `netlify.toml` builds with
`base = "next-app"` and publishes `.next`. Do not recreate root HTML, scripts,
assets, or Netlify Functions as an alternate runtime.

### All legacy/retired redirects live in lib/legacy-redirects.ts, served by proxy.ts

On Netlify the next-intl proxy (`src/proxy.ts`) is deployed as an **edge
function that runs before both the Netlify redirect engine and the Next.js
server**. It rewrites every locale-less path to `/en/...`, so a request for a
route that no longer exists 404s before any redirect layer is consulted.

This silently broke **all 22 English-side redirects** — the 12 legacy
static-site `.html` URLs, `/cart`, `/wishlist`, `/saved`, `/account/saved`,
and the 6 re-slugged product URLs — for as long as the proxy has existed.
Every `/es/*` twin worked, which is exactly what made it invisible. Found
2026-08-02 while verifying the retired `/auctions` page (three attempts to
fix that one taught the same lesson three times).

- `netlify.toml` redirects — including `force = true` — never fire for bare
  English URLs. They DO fire for `/es/*`, so a broken fix looks half-working.
- `next.config.ts` `redirects()` never fire either, **but they do work under
  `next dev`** — a local test passes while production still 404s. The
  `redirects()` block was removed entirely for this reason.
- The only reliable layer is `proxy.ts`, ahead of the locale rewrite.

Rules:
1. Every path the app no longer serves goes in `src/lib/legacy-redirects.ts`
   (locale-less keys; `resolveLegacyRedirect` normalises `/x`, `/en/x`, and
   `/es/x` to one rule and re-prefixes Spanish destinations).
1a. **A deleted listing gets its redirect line DELETED, never re-pointed.**
   This is a one-of-a-kind estate inventory, so products are removed
   routinely and a 404 is the honest, correct answer for a piece that is
   genuinely gone — search engines drop it naturally, and the 404 page
   already offers Browse Shop / Go Home. Re-pointing an old product URL at a
   *different* product misleads the visitor, and redirecting to a page that
   itself 404s is strictly worse than the plain 404 (search engines read the
   hop as a soft 404). The sitemap is generated from the database, so
   deleted products drop out of it automatically — no sitemap action needed.
2. Use `permanent: true` (308) when the URL carries link equity — legacy
   pages, retired pages, re-slugged products — and `false` (307) for
   convenience URLs that were never real pages (drawers like `/cart`).
3. Never re-add `redirects()` to `next.config.ts`.
4. Verify redirects **against the deployed site**, never only locally.
5. **The default-locale prefix is a 308, issued by the proxy — never
   next-intl's 307.** `localePrefix: 'as-needed'` means `/en` and `/en/...`
   are never canonical, yet next-intl answers them with a 307 (temporary), so
   Google kept 46 `/en/...` URLs in Search Console's "Page with redirect"
   bucket and recrawled them instead of consolidating (read 2026-09-07).
   `resolveDefaultLocalePrefixRedirect` in `lib/legacy-redirects.ts` strips
   the prefix (`/en` and `/en/` → `/`; `/english-tea` is untouched) and
   `proxy.ts` sends a 308 with the query string preserved, AFTER the
   internal-locale header check (so next-intl's own `/en` re-run still
   renders) and BEFORE the locale-less rewrite. Spanish is unaffected —
   `/es/...` is the canonical form.

### Admin timestamps display in Eastern time

Every human-readable timestamp on an admin page (`Intl.DateTimeFormat`)
must pass `timeZone: 'America/New_York'`. Two reasons, found 2026-09-07
while adding the Subscribers "Subscribed" column: (1) server components
run on Netlify Lambdas whose clock is UTC, so the Users page's Created /
Updated columns had been reading four or five hours late for as long as
they existed; (2) a client component's server render and its browser
hydration must format identically, and an unpinned zone makes them differ.
Store times stay UTC (`timestamptz`); only the display is pinned. The
store-hours formatters are a separate, pure system and are not affected
(⛔ they never use `Intl` for times — see *"Showroom hours are DATA, and every formatter is pure"*).

### The primary domain is naplesestatejewelry.com; all app-facing email is .com

Owner decision 2026-08-01, after buying the `.com`: the canonical web domain
is `https://naplesestatejewelry.com`. The legacy `.co` remains owned as a
Netlify alias that 301s path-preservingly to `.com` (rules in root
`netlify.toml`). (Until 2026-09-20 `naplesantiquesllc.com` also 301'd here; it is
now the separate Naples Antiques and Estate Services site, which redirects NEJ's
old paths back itself — `SEO_LEAD_AUDIT.md` 2026-09-21.) New site-URL code must build from
`NEXT_PUBLIC_SITE_URL`/`SITE_URL` (falling back to the `.com`), never hardcode
either domain.

**Email: separate the mailbox from the sender.** The original 2026-08-01
decision kept everything on `.co`. Amended 2026-08-05 (senders), then again
2026-08-08 (the `info@` mailbox). Current rule:

- **`info@` is on `.com`.** Moved 2026-08-08 on owner instruction so the address
  customers see matches the domain they are on — footer, account dashboard, both
  LocalBusiness JSON-LD blocks, and the order-notification default.
  **Owner-confirmed 2026-08-09 that the mailbox actually receives mail**, which
  is the condition this decision depends on: the `.com` root MX points at
  Workspace, but the mailbox/alias existing there is config no code can verify.
  It remains a live dependency rather than a settled one — if that mailbox is
  ever deleted or renamed, customer inquiries AND new-order notifications bounce
  silently, with nothing in the app to signal it.
- **The marketing Reply-To is `info@naplesestatejewelry.com`** (owner,
  2026-08-08). Campaign replies land with every other customer inquiry rather
  than in a personal inbox. Reply-To is NOT constrained by the sending domain,
  so any monitored mailbox is valid here.
- **Marketing campaigns send FROM
  `Chris at Naples Estate Jewelry <info@naplesestatejewelry.com>`** (owner,
  2026-08-08). The display name stays personal — that is what distinguishes this
  sender profile from `no_reply`; only the address is shared. Legal because the
  address sits on Resend's verified sending domain.
- **From is constrained; Reply-To is not.** A From address MUST be on the
  verified sending domain or the send fails outright. Reply-To can be any
  mailbox, including one on an unverified domain. When changing either, check
  which of the two you are touching — they are not interchangeable.
- **No `chris@` and no `@naplesestatejewelry.co` address remains in shipped
  code** as of 2026-08-08 — both verified zero in a clean production build.
- **Never touch the `.co` MX records** regardless. The domain still carries live
  mailboxes even though the app no longer points anyone at them.
- **Senders must be `.com`.** A From address must sit on Resend's verified
  sending domain, which is `naplesestatejewelry.com`. A `.co` From address will
  not send at all.

Superseded: this entry previously read "mailboxes stay on `.co`" and forbade
rewriting any `.co` *contact* address. That held from 2026-08-01 to 2026-08-08
and is why the old code comments said so; it no longer applies to `info@`.

### Resend's sending domain moved to .com because the Free plan allows only one

Owner decision 2026-08-05, amending the email half of the entry above. The
`.com` had become the brand domain everywhere else, and Resend's **Free plan
permits exactly one sending domain** — adding `.com` alongside `.co` was
rejected outright, and running both would have meant Pro at $20/mo. The owner
chose to swap rather than pay, accepting an outage window on the reasoning that
no meaningful email traffic was expected.

The swap is destructive by construction: `.co` had to be *deleted* before `.com`
could be added, so there is no overlap and no rollback that does not repeat the
outage. Two things make that tolerable and should be remembered before touching
email again: a failed send never breaks checkout (`order-finalize.ts` catches;
`order-owner-notification.ts` never throws), and missed receipts re-send from
Admin → Orders.

**The `.com` zone is shared with live Google Workspace mail, so email DNS work
there is not routine.** It already carries five Workspace MX records, a root
`v=spf1` behind GoDaddy's `_spfm` merge indirection, and DMARC at
`p=quarantine`. Consequences that outlive this migration:

- **Never add a second root `v=spf1`** — two SPF records is a permanent
  `permerror` that breaks the Workspace mail. Keep provider SPF on a subdomain
  (Resend's is on `send`, via its default Custom Return-Path).
- **Never add a root MX for a sending provider.** Resend displays an
  `inbound-smtp…` MX at `@` priority 0 under "Enable Receiving"; at priority 0 it
  would outrank all five Google MX and hijack the domain's inbound mail.
- **`p=quarantine` means DKIM mistakes fail silently** — mail is accepted and
  spam-foldered rather than erroring. Any change to email DNS needs a test send
  *and an inbox check*, not just a green "Verified" badge.
- **Prefer manual DNS entry over Resend's "Auto configure"**, which takes an
  OAuth grant to write DNS and can rewrite the root SPF.

### proxy.ts runs BEFORE netlify.toml redirects — host redirects belong in the proxy

Established 2026-08-05 by probing production. Only paths *inside* the proxy
matcher picked up a `/en` prefix in their redirect target (`/shop` →
`.com/en/shop`) while excluded paths did not (`/robots.txt` → `.com/robots.txt`).
That proves ordering: **the proxy rewrites the path first, and netlify.toml
redirect rules then splat the already-rewritten path.**

Consequences to preserve:

- **Host-level redirects must live in `proxy.ts`, above the locale rewrite.** Put
  them only in `netlify.toml` and every legacy link costs two hops — the rule
  splats `/en/...`, then next-intl 307s the `/en` off again.
- **The netlify.toml host rules must stay anyway.** Paths excluded from the proxy
  matcher (`/api/*`, `robots.txt`, `sitemap`) never reach the proxy and rely on
  them.
- **Never let `/api/*` on a legacy host become a 301.** The `.co/api/*` carve-out
  must remain a **200 rewrite**: webhook POSTs from Resend, PayPal, and eBay do
  not follow redirects. The proxy matcher already excludes `api/`; keep it that
  way. Regression test: `POST https://naplesestatejewelry.co/api/webhooks/resend`
  must return 401 (signature rejection), never 301.

### Development and production builds never run concurrently

Stop the Next development server before running `npm run build`, then restart
development afterward. Both modes use the same `.next` output tree; allowing a
production build to overwrite it while `next dev` is serving can mix old
server HTML with new client chunks and produce recoverable hydration errors.

### Supabase is the system of record

Products, accounts, orders, inquiries, settings, marketing data, and
marketplace state live in Supabase. Product IDs are durable URL/saved-state
keys. Product schema changes must update SQL, TypeScript contracts, read/write
queries, UI, and docs together.

### Localized behavior remains paired

English and Spanish routes use `next-intl`. Shared strings belong in paired
message files or explicitly paired localized page data. Route metadata, legal
copy, filters, errors, and transactional/customer content must be checked in
both locales.

### An RLS policy without a table GRANT is a page that reads but cannot write

Postgres checks table-level **GRANTS before it ever consults RLS**. A table with
a perfect admin-only policy and no `insert/update/delete` grant to
`authenticated` produces a very specific, very deceptive failure:

**every read works and every write fails.**

`buyers-2026-07.sql:35` has said this since July. It was ignored anyway on
2026-08-13, when `discount-codes-2026-08.sql` shipped with only
`grant select ... to authenticated` and reached production. The admin page
loaded, listed codes, drew its empty state — and every create/edit/delete
returned `permission denied for table discount_codes`.

**The root misconception, worth naming precisely:** admin API routes here run on
`requireAdmin()`'s **request-scoped** client, which is the `authenticated` role.
They do NOT run as the service role. Only routes that explicitly call
`createServiceClient()` bypass RLS and grants. Check which client a route uses
before deciding what a table needs.

Rules:

1. **An admin-managed table needs BOTH** the admin-only RLS policy *and*
   `grant select, insert, update, delete ... to authenticated`. The policy is
   what narrows it to admins; the grant is what lets the statement run at all.
   Copy the pattern from `buyers-2026-07.sql`.
2. **`anon` gets nothing.** That part of the original migration was correct and
   is what keeps a shopper from enumerating codes. Verified live: anon `SELECT`
   and `INSERT` both return `42501`.
3. **Grant only what the route actually does.** `discount_code_redemptions`
   stays `select`-only for `authenticated` — it is written by
   `capture_paypal_order` as service role, and the cascade from `discount_codes`
   handles removal.

⚠️ **A page that renders is not a page that works.** This bug survived every
check that preceded it — build, typecheck, 946 tests, a production smoke of the
route returning 307/401 — because all of them exercised the read path. The only
thing that could have caught it was performing a write as a signed-in admin.
**When a surface cannot be exercised authenticated before shipping, say so and
treat it as unverified, not as probably-fine.**

### `orders.payment_response` records which PayPal ENVIRONMENT a row came from

Established 2026-08-13 while auditing four orders marked `refunded` with a null
`refund_amount`. PayPal's stored response embeds its own HATEOAS links, and the
host names the environment:

- `https://api.sandbox.paypal.com` -> sandbox, fictional money
- `https://api.paypal.com` -> live

This is the reliable way to tell retroactively, and it settles questions no
other column can. Two of those four orders ($5,646.90 and $37.10) returned 404
for both capture and order against the live API — which alone is ambiguous (a
deleted record? a wrong id?), but the sandbox host in `payment_response` made it
definitive: they never existed as real money.

Why this keeps mattering: PayPal went live on **2026-07-09** after the
credential-mismatch blocker, so **orders from early July straddle both
environments** and the live `orders` table permanently contains sandbox rows.
Any revenue figure, reconciliation, or "what did we actually take" question must
filter them out. Check the host before treating an early-July order as real.

⚠️ **A 404 from PayPal is not proof a transaction failed.** It equally means
"you are asking the wrong environment." Always confirm against
`payment_response` before concluding money did or did not move.

### A PayPal `PAYMENT.CAPTURE.REFUNDED` resource is a REFUND, not a capture

Found 2026-08-12 by the first live refund this system had ever processed.
PayPal completed the refund correctly, and the database recorded nothing: the
order stayed `paid` with `refund_amount` null, `paypal_refunds` stayed empty,
and the webhook row landed as `status = 'error'`.

`relatedPayPalCaptureId` returned `resource.id` for every `PAYMENT.CAPTURE.*`
event. That is right for COMPLETED / DENIED / DECLINED / PENDING, whose
resource IS the capture. It is **wrong for REFUNDED and REVERSED**, whose
resource is a Refund object — so `resource.id` is the REFUND id. That id went
into `apply_paypal_refund` as `p_capture_id`, and the function's guard
correctly refused the write:

```
raise exception 'PayPal capture % does not match order %.'
```

The guard was not the bug; it was fed bad input and did its job.

Rules:

1. **Only trust `resource.id` as a capture id for capture-shaped events.**
   `REFUND_SHAPED_CAPTURE_EVENTS` in `lib/paypal-webhook.ts` holds the
   exceptions. Add any future refund-shaped `PAYMENT.CAPTURE.*` event to it.
2. **The correct capture id is already in the payload** under
   `links[rel="up"]` → `/v2/payments/captures/<id>`, and `captureIdFromLinks`
   has always parsed it. The early return simply prevented the fall-through
   from ever running.
3. **A refund's `status` is `COMPLETED`, not `REFUNDED`.** `REFUNDED` is a
   *capture* status. Code comparing a refund resource's status against
   `'REFUNDED'` is comparing across two different object types.
4. **`total_refunded_amount` is CUMULATIVE for the capture, not this refund's
   amount** — confirmed live 2026-08-13, not merely from the docs. After a
   $0.50 then a $0.56 refund on a $1.06 capture, re-fetching the FIRST refund
   object showed `amount = $0.50` but
   `seller_payable_breakdown.total_refunded_amount = $1.06`. The whole
   `incrementalAmount = cumulative - alreadyRefunded` branch depends on this;
   if it were per-refund, every partial after the first would under-apply.
5. **A refund object is a LIVE view, not a snapshot.** Because of 4, fetching an
   old refund from the API returns today's cumulative, while the webhook payload
   carries the cumulative *as of that event*. **Replay from stored webhook
   payloads, never from a fresh API fetch** — a fetch-based replay computes an
   increment against a total that has since moved.

### `paypal_refunds.amount` is THIS refund's own amount, and the order's total
### is SET from PayPal's cumulative

Settled 2026-08-13 by `supabase/paypal-refund-ledger-2026-08-13.sql`, after the
column was found carrying two different meanings depending on which of its three
callers wrote it. They coincided on a capture's FIRST refund and diverged on
every partial after — logging a real $0.50 refund as $0.56.

**The three rules now:**

1. **`amount` = this refund's own amount.** Taken directly from the payload's
   `resource.amount.value`, never derived. The old code computed
   `cumulative - alreadyRefunded`, which equals the own amount ONLY when every
   earlier refund was already recorded — and **PayPal does not guarantee webhook
   order**, so that assumption fails in ordinary operation. The true amount was
   in the payload the whole time.
2. **`orders.refund_amount` is SET from `total_refunded_amount`, not
   accumulated**, and clamped monotonically. Cumulative is authoritative and
   self-correcting: a missed or out-of-order event cannot leave an order short,
   because the next event carries the true running total, and a late OLDER event
   cannot walk it backwards.
3. **An applied ledger row's `amount` is immutable.** The upsert previously
   rewrote it before the `applied_at` guard ran, so a repeat call with different
   figures silently rewrote history.

**The ledger is keyed by PayPal's REAL refund id.** `resource.id` on a refund
event *is* the refund id — the same one the admin refund route already stores.
Keying on it makes redelivery idempotent by construction and completes an
admin-initiated `PENDING` row in place. This replaced a synthetic `event:<id>`
key plus fuzzy ±$0.01 amount-matching against pending rows, which was the actual
mis-attachment mechanism: the webhook matched on the increment while the pending
row held the own amount, so a second partial never matched and minted a
duplicate. That dance existed only because the code did not realise it had the
refund id — the same misreading behind the original refund bug above.

**Callers without a cumulative keep accumulating.** The admin refund route and
the `PAYMENT.REFUND.PENDING`/`FAILED` handler pass no `p_cumulative_refunded`
(it has a DEFAULT, so their 8-argument calls resolve unchanged) and retain the
previous behaviour — correct for them, since they act synchronously against an
accurate current total.

Verified against the real Postgres function: in-order partials, **out-of-order
delivery**, hostile redelivery with different figures, the 8-argument admin
path, and the over-refund clamp. The ledger now sums to the order total
($1.06, previously $1.12).

⚠️ **Reconciling against a SUM of `paypal_refunds.amount` is now valid** — that
is the point of the change. It was not before 2026-08-13.

⚠️ **The unit test asserted the bug.** It pinned
`relatedPayPalCaptureId('PAYMENT.CAPTURE.REFUNDED', { id: 'CAPTURE-123' })` to
return `'CAPTURE-123'`, so a full green suite proved nothing about the one path
that mattered. The lesson generalizes past PayPal: **a test written from the
same misreading as the code confirms the misreading.** Where a payload's shape
is the thing in doubt, fixture the REAL provider payload — the replacement test
uses the actual refund body from capture `5DH54631BL586554F`.

This is also why the refund path survived so long: `TASKS.md` has always listed
the controlled PayPal refund matrix as never run, and no live refund had ever
been issued. **Provider-contract bugs do not surface from unit tests; they
surface from one real transaction.**

### Tailwind font utilities work on a `<button>` again — the duplicate reset is deleted

**FIXED 2026-08-15.** This entry described a live bug from 2026-08-12 until then;
the history is kept because the cascade rule behind it is still worth knowing.

Found 2026-08-12 when the discount field's REMOVE link shipped at 16px/400
while its class said `text-[0.68rem] font-bold`. `globals.css` reset form
controls **outside any cascade layer**:

```css
button, input, select, textarea {
  max-width: 100%;
  font: inherit;   /* ← deleted 2026-08-15 */
}
```

Tailwind's utilities live in `@layer utilities`, and in the CSS cascade an
un-layered rule beats every layered rule **regardless of specificity** — so the
reset won and any `text-*`, `font-bold`, or font-family utility on a button was
silently discarded.

**The fix was a deletion, not a re-layering.** Tailwind's own preflight already
sets `font: inherit` on `button, input, select, optgroup, textarea` inside
`@layer base`, so the app's copy was a duplicate that differed only by sitting
in the stronger un-layered origin. Removing it leaves the preflight in charge:
a control with no font utility still inherits exactly as before, and a control
with one finally gets it.

⚠️ **Do not re-add `font: inherit` to that rule.** `max-width: 100%` stays
un-layered on purpose — it is an overflow guard, not typography.

**What actually changed when it landed** (measured on the running app, before
and after, via `getComputedStyle`): only controls whose font came *solely* from
the generic inherit moved. The app's own un-layered component CSS is still
un-layered and still wins, so container-query type scales were untouched —
shop-card Add to Cart held at 9.28px/700, Filters and the cookie Accept at
10.88px/700. The movers were the shop-card photo arrows and the drawer close
(16px/400 → 14px/700, i.e. their declared `text-sm font-bold`) and the header
Menu button (400 → 700 weight).

The inline `BUTTON_LABEL_FONT` in `DiscountCodeField.tsx` is now redundant
rather than wrong — inline styles still beat everything. Leave it; it is
harmless and removing it is a separate visual decision.

**The failure mode is what makes this expensive.** `letter-spacing` and
`text-decoration` are NOT part of the `font` shorthand, so `tracking-*` and
`underline` still apply. A broken button therefore renders half-styled — right
tracking, right underline, wrong size and weight — which reads as a design
choice rather than a bug. The REMOVE link had `tracking-[0.14em]` computing
against the inherited 16px instead of the intended 0.68rem, making it *wider
and larger* than the class implied.

**Rules, as they now stand:**

1. **Tailwind font utilities on a button, input, select or textarea apply
   normally.** Write `text-sm font-bold` and expect it. The workaround of
   pushing font properties into `style` is no longer required.
2. **An un-layered rule still beats every utility.** Any font declaration in
   `globals.css` outside a layer, or in a styled-jsx block, still wins over a
   Tailwind class — that is why the container-query type scales on shop-card
   buttons survived this change untouched. When a class looks ignored, look for
   an un-layered rule before assuming the cascade is broken again.
3. **Inline `style` beats everything**, layered or not.
4. **`<label>`, `<span>`, `<p>`, `<th>`, `<h2>` were never in the reset** and
   were always fine.

The durable lesson is the cascade one, and it outlives this particular bug: **a
duplicated reset in a stronger origin is invisible until it contradicts
something.** The declaration was identical to Tailwind's; only its origin
differed, which is why nothing looked wrong for months and why the symptom, when
it came, looked like a design choice rather than a defect.

### The header brand row is full on a phone — its three sizes move together

Owner request, 2026-08-17: show the octopus mark at every viewport width. It had
been `hidden md:block` since it was introduced, so phones and every sub-768px
tablet showed the wordmark with nothing beside it.

**Why this was not a one-word change.** The brand `<Link>` is `shrink` +
`overflow-hidden` and the action cluster is `flex-shrink-0`. That combination
means the header can never overflow the page — it absorbs the pressure by
clipping the brand instead. So adding a 42px mark to a row that was already full
did not produce a visible break that anyone would notice and report; it produced
"Naples Estate Jewelr" with the tail quietly sliced off. Measured before the
fits-pass, in Spanish with the menu open: **16.6px cut at 400px**, 11.6px at
350px, and exactly 0.0px of headroom at 430px.

**The decision: three sizes are one coupled budget, not three independent
knobs.** Below `md` the row holds mark + gap + wordmark and nothing is spare, so
all three now shrink together on the same band —

| | Value | Why that value |
| --- | --- | --- |
| Mark height | `clamp(1.75rem, 7vw, 2rem)` | floor is the 1.75rem the action buttons already drop to below 350px; ceiling is the 32px mobile content budget |
| Wordmark | `clamp(8.75px, 2.35vw, 11px)` | floor is the 8.75px this header already used at 320px; caps at ~468px |
| Brand gap | 5px below md, 8px at md+ | 3px the wordmark does not have to surrender |

Both mark heights are the header's OWN content budget — 32px of the 56px mobile
token, 40px of the 72px desktop one — so making the mark visible did not move
`--site-header-height`, and every offset derived from that token is untouched.
The mark rule is bounded at `max-width: 767px` specifically so it never competes
with the `md:h-10` utility; a single-class CSS rule and a Tailwind responsive
utility have equal specificity, and which one wins would come down to source
order.

**Two traps worth naming:**

1. ⚠️ **Measure Spanish with the menu OPEN.** `Cerrar` is the longest toggle
   label, and the toggle grows when tapped, so the widest state of this row is
   one that only appears after an interaction. English carries roughly twice the
   slack (22.5px vs 13.3px at 400px), so an English-only check passes a layout
   that clips in Spanish.
2. ⚠️ **A step in a fluid band lands its worst case at the step.** The old rules
   held the wordmark at `11px` and dropped to `clamp(8.75px, 2.75vw, 10px)` only
   below 400px — so at exactly 400px the wordmark jumped UP while the row
   padding and gaps also grew, making 400px worse than the narrower widths on
   either side of it. One clamp across the whole band removes the cliff.

The general rule: **when a flex row clips rather than overflows, "it fits" is
not something you can see — it is something you measure.** Verified 0px clipped
and 0 page overflow at 320/350/400/430/639/640/767/768/1280.

**Postscript, same day — the ES/EN chip left the row and paid the debt back.**
Owner asked for the language toggle to collapse into the dropdown nav on mobile.
It needed no new markup: the mobile menu had carried its own `Español`/`English`
item all along, so the header chip was a *duplicate control on exactly the
widths that could least afford one*. Hidden below `md`, it freed 17.2px — and
that went straight into raising the wordmark clamp from `2.35vw` to `2.9vw`,
which is at or above its pre-mark size at every width. **Net across both
changes: the mark was added and nothing else got smaller.** The lesson worth
keeping is the ordering one — the fits-pass forced a compromise, and the
compromise became unnecessary one change later; when a squeeze forces you to
shrink something, note it, because the constraint may not be permanent.

Removing the chip was checked against **mobile-first indexing** before it went:
the mobile menu is only in the DOM while open, so a closed mobile page now has
no body link to the other locale. Safe here because hreflang is declared in the
HEAD by `pageMetadata()`/`alternatesFor()` on every page and every locale URL is
in the sitemap — but that is the check to repeat before removing any other
locale link, not an assumption to inherit.

⚠️ **Never put a backtick in a comment inside `HEADER_STYLES`.** That block is a
template literal; a stray backtick terminates the string mid-CSS and Turbopack
reports it as `Expected a semicolon` pointing at the comment, which reads like a
CSS syntax error rather than a JS string error. Cost a 500-ing dev server during
this change.

### Tap feedback is CSS-only, and the route bar shows only when it must

Owner request, 2026-08-15: on touch there was no sign a control had been hit
until the next page painted. Two halves, deliberately separate.

**The tap itself — `@media (hover: none)` in `globals.css`, no JavaScript.**
Pure CSS is a hard requirement, not a preference: the shop cards and the hero
run their own touch handlers with measured slop and direction cones, and press
listeners here risked interfering with gestures that were expensive to get
right. ⚠️ **Scope press states by POINTER, never by width.** The rules this
replaced were gated behind `min-width: 641px`, which handed tablets hover styles
they can never trigger while leaving every phone with no feedback at all —
verified at 375px, where `min-width: 641px` does not match. Anchors need
explicit treatment too: the generic `button:…:active` rule matches only real
`<button>` elements, so the 132 `.gold-button` usages that are anchors had
nothing.

Product **cards** deliberately get no press state. They are swipeable, and a
scale on `:active` would fire mid-swipe. The route bar covers a card tap.

**The wait after it — `components/layout/RouteProgressBar.tsx`.** Two rules:

1. ⛔ **SUPERSEDED 2026-08-17 — see *"The route bar is immediate, and that is the
   whole point"* below.** Rule 1 was "only when needed": nothing rendered for the
   first **120ms**, and same-path clicks (including query-only shop filters)
   never armed. The owner reversed it; the bar is now immediate on every
   navigation, and query-only changes arm.
2. **Not one millisecond longer.** No minimum display, no run-to-100%, no
   fade-out tail. The fill stops at 92% and completion is expressed by the
   element being REMOVED — so it can vanish at 40% width, and that is correct.
   ✅ **Still current** — re-offered and explicitly declined on 2026-08-17.

**It sits at the BASE of the header, not the top of the viewport** (owner,
2026-08-15), so it reads as attached to the header. Two constraints made that
less trivial than it sounds:

- ⚠️ **Offset from the `--site-header-height` token, never a literal.** The
  header is sized BY that token and it changes at md (3.5rem → 4.5rem);
  hardcoding 56/72px would drift the moment the header does. Verified flush at
  both breakpoints — bar top 56 against header bottom 56, and 72 against 72.
- ⚠️ **The header is rendered PER PAGE while the bar renders from the root
  layout**, and admin renders no site header at all. So the offset is driven by
  the header's presence — `body:has([data-site-header])` — with a `top: 0`
  fallback. A page that stops rendering the header degrades to the top of the
  viewport instead of leaving the bar floating in empty space, with no extra
  bookkeeping. `SiteHeader` carries the `data-site-header` marker; keep it if
  that element is ever moved or rewritten.

**Why not `useLinkStatus`:** it reports one Link's pending state and must render
inside that Link, so a global bar would mean wrapping every link in the app.
**Why `usePathname` and not `useSearchParams` for completion:** this renders in
the root layout, and `useSearchParams` would opt all 454 static pages into
dynamic rendering. Confirmed unchanged at 454/454 after the change.
⛔ **The `useSearchParams` half of that is superseded (2026-08-17):** the hook is
now used, contained by a `<Suspense>` boundary, still at 454/454. See the entry
below for why it became unavoidable.

⚠️ **The `popstate` trap, which shipped once and was caught by measurement.**
`popstate` fires AFTER the URL has moved, so `location.pathname` inside that
handler is the DESTINATION, not the origin. Recording it as the origin makes the
completion check compare a path against itself; it never becomes true and the
bar sits on screen for the full 8s safety timeout. **The origin must be the last
path React COMMITTED**, tracked in a ref. Pinned by
`route-progress-bar.test.ts`, which asserts the failing comparison directly.

The 8s timeout is a backstop for a cross-path anchor whose handler cancels the
navigation, not part of normal operation. Normal completion is the path commit.

### The route bar is immediate, and that is the whole point

Owner, 2026-08-17. The report was that the bar showed "only on some pages and
some viewport sizes". **It was never gated by either** — it mounts globally and
its CSS has no media query. What produced that impression is worth keeping,
because it is a general trap:

> **A delay-gated indicator inherits the timing distribution of whatever it is
> measuring, and that distribution is not uniform across devices.**

The 120ms delay meant a navigation faster than 120ms showed nothing. Next
prefetches links as they enter the viewport, so on a desktop most links are warm
and commit instantly (no bar), while on a phone fewer are prefetched and product
cards set `prefetch={false}` (bar). The same tap on the same link behaved
differently depending on screen size — so a rule written as "only when needed"
was experienced as "at random". **Consistency was the missing feature, not
coverage.**

**Rule 1 is therefore reversed: immediate, on every navigation.** No delay;
`setVisible` is synchronous in the click handler.

**Rule 2 was re-offered and explicitly declined, so it stands.** The obvious
companion change — a ~200ms minimum plus a run-out to 100%, which is what most
route loaders do — was put to the owner and refused. The bar still vanishes the
instant the route commits. ⚠️ **A fast navigation therefore flashes, by
decision.** Do not add a minimum duration to "fix" it without asking again.

**Query-only navigations now arm**, and that forced two consequences:

- **Completion must be keyed on path AND query.** A shop filter never changes
  the path, so the old path-only comparison would return "not arrived" forever
  and strand the bar for the full 8s safety timeout — the same shape as the
  popstate trap above. `locationKey()` normalises the two spellings that reach
  it (`URL.search` gives `'?a=1'`, `URLSearchParams.toString()` gives `'a=1'`);
  if those ever disagree, every navigation looks incomplete.
- ⚠️ **`useSearchParams` is now used, and its `<Suspense>` wrapper in
  `[locale]/layout.tsx` is load-bearing.** The hook client-renders the tree up
  to the nearest boundary; without the wrapper that tree is the entire app and
  all 454 prerendered pages deopt. With it, containment is exactly the bar —
  which renders null anyway. Verified 454/454 after the change, with page routes
  still carrying `●`.

**A click listener can only see anchors**, so navigations that start from a
`<button>` are wired explicitly through the exported `startRouteProgress(href)`
— shop controls, cart-drawer checkout, both sign-outs, sign-in, admin order
rows. Pass the destination: it is the only way the bar can refuse a push to
where the visitor already is, which would commit nothing and strand it.

**The shop's centred spinner was deleted as a duplicate.** Once the bar armed on
query changes, a single filter click lit both — measured true in the same
mutation batch. The bar sits at the base of the FIXED header, so it is on screen
however far down the catalog the visitor has scrolled, which is what made the
spinner redundant rather than complementary. ⚠️ **Its `role="status"` live
region was KEPT** (now screen-reader-only): the bar is deliberately
`aria-hidden`, and Next's route announcer does not announce a query-only change,
so deleting the region outright would have left screen-reader users with no
signal at all for filtering.

ℹ️ **Back/forward shows no bar on a warm cache, and that is rule 2, not a gap.**
`popstate` fires and the guard arms, but a cached traversal commits inside the
same React batch, so the visible state never renders. There is no wait to report.

### The homepage title leads with the brand; interior pages keep it as a suffix

Owner, 2026-08-15, from a live Google result: the homepage listing read
*"Sell Gold, Jewelry & Sterling Silver in Naples, FL"* with no brand anywhere,
which is confusing for someone searching for the business by name.

The cause is not a missing brand — the title already ended
`| Naples Estate Jewelry`. **Google routinely strips a TRAILING brand**, because
it prints a site name on its own line above the result. The only position it
will not strip is the front. The homepage title (and the matching openGraph and
twitter titles, all from `SITE_TITLE` in `app/layout.tsx`, plus the EN/ES
`title.absolute` on the homepage) now read
`Naples Estate Jewelry - <descriptor>`.

⚠️ **This is deliberately homepage-only. Do not apply it to the `template`.**
`'%s | Naples Estate Jewelry'` stays as-is for interior pages: the brand prefix
costs 24 characters, and Google shows roughly 60, so prefixing it would push the
part that actually identifies the page — a product name, a city — out of view. A
product title is already 73 characters. The homepage is the one page whose job
is to say who we are; every other page's job is to say what it is.

**A second, separate lever: the site-name line.** That line is driven by a
`WebSite` structured-data entity, NOT by `<title>`. Without one Google falls back
to the bare domain, which is why results showed `naplesestatejewelry.com`. The
homepage now emits a `WebSite` entity with `name` and `url`. Per Google's spec it
belongs on the site root ONLY — do not move it into `[locale]/layout.tsx`, which
would put it on all 454 pages. The sitewide `JewelryStore` entity there is a
different thing and is unaffected.

⚠️ **The brand is "Naples Estate Jewelry" — no "Co"** (owner, 2026-08-15). An
`alternateName: 'Naples Estate Jewelry Co'` was briefly set and removed the same
day. Google cross-checks the `WebSite` name against the `JewelryStore` schema,
the header wordmark, and the Google Business Profile when picking a site name,
and disagreement among them is itself a reason it falls back to the bare domain —
so a second name that nobody actually uses works against the entity's purpose.
**Do not add an `alternateName`** unless the business genuinely trades under a
second name; `Naples Antiques LLC` is the legal entity, not a trading name, and
must not go there. A sweep of shipped source found the "Co" form in exactly one
place (that line), so the rest of the app was already consistent. ⚠️ When
sweeping for this, match `Naples Estate Jewelry Co` with a word boundary — a
loose search for "co" collides with the legacy `naplesestatejewelry.co` domain,
which is unrelated and must never be edited.

**Title length is managed per page, and the brand is not the thing to cut.**
Google shows roughly 60 characters; the homepage sat at 74. Rather than move the
brand back to the end, the descriptor was trimmed — dropping `Sterling` brought
it to **65** and kept the trailing `in Naples, FL`, the local qualifier that was
otherwise the part being truncated away. Nothing was lost: truncation is
display-only (Google reads the full title for ranking), and `sterling` remains in
the homepage's description, its visible copy, and its JSON-LD.

The same pass fixed a genuine gap it exposed: **`/silver-services` — the page
that should own "sell sterling silver naples" — did not contain the phrase in
its title**, spending the space on `Silver Buyer`, which restated `Sell Silver`.
It is now `Sell Sterling Silver in Naples, FL` (58 characters with the template).
The net effect on that keyword is positive: it moved from a page that would never
win the query to the page that should.

⚠️ **Both changes are re-crawl-gated.** Google re-evaluates titles and site names
on its own schedule; expect days to weeks. A search result that looks unchanged
the day after deploying is not evidence of a fault, and Google may still rewrite
a title it considers a poor match.

ℹ️ **Measured 2026-09-03, 19 days after the `WebSite` entity shipped:** the
homepage had been crawled that same morning (URL inspection: last crawl Sep 3,
4:51 AM, Googlebot smartphone) and the result STILL showed the bare domain as
the site name — with Google now also stripping the LEADING brand from the
homepage title ("Sell Jewelry, Gold & Silver in Naples, FL"). Read that as
Google treating "Naples Estate Jewelry" as redundant with the site line it
prints, i.e. it has connected the name to the domain but has not flipped the
display yet. Everything controllable is in place (`WebSite` name/url on the
canonical homepage, `og:site_name`, brand-first title, one name everywhere,
GBP name identical). Two things work against a fast flip and cannot be coded
around: the `.com` is one month old to Google as this business (Change of
Address Aug 2), and its referrer history includes the GoDaddy "for sale"
parked page it used to be. ⛔ Do not "fix" this with an `alternateName`, a
title change, or a re-deploy — recheck the brand SERP every couple of weeks
instead. The one harmless nit, only if a deploy is already happening: the
`WebSite.url` is `https://naplesestatejewelry.com` while Google's normalized
canonical is `https://naplesestatejewelry.com/` (trailing slash); Google's own
example uses the slash. Zero evidence it matters.

✅ **2026-09-14 (owner: "build option 1").** The SERP still showed the bare domain.
- **Changes (STAGED):** `WebSite.url` gets the trailing slash, `@id`
  `…/#website`, and `publisher → {@id: …/#business}` (the JewelryStore). The
  builder and IDs live in `lib/site-ld.ts`; the layout imports
  `BUSINESS_ENTITY_ID`.
- **Owner decisions the same day:**
  - ⛔ No slogan-style name ("Naples Estate Jewelry - #1 Jewelry Buyers").
    Google's guideline is "a concise, commonly-recognized name", and it
    cross-checks the GBP name (which must never be keyworded).
  - `alternateName: ["NaplesEstateJewelry.com"]` was first held as a last
    resort. **Later the same day the owner agreed to add it now, in the same
    change.** Google only uses it when it isn't confident in `name`, and that
    is today's state. It's the logo/splash wordmark, and mixed case, so Google
    doesn't read it as a plain domain preference.
  - ⚠️ This is a WEBSITE site-name fallback. The JewelryStore entity keeps its
    no-alternateName rule (business aliases still muddy the one-name signal).
  - Trade-off accepted: Google may show "NaplesEstateJewelry.com" for a while
    before it trusts "Naples Estate Jewelry". Removing the alternate later is
    one deploy plus a re-crawl.
- **Recognition work:** the name used consistently in reviews, posts and
  citations is the lever Google actually weighs.
- **After the deploy:** request indexing for the homepage in GSC so Google
  re-reads the entity sooner.

⚠️ SUPERSEDED 2026-09-03: the snippet's run-together
`(239) 404-8505info@naplesestatejewelry.com` was NOT structured data — it was
the footer's two inline anchors shipping with no whitespace between them
(`</a><a`). See *Adjacent inline elements need an explicit whitespace text
node* below. Fixed in `SiteFooter.tsx`.

### The favicon is the octopus mark, cropped from the existing nav logo

Owner, 2026-08-16: Google search results showed a **gold palm tree**, which is
not the brand mark. The favicon is now the octopus emblem — the same mark the
site header already uses — so the search result, the browser tab and the header
finally agree.

**Source is `public/assets/images/branding/nav-logo.webp`.** Both icon files are
DERIVED from it, so if the logo is redrawn, regenerate rather than edit:

- `src/app/icon.png` — 96×96
- `src/app/favicon.ico` — a real multi-size ICO container (16/32/48, PNG
  payloads). ⚠️ **Both must be replaced together.** Next emits a `<link>` for
  each, and leaving one behind means Google can keep serving the old mark.

🔄 **The mark was replaced 2026-08-16 (owner):** the navy circular emblem that
carried its own "NAPLES ESTATE JEWELRY" text — duplicating the wordmark beside
it in the header — gave way to the octopus **alone, on transparency**. The
header logo and both icon files were regenerated from the new artwork together;
they must never drift apart.

Facts about the current source worth keeping:

- It is a **landscape 1.31:1** cut-out (157×120 WebP, 16KB), not the old 160×160
  square. `SiteHeader`'s `width`/`height` props were corrected from `40/40` to
  `52/40` — they are aspect-ratio metadata for `next/image`, and leaving them
  square mis-declares the artwork.
- ⚠️ **Keep the header asset small.** The original export was 1536×1024 PNG at
  2.9MB; a naive 240px-tall WebP came out at 46KB against the old emblem's
  5.4KB. It ships on every page, on a site with first-paint history, so it is
  capped at **120px tall / 16KB** — 3× the 40px render and no more.
- The icons keep the artwork's **transparency** rather than the old navy field.
  Checked on both a white and a `#202124` tab bar: the navy body carries enough
  luminance and the gold suckers hold up.
- ⚠️ **The favicon is a square CROP of the artwork, not the whole creature
  letterboxed into a square.** Letterboxing shipped first and the owner reported
  the tab icon looked tiny — correctly: the artwork is 1.3:1 landscape, so a
  square canvas left it filling only **100% × 77%** of the frame, with empty
  bands top and bottom eating the 16px tab slot. Cropping to
  `1011×1011` centred takes it to **100% × 100%**, measured on the shipped file.
  The cost is the outer tentacle tips and part of the pendant; at 16px that is
  the right trade, and the silhouette still reads as an octopus.
  **The header logo keeps the FULL artwork** — it has the width to show it.

The older constraints below still apply to any future crop:

1. **Crop above the wordmark.** The emblem has "NAPLES / ESTATE JEWELRY" text
   below the octopus (its top edge is ~y103 in the 160px source). Any crop
   reaching it renders illegible letter fragments at favicon size, which reads
   as a mistake rather than a logo. The crop is `left 35, top 14, 88×88`.
2. **Leave a margin — Google masks favicons into a CIRCLE.** The octopus is
   scaled to ~83% and centred on a navy field (`rgb(4,26,50)`, sampled from the
   source). A full-bleed version was rejected: its tentacles ran into the
   corners, exactly what a circular mask clips.
3. **Size in multiples of 48.** Google asks for it; the previous icons were
   64×64 and 32×32 and satisfied neither. 96 is also the largest clean size the
   160px source yields with **no upscaling**, so do not go higher without a
   higher-resolution logo.

⚠️ **Re-crawl-gated like the title work** — Google refreshes favicons on its own
schedule, and it caches them aggressively. Weeks, not days.

### A page-level `openGraph` REPLACES the layout's — it does not merge

The most dangerous thing to know about metadata in this app. Next merges
metadata objects **shallowly**, so a page that declares `openGraph` (or
`twitter`) overwrites the root layout's block entirely. Omit `images` and the
share card goes **blank** — silently, because the page still renders perfectly
and nothing errors.

Consequence: any page that localizes or customizes `og:title` **must also
restate `type`, `siteName` and `images`**. To keep the image path out of two
files, `SITE_NAME` and `OG_IMAGE` are exported from `lib/seo.ts` and imported by
both the root layout and the homepage. Add a third consumer the same way rather
than copying the path.

**What this fixed (2026-08-16).** The homepage declared no `openGraph` at all, so
`/es` inherited the English block wholesale: English `og:title` and
`twitter:title`, English `og:description` and `twitter:description`, and — worse
than cosmetic — an `og:url` of `https://naplesestatejewelry.com`, pointing every
Spanish share at the **English** homepage. `og:locale` was absent entirely,
leaving Facebook to assume `en_US`.

The homepage now builds its own localized block. `og:url` comes from
`alternatesFor('/', locale).canonical` — the same helper that produces the
canonical link — so the two cannot drift. `og:locale` / `og:locale:alternate`
come from `ogLocaleFor()`.

✅ **Closed 2026-08-16 by `pageMetadata()` in `lib/seo.ts`. Use it for every
public page** — pass `title` / `description` / `path` / `locale` and it returns
the title, canonical + hreflang, and a complete social card. Do not hand-roll an
`openGraph` block again; three separate defects came from doing so.

Facts it encodes, each verified rather than assumed:

- **`title.template` does NOT reach `og:title`.** Proved empirically: a page
  declaring `openGraph.title: 'ZZPROBE'` emitted exactly `ZZPROBE`, unsuffixed.
  So the helper appends `TITLE_SUFFIX` itself. Pass `brandedTitle: true` for the
  homepage, whose title already leads with the brand.
- **The same probe wiped `og:image` and `og:site_name`**, demonstrating the
  replace-not-merge rule live.
- **An empty `images: []` is as blank as no tag.** The helper's `image` falls
  back to `OG_IMAGE`, so an image-less product still shares the site card.

⚠️ **`noindex` pages are deliberately NOT converted** — the legal set (via
`getLegalMetadata`), `/checkout`, `/shop-modern`, `/unsubscribe`, and everything
under `/admin` and `/account`. A page excluded from search is not a page anyone
shares, and giving it a social card is the wrong signal.

### A `noindex` page is never listed in the sitemap

Submitting a URL in `sitemap.xml` tells Google to index it while a `noindex`
header tells it not to. Google logs that contradiction as a Search Console
error. All six legal pages did exactly this until 2026-08-16.

**`sitemap.ts` subtracts `LEGAL_NOINDEX_PATHS`** (exported from
`legal-metadata.ts`, derived from the same object that sets `robots.index:
false`). The filter is deliberately a subtraction rather than a hand-pruned
list, so re-adding one of those paths to `STATIC_PAGES` cannot silently
reintroduce the contradiction. `legal-metadata.test.ts` pins the constant to the
pages actually marked noindex, in both directions.

The direction of the fix was to REMOVE them from the sitemap, not to index them:
legal boilerplate earns no search traffic, and `follow: true` already lets link
equity pass through.

### The homepage `<h1>` states the service, and its LENGTH is load-bearing

Owner approved changing the brand voice, 2026-08-16. The hero `<h1>` was
*"Rare. Authentic. Timeless."* — no service, product or location in the one slot
Google reads as the page's topic — while the keywords sat in the eyebrow above
it, which is a `<span>` and carries no heading weight whatsoever.

The hero is now (owner copy, settled 2026-08-16):

```
ONE PIECE OR AN ENTIRE ESTATE                   ← eyebrow (span)
Naples Premier Gold, Sterling & Jewelry Buyers  ← <h1>
```

ES: *"Una Pieza o Todo un Patrimonio"* / *"Compradores de Oro, Plata y Joyería
en Naples"*.

**Keywords in the `<h1>`, by owner priority:** the strongest signal on the site
should be that we BUY in Naples, and the `<h1>` is the only element that can
carry that with heading weight. It holds location + three categories + buyer
intent.

**The eyebrow does the human work.** It names the customer's situation rather
than reciting inventory — the audience is executors and downsizing families, and
it answers both unspoken worries at once: *is my single ring worth their time?*
and *can they handle a whole estate?*

⚠️ **"Premier", not "Premiere."** The latter means a debut performance.
`/silver-services` already used the correct form, and "Premiere" appears nowhere
in the codebase — do not let a well-meaning edit reintroduce it in the site's
largest text.

⚠️ At 46 characters the headline is far past the ~29-char two-line budget, so
**the line count now differs by breakpoint** — two lines on desktop, three on
phone and tablet. Re-measure on any rewording; assume nothing.

**`.home-hero-top` is capped at `72rem` (1152px), NOT the `52rem` it shared with
the sign-up block.** Measured: this headline needs exactly 1152px to fall from
three lines to two at the 5.75rem type cap — 1024px and 1100px are both still
three. Below roughly 1250px the `92vw` term binds first, so phones and tablets
are untouched (verified at 390px: block width 359px = 92vw exactly, still 3
lines at 30.4px).

⚠️ **Do not apply the same cap to `.home-hero-bottom`.** That block holds the
subscriber form and the Buy/Sell/Trade buttons; stretching an input row to
1152px makes it worse. The two blocks having different widths is intentional.

ℹ️ Shrinking the mobile type was considered and **rejected on measurement**: at
320px this headline stays three lines all the way down from 30.4px to 22px, and
only becomes two at 20px — which is body-text size, not a hero. Smaller type
buys a ~20% shorter block and no fewer lines. If the phone rendering ever needs
fixing, cut characters, not points.

↳ **Amended 2026-09-13:** on a SHORT window the headline now does shrink
(phones ~30px → 26–27px, desktop more) so it clears the sign-up form — owner's
"Option A". The finding above still holds for the phones that remain
overlapped at the 1.5rem floor: shorten the copy there. See *"The homepage
headline shrinks in place on a short window"*.

⚠️ **`line-height` on this headline is 1.15 and must not go below ~1.1.** It was
`0.95`, which advances the baseline LESS than the font's own ink occupies, so on
a two-line headline the descenders of line 1 collided with the ascenders of
line 2 — visibly, the "p" of "Naples" sitting on the "i" of "Sterling".

Measured at the 5.75rem cap (92px): line 2 needs **77px** of ascender and line 1
drops a **23px** descender = **100px of ink** against an **87.4px** advance — a
**12.6px overlap**. 1.0 and 1.05 still collide; 1.1 clears by only 1.2px, thin
enough for a font-fallback swap to erase; **1.15 clears by 5.8px**. The ratio
applies at every size, so the collision existed on phones too, just less
visibly — at 390px the worst-case wrap now clears by 1px.

Tight leading is fine as a look; tighter than the font's ink is a bug. Measure
`actualBoundingBoxAscent` + `actualBoundingBoxDescent` against the advance
before tightening it again.

A brand-voice headline (*"Pieces Worth Discovering"*) held this slot briefly and
was reverted, because it left the homepage with no on-page topic signal at all.
That trade is the one to weigh if the question returns.

Rejected drafts, worth not repeating:

1. **"Sell Gold & Jewelry in Naples"** — ambiguous beside a carousel of pieces
   **we** are selling. The eyebrow's "buy & sell" now solves this explicitly.
2. **"Naples Gold & Jewelry Buyers"** / **"Naples' Trusted Jewelry & Gold
   Buyers"** — keyword-correct but read as directory entries.
3. ⚠️ **"Know What Yours Is Worth"** (owner caught this). It implies the visitor
   should ALREADY know what they have — backwards, since most arrive holding
   something inherited and unidentified. **Copy must put the knowing on US, not
   the customer.** This test outlives any particular wording — apply it to every
   future hero draft.

If first-person is ever reintroduced, use **"we"** not "I" despite
`/free-evaluation` using the singular: staff arrive with the storefront.

⚠️ **Keep it to roughly 26–29 characters.** This is a measured constraint, not
taste. At `clamp(2.4rem, 8vw, 5.75rem)` in a `min(92vw, 52rem)` box:

| Length | Line count |
| --- | --- |
| 26–29 chars | **2 lines at every width** — the profile this page has always had |
| 38 chars | 3 lines at 320px *and* at 1280px+ |
| 48 chars | 4 lines |

So the full page title will **not** fit here; re-measure before lengthening.
Verified live after the change: 2 lines at 320px (262px in a 294px box) and at
1440px (800px in an 832px box, 92px type), no overflow and no horizontal scroll
at either.

### Hero copy states CATEGORIES, never the service model — a storefront is coming

Owner disclosed 2026-08-16 that a **physical location is opening soon**. The
whole site is currently built on the opposite premise: `PROJECT_OVERVIEW`
records "mobile, appointment-only, no physical storefront", and **10 files**
carry copy asserting it — "we come to you" / "vamos a usted", "no storefront",
"appointment-only" (`(home)`, `about`, `free-evaluation`, `sell`, `sell/[city]`,
`services`, `trade-in`, `layout`, `ContactForm`, `SiteFooter`).

ℹ️ **File-list note (2026-08-22):** `ContactForm.tsx` no longer exists — it was
deleted as dead code (`CHANGELOG.md` 2026-08-22 (7)), so that list is 10 files as
of 2026-08-16 and 9 today. **The rule below is unaffected**; only the inventory
shrank.

**Rule for new hero/marketing copy until it opens: describe WHAT WE BUY, not HOW
WE OPERATE.** A category list ("Estate Jewelry · Silver · Diamonds · Coins")
never expires; "Private · Mobile · By Appointment" would need rewriting the day
the doors open. The current eyebrow was chosen on exactly this basis — an
earlier draft used the service-model wording and was rejected once the opening
was known.

✅ **The schema is already honest and needs no emergency fix.** The
`JewelryStore` block in `[locale]/layout.tsx` declares `addressLocality` /
`addressRegion` / `addressCountry` with **no `streetAddress` and no
`postalCode`** — the correct shape for a service-area business. Nobody invented
an address, so there is nothing to unwind.

**What the opening will require** (not started — see TASKS):

1. **A verified Google Business Profile at the real address is the single
   biggest lever**, larger than anything on-site. A service-area business is
   weak in the local pack; a verified storefront competes in it, and that is
   where most "gold buyer naples" clicks go.
2. `address` gains `streetAddress` + `postalCode`; `geo` moves from the current
   Naples-centre approximation (26.142, -81.795) to the real coordinates.
3. `openingHoursSpecification` already claims Mon–Sat 10:00–17:00 — harmless
   for a service-area business, but it must become genuinely true.
4. The 10-file copy pass above, in **both locales**.
5. NAP (name / address / phone) must match exactly across the site, the GBP and
   any citations — mismatches are a common local-ranking own goal.

### The homepage renders TWICE in the client DOM — that is React, not our code

> ⚠️ **SUPERSEDED 2026-09-14.** `(home)/loading.tsx` (and the now-unused
> `SiteLoadingScreen`) were deleted, so the homepage no longer has the hidden
> `S:0` holder or a second copy. The deletion was not about the duplicate: that
> holder kept Chrome from drawing ANYTHING until React's `$RC` swap, about 1 s of
> white on phones (replay A/B first paint 732 → 472 ms). ⛔ Do not add a
> homepage `loading.tsx` back; `HomeBootSplash` is the cold-load cover. The
> heading-count advice below still applies to `/shop`, which keeps its
> `(list)/loading.tsx`.

Measured in a **production build** on 2026-08-16 while verifying the hero:
`document.querySelectorAll('h1')` returns **2** on the homepage, and there are
two complete `<main>` trees.

**It is not a bug in this codebase and must not be "fixed".** The second copy
lives in `<div hidden id="S:0">` — React's own streaming-Suspense holder, named
by React — with a computed `display: none`. The page has `loading.tsx`, so it
streams; the holder is the mechanism.

What matters for SEO is unaffected, and was verified separately:

- **Server HTML contains exactly ONE `<h1>`** — that is what Googlebot parses.
- The live DOM has **one visible `<h1>`** plus one inert copy inside a
  `display: none` holder.

⚠️ **So measure heading counts against the SERVER HTML (`fetch` + parse), not
`document.querySelectorAll` in a live page.** The audit that produced these
entries did exactly that and was right; a live-DOM count on the homepage will
report a phantom duplicate every time and send someone chasing nothing.

ℹ️ Minor, unrelated to SEO: the holder retains a full ~21KB copy of the page
rather than being emptied, so the homepage DOM carries the content twice. Not
worth acting on, but worth knowing if the first-paint/DOM-size work is ever
resumed.

### The Suspense fallback must not contain an `<h1>`

`loading.tsx` ships FIRST in the streamed HTML, so any heading inside it becomes
the opening heading of that route — ahead of the real one — and leaves two
`<h1>`s in the served markup. `SiteLoadingScreen` did this on `/` and `/shop`,
making **the site's own domain name** the first `<h1>` of the two most important
pages. `HomeBootSplash` had already avoided it for the same reason; its header
comment was the clue.

Fixed by rendering a `<div class="site-loading-title">`, with the CSS selectors
re-pointed so the styling is byte-identical. ⚠️ Keep headings out of any future
loading/skeleton component — Googlebot renders JS and probably settles on the
final DOM, but "probably" is not a thing to rely on for a primary page.

### The nav dismisses on outside interaction, anchored to the whole `<header>`

Owner, 2026-08-16: the mobile menu could only be closed by pressing the toggle a
second time. It now closes on any `pointerdown` outside the header, and on
Escape (`SiteHeader.tsx`).

⚠️ **The outside test is anchored to the `<header>`, not to the panel.** The
toggle button lives in the header too, so a narrower test would let one tap both
close the menu (via the outside handler) and re-open it (via the button's own
`onClick`), leaving it stuck open. Pinned by a live check that tapping the
toggle while open still closes it exactly once.

`pointerdown` rather than `click`: it fires on the press instead of the release,
so the menu is gone before the finger lifts, and one listener covers mouse,
touch and pen. (`ComboboxInput.tsx` uses `mousedown` for the same job — fine
there, since it is an admin-only, mouse-first control.)

The handler also **blurs a focused element inside the header**, because the
header holds two menus that close by different mechanisms: the mobile panel and
its accordions are React state, while the desktop dropdown is pure CSS
(`group-hover` / `group-focus-within`) with no state to reset. A mouse closes
that one by moving away; a tap or a Tab leaves the trigger focused, and only a
blur closes it.

✅ **The desktop dropdown itself is healthy** — verified, after a false alarm
worth recording. See *"A hidden Browser pane freezes CSS transitions"* below.

### A hidden Browser pane freezes CSS transitions — do not trust computed values

⚠️ **Refines the existing "hidden pane" warning, which says to trust
`getComputedStyle` over screenshots. That is true for LAYOUT, and wrong for any
property under a `transition`.**

When the pane is not displayed the page stops compositing, so a transition's
clock does not advance. `getComputedStyle` then returns the transition's START
value **indefinitely** — it does not eventually settle on the target.

This produced a convincing false bug on 2026-08-16. The desktop nav dropdown
(`transition-all duration-150`) appeared to be broken: with the trigger hovered
AND focused, `opacity` read `0` across repeated waits up to 600ms, while
`pointer-events` — not an animated property, so applied instantly — correctly
read `auto`. That combination looks exactly like an invisible click-catcher, and
`elementFromPoint` "confirmed" it by returning `a.nav-dropdown-link`. All of it
was an artifact; the dropdown works.

**How to test an animated property reliably:**

1. Set `element.style.transition = 'none'`, force a reflow (`void el.offsetHeight`),
   then read — the property lands on its target with no clock involved.
2. Beware a **physical cursor left parked** by an earlier `computer` hover: it
   keeps `:hover` active and silently poisons every later reading. Check
   `group.matches(':hover')` before concluding anything.
3. For a state you cannot trigger in place, **build an isolated clone** with the
   same classes somewhere the cursor is not, and drive it directly. That is what
   finally settled this one: resting `0`, focused `1`, after blur `0`.

Also useful, and got this wrong twice: a CSSOM walker must record
`rule.selectorText` **and** recurse into `rule.cssRules`. Modern nested CSS means
a style rule exposes both, so an `if (r.cssRules) … else …` walker silently skips
every nested style rule and reports an empty result that reads like a clean one.

### UI icons are inline SVG, never ligature fonts

All application icons render through
`next-app/src/components/AppIcon.tsx`, which maps stable semantic names to
direct Lucide React SVG imports. Do not add icon fonts, ligature text,
font-glyph subsetting, or independently cached icon-font assets.

Decorative graphics may be omitted. Functional icons must remain accessible
through surrounding text or control labels. An unknown data-driven icon renders
nothing rather than exposing its identifier, and the icon-integrity regression
test must continue rejecting legacy font infrastructure and unmapped static
`AppIcon` names.

**Icons are OUTLINE by default, and a solid one asks explicitly.** `AppIcon`
renders `fill={fill ?? 'none'}`; anything that should be solid — a saved heart,
a rating star — passes `fill="currentColor"` at the call site.

⚠️ **Never reintroduce `fontVariationSettings`.** Those are Material Symbols
variable-font axes and mean nothing to an SVG. Until 2026-08-09 `AppIcon`
translated a `'FILL' 1` value into `fill="currentColor"`, which is right for an
icon FONT (the axis swaps to a solid-with-knockout glyph) and badly wrong for a
Lucide OUTLINE icon: it floods the shape, and since every interior mark is a
same-coloured STROKE, the detail vanishes. A filled `circle-check` is a plain
disc; a filled `gem`, `watch` or `badge-check` is a blob. It went unnoticed for
a long time because each icon still *rendered* — 14 of 24 icons on
`/free-evaluation` were affected before the owner reported them as "primitive".
The test now fails the build if the property reappears anywhere outside
`AppIcon.tsx`.

### /free-evaluation is a sendable landing page, not a form page

Owner framing 2026-08-09: this URL gets TEXTED to someone who does not know what
they own. It has to explain the service before it asks for anything — the form
in the hero read as being asked to hand over details before anything had been
explained.

- **The form lives in the SECOND block, never the hero**, under a lead-in that
  says photos are optional. The hero ends in a `#request` anchor and the phone
  number instead.
- **The hero carries the explanation and Chris's photograph**, in his own voice.
  Two columns, photo shown large — the previous full-bleed-behind-a-gradient
  treatment hid the one image that builds trust.
- **The sorting detail is the substance of the page**, not filler: precious
  metal separated from plated/filled/costume, then split by purity (10k-22k, 9k,
  sterling .925, 800/900, coin silver) with each purity weighed separately,
  priced against live spot with the arithmetic visible, and priced piece by
  piece for anyone unsure what to keep. Keep that specificity if the copy is
  ever revised — vagueness is what the page exists to counter.

- **Buttons use the site classes, never one-off inline styles.** `.gold-button`
  for a primary CTA; `.outline-button` for a secondary, plus the
  `.outline-button-on-dark` modifier on dark bands — the base variant fills
  near-white with `--color-primary` text and is unreadable there.
  ⚠️ **Do not paint a button with `var(--color-primary)` as a background.** It is
  **#735c00**, a deep gold meant for text and accents; used as a fill with dark
  text on top it reads as a disabled control. That is exactly how the
  free-evaluation CTA ended up looking greyed out.
- **The metal list is grouped, ascending, and open-ended** — Gold 9k→22k and up,
  Silver .925/800/900/coin, then everything else — and closes by saying anything
  not listed gets identified too. It exists to show the DETAIL a seller gets
  back, so it must never read as an exhaustive list of what is accepted. The
  purity list in the sorting section mirrors it; change them together.

⚠️ **The hero image is a PLACEHOLDER with the face out of shot, and the framing
is load-bearing.** The copy beside it is first person ("I'm Chris…"), so a
recognisable stranger there would assert something false about who Chris is —
misrepresentation to the customer, not just a stylistic choice. The alt text
therefore describes the desk and the work, never a person. **When a real
photograph of Chris replaces it, update the file and the alt text together.**
The same rule governs any future generated imagery of people on this page.

### Illustrated clay marks are IMAGES; functional UI icons stay Lucide SVG

Owner direction 2026-08-09: the flat gold line icons read as generic ("so many
websites that are vibe coded have these icons"). The `/free-evaluation` trust
pillars and the six category tiles now use **matte-clay illustrated marks** —
raster WebP in `public/assets/images/icons/clay-*.webp` — rendered through
`next/image`, not `AppIcon`.

Rolled out sitewide the same day: the homepage services strip and `/sell`,
`/sell/[city]`, `/trade-in`, `/bullion`, `/gold-services`, `/silver-services`.
**20 marks** live in `public/assets/images/icons/`.

**Render them through `components/ClayMark.tsx`, never a bare `<Image>`.** It
owns the sizing, the float shadow, the `onDark` opt-out, and the `ClayMarkName`
union — that union is the point: a typo becomes a build error instead of a
silently missing image, which is exactly how the old `icon: 'string'` fields
failed. Data arrays holding a `mark` field need `as const` or the value widens
to `string` and the union check is lost.

**The boundary is what matters, not the style.** This is a carve-out for
DECORATIVE marks only. Cart, heart, chevrons, close, form and admin icons stay
Lucide inline SVG under the entry above, permanently: they are functional UI
where a stock icon is correct and `currentColor` recolouring is load-bearing. Do
not migrate them. The same applies to small glyphs sitting inline beside text —
the `star`/`arrow_outward` link decorations, `trending_flat`, `verified`,
`info`: those stayed Lucide in the sitewide pass on purpose.

**Delete what a mark replaces.** The homepage's three service icons were drawn
on a `<canvas>` by `ServiceIconCanvas`; that component was removed, not left
orphaned, along with the vestigial emoji `icon` fields it had stopped reading.
Where a mark landed inside a gold disc (`#d4af37` / `#735c00`), the disc went
too — gold clay on a gold circle is gold on gold, and the mark's own shadow does
what the disc was doing.

Rules that must hold:

1. **Generate in the proven style, then RECOLOUR — never prompt for the final
   colour.** Asking the model directly for "gold and charcoal clay" produced a
   conventional gold-body/grey-shackle split and lost the diagonal two-tone and
   the hand-formed dents. The pipeline is: generate every mark from one shared
   coral-clay prompt template → `remove_background` → apply ONE recolour to the
   whole set. That is what makes a set look like a set; per-mark prompting
   drifts.
2. **The recolour is a hue rotation gated on saturation** (`hue 40, sat x0.78,
   light x0.78, threshold 0.18` — tuning "D", chosen from a four-way ladder).
   Pixels below the threshold are untouched, which is precisely what preserves
   the charcoal second tone, every dent, and the soft shading. It operates on
   the rendered pixels, so form is byte-identical to the approved sample.
   Script: `scratchpad/build-clay.js` shape — re-derive rather than hand-edit.
3. **Background removal takes the ambient shadow with it.** The cutout alone
   looks pasted-on; the float comes back as a CSS `drop-shadow`, which follows
   the alpha channel. **Only on light surfaces** — a black shadow is invisible
   on the `#262928` tiles, so the tile marks carry no shadow at all.
4. **Size them at 72px (pillars) / 136px (category marks), never at icon size.**
   At the old 35-56px the clay modelling and the float both vanish and the file
   weight buys nothing. If a future surface can only afford ~40px, use a Lucide
   icon there instead.
4a. **The category marks have no card behind them** (owner, 2026-08-09 — the
   dark rectangles were removed after the marks were enlarged). They sit
   directly on the section background, so the drop-shadow is what separates
   them; the label colour had to move from near-white to the surface token at
   the same time. Whitespace is now the only thing grouping a mark with its own
   label, which is why the grid uses a much larger ROW gap than column gap.
4b. **`.fe-icon-tile` must stay `justify-content: flex-start`.** Grid rows
   stretch every cell to the tallest, so with centering a one-line label gains
   slack and recentres — the marks then sit at different heights across a row.
   Measured while the cards still existed: a negative margin intended to break
   the top edge was silently absorbed to -6px (no overflow at all) at 390px.
   Top-anchoring keeps all six marks on one baseline whatever the labels do.
5. **A partial upgrade inside one grid is worse than none.** One clay mark
   beside five flat line icons read as broken rather than better, which is why
   all six tiles were done together. Upgrade a set wholly or not at all.
6. Sources are 1024px cutouts; delivery is 216px WebP with alpha (5-10KB each),
   matching the project's downscale/WebP rules.
7a. **A hollow mark needs an optical SCALE on top of a corrected asset, and that
   scale is a TRANSFORM.** Trimming the ring's canvas fixed its extents and it
   still read small, because the shortfall is ink coverage: a ring is mostly
   hole, so it carries far less visual weight than a solid goldbar or phone at
   the same box. It settles at **1.12x** (1.05x inside the six-mark grid),
   reached by walking 2.2 → 1.6 → 1.25 → 1.12 on review.

   ⚠️ **Do not read that number as the whole correction — two separate fixes are
   easy to conflate.** The ASSET was also re-padded from 51% to 80% canvas fill,
   which is a 1.57x optical increase by itself. So scale 1.0 today is already
   far larger than the state originally reported as too small, and there is real
   headroom below 1.12 if it ever still reads big. An earlier version of this
   entry claimed "1.0 reads as undersized"; that described the pre-trim asset and
   is no longer true.

   **Keep the grid's value at or below the global one**; if it ever exceeds it,
   the most size-sensitive surface becomes the most boosted, which is backwards.

   Three things make that safe, and each was learned by breaking it:

   - **Scale with `transform`, never width/height.** Growing the box pushed the
     mark's own heading down and broke alignment with its siblings — a 2.2x ring
     left "We Sell Jewelry" sitting well below the other two card titles.
   - **`transform-origin: bottom center`**, so the mark grows UPWARD into
     whitespace and its baseline never moves. Card and grid labels stay aligned.
   - **Any rule that restates `transform` must carry `--clay-scale` forward.**
     `transform` is one property, so the hover tilt and the reduced-motion reset
     would each snap a scaled mark back to 1x.

   The scale lives in CSS keyed on `[data-mark]`, never inline on the component:
   inline beats every class, and a surface must be able to dial it back. A
   MATCHED SET cannot take what a lone mark can — at 2.2x in the category grid
   the ring was double its neighbours and dominated the row.
7. **Optical size is set by the ASSET's fill ratio, not by the `size` prop.**
   Each generated mark lands with a different amount of transparent margin, so
   equal boxes give visibly unequal marks. Measured across the set: fill ranged
   from **51% (ring) to 89% (pricing)** of the canvas — the ring rendered ~1.6x
   smaller than its homepage neighbours at the identical 88px box, and looked
   undersized on all six pages it appears on.
   **Fix the asset, never the per-page size.** Trim to the alpha bounding box,
   rescale so the longest content edge is ~80% of the canvas, re-pad centred and
   transparent. One edit corrects every page at once; per-page size bumps would
   have to be repeated and would drift. Re-measure with a trim pass before
   adding any new mark. (On Windows, read the file into a Buffer first — sharp
   reading and writing the same path fails with an UNKNOWN open error.)

**Fix the rendering before reaching for new artwork.** The reflex when icons
look crude is to regenerate them or drop in images; here the icons were already
correct and a one-line shim was destroying them. Generated or raster icons would
also break this entry's first rule and cost the site a crisp vector set. Genuine
icon problems that remain after rendering is correct are usually SEMANTIC — the
wrong glyph for the label — and the fix is a different Lucide import, not a
different medium.

## Product Data And Media

### Outbound partner sync sends an allow-list, fails closed on price, and never
### crosses the credential boundary

Applies to the Deep Field Gallery sync and to any future partner push.

1. **Allow-list, never a deny-list.** The outbound field set is enumerated
   explicitly (`DEEPFIELD_PRODUCT_FIELDS`), so a column added to `products`
   later is excluded by default instead of silently shipped to another company's
   database. A second, independent assert against a forbidden list **throws**
   rather than dropping the field — the caller treats a throw as "skip this
   product", which fails in the safe direction. Two mechanisms, because one
   careless edit to the allow-list should not be enough to leak.

2. **Neither side's database credential crosses the boundary.** NEJ POSTs to an
   HTTP receiver with a shared bearer token and never connects to the partner
   database; the partner never receives an NEJ Supabase key. Tokens are
   server-only env vars — a `NEXT_PUBLIC_` variant would publish the token in
   the browser bundle and must never be created.

3. **Never ship a fabricated price.** ~60 of 128 products are spot-multiplier
   with no stored price of any kind; the price is a render-time computation from
   live metal spot. When spot is unavailable, those ship a **null** price with a
   reason rather than a fallback-rate guess. A wrong price rendered on a partner
   storefront is worse than a missing one. This is the same rule
   `getMarketplaceSpotPriceError` enforces for Etsy/eBay writes. Manual and
   sold-locked prices need no spot data, so an outage degrades rather than blocks.

4. **Import `src/lib/pricing.ts`; never reimplement the formula.** Two
   independent copies of the melt/multiplier math will drift, and the drift is
   invisible until a partner's prices are wrong. One-off export scripts that
   cannot import it must be parity-tested against the app module before use.

5. **Partner pushes are fire-and-forget and non-throwing.** Call sites include
   order captures. A partner outage must never fail a customer's payment or
   block an admin save. Same contract as `handleProductStatusChange`.

6. **Hook every path that changes product state, not just the admin one.** The
   checkout sold flip happens inside the `capture_paypal_order` Postgres
   function, so no application code observes it and `adminRevalidateProduct(s)`
   is never called there. A sync wired only to the admin chokepoint leaves the
   partner advertising sold items as available. Under the no-reservation
   checkout only that function writes product `status`/`quantity` — denials,
   cancels, and refunds do not — so the complete set is the two admin
   revalidate helpers plus `paypal/capture-order` and `paypal/webhook`.

### Discount codes: the cap is the control, "once per email" is a speed bump

Established 2026-08-11 when discount codes were built, after researching how
Shopify and Stripe actually enforce this. The distinction below is the one thing
to keep, because it will otherwise be reported as a bug.

**A per-customer limit cannot be enforced on a guest checkout.** Shopify's "limit
one per customer" tracks an *identifier* — the email or phone typed at checkout —
not a person. This checkout allows guests, so a shopper reuses a "one-time" code
by typing a different email. That is the ceiling of what is enforceable, not an
implementation shortfall.

- **`max_redemptions` is the real control.** A global cap, enforced by the
  database, ungameable by anyone. It is what bounds financial exposure.
- **`hasEmailRedeemedCode` is a speed bump and is commented as one.** It stops
  casual reuse. It does not stop anyone who tries.
- **Requiring an account was rejected, and re-proposing it should clear the same
  bar.** It only raises the cost from "second email" to "second account", while
  costing conversions on a guest checkout carrying $700-$10,000 orders. It buys
  friction, not enforcement.

**Redemption is one conditional UPDATE inside `capture_paypal_order`, never a
read-then-write.** The naive sequence — read the code, check the count, apply,
increment — is a TOCTOU race in which concurrent captures both pass the check;
documented cases have overshot an issued limit by 4x. The statement is
`update … set times_used = times_used + 1 where code = … and (max_redemptions is
null or times_used < max_redemptions)`, and **zero rows affected IS the "limit
reached" signal.** It lives in the capture function specifically because that
transaction already row-locks products for the two-buyer race; anywhere earlier
and the count increments for orders that are never paid.

**An exhausted code does not fail a capture.** By that point the money is taken,
so refusing would strand a paid order in an unrecoverable state. The discount is
honored and an `internal_notes` line records it, matching how the inventory race
is already handled.

**The checkout validation route is a preview, never an authorization.**
`/api/checkout/discount-code` exists so the shopper can see the figure before
paying. The authoritative discount is recomputed by `buildOrderDraft` from the
code string at order time — only the code crosses the wire, never an amount.
This is the same rule as *"A query parameter is never an authorization signal"*.
The route is rate-limited because an unlimited code-checking endpoint is a
code-enumeration oracle.

**Order of operations, and why each part is where it is:**

1. **Shipping tier and the $5,000 Express cutoff key off the PRE-discount
   subtotal.** They price *insurance on the goods in the box*, and a discount
   does not change what is in the box. Computing them after would let a code drop
   a $6,000 order under the cap and ship over-value goods on a service that
   cannot cover them. Pinned by a test.
2. **The discount applies to MERCHANDISE ONLY.** Shipping is never discounted.
3. **Florida tax is charged on the DISCOUNTED merchandise plus shipping** — a
   discount reduces the taxable base, the standard treatment.
4. **A fixed discount is clamped to the subtotal.** A $100 code on an $80 order
   takes $80. Merchandise may reach $0, never below; shipping and its tax keep
   the order chargeable, so the existing `total <= 0` rejection and the PayPal
   breakdown both stay intact.

**One table, two types — `(discount_type, discount_value)`, not separate nullable
columns.** Separate `percent`/`amount` columns make "both set" and "neither set"
representable, and neither has a correct behavior. A CHECK constraint gives each
type its own valid range (1-100 vs `> 0`), so the invalid states cannot exist
rather than being something the admin UI has to remember to prevent.

**A fixed-dollar code does not self-scale, which is why `min_order_subtotal`
exists.** 15% off is proportional to the cart; `$100 OFF` is $100 off a $6,000
chain and $100 off a $120 ring. Both Shopify and Stripe pair fixed-amount codes
with a minimum order for this reason. The field is optional on both types.

**PayPal's `discount` breakdown key is omitted, not zeroed, when unused.** The
request object feeds `payPalCreateRequestId`, so an always-present `"0.00"` would
change the hash and invalidate the idempotency key of every existing
undiscounted order.

**Module direction is one-way and must stay that way.** `calculateDiscountAmount`
lives in `checkout-pricing.ts` beside `round2`; `discount-codes.ts` imports and
re-exports it; `checkout-pricing.ts` imports the discount TYPES with `import
type` only, which is erased at emit. A runtime import back would be a module
cycle. Database access lives in a third module, `discount-codes-server.ts`, so
the pure math stays importable by `OrderSummary` on the client.

### Product rows store references, not media bytes

Images and videos never belong in Postgres as blobs/base64. New product images
go to Supabase Storage, are downscaled and encoded to WebP, and use immutable
cache headers. Public/list queries select only the columns they need.

Image cleanup is always reference-aware and dry-run-first. A remove/replace/
delete path must clean owned objects, and any new upload destination must be
added to Storage GC reference scanning.

### Product videos use staged direct Cloudflare Stream uploads

The browser uploads bytes directly to a server-provisioned TUS URL. One saved
video is allowed per product. Replacement remains a candidate until Save;
cancel deletes the candidate; permanent remove/delete is provider-first.
Only ready videos are projected publicly, and list queries do not join/poll
video state.

Marketplace video sync stays disabled until a real generated MP4 succeeds in a
controlled Etsy and eBay test.

### Product measurement contracts are explicit

`products.width_mm numeric(8,2)` is nullable and meaningful only for Necklace
and Bracelet. It stores millimeters, must be positive and no more than 1000,
and is never estimated from photos.

Every buyer-facing surface that shows a width renders it through
`productWidthDisplay` (`types/product.ts`) — shop cards, shop list rows, the
related-products strip, and the product page's Specifications row (**Width** /
**Ancho**, added 2026-08-04 between Link Type and Length). That function owns
both the Necklace/Bracelet restriction and the formatting, so a new surface must
call it rather than read `width_mm` and format its own string; otherwise the
surfaces can disagree about which pieces have a width. `width_mm` arrived in a
later migration, so any query that adds it must treat it as an OPTIONAL column
with a null-backfilling retry.

The other at-a-glance chips — purity (with its karat-graded gold gradient),
weight, and length — live once in `src/lib/product-spec-chips.ts`, together with
the neutral and measurement chip treatments. It is a plain directive-free module
precisely so client components (`ProductCard`, `ProductListRow`) and server
components (`RelatedProductsStrip`) can share it. Those four functions had
already been duplicated byte-for-byte across two components before the strip
became a third consumer on 2026-08-04; do not copy them into a fourth surface.

### Related-strip pills never wrap, and wrap uniformly when they must

Owner rules, 2026-08-04. The "You might also like" pills must never break onto a
second line; they should sit beside the price whenever they fit and drop below it
only when they cannot; they should shrink to keep sharing that line as long as
possible; and when they do drop, **every card in the strip drops together** — a
row where some cards shared the price line and others did not read as a bug.
Enforced by four things in `.related-product-*` (`globals.css`):

1. `flex-wrap: nowrap` on the pill row — the hard one-line guarantee.
2. Price and pills share one `flex-wrap: wrap` row with the pill group as a
   SINGLE flex item, so it either fits beside the price or moves down whole.
3. The CARD is a `container-type: inline-size` query container and the pill type
   is a `cqi`-based `clamp()`, with every length inside a pill in `em` so one
   clamp scales padding and gaps with it. The title uses the same container.
4. Uniformity comes from ONE card-width threshold rather than per-card flex
   fitting: `@container (max-width: 180px)` gives the pill group
   `flex-basis: 100%`. Cards in a strip are always the same width, so the
   decision is identical for all of them. The threshold must stay just under the
   narrowest card at which the worst case (widest pill row + a long price) still
   fits — too high and cards stack while they would have fitted; too low and a
   long-priced card splits from its neighbours. Re-measure if pills, prices, or
   card padding change.

The container must be the card, never the viewport: the strip is 4-up on desktop
and 2-up on phones, so a 640px viewport gives WIDER cards (262px content) than a
900px one (156px). Pill size is non-monotonic in viewport width and monotonic in
card width — a viewport media query would size them for the wrong box.

`cqi` resolves against the container's CONTENT box, not its border box; fitting
the slope against the card's outer width silently makes desktop pills ~6% small.
The bounds are fitted to real measurements. Re-measure both if the pill set,
padding, or card padding changes.

**Revised 2026-08-05** when sub-11px text was lifted off the product page: the
clamp is now `clamp(0.38rem, 0.21rem + 3.13cqi, 0.6875rem)`. Two things are worth
remembering from that change:

- **Raising the CAP alone did nothing.** At the ~244px content width these cards
  get, the preferred value already resolved to ~0.62rem — it sat *below* the old
  cap rather than being clamped by it, so the cap was not the binding constraint.
  The SLOPE is the lever that moves the common case; 2.69cqi → 3.13cqi puts a
  244px card at ~11px.
- **The lower bound stays 0.38rem.** It is the entire no-wrap guarantee: it is
  what lets a pill row shrink instead of breaking, at the ~102px cards a thin
  phone produces. Raising the floor would trade a readability win for the exact
  failure this whole entry exists to prevent. The slope change lifts wide cards
  far more than narrow ones, so the floor's behaviour is preserved — verified at
  320/375/768/desktop in both locales, one pill row everywhere.

The strip's column counts live together in `.related-product-grid`, not in
Tailwind utilities on the element: **1 column up to 360px, 2 from 361px, 4 from
768px**. The single-column band exists because a 2-up card on a thin phone is
only ~122px of content (owner: "very thin and not good looking"); below the
threshold a card gets the full measure back, so the title and pills return to
full size. Note the counts are not monotonic in viewport width — a 640px
viewport gives wider cards (262px) than a 900px one (156px) — which is exactly
why every size inside a card is driven by the container, never a media query.

New Length writes normalize inch-bearing input to a bare numeric string.
Public matching continues accepting unitless, `in`, `inches`, quoted, and
decimal-equivalent legacy forms.

The AI assistant may extract width/length only from explicit, reliable evidence
and must honor the same storage contracts as manual forms.

## Storefront

### The hero reveal is pre-hydration; the PSI mobile perf number is not chased

Decided 2026-08-23 after an extensively measured build/revert/restore cycle.
The shipped state: pane A's carousel fade and the boot splash trigger on a
pre-hydration `nej-hero-go` stamp (inline script waits for pane A's card
images, 1800ms cap) rather than on React hydration. Content paints at first
paint; on a throttled phone the hero appears ~2s in instead of after a
hydration-length splash hold.

**Do not chase the PSI mobile performance number with reveal-timing or image
priority changes — it was tried, measured, and does not work.** Three
configurations (hydration-gated reveal, pre-hydration reveal, front-card
priority+fade-exemption pin) all produce the same bimodal lab distribution:
~79–81 when the cookie banner's text wins LCP, ~71–73 when a hero card
image's paint registers instead, with a rare ~98 draw when everything lands
at first paint. The tail is a property of a large fade-in hero image under
Lighthouse's lantern model, not of any gating bug. A single PSI run is one
draw from that distribution and must not by itself justify a code change —
that mistake caused one full revert/redeploy round trip on 2026-08-23.

Untried levers, all owner-decision design trades: font-display `optional`
(kills the banner text's font-swap LCP re-emission), `experimental.inlineCss`,
and shrinking the ~85KB unused/legacy JS. The metric that actually matters is
CrUX field data (no data yet as of 2026-08-23), which will reflect the
first-paint behavior real visitors get.

### The cookie banner is SERVER-rendered; its visibility gate runs before paint

Decided 2026-08-23, measured on production via PSI + a corroborating local
Lighthouse run. `CookieNotice` used to render `null` until hydration plus a
`useEffect` localStorage read. On throttled mobile that made it appear seconds
after the page — and because its paragraph out-measured every earlier paint
candidate, **the cookie notice itself was the site's LCP element**
(`body > div.fixed > div.min-w-0 > p`, render delay 2,360ms, mobile
performance 80 with everything else green).

The standing rule:

1. The banner renders in the SSR HTML, unconditionally — no `visible` state
   that starts false, no effect gate. It must paint with first paint.
2. Returning visitors are handled BEFORE paint: an inline `<head>` script in
   `[locale]/layout.tsx` reads `nej_cookie_notice_v1` and stamps
   `data-nej-cookies-ok` on `<html>`; `globals.css` hides the banner via that
   attribute. Accept (and /cookie-preferences accept/reset) syncs the same
   attribute live.
3. Anything else that pops in late over the page (toasts, promos, chat
   bubbles) carries the same risk: if it is big enough and late enough, IT
   becomes the LCP. Late-appearing fixed overlays need either first-paint
   rendering with a pre-paint gate, or to stay smaller than the hero content.
4. **The gate needs a CLIENT-side re-stamp as well as the head script**
   (added 2026-08-23 after the language-switch bug below). `CookieNotice`
   re-applies it through a layout effect keyed on `locale`. The two are not
   duplicates: the script covers page loads, the effect covers soft
   navigation. Guarded by `lib/__tests__/cookie-consent-gate.test.ts`.

### An imperative attribute on `<html>` does NOT survive a locale switch

Measured 2026-08-23, from an owner report that accepting cookies did not stick
when switching language. It is not a consent bug — `nej_cookie_notice_v1` read
`accepted` throughout — it is a DOM bug: `/` and `/es` are different `[locale]`
segments, so switching remounts the root layout, React re-acquires `<html>` and
re-applies only the attributes it renders (`lang`, `class`, `style`), and
anything stamped imperatively is dropped. The inline `<head>` script that
normally stamps it does not re-run on a client-side navigation. Same-locale
navigation is unaffected, which is what isolates it to the remount.

⛔ **The rule: any `<html>`/`<body>` attribute or style property written
imperatively must have a React component that re-applies it on mount.**
`--app-vh` already survived precisely because `ViewportHeightToken` does that;
the cookie gate had no equivalent and was the only such writer without one.
Before adding a third pre-paint stamp of any kind, give it its re-applier at
the same time.

⚠️ Use a LAYOUT effect, not `useEffect`. After paint still corrects the state,
but shows a frame of the thing you are hiding on every switch. Aliased once at
module scope (`useEffect` on the server, `useLayoutEffect` on the client) so
SSR does not warn and hook order stays constant.

ℹ️ React reports this itself, if you read the console during a switch:
"Encountered a script tag while rendering React component. Scripts inside React
components are never executed when rendering on the client." That message is the
same mechanism — a symptom to read, not a separate defect. It is now filtered in
development sitewide; see below.

### The inline `<head>` scripts stay, and React's dev warning about them is filtered

⛔ **Settled 2026-08-24 after re-investigating from scratch. Do not re-open it by
"fixing" the scripts.** React 19 logs a dev console error for ANY `<script>` it
renders on the client, and it re-creates those fibers on client renders, so the
message fires on ordinary navigation. The scripts are correct and necessary: the
HTML parser executes them on a real page load, which is the entire point.

`components/shop/ScriptTagWarningGuard.tsx` already existed for this (added for
the shop list page's anti-flash script). It is now mounted in
`[locale]/layout.tsx` instead, so it covers every page — the same warning comes
from the layout's own `<head>` scripts and from the JSON-LD blocks on eight
routes. It is dev-only, and scoped to that one exact message: verified
2026-08-24 that a plain `console.error` and an `Error` object both still appear.

**Two fixes were tried, measured, and rejected — do not repeat them:**

1. ⛔ **`next/script` with `strategy="beforeInteractive"`.** It does NOT emit an
   inline script. The built HTML contains a `self.__next_s` queue push that
   Next's runtime executes AFTER first paint, which reintroduces both the
   `--app-vh` layout jump and the cookie-banner flash. Verified by reading
   `.next/server/app/en.html`.
2. ⛔ **Emitting the scripts as raw HTML inside a wrapper** (so React never
   creates a script fiber). It works, but no element valid inside `<head>` can
   carry raw innerHTML — `<template>` is inert and `<noscript>` is not parsed
   when scripting is on — so it forces the pre-paint scripts and the JSON-LD out
   of `<head>`, and it only silences the warning if all eight routes' JSON-LD is
   converted too. Large, SEO-adjacent, and it competes with the guard that
   already exists.

✅ **It never reaches visitors.** Verified against a real production build
(`next start`, 2026-08-24): zero console output of any kind, including across a
locale switch. Production React does not emit this warning at all.


### The first pixel is gated by ONE 21KB stylesheet — protect its lane

Investigated 2026-08-14 after reports of a long white screen on first visit
("to some users the site appears to not exist"). Measured on production, not
inferred.

**It was never the server.** TTFB is a consistent ~0.19s, the homepage is
properly static (`● /[locale]`, ISR 5m), and the bare domain is a single clean
301 hop. Fonts are `display: swap`, so no FOIT.

**It was contention.** 533KB across 30 requests downloaded BEFORE first
contentful paint:

| Before FCP | Requests | Size |
| --- | --- | --- |
| scripts | 13 | 258KB |
| carousel images | 9 | 157KB |
| fonts | 4 | 87KB |
| **stylesheet (the only render-blocking one)** | 3 | **21KB** |

The stylesheet did not *begin* until 336ms because four preloaded fonts started
at 292ms and nine carousel images at 335ms. On a fast desktop connection this is
488ms and invisible; the same payload on a first-time mobile visitor is roughly
**2.7s on slow 4G and 10s on slow 3G** — the reported blank screen.

**The load order is the bug, not the byte count.** The thing gating the first
pixel is 21KB. Everything else can wait, and the fixes are all about making it
wait:

1. **Carousel cards are `fetchPriority: 'low'`** except the single LCP
   candidate. They stay `eager` — see the entry in
   `storefront-image-loading.ts` for why lazy would reintroduce hero pop-in.
2. **Only the headline face is preloaded.** The homepage LCP element is the
   `<h1>`, so Caslon earns the priority lane. Hanken (body) is
   `preload: false`; `display: swap` already paints every word immediately in
   the fallback.
3. **Low-intent links do not prefetch** — footer groups (including one per
   service-area city) and the cookie banner. The banner was the worst offender:
   it renders for FIRST-TIME visitors specifically, and `/cookie-preferences`
   was the most-prefetched route on the site at 6x. Header nav still prefetches;
   that IS the likely next click. Measured 58 -> 44 prefetches, 111 -> 96
   requests.
4. **The root element carries an inline `background-color`.** An external
   stylesheet is render-blocking, so until it lands the browser paints its own
   default — pure white. An inline style attribute on `<html>` is applied by the
   parser from the first bytes, so the pre-CSS canvas is brand off-white.

⚠️ **The boot splash cannot cover this gap, and it is important to understand
why.** `HomeBootSplash` is server-rendered into the HTML, so the earliest it can
appear is FCP — the very moment being waited for. It shows up *after* the white
screen, then hydration (already downloaded by then) removes it almost at once.
That is exactly the reported "white, then a spinner for a fraction of a second".
**The splash is not a fix for slow first paint and must never be treated as
one**; its critical CSS is now inlined in `<head>` so it at least renders
correctly if the stylesheet is slow or fails, but the real work is keeping the
stylesheet's lane clear.

**Re-measure `KBbeforeFCP` on production before changing any of this.** The
recipe: `performance.getEntriesByType('resource')` filtered to
`startTime < first-contentful-paint`, summing `transferSize`. Localhost reports
`transferSize: 0` and is useless for this.

### The fixed header's height is one token, and the header obeys it

`--site-header-height` (`globals.css`) is the single source of truth for the
space the fixed `SiteHeader` occupies: `3.5rem` on phones, `4.5rem` from md up.
Crucially the header takes its `height` FROM the token rather than growing to
fit its padding, so the value is authoritative by construction instead of being
a number someone has to keep in sync with the rendered header.

That inversion is the whole point. Previously the height was implicit (padding +
logo, 57px/73px) while ~16 pages each hardcoded a `pt-16` (64px) offset and the
hero pinned at a hardcoded `4rem`. The numbers had silently diverged, so the
first 9px of every page's content sat behind the header — obvious on the
homepage announcement bar, invisible elsewhere only because those pages open
with generous section padding.

Anything that must sit exactly below the header derives from the token:
`.site-header-offset` for page tops, sticky `top`, and `calc(100svh - var(...))`
for full-height panes. Surfaces wanting extra breathing room use their own
larger padding rather than inflating the token. Because the header centers its
row inside a fixed height, the token must stay at least as tall as the tallest
row content (32px phones, 40px logo from md up). A source guard test
(`site-header-height.test.ts`) fails the build if a hardcoded `pt-16` main,
`top: 4rem`, or `calc(100svh - 4rem)` reappears.

### Item prices are whole dollars, and the rounding happens on the VALUE

Owner decision, 2026-08-15. Every price the storefront offers — spot-computed or
manual — resolves to a whole dollar, so the number on a shop card is exactly the
number PayPal collects.

**The rounding lives in `getProductPriceValue()` ([pricing.ts:99](next-app/src/lib/pricing.ts:99)),
not in a formatter.** That placement is the entire point. Display and charge are
computed on separate paths — a shop card formats `getDisplayPrice`, checkout
charges `getSnapshotPrice` — and before this change those paths already
disagreed: `formatUsdPrice` had `maximumFractionDigits: 0`, so a card advertised
**$5,533** while checkout collected **$5,533.47**. Rounding only the formatter
would have widened that gap, which is precisely what the entry below forbids.
Because `getProductPriceValue` is the single funnel for checkout, PayPal, eBay,
Etsy, the social card, Deep Field, and the sold-price capture, one change covers
every surface.

There is now **one price formatter**, `formatUsdPrice`. The second one,
`formatManualPriceAmount`, emitted two decimals and is deleted — two formatters
with different decimal policies is exactly what let manual-priced items render
cents next to whole-dollar spot items on the same grid.

**Deliberately NOT rounded, and each for its own reason:**

| | Why |
| --- | --- |
| A captured `sold_price` | A record of what someone actually paid. Re-rounding it would misstate history. |
| Melt/scrap value and the live spot ticker (`$4,377.60/oz`) | Market quotes, not offers. Cents are meaningful. |
| Tax, shipping-inclusive totals, order totals | **6% of a whole dollar is not a whole dollar.** A Florida total will always carry cents; an out-of-state one comes out clean. Shipping tiers are already whole ($19–$165). |

⚠️ **A price under $0.50 now rounds to $0 and becomes unsellable** — checkout
rejects it under CODE-D01 ("call to purchase") and both marketplaces reject it
on their existing `base <= 0` guard. That is fail-closed and intended: an estate
piece is never legitimately worth $0.10, so a sub-dollar figure is bad data.
A side effect worth knowing: Etsy's $0.20 platform floor is no longer reachable
from a product price and is now only reachable via a negative markup. The guard
stays; its test says so.

Pinned by `whole-dollar-pricing.test.ts`, whose load-bearing assertion is that
`getDisplayPrice` equals `formatUsdPrice(getSnapshotPrice(...))` — display and
charge, proven equal rather than assumed.

### Never charge a total the buyer was not shown

Established 2026-08-13. **64% of the available catalog (56 of 87) is
`spot-multiplier`** — priced as `melt x multiplier` from the live metal feed at
order time. Three caches sit between what the buyer sees and what the server
charges:

| Layer | Staleness |
| --- | --- |
| cart's stored `priceLabel` | frozen at add-to-cart — **unbounded** |
| product page ISR | `revalidate = 300` |
| spot feed fetch | `revalidate = 300` |

Measured on one real bracelet in a single session: **$6,462.72 in the morning,
$6,393.39 hours later — $69.33 apart**, same code, same product. The buyer's
screen trailed the chargeable figure by however long the item sat in the cart.

**Two independent halves, both required:**

1. **`POST /api/checkout/quote`** — read-only, calls the same `buildOrderDraft()`
   the order route uses and persists nothing. The checkout re-quotes whenever
   the cart, shipping method, taxing state, or discount code changes, and
   renders those figures instead of the cart's labels. Without it the guard
   below fires on nearly every checkout, which trains buyers to click through it.
2. **The `price_changed` guard** in `paypal/create-order` — the actual
   guarantee. The client sends `quotedTotal` (the number on screen); the server
   compares it to its own and returns **409 `price_changed`** with the new
   figures rather than charging.

**THE INVARIANT: the server always charges its own computed price.
`quotedTotal` decides only whether to stop and ask.** That is what makes it safe
to accept an unsigned price-shaped number from the browser — a malicious client
claiming it displayed $1 earns a pointless confirmation prompt and can never
talk the price down. ⚠️ **If anyone ever makes the code CHARGE the client's
figure, that requires a signed/HMAC'd quote and a tolerance band — a different
and much larger feature. Do not creep toward it.**

Rules that must hold:

- **Compare in whole CENTS** (`Math.round(a*100) !== Math.round(b*100)`). Both
  sides are rounded upstream, but float equality rejects a matching quote on
  `1066.5500000000002 !== 1066.55` and makes checkout impossible.
- **A missing or unparseable `quotedTotal` is "no opinion", not drift.** An
  older client or a dropped field must not be blocked by a check it cannot
  satisfy; the server still charges its own price.
- **The guard runs BEFORE any side effect** — no order row, no PayPal order, no
  money. If it ever moves below `create_paypal_order`, every price move leaves
  an abandoned order.
- **Every path that starts a payment must run it.** The route has a second
  "reuse an existing unpaid order" branch that returns early; its draft is
  hoisted specifically so the guard can see it. Grep for early returns before
  adding another.
- **The client's `quotedTotal` is derived from the same `computeOrderTotals()`
  the summary renders**, so the sent figure and the displayed figure cannot
  disagree by construction.
- **The quote is TAGGED with the cart state it was computed for** and ignored
  once that tag no longer matches, so a stale quote can never render against a
  cart the buyer has already changed.

**The buyer-facing copy must say "you have not been charged."** A price-change
notice appearing mid-payment otherwise reads like a bill they have just been
handed. Pinned by a test in both locales.

⚠️ **A residual race remains, by design.** The spot fetch is
stale-while-revalidate, so a quote issued as the 300s window expires can serve
the OLD price while the order moments later serves the fresh one — observed
once during verification ($6,850.64 quoted vs $6,776.99 charged). The guard
catches it and the buyer re-confirms, which is the correct outcome. Closing it
entirely would mean pinning a spot snapshot across both requests, i.e. signed
quotes.

**EVERY surface that shows a cart price must quote, not read the label.** The
cart drawer was missed in the first pass, and the consequence was worse than
leaving it alone: before the change both surfaces showed the same stale label —
wrong, but consistent — and afterwards checkout was fresh while the drawer, one
click away via *Edit cart* / *Back to cart*, still showed the old figure. **A
half-applied fix here manufactures a visible contradiction.** The drawer now
quotes too, gated on `drawerOpen` (it is always mounted, so an unconditional
fetch would quote on every page load for every visitor) and using
`local-pickup`, which — unlike Express above $5,000 — can never be refused for
a quote whose shipping figure is discarded anyway.

Both surfaces verified showing the identical figure ($6,396.62) against a cart
holding a stale $6,462.72 label, with that stale figure absent from the whole
DOM.

### The purchase panel sizes against itself, and its rows stay flush

Owner request 2026-08-04: nothing in the buy panel may sit on two lines when it
could compact onto one, and the action buttons must read as a deliberate group
rather than a wrapped row.

The panel is a `container-type: inline-size` query container
(`.product-buy-panel`), and every size inside it is a `cqi` clamp. **Never size
this panel's contents with a viewport media query.** The panel is 576px wide on
a 1440 desktop, 325px at 768, and full-width on a phone, so viewport breakpoints
invert: the old `sm:grid-cols-2` stacked the value tiles on a roomy 343px phone
column while cramming them into a tighter 325px tablet column.

- The scrap-value and live-spot tiles are ALWAYS two across; their type and
  padding shrink with the panel instead of wrapping.
- The buy actions are a grid, flush edge-to-edge in both modes: one row of four
  with Add to Cart at `1.5fr` when the panel is >= 470px, otherwise Add to Cart
  full width above three equal columns. Labels are `nowrap` with fluid
  horizontal padding, so a tight cell compacts the frame rather than breaking
  the label.
- The sold-item variant is a separate case, not the same grid with two children:
  its "Inquire about a similar piece" label is a sentence, so it stays one
  full-width column until the panel reaches 500px.

Thresholds are fitted to measurements — 470px because a 1180px iPad Pro gives a
519px panel, and 500px because that sentence label needs ~255px of cell. Re-
measure before changing either, and re-check Spanish, which is the long-label
case (`Agregar al carrito`).

### The product page fills the space under the photo, and DOM order stays semantic

Owner request 2026-08-04: on every two-column viewport the info column ran far
past the gallery, leaving the lower half of the photo column empty (677px of
dead whitespace at 1440). The Specifications table therefore renders under the
gallery, and the trust badges became a full-width band beneath both columns.

Rules that must hold:

Column contents (owner's arrangement, 2026-08-04):

- **column 1** — gallery, then notes + the Shipping/Condition/Payment accordions
- **column 2** — purchase panel, description, specifications

Rules that must hold:

1. **DOM order is the semantic order and the phone order at once** — gallery,
   purchase panel, description, specifications, sold note, notes, policies. The
   h1 and price are never pushed behind a spec table for screen readers or
   crawlers, and flattening the wrappers on a phone reproduces the original
   single-column sequence with no `order` overrides at all. Visual placement is
   done entirely in CSS (`.product-detail-layout`, `globals.css`); do not
   reorder the JSX to "fix" a layout problem, and do not reintroduce `order`
   values — if a block needs one, the DOM order is wrong.
2. Below md both wrappers are `display: contents`, so every block becomes a
   sibling in ONE flat stack that reads in plain DOM order.
3. From md up the info wrapper is a real column in grid column 2 spanning both
   rows, with the gallery in row 1 of column 1 and the aside in row 2.
   `grid-template-rows: auto 1fr` is load-bearing: an item spanning tracks grows
   only the FLEXIBLE ones, so the info column's surplus height lands in row 2 and
   row 1 stays exactly as tall as the gallery. Two auto rows split the surplus
   and reopen a gap under the photo.
   The aside is ONE wrapper, not two grid items: a product with no Notes would
   otherwise leave an empty track whose gutter still prints under the gallery.
4. **Ultrawide (2000px+) is a DIFFERENT arrangement of the same four blocks**
   (owner request 2026-08-14), on the `ultrawide-page-medium` tier:

   | | column 1 | column 2 |
   | --- | --- | --- |
   | row 1 | gallery | purchase panel / description / specs |
   | row 2 | trust strip (compacted) | notes + policy accordions |

   Below 2000px the md+ arrangement above is unchanged, with the trust strip
   spanning both columns in a third row.

   **Why the blocks move.** Ultrawide is the width at which the info column runs
   OUT of content — it widens, its text stops wrapping, and it ends well above
   the gallery column. The md+ arrangement puts the accordions under the gallery,
   i.e. on the side that is already long, leaving the short side emptier still.
   Putting the accordions under the specs they describe, and giving the gallery
   the compact trust strip, spends the surplus on the column that has it. It also
   removes the strip's full-width band from below the layout, so the whole
   section is ~185px shorter.

   **The trust strip is compacted there, and that is not cosmetic.** Its
   `mt-12 pt-8 mb-10` exists to separate a full-width band from two columns
   ending just above it (rule 6). Under a photo in a 736px column it is not doing
   that job, so 2000px+ overrides the margins to 0, tightens the badge gaps and
   drops the icon disc 36px -> 32px. The three badges still sit across one row
   (237px each), verified in English and Spanish.

   **The badges are VERTICALLY CENTRED in that row** (owner, 2026-08-14), because
   the row is as tall as the accordions opposite and the badges would otherwise
   leave a long empty tail beneath them. Two properties do it and both are
   required:

   - `align-self: stretch` overrides the grid's `align-items: start` so the BOX
     fills the row. This is what keeps the strip's top rule level with the NOTES
     rule in column 2 — centring the whole box instead would drop that rule out
     of alignment.
   - `align-content: center` then centres the badge row inside that taller box.

   ⚠️ **`padding-top` must stay 0 here.** `align-content` centres within the
   CONTENT box, so any top padding offsets the badges by exactly that much —
   measured 81.6px above vs 60.6px below while the compact 1.25rem was still
   applied, against 71.6/70.6 once removed. Centring supplies ~71px of separation
   from the top rule on its own, so the padding has no job left. Verified to
   adapt rather than being a fixed offset: on a product with a shorter aside the
   box is 147.3px and the badges still centre (27.5 / 26.5).

4a. **The gallery is a SQUARE in a 50/50 grid, so column WIDTH is photo HEIGHT** —
   this is why the tier matters. On `ultrawide-page-wide` (2200px) the column
   reached 1036px and the photo 1120px tall, which the owner reported as too big;
   `ultrawide-page-medium` caps the column at 736px and is flat from 2000px up.
   Capping the canvas is the right lever rather than an asymmetric grid: the equal
   columns are what rule 5's balance calculation is fitted to, and the surplus
   would otherwise land in a hole between the columns or a ~1310px prose column.

   ⚠️ **Tier and arrangement are ONE decision.** An older 2000px+ rule mirrored
   the aside into column 2 *with the gallery spanning both rows*, because the
   uncapped gallery was then the TALLER column. Do not restore that shape: past
   roughly a 900px column the gallery becomes the taller column again, and if the
   tier is ever widened the whole arrangement has to be re-measured, not just
   the mirror restored.

4c. **Both columns are BOUNDED blocks that terminate on the same rule**
   (owner, 2026-08-14, "better balance"). Column 2 already ended on the last
   accordion's `border-bottom`; column 1's trust strip now carries a matching
   `border-bottom`. Because the strip stretches to the row (4, above), the two
   rules land level to the pixel — verified in both locales and on a dark page,
   where both correctly pick up the overridden `--color-outline-variant`
   (`rgba(255,255,255,0.2)`). Left as one bounded block beside one floating
   cluster, the band read as lopsided. ⚠️ If `align-self: stretch` is ever
   removed, remove this border with it or it will sit at an arbitrary height.

4d. **The band carries `padding-bottom: 2.5rem` at ultrawide.** The old
   full-width strip supplied that space through its own `mb-10`, which is zeroed
   in this arrangement, so without it the last accordion's rule sat ~2px off the
   next section's divider. It is padding on the LAYOUT rather than margin on
   either column, so both get it and the columns still end level.

4b. **Residual imbalance is expected at ultrawide and is not a bug to chase.**
   Measured at 2000px in English: column 1 966.3px, column 2 1140.5px. The two
   columns cannot be balanced there, because the gallery grows with column width
   while the info column shrinks — balancing would require a column NARROWER than
   the desktop 576px. The arrangement above chooses which side carries the slack;
   it cannot remove it.
5. Which blocks move is a balance calculation, not a preference. The two column
   heads are fixed (gallery, purchase panel); the movable blocks are description,
   notes, policies and specs. The current split lands both columns within ~46px
   at 1200px+. If blocks are added or resized, re-measure before changing it —
   moving more content left closes the residual gap at 768-1023px but unbalances
   every width above it.
6. The trust strip keeps deliberate blank space above it (`mt-12` + `pt-8`):
   both columns end just there, so it must not butt against the accordions or
   the spec table. **This applies below 2000px only** — at ultrawide the strip
   sits under the gallery rather than beneath both columns, so that clearance is
   overridden (rule 4).

   ⚠️ **The policy accordions draw exactly ONE rule at the top of the group, and
   it comes from their WRAPPER.** `ProductPolicyAccordions` wraps the group in a
   `border-t pt-4` div; the accordions themselves carry `border-bottom` only.
   A `:first-of-type { border-top }` rule also existed until 2026-08-14 and put
   two parallel lines 17px apart at every width. If the wrapper ever loses its
   border, restore the first-child rule — do not add a second one.

   ⚠️ **The strip is a CHILD of `.product-detail-layout`, not a following
   sibling** (moved 2026-08-14 so ultrawide could place it in the grid). Below
   2000px it spans the full width from a third grid row, which is visually
   identical to the old sibling rendering — verified at 768/1280/1999px and, on a
   phone, as the last item of the flat stack. Keep its placement in CSS; adding
   position utilities in the JSX would break one breakpoint or the other.
7. **Stacked means centred.** Below 640px the three trust badges stack into a
   column, and both they and the policy accordions centre their content; from
   640px up the badges are 3-up and the accordions return to a left-aligned
   title with the chevron pushed right. One breakpoint drives both bands, so
   moving the badge grid's breakpoint means moving the accordions' media query
   with it or the two stop agreeing. In the centred state the accordion title
   and chevron centre together as a pair — a centred title with a
   right-pinned chevron reads as a mistake, not a layout.

### Only on-screen slideshows animate, and the STACK decides which

Established 2026-08-06 after the owner reported stutter on slideshows 2 and 3.
All three carousels were running permanently — 3 concurrent rAF loops plus 3 CSS
ring animations at every scroll position, including at rest when only one is
visible.

**`IntersectionObserver` alone cannot solve this inside the pinned frame**, and
the two reasons are both easy to reintroduce:

- **`isIntersecting` is `true` for a zero-area intersection.** Every pane's box
  grazes the viewport inside the sticky `overflow:hidden` frame. Measured: it
  returned `true` for all three panes at every scroll position — never once
  `false`. Gate on `intersectionRect` **area**, never the boolean.
- **`threshold: 0` only fires when `isIntersecting` flips.** Since it never
  flipped, the callback ran once per mount and never again. Any geometry-based
  guard here needs a threshold ladder, dense near zero.

Even with both fixed, geometry gets to ~2 loops but not 1 — a pane sliding from
ratio 0.004 to 0 crosses no rung. So `HomeHeroStack` drives a `paused` prop into
each pane, derived from the same `t1`/`t2` conditions that set `inert`. It is the
thing applying the transforms, so it is the only place that knows exactly.

Rules to keep:

1. `Carousel`'s `paused` prop wins outright — when set it stops and does not even
   observe, so no late geometry callback can restart an offscreen ring.
2. The stack writes the live-pane state **only on a transition**, never per
   frame. Per-frame `setState` here would cost far more than the loops saved.
3. Two loops during a crossing is CORRECT, not a regression — both panes are
   genuinely on screen and must both animate.
4. When measuring this, clip each ring against the FRAME's band, not just the
   viewport. A naive `rect.bottom > 0` test reproduces the very false positive
   that caused the bug and will report phantom "frozen while visible" panes.
5. The per-frame path is write-on-change: card `dataset`/`zIndex`, the cached
   ring `Animation` + duration, and the stack's scroll `travel`. Any new
   per-frame work belongs behind the same discipline — compare first, write only
   on a real change, and never call a layout-forcing reader (`offsetHeight`,
   `getBoundingClientRect` on static geometry) or an allocating API
   (`getAnimations()`) once per frame when the value changes only on resize.
   **Every one of those caches must be cleared with the window key**, since the
   cards are re-created for a new key and a stale cache silently skips a write a
   fresh card needs.

5a. **The stack's scroll handler bails on an unchanged `p`** (added 2026-08-14).
   Everything it writes is a pure function of scroll progress, and the listener
   is on `window`, so it fires for the WHOLE page while `p` clamps to 1 the
   moment the frame unpins. Before the guard, every scroll frame spent below the
   hero — services, reviews, footer — still rewrote three transforms, two
   opacities, three mask gradients and three ring pulls to the values already on
   the elements. Measured after: **0 pane style writes across 30 scroll steps
   below the hero**, against **154 writes and 31 distinct pane-B transforms
   across 31 steps through it** — so the guard drops only redundant work. The
   reduced-motion branch has the same latch, for the same reason.

   ⚠️ **`remeasure` must reset the guard** (`lastP = NaN`) alongside the cached
   travel, or a resize, a reduced-motion flip or a pointer-type change would be
   swallowed by an equal `p`.

### A machine that cannot hold the spin gets a FROZEN ring, never a slower one

Established 2026-08-24 after the owner confirmed the hero carousel is choppy on
a weak-GPU desktop even after load settles. The bound is compositing, not JS:
the ring re-composites 8–10 large clipped 3D layers every frame, so **spin
speed changes nothing** — the transform changes every frame at any speed, and
"slow it down" keeps the identical per-frame GPU cost. The only degraded mode
that helps is one where the ring stops moving.

`src/lib/hero-frame-guard.ts` measures real frame cadence inside the carousel's
existing rAF loop and freezes the ring (via the existing `paused` machinery)
when a machine proves it cannot keep up. Rules to keep:

1. **Warm-up (4s) and gap-discard (>250ms) are load-bearing.** Every machine is
   janky during AVIF decode + the reveal blur, and a suspended tab's giant
   delta says nothing about render cost. Removing either makes fast machines
   trip.
2. **Median over a 60-frame window, threshold 40ms.** Median so GC hiccups
   cannot trip it; 40ms so an honest 30Hz display (33ms cadence) and healthy
   mid-scroll crossings (~16.7ms median, CHANGELOG 2026-08-06) never do.
3. **Only a genuine trip writes the session latch.** Sibling carousels converge
   by READING `isHeroFrozen()`; `?heroFreeze=1` is a force-preview and must
   never latch. `?heroFreeze=0` disables the guard and ignores the latch — the
   A/B tool for the affected machine itself.
4. **A frozen ring still needs its facings.** The mount-time `sample()` stamps
   facing/z-index without the loop; do not "simplify" that effect away or a
   frozen ring's back cards become full-size invisible click targets again.
5. **prefers-reduced-motion takes the same freeze path**, in BOTH layers: CSS
   `animation-play-state: paused` (pre-hydration) AND the JS media-query state
   — because the visibility observer writes inline
   `animationPlayState = 'running'`, which overrides the CSS rule. Restoring
   the old "slow to 128s" behavior would restore full per-frame GPU cost for
   exactly the users who asked for no motion.
6. **`will-change` from the customer reveal is released** ~800ms after
   `visible` via the `done` state, which deliberately has NO CSS rules. `done`
   must stay in `revealElement`'s early-return guard — the MutationObserver
   re-sweep would otherwise restamp settled elements `pending` (opacity 0).
   Any element relying on reveal-era `will-change` for its containing block is
   a bug to fix at the element (give it `position: relative`), not a reason to
   re-pin layers.
7. **The testimonial marquee pauses offscreen by attribute + CSS rule**
   (`data-marquee-paused`), never by inline `animationPlayState` — an inline
   `'running'` would override the hover/focus pause rules that share that
   property.

### Product-page label type has an 11px floor

Set 2026-08-05 after an audit found **46 distinct text elements below 11px** on
product pages at a 1271px desktop viewport — not only chrome, but "Scrap gold
value" and "Based on spot" at 9.3px and "This is your price" at 9.6px. The buyer
audience for estate jewelry skews older, and this was concentrated on the page
that has to close the sale.

The floor is **0.6875rem / 11px**: readable, while still small enough that these
uppercase letterspaced labels read as labels rather than body copy. Applied to
`shop/[id]/page.tsx`, `.product-value-tile-label`, `ProductTrustSections`, and
the related-strip pills. Footer headings and `text-xs` buttons at 10.4–10.88px
were deliberately left alone — they are standard sizes and site-wide.

**Two elements are exempt, for structural reasons, not oversight:**

- **`price-update-ticker` keeps a 0.5rem floor.** It is `white-space: nowrap` so
  the countdown does not reflow every second, and at a 320px viewport the Spanish
  string only fits at 8px. Raising its floor to 10px pushed the entire document
  into horizontal scroll. Its ceiling still carries the raise, so wider viewports
  gain.
- **Related-strip pills keep their 0.38rem floor**, for the no-wrap reason
  documented above.

When raising type inside the buy panel, check `white-space` first: the value
tiles sit in `minmax(0, 1fr)` grid tracks, so an unbreakable label does not
compress — it punches straight out of its track. That is why the spot pill's
LABEL is allowed to wrap while its PRICE is not.

### The reviews band is never one column, and the card compacts to allow it

Owner rule 2026-08-09: the client review blocks are a **minimum of 2-up** at
every width. The ladder is `.testimonial-grid` = **2 / 4 columns** (4 from
1160px); the pre-existing "never 3" rule stands, because the shared auto-fit
chose 3 in the ~850-1150px band and stranded the fourth review alone on a second
row. Both rules together still assume an EVEN review count — a fifth brings the
orphan back, and the answer is a sixth or a layout that centres a partial row.

Removing the one-column band moves the tight case to the narrow phone: a 320px
viewport gives a **137px card**. At the shipped 24px padding and 14px quote that
left 89px of text, about six characters per line. So `.testimonial-card` ramps
padding, quote size, caption size, and the card's internal gap down at narrow
widths rather than the grid falling back to one column. **Do not "fix" a cramped
phone card by reintroducing a single-column band** — that is the thing the owner
asked to remove.

**This is a deliberate exception to the container-query rule, and the reasoning
is what matters if the ladder ever changes.** Card width is NOT monotonic in
viewport width — the 1160px jump to four columns halves the card, 508px → 243px
— which is exactly the trap the purchase-panel and related-strip entries above
use container queries to avoid. A viewport clamp is nevertheless correct here
because the tight case sits at the BOTTOM of the range and every ramp reaches
its desktop maximum by ~590px, roughly 570px below the jump. Verified by
measuring both sides of it: at 1159px and at 1160px the padding is 24px and the
quote 14px, identical to what shipped. The moment the column ladder changes, that
argument has to be re-made — and if a future ladder puts a narrow card at a WIDE
viewport, switch to a container query rather than refitting the clamp.

The band renders on product pages as well as the homepage (one shared
`TestimonialsSection`), so it must keep satisfying the product page's 11px label
floor: the caption's ramp bottoms out at exactly 0.6875rem, and the quote's at
0.75rem.

**Quotes are truncated in CSS, never in JS.** `-webkit-line-clamp: 8` on the
blockquote, so the full verbatim review stays in the DOM for screen readers and
crawlers and the "never edit a customer's words" rule in `lib/testimonials.ts`
stays structurally true instead of merely observed. A LINE clamp is also the
right unit where a character count is not: it self-adjusts to the column, so a
508px card at 1159px truncates nothing while a 137px phone column trims exactly
what it must. Truncation is honest only because the card links out — if the
link is ever removed, revisit the clamp rather than leaving a quote that stops
mid-sentence with nowhere to finish it.

**Each card is a link to the Google Business Profile** (`GOOGLE_REVIEWS_URL`,
one constant in `lib/testimonials.ts` — a second copy would eventually point
somewhere else). The whole card is clickable via a stretched `::after` on a
small "Read on Google" link, NOT an `<a>` wrapping the figure: wrapping would
make a 480-character quote the link's accessible name and would flatten the
figure/figcaption semantics. Consequences to keep: the hover lift is
`@media (hover: hover)` so it cannot latch on after a tap, and the focus ring is
drawn on the CARD through `:has()` because the thing being activated is the
whole block, not the one line of link text.

⚠️ **The link's class must not contain the substring "card", and the reason
generalizes.** `CustomerReveal`'s `REVEAL_SELECTOR` includes
`main [class*="card"]`, so a class like `testimonial-card-link` gets stamped
`data-customer-reveal="visible"`, which applies `will-change: opacity,
transform, filter`. **`will-change: transform` makes an element a containing
block**, so the overlay resolved `inset: 0` against the link's own 130x17 text
box rather than the card — the card looked perfect and was simply not
clickable. Any stretched-link overlay added inside `main` needs either a name
that dodges that substring selector or a `data-customer-reveal-skip` attribute,
and any "why is my absolutely positioned overlay the wrong size" question in
this codebase should check `will-change` on the ancestor chain first.

### Always-mounted off-canvas panels must cap their width at the viewport

Established 2026-08-05 from a real bug. `WishlistDrawer` used `w-full max-w-sm`
(384px) with no viewport cap, while `CartDrawer` correctly used
`max-w-[min(28rem,100vw)]`.

These panels are **always mounted** and hidden with `translateX(100%)` rather
than unmounted. A panel wider than the screen therefore parks that much past the
right edge and drags the document into horizontal scroll — and because it is also
`w-full`, it then measures against the document it just widened, so the overflow
feeds itself (it settled at 343px on a 320px viewport).

Any new off-canvas panel following this pattern must cap at `min(<design>,100vw)`.
The failure is invisible on a desktop viewport and only shows on a narrow phone,
which is exactly why it survived until an audit measured for it.

### The homepage announcement bar never wraps

Owner rule 2026-08-04: the strip holds ONE line at every width. It is `nowrap`
with a fluid `clamp()` type size, so the text compacts rather than breaking and
doubling the bar's height (55px → 31px on a 375px phone). Letter-spacing stays
in `em` so the 0.22em tracking — roughly a third of the strip's width at full
size — shrinks with the type instead of forcing the break.

Fit the clamp to the SPANISH strings, which are the long ones; a ramp fitted to
English overflowed Spanish by 14px at 320px. **Re-measure both locales at 320 if
the copy ever changes** — that is the combination that overflows.

**It is a promotion, and it is a link (2026-08-11).** The strip advertises the
free-evaluation offer and is an `<a>` to `/free-evaluation`
(`/es/free-evaluation` in Spanish, via the usual
`${locale === 'es' ? '/es' : ''}${path}` convention). Copy as of 2026-08-14:
**"Summer special · Schedule a free evaluation"** /
**"Oferta de verano · Programe una evaluación gratuita"** (owner reword; it
replaced "Free evaluations · This month only" wholesale).

Two rules for whoever edits the copy next:

1. **Do not name the month.** "This month only" stays correct forever; "August"
   is wrong on 1 September. Naming it would also have to be computed at render,
   and the homepage is statically generated — the month would freeze at whatever
   the last deploy was, which is worse than either option.

   ⚠️ **A SEASON is the same hazard, one step weaker, and it is currently in
   play by owner choice.** "Summer special" (2026-08-14) is wrong from roughly
   22 September. It is a deliberate decision, not an oversight — do not "fix" it
   back to a generic phrase — but it does mean the strip now has a real expiry
   date rather than merely an indefinite one. The rule stands for months; a
   season buys about a quarter and still needs a diary entry.
2. **The trailing arrow lives outside the mapped list**, so it shows at every
   width. It is the only cue the strip is tappable, and phones are where it is
   most likely to be tapped.
3. **The "·" is the fragment separator, produced by the markup, not typed into
   the copy.** Each fragment is a plain string in the mapped array and
   `.home-announcement-separator` draws the dot between them. A dash written
   into a fragment would render as a literal character in a different colour
   from the styled separator.

The old 780px third-item reveal is **gone** — the promo is two fragments and both
fit everywhere. Reinstate the `display: none` + `@media (min-width: 780px)` pair
only if a third fragment comes back.

**Measured at 320px, the tightest supported width** (re-measured 2026-08-14 after
the copy became "Summer special · Schedule a free evaluation"): English 228.3px
of 304px available (**75.7px slack**), Spanish 273.6px (**30.4px slack**), one
line in both, no document overflow.

⚠️ **Spanish is now at ~10% headroom — the tightest this strip has ever run.**
For scale, the original "Free evaluations · This month only" left 100.1px. Any
further Spanish lengthening needs the type clamp REFITTED, not merely
re-checked. This is also why the Spanish reads "Oferta de verano" rather than the
more literal "Especial de verano": the latter is two characters longer, worth
~11px here, which would have cut the margin to under 20px.

**320px is provably the tightest case, so one measurement there is sufficient.**
The type clamp `clamp(0.4rem, 1.934vw + 0.013rem, 0.62rem)` hits its 0.62rem cap
at exactly 502px (verified: computed 9.9167px there). Below 502px both the type
and the container scale with `vw`, so slack stays roughly proportional; above it
the type is fixed while the container keeps growing, so slack only increases.
Spanish is the binding locale at every width.

⚠️ **This is time-limited copy, and since 2026-08-14 it has a concrete expiry.**
"Summer special" reads wrong from roughly 22 September. Nothing expires it
automatically, by design — the homepage is statically generated, so there is no
render-time clock to hang it on. Replacing it is a manual edit someone has to
remember.

**The bar rides inside the pinned hero frame (2026-08-11).** Owner: it "doesn't
scroll away until the hero txt does". It is passed to `HomeHeroStack` as a
`banner` prop and rendered as the frame's first child, above
`.home-hero-stack-viewport`, which now wraps the panes and the overlay.

Why inside the frame rather than a second sticky element: the frame IS the
pinned thing, so the bar and the hero text share one release point by
construction. Any design with the bar sticky in page flow would need its own
release offset kept permanently in sync with the hero's — two numbers that drift.

The frame's own height is deliberately unchanged at `100svh - header`. That
matters more than it looks: both the scroll progress and the touch snap step are
`runway.offsetHeight - frame.offsetHeight`, so leaving the frame alone leaves the
entire choreography and the one-slideshow-per-flick snap untouched. The panes
absorb the bar's height instead — they are `inset: 0` against the new viewport
box and their transforms are PERCENTAGES of pane height, so a shorter pane scales
the crossing proportionally rather than desynchronising it. Do not "fix" this by
shrinking the frame or hardcoding the bar's height; the bar's height is fluid
with the clamp above (34.9px at 1286px, 31.2px at 375px).

Measured at both widths and both locales: bar top pins at exactly the header
height through 0/25/50/90% of the runway, then bar, frame and overlay move
together — `barTop === frameTop` at every sample.

### `/shop` is the only storefront entry

Search, filters, view, sorting, per-page, and pagination remain URL-backed.
Categories are explicit merchandising scopes; item types remain navigable
catalog values and may include admin-created custom types.

Public browse shows Available and optionally Sold products. Draft,
Pending Payment, and Archived remain private. Sold-price masking is a display/
structured-data policy and never erases product/order price history.

The public status filter always selects exactly one state. Available is the
default for bare, cleared, or invalid shop URLs; Sold inventory is shown only
after the shopper explicitly selects Sold. Available is the baseline rather
than an extra active-filter count.

### The homepage hero is a scroll-pinned THREE-slideshow parallax stack

`HomeHeroStack` pins the hero in a sticky, overflow-hidden frame while a scroll
runway (hero height + **240svh**) drives the choreography. Only the SLIDESHOWS
move: each pane exits upward while the next RISES FROM BELOW, the two crossings
overlap so motion never stops, and the frame un-sticks as the third locks. The
headline, sign-up form, CTA buttons, and legibility halo live in a pinned
overlay layer that never moves until the frame itself releases.

**The runway is only the scroll BUDGET.** Each pane always travels exactly one
frame height, so changing it changes the SPEED of the handover, never its
extent: a crossing spans 0.61 of the runway, so scroll-per-full-pane-travel is
`0.61 × runway`. The `PHASE_*` fractions divide whatever budget is set, so they
do not need re-tuning alongside it. Lower it for a snappier, more parallax-y
hero; raise it toward and past 1:1 for a calmer one. Whenever it changes,
re-check frame coverage across the runway — the overlap in 5b is what keeps it
hole-free, and a different budget changes nothing about that geometry but is
cheap to confirm.

**The runway is SPLIT by pointer type since 2026-08-14** (owner: "speed up the
scroll a tiny bit on desktop"):

| Pointer | Runway | Scroll per 100svh of pane travel |
| --- | --- | --- |
| touch (`pointer: coarse`) | 240svh | ~146svh (~0.7x) |
| everything else | **210svh** | **~128svh (~0.78x)** |

Desktop is ~12.5% less scrolling (measured at 1500x950: 2280px of travel became
1995px). Both are still calmer than 1:1 and both are far from the 110svh that was
rejected as "way too fast" on 2026-08-09 — **that verdict came from a phone**,
which is exactly why the speed-up is scoped away from touch.

Two things this split brought with it, both easy to miss:

1. **The CSS query is `not all and (pointer: coarse)`, the exact complement of
   the signal the JS branches on** — not `(pointer: fine)`. A device reporting
   `pointer: none` would otherwise take the desktop CURVE from the JS and the
   touch RUNWAY from the CSS.
2. ⚠️ **Pointer type is now GEOMETRY, not just curve.** The `coarsePointer`
   change listener used to call `schedule` (repaint only) on the stated
   reasoning that "only the curve changes here, not the geometry". That is false
   once the runway depends on it, so it now calls `remeasure` and drops the
   cached `travel`. A hybrid device or a plugged-in mouse would otherwise run the
   whole choreography off a stale measurement.

The desktop rule must also stay ABOVE the `prefers-reduced-motion` block, which
collapses the same property at equal specificity and so wins on source order
alone.

Runway history — 290svh → 110svh (2026-08-06, "fit the handover into roughly
one screen") → 240svh (2026-08-09, "way too fast") → 240 touch / 210 desktop
(2026-08-14).

**On touch the runway is only HALF the speed story.** Once the snap is driving
(see *"On touch, the hero snaps exactly one slideshow per gesture"*), the panes
move one frame height over `SNAP_STEP_MS`, which the runway does not affect at
all. Changing one without the other slows only half the experience.

(Runway history is recorded once, above. The 110svh figure cost less than it
looks because the touch snap now scrolls the runway for the visitor. Detail in
CHANGELOG under those dates.)

**This is the longest entry in this file. Rule index** — the labels are
historical and out of sequence, so use this to find the one you need. Do not
renumber them; the labels are referenced from other rules:

| | Covers |
|---|---|
| 1 | Pane vs overlay split — exactly one h1/form/CTA set |
| 2 | `inert` only when fully offscreen; imperative transforms |
| 3 | Overlay light/dark theme follows the dominant pane |
| 4 | Frame mirrors the dominant pane's background |
| 4a | Departing-pane fade + frame backdrop are a PAIR — **mask, not opacity** |
| 5 | Three slideshows, everything rises upward; `PANE_A_TRAVEL` = 85 |
| 5a | Crossings are eased; the phase logic is not |
| 5b | `PANE_A_TRAVEL` as the seam control; re-measure coverage if changed |
| 5c | No slideshow may MOUNT during the scroll |
| 5e | The two crossings OVERLAP; the 0.36 ratio and equal lengths |
| 5f | Pane overlap ≠ ring separation; `RING_PULL_PCT` |
| 6 | Seam feathers — both edges at once, widths unclamped |
| 7 | `prefers-reduced-motion` collapses the runway in CSS alone |
| 8 / 8a / 8b | Twin lineup tables; picker hides selected; sold pieces allowed |
| 9 | Random draws are a FILL action, never a live source |
| 10 | Ring direction alternates down the stack |
| 11 | Deferred mounting (continues 5c) |

Related entries elsewhere in this file: *"Only on-screen slideshows animate"*
(the pause/liveness rule these refer to), *"One solid background per
slideshow"*, *"On touch, the hero snaps exactly one slideshow per gesture"*,
and *"Every carousel card paints the backdrop its own photo was shot against"*.

Rules that must hold:

1. `HomeHero` is the slideshow pane only (carousel + its solid background +
   spinner); `HomeHeroOverlay` owns the headline/form/CTAs/halo. The stack
   composes two panes plus ONE overlay, so the page always has exactly one h1,
   one subscribe form, and one set of CTAs — never duplicate the overlay.
2. A slideshow pane is `inert` only while fully offscreen; during the crossing
   both stay interactive. Transforms are imperative per scroll frame, never
   React state.
3. The overlay's light/dark text theme follows the DOMINANT slideshow, each
   crossing handing over at its own midpoint. Since 2026-08-09 it is derived by
   relative luminance from each pane's SOLID background color (static per pane),
   not reported per-photo via an `onThemeChange` callback — that callback no
   longer exists.
4a. **A departing pane FADES over the tail of its exit, and the frame paints the
   DOMINANT pane's backdrop.** These two are a pair — either alone fails.

   Because `PANE_A_TRAVEL` is below 100, the departing pane never clears the
   frame; the strip still in view late in a crossing is bare backdrop, since its
   ring left the top long before. At full opacity that reads as a hard bar
   (measured at p=0.50: an 8% band of opaque black above the arriving white
   slideshow). Fading it dissolves the band instead of sliding it out — but
   fading only reveals the FRAME, so the frame must already show the incoming
   backdrop or the same bar comes straight back.

   **The durable rule, and the reason it cost three attempts to find: reach for
   a MASK, not opacity, whenever the fading layer is a large solid area whose
   color differs from what is behind it.** `opacity` applies to the whole pane,
   so a black pane fading over a white frame does not read as "leaving" — it
   reads as a flat GRAY RECTANGLE (measured: 27% of the frame at opacity 0.36,
   compositing to a uniform `rgb(163,163,163)`). Black fading over white passes
   through every gray on the way, so NO value of `FADE_TAIL` avoids it — the
   fade was being applied to an AREA when the problem was an EDGE.

   So the dissolve is spatial (`A_EXIT_DISSOLVE_PCT`, a bottom-anchored mask
   sized to reach past the arriving pane's top edge into the band above it), and
   `FADE_TAIL` = **0.45** does only what opacity is good at: removing the last of
   the pane at the very end, where the area is small. (It was tuned up to 0.75
   chasing the gray before the diagnosis landed; CHANGELOG 2026-08-07/08.)

   Switching the frame on dominance rather than blending is safe ONLY while the
   panes fully cover the frame at that instant — verified 100% opaque coverage at
   both flips. If pane travel, timing, or the fade ever change, re-check that
   before trusting the switch, or a black→white jump becomes visible.

4. The frame mirrors the DOMINANT pane's background, because anything the panes
   do not fully cover — a feathered edge, a fading one — shows the frame
   through it. That mirroring is what makes those edges read as continuous
   canvas rather than a hole. It followed the dominant pane's live SWEPT
   background from 2026-08-07 (mirroring hero A alone before that caused the
   black bar in 4a); since 2026-08-09 the sweep is gone and it paints the
   dominant pane's SOLID color — same dominance midpoint switch, same
   full-coverage safety argument.
5. There are THREE slideshows handing over in sequence (A→B, then B→C), with the
   crossings overlapping and no hold anywhere (see 5e).
   **Everything travels UPWARD: a pane exits up and the next RISES FROM BELOW**
   (owner request 2026-08-06), so the hero reads as one continuous upward scroll.
   This direction has been chosen deliberately TWICE — do not "restore" the
   descending arrangement from any older note. B is the only pane that
   both arrives and departs, so its transform carries both crossing terms and its
   feather takes whichever crossing is currently moving it. Timing lives in
   `PHASE_1_END` / `PHASE_2_START` / `PHASE_2_END`; adding or removing a slideshow
   means re-splitting those and resizing the runway to match. Pane travel is fixed
   at one frame height (offscreen at rest, flush when locked), so `PANE_A_TRAVEL`
   is the only depth/seam control — **currently 85** (see 5b; it was lowered
   100 → 95 → 85 across 2026-08-06 as the owner asked the join to keep
   tightening, and a >100 differential was trialled and reverted).

   The panes' resting transforms in CSS (`--b` / `--c` at `translate3d(0,100%,0)`)
   must match the value the scroll handler computes at t=0, or a pane jumps on the
   first frame after hydration.

5c. **No slideshow may MOUNT during the scroll.** B and C both arm off the
   critical path — B on first scroll-intent or idle, C one idle callback after B
   — and never from inside the scroll handler. C previously armed at `p > 0.12`,
   and profiling on 2026-08-06 found that mount was the single worst frame in the
   entire hero scroll: 41.4ms against a 16.7ms median, on the exact frame it
   mounted. A carousel mount is a React render plus ring construction plus image
   decode; anywhere on the scroll path it is a visible hitch. Staggering the two
   arms keeps them out of the same frame. Mounting early is cheap because a pane
   mounts already `paused` (see the separate entry *"Only on-screen slideshows
   animate, and the STACK decides which"*) — it is in the DOM but not animating.

5f. **Pane overlap and RING separation are different axes — do not confuse them.**
   Each pane is full-frame with its carousel centred, so consecutive rings sit
   ~one frame apart however much the PANES overlap. `PANE_A_TRAVEL` tightens the
   seam between panes; it does nothing about how far apart the PHOTOGRAPHS are.
   `RING_PULL_PCT` is the control for that (owner, 2026-08-06: "tighten the three
   carousels closer vertically").

   The pull must peak mid-crossing and be zero at both ends (`4e(1 - e)`), not be
   a constant. A ring box spans ~14.9%-85.1% of the frame — ~70% tall with ~15%
   headroom — and a constant lift is capped by that headroom, because any more
   makes an arriving pane's ring poke into frame while its pane is still parked
   below at rest. That ceiling bottoms out near 75% separation, short of the ~70%
   needed for the rings to overlay at all. Peaking mid-crossing sidesteps it
   entirely: at rest and when locked the pull is 0, so the designed composition
   is untouched and nothing peeks, while mid-crossing it reaches ~62%.

   When measuring any of this, use the RING box, never the cards: the cards are
   3D-transformed and project to ±3600% of the frame. Expect a few percent of
   noise even on the ring box, since its projection breathes as the ring rotates.

5e. **The two crossings OVERLAP, and the overlap size is load-bearing.**
   `PHASE_2_START` is deliberately BEFORE `PHASE_1_END` (owner, 2026-08-06:
   "overlap the crossings so it never stops"). There is no hold between them —
   B sweeps through flush rather than resting there.

   **There is no hold at the END either.** `PHASE_2_END` is exactly 1 (owner,
   2026-08-07), so C reaches flush on the same frame the runway ends and the
   sticky frame unpins; its ease-out and the page starting to scroll away
   coincide, leaving no stationary stretch anywhere in the hero. Measured: the
   runway tail no longer flatlines, still moving at 26% of peak at release.

   Pinning the end point makes the other two values DETERMINED, not free — with
   equal crossing lengths L and the 0.36 ratio, `(2L - 1)/L = 0.36` gives
   L = 1/1.64 = 0.61, hence `PHASE_1_END = 0.61` and `PHASE_2_START = 0.39`.
   Re-solve the same way rather than nudging them independently, or one of the
   invariants silently breaks.

   **Touch uses a different curve, and the 0.36 overlap still holds.** Since
   2026-08-08, `pointer: coarse` drives the crossings with smootherstep
   (`t³(6t²−15t+10)`) so each slideshow snaps into place under a finger drag;
   wheel/trackpad keeps smoothstep, where the same curve reads as sticky. The
   overlap ratio is expressed in units of the crossing clocks, not the curve, so
   it is unaffected — but note the touch curve's peak slope is **1.875**, not
   1.50, so any future "fraction of peak speed" figure quoted below must be read
   against whichever curve is active.

   Both curves share EXACT endpoints. That is a hard requirement, not a nicety:
   the resting/flush/locked positions, the inert-live thresholds and the CSS
   resting transforms all assume t=0 and t=1 land precisely. Any replacement
   curve must too — `src/lib/__tests__/hero-easing.test.ts` enforces it.

   **Butting them is not enough.** Smoothstep's derivative is zero at BOTH ends,
   so `PHASE_2_START == PHASE_1_END` hands over from a term decelerating to zero
   to one accelerating from zero: the velocity still touches nothing and still
   reads as a pause. What matters is how far into its curve the incoming crossing
   is when the outgoing one finishes — keep
   `(PHASE_1_END - PHASE_2_START) / (PHASE_2_END - PHASE_2_START)` near **0.36**.
   At 0.20 the incoming crossing is still on the flat part of its curve (slope
   0.97 of a possible 1.50) and the dip was perceptible; at 0.36 it is 1.38/1.50
   and the handover holds ~72-90% of peak speed.

   **Both crossings must also be the SAME LENGTH.** They were 0.47 and 0.54 —
   crossing two ran 15% longer, so the handovers moved at different speeds and
   the spacing between slideshows visibly changed from one to the next (owner,
   2026-08-06: "dynamic distance between the first, second and third"). Equal
   lengths brought the two crossings' minimum ring separation to within 1.6
   points of each other.

   Cost, accepted knowingly: within the overlap band all three crossing clocks
   are active, so the phase-based liveness (see *"Only on-screen slideshows
   animate"*) marks all three panes live and
   3 rAF loops run for ~11% of the runway even though only 1-2 panes are on
   screen. At rest it is still 1. Fixing that would need a coverage-aware
   liveness test instead of a phase-based one.

5a. **Crossings are EASED; the phase logic is not.** Scroll progress is linear, so
   a pane driven by raw `t` moves at constant speed and then stops dead at its
   clamp — a velocity discontinuity that reads as a jolt into the hold no matter
   how short the hold is. That was most of what the owner reported as "pausing"
   on 2026-08-06. `ease(t) = t²(3−2t)` drives the transforms and feathers; the
   RAW `t` still drives the inert/live thresholds and the dominant-pane handover,
   which test which phase we are in and would only be blurred by easing. The ease
   must keep exact endpoints (0→0, 1→1) — the resting/locked positions, those
   thresholds, and the CSS resting transforms all assume t=0 and t=1 land
   precisely. (There are no holds left to jolt into — they were shortened, then
   removed entirely when the crossings were overlapped; see 5e. The easing is
   what makes that safe.)

5b. **`PANE_A_TRAVEL` is the seam control, and below 100 it is load-bearing.**
   The seam is `t × (PANE_A_TRAVEL − 100)`: above 100 leaves a real gap of open
   frame, 100 butts exactly, below 100 the arriving pane overlaps the departing
   one. It is **85**, giving a ~15%-of-frame overlap, so the
   arriving pane's feathered top blends over the outgoing photograph instead of
   fading to backdrop — that fade-to-backdrop is what made the join read as a
   band of empty space. **At any value below 100 the departing pane never fully
   clears the frame**; that is only safe because the arriving pane is flush and
   higher in the stack by then. If the stacking order or the arrival geometry
   ever changes, re-measure frame coverage across the whole runway before
   trusting it — it was verified at 100% with no holes, not assumed.
6. The two sides of a crossing feather DIFFERENT edges, because they are the two
   halves of ONE seam: the departing pane's BOTTOM edge leads it up and out, and
   the arriving pane's TOP edge is what climbs into the frame. Each is a
   scroll-driven `mask-image` that reaches zero where the edge is offscreen or
   flush — A unmasked at rest, B unmasked while locked, C unmasked once locked.
   Those endpoints must stay full-bleed; a feather on a resting or locked edge
   visibly fades the hero.

   **THE PHASES DO OVERLAP, and a pane can be arriving and departing at the same
   time.** `PHASE_2_START` is **0.39**; `PHASE_1_END` is **0.61**. For p in that
   window pane B needs BOTH masks at once. An earlier `if (t2 > 0) … else …`
   picked one, on a comment asserting the phases could not overlap — false ever
   since the crossings were deliberately overlapped so motion never stops. The
   effect was B's top feather snapping to zero the instant phase 2 opened,
   measured as an instant 12.56% → 0 jump mid-crossing (2026-08-08). One
   `setPaneMask(pane, topPct, bottomPct)` emitting a single gradient with both
   ramps is the fix; never reintroduce a one-edge-at-a-time branch.

   **Feather widths are NOT clamped to the overlap, and the old clamp was
   actively harmful.** `EDGE_FEATHER_PCT` / `FEATHER_OVERLAP_SHARE` /
   `featherFor()` existed for the era when arriving panes DESCENDED and opposed
   panes could expose real uncovered frame. With panes RISING, the departing pane
   covers everything above the arriving pane's top edge for the whole crossing,
   so a wide feather always lands on a photograph, never on backdrop. Capping at
   70% of a 15% overlap held the join to a 2–5% ramp — narrow enough to read as a
   line, which is precisely the complaint it was supposed to prevent. Sizes are
   now independent: `A_EXIT_DISSOLVE_PCT` (departing, scaled by `e`, must exceed
   the `15 * e` gap to the arriving pane's top edge) and `B_ARRIVE_FEATHER_PCT`
   (arriving, `4e(1-e)` so it PEAKS mid-crossing where the seam is most exposed —
   the old `(1 - e)` profile was backwards and collapsed to ~2% exactly when it
   mattered most).

   Widths are a PERCENT of pane height, not rem, so they share units with the
   overlap and do not drift with root font size.

   **What the feather cannot fix:** if neighbouring lineups have different
   backdrop colours (a black-backed slideshow handing to a white-backed one), the
   join is a genuine change of content and stays visible however wide the overlap
   or soft the ramp. That lever is curatorial — group lineups so neighbours share
   a backdrop — not mechanical.

   The hero's bottom separator border lives on the frame, never on the slideshow
   sections, so no border sweeps mid-frame.
7. `prefers-reduced-motion` collapses the runway to the frame height via CSS
   alone (no travel, panes B and C hidden), so there is no hydration
   divergence.
8. Slideshows B and C each have their own curated lineup in a twin table
   (`carousel_selection_alt`, `carousel_selection_third` — twins, not slot
   columns, so each keeps its own product_id primary key and one product may
   appear in any or all lineups). An empty or unmigrated later lineup makes
   that slideshow mirror A — reads return [] and never fail the payload. All
   lineups ride the one cached home payload and the `home-carousel` tag. Each
   lineup is an explicit saved list; `carousel_settings.selection_mode` /
   `selection_mode_alt` / `selection_mode_third` are always written `manual`.
8a. The available-products picker hides anything already in the active
   lineup (owner request 2026-08-04). It is derived from `products` minus the
   current selection, never a second stored list, so removing a piece from the
   order list returns it immediately and each lineup tab computes its own.
   Duplicates were already impossible — the picker is a toggle guarded by an
   `includes` check — so this is a clarity rule, not the duplicate guard.
8b. Slideshow lineups may contain SOLD pieces (owner decision 2026-08-04).
   The admin picker and random fills work from one of three lists — All,
   Available (default), Sold — where "All" spans exactly the two public
   statuses; draft/pending-payment/archived never enter a slideshow. The
   storefront curated fetch admits available OR sold, but a sold item's
   `priceLabel` is nulled at fetch so the hero can never caption a sold price
   (sold-price masking policy); a sold card simply links to its product page,
   which shows it is sold. Sold pieces wear a SOLD chip throughout the panel.
   Keep the panel's initial catalog load on 'all' — it is what resolves
   thumbnails for saved sold pieces while a narrower list is active.
9. Random draws are a FILL ACTION in the admin panel, not a live source
   (owner direction 2026-08-04). Each of the three buttons — gold jewelry,
   silver jewelry, non-jewelry — replaces the active lineup with a fresh draw
   that then behaves exactly like a hand-picked one: reorder it, recolor it,
   remove or add pieces, and save. This is deliberate and the two models are
   mutually exclusive: a mode that re-drew server-side on every cache rebuild
   would discard the admin's arrangement, so if a live rotating source is ever
   wanted again it must NOT also be editable. Non-jewelry spans both metals on
   purpose: it is the catalog's "everything else" (coins, bullion, flatware),
   not a metal-first choice. The metal constraint is pushed to the database;
   the jewelry test is applied in code because it is inferred from type/tags
   (`isProductJewelryItem`), the same rule behind the shop's Jewelry & Watches
   filter — `carousel-lineup-modes.test.ts` asserts the two sets stay in step.
   The server-side random resolution and the mode columns remain in place and
   still honour a stored random value (legacy `random_gold` / `random_silver`
   map forward to their `_jewelry` equivalents), but nothing in the UI sets
   one, so any stored mode converts to `manual` on the next save.
10. Ring direction ALTERNATES down the stack: A right-to-left, B reversed
   (left-to-right), C right-to-left again — B is the only pane passing the
   Carousel `reverse` prop. Reversing is not just
   `animation-direction: reverse`: the per-frame sample must mirror its
   clock-derived angle and flip its hidden-back crossing test, or the photo
   windowing silently tracks a mirror image (pre-2026-08-09 the sweep and
   theme depended on this too). Change spin direction only through that prop.
11. Deferred mounting, continued from 5c: neither later pane mounts under
   reduced motion, and server HTML always carries exactly one carousel.
   Combined with the pause rule, at most the panes in a visible crossing
   animate. Do not mount later panes eagerly, and do not unmount panes on
   direction changes — remount re-decodes images and shows as pop-in.

### Every carousel card paints the backdrop its own photo was shot against

A card is a fixed square with `border-radius: 1.5em`, but its photo is
`object-fit: contain` — the radius rounds the element box while the photo is
letterboxed inside it. So a photo whose bars are wider than 24px shows its own
square corners, and a near-square photo gets clipped round. That inconsistency
is only *visible* when the padding colour differs from the photo's backdrop, so
the rule is: **match the padding to the photo and the seam disappears** — do not
try to round the photo itself. `object-fit: cover` would crop clasps and
hallmarks, and dropping the radius changes the whole hero's look.

The colour comes from `paddingBgForProductRow` (`carousel/lib/carouselConfig.ts`),
which reads the product's own `image_padding` / `image_padding_by_image` — the
same stored field that paints the product page background. **Every path uses it**:
the random draws (`fetchRandomLineupItems`, and the admin Random fill
`fetchRandomSampleItems`) from 2026-08-04, and the CURATED path from 2026-08-07.
Never reintroduce a hardcoded white default on any of them; that is what put white
bars around black-backdrop photos. An unset padding still returns null and
inherits the global carousel colour.

**A curated selection row's White/Black group WINS when set — but must not be
assumed set.** The curated path originally skipped the padding columns entirely
on the reasoning that "a curated entry stores its group on the selection row".
That is only true if whoever added the row set the swatch: three rows in
`carousel_selection` stored NULL and painted white bars behind black chain
photos, with no fallback on that path to catch it. The curated query now requests
the padding columns too and falls back when `bg_color` is NULL.

Keep the two readers in step — `src/lib/home-carousel-server.ts` feeds the live
hero and `carousel/lib/carouselData.ts` feeds the admin preview. If only one gets
the fallback, the preview and the storefront disagree about the same lineup.

(A former consequence noted here — the hero's swept background following the
same per-photo colour — is gone as of 2026-08-09: the section background is now
one solid color per slideshow, and the per-photo colour paints ONLY the card's
own padding. See "One solid background per slideshow".)

### One solid background per slideshow — the per-photo sweep is removed

Owner decision 2026-08-09, removing a feature rather than tuning it. The hero
background used to follow each photo's backdrop to the front (a per-frame
gradient whose seam swept as the white/black arcs rotated). With a lineup
mixing white- and black-backdrop pieces the whole hero flipped between black
and white as the ring turned, and a same-day regression had it rendering gray.
The owner chose to delete the mechanism: each of the three slideshows now shows
ONE admin-chosen solid color for its whole time on screen.

Rules that must hold:

1. **The color belongs to the slideshow slot, not the lineup.** `bg_color`
   (Slideshow 1, pre-existing), `bg_color_alt`, `bg_color_third` on
   `carousel_settings` (`add-slideshow-bg-colors.sql`, run + verified
   2026-08-09). A missing/NULL later column INHERITS Slideshow 1's color — the
   pre-migration inherit rule, pinned by `slideshow-bg.test.ts`. A lineup that
   mirrors A still uses its own slot's color.
2. **Per-photo White/Black groups stay** — they paint each CARD's padding
   (the "match the padding to the photo" rule above). They no longer influence
   the section background, and `groupByBackground` (white-arc/black-arc
   ordering, which existed only so the sweep had exactly two seams) is deleted;
   lineups render in curated order everywhere.
3. **The overlay text theme derives from the dominant pane's color by relative
   luminance** (`isDarkHex` in `HomeHeroStack`), not a black-only string match
   — the admin picker accepts any hex. Static per pane; flips only at crossing
   midpoints with the dominance handover.
4. **A crossing between two slideshows with different colors shows the color
   change at the handover midpoint.** Inherent and accepted — the lever is
   curatorial (give neighbours the same color), the same stance the feather
   rules above already take for photo content.
5. **`normalizeSlideshowBg` lives in `carouselConfig.ts`** (pure) and is the
   single normalizer for the admin panel, `carouselData`, and
   `home-carousel-server` — the two readers must not disagree about settings.
   It cannot move into `carouselData`: that module instantiates the Supabase
   browser client at import time, which breaks any test importing it.
6. Do not resurrect the sweep from older notes: `computeSweepBackground`, the
   `onFrontItemChange`/`onBackgroundChange` callbacks, and per-photo theme
   reporting are gone deliberately, and their removal is also a large chunk of
   the hero's per-frame cost reduction (the carousel's rAF loop now does only
   windowing + facing/z hit-testing).

### On touch, the hero snaps exactly one slideshow per gesture

Owner request 2026-08-09 ("each carousel should snap more strongly; one scroll
can propel the user straight past a carousel"), plus a follow-up ("way too
fast, slow it down a lot"). Both live in `src/lib/home-hero-snap.ts` + a touch
handler in `HomeHeroStack`. Rules:

1. **The step is measured from where the gesture BEGAN, not where it ended.**
   That is the entire overshoot fix: a hard fling can cross most of the runway
   before the finger lifts, and stepping from the release position would land
   on the slideshow after next. Verified: a fling that dragged the page nearly
   to C still settles on B.
2. **B's snap point is SOLVED, never declared.** B never rests — the crossings
   deliberately overlap, so B only passes through flush. Its snap point is the
   bisected zero of its transform under the ACTIVE easing curve (touch uses
   smootherstep, so the flush point differs from the pointer curve's). Derived
   from the same PHASE_*/PANE_A_TRAVEL constants the scroll handler uses, so a
   retune moves the snap point automatically; `home-hero-snap.test.ts` pins
   flushness, monotonicity, and the one-step cap.
3. **Two speed dials, and they are different things.** `SNAP_STEP_MS` (1000)
   is what a phone visitor actually watches — the snap moves the panes one
   frame height over that duration regardless of runway. The runway (240svh)
   governs only the MANUAL drag. Changing one without the other slows half the
   experience. The snap duration is progress-based, never pixel-based — a
   pixel formula silently retunes itself with viewport height and runway edits
   (the original 400ms was exactly that accident).
4. **Touch only** (`pointer: coarse`), same signal as the snappier easing
   curve and for the same reason: a wheel arrives in notches and hijacking it
   fights the visitor. No snap at either runway end (leaving the hero stays
   free), never under reduced motion, and a wheel/keydown cancels an in-flight
   snap. The snap reasserts `scrollTo` every frame — a one-shot loses to
   platform momentum. The momentum override is the one piece synthetic touch
   cannot prove; it is owner-verified on a real phone.

### A crowded shop-card date drops its "Ca." prefix — it never moves or reformats

Owner rule, 2026-08-09, stated generally: **whenever the date field gets too
crowded, remove the "Ca." to fit rather than using another format method.** It
governs future changes to this label, not just the one that prompted it.

The card's price row carries three things — the date (absolute, left), the price
(centred, in flow) and the width chip (absolute, right). `Ca. 1960` is 55px, the
catalog's widest price is 67px (`$2,394.56` — `$34,999` is only 55px, decimals
are what cost width), and the chip is 41px, so keeping the prefix needs about
187px of row. Real rows are often narrower than that, so the prefix goes.

- **The prefix is its own `.modern-card-date-prefix` span** so CSS can drop it
  without touching the year. Do not merge it back into the text node.
- **The threshold is keyed to the WORST-CASE price, not the typical one** —
  `2 x (55 - 7.2 + 4) + 67 ≈ 173px`, so the rule fires below 185px of content
  width. One colliding card is the bug; CSS cannot know a given card's price
  width, so the widest is the only safe basis. Re-derive if the label size, the
  row padding, or the catalog's widest price changes.
- **The query container is the ROW, never the viewport.** Row width is not
  monotonic in viewport width — 273px at 320px (grid 1-up), 161px at 390px
  (2-up), 201px at 472px, 177px at 1280px (4-up, a filter sidebar takes the
  rest). A media query would size for the wrong box, and checking only the
  extremes proves nothing about the middle. This is the same trap as the
  purchase panel and the related-strip.
- **Rejected: moving the date to its own line.** It was built and it collided
  nowhere, but it added ~14px of height to every card at every width, desktop
  included. The owner's rule is explicitly that the field shrinks in place.

Two mechanical notes for anyone editing these rules: the date carries its
positioning in a JSX inline `style` attribute, so any override needs
`!important` **and** must reset `transform` alongside `position`; and this
stylesheet is a template literal, so a single backtick anywhere inside it —
including in a comment — terminates the string and 500s the route.

### An undecided swipe is not a scroll — and a duplicated gesture rots

Owner, 2026-08-17: the photo swipe is "very hard to get to register, and it
tries to scroll down instead of swiping over" — **the same complaint, in almost
the same words, as 2026-08-09.** That repetition is the important part.

**The 08-09 fix was correct and was applied to only one of the two surfaces.**
The shop cards moved to native non-passive touch listeners; the product gallery
kept React `pointermove` and stayed structurally broken for eight more days.
`preventDefault` on a pointer event does nothing to scrolling, so on that
surface the browser's direction detection always won, fired `pointercancel`, and
killed the swipe before its 10px threshold was reached. **No tuning could have
fixed it** — the mechanism was wrong, and the working mechanism was sitting in a
sibling file.

The durable rule: **a gesture implemented twice will be fixed once.** Both
surfaces now share `src/lib/photo-swipe.ts`, thresholds included.

**The tuning insight — add an UNDECIDED state.** The old arbitration picked an
axis at one shared slop with a mild horizontal lean, which still lost the most
common real gesture: *a thumb swiping across a phone arcs*, so its first pixels
are frequently more down than across. A symmetric test read those pixels as a
scroll and the swipe was dead before the finger had gone anywhere sideways.
Conceding is unrecoverable — once the browser scrolls it never hands the gesture
back — so the two axes must need different amounts of evidence:

- **Horizontal locks eagerly**: 4px sideways, vertical drift allowed to 1.6x
  that (~58° cone). Cheap, because triggering was the thing failing.
- **Vertical locks reluctantly**: 12px, three times as far.
- **Between the two, the gesture is UNDECIDED, and undecided means hands off** —
  never `preventDefault`, so the page scrolls exactly as before, while the swipe
  is not yet thrown away and can still resolve horizontal.

⚠️ **Keep the vertical trigger well above the horizontal one.** Equalising them
is precisely the original bug, and a test asserts the inequality rather than the
numbers, so a retune is free but a collapse is not.

⚠️ **Do not push the cone much past 1.6.** Photos are most of the scrollable
surface on both the shop grid and a product page; a greedier cone starts
stealing genuine page scrolls, which is a worse failure than a missed swipe
because it makes the page feel stuck.

⚠️ A gesture the browser has already claimed (`cancelable === false` while
undecided) concedes to vertical at once — otherwise a late horizontal lock could
advance a photo in the middle of a scroll.

Verified with synthetic touch sequences on both surfaces: the arcing thumb
advances the photo and `preventDefault`s every move after the lock (the
undecided first move correctly left alone), while a straight vertical drag
starting on a photo produces zero `preventDefault` calls and no photo change.

### Shop-card photos: swipe + windowed dots on touch; hover affordances are mouse-only

Owner requests 2026-08-09 (dots replacing the progress bar, swipe, floating
dots, arrows removed on touch, keep-until-another-card-is-swiped). The rules
that must survive refactors:

1. **The swipe runs on NATIVE non-passive `touchmove` listeners, not React
   pointer events.** By spec, preventDefault on pointermove cannot stop
   scrolling; the only levers are `touch-action` (and `pan-y` deliberately
   permits vertical panning) and a cancelable touchmove. With pointer events
   the browser claimed the gesture and fired pointercancel before any
   threshold was reached. Vertical gestures are never claimed; the photos are
   most of the grid's scrollable surface.
   ⚠️ **The gesture moved to `src/lib/photo-swipe.ts` on 2026-08-17 and is now
   SHARED with the product gallery** — thresholds included, so the numbers once
   quoted here (5px slop, ~51° cone) live there and are superseded. See
   *"An undecided swipe is not a scroll"* below for the current arbitration.
2. **A swipe suppresses the trailing click one-shot, and the flag is cleared
   on the next touchstart.** A preventDefault'd swipe produces NO trailing
   click, so nothing consumes the flag — left standing, one swipe silently
   swallows the visitor's next genuine tap on the product.
3. **At most one card in the grid is off its cover photo**
   (`src/lib/shop-card-photo-focus.ts`, plain subscribe/notify — not context,
   which would re-render the grid per swipe). The last-swiped card holds its
   photo indefinitely; a DIFFERENT card being swiped snaps it back. A swipe
   that cannot advance (already at an end) must not claim focus — it would
   blank another card while visibly doing nothing. This replaced a revert
   timer, built and discarded the same session.
4. **Dot indicators are windowed at 7** (`src/lib/shop-card-dots.ts`): cards
   carry up to 20 photos against a ~166px frame. The window centres on the
   active photo; the outermost dot on a truncated side tapers, and that taper
   is the only "more photos" signal — never drop it as decorative. Dots are
   indicators only (`pointer-events: none`). Pointer devices: scrim pill,
   hover-revealed. Touch: permanent and FLOATING — no pill, so each dot
   carries its own contrast (fill + hairline ring + halo; on the lightest
   frame the fill alone is 1.04:1, so the ring is load-bearing on white and
   the fill on black). Position note: dot position ≠ photo index past photo 4
   — read `data-current-image` when verifying.
5. **Bottom chrome geometry is a matched set.** Dots sit on the photo's bottom
   edge; the brand/link flag is lifted just above the dot row; the arrows are
   BOTTOM-ALIGNED to the flag (the two flag variants are 18/24.9px tall and
   share only their bottom edge, so centre-alignment is wrong for one of
   them); arrows are `display:none` under `hover: none` — swipe + dots replace
   them, mirroring the product page below 768px. Re-measure the set together.
6. **Hover affordances are gated to `pointerType === 'mouse'`**, and the
   touch/mouse mode follows the MOST RECENT input rather than latching — on a
   hybrid device (touchscreen laptop) one early swipe would otherwise disable
   that card's mouse-leave reset for the session. Touch fires pointerenter
   too; ungated, a tap would start the hover auto-cycle and walk away from the
   photo the visitor just swiped to.

### Homepage carousel uses one server-authoritative initial payload

The localized homepage reads `carousel_selection` and `carousel_settings` on
the server and renders that result into the initial HTML. `HomeHero` must not
perform a second client-side selection/settings fetch after hydration. The
read is cached for five minutes under the `home-carousel` tag; successful
Admin carousel saves invalidate that tag immediately. Bundled carousel products
remain a resilience fallback only when the server read fails or returns no
selected products.

### Optimize cards before introducing virtualization

Gallery cards mount one cover initially, lazy-load offscreen content, and mount
carousel neighbors on interaction. Offscreen containment, database pagination,
accurate `sizes`, and targeted priority are preferred before full row/card
virtualization, because virtualization would complicate accessibility, focus,
history, and responsive layout.

### `svh` is NOT stable in an in-app browser — freeze the height in JS

Added 2026-08-18. **This supersedes the core premise of the entry below it.**
That entry says `svh` "is measured against FULLY-EXPANDED chrome and is stable
across exactly this event". Measured on the live site in Instagram's iOS in-app
browser, that is false there:

| reading | value |
| --- | --- |
| `vh` / `svh` / `dvh` probes | **all three identical**, and all three moved |
| `innerHeight` | swung **729 ↔ 853** — 124px of chrome |
| homepage document height | moved **423px** |

**Why.** Instagram resizes the WKWebView natively instead of retracting browser
chrome. WebKit therefore sees a plain window resize: there is no "small" versus
"large" viewport to distinguish, the three unit families collapse into one
number, and that number tracks the toolbar. `svh` is no more stable than `dvh`
in the one environment it was adopted for. It remains correct everywhere else,
which is why this was invisible for a week.

**Why it jumps.** Only elements in normal flow that CHANGE DOCUMENT HEIGHT
matter — a page whose height moves under a scroll is the jump. The homepage hero
is the amplifier: its runway is `(100svh - header) + 240svh`, i.e. **3.4 × the
unit**, so 124px of chrome became 3.4 × 124 = **421.6px** against 423px measured.
The arithmetic closes to under 2px.

**The rule.** Anything customer-facing that is **positioned or sized to the
viewport** reads **`var(--app-vh)`**, never a viewport unit.

⚠️ **This originally said "contributes to document height", and that was too
narrow — it let a second bug ship on 2026-08-19.** The hero's runway and frame
were converted; the overlay's `top`/`bottom` offsets INSIDE that frame were not,
because they change nothing about document height. But with the frame stable an
`svh` offset moves the **text alone against a background that does not**, which
the owner reported as more obviously wrong than the whole page shifting. In an
in-app browser every `svh` is dynamic; the only question is whether the movement
is visible, and inside a pinned frame it is *more* visible, not less.

**The one deliberate exception is a max-height on a transient overlay** — a
modal, a drawer, the boot splash. Those SHOULD track the currently-visible area,
so a dynamic unit is correct there and they stay on `svh`.

The mechanics:

- `globals.css` defines `--app-vh: 100svh` as the no-JS fallback — correct
  everywhere `svh` behaves per spec.
- An inline script in `[locale]/layout.tsx` overwrites it with a pixel value
  **before first paint**. Setting it after hydration would lay the page out at
  the fallback and jump when the token landed, reintroducing at load exactly the
  shift this removes during scroll.
- `ViewportHeightToken` refreshes it **only** through `onLayoutAffectingResize`,
  whose 160px tolerance sits comfortably above the 124px measured here — so
  toolbar movement can never move it, while a rotation still does.

Verified by measurement, both directions: a 124px height change leaves
`--app-vh`, the document height (7820px) and the hero runway (2844px) all
completely unmoved, where the `svh` rule would have taken the runway to 2423px;
a rotation updates the token and the runway follows.

⚠️ Do not "simplify" a `var(--app-vh)` back to `100svh`. It looks like a
pointless indirection and is the whole fix.
⚠️ Max-heights on modals, drawers and the boot splash stay on `svh` by design —
they are transient overlays that should fit whatever is visible right now.
⚠️ **Do not extend that exemption to page content.** "It does not change
document height" is NOT sufficient grounds; see the widened rule above.
⚠️ Tailwind's `*-screen` aliases are separately banned — see rule 3 below.
That was a real defect and it was NOT the cause of this; fixing it changed
nothing on the failing device, because `vh` and `svh` are the same moving number
there.

### Viewport height is `svh`, and `resize` is never listened to bare

Added 2026-08-11 after the owner reported the classic in-app-browser stutter:
Instagram's and Facebook's embedded browsers hide and show their toolbar as you
scroll, which changes `window.innerHeight` and fires `resize` continuously.
Anything keyed to viewport height then relayouts mid-scroll and the page appears
to stutter or reload.

Two rules, and both are needed — the units alone do not stop the JavaScript from
churning, and the guard alone does not stop CSS from resizing.

1. **Use `svh`, never `dvh`, for anything sized to the viewport.** `svh` is
   measured against FULLY-EXPANDED chrome and is stable across exactly this
   event; `dvh` tracks the current viewport and therefore animates on every
   toolbar transition. The worst instance was `.shop-filter-sidebar`, a sticky
   scrollable panel on `/shop` sized `calc(100dvh - 7.5rem)` — it resized
   continuously while scrolling. Keep a plain `vh` declaration immediately before
   the `svh` one as the legacy fallback (the pattern `.site-loading-screen`
   already used). Inline React styles cannot carry duplicate declarations, so
   those use `svh` directly — universally supported since 2022.

   **The one legitimate use of `dvh` is a NON-SCROLLING full-viewport shell.**
   `AdminShell`'s root and its fullscreen overlay are `h-dvh` with
   `overflow-hidden` and internal scrolling: the page itself never scrolls, so
   the toolbar never auto-hides, and `dvh` fills the visible area exactly where
   `svh` would leave a strip of dead space at the bottom. Those two stay. The
   distinction is scrolling, not admin-vs-customer — every `max-h-[calc(100dvh-…)]`
   on an admin modal was moved to `svh` with the rest.

   This is not a new insight in this codebase: the product-editor modal already
   chose `h-svh` for precisely this reason, and its comment
   (`AdminShell.tsx`, "dvh grows as soon as the toolbar auto-hides") is the
   clearest statement of the trade-off — accept a little unused space rather than
   let a footer's Save buttons fall outside the guaranteed-visible area.

2. **Subscribe through `onLayoutAffectingResize` (`lib/viewport-resize.ts`),
   never `window.addEventListener('resize', …)` directly.** It fires only when
   the WIDTH changed — any width change is real — or when the height moved more
   than `VIEWPORT_CHROME_TOLERANCE_PX` (160px, clearing the 44–120px of real
   mobile chrome while staying well under a 250–350px keyboard; a rotation is
   caught by the width test anyway).

   It anchors to the last size it ACTED on, not the last size it saw. Comparing
   against the last event would absorb toolbar oscillation correctly but make a
   slow drag-resize invisible — a hundred 10px steps are each under tolerance, so
   the baseline would creep along with them and the 300px total would never
   register.

3. **Never use Tailwind's `*-screen` height utilities** (`min-h-screen`,
   `h-screen`, `max-h-screen`). Added 2026-08-18, after the owner reported the
   jump again. They compile to `100vh`, and the reason they are banned outright
   rather than merely discouraged is that **they are invisible to the check that
   enforces this rule.** The 2026-08-11 sweep searched for unit literals;
   `min-h-screen` contains none, so eight usages survived it — including the one
   on `<body>` in `[locale]/layout.tsx`, which applies to every page on the site.

   The proof it was an oversight and not a judgement: that same sweep converted
   `[locale]/not-found.tsx` from `60vh` to `60svh` while leaving
   `app/not-found.tsx` on `min-h-screen`. Two 404 pages, one fixed, one not,
   differing only in whether the unit happened to be spelled out.

   `min-h-svh` / `h-svh` / `max-h-svh` are the replacements — Tailwind v4 ships
   them, they say what they mean, and a future unit sweep can find them.
   `lib/__tests__/viewport-units.test.ts` enforces this, because **a convention
   that can only be enforced by grepping for a string the offender does not
   contain is not a convention, it is a hope.**

   ⚠️ On the page shell this trades a cosmetic cost, accepted by the owner
   2026-08-18: on a page SHORTER than the screen with the toolbar hidden,
   `min-h-svh` leaves a thin strip of page background below the footer's
   `#f3f3f3`. ~50px of a near-identical tone, on sign-in/sign-up/404 only. The
   loop it removes is worth more than the strip it leaves.

   ⚠️ `.min-h-screen{min-height:100vh}` REMAINS in the compiled CSS, and that is
   not a regression. Tailwind's scanner is a plain string scan over the source
   tree and does not parse, so the class name inside the comments explaining
   this very rule is enough to emit the utility. Nothing applies it. Audit the
   served `<body class>`, never the stylesheet — this is the same shape as the
   project's existing "a broken absence check looks exactly like a clean result"
   trap.

Applied to all three resize listeners in the app: the homepage hero's remeasure
(whose geometry is entirely `svh`/`rem`-derived, so toolbar movement genuinely
cannot change it — it was forcing a synchronous `offsetHeight` reflow per scroll
frame), the shop grid's column count (a pure function of `innerWidth`), and the
admin action menu's close-on-resize.

### Responsive failures are tested by width and height

The desktop filter sidebar keeps its sticky layout but receives a viewport-
relative maximum height and internal scrolling. Narrow pagination uses a
localized page status; omitted desktop page ranges use ellipses. Customer
controls must remain reachable and free of page-level overflow from 320px
mobile through wide desktop, including short landscape viewports.

## Checkout, Tax, And Payments

### Contact fields are validated for substance, and their ORDER is load-bearing

A paid order arrived on 2026-08-22 with `customer_name` = "Sara" and
`customer_phone` = "Catlett". Checkout had only ever asserted that those fields
were non-empty, so a first name plus a surname-in-the-phone-box was a valid
order. `type="tel"` contributes nothing here — it hints at a mobile keypad and
validates no input.

Two rules came out of it.

**1. Substance, not presence.** `lib/person-name.ts` and `lib/phone.ts` are the
single source for what counts as a usable name and phone, applied on the client
for UX and in `create-order/route.ts` as the actual gate — before any order row,
PayPal order, or money. The canonical values are what get stored and what the
PayPal shipping label prints.

**2. Phone never sits adjacent to the name.** Contact fields run
**First Name → Last Name → Email → Phone**. `responsive-form-grid` is
`auto-fit / minmax(16rem, 1fr)`, so an adjacent pair is side by side on desktop
and stacked on mobile — either way, the field after a first name is the one a
buyer fills with a surname. Last Name occupies that position now. Reordering
these fields is a behavioural change, not a cosmetic one.

⛔ **Both validators must stay the most lenient rule that does the job.** Two
whitespace-separated tokens for a name; structural NANP/E.164 facts for a phone,
with extensions and explicit `+` international numbers accepted. **A false
positive is a lost sale** — a very different cost from a false positive in spam
filtering, where the same instinct to tighten already nearly cost a real customer
named `VanDerBeek`. Never replace either with a heuristic about what a real name
or number "looks like".

ℹ️ Considered and rejected: a single Full Name field requiring a space. It gets
the same data with one fewer field (Amazon's pattern) but rejects mononyms and
only reveals the requirement after the buyer has tripped on it. Two labelled
fields state it up front, and match `profiles`, which already stored
`first_name`/`last_name`. The pair is joined into the existing `customer_name`
column, so no migration was needed.

### Server pricing is authoritative

The browser sends product IDs/quantities and selections, never trusted amounts.
`checkout-pricing.ts` reloads products and spot data, checks purchasability/
quantity, snapshots item prices, and computes tax, shipping, and total.

`checkout-shipping.ts` is the sole shipping catalog. Fees are value-based
tiers keyed to the order's merchandise subtotal (2026-07-30 owner-approved
contract, `features/shipping-tiers.md`): Local Pickup $0; Standard Insured
$19/$25/$29/$35/$59/$99/$99/$165 across eight bands with USPS Registered Mail
at $5,000+; Express Overnight $55/$79/$119 and not offered at $5,000+ because
USPS insurance caps there. Unknown methods and unavailable methods are
rejected rather than falling back to free shipping or a substituted service.
Every tier must charge above its worst-case postage + USPS carrier insurance
cost — the store never pays shipping out of pocket. The same standard tier
table drives Etsy/eBay shipping through
`getMarketplaceStandardShippingFee`; all seven policies/profiles per channel
are provisioned, with missing mappings retaining a safe legacy fallback.

### Shipping is U.S.-only and structurally validated

Shipped checkout requires street, city, a canonical U.S. state/D.C., and a
five-digit ZIP or ZIP+4. Country is United States. The server repeats
normalization/validation and rejects tampered or international input.

### Current tax policy is Florida-only

Local Pickup and validated Florida destinations use a 6% rate on discounted
taxable merchandise plus charged shipping. Non-Florida destinations receive
$0 Florida tax. There is no California-specific branch.

Florida county discretionary surtax and other-state nexus collection remain
deferred until accountant review and registration. Existing orders are
historical snapshots and are not retroactively recalculated.

### Checkout is a single-page two-column layout

Owner decision 2026-08-04, replacing the earlier four-step wizard (Summary →
Delivery → Contact → Review & Pay) after the owner supplied a mainstream
retail checkout as the model. `/checkout` now shows everything at once:

- **Left column** — one *Shipping* card, ordered **delivery method → contact
  details → address**. The delivery radio cards come first deliberately: the
  method decides whether a shipping address is required at all, so asking it
  last let a Local Pickup buyer fill in an address they never needed. Do not
  reorder them back. There is no separate Payment card — PayPal is the only
  method, so a card that just announced it was noise; the buyer picks
  PayPal-vs-card inside PayPal's own buttons. There is no order-notes field;
  `customer.notes` remains in the payload as an empty string so the server
  contract is unchanged.
- **Right rail** — one *Order summary* card: **items first**, then totals,
  policy links, the confirmation checkbox, and the PayPal buttons. Items lead
  because that is the near-universal checkout order (Shopify, Stripe
  Checkout): confirm what you're buying, then what it costs, then pay. Below
  1024px the columns stack with the summary last, so a phone reads the form
  first and lands on the pay controls at the end.

The summary card is sticky from 1024px, and three details make that work —
change any one and it silently breaks. The grid uses `align-items: stretch`
so the rail spans the row height (a content-sized rail gives sticky zero
travel); the sticky element is the card *inside* the rail, not the rail
itself; and the card carries `max-height: calc(100svh - 7rem)` with
`overflow-y: auto`, because a sticky box taller than the viewport pins its top
and leaves its bottom — the pay button — permanently unreachable. Keep the
card the single scroll region; a second nested scroller on the item list
fights it for wheel events.

The page header's back link is **Back to cart** and reopens the cart drawer
over the page — the cart is a drawer, not a route, so navigating to `/shop`
would have discarded entered details.

This remains a presentation layer only: payReady gating, effective-method
derivation, capture recovery, and order reuse are unchanged, the confirmation
checkbox is still a hard gate on payReady, and buyers still see the final
total before paying because the PayPal buttons sit beneath it. With
capture-on-approve, "Place order" remains PayPal's own Pay Now review; do not
add a post-PayPal confirm step.

Display money is derived once, by `computeOrderTotals` in `OrderSummary.tsx`,
and shared by the item-list summary and the standalone `OrderTotals` card so
the two surfaces cannot disagree. The server still recomputes every amount
authoritatively (`checkout-pricing.ts`).

Financial summaries list tax AFTER the shipping cost (Subtotal → Shipping →
Shipping Cost → FL Sales Tax → Total) so the merchandise-plus-shipping
taxable base is visually obvious.

Server checkout rejections carry machine-readable codes
(`OrderDraftErrorCode`); the client maps codes to precise bilingual guidance
and falls back to message-pattern matching only for uncoded/legacy
responses. New rejection reasons must add a code, not rely on wording.

### There is exactly ONE sign-in/guest gate, and it lives outside `.checkout-page`

Owner decision 2026-08-19, after hitting the gate twice on a phone. There used
to be two: a four-option gate (Log In / Create Account / Continue as Guest /
Cancel) raised by the cart drawer, and a second two-option one (Sign in /
Continue as guest) baked into `CheckoutClient`. The drawer never recorded the
buyer's answer, so a shopper who picked "Continue as Guest" was asked again the
moment checkout mounted. **The owner picked the four-option screen; the
two-option one is deleted.**

`components/checkout/CheckoutGate.tsx` is now the single source for that screen
and for the choice itself (`rememberGuestCheckout()` /
`hasChosenGuestCheckout()`, sessionStorage key `nej-checkout-auth-choice`).

- ⚠️ **The drawer MUST call `rememberGuestCheckout()` before routing to
  `/checkout`.** That call is the only thing preventing the double prompt from
  returning.
- **sessionStorage, not localStorage**, deliberately: the answer belongs to this
  shopping run. A PayPal cancel/return must not re-ask; a visit next week should.
- The checkout page still renders the gate, for buyers who arrive **without**
  passing the drawer — a bookmark, a restored tab, a Back out of PayPal. It
  passes `showCancel={false}` there, because the buyer is already on checkout
  and "Continue as Guest" IS the way out; a Cancel beside it would be a second
  button doing the same thing.

🔴 **The gate is rendered as a SIBLING of `.checkout-page`, never inside it.**
`.checkout-page` carries `data-customer-reveal="visible"`, whose
`transform` / `filter` / `will-change` (globals.css) make it a **containing block
for `position: fixed` descendants** — and `will-change` stays applied forever,
long after the reveal animation ends. Nested inside it, the gate's `inset: 0`
resolved to the 2409px page instead of the viewport: measured on a 375×812
phone, the card sat at **top 1114px**, entirely below the fold, so the buyer saw
a dimmed unusable checkout and had to scroll ~854px to find the dialog. It
reads as "fine on desktop" only because a tall window happens to catch it.

⚠️ **This is a general trap, not a checkout one.** Any `position: fixed` element
placed inside a `[data-customer-reveal]` subtree breaks the same way and does so
silently — the element renders, it is simply anchored to the wrong box.

### PayPal captures on approval with no reservation

PayPal Orders API v2 is the storefront processor. PayPal credentials and
`PAYPAL_ENV` must be one consistent set; the client ID may reach the browser,
while the secret remains server-only.

There is no checkout inventory hold. The first successful capture wins under a
database row lock. Capture evidence is preserved before local fulfillment.
Ambiguous capture is reconciled against PayPal, and buyers are warned not to pay
again when provider success is known or unresolved.

Refunds require deterministic request IDs and the `paypal_refunds` ledger.
Webhook and route retries must be idempotent. A refund does not automatically
restore inventory; restoration is an explicit admin action.

The validated checkout address is authoritative for shipped PayPal orders.
Local Pickup does not request a shipping address.

## Admin And Orders

### Lifecycle changes are explicit

Draft and Archived are non-public. Permanent product deletion is a second,
confirmed step after archive and must clean owned media. Sold price is locked
until deliberate relisting. Manual order lifecycle and explicit inventory
restore must not silently rewrite payment history.

Orders and Messages use recycle bins where supported. Invoices are created
idempotently at order creation and updated to paid after capture. Email history
records the actual From identity separately from the initiating admin/system.

### Admin tables favor working visibility

Admin Products defaults to Available inventory, preserves sticky product
identity and totals inside the scroll viewport, and keeps row quick actions in
page-sized dialogs that are isolated from table layout styles.

On mobile, the compact inline table remains the dashboard preview, but an
explicit **Open Product Table** control must promote that same table into a
full-screen dynamic-viewport dialog. The dialog owns two-axis scrolling, keeps
Close and Escape available, locks background scrolling, and closes if the
viewport reaches desktop size. In the full-screen mobile mode, pin only the
selection edge, product image, and row actions. Inventory number and title must
pan with the statistics, while the image stays visible as the compact visual
identifier for every row. Do not pin the full identity group: it would consume
almost the entire phone. The ordinary tablet/desktop inline table and its
sticky identity columns remain unchanged.

The mobile toolbar pairs **Add Product** with a compact **Open Product Table**
launcher. The launcher may use tighter type, icon, spacing, and horizontal
padding to fit narrow phones, but must preserve its complete label and must not
alter the desktop toolbar. Search belongs at the top of the expanded mobile
Filters panel, not in a permanently visible toolbar row; a non-empty search is
included in the mobile Filters badge. The visible/total count belongs at the
right edge of the table utility row beside Reset/status. Desktop retains its
always-visible toolbar search and count.

The explanatory drag-reorder sentence is desktop-only. Mobile table space is
reserved for inventory and actionable state: retain **Reset view to drag
reorder** when sorting/filtering prevents reordering and retain the saving
status during a reorder, but hide the entire strip when neither is present.

## AI And Bilingual Listing Copy

### Buyer-facing copy excludes seller guesses

Seller opinions, suggestions, unsupported identifications, and uncertainty may
not be presented as fact in title, description, or public notes. Objective
facts and visible markings may be used; unresolved uncertainty remains an
admin-facing warning.

### AI listing refinement is conversational but remains a draft

The open product editor owns the AI conversation. Every turn sends the current
form as the baseline plus a bounded set of prior turns, returns a complete
revised field set, explains changes, and asks only relevant clarification
questions. Current supported values are preserved unless the admin requests a
change or stronger evidence contradicts them.

Conversation state resets when a different Add/Edit editor opens and is not
stored in product rows. AI revisions update only the unsaved form; the normal
Save action remains the sole persistence boundary. The buyer-copy firewall and
explicit-only measurement rules apply on every refinement turn.

### AI review safety is application-enforced

The model prompt is guidance, not the confirmation boundary. After coercion,
the server compares every returned field with the current form. Only a
high-confidence, non-sensitive value added to a blank field may auto-apply.
Every replacement of an existing value, low/medium/missing-confidence value,
and chain, measurement, purity, or pricing fact stays pending until the admin
accepts it. Warnings, uncertainties, and unchanged values without high
confidence generate explicit clarification questions.

Read-aloud is admin-only. The server may use OpenAI's speech endpoint with the
server-held key; the browser falls back to its device voice when unavailable.
The UI identifies playback as an AI-generated voice, and speech is never stored
with the product or conversation.

### Spanish regeneration is explicit and fill-only

The Edit Listing action generates Spanish values only for blank Spanish fields.
It never overwrites retained copy, rejects stale results if source fields change
during the request, and does not persist until the admin saves normally.

## Marketplace Integrations

### Etsy and eBay remain independent channels

Each integration owns its client, mapping, state machine, SQL, routes, settings,
and error handling. Admin bulk entry points are consolidated in the Products
Actions modal, but status checks and Publish All Ready actions are separate per
marketplace.

### Review-first is the default

Selected/bulk work reuses bounded single-item state machines. Preflight and
review occur before publish where supported. Targeted repair/update is preferred
to blanket re-sync.

### Remote lifecycle and local freshness are separate

An active remote listing may still be locally `out_of_date`. Status checks
reconcile remote lifecycle without clearing content drift. Only a successful
content sync refreshes the pushed hash and clears local freshness state.

Price-only drift does not mark content out of date; dedicated price-push actions
handle price changes. Marketplace failures never block storefront cache
revalidation or successful buyer checkout.

### Never put a marketplace call in the buyer's payment path

⛔ **Do not `await` the auto-delist hook in the PayPal capture route.** By the
time that line runs the payment is **already captured**, so anything that hangs
converts a successful payment into an error page — the buyer is charged and
believes they were not. That is strictly worse than a delist arriving late.

The tail is not bounded: `lib/ebay/client.ts` and `lib/etsy/client.ts` both call
`fetch()` with **no `AbortSignal`**, and both retry 3× with 1s/2s/4s backoff —
7s of sleep plus four round-trips — against a gateway that cuts at ~26–30s.
Multi-item orders multiply it, because each channel loops products sequentially.

⚠️ More generally: an outage at eBay or Etsy must never become an outage at
checkout. Marketplace sync is not on the critical path of taking money.

**Bound the exposure from OUTSIDE instead.** The reconcile sweep runs every 30
minutes and needs nothing from the request. If near-zero exposure is ever
genuinely required, the safe shape is start-the-work → await with a short cap →
hand the SAME promise to `after()` regardless, so a slow marketplace can never
strand a paid buyer. Never a plain `await`.

ℹ️ The PayPal **webhook** is the exception: no buyer waits on that response, so
awaiting there costs nothing.

### On a freeze-on-response platform, post-response work is best-effort BY DESIGN

⛔ **Do not treat `after()` as a guarantee on Netlify.** Next's own feature
matrix lists `after()` as **"Requires graceful shutdown support"**
(`deploying-to-platforms.md`), and `self-hosting.md#after` defines that as a
SIGTERM drain with a 10–30s window. Netlify's Lambda model **freezes** the
container the moment the response flushes — there is no drain.

Measured 2026-08-21, in the act: a `hide_oos` log insert landed **127.6 seconds**
after the `upsertListing` two lines above it. Two sequential awaits cannot be
128s apart unless the process stops in between. Clock skew is excluded — the
same pair of statements for another product, same code path, is 0.469s apart, and
the two timestamps come from different clocks (Node vs Postgres). The late
completions coincided with the next request to the site: freeze → thaw on reuse.

⚠️ **What `after()` did and did not buy.** It reliably covers work that finishes
inside the response window — the Etsy delist and Deep Field push now land where
they used to be dropped. It does NOT cover slower work: eBay's branch adds an
`ensureFreshAccessToken` round-trip and was still in flight when the function
returned at 995ms.

⛔ **The correct mental model for the original bug is FROZEN, not KILLED.** Work
suspended on a container that is later reused finishes late; work on a container
reclaimed while cold is lost forever. That is why the failure rate was 39/41
rather than 0/41, and why it was impossible to reproduce on demand.

**Therefore: anything that MUST happen gets a reconcile sweep, not a better
scheduling primitive.** A scheduled job that finds sold products whose listings
are still live and delists them is the only approach that does not depend on the
platform honouring post-response work — and it also catches API errors and
status paths nobody hooked. Make it synchronous instead only where the latency
is acceptable to the user doing the action.

### Post-response work uses `after()`. A floating promise is not scheduling.

⛔ **Never launch background work as `void promise.catch(() => {})` in a route
handler or Server Action.** On Netlify the Lambda freezes the moment the response
flushes and kills anything still in flight. Next registers `after()` callbacks as
pending work and drains them before exit; an un-awaited promise is invisible to
it. `docs/01-app/02-guides/self-hosting.md` is explicit about this.

This was not theoretical. Six call sites used that shape for the marketplace
auto-delist hook, and it dropped roughly **one sale in twenty**: 39 of 41 sold
products delisted correctly, 2 did not, and the two that failed left a sold item
live and buyable. It is a RACE — the same hook worked again two days later — so
it will never reproduce on demand and never fail in local dev, where the process
does not freeze.

⛔ **The tell is silence, not an error.** `handleProductStatusChange` logs a
`status_change_hook` error row for any throw. The failures left no row of any
kind and no partial write. If a side effect has simply *not happened* with
nothing in the log, suspect termination before suspecting a bug.

**All product-write side effects now go through
`lib/product-status-hooks.ts` → `scheduleProductStatusHooks()`**, which wraps
them in `after()`, uses `Promise.allSettled` so one marketplace cannot cancel the
other, and **logs** failures. `queueDeepFieldSync` was deleted rather than left
unused, because it was the same broken shape waiting to be picked up again.

⚠️ **A website sale is the dangerous case, not the admin one.** Both August
misses were items that had sold on eBay, so eBay zeroed its own quantity and
covered for us. Nothing covers a PayPal checkout sale.

### Persist first, announce second — an early return must not strand a write

⛔ **Do not put cache revalidation or side-effect hooks after unrelated work that
can `return` early.** In the admin edit modal the product row (status included)
was written, then the video was committed, and only then was
`adminRevalidateProduct` called — so a video-commit failure left a sold item
cached as available and never delisted from either marketplace.

The row write and the announcement that it happened are one unit. Anything
optional and unrelated goes after both.

### A listing the Inventory API cannot reach must be republished, not unblocked

⛔ **Never lift a write-block to "fix" a listing the API cannot reach.** eBay
listings created outside the Inventory API — a Seller Hub relist, a "Sell
similar" — carry the same custom label (SKU) but are attached to **no** Inventory
offer. `bulk_update_price_quantity` cannot touch them by any route.

Removing the guard makes it worse, not better: the push writes to the orphaned
UNPUBLISHED offer, **succeeds**, and advances `last_pushed_price` while the live
listing stays frozen. The dashboard then reads "0 blocked" and the drift grows
unseen. Inventory #82 sat 17 days at a 15% discount exactly this way
(2026-08-21).

**The only repair that restores normal management is end-and-republish:** end
the external listing, reset local state to `sync_state: 'ended'` with
`ebay_listing_id: null`, then publish through `runSyncStep(id, 'publish')` — not
raw API calls, so content hash, price, quantity and state land identically to
every other listing. Cost: a new item number and the loss of the old listing's
views, watchers and carts. That cost is real and the owner must approve it.

⚠️ **A republished listing re-enters the CURRENT shipping tiers.** #82 went
$15.00 → $59.00 because its price band demands it; the old fee was a pre-tier
leftover that survived precisely because the listing was unmanaged. Expect this
on any similar repair and do not mistake it for a bug.

⚠️ **`EBAY_WRITE_BLOCKED_PRODUCT_IDS` is empty and should stay that way.** Keep
the mechanism — pinning is right for a live-but-unreachable listing — but treat
a non-empty set as an open incident, not a steady state. A pinned id is a
listing the price push has silently stopped updating.

### A scheduled marketplace job's time budget is an ABSOLUTE deadline, stamped on entry

⛔ **Never measure a scheduled price push's budget from inside the push loop.**
It reads as equivalent and is not: setup (spot fetch, connection read, listing
and product queries) runs BEFORE the loop, so a loop-relative budget bounds the
loop and nothing else. The real ceiling becomes `budget + however long setup
took`.

That shipped, and on 2026-08-21 it cost a run: 22s of loop budget plus ~10s of
setup = 32s, and Netlify's gateway returned a 504 `Inactivity Timeout`. Both
`runScheduledPricePush` implementations now stamp `deadlineAt` as their FIRST
statement and pass it down; the constant is **20s**, leaving headroom under
Netlify's 26s synchronous ceiling.

⚠️ **Raising that number toward 26 is the wrong repair.** If runs start
reporting `deferred` again, the catalog has outgrown a single synchronous
request — move the push to a background function (15-minute ceiling) instead.

### Marketplace bookkeeping is batched; the API call is not the cost

⛔ **Do not record a bulk marketplace operation one row at a time.** Both price
pushes did, and it was the entire performance problem — not the marketplace
API, which was never slow.

Measured 2026-08-21 on eBay: 50 prices went up in **two** bulk
`bulk_update_price_quantity` calls, but recording them cost **100 serialized
Supabase round-trips** (an `upsertListing` + an `insertSyncLog` each) at ~157ms
apiece — **15.7s of a 22.2s run**. Etsy was the same shape and had been quietly
deferring 15–18 listings a day since 2026-08-20.

`bulkPatchListings` and `insertSyncLogs` in each store collapse a batch into two
round-trips. `lib/__tests__/marketplace-price-push-batching.test.ts` guards
both this and the deadline rule, and was mutation-tested — reintroducing either
bug fails it.

⚠️ **eBay's `bulkPatchListings` requires `ebay_sku` in every patch** and Etsy's
does not. `ebay_listings.ebay_sku` is `not null unique`, so the INSERT half of
the upsert needs it; `etsy_listings` has no such column. Callers pass it from
the row they just read.

⚠️ **A deadline checked between BATCHES can overshoot by a whole batch.** eBay
works in 25-offer chunks and one bulk call was measured at 6.5s, so its loop
requires headroom equal to the worst chunk seen so far in that run. Etsy checks
per item, so its overshoot is one listing and it deliberately has no headroom
term. Do not "unify" these — the granularities differ for a reason.

### A red scheduled job does not mean the work failed

⛔ **Check the `scheduled_price_push` summary row in the sync log before
concluding anything was lost.** On 2026-08-21 `ebay-price-push` went red with a
504 and every one of the 50 prices had already landed on eBay; the handler
finished a fraction of a second after the gateway hung up. The 504 was a
reporting failure.

⚠️ The GitHub **mobile app** mislabels these runs — it rendered a scheduled run
as "Triggered via pull request" with an `on:pull_request` breadcrumb. The web UI
is authoritative. Do not go looking for a workflow-file divergence on that
basis; there was none.

### Marketplace writes require a live relevant-metal quote

The storefront may display its explicitly labeled fallback estimate during a
metal-provider outage, but Etsy/eBay writes are durable financial actions and
must fail closed. A spot-priced item can be written only when the spot payload
comes from the live API and contains a positive quote for that item's metal.
Manual-priced items and an already-locked sold price do not depend on live spot.

### Daily marketplace price runs are bounded and observable

**Superseded 2026-09-07 — Supabase `pg_cron` owns every trigger.** GitHub
`schedule` degraded on 2026-08-27 (it created 6–16 of the ~64 expected runs a
day for eleven days, every created run succeeding) and Netlify's scheduler was
still dead, so all seven jobs moved to `pg_cron` + `pg_net` inside the existing
Supabase project (`supabase/scheduled-jobs-pg-cron-2026-09.sql`), secrets in
Vault, same routes and UTC schedules, zero app change. Chosen over cron-job.org:
no new vendor or account, secrets stay in-house, minute-accurate, run history
in the dashboard. A rotated cron secret now has a FOURTH home: Supabase Vault.

**2026-09-13: pg_cron is the ONLY scheduler.** Netlify's scheduler began
executing the old `.mts` functions around 2026-09-11 and GitHub `schedule` still
fired late, so every job ran three times (found after GitHub run #606's
`facebook-drip` 502 — a late GitHub call; pg_cron's runs that hour were fine).
The social drips read due rows and publish without claiming them, so two
overlapping triggers could double-post a queued item. The `schedule:` block was
removed from `scheduled-jobs.yml` (the manual "Run workflow" button stays) and
`next-app/netlify/functions/` was deleted. **Never add a second scheduler** — if
pg_cron ever needs replacing, cut over and delete, do not overlap.
The paragraph below is the 2026-08-11 record.

**GitHub Actions owns the daily trigger** — one staggered job per marketplace in
`.github/workflows/scheduled-jobs.yml` (Etsy 11:15 UTC, eBay 11:45 UTC). It
replaced the Netlify scheduled functions on 2026-08-11 because those never
executed even once; the `.mts` files were kept for reversibility until they were
deleted on 2026-09-13 (above).
The trigger is deliberately interchangeable: the routes are secret-header-guarded
and trigger-agnostic, so any external cron can drive them. **Never assume a
scheduler works because its dashboard says it is registered** — a Netlify
"Scheduled" badge with a correct "Next execution" time sat over a completely dead
scheduler for weeks.

The secret-guarded Next routes do the actual work with a fixed time budget,
price-only writes, oldest-row-first rotation, and summary log records. eBay
uses verified batches of at most 25 and isolates a failed mixed batch so one
offer cannot starve later listings. Admin Settings exposes secret readiness and
the latest scheduled result; no new database table is required.

A rotated cron secret must be updated in **three** places or the job 401s:
Netlify (**and then redeploy** — env changes do not reach the running site until
a new deploy), the GitHub Actions repository secret, and `.env.local`.

**Three rules added 2026-08-08 after the price push turned out to be generating
~33 guaranteed API rejections per run:**

1. **Eligibility is decided by CURRENT PRODUCT STATUS, not by listing sync
   state alone.** A sold product's listing legitimately stays `out_of_date`
   forever while its marketplace offer is already withdrawn, so a sync-state
   filter re-selects it every run and the marketplace rejects every write. Check
   `normalizeProductStatus(product.status) !== 'available'` and skip. Key it on
   live status, never on a "dead" flag written to the listing — relisting must
   revive it with no manual repair.

   Note eBay and Etsy differ here by accident, not design: Etsy's auto-delist
   moves sold listings to `delisted` (outside its selection) while eBay's leaves
   them `out_of_date` (inside it). Do not rely on that; both planners now check
   status explicitly.

2. **A failure path must actually record the failure.** Both providers called
   `upsertListing(service, id, {})` — a no-op patch — so `error_count` never
   left 0 and the retry ceiling could never engage. The manual button polls to
   completion and a failed listing stays a candidate, so 33 broken listings
   produced 139 error rows in a single run. Increment on failure, **reset to 0
   on success** (that is what makes the ceiling self-healing), and skip at the
   ceiling.

3. **Persist `err.detail`, not just the operator sentence.** Both
   `EbayApiError` and `EtsyApiError` carry a pre-redacted `detail` documented as
   safe for a sync-log row, and both failure paths were dropping it — leaving
   140 rows reading `eBay API error (HTTP 400).` with no recoverable cause,
   because that string is only the FALLBACK for an envelope with no top-level
   message. A generic operator message is a signal the real reason is in
   `detail`.


### Lead forms ask where the sender is and how to reach them; the server stays lenient

Added 2026-09-08. Two required fields on the seller forms (Free Evaluation,
Message Us) and one on the product-inquiry form:

1. **Location is a fixed list, not free text.** Six service-area cities plus
   "Elsewhere in Southwest Florida" and "Outside Southwest Florida"; only the
   two catch-alls ask for a city & state and show the out-of-area note. The
   list is what lets Admin flag `outside-swfl` in red without parsing prose.
   The note is a heads-up, never a block — an out-of-area sender can still
   submit (owner's call).
2. **The form is strict, the API is lenient on absence.** Both fields are
   `required` in the browser, but the routes accept a submission without them
   (a page loaded before the deploy) and store nulls. What the API is strict
   about is VALUES (an unknown value is treated as not given, never stored as
   free text) and the one fixable mistake: "Email" chosen with an empty email
   box is a visible 400, never a silent drop — same rule as a bad phone.
3. **New columns must never lose a submission.** `insertInquiry` tries the
   full row and, if the migration is missing, retries without the new columns
   with the same facts folded into the message text. A schema race is not a
   reason to drop a lead.
4. **One pure module owns the vocabulary** (`lib/inquiry-fields.ts`): forms,
   both routes and the admin panel import it. The SQL check constraints mirror
   it; change both together.

### A scheduler is judged by its log rows, and sub-daily work never rides on GitHub `schedule`

Added 2026-09-07. GitHub documents `schedule` as best-effort, and for eleven
days it was exactly that: from 2026-08-27 it created 6–16 of the ~64 runs a day
this workflow asks for — 0 failures, 300/300 created runs green — so nothing
was red anywhere. Three rules:

1. **Count log rows per day, not run outcomes.** A green run list proves the
   runs that happened; only the expected number of `reconcile_status` /
   `scheduled_price_push` rows proves the schedule. Anything a design calls
   "every 30 minutes" must be verified as 48 rows/day, and re-verified before a
   new feature is allowed to depend on that cadence.
2. **GitHub `schedule` is not a scheduler for anything sub-daily.** It stays
   as a manual `workflow_dispatch` surface only; the cron entries go once the
   pg_cron overlap window closes.
3. **A silently swallowed repair is a lie in the counters.** The reconcile
   sweeps counted every `handleProductStatusChange` call as "repaired" while
   the marketplace was refusing the state change (Etsy `edit`, eBay
   `Completed`) and the error went only to the console. A sweep may count a
   repair only when local state actually changed, and a refusal must write a
   log row the admin can see.

   **Built 2026-09-07 (day, later):** `src/lib/marketplace-drift-repair.ts`
   (`classifyDriftRepair` judges from the re-read state: repaired /
   reconciled / failed / noop) and, per channel, `apply*ProductStatus` (throws
   on refusal) + `repair*StatusDrift` (refusal → log row → read-only status
   check → re-read → classify). The summary row carries all four numbers.
   Reconcile-on-refusal is the right response because a marketplace that
   refuses to close a listing has usually closed it already — that is the
   inbound "it sold there" signal in its rawest form.

### An absent record is a fault, not a clean slate

Added 2026-08-10, after discovering that **no Netlify scheduled function on this
site has ever executed** — the two price pushes and all three social workers —
while Admin Settings showed a green check and *"Ready for Daily at 11:45 UTC. No
completed run has been recorded yet."* Nothing was broken in our code; the
reassurance was.

Two rules, both general:

1. **Never render "has never happened" as healthy.** For anything expected on a
   schedule, absence past its due time is the strongest possible fault signal
   and must be shown as one. `resolvePricePushHealth`
   (`src/lib/marketplace-price-push-health.ts`) distinguishes `disabled` (the
   owner's choice, not a fault) from `never_run` and `overdue` (both faults), and
   the copy names the place to look — since 2026-09-14 the job's run history in
   Supabase → Integrations → Cron (pg_cron is the only scheduler; the Netlify
   scheduled functions are deleted, so never point at a Netlify log). Allow a
   grace window (60 minutes here) so a merely late run is not flagged, but never
   let the grace become an indefinite excuse.

## The Instagram token refreshes inside 14 days of expiry, so the weekly job gets two tries (2026-09-14)

- **Decision (owner request).** `INSTAGRAM_REFRESH_WINDOW_MS` = 14 days
  (`lib/instagram/auth.ts:26`), up from 7.
- **Why.** The keep-warm job runs once a week (pg_cron `nej-instagram-token-refresh`,
  Mon 12:15 UTC). A window equal to the schedule interval gives exactly one
  attempt, and one transient Meta or network failure then lets the 60-day token
  expire before the next run, forcing a manual re-paste.
- ⛔ The window must stay at least **twice** the job interval. If the schedule ever
  becomes less frequent, widen the window with it. Refreshing earlier costs
  nothing: Meta issues a fresh 60-day token, and only tokens younger than 24 h
  are refused (`INSTAGRAM_MIN_REFRESH_AGE_MS`).

## The "30-minute checks" card turns red after 60 minutes without a check (2026-09-14)

- **Decision (owner-approved mockup).** Settings → Etsy / eBay show a
  "30-minute checks" card directly above "Daily price automation". It reads the
  newest `reconcile_status` run summary (`product_id IS NULL`) plus the
  `marketplace_sales` row from the same run, and goes red when the newest check
  is more than **60 minutes** old. That is two missed runs, so one late start never flips it.
  No row at all is also red (rule 1 above: never render "has never happened"
  as healthy).
- **Detail sentence keeps the counts** ("134 listings checked, 0 sales, nothing
  to fix"). A skipped or failed run shows the row's own message instead.
- **Where.** `lib/marketplace-status-checks.ts` (pure, tested); the stale and
  never-run copy reuse `PRICE_PUSH_RUN_HISTORY_HINT`, so both cards point at the
  same Supabase cron history.
- ⚠️ The per-listing `reconcile_status` rows also use that action. Always filter
  `product_id IS NULL` for the heartbeat, or a busy repair run can look like
  a fresh check with no counts.

## Every Etsy and eBay request has a time limit; a timeout is typed, logged and not retried (2026-09-14)

- **Decision.** All marketplace HTTP calls go through `fetchWithEtsyTimeout` /
  `fetchWithEbayTimeout` with the per-attempt limits in
  `lib/marketplace-timeout.ts`:
  - API calls 15 s.
  - Photo uploads, and fetching our own photo first, 30 s.
  - OAuth token endpoints 10 s.
- **How a timeout surfaces.** It becomes a typed `etsy_timeout` /
  `ebay_timeout` error with `retryable: false`, and it is enforced on the body
  read too, so it never turns into silently-null data.
- **Why.** Neither client had a timeout. The 30-minute reconcile route awaits
  the sales read before the status reconcile, so one hung connection could
  stall auto-mark-sold and drift repair until Netlify killed the function, with
  nothing logged. The limits sit under the existing budgets: sales 15 s,
  reconcile / price push 20 s, the 60 s route cap and Netlify's ~26 s gateway.
  Not retrying a timeout keeps the worst case bounded; the next scheduled run
  re-reads.
- **How to apply.**
  - A new Etsy/eBay call uses the wrapper, never a bare `fetch`.
  - A deliberately slow operation passes its own `timeoutMs` instead of raising
    the defaults.
  - The timeout message must never contain "reconnect", "not connected",
    "refresh token" or "shop id": `isConnectionLevelEtsyError` would treat a
    single slow call as a dead connection and abort a whole bulk run.
    `marketplace-timeout.test.ts` pins this.

2. **Never derive a rare event's last occurrence from a page of recent rows.**
   Both status routes read 25 log rows and searched them for the scheduled push.
   One manual "Push prices now" writes ~130 `price_push` rows on Etsy and ~300 on
   eBay, and the eBay account-deletion webhook alone has written 56k rows — so
   the scheduled run was buried within minutes of any real activity and the card
   silently degraded to the same "no run recorded" it shows for a dead cron. Query
   the specific action directly (`getLastScheduledPricePush`), ordered and
   `limit(1)`. A high-volume neighbouring action must never be able to hide a
   low-volume one.

The corollary for diagnosis: when a log that records even skips contains zero
rows for an action, suspect the caller, not the logger. Here three independent
code paths across two providers were all silent, which located the fault above
the application entirely.

### Content freshness and price-push health are two separate signals

Added 2026-08-11, after a proposal to drive the out-of-date flag off price-push
failures — "if the price push always succeeds it should never be out of date."
That is not how the two relate, and merging them would hide real faults:

- **`out_of_date` = CONTENT drift.** `computeContentHash` covers title,
  description, aspects, condition, category, quantity, images, and the
  fulfillment / payment / return policies.
- **The daily price push sends `sku`, `shipToLocationAvailability.quantity` and
  `offers[].price`.** Nothing else. Its success path writes `last_pushed_price`,
  `error_count` and `last_error`, and never touches `content_hash`.

A successful price push therefore **cannot** clear `out_of_date`, structurally.
When this came up, 84 available eBay listings were flagged because the
2026-08-01/02 tier shipping policies entered the hash — while that same night's
price push succeeded on 56 of them with zero failures. Driving the flag off price
success would have shown all 84 as healthy while they still charged the OLD
shipping on live listings.

So the product table carries two chips per marketplace:

1. the existing state chip, relabelled **"Content stale"** (from "Out of date",
   which read as a fault and invited exactly this conflation), and
2. a **price chip** — "Price failed" / "Price stalled" — from
   `lib/marketplace-price-chip.ts`, which renders **nothing** when every push has
   landed. A permanent green across 131 rows would spend attention without
   earning it; the chip appearing at all is the signal.

`MAX_PRICE_PUSH_ATTEMPTS` moved into that client-safe module and is re-exported
by both `ebay/sync.ts` and `etsy/sync.ts` (both `server-only`), so the chip's
"stalled" boundary cannot drift from the boundary the planners actually skip on.
Same reasoning as `ebay/guards.ts`. Previously both files declared their own `3`.

**A noisy flag is not automatically a wrong flag.** Etsy showed 1 out-of-date
listing against eBay's 84 on identical code — the difference was an unworked
shipping-tier backlog, not a measurement error. Clear the backlog; do not
redefine the measurement.

### Watches are not listed on eBay

Owner decision, 2026-08-11. The catalog's two Rolexes (#83, #84) stay off eBay.

This matters as a DECISION and not just a task because the code carries an open
`TODO(ebay-verify)` that reads like unfinished work: `mapping.ts`'s `Watch` entry
notes that eBay category 31387 (Wristwatches) requires a `Department` aspect
(Men's/Women's/Unisex) which `mapAspects` never sends, and says to "add
Department handling before syncing a watch". **That TODO is answered — do not
implement it.** Both watches fail publish with *"The item specific Department is
missing"*, and that is the correct, intended outcome rather than a bug to fix.

The same TODO's aside that "no Watch-type item exists in the catalog yet" is
stale — two do — but the conclusion is unchanged for a different reason.

**Encoded PER ITEM, not per category** (owner, 2026-08-11: "just those two
items… other watches maybe in the future"). `EBAY_EXCLUDED_PRODUCT_IDS` in
`ebay/guards.ts` holds the two ids; `buildPreflightChecks` fails `eligibility`
with `EBAY_EXCLUDED_REASON`, and `enqueueProducts` drops them alongside
write-blocked ids.

⚠️ **Do not convert this into a `Watch` category rule.** Coin/Bullion are
excluded by category through `isEbayIneligibleProductType`, and it would be a
natural-looking refactor to fold watches in beside them — but that would
silently stop a FUTURE watch from ever syncing, which is the opposite of the
decision. A test pins the per-item behaviour by asserting an unrelated watch is
still eligible.

Two reasons it is an exclusion rather than a bug fix: the owner does not want
them listed, and separately they cannot publish without the Department aspect. If
watches are ever wanted on eBay, map Department and remove the id — both halves
are needed.

### A bounded bulk run must also be bounded in TIME, not just in count

Added 2026-08-19, after the Facebook drip went red with
`curl (56) Failure when receiving data from the peer` — the server closing the
connection mid-response.

⚠️ **The incident that prompted this rule was NOT caused by it.** The owner
confirmed the queue was empty that run, so nothing was published and the loop
never iterated. What consumed the 25s was never established (see `CHANGELOG.md`
2026-08-20). The rule below stands on its own reasoning, not on that evidence —
keep it, but do not cite that failure as proof of it.

**Netlify cuts a SYNCHRONOUS function at 26 seconds.** ⚠️ *Corrected
2026-09-09: that figure was observed on a SCHEDULED function; current Netlify
docs say synchronous 60 s, scheduled 30 s, and an admin route was seen alive at
32.4 s — see "Our provider abort must sit under Netlify's real cap" above. The
budget rule below still stands.* The drip selected up to 25
due rows and published them sequentially with no clock. A cap of 25 says nothing
about how long 25 Meta publishes take, and the platform only enforces time.

Two rules:

1. **Any loop that calls a third party in a serverless route needs a wall-clock
   budget**, not just a row cap. `createDripBudget()` in
   `social-queue-schedule.ts` is the shared one; both social channels use it so
   they cannot drift apart.
2. **Test "would another row fit", never "have we run out".** Measure rows as
   they run and refuse to START one that cannot finish. `elapsed > budget`
   begins an 8-second publish at 19.9s and lands past the ceiling — the same
   failure with extra steps. Always attempt the FIRST row regardless, or one
   slow item stalls the queue forever.

Work not attempted is returned as `deferred` and named in the sync log; the next
scheduled run continues. This is only safe because the publish step is
idempotent — it early-returns on an already-published row and recovers a feed
request Meta completed before the server stopped. **Do not add a time budget to
a loop whose steps are not resumable.**

⚠️ **`export const maxDuration` is a VERCEL contract and Netlify ignores it.**
It read 60 on both drip routes and bought nothing. Raising it is never the fix
for a timeout here.

⚠️ **A cap on COUNT is not a cap on TIME** is the durable half of this. The
diagnosis that produced it was wrong twice over, which is itself the lesson: an
error signature that *fits* a theory is not evidence for it. `curl (56)` at 25s
against a 26s ceiling fit "too much work" perfectly, and the work was zero.
**Ask what the code actually does with the data it actually had** before
believing a timing signature.

⚠️ A budget cannot rescue a run where ONE step exceeds the whole ceiling. That
needs a background function, which returns 202 immediately and gives up the loud
pass/fail this project deliberately wanted from its cron.

### A bounded bulk run must ORDER its queue, not just cap it

Added 2026-08-11. `EBAY_BULK_ENQUEUE_LIMIT = 25` makes "never blanket re-sync"
mechanical, but a cap alone does not make a backlog drain. `enqueueProducts` took
`allowed.slice(0, LIMIT)` with no notion of which listings still needed the
write, so the documented campaign procedure — select everything, sync, run it
again for the next batch — re-queued the same first 25 every time. Measured: the
second run re-pushed 21 of the same 23 listings and advanced nothing.

`orderEnqueueCandidates` sorts before slicing: **stale (0) → error (1) →
published (2)**.

Three things about that shape are deliberate:

- **Order, do not filter.** Excluding already-current rows would break the other
  use of this path, where an admin selects a few live items and deliberately
  force-re-pushes them. Sorting preserves it — with nothing stale to outrank
  them, the selection queues as given.
- **`error` sits in the middle.** At the front, two permanently-failing items
  would camp at the head of every run, consume two of the 25 slots forever, and
  climb their error count for nothing. Behind the clean backlog, they are
  retried once there is capacity.
- **The sort must be stable** so the caller's order survives within a group.
  `Array.prototype.sort` guarantees this.

The general rule: whenever a capped batch is meant to be run repeatedly, the cap
decides *how much*, and the ordering decides *what* — a cap without an ordering
is a loop that repeats its first page.

### Etsy queue progress is durable

Bounded image requests retain queue ownership after intermediate states. Normal
and repair drains use separate atomic claims. Progress is cumulative against a
fixed total, and a one-click repair action resumes linked interrupted rows.

### eBay verification follows relists without mutating them

Read-only verification may follow an ended listing to a live relist, but must
not silently attach, end, or republish that external relist. App-side writes
remain blocked until the stored offer/listing relationship is deliberately
reattached.

### eBay write blocks are pinned by id, and bulk runs are capped

A write block inferred from mutable row data is not a block. Inventory #82's
quarantine originally read `last_error === RELISTED_LISTING_WARNING`, which any
later error, manual clear, or partial sync would erase — silently re-arming a
write to a listing that is live through an unattached external relist. Blocked
products are therefore pinned by id in `EBAY_WRITE_BLOCKED_PRODUCT_IDS`, and
every write path asks one question, `isEbayWriteBlocked()`. Lifting a block is
an explicit code change, reviewed with the migration that justifies it.

Bulk enqueue is capped at `EBAY_BULK_ENQUEUE_LIMIT` (25) and drops
non-`available` products before queueing. "Never blanket re-sync" is a real
hazard — a shipping-policy or template change re-hashes the entire catalog at
once — so it is enforced mechanically rather than left to whoever is clicking.
The admin states the cap before a run and the withheld count after it, so a
capped batch is never mistaken for a finished job.

### An Instagram post is effectively permanent once published

Two hard limits, both confirmed live on 2026-08-01, make publishing a one-way
door and are the reason this integration is review-first:

1. **Captions cannot be edited.** Instagram's API has no update endpoint.
2. **Posts cannot be deleted through the API either.** The Instagram API with
   Instagram Login exposes no media-deletion endpoint; `DELETE /{media-id}`
   returns "does not support this operation". The `instagram_manage_contents`
   permission that can delete posts belongs to the Facebook-Login variant,
   which requires a linked Facebook Page — an architecture we deliberately
   avoid. **Removing a post is a manual action in the Instagram app.**

So the app can create a post but can never take it back. Therefore: nothing
auto-posts (review-first by default, the owner approves each item), a quoted
price is always written as an explicit "≈ $X at time of posting" alongside a
pointer to live site pricing, and a post whose price would come from a fallback
spot estimate is blocked outright — the same fail-closed rule as Etsy/eBay
writes.

`deletePost()` attempts the API delete, detects the unsupported-operation
response, and returns the permalink with instructions rather than pretending to
have succeeded; it deliberately leaves the local record intact so the operator
can still find the post. A separate `forgetPost()` clears local state and
renditions after the operator has deleted it by hand. Any future "out of date"
handling must follow this same two-step shape — the app cannot repost over
something it cannot remove.

Anything that ends up in a caption must be correct the first time. Notably, an
inventory number is written as "Inventory 21", never "Inventory #21":
Instagram auto-links "#21" into a hashtag pointing at an unrelated tag page
(seen on the very first live post, permanently).

Since 2026-08-01, the inventory number stays out of PUBLIC post copy entirely,
on both channels (caption and alt text — `buildPublicSpecLine`, one shared
strip so the rule cannot drift). The piece is identified by the `/p/<inv#>`
short link instead: clickable full URL on Facebook, and a two-line Instagram
block: `Store link in bio` immediately followed by the **typeable** brand-case
`Item: NaplesEstateJewelry.com/p/N`. There is no blank line inside that pair,
but the normal caption blank line remains above and below it. Instagram caption
URLs are never linkified — a dead `https://` URL there is noise, but a short
brand-case path is something a viewer can retype. Both channels share one
caption structure (opening sentence that combines availability with the item
→ specs → price sentence, uniform one-blank-line rhythm,
no description body); channel differences are limited to what the platforms
force (link form, CTA wording). AI is optional and manual-only: ordinary
preview loads and direct Prepare calls never invoke a model. The operator must
click Generate/Regenerate, may first add up to 400 characters of optional style
direction (typed or selected from the shared six-option suggestion menu), may
edit the result directly, and must Prepare again before
publishing; unsaved wording hides the publish controls. Leaving direction blank
and skipping Generate preserves the deterministic opening exactly. AI output is
bounded by a schema, must clearly identify the product, and must contribute a
genuine conversational thought rather than only rewriting the title plus
availability. It deliberately varies sentence structure and prefers natural
“This…” phrasing over “The {full catalog title}…”. It may shorten the
catalog title naturally, as admin edits already can. Both paths reject “our,” links,
hashtags, inventory numbers, quotes, extra sentences, and stale availability
claims. Failure or no manual generation uses `Available now: {title}.`
Existing prepared captions stay immutable until explicitly re-prepared.

Facebook and Instagram do not use the same hashtag volume. Both may reuse the
same relevance ordering, but Facebook is capped at the first three tags so the
Page copy reads naturally; Instagram retains its larger discovery-oriented set.
This limit is enforced by the Facebook mapper, so preview, Prepare, queue, and
publish cannot drift.

Tiffany has one public social hashtag: **`#tiffanyandco`**. The shared hashtag
normalizer maps direct Tiffany brand/company variants, including legacy
`#tiffanyco` and bare `#tiffany`, to that spelling before deduplication. This is
shared mapping policy, not a per-product tag edit, so Instagram and Facebook
cannot drift.

In the combined **Publish to both** review, a channel already in prepared
`review` state is authoritative for the reviewed opening sentence. Preparing
the missing side copies its complete stored caption body instead of rebuilding
different wording on the target. The target mapper replaces only the
platform-specific link block and trailing hashtag line: Facebook retains its
clickable `Shop:` URL and three tags; Instagram receives `Store link in bio` +
`Item:` and its larger tag set. The same operation copies the source channel's
complete saved photo curation - ordered lineup, exclusions, crops, card source,
and card background - then rebuilds the target channel's own rendition files.
The copy is revalidated against current product images and invalidates staged
platform uploads before Prepare. If neither side is ready, each
target keeps its own preview caption.
If both sides are already ready with different openers, publishing both is
fail-closed. The page that opened the modal is the source of truth, and the
operator must explicitly re-prepare the other channel with **Sync wording** or
**Sync wording & photos**.
The cross-channel endpoint reads the source caption from the server-side stored
review row; browser-supplied caption bodies are never trusted.

When both reviews are ready, the combined modal always names the direction and
offers three separate operations: **Sync wording**, **Sync photos**, and **Sync
wording & photos**. These are semantic modes, not alternate labels for one
operation. Wording-only must not mutate destination curation. Photo-only must
copy curation and rebuild renditions while preserving the destination's stored
reviewed caption. Combined sync copies both. The manager page that opened the
modal remains the source, so direction is never inferred from which caption or
slide count happens to differ.

The same combined review may queue both channels, but only when both prepared
reviews are current and their opening sentences match. Queueing is a distinct,
non-public action beside Publish, reuses the existing per-channel queue
contracts, and reports each channel independently rather than implying an
all-or-nothing database transaction. A queued post remains a prepared review:
preview copy is selected from the stored caption and renditions, not from the
temporary `pending` sync state, so queueing cannot make reviewed wording appear
stale or hide the unqueue path. Unqueue restores `review` whenever that prepared
caption and rendition set still exist; only an unprepared record returns to
`pending`.

The Instagram content hash deliberately EXCLUDES price. Spot moves daily; if
price were hashed, every live post would flag itself out of date and invite a
delete-and-repost that costs real engagement. Only caption copy and the image
set mark a post stale.

Instagram-specific limits that the mapper must keep enforcing: 10 images per
carousel, JPEG only (the catalog is WebP, so renditions are mandatory), 2,200
caption characters, 30 hashtags, and 100 published posts per rolling 24 hours.

### Instagram renditions are padded squares, and the GC must know about them

Every image in an Instagram carousel is cropped to the FIRST image's aspect
ratio. Rather than let Instagram crop jewelry — clasps, hallmarks and gemstones
sit at the edges — each source image is padded onto a 1080x1080 canvas, which
makes the crop rule a no-op. Renditions are JPEG (Instagram rejects WebP),
content-addressed, and written to the existing product-images bucket under
`instagram-renditions/`.

"Publish to both channels" publishes **Instagram first, always**: Instagram is
the permanent channel (no API delete or edit) with the most failure modes
(publishing quota, async container processing), so an Instagram failure means
nothing has gone out anywhere; Facebook — synchronous, deletable, trivially
retried — publishes second and is skipped with an explicit "not attempted"
result when Instagram failed. Cross-channel curation copying
(`/api/admin/social/copy-curation`) is verbatim-including-nulls ("make the
other channel match this one"), re-validated against current product images,
refused when the target post is live, and invalidates the target's prepared
renditions exactly like a lineup save. The combined
`/api/admin/social/prepare-from-channel` path calls that same copy operation
before it prepares the missing side; it never maintains a caption-only shadow
implementation. Channel curation STORAGE stays separate
(the copy is an explicit operator action, not a sync) — shared storage would
let one channel's re-prepare delete files the other still references.

The card's AUTO-proposed crop **never upscales** (2026-08-01): if the proposed
region cannot fill the card's photo well at native resolution, the full frame
is used instead — composition never justifies blur (`guardProposedCrop`).
Operator-set crops are exempt; they are chosen against a live preview.

The generated card **replaces its source photo** in the prepared slides
(2026-08-01): the card composites that photo full-bleed, so also posting the
standalone copy showed the same image twice in one carousel. The replacement
happens only when the card actually rendered — a card failure keeps every
photo, preserving the photos-are-the-substance degradation rule. A
single-photo product therefore prepares as one card-only slide, which both
publish paths handle via their existing single-image branches.

The pad colour is **sampled from the photo, not assumed** (2026-08-01). It was
hard-coded white, which is invisible on the cream-sweep majority but framed
every black-backdrop photo in white bars — the chains are portrait, so a
pure-black shot got ~92px of white down each side. Corner samples are
composited over white before being averaged, so a background-removed photo
(transparent corners) reports white and therefore agrees with whatever
`flatten()` paints behind it; reading raw RGB there would call it "black" and
pad a white-flattened image in black. White stays the fallback for a
non-uniform frame, where there is no single backdrop colour to match.

### Match the backdrop instead of cutting the product out

The generated ad card paints its background in the source photo's own backdrop
colour, and the crop-proposal and card share that measurement.

The alternative — chroma-keying the product and compositing it onto a fixed
dark card — was built and rejected. It forced a distinction that does not
reliably exist: the studio drop shadow is near-neutral and only ~10-35
luminance below the sweep, so separating it from genuine dark detail (the
crevices between links) needed per-image threshold tuning, punched holes
through polished metal, and failed outright on sterling against cream, where
7-12% of the piece sits within 25 luminance of the backdrop.

Matching the backdrop removes the problem rather than solving it. The shadow
lands on the surface it was cast on, so no matte is needed, and one code path
serves both sweeps. Product pixels are only ever cropped, scaled and placed —
never redrawn — so the piece cannot drift, which is the same guarantee that
keeps generative approaches off the table for listing imagery.

Two consequences worth keeping:

- **Feather any crop that is tighter than the backdrop.** A crop sitting on
  bare backdrop joins the card invisibly, but a tighter one necessarily cuts
  through whatever the piece rests on. The black velvet bust reads rgb(3,3,3)
  against a rgb(0,0,0) card, and three levels along a long straight edge shows
  as a rectangle. The alpha ramp is a no-op in the first case, so it is always
  applied.
- **Saturation-based cropping is for dark backdrops only.** It frames the metal
  and ignores the neutral prop, which is what a chain on a velvet bust needs
  (Byzantine: 57% of frame → 21%). It is not a general default — sterling on
  cream is barely more saturated than the sweep and would vanish under it.

### The lead card is pipeline, not preference

Every Instagram carousel leads with the generated card. There is no toggle and
no `card_enabled` column: it defines what a post looks like rather than being a
per-run choice, and a setting only invites the two paths (preview and prepare)
to disagree about how many slots are free. The photo cap therefore lives in
`buildInstagramPost` as `INSTAGRAM_MAX_PHOTO_ITEMS` (9 of Meta's 10), so the
count an operator reviews is the count that publishes by construction.

The small **NOW AVAILABLE** eyebrow immediately above the item title is also
system-owned card presentation, not editable post content. It belongs in the
shared renderer so Instagram and Facebook cannot drift and so the operator does
not have to manage another field for a consistent visual hierarchy.

A card render failure is **not** fatal. The photos and caption are the substance
of a post; the card is presentation, so a failure degrades to a card-less
carousel with a warning rather than blocking. This is deliberately the opposite
of the fail-closed rule on price: a published caption is a durable public claim
and must never quote an estimate, whereas a missing decorative slide claims
nothing. Review-first means the operator sees the prepared slides either way.

Because of that fallback, position is not proof — the card's Storage object is
named `card-<hash>.jpg` rather than `0-<hash>.jpg` so the review UI can label
slide 0 honestly instead of assuming.

### Instagram card type renders through Satori, not sharp

sharp draws SVG text through fontconfig, which finds nothing on Netlify's
Lambda image. Satori (via `next/og`, already bundled with Next) takes font
buffers directly and needs no system fonts, so the card splits by strength:
sharp does the pixel work, Satori does the type.

The brand faces are vendored as OFL **static** TTFs under
`next-app/src/assets/fonts` with their licenses. Static specifically — Satori's
bundled opentype parser throws on a variable font's `fvar` table, so Google's
single-file `Family[wght].ttf` builds cannot be used. Nothing imports the files,
so `outputFileTracingIncludes` in `next.config.ts` is what puts them in the
serverless bundle; drop it and every card fails at render with ENOENT.

Because they live in that bucket but are referenced only by
`instagram_posts.rendition_paths`, the Storage GC reference scan MUST include
that column. Without it the sweep reads them as orphans and deletes them,
which breaks any prepared-but-unpublished post by making its image URLs 404
exactly when Instagram tries to fetch them.

### Instagram connects by pasted token, not redirect OAuth

Instagram rejects `http://localhost` redirect URIs, which would make the
owner's LAN/dev testing impossible, and this is a single owner-operated
professional account on a development-mode Meta app where Meta's own documented
path is dashboard token generation. The owner pastes a long-lived token once;
it is stored AES-256-GCM encrypted and refreshed weekly by a scheduled
function, so it never expires in practice. An expired token cannot be
refreshed — only re-pasted — which is why the refresh runs weekly rather than
at the last minute. Redirect OAuth can be added later without schema changes.

### Facebook mirrors Instagram as an independent channel

The Facebook Page integration copies the Instagram integration's shape
file-for-file (schema, lib modules, routes, panels, drip) rather than
abstracting a generic "social channel": an operator or agent who knows one
immediately knows the other, and a change to one can never destabilise the
other. Where the Graph API differs, the build leans into the difference instead
of forcing parity — Facebook has no refresh cron in this owner flow, so Page
tokens are lifetime-inspected before storage and later re-pasted when finite or
invalidated,
deletion genuinely works (so there is no manual-delete detour), publishing is
synchronous (no container polling), and links are clickable (so every post
carries a `Shop:` product URL, which Instagram cannot have).

Sharing boundaries: API clients are NEVER shared between channels. Pure caption
and lineup helpers ARE shared (imported from `lib/instagram/mapping`) so copy
fixes land on both channels at once. The rendition/card engine is shared code
but writes per-channel Storage prefixes (`instagram-renditions/` vs
`facebook-renditions/`) with per-channel GC reference columns — shared objects
would let one channel's re-prepare delete files the other still references.
Lineups and crops are stored per channel for the same reason: curating one
never changes the other.

### Social preparation is one owner action, not two internal pipeline actions

The Instagram and Facebook manager screens treat saving a lineup and creating
the prepared upload as one owner-level intent: **Save & prepare**. The server
still receives the two ordered operations, but surfacing an independent card
preview made it easy to click Done and mistakenly believe a prepared upload
existed. There is now no manual card-generation step: preparation creates the
real card, which first appears in review. The panels instead expose the stage derived
by `lib/social-workflow.ts`: curate → prepare → review → publish. Unsaved
lineup changes always win over a previous preparation, and caption edits make
that review stale too. Queueing, combined publishing, publishing, and discard
are unavailable until the review is current. This is deliberately UI-state
only: no schema or API contract changed. Preserving the local caption opening
across a lineup reload prevents the convenience save from silently discarding
an operator's wording. Conversely, an explicit outlined **Reset changes**
action resets every local setup value (lineup, crops, card source/background,
AI direction, and opener) to the loaded baseline without a write. It is absent
when there is nothing local to discard; a generic Cancel label hid that scope
and looked inert when only a prepared-state flag remained.

The action row belongs **after** the full photo/card setup, not beside the
Photos heading. It is a completion action, not a prerequisite for choosing,
reordering, cropping, or selecting the card image; placing it beside the
heading falsely implied the reverse order.

For social opener copy, **Tiffany & Co.** is a canonical house name rather
than a stylistic choice. The AI is told to use it, and the shared server-side
normalizer converts Tiffany variants in a Tiffany product's generated,
fallback, or edited opener before the caption preview is built. Its abbreviation
period is explicitly not treated as a second sentence. The same shared opener
normalizer enforces the house punctuation rule for typographic dashes: em and
en dashes have exactly one space on each side in AI, fallback, extracted, and
admin-edited copy. Hyphens within compound words are not treated as dashes.

### Social square framing lives in the editable lineup

Prepared social images use contain-to-square framing so no jewelry is lost by
an implicit crop; that can visibly add canvas around landscape or portrait
photos. The editable lineup therefore uses the same server-side post-crop
framing calculation and sampled canvas color that `renderSquareJpeg` uses; its
thumbnail is the sole pre-prepare preview, with **Canvas**/**Crop** labels for
quick scanning. This replaced the separate hardcoded-white toolbar preview,
which could disagree with black or cream source backdrops. Canvas color is
resolved from the median border ring, not four corners: a tight crop can put a
bracelet or shadow in one corner while the dominant sweep remains uniform. A
genuinely mixed border still falls back to white. The crop dialog deliberately
shows the editable source and a separate live square **Prepared post preview**
side by side. **Fill square** provides a centered, square crop *starting point*
and visibly removes canvas in that output preview. It is not an automatic write
or re-prepare, and the owner must inspect and apply it, preserving control over
clasps and other edge details. The same shared crop UI and lineup rendering
apply to Instagram and Facebook.

### Remote social status is reconciled conservatively, never inferred

A local `published` flag is not permanent truth: an owner can delete a post in
Facebook or Instagram itself. Each published manager therefore performs one
remote read on open and exposes an explicit refresh action. A Meta missing-id
response is still ambiguous because its text can also describe permissions, so
local state changes to `deleted` only after a second `/me` call proves the same
Page/account token remains healthy and, for Facebook, a fresh one-item Page feed
read proves the read permission still works. Facebook's New Page Experience can
return a stored post id prefixed by the Page id while the public permalink uses
a different Page actor id. The permalink-derived composite id is a permitted
read-only fallback, but only for numeric `facebook.com/{actor}/posts/{post}`
URLs and never as proof by itself. Authentication, permission, rate-limit,
network, and other ambiguous errors must preserve `published` and surface an
actionable message. Manual **Already removed on…** is the deliberate fallback
when the owner knows the remote post is gone. Facebook Page-token connection
must also prove `pages_read_engagement` by reading one feed id; a publish-only
token is insufficient for reconciliation. A status check is a local, contained
interaction: unchanged success or inability to check belongs beside the refresh
button in neutral/success text, not in the panel's page-wide error banner.

Facebook token rotation is validate-then-swap, never disconnect-first. A
connected admin can paste a replacement token, but the stored token remains
active unless the candidate passes Page profile, post-read access, exact
same-Page-id, and Meta token-metadata checks. Same-Page protection still applies
when the stored connection is `needs_reauth`; expiry must never make it possible
to silently redirect future posts to another managed Page. The metadata must be
valid for the Naples Estate Jewelry Social app. Tokens with a finite lifetime
under 30 days are rejected; longer finite lifetimes are persisted and displayed,
while a null expiry means only that Meta reported no finite expiration. The
server-only `/debug_token` call requires `FACEBOOK_APP_SECRET`; when it is not
configured, connection and rotation fail closed rather than accepting an
uninspected credential.

### Facebook publish completion is receipt-first and exactly recoverable

A successful Meta feed response is the irreversible boundary. Persist its post
id as Published immediately; permalink enrichment and audit logging are
secondary and must never move that row back to error. If the process ends after
Meta creates the post but before the receipt is stored, checkpointed unpublished
photo ids authorize a read-only recovery attempt before any retry write. Recovery
requires exactly one recent Page-feed entry whose full message equals the saved
prepared caption and whose creation time is after the checkpoint began. Zero or
multiple matches fail closed. A consumed-photo response is evidence to attempt
that proof, never proof by itself and never permission to prepare fresh photos
or create another public post.

### Do not publish off-eBay contact information

eBay description artwork must not display phone numbers, email addresses, or
off-eBay website URLs. Product-photo galleries must contain product imagery,
not a marketing banner.

## Security And Privacy

### A public form filter is tuned by MEASUREMENT, and fails open toward the human

⛔ **Never pick a spam threshold by eye.** `lib/spam-heuristics.ts` counts case
flips in a single-token name — generated identifiers flip constantly, real names
barely do. The first attempt used 4 because "McDonald scores 3, so 4 is safe".
It was wrong: **`VanDerBeek` scores 5 at ten characters**, so the length gate
does not save it, and a real customer typing only their surname would have been
silently discarded.

The value that shipped came from measuring both populations against the real
2026-08-22 sample:

```text
humans  1, 3, 3, 3, 3, 3, 3, 3, 3, 5, 5      <- max 5
spam    7, 8, 8, 10, 10, 11, 12, 12, 13, 13  <- min 7
```

**6** is the only value with clearance on both sides. Re-derive it the same way
if the sample changes; do not nudge it.

⛔ **The asymmetry is the whole design: a missed bot is spam, a false positive is
a lost customer.** Spend every point of margin on the human side. Two tokens in
the name field is the strongest human signal available and wins outright.

⚠️ **The 10 spam rows in `inquiries` are the labelled sample** and are named
verbatim in `spam-heuristics.test.ts`. The owner's decision (2026-08-22) is to
keep them. Do not "tidy" them away — the threshold is calibrated against them.

### A silently-dropped submission must still be logged

⛔ **Silent to the caller, never silent in the log.** The `bot-field` honeypot
dropped bots invisibly on two forms for months, so when a third form shipped
*without* the honeypot rendered there was no signal at all — the filter looked
identical whether it was working or absent. Drops now log `[inquiry-spam]` with
the reason.

Same lesson as `.catch(() => {})` on the marketplace hooks: a swallowed outcome
is indistinguishable from a mechanism that has stopped running.

ℹ️ The response stays a normal success on purpose. A bot that receives an error
learns the filter's shape and adapts; one that receives "thanks" keeps posting
into a void.

⚠️ **Accepted residual risk (owner decision, 2026-08-22):** `/api/inquire` still
emails a confirmation to whatever address is submitted, so the form remains a
potential relay for any bot that uses plausible two-word names. The decision is
to react if abuse recurs rather than change customer-facing behaviour now; the
playbook is in `TASKS.md`.



### A query parameter is never an authorization signal

Established 2026-08-08 after a live disclosure bug: `?returnTo=/admin` on a
soft-deleted product URL returned the full page to an anonymous visitor. The
gate was `!visible && !returnHref`, where `returnHref` came from a helper whose
only job is validating that a back-link points somewhere sensible. **A
validator that answers "is this string a plausible internal path" was standing
in for "may this viewer see this".** Passing it required knowing that `/admin`
exists.

Rules that follow:

1. **Visibility is decided by session/role. Parameters decide presentation.**
   A `returnTo` may choose a back-link's label and destination and nothing else.
   If a parameter's presence changes what data is disclosed, that is the bug.
2. **Gate on the WEAKEST sufficient identity, not the strongest.** This one is
   any signed-in user, not admin — `returnTo=/account` is a customer returning
   from order history to a product they bought that has since been archived.
   Requiring admin would have broken a legitimate path and invited someone to
   loosen it again later.
3. **A streaming route needs the check in BOTH `generateMetadata` and the page
   body.** Metadata alone gives the correct 404 for a bare URL, but once a query
   string makes the route stream, the 200 shell commits before metadata
   resolves; only the body check stops content reaching the wire. Fixing the
   obvious half looks complete and is not.
4. **Do not read the parameter where it is not needed.** `generateMetadata` no
   longer destructures `searchParams` at all, so the disclosure decision cannot
   accidentally depend on one again.

When this class is found, sweep for siblings rather than fixing the instance:
every route reading a query parameter without a session/cron guard, OAuth
callbacks that read `code`/`state` before authenticating, and list endpoints
where a status filter from the query could widen rather than narrow a visibility
allowlist (AND it with the allowlist, never replace it).

### Abuse controls are layered

Netlify Edge provides broad per-IP `/api/*` limiting before Next runs.
Sensitive public routes also use distributed Supabase counters and tighter
route-specific windows. The shared limiter fails closed if its backend is
unavailable, and stale counter rows are cleaned probabilistically.

Public mutations stay behind validated app routes. Direct public execution of
subscriber RPCs is revoked by the security migration. Admin/service-role
operations remain server-only.

### Headers are defense in depth

CSP, frame blocking, HSTS, referrer, permissions, nosniff, and cross-domain
policy are defined in Next and Netlify. Development-only CSP allowances must
not enter production.

No secret values are documented or committed. Netlify owns current operating
environment values; local `.env.local` is not authoritative.

### Security remediation must preserve a working supported toolchain

Production dependency safety is measured with the deployed tree and
`npm audit --omit=dev`, then verified by tests, lint, and a complete production
build. A full-audit finding in development-only lint tooling is still tracked,
but an audit tool's forced major downgrade/upgrade must not replace a supported
toolchain with one that fails at startup.

As of 2026-07-27, production uses patched Next.js, PostCSS, and Sharp versions
and audits cleanly. Stable `eslint-config-next` still bundles React lint plugins
that reject ESLint 10, so the working ESLint 9 line remains until upstream
stable compatibility lands.

## Testing

### A test must be able to fail; check that it can

The recurring defect in this codebase is not a wrong assertion — it is a
**missing** one, and the missing one is almost always the check that felt
redundant. Three instances found on 2026-08-08 alone, none of which any passing
run would ever have revealed.

**Upper bounds pin nothing on their own.** Nine assertions of the form
`expect(imagesIn(batch)).toBeLessThanOrEqual(30)` were satisfied perfectly by a
chunker emitting one product per batch. The cap was pinned; the packing was not.
Where a function is supposed to *fill* something, assert the fill: for every
batch but the last, pulling in the next item must have overflowed a limit. See
`expectSaturated()` in `src/lib/__tests__/deepfield-batching.test.ts`.

**Split mechanism from policy.** Tests that verify a *rule* derive their
boundaries from the constants (`MIN - 0.1`), so retuning re-baselines them.
Exactly one test — the policy test — states the bare numbers, because that is
the product contract rather than our tuning. When a limit changes, one test
should object and the rest should stay quiet. If a retune breaks five tests,
four of them were asserting the wrong thing.

**Green is not correct.** Deep Field ran 75 passing test files over a build that
did not compile. A suite that can only confirm is not evidence.

### A duplicated-constant defect can only be caught by reading the source

When a constant's value is also written as a literal somewhere else — most often
in the user-facing message beside the check — **no behavioural assertion can
detect it**, because while the two agree the interpolated and hardcoded strings
are byte-identical. Asserting the returned message equals
`` `Video must be at least ${MIN} seconds long.` `` passes on the buggy code.
Verified: reverting the source to a literal with `MIN` untouched left all 8
tests green.

Reading the source is the only thing that distinguishes *derived* from
*coincidentally equal*. See the commented test in
`src/lib/__tests__/product-video.test.ts`, which greps the three limit messages
and requires each to interpolate its constant.

Two rules for writing that kind of guard:

1. **Match the constant anywhere inside the interpolation**, not adjacent to
   `${`. The size message wraps its constant in `Math.round(... / (1024*1024))`,
   and a stricter pattern fails on correct code. A guard that false-alarms gets
   deleted by whoever hits it next, so false-alarm-proofing is a durability
   property, not politeness. (Deep Field hit this on all three of theirs.)
2. **Mutate one thing at a time.** This hole hid for a full review cycle because
   the mutation used to "prove" the test changed the constant *and* the message
   together — which does fail, so it looked verified. One mutation testing two
   things at once proves neither independently. Generalises to any check whose
   setup moves more than one variable.

A related class is worth naming but not auto-fixing: **UI that asserts a rule
nothing enforces** (Deep Field found `{n}/20 photos` displayed with no 20 cap in
code). It presents identically to a drifted constant — the number shown is not
the number that binds — but the fix is a product decision about whether the cap
should exist, not a code change. File it; do not invent a limit to make a label
true.

## Email Deliverability

### A bounce is ground truth; a "did you mean?" guess is not

`/api/webhooks/resend` handles TRANSACTIONAL bounces, not just campaign ones. It
previously returned early on any event without a `campaign_id`, which silently
discarded every bounced order receipt and inquiry confirmation — a buyer could
mistype their address at checkout and nobody would ever learn the receipt failed.
The campaign-id gate now applies only to campaign analytics.

⛔ **Only a CONFIRMED transient bounce is spared from suppression.** `unknown`
still suppresses. The route used to suppress on any bounce, and weakening that
would leave dead addresses on the list — which costs sending reputation on the
ONE verified domain that also carries order receipts. Losing a subscriber to an
unparsed payload is the cheaper mistake. `Transient`/`MailboxFull` is the case
that must NOT suppress: it says nothing about whether the address is valid.

⛔ **Notifications are transactional-only.** Campaign bounces are handled by
suppression; one notification per bounce would bury the message center.

⛔ **Do NOT add an edit-distance "did you mean?" check on email domains.**
`ymail.com` is a real Yahoo domain one character from `gmail.com` — the naive
version flags a paying customer's correct address. A bounce tells you the address
actually failed; a spell-check only tells you it looks unusual.

### The Resend webhook endpoint

Registered at `https://naplesestatejewelry.com/api/webhooks/resend`. It ran on
`.co` until 2026-08-23 and worked, because the `netlify.toml` `/api/*` carve-out
is a **200 rewrite** — but that made the rewrite silently load-bearing, since a
plain 301 does not replay a POST body. Keep the webhook on `.com`.

⛔ **Change it with "Edit endpoint" ONLY.** "Duplicate webhook", "Delete", and
"Rotate signing secret" all mint a NEW signing secret, and every event 401s until
Netlify's `PROVIDER_WEBHOOK_SECRET` is updated to match. Verify an edit was
in-place by confirming the webhook id and CREATED date did not change.

⚠️ **Verify by replaying a `Transient` bounce, never a `Permanent` one** — the
transient path writes nothing, so it proves reachability and signature validity
with no side effects.

## Compliance And Marketing

Account registration records policy acceptance. Newsletter subscribers are
explicit opt-in; account holders are an opt-out marketing audience. Campaign
sends require an admin check, configured physical address, unsubscribe
handling, and Resend event recording.

The legal pages provide an operational baseline, not legal advice. Owner/counsel
review remains required. New non-essential tracking requires a real consent
preference update before deployment.

## UI Conventions

### --color-primary is the light-surface gold; #f2ca50 is its on-dark counterpart

`--color-primary` is **#735c00**. On light surfaces it passes comfortably
(5.26–6.44:1 across `/free-evaluation`). On a dark hero it does **not** — the
"100% Free — No Obligation" eyebrow measured **2.96:1** on #0e0f0f, below AA at
any size, and read as a dimmed control rather than an accent.

Use **#f2ca50** for gold text, borders and accents on dark surfaces (12:1 on
#0e0f0f). That is what the `/free-evaluation` hero kicker, metal terms and trust
chips already use, so it is a consistency win as well as a contrast one. The
same trap produced the earlier `.gold-button` primary-CTA fix on this page.

When adding gold to a dark section, check the computed contrast rather than
assuming the token is safe — the token is correct, it is just scoped to light.

### Centre wrap groups of repeated small items; leave prose-anchored rows alone

A row of **pills / chips** — three or more small repeated items that wrap — gets
`justify-center` at the widths where it actually wraps, and returns to
`justify-start` at the breakpoint where its container becomes a left-aligned
column (`lg` on `/free-evaluation`). A ragged tail (2 / 1 / 1) reads as a bug;
a centred stack reads as deliberate.

This does **not** extend to:

- **Hero CTA rows of one or two buttons** that sit under left-aligned prose.
  They fit on one line at 375px, so there is nothing ragged to fix, and
  centring detaches them from the copy they belong to.
- **Chips inside cards or prose columns** (shop cards, product detail,
  related products). Those inherit the card's left edge on purpose.
- **Footer link grids.** A short last column is correct list behaviour.

⚠️ **Do not audit this with a `display: flex` scan.** The homepage hero's
Buy / Sell / Trade group carries flex classes in the markup but `.home-hero-actions`
overrides it to `display: grid` at `144px 144px`; a flex-only sweep reports the
page clean while missing it entirely. Measure per-row left/right padding against
the container and flag rows where the two differ.

There is exactly one password input in the customer-facing app
(`components/account/PasswordInput.tsx`, over the `.password-field` utility
in `globals.css`). Never hand-roll another — a source guard in
`password-input.test.ts` fails the suite if any file outside that component
declares `type="password"`.

This rule exists because the account area had drifted into three different
treatments across seven fields before 2026-08-02: an eye toggle on sign-in, a
text "Show/Hide" button in a bordered segment on sign-up and reset-password
(which also rendered a differently sized input than the email field beside
it), and no toggle whatsoever on the dashboard's Change Password panel.

The component owns the details that are easy to get wrong: right padding so
long values never slide under the button, `::-ms-reveal` suppression so Edge
does not render a second eye, a 36px tap target centred in the field, a
focus-visible ring, `aria-pressed` for state (never a static label claiming
the password is shown), `aria-controls` paired with a `useId()` fallback so
it is never dangling, and a distinct `confirm` label so two adjacent toggles
do not both announce "Show password". Pass `isEs` for Spanish.

Exception: admin token fields (Instagram/Facebook settings) keep plain
`type="password"` and are allow-listed in the guard — those are pasted API
secrets, not user passwords, and intentionally offer no reveal control.

### Admin editing surfaces open in pop-up windows, never inline

Owner rule (2026-08-01): when an admin action needs its own working area — a
crop editor, a generated preview, any focused edit flow — it opens in a modal
dialog OVER the page (`components/admin/AdminModal.tsx`: dimmed backdrop,
title bar, ✕, Escape, click-outside). It must never expand new space inline
under the trigger, which shoves the rest of the page around. Companion pattern
for collections: thumbnails are selection targets carrying badges only, and a
single toolbar acts on the selected item — per-item button clusters do not
scale visually (a 3×2 pad under 96px thumbnails shattered into text fragments
at moderate widths and was scrapped the same day it shipped).

Prepared social-post thumbnails are the one collection exception that opens a
focused viewer: `PreparedSlideViewer` presents their final, ordered upload
one-at-a-time in the same AdminModal frame. It has visible previous/next
controls plus left/right keyboard support, and disables the unavailable end
instead of wrapping because final slide order is a review detail. Both social
panels use this one component so the review behavior cannot drift. Destructive
social actions use the shared outlined-button geometry and motion with a red
hover/focus treatment; bare red text looked unrelated to the rest of the action
row and provided no hover affordance.

### Mobile admin accounts prioritize the Admin Panel entry

For authenticated administrators only, the account dashboard's Admin Panel
access card appears immediately after the account tabs and before Account
Overview at 700px and below. From 701px upward, it stays in the established
right side rail. Both placements render the same localized card component and
must be mutually exclusive so there is exactly one visible admin entry. Regular
customer accounts do not render either placement.

### Admin Products consumes surplus width only on wide desktops

The inventory table keeps its established fixed 1680/1960px minimums and
horizontal-scrolling behavior below 2100px. At 2100px and above, when the
scroll viewport can exceed the table's normal width, the inline table fills
the available space instead of leaving a white strip after the action column.
Brand gets first claim on that surplus through a fluid 150-220px target; the
browser's automatic table layout distributes the remainder across the other
flexible columns. Do not broaden this rule to laptop, tablet, mobile-fullscreen,
or narrower desktop layouts.

### Ultra-wide expansion is opt-in by canvas, not a global max-width override

At 2000px and above, large application and grid canvases may expand through
one of three shared tiers: 1600px (medium), 1800px (standard), or 2200px (wide),
always retaining 3rem outer gutters. This covers the storefront, product
detail, account dashboard, admin data surfaces, marketplace managers, public
service/sell grids, and footer without making every centered element wider.

**Pick the tier from what the canvas CONTAINS, not from how much room exists.**
A canvas holding a fixed-aspect element converts width into height, so the widest
tier is not automatically the best one. Product detail is the worked example: its
square gallery sits in a 50/50 grid, so on the wide tier a 1036px column became a
1120px-tall photo and the owner reported it as too big. It uses
**`ultrawide-page-medium`** as of 2026-08-14 (gallery capped at 736px); see *"The
product page fills the space under the photo"* rule 4, which had to change with
it. Grid and table canvases, which absorb width without gaining height, remain
the right fit for the wide tier.

⚠️ **A page's tier lives on every wrapper in that band, so change them
together.** The product page has two (`/shop/[id]` back-link bar and the main
band); leaving one behind detaches the back link from the gallery's left edge.

Do not globally override Tailwind `max-w-*` classes. Long-form legal/FAQ prose,
auth forms, checkout steps, modals, and focused sequential content depend on
their narrower measure for readability and task clarity. New large canvases
must explicitly choose a tier; the source guard enforces this for the standard
large-width tokens.

### Product-summary specifications wrap as one group

In the product-detail eyebrow, availability is a status badge while
metal/purity and length are product specifications. The specifications remain
in one no-wrap group. If the full row lacks room, that complete group moves
beneath the badge; never allow length alone to become an orphaned second line.
This content-aware flex grouping is preferred over a viewport breakpoint
because Spanish labels and the tablet two-column layout need different amounts
of space.

### A dark product page themes the PAGE, and light cards opt back out

A product whose first photo is shot on black renders a dark variant: `<main>`
gets `.product-page-dark` plus inline overrides of `--color-on-surface`,
`--color-on-surface-variant`, `--color-primary` and `--color-outline-variant`.
Every product page therefore exists in two versions, and both must be checked.

The rule that keeps them correct: **the dark palette applies to content sitting
on the dark page, never to a surface that paints its own light background.**
Anything with a light background of its own carries `product-light-surface`,
which restores the four tokens from the `--color-*-light` aliases captured on
`:root`. Today that is the related-product cards and the review cards; both were
rendering near-white text on a white card at 1.12:1 before 2026-08-04.

Two supporting rules:

- The light aliases are declared as `var()` of the real tokens on `:root`, not
  as repeated hexes, so `@theme` stays the single source. They resolve against
  `:root`, so a descendant override of the real token cannot reach them.
- Fix theme contrast in CSS via the token layer, not by hardcoding colours in a
  component — those components are shared with the light-theme page and the
  homepage, where they were already correct.

Verify by measurement, not by eye: audit computed contrast for every text node
under `<main>` on BOTH a light-backdrop and a black-backdrop product, in both
locales. Two traps when writing that audit — `color(srgb …)` values are 0-1
floats rather than 0-255, and text over a CSS gradient cannot be judged from
`backgroundColor` and must be skipped instead of reported.

### The product gallery has no magnifier, and its arrows only navigate

Owner decision 2026-08-04: the hover/touch magnifier is removed at every
viewport. Full-size viewing is the lightbox, opened by clicking the main photo.
Do not reintroduce a magnifier without also restoring what it required — an edge
dead-zone so the prev/next buttons stay usable, and `touch-action: none` on the
frame, which is what stopped a vertical swipe starting on the photo from
scrolling the page.

An edge arrow must navigate and do nothing else. The arrow sits on top of the
frame that opens the lightbox, so the button stops propagation itself
(`handleEdgeNavigation`) AND `openLightbox` ignores any click inside
`.product-gallery-edge-button`. That guard must test `instanceof Element`, never
`instanceof HTMLElement`: the visible chevron is an inline SVG and an SVGElement
fails the HTMLElement test, which is exactly how clicking the arrow used to open
the lightbox. Stopping propagation on `pointerdown` alone does not help either —
`click` is a separate event that still bubbles.

**The arrow is drawn as a full-height bar, and the bar IS the hit area** (owner
request 2026-08-04). It previously drew a 44px circle inside a much larger
invisible hit area, so the control looked far smaller than it was. Keep visual
and hit area identical — that is the whole point.

Four rules for the bar, all from owner feedback (2026-08-04/05):

1. **Flat scrim, hairline inner edge — never a fade.** A gradient dissolving
   toward the centre leaves the strip with no visible end, so nothing says where
   the clickable area stops.
2. **Narrow and against the edge**: `clamp(2.75rem, 11%, 4.25rem)`, i.e. 63px on
   a 576px frame and 44px (the tap-target floor) on a phone. At the original 28%
   a click aimed at the piece, expecting the lightbox, landed on the bar. The
   centre 15%–85% of the frame must stay the lightbox's.
3. **The scrim must not depend on knowing what is behind it** (2026-08-05). It
   is ONE treatment that moves the backdrop both ways at once —
   `backdrop-filter: brightness(0.82)` darkens light content while
   `rgba(255,255,255,0.16)` lifts dark content — with a white, dark-haloed
   chevron for the same reason.

   Do NOT reintroduce a light/dark scrim pair chosen from the frame's padding
   colour. That was the first design and it failed from the second photo on: the
   bar sits over the PHOTO, and the padding and the photo routinely disagree. A
   black-padded frame carrying a cream photo picked a white scrim, which vanished
   over the photo and survived only in the padding bands — indistinguishable from
   the photo being painted on top of the panel.

   The blur is load-bearing too: softening what is behind the strip is what makes
   it read as an overlay rather than part of the photo.
4. **The bars are the top layer inside the frame** (`z-index: 30`), above both
   gallery images, the cross-fade layer, and the video iframe.
5. **The bars exist from 768px only** (owner decision 2026-08-05). Below that a
   swipe replaces them: a phone frame is ~344px wide and two 44px bars claim a
   quarter of it permanently, while a swipe costs no space. Tablet and desktop
   keep both. This is a WIDTH query, not `(hover: none)`, so a desktop window
   narrowed past 768px behaves like the mobile layout it is displaying.

Swiping the main image changes photo on touch pointers only — a mouse drag stays
a plain click, leaving the lightbox, text selection and the proximity reveal
alone. Rules that keep the gesture honest:

- `touch-action: pan-y pinch-zoom` on the frame. `none` would also take vertical
  scrolling and pinch-zoom; `auto` would let the browser consume the horizontal
  drag before the handler sees it.
- Commit to "this is a swipe" only when the drag is both >10px sideways and more
  sideways than vertical, so a page scroll that starts on the photo still
  scrolls.
- ANY drag over ~10px suppresses the click that follows, not just a committed
  horizontal one. Browsers usually swallow that click once a touch becomes a
  scroll, but testing showed a vertical drag opening the lightbox when the code
  depended on it.

Each bar reveals independently, and the reveal is PROXIMITY-based, not a plain
hover (owner request 2026-08-04): the gallery tracks the pointer across the
frame and writes `--edge-prev-reveal` / `--edge-next-reveal`, which each bar
reads. The ramp runs 28% of the frame width inward from the bar's inner edge on
a smoothstep curve, reaching 1 when the pointer is over the bar.

**The reveal ramp and the clickable area are separate on purpose.** Widening the
button to match the ramp would bring back the mis-click the narrow bar was
introduced to fix; the bar advertises itself from a distance without growing.

The tracking is mouse-only — an inline reveal value would permanently override
the `(hover: none)` treatment after a single tap — and the `:hover` rule stays as
the pre-hydration/no-JS fallback.

Because the reveal is hover-based, `(hover: none)` shows the bars permanently —
otherwise the affordance is invisible on touch, where it matters most.

### Product-detail thumbnail rails keep the active-next pair visible

The page gallery and full-screen lightbox share one circular thumbnail-track
behavior. Selecting or advancing media centers the active thumbnail together
with its logical next thumbnail, so controls never advance into an offscreen
selection. Two accessibility-hidden edge clones on each side provide a visible
last-to-first/first-to-last transition; after the transition, the rail resets
without animation to the matching original. Real thumbnails remain the only
focusable/announced choices. Preserve keyboard arrows, touch scrolling,
reduced-motion behavior, resize correction, localized labels, and no
document-level overflow from 320px upward. Rail widths and scroll offsets snap
to complete card-and-gap increments: partial thumbnail cards must not appear at
either viewport edge when motion settles. Navigation uses a controlled eased
requestAnimationFrame flow instead of relying on browser-native smooth scroll,
which was being interrupted by resize normalization and appeared as an instant
swap. Resize correction must not run during active motion; rapid navigation
continues from the live offset. Circular edge-clone normalization happens only
after animation completion, while reduced-motion preference keeps immediate
positioning.

### Shop is a direct nav link with no submenu

Owner decision 2026-08-01: the header's Shop control links straight to
`/shop` at every viewport — no dropdown on desktop, no accordion in the
mobile menu. The auctions page that used to live in that submenu is retired
(`/auctions` 301s to `/shop`), and both aspirational legal pages were
retired with it the same evening: `/auction-terms` and `/vendor-terms`
(each 301s to `/terms`). The legal set is now the six real policies only.
Do not reintroduce a Shop submenu or any retired page without an owner
request; Sell and About keep their dropdown/accordion pattern.

### Thin-mobile headers preserve the brand and primary actions

From 320px upward, the public header must keep the full
`Naples Estate Jewelry` label (owner dropped the domain suffix from the
header wordmark 2026-08-01) plus the language, call, cart, and menu
controls visible without horizontal overflow. Below 400px, compact
micro-spacing and fluid brand typography are preferred over truncating the
brand or hiding a primary action. Below 350px, proportionally reduce the visible
call/cart controls, glyph/count badge, and outlined menu while keeping every
action present and usable; regular mobile/tablet sizes remain unchanged.

### iOS format detection stays off; tappable numbers are explicit anchors

Root-layout metadata disables telephone/date/address/email format detection
site-wide: iOS Safari's auto-linking rewrites server-rendered text before
hydration and caused real iPad hydration failures (confirmed live
2026-07-31). Consequently, any visible phone number that should be tappable
must be written as an explicit `<a href="tel:...">` — never rely on browser
auto-detection. Do not remove the `formatDetection` metadata.

### Live-spot surfaces are tap-to-refresh via SpotRefreshPill

Spot-price displays (shop badges, mobile spot row, product "Based on spot"
box) share `SpotRefreshPill`: tapping runs `router.refresh()` so the pill
and every server-rendered price update together, confirmed by a portaled,
timestamped note (portal to document.body is required — sidebar reveal
animations create stacking contexts that clip in-place tooltips). The pill
root must remain a DIV with an inner stretched button because shop CSS
targets `.shop-search-spot-row > div:nth-child(...)` for layout. Product
pages' ticker shows "Last updated <time> · Updates in <m:ss> · <time>" in
pinned America/New_York time. That complete sequence is a single no-wrap unit:
use fluid 8-9.92px label type and compact tracking so English and Spanish both
remain intact from 320px upward and in the narrow tablet product column; do not
truncate or hide any timestamp. The Weight spec shows only the written-out
localized total ("N grams total" / "N gramos en total").

Customer text actions use one left-to-right underline reveal for hover and
keyboard focus, with reduced-motion support. Persistent content underlines and
selected indicators remain unchanged.

Customer page-reveal animations must never gate the visibility of a product
page on offscreen or lazy-loaded gallery thumbnails. The shared reveal ignores
lazy images and has a short fallback, so primary content remains visible even
if a non-lazy media resource stalls; deferred media may load afterward. The
pending→visible commit must also never depend solely on
`requestAnimationFrame`: hidden documents (background tabs, prerendering,
non-compositing webviews) suspend frames indefinitely while pending content
blocks pointer events, so the reveal commits immediately when
`document.visibilityState` is `hidden` and keeps a bounded timeout backstop
while visible.

When a buyer opens a product from the shop, preserve the exact localized shop
URL and vertical position in tab-scoped session storage. Back to Shop restores
that recorded context only for the same product and shop URL; direct product
entries retain the ordinary `/shop` fallback. This avoids polluting shareable
product URLs with transient navigation state.

Desktop interactive controls should expose a small, consistent hover lift or
color/background reaction plus press feedback. Mobile-only controls are not
part of the desktop affordance audit unless a future mobile pass is requested.

Admin Products does not display separate Total, Available, or Sold summary
cards. Keep the page focused on the inventory table, filters, and row actions;
this applies consistently across desktop, tablet, and mobile layouts.

The Admin Products shell is a fixed dynamic-viewport flex layout. Page-level
scroll is suppressed so the product table wrapper owns the inventory scroll;
this keeps the header and controls static across viewport sizes.

Async actions show immediate press feedback plus a durable loading/success/error
state. Financial summaries always show cents. Empty or inapplicable customer
fields are omitted rather than rendered as blank labels.

### Social queues stay channel-specific inside one owner dashboard

Instagram and Facebook retain separate persisted queues and independent
scheduled order; a combined sort would imply ordering guarantees that do not
exist across channels. The Admin **Social Queues** dashboard presents both
sections on one route, selects only the row/product fields needed for display,
and provides the narrow queue mutations the owner needs: edit the prepared post,
publish it immediately, change its time, or remove it while retaining prepared
copy. **Post now** is available only for a ready post on a connected channel and
always crosses a confirmation boundary that names the channel, says the
reservation will be bypassed, and repeats Instagram's irreversible edit/delete
limitation. It must use the same receipt-safe publish state machine as the
manager page; the dashboard never implements a second publishing path. Once
confirmed, this work belongs to a provider mounted at the locale layout so it
survives ordinary client-side navigation instead of trapping the owner in a
modal. Only one social publish may run in the tab at a time. Success auto-clears
after a short notification; failure stays visible and retry is allowed because
the underlying Instagram/Facebook state machines are receipt/checkpoint safe.
Hard reloads or closing the tab are not presented as durable job persistence.

Bulk immediate publishing is channel-specific. The owner manually selects ready
rows inside either Instagram or Facebook and crosses one confirmation boundary
that lists the selected posts. The provider then calls the existing receipt-safe
single-post state machine sequentially in the dashboard's visible queue order;
there is no bulk provider endpoint or parallel public write. The first failure
stops the batch. Retry resumes at that failed item, using the completed count so
already published entries are never intentionally repeated. A running individual
post or batch retains the one-task-per-tab lock.

Recent published-post management stays receipt-led and channel-honest. The
dashboard reads only the 12 newest rows still marked `published` per channel and
opens them in one **Latest Posts** modal. View links and local manager links are
non-mutating. Refresh delegates to the existing conservative remote check.
Owner-written comments require a second compose-and-submit step, use each
channel's existing authenticated comment client, store no comment body locally,
and write only an audit outcome. Facebook Remove delegates to its existing
remote-delete path behind a permanent-action confirmation. Instagram must never
pretend API deletion exists: it opens the live post for manual removal and asks
the owner to return and refresh status. No latest-post action gets a parallel
provider implementation inside the dashboard.

The two channel histories are independent disclosures inside that modal. Both
load expanded so the first opening reveals the available posts, but clicking an
Instagram or Facebook header collapses that channel's complete body to a compact
header with its current visible count. The header itself is the accessible
button (`aria-expanded` plus `aria-controls`); no separate small toggle target
is used. Disclosure state belongs to the mounted modal and survives its internal
comment/removal confirmation views, but intentionally resets when the modal is
closed and reopened.

That jump carries only the fixed `returnTo=social-queues` sentinel, never an
arbitrary return URL. The shared manager derives the destination and label from
that allowlisted value, preserves it across marketplace tabs, and otherwise
falls back to Products. This gives the owner a reliable round trip without
introducing an open-redirect surface or changing direct manager navigation.

### Social posting uses seven explicit Eastern reservations

The only schedulable times are **noon, 2 PM, 4 PM, 6 PM, 8 PM, 10 PM, and
midnight** in `America/New_York`. The UI exposes a date plus that seven-value select rather
than a free-form datetime control, and the queue API independently enforces the
same allowlist. Midnight means the end of the selected calendar date. The next
valid slot is the default, so the common path requires no time calculation.

`scheduled_for` is the intended posting time and `queued_at` remains the audit
timestamp for the owner's original approval. Rescheduling changes only
`scheduled_for`. Queue dashboards and workers order by `scheduled_for`, then
`queued_at` for deterministic ties. Removing a reservation clears both queue
timestamps but preserves the prepared caption and renditions.

Netlify cron expressions use the union of UTC hours needed to cover all seven
Eastern slots in both EDT and EST. This deliberately creates harmless extra
invocations around daylight-saving changes; the database due-row predicate
(`scheduled_for <= now()`) is the authority and prevents early publication.
There is no owner-configured daily post cap. Each worker invocation processes a
bounded batch of at most 25 due rows to protect its runtime, and a later
invocation continues any remainder. A transient failure, disconnected channel,
or Instagram's provider-enforced 100-per-rolling-24-hour quota can delay a post,
but nothing may publish before its reservation. Existing queued rows are
backfilled to future allowed slots rather than becoming due immediately.

A non-null `queued_at` plus a valid `scheduled_for` is the admin approval
boundary. Because `queueProduct`
uses `pending` to mark that queued prepared state while ordinary preparation
uses `review`, scheduled drips must select both states and still rely on
`runPublishStep` to fail closed when caption/renditions are absent. Selecting
only `review` leaves valid queued posts permanently stranded.

### Social card instructions name slide 1 explicitly

The CARD badge selects the source photo for the generated advertising card; it
does not mark a photo that will appear later in the carousel. Owner-facing setup
copy must say that Save & prepare creates the final card **as slide 1** and that
this finished first slide is reviewed before publishing. Avoid relative wording
such as “review it next,” which can be read as carousel order.

## Staging handoff is a file copy, separate from deployment (2026-09-10)

The established handoff directory is `C:\Users\rcman\NEJ-repo-staging`. The owner
explicitly requires the existing structure and unaffected files to stay unchanged:
update only the files that need updating, never replace the handoff with a new
layout or perform an indiscriminate rebuild. Preserve the secret/build exclusions
and required hidden configuration. Dry-run/review the named changes before copying.
Source/staging hash equality and absence of `.env*` prove copy properties only;
they do not prove the contents are secret-free or that Netlify will accept a deploy.
Do not disable secret scanning to work around an unresolved alert.

After the 2026-09-10 Netlify failure, the owner stopped this agent's repair and
assigned it to another agent. This task may update closing docs only; no further
staging, code, configuration, account or deployment action. The owner handles the
separate repo workflow; no Git commands are permitted in this source folder.
