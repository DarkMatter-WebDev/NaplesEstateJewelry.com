# Current Status

> Present-state snapshot for session startup. Historical implementation detail
> lives in `CHANGELOG.md`; open work lives in `TASKS.md`; durable rationale lives
> in `DECISIONS.md`. Last reconciled: **2026-09-20**.

## Start Here (2026-09-15 — SUPERSEDES the blocks below)

**Read this, then `TASKS.md`.**

🟡 **09-20 (10) — READY TO PUSH with (9): iOS no longer auto-zooms on ANY field**
— one sitewide 16px rule for touch screens in `globals.css` (desktop keeps
14px); measured on dev, gate 1536/1536. iPhone check after the push is the
proof. `CHANGELOG.md` 2026-09-20 (10).

🟡 **09-20 (9) — READY TO PUSH: photo cap is 10 on BOTH lead forms** (was 6 on
`/contact`, 10 on `/free-evaluation`, both silent — owner's phone test). Shared
`LEAD_PHOTO_MAX`, "up to 10 photos" on the pickers, red warning past 10.
Dev-tested, gate green, STAGED. `CHANGELOG.md` 2026-09-20 (9).

🟢 **09-20 (7) — DEPLOYED + production-verified 09-20 evening: the phone contact
bar no longer shows on desktop** (an unlayered `display: flex` had beaten
`md:hidden`; fix in `globals.css` + component + test). All 46 bar pages + 11
no-bar pages as expected, live stylesheet correct, 15 rendered loads `display:
none` at 2560 px. 🟢 Same session: **the lead-form photo fix is PROVEN on
production** — 5 photos, 9.58 MB shrunk to 0.80 MB in the browser, HTTP 200,
five `.webp` objects in Storage. `CHANGELOG.md` 2026-09-20 (7).

🟡 **09-20 (2) — PUSHED by the owner 09-20 evening; photo fix since proven on
production by Claude; owner's iPhone run + phone look still open (no SQL, no env
vars): the lead-form photo fix and the phone contact bar.**
- Photos are shrunk in the browser to fit Netlify's 6 MB request cap and stored
  as WebP (dev: 24.5 MB → 0.79 MB; 10 photos 61.5 MB → 0.56 MB; too-large path
  shows a plain message). After the push: **owner submits the free-evaluation
  form from the iPhone with 4+ camera-roll photos** — that is the production
  proof (a dev server has no cap). It creates one real test lead.
- Phone contact bar Call · Text · Directions on the seller pages only, mounted
  from the layout — no ranking page file edited; built-HTML diff of 14 ranking
  pages: title, description, canonical, H1, JSON-LD, hreflang and visible text
  IDENTICAL.
- 09-20 (3), same batch: the owner said yes → the `/bullion` hero button pair
  and the five real Text links (`components/cta/TextUsLink.tsx`; existing
  wording and call links untouched) are BUILT + STAGED too. Gold / silver /
  estate-jewelry / sell pages byte-identical; nothing removed anywhere. Gate
  tsc 0 · lint 0 · 1522/1522 · build 0. `CHANGELOG.md` 2026-09-20 (2) + (3).
- 🟢 **Google Ads account CREATED 09-20: 321-137-8976, under
  info@naplesestatejewelry.com**, made through Business Manager (the route that
  avoids the Smart funnel and the 404). Business Profile + Merchant Center
  linked automatically; call reporting on; auto-apply off; 0 campaigns; no
  payment method → it cannot spend. Research done; proposal
  https://claude.ai/artifact/J7KQwYDbLyiEu8X8opQM4t **APPROVED by the owner
  09-20: $13/day, wording as written, Spanish included.** 🟢 **Campaign "NEJ
  Sellers - Search" (ID 24265714239) is fully BUILT and now LIVE** — five ad
  groups (Gold, Silver and Flatware, Estate and Inherited Jewelry, Spanish;
  Coins and Bullion paused on its own until the site push), 55 negatives,
  sitelinks, callouts, call asset 9–6, Business Profile location asset; Search
  Network only, presence-only Collier + Bonita Springs + Estero, EN + ES,
  7 AM–9 PM, Maximize clicks $6.00 cap, $13.00/day, every AI/auto option off.
  The earlier save failures were a missing PASSKEY on the info@ login (Admin →
  Access and security → Security tasks); the owner created it and saves worked
  at once. 🟢 **LIVE since 09-20 ~4:19 PM ET** — owner added billing and said
  "go"; campaign Enabled at $13.00/day, "Pending" while Google reviews the ads;
  Coins and Bullion enabled the same evening after the owner's site push;
  auto-tagging off, six sitelinks; owner accepted the Click-to-Call terms 09-20
  (the orange "new terms soon" banner is an announcement — nothing left to do). Weekly reports 09-27 ·
  10-04 · 10-11 · 10-18. `TASKS.md` top · `CHANGELOG.md` 2026-09-20 (4)–(6). The old
  shell 238-352-7909 (info@surettesystems.com) is abandoned.

🟡 **09-20 — Google Ads plan APPROVED in its lean form; four seller-contact
helpers started.** (Superseded in part by the block above: two of the four are
now built.)
- Rules (`DECISIONS.md` top entry): NO tracking tag (owner does not want ad
  tracking), ads land on the existing pages UNTOUCHED, goal = any seller
  contact (walk-ins lead), organic visibility is the overriding rule, small
  isolated deploys are fine now.
- 🔴 **Finding, not yet confirmed on production:** the lead forms post photos
  raw in one request (up to 10 × 15 MB) while Netlify caps a request at 6 MB
  (~4.5 MB of photos). Every photo submission that ever succeeded totalled
  under 1.5 MB. Two or three iPhone photos probably fail. Owner's call: allow
  the harmless production probe, test from the iPhone, or go straight to the
  fix. `CHANGELOG.md` 2026-09-20.
- Built: `src/lib/contact-links.ts` + test (not yet used by any page).
- ◻ Owner: pick from the mockups —
  https://claude.ai/artifact/YTKAs3Se2wzvUiPZV928TG (phone bar A or B,
  `/bullion` buttons, the five Text-link spots).
- ◻ Owner: create the Google Ads account (Expert Mode, no campaign). Then the
  keyword research and the proposal. Plan file:
  `C:\Users\rcman\.claude\plans\wondrous-twirling-bunny.md`; steps in `TASKS.md` top.

🟢 **09-19 — citation look-back (read-only, no code): Apple Maps and BBB are
both live and match the citation standard.** Apple's review passed (hours
Mon–Fri 11–3 · Sat 11–4 · Sun closed, buyer-first About, the untrue
delivery/curbside/appointment items gone). The BBB profile is published
(name, address, phone, website correct; "Not Rated — under 6 months", Gold
Buyers only; optional owner claim). `CHANGELOG.md` 2026-09-19. Nothing is
staged; next dated reads: GSC validations ~09-20, Instagram token row Mon
09-21 after 12:15Z.

🟢 **09-18 (2) — DEPLOYED + live-verified: Text Deals admin gets "Reopen — edit & resend" (clones a sold deal into a new draft with the photo + price and a "back available" message), a real "Choose photo" button, and "Delete deal" (never mid-send; shared photos kept). `CHANGELOG.md` 2026-09-18 (2).**

🟢 **09-18 — DEPLOYED + live-verified (buyer MMS delivered): Mark sold texts the buyer
("It's yours…") and tells everyone else who got the deal it's taken** —
picture messages, idempotent per phone, best-effort. Gate tsc 0 · lint 0 ·
1456/1456 · build 0. After the push: a fresh TEST deal end to end.
`CHANGELOG.md` 2026-09-18. The 09-17 logo re-test PASSED (confirmation
now arrives as an MMS).

🔴 **09-17 — Twilio toll-free registration APPROVED (Sep 17). BLOCKER found
before the first text: the four text-alert tables (`text_deals`,
`text_deal_sends`, `text_inbound`, `text_system_messages`) have no
`service_role` grant → every server path would fail "permission denied" on
first use. Owner runs `supabase/text-alerts-service-role-grant-2026-09.sql`
once, then Resend YES on the personal cell (the 09-16 confirmations were
stamped sent but the carrier refused the unverified number) and the test
plan in `TASKS.md`. Live gates still 403/403/401.** → ✅ SQL run + re-probed; **first live text round-trip PASSED 22:45Z** (sign-up → confirmation `delivered` → YES → `confirmed`) and **the full deal loop PASSED 23:08Z** (deal MMS → reply forwarded `1ST` → Mark sold → late-reply auto-reply). 🟢 **Text alerts are LIVE end to end.** 🟢 DEPLOYED + live-verified 09-17 night (all five): **`/order-lookup`** — guests open their order with the order number + the email or phone on it (no account; noindex; rate-limited; public view only), the order emails now link there with the number prefilled and print **NaplesEstateJewelry.com**; the admin order page names the shipping SERVICE bought (Priority / Express / Registered, derived from the fee — `lib/shipping-service.ts`), the `logo2.webp` retired wordmark deleted + its redirect repointed. The iPhone two-thread quirk (SMS vs MMS from the same number) is FIXED + DEPLOYED 09-17: every customer text is now an MMS with the brand picture (one-thread result CONFIRMED 09-18 on the owner's phone). 🟢 **09-18 (3) DEPLOYED + owner-approved on the phone ("looks good", 04:1xZ): the picture is the gold wordmark on navy + "DEALS" as a third line (`text-brand-wordmark-v5.jpg`, 800×400 — a 2:1 canvas the bubble crops to 16:9, artwork on the central 600 px so it stays whole, 22 KB, NEW file name because `/assets/*` is immutable-cached) replacing the square octopus; v1 800×300 went live 03:0xZ and the iPhone bubble cropped its edges, v2 4:3 went live 03:3xZ and showed whole but too tall, v3 5:3 built then shortened again on request, v4 approved on the phone, then DEALS added (mockup C) = v5, YES → whole picture in the short bubble.** Nothing pending on text alerts. `CHANGELOG.md` 2026-09-17 (evening). `CHANGELOG.md` 2026-09-17.

🟡 **09-16 — Twilio toll-free verification still *In review*** (checked in
the console; submitted 09-15 late evening = one business day; Twilio says
allow ~3–5 business days → expect a decision ~09-18 to 09-22). Nothing is
pending on our side, no rejection, no console notification; the email will
land at **info@** (check spam). Details `CHANGELOG.md` 2026-09-16. Still
the only open item.

🟢 **09-16 late night (3) — DEPLOYED + live-verified (column, header box and button render; ticking one row → "Delete 1 Forever"): Orders Recycle
Bin multi-select** — checkbox per row (desktop + phone), select-all in the
header, one "Delete … Forever" button for the selection (confirm first, one
query). Pure helpers + 5 tests in `lib/trash-selection.ts`. Gate tsc 0 ·
lint 0 · 1435/1435 · build 0; admin screen unverified until the owner uses
it. `CHANGELOG.md` 2026-09-16 (late night, 3).

🟢 **09-16 late night (2) — DEPLOYED + live-verified: `/kittcard`**,
the second employee's business-card landing page — identical to `/card`
(one shared `CardLanding` component; the name + number per card live in
`lib/card-holders.ts`, Kitt's entry = Chris's values until his line is
ready). Both pages noindex + off the sitemap → no GSC effect. Gate tsc 0 ·
lint 0 · 1430/1430 · build 0; dev diff shows only the page URL differs.
`CHANGELOG.md` 2026-09-16 (late night, 2). ✅ Owner ran the invoices grant
SQL the same night.

🟢 **09-16 late night — In-Store Sale LIVE and TESTED** (a $1 unlisted Cash sale recorded on production: order paid / picked up / `in_store_cash`, product-less line, automatic receipt row, then moved to the Recycle Bin). ✅ **Both follow-ups closed the same night:** the "Receipt: Not emailed" label fix is DEPLOYED (in the `/kittcard` batch), and the **pre-existing** invoices gap — automatic invoices had NEVER been written because `service_role` had no grant on `invoices` — is fixed: the owner ran `supabase/invoices-service-role-grant-2026-09.sql`, verified 09-16 late night (service role reads `invoices`; `INV-20260916-OFM07` was written automatically at 01:52Z). `CHANGELOG.md` 2026-09-16 (late night). Earlier: DEPLOYED + live-verified (gates 307/401 on production): Admin → In-Store Sale**, a one-screen recorder for showroom
sales — the card is taken on PayPal Zettle (owner decision), the page
records the sale as a paid, picked-up order (listed item by inventory # or
an unlisted piece by description), marks a listed item sold through the
same RPC a web sale uses, and emails the receipt. No SQL, no env vars.
Unlisted items create no product row. Gate tsc 0 · lint 0 · 1428/1428 ·
build 0; auth gates checked on dev; the admin screen itself is unverified
until the owner's first test (`TASKS.md`). `CHANGELOG.md` 2026-09-16 (night).

🟢 **09-16 evening — DEPLOYED + live-verified (#77 → 237, #53 → 1026, SoldOut; in-stock unchanged) and Validate fix STARTED 9/16 on BOTH GSC reports (result email in days to ~2 weeks): the Product schema now
reads the canonical price value, so SOLD product pages carry `price` +
`SoldOut` and the 2 Search Console "Missing field price" errors (Product
snippets + Merchant listings) are fixed for good** — the visible page still
says "Sold"; a page with no numeric price at all emits no Product schema.
New `src/lib/product-ld.ts` + test. Gate tsc 0 · lint 0 · 1421/1421 · build
0; verified on `next start` (#77 → 237, #53 → 1026, /es, in-stock page
unchanged). After the push: I click Validate fix on both GSC reports.
`CHANGELOG.md` 2026-09-16 (evening).

🟢 **09-16 — GSC "Some fixes failed" email = the *Page with redirect*
validation (Failed 9/15). Noise:** every URL is a correct 308 (curl-verified);
a redirect can never validate as "indexed". Never re-validate that reason.
Discovered-not-indexed is now 0. `CHANGELOG.md` 2026-09-16 (GSC).

🟢 **09-15 late night — DEPLOYED (owner pushed + checked production
manually):** Join the List window fields 16px on touch (no iOS focus zoom),
"monthly-ish" + a roomier desktop window, and `/card` has a tinted "Join the
List" tile under its grid (opens the same window) with the card page
tightened so the grid ends on the same line as before. `CHANGELOG.md` 09-15
(late night, 1–3). Only Twilio's toll-free verification is still open.

🟢 **09-15 night, later — STEP 2 DEPLOYED** (SQL run + Vault secret + all
five Netlify variables + push; live: both webhooks 403 unsigned, sweep 401,
admin 401; the number's inbound webhook saved — primary + backup — and
confirmed on the summary). ◻ Left: Twilio's toll-free verification email
→ "verified" → first test with the owner's cell (`TASKS.md` step 5). Nothing
is texted until then. The block below is the build record.

🟡 **09-15 night — STEP 2 BUILT + STAGED (now deployed, see above): Twilio sending
(`lib/text-alerts/`), reply-YES confirmation at sign-up + 15-min sweep,
STOP/HELP recorded (Twilio answers them), Admin → Text Deals (photo + price
overlay → picture message to confirmed numbers, replies forwarded to the
cell with `[1st]`, Mark sold auto-reply), Resend YES on pending rows.**
Owner steps in `TASKS.md` top: run `supabase/text-deals-2026-09.sql` (+ the
Vault secret), paste `TWILIO_AUTH_TOKEN` + `TEXT_ALERTS_CRON_SECRET` in
Netlify (the other three are set), push, set the number's inbound webhook,
then the first real test once Twilio verifies the number. Gate: tsc 0 ·
lint 0 · 1411/1411 · build — `TASKS.md` staging line. Rules `DECISIONS.md`
→ *"Text deals: the reply is the claim…"*.

🟢 **09-15 evening — DEPLOYED + live-verified** (owner ran the SQL + pushed;
real Text sign-up round-tripped to Admin as *Pending YES*). **Twilio:**
account + approved compliance profile + **+1 (888) 423-7522** bought;
**toll-free registration SUBMITTED** (late evening, after the follow-up
deploy: window copy "photo with the details (metal, weight, size) and the
price. These often go at scrap price or just above, never full price" + the
two opt-in proof PNGs under `public/assets/images/compliance/` the
registration links to). Now waiting on Twilio's review (days to ~2 weeks;
email to info@) → then Step 2. Nothing is texted until then. Details `CHANGELOG.md` 2026-09-15 (evening),
steps `TASKS.md` top. The block below is the build record.

🟡 **09-15 — BUILT + STAGED (now deployed, see above): the hero's email form is now ONE
"Join the List" button that opens an Email / Text / Both window; text-alert
phone list (Step 1).** Owner-approved mockup v2
(https://claude.ai/artifact/Wnst13mirihcKMmoSgfT7B), answers recorded in
`DECISIONS.md` → *"The hero sign-up is one button…"*. Text preselected,
store-voice checkbox, never pre-ticked, text-only sign-ups allowed, texts are
for pieces NEVER listed on the site (photo + price overlay from Admin, reply
= claim — Step 2). ⚠️ **Owner steps before/at deploy:** run
`supabase/text-subscribers-2026-09.sql` FIRST (the route calls
`subscribe_homepage_v2`; without it every sign-up fails), then push. Nothing
sends a text yet: phone rows sit `pending`. Step 2 (Twilio toll-free,
pay-as-you-go account + toll-free verification, then the confirmation text,
STOP/HELP, Text Deals composer, replies) waits on the owner's Twilio account.
Hero compact limits re-measured for the shorter block (seven limits, table in
`DECISIONS.md`; compact-ON sweep: 0 fitting sizes changed, 0 overlaps). Gate:
tsc 0 · lint 0 · 1394/1394 · build 0. Twilio: account created by the owner
2026-09-15, stopped at plan/card (owner); no number yet.

🟢 **09-14 (night) — DEPLOYED + live-verified; GSC re-crawl of `/` requested
("Indexing requested"): Google site-name `WebSite` entity tightened**
(`lib/site-ld.ts`: trailing-slash `url`, `@id`, `publisher` → JewelryStore,
`alternateName: ["NaplesEstateJewelry.com"]` as the fallback site name).
The WebSite JSON-LD already existed since 08-15; Google shows the bare domain
because it isn't confident in a descriptive name yet. Live-verified on `/`
and `/es`; GSC re-crawl of `/` requested. Recheck the brand SERP ~09-28.
Gate: tsc 0 · lint 0 · 1368/1368 · build 0. **Nothing is staged.**
`CHANGELOG.md` 2026-09-14 (evening, late).

🟢 **09-14 (evening) — DEPLOYED `main@beaf772` (2:07 PM ET): Instagram token
refresh window 7 → 14 days** (`lib/instagram/auth.ts:26`). Proof comes with the
Mon 09-21 12:15Z `token_refresh` row (token expires 09-30).

🟢 **09-14 — DEPLOYED `main@ee231dc` (9:19 AM ET) and live-verified** (Node
22 in the build log; phone first paint 860 ms median vs 1.06–1.12 s before; both
"30-minute checks" cards green; 13:30Z run clean). `CHANGELOG.md` 2026-09-14
(deployed). The batch: the price-push warning points at Supabase cron
history, Etsy/eBay request timeouts, the Deep Field batch-size pin, Netlify
Node 22, the new "30-minute checks" card on Settings → Etsy / eBay (red
after 60 min without a check), and the homepage `loading.tsx` deletion (first
paint no longer waits on React's swap; local prod build verified).** Checks ran
the same day:
- Google Search Console: the reviews and guide pages are indexed.
- Bing Places is published.
- First paint: the 08-14 image priorities ARE live. The ~1 s white screen on
  phones comes from `(home)/loading.tsx` hiding the whole page until React's
  swap. Fix = delete that file (phone replay 732 → 472 ms), DEPLOYED in
  `ee231dc`.

Details: `CHANGELOG.md` 2026-09-14. Everything built before that is DEPLOYED. The
real open list, triaged against the changelog, is the top block of
`TASKS.md` ("What's actually left"). Many older blocks below and in
`TASKS.md` still say STAGED / DEPLOY / ◻ but are done; treat them as history.

🟢 **09-13 night — DEPLOYED `main@12d76cb` (21:37 ET) and live-verified:**
pencil edits on every Etsy/eBay preflight, the Etsy photo sync fix and the
Instagram/Facebook Refresh Preview buttons (the three blocks below are all
live). ✅ Owner ran every post-deploy step successfully the same night:
- Etsy #33 re-created.
- #82 re-synced.
- A real pencil Save.
- The review window.

`CHANGELOG.md` 2026-09-13 (night, 21:37 ET).

🟢 **09-13 late night — "Refresh Preview" on the Instagram and Facebook
panels — DEPLOYED 12d76cb, live-verified, owner-confirmed.** Photos, title and price saved in the listing editor
now show up without closing the panel; unsaved lineup and caption edits are
kept. Verified on dev. `CHANGELOG.md` 2026-09-13 (late night, social refresh).

🟢 **09-13 late night — Etsy photo sync fix — DEPLOYED 12d76cb; the owner re-synced #33 and #82.**
- **Bug 1: new photos were recorded as uploaded but never sent.** The recovery
  step claimed the old Etsy photos (inv #33: 2 of 7 photos on Etsy; #82: 7 of 10).
  Fixed: never claim a tracked image, check records against the live listing,
  delete before uploading.
- **Bug 2: a listing deleted on etsy.com stayed stuck in error.** Fixed: it now
  resets to not-listed.
- Gate: 1341/1341 · build 0 · live dry run confirmed.
- ✅ Owner re-synced #33 (reset → new listing) and #82 on 09-13 night.
- `CHANGELOG.md` 2026-09-13 (late night, Etsy photos).

🟢 **09-13 late night — pencil edits on every Etsy/eBay preflight — DEPLOYED
12d76cb, owner-confirmed (a real Save + the review window).**
- Where: the listing editor's Etsy and eBay accordions and the Manage Etsy/eBay
  pages, with the same editors as the review window (shared
  `ProductFieldInlineEditor`).
- Safety: a pencil save is copied into the open form, so the drawer's Save and
  Undo cannot revert it.
- Gate: lint 0 · 1334/1334 · build 0 · dev pencils verified read-only.
- `CHANGELOG.md` 2026-09-13 (late night, pencils).

🟢 **09-13 night — DEPLOYED `main@71a77d8` (17:28 ET) and live-verified:** the
webhook fix, owner photo, one scheduler and hero short screens (details below,
all live). ✅ The 22:00Z drips logged one row per channel. Retention
job `nej-log-retention` scheduled by the owner; its first run is 09-14 07:20Z.
`CHANGELOG.md` 2026-09-13 (night, deployed).

🟢 **09-13 (late night) — eBay account-deletion webhook writes once per notice —
DEPLOYED 71a77d8, verified 22:26Z** (no SQL). The receipt is inserted `processed`, with
no `ebay_sync_log` row and no update (~3,500 fewer writes/day). Guarded by
`post-success.test.ts`. Gate: lint 0 · 1329/1329 · build 0. Separate and
owner-run: `supabase/log-retention-2026-09.sql` (run by the owner 09-13; first nightly run 09-14 07:20Z).

🟢 **09-13 (late night) — owner photo replaced sitewide — DEPLOYED 71a77d8,
live-verified.** The showroom-table photo (`pages/chris-owner.webp`, 140 KB WebP) now
shows on About, the homepage owner block and `/free-evaluation`; old
`chris.webp` deleted, its path and `/chris.png` 301 to the new file in
`netlify.toml`. Gate: tsc 0 · eslint 0 · 1326/1326. `CHANGELOG.md` 2026-09-13
(late night). **Whole staged batch (photo + one scheduler + hero short
screens) is ready to push:** full `npm run lint` 0 · `npm run build` 0 · no
Turbopack build cache; no SQL, no env vars.

🟢 **09-13 (late) — scheduled jobs: ONE scheduler — DEPLOYED 71a77d8,
live-verified (no SQL, no env vars).** Investigating GitHub run #606 (`facebook-drip` 502 —
a late scheduled GitHub call, 1 failure in 400 runs, nothing lost) showed
every job firing three times: Supabase pg_cron, the old Netlify scheduled
functions (executing since ~09-11) and GitHub's late `schedule`. The drips
claim nothing before publishing, so overlap risked double posts. GitHub
`schedule:` removed (manual "Run workflow" kept) and
`next-app/netlify/functions/` deleted; pg_cron is the only scheduler. Gate:
YAML valid · tsc 0 · lint 0 · 1326/1326 · build exit 0. After the push: one
log row per job per run. `CHANGELOG.md` 2026-09-13 (late).

🟢 **09-13 — homepage hero on short screens, three owner-approved steps —
DEPLOYED 71a77d8 (no SQL, no env vars):** (1) the headline shrinks in
place so it clears the sign-up form; (2) where it still cannot fit, the hero
goes compact — eyebrow hidden, sign-up block tightened; (3) compact heroes also
get much smaller fields and buttons and a higher phone headline, and the
tiniest windows keep a minimum hero height (no pinning there, a short scroll
reaches the buttons). **Owner rule: anything that fits today stays the same —
verified: 0 such sizes changed** (live sweep EN + ES, 34 widths × 40 heights).
Later that night the last overlaps closed with per-language compact limits
(0 fitting sizes changed): every tested size, 320×240 to 1920×1100, English and
Spanish, is clear — no overlaps, no cut-off buttons, no sideways scroll, no
clipped text — except one English window left tight on purpose (349 wide ×
660 tall, 12px). Mid-scroll resizing verified. Owner check after the push: a
real iPhone in Safari.
Files: `HomeHeroOverlay.tsx`, `HomeHeroStack.tsx`, `HomeSubscriberForm.tsx`,
`globals.css`, new guard test. Gate: tsc 0 · lint 0 · **1326/1326 (134 files)**
· build exit 0. `CHANGELOG.md` 2026-09-13 (day, afternoon, evening); rules
`DECISIONS.md` → *"The homepage headline shrinks in place"*, *"A hero too short
to fit goes compact"*, *"The hero keeps a minimum height on the tiniest
windows"*. (09-13 04:30Z sweep rows also checked clean — below.)

🟢 **09-13 04:00Z — LIVE and ARMED: a sale on Etsy or eBay now marks the
product sold on the site and ends it on the other marketplace.** SQL run,
deployed, both marketplaces reconnected with the order scopes (from a
local port-3002 dev server — production's Reconnect button pointed at
localhost because Netlify's `ETSY_REDIRECT_URI` was the dev value; that
Netlify value is fixed and goes live on the next deploy; eBay's RuName
already pointed at production, nothing to change — `TASKS.md` top). Both sweeps logged
"Auto-mark-sold armed" at 04:00:02Z. ✅ 04:30Z rows CHECKED 13:55Z: both
channels "0 orders read … 0 failed", outcome ok, on every half-hour
04:30 → 13:30Z, 0 warning/error rows — the order reads authenticate.
◻ The first real sale is still the proof (0 orders cannot prove the
parser). (Pre-deploy record follows.)

🟡 (superseded) **09-12 (night) — a sale on Etsy or eBay now MARKS THE PRODUCT SOLD ON
THE SITE, which ends it on the other marketplace — BUILT + gated + STAGED;
needs the owner to run `supabase/marketplace-sales-2026-09.sql`, deploy,
then Reconnect Etsy and Reconnect eBay once (new order-reading scopes).**
The 30-minute reconcile sweeps read paid orders, map lines to products and
apply the checkout rule through `apply_marketplace_sale()`; a product that
becomes sold fires the other channel's status hook. Armed from the first
run after the reconnects — earlier sales are ignored (owner: already
handled). Unverified against live marketplaces until the first real sale;
steps + what to look for at the top of `TASKS.md`. Gate: tsc 0 · lint 0 ·
**1319/1319 (133 files)** · build exit 0. `CHANGELOG.md` 2026-09-12 (night);
`DECISIONS.md` → *"A marketplace sale marks the product sold"*.

🟢 **09-12 — the marketplace review window now EDITS FIELDS IN PLACE, the
Etsy category is a grouped dropdown, length understands `mm`/`cm`, the
description prints "Purity: 14K", and (later the same day) Admin →
Subscribers sorts by any column header, default Subscribed newest-first
(`lib/subscriber-sort.ts`) — DEPLOYED 2026-09-12 23:14 ET (main@a985175); the
review window was owner-confirmed on production 09-13 (no SQL, no env vars).** Gate after the sort: tsc 0 · lint 0 ·
**1308/1308 (132 files)** · build exit 0. "Review before submitting to
Etsy/eBay" has a pencil on every product-backed row (length / ring size /
height, brand, year, weight, main stone, chain type, purity, metal colour,
type, quantity; eBay aspects one per line); a save goes to the PRODUCT via
the new `PUT /api/admin/products/fields` and re-runs the preflight. Price,
photos, condition, shipping and Style stay read-only with a note saying why.
Root cause of the mm problem: the whole pipeline is inches and the listing
assistant was told to strip units — fixed with one shared `parseLengthInches()`
(`470 mm` → `18.5`) used by the editor, the AI autofill, the product page and
both marketplace mappers. Etsy's taxonomy has NO finished-jewelry "Pendants"
leaf (both are craft-supply components), so `Pendant Necklaces` stays the
default; the dropdown shows the parent path so that cannot be missed. Gate:
tsc 0 · lint 0 · **1301/1301 (131 files)** · build exit 0. ⚠️ The window
sits behind admin login — **unverified in a browser until the owner opens
it** (checklist at the top of `TASKS.md`). Detail: `CHANGELOG.md` 2026-09-12;
rules: `DECISIONS.md` → *"Review-window edits write to the product"*,
*"Length is stored in inches"*, *"Purity prints as 14K"*.

## (superseded) Start Here (2026-09-11 night)

✅ **09-11 night — DEPLOYED and production-verified (no SQL, no env):**
`/free-evaluation` is now the call/visit-first "Free Estate Jewelry
Appraisal — Home or Showroom" (URL unchanged), with sitewide "Free
Appraisal" button labels, `/process.html` 308 (it 404'd before), Spanish
LLAMAR buttons and the QR claim removed. Gate was green (tsc 0 · lint 0 ·
1278/1278 · build 0); IndexNow **200 for 220 URLs**. **Staging equals
source; nothing is in flight.**

✅ **GBP update post is live** ("Free estate jewelry appraisals … Call
now") with the owner's testing photo, which the owner also added to the
GBP gallery. ◻ Recheck ~09-13 that the post still says Published — the
08-30 post passed the instant check and was removed ~2 days later.

✅ **GBP description now carries both call-driving lines** (phone hours was
already pasted by the owner; the agent added "Appraisals are free" plus the
free in-home appraisal cities 09-11) — pending Google review, ◻ confirm
~09-12.

✅ **Yelp Connect post live** ("Inherited jewelry? Free appraisal, no
pressure", Call now, runs Sep 11 – Dec 9), beside the 08-21 selling post.
Its photo was rebuilt so the whole frame survives Yelp's centre-square
tile — recipe in `DECISIONS.md` → "GBP operational facts".

✅ **GSC:** indexing requested for `/free-evaluation` + `/es/free-evaluation`
(both already indexed; the titles changed). Nothing else needed there.

**Dates, owner-clarified 09-11:** buying since 2010, the Shirley Street
showroom opened Sept 1 2026 — both true. Keep the GBP opening date at
Sept 2026 and Yelp's "established 2010"; ◻ once the pending GBP description
publishes, add a sentence that says both so they stop looking contradictory.

Left for calls: reviews that name the metal, buying photos beyond the new
testing shot, the 30-day caller question. Details:
`TASKS.md` top, `CHANGELOG.md`.

◻ **09-11 citation audit delivered** (report link in `TASKS.md` top): GBP
opening date now Sept 1 (Maps shows hours again); Apple Maps hours wrong,
Bing unpublished, BBB absent — owner sign-ins needed.

✅ **Yelp moved to buyer-first the same night (owner-approved, all 10 items
applied and re-read; `TASKS.md` top).** Two loose ends: the Estate
Liquidation category is pending Yelp review (recheck ~09-12), and Yelp says
established 2010 while GBP now says opened September 2026 — owner to pick one.

✅ **DEPLOYED and owner-confirmed: the Turbopack build-cache fix plus the
whole 09-10 SEO/seller batch** ("pushed and deployed successfully … no
production verification needed" — no probe run). The Netlify secrets scan
passes with `experimental.turbopackFileSystemCacheForBuild: false`.
**Staging equals source; nothing is in flight.** IndexNow submitted after
the deploy: **200 OK for 220 URLs** (live sitemap). Left: the gold-page and
qualified-call look-backs in `TASKS.md`. The block below is the pre-deploy record.

🟡 (superseded, pre-deploy record) **The Netlify "Exposed secrets" failure is FIXED and the fix is STAGED with
the 09-10 SEO batch, awaiting the owner's push (no SQL, no env vars).** The
staged files never held a secret. The prior agent's batch upgraded Next
16.2.12 → 16.3.4, and Next 16.3 turns the Turbopack persistent BUILD cache on
by default; that cache (`.next/cache/turbopack/*.sst`) stores every env value,
and Netlify publishes + scans `.next` → 16 secrets flagged, all in that one
cache file (Netlify log for deploy `6aa36b61…`, read in the owner's Chrome).
Fix: `experimental.turbopackFileSystemCacheForBuild: false` in
`next-app/next.config.ts`. Verified locally: cache deleted, build exit 0, no
cache dir recreated, build-output grep for every `.env.local` value = 0
secret hits. Gate: tsc 0 · lint 0 · 1276/1276 (130 files) · build exit 0.
Nothing was served (Deploying skipped; the log prints names, not values), so
rotation is not required — owner's call. Rule: `DECISIONS.md` → *"The
Turbopack build cache stays off"*; check: `INTEGRITY.md`. After the push:
IndexNow for the SEO batch (`TASKS.md` top).

## (superseded) Start Here (handoff, end of the 2026-09-10 session)

**Read this, then `TASKS.md`.**

**STOPPED at owner request: Netlify reports exposed secrets; staging is NOT cleared for deployment.**
The owner is assigning the repair to another agent. The 22:45 ET SEO deployment
failed during building; Deploying was skipped. The exact flagged variable/file
was not obtained before the stop. No repair, exclusion change, credential rotation
or staging rewrite was performed during the interrupted investigation. Local
**14 app source files plus package manifests** remain tested; that does not clear the Netlify failure.
Final checks after the responsive fix: **1276 tests / 130 files pass (18.24s)**,
TypeScript/lint/build pass; manifest **86 = 40 EN + 40 ES + 6**; production audit
**0 vulnerabilities**. EN/ES responsive and new-link checks pass. The estate offer
card now grows with its text, resolving clipping/overlap found at 320px. The
separate pre-existing homepage H1/newsletter overlap remains deferred.
Reviews and legitimate local business mentions/links are deferred at the owner's
request; no review requests or outreach now. Later tasks are in `TASKS.md`.
Full handoff: `SEO_LEAD_AUDIT.md`, final incident section; outstanding repair/SEO tasks in `TASKS.md`. These closing docs are source-only and have NOT been copied to staging.

**Gold-page follow-up — measure after deployment, ahead of cosmetic home fixes.**
Aug 19–28 → Aug 29–Sep 7, exact `/gold-services`: 60→68 impressions,
position 12.2→20.4. Of three shared queries, brand/antique were stable; **estate
jewelry naples fl** worsened 10→22.1. Exact page + U.S. + that query: desktop
6→7 impressions, 9.3→22.1; mobile 2→0, 12→missing (never rank 0). All clicks 0.
New low-ranking queries worsen the exposed mix, but its 34→43 impressions do
not reconcile the page's 60→68 headline. This is a specific follow-up, not proof
of a broad gold-search loss or the call decline's cause. Deploy the tested copy,
then compare the same page/query/country/device; the limited follow-up above is
implemented, without claiming it explains or guarantees recovery of rankings.
For that U.S. query, estate page position also worsened 10→18.3; homepage
clicks rose 1→2. No diamond page appeared among the 15 exposed URL rows.
Full scoped evidence is in `SEO_LEAD_AUDIT.md`.

**09-10 earlier seller-acquisition batch — verified before the three-file extension above.**
Gold/sterling/estate-jewelry copy is seller-first in EN/ES; centralized daily
9–6 phone hours appear by hero calls, footer and contact surfaces. Diamond
marketing now emphasizes jewelry evaluations; its route and historical buying
policy remain. That earlier batch changed **13 app source files plus package manifests**. Next/eslint
16.3.4, Sharp 0.35.4; production audit 0 vulnerabilities. Post-update gates:
TypeScript/lint/build pass; **1276/1276 tests (130 files)**; manifest **86 routes
= 40 EN + 40 ES + 6**. These checks apply to the earlier batch, before the new
three-file follow-up. Earlier seller-page responsive checks passed; the existing **320px EN/ES homepage
H1/newsletter overlap** is deferred for reassessment. **No new SQL/env.
Not deployed or copied in this session; IndexNow after deployment.**

Yelp saved: 11 boosted seller terms, seven exclusions, seller ad/Specialties,
9–6 phone CTA, Get more phone calls with call reporting OFF; $15/day and 15-mile
radius unchanged. Correct CTA number visually verified; no forwarding enabled.
Yelp Diamond Buyers removal was submitted but returned after reload: unconfirmed.
GBP secondary Diamond buyer removal accepted; Jewelry buyer remains primary.
GBP description accepted and number-free Update published. All four revised
services are saved but **Pending review**. OpenAI seller contexts and ad copy
reloaded/verified; landing now `/sell/naples` (live HTTP 200), still Serving,
14 Naples ZIPs and $25/day. Exact state and evidence:
`SEO_LEAD_AUDIT.md` → Authorized implementation. No lead-quality lift measured.

**09-10 initial seller-call audit — read-only evidence, before the follow-up.**
Read `SEO_LEAD_AUDIT.md` for the evidence. Equal ten-day GSC windows
(Aug 19–28 vs Aug 29–Sep 7): clicks 33→46, U.S. clicks 33→45,
mobile 21→39; GBP interactions 41→41. No single cause is established.
The prior “local-pack eligibility is the root cause” statement is withdrawn:
interactions are not calls and the old inquiry count included retained spam.
Owner clarified: opening date changed TODAY (not the August cause); Google
reviews dropped this past week, after calls slowed; Yelp reviews were always
present (filter-change date unknown). Priorities: reconstruct real calls,
check the 9 AM availability/phone path, measure paid lead quality, and resolve
documented profile/satellite inconsistencies in a later change phase.
The deployment records below are historical. The new local batch above is not
yet deployed; its authorized account changes supersede the initial audit's
read-only state.

✅ **09-10 (evening) — the "Newest arrivals" sort + hero "New Arrivals →"
link are DEPLOYED and owner-verified ("pushed and deployed successfully …
no live verification needed" — no probe run). Staging equals source;
nothing is in flight.** The paragraph below is the pre-deploy record.

🟡 (superseded) **09-10 (later) — shop gallery "Newest arrivals" sort + homepage hero
"New Arrivals →" link BUILT + dev-verified + STAGED, awaiting push (no SQL,
no env vars).** One new option in the existing Sort select (`?sort=newest`,
EN "Newest arrivals" / ES "Novedades"), `created_at` descending with
`sort_order` descending as the tie-break; `created_at` joins the gallery
column list. On the homepage the Buy · Sell · Visit Us trio is untouched and a
small underlined "New Arrivals →" / "Novedades →" line sits beneath it,
opening that sorted view (owner picked this "Option C" from a mockup over a
four-button row and over replacing Buy). Five files. Gate
tsc 0 · lint 0 · 1276/1276 (130 files) · build exit 0 (86 routes = 40 EN + 40 ES + 6). Detail: `CHANGELOG.md` 2026-09-10 (later); rule in
`DECISIONS.md` → *"Newest arrivals"*. The block below is the prior handoff.

✅ **09-10 — everything from 09-09 is DEPLOYED and owner-verified
("fix was successful, deployed successfully and tested"): the Smart
Listing Assistant now FILLS THE FORM (no accept/keep review, `{fields,
notes}`, three rules, one Undo; 50 s provider abort with a readable
message; rate limit counts successes only), product photos are encoded to
WebP on the SERVER (`/api/admin/product-images`, sharp, owned-buffer copy
— the first deploy 502'd with "SharedArrayBuffer is not allowed" until
`toOwnedBuffer()`), and the assistant's image payload is shrunk to 1600px
WebP. Staging equals source; nothing is in flight.** Open items are all
owner-timing or dated look-backs — top of `TASKS.md` (GBP items, GSC/Bing
look-backs, pg_cron overlap cleanup, optional PNG/JPEG batch conversion,
uncalled `ai-speech` route). Gate at close: tsc 0 · lint 0 · **1275/1275
(130 files)** · build exit 0 (86 routes = 40 EN + 40 ES + 6). Detail:
`CHANGELOG.md` 2026-09-09 (three entries) and 2026-09-10; rules in
`DECISIONS.md` → *"The Smart Listing Assistant fills the form"*.

🟡 (superseded) **09-09 (night) — the two batches below were PUSHED AND DEPLOYED, and the
new photo upload route 502'd on every photo in production
(`SharedArrayBuffer is not allowed` — sharp's output on Netlify is
SAB-backed, supabase-js's Blob rejects it; local Node does not reproduce
it). HOTFIX BUILT + STAGED (`toOwnedBuffer()` copy before upload) — pushed
and owner-verified 09-10. No objects were written by the failed attempts.
Gate tsc 0 · lint 0 · 1275/1275 (130 files) · build exit 0.
`CHANGELOG.md` 2026-09-09 (night).**

🟡 **09-09 (later) — product photos are now encoded to WebP on the SERVER
(`/api/admin/product-images`, sharp) because WebKit — every iPhone browser —
cannot encode WebP in a canvas; the assistant's image payload is shrunk to
1600px WebP before base64. BUILT + dev-verified (460 KB JPEG → 109 KB
`image/webp` 2048×1365 in 1.9 s; object metadata `max-age=31536000`) +
STAGED, rides with the assistant batch. Batch conversion of existing
PNG/JPEG objects deliberately NOT done (buyers already get WebP/AVIF from
the Image CDN — no UX gain, real risk; parked in `TASKS.md`).** Gate tsc 0 ·
lint 0 · **1274/1274 (130 files)** · build exit 0. Detail: `CHANGELOG.md`
2026-09-09 (later).

🟡 **09-09 — Smart Listing Assistant: "AI generation failed" was OUR OWN
30 s abort (4 production failures at 31–32 s, `This operation was aborted`;
Netlify's synchronous cap is 60 s, not 26) → the assistant was rebuilt to
FILL THE FORM on the owner's word: no Accept/Keep review cards, no chat
thread, no read-aloud/auto-read, no photo banner; `{fields, notes}` (≤5
short lines), three rules (filled field = correct · fill every empty field ·
an explicit statement wins), one Undo; abort 50 s with a readable message;
rate limit counts successes only (30/hr). BUILT + dev-verified in the
owner's Chrome (11.8 s / 453 tokens and 12.9 s / 493 tokens, rules 1–3 and
Undo all observed, nothing saved) + STAGED, awaiting push (no SQL, no env
vars).** Gate tsc 0 · lint 0 · **1270/1270 (129 files)** · build exit 0
(86 routes = 40 EN + 40 ES + 6). After the push: list one real item on the
phone and read the Netlify log line (`noteCount`, `elapsedMs`). Open,
owner's timing: phone uploads are 0.7–2 MB JPEGs (WebKit cannot encode
WebP) — `TASKS.md`. Detail: `CHANGELOG.md` 2026-09-09; rules in
`DECISIONS.md` → *"The Smart Listing Assistant fills the form"*.

✅ **09-08 (late night, session end) — storefront photo (`StorefrontPhoto`,
one component, no caption) on the homepage Visit Us block, the contact
panel, the `/sell/naples` band and `/card`, with the homepage Visit Us
block re-laid out as a CENTRED column + photo/square-map pair (owner's V2)
— DEPLOYED and production-verified.** **Staging equals source; nothing is
in flight.** Everything left is owner-only or a dated look-back — the
consolidated list (GBP description paste, reviews naming the metal,
photos, 30-day caller question; GSC validations ~09-20, Breadcrumbs report
mid-Sept, Bing ~09-10, GBP Calls + silver lander mid-Sept; optional
re-request/IndexNow for the changed landers) is the top item in
`TASKS.md`. Gate at close: tsc 0 · lint 0 · **1271/1271 (129 files)** ·
build exit 0 (481 pages).

✅ **09-08 (night) — the gold/silver visibility bundle is DEPLOYED and
production-verified** (FAQ schema on gold + silver; all five buy-side
descriptions ≤157 with the phone last; phone-hours line on `/card`, the
Visit Us block and `/spot-prices`; `contactPoint` in the schema; call
buttons in the gold and silver heroes). **Staging equals source; nothing
is in flight.** Owner-only left: paste the GBP description sentence
("Calls and appointments answered 9 AM to 6 PM, seven days a week."),
reviews that name the metal, buying photos, the 30-day caller question
(`TASKS.md` top). The blocks below are the pre-deploy record.

🟡 (superseded) **09-08 (night, latest) — Option C BUILT + STAGED: phone hours 9 AM–6 PM
daily as ONE constant (`PHONE_HOURS`) rendered on `/card`, the homepage
Visit Us block and `/spot-prices` and as `contactPoint` in the site
schema; call buttons replace the duplicate/rates buttons in the gold and
silver heroes; diamond / watch / appraisal descriptions trimmed to the
phone-last ≤155 rule. Gate tsc 0 · lint 0 · **1265/1265 (128 files)** ·
build exit 0.**

🟡 **09-08 (night, later) — gold + silver landers: FAQ schema + accordion
(new `FaqSection`) + phone in the meta description — BUILT + dev-verified +
STAGED, awaiting push (no SQL, no env vars).** Descriptions rewritten to
149–155 chars so the phone survives Google's phone truncation. GBP plan
items 1 + 4 verified read-only in the owner's Chrome (Gold dealer + Coin
dealer secondaries present; gold/silver services present; Diamond buyer
has none); items 2 (hours), reviews-that-name-the-metal, photos and the
30-day caller question are the owner's. Gate tsc 0 · lint 0 · **1256/1256
(128 files)** · build exit 0 (481 static pages). `TASKS.md` top;
`CHANGELOG.md` 09-08 (night, FAQ).

**09-08 call investigation — historical; causal conclusion superseded 09-10.**
Phone/FAQ parity was implemented, but the investigation did not establish
where calls originated or why their material mix changed. Its “3 months”
was Aug 1–Sep 6; GBP interactions were not a call count; product inquiries
included retained spam. August 30 added categories/services, not a documented
profile recreation that day. See `SEO_LEAD_AUDIT.md` and the original
September 8 `CHANGELOG.md` entries for evidence and limitations.

✅ **09-08 (late) — locale-switch fade fix + `/reviews` count removal
DEPLOYED and production-verified** (0 `pending` stamps on three live
switches in the owner's Chrome, fade intact on a real page change; count
gone in both languages). **Staging equals source; nothing is in flight.**
**GSC + IndexNow settled the same night:** `/reviews` → "Indexing
requested"; `/es/reviews` was already indexed (no request); IndexNow 200
for 212 URLs. **Nothing is owed.** The block below is the pre-deploy record.

🟡 (superseded) **09-08 (late) — the `/card` EN↔ES "flash" was the site-wide entrance
fade replaying on a remounted page, FIXED in `CustomerReveal` (a
locale-only pathname change gets no reveal, sitewide) + `/reviews` intro
and meta lose the review count — BUILT + dev-verified + STAGED.** Not a
reload (marker survived everywhere); three timing traps documented in the
file and in `DECISIONS.md` → *"A language switch is a text swap"*. Gate tsc
0 · lint 0 · **1252/1252 (126 files)** · build exit 0 (481 static pages).
`TASKS.md` top; `CHANGELOG.md` 09-08 (late).

✅ **09-08 (evening) — `/card` reviews button + `/reviews` page DEPLOYED
and production-verified** (`/reviews` + `/es/reviews` 200 with 22 cards and
no rating schema; `/card` carries the new pill + label; `/review` still
302; sitemap 212 with both new URLs, 0 `/card`; About + footer links live;
homepage band intact). Staging equals source; nothing in flight. GSC +
IndexNow for the new URLs were settled later the same night (see the
block above). The block below is the pre-deploy record.

🟡 (superseded) **09-08 (evening) — `/card` "Read Our Reviews" button + "View Full
Website & Shop" label, and a NEW `/reviews` page (EN + ES) — BUILT +
dev-verified + STAGED, awaiting push (no SQL, no env vars).** Owner chose a
page of our own over a Google link. The page renders the 22 verbatim
reviews from `lib/testimonials.ts` through the newly extracted
`TestimonialCard`, hands off to Google for leaving/seeing all, carries no
rating schema, sits in the sitemap at 0.5 and in the About ▾ menu + footer.
Found and fixed on the way: the proxy matcher's `review` carve-out was an
unanchored prefix that would have 404'd `/reviews` (now `review$`, tested).
Gate tsc 0 · lint 0 · **1249/1249 (125 files)** · build exit 0 (481 static
pages). After the push: curl `/reviews`, `/es/reviews`, `/review` (302),
`/card`; then GSC indexing for the two new URLs + IndexNow. `TASKS.md` top;
`CHANGELOG.md` 09-08 (evening).

**Session 2026-09-07/08 in one paragraph:** all seven scheduled jobs moved
from GitHub Actions (silently degraded since 08-27) to Supabase pg_cron
(verified to the second; 8 `nej-*` jobs incl. history cleanup); the
marketplace status sweeps now count repairs honestly and reconcile-on-refusal
(deployed, verified); Netlify Forms confirmed unused since June, ghost stub
deleted, form detection disabled by the owner; the lead forms gained
required Location + Preferred-contact fields (SQL applied, end-to-end tested,
deployed, verified). **Evening: the `/card` reviews button + `/reviews`
page DEPLOYED + production-verified; late: the toggle's entrance-fade
"flash" FIXED + `/reviews` count removed, also DEPLOYED + verified (blocks
above); GSC request for `/reviews` made, `/es/reviews` already indexed,
IndexNow 200 ×212. Staging equals source; nothing in flight; nothing
owed.** Next
batch when the owner is ready: pg_cron overlap cleanup (GitHub `schedule:`
block + five Netlify `.mts`) + an admin "last sweep ran N min ago" line —
after the 09-08 11:15/11:45Z price pushes are seen on the minute. Proposal
parked: inbound marketplace-sale detection (`TASKS.md`).

✅ **09-09 02:49Z — price pushes CONFIRMED on the minute (Etsy 11:15:04Z,
eBay 11:45:04Z on 09-08; GitHub duplicates 15:03 / 15:17 harmless); sweeps
54/54 boundaries since 09-08 00:00Z. All eight pg_cron jobs now observed →
the overlap window is CLOSED. Next batch = the cleanup (GitHub `schedule:`
block + five Netlify `.mts` + stale copy + admin "last sweep" line with a
mockup first) — `TASKS.md`. Read-only check; no code or docs beyond this
note touched.**

✅ **09-08 — lead-form fields + Netlify stub deletion DEPLOYED and
production-verified** (five form pages 200 with the fields, ES labels,
stub 404, API 400 on Email-without-address). Staging equals source;
nothing in flight; the test inquiry row is gone. Open, owner's timing: pg_cron overlap cleanup + the
admin "last sweep" line (next batch); the inbound marketplace-sale
detection proposal. The block below is the pre-deploy record.

🔴 **09-08 — lead forms gain "Where are you located?" (dropdown + city
reveal + out-of-area note) and "How should we contact you?" (Call · Text ·
Email), both required — BUILT + STAGED; SQL RUN by the owner and an
end-to-end test submission VERIFIED 09-08 00:12Z (columns populated,
message-center lines present). Left: owner deletes the leftover test
inquiry row (one SQL line in `TASKS.md`; the service role cannot), then push. Admin → Inquiries shows the
two facts as chips (red when outside SWFL); the email subject reads
`… · prefers Text · Naples`. Gate tsc 0 · lint 0 · **1243/1243 (124 files)**
· build exit 0. `TASKS.md` top; `CHANGELOG.md` 2026-09-08.**

🟡 **09-07 (night) — Netlify Forms are NOT used (since June; all forms →
`/api/inquire` → Supabase `inquiries` + Resend); the two recent free-evaluation
submissions are in the table with photos. Ghost stub
`public/netlify-forms.html` DELETED + staged (rides with the next push).
Owner-only click left: Netlify → Forms → Disable form detection (type
`naplesantiques`). `TASKS.md` top.**

✅ **09-07 (evening) — sweep fix DEPLOYED + production-verified** (20:30Z
rows on both channels in the new six-number format, all zeros). pg_cron
cadence 15/15 boundaries 13:30→20:30Z; all four Vault secrets proven (drips
fired 16:00–20:00Z). pg_cron history cleanup job added (jobid 8, in the
migration file; eight `nej-*` jobs). Staging equals source; nothing in flight. Open, owner's
timing: pg_cron overlap cleanup (bundle with the next push) and the
inbound marketplace-sale detection proposal — `TASKS.md`. The block below
is the pre-deploy record.

🟡 **09-07 (day, later) — status-sweep fix BUILT + dev-verified + STAGED,
awaiting push (no SQL, no env vars).** Both marketplace sweeps now count a
repair from the re-read state, fall back to the read-only status check when
the marketplace refuses a write, and log every refusal. Dev run against the
live DB: Etsy #19 → `delisted`, eBay #75 → `hidden_oos`, both channels
`1 reconciled`, second run `0 drifted`. Gate tsc 0 · lint 0 · **1235/1235
(123 files)** · build exit 0. After the push the production sweep rows read
in the new six-number format with all zeros. `TASKS.md` top; `CHANGELOG.md`
09-07 (day, later).

🟢 **09-07 (day) — ALL SCHEDULED JOBS NOW FIRE FROM SUPABASE pg_cron, verified
live (13:30:03Z Etsy / 13:30:10Z eBay).** Why: GitHub Actions `schedule` had
been silently degraded since 08-27 (6–16 runs/day created instead of ~64; the
"30-min" sweep ran 2–9×/day; price pushes 2–10 h late) and Netlify scheduled
functions are still dead. `supabase/scheduled-jobs-pg-cron-2026-09.sql` (owner
ran it; secrets in Vault; **no app code**). GitHub + Netlify copies deliberately
still in place for a 1–2 day overlap → verify + cleanup items at the top of
`TASKS.md`. Also found: both reconcile sweeps have reported "1 drifted, 1
repaired" every run since late August while repairing nothing (Etsy #19 sold
on Etsy → Etsy state `edit`; eBay #75 → `Completed`; the delist is refused and
the error swallowed) — fix proposed, owner's call. Owner's opening question
(auto-mark sold on the site when an item sells on eBay/Etsy): NOT built,
staged proposal in `TASKS.md`. Record: `CHANGELOG.md` 09-07 (day).

✅ **09-07 (night) — every GSC indexing request the project owed is
SETTLED**: the six new URLs (silver-marks, gold-marks, spot-prices, EN +
ES) each returned "Indexing requested"; `/es/sell/dont-melt-it` turned out
to be already indexed; IndexNow 200 for the six. **Nothing is owed and
nothing is in flight.** Next looks, none due yet: GSC validations ("Page
with redirect", "Blocked by robots.txt") ~09-20; Bing recheck ~09-10;
Breadcrumbs report mid-Sept. Owner-only: the optional `#item=`
contact-link change, GBP "Google updates (1)", the /free-evaluation bench
photo, a caption read-through. Working method for URL inspection is in
`CHANGELOG.md` 09-07 (night) and memory `gsc-url-inspection-method`.

✅ **09-07 (end of session) — admin timestamps DEPLOYED + owner-verified on
production** (Subscribed column, Joined line, Eastern-time stamps). Staging
equals source. The block below is the pre-deploy record.

🟡 (superseded) **09-07 (later still) — admin timestamps BUILT + STAGED, awaiting push:
Subscribers table gains a "Subscribed" column (subscription time, or the
account creation time tagged "(account)"), Users phone cards gain a
"Joined" line, and every admin Created / Updated stamp is now pinned to
Eastern time (the server-rendered Users page had been printing UTC).**
Display-only — no SQL, no env vars. Gate: tsc 0 · lint 0 · **1229/1229
(122 files)** · build exit 0. Owner eyeballs `/admin/subscribers` and
`/admin/users` on the dev server (behind login; unverifiable from here),
then pushes. `TASKS.md` top; `CHANGELOG.md` 09-07 (later still).

✅ **09-07 (later) — `/en/...` 307 → 308 DEPLOYED + production-verified;
GSC "Page with redirect" validation STARTED 9/6 (and "Blocked by
robots.txt" validation started earlier the same day).** Verified: nine
`/en/...` URLs → 308 in one hop with the query string kept; every control
route unchanged. Staging equals source; nothing in flight. **Still owed:
GSC indexing requests for silver-marks, gold-marks, spot-prices (EN +
ES).** Both validations: check the result in ~2 weeks. The block below is
the pre-deploy record.

🟡 (superseded) **09-07 (later) — Search Console "not indexed" reasons READ + DECODED; one
code fix STAGED, awaiting push: `/en` and `/en/...` now redirect with a
308 (was next-intl's 307) so Google consolidates the 46 "Page with
redirect" URLs instead of recrawling them.** Of the seven reasons, five are
by design or Google's discretion (the 129 "alternate canonical" URLs are all
`/contact?item=…` from the nofollow product links; the 13 noindex are the
legal pages; the 404s `/oz` `/$` `/&` are text and React markers Googlebot
read as links). The "Blocked by robots.txt" verdict on `/account` is stale
— **Validate fix started in GSC 9/6**. The Domain property shows the same
seven, so the "new reasons" email was its first report. Files:
`proxy.ts`, `lib/legacy-redirects.ts` (+ test). Gate: tsc 0 · lint 0 ·
**1228/1228 (122 files)** · build exit 0 · dev-verified 308s. After the
push: curl `/en/shop` → 308, then GSC → "Page with redirect" → Validate
fix. Table + provenance: `CHANGELOG.md` 09-07 (later); memory
`gsc-page-indexing-2026-09-07`. **Still owed: GSC indexing requests for
silver-marks, gold-marks, spot-prices (EN + ES).**

✅ **09-07 — old-site image URLs 500 → 404 DEPLOYED + production-verified**
(`/money.jpg` → branded 404; redirects, pages, product page, `/live` all
unchanged). Root `pics/` cache DELETED. Staging equals source. **Still
owed: GSC indexing requests for silver-marks, gold-marks, spot-prices (EN +
ES).**

🟡 **09-07 (pre-deploy record) — old-site image URLs 500 → 404, STAGED (one file:
`dynamicParams = false` on the home route; reproduced + verified on a
production start). Root `pics/` cache DELETED on the owner's word.** After
the push check `/money.jpg` → 404 on production.

✅ **09-06 (late night) — the whole 09-05/09-06 bundle is DEPLOYED and
production-verified** (owner: "pushed and deployed, verify it live"):
homepage fifth card, silver hero fix, silver marks guide + lander reorder +
tile fixes, `/spot-prices` (+ `/live` alias), gold marks guide + teaser +
hallmarks links, expand hints, seven unused images deleted. Every URL 200,
`/live` 307 → 200, sitemap carries the three new URLs EN + ES. Staging
equals source. **Owed: GSC indexing requests for silver-marks, gold-marks
and spot-prices (EN + ES).** The 🟡 blocks below are the pre-deploy record.


🟡 **09-06 (late night) — `/gold-services/gold-marks` BUILT + STAGED** (EN +
ES): the gold twin of the silver marks guide — 31 stamp photos (5 shop, 26
eBay sold listings, found by searching the item and reading the gallery —
the owner's method), teaser on /gold-services, hallmarks page links to both
guides, silver guide links to gold. Gate green, preview-verified, 1225
tests, 479 static pages. Rides with the push below; after the push request
GSC indexing for the new URL.

🟡 **09-06 (night) — photo audit: no placeholder slots left anywhere; 7
unused page images DELETED + 5 dead `netlify.toml` image redirects dropped
(owner's word, backed up in the session scratchpad). Only true stand-in
left: the /free-evaluation desk photo (owner owes a bench photo).**

🟡 **09-06 (night) — `/spot-prices` live-prices page BUILT + STAGED** (EN +
ES): live spot for four metals as text, ticker, four full-size TradingView
charts with range tabs, per-gram karat table tagged "not an offer", linked
from About ▾ / footer / the three sell pages, `/live` alias. Owner-approved
mockup, gate green, preview-verified (live figures + 5 TradingView frames),
1221 tests, 477 static pages. Rides with the push below; after the push
check `/live` redirects on production and the hero shows numbers.

🟡 **09-06 (evening) — `/silver-services` SPLIT + STAGED:** the marks section
moved to a new guide page `/silver-services/silver-marks` (EN + ES, sitemap,
breadcrumb, dark hero with the mug-base hallmarks in view) and the lander
was reordered around buying (what we buy → how we buy → sterling or plate →
four-photo teaser into the guide → recently → CTA; ~930 words, was 2,320).
Owner-approved mockup, gate green, preview-verified, 1216 tests. Rides with
the push below; after the push request GSC indexing for the new URL.

🟡 **09-06 — `/silver-services` "Reading the Marks on Your Silver" section
BUILT + STAGED** (26 mark photos — 16 own, 10 eBay by owner decision —
with click-to-expand; the two grey boxes and the flatware section now have
photos; EN + ES). Third same-day review: the "Fine Silver Estate Services"
tiles are square and served at real size (they were upscaled = "fuzzy"),
the flatware photo is rotated upright, and Bullion & Coins shows a SILVER
bar + Britannia coin (`silver-bullion.webp`, owner-supplied Pexels photo)
instead of gold. Rides with the fifth-card + hero-fix push. Gate green,
preview-verified. `TASKS.md` top; provenance in `CHANGELOG.md` 09-06.

🟡 **09-06 — `/silver-services` hero readability FIXED and STAGED** (owner
saw unreadable text on the phone; measured body contrast was 1.06:1 at
375px because the light gradient only covered the left half; now a 90%
wash below `lg` and a stronger gradient above — worst body contrast
≥7.4:1 at every width). Rides with the fifth-card push. `TASKS.md` top.

🟡 **09-05 (later) — homepage services strip has a FIFTH card, "We Buy
Estate Jewelry in Naples" (second, links `/estate-jewelry`), laid out
3 + 2 with the second row centered (owner: "option b"). BUILT + STAGED,
awaiting push.** Its own mark (`estate-jewelry`) is in; the root `icons/` source folder was
deleted on the owner's word (backed up to the scratchpad first).
Sitemap lastmod bumped to 09-05. Gate green; preview measured at three
widths. `TASKS.md` top.

✅ **09-05 — the whole 09-04/09-05 bundle is DEPLOYED and production-verified** (icon pack on every page with 0 clay references and retired files 404; `/card` cookie suppression live in HTML + CSS; banner button "Okay"/"De acuerdo"; `/card` toggle hrefs live; smoke 200 ×7). Staging equals source; nothing in flight. Detail: `TASKS.md` top, `CHANGELOG.md` 09-05.

✅ (deployed) **09-05 — icon pack COMPLETE and owner-approved spot by spot (10/10):
24 marks, 0 clay references, BUILT + STAGED.** Five icons arrived during
the check (shield, XRF, purity-test, dollar, photo-location) and the gold page's lab-
testing card got a 220px mark + Caslon caption. ✅ Old files DELETED on the owner's word (20 clay + the 24-PNG `icon
pack/`; backed up to the session scratchpad first). Only the push is
left. `TASKS.md` top. After
the OK: delete the four orphaned `clay-*.webp` + the root `icon pack/`
folder (excluded from staging meanwhile), then push the bundle. Gate
1207/1207 (118 files) · build exit 0. `TASKS.md` top.

🟡 **09-04 — `/card` EN/ES toggle switched to a soft navigation (Next
`<Link>`, prefetched) so the switch no longer flashes; internal links on
the page are `<Link prefetch={false}>`. BUILT + STAGED with the bundle
below.** Gate green; preview proved no document reload.

🟡 **09-03 (night) — cookie banner button now "Okay" / "De acuerdo"
(was Accept), BUILT + STAGED with the item below.** Owner asked for a
Reject / essential-only option; there is nothing to reject (essential
storage only, no analytics), so the single button became an
acknowledgement. "Got it" mocked up and declined; "Okay" chosen. One label
in `CookieNotice.tsx`; rule in `DECISIONS.md` → *"Cookie banner: one
Okay button"*.

🟡 **09-03 (night) — cookie notice suppressed on `/card`, BUILT + STAGED,
awaiting the owner's push.** `data-no-cookie-notice` on the card `<main>`
+ a `body:has()` rule in `globals.css`; consent untouched, banner still
shows on every other page. Gate `tsc` · lint · **1204/1204** · build exit
0 · preview: `/card` hidden with consent cleared, `/contact` visible.
After the push: `/card` HTML contains `data-no-cookie-notice`; deployed
CSS contains `body:has(main[data-no-cookie-notice])`. `TASKS.md` top.

✅ **09-03 (evening, session 2) — `/card` business-card landing page
DEPLOYED and production-verified** (200 + noindex + canonical + prefilled
sms + review link + 0 chrome on both locales; sitemap 206 with 0 `/card`
entries; smoke 200 ×6). Staging equals source; nothing in flight. Owner
side: generate the static QR from `https://naplesestatejewelry.com/card`,
tap through on the phone once. Build record (was): The QR on the new business cards
prints `naplesestatejewelry.com/card`. New `[locale]/card/page.tsx` (+
`/es/card`): slim English/Español toggle at the very top, wordmark (home
link) + octopus, "Gold, Sterling & Jewelry Buyers / Naples, FL", today's
hours line with the Today chip + a bold-days weekly summary (both from the
admin-editable hours), then Call (dark) · Text (prefilled "Hi Chris, I have
your card…") · **Leave a Google Review (gold)**, a 2×2 of What We Buy /
Shop / Instagram / Facebook, the address with the landmark + copy button,
then Get Directions and a "Visit Our Website" button (owner moved
Directions down to the address and asked for a tighter stack). **noindex, off
the sitemap, no header/footer/breadcrumb** — guarded by
`lib/__tests__/card-page.test.ts`. Mockup approved rev 3 + four owner
asks applied mid-build (ES toggle, name line, home links, compaction +
Directions under the address). Gate: `tsc` ·
lint · **1203/1203 (117 files)** · `npm run build` exit 0 (`/en/card` +
`/es/card` prerendered, 473 static pages) · dev preview at 375×812 fits
one screen in both locales (last element ends at 722px), no console errors. After the push: `curl -sI
https://naplesestatejewelry.com/card` → 200 with `noindex`; `/es/card`
same; then **generate the QR from the `.com/card` URL only** (a static QR,
never a paid dynamic-QR service). Record: `CHANGELOG.md` 09-03 (evening,
session 2); rules in `DECISIONS.md` → *"The /card page"*.

🟢 **09-03 late — GBP posting appears REINSTATED** (Add post available, composer opens, no block notice; the 08-30 post shows Rejected). Nothing was posted, and the owner's closing instruction is **DO NOT POST** — GBP posting is the owner's call from here; ⛔ no phone numbers in post text. "Google updates (1)" pending on the profile — review it.

✅ **09-03 late — "Don't Melt It Yet" page + resale hook DEPLOYED and
production-verified** (both URLs 200 + schema, hook live on `/` and all six
city pages, sitemap 206, IndexNow 200 for 2, GSC: EN page "Indexing requested" (the 10th success of the day); the ES page returned "Quota Exceeded" on the 11th attempt — so the daily allowance is 10, and `/es/sell/dont-melt-it` is OWED tomorrow (one request)). Staging equals
source; nothing in flight. Optional owner follow-up: a GBP post with the hook.

🟡 **(superseded) 09-03 night — "Don't Melt It Yet" page + resale hook BUILT and STAGED,
awaiting the owner's push.** `/sell/dont-melt-it` (+ES) on the guide
template (mockup approved as is), sitemap + `/sell` hub link, hook sentence
on the homepage gold card and in every city intro. Gate: `tsc` · lint · **1197/1197 (116 files)** · `npm run build` exit 0 · **76 = 35 EN + 35 ES + 6** · prerendered EN + ES page each with BreadcrumbList + FAQPage JSON-LD and one `<h1>`; "melt-only buyers" present in the homepage HTML, the melt sentence present in the city HTML.
After the push: verify, `npm run indexnow` for the two URLs, GSC requests
when quota allows — checklist at the top of `TASKS.md`.

✅ **09-03 evening — the two-file bundle below is DEPLOYED and
production-verified** (`/sell/nowhere-xyz` → 404, city pages 200, footer
`8505</a> <a` live on four pages, smoke 200). Nothing in flight; staging
equals source. Next looks: GSC ~09-10 (Pages report refresh, Breadcrumbs),
Bing ~09-10 (six re-requested URLs), and the `/shop` snippet whenever Google
re-reads the footer.

🟡 **(superseded) Later on 09-03 — Bing checked; one app fix STAGED, awaiting the next
push.** Bing: sitemap resubmitted (was on the 9/1 198-URL copy), six URLs
re-requested. Bing's "Indexing allowed: No" verdicts are NOT a `noindex` we
serve (verified every crawler variant + Bing's own Live test passes) — it is
index selection on a 2-day-old import; recheck ~09-10. **Two fixes staged:** (a) the Google-snippet run-together
`(239) 404-8505info@…` — the footer shipped the two anchors with no
whitespace between them, fixed with a `{' '}` text node (owner's
pre-deploy ask); (b) **a real bug:
unknown `/sell/<slug>` URLs return 500 in production.** Fix =
`dynamicParams = false` on the city route, gated (`tsc` · lint · 1197/1197 ·
build · manifest `fallback: false`), **deployed the same evening — see the ✅ block above.** Details: `TASKS.md` top two items, `CHANGELOG.md` 09-03.

🟢 **2026-09-03 — Search Console is current with everything deployed
through 09-02.** Read in the owner's Chrome: sitemap **last read Sep 3,
Success, 204 URLs**; 28-day performance **74 clicks · 1.96K impressions ·
position 31.7** (up from 44 · 1.09K · 36.7 at the 8/25 audit); Breadcrumbs
35 valid / 0 invalid (stamped 9/1, pre-trail); no removals, no manual
actions, robots.txt Valid. The page-indexing report is stamped **8/27**, so
it does not yet reflect the 09-01/09-02 deploys. **All 12 owed indexing
requests are settled:** 4 URLs were already indexed on their own
(`/es/watch-buyers`, `/es/silver-services/flatware-value`, both
`/diamond-buyers`), the other 8 were requested today and each returned
"Indexing requested" — no quota wall hit. **Two `.com` properties do not
hurt** (read-only views; the Domain property is the superset and carries the
AI "Include" setting the URL-prefix property inherits; the URL-prefix one
holds the history) — rule in `DECISIONS.md`. ⛔ The Domain property's
"unused verification token" is the DNS TXT that verifies both properties —
never REMOVE it. `info@naplesestatejewelry.com` was ADDED as Owner on both
`.com` properties later on 09-03 (owner's call); unused tokens now 0.
Housekeeping: stray `scripts/__pycache__/` deleted, `__pycache__/` + `*.pyc`
now gitignored. No app code changed. Next look: the ~2026-09-10 recheck in
`TASKS.md`. Record: `CHANGELOG.md` 2026-09-03.

## (superseded) Start Here — end of the 2026-09-02 session

**Read this, then `TASKS.md`.**

✅ **DEPLOYED + production-verified 2026-09-02 (end of night) — owner:
"pushed and deployed successfully".** Verified over HTTP: `/`, `/shop`,
product page 200; `/admin` 307; `Permissions-Policy` now
`microphone=(self)`; deployed CSS carries the dock/⋯ rules with no overlay
residue. Staging equals source. **Owner spot-checks still owed on the
phone against production** (Edit + Add Product; a Spanish re-translation
save; the mic on https) — `TASKS.md` top. The batch had PASSED the owner's
Safari review over the LAN dev server (`http://desktop-ssfdjdu.local:3007`)
before the push. Contents of the push: the revert of the failed overlay batch · option B compact action
row + ⋯ sheet (Clone / Undo / Save + Add Another / Regenerate Missing
Spanish) · option C hide-on-scroll dock with non-scroll show triggers and
the remaining-room guard · 16px editor fields on touch · slim phone header
(101 → 49px) · row action menu portaled to `<body>` with a tappable,
non-bubbling backdrop · thumbnail-rail `scrollLeft` fix · Permissions-Policy
`microphone=(self)` (the assistant's tap-to-talk was blocked by our own
header; mic still needs https/localhost) · save-time Spanish re-translation
when the English changed (existing listings included; hand-edited Spanish
never overwritten). Gate 1197/1197 ·
build 74 = 34/34/6 · staging synced (follow-up dry run 0). After deploy:
nothing to submit; owner spot-checks Edit/Add on the phone against
production once. Records: `TASKS.md` top; `CHANGELOG.md` 2026-09-02.

🟡 (superseded) **IN FLIGHT (2026-09-02, late): option B is BUILT on top of the revert
and awaits the OWNER's phone review on the LAN dev server before the
push.** Compact one-line action row on phones (Cancel · Save · Save &
Close · ⋯ sheet), in flow, no scroll logic; 16px editor fields on touch
(stops iOS tap-to-zoom). Phone URL `http://10.0.0.208.nip.io:3007/admin`
— needs the owner to add `nip.io` to the Turnstile widget hostnames in
Cloudflare once (raw IPs are not accepted). Gate green (1197/1197 · build
74 = 34/34/6). Staged together with the revert. Detail + owner checklist:
`TASKS.md` top; design rationale: `features/admin-listing-editor-mobile.md`.

✅ (done, bundled with the above) **2026-09-02, late: the phone listing-editor batch is
REVERTED — the editor is back to the layout that worked for months.**
Follow-up 3 went live and Safari mobile was "wonky" (row hid and never
returned — the in-flow collapse grew the scroll area until nothing could
scroll, so no event could bring it back) while Chrome iOS worked but put
the row behind Chrome's bottom toolbar (`h-svh` does not exclude it).
Owner: revert, then audit and PLAN instead of guessing. Reverted: admin
viewport lock, 16px touch inputs, `touch-action`, touch guards, the whole
hide-on-scroll row. Kept: the thumbnail-rail fix. Gate on the reverted
tree: `tsc` · lint · **1197/1197 (116 files)** · build 74 = 34/34/6.
**The audit + plan: `features/admin-listing-editor-mobile.md`** — step 1
is an instrumented diagnostic build measured on the owner's actual Safari
before any fix is chosen. Nothing is to be built until the owner picks
from the plan.

🟡 (superseded by the revert) **DEPLOY OWED (2026-09-02, night follow-up 3): follow-up 2 went live
and the collapsed editor STILL could not scroll on Safari mobile.** The
overlay design is abandoned: the Save row is back IN FLOW (the geometry
that worked for months) and hides by COLLAPSING its height as it slides
down, so the form grows into the space. No spacer, no padding, nothing
under the row. Handler ignores the scroll event a toggle causes and no
longer forces the row visible at the end. Built, gated (1203/1203 · build
74 = 34/34/6), **staged**. Detail: `CHANGELOG.md` 2026-09-02 (night,
follow-up 3). Owner walkthrough in `TASKS.md`.

🟡 (superseded by follow-up 3) **DEPLOY OWED (2026-09-02, night follow-up 2): the phone editor still
could not scroll on Safari mobile with follow-up 1 live.** Real cause:
**Safari drops the block-end padding of a flex-column scroll container**,
so the space reserved under the overlaid Save row never existed on the
phone; with all accordions collapsed nothing scrolled and the last
accordions were unreachable ("locks again when I close the accordion").
The space is now a `::after` flex item with an explicit height (every
engine counts it). Follow-up 1's `touch-action: manipulation` stands. Built,
gated (1202/1202 · build 74 = 34/34/6), **staged**. Owner-side after the
push: Safari mobile → Edit AND Add Product → scroll works immediately with
everything collapsed, Facebook accordion reachable, row hides/returns.
Detail: `CHANGELOG.md` 2026-09-02 (night, follow-up 2); checklist in
`TASKS.md`.

✅ **2026-09-02 (late night): the phone listing-editor + thumbnail-rail batch
is DEPLOYED and production-verified** (routes 200, deployed CSS carries the
editor rules, lightbox/page rail at 1920 move one card per click against
production). Staging equals source. Two owner-only checks remain in
`TASKS.md`: the phone editor (behind login) and a real-click look at the
lightbox on the 1920px computer. The block below is the build record.

🟡 (superseded) **The phone listing-editor batch
was BUILT and gated before deploy.** Admin-only
viewport zoom lock (new `admin/layout.tsx`), 16px editor inputs on touch +
`touch-action` + two-finger guard (the accidental zoom was iOS tap-to-zoom
on 14px inputs, not a pinch), and the mockup-approved hide-on-scroll Save
row on phones. Gate: `tsc` · lint · **1200/1200 (116 files)** · build ·
74 = 34/34/6. It sits behind admin login, so the verification is the
OWNER's phone at `http://10.0.0.208:3007/admin` (dev) — then bundle into
the next push. Details: `TASKS.md` top item, `CHANGELOG.md` 2026-09-02
(night). Staging NOT yet re-synced with it.

**Bundled into the same batch (late night): the product-gallery thumbnail
rail "fast total cycle" is FIXED** — the fit's width re-measure let the
browser clamp `scrollLeft` to 0 on displays wider than the strip (any
1920px monitor), so every lightbox arrow click eased from the first
thumbnail out to the active one. One-line save/restore in
`ProductImageGallery.tsx` + a source guard; pane-verified at 1920 and 2100
(lightbox AND page rail). Reproduced on the owner's second computer
against production, so **after deploy, the owner should re-check the
lightbox on that 1920px machine** (the only place it ever showed). Gate
now **1202/1202 (117 files)**. Detail: `CHANGELOG.md` 2026-09-02 (late
night).

Also learned this session: the newest product (#132, the 10K triple-row
diamond tennis bracelet, 18 photos) uploaded cleanly but every photo is
**JPEG** — the browser used could not encode WebP, so the honest fallback
fired exactly as designed. Nothing mislabeled, cache metadata correct, CDN
delivers 39 KB at `w=640`. Owner will try Chrome next time.

Otherwise nothing is in flight and staging equals
source. Two batches went live today, both production-verified: (1) the
three SEO guide pages (+ owner's FAQ corrections, IndexNow 200 for six),
and (2) sitewide breadcrumbs — schema AND a visible trail on every sitemap
page and product page — with the JewelryStore `alternateName` aliases
dropped. Open work is owner-side only: GSC Request Indexing (12 URLs,
quota-bound), the standing citation / GBP items in `TASKS.md`, and a look
at Search Console → Enhancements → Breadcrumbs in mid-September. Owner's
standing asks from this session: **use their real Chrome, not the in-app
Browser pane, for browser work**; **each Netlify deploy costs credits, so
bundle follow-ups before asking them to push**; dental gold is **never**
priced in store (sent out for karat testing first).

### ✅ 2026-09-02 (evening) — BreadcrumbList schema + VISIBLE breadcrumb trail on every sitemap page, schema aliases dropped — DEPLOYED and production-verified

**LIVE.** HTTP scan of 55 production URLs (EN + ES): one trail + one
schema each, names identical, homepage clean, `alternateName` gone;
screenshots in the owner's Chrome match the approved mockup. Nothing to
submit. The narrative below is the build record.

### 📜 2026-09-02 (afternoon) — build record

Owner asked about Google sitelinks (competitor shows them, we don't).
Answer recorded in `DECISIONS.md`: algorithmic, brand phrase is generic,
so we fixed the controllable signals — one breadcrumb helper
(`lib/breadcrumb-ld.ts` + `BreadcrumbJsonLd`) on all 26 sitemap pages
except `/` plus product pages, a **visible "Home › Sell Gold" trail**
(`BreadcrumbTrail`, mockup-approved) above the eyebrow of every one of
those pages, and `alternateName` removed from the JewelryStore schema.
Bundled into ONE deploy at the owner's request (Netlify credits). Gate:
`tsc` · lint · **1195/1195 (115 files)** · build · 74 = 34/34/6 ·
prerendered-HTML scan 58/58 pages (one trail + one schema, identical
names) · visual QA in the owner's Chrome (10 desktop pages) + 375 px pane.
Nothing to submit after deploy; Google re-reads on its own schedule.

### ✅ 2026-09-02 — THREE SEO GUIDE PAGES DEPLOYED and production-verified; IndexNow 200 for all six

**LIVE** (owner pushed the same day; verified over HTTP: six URLs 200 with
3/3 JSON-LD incl. FAQPage, corrected strings present, parent links live,
sitemap 200 URLs with the guides at 2026-09-02; `npm run indexnow` → 200 OK
for 6). Only GSC Request Indexing remains, quota-bound (12 URLs). The
narrative below is the build record.

### 📜 2026-09-02 batch — THREE SEO GUIDE PAGES built, gated, FAQ copy READ + CORRECTED by the owner (build record)

`/gold-services/what-is-my-gold-worth`, `/jewelry-appraisal/hallmarks`,
`/estate-services/selling-inherited-jewelry` (+ES), each on the
flatware-value template with FAQPage + BreadcrumbList schema, nested under
its parent service page, linked from all four parents and `/sell`, in the
sitemap at 0.6 with `CONTENT_LAST_MODIFIED` → 2026-09-02. Claims limited
to copy already on the site; legal questions deferred to an attorney; no
written appraisals promised. **Owner read all 15 FAQ answers on 09-02 and
corrected four things on the gold guide — ⛔ dental gold is sent out for
karat testing before purchase (never priced in store), the karat table
runs 8k–24k incl. 9k/12k/15k/20k/21k/23k, "14K HGE / 18K HGE" = plated,
"14KP" = plumb NOT plated — mirrored into the hallmarks tables; rules in
`DECISIONS.md`.** Gate on the corrected tree: `tsc` · lint · build ·
**74 = 34/34/6** · both guides re-verified over HTTP. **After deploy:**
the six-URL `npm run indexnow` command in `TASKS.md`, then GSC requests
as quota allows (12 owed in total now). Detail: `TASKS.md` top item.

### ✅ 2026-09-01 (night) — /watch-buyers + schema logo switch + "Naples Jewelry Buyers" logo removal DEPLOYED and production-verified

Owner pushed; verified over HTTP: JSON-LD `logo` = the octopus on `/`,
`/es`, `/sell/naples`; `/logo.png` 301 → `nav-logo.webp`; old `logo.webp`
404; watch pages 200 with 3/3 JSON-LD; sitemap 194; ES footer 25/26;
IndexNow 200 for the two watch URLs. GSC: parked requests still
quota-blocked. Citations: audited, kit delivered to the owner; every
remaining listing needs their own account. Review QR card delivered (no
repo asset). Detail: `TASKS.md`, `CHANGELOG.md`.

### ✅ 2026-09-01 — /silver-services internal-linking pass + homepage silver card DEPLOYED and production-verified

**Everything below is LIVE** (owner pushed the same evening; verified over
HTTP minutes later — 14/14 link combos, four homepage strip cards in both
locales, `.home-services-grid` in the deployed CSS, ES footer "Vender Plata
Esterlina", footer-scoped ES check unchanged at 24/25). No SQL, no env vars.
✅ **PSI re-checked the same evening: mobile 72 · 91 · 79 · 77 · 79 (median
79), desktop 70 · 95 · 99 — the documented distribution, no movement;
a11y/BP/SEO 100 on every run.** Nothing outstanding from the deploy. The
narrative below is the build record.

**🆕 Bing Webmaster Tools (owner imported from GSC 2026-09-01):** sitemap
imported and crawled the same day (Success, 198 URLs), but Bing's index
held only **~15 URLs** and the city pages were "Discovered but not
crawled". No block (Bingbot 200s, clean robots). **Done the same evening:
27 key URLs (EN + ES) submitted via Request indexing, all "Success"; the
two 08-30 pages were stuck on the 404's `noindex` from a pre-deploy crawl
and were re-requested. IndexNow DEPLOYED and the first push done the same
night — key file live (200 `text/plain`), `npm run indexnow` → 202
Accepted for 192 URLs. Bing Places IMPORTED from the GBP the same night
(verified, "Pending publish" 7–12 days, weekly sync on, every field matches
the site's JSON-LD).** The "alt missing" notice is a false positive on
decorative marks — do not "fix" it. Detail in `TASKS.md` (top two items).

Owner asked whether the homepage H1 should say "Sterling Silver" instead of
"Sterling". **Decided NO on evidence** (GSC: bare-"sterling" queries = 15
impressions / 0 clicks in 16 months, all already containing "silver";
`/silver-services` already owns the phrase and takes 22 of the 68 silver
impressions vs the homepage's 8; and the H1 would go 46 → 53 chars, past the
documented 4-line threshold). Rule recorded in `DECISIONS.md`.

The follow-up shipped: **every older sibling sell page now carries one
contextual link to `/silver-services`** — `/bullion`, `/gold-services`,
`/estate-jewelry` (previously zero silver mentions), `/faq`, `/about`,
`/trade-in` — plus two anchor fixes (footer ES "Vender Plata Esterlina";
`/sell` "Sterling silver flatware"). New `LinkedPhrase` component keeps
JSON-LD-fed copy single-sourced. ⛔ `/free-evaluation` deliberately NOT
linked (conversion endpoint). Gate: `tsc` · lint · **1192/1192 (114
files)** · build exit 0 · **66 = 30 EN + 30 ES + 6** · 14/14 page-locale
HTML checks · 0 console errors. No SQL, no env vars. Detail: `CHANGELOG.md`.

✅ **Staging synced 2026-09-01 (17 files, 0 Extras, follow-up dry run 0,
leak check clean vs a 184-`.tsx` control) — awaiting the owner's copy +
push.** After deploy, spot-check one page per locale for the new link (e.g.
`/gold-services` + `/es/faq`) and `/` for four strip cards; the
footer-scoped ES check now expects **"Vender Plata Esterlina"**, not
"Vender Plata". Evidence in `TASKS.md`.

**✅ Homepage services strip — fourth card BUILT (owner chose B, later
2026-09-01).** "We Buy Sterling Silver in Naples" → `/silver-services` now
sits second in the strip, an `<h2>`-weighted link from the page carrying 38
of 44 clicks. 🔴 Found while building: the strip's `md:grid-cols-3` had
NEVER applied — `.responsive-card-grid` is unlayered and Tailwind's
`grid-cols-*` live in `@layer utilities`, so no utility could ever win
there. Columns are now pinned 1 / 2 / 4 by `.home-services-grid` in
`globals.css`; measured on a restarted dev server at 375/700/900/1024/1280:
the fourth card is never stranded, 0px overflow. Re-gated: `tsc` · lint ·
**1192/1192** · build exit 0 · **66 = 30/30/6**. Deploys with the batch
above. ◻ After deploy, re-check PSI mobile across several runs (below the
fold + one lazy 88px WebP — expect no movement; bimodal rule applies).

### (superseded) ✅ THE SEO BATCH IS DEPLOYED (2026-08-31) and production-verified

A full local-SEO growth audit (Claude artifact, owner has the link) was
implemented item by item with owner approval. Staging synced 2026-08-31 (894
files, dry-run 0 to copy), owner pushed the same morning, and production was
verified: all new/changed routes 200 in both locales, new `/sell/naples` H1 +
showroom band live, feed live (76 items / 0 sold, correct headers), robots
carve-out live. **The Merchant Center swap is also DONE** (feed source added
US-only + daily, crawl source stopped) — details and watch-items in
`TASKS.md`. GSC: 1 of 6 indexing requests landed before quota ran out;
**the remaining 5 are PARKED by owner decision** (sitemap resubmitted covers
discovery). No SQL, no env vars.

**Also closed 2026-08-31, second deploy of the day:** the recurring hero
"blank second card on cold loads" was fully root-caused and fixed in three
layers — fetchPriority (08-30), Storage cacheControl backfill (942/942 at
31536000), and the reveal gates now waiting on the first two card images +
`decode()` (cap untouched). **Owner-confirmed fixed on a genuinely COLD
load.** Durable rules in `DECISIONS.md` → *Media & hero loading (2026-08-31)*.

**What deploys with the next push** (gate: `tsc` · lint · **1186/1186 (113
files)** · build exit 0 · **66 prerendered = 30 EN + 30 ES + 6 non-locale** ·
0 console errors):

1. `/sell/naples` retargeted to "Jewelry Buyers in Naples, FL" (buyer-noun
   family; ends the homepage title cannibalization) + Naples-only showroom
   band + walk-in FAQ. Other 5 city pages behaviorally unchanged (verified).
2. **3 NEW pages ×2 locales**: `/jewelry-appraisal` (free verbal offers vs
   written insurance appraisals — we REFER paperwork out, owner decision),
   `/silver-services/flatware-value` (the flatware value guide),
   `/diamond-buyers` (lab-grown: we BUY them, priced against their lower
   resale market — owner decision).
3. Internal-link pass: city-card headings → service pages; product pages get
   a category-gated "we buy gold/silver" crossover band; footer gains "Sell
   Diamonds" + "Free Appraisals"; sitemap +6 URLs.
4. **`/api/merchant-feed`** (2026-08-31): Google Shopping feed — available
   products only, `nej-<inventory#>` ids, canonical pricing, fail-closed 503
   on stale spot, `X-Robots-Tag: noindex`, robots.txt carve-out. After deploy:
   Merchant Center swap (scheduled daily fetch on, crawl source off) — steps
   in `TASKS.md`.

⚠️ **After deploy, the footer-scoped ES re-check reads 24/25, not 22/23** —
that is the new links landing, not a regression (trap note in `CHANGELOG.md`).

**GBP is transformed and LIVE** (detail in `CHANGELOG.md`): services filled
across all 7 categories (Diamond buyer added), ALL 23 reviews replied
(owner-approved each), first Google Post published (silver/flatware + Learn
more → /silver-services), booking link → /free-evaluation, Facebook social
link, opening date Jan 2010. ⛔ GBP Q&A seeding is impossible — Google retired
the module on this listing. ✅ **All 7 owed Request Indexing calls went
through** — that standing item is CLOSED.

**◻ Open owner items:** GBP photo batch (item 4, owner-held); Merchant Center
product feed (needs owner ToS clicks at merchants.google.com); flatware
"recent purchases" proof-strip data (2–3 real lots); decide whether to align
the /silver-services maker card with the new top-tier-only framing; decide
Facebook grow-vs-retire; gov-ID line question (owner rejected the gov-ID Q&A
for GBP — the /sell/naples checklist still carries the ID line, owner has not
yet said whether to remove it there too).

### (superseded) Start Here from the earlier 2026-08-30 footer/docs session

**Read this, then `TASKS.md`.**

### 🟢 END OF SESSION 2026-08-30 — four things shipped, nothing pending

All deployed and verified. **No SQL, no env vars, no manual steps owed** beyond
the standing Request Indexing item (7 URLs, still quota-blocked).

1. **Spanish-footer locale bug** — five pages served an English footer that
   stripped `/es` from every link. Fixed, deployed, and made structurally
   impossible to repeat (`SiteFooter`'s `locale` prop is now required).
2. **The "static page count" invariant was retired** — it was never an
   invariant. `STRUCTURE.md`/`INTEGRITY.md` carry the stable measure instead.
3. **Blank hero-carousel card** — owner-reported, deployed, **owner-confirmed
   fixed**.
4. **659 of 882 bucket objects were PNG under `.webp` names** (1,116.9 MB →
   99.4 MB), plus a pre-existing high-severity `nanoid` advisory closed.

⚠️ **Read this before trusting any measurement in today's entries.** Four
measuring mistakes were made and corrected; two would have caused real harm —
one declared a healthy deploy broken, one nearly aborted a correct 1 GB repair.
All four are durable traps in `DECISIONS.md`: unscoped `grep` for a chrome
assertion, `curl` without browser `Accept` headers, measuring the `src` fallback
instead of the `srcset`/`sizes` width, and `extractChannel(3).stats()` returning
RED rather than alpha.

ℹ️ **The session's own lesson: a green gate is not a fixed symptom.** The
carousel fix was proven only by the owner's cold load, and the payload theory
that looked well-evidenced turned out to be wrong.

### 🟢 2026-08-30 (later) — blank carousel card DEPLOYED, OWNER-CONFIRMED FIXED

Owner-reported: on first load the second hero card (a thick gold ring) stayed
blank until it had nearly rotated off-screen.

**Cause: `fetchPriority`, not payload.** Slot 0 was `high` and *every* other slot
`low`, so slot 1 — adjacent to the front card, among the first seen — shared a
bandwidth lane with slot 7. Now **`auto`** for slot 1 only (never `high`).
`src/lib/storefront-image-loading.ts`, +2 regression tests.

**Found along the way: 659 of 882 bucket objects (75%) were PNG under `.webp`
names**, because `canvas.toBlob` silently substitutes PNG and the upload
hardcoded a `.webp` name and content-type. Re-encoded: **1,116.9 MB → 99.4 MB**,
0 failed, backups at `C:\Users\rcman\NEJ-image-backup-2026-08-30`. Upload path
fixed so it cannot recur (`src/lib/image-encode.ts`).

Also closed a pre-existing **high-severity `nanoid`** advisory found by running
the `npm audit --omit=dev` checklist item (transitive via postcss, build-time
only, no direct use). `overrides` entry → 3.3.18; audit now **0 vulnerabilities**.

Gate from a deleted `.next`: `tsc` · lint · **1186/1186 (113 files)** · build
exit 0 · **60 routes = 27 EN + 27 ES**. ✅ Visual before/after confirmed on 3
re-encoded images (colour, gemstones and fine repoussé detail all preserved).
✅ Production product pages 200 with images serving as `image/webp`.

✅ **DEPLOYED and confirmed.** Production emits `high / auto / low…` across the
ring, and origin objects still return `image/webp`. **The owner confirmed the
symptom is gone** — the second card now appears with the rest instead of
staying blank until it has nearly rotated away.

🟢 That closes the loop the gate could not: no test proved the symptom fixed,
only a real cold load could, and it did.

ℹ️ Backups (1.1 GB) at `C:\Users\rcman\NEJ-image-backup-2026-08-30` are the only
rollback for the re-encode. Keep until the owner is satisfied, then delete.

⚠️ **Read the `CHANGELOG.md` correction before trusting any earlier note here
about image sizes.** Two measurement traps produced confident wrong answers:
`curl` without browser `Accept` headers, and measuring the `src` fallback
(`w=3840`) instead of the width `sizes` actually resolves to (`w=640`).

### 🟢 2026-08-30 — earlier in the session: footer + docs work (all deployed)

Two things happened today, both closed out. **Nothing is undeployed, no SQL, no
env vars, no manual steps owed** beyond the standing Request Indexing item.

1. **A Spanish-footer locale bug** — found, fixed, deployed, verified live, and
   made structurally impossible to repeat (`SiteFooter`'s `locale` prop is now
   required). Details below.
2. **The "static page count" invariant was retired** — it was never an
   invariant. `STRUCTURE.md` and `INTEGRITY.md` now carry the stable measure
   instead. Details below and in `CHANGELOG.md`.

◻ **Still the only open item, unchanged from 08-29:** the **7 Request Indexing
calls**, still property-wide quota-blocked. ⛔ Next attempt: submit ONE url and
continue only if it succeeds (list + rule in `TASKS.md`).

⛔ **A mail-in / "ship us your items" page was proposed and REJECTED this
session** — do not re-propose it without reading `DECISIONS.md` first. Florida
licenses it separately (Ch. 538 Part III), and the site's own copy actively
argues against mail-in.

### 🟢 2026-08-30 — Spanish footer fix DEPLOYED and production-verified

Five pages rendered `<SiteFooter />` with no `locale`, so on `/es` the footer
came out in English **and stripped `/es` from all 23 hrefs** — every footer
link ejected Spanish visitors into the English site. Fixed in
`silver-services`, `gold-services`, `faq`, `estate-services`, `bullion` by
passing `locale={locale}`, then the prop was made **required**.

✅ **Confirmed on production**, footer-scoped: all five now read **22/23
Spanish links + ES chrome**, matching the `/es/sell` control exactly (the 1 is
`/review`, by design). They were **0/23 with an English footer**. Negative
control passes — `/faq`, `/bullion`, `/shipping` still read **0** `/es/` footer
links with English chrome. Gate: `tsc` · lint · **1176/1176 (112 files)** ·
build clean at **60 prerendered routes = 27 EN + 27 ES**. No SQL, no env vars.

🔴 **If you ever re-check this, scope the grep to the `<footer>`.** A
whole-page `href="/es/` grep reports 24 on `/es/*` (header nav) and 1 on
English pages (the language switcher) — two false alarms that both read as a
failed deploy. Command and full trap in `TASKS.md`.

✅ **The prop is now REQUIRED** (`locale: string`, no default), so this cannot
silently recur — a missing prop is `TS2741` at the call site. Mutation-tested.
It needed no call-site changes: all 21 already passed `locale={locale}`.

⛔ Durable rule in `DECISIONS.md` → *"`SiteFooter`'s `locale` prop is REQUIRED —
never give it a default again"*. Detail in `CHANGELOG.md` 2026-08-30.

✅ **Staging synced and PUSHED** (2026-08-30): 11 files queued and copied,
0 Extras / 0 Mismatch / 0 FAILED, follow-up dry run 0. 888 files / 20.24 MB.
Leak check clean against a **181 `.tsx` positive control**; staged `SiteFooter`
verified to carry the required prop and **0** bare `<SiteFooter />` remain.
Full evidence in `TASKS.md`. (Staging now drifts by memory docs only — the
owner's accepted standing preference.)

### ✅ 2026-08-30 — the "static page count" invariant is RECONCILED (it was never an invariant)

`STRUCTURE.md` said 456, an entry below says 458, the build says 457 — **all
three were correct when written.** Measured this session: the
`✓ Generating static pages (N/N)` line is a **progress counter**, not a page
count, and it moves with the **catalog**, because
`shop/[id]/page.tsx:187` enumerates every `available`/`sold` product (2 per
product) during that phase. None of those pages are prerendered — `/shop/[id]`
builds as **ƒ dynamic**, since it reads visibility from the session.

⛔ **Stop treating that line as an invariant.** The stable figures, from
`.next/prerender-manifest.json`: **60 prerendered routes = 27 EN + 27 ES + 6
non-locale, 0 product pages.** ⭐ **`en === es` is the check worth making** —
it directly asserts the EN/ES pairing rule and inventory cannot move it.

The `<Suspense>`/`RouteProgressBar` regression it was meant to catch is real and
still guarded; `STRUCTURE.md` now carries the one-line manifest command to use
instead. Historical 454/456/458 figures in entries below are left as written.

### 🟢 2026-08-29 END OF SESSION — content batch DEPLOYED + verified; one quota-blocked item remains

**Everything from the 3-day SEO session (08-27 → 08-29) is live and
production-verified.** The final batch — `/sell` value guide, 12 city-intro
extensions, `/silver-services` flatware band, `CONTENT_LAST_MODIFIED` bump —
deployed and probed in both locales (table in `CHANGELOG.md`). Clicks ticked
44 → 49 during the session.

**◻ The ONLY open item: 7 Request Indexing calls**, still property-wide
quota-blocked even at a later-day retry. ⛔ Next attempt: submit ONE url,
continue only if it succeeds (rule + url list in `TASKS.md`).

**👀 Watch over the coming weeks (no action):** `/silver-services` position on
flatware queries (was ~12 — likeliest first non-brand click), the ~100 Spanish
URLs newly submitted via the bilingual sitemap, the 40 pages re-signalled with
`lastmod 2026-08-29`, and the two `/account` rows migrating from "Blocked by
robots.txt" to "Excluded by noindex".

**🟡 The real ceilings, unchanged:** Google Business Profile (reviews via
`/review`, the Spanish-speaking market) and backlinks. Content is now ahead of
authority.

### 🟡 2026-08-29 (mid-session) — /sell value guide + city-intro extensions + /silver-services flatware band BUILT — superseded by the block above

`/sell` (the hub — was 444 words, thinner than its own city pages, position 64)
gained the karat-purity table, the weight × purity × spot math with a worked
example, and the "Before You Sell" band, in both locales. ⛔ **Deliberately NOT
added to the six city pages** — they are 69% verbatim-identical already, and
their template renders the site's best-ranking pages (`/es/sell/cape-coral`
position 5.3). Contextual link added to `/silver-services` (position 12.2, the
striking-distance page and the plan's step 2). `CONTENT_LAST_MODIFIED` bumped
to 2026-08-29. Gate green; detail in `CHANGELOG.md`.

### 🟢 2026-08-29 — everything is DEPLOYED, verified, and nothing is outstanding

All 2026-08-27/28 work is live and production-verified: `robots.txt` unblocked,
`nofollow` on the inquire links, the **bilingual sitemap (198 URLs, 99 EN / 99
ES)**, the `sameAs` entity fix, `/review` (302 → the Google review form, linked
from the testimonials CTA and the footer in both locales), and **22 testimonials**.

✅ **Saturday hours resolved by the owner** in Admin → Settings → Store Hours.
Production emits two specs — Mon–Fri 11:00–15:00 and **Saturday 11:00–16:00** —
matching the Google Business Profile exactly. 🟢 First production proof the
split-week JSON-LD grouping works when one day diverges.

✅ **Google re-read the sitemap unprompted**: last read Aug 28, Success,
**198 discovered pages**. No resubmit needed — considered and skipped as a no-op.

◻ Only open item: **7 remaining Request Indexing calls** (daily quota, ~10/day,
shared per site). 🟢 Two of the batch were found already indexed, so Google is
reaching these on its own regardless.

### 🔴 2026-08-28 (later) — reviews 16→22, `/review` links BUILT; Saturday hours need an ADMIN fix

Testimonials caught up to the live profile (**22**, verbatim). "Leave a Review"
now appears in two places — the testimonials CTA (homepage + every product page)
and the footer Company column — both plain `<a>` to `/review`, both bilingual.

🔴 **Owner action, no deploy:** Google says **Saturday 11 AM–4 PM**, the site says
11–3. Fix in **Admin → Settings → Store Hours**. The `HOURS` fallback cannot
express per-day times and is knowingly one hour short on Saturday.

### 🟡 2026-08-28 — `sameAs` entity fix + `/review` (BUILT, not deployed)

`sameAs` claimed `naplesjewelrybuyers.com` — a competitor's trading name with
its own verified GBP — in **two** places (sitewide `layout.tsx` + every
`/sell/[city]` page). Now single-sourced as `SAME_AS` in
`business-location.ts`: verified GBP CID + Instagram + Facebook. Built output
contains **0** references to the old domain.

New `/review` route → the one-click Google review form (verified to be this
business: the link's embedded hex CID decodes to 17050430560749692864).
⛔ It is a route handler, not a `next.config` redirect (those never fire on
Netlify), and it needed `review` added to the proxy matcher exclusions.

ℹ️ An external SEO review suggested six items; **four were already done** —
single-sourced hours, the Spanish locale, and the testimonial `aria-hidden`.
Detail in `CHANGELOG.md` 2026-08-28.

### 🔴 2026-08-27 (latest) — Search Console audit; 2 SEO fixes BUILT, NOT deployed

A full Google Search Console audit, plus two code changes that came out of it.
**Both are locally verified and undeployed** — production still serves the old
`robots.txt` and the old product pages. No SQL, no env vars, nothing to run in
Supabase.

**Where search stands.** 192 indexed / 213 not indexed (report stamped 8/20/26);
89 / 26 when filtered to sitemap-submitted URLs. Performance 8/1–8/25:
**44 clicks · 1.09K impressions · 4% CTR · average position 36.7.** No manual
actions, no security issues. ✅ The **sitemap resubmission that had been open
since 2026-08-17 is DONE** — read Aug 27, Success, 99 pages.

**Fix 1 — `robots.txt` was defeating its own `noindex`.** `/account` and
`/checkout` were blocked in `robots.txt` *and* emitting
`robots: { index: false, follow: false }`. The crawl block stops Googlebot
fetching the page, so it can never read the `noindex` — the tag was
unreachable. Six entries removed from `src/app/robots.ts`. ⛔ **`/admin` stays
blocked**: it only *looks* noindexed because a logged-out request redirects to
`/account/sign-in`; its own metadata carries no robots directive.

**Fix 3 — the sitemap now submits BOTH locales**, 99 → **200 URLs** (100 EN +
100 ES, verified paired, 0 `noindex` leaks, 0 `/en/`), each carrying
`en`/`es`/`x-default`. No `/es` URL had ever been submitted — despite the
Spanish pages outranking their English twins (`/es/shop` **9.7** vs 42.6).

**Fix 2 — the two `/contact?item=` inquire links are `rel="nofollow"`**
(`shop/[id]/page.tsx` 758, 767). ⛔ Do **not** "improve" this by adding
`Disallow: /contact?item=` to `robots.txt` — that repeats Fix 1's bug and would
break the canonical consolidation that is currently working correctly.

**🔎 The 20 unindexed product pages are NOT sold — 19 are live inventory**
totalling **$9,633** ($49–$2,993), all in the sitemap, all `Last crawled: N/A`.
Only 1 is `SoldOut`, and it is correctly absent from the sitemap. Control that
settles it: a `SoldOut` chain (`14k-infinity-rope-chain-necklace-01`) **is**
indexed, so being sold does not cause "Discovered - currently not indexed."

**◻ 18 Request Indexing calls still owed.** Only 1 of 19 went through before
**Quota Exceeded**; the quota is **per site, shared across properties**, so the
new Domain property is not a workaround. Retry tomorrow.

**New GSC property:** `sc-domain:naplesestatejewelry.com` (Domain type),
auto-verified off the existing DNS TXT — no DNS change. ⚠️ Do not delete that
`google-site-verification` TXT; it now verifies two properties. The three
project properties do not conflict, and the `.co` → `.com` change of address is
intact (started Aug 2, 2026).

**🕐 Store hours: Monday is OPEN as of 2026-08-27 (owner-confirmed).** The live
site was already right; the repo was stale. `HOURS` in `business-location.ts`
now reads Mon–Sat, and `PROJECT_OVERVIEW.md` matches. ⛔ That constant is only
the fallback for a null/unreachable DB row — **the admin panel is the source of
truth and the owner changes hours on the fly.** Never hardcode days into prose
or metadata.

⚠️ **The real ranking problem is not indexing — it is CTR at position 36.7.**
"estate jewelry buyers" drew 60 impressions and **0 clicks**; `/sell/naples`
drew 220 impressions for 1 click. Detail in `CHANGELOG.md` 2026-08-27.

### 🟢 2026-08-25 — store hours + homepage banner are LIVE and in real use

The homepage promo strip is now editable from **Admin → Settings → Homepage
Banner**: both fragments (eyebrow + message), EN + ES with per-field fallback,
a link on/off toggle, an editable destination from a curated allow-list, and a
master show/hide. Stored as `shop_settings.home_banner` jsonb; degrades to the
current promo copy when unconfigured (verified byte-identical in EN and ES).
⚠️ The strip is `nowrap`, so the 2026-08-14 320px measurement is now
ENFORCED as a character budget (warn at 48, block at 53) in both the panel and
the parser. Link off = plain `<div>`, no arrow, no hover/focus (CSS rescoped
to `a.home-announcement`). Gate: `tsc` · lint · **1176/1176 (112 files)** ·
build **458/458**.

✅ **BOTH migrations are RUN** (`store-hours-2026-08.sql` and
`home-banner-2026-08.sql`) and both columns verified `null` via the anon REST
key — built-in defaults serve until an admin saves. ✅ **All three banner
render paths were then exercised against the real DB** (link off → `<div>` with
no arrow; banner off → no element, page still 200/one `<h1>`; custom
destination → `/shop` + `/es/shop` with ES falling back to English), and the
column restored to `null`. 🟡 **Nothing blocks the deploy**; the only remaining
checks need production (first save of each panel + the Netlify durable-cache
behavior of `revalidatePath('/', 'layout')`) — see `TASKS.md`. Durable rules:
`DECISIONS.md` → *"Homepage Announcement Banner"*. Detail: `CHANGELOG.md`
2026-08-25.

✅ **Staging synced and ready to push** (`C:\Users\rcman\NEJ-repo-staging`,
**887 files / 20.14 MB**): 44 files queued and copied, 0 Extras / 0 Mismatch /
0 FAILED, follow-up dry run 0, leak check clean against a **181 `.tsx`**
positive control. Gate from a deleted `.next`: `tsc` · lint · **1176/1176
(112 files)** · build **458/458**. Full evidence in `TASKS.md`.

🟢 **DEPLOYED and validated the same evening.** Post-deploy smoke: 10 routes
200, one `<h1>`, prose sweep landed. **The owner then used both panels for
real** (DB `updated_at` 2026-08-26T03:43Z): Wednesday marked closed — the
JSON-LD correctly emits the non-contiguous `["Tuesday","Thursday","Friday",
"Saturday"]` — plus a **link-OFF** banner announcing the closure, which
production renders as a `<div>` with 0 anchors and 0 arrows in both locales.

✅ **The open caching question is CLOSED: `revalidatePath('/', 'layout')` works
on Netlify's durable cache.** Both saves propagated to the statically
prerendered homepage in EN and ES with no code change. ⛔ The documented
`export const revalidate = 3600` fallback is **not needed** — do not add it.

◻ Soft follow-up only: the live copy is 51/52 chars, inside the 49–53 amber
band; it should fit but deserves a phone eyeball. ⚠️ And the site now advertises
Wednesday closed — mirror that to Google Business Profile, eBay and Etsy.

### 🆕 2026-08-25 (later session) — admin-editable STORE HOURS built; 🔴 SQL + deploy pending

The weekly showroom hours are now editable from **Admin → Settings → Store
Hours** (per-day open/closed + times; mockup approved before building).
Stored as `shop_settings.store_hours` jsonb; every surface — footer,
homepage/contact Visit Us, About, checkout pickup, product trust copy,
shipping policy EN/ES, order-invoice pickup block, JewelryStore JSON-LD —
now reads the schedule through `getStoreHours()` and **degrades byte-identically
to the historical Tue–Sat 11:00–15:00** when unconfigured (verified on the dev
server). ~14 hardcoded "Tue–Sat" prose/meta strings were reworded once to
day-agnostic copy. Gate: `tsc` · lint · **1159/1159 (111 files)** · build
**457/457**.

🔴 **Two manual steps before it's live** (top item in `TASKS.md`): run
`supabase/store-hours-2026-08.sql` in the Supabase SQL Editor, and deploy.
Until both, production is unchanged — the feature is inert-by-default.
Durable rules in `DECISIONS.md` under *"Store Hours"* (pure formatters, no
Intl, sitewide revalidate, prose never names days). Detail: `CHANGELOG.md`
2026-08-25.

### 🆕 UPDATE 2026-08-25 — the hero-freeze batch is DEPLOYED and LIVE

Owner pushed and deployed (~9:42 AM); live site confirmed normal on a normal
machine. The post-deploy "~24% errors" scare in Netlify Observability was
checked the same morning and is **pre-existing eBay-webhook 499s, not this
deploy** — zero server errors in the deploy window; details filed under the
eBay `account_deletion` item in `TASKS.md`. ◻ Still open: the one check that
motivated the whole batch — the owner's weak-GPU desktop (owner will check
later; expect brief choppiness, then a frozen ring, instant freeze on reload).
Original build record below.

### 2026-08-24 (earlier) — weak-GPU hero freeze BUILT, NOT deployed

Owner-reported: the hero carousel is very choppy on an older desktop (weak
GPU, confirmed), and stays choppy after load — the bound is per-frame
compositing of 8–10 large clipped 3D layers, so slowing the spin fixes
nothing. Built (owner chose freeze + housekeeping): **an FPS watchdog freezes
the rings on machines sustaining >40ms median frames** (warm-up 4s, gap
discard, one-way session latch, `?heroFreeze=1/0` debug overrides);
reduced-motion now fully stops the ring; CustomerReveal releases `will-change`
via a new `done` state; the testimonial marquee pauses offscreen. Gate on the
final tree from a deleted `.next`: `tsc` · lint · **1136/1136 (110 files)** ·
build **456/456**. Verified in the local browser: default behavior unchanged
(pane A running, B/C paused, no latch), force-freeze pauses all 3 rings
WITHOUT latching, reveal settles to `done` with the stretched-link overlay
intact, marquee pauses/resumes both directions. ✅ **Staging re-synced
2026-08-25** (12 files exactly as expected, 0 Extras/Mismatch/FAILED, leak
check clean against a 179-`.tsx` positive control — evidence in `TASKS.md`).
(Deployed 2026-08-25 — see the update block above; the weak-desktop check is
the open item.) Durable rules: `DECISIONS.md` *"A machine that cannot hold the
spin gets a FROZEN ring"*.

### 🆕 2026-08-24 (later session) — bot signups: cleaned up, gate LIVE

**UPDATE, end of session: the gate is ACTIVE and verified.** Deployed as
`main@94fe20c`, Netlify site key set, owner saved the Turnstile secret in
Supabase. Tokenless POSTs to signup / password sign-in / recover all return
400 `captcha_failed`. The owner signed in on the live site — the full human check passed.
**Also this session: Supabase auth email moved off the built-in mailer onto
Resend SMTP** (branded sender, 30/hr cap, sending-only scoped key) and
verified delivered — see `CHANGELOG.md`. ⚠️ Never disable the Turnstile gate
while custom SMTP is on: the gate is what makes Resend-backed auth email safe.
⛔ **Never load the live auth pages in the in-app Browser pane** — the real
Turnstile challenge crashed the Claude app twice (forced reinstall); verify
via curl or the owner's own browser only. Original block below kept for the
build/activation detail.

### (superseded) bot signups: cleaned up, gate built, NOT yet active

Five bot accounts (created via direct anon-key calls to Supabase
`/auth/v1/signup`, one every ~3h) were **deleted from admin** — the Users
page now shows 3 accounts / 1 admin, all real. A Cloudflare Turnstile gate on
all four client auth calls is **built, gated, tested (1125/1125, 456/456) and
deployed-inert**: it does nothing until `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
exists AND the Supabase CAPTCHA toggle is on. ⛔ The activation ORDER matters
(code+key first, Supabase toggle last) — the exact runbook is the top item in
`TASKS.md`. Until activated, nothing stops the next bot; expect new junk rows
at ~3h cadence until then. Also still true: `buildMarketingAudience()` counts
unconfirmed accounts as Reachable — the Phase 2 filter is listed in `TASKS.md`.

### The shape, in one glance

✅ **Everything below this line IS deployed (2026-08-24), no outstanding SQL —
and as of 2026-08-25 the hero-freeze batch above is deployed too, so nothing
is undeployed.** (Staging drifts from source only by memory docs — the owner's
accepted standing preference.) Six deploys' worth of work went out 2026-08-24
across two rounds — the five batches below, then the invoice heading fix.

**Second deploy (heading only):** the invoice email `<h1>` went **28px → 20px**
(`SUBJECT_HEADING_PX` in `order-invoice-email.ts`). That heading prints the
generated SUBJECT, so at 28px it wrapped to four lines and filled a phone screen
before any content. **Email-only — nothing on the site changed**, so the real
check is the next invoice or receipt that goes out, not a page load. Post-deploy
smoke check passed anyway: `/`, `/es`, `/contact`, `/es/contact`, `/shop`,
`/checkout`, `/sitemap.xml` all **200**, CSP `frame-src` still carries
`maps.google.com`, homepage still exactly one `<h1>` with the Visit Us block
serving.

**The five, oldest first:** the cookie-banner language-switch fix; the
order-email fixes (footer landmark, wrapping phone, shipping-method label); the
pickup block; the homepage "Visit Us" rebuild; and the contact-page match +
landmark removal + the dev console-warning filter.

### 🔴 TRAP — `CREATE MANUAL ORDER` pulls the product off the public shop

Found 2026-08-24 while sending a real pickup invoice. Creating a manual order
flips the chosen product to **`PENDING PAYMENT`** the moment it is created — no
payment required — which removes it from the public gallery and its product
page. A live $1,040 chain was off the shop until it was restored.

✅ **Recovery is built in:** the order detail page's **`RESTORE ITEM TO
INVENTORY`** button. Use it BEFORE deleting the order.

⚠️ **Two things made this hard to see, and both can mislead again:** `/shop` is
paginated, so a title missing from page one proves nothing; and the admin
product list defaults to a **`Status = Available` filter**, so a product whose
status changed disappears from search entirely rather than showing its new
status. Clear the filter.

⛔ **Never mark a throwaway manual order PAID** — that is what fires the
sold/delist hooks, which would withdraw a real eBay and Etsy listing.

### ✅ The pickup block was sent and confirmed, 2026-08-24

A real email was sent to `info@naplesestatejewelry.com` from the production
admin, and the block renders as designed (address on its own lines, landmark
muted beneath, hours under a hairline). It went as an **Invoice**, not a
Receipt, because the order was deliberately left unpaid; the pickup block,
footer, phone and shipping-method label are identical either way.
📧 Still unconfirmed: how it looks in **Outlook desktop** specifically.

### ✅ Production verification, 2026-08-24 — measured, not assumed

**The reported bug is fixed on the live site**, exercised as a user: accept the
cookie banner, switch EN→ES — it does **not** come back; switch back ES→EN — it
does not come back. ⚠️ And the negative control passes: with consent cleared, a
switch still shows the banner (in Spanish) and does **not** wrongly stamp the
gate attribute. So it does not over-hide.

| Check | Result |
| --- | --- |
| `/`, `/es`, `/contact`, `/es/contact`, `/shop`, `/checkout`, `/cookie-preferences`, `/sitemap.xml` | all **200** |
| `<h1>` per page (9 pages) | exactly **1** everywhere |
| JSON-LD blocks | **every block parses** on all 9 pages + 3 product pages |
| Product pages | 200, `JewelryStore` + `Product` + `BreadcrumbList` intact |
| CSP `frame-src` | still carries `www.google.com` + `maps.google.com` — maps render |
| Console errors on production | **zero**, including across two locale switches |
| Homepage Visit Us | 2 columns (504/504), 7 hour rows, 4 chips, gold + dark buttons, map still `loading="lazy"` |
| Contact panel | 2 columns, 7 rows, `<address>` retained, 0px overflow |
| **Today** badge | on **Monday**, reporting `America/New_York`, on both pages and in ES (`Lunes`/`Hoy`) |
| Landmark in either Visit Us block | **absent** (still present in footer/FAQ by design) |
| `/api/metal-prices` | 200, live spot returned |
| `/shop` | 48 cards, 91 prices rendered |

⚠️ **The sitemap reads 105 URLs where the old note says 107 — that is NOT a
regression.** It breaks down as **85 product + 20 static**, and the static count
is unchanged; the delta is two fewer PRODUCT urls, i.e. two items sold in the
week since. No route or sitemap code changed, and the build prerendered the same
456 pages. Do not chase it.

**Gate on the final tree, from a deleted `.next`:** `tsc` clean · `lint` clean ·
**1125/1125 across 109 files** · build **456/456 static pages**.

**Staging rebuilt 2026-08-24** — `C:\Users\rcman\NEJ-repo-staging`, **872 files
/ ~20.2 MB**. Dry run first: **23 files** queued, exactly the 19 app files and 4
memory docs this session touched, with **0 Extras / 0 Mismatch / 0 FAILED**. The
copy ran clean and a re-run dry run confirmed **0 remaining**. Leak check
clean — 0 `.git` (directory *or* file), 0 `node_modules`, 0 `.next`, 0
`worktrees`, 0 `.env*`, 0 `*.log`, 0 `*.tsbuildinfo` — against a **positive
control of 177 `.tsx`**, so the zeros are real rather than a broken scan.
`.claude/launch.json` and `.github/workflows/scheduled-jobs.yml` confirmed
present, and the staged copies were content-checked (guard mounted, pre-paint
scripts still inline in `<head>`, landmark absent from both Visit Us blocks).

ℹ️ Robocopy reports 875 total against 872 on disk. That gap is the three
`/XF`-excluded files and is expected, not a missing-file bug.

⚠️ **A `$home` variable collision made one staging spot-check report a false
NEGATIVE** — `$HOME` is read-only in PowerShell, so the assignment silently
failed and the check ran against the wrong value. Re-run under another name it
passed. Never name a PowerShell variable `$home`.

**React's "script tag while rendering" console error is filtered in dev**
(2026-08-24). `ScriptTagWarningGuard` — which already existed for the shop
page — is now mounted in the locale layout, so it covers every page. ✅ Nothing
user-facing changes: verified against a real production build that the warning
is dev-only (zero console output there, even across a locale switch). ⛔ Two
"proper" fixes were built, measured and rejected — `next/script`
`beforeInteractive` defers the pre-paint scripts past first paint, and raw-HTML
emission forces them out of `<head>`. See `DECISIONS.md`.

**The contact page now matches the homepage block, and the shared-suite
landmark is off both** (2026-08-24). `VisitUsPanel` was a centred single column
with grouped hours; it is now the same two-column layout, and "inside Sharon
Lynch Collections" is gone from the homepage block's address line and its
orienting sentence. 🔴 **It still appears in eight other places** — footer,
About, both FAQ surfaces, `/shipping`, checkout pickup, product trust copy,
Spanish legal copy, and the order-email pickup block — all listed by name in
`DECISIONS.md`. Not swept; owner decision pending.

**Homepage "Visit Us" is now a two-column block** (owner-supplied reference,
mocked up and approved before building): eyebrow → `<h2>` → address → all seven
days of hours → four feature labels → Get Directions + phone buttons → email,
with an orienting sentence and the map in the right column.
⛔ **The address leads and the phone is a button — this REVERSES the older rule
that the phone must stay the biggest thing here.** Owner's decision; do not
"fix" it back. A new **Today** badge marks the current day after mount, pinned
to Naples time (UTC and Naples genuinely disagreed while it was built). The map
is untouched — still square, still lazy. Detail: `CHANGELOG.md` 2026-08-23
(Visit Us); rules in `DECISIONS.md`.

**Order emails** (owner-reported from a real receipt, all three fixed): the
footer no longer names Sharon Lynch Collections, the phone number can no
longer break across two lines (`white-space:nowrap`, measured — 31 widths
between 200–620px used to break it, now zero), and the summary line reads
**"Shipping method: Insured Shipping / Express Overnight Insured / Local
Pickup"** instead of the redundant "Shipping method: Shipping".
**The pickup details are now a laid-out block**, not a run-on sentence
(owner request, mocked up and approved before building): payment sentence →
a *Pickup Location* panel with the address on its own lines and hours below a
hairline → contact line. ⚠️ The landmark is deliberately KEPT here, as its own
muted line — it is wayfinding to a door signed with another business's name —
and the business name is deliberately NOT a line, since the email is already
from that business.
⛔ The tier is INFERRED from `subtotal` + `shipping_fee` on an exact unique
match, never stored — storing it would mean altering `orders` and rewriting
the `create_paypal_order` RPC. Detail: `CHANGELOG.md` 2026-08-23 (order-email
entry). Everything else in production,
source and staging matches (staging drifts only by memory docs, per the
owner's standing docs-only-drift preference), and staging has NOT been
re-synced for this change.

**Owner-reported, reproduced, fixed, verified locally, not yet deployed:**
accepting cookies did not stick when switching EN↔ES. Consent was never
actually lost — `localStorage` read `accepted` throughout — but the switch is
a client-side navigation between two `[locale]` segments, which remounts the
root layout, and React drops the imperatively-stamped `data-nej-cookies-ok`
attribute that hides the banner. The inline `<head>` script that stamps it
does not re-run on a soft navigation.

Fixed with a pre-paint re-stamp in `CookieNotice` (layout effect keyed on
`locale`) plus a new `lib/cookie-consent.ts` owning the key and attribute.
⚠️ **The LCP design is untouched** — the banner still server-renders visible
with no hydration gate, which is the entire point of the earlier sweep.
Gate: `tsc`/`lint` clean · **1101/1101** · build **456/456**. Detail:
`CHANGELOG.md` 2026-08-23 (cookie banner entry); the durable rule is in
`DECISIONS.md`, *"An imperative attribute on `<html>` does NOT survive a
locale switch"*.

⛔ **The rule that came out of it, worth more than the fix:** any `<html>` or
`<body>` attribute written imperatively must have a React component that
re-applies it on mount. `--app-vh` survived the same event only because
`ViewportHeightToken` does exactly that.

✅ **FINAL performance state, DEPLOYED and verified on production:** the
PageSpeed/a11y sweep + the hero-reveal batch. The front-card LCP pin was
built, deployed, measured (72), and reverted the same day — owner's call,
preferring the state that loads fastest in practice.

**Scores, before → after this session:**

- Mobile: 80 / 93 / 96 / 100 → **80–98 band / 100 / 100 / 100** (best run 98
  with LCP 1.7s green; typical ~80)
- Desktop: 97 / 96 / 100 / 100 → **~96–98 / 100 / 100 / 100**
- **A11y, Best Practices, and SEO held a perfect 100 in every one of ~12 PSI
  runs.** The perf number is the only mover, and it is a DISTRIBUTION.

🔴 **Do not chase the mobile perf lab number further with reveal/priority
tricks.** Three configurations were measured extensively (no hero batch, hero
batch, front-card pin) and ALL show the same bimodal lab distribution:
~79–81 when the cookie banner's text wins LCP, ~71–73 when a hero card
image's paint registers instead (lantern balloons any post-FCP image LCP to
~9s sim), plus a rare high draw (98) when everything lands at first paint.
Untested levers if the owner ever asks again: font-display `optional`,
`experimental.inlineCss`, JS-graph reduction — listed in `CHANGELOG.md`
(front-card revert entry). CrUX field data (currently "No Data") is the
number that will actually matter, and the deployed state paints content at
first paint for real visitors.

**What is live from this session** (detail in `CHANGELOG.md` 2026-08-23):

- **Cookie banner SSR + pre-paint gate** — it was literally the mobile LCP
  element (render delay 2.4s). `CookieNotice.tsx`, `[locale]/layout.tsx`
  (inline head script), `globals.css`, `CookiePreferencesClient.tsx`.
- **Hero-reveal batch** — pane A's carousel fade and the boot splash no
  longer wait for React hydration (`nej-hero-go` stamp; `HomeHero.tsx`,
  `[locale]/(home)/page.tsx`, `globals.css`). Content paints at first paint.
- **A11y to 100**: carousel back/edge cards `tabindex=-1`/`aria-hidden`;
  footer tap targets `py-1.5`; ShowroomHours muted opacity 0.55/0.7 → 0.8;
  announcement/testimonial accessible-name fixes.
- **BP to 100**: carousel preloader spans card-sized (also killed a fake
  215 KiB image-delivery flag).
- **`images.minimumCacheTTL`** 1h → 31 days.

### State from the earlier 2026-08-23 session — still holds

✅ The 2026-08-22 email-validation batch is live and verified: inquiry-form
bot filter, checkout name+phone validation with field reorder, phone
validation on the three lead forms, the transactional email bounce handler
(confirmed by replaying a real bounce), and the `ContactForm.tsx` deletion.

✅ **Resend endpoint moved `.co` → `.com`** and re-verified after the move.

### ◻ What is actually open

Nothing is blocking, and nothing is waiting on a deploy.

1. ◻ **Two junk rows await a delete decision** — created by a bad verification
   probe (see the trap below). Ids and SQL in `TASKS.md`.
2. ◻ **The hard-bounce path has never run for real.** Every live exercise so far
   was the *soft* path, chosen deliberately because it writes nothing. Its first
   real test will be a genuine permanent bounce; expect an `[email-bounce]` log
   line and a red **Bounced** chip in the admin message center.
3. **Watch the Netlify function log for `[inquiry-spam]`.** Lines = the filter
   working. No lines and no new junk rows = the bot moved on. 🔴 No lines but NEW
   junk rows = it is being evaded, and `TASKS.md` has the playbook.
4. 🟡 **Marketplace clients have no request timeout** (`lib/{ebay,etsy}/client.ts`
   call `fetch()` with no `AbortSignal`, and both retry with 1s/2s/4s backoff).
   Latent, not urgent — it only strands background work today. It is also the
   specific reason awaiting a marketplace call in a buyer-facing route is unsafe.
   ⚠️ Not a drive-by fix: it touches every call site, including legitimately slow
   ones like Etsy image upload.
5. 🟡 **`ebay_sync_log` is ~97% eBay `account_deletion` webhook noise**
   (75k+ rows, ~3,000/day, pruned only at 90 days). Makes the real sync history
   hard to read. Not causing failures.
6. **A real website sale still has not exercised the auto-delist hook** since the
   fix. Nothing to do but wait; the reconcile sweep bounds it to ~30 min.
7. Older, unchanged: Google address verification, re-measure first paint on
   production (baseline 533KB / 30 requests), confirm the first real refund
   records itself, Search Console re-submit, and the phone-only checks never done
   on real hardware.

### 🔴 Staging: the documented robocopy command CHANGED — do not use an older copy

It now excludes `"$src\.claude\worktrees"`. Background agent sessions create git
worktrees there, and **a worktree's `.git` is a FILE**, so `/XD .git` does not
exclude it. The 2026-08-22 dry run wanted **1,122 files** under `.claude` against
**20** real ones — including that `.git`, which would have landed in the repo.
`.gitignore` now covers it too, but **robocopy does not read `.gitignore`** — the
`/XD` entry is what actually protects the copy.

⛔ **"0 Extras" is NOT a sufficient safety check.** Extras only catches junk in the
DESTINATION; it was 0 while 1,122 stray files were queued to flow IN. Read the
file COUNT and sanity-check it against what the session actually changed.

### ✅ Everything from 2026-08-21/22 is live AND verified in production

Not merely shipped: the marketplace price-push timeout fix, the Inventory #82
reattachment, the auto-delist `after()` fix, and the reconcile sweep. Each was
confirmed by an unattended run or a fetched result, never by assumption.

⚠️ The one thing with no production observation is the **auto-delist hook on a
real website sale** — the PayPal capture path has not run since the fix. The
reconcile sweep bounds that exposure to ~30 minutes regardless.

### ⚠️ Traps this session hit, worth not re-learning

- **`after()` is best-effort on Netlify, not a guarantee.** Next lists it as
  requiring graceful-shutdown support, which the Lambda freeze-on-response model
  does not provide. Work still in flight when the response flushes is frozen and
  finishes only if the container is reused. Measured: a log insert landed
  **127.6s late** on a thaw.
- **A "missing" row may just be late.** That 127.6s insert was first reported as
  lost. Check again before diagnosing.
- **Deleting `.next` under a running dev server 500s every route** with
  `ENOENT … build-manifest.json`. That is the deleted build dir, not the code —
  restart rather than debug.
- **A wrapped phrase makes `Select-String` return 0.** Searching staged
  `CURRENT_STATUS.md` for "reconcile sweep" found nothing because the phrase
  breaks across a line. Always pair a zero with a positive control.
- **The GitHub mobile app mislabels run triggers** — it showed a scheduled run as
  "Triggered via pull request". The web UI is authoritative.
- 🔴 **Probing `/api/inquire` or `/api/contact-message` with a PASSING payload
  writes production data.** A verification probe with a valid phone ran the whole
  success path: an inquiry row, an admin notification, an owner email, and a
  confirmation to a non-existent address that then bounced. **Test the REJECTION
  paths** — they return before any insert or email. Same rule for the Resend
  webhook: replay a `Transient` bounce, never a `Permanent` one.
- **`type="tel"` and `type="email"` validate NOTHING.** They hint at a mobile
  keypad. Presence-only checks behind them look adequate for years.
- **`ymail.com` is a REAL Yahoo domain** (`mta5.am0.yahoodns.net`), one character
  from `gmail.com`. Any edit-distance "did you mean?" check would flag a real
  customer's correct address. Verified by MX lookup, not memory.
- **DNS is blocked in the agent sandbox.** `dns.resolveMx` returns `ECONNREFUSED`
  for *everything*, `gmail.com` included — which is the tell. Use
  `new Resolver()` + `setServers(['8.8.8.8','1.1.1.1'])`. The only reason this
  was caught is that a known-good domain was in the same batch: **always include
  a positive control.**
- 🔴 **A single agent worktree adds ~860 files to a wholesale copy**, and its
  `.git` is a **FILE**, so `/XD .git` misses it. See the staging section above.
- ⛔ **Editing the Resend webhook: use "Edit endpoint" ONLY.** "Duplicate
  webhook", "Delete", and "Rotate signing secret" all mint a NEW secret, which
  401s every event until Netlify's `PROVIDER_WEBHOOK_SECRET` is updated to match.
  Confirm the edit was in-place by checking the webhook id and CREATED date are
  unchanged.
- **Python heredocs choke on Windows paths.** A non-raw triple-quoted string
  containing `C:\Users\...` raises `SyntaxError: truncated \UXXXXXXXX escape`.
  Use raw strings. It fails at parse time, so nothing is written — and a literal
  triple-quote inside the string ends it early, which bites when documenting
  this very trap.

### ✅ DEPLOYED — inquiry-form bot filter (the form was an EMAIL RELAY)

(Heading said 🔴 UNDEPLOYED until 2026-08-23; the filter shipped in the
2026-08-22 batch and is confirmed live — the narrative below is the design
record.)

A bot used the product-inquiry form to make Resend send confirmation mail **to
strangers** from `noreply@naplesestatejewelry.com` — 10 submissions in 18 hours
on 2026-08-22, one victim address hit twice. `.com` is the only verified Resend
sender, so this put order receipts and marketing at risk too.

**Root cause:** the `bot-field` honeypot was checked server-side but
`InquiryForm.tsx` never rendered it. It is the only one of the three inquiry
forms that was spammed — a perfect correlation.

**Fixed (undeployed):** honeypot added to that form; new `lib/spam-heuristics.ts`
catches generated names even when a bot POSTs JSON directly; drops are logged as
`[inquiry-spam]` rather than vanishing silently.

⚠️ **The threshold is measured, not guessed** — human max 5, spam min 7, so 6.
A first attempt at 4 would have silently discarded a real customer named
`VanDerBeek`. A false positive here is a lost customer; the constant is pinned
by tests from both directions.

✅ **Both owner decisions are settled (2026-08-22): leave the 10 spam rows, and
leave the confirmation email as-is — react if abuse recurs.** The rows are also
the labelled sample the heuristic was derived from and are referenced by name in
`spam-heuristics.test.ts`, so do not tidy them away.

⚠️ **Accepted residual risk, recorded so nobody re-discovers it in a panic:**
`sendEmails` still sends to whatever address is submitted. A next bot using
plausible two-word names walks past the name heuristic. `TASKS.md` carries the
if-it-recurs playbook — and its first rule is **re-measure before changing any
constant**.

### ✅ DEPLOYED AND CONFIRMED — the auto-delist hook was dropping ~1 sale in 20

Root-caused 2026-08-21. The marketplace auto-delist hook was launched as a bare
floating promise at six call sites, and Netlify freezes the container once the
response flushes — killing the eBay/Etsy call mid-flight. **39 of 41** sold
products delisted correctly; 2 did not, and stayed live and buyable.

⛔ **The hook did not fail, it was killed.** It logs an error row for any throw
(proven — it did so on 2026-07-29). The misses left **no row of any kind** and no
partial write. Silence meant termination.

Fixed with `after()` via new `lib/product-status-hooks.ts` (+ `allSettled`, +
real logging), plus a second hole where `adminRevalidateProduct` sat after the
video-commit early return in `AdminShell.tsx`. `queueDeepFieldSync` deleted.

⚠️ **The dangerous path was PayPal checkout, not admin.** Both misses were items
that had sold on eBay, so the marketplace zeroed its own quantity and covered for
us. A website sale has no such safety net.

✅ **Confirmed on production** (`main@e81f9f9`). Both previously-stale products
were run through the hook and are now `hidden_oos` qty 0 on eBay and
`delisted`/`inactive` on Etsy, with the log rows to match. `after()` proven live:
the Netlify function log shows `[deepfield] synced 1 product(s)` emitted from
inside the callback, where that work used to be killed.

⛔ **Never re-fire hooks via the "mark sold" quick action on an already-sold
item** — it recomputes and overwrites `sold_price` from current spot. Use a
no-change save in the edit modal.

🔴 **`after()` is an improvement, NOT a guarantee here — read this before
trusting the fix.** The `hide_oos` row first reported missing was not missing: it
landed **127.6s late**, when the frozen Lambda thawed on the next request. Two
sequential awaits cannot be 128s apart unless the process stops between them, and
clock skew is ruled out (the Monaco's identical pair is 0.469s).

Next's docs list `after()` as requiring **graceful shutdown support**; Netlify
freezes on response instead of draining. Work that finishes inside the response
window now lands reliably (Etsy, Deep Field); slower work (eBay, which adds a
token round-trip) still freezes and completes only if the container is reused.

⛔ This also sharpens the original diagnosis: the work was never *killed*, it was
*frozen* — lost only when the container was reclaimed before reuse. That is why
it was 39/41, not 0/41.

✅ **DEPLOYED AND CONFIRMED 2026-08-22 — the status-drift reconcile sweep is
live.** Run #153 ran both jobs green in 6s with all five other jobs skipped, and
wrote `124 scanned, 0 drifted` (eBay) / `128 scanned, 0 drifted` (Etsy).
✅ **Firing unattended** — 18 runs per channel overnight, all `ok` / `0 drifted`,
gaps 18–56 min (GitHub's best-effort spread, not a fault). **Every 30 minutes** it asks "is anything sold still live right now?"
and repairs what it finds — catching a missed delist regardless of cause (freeze, API error,
or an unhooked status path). `reconcile{Ebay,Etsy}StatusDrift()` +
`/api/admin/{ebay,etsy}/reconcile-status`, on the existing GitHub Actions
workflow, using each channel's existing cron secret.

Verified against production: read-only dry run found **0 drift on 124 eBay + 128
Etsy listings** (the negative result that proves it will not delist healthy
stock), then a real run completed in **1131ms / 781ms** and wrote its audit rows.

⛔ **Deliberately NOT awaiting the hook in the PayPal capture path.** The
payment is already captured before that line runs, so a hang there would turn a
successful payment into an error page. Neither marketplace client has a request
timeout and both retry with 1s/2s/4s backoff, against a ~26–30s gateway ceiling.
The sweep bounds the exposure from outside instead, with no buyer-facing risk.
Full reasoning: `CHANGELOG.md` 2026-08-21 (5); the standing decision is in
`TASKS.md`.

⚠️ **Static page count is now 456, not 454** — the two new API routes. That
number is a structural invariant in STRUCTURE.md; this is the new baseline.

Do not read a missing log row as a failed delist, or a present one as proof it
was timely; `sync_state` and `last_pushed_qty` are the operative state.

📱 **A real website sale still has not exercised this path** — the confirmation
ran through the admin route, not PayPal checkout.

### ✅ Inventory #82 is repaired ON PRODUCTION — the write-block list is now EMPTY

Done and verified 2026-08-21, owner-approved. The mug's live listing was an
external relist attached to **no** Inventory-API offer, so the daily push could
not reach it — it sat 17 days at **$928.69** when it should have been
**$1,068.35** (15% under), with a buyer holding it in their cart.

Repaired by end-and-republish: relist `800354878200` ended, offer
`204558136011` published as **`800547117368`** at $1,068.35 through the app's own
`runSyncStep`. `isEbayWriteBlocked` → false, planner reports **0 blocked**
(was 1), and the eBay-side price matches `last_pushed_price` exactly.

⛔ **The rule that came out of it:** never lift a write-block to fix an
unreachable listing — the push then writes to the orphaned offer, *succeeds*,
and the dashboard reads clean while the live price keeps drifting. DECISIONS,
*"A listing the Inventory API cannot reach must be republished, not unblocked"*.

⚠️ Shipping moved $15 → $59 on republish. Correct: that is the current tier for
its price band, and the old fee was a pre-tier leftover.

### ✅ Full eBay reconciliation: 84 of 87 healthy, 0 price drift

Every live listing was compared against eBay (one `getOffer` each). **84 exact
matches** — published offer, ACTIVE listing, eBay price equal to
`last_pushed_price`. Zero price drift, zero listing-id drift, zero API errors.
The other three were the mug (now fixed) and two sold items.

🟡 **Two sold products carry stale local state on BOTH channels** — verified not
purchasable on either, so no double-sale exposure, but **the auto-delist hook
logged nothing after either sale**. It has worked before. Worth understanding
before a future sale leaves something genuinely buyable. See `TASKS.md`.

### ✅ VERIFIED IN PRODUCTION — the price-push timeout fix

**Shipped in `main@e81f9f9`** alongside the auto-delist fix and the write-block
removal — one deploy carried all three. **No outstanding SQL.** Staging is stale
as of this session and must be rebuilt before the next batch.

✅ **Verified 2026-08-22 on the first unattended run.** eBay **success in 2s**
(`0 pushed, 85 unchanged, 0 blocked, 0 failed, 0 deferred`) where run #142 was
**38s and a 504**. Etsy **success in 14s** (`32 pushed, 0 deferred`) with its 32
item writes in **2.14s** against 20.9s for 41 items before — **per item 522ms →
67ms**. `0 deferred` on both channels, `0 blocked` on eBay, and **0 failed
workflow runs since #143**.

`ebay-price-push` failed on 2026-08-21 (run #142, 504 `Inactivity Timeout` after
32s) **having already pushed all 50 prices successfully** — the gateway hung up
a fraction of a second before the handler returned. Etsy carried the identical
defect and had been silently deferring **15–18 listings a day** since 2026-08-20
without ever going red.

Two causes, both fixed in `lib/{ebay,etsy}/{sync,store}.ts`:

1. **Bookkeeping was per-listing** — two awaited Supabase round-trips each.
   Measured: 100 round-trips at ~157ms = **15.7s of a 22.2s run**. The
   marketplace APIs were never the cost. Now batched.
2. **The budget could not bound the request** — it was measured from inside the
   push loop, so ~10s of setup fell outside it. Now an absolute `deadlineAt`
   stamped on entry, at 20s.

**Gate, from a deleted `.next`:** `tsc` clean · `lint` clean · **1033/1033
across 101 files** · build **454/454 pages**. The four new tests were
**mutation-tested** — reintroducing either bug fails them.

⛔ **A red scheduled job does not mean the work failed.** Read the
`scheduled_price_push` summary row in the sync log first. That row is what
proved the prices had landed.

🔴 **Still unexplained: ~5–7s of the ≥9.7s of setup.** Cold start, spot fetch
and the three Supabase reads only account for ~3s. Recorded rather than guessed
at; the fix does not depend on it.

✅ **Cold start is NOT the explanation, for these routes or the drip.** The
unauthenticated 401 path on production returns in **0.23–0.67s** across 5
attempts. This kills the unproven `sharp`/`next/og` cold-start theory carried
over from the 2026-08-20 `facebook-drip` investigation — **do not re-raise it.**

🟡 **`facebook-drip` (run #124) remains a WATCH, not a fix.** Still unexplained,
still one failure in 125 runs. **Do not do more surgery on it.**

### ✅ THE REST IS DEPLOYED AND VERIFIED.

Both 2026-08-19 — the checkout sign-in/guest gate and the review reconciliation — shipped
and were confirmed on production by fetching it. Staging mirrors the source.

### ✅ Google reviews reconciled — DEPLOYED 2026-08-19, `TESTIMONIALS` 13 → 16

Five reviews were missing (not the four the old note claimed — its arithmetic
never worked: 16 − 13 = 3). The earlier count came from a Maps feed that stopped
paginating after ten cards, so the tail was never seen. Five were added and
three stale entries reconciled away, landing on 16 — a 1:1 match with the live
profile.

⚠️ **The deploy looked like it "didn't land"; it had. Browser cache.** Before
re-deploying or re-syncing staging on that symptom, spend ten seconds proving it
from outside the browser — neither of those fixes a client-side cache:

```bash
curl -s "https://naplesestatejewelry.com/" | grep -c "Nolan Olivier"
```

⚠️ **Mayelin Pérez wrote in Spanish, and her entry inverts the verbatim pair** —
`quoteEs` is her original, `quote` is our translation. Google's card shows a
machine translation by default; the original sits behind *"See original
(Spanish)"*. Publishing the visible text would have attributed Google
Translate's words to a named customer.

✅ **The list is now RECONCILED against the profile — 16, matching 1:1.** Three
entries did not reconcile, and the owner explained why: **he accidentally
deleted his original Business Profile and rebuilt it.** Those reviews were real
and his, and did not survive. **Nolan Olivier** and **Onur** are removed;
**Yisel Perez** re-reviewed on the new profile, so her quote was replaced with
her current words rather than dropping her.

⛔ **Standing rule, now in the file header: every entry must still exist on the
live profile**, because each card renders a "Read on Google" link. Genuine but
unverifiable is, on a page that invites verification, the same problem as
invented. Reconcile the list against the profile — drop what has vanished,
refresh what has changed — rather than only appending.

⚠️ *Naples Jewelry Buyers* (the 5.0/33 Google profile) is **not the owner's** —
the name is coincidence. An earlier guess in this session said otherwise; it was
wrong.

### ✅ The checkout sign-in/guest gate — DEPLOYED 2026-08-19, owner-confirmed

**Owner report, from a phone:** proceeding to checkout signed out asked
"log in or continue as guest" **twice**, and the second prompt sat out of the
viewport so he had to scroll to it. Two separate defects, both confirmed:

1. **The double prompt was never mobile-only** — reproduced at **899px**. The
   cart drawer routed to `/checkout` without recording the buyer's answer, so
   checkout raised its own gate again. Desktop only *looked* clean because the
   suppressing sessionStorage key survives for the life of a tab.
2. **The second prompt was anchored to the wrong box.** It was
   `position: fixed; inset: 0` but rendered **inside** `.checkout-page`, which
   carries `data-customer-reveal="visible"` — whose transform/filter/will-change
   make it a containing block for fixed descendants. On a 375×812 phone the card
   landed at **top 1114px** inside a **2409px** overlay: below the fold,
   854px of scrolling away.

**Owner picked the four-option screen** (Log In / Create Account / Continue as
Guest / Cancel). The two-option one is **deleted**. New
`components/checkout/CheckoutGate.tsx` is now the single source for that screen
and for the choice; the drawer calls `rememberGuestCheckout()` before routing,
and checkout renders the same gate **outside `.checkout-page`** for buyers who
arrive without passing the drawer.

**Also in this batch:** the `<html>` **hydration warning is fixed** — it had
fired on every page in dev since the 2026-08-18 `--app-vh` work, because the
pre-first-paint script writes the token onto `document.documentElement.style`
while the element carried no `suppressHydrationWarning`. Correct resolution, not
a silencer: React already left the DOM alone, so the token always survived.

**Gate passed from a deleted `.next`:** `tsc` clean · `lint` clean ·
**1024/1024 across 100 files** · build **454/454 static pages** — re-run after
the root-layout change, since the prerender count is a structural invariant.
Browser-verified in both locales — measurements in `CHANGELOG.md` 2026-08-19 (4).

**Confirmed on production after the deploy**, by scanning all 15 JS chunks behind
`/checkout`: **0** `checkout-auth-overlay`, **0** `checkout-auth-card`, **0** of
the old two-option heading — against controls of **1** `checkout-page`, **1**
`How would you like to continue`, and **3** chunks carrying `--app-vh`. All four
of `/`, `/es`, `/checkout`, `/es/checkout` are 200.

⚠️ **Reusable trap worth carrying forward:** any `position: fixed` element placed
inside a `[data-customer-reveal]` subtree is anchored to that subtree, not the
viewport. It fails silently — the element renders, just in the wrong place.

⚠️ **A second trap, hit twice while verifying the above:** a grep that returns 0
proves nothing without a positive control in the same scan. The chunk files
saved with a **double** leading underscore so the glob matched nothing, and the
static `.css` files can never contain styled-jsx rules (those compile into the
JS). Both looked like clean passes.

**What else closed on 2026-08-19:**

| | |
| --- | --- |
| 🔴 **The in-app-browser viewport jump** | root cause found, fixed, owner-confirmed gone, diagnostic removed |
| **Google Business Profile hours** | `Mon–Sat 10–5` → **Sun+Mon closed, Tue–Sat 11:00 AM–3:00 PM**. Applied and live |
| **Google profile Description** | stopped claiming "private, mobile, and appointment-only"; now leads on the showroom. Applied and live |
| **Linda Cusumano's review** | published, minus its stray "Hi baby" line, by explicit owner decision. `TESTIMONIALS` 12 → 13 |
| **Hero text still drifting** | ✅ the first viewport fix stopped at the hero's frame; the offsets INSIDE it were still `svh`. Fixed, plus `.responsive-hero` (71.9px). Deployed and **owner-verified gone** |
| **Every remaining `svh` surface** | ✅ checkout shell (124px), `error`, `not-found`, both account washes, `.site-loading-screen`. Deployed and verified on production. **Nothing is left on `svh`** except transient-overlay max-heights and the token's own fallback, both guard-encoded |

**Verified on production, not assumed:** homepage 200, `<body class="min-h-[var(--app-vh)] flex flex-col">`,
`Linda Cusumano` present, **zero** `Hi baby`, and zero `vpdebug` across all 15 JS
bundles against a positive control of 8 `--app-vh` hits. The Google hours and
description were re-opened in the owner's own profile editor and are **applied,
not pending**.

**Gate at session end, from a deleted `.next`:** `tsc` clean · `lint` clean ·
**1024/1024 across 100 files** · build **454/454 static pages**.

✅ **The viewport work is finished and owner-verified.** Three rounds: the page
shell, then the hero's frame, then everything positioned inside it plus the last
six surfaces. Production carries the token on every one of them, and the guard
rejects a regression.

### 🔴 The one thing that matters most for the next session

**`svh` is not stable in an in-app browser, and that is now a governing rule.**
Measured on the live site inside Instagram: `vh`, `svh` and `dvh` all resolve to
the SAME value there and all three track the chrome (`innerHeight` 729 ↔ 853).
Instagram resizes the WKWebView natively, so WebKit sees a plain window resize
with no small-vs-large viewport to distinguish.

Anything customer-facing that is **positioned or sized to the viewport** must
read **`var(--app-vh)`**, never a viewport unit. ⚠️ It looks like a pointless
indirection around `100svh`, and "simplifying" it back is exactly how this
regresses. `lib/__tests__/viewport-units.test.ts` guards it. Full rationale:
DECISIONS, *"`svh` is NOT stable in an in-app browser"*.

⚠️ **`tsc` and `lint` both PASS on a broken styled-jsx template literal.** A
stray backtick in a comment inside a `<style jsx>` literal ends the string and
500s every route; the type-checker does not see it. The compile check for those
files is a **real build**. This bit twice on 2026-08-19.

⚠️ **That rule said "contributes to document height" for one day and it was too
narrow** — a second bug shipped because the hero's frame was converted but the
text positioned inside it was not, so the text moved alone against a stable
background (owner-reported 2026-08-19, fixed same day). Transient overlay
max-heights — modals, drawers, the boot splash — are the one deliberate
exception and stay on `svh`, because they *should* fit what is visible now.

### 🟡 Two undeployed defensive changes; one unexplained failure

`facebook-drip` failed once (run #124, 2026-08-19) with `curl (56)` after 25s —
Netlify's 26s ceiling. **123 of the 124 runs before it passed.**

✅ The 25s was startup or platform, not handler work: the queue was empty
(owner-confirmed), so the handler does three Supabase calls, and warm the
endpoint answers in **0.2s** — from the route itself, since `/api/*` is outside
the middleware matcher.

🔴 **What consumed the 25s is NOT established.** Two theories were formed and
both overstated: "published more than fit" (impossible — empty queue) and "the
`sharp` + `next/og` import graph makes cold starts expensive" (chain real,
causation unproven). A transient platform stall is not excluded. Detail and the
three failed measurement attempts: `CHANGELOG.md` 2026-08-20.

✅ **Deployed 2026-08-20:** a 20s wall-clock budget on both drip loops, and a
lazy `./images` import. Both correct on their own terms; **neither is a fix for
that failure** and the code comments say so. Gate: `tsc`/`lint` clean,
**1029/1029**, **454/454**.

✅ **Run #125 passed and proves the new code is live** — its `facebook-drip` log
returned `HTTP 200 {"published":0,"skipped":0,"deferred":0,...}`, and `deferred`
exists only in the new code. Step time **1s** against #124's 25s. It also
confirms the empty queue independently.

⚠️ Not proof the budget fixed anything: with zero rows the loop never iterates,
so 1s is the trivial handler on a healthy platform — which supports the
transient reading. The lazy `./images` import shipped later and has not yet had
a scheduled run. **Watch the next few; do not do more surgery on one failure in
125.**

### ◻ What is actually open

Nothing is blocking. In rough priority:

1. 🔴 **Google address verification** — owner going **2026-08-20**. The hours
   and description are already correct, so the profile is in good shape for it.
2. **Re-measure first paint on production** (snippet in `TASKS.md`). Baseline to
   beat: 533KB across 30 requests before FCP. Never done.
3. **Confirm the first real refund records itself** — the fix is proven locally
   against real PayPal refunds but its automatic path has never run in
   production.
4. ✅ **DONE 2026-08-19 — every Google review is on the site and the list is
   reconciled.** `TESTIMONIALS` is **13 → 16**, a 1:1 match with the live
   profile: five added, two removed (lost with the owner's deleted original
   profile), one refreshed.
5. **Search Console**: resubmit the sitemap and Request Indexing on the four
   pages whose titles changed. A nudge, not a repair.
6. 📱 **Phone-only checks** that have never been done on real hardware — listed
   in `TASKS.md`. The in-app-browser one is now moot; the rest are not.

### ⚠️ Three traps this session hit, worth not re-learning

- **A guard test that scans source must strip comments AND normalise newlines.**
  This repo mixes CRLF and LF; in JavaScript `
` is a line terminator, so
  `/(^|[^:])\/\/.*$/` silently fails to match on CRLF files and every `//`
  comment survives. A guard then reports its own rationale as a violation.
- **Tailwind's scanner reads comments.** `.min-h-screen{min-height:100vh}` is
  still emitted into the built CSS because the comments explaining the ban name
  the class. Its presence there is NOT evidence of use — check the served
  `<body class>`.
- **A hidden Browser pane freezes `requestAnimationFrame` AND suppresses
  `scroll` events** while still moving `scrollY` — measured: a 1200px
  programmatic scroll produced 0 scroll events and 0 frames, only `setTimeout`
  ran. Anything verified through that pane must not depend on either.

### ✅ DEPLOYED 2026-08-18 — THREE times, and the last one is what is live

The 2026-08-18 session shipped in three deploys, all confirmed on production and
all owner-confirmed. Read them in order or the middle one reads as a failure:

1. **The showroom-map / reviews / footer batch** — items (1)–(9) below.
2. **The `*-screen` → `svh` fix plus a temporary diagnostic overlay.** A real
   defect, and it did **not** fix the reported jump. That is not a wasted deploy:
   the overlay it carried is what produced the measurement that found the actual
   cause.
3. **The real fix, then its cleanup.** `svh` turned out not to be stable in an
   in-app browser at all; `--app-vh` replaced it, the owner confirmed **the jump
   is gone**, and the diagnostic was removed. Verified on production: 0
   occurrences of `vpdebug` / `nej-vpdebug` / `TURN OFF` across all 15 JS
   bundles, against a positive control of 8 `--app-vh` hits.

No SQL was outstanding at any point and none is now.

**The gate it passed, run from a deleted `.next`:** `npx tsc --noEmit` clean ·
`npm run lint` clean · **1016/1016 tests across 99 files** · `npm run build`
**454/454 static pages** (the prerender-count invariant holds).

**What is in it, newest first — full detail in `CHANGELOG.md` 2026-08-18 (1)–(9):**

| | Change |
| --- | --- |
| (9) | Map frame is **square**; footer address gains the copy button |
| (8) | **Copy-address button** on the homepage CTA, contact panel and About |
| (7) | Hero **Trade → Visit Us**, jumping to the CTA block; footer address stacks above hours |
| (6) | Footer address+hours move out of the brand column into a **centred band** |
| (5) | **Reviews 4 → 12** from the live Google profile; homepage band is a **scrolling marquee** |
| (4) | Homepage CTA **typographic ladder** (pulled back from bold after owner review) |
| (3) | Hours become a **day-by-day list** like Google Maps |
| (2) | Map **zoom buttons** + closer default; address stops splitting the landmark name |
| (1) | **"Visit us today"** copy, the **Google map**, and the About showroom section |

✅ **The CSP hazard cleared — checked on production, not assumed.** The risk was
that `frame-src`'s new `https://www.google.com https://maps.google.com` lived in
**two** files (`next-app/next.config.ts` and **root `netlify.toml`**, the latter
being what actually serves production) and that a copy missing the root file
would blank every map with only a console error. It travelled. The live header
reads:

```text
frame-src https://*.tradingview.com https://*.tradingview-widget.com
          https://*.paypal.com https://*.cloudflarestream.com
          https://*.videodelivery.net https://www.google.com https://maps.google.com
```

Re-run any time with:

```bash
curl -s -D - -o /dev/null https://naplesestatejewelry.com/ | grep -i "content-security-policy"
```

**Confirmed live on production the same day** — the homepage is 200 with the
correct title, and the batch's own markers are all serving: `Call or Visit Us
Today`, the `#visit-us` hero anchor, the `6240 Shirley` / `Sharon Lynch` address
block, the copy-address control, and the review marquee. **Both maps render** —
homepage and `/contact` each carry the lazy `maps.google.com/maps?q=26.222053,
-81.781429&z=17&output=embed` frame, pinned to the verified GEO pair.

👀 **Three things still have not been LOOKED at by a human**, each for a
*measured* reason recorded when they shipped, not an assumed one. All three are
now exercisable on the live site and are worth ten seconds each:

- **The smooth scroll** on the Visit Us button — a hidden Browser pane freezes
  `requestAnimationFrame` (no callback in 1500ms; a smooth scroll sat at scrollY
  0 for six seconds). The instant path was proven correct instead.
- **The clipboard** on the copy buttons — a hidden pane leaves
  `document.hasFocus()` false, which the browser blocks both copy paths on
  (`NotAllowedError`, and `execCommand` returned false). The graceful *failure*
  path was proven.
- **The scrolling review band** — measured moving at ~49px/s with an exact seam,
  but nobody has watched it loop.

✅ **Both of those owner actions are now CLOSED (2026-08-19).** The Google
Business Profile hours were corrected to **Tue–Sat 11:00 AM–3:00 PM, Sun + Mon
closed**, byte-identical to `HOURS`; its Description was also rewritten, since it
still claimed "private, mobile, and appointment-only" — the last place
contradicting the store-first rewrite. ✅ **Both Google edits cleared review and
are APPLIED**, re-checked in the owner's profile editor. Linda Cusumano's review is published
**without** its stray "Hi baby" line — an explicit, recorded owner override of
the verbatim rule (⛔ one exception, not a policy; see DECISIONS).
🔴 **Google address verification is next** — owner going 2026-08-20.

### ✅ DEPLOYED 2026-08-17 — the batch is LIVE

The long-pending batch (2026-08-09 through 2026-08-17) shipped.

🟢 **The showroom opened and the site has been rewritten for it (2026-08-17,
DEPLOYED 2026-08-18).** Address **6240 Shirley St, Ste 104, Naples, FL 34109**, inside
**Sharon Lynch Collections**, **Tue–Sat 11:00–15:00 or by appointment**. The
site had asserted "mobile, appointment-only, no physical storefront" in 61
strings across 15 files; all are rewritten in both locales to **store-first
with home visits by request**, and the address now appears on 8 surfaces.
Two strings were outright FALSE and are fixed: the schema claimed Mon–Sat
10:00–17:00, and the homepage strip said Mon–Sat. New single source of truth
`src/lib/business-location.ts` — never retype the address. `geo` is **26.222053,
-81.781429** (owner-supplied 2026-08-17, verified live); the previous downtown
pin measured 5.59 miles from the real door. The CAN-SPAM marketing address is
now handled in code (falls back to the showroom address, so it cannot send
empty). ❌ Owner has explicitly declined three NAP items — the eBay
item-location ZIP (anywhere in SWFL is fine), the Etsy shop location, and
`naplesjewelrybuyers.com`. **Do not re-raise them.** 🔴 The only external
item still open is the **Google Business Profile**. Detail in `CHANGELOG.md` 2026-08-17 (8), `DECISIONS.md`
*Business Model*, and `TASKS.md` *PHYSICAL LOCATION*.

🟢 **Product attribute colors (2026-08-17, deployed 2026-08-18):** the product page's
status/metal/karat/length row prints one color per fact (emerald / metal-true /
sapphire / amethyst) instead of one gold blob. ✅ **Owner-approved 2026-08-17,
including the amethyst — the palette is settled, do not re-open it.**
`CHANGELOG.md` 2026-08-17 (7).

🟢 **The site now invites people IN (2026-08-18, deployed 2026-08-18).** The showroom
rollout put the address on the site but never asked anyone to come. Fixed on
three surfaces: the homepage CTA is **"Call or Visit Us Today"** with a
walk-in sentence and a **small Google map**; the contact page's Visit Us panel
gained a **taller map** directly above *Get directions*; and the About page
gained a **"We Now Have a Naples Showroom"** section (text + directions, no map
by design). New shared `components/ShowroomMap.tsx` + `mapsEmbedUrl()` in
`business-location.ts` — keyless embed, pinned to the verified `GEO` pair, and
**always `loading="lazy"`** so a heavy third party stays off the critical path.
🔴 **CSP `frame-src` gained `www.google.com` + `maps.google.com` in BOTH
`next.config.ts` and root `netlify.toml`** — the embed 301s between those two
origins, and a CSP-blocked iframe blanks silently. `/privacy` gained a Google
Maps bullet. Full gate passed (`tsc`/`lint` clean, **1016/1016**, **454/454
pages**). ⚠️ Verified by DOM/network measurement only — the Browser pane was
hidden, so **nobody has looked at the rendered tiles**. Detail in
`CHANGELOG.md` 2026-08-18 (1) and `DECISIONS.md` *Business Model*.

**Then refined the same day (2026-08-18 (2)):** the map got its own **`+`/`–`
buttons** (top-right, z12–z20, default zoom **16 -> 17**) because a cross-origin
iframe cannot be scripted — each press *reloads* the frame at a new `z`, kept
sane by a 300ms debounce and by **remounting** the iframe rather than changing
its `src` (a live `src` change pushes history and would make Back rewind the
zoom). `ShowroomMap` is now a client component; **build still 454/454**. And the
footer's address stopped splitting the landmark — it read
"… inside Sharon / **Lynch Collections**" because the middot join offers no
break point. New `<ShowroomAddress>` puts the landmark on its own line with only
the **name** marked `nowrap`; `addressWithLandmark()` stays for prose and email.
Verified at **320px in Spanish**, the worst case for both. **And 2026-08-18 (3):** opening hours are now a
Google-Maps-style day-by-day list (`<ShowroomHours>`) instead of
"Tue–Sat 11am–3pm, or by appointment" — seven rows in the footer, contact and
About, a 2-row grouped form on the homepage CTA only. Closed days are shown,
dimmed, and **derived from `HOURS.days`** so display and schema move together;
"or by appointment" sits under the list because it qualifies every row. **And 2026-08-18 (4):** the homepage CTA gained a real
typographic ladder — the deck went full-strength colour (weight
deliberately NOT raised), street 600 with the landmark reset to 400, day 600 /
time 700 with **tabular figures**, closed rows at 0.55, and address+hours
grouped under a single top hairline. Emphasis is weight
and opacity only, never colour, because the two shared components render on four
surfaces with four inherited palettes. **And 2026-08-18 (5):** the homepage review band
is now a **continuous CSS-only marquee** (product pages keep the grid), and
`TESTIMONIALS` went **4 -> 12**, read from the live Google profile (16 reviews,
5.0) with every "More" expander opened. Quotes ship verbatim including posted
spelling/grammar. 🔴 **Two owner decisions are open** — Linda Cusumano's review
is held out because its text genuinely ends "Hi baby", and Google's profile
shows `Closed · Opens 10 AM`, which matches neither the site nor the schema
(Tue–Sat 11:00–15:00). See `TASKS.md`. **And 2026-08-18 (6):** the footer's address+hours moved out
of the brand column into a **centred band under all four columns** — the
seven-row list had made that column twice the height of the others. Column
heights are now 222/222/222/222, spread zero. **And 2026-08-18 (7):** that band now stacks
**address above hours** (side by side read as two unrelated columns), and the
hero's third button changed **Trade -> Visit Us**, jumping to the
"Call or Visit Us Today" block via `VISIT_ANCHOR_ID` + `scroll-margin-top`.
⚠️ `/trade-in` has lost its only prominent entry point. 🔴 The smooth-scroll
animation is unverified — the hidden Browser pane freezes rAF; the instant path
was proven correct instead. **And 2026-08-18 (8):** a 24px **copy-address
button** now sits beside the address on the homepage CTA, the contact panel and
the About showroom section (not the footer). It copies street+city only — no
landmark, no business name — because the paste target is a maps app. 🔴 The copy
itself is unverified: the hidden pane leaves `document.hasFocus()` false, which
the browser blocks both clipboard paths on; the graceful failure path WAS
proven. **And 2026-08-18 (9):** the map frame is now **square**
(`aspect-ratio: 1/1`, sized by `maxWidth`) — 448px on the homepage, 512px on
contact, 288px at a 320px viewport — because the old letterbox showed a corridor
of Shirley St with no context north or south of the door. The **footer address
gained the copy button** too, so all four address surfaces have it.

🟢 **Four owner-requested changes shipped in the same 2026-08-18 deploy:**
the octopus mark now shows at every viewport width (it was hidden below 768px);
the ES/EN chip moved out of the header into the mobile menu below `md` to pay
for the space; the route progress bar is now immediate on every navigation,
including shop filters and button-initiated navigations; and the photo swipe is
one shared gesture that triggers on a slight sideways move. Full gate passed
(`tsc`/`lint` clean, **1016/1016**, 454/454 pages). ✅ Staging was rebuilt after
this batch and is an exact mirror — **854 files / 19.59 MB**, 0-copy dry run. Detail in `CHANGELOG.md` 2026-08-17 (3)
through (6), and under *Storefront And Accounts* below.

**Confirmed on production, not assumed** — fetched from
`https://naplesestatejewelry.com` right after the deploy:

- Homepage: 200, title `Naples Estate Jewelry - Sell Jewelry, Gold & Silver in
  Naples, FL`, h1 `Naples Premier Gold, Sterling & Jewelry Buyers`, the eyebrow
  present, **exactly one `<h1>`** (the streaming-skeleton duplicate is gone in
  production, not just locally), `og:title` == `<title>`.
- Six pages spot-checked across both locales — `/es`, `/sell`, `/sell/naples`,
  `/services`, `/silver-services`, `/es/estate-jewelry`: all 200, all one `<h1>`,
  **all carrying `og:image`** (the blank-card fix is live), `og:locale` correct
  per locale, `og:title` == `<title>` on every one. Spanish serves Spanish.
- `/sitemap.xml`: **107 URLs**, **20 carrying `2026-08-17`**, zero left on
  `2026-07-11`, **zero `noindex` legal URLs leaked**.
- Brand assets all 200 — `favicon.ico` 11,486 B and `nav-logo.webp` 16,174 B,
  byte-identical to source.

**Staging** (`C:\Users\rcman\NEJ-repo-staging`, **843 files / ~19.3 MB**) was
re-synced after this doc update and re-verified as an exact mirror. It now
represents what is live, so the next batch starts from a clean baseline.

**No SQL is outstanding.** All three migrations this batch touched were applied
in Supabase and verified live. The 2026-08-15/16/17 work adds none.

**What went live in it:**

| | |
| --- | --- |
| Refund ledger rework | `paypal_refunds.amount` = this refund's own amount; order total SET from PayPal's cumulative |
| Checkout price-drift guard | `/api/checkout/quote` + `price_changed` 409 — a buyer can never be charged an unshown total |
| Cart drawer quoting | drawer and checkout now show the same live figure |
| First-paint fixes | 533KB was queue-jumping the 21KB stylesheet that gates the first pixel |
| Black header wordmark | owner request |
| **Whole-dollar item prices** (2026-08-15) | rounding moved onto the VALUE, so a card and its charge are one number; closes a live $5,533-vs-$5,533.47 gap |
| **Button font cascade fix** (2026-08-15) | a duplicated un-layered `font: inherit` was discarding every Tailwind font utility on every form control |
| **Touch tap feedback** (2026-08-15) | press states were gated by WIDTH, so phones had none; now `(hover: none)`, CSS-only so it cannot disturb the swipe gestures |
| **Route progress bar** (2026-08-15) | 2px gold bar at the header's base; renders only after 120ms and is removed the instant the route commits |
| **Nav closes on outside tap** (2026-08-16) | mobile menu + accordions dismiss on `pointerdown` outside the `<header>` and on Escape; previously the toggle was the only way out. Anchored to the header so the toggle cannot close-then-reopen |
| **Homepage hero + H2s** (2026-08-16) | eyebrow **"One Piece or an Entire Estate"** over h1 **"Naples Premier Gold, Sterling & Jewelry Buyers"**; homepage H2s gained the location (**"We Buy Gold in Naples"**, **"We Sell Estate Jewelry in Naples"**). Headings mentioning Naples went **0 → 3** per locale. ⚠️ The h1 is 46 chars, so the hero headline block was widened to `72rem` — **2 lines on desktop, 3 on phone/tablet** (`92vw` binds below ~1250px, so mobile is untouched; `.home-hero-bottom` stays `52rem` deliberately). ⚠️ Headline `line-height` is **1.15 and must not go below ~1.1** — at 0.95 the lines overlapped by 12.6px and the "p" of Naples collided with the "i" of Sterling. ⚠️ "Premier" not "Premiere". Says nothing about the service model, because a storefront is opening |
| **SEO audit + 4 fixes** (2026-08-16) | 8 ES pages served ENGLISH titles/descriptions — now localized; 6 `noindex` legal pages removed from the sitemap (113→107); the streaming skeleton's `<h1>` (the domain name) removed so `/`, `/es`, `/shop` have ONE h1; `/sell` 81→72 chars and `/services` given a real title |
| **`pageMetadata()` sitewide** (2026-08-16) | every public page now emits its OWN social card. Fixed **blank cards on `/sell` and every `/sell/[city]`** (hand-rolled `openGraph` with no `images`) and interior pages sharing as the homepage. `noindex` pages deliberately excluded |
| **Spanish social card** (2026-08-16) | `/es` served English `og:`/`twitter:` title AND description, plus an `og:url` pointing at the English homepage. Now localized, with `og:locale`. ⚠️ page-level `openGraph` REPLACES the layout's — restate `images` or the card goes blank |
| **New octopus mark** (2026-08-16) | owner's floating artwork replaces the old framed emblem in **both** places — header `nav-logo.webp` (157×120 transparent, 16KB, FULL artwork) and the favicon pair (square **crop**, so the creature fills 100% of a 16px tab rather than 77%). Icons keep transparency; header `width/height` corrected to 52/40 for the landscape ratio |
| **Favicon = octopus brand mark** (2026-08-16) | `icon.png` 96×96 + a multi-size `favicon.ico`, both cropped from the existing `nav-logo.webp`. Replaces the gold palm tree Google was showing |
| **Homepage title + WebSite entity** (2026-08-15) | title leads with the brand (Google strips a trailing one), trimmed to 65 chars; `WebSite` JSON-LD drives the site-name line; brand is "Naples Estate Jewelry", **no "Co"**. `/silver-services` title now carries "Sterling Silver". Other interior titles unchanged by design |

### Now open, in this order (post-deploy)

1. ✅ **The build published.** Owner-confirmed, and the live fetches above prove
   the new code is actually being served — not a `Canceled` build leaving the
   previous release up, which is how a past deploy failed.
2. 🔴 **Re-measure first paint on production.** The console snippet is in
   `TASKS.md`. Baseline to beat: **533KB across 30 requests before FCP.**
   Localhost reports `transferSize: 0` and cannot measure this — production is
   the only place it is real. Then check it **on a phone on cellular**, which is
   the condition the reported white screen actually lives in.
3. **Confirm the first real refund records itself** — order flips to
   `refunded`/`partially_refunded` and a ledger row appears carrying that
   refund's own amount and PayPal's real refund id.
4. **Watch for the price-change banner** the first time metal moves mid-checkout.
   Its payload contract and copy are test-pinned, but nobody has seen it render.
5. **Nudge the recrawl in Search Console** — resubmit the sitemap and Request
   Indexing on `/`, `/sell`, `/services`, `/silver-services` (the four whose
   titles changed). Optional, not required: nothing about this deploy can hurt
   search, since no URL, route, or robots directive changed. The sitemap needs
   no manual edit — it is generated by `sitemap.ts` at build time — and its
   `lastmod` was bumped to 2026-08-17 so the change is actually signalled.
   Expect titles to swap in over days-to-weeks and the favicon to lag longer.

### What this session produced

- **Discount codes** — admin tab + checkout field, percent or fixed-dollar, with
  optional minimum order, expiry and redemption cap. Live and verified in
  production.
- 🔴 **A PayPal refund bug** — every refund silently failed to record. Found by
  accident while testing discounts; verified fixed against one full and two
  partial live refunds.
- 🔴 **A checkout price-drift bug** — the buyer's screen could show a different
  total than the one charged. Reported from a sibling site; confirmed here by
  measurement ($6,462.72 → $6,393.39 on one bracelet within a day).
- **A first-paint investigation** — the reported "site appears to not exist" is
  load ORDER, not server speed. TTFB is a healthy ~0.19s.
- Two smaller items: the button-font fix and the black wordmark.

### Five things a future session should NOT re-derive

- ✅ **The "~205 buttons carry Tailwind font classes that do nothing" hazard is
  CLOSED (2026-08-15)** — and the fix was a *deletion*, not the re-layering the
  old note predicted. Tailwind's preflight already provided `font: inherit` in
  `@layer base`; `globals.css` carried an un-layered duplicate that outranked
  it. Measured blast radius was small: only the shop-card photo arrows, the
  drawer close, and the header Menu button moved. Do not re-add that
  declaration. See DECISIONS and CHANGELOG 2026-08-15.
- **Sandbox rows live permanently in the live `orders` table** (early July,
  before the 2026-07-09 go-live). Tell them apart by the host in
  `payment_response`, not by a 404 from PayPal.
- **`paypal_refunds.amount` means this refund's OWN amount** since 2026-08-13,
  and reconciling against a SUM of the ledger is valid again.
- **The homepage boot splash cannot fix slow first paint** — it is
  server-rendered, so the earliest it can appear is FCP, the very thing being
  waited for. It arrives *after* the white screen. Do not reach for it as a
  remedy.
- **Every surface showing a cart price must quote**, not read the stored label.
  A half-applied fix here manufactures a visible contradiction between two
  surfaces one click apart.

### ✅ Earlier in this batch: deployed and verified in production (2026-08-13)

The batch is live and was exercised end to end through an authenticated admin
session in the owner's own browser.

**One bug was caught in production and fixed without a redeploy:** the admin
Discount Codes page could READ but not WRITE —
`permission denied for table discount_codes`. The migration granted only
`SELECT` to `authenticated`, and Postgres checks GRANTS before RLS. Fixed by
`supabase/discount-codes-grant-fix-2026-08-13.sql` (already run). See DECISIONS,
*"An RLS policy without a table GRANT is a page that reads but cannot write"*.

Verified working live: create / edit / deactivate / delete, the percent↔dollar
type toggle, required-field validation, the codes table, the checkout chip and
discount line, and the checkout validation API. Button typography confirmed —
the font fix shipped correctly. **The pre-discount shipping-tier rule holds in
production**: a $5,518.10 order discounted to $4,414.48 still drew the $99.00
Registered Mail tier and still blocked Overnight. All test data removed.

**One thing remains unexercised in production:** the refund fix. Every refund
before this deploy failed to record; the corrected path has been proven locally
against real PayPal refunds but has not yet run automatically end to end.
**Confirm the first real refund records itself.**

### What this session produced

- **Discount codes** — new admin tab, checkout field, percent or fixed-dollar,
  optional minimum order / expiry / redemption cap. SQL applied, proven by a
  real purchase.
- 🔴 **A PayPal refund bug found and fixed** — the most consequential item here.
  Every refund silently failed to record. Verified against one full and two
  partial live refunds.
- **A button font bug** — Tailwind font utilities are inert on `<button>`
  sitewide; fixed in the discount components only.
- **A pre-deploy PayPal audit** — the four mysterious `refunded` orders are all
  pre-go-live test artifacts, two of them sandbox. No customer money involved.

### Three things a future session should NOT re-derive

- **~205 buttons across the codebase carry Tailwind font classes that do
  nothing.** Pre-existing, understood, deliberately not fixed sitewide.
- **Sandbox rows live permanently in the live `orders` table** (early July,
  before the 2026-07-09 go-live). Filter by the host in `payment_response`.
- **`paypal_refunds.amount` was reworked 2026-08-13** and now means *this
  refund's own amount*; `orders.refund_amount` is SET from PayPal's cumulative.
  Reconciling against a SUM of the ledger is valid again. ✅ **Both halves are
  now live** — the SQL was already applied, and the code shipped 2026-08-17.

### ✅ Discount-codes SQL applied and proven by a real purchase (2026-08-12)

`supabase/discount-codes-2026-08.sql` has been run in Supabase. A real $42.39
PayPal purchase with a 20% code passed **18 of 18 checks** — including the
atomic redemption inside `capture_paypal_order` and PayPal accepting the
discount breakdown, the two things that could not be verified any other way.
No manual SQL is outstanding again. Detail: CHANGELOG 2026-08-12.

✅ **Test data fully torn down 2026-08-12**, after the payment was refunded in
PayPal (full $42.39, zero fee). Verified clean: 0 test products, 0
`discount_codes`, 0 redemptions, 0 orders with a discount code, no orphaned
`paypal_refunds` row, and `DEEPFIELD_SYNC_DRY_RUN` restored to `false`.

🔴 **That refund exposed a real production bug, now FIXED (deployed 2026-08-17):
every PayPal refund silently failed to record.** The money moved correctly but
the order stayed `paid` with a null `refund_amount`, because a
`PAYMENT.CAPTURE.REFUNDED` resource is a REFUND, not a capture — so the refund
id was passed where the capture id belonged and `apply_paypal_refund` refused
the write. See CHANGELOG 2026-08-12 and DECISIONS.

✅ **Nothing needs repairing from it.** Audited 2026-08-13: **no refund-type
webhook has ever been received on a real order**, so no customer refund was
lost. The four orders sitting at `refunded` with a null `refund_amount` are all
pre-go-live test artifacts — two SANDBOX ($5,646.90 and $37.10, fictional money)
and two live $1.06 owner tests the database wrongly calls refunded. Owner is
deleting all four; see `TASKS.md`.

✅ **Refunds are verified both ways, both LIVE.** Full: end to end on a real
$42.39 capture. Partial: two real partial refunds ($0.50 then $0.56 on a $1.06
purchase, 2026-08-13) taking the order `paid` → `partially_refunded` →
`refunded`, plus 18 synthetic checks covering `PENDING`-ledger attachment,
idempotent replay and the over-refund clamp. **`total_refunded_amount` is
confirmed CUMULATIVE** — the assumption the incremental branch rests on. The
long-open "PayPal refund matrix" item is closed for refunds; capture races,
disputes and invoices remain untested.

⚠️ **Reconcile refunds against `orders.refund_amount`, never a SUM of
`paypal_refunds.amount`** — the ledger amount can drift on a repeat call for an
already-applied refund id. Unreachable from the real webhook path; see DECISIONS.

### ✅ That deploy happened — 2026-08-17

This section described the batch as finished and waiting. It shipped on
2026-08-17, together with everything added to it through 2026-08-16. See the top
of this file for the production verification. The staging figures once quoted
here (835 files, rebuilt 2026-08-13) are superseded by the current **843 files**.

**Nothing further is needed before deploying.** Copy the staging folder into the
repo folder, keeping that folder's `.git`, then push.

**What is in it:**

1. **eBay per-item exclusion** — the two Rolexes are held out of eBay by id
   (`EBAY_EXCLUDED_PRODUCT_IDS`). WARNING: **deploy before running any bulk eBay
   sync** — until it lands they sort FIRST in the enqueue order and would fail
   back to `error`.
2. **Bulk-enqueue ordering** — `orderEnqueueCandidates` (stale -> error ->
   published) so a repeated bulk run advances instead of redoing its first page.
3. **Marketplace flag split** — "Content stale" plus a separate price chip.
4. **In-app-browser stutter fix** — `svh` sitewide, guarded `resize` listeners.
5. **Announcement banner** — pinned inside the hero frame, now the
   free-evaluation promo, linked to `/free-evaluation`.
6. **Discount codes** (2026-08-11) — a new admin tab plus a checkout field.
   Percent or fixed-dollar, with optional minimum order, expiry, and a hard
   redemption cap. Its SQL is **already applied** in Supabase, and the feature is
   proven by a real purchase.
7. **PayPal refund fix** (2026-08-12) — 🔴 the highest-value item in this batch.
   Before it, **every refund silently failed to record**. Verified live on a
   full refund and two partial refunds.
8. **Button font fix** (2026-08-12) — Tailwind font utilities are inert on
   `<button>` in this app; the discount components now set font properties
   inline. Scoped to those components deliberately, not fixed sitewide.
9. **Refund ledger rework** (2026-08-13) — `paypal_refunds.amount` now has one
   meaning. **Its SQL is already applied**; the code is not.
10. **Checkout price-drift guard** (2026-08-13) — a live quote endpoint plus a
   `price_changed` rejection, so a buyer can never be charged a total their
   screen did not show. No SQL.

### How this folder ships

There is **no git workflow here**. Copy `C:\Users\rcman\NEJ-repo-staging`
wholesale into the repo folder (`OneDrive\Documents\GitHub\NaplesAntiquesLLC.com`),
keeping that folder's `.git`, then push. Rebuild staging after any edit — the
exact command is in `TASKS.md` under *Copying to the repo folder*.

WARNING: **never copy the project root directly** — it contains `.git` AND a
stray `next-app/.git`, and the latter would silently drop the whole app from
commits. **Check the deploy reaches `Published`**; one showed `Canceled` earlier
in this session (superseded, not lost, but do not assume).

### What changed structurally this session

- **GitHub Actions owns every cron now**, not Netlify. All five Netlify
  scheduled functions had NEVER executed — a platform fault, not our code.
  `.github/workflows/scheduled-jobs.yml` replaced them and is **confirmed firing
  on its own**. The `.mts` files remain only so the change is reversible.
- **The eBay shipping-tier campaign is COMPLETE** (85 of 86; #82 is
  write-blocked by design).

### Before writing code, read these DECISIONS entries

- *An absent record is a fault, not a clean slate* — why a never-run schedule
  must render red.
- *Content freshness and price-push health are two separate signals* — do not
  merge them; a successful price push cannot clear `out_of_date`.
- *A bounded bulk run must ORDER its queue, not just cap it*.
- *Watches are not listed on eBay* — do NOT implement the `Department`
  `TODO(ebay-verify)` in `mapping.ts`; it is answered.
- *Viewport height is `svh`, and `resize` is never listened to bare*.
- Hero/shop-card rules: *One solid background per slideshow*, *On touch, the hero
  snaps exactly one slideshow per gesture*, *Shop-card photos: swipe + windowed
  dots on touch*. Older entries describing the removed background sweep carry
  inline supersession notes — the newer entry is the rule.

### Verification at session end

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npm run lint` | clean |
| `npm test` | **1016 passed / 1016**, 99 files |
| `npm run build` | compiled successfully, **454/454** static pages, no warnings |

Run **2026-08-17** from a deleted `.next` with the dev server stopped. Test
progression this session: 998 (as deployed) → 1004 (route bar: query-only
arming, `locationKey` normalisation) → **1016** (the shared photo-swipe
arbitration). Pages unchanged at 454 throughout — worth noting, because this
session introduced `useSearchParams` into the root layout, which deopts every
prerendered page if its `<Suspense>` boundary is ever removed. The page count is
the check that catches that.

⚠️ `npx tsc` resolves a stub in this repo — run the local binary:
`next-app\node_modules\.bin\tsc.cmd --noEmit -p next-app/tsconfig.json`.

Run from `next-app/`, with the dev server stopped and `.next` deleted first.

### Owner-owned, not blocking

eBay **#82** reattachment, the `/free-evaluation` hero photo, and the phone-only
checks (in-app-browser scroll, shop cards, hero flick) in `TASKS.md`.

## Marketplace Automation — current state

**GitHub Actions owns every scheduled job.** All five Netlify scheduled functions
had never once executed (a platform fault; the `.mts` files are kept only so the
change is reversible). `.github/workflows/scheduled-jobs.yml` replaced them and is
**confirmed firing on its own** — Etsy 11:54 UTC and eBay 12:27 UTC on
2026-08-11, ~40 min after their slots, which is normal GitHub best-effort
scheduling. Zero failures. Full history: CHANGELOG 2026-08-10 and 2026-08-11.

**The eBay shipping-tier campaign is COMPLETE.** 85 of 86 available listings
carry the correct tier, verified on the live listings across two bands ($35.00 at
$600–1,000; $99.00 "Signed" at $5,000–15,000). Zero listings sit in `error`.

Two items are deliberately not synced and are **not** open work:

- **#82** — write-blocked in code pending an owner-approved reattachment on eBay.
  It is the one remaining `out_of_date` row and can only be fixed on eBay.
- **#83 / #84 (the Rolexes)** — owner decided 2026-08-11 that watches are not
  listed on eBay. Held out per item by `EBAY_EXCLUDED_PRODUCT_IDS`. ⛔ Do NOT
  implement the `Department` `TODO(ebay-verify)` in `mapping.ts`; see DECISIONS,
  *"Watches are not listed on eBay"*.

⚠️ **`.env.local` is not authoritative.** It was out of sync with Netlify for the
eBay cron secret, which is exactly how that value broke. Netlify wins; check
rather than assume. A rotated cron secret must change in three places: Netlify
(plus a redeploy), the GitHub Actions secret, and `.env.local`.


## Deployment State

- 🟢 **The email/security/integration batch SHIPPED 2026-08-08.** Outbound email,
  the `?returnTo=` product-disclosure fix, the Deep Field integration, the
  eBay/Etsy price-push fixes, and the hero carousel work are all deployed. The
  `returnTo` fix was verified against production (28/28 anonymous probes 404).
- ✅ **The email surface is fully verified. `info@naplesestatejewelry.com`
  receives mail — owner-confirmed 2026-08-09**, closing the last outstanding
  check. That mailbox is the single point of failure for every inbound path
  (footer and account inquiries, order notifications, marketing From/Reply-To,
  bounce handling, both JSON-LD blocks), so it stays worth naming even though it
  is no longer an open task. The standing hazard for any FUTURE email change is
  unchanged: DMARC is at `p=quarantine`, so a DKIM or alignment fault delivers to
  **spam without erroring** — a green "sent" in Resend's log is never the check
  that matters, only an opened inbox is. Checkout is unaffected either way (send
  failures are caught and never throw) and missed receipts re-send from
  Admin → Orders.
- 🟡 **The batch grew substantially on 2026-08-09 and is now a real
  UX release** (still no security or delivery impact): the shop-card touch pass
  (mobile Add to Cart restored, cart icon sitewide, dot indicators + swipe,
  single-card-off-cover model), the hero touch snap + slowdown, the hero
  performance batch (double-fetch fix, q82, spinner), and **one solid
  background per slideshow** (the per-photo sweep is removed). Plus the
  earlier small items: Deep Field image budget 18 → 30 and test hardening.
  The one manual SQL for the batch (`add-slideshow-bg-colors.sql`) is ALREADY
  RUN and owner-verified, so deploying is copy-and-go. See CHANGELOG
  2026-08-09 and the smoke list in TASKS.
- **Production:** `https://naplesestatejewelry.com` is live on Netlify. The
  `.com` domain is primary; `naplesestatejewelry.co` and
  `naplesantiquesllc.com` redirect path-preservingly to it. The `.co/api/*`
  carve-out remains for registered external endpoints.

  **Email is fully `.com` as of 2026-08-08** — the earlier mailbox-vs-sender
  split is reversed. Verified 2026-08-09: **zero `@naplesestatejewelry.co`
  addresses remain in `next-app/src`** (18 `info@…com`, 8 `noreply@…com`).
  Contact addresses, Reply-To, schema.org `email`, and marketing campaign
  senders are all `.com`. Do not restore a `.co` address. Still true regardless:
  **never alter `.co` MX records as part of website work.**
- **External domain migration:** complete. GoDaddy DNS, Netlify primary/cert,
  environment URLs, Supabase Auth, PayPal/eBay/Etsy registrations, Search
  Console, sitemap, and Google Change of Address were completed and verified.
- **Local source-of-truth batch — FULL GATE PASSED 2026-08-09 (re-run at the
  end of the later session, covering the complete batch).** Dev server stopped
  and `.next` deleted first, so this is a clean from-scratch build, not
  incremental:
  - `npm test` → **846/846 across 87 files** (unchanged; the later session's
    changes are CSS and markup, and no suite covers them)
  - `npx tsc --noEmit` → clean
  - `npm run lint` → clean
  - `npm run build` → **exit 0**, compiled successfully in 10.9s,
    **449/449 static pages**; `BUILD_ID`, `server/`, `static/`,
    `prerender-manifest.json` all present, 56 prerendered `.html`,
    911 js files across the tree
  - **Compiled-output spot check** (1022 js/css/html files): removed markers
    `Hide date label on mobile` = **0** and `testimonial-card-link` = **0**;
    new markers all shipped — `testimonial-google-link` 5 files,
    `home-hero-actions` 4, `-webkit-line-clamp` 4, the `share.google` URL 4,
    `/trade-in` 80, `modern-card-date` still present in 2.
  - **Email invariant re-confirmed:** bare `@naplesestatejewelry.co` = **0**
    files and `aol.com` = **0**, against a control of `naplesestatejewelry`
    matching 138 files (`info@…com` 76, `noreply@…com` 19). ⚠️ Method note
    worth keeping: the first attempt reported 0 for *everything* because
    PowerShell 5.1's `Select-String` does not populate `.Matches` when
    `-SimpleMatch` and `-AllMatches` are combined. **Always run a positive
    control through the same scan** — a broken absence check looks exactly
    like a clean result.

  The earlier session-end run of this same gate is superseded by this one. Its
  figures were 449 pages / 846 tests / 58 prerendered `.html` / 961 js, and its
  spot check confirmed the hero sweep's removal (`shop-card-image-progress` = 0,
  the new dot classes present, `shopping_cart` × 23, `pan-y pinch-zoom` × 4,
  `quality:82` × 3). The small `.html` and js deltas between the two runs are
  ordinary build variation.
  - ⚠️ Node here is **v24**; Netlify pins **NODE_VERSION 20** and
    `package.json` declares no `engines`, so a green local build is strong but
    not identical to theirs. Watch the Netlify build log.
  The 2026-08-06 sign-off run additionally smoke-tested 38 route/locale
  combos under `next start` (all 200 bar the correct `/es/` 308); that smoke has
  not been re-run since, as the changes after it were test-and-docs only.
- **Deploy workflow:** this folder has no git workflow. The owner copies it to a
  separate repository folder and handles version control/deployment manually.

## Runtime And Data

- The only active application is the Next.js App Router app in `next-app/`.
  Root `netlify.toml` builds that directory and publishes `.next`.
- Supabase project `evzluixourmsefwdsieu` is the system of record for catalog,
  auth, customer state, orders, inquiries, admin data, marketplace state, and
  social state. Product rows store media references, never image/video bytes.
- New product images use Supabase Storage with WebP/downscale/cache defaults.
  Product-video bytes use Cloudflare Stream; marketplace video publishing is
  not enabled.
- EN/ES routing uses `next-intl`. Public routes, metadata, validation, and legal
  behavior are paired across locales.

## Storefront And Accounts

- The product purchase panel is its own query container: the scrap-value and
  live-spot tiles always sit side by side and compact their type/padding rather
  than stacking, and the buy actions are a flush grid (one row of four on a
  column ≥470px, otherwise Add to Cart full width above Save/Inquire/Call).
- Products whose first photo is shot on black render a dark page variant. The
  dark palette applies only to content on the dark page; any card that paints
  its own light background (related products, reviews) carries
  `product-light-surface` and restores the light text tokens. Both variants
  audit clean for WCAG AA text contrast in both locales.
- **The photo swipe is ONE gesture, shared by the product gallery and the shop
  cards (`src/lib/photo-swipe.ts`, 2026-08-17, deployed 2026-08-18).** It was duplicated,
  and the gallery's copy was never given the 2026-08-09 fix — it still used
  React `pointermove`, which by spec cannot cancel a scroll, so that surface was
  structurally unable to swipe. Arbitration is now asymmetric: horizontal locks
  at **4px** sideways within a **~58°** cone, vertical only at **12px**, and in
  between the gesture is **undecided** — never claimed, so the page still
  scrolls, but not yet discarded either. That undecided window is what rescues
  the arcing thumb whose first pixels read as downward. ⚠️ Keep the vertical
  trigger well above the horizontal one and the cone at ~1.6 or below; a
  greedier cone steals genuine page scrolls, and photos are most of the
  scrollable surface on both surfaces. See DECISIONS, *"An undecided swipe is
  not a scroll"*.
- The product gallery has no hover/touch magnifier (removed 2026-08-04);
  clicking the main photo opens the full-size lightbox, and the prev/next
  controls only navigate. Swiping the main photo changes it on touch devices at
  every size; below 768px that swipe is the only on-image control, since the
  edge bars are hidden there. From 768px up the bars return alongside it. Those
  bars are narrow full-height strips hugging
  each side of the photo — the bar is exactly the
  clickable area — each fading in as the cursor approaches that side and solid
  once it is over the bar, permanently visible on touch. Their translucent scrim
  reads on any backdrop (it darkens light content and lifts dark content), so it
  no longer depends on the frame's padding colour matching the photo, and they
  sit above every layer in the frame,
  with a flat scrim whose tone follows the frame's own backdrop. The middle
  15%–85% of the photo stays the lightbox's.
- `/shop` is the canonical catalog. Public visibility is Available and Sold;
  Draft, Pending Payment, and Archived remain private. Sold prices are masked
  unless a captured sale snapshot supplies the historical amount.
- Shop gallery cards (2026-08-09 batch, deployed 2026-08-17): the photo carries windowed
  DOT indicators (max 7, tapered edges when truncated; on the scrim pill +
  hover-revealed on pointer devices, permanent and floating with per-dot
  ring/halo contrast on touch), seated on the photo's bottom edge with the
  brand/link flag lifted above and the prev/next arrows bottom-aligned to the
  flag's baseline. On touch the arrows are hidden and SWIPE changes the photo
  (native non-passive touchmove, 5px slop, ~51° horizontal cone; vertical
  drags still scroll the page); a swiped card keeps its photo until a
  DIFFERENT card is swiped (`shop-card-photo-focus`), so at most one card is
  ever off its cover. Hover auto-cycling and the 1s mouse-leave reset are
  mouse-only. Every card shows the bottom Add to Cart button at all widths
  again (mobile also keeps the corner cart icon), and the cart icon is
  Lucide's ShoppingCart sitewide (header, drawer, checkout empty state, tiles);
  the admin's `shopping_bag` uses are Etsy marketplace icons and stay. The
  **"Ca. YYYY" date shows at every width** (the mobile hide was removed
  2026-08-09); "Your price" stays hidden at every width.
- Product cards, gallery/lightbox, shop filters/pagination, account/favorites,
  cart return state, live spot pricing, and checkout are active. Product
  detail pages end with three policy accordions (Shipping & Returns /
  Condition & Wear / Payment Options, linking to the full policy pages), a
  full-width Sustainably Sourced / Fully Insured / Local Pickup trust strip
  beneath both columns, and a
  compact band of the four curated Google reviews (single source:
  `src/lib/testimonials.ts`, shared with the homepage section; the grid is
  **2 columns minimum**, 4 from 1160px, the card compacts its padding and type
  on a narrow phone rather than dropping to one column, quotes clamp to 8 lines
  in CSS with the verbatim text intact in the DOM, and the whole card links out
  to the Google Business Profile), preceded by a
  "You Might Also Like" strip of four same-category available pieces ranked
  same-type-first, each card carrying the shop cards' purity/weight/length/width
  chips from the shared `lib/product-spec-chips.ts`.
  From md up the product page is a two-column layout that fills the space under
  the photo: column 1 is the gallery then notes + the policy accordions, and
  column 2 is the purchase panel, description, and Specifications (which
  include a chain/band Width in mm for necklaces and bracelets), so both
  columns end together (~947px at 1280-1920 for a typical piece, down from
  1337px). **At 2000px+ the page uses the `ultrawide-page-medium` tier (1600px),
  not wide (2200px), since 2026-08-14** — the gallery is square, so column width
  is also photo height, and the wide tier produced a 1120px-tall photo the owner
  reported as too big. The gallery is now capped at **736px** and is flat at
  every width from 2000px up. **Ultrawide also rearranges the band** (owner,
  2026-08-14): row 1 is gallery | purchase panel + description + specs, and row 2
  is the compacted trust strip | notes + policy accordions — so the accordions
  sit under the specs they describe and the trust strip sits under the photo
  instead of forming a full-width band below everything. That strip is now a
  CHILD of the layout grid; below 2000px it spans both columns from a third row
  and is visually unchanged. Below md everything collapses to the original
  single-column order. The trade-in
  service has a named page at `/trade-in` (Gold & Silver Trade-In Program),
  linked from the Sell menu, footer, each product page's trade-in line, and the
  homepage hero's **Trade** CTA (which pointed at `/contact` until 2026-08-09).
  Below 640px the hero's three CTAs are a two-column grid — always two up and
  one centred below, never three stacked rows — reverting to a single flex row
  of three from 641px.
  The homepage carries an announcement bar that never wraps — its type shrinks
  fluidly to hold one line. It is **not** part of the fixed header; since
  2026-08-11 it rides INSIDE the pinned hero frame (passed to `HomeHeroStack` as
  `banner`), so it stays put until the hero text releases and then travels away
  with it. The frame's height is unchanged, so the hero choreography and touch
  snap are unaffected. 🟡 **It now advertises the free-evaluation promotion
  ("Summer special · Schedule a free evaluation", owner reword 2026-08-14;
  "Oferta de verano · Programe una evaluación gratuita" in Spanish) and links to
  `/free-evaluation`** — time-limited copy that needs replacing when the promo
  ends; nothing expires it automatically. ⚠️ **This wording names a SEASON, so it
  reads wrong from roughly 22 September** — a real expiry date, not an open-ended
  one. Spanish also sits at only ~10% width headroom now (30.4px of 304px at
  320px), so lengthening it requires refitting the type clamp. The old 780px third-item reveal was
  removed with that change. It also carries
  a Meet the Owner story block, a Why Buy Estate Gold? education
  section, and four FAQ accordions linking to `/faq`, ordered hero →
  services → owner → education → FAQs → testimonials → call CTA. Checkout is a
  single-page two-column layout: one Shipping card on the left (delivery
  method → contact → address) and a sticky Order summary on the right holding
  items, totals, and the PayPal buttons, with a **Back to cart** link that
  reopens the cart drawer.
- **Touch controls confirm a tap immediately (2026-08-15, deployed 2026-08-17).** Press
  states live in an `@media (hover: none)` block in `globals.css` and are
  **CSS-only on purpose** — the shop cards and hero run their own touch gesture
  handlers, and JS press listeners risked disturbing them. ⚠️ Scope any future
  press state by POINTER, not width: the rules this replaced were behind
  `min-width: 641px`, which left every phone with no feedback. Product cards are
  deliberately excluded (they are swipeable; `:active` would fire mid-swipe).
  A 2px gold **route progress bar** (`components/layout/RouteProgressBar.tsx`)
  covers the wait after the tap. **Since 2026-08-17 (deployed 2026-08-18) it is
  IMMEDIATE and fires on every navigation** — the 120ms delay is gone. That
  delay is what made it look page- and viewport-dependent: a navigation faster
  than 120ms showed nothing, and prefetch coverage varies with how many links
  are on screen, so the same tap behaved differently on a phone and a desktop.
  It now also arms on **query-only** navigations (shop filter/sort/view/
  pagination) and on navigations started from a `<button>`, via the exported
  `startRouteProgress(href)`. It is still removed the instant the route commits,
  with no minimum display or fade tail — that half was re-offered to the owner
  and deliberately declined, so **a fast navigation flashes by design**. It sits
  at the **base of the header**, offset from the `--site-header-height` token and
  made conditional on `body:has([data-site-header])` so admin (which renders no
  site header) keeps a `top: 0` fallback rather than a bar floating mid-page.
  ⚠️ **Completion is keyed on path + query and therefore reads
  `useSearchParams`, so the `<Suspense>` wrapper in `[locale]/layout.tsx` is
  load-bearing** — without it all 454 prerendered pages deopt. ⚠️ The shop's
  centred spinner was removed as a duplicate (its screen-reader live region
  stays). See DECISIONS, *"The route bar is immediate, and that is the whole
  point"* and *"Tap feedback is CSS-only…"*, including the `popstate` trap.
- ✅ **In-app-browser viewport jump — ROOT CAUSE FOUND, FIXED AND DEPLOYED
  (2026-08-18, owner-confirmed).** Measured on the live site from inside Instagram's iOS browser,
  not inferred:

  | reading | value |
  | --- | --- |
  | `vh` / `svh` / `dvh` probes | **all three identical**, and all three moved |
  | `innerHeight` | **729 ↔ 853** — 124px of chrome |
  | homepage document height | **423px** swing |

  🔴 **`svh` is not stable in an in-app browser.** Instagram resizes the
  WKWebView natively rather than retracting browser chrome, so WebKit sees a
  plain window resize: there is no small-vs-large viewport to distinguish, the
  three unit families collapse into one number, and that number tracks the
  toolbar. The 2026-08-11 batch adopted `svh` *because* it is "stable across
  exactly this event" — true per spec, false here. That is why two rounds of
  fixes changed nothing.

  **The homepage hero is the amplifier and the arithmetic closes:** its runway is
  `(100svh - header) + 240svh` = **3.4 × the unit**, so 124px of chrome becomes
  3.4 × 124 = **421.6px** against **423px** measured. A page whose height moves
  under a scroll is the jump.

  **Fix:** `--app-vh`, written before first paint by an inline script in
  `[locale]/layout.tsx` and refreshed **only** through `onLayoutAffectingResize`
  (160px tolerance, above the 124px measured). `globals.css` keeps
  `--app-vh: 100svh` as the no-JS fallback. The hero runway/frame, `HomeHero`
  and the `<body>` shell read the token. Verified both ways: a 124px height
  change leaves the token, the document height (7820px) and the runway (2844px)
  unmoved — the `svh` rule would have taken the runway to 2423px — while a
  rotation updates them. See DECISIONS, *"`svh` is NOT stable in an in-app
  browser"*, which supersedes the premise of the older `svh` entry.

  ℹ️ Modal/panel max-heights stay on `svh` deliberately — they do not contribute
  to document height, so they cannot cause this.

  ℹ️ **The `*-screen` → `min-h-svh` change was a real defect and NOT the cause.**
  On the failing device `vh` and `svh` are the same moving number, so it could
  not have helped. Kept, because it is correct everywhere `svh` behaves per spec,
  and guarded by `lib/__tests__/viewport-units.test.ts`.

  ℹ️ **The hero touch snap is cleared** by this data: homepage `auto-scroll`
  maxed at 134px ≈ the 124px toolbar travel, i.e. the browser clamping scroll as
  the document resized — not the 1-second animated snap.

  ✅ **Deployed and owner-confirmed 2026-08-18: the jump is gone.** The
  temporary `?vpdebug=1` overlay and its DEBUG button have been removed; 0
  occurrences of `vpdebug` remain in the built JS.
- The fixed site header is fully opaque (`#f9f9f7`, no backdrop blur; the mobile
  menu panel likewise), and its height comes from one token,
  `--site-header-height` — 3.5rem on phones, 4.5rem from md up. The header is
  sized BY the token, so page offsets (`.site-header-offset`), sticky tops, and
  full-height panes derive from it and cannot drift. A source guard test rejects
  a reintroduced `pt-16` main, `top: 4rem`, or `calc(100svh - 4rem)`.
- **The octopus mark shows at EVERY width, and the ES/EN chip is md-and-up only
  (2026-08-17, deployed 2026-08-18).** The mark was `hidden md:block`, so phones and
  sub-768px tablets carried the wordmark alone; the language chip was a
  duplicate of a control the mobile menu already had, so it moved out of the
  header row below `md` to pay for the mark.
  ⚠️ **The brand row is genuinely full on a narrow phone**, and the brand link is
  `shrink` + `overflow-hidden` — so a mark that does not fit does not break
  visibly, it silently clips the tail off "Naples Estate Jewelry". Three numbers
  share one budget below `md` and must move together: the mark height
  (`clamp(1.75rem, 7vw, 2rem)`, bounded at 767px so it never fights `md:h-10`),
  the wordmark size (one fluid `clamp(8.75px, 2.9vw, 11px)`, replacing a pair
  of rules that STEPPED 10px → 11px at exactly 400px — the worst width in the
  band), and the brand gap (8px → 5px). Both mark heights are the header's own
  content budget (32px of the 56px mobile token, 40px of the 72px desktop one),
  so the token is unmoved. **Net effect: the mark was added and nothing else got
  smaller** — the `2.9vw` clamp is at or above the pre-mark wordmark size at
  every width.
  **Re-measure the 320–430px band in Spanish with the menu OPEN before changing
  any of the three** — that is the widest state (`Cerrar` is the longest toggle
  label) and English carries roughly twice the slack, so an English-only check
  will pass a layout that clips. Verified 0px clipping and 0 page overflow at
  320/350/400/430/639/640/767/768/1280, with 11.7–25.9px of slack across the
  phone band.
  ℹ️ Hiding the chip is safe for mobile-first indexing: hreflang lives in the
  HEAD via `pageMetadata()`, not in that link.
  ⚠️ `HEADER_STYLES` is a template literal — **never put a backtick in a comment
  inside it**; it ends the string and the error surfaces as a bogus
  "Expected a semicolon".
- The homepage hero is a scroll-pinned parallax stack (`HomeHeroStack`) of
  THREE slideshows handing over in overlapping crossings, everything traveling
  upward (the next slideshow rises from below); the headline/sign-up/CTA
  overlay stays pinned until the frame releases. Full choreography rules live
  in DECISIONS. Each slideshow shows **one solid admin-chosen background
  color** for its whole time on screen (2026-08-09, deployed 2026-08-17 — the per-photo
  sweep is removed; `add-slideshow-bg-colors.sql` already run and verified),
  and the overlay's light/dark text theme derives from the dominant pane's
  color by luminance. On TOUCH the hero SNAPS: one gesture advances exactly
  one slideshow however hard the fling (step measured from where the gesture
  began; B's snap point solved from the crossing constants), with a smooth
  ~1s scroll to the next slideshow (`SNAP_STEP_MS`) and free exit at both
  ends; wheel/desktop scrolling is untouched by the snap. **The runway is split
  by pointer type since 2026-08-14: 240svh on touch, 210svh on everything else**
  (owner asked for a slightly faster desktop scroll — ~12.5% less scrolling,
  measured 2280px → 1995px of travel at 1500×950). Pointer type is therefore
  geometry, not just the easing curve, so a pointer change re-measures.
  The scroll handler also bails on unchanged progress, so it no longer rewrites
  pane transforms while the visitor is anywhere below the hero. All three lineups are admin-curated (Slideshow 1/2/3 tabs;
  all migrations run; later lineups mirror A while empty), each with its own
  background color control; random draws FILL the editable lineup and saved
  lineups are always explicit manual lists. Lineups may include sold pieces
  (no price caption, product page shows Sold). B arms on first scroll intent
  or idle, C one idle beat later, so initial load carries one carousel.
- The local batch fixes thumbnail-rail clipping/wrap stutter, normalizes all
  seven password fields through one shared eye-toggle component, and expands
  large application canvases at ultra-wide breakpoints while preserving narrow
  prose/dialog surfaces.
- Admin Products fills surplus width at 2100px+, expanding Brand first and then
  distributing remaining space across flexible columns.

## Checkout, Orders, And Compliance

- PayPal Orders API v2 owns payment. Totals, product availability, U.S. address,
  shipping method/fee, and tax are recomputed server-side. There is no inventory
  hold; the first successful capture wins one-of-one inventory.
- **Item prices are whole dollars (2026-08-15, deployed 2026-08-17).** Every offered
  price — spot-computed or manual — is rounded in `getProductPriceValue()`, the
  single funnel feeding checkout, PayPal, eBay, Etsy, the social card, Deep
  Field, and sold-price capture. The rounding is on the VALUE, not in a
  formatter: before this, a card advertised $5,533 while checkout collected
  $5,533.47. `formatUsdPrice` is now the only price formatter. **Tax and order
  totals still carry cents** — 6% of a whole dollar is not a whole dollar — as
  do melt/scrap, the live spot ticker, and any already-captured `sold_price`.
  ⚠️ A price under $0.50 rounds to $0 and is refused everywhere, deliberately.
  See DECISIONS, *"Item prices are whole dollars"*.
- **The buyer is never charged a total they were not shown (2026-08-13,
  deployed 2026-08-17).** 64% of the catalog is spot-linked, so a cart's stored price
  label drifts from the chargeable price as metal moves — measured at $69.33 on
  one bracelet within a single day. Two halves: `POST /api/checkout/quote`
  (read-only, keeps the summary showing live figures) and a `price_changed`
  guard in `paypal/create-order` that returns **409 before creating anything**
  when the displayed total and the authoritative total disagree by a cent or
  more. The server always charges its own price; the client's `quotedTotal`
  only decides whether to stop and ask. See DECISIONS, *"Never charge a total
  the buyer was not shown"*.
  - **Both cart surfaces quote** — the checkout summary and the cart drawer.
    The drawer was missed in the first pass, which briefly made the two
    contradict each other one click apart; it now quotes on open. Any NEW
    surface that shows a cart price must quote rather than read the stored
    label, or it will reintroduce that contradiction.
  - ✅ The guard's rejection paths are **verified live in production**; the
    matching-quote path was deliberately not run there (it creates an order).
- **Discount codes (2026-08-11, deployed; its SQL is applied).** Admin →
  **Discount Codes** creates a code that is either a percentage or a fixed
  dollar amount off, each optionally carrying a minimum order subtotal, an
  expiry, and a total-redemption cap. Shoppers enter it at checkout.
  - The discount comes off **merchandise only**. Shipping tier and the $5,000
    Express cutoff key off the **pre-discount** subtotal; Florida tax is charged
    on the **discounted** merchandise plus shipping. A fixed discount is clamped
    to the subtotal, so merchandise can reach $0 but never negative.
  - **The cap is the real reuse control**, enforced by a conditional UPDATE
    inside `capture_paypal_order`'s existing row-locked transaction. "Once per
    email" also exists but is a **speed bump only** — guest checkout means a
    second email defeats it, and that is a deliberate accepted limit, not a bug.
    See DECISIONS, *"the cap is the control"*.
  - The checkout validation route is a **preview**; the charged discount is
    recomputed server-side in `buildOrderDraft` from the code string alone.
- Shipping is U.S.-only. Local Pickup is free. Insured shipping uses value-based
  tiers; $5,000+ Standard uses USPS Registered Mail, and Express is unavailable
  above that coverage threshold.
- Current tax policy is 6% on merchandise plus charged shipping for Florida
  destinations and no collected tax outside Florida. County surtax and any
  additional nexus rules remain blocked on accountant/legal review.
- Orders support invoices, receipts, fulfillment email/history, refunds,
  recycle-bin restore/permanent delete, and sold-price locking. The controlled
  live PayPal recovery/refund/race matrix remains open.
- **All outbound mail sends from `@naplesestatejewelry.com`** (Resend's only
  verified domain since 2026-08-05). Customer receipts and fulfillment updates
  carry `Reply-To: info@naplesestatejewelry.com`; marketing keeps
  `Reply-To: chris@naplesestatejewelry.co`, a live mailbox. Never "fix" a sender
  back to `.co` — it will not send at all. See DECISIONS.md for the
  mailbox-vs-sender split.
- The checkout form's fields are properly labelled (`id`/`htmlFor`) and carry
  full `autocomplete`; keep both when editing `CheckoutClient.tsx`, since the
  visible `.form-label` markup does not associate on its own.
- Privacy, Terms, Returns/Refunds, Shipping, Accessibility, and cookie controls
  are present. Auction and vendor pages are retired and redirect to current
  destinations. Counsel review remains recommended.

## Marketplace Integrations

- **The product table carries TWO chips per marketplace (2026-08-11, deployed 2026-08-17):**
  the state chip, relabelled **"Content stale"** (was "Out of date"), and a
  separate **price chip** ("Price failed" / "Price stalled") that appears only
  when `error_count > 0`. They measure different things and must not be
  conflated — a successful price push cannot clear content drift, because the
  push never writes `content_hash`. See DECISIONS, *"Content freshness and
  price-push health are two separate signals"*. The price chip is invisible today
  because no listing has a failure, which is correct.
- Etsy and eBay are independent, review-first one-way sales channels. Both have
  connection/settings, previews, per-item and bulk sync, status reconciliation,
  delist/relist behavior, price freshness, shipping policy/profile selection,
  and bounded observable daily price-push infrastructure.
- Seven insured-shipping tiers are provisioned on **both** marketplaces. One
  controlled listing update per marketplace still needs owner verification.
- **Daily price pushes: schedules were always correct but had never run** (zero
  `scheduled_price_push` rows ever, in a log that records even skips) — and as of
  2026-08-10 they **still** never have, because Netlify is not invoking any
  scheduled function on this site. See the red section at the top. eBay's
  `price_push_enabled` was also `false`; the owner enabled it 2026-08-08. Three
  code defects fixed the same day — sold products were permanent eBay
  price-push candidates and produced ~33 guaranteed HTTP 400s per run
  (pool 124 → 88), `error_count` never incremented so nothing could back off
  (33 failures became 139 error rows in one run), and `err.detail` was
  discarded so every failure logged an unusable generic message. Etsy carried
  the same defects but is clean in practice because its auto-delist moves sold
  listings outside the selection; fixed there too. ✅ **Deployed 2026-08-17** —
  production runs the fixed code, so the 7:45 a.m. EDT eBay cron should stop
  repeating those failures. Worth confirming on its next run.
- ✅ **A disclosure bug, fixed and now live (was: fixed but undeployed):**
  any hidden product (archived / draft / pending_payment) was readable on
  production by appending `?returnTo=/admin` to its URL, with no session. The
  gate used a back-link validator as an authorization check. Found by the Deep
  Field team in a port of this code. It was the highest-priority item in the
  queue and is no longer outstanding — see TASKS and the DECISIONS rule *"A
  query parameter is never an authorization signal"*.
- **Deep Field Gallery is LIVE.** One-way outbound product push to a separate
  site, server-side only, sharing nothing but a bearer token — no Supabase
  credential crosses either way and NEJ never touches their database. The
  128-product / 974-image import into **production** is complete and reconciled
  exactly, the Netlify vars are set, and the hook is proven end to end (a save
  logs `[deepfield] synced 1 product(s)`). All environments write for real,
  including local dev, deliberately — so there is no sandbox unless
  `DEEPFIELD_SYNC_DRY_RUN=true` is set locally. The archived-product push and
  `image_count` went live 2026-08-17. Their hourly reconciliation cron — on
  *their* side, not ours — is built but not yet
  running, so hard deletes and dropped pushes currently depend on a manual poll.
  The hooks fire from admin save/status-change and both checkout sold-flip
  paths. See `features/deepfield-sync.md`.
- All scheduled-function badges were production-confirmed — **but the badge only
  proves registration, not execution.** As of 2026-08-10 none of them has ever
  actually run; see the red section at the top of this file. Do not read a
  Scheduled badge or a "Next execution" time as evidence that a cron works.
- eBay inventory #82 remains write-blocked pending deliberate reattachment to
  its external relist — now enforced in code by a pinned id
  (`EBAY_WRITE_BLOCKED_PRODUCT_IDS`) rather than inferred from a `last_error`
  string that any later write could clear. ✅ **The sold-hidden freshness bug is
  CLOSED — the repair ran 2026-08-11**, moving 36 mis-flagged rows
  `out_of_date` → `hidden_oos` with no eBay writes; 2 remain by design (no
  `last_pushed_qty = 0` marker). Remaining controlled marketplace checks are
  tracked in `TASKS.md`.
- **eBay listings are flagged `out_of_date` because the new tier fulfillment
  policies are part of the content hash.** The count read 123, which was wrong:
  the freshness scan was also hashing `hidden_oos` rows, so 36 sold-and-hidden
  listings were mis-flagged. That is fixed and self-repairing on the next scan;
  the true figure is **87 available listings, 86 writable (#82 is blocked) ≈ 4
  capped runs**. The daily price push cannot clear the flag (price/quantity
  only), so applying the new shipping requires deliberate batched syncs. Every
  bulk enqueue is now bounded to 25 items and drops write-blocked and
  non-available products first. No live eBay write has been made — this is an
  owner-run campaign from the deployed admin, starting with one drawer-level
  sync verified on eBay. See `features/ebay-sync.md`.

## Instagram And Facebook

- Both channels use one guided owner flow: curate caption/photos/card → **Save
  & prepare** → review → schedule or publish. Downstream actions stay hidden
  until the prepared review is current. The generated card is always slide 1.
- Captions share the reviewed wording while retaining channel-specific link and
  hashtag blocks. Instagram uses `Store link in bio` plus an `Item:` short link
  and a larger hashtag set; Facebook uses a clickable `Shop:` URL and three
  hashtags. Tiffany references normalize to `Tiffany & Co.` and
  `#tiffanyandco`; em/en dashes receive one space on both sides.
- AI openers are manual and steerable. Skipping generation keeps deterministic
  copy. Generated/editable text must be conversational, use “this” naturally,
  never say “our,” and must be saved into a new prepared review before publish.
- Photo/card curation previews the exact contain-to-square prepared framing,
  sampled canvas, and source crop. Prepared slides have a full-size keyboard
  viewer with arrows. Caption, wording, photos, or both can be synchronized
  between channels without publishing.
- Published status reconciles conservatively. Confirmed remote deletion clears
  published state; ambiguous token/permission/network failures do not. Facebook
  publish recovery is receipt/checkpoint-safe and avoids duplicate posts.
- Facebook uses a validated Page token for **Naples Estate Jewelry**; candidate
  tokens must pass app/Page/read-access checks and have at least 30 days of
  finite life. The locally connected token reported data access through
  2026-10-31 at last verification. Instagram uses its refreshable Business token.
- `/admin/social-queues` shows independent Instagram/Facebook queues, readiness,
  exact scheduled and approval times, worker health, and actions to edit,
  publish now, reschedule, or remove without discarding prepared copy.
- Allowed Eastern posting times are **noon, 2 PM, 4 PM, 6 PM, 8 PM, 10 PM, and
  midnight**. UI, API validation, defaults, dashboard copy, and both Netlify
  workers share that allowlist. Due-row queries prevent early publishing across
  EDT/EST coverage hours.
- The queues have no owner-configured or application-enforced daily post cap.
  Each worker invocation processes at most 25 due rows as a runtime safety
  bound and later invocations continue any remainder. Instagram can still defer
  a post when Meta reports its provider-enforced rolling publishing quota.
- Queue **Post now** runs in a route-persistent lower-right background widget.
  Each channel also supports selecting any ready queued rows and posting the
  selection now with one confirmation. Bulk posts run sequentially in visible
  queue order. Only one social publish or batch runs per tab; success auto-
  closes, while a failed batch stops and can resume at its failed item without
  reposting completed entries.
- Social Queues also exposes **Latest Posts**, a modal backed by the 12 newest
  locally published receipts per channel. It supports live-post links, manager
  links, conservative status refresh, public owner-written comments, permanent
  Facebook removal with confirmation, and Instagram's honest manual-removal
  handoff. The Instagram and Facebook headers independently collapse their full
  sections so long histories can be managed one channel at a time. No comment
  text is persisted locally; only an audit outcome is logged.
- Signed-in 2026-08-03 QA observed item 39 queued on both channels at 6 PM EDT.
  The seven-choice Instagram picker was opened and cancelled; no reservation,
  queue state, or public post changed. At 600px and 900px, all four row-action
  labels stayed inside their responsive two-column button grid.

## Security And Operations

- Secrets stay in gitignored local environment files, Netlify environment
  contexts, or encrypted provider rows. Only public Supabase values reach the
  browser. Project docs record locations and variable names, never values.
- Public mutation routes use validation plus edge/distributed rate limiting;
  scanner probes are blocked. Security headers are defense in depth.
- Netlify environment values are the operating configuration; local
  `.env.local` is for development only. ⚠️ "`.env.local` is stale" is a
  tie-breaker rule, **not a blanket fact** — on 2026-08-11 the owner confirmed
  its four `*_CRON_SECRET` values matched Netlify's production values exactly.
  Check before assuming a local value is wrong.
- Generated build output, caches, logs, temp files, and dependencies remain
  ignored. No scratch artifact was left by the 2026-08-03 session.
- Project memory has one current source per feature. The retired Etsy/eBay plan
  folders, kickoff notes, legacy-removal report, and obsolete carousel handoff
  were removed after their live guidance was consolidated into feature docs.

## Immediate Priorities

1. ✅ **The in-app-browser viewport jump is FIXED and owner-confirmed
   (2026-08-18).** Root cause was that **`svh` is not stable in an in-app
   browser** — `vh`/`svh`/`dvh` all resolve to one moving number in Instagram's
   iOS webview. Replaced by the `--app-vh` token. The temporary diagnostic has
   been removed. See `TASKS.md` and DECISIONS.
2. **Deploy the viewport-jump batch.** ✅ Staging is CURRENT — rebuilt after this
   session, **854 files / 19.59 MB**, 0 Extras / 0 FAILED, follow-up dry run
   0-copy. Then run the rest of the focused production smoke list in `TASKS.md`,
   plus the three never-looked-at items (Visit Us smooth scroll, copy-address
   clipboard, review-marquee loop).
3. Complete accountant review before changing Florida surtax or other-state tax.
4. Run the controlled PayPal recovery/refund/concurrency matrix.
5. ✅ Marketplace price-push and shipping-tier work is **DONE** (2026-08-11).
   What remains is owner-side only: eBay **#82** reattachment on eBay itself.
6. Finish the owner/content/credential-record items in `TASKS.md`.
7. ✅ Deep Field env vars + production import are DONE (2026-08-08). Remaining
   Deep Field items are the budget-pin test and the 30→50 retune in `TASKS.md`.
