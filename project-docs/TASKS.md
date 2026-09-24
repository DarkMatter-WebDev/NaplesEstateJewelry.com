# Tasks

> Actionable open work plus a short recent-completions summary. Full history is
> in `CHANGELOG.md`. Last reconciled: **2026-09-24**.

## ◻ OPEN — needs a human

### 🟢 2026-09-24 — Google Ads image assets: 8 images (16 files) UPLOADED ~8:38 AM ET as manual campaign-level assets — all "Pending / Under review"

Record: `CHANGELOG.md` 2026-09-24 (4) selection, (5) upload. Source files (16 = 8 images × 1:1 + 1.91:1): `C:\Users\rcman\OneDrive\Pictures\nej-google-ads-images\`. Assets table now 27 rows (11 + 16).
Set: 01 Chris, arms crossed at the counter (the Yelp portrait, 1302², owner's swap) · 02 showroom door · 03 Waterford sterling flatware · 04 tray of gold chains · 05 hand of gold rings · 06 coral cameo brooch · 07 assorted sterling serving pieces on the counter (owner's photo 08:20) · 08 Patek Philippe watch in hand (owner's photo 08:18). Landscapes of 01, 06 and 08 carry the photo with blurred, darkened sides (06 and 08 from a 3:4 window); every square is a straight crop. ⛔ No collages — Google's image guidelines list them with overlaid text; one real photo with many pieces (07) does that job. Owner will swap 02 once the new sign is up; image assets are independently add/remove-able with no learning reset.
1. ✅ Uploaded 09-24 (owner: "looks good, continue"); read back Image · Campaign · Pending · Under review × 16. ⛔ Never the "Dynamic Image Assets" / auto-created assets cards.
2. ◻ **Claude, 09-25:** read the 16 statuses (expect Eligible). A disapproval = swap that file (re-crop / different photo), never an ad edit.
3. ◻ Claude, 09-27 report: image-asset performance (Assets → Images: impressions, clicks, Google's Best/Good/Low rating once it has data).
4. ◻ **Owner, when the new sign is up:** send the new storefront photo → Claude swaps asset 02 only.

### 🟡 2026-09-24 — `/card` + `/kittcard` email line (Option B) BUILT + STAGED, awaiting the owner's push (rides with the Etsy/eBay batch below; no SQL, no env vars)

Record: `CHANGELOG.md` 2026-09-24 (3). Tappable `info@naplesestatejewelry.com` line under the phone hours on both cards (EN + ES, prefilled subject); storefront thumbnail 16:9 → 2:1 so the page is 1.7px SHORTER at 375px, not taller. Gate tsc 0 · lint 0 · 1549/1549 · build 0.
1. ◻ **Owner: push** (the same push as the Etsy/eBay manual-hold batch — one deploy).
2. ◻ **Owner, on the phone after the deploy:** open `/card` → the gold envelope line sits under "Calls answered…"; tap it → the mail app opens to info@ with the subject "Your card — Naples Estate Jewelry"; the storefront photo still shows the door and the 104 on the curb.
3. ◻ Claude, only on "verify it live": curl `/card`, `/es/card`, `/kittcard` for the `mailto:` and `aspect-ratio: 2 / 1`.

### 🔴 2026-09-24 — Etsy high-value listings OFF (33 deactivated); manual-hold fix STAGED; auto-delist toggle PAUSED — two owner steps, in this order

Record: `CHANGELOG.md` 2026-09-24 (1). State now: **35 active Etsy listings** (all ≤ $300 melt), 33 deactivated (`delisted` / `inactive`), Admin → Settings → Etsy Sync → *Auto-delist when sold/archived on the site* = **OFF**.

1. ◻ **Owner: push the staged batch** (`lib/etsy/sync.ts`, `lib/etsy/store.ts`, `lib/ebay/sync.ts`, `lib/ebay/store.ts`, `lib/__tests__/marketplace-status-reconcile.test.ts` + docs) and let Netlify deploy. The batch carries BOTH manual-hold rules — Etsy (`CHANGELOG.md` 2026-09-24 (1)) and eBay ((2), owner ruling: a manual delist on eBay or from the site is never auto-relisted). Verified before staging: tsc 0 · 1548/1548 · lint 0 · build (see staging line).
2. ◻ **Owner, only AFTER the deploy is live: switch *Auto-delist when sold/archived on the site* back ON.** ⛔ Flipping it on before the deploy re-activates all 33 on Etsy within 30 minutes (old `restore` branch). After the deploy the sweep holds them because their delist rows carry no `auto:` message.
3. ◻ **Claude, first sweep after re-enable:** read `/api/admin/etsy/status` → `statusChecks` / recent activity: expect the `reconcile_status` summary with **0 repaired** and the listing map still at 35 active. If anything restored, flip the toggle off again and read `etsy_sync_log` for that product.
**Staging (Etsy manual hold):** ✅ synced 2026-09-24 ~7:10 AM ET — dry run listed exactly the 8 touched files (`lib/etsy/sync.ts`, `lib/etsy/store.ts`, `marketplace-status-reconcile.test.ts`, CHANGELOG, TASKS, CURRENT_STATUS, DECISIONS, `features/etsy-sync.md`), 0 Extras, 1159 total; real run copied 8 / 0 FAILED (robocopy exit 1 = copied only); follow-up dry run 0/0/0, exit 0; leak check 0 `.env*` / `.log` / `.git`, no node_modules / .next / worktrees, launch.json present; positive control 222 = 222 `.tsx`; SHA-256 MATCH on all 8; staged `sync.ts` carries `isEtsyManualHold` (5 hits). Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

**Staging (eBay manual hold, same batch):** ✅ synced 2026-09-24 ~7:15 AM ET — dry run listed exactly the 8 touched files (`lib/ebay/sync.ts`, `lib/ebay/store.ts`, the reconcile test file, CHANGELOG, TASKS, CURRENT_STATUS, DECISIONS, `features/ebay-sync.md`), 0 Extras, 1159 total; real run copied 8 / 0 FAILED (exit 1); follow-up 0/0/0, exit 0; leak check 0 `.env*` / `.log` / `.git`, no node_modules / .next / worktrees, launch.json present; 222 = 222 `.tsx`; SHA-256 MATCH on all 8 plus the two Etsy files from the earlier sync; staged `ebay/sync.ts` carries `isEbayManualHold` (5 hits). Build for this state: `npm run build` exit 0, no `.next/cache/turbopack/`. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

4. ℹ️ Standing rule from today (`DECISIONS.md`): Etsy carries only items with melt ≤ $300. New listings: the admin's "Sync to Etsy" is manual per product, so the rule is applied by the owner at listing time — nothing enforces it in code (candidate for a pre-flight warning if it is ever forgotten). The four just under the line (#71 $284, #135 $276, #94 $233, #106 $231) stay live; #29 ($301) and #43 ($304) were taken down.

### Documentation follow-up identified during Codex orientation (2026-09-23)

- Reconcile superseded startup/runbook passages against the latest dated evidence
  before working in their areas: old GitHub/Netlify scheduler descriptions versus
  sole `pg_cron` scheduling; applied discount migrations still labelled pending;
  live Text Alerts and marketplace-sale reconciliation still labelled staged;
  the Deep Field read-only reconciliation route omitted from the structure map;
  older build/test counts; and completed deployment/phone checks still shown as
  unchecked beneath completed headings. The overview's pending NEJ deployment
  statement was corrected in this review. Do not rerun SQL or reopen completed
  work just because an older block says pending.
- ✅ 2026-09-24: the `npm run build` for the Etsy manual-hold fix regenerated
  `.next/required-server-files.json` — 0 `NaplesEstateJewelry.co\` paths, 4
  `.com` paths (grep). The pre-rename artifact is gone. The existing optional worktree-cleanup item
  remains separate; nothing was deleted.
- This orientation changed only project docs and did not sync the external
  staging folder. Prior staging-equality claims below are historical; include
  the updated docs with the owner's next normal handoff.

### 🟢 2026-09-23 night — Independent ads audit reconciled; A, C and D-columns APPLIED on the owner's yes; B and the log DROPPED on the owner's rulings

Page: `https://claude.ai/artifact/HnMfKo2BUqjW738nfgzFci` · records `CHANGELOG.md` 2026-09-23 (12) audit, (13) applied.
Key facts: all time 354 impr / 30 clicks / $65.29 at the last read; **Top placements 99 impr → 26 clicks, Other 255 → 4**
(blended CTR is a placement-mix number — judge Top CTR); Palm Beach 21/4 = Collier "regularly in" users (⛔ never
exclude); Lee 95 = Bonita 32/0 + Estero 28/1 + ~35 from the Lee window; every audit figure matched the account.

1. ✅ **Applied 09-23 ~11 PM ET:** **A** broad `kilates` `gramo` removed; phrase `"gramo de oro"` `"el gramo"` `"como esta
   el oro"` `"cómo está el oro"` `"cuanto esta el oro"` `"cuánto está el oro"` added · **C** Coins ad group + `"silver to
   sell"` `"take silver"`; Silver ad group + `"silver coins"` `"silver bars"` · **D** Phone calls / Phone impr. / PTR
   columns on the Campaigns table (first read: 14 call-button impressions, 0 calls). **Negatives now 90** (82 campaign +
   8 ad-group). Budget, bids, strategy, locations, keywords, ads untouched.
2. ⛔ **Dropped by owner ruling (do not re-propose):** B — `empeño` and `"gold center"` ("i want to show up next to gold
   center searches"); the daily seller-contact log ("i dont have time for that"). Measurement stays zero-effort: the call
   columns, Admin → Inquiries / Messages, Yelp leads, GBP calls/directions.
3. ◻ **Claude, Sat 09-26 morning:** read Thu 09-24 + Fri 09-25 as the two clean days (Top CTR ≥ 20%, 8–12 clicks/day,
   ≥ 9/10 clicked terms seller-intent, Phone calls column). 09-27 weekly report stands and adds Admin inquiries by day
   beside clicks by day / ad group. 10-04 watch list: Spanish still 0 clicks → reconsider the group; Bonita still 0 →
   reconsider the location; appraisal keywords' first CTR; Estate ad strength.
4. ⛔ Not to be re-raised from this sample: budget/cap/strategy, Lee, Palm Beach exclusion, exact-match duplicates,
   keyword expansion, ad rewrites, any site tag, competitor-name negatives.

### 🟡 2026-09-23 — Google Ads reach expansion: Step 1 DONE; three owner decisions open

Proposal doc: `https://claude.ai/code/artifact/0f869c91-cb79-475a-bf74-de8e24009869`.
Implemented 09-23 (`CHANGELOG.md` 2026-09-23 (2)): keywords 31 → 74 (all phrase),
campaign negatives 55 → 74. Budget, geography and ads untouched.

1. ✅ **Lee County ADDED 09-23** on the owner's decision (4 locations; reach
   727k Collier + **2,930k Lee** + 248k Estero + 216k Bonita ≈ 4× the pool).
   Presence-only verified intact after the save. ⛔ Marco Island is NOT a
   candidate — it is inside Collier County, already targeted; zero extra reach.
2. ✅ **Budget RAISED $13 → $19.00/day 09-23** on the owner's explicit decision
   (= **$577.60/mo, ABOVE the approved $300–500 range**; Claude recommended $16
   and flagged the overage — owner chose $19). Verified $19.00/day on the
   campaign row and Total: Account. ⚠️ Watch actual spend against this: the
   campaign was projecting only 67% utilisation at $13/day before the reach
   changes, so the first week tells us whether $19 is real or notional.
2b. 🔴 **Owner decision — Yelp, HELD to 09-27.** Yelp's bonus terms (read
   09-23): *"You lose any unfulfilled bonus ad budget if you downgrade or cancel
   early."* **$104.56 of the $135.39 is still unused** (through Feb 17 2027), and
   a budget reduction counts as a downgrade. Yelp does not publish the minimum
   dollar figure. So cutting Yelp now forfeits $104.56 of free budget AND drops
   the only channel with measured calls (3–4 in 30 days vs Google's 0).
   Revisit with a full week of Google data on 09-27.
3. 🔴 **RE-AUDIT 09-23 evening (`CHANGELOG.md` 2026-09-23 (8)): the expansion
   doubled impressions and quartered clicks.** Per day: 21 = 72 impr / 9 clicks /
   12.5% · 22 = 97 / 11 / 11.3% · **23 = ~170 / 3 / 1.8%.** Today: Coins 47 impr
   / 0 clicks, Spanish 34 / 0 (≈20 of those are Spanish gold-PRICE checkers —
   `precio del oro…` — the English price negatives don't cover Spanish, and the
   new keyword `"cuanto vale mi oro"` invites them); Lee + Bonita + Estero 63 / 0
   ("Naples" in every headline); the good English seller terms served with 0
   clicks = lower position. 84% of impressions are mobile phones.
   **Owner rulings 09-23:** ⛔ do NOT negative `naples jewelry buyers` (generic
   phrase — win it, don't surrender it); consignment searchers are WANTED → the
   `consignment` / `consign` negatives added 09-23 must come OUT.
   🔴 **PLAN RE-AUDITED 09-23 late (owner asked; `CHANGELOG.md` (9)): the
   Target-Impression-Share idea was WRONG for the goal.** Decomposing today's
   ~170 impressions: Lee+Bonita+Estero 63 / 0 · Spanish price ~20 / 0 · silver
   queries mis-routed to the COINS ad ~15 / 0 · diamonds/watches 9 / 0 · `naples
   jewelry buyers` 7 / 0 · buyer-intent ~3 / 0 · **genuine Collier seller queries
   ~35–40 / 3 ≈ 8–9% CTR — Monday's rate.** The good impressions still click; they
   are now a quarter of the total instead of nearly all. Dilution, not lost
   position ("0 clicks on 10 impressions" in a 6.8%-CTR group is noise). Target
   IS would buy top-of-page for the diluting queries, reset learning, and abandon
   the strategy that produced the hot days. ⛔ Do not switch bid strategy.
   ✅ **CORRECTED PLAN APPLIED 09-23 night** (owner: "do what we need to…";
   `CHANGELOG.md` 2026-09-23 (10)), every step read back after saving:
   - Bid strategy / cap / budget **unchanged** (Max Clicks, $6, $19/day) — by
     design; owner offered both levers, declined with reasons in (10).
   - Campaign negatives 74 → **78**: + `precio` `precios` `gramo` `kilates`
     `cotización` `"where can i buy"`; − `consignment` `consign`.
   - Keywords 74 → **77**: − `"cuanto vale mi oro"` (21/0), − `"sell silver
     bars"` phrase; + `"jewelry appraisal"` (Estate), `"gold appraisal"` (Gold),
     `"silver appraisal"` (Silver), `"coin appraisal"` + **`[sell silver bars]`
     exact** (Coins). ("sell silver dollars" was never touched.)
   - Coins **ad-group** negatives (new level) → **82** total: `"sell silver near
     me"` `"silver buyers"` `"where to sell silver"` `"selling silver"`.
   - **Lee County REMOVED** → Locations 3 of 3 (Collier, Estero, Bonita).
   - Estate ad re-headlined in place, 15/15: → `Jewelry Buyers in Naples, FL`,
     `We Buy Jewelry in Naples, FL`, `Local Naples Jewelry Buyer`; status
     Eligible, strength Pending (recalculating).
   ◻ **Claude, 09-25 → 09-26 (not 09-24 — review/learning clocks restarted):**
   per-day table; expect impressions ~90–110/day, CTR climbing toward 8–12%,
   Coins and Spanish no longer at 0 clicks, Silver back to double digits.
   ◻ **Claude, 09-27 report:** Estate ad strength (should return to Good), the
   four appraisal keywords' first impressions + CTR, whether `"jewelry
   appraisal"` pulls insurance-intent terms past the `"insurance appraisal"` /
   `"written appraisal"` negatives, and — still unmeasured — the Top-vs-Other
   segment for any hidden position loss.
   ◻ **Later, owner's call:** a Lee County ad group with Fort Myers copy before
   Lee is re-added; Step 2 broad match stays parked until a clean week exists.
   - ⛔ **Dropped:** the appraisals ad group idea (Keyword Planner, Collier:
     `jewelry appraisal near me` 20/mo, `inherited jewelry` 10/mo −100% YoY, the
     rest is diamond/engagement-ring = insurance intent we don't serve).
4. ◻ **Claude, 09-27:** first weekly ads report — per-day table, "Limited by
   budget" status, impression share + lost-to-rank, eligible-% insight, clicks
   by hour of day, and — if (B) is applied — the Target IS learning status.

### 🟡 2026-09-21 — Sister-site (naplesantiquesllc.com) audit DONE, read-only — owner decisions open

Findings + baseline: `SEO_LEAD_AUDIT.md` (2026-09-21 section); `CHANGELOG.md` 2026-09-21 (2).
1. ◻ **Owner → antiques-site agent:** 301 the 58 NEJ-legacy paths + `/shop/*` + `/es/*` to the same path on naplesestatejewelry.com; re-angle `/sell/sterling-silver/`; JSON-LD relationship; deep links instead of homepage-only (exact list in the chat report of 09-21).
2. ✅ **Owner decision 09-21:** no GBP for the antiques line for now (conditions to revisit: own answered number, own permanent sign, primary category "Antique store", DBA). **Antiques site switches to the owner's cell (239) 304-6229** and stops printing NEJ's number (links to NEJ instead); street address stays VISIBLE but is removed from its JSON-LD (no NEJ wording in its directions) — final handoff prompt given in chat 09-21; the antiques agent implements it.
3. ◻ **Owner decision:** add `naplesantiquesllc.com` to GSC + Change of Address from anodyneantiques.com — fine AFTER item 1's redirects are live.
1b. ✅ 09-21: antiques agent DONE + deployed; Claude verified the live site against the handoff (all pass — `CHANGELOG.md` 2026-09-21 (3)). Antiques agent is now on GSC (property + Change of Address). ◻ Still wanted from it ~3–4 weeks after the property exists: the Links report list for naplesantiquesllc.com.
4. ✅ **DEPLOYED + live-verified 09-21 ~8:42 PM ET (`main@585ab40`; `CHANGELOG.md` 2026-09-21 (4)); GitHub repo renamed to `NaplesEstateJewelry.com` + Netlify relinked the same night.** Was: `/estate-services` sister-shop sentence (EN+ES) + dead naplesantiquesllc code removed from `netlify.toml` / `proxy.ts`. ◻ **Owner: push.** ◻ Claude after the push: curl `/estate-services` + `/es/estate-services` for the sentence, `.co`/`www` one-hop 301, naplesantiquesllc.com still the antiques site. **Staging:** ✅ synced 09-21 — dry run listed exactly the 9 touched files (netlify.toml, proxy.ts, estate-services/page.tsx, ARCHITECTURE, CHANGELOG, CLIENTS, CURRENT_STATUS, DECISIONS, TASKS), 0 Extras, 1159 total; copied 9 / 0 failed; follow-up 0; leak check 0; `.tsx` control 221 = 221; SHA-256 match 6 of 6.
5. 🔴 **Owner decision — `naplesjewelrybuyers.com` brand-name leak (audited 2026-09-23, findings in `SEO_LEAD_AUDIT.md`).** A different company owns **"Naples Jewelry Buyers"** on Google Maps (5.0 ★ / 49 reviews, 11542 Tamiami Trl E, (239) 420-1918, `naplesjewelrybuyersllc.com`). Maps resolves that name **straight to them**; our satellite is #1 organic on web but their Knowledge Panel owns the right rail. Satellite traffic is small (19 clicks / 465 impr / 90 days). Already safe: every Google link on the satellite points at NEJ's real GBP (`cid=17050430560749692864`), and the page says "a service of Naples Estate Jewelry". Options, in rising order of cost/risk:
   - ✅ **(a) + (b) DONE 09-23 — BUILT + STAGED in `Documents\NaplesJewelryBuyers\`, awaiting the owner's drag-and-push.** Owner approved the mockup (`https://claude.ai/artifact/VhYk8xe9SGQoCoWGPe74AG`, Option A). Nav/hero/pill/footer now lead with Naples Estate Jewelry; all 10 sub-page footers flipped; dead schema logo (404) fixed. Details `CHANGELOG.md` 2026-09-23 (6); full reasoning + deploy steps in that project's `staging/README-DEPLOY.md`.
     - ◻ **Owner:** drag `staging/` contents onto the GitHub repo root (⚠️ **11** files now — `nej-mark.webp` is NEW; if it doesn't travel the nav shows a broken image), commit, push.
     - ✅ **Option B ALSO DONE 09-23** (`CHANGELOG.md` 2026-09-23 (7)): hero crest replaced by a **typeset** wordmark in Cinzel (already loaded, previously unused → no extra payload), not a generated image. Rendered and measured at 1243 / 375 / 320 px — no overflow, 0 console errors, gradient live. Two dead CSS rules and two wrong image aspect-ratio hints fixed in passing.
     - ◻ **Claude after the push:** curl `/nej-mark.webp` = 200, and eyeball the live hero once (the local check used a scratch copy, not production).
     - ◻ **Claude, ~2 weeks:** confirm the `/` position for "naples jewelry buyers" is still ~1 (titles and copy were untouched, so it should be).
     - ◻ **Owner, optional:** `logo.webp` (the old gold crest, 162 KB) is now referenced by nothing. Kept deliberately — no page loads it and it is the only copy of that artwork. Say the word to delete it.
   - **(c) Still open — strategic:** decide whether the satellite earns its keep at all (19 clicks/90 days).
   - ⛔ NOT an option: a GBP named "Naples Jewelry Buyers" — name taken at another address, and a second GBP at the shared suite was ruled out 09-21.
   - ℹ️ `naplesgoldbuyers.com` (also ours) has no equivalent exposure — no exact-name competitor GBP.
6. ◻ GBP pending Google update (WhatsApp chat link) — owner accepts or declines.
7. ◻ **Claude, 2026-10-19:** re-check the baseline (GSC totals/top pages, GBP split + search terms, the five searches).
8. ⏭️ **DROPPED on the owner's decision 2026-09-23: do not chase the Instagram `token_refresh` row.** The 09-21 row was never read and will not be. What this accepts: the automatic refresh runs again **09-28** (pg_cron) and the current token expires **09-30**. If the 09-28 run succeeds, nothing happens and this was noise. If it fails, Instagram auto-posting simply stops after 09-30 and the fix is a manual **Reconnect Instagram** in Admin — no data is lost and nothing else in the site depends on it. ⛔ Do not re-open this as a task; the signal to act is "Instagram posts stopped going out", not a log row.
9. ◻ **Owner decision (optional cleanup):** delete `.claude/worktrees/priceless-margulis-2de730/` — a 22 MB throwaway agent worktree whose `.git` pointer targets the old `…NaplesEstateJewelry.co\.git\…` path (gone since the folder rename 09-21). Gitignored and excluded from staging by `/XD`, so harmless either way. `CHANGELOG.md` 2026-09-21 (5).

**Staging (09-23 session close, docs only):** ✅ synced 2026-09-23 (night) — dry run listed exactly the 3 touched files (CLIENTS.md, CURRENT_STATUS.md, DECISIONS.md), 0 Extras, 1159 total; real run copied 3 / 0 FAILED (robocopy exit 1 = copied only); follow-up dry run 0/0/0, exit 0; leak check 0 `.env*` / `.log` / `.git`, no node_modules / .next / worktrees, launch.json present; positive control 222 = 222 `.tsx`; SHA-256 MATCH on all 3. (Earlier this session the CHANGELOG/TASKS/SEO_LEAD_AUDIT edits were synced the same way — see the 09-23 CHANGELOG entries.) ℹ️ The NEJ site itself has NO app-code changes this session — nothing to push from this repo; the only push owed is the **separate** `NaplesJewelryBuyers\staging\` folder (item 5). Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

### 🟡 2026-09-20 (15) — PUSHED 09-20 late night (not production-checked by Claude); owner's iPhone check open: form confirmation lands in view + "Success!" + "Send another" + call/text line, all three lead forms

Owner-approved mockup (option B + the "Need us sooner?" line). Shared
`components/contact/FormSuccessPanel.tsx` on free appraisal, contact message and
product inquiry; instant centre-scroll + one re-check after the keyboard closes;
rate-limit (429) now gets its own message (`lib/lead-form-errors.ts`). Dev-tested
at 375 px and 1280 px, EN + ES; gate tsc 0 · lint 0 · 1544/1544 · build 0.
`CHANGELOG.md` 2026-09-20 (15).

1. ✅ Owner pushed 09-20 late night ("pushed successfully").
2. ◻ **Owner, iPhone:** send the free appraisal form and the contact form →
   "Success!" is on screen without scrolling; tap "Send another" → an empty form
   at the top of the screen. (A test send creates a real lead — mark it TEST.)

### ✅ 2026-09-20 (9) + (10) — PUSHED + deployed 09-20 night; **owner CONFIRMED both iPhone checks** (no zoom on any field; 10-photo cap + red warning on both forms): photo cap 10 on BOTH lead forms + iOS never auto-zooms on a field, sitewide (no SQL, no env vars)

**(10) iOS zoom:** one rule in `globals.css` makes every text field 16px on touch
screens (`@media (hover: none)`, unlayered, `!important`); desktop keeps 14px.
Measured on dev at 375 px: every field on `/contact`, `/free-evaluation`, `/shop`
(+ filter drawer), `/order-lookup`, `/unsubscribe` went 12.5–14 → 16, nothing
shrunk, no sideways scroll. Gate 1536/1536 · build 0. `CHANGELOG.md` 2026-09-20
(10). ◻ **Owner after the push, iPhone:** tap into fields on `/contact`,
`/free-evaluation`, shop search + a filter, checkout discount code, an admin
form — no zoom. (Only an iPhone can prove it.)

**(9) photo cap:**

Owner's phone test: 11 photos from `/contact` arrived as 6, 12 from
`/free-evaluation` as 10 — the routes capped at 6 and 10 and said nothing. Now one
shared `LEAD_PHOTO_MAX = 10` (`lib/lead-photo-limits.ts`), "— up to 10 photos" on
both pickers, red "You selected 12 photos. Only the first 10 will be sent."
(`components/contact/LeadPhotoCount.tsx`). Only these two public forms take
files. Dev-tested at 375 px (12 → 10 posted, 11 → 10 posted); gate tsc 0 · lint 0
· 1531/1531 · build 0. `CHANGELOG.md` 2026-09-20 (9).

1. ◻ **Owner: push.**
2. ◻ **Owner, phone:** pick 11+ photos on `/contact` and on `/free-evaluation` —
   the red line appears and exactly 10 arrive in the email.


### ✅ 2026-09-20 (7) — DEPLOYED + production-verified 09-20 evening: phone contact bar no longer shows on desktop (57 of 57 pages as expected)

Found 09-20 during the photo test: `.mobile-contact-bar { display: flex }` beat
Tailwind's `md:hidden`, so the Call · Text · Directions strip shows at the
bottom of the seller pages on desktop. Fixed in `globals.css` (base rule
`display: none`, `flex` only inside the phone media query) + component + test;
dev-verified at 1024 / 768 / 375 px; gate tsc 0 · lint 0 · 1522/1522 · build 0.
`CHANGELOG.md` 2026-09-20 (7).

1. ✅ Owner pushed + confirmed. 2. ✅ Claude checked all 46 bar pages + 11
   no-bar pages, the live stylesheet, and 15 rendered page loads at 2560 px —
   `CHANGELOG.md` 2026-09-20 (7).


### 🟡 2026-09-20 (2) — PUSHED by the owner 09-20 (not production-checked by Claude): lead-form photo fix + phone contact bar — owner phone tests still open (no SQL, no env vars)

Built per `CHANGELOG.md` 2026-09-20 (2). Owner: "go with c and also test to be
sure it works, and version b on the bar."

**Owner:**
1. ✅ Pushed 09-20 (owner: "pushed the site batch").
2. ✅ **Proven on production 09-20 by Claude in the owner's Chrome** (5 PNGs,
   9.58 MB → posted 0.80 MB → HTTP 200 in 5.5 s → five `.webp` objects 85–130
   KB; `CHANGELOG.md` 2026-09-20 (7)). One test lead "TEST Photo Upload
   (Claude)" is in Admin → Inquiries — owner may delete it. ◻ Still worth one
   run from the iPhone (WebKit's canvas path): open
   `naplesestatejewelry.com/free-evaluation` in Safari → add **4 or more**
   camera-roll photos → fill the form honestly marked as a test → Send. Expect
   "Submission received!" within a few seconds and the email with 4+ photo
   links. Before this fix that submission should have failed. Then say so —
   Claude reads the Storage objects (expect `.webp`, a few hundred KB each). The
   test lead stays in Admin → Inquiries (only the owner can delete it).
3. ◻ On the phone, open `/gold-services`: the Call · Text · Directions bar sits
   at the bottom; Text opens Messages to (239) 404-8505 with "Hi, I have
   something I'd like to sell. Sending photos:"; Directions opens Maps at the
   showroom. It must NOT appear on the homepage, shop, checkout or `/card`.
4. ✅ Owner said yes 09-20 → BUILT + STAGED in this same batch
   (`CHANGELOG.md` 2026-09-20 (3)): the `/bullion` button pair and the five
   Text-link spots. After the push, on the phone: `/bullion` shows FREE
   APPRAISAL + CALL under the paragraph; MENU ends with "Call (239) 404-8505"
   and "Text Us"; `/sell/naples` showroom block has a TEXT US pill.
5. 🟡 **09-20 — owner APPROVED: $13/day, the ad wording as written, Spanish
   INCLUDED. Campaign "NEJ Sellers - Search" is a saved DRAFT ("Drafts in
   progress: 1", Campaigns (0), $0.00/day) — BLOCKED on Google's "Confirm it's
   you" re-authentication, which only the owner can do.** Google will not save
   a BUDGET until the signed-in person re-confirms their identity (the dialog
   offered Skip once — until Oct 4 — then only Cancel / Confirm; with it
   skipped the draft shows "Budget: Value is required" and "Changes failed to
   save"). ◻ **Owner:** in Google Ads (info@ login) open Campaigns → Drafts →
   "NEJ Sellers - Search" → Budget → when "Confirm it's you" appears click
   **Confirm** and complete Google's sign-in check; then say so.
   Saved in the draft (verified on the Review page): Search network ONLY
   (Search Partners + Display unticked — both are ON by default), locations
   Collier County + Bonita Springs + Estero with **Presence** only (default is
   "Presence or interest"), English + Spanish, ad schedule all days 7:00 AM–9:00
   PM, bidding Maximize clicks with a **$6.00** max CPC, AI Max OFF (the three
   switches read `aria-checked=false`; the Review line "Text customization and
   Final URL expansion turned on" is Google's wording, re-check after publish),
   keyword/asset AI generation skipped, enhanced conversions UNTICKED (it is
   pre-ticked and carries data-processing terms), ad group 1 = Gold: 10 phrase
   keywords → `https://naplesestatejewelry.com/gold-services` (path
   /sell-gold/naples), one responsive search ad with the 11 approved headlines
   (23/27/28/23/17/21/16/28/26/23/22 chars) + 4 descriptions (87/82/87/83); the
   preview already shows the Business Profile address as the location asset.
   ⚠️ Google pre-selects **$76.89/day** as the "recommended" budget — always
   choose "Set custom budget". Google's own estimate at $13/day: ~51 clicks a
   week at ~$1.78 = ~$91 a week. ⚠️ The wizard forces a conversion GOAL: "Get
   directions" was chosen with "set up manually using code after" = an empty
   placeholder conversion action, NO code goes on the site (remove it from Goals
   later if it gets in the way).
   **09-20, later — the confirmation is NOT sticking.** The owner reopened the
   draft; the **$13.00 budget then SAVED** ("All changes saved", Budget ticked)
   and the settings (Search only, 3 locations + Presence, EN+ES, 7 AM–9 PM,
   Clicks + $6.00 cap) survived. The **Gold keywords and the ad did NOT** — the
   earlier "Changes failed to save" was real, the step reopened empty.
   Re-entering them brought "Confirm it's you" straight back (now "Skip / Try
   again"), and each failed save stacked a "Fix errors — Discard / Fix errors"
   dialog on top (two copies; clicking Fix errors does not clear them). Claude
   left the page without discarding; the draft still exists ("Drafts in
   progress: 1", Campaigns (0)). Likely cause: the ad blocker / pop-up blocker
   is stopping Google's verification window — the dialog itself offers "Blocked
   during authentication?" and EVERY Google Ads page in this Chrome shows "Turn
   off ad blockers — Google Ads can't work when you're using an ad blocker".
   ◻ **Owner:** (1) pause the ad blocker (the "Pie" extension) on
   ads.google.com and allow pop-ups for ads.google.com; (2) reload Google Ads,
   open the draft → Keywords and ads, type anything in the keyword box → when
   "Confirm it's you" appears click Confirm / Try again and finish Google's
   check in the window it opens; (3) say so. Extension and pop-up settings are
   the owner's to change — Claude does not touch them.
   **09-20, third pass:** owner paused the ad blocker + confirmed; Claude
   re-entered the Gold keywords and the full ad (11 headlines, 4 descriptions —
   all counters registered, ad card shown). On Next → Budget, "Confirm it's
   you" (Cancel / Confirm) fired AGAIN with "Changes failed to save": the
   confirmation appears to cover ONE save, and Google re-challenges on the next
   sensitive write (possibly because the clicks are automated). ⛔ Claude does
   not click Confirm — it is the owner's identity check. The page was left
   exactly there, dialog up, data still in the page. ◻ **Owner, at the
   keyboard:** click **Confirm** on that dialog, finish the check, do NOT close
   or reload the tab, then say "confirmed" — Claude continues on the same page
   (set $13 if blank → Review → Publish → pause), and the owner may need to
   click Confirm once or twice more along the way. Practical alternative if it
   keeps looping: the owner clicks through Budget → Review → Publish themself
   (three clicks; everything is already filled in) and Claude pauses the
   campaign and builds the rest afterwards.
   🔴 **09-20, ROOT CAUSE FOUND — Google Ads wants a PASSKEY on the info@
   login.** Admin → Access and security → Summary → Security tasks: "**Create a
   passkey** — Create a passkey to authorize sensitive actions … ⚠ 1 admin,
   billing or standard user has not created a passkey … **New passkeys take 1
   to 2 days to pair with Ads.**" (also open: "Review domains"; "Review users"
   ✓). Budgets, keywords and ads are "sensitive actions": without the passkey
   every such save raises "Confirm it's you" and is rejected even after the
   owner confirms (4th pass: owner confirmed → Claude set $13, Review read
   "ready to publish · 10 keywords · 1 ad · $13.00/day" but NO Publish button
   rendered and the indicator stayed "Changes failed to save"; the
   `BatchService/Batch[Draft, Budget, Campaign, AdGroup, AdGroupCriterion,
   AdGroupAd .Mutate]` call answered HTTP 200 yet nothing persisted — reopening
   the draft showed Keywords-and-ads and Budget empty again). What DOES persist
   (non-sensitive): name, Search-only network, the 3 locations + Presence, EN+ES,
   7 AM–9 PM schedule, Clicks + $6.00 cap, AI Max off.
   ◻ **Owner (security setting — Claude does not touch it):** Google Ads →
   Admin → Access and security → Security tasks → **Create a passkey → "Go to
   setting"** and create it for info@naplesestatejewelry.com (Windows Hello /
   phone). Then wait for it to pair (Google says 1–2 days) and say so. Optional:
   "Review domains".
   🟢 **09-20, UNBLOCKED + PUBLISHED + PAUSED.** The owner created the passkey
   and clicked "Update allowed domains" (naplesestatejewelry.com kept as Allow);
   saves went through at once (no 1–2 day wait): budget $13.00 "All changes
   saved", Gold keywords + ad saved, Review "ready to publish" with a real
   Publish button → **campaign "NEJ Sellers - Search" published (campaign ID
   24265714239) and PAUSED within the minute** — row reads "$13.00/day ·
   Paused", Total: Account $0.00/day. Banner: "Your account cannot show ads —
   enter your billing information" (no payment method → it could not have
   served). Google's post-publish "Set up with a Google Tag" page was skipped
   (no tag, by the owner's decision).
   🟢 **09-20, BUILD COMPLETE — campaign still PAUSED, cannot spend.** 55
   campaign negatives · five ad groups with one ad each: Gold →
   `/gold-services`, Silver and Flatware → `/silver-services`, Estate and
   Inherited Jewelry → `/estate-jewelry`, Spanish - Vender Oro →
   `/es/gold-services`, **Coins and Bullion → `/bullion` (ad group PAUSED on its
   own until the site push)** · sitelinks (Free Appraisal, Sell Gold, Sell
   Silver, Read Our Reviews) · callouts · call asset (239) 404-8505 daily 9–6 ·
   account-level Business Profile location asset. Settings read back after the
   build: Search Network only, Collier + Bonita Springs + Estero **Presence**,
   EN + ES, 7 AM–9 PM daily, Maximize clicks $6.00 cap, $13.00/day, AI Max /
   text customization / URL expansion / auto-created assets / broad match all
   OFF. Record: `CHANGELOG.md` 2026-09-20 (5).
   🟢 **09-20 ~4:19 PM ET — LIVE.** Owner: "billing added, go." Campaign set
   to Enabled at $13.00/day (the only change); row reads "Pending" while Google
   reviews the ads; Coins and Bullion ad group still Paused. `CHANGELOG.md`
   2026-09-20 (6).
   - ✅ Owner added the payment method · ✅ owner said "go".
   - ✅ 09-20 ~7 PM: ads APPROVED — campaign "Eligible (Learning)". PMax /
     Display Expansion / Search Partners recommendations dismissed (never
     "Apply"). `CHANGELOG.md` 2026-09-20 (11).
   - ✅ 09-20 night: DONE — Gold ad 11 → 15 headlines (last one became "Sell
     Gold Jewelry in Naples" to match a keyword exactly); editor strength Good.
     `CHANGELOG.md` 2026-09-20 (12). ✅ 09-20 night: owner said yes → the other four ads
     done too; all five = 15 headlines, Eligible, strength Good (Spanish
     recalculating). `CHANGELOG.md` 2026-09-20 (13). Original item: add four keyword headlines to the Gold ad (the whole
     missing 3.3% of the optimization score): We Buy Gold in Naples · Gold
     Buyers in Naples, FL · Where to Sell Gold in Naples · Sell Your Gold
     Jewelry Today — yes / edits.
   - ◻ **Owner decision, no hurry:** tracking — nothing (today) / first-party
     lead-source label (~1–2 h, no Google script, no cookie) / full Google tag
     (~1 day, cookie accept-decline, CSP + privacy edits). Recommended: decide
     after 2–4 weeks of data; if any, the label.
   - ✅ 09-20 ~10:25 PM: ads now run **24/7** (owner: "we pay per click? why
     not just run 24/7?" — first extended to midnight, then all day; call asset
     stays 9–6; $13/day cap unchanged). `CHANGELOG.md` 2026-09-20 (14). ⚠️ In
     every weekly report: Segment → Hour of day + overnight search terms; trim
     back to 7 AM–midnight if spend drifts into the small hours.
   - ✅ **09-21 morning, read in Chrome:** all 5 ads, 6 sitelinks, 4 callouts
     and the call asset Eligible; showroom location asset serving; 17 impr · 5
     clicks · $9.08 · "Eligible (Learning)". `CHANGELOG.md` 2026-09-21.
     ◻ Owner's call, no hurry: add "the gold center naples" (competitor name,
     1 impression, no click) as a negative.
   - ◻ **Weekly reports: 09-27 · 10-04 · 10-11 · 10-18** (spend, clicks, calls
     from the ad, directions taps, search-terms sweep → new negatives; week 4 =
     keep, adjust or stop).
   - ✅ 09-20: auto-tagging OFF (owner's yes) · six sitelinks (two added:
     Sell Estate Jewelry, Coins and Bullion) — `CHANGELOG.md` 2026-09-20 (8).
   - ✅ 09-20 owner ACCEPTED (Account settings: Click-to-Call terms
     "Accepted"); the orange banner lingers as an announcement only — nothing
     left to accept today. Original note: in Google Ads click the orange **Fix it** on the banner
     "New Call and Messaging Ads Terms" and accept — needed to keep / edit the
     call button on the ads (Account settings shows "Click-to-Call terms: Not
     accepted yet"). Claude does not accept terms.
   - ✅ 09-20: site batch pushed → Coins and Bullion ad group ENABLED (reads
     "Pending"); all five ad groups on, one shared $13.00/day.
   (superseded) ◻ **Claude, once the passkey has paired:** re-enter the Gold keywords + ad
   (scripted, ~1 minute), set $13, Publish → PAUSE at
   once (there is no "create paused" option; no payment method = cannot serve
   anyway) → add ad groups Silver & flatware → `/silver-services`, Estate &
   inherited → `/estate-jewelry`, Coins & bullion → `/bullion` (keep paused
   until the site push), Spanish → `/es/gold-services` → campaign negatives →
   sitelinks, callouts, call asset scheduled 9–6 → show the owner every setting.
   Proposal: https://claude.ai/artifact/J7KQwYDbLyiEu8X8opQM4t
   - ◻ Daily budget: $10 / **$13 (recommended)** / $16.
   - ◻ Ad wording (section 4): yes or edits. Spanish ad group: yes / hold.
   - ◻ Add the payment method (Billing → Settings) — owner only; check Billing
     → Promotions for the "$500 after $500 spend" credit.
   - ◻ Optional: auto-tagging off (no site tag, so `gclid` does nothing).
   - Then Claude builds the campaign PAUSED and shows every setting; live only
     on the owner's go. Coins & bullion ad group waits for the site push (the
     `/bullion` hero buttons). Weekly report for the first month.
   - Record: `CHANGELOG.md` 2026-09-20 (4). (History of how the account was
     reached follows.)
   (history) **a shell already existed: 238-352-7909, "Setup in
   progress", login info@surettesystems.com**, stuck in the Smart-campaign
   sign-up funnel with no Expert Mode exit on that step. Owner decides:
   (a) which Google login should own the ads (info@surettesystems.com as now,
   or the login that owns the Business Profile / info@naplesestatejewelry.com);
   (b) how to get an account WITHOUT a Smart campaign — either "New Google Ads
   Account" on `ads.google.com/nav/selectaccount` (the fresh flow shows "Switch
   to Expert Mode" → "Create an account without a campaign"), or a free manager
   account (ads.google.com/home/tools/manager-accounts) that creates the client
   account with no campaign and no billing up front — sensible for Surette
   Systems, which runs many client sites. Creating the account and billing are
   the owner's clicks; Claude does everything after (link the Business Profile,
   call reporting, auto-apply off, Keyword Planner, the proposal). Also turn
   off the ad blocker for ads.google.com — Google Ads refuses to load fully
   with it on.
   ⭐ **09-20 owner decision: the ads account should use the SAME login as the
   Business Profile, and that login should be info@naplesestatejewelry.com.**
   Read in Chrome (nothing changed): Business Profile → People and access =
   **Chris Surette, Primary owner, info@surettesystems.com** + **PENDING:
   info@naplesestatejewelry.com, Owner** — the invitation was already sent and
   never accepted. That login is account #4 in the owner's Chrome but signed
   out ("Verify it's you"). Owner: sign in as info@naplesestatejewelry.com →
   accept the Business Profile invitation (email from Google, or
   business.google.com → the invitation banner) → then, still as info@, open
   ads.google.com → Expert Mode → "Create an account without a campaign". That
   login has no ads account yet, so the 404 block below may not apply — but it
   is a Workspace login too, so it still might. Optional later: People and
   access → transfer primary ownership to info@ (Google makes a new owner wait
   7 days first).
   **09-20, later still — invite RE-SENT, email NOT arriving.** Owner signed in
   as info@naplesestatejewelry.com (authuser 4). That mailbox held NO
   Business Profile invite (searched `in:anywhere`, incl. Spam/Trash) and
   `business.google.com/u/4/locations` shows "0 businesses", no invitation.
   The pending entry offers only "Cancel invitation" (no resend), so on the
   owner's request to add info@ Claude cancelled it and re-added
   info@naplesestatejewelry.com as **Owner** → Pending again. ~4 minutes later
   still no email and nothing in the info@ Business Profile manager. Other
   Google mail DOES reach that inbox (Search Console, 09-19). ◻ Owner: check
   the inbox again in 15–30 min (search `from:businessprofile-noreply@google.com`,
   and the Workspace admin quarantine if there is one). Found on the way: the
   profile sits inside a Google **Business Manager** organization "Naples
   Estate Jewelry" (om-6664439942685358256; tabs Apps and services · Stores ·
   People and access · Payments profile) whose only super admin is
   info@surettesystems.com. Adding info@ there was NOT done — it is a broader
   grant (apps + payments profile) than a Business Profile owner, and the
   owner has not asked for it. It may turn out to be the working route.
   ✅ **09-20 10:13 — Business Manager route WORKED.** Owner: "go into the
   organization and add it there.. i own both emails." Claude sent the super
   admin invitation from info@surettesystems.com (Business Manager → People and
   access → Add person); the email "Invite to manage apps for Naples Estate
   Jewelry" (businessmanager-noreply@google.com) reached the info@ inbox within
   a minute and the OWNER accepted it. Verified as info@ (authuser 4): People
   and access lists BOTH logins as Super admin; Apps and services shows 2 linked
   (Merchant Center 5836867944, Google Business Profile). The Business Profile
   itself is still not listed under info@ ("0 businesses") — super admins no
   longer get automatic app access and the separate Owner invite email still
   has not arrived; not needed for ads.
   ⭐ **The clean ads route:** Business Manager (as info@) → Apps and services →
   **Add service → Google Ads → Next** = "Link to Google Ads · New account —
   Create a new Google Ads account that will automatically be linked to Business
   Manager": name prefilled "Naples Estate Jewelry Google Ads account" + Country
   + Time zone + Currency. No campaign, no billing screen, no Smart funnel.
   Claude stopped there with the dialog open (creating the account is the
   owner's click). ◻ Owner: Country **United States** · Time zone **(GMT-05:00)
   Eastern Time** · Currency **US Dollar** → Next → confirm. ⚠️ Time zone and
   currency can never be changed afterwards. Then say so → Claude takes over
   (link the Business Profile as a location asset, call reporting, auto-apply
   off, Keyword Planner, proposal).
   🔴 **09-20 later — "New Google Ads Account" → "Create a new account" 404s
   on this login** (reproduced: `ads.google.com/signup?fna=true…` loads 200,
   then redirects to `/404`; same with the bare `/signup?fna=true`). Per Google's
   community experts this 404 is a deliberate block on creating a NEW account
   for the signed-in person — typical triggers: the login already has an ads
   account (here the unfinished shell), a Workspace login, VPN. It is not a
   site or browser bug to debug. Ways forward, owner's choice: (1) on the
   account picker use "Switch Google account" to a plain Gmail that has never
   had Google Ads (e.g. the personal Gmail), create the campaign-free account
   in Expert Mode there, then add info@ as a user and make that Gmail a manager
   of the Business Profile so it can be linked; (2) if that 404s too, finish the
   existing shell 238-352-7909 through the Smart funnel with the smallest
   budget, and the moment it lands in the account PAUSE the campaign and switch
   to Expert Mode (Tools → "Switch to Expert Mode") — a new campaign sits in
   review before it can serve, so pausing at once means no spend; this path
   also keeps the Business-Profile promo attached.

**Claude, after the push (on your word):** curl `/gold-services` and `/` for the
bar (present / absent), read the new Storage objects after the iPhone test.

**Gate (whole batch, after (3)):** `npx tsc --noEmit` 0 · `npm run lint` 0 (3
known `<img>` warnings) · `npx vitest run` **1522/1522 (151 files)** · `npm run
build` exit 0 from a deleted `.next`, no Turbopack build cache. Built-HTML
diffs: (2) 14 ranking pages identical apart from the bar's `<nav>`; (3) gold /
silver / estate-jewelry / sell / sell/fort-myers identical, nothing removed
anywhere, added text only on `/sell/naples`, `/bullion` and the homepage owner
block.

**Staging (Google Ads build record, docs only):** ✅ synced 2026-09-20 — dry
run listed exactly 3 files (CHANGELOG, CURRENT_STATUS, TASKS), 0 Extras, 1152
total; real run copied 3 / 0 FAILED (exit 1 = copied only); follow-up dry run
0/0/0; leak check 0 `.env*` / `.log`; `.tsx` control present; SHA-256 MATCH 3
of 3. No app code changed by the ads build. Docs-only re-sync after this line:
dry run 1 (TASKS.md) → copied → follow-up 0.

**Staging (Text links + `/bullion` buttons):** ✅ synced 2026-09-20 — dry run
listed exactly the 12 touched files (2 NEW: `components/cta/TextUsLink.tsx`,
`__tests__/text-us-links.test.ts`; 6 modified: `(home)/page.tsx`,
`bullion/page.tsx`, `free-evaluation/page.tsx`, `sell/[city]/page.tsx`,
`SiteHeader.tsx`, `ProductTrustSections.tsx`; 4 docs: CHANGELOG,
CURRENT_STATUS, STRUCTURE, TASKS), 0 Extras, 1152 total (= 1150 + 2); real run
copied 12 / 0 FAILED (exit 1 = copied only); follow-up dry run 0/0/0, exit 0;
leak check 0 `.env*` / `.log`, 0 `.git`; positive control 219 = 219 `.tsx`;
SHA-256 MATCH 11 of 11 (8 code files + CHANGELOG, STRUCTURE, CURRENT_STATUS).
Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

**Staging (photo fix + contact bar):** ✅ synced 2026-09-20 — dry run listed
exactly the 18 touched files (6 NEW: `components/cta/MobileContactBar.tsx`,
`lib/contact-bar-paths.ts`, `lib/lead-photo-encode.ts`, `lib/lead-photo-prep.ts`,
`__tests__/lead-photo.test.ts`, `__tests__/mobile-contact-bar.test.ts`; 6
modified: `globals.css`, `[locale]/layout.tsx`, `api/inquire/route.ts`,
`api/contact-message/route.ts`, `EvalForm.tsx`, `MessageUsForm.tsx`; 6 docs:
CHANGELOG, CURRENT_STATUS, DECISIONS, STRUCTURE, TASKS, features/lead-capture)
+ 1 new dir, 0 Extras, 1150 total (= 1144 + 6); real run copied 18 / 0 FAILED
(exit 1 = copied only); follow-up dry run 0/0/0, exit 0; leak check 0 `.env*` /
`.log`, 0 `.git`; positive control 218 = 218 `.tsx`; SHA-256 MATCH on the 10
code files + CHANGELOG, DECISIONS (12 of 12). Docs-only re-sync after this
line: dry run 1 (TASKS.md) → copied → follow-up 0.

### 🟡 2026-09-20 — Google Ads (lean: no tracking tag) + four seller-contact helpers — owner choices needed

Rules: `DECISIONS.md` top entry. Record: `CHANGELOG.md` 2026-09-20. Plan:
`C:\Users\rcman\.claude\plans\wondrous-twirling-bunny.md`.

**Owner:**
1. ◻ **Photo upload (S1).** Finding: the forms send photos raw in one request
   (up to 10 × 15 MB); Netlify caps a request at 6 MB (~4.5 MB of photos); no
   photo submission above 1.5 MB has ever succeeded. Not yet confirmed on
   production — pick one: (a) allow the harmless probe (honeypot-filled dummy
   uploads; nothing stored, no row, no email), (b) try the free-evaluation form
   from the iPhone with 4 camera-roll photos, or (c) go straight to the fix
   (browser downscale to 2048 px + server WebP — what the upload rule requires
   anyway; verified on the iPhone before it ships).
2. ◻ **Mockups** — https://claude.ai/artifact/YTKAs3Se2wzvUiPZV928TG : phone
   bar version A (Call · Text) or B (Call · Text · Directions, recommended);
   the `/bullion` button pair; the five Text-link spots. Say yes / change.
3. ◻ **Create the Google Ads account** — ads.google.com → when it offers to
   build a campaign, choose **"Switch to Expert Mode"** → **"Create an account
   without a campaign"**. Billing is yours. The "$500 after $500 spend" credit
   is your call (declined on purpose before); it must not raise the budget.
   Then say so — Claude links the Business Profile, turns call reporting on and
   auto-apply off (with your OK), runs Keyword Planner + the per-keyword organic
   check, and brings a proposal with an exact daily number. Nothing goes live
   without your yes.

**Claude, after the yes on each:** S2 Text links → S3 `/bullion` → S4 bar, each
its own gate (tsc · lint · vitest · build from a deleted `.next`) + built-HTML
diff of gold / silver / estate-jewelry / free-evaluation / sell / sell/naples
(EN + ES) + staging sync. Weekly ads report for the first month once live.

**Built so far:** `src/lib/contact-links.ts`, `lib/__tests__/contact-links.test.ts`,
an `sms:` case in `route-progress-bar.test.ts`. No page imports it yet → no
visible change, nothing worth a deploy on its own.

**Gate:** `npx tsc --noEmit` 0 · `npm run lint` 0 (3 known `<img>` warnings)
· `npx vitest run` **1462/1462 (148 files)** · `npm run build` exit 0 from a
deleted `.next`, no Turbopack build cache.

**Staging (contact-links + Google Ads docs):** ✅ synced 2026-09-20 — dry run
listed exactly the 8 touched files (NEW `lib/contact-links.ts`,
`__tests__/contact-links.test.ts`; `route-progress-bar.test.ts`; CHANGELOG,
CURRENT_STATUS, DECISIONS, STRUCTURE, TASKS), 0 Extras, 1144 total (= 1142 +
2); real run copied 8 / 0 FAILED (exit 1 = copied only); follow-up dry run
0/0/0, exit 0; leak check 0 `.env*` / `.log`, 0 `.git`; positive control 217 =
217 `.tsx`; SHA-256 MATCH on the 3 code files + CHANGELOG, DECISIONS,
STRUCTURE, CURRENT_STATUS. Docs-only re-sync after this line: dry run 1
(TASKS.md) → copied → follow-up 0. Nothing here needs a push on its own.

### 🟢 2026-09-18 (3) — DONE: text-message picture = wordmark + "DEALS" (v5 deployed, owner: "looks good")

1. ✅ Pushed + deployed; v5 URL 200/21827 bytes = local; YES → NAPLES / ESTATE JEWELRY / DEALS whole in the short bubble (04:1xZ). Rule in `DECISIONS.md` → *"Text alerts: every customer-facing text is a picture message"* (2:1 canvas, artwork inside the central 600 px, NEW file name per change). History: (v1 banner 03:0xZ: edges cropped; v2 4:3 03:3xZ: whole but too tall; v3 skipped; v4 2:1 03:4xZ approved "looks good"; v5 = v4 + DEALS, mockup C approved.)

### 🟢 2026-09-18 — DEPLOYED + live-verified: Mark sold → buyer confirmation (MMS delivered) · Reopen / Choose photo / Delete deal all exercised on production — late-reply auto-reply verified 02:58Z; nothing pending

Also in this push (`CHANGELOG.md` 2026-09-18 (2)): **Reopen — edit &
resend** on a sold deal (new draft, same photo + price, editable "back
available" message → Preview → Send), the photo picker as a real
**Choose photo** button, and **Delete deal** (any status but sending).
After the push, on the TEST deals: open a sold one → Reopen → the composer
fills with its photo/price and the heading reads "Reopened deal — edit &
resend"; then delete the old TEST deals with Delete deal.

Built per `CHANGELOG.md` 2026-09-18. Files: `lib/text-alerts/messages.ts`,
`lib/text-alerts/deals.ts` (`notifyDealSold`), `api/admin/text-deals/[id]/route.ts`,
`components/admin/TextDealsManager.tsx`, `__tests__/text-alerts.test.ts`.

**Gate:** tsc 0 · lint 0 (3 known warnings) · vitest **1456/1456 (148
files)** · build exit 0 from a deleted `.next`, no Turbopack build cache.

**Owner:**
1. ✅ Pushed + deployed 09-18; TEST 3 sent, replied, marked sold (buyer MMS `deal_winner` delivered), reopened (draft verified) and cleaned up (3 deletes). Original: Push.
2. ✅ Say "deployed" — Claude sends a fresh TEST deal (photo, price, line)
   to the one confirmed number (your personal cell).
3. ◻ Reply from the personal cell → Claude clicks Mark sold → your personal
   cell should get **"It's yours - … We'll text you shortly…"** as a
   picture, and the admin notice should read "Marked sold. The buyer got a
   confirmation text. 0 others told it's taken…".
4. ◻ One late reply from the personal cell → the "spoken for" auto-reply
   picture. Then say so and Claude reads the `deal_winner` row.

**Staging (Reopen / Choose photo / Delete deal):** ✅ synced 2026-09-18 —
dry run listed exactly the 10 touched files (NEW
`api/admin/text-deals/[id]/reopen/route.ts`; `[id]/route.ts`, deals.ts,
TextDealsManager.tsx, text-alerts.test.ts; CHANGELOG, CURRENT_STATUS,
DECISIONS, STRUCTURE, TASKS) + 1 new dir, 0 Extras, 1142 total (= 1141 +
1); real run copied 10 / 0 FAILED; follow-up dry run 0/0/0, exit 0; leak
check 0 `.env*` / `.log`, 0 `.git`, no node_modules / .next / worktrees;
positive control 217 = 217 `.tsx`; SHA-256 MATCH on the 5 code files +
CHANGELOG, TASKS, DECISIONS. Gate: tsc 0 · lint 0 · 1457/1457 · build 0
(reopen route listed). Docs-only re-sync after this line: dry run 1
(TASKS.md) → copied → follow-up 0.

**Staging (Mark-sold notifications):** ✅ synced 2026-09-18 — dry run
listed exactly the 10 touched files (deals.ts, messages.ts,
`text-deals/[id]/route.ts`, TextDealsManager.tsx, text-alerts.test.ts;
CHANGELOG, CURRENT_STATUS, DECISIONS, STRUCTURE, TASKS), 0 Extras, 1141
total; real run copied 10 / 0 FAILED; follow-up dry run 0/0/0, exit 0; leak
check 0 `.env*` / `.log`, 0 `.git`; positive control 217 = 217 `.tsx`;
SHA-256 MATCH on the 4 code files + CHANGELOG, TASKS, DECISIONS,
CURRENT_STATUS. Gate: tsc 0 · lint 0 · 1456/1456 · build 0. Docs-only
re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.


### 🔴 2026-09-17 — Twilio APPROVED → run the text-alerts grant SQL, then the first live text test

Trust Hub → Toll-free → HH `eab4c178…` **Approved** Sep 17 (read in the
owner's Chrome). Both phone rows are `pending` with the 09-16 confirmation
stamped "sent" (Twilio accepted it, the carrier refused the unverified
number), so the 15-minute sweep will NOT resend — use Resend YES.

**Owner, in this order:**
1. ✅ **Run `supabase/text-alerts-service-role-grant-2026-09.sql`** — done by the owner 09-17; re-probed: all four `text_*` tables answer 200 (empty) to the service key. Original: in the
   Supabase SQL Editor (once; safe to re-run). Without it the confirmation
   log, Text Deals drafts, deal sends and both Twilio webhooks fail
   "permission denied" (`CHANGELOG.md` 2026-09-17). Verify: the query in the
   file's footer → SELECT/INSERT/UPDATE/DELETE for each `text_*` table.
2. ✅ Done 09-17 (both old rows deleted). Admin → Subscribers → the **(239) 404-8505** row (your business cell)
   → Delete — your own phone must never be a "customer" (it would get every
   deal and have its replies forwarded to itself). Decision recorded 09-15.
3. ✅ Done 09-17 22:44–22:45Z — re-joined from the live site, confirmation delivered (SID `SM84c8…`, status webhook wrote `delivered`), YES received, row `confirmed`. Original: Admin → Subscribers → the **(239) 304-6229** row (personal cell) →
   **Resend YES**. Expect the confirmation text on that phone within a
   minute. Reply **YES** from it → the row flips to *Confirmed*.
4. 🟡 Claude ran it 09-17: draft "TEST · 14K rope chain…" $1,460 created, Preview rendered, **test sent to (239) 404-8505 ✅**, **Send to 1 FAILED** ("permission denied for sequence text_deal_sends_id_seq"). ✅ Owner re-ran rev 2; **Send to 1 → "Sent to 1." 22:53Z** (`text_deal_sends` id 1 `sent`, MMS SID, status callback wrote back). ✅ **Full loop PASSED 23:01–23:08Z** (personal-cell reply attached + forwarded `1ST`, Mark sold clicked, late reply auto-replied — `text_inbound` ids 2–3). Text alerts are LIVE end to end. ✅ Owner chose (b) → BUILT + STAGED 09-17 evening (`CHANGELOG.md` 2026-09-17 evening): confirmation, YES reply and sold auto-reply are MMS with `text-brand.jpg`. ✅ Owner's logo (`OneDrive/Pictures/ChatGPT Image Jul 8, 2026, 03_55_46 PM.png`) converted to `text-brand.jpg` (800 px JPEG q85, 113 KB) 09-17 evening. ✅ Pushed + deployed 09-17 night; live-verified by Claude (lookup page/API, brand image, wordmark redirect, Arthur's admin Summary = Insured Shipping (Standard)). Original: Push (this batch also carries **`/order-lookup`** + the new order-email footer — `CHANGELOG.md` 2026-09-17 night; after the push Claude curls `/order-lookup` (200, noindex) and opens `/order-lookup?order=NEJ-20260917-ZIZCI` with Arthur's email in the owner's Chrome — and the shipping-SERVICE label on the admin order page — `CHANGELOG.md` 2026-09-17 evening, 3; after the push open Arthur's order NEJ-20260917-ZIZCI: Summary should read "Shipping: Insured Shipping (Standard)" with the Priority Mail line — and the `logo2.webp` deletion + `/logo2.png` redirect repoint, `CHANGELOG.md` 2026-09-17 evening, 2 — after the push Claude checks `/logo2.png` → 301 nav-logo, old `.webp` → 404). ◻ Then send one more late reply to the TEST deal from the personal cell: the auto-reply should land as a picture in the SAME thread as the deal. Original: Admin → Text Deals → photo + price + one line → Preview → **Send a

**Staging (MMS on every customer text):** ✅ synced 2026-09-17 evening — dry
run listed exactly the 11 touched files (NEW `text-brand.jpg`; config.ts,
confirmations.ts, inbound.ts, messages.ts, text-alerts.test.ts; CHANGELOG,
CURRENT_STATUS, DECISIONS, STRUCTURE, TASKS), 0 Extras, 1135 total (= 1134
+ 1); real run copied 11 / 0 FAILED; follow-up dry run 0/0/0, exit 0; leak
check 0 `.env*` / `.log`, 0 `.git`; positive control 215 = 215 `.tsx`;
SHA-256 MATCH on the 4 lib files, the PNG, CHANGELOG, TASKS. Docs-only
re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

**Staging (owner's logo swap, `text-brand.jpg`):** ✅ synced 2026-09-17
evening — dry run listed exactly the 8 touched files (NEW `text-brand.jpg`;
config.ts, text-alerts.test.ts; CHANGELOG, CURRENT_STATUS, DECISIONS,
STRUCTURE, TASKS) + the deleted `text-brand.png` as the 1 expected Extra,
1135 total; real run copied 8 and removed the PNG (exit 3 = copied +
extras); follow-up dry run 0/0/0, exit 0; PNG confirmed gone on staging;
leak check 0 `.env*` / `.log`, 0 `.git`; positive control 215 = 215 `.tsx`;
SHA-256 MATCH on the JPEG, config.ts, the test, CHANGELOG, TASKS. Gate
re-run: tsc 0 · lint 0 · 1436/1436 · build 0. Docs-only re-sync after this
line: dry run 1 (TASKS.md) → copied → follow-up 0.

**Staging (five-item batch live-verified, docs only):** ✅ synced
2026-09-17 night — dry run listed exactly the 3 touched files (CHANGELOG,
CURRENT_STATUS, TASKS), 0 Extras, 1141 total; real run copied 3 / 0 FAILED;
follow-up dry run 0/0/0, exit 0; leak check 0 `.env*` / `.log`, 0 `.git`;
positive control 217 = 217 `.tsx`; SHA-256 MATCH on all 3. Docs-only
re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

**Staging (`/order-lookup` + email footer + address fix):** ✅ synced
2026-09-17 night — dry run listed exactly the 17 touched files (5 NEW:
`lib/order-lookup.ts`, `__tests__/order-lookup.test.ts`,
`api/orders/lookup/route.ts`, `[locale]/order-lookup/page.tsx`,
`components/orders/OrderLookupForm.tsx`; 12 modified: SiteFooter,
order-email-branding, order-fulfillment-email, order-invoice-email,
types/sales, ARCHITECTURE, CHANGELOG, CURRENT_STATUS, DECISIONS, STRUCTURE,
TASKS, features/paypal-checkout) + 4 new dirs, 0 Extras, 1141 total (= 1136
+ 5); real run copied 17 / 0 FAILED; follow-up dry run 0/0/0, exit 0; leak
check 0 `.env*` / `.log`, 0 `.git`, no node_modules / .next / worktrees;
positive control 217 = 217 `.tsx`; SHA-256 MATCH on the 7 code files +
CHANGELOG, DECISIONS, TASKS. Gate: tsc 0 · lint 0 · 1455/1455 · build 0
(both new routes listed). Docs-only re-sync after this line: dry run 1
(TASKS.md) → copied → follow-up 0.

**Staging (shipping service on the order page):** ✅ synced 2026-09-17
evening — dry run listed exactly the 8 touched files (NEW
`lib/shipping-service.ts`, `__tests__/shipping-service.test.ts`;
OrderDetailPanel.tsx, PrintOrderClient.tsx; CHANGELOG, CURRENT_STATUS,
STRUCTURE, TASKS), 0 Extras, 1136 total (= 1134 + 2); real run copied 8 / 0
FAILED; follow-up dry run 0/0/0, exit 0; leak check 0 `.env*` / `.log`, 0
`.git`; positive control 215 = 215 `.tsx`; SHA-256 MATCH on the 4 code
files, CHANGELOG, TASKS. Gate: tsc 0 · lint 0 · 1443/1443 · build 0.
Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied →
follow-up 0.

**Staging (`logo2.webp` deletion + redirect):** ✅ synced 2026-09-17 evening
— dry run listed exactly the 3 touched files (netlify.toml, CHANGELOG,
TASKS) + the deleted `logo2.webp` as the 1 expected Extra, 1134 total (=
1135 − 1); real run copied 3 and removed it (exit 3 = copied + extras);
follow-up dry run 0/0/0, exit 0; `logo2.webp` confirmed gone on staging;
leak check 0 `.env*` / `.log`, 0 `.git`; positive control 215 = 215 `.tsx`;
SHA-256 MATCH on netlify.toml, CHANGELOG, TASKS; vitest 1436/1436. Docs-only
re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.
   test to (239) 404-8505** (owner's view) → **Send to 1** → the deal lands
   on the personal cell → reply from it → the forward lands on the business
   cell tagged `[1st]` and the reply shows under the deal → **Mark sold to
   …** → a second reply from the personal cell gets the auto-reply.

**Claude, after step 1:** re-probe the four tables with the service key
(expect rows, not 42501). After step 3: `text_system_messages` confirmation
row + `sms_status = confirmed`. After step 4: the `text_deal_sends` row, the
`text_inbound` reply, the forward row, the sold auto-reply.

**Staging (grant SQL + docs):** ✅ synced 2026-09-17 — dry run listed exactly
the 5 touched files (NEW `supabase/text-alerts-service-role-grant-2026-09.sql`,
CHANGELOG, CURRENT_STATUS, STRUCTURE, TASKS), 0 Extras, 1134 total (= 1133
+ 1); real run copied 5 / 0 FAILED; follow-up dry run 0/0/0, exit 0; leak
check 0 `.env*` / `.log`, 0 `.git`; positive control 215 = 215 `.tsx`;
SHA-256 MATCH on the SQL, CHANGELOG, TASKS, CURRENT_STATUS. Docs-only
re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0. (The
SQL file is for the owner's editor; nothing needs a push.)


### ✅ DEPLOYED 2026-09-15 late night (owner pushed + checked production manually) — Join the List: iOS focus zoom fix + "monthly-ish" + roomier desktop window + /card tile with a tighter card page

Three small follow-ups, all live, no SQL, no env vars. Nothing left to do
here; the only open item on the text list is Twilio's toll-free
verification (the 🟢 Step 2 block below, step 5).
3. `/card`: full-width tinted "Join the List · email or text deals" tile
   under the grid (new `components/card/CardJoinListButton.tsx`, opens the
   homepage window) + the page tightened so the grid still ends on the same
   line at 375×812 (language bar, pills, gaps, logo, tiles). One line in
   Spanish, verified at 320 / 360 / 375. After the push: scan the card or
   open `/card` on the phone, tap the tile, the window should open with Text
   preselected. `CHANGELOG.md` 2026-09-15 (late night, 3).

**Staging (/card tile + compacting):** ✅ synced 2026-09-15 (late night, 3) — dry run listed exactly the 9 touched files (card/page.tsx, CardJoinListButton.tsx NEW, card-page.test.ts + CHANGELOG, CURRENT_STATUS, DECISIONS, STRUCTURE, TASKS, features/lead-capture), 0 Extras, 1120 total (= 1119 + the new component); real run copied 9 / 0 FAILED (exit 1 = copied only); follow-up dry run 0/0/0, exit 0; leak check 0 `.env*` / `.log`, 0 `.git`, no node_modules / .next / worktrees, launch.json present; positive control 211 = 211 `.tsx`; SHA-256 MATCH on all 9. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.
1. `globals.css`: `.home-subscribe-modal` inputs at 1rem under
   `@media (hover: none)` — stops iOS Safari zooming when a field is tapped.
   After the push: open the window on the phone, tap Name / Cell number — the
   page should not zoom (Chromium cannot verify this).
2. `HomeSubscribeModal.tsx`: Email hint "weekly-ish" → "monthly-ish" (EN+ES);
   desktop (`md:` ≥768px) window 580px wide with bigger option labels/hints,
   more padding and gap; phone measured identical to before. Preview-verified
   at 1280 and 375. `CHANGELOG.md` 2026-09-15 (late night, 2).

**Staging (monthly-ish + desktop room):** ✅ synced 2026-09-15 (late night, 2) — dry run listed exactly the 4 touched files (HomeSubscribeModal.tsx, home-subscribe-modal.test.ts, CHANGELOG, TASKS), 0 Extras, 1119 total; real run copied 4 / 0 FAILED (exit 1 = copied only); follow-up dry run 0/0/0, exit 0; leak check 0 `.env*` / `.log`, 0 `.git`, no node_modules / .next / worktrees, launch.json present; positive control 210 = 210 `.tsx`; SHA-256 MATCH on all 4. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

**Staging (iOS zoom):** ✅ synced 2026-09-15 (late night) — dry run listed exactly the 4 touched files (globals.css, home-subscribe-modal.test.ts, CHANGELOG, TASKS), 0 Extras, 1119 total; real run copied 4 / 0 FAILED (robocopy exit 1 = copied only); follow-up dry run 0/0/0, exit 0; leak check 0 `.env*` / `.log`, 0 `.git`, no node_modules / .next / worktrees, launch.json present; positive control 210 = 210 `.tsx`; SHA-256 MATCH on all 4. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

### 🟢 2026-09-16 late night (3) — DEPLOYED + live-verified: Orders Recycle Bin multi-select — owner's delete still to click

Built per `CHANGELOG.md` 2026-09-16 (late night, 3). Files:
`src/lib/trash-selection.ts` (NEW), `src/lib/__tests__/trash-selection.test.ts`
(NEW), `src/components/admin/OrdersPanel.tsx`.

**Gate:** tsc 0 · lint 0 (3 known warnings) · vitest **1435/1435 (145
files)** · build exit 0 from a deleted `.next`, no Turbopack build cache.
⚠️ Unverified in a browser (admin login).

**Owner:**
1. ✅ Pushed + deployed 09-16 late night; verified in Chrome (column, header box, button; one tick → "Delete 1 Forever").
2. ◻ Admin → Orders → Recycle Bin: tick the $1 test order
   NEJ-20260917-MFK96 → "Delete 1 Forever" → confirm. (Or tick the header
   box → "Delete All 20 Forever" if you want the whole bin gone — the
   confirm names the count.) Expect the row(s) to vanish and "N orders
   permanently deleted."

**Claude, after the push (on your word):** in the owner's Chrome, open the
Recycle Bin, confirm the checkbox column, the header box and the button
render; read back that the test order is gone.

**Staging (multi-select live-verified, docs only):** ✅ synced 2026-09-16 —
dry run listed exactly the 3 touched files (CHANGELOG, CURRENT_STATUS,
TASKS), 0 Extras, 1133 total; real run copied 3 / 0 FAILED; follow-up dry
run 0/0/0, exit 0; leak check 0 `.env*` / `.log`, 0 `.git`; positive control
215 = 215 `.tsx`; SHA-256 MATCH on all 3. Docs-only re-sync after this line:
dry run 1 (TASKS.md) → copied → follow-up 0.

**Staging (recycle-bin multi-select):** ✅ synced 2026-09-16 late night — dry
run listed exactly the 7 touched files (2 NEW: `lib/trash-selection.ts`,
`__tests__/trash-selection.test.ts`; 5 modified: OrdersPanel.tsx,
CHANGELOG, CURRENT_STATUS, STRUCTURE, TASKS), 0 Extras, 1133 total (= 1131
+ 2); real run copied 7 / 0 FAILED (exit 1 = copied only); follow-up dry run
0/0/0, exit 0; leak check 0 `.env*` / `.log`, 0 `.git`, no node_modules /
.next / worktrees; positive control 215 = 215 `.tsx`; SHA-256 MATCH on the 3
code files + CHANGELOG, TASKS. Docs-only re-sync after this line: dry run 1
(TASKS.md) → copied → follow-up 0.

### 🟢 2026-09-16 late night (2) — DEPLOYED + live-verified: `/kittcard` + the receipt-label fix

`/kittcard` built per `CHANGELOG.md` 2026-09-16 (late night, 2); rule
`DECISIONS.md` → *"Business-card pages: one component, per-holder values…"*.

**Owner:**
1. ✅ Pushed + deployed 09-16 late night; live: all four card URLs 200, diff = own URL only, noindex, sitemap 0 card entries (first fetch of the new routes 404'd for ~1 min while the deploy rolled out). Files: `components/card/CardLanding.tsx` (NEW),
   `lib/card-holders.ts` (NEW), `[locale]/card/page.tsx` (now a wrapper),
   `[locale]/kittcard/page.tsx` (NEW), 4 test files, and the in-store
   route's receipt-label fix from the block below.
2. ◻ Print Kitt's cards with the QR pointing at
   `https://naplesestatejewelry.com/kittcard`. QR files for the SPANISH
   pages (`/es/card`, `/es/kittcard`; SVG + PNG, error level H) were
   generated 09-16 and handed over in chat — scan-test on a phone before
   printing; for English cards use the same method with `/card` /
   `/kittcard` (or Chrome's address-bar share → "Create QR code").
3. ◻ Later, when Kitt has his own number: tell me the name + number and I
   change the `kittcard` entry in `lib/card-holders.ts` (one push; the
   printed cards keep working).

**Claude, after the push (on your word):** curl `/kittcard`, `/es/kittcard`
and `/card` live (200, `noindex, nofollow`, identical body, canonical =
own URL); confirm `sitemap.xml` has neither.

**Gate:** tsc 0 · lint 0 (3 known warnings) · vitest 1430/1430 (144 files)
· build exit 0 from a deleted `.next`, no Turbopack build cache.

**Staging (wrap-up, docs only):** ✅ synced 2026-09-16 wrap-up — dry run
listed exactly the 2 touched files (CURRENT_STATUS, TASKS), 0 Extras, 1131
total; real run copied 2 / 0 FAILED; follow-up dry run 0/0/0, exit 0; leak
check 0 `.env*` / `.log`, 0 `.git`; positive control 215 = 215 `.tsx`;
SHA-256 MATCH on both. Docs-only re-sync after this line: dry run 1
(TASKS.md) → copied → follow-up 0.

**Staging (`/kittcard` live-verified, docs only):** ✅ synced 2026-09-16 late
night — dry run listed exactly the 3 touched files (CHANGELOG,
CURRENT_STATUS, TASKS), 0 Extras, 1131 total; real run copied 3 / 0 FAILED
(exit 1 = copied only); follow-up dry run 0/0/0, exit 0; leak check 0
`.env*` / `.log`, 0 `.git`; positive control 215 = 215 `.tsx`; SHA-256
MATCH on all 3. Docs-only re-sync after this line: dry run 1 (TASKS.md) →
copied → follow-up 0.

**Staging (`/kittcard` batch):** ✅ synced 2026-09-16 late night — dry run
listed exactly the 14 touched files (3 NEW: `components/card/CardLanding.tsx`,
`lib/card-holders.ts`, `[locale]/kittcard/page.tsx`; 11 modified:
`[locale]/card/page.tsx`, card-page / phone-hours / reviews-page /
storefront-photo tests, ARCHITECTURE, CHANGELOG, CURRENT_STATUS, DECISIONS,
STRUCTURE, TASKS) + 1 new dir, 0 Extras, 1131 total (= 1128 + 3); real run
copied 14 / 0 FAILED (exit 1 = copied only); follow-up dry run 0/0/0, exit
0; leak check 0 `.env*` / `.log`, 0 `.git`, no node_modules / .next /
worktrees; positive control 215 = 215 `.tsx`; SHA-256 MATCH on the 5 code
files + CHANGELOG, DECISIONS, TASKS. Docs-only re-sync after this line: dry
run 1 (TASKS.md) → copied → follow-up 0.

### 🟢 2026-09-16 late night — In-Store Sale TESTED LIVE ✅ · receipt-label fix DEPLOYED · invoices grant SQL RUN + verified (service role reads `invoices`; `INV-20260916-OFM07` written 01:52Z)

**Owner, in this order:**
1. ✅ **Run `supabase/invoices-service-role-grant-2026-09.sql`** — done by the owner 2026-09-16 late night ("ran the sql"). Original: in the
   Supabase SQL Editor (once; safe to re-run). Why: `invoices` is granted to
   `authenticated` only, so every automatic invoice — after every PayPal
   capture since July, and after an in-store sale — has silently failed
   ("permission denied for table invoices"); receipts were unaffected.
   After running it, the next paid order (web or in-store) shows its invoice
   on the order page without clicking Generate invoice. Verify:
   `select privilege_type from information_schema.role_table_grants where
   table_name = 'invoices' and grantee = 'service_role';` → SELECT, INSERT,
   UPDATE.
2. ✅ Deployed 09-16 late night in the `/kittcard` batch (one file: `api/admin/in-store-sales/route.ts` — the "Receipt"
   line on the Sale-recorded panel now reads from the real `order_emails`
   row, so it says "Emailed" when it was). Gate below.
3. ◻ Optional: Admin → Orders → Recycle Bin → empty it — now the multi-select block at the top of this file (the $1 test order
   NEJ-20260917-MFK96 was still there at wrap-up 09-16, `deleted_at` set;
   harmless) — original note: (the $1 test order
   NEJ-20260917-MFK96 is there).

**Gate (label fix):** tsc 0 · lint 0 (3 known `<img>` warnings) · vitest
1428/1428 (144 files) · build exit 0 from a deleted `.next`, no Turbopack
build cache.

**Live test 2026-09-16 (by Claude in the owner's Chrome):** "Test sale" ·
Other · $1 · Cash → NEJ-20260917-MFK96 recorded (paid / completed /
picked_up / `in_store_cash` / reference "In store · Cash" / no capture id /
line `product_id null` / receipt row to info@), order page correct, then
moved to the Recycle Bin (`deleted_at` 01:36Z). Details `CHANGELOG.md`
2026-09-16 (late night).

**Staging (label fix + invoices grant SQL + docs):** ✅ synced 2026-09-16
late night — dry run listed exactly the 7 touched files (route.ts, the NEW
`supabase/invoices-service-role-grant-2026-09.sql`, CHANGELOG,
CURRENT_STATUS, STRUCTURE, TASKS, features/paypal-checkout), 0 Extras, 1128
total (= 1127 + 1); real run copied 7 / 0 FAILED (exit 1 = copied only);
follow-up dry run 0/0/0, exit 0; leak check 0 `.env*` / `.log`, 0 `.git`;
positive control 213 = 213 `.tsx`; SHA-256 MATCH on route.ts, the SQL,
CHANGELOG, TASKS. Docs-only re-sync after this line: dry run 1 (TASKS.md) →
copied → follow-up 0.

### 🟢 2026-09-16 night — DEPLOYED + live-verified: Admin → In-Store Sale recorder — $1 test DONE (above)

Built per `CHANGELOG.md` 2026-09-16 (night); rules `DECISIONS.md` →
*"In-store sales: Zettle takes the card…"*. Mockup approved:
https://claude.ai/artifact/5o6VdpQjChYp11JJPCqS8X.

**Gate:** tsc 0 · lint 0 (3 known `<img>` warnings) · vitest **1428/1428
(144 files)** · build exit 0 from a deleted `.next` · dev auth gates:
page 307 → sign-in, API 401 when signed out. ⚠️ The admin screen is
**unverified in a browser** (needs the owner's login).

**Owner, in this order:**
1. ✅ **PayPal Zettle:** done by the owner 09-16 ("did the zettle setup"). Original text: install the PayPal Zettle app on the iPhone, sign
   in with the business PayPal account, turn on **Tap to Pay on iPhone**
   (Settings → Payment methods). Run one $1 tap on your own card and refund
   it in the app to see the flow. (Owner-only; nothing on the site depends
   on it.)
2. ✅ Pushed + deployed 09-16 night; live: page 307 → sign-in, API 401.
3. ✅ Done 09-16 late night by Claude in the owner's Chrome (block above). Original plan — **First test on production, ~2 minutes:** Admin → In-Store Sale →
   *Not listed* → "Test sale" · Other · price 1 → your own name, cell and
   email → Paid by Cash → Record sale. Expect: "Sale recorded" with an
   order number, "Receipt: Emailed", the receipt in your inbox and the
   owner new-order email at info@, and the order under Admin → Orders as
   paid / picked up with payment method "In store · Cash". Then Admin →
   Orders → that order → Delete (it holds no product, so nothing returns
   to stock).
4. ◻ Optional second test with a real LISTED item you are about to sell
   anyway: pick it by inventory number, adjust the price sold, record —
   the item flips to Sold on the site within a minute and its eBay/Etsy
   listings end on the next 30-minute sweep.

**Claude, after the push (on your word):** curl the page (307) and the API
(401) live; after the owner's test, read the order row, `order_items`
(`product_id null` for the unlisted test) and the `order_emails` receipt
row; confirm `payment_method = in_store_cash`, `fulfillment_status =
picked_up`, no `paypal_capture_id`.

**Staging (deploy + GSC validations, docs only):** ✅ synced 2026-09-16 late
night — dry run listed exactly the 3 touched files (CHANGELOG,
CURRENT_STATUS, TASKS), 0 Extras, 1127 total; real run copied 3 / 0 FAILED
(exit 1 = copied only); follow-up dry run 0/0/0, exit 0; leak check 0
`.env*` / `.log`, 0 `.git`; positive control 213 = 213 `.tsx`; SHA-256
MATCH on all 3. Docs-only re-sync after this line: dry run 1 (TASKS.md) →
copied → follow-up 0.

**Staging (in-store sale recorder):** ✅ synced 2026-09-16 night — dry run
listed exactly the 15 touched files (5 NEW: `lib/in-store-sale.ts`,
`__tests__/in-store-sale.test.ts`, `api/admin/in-store-sales/route.ts`,
`[locale]/admin/in-store-sale/page.tsx`, `components/admin/InStoreSaleForm.tsx`;
10 modified: AdminHeader, OrderDetailPanel, PrintOrderClient, ARCHITECTURE,
CHANGELOG, CURRENT_STATUS, DECISIONS, STRUCTURE, TASKS,
features/paypal-checkout) + 2 new dirs, 0 Extras, 1127 total (= 1122 + 5);
real run copied 15 / 0 FAILED (exit 1 = copied only); follow-up dry run
0/0/0, exit 0; leak check 0 `.env*` / `.log`, 0 `.git`, no node_modules /
.next / worktrees, launch.json present; positive control 213 = 213 `.tsx`;
SHA-256 MATCH on all 6 code files + CHANGELOG, DECISIONS, TASKS. Docs-only
re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

### 🟢 2026-09-16 evening — DEPLOYED + live-verified; Validate fix STARTED 9/16 on both GSC reports: sold product pages now carry a schema price

Owner chose option 1 + "fix it for good". Built per `CHANGELOG.md`
2026-09-16 (evening): the Product JSON-LD Offer reads the canonical price
value (`getProductPriceValue` via new `src/lib/product-ld.ts`), never the
storefront label; sold pages emit `price` + `SoldOut`, visible page still
"Sold"; no numeric price → no Product schema. Rule in `DECISIONS.md` →
*"Product schema: the Offer price is the canonical value…"*.

**Gate:** tsc 0 · lint 0 (3 known `<img>` warnings) · vitest **1421/1421
(143 files)** · build exit 0 from a deleted `.next`, no Turbopack build
cache · `next start` check: #77 → `price "237"` SoldOut, #53 → `"1026"`,
`/es/shop/…-53` same + "Vendido", in-stock cuban chain unchanged
(`"1009"`, priceValidUntil, InStock).

✅ Pushed 09-16 night; live #77 → 237, #53 → 1026 (EN + ES), in-stock page unchanged. ✅ Validate fix clicked on Product snippets AND Merchant listings → both "Validation started · 9/16/26". ◻ Read the result email / both reports ~09-30. Files: `src/app/[locale]/shop/[id]/page.tsx`,
`src/lib/product-ld.ts` (NEW), `src/lib/__tests__/product-ld.test.ts` (NEW)
+ docs.

**Claude, after the push (on your word):** curl the two sold pages live for
`"price"` + `SoldOut`; then Search Console → Product snippets → the
"Either price or priceSpecification.price…" row → **Validate fix**, and
Merchant listings → "Missing field price" → **Validate fix** (both read the
same two pages; Google re-crawls over ~1–2 weeks and emails the result to
the GSC users). ⛔ Do NOT touch the "Page with redirect" validation.

The Sep 16 email itself ("Some fixes failed for Page indexing issues") was
the *Page with redirect* validation started 09-06 — Failed 9/15 because the
53 URLs still redirect (correctly, all 308, curl-verified 09-16). No action;
never re-validate that reason.

**Staging (sold-page schema price):** ✅ synced 2026-09-16 evening — dry run
listed exactly the 9 touched files (`shop/[id]/page.tsx`, `lib/product-ld.ts`
NEW, `__tests__/product-ld.test.ts` NEW, CHANGELOG, CURRENT_STATUS,
DECISIONS, STRUCTURE, TASKS, features/online-shop), 0 Extras, 1122 total (=
1120 + the 2 new files); real run copied 9 / 0 FAILED (exit 1 = copied only);
follow-up dry run 0/0/0, exit 0; leak check 0 `.env*` / `.log`, 0 `.git`,
no node_modules / .next / worktrees, launch.json present; positive control
211 = 211 `.tsx`; SHA-256 MATCH on page.tsx, product-ld.ts, the test,
CHANGELOG, DECISIONS, TASKS. Docs-only re-sync after this line: dry run 1
(TASKS.md) → copied → follow-up 0.

**Staging (09-16 GSC check, docs only):** ✅ synced 2026-09-16 — dry run
listed exactly the 3 touched files (CHANGELOG, CURRENT_STATUS, TASKS), 0
Extras, 1120 total; real run copied 3 / 0 FAILED (exit 1 = copied only);
follow-up dry run 0/0/0, exit 0; leak check 0 `.env*` / `.log`, 0 `.git`;
positive control 211 = 211 `.tsx`; SHA-256 MATCH on all 3. Docs-only
re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

### 🟢 2026-09-15 night — STEP 2 DEPLOYED (Twilio sending, YES confirmation, Text Deals, replies) — waiting on Twilio's toll-free verification, then the first real test

Built per `CHANGELOG.md` 2026-09-15 (night); rules `DECISIONS.md` → *"Text
deals: the reply is the claim…"*. Safe to deploy before Twilio's approval:
nothing sends until the number is verified AND the variables are set.

**Owner, in this order:**
1. ✅ SQL run 2026-09-15 night (verified from the editor: 4 tables present,
   `nej-text-alerts-sweep` `*/15 * * * *` active, Vault secret
   `TEXT_ALERTS_CRON_SECRET` present). Until the push the job posts to a
   route that does not exist yet (404s in `net._http_response`, harmless).
2. ✅ Netlify: all five variables present (SID / FROM / FORWARD_TO by this
   agent; AUTH_TOKEN + CRON_SECRET pasted by the owner, secret-marked).
3. ✅ Pushed 2026-09-15 night and **live-verified**: unsigned POST to
   `/api/webhooks/twilio/inbound` → 403 and to `/status` → 403 (proves the
   Twilio variables are loaded — an unconfigured deploy answers 503);
   `/api/admin/text-alerts/sweep` without the secret → 401; `/api/admin/text-deals`
   signed-out → 401. The first pg_cron tick before the deploy logged a 404
   (`net._http_response` id 1082, 02:00Z) as expected.
4. ✅ Inbound webhook SAVED 2026-09-15 night (owner fronted the tab): primary
   AND backup "Webhook URL" =
   `https://naplesestatejewelry.com/api/webhooks/twilio/inbound`, HTTP POST,
   confirmed on the number's summary after the save. ⚠️ Twilio's drawer
   silently refuses to save while the BACKUP webhook URL is empty (the only
   hint is "Provide webhook URL." under that field) — that is why the first
   two attempts showed "-". Same URL in both slots is deliberate.
   **Status check 09-16 (Chrome, Trust Hub → Registrations → Toll-free):
   still *In review*, last updated Sep 15; no rejection, no notification,
   every field re-read as submitted. Twilio: allow ~3–5 business days →
   expect the email at info@ (check spam) around 09-18 to 09-22. If it is
   still *In review* after 09-23, open a Twilio support ticket quoting HH
   `eab4c178…` — nothing else to do until then.**
   **Staging (09-16 Twilio check, docs only):** ✅ synced 2026-09-16 — dry
   run listed exactly the 3 touched files (CHANGELOG, CURRENT_STATUS,
   TASKS), 0 Extras, 1120 total; real run copied 3 / 0 FAILED (exit 1 =
   copied only); follow-up dry run 0/0/0, exit 0; leak check 0 `.env*` /
   `.log`, 0 `.git`, no node_modules / .next / worktrees; positive control
   211 = 211 `.tsx`; SHA-256 MATCH on all 3. Docs-only re-sync after this
   line: dry run 1 (TASKS.md) → copied → follow-up 0.
5. ◻ **Test plan (owner, 2026-09-15 night): the personal cell (239)
   304-6229 plays the customer; the business cell (239) 404-8505 stays the
   owner's side (forward target + "Send a test").** Twilio shows the
   registration *In review* (Trust Hub → Toll-free, HH `eab4c178…`).
   - Now, before approval: join from the personal phone on the live site
     (Join the List → Text → (239) 304-6229 → tick → Join). It sits Pending;
     the first sweep after approval sends its YES text automatically.
   - ◻ Owner decision: remove the business cell's subscriber row (Admin →
     Subscribers → the (239) 404-8505 row → Delete) so the owner's phone is
     never treated as a customer (it would otherwise be sent every deal and
     its replies forwarded to itself).
   - Optional now: draft the first deal in Admin → Text Deals (photo, price,
     line → Preview) so it is ready; Preview works without Twilio.
   - After "verified": reply YES from the personal phone (or Resend YES
     first if the text never came) → row flips to *Confirmed* → Text Deals →
     "Send a test to (239) 404-8505" (owner's view) → "Send to 1" (the
     customer view on the personal phone) → reply from the personal phone →
     the forward lands on the business cell with `[1st]` and the reply shows
     under the deal → "Mark sold to …" → a second reply from the personal
     phone gets the auto-reply.
6. ◻ First real deal: "Send to N". Then "Mark sold to <first>" and have
   someone reply late to see the auto-reply.

**Claude, after each of those (on your word):** live checks of the two
webhooks (signed-request refusal = 403 on an unsigned POST), the sweep
endpoint (401 without the secret), the pg_cron job row, the first
`text_system_messages` / `text_deal_sends` rows.

**Gate (Step 2):** `npx tsc --noEmit` 0 · `npm run lint` 0 (3 `<img>`
warnings in the composer) · `npx vitest run` **1411/1411 (142 files)** ·
`npm run build` exit 0 · no Turbopack build cache.

**Staging (Step 2):** ✅ synced 2026-09-15 night — dry run listed exactly the
36 touched files (23 NEW: 9 `lib/text-alerts/*.ts`, 7 routes under
`api/admin/text-deals`, `api/admin/text-alerts/sweep`,
`api/admin/subscribers/resend-confirmation`, the two
`api/webhooks/twilio/*` routes, `admin/text-deals/page.tsx`,
`TextDealsManager.tsx`, `text-alerts.test.ts`, `supabase/text-deals-2026-09.sql`;
13 modified: next.config.ts, storage-gc route, subscribe route + test,
AdminHeader, SubscribersManager, ARCHITECTURE, CHANGELOG, CURRENT_STATUS,
DECISIONS, STRUCTURE, TASKS, features/lead-capture), 13 new dirs, 0 Extras,
1119 total; real run copied 36 / 0 FAILED; follow-up dry run 0 / 0 / 0, exit
0; SHA-256 MATCH ×8 (deals, inbound, card, inbound webhook, TextDealsManager,
next.config, the SQL, CHANGELOG); leak check 0 `.env*` / `.log`, 0 `.git`
dirs; positive control 210 = 210 `.tsx`, 10 = 10 `.ts` in `lib/text-alerts`.
Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied →
follow-up 0.

### 🟡 2026-09-15 evening — Join the List DEPLOYED + live-verified · Twilio number bought · registration at the review screen · small follow-up STAGED (push, then I submit)

Step 1 is live (`CHANGELOG.md` 2026-09-15 evening). Twilio: account, approved
compliance profile, **+1 (888) 423-7522** bought, toll-free registration
filled to "Review and submit" in the owner's Chrome.

**Owner, in this order:**
1. ✅ Follow-up pushed 2026-09-15 late evening (both PNG URLs 200, byte-exact);
   **toll-free registration SUBMITTED** the same minute ("Thanks for
   submitting your toll-free registration! … being reviewed").
2. ◻ Wait for Twilio's toll-free verification (email to info@; days to ~2
   weeks). "Messaging disabled" on the number flips to enabled when approved.
   If it is REJECTED, the email says why — usual causes are the proof
   screenshot or the disclosure wording; send me the text and I fix + resubmit.
3. ◻ Tell me "verified" → I build **Step 2** (reply-YES confirmation text,
   STOP / HELP, the Text Deals composer with the server-drawn price overlay,
   replies forwarded to (239) 404-8505 + the replies page with "Mark sold"
   auto-reply, "Resend confirmation" for pending rows, status-callback +
   inbound webhooks set on the number). Env vars then: Twilio Account SID,
   Auth Token (Netlify, write-only), the number.

**Until Step 2 is live nobody is texted.** Sign-ups (including the owner's
test row) sit at *Pending YES*; the window tells them one confirmation text
comes before any deal.

Registration volume was set to **100/month** at the owner's request ("probably
50 to start"; the choices are 10 / 100 / 1,000). Keywords YES / START; Twilio
matches keywords case-insensitively and Step 2's YES check will too (trimmed,
any case, so "yes" and "Yes!" count).

**Staging (follow-up: window copy + opt-in PNGs):** ✅ synced 2026-09-15
evening — dry run listed exactly the 6 touched files (2 NEW PNGs under
`public/assets/images/compliance/`, HomeSubscribeModal.tsx, CHANGELOG,
CURRENT_STATUS, TASKS), 0 Extras, 1096 total; real run copied 6 / 0 FAILED;
follow-up dry run 0 / 0 / 0, exit 0; SHA-256 MATCH on the modal, both PNGs and
CHANGELOG; leak check 0; positive control 208 = 208 `.tsx`. Docs-only re-sync
after this line: dry run 1 (TASKS.md) → copied → follow-up 0.
Re-synced the same evening after the owner's second copy ask (the "often at
scrap price or just above, never full price" sentence): dry run 2
(HomeSubscribeModal.tsx, CHANGELOG) → copied 2 → follow-up 0 → SHA-256 MATCH
×2; gate re-run eslint 0 · tsc 0 · 9/9 · build 0. Docs-only re-sync after
this line: dry run 1 (TASKS.md) → copied → follow-up 0.

**Staging (Join the List batch):** ✅ synced 2026-09-15 — dry run listed
exactly the 26 touched files (5 NEW: HomeSubscribeModal.tsx,
subscriber-phone.ts, subscriber-phone.test.ts, home-subscribe-modal.test.ts,
supabase/text-subscribers-2026-09.sql; 21 modified: HomeSubscriberForm,
HomeHeroOverlay, api/subscribe route + test, api/admin/subscribers route,
admin/subscribers page, SubscribersManager, marketing.ts, subscriber-sort +
test, hero-short-screens.test, LegalPolicyPage, terms + privacy pages,
spanish-legal-copy, CHANGELOG, CURRENT_STATUS, DECISIONS, STRUCTURE, TASKS,
features/lead-capture), 0 Extras, 1094 total; real run copied 26 / 0 FAILED
(robocopy exit 1 = copied only); follow-up dry run 0 / 0 / 0, exit 0; leak
check 0 `.env*` / `.log`, 0 `.git` dirs, no node_modules / .next; positive
control 208 = 208 `.tsx`; SHA-256 MATCH on the modal, launcher, overlay,
phone lib, subscribe route, the SQL and CHANGELOG. Docs-only re-sync after
this line: dry run 1 (TASKS.md) → copied → follow-up 0.

### 📋 WHAT'S ACTUALLY LEFT — triaged 2026-09-14 (start here)

A read-only sweep on 2026-09-14 checked every open-looking item in this file
against `CHANGELOG.md` / `CURRENT_STATUS.md`. **The 09-14 batch is DEPLOYED
(`main@ee231dc`, 9:19 AM ET) and live-verified:** price-push warning, Etsy/eBay
request timeouts, Deep Field batch pin, Netlify Node 22, "30-minute checks"
card, homepage `loading.tsx` removal. `main@beaf772` (Instagram 14-day
window) is also DEPLOYED. **DEPLOYED + live-verified 09-14 (night):** Google
site-name `WebSite` entity tightened (`lib/site-ld.ts`: trailing-slash url,
`@id`, `publisher` → JewelryStore, `alternateName: ["NaplesEstateJewelry.com"]`).
Nothing is staged.
- ✅ GSC Request indexing for `/`: "Indexing requested" (09-14 night; the page
  was already indexed, so this was a re-crawl request).
- ◻ Recheck the brand SERP site-name line every ~2 weeks. It should become
  "Naples Estate Jewelry" or "NaplesEstateJewelry.com", not the lowercase domain.
- ⛔ Never a slogan name. **Older sections below still carry STAGED / DEPLOY /
◻ markers that are done or superseded; treat anything not listed here as
history.**

**Claude can do — status after the 2026-09-14 pass (`CHANGELOG.md` 2026-09-14):**
- ✅ Done 09-14 (read-outs and results in CHANGELOG):
  - #1 Search Console
  - #2 GBP public check (description and services need the owner's profile
    manager)
  - #3 Bing
  - #4 Yelp
  - #8 database hygiene
  - #10 Node 22, Deep Field pin, first paint
- ✅ #6 Etsy/eBay request timeouts DEPLOYED 09-14 (13:30Z run clean).
- ✅ #5 warning reworded + "30-minute checks" card DEPLOYED 09-14 (both cards seen green live). Owner
  approved the mockup 09-14: card above "Daily price automation", red after
  60 min, detail sentence keeps the counts.
- ⏭ Skipped by the owner: #7 testimonials, #9 spot checks, #10
  marketing-email exclusion, #10 IndexNow on sale.
- 🔎 **New from the checks (owner decisions / next work):**
  - ✅ **First paint — fix DEPLOYED + live-verified 09-14:
    `(home)/loading.tsx` + unused `SiteLoadingScreen` deleted; production phone
    first paint 860 ms median (was 1.06–1.12 s), filmstrip first frame 808 ms.** The line that stood here ("the 08-14 fix did not land") was
    WRONG: the 08-14 priorities are live (slot 0 high, slot 1 auto, rest low)
    and low-priority images still *start* early by design. The real cause of
    the ~1 s white screen on phones: `(home)/loading.tsx` makes the server send
    the loading screen first and the whole page inside `<div hidden id="S:0">`,
    and nothing is drawn until React's `$RC` swap (char ~189K of 353 KB).
    Replay A/B (live HTML, local proxy, phone 4× CPU): first paint median
    732 → 472 ms with the file deleted; desktop unchanged. Proposal = delete
    that one file. `CHANGELOG.md` 2026-09-14 (later).
  - ✅ `/shop` loading screen MEASURED 09-14 — **owner decision: leave it.**
    Removing it saves ~0.4 s on a cold phone visit (replay 832 → 428 ms) but
    loses the instant skeleton when shoppers click in (phone real content
    ~1.4 s after the click). Revisit only if GSC shows `/shop` as a common
    landing page. `CHANGELOG.md` 2026-09-14 (later still).
  - ✅ GBP "Delivery" attribute: owner decision 09-14 — **keep it**.
  - ✅ Yelp categories: owner decision 09-14 — **keep Gold Buyers / Jewelry /
    Watches; no Diamond Buyers** ("I'd rather buy watches than diamonds").
    Yelp shows three category slots, all used. Its only buyer categories are
    Gold Buyers and Diamond Buyers (no Silver, Jewelry or Watch Buyers).
    ⛔ Don't re-propose Diamond Buyers.
  - ✅ #132, #136, #137 not on eBay: owner handles them (09-14).
  - Three test inquiries are still in the DB (`a317891f`, `04cca1ca`,
    `aa00e2bf`); only the owner can delete them.
  - Bing hasn't re-crawled the six "Indexing allowed: No" pages since 09-03
    (re-requesting is an option, 100/day).
- ✅ Netlify build log shows Node 22 (v22.23.2), verified 09-14 after the push.

(Original list, for reference:)
1. **Mid-September Search Console read.** Breadcrumbs + Pages reports; are
   `/reviews` and the six guide URLs indexed; positions for
   `/silver-services` and `/gold-services`; click-through on `/sell/naples`;
   a baseline for the free-appraisal pages.
2. **Public Google Business Profile check.** Is the 09-11 post still up, the
   description published, and are all four services approved?
3. **Bing.** Is Bing Places published (ETA was ~09-13)? Bing Webmaster URL
   inspection on the six city/lander pages.
4. **Yelp public page.** Estate Liquidation category and the "Established" year.
5. **Overdue price-push warning.** It sends the owner to "the function log in
   Netlify" (`lib/marketplace-price-push-health.ts:141,148`; test `:139`),
   which has been dead since pg_cron took over. Reword it, plus the never-built
   "last sweep N min ago" line (mockup first).
6. **Request timeouts for Etsy/eBay API calls** (none today). One hung call
   could stall the 30-minute auto-sold sales sweep.
7. **Site testimonials vs live GBP reviews.** The site quotes ~23 reviewers;
   GBP showed 18 on 09-08. Rule: every quote must still be live.
8. **Read-only database hygiene.** New spam since 08-22, leftover junk/test
   inquiries and orders, 2 available products with no eBay link, a duplicate #21.
9. **Spot checks.** One live Etsy + eBay listing shows "Purity: 14K" and an inch
   length; Facebook page About (phone/address/hours); Merchant Center (76
   products, `nej-108` appeal, image warnings).
10. **Small code.** Leave never-confirmed accounts out of marketing sends; ping
    IndexNow when an item sells; re-measure first paint on production; pin the
    Deep Field batch size in a test; Node 20 → 22 on Netlify (`netlify.toml:7`).

**Time-gated (Claude reads when due):**
- ✅ 2026-09-14 (all read; `CHANGELOG.md` 2026-09-14 "due checks"):
  - The retention job's first run drained the backlog: `webhook_events` 117k →
    55.5k and `ebay_sync_log` 120k → 15.4k. 0 receipts still hold deleted-user
    data.
  - One `scheduled_price_push` row per channel.
  - The pg_cron Instagram check ran at 12:15:01Z ("not_due").
- ⚠️ **Mon 2026-09-21 after 12:15Z: Instagram token refresh.** The token
  expires 2026-09-30 13:17Z. The 14-day window is DEPLOYED (`main@beaf772`,
  `lib/instagram/auth.ts:26`), so 09-21 (9 days left) should log "Instagram
  token refreshed; now valid until …"; 09-28 is the backup.
  - Read the `instagram_sync_log` `token_refresh` row after 09-21 (and 09-28 if
    09-21 failed).
  - An `error` on 09-28 means re-pasting the token before 09-30.
- ~09-28: brand SERP site-name line (first recheck after the 09-14 re-crawl
  request).
- ✅ 2026-09-19: Apple place card + BBB read — both PASS (`CHANGELOG.md`
  2026-09-19; detail in the 09-11 citation block below).
- ~09-20: GSC validations ("Page with redirect", "Blocked by robots.txt").
- ~09-24: Yelp ad metrics.
- ~10-09: free-appraisal calls look-back.
- Monthly: GBP Performance → Calls.
- First real events: marketplace sale, website sale, refund, hard bounce,
  receipt through the new templates.

**Owner-only (highlights):**
- ⚠️ **Replace the Facebook Page token before 2026-10-31.**
- D&B Profile Manager (trade name, phone, website).
- Reviews that name the metal sold; buying photos; ask callers where they found
  us for 30 days.
- Decisions: GBP hours, booking link, "since 2010" vs the Sept 2026 opening
  wording.
- Bench photos: the Free Appraisal hero is still the generated desk placeholder
  (`free-evaluation/page.tsx:257`), plus the text-only marks entries.
- Decisions: remove the old address landmark (`Sharon Lynch`, 23 mentions in
  11 files), the /trade-in entry point, `#item=` links.
- A real iPhone Safari check of the homepage hero.
- Delete the test Instagram post (item 21).
- Accountant / legal / Spanish native-speaker reviews.

### ✅ DEPLOYED 2026-09-13 21:37 ET (main@12d76cb, live-verified — CHANGELOG 2026-09-13 night 21:37 ET) — "Refresh Preview" on the Instagram and Facebook panels (no SQL, no env vars)

- **What.** `InstagramProductPanel` / `FacebookProductPanel` loaded their
  preview only on open, so a photo saved in the listing editor never appeared
  until the form was closed and reopened. Each now has a **Refresh Preview**
  button in its header (every workflow step; listing-editor accordions and
  Manage pages). It re-reads the preview and keeps unsaved lineup, crop and
  caption edits.
- **Gate.** tsc 0 · `npm run lint` 0 · 1341/1341 · build 0. Dev Chrome (item
  #135): both buttons → "Refreshing…" → "Preview refreshed.".
  `CHANGELOG.md` 2026-09-13 (late night, social refresh).
- ✅ **Owner ran this successfully 2026-09-13 (night, after the 21:37 ET deploy).** Was: Add a photo to a listing → Save →
  open its Instagram (or Facebook) section → Refresh Preview → the new photo
  shows under "not included" (or in the lineup if none was saved).

**Staging (social refresh):** ✅ synced 2026-09-13 — dry run exactly the 5
expected (InstagramProductPanel, FacebookProductPanel, CHANGELOG,
CURRENT_STATUS, TASKS), 0 extras; copied 5; follow-up 0; SHA-256 MATCH ×5;
staged panels carry `refreshPreview` (IG 2, FB 2); leak check 0 `.env*` /
`.log`; 209 = 209 `.tsx`. Docs-only re-sync after this line.

### ✅ DEPLOYED 2026-09-13 21:37 ET (main@12d76cb, live-verified — CHANGELOG 2026-09-13 night 21:37 ET) — Etsy photo sync fix: replaced photos never uploaded (inv #33, #82) + deleted listings stuck in error (no SQL, no env vars)

- **Photos.** The crash-recovery step adopted the OLD Etsy images as the new
  uploads and the same pass deleted them. Etsy held 2 of 7 photos for #33 and
  7 of 10 for #82 while our rows said "uploaded". Fixed in
  `lib/etsy/images.ts` + `sync.ts`:
  - Photo records are checked against the live Etsy listing before every photo pass.
  - Recovery only claims images no record points at.
  - Deletes run first.
- **Deleted listings.** A listing deleted on etsy.com now resets to not-listed
  during a sync instead of 404-ing forever.
- **Gate.** tsc 0 · `npm run lint` 0 · **1341/1341** · build 0. Read-only live
  dry run: #82 → upload photos 8–10; #33 → 5 uploads, 0 adoptions.
  `CHANGELOG.md` 2026-09-13 (late night, Etsy photos); rule in `DECISIONS.md`
  → *"Etsy photo checkpoints are verified against the live listing"*.
- ✅ **Owner ran these successfully 2026-09-13 (night): #33 re-synced (reset → new listing), #82 re-synced.** Was:
  1. **#33** (listing deleted on Etsy): open it → Etsy accordion → "Sync
     Updates" (or "Check Etsy Status"). It resets to not listed; then "Sync to
     Etsy" creates a new listing with all 7 photos (a draft unless
     auto-activate is on).
  2. **#82** (live, missing photos 8–10): open it → Etsy accordion → "Sync
     Updates". Expect a notice, and an `image_repair` log row, then photos
     8–10 on Etsy.
  3. Ask and I'll verify both listings' photos read-only against the site.

**Staging (Etsy photos):** ✅ synced 2026-09-13 — dry run exactly the 8 expected
(etsy/images.ts, etsy/sync.ts, photo-sync-repair.test.ts new, CHANGELOG,
CURRENT_STATUS, DECISIONS, TASKS, features/etsy-sync), 0 extras; copied 8;
follow-up 0; SHA-256 MATCH ×8; staged sync.ts has `resetDeletedEtsyListing` ×4
and images.ts `planImageAdoptions` ×3; temp dry-run script absent; leak check
0 `.env*` / `.log`; 209 = 209 `.tsx`. Docs-only re-sync after this line.

### ✅ DEPLOYED 2026-09-13 21:37 ET (main@12d76cb, live-verified — CHANGELOG 2026-09-13 night 21:37 ET) — pencil edits on every Etsy/eBay preflight: listing-editor accordions + Manage Etsy/eBay pages (no SQL, no env vars)

- **What.** The Etsy and eBay accordions in the add/edit listing form, and the
  Manage Etsy / Manage eBay pages, now have the review window's pencil editors
  (shared `components/admin/ProductFieldInlineEditor.tsx`, same
  `PUT /api/admin/products/fields`).
  - Etsy: Quantity, Materials, When made, Length / Ring size, category.
  - eBay: Quantity and every aspect.
- **Safety.** In the open drawer, a pencil save is copied into the form, its
  type/chain/length inputs and undo history (`applyFieldPatchToEditorState`),
  so the drawer's Save or Undo can't revert it.
- **Gate.** tsc 0 · `npm run lint` 0 · **1334/1334** · build 0. Dev Chrome
  read-only check (item #135): drawer and Manage pages show 5 Etsy / 10 eBay
  pencils, editors prefill, Cancel works. `CHANGELOG.md` 2026-09-13 (late
  night, pencils).
- ✅ **Owner ran these successfully 2026-09-13 (night): a real pencil Save + the review window.** Was: **Owner, 2 minutes (dev :3007 now, or production after the push — both
  write the live product).**
  1. Open a listing → eBay accordion → pencil a field (e.g. Item Weight) → Save.
  2. Expect "… saved · preview refreshed", with the same value in the form's
     field.
  3. Save the listing and reopen it: the value stuck.
  4. Open "Review before submitting" once to confirm the refactored window
     still works.

**Staging (pencils):** ✅ synced 2026-09-13 — dry run exactly the 15 expected
(ProductFieldInlineEditor.tsx new, SelectedMarketplaceReviewFlow, Etsy/Ebay
ProductPanel, ProductMarketplaceManagerPage, AdminShell, product-field-edits.ts
+ test, CHANGELOG, CURRENT_STATUS, DECISIONS, STRUCTURE, TASKS,
features/etsy-sync, features/ebay-sync), 0 extras; copied 15; follow-up 0;
SHA-256 MATCH ×15; staged AdminShell has `applyDrawerFieldEdit` ×3; leak check
0 `.env*` / `.log`; 209 = 209 `.tsx`. Docs-only re-sync after this line.

### 🟡 RUN BY OWNER 2026-09-13 evening (blocks 1–12: indexes, procedure, one-batch test, job `nej-log-retention` scheduled) — ◻ first nightly run 2026-09-14 07:20 UTC; check it after that ("check the retention run")

`supabase/log-retention-2026-09.sql` — batched retention procedure + one new
pg_cron job `nej-log-retention` (07:20 UTC). Independent of the site deploy
(pure SQL). Audit + reasoning: `CHANGELOG.md` 2026-09-13 (log retention audit).
The report's cause was wrong: the growth is eBay's account-deletion broadcast
(~1,760/day, written to BOTH `webhook_events` and `ebay_sync_log`), not
listing reconcile. Nothing urgent (DB 156 MB of 8 GB). ◻ Owner: approve the
windows, then run steps 0-4 one at a time. ◻ Optional code follow-up (not
built): stop the duplicate `account_deletion` row in `ebay_sync_log`
(`ebay-account-deletion/route.ts:268-277`) — the preferred option already
noted further down ("eBay `account_deletion` webhook rows are 97%…"). Closes the
owed identifier scrub (22,552 rows, 07-10 → 07-23) when the 30-day rule runs.
Double-checked 09-13: draft bug fixed (SET clause would have blocked COMMIT);
pg_cron/editor COMMIT, triggers, publications, readers all verified safe.
Staging (fix): ✅ synced — dry run exactly 3 (SQL, CHANGELOG, TASKS), 0 extras;
copied 3; follow-up 0; SHA-256 MATCH ×3; staged SQL has 0 `set search_path`
lines. Docs-only re-sync after this line.

**Staging (retention draft):** ✅ synced 2026-09-13 — dry run exactly 3
(`supabase/log-retention-2026-09.sql` new, CHANGELOG, TASKS), 0 extras; real run
copied 3; follow-up dry run 0; SHA-256 MATCH on all 3; leak check 0 `.env*`.
Docs-only re-sync after this line.

### ✅ DEPLOYED 2026-09-13 17:28 ET (main@71a77d8, live-verified — CHANGELOG 2026-09-13 night) — eBay account-deletion webhook writes once per notice (rides with the same push; no SQL, no env vars)

`ebay-account-deletion/route.ts` now inserts the receipt already `processed`.
It no longer writes an `ebay_sync_log` row or a follow-up update, cutting
~3,500 writes/day. New `__tests__/post-success.test.ts` covers the signed happy
path. Gate: tsc 0 · `npm run lint` 0 · **1329/1329 (135 files)** · build 0 · no
Turbopack build cache. `CHANGELOG.md` 2026-09-13 (late night, webhook).
Dev smoke on :3007: GET without code → 400 `missing_challenge_code`; unsigned
POST → 412 `invalid_signature` (rejected before any DB access).

**Staging (webhook fix):** ✅ synced 2026-09-13 — dry run exactly the 7 expected
(route.ts, post-success.test.ts new, CHANGELOG, CURRENT_STATUS, TASKS,
features/ebay-sync.md, log-retention SQL), 0 extras; copied 7; follow-up 0;
SHA-256 MATCH ×7; staged route has 0 `insertSyncLog`; leak check 0 `.env*` /
`.log`; 208 = 208 `.tsx`. Docs-only re-sync after this line.

- ✅ Verified 2026-09-13 22:26Z (service-role read): 66 eBay receipts since
  the 21:29:01Z cutover, 0 not `processed`, 0 new `account_deletion`
  sync-log rows.

### ✅ DEPLOYED 2026-09-13 17:28 ET (main@71a77d8, live-verified — CHANGELOG 2026-09-13 night) — owner photo replaced on About, homepage and Free Appraisal (rides with the same push; no SQL, no env vars)

New `public/assets/images/pages/chris-owner.webp` (showroom-table WhatsApp
photo, WebP q80, 140 KB) replaces the deleted `chris.webp` at
`about/page.tsx:98`, `(home)/page.tsx:392`, `free-evaluation/page.tsx:664`;
`netlify.toml` 301s `/chris.png` and the old `chris.webp` path to the new file.
Verified on dev in Chrome (all three render). ◻ After the push: glance at the
three pages on the live site (EN + ES). `CHANGELOG.md` 2026-09-13 (late night).
Gate: tsc 0 · eslint (3 pages) 0 · vitest 1326/1326. Pre-push full gate over
the whole staged batch (dev server stopped first, restarted after): `npm run
lint` exit 0 · `npm run build` exit 0 · no `.next/cache/turbopack/` (secrets
scan). **Nothing else outstanding before the push** — no SQL, no env vars
(`ETSY_REDIRECT_URI` already set in Netlify, goes live with this deploy).

**Staging:** ✅ synced 2026-09-13 — dry run listed exactly the 9 expected entries
(3 pages, `chris-owner.webp` new, `chris.webp` extra, `netlify.toml`, CHANGELOG,
CURRENT_STATUS, TASKS); real run copied 8 / extras 1 removed / 0 FAILED, 1081
total; follow-up dry run 0; SHA-256 MATCH on all 8; old `chris.webp` gone from
staging; leak check 0 `.env*` / `.log`; 208 = 208 `.tsx`; staged pages carry
`chris-owner.webp` ×3. Docs-only re-sync after this line.

### ✅ DEPLOYED 2026-09-13 17:28 ET (main@71a77d8, live-verified — CHANGELOG 2026-09-13 night) — one scheduler: GitHub `schedule:` removed + Netlify scheduled functions deleted (rides with the same push; no SQL, no env vars)

Why: GitHub run #606's `facebook-drip` 502 (a late scheduled GitHub call;
nothing lost) led to finding every job firing THREE times — pg_cron, the old
Netlify `.mts` functions (executing since ~09-11) and GitHub's late
`schedule`. The drips claim nothing before publishing, so overlap could
double-post. pg_cron stays the only scheduler; the GitHub workflow keeps its
manual "Run workflow" button. This closes the long-parked "pg_cron overlap
cleanup" items further down. Detail + evidence: `CHANGELOG.md` 2026-09-13
(late); rule: `DECISIONS.md` scheduling entry ("pg_cron is the ONLY
scheduler"). Gate: YAML valid · tsc 0 · lint 0 · **1326/1326** · build exit 0.

- ✅ Verified 2026-09-13 after the deploy:
  - Netlify → Functions lists only "Next.js Server Handler".
  - The last scheduled GitHub run was 21:18:06Z (before the push); the live
    workflow has only `workflow_dispatch`.
  - 22:26Z read: ONE Facebook and ONE Instagram drip row at 22:00:06Z, and one
    reconcile + one sales row per channel at 21:30 and 22:00.
- ◻ Still to read (09-14 after 11:45 UTC): ONE `scheduled_price_push` row per
  channel (11:15 Etsy / 11:45 eBay).

**Staging (one scheduler):** ✅ synced 2026-09-13 (late) — dry run listed exactly the 14 changed files (scheduled-jobs.yml, three admin routes, pg_cron SQL, ARCHITECTURE, CHANGELOG, CURRENT_STATUS, DECISIONS, STRUCTURE, TASKS, features/ebay-sync, etsy-sync, facebook-posting) and exactly the 5 deleted `next-app/netlify/functions/*.mts` as extras (1 extra dir); real run copied 14 and removed the 5 + the folder (robocopy exit 3 = copied + extras); follow-up dry run 0/0; SHA-256 MATCH on all 14; staged `functions/` gone, `edge-functions/` 2 files intact, staged workflow has no `schedule:`; leak check 0 `.env*` / `.log` / `.git`; positive control 208 = 208 `.tsx`. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

### ✅ DEPLOYED 2026-09-13 17:28 ET (main@71a77d8, live-verified — CHANGELOG 2026-09-13 night) — homepage hero on short screens, three owner-approved steps in one push: headline shrinks in place ("Option A") · compact mode where it cannot fit ("Choice A") · smaller controls, higher phone headline and a minimum hero height on the tiniest windows (no SQL, no env vars)

Files: `components/home/HomeHeroOverlay.tsx`, `components/home/HomeHeroStack.tsx`,
`components/home/HomeSubscriberForm.tsx`, `app/globals.css`, new
`lib/__tests__/hero-short-screens.test.ts`. Mockups:
headline fit https://claude.ai/code/artifact/510369b1-5f31-437c-a48f-d190ca776460 ·
compact mode https://claude.ai/code/artifact/7c2e5401-5bc4-4c22-8bd5-28234b89e3a6 ·
last short screens https://claude.ai/code/artifact/6c60b170-a44f-47c5-ac60-c38f005f6cbc ·
overlap map https://claude.ai/code/artifact/a7a0f0e6-5e08-4a87-9417-3485da8e3ac3.
Gate after the last step: tsc 0 · eslint 0 · `npm run lint` 0 · **1326/1326
(134 files)** · build exit 0 · live sweep EN + ES, 34 widths × 40 heights:
**0 sizes that fit before without compact mode changed**, 364 compact /
minimum-height sizes identical to the mockup, runway travel correct everywhere
(`CHANGELOG.md` 2026-09-13 (evening)). Owner rule: anything that fits today
stays the same — the common iPhone, laptops and the iPad are unchanged.

- ◻ After the push (owner, 2 minutes): (1) a very short laptop browser window
  (under ~560px tall) — eyebrow gone, larger headline clear of a slimmer form;
  (2) a phone turned sideways — headline clear of the form, a short scroll
  reaches Buy / Sell / Visit Us, the hero does not pin; (3) a normal phone and a
  normal laptop window look exactly as before.
- ✅ Closed the same night (`CHANGELOG.md` 2026-09-13 (night)): per-language
  compact limits fixed the English tight windows and both Spanish overlaps with
  0 fitting sizes changed; overflow, clipped-text, under-320px-tall and
  mid-scroll-resize checks all came back clean in both languages. Left by
  design: English 349 wide × 660 tall stays tight (12px, no overlap) because its
  640 fits. Gate: tsc 0 · lint 0 · **1326/1326** · build exit 0.
- ◻ Owner, after the push: one look on a real iPhone in Safari, upright and
  turned sideways (Chrome cannot stand in for WebKit scrolling).

**Staging (per-language compact limits):** ✅ synced 2026-09-13 (night) — dry run listed exactly the 7 touched files (HomeHeroOverlay.tsx, hero-short-screens.test.ts, CHANGELOG, CURRENT_STATUS, DECISIONS, STRUCTURE, TASKS), 0 file extras, 0 dir extras; real run copied 7 / 0 FAILED; follow-up dry run 0/0; SHA-256 MATCH on all 7; staged overlay carries `COMPACT_BANDS_EN` and `COMPACT_BANDS_ES`; leak check 0 `.env*` / `.log` / `.git`; positive control 208 = 208 `.tsx`. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.
- Also goes live with this push: Netlify `ETSY_REDIRECT_URI` (item below).

**Staging (headline fit):** ✅ synced 2026-09-13 — dry run listed exactly the 6 touched files (HomeHeroOverlay.tsx, CHANGELOG, CURRENT_STATUS, DECISIONS, STRUCTURE, TASKS), 0 Extras, 1085 total; real run copied 6 / 0 FAILED; follow-up dry run 0; SHA-256 MATCH on all 6; leak check 0 `.env*` / `.log` / `.git`; positive control 208 = 208 `.tsx`; staged file carries `home-hero-top-zone`. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.
**Staging (compact mode):** ✅ synced 2026-09-13 (afternoon) — dry run listed exactly the 6 touched files (HomeHeroOverlay.tsx, CHANGELOG, CURRENT_STATUS, DECISIONS, STRUCTURE, TASKS), 0 Extras, 1085 total; real run copied 6 / 0 FAILED; follow-up dry run 0; SHA-256 MATCH on all 6; leak check 0 `.env*` / `.log` / `.git` / `sweep*`; positive control 208 = 208 `.tsx`; staged file carries the 5 `@container hero-overlay` blocks. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.
**Staging (last short screens):** ✅ synced 2026-09-13 (evening) — dry run listed exactly the 10 touched files (globals.css, HomeHeroOverlay.tsx, HomeHeroStack.tsx, HomeSubscriberForm.tsx, hero-short-screens.test.ts NEW, CHANGELOG, CURRENT_STATUS, DECISIONS, STRUCTURE, TASKS), 0 Extras, 1086 total; real run copied 10 / 0 FAILED; follow-up dry run 0; SHA-256 MATCH on all 10; leak check 0 `.env*` / `.log` / `.git` / `sweep*`; positive control 208 = 208 `.tsx`; staged files carry 7 `@container hero-overlay` blocks, the `--hero-min-vh` rules and `--app-vh-page` in globals.css. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

### 🟢 LIVE + ARMED 2026-09-13 04:00Z — marketplace sale → site SOLD → other marketplace ended (SQL run, deployed, both reconnected); ◻ read the 04:30Z log rows, then the first real sale is the proof

Built + gated (tsc 0 · lint 0 · **1319/1319 (133 files)** · build exit 0)
and staged with the batch below. `CHANGELOG.md` 2026-09-12 (night); rule in
`DECISIONS.md` → *"A marketplace sale marks the product sold"*. Owner steps,
in this order:

1. ✅ SQL run (09-13 ~03:20Z — columns and table confirmed in the DB).
2. ✅ Pushed + deployed (the 03:30Z sweeps logged "waiting for order
   permission" on both channels = the new code is live).
3. ✅ Etsy reconnected 03:50:46Z — scopes now include `transactions_r`.
   ⚠️ NOT from production: production's button redirected to
   `localhost:3002` (Netlify `ETSY_REDIRECT_URI` was the dev callback). Done
   from a local dev server on port 3002 instead (`.claude/launch.json` →
   "Next.js Dev (port 3002 — marketplace OAuth callbacks)"), which writes
   into the shared DB — `CHANGELOG.md` 2026-09-13.
4. ✅ eBay reconnected 03:51:10Z the same way — scopes include
   `sell.fulfillment.readonly`.
5. ✅ **ARMED 04:00:02Z on both channels** (log rows "Auto-mark-sold armed
   — Etsy sales from 2026-09-13T04:00:02Z…" / eBay 04:00:01Z; cursors set).
   Sales before that instant are ignored (your call 09-12).
   ✅ **04:30Z and every half-hour after it CHECKED (read 09-13 13:55Z,
   service-role REST on `etsy_sync_log` / `ebay_sync_log`):** both channels
   logged "sales: 0 orders read, 0 marked sold, 0 quantity reduced, 0 already
   handled, 0 not ours, 0 failed" with outcome ok at 04:30:02Z (Etsy) /
   04:30:02Z (eBay), and on all 20 half-hours 04:30 → 13:30Z. 22 sales rows +
   22 reconcile rows per channel, no missed slot, **0 warning/error rows**;
   reconcile steady at Etsy 133 scanned / eBay 127 scanned, all zeros. So the
   order-read calls authenticate with the new scopes. ⚠️ 0 orders read cannot
   prove the parser — no sale happened in the window, and an unexpected
   response shape also reads as 0 — step 6 remains the proof.
   Staging (this docs note): ✅ synced 09-13 — dry run exactly 2
   (CURRENT_STATUS, TASKS), 0 Extras, 1085 total; copied 2 / 0 FAILED;
   follow-up dry run 0; SHA-256 MATCH on both. Docs-only re-sync after this
   line: dry run 1 (TASKS.md) → copied → follow-up 0.

**Proper fix so the production Reconnect buttons work next time:**
- ✅ Netlify `ETSY_REDIRECT_URI` (Production) →
  `https://naplesestatejewelry.com/api/admin/etsy/callback` (set 09-12
  23:56 ET). The Etsy app already lists that callback. **Live on the next
  deploy** (no deploy spent on it alone).
- ✅ **eBay needs nothing** (read in the owner's signed-in developer.ebay.com,
  09-13 04:10Z): the one production RuName `Christopher_Sur-Christop-PostnS-ubfab`
  already has auth accepted URL `https://naplesestatejewelry.com/api/admin/ebay/callback`
  and declined URL `…/admin/settings?ebay=declined`, OAuth enabled, every
  sell/commerce scope ticked. Production's Reconnect eBay lands on production
  — tonight's reconnect (started at localhost:3002) completed on production's
  callback, which is why it worked. Nothing changed there.
6. ◻ **First real sale = the proof.** After the next Etsy or eBay sale wait
   for the half-hour: the activity log shows "Sold on Etsy — marked sold on
   the site at $X (Etsy order …)", the product reads Sold in Admin →
   Products with that sold price, and the OTHER marketplace's listing is
   ended / quantity 0. If anything reads "failed" or "not ours", send me the
   log line.

Switch off any time: the same checkbox (per marketplace). ⛔ Not exercised
against live Etsy/eBay from here — the API shapes are the published ones and
an unexpected response reads as "0 orders", never as a sale.

**Staging (marketplace sales):** ✅ synced 2026-09-12 (night) — dry run listed exactly the 25 touched files (marketplace-sales.ts NEW, marketplace-sales-sweep.ts NEW, marketplace-sales.test.ts NEW, marketplace-sales-2026-09.sql NEW, etsy/ebay auth+client+store, both reconcile-status/status/settings routes, both settings panels + CHANGELOG, CURRENT_STATUS, DECISIONS, STRUCTURE, TASKS, features/etsy-sync, features/ebay-sync), 0 Extras, 1085 total (= 1082 on disk + the 3 `/XF`-excluded); real run copied 25 / 0 FAILED; follow-up dry run 0/0/0; leak check 0 `.env*`/`.log`, 0 `.git`; positive control 208 = 208 `.tsx`; SHA-256 MATCH on both sales libs, the SQL, etsy/auth.ts, EbaySettingsPanel, CHANGELOG. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

### ✅ DEPLOYED 2026-09-12 23:14 ET (main@a985175; review window owner-confirmed on production 09-13) — the 2026-09-12 batch: review-window inline edits + Etsy category dropdown + mm/cm length + "Purity: 14K" + sortable Subscribers table (no SQL, no env vars)

Built, gated (tsc 0 · lint 0 · **1308/1308 (132 files)** · build exit 0) and
staged — `CHANGELOG.md` 2026-09-12 (two entries). The admin is behind login
and its sign-in page crashes the Browser pane, so both screens are
**unverified in a browser**.

**Also in the batch (09-12 later): Admin → Subscribers sorts by column.**
◻ Owner look on the dev server (`/admin/subscribers`): opens newest-first
on Subscribed (▼ on that header); click Name → A→Z (▲), click again → Z→A
with blank names still last; click Subscribed twice → oldest first with
undated "(account)" rows still last; Copy All Emails follows the visible
order.

**Owner walkthrough (dev `http://localhost:3007/admin` or production after
the push) — Products → select 1–2 items → Actions → Sync to Etsy → Review:**
1. ◻ Pencil on **Length** → type `470 mm` → the hint reads "= 18.5 in" →
   Save → "Length saved · preflight refreshed." and the row shows 18.5 in.
   (Pick a test item, or put the right value straight back.)
2. ◻ Pencil on **Category** → the dropdown opens on Jewelry groups; type
   `pend` → "Pendant Necklaces · Jewelry › Necklaces" first, the two
   craft-supply "Pendants" flagged below → pick one → "Category saved".
   "Reset to automatic" appears while an override is set.
3. ◻ **Materials** pencil → metal + purity together; **When made** pencil →
   year; **Tags** → add one in "Additional tags" → Save tags → it shows
   gold-outlined, first.
4. ◻ Then **Sync to eBay → Review**: the Aspects list shows one line per
   aspect with pencils; **Brand** / **Main Stone** / **Chain Length** save
   and refresh; Style says "fixed"; Price/Condition/Shipping carry notes.
5. ◻ Close the window: the product row in the table shows the new value
   without a reload; open the item's editor: same value, label "Length (in)".
6. ◻ After the push, post one item and read the Etsy/eBay description:
   `Purity: 14K` (or `925`), `Length/Size: 18.5 in`.

**Staging:** ✅ synced 2026-09-12 — dry run listed exactly the 28 touched files (products/fields/route.ts NEW, EtsyCategoryDropdown.tsx NEW, product-field-edits.ts NEW, product-field-edits.test.ts NEW, SelectedMarketplaceReviewFlow.tsx, AdminShell.tsx, both bulk modals, both preview routes, product.ts + test, etsy/ebay mapping + tests, length-experiment + test, ai-product-provider/schema + test, admin-settings + CHANGELOG, CURRENT_STATUS, DECISIONS, STRUCTURE, TASKS, features/etsy-sync, features/ebay-sync), 0 Extras, 1079 total (= 1076 on disk + the documented 3 `/XF`-excluded); real run copied 28 / 0 FAILED (robocopy exit 1 = copied only); follow-up dry run 0/0/0; leak check 0 `.env*`/`.log`, 0 `.git`, no node_modules/.next/worktrees, launch.json present; positive control 208 = 208 `.tsx`; SHA-256 MATCH on the review flow, dropdown, field-edits lib, route, product.ts, CHANGELOG. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.
**Staging (subscribers sort):** ✅ synced 2026-09-12 (later) — dry run listed exactly the 7 touched files (subscriber-sort.ts NEW, subscriber-sort.test.ts NEW, SubscribersManager.tsx + CHANGELOG, CURRENT_STATUS, STRUCTURE, TASKS), 0 Extras, 1081 total (= 1078 on disk + the 3 `/XF`-excluded); real run copied 7 / 0 FAILED; follow-up dry run 0/0/0; leak check 0 `.env*`/`.log`, 0 `.git`; positive control 208 = 208 `.tsx`; SHA-256 MATCH on the sort lib, manager, test, CHANGELOG. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

### ✅ 2026-09-11 — Free-evaluation calls: page rebuilt call/visit-first + small fixes DEPLOYED (production-verified)

Findings in `SEO_LEAD_AUDIT.md` → "Free-evaluation follow-up". Built 09-11
night (`CHANGELOG.md`): `/free-evaluation` is now the "Free Estate Jewelry
Appraisal — Home or Showroom" page (call/visit first, home-visit section,
form last), sitewide "Free Appraisal" labels, `/process.html` 308, Spanish
LLAMAR buttons, QR claim removed. No SQL, no env vars.
- ✅ GSC 09-11 night: indexing requested for `/free-evaluation` and
  `/es/free-evaluation` (both already indexed; new titles need a re-read).
  No other GSC change needed. ⛔ never click REQUEST AGAIN.
- ✅ **DEPLOYED 09-11 night** and production-verified: `/process.html` 308,
  both new titles live, the new section on the page. IndexNow **200 OK for
  220 URLs**. Staging equals source; nothing in flight.
- ◻ Owner: did walk-ins rise after 08-18? Were the free-evaluation calls
  mostly about home visits? Early-morning callers?
- ✅ GBP post published 09-11 night: free estate jewelry appraisals, showroom
  or home, Call now button, Chris-at-the-counter photo (`CHANGELOG.md`).
  The owner also added that photo to the GBP photo gallery (gold testing
  with scales, touchstone and acid kit) — part of the "buying photos" item.
  ◻ **Recheck ~09-13** that it still says Published — the 08-30 post was
  removed ~2 days after passing the instant check. Do not repost the same
  text (repetitive-content rule).
- ✅ GBP description updated 09-11 night (agent, owner-asked): "We appraise",
  "Appraisals are free", and free in-home appraisal in the six cities. The
  phone-hours line was already there. Saved as **pending Google review**
  (~60 min) — ◻ confirm it published ~09-12.
- ◻ GBP (owner, not code): decide whether the booking link stays on
  `/free-evaluation` (now call-first, so most of the concern is gone);
  reconcile "since 2010" in the description vs the Sept 1, 2026 opening
  date (Yelp says 2010 as well).
- ◻ Look-back ~10-09: appraisal / home-visit calls vs the 09-11 baseline;
  GSC "free jewelry appraisal" queries landing on `/free-evaluation` vs
  `/jewelry-appraisal` (cannibalization watch).
- Dropped (owner 09-11: "ignore those if they dont affect seo, only focus on
  anything that will get us calls"): the `/sell` EN/ES button wording
  mismatch and the admin banner link-option label. Do not reopen.

### ◻ 2026-09-11 — Citation (NAP) campaign: Steps 1–5 DELIVERED; ✅ Apple + BBB live and correct (checked 09-19); owner actions open (D&B Profile Manager, trade directories)

Report (private artifact, owner's reference — master record, audit, checklists,
two outreach emails, Moz Local vs Yext): https://claude.ai/code/artifact/441be9e1-19c3-4627-b4fe-fef5bc7a08ae

**Step 1 ✅** owner confirmed the right-hand "citation standard" column below
(09-11) and moved the GBP opening date to **Sept 1, 2026** → Maps now shows
"Closed · Opens 11 AM" (verified), "Opens September" gone.

**Step 2 audit (09-11, owner's Chrome, read-only except Yelp):**
- Google ✅ baseline. Yelp ✅ NAP + hours match; categories Gold Buyers,
  Jewelry, Diamond Buyers — owner: KEEP Diamond Buyers, gold first (it is).
- ◻ **Apple Maps** (claimed, "From the Business"): NAP ✅ but hours WRONG
  (Tue–Sat 12–3, Sun–Mon closed); About text retail-first; delivery/curbside
  attributes. Owner fixes in businessconnect.apple.com (draft About in report).
- ◻ **Bing**: NO listing on Bing Maps — the 09-01 import never published.
  bingplaces.com offers "Continue as Chris" (Google SSO) — not clicked
  without the owner's OK.
- ◻ **BBB**: no profile (name, legal name, phone searched) → free
  "Request a Business"; accreditation not needed.
- ◻ **Yelp recheck ~09-14:** Estate Liquidation not visible; "Established"
  stuck at 2010 (2026 saved 3× — shows, then reverts on reload); a Diamond
  Buyers removal tried 09-11 did not register — if it vanishes later, re-add.

**Step 3:** JA — not a member (10 retail members within 25 mi); JBT — free
listing, status unknown (members-only lookup); GIA Retailer Lookup — not
listed (Gulfcoast Coin & Jewelry, Yamron, Beckner are), register only if
eligible. **Step 4:** Chamber + partner emails drafted (owner sends).
**Step 5:** skip Yext; finish Apple/Bing/BBB by hand; optional Moz Local
Lite monthly for the long tail.

**DBA question (owner, 09-11):** Apple Business shows "Naples Antiques, LLC"
because the ORGANIZATION record is the legal entity, verified against
D-U-N-S 144420694; Apple labels it not shown to customers. The customer-facing
brand and location are already "Naples Estate Jewelry". There is no DBA field
in Apple Business, and the org name must stay the legal name. The DBA belongs
on the public records:
- ✅ **Florida fictitious name "Naples Estate Jewelry" is REGISTERED**
  (owner confirmed 09-11). (Unrelated: a dissolved "NAPLES ESTATE JEWELRY,
  INC.", doc P98000005757, also exists on Sunbiz.)
- ✅ **Keep 4243 30th Ave SW** as the Sunbiz / D&B legal address (owner:
  the showroom may move). Customer-facing listings keep the Shirley St
  showroom; this split is deliberate.
- ◻ **Dun & Bradstreet — owner sign-in needed.** D&B's free "View / Update
  Company Information" search finds **NAPLES ANTIQUES LLC, 4243 30th Ave SW,
  Naples FL 34116, Active, single location — no phone, no trade name
  shown** (D-U-N-S 144420694 per Apple). The next step requires identity
  verification + a D&B account (owner/officer only) — stopped there, tab
  left on "Continue". In D-U-N-S Manager request: add trade name (DBA)
  "Naples Estate Jewelry"; add phone (239) 404-8505; add website
  https://naplesestatejewelry.com; keep the 4243 address. It's free — skip
  every paid upsell (Credit Builder, CreditSignal upgrades, etc.). D&B may
  phone the registered officer to validate.
  **09-11:** "Continue" opens D&B's "Create an account" form (name, email,
  terms, Register) — account creation is the owner's; stopped there. Once
  the owner is registered + identity-verified, the edits above can be
  entered for them.
  **09-11 (later):** owner registered, logged in and passed D&B's identity
  check. myD&B now shows the company linked: NAPLES ANTIQUES LLC, D-U-N-S
  14-442-0694, LLC, 4243 30th Ave SW, **Phone: N/A**, "Year Started 2026".
  D-U-N-S Profile Manager answers "Thank You for Accepting the Terms — your
  request is being processed… check back after some time" (still so after
  ~2 min). ◻ NEXT: open my.dnb.com → D-U-N-S Profile Manager; when it loads,
  fill trade name / phone / website (address unchanged), owner submits.

**09-11 (latest):**
- ✅ **GIA Retailer Lookup APPROVED** (owner).
- 🟡 **Apple Business updated, "In Review" (≤5 business days)** — owner
  signed in (org "Naples Antiques, LLC" → Brands → Locations → Naples Estate
  Jewelry, Verified). Hours → Mon–Fri 11–3 · Sat 11–4 · Sun closed; About →
  the buyer-first text (same as GBP/Yelp); Good to Know → Appointments Only,
  Delivery, Same-Day / No-Contact Delivery, Curbside Pickup set to NOT
  offered (In-Store Pickup kept — checkout has Local Pickup). Address left as
  stored "Suite 104" (displays "Ste 104"; editing risks re-verification).
  Category stays "Gold Buyer". ◻ Owner's call: Apple suggests adding a
  backup account to avoid lockout. ✅ **Public place card rechecked
  2026-09-19 (maps.apple.com, owner's Chrome, read-only): the review PASSED
  and everything is live** — hours Sun Closed · Mon–Fri 11:00AM–3:00PM · Sat
  11:00AM–4:00PM; the buyer-first About ("…Calls answered daily, 9 AM–6 PM…");
  Good to Know (expanded) has 0 hits for Delivery / Curbside / Appointment /
  No-Contact / Same-Day and keeps In-Store Pickup + Walk-Ins Welcome; NAP =
  6240 Shirley St · Ste 104 · Naples, FL 34109 · +1 (239) 404-8505 ·
  naplesestatejewelry.com; category Gold Buyer. Nothing left on Apple except
  the optional backup account.

**09-11 (later) — follow-through in the owner's Chrome:**
- ✅ **GIA Retailer Lookup SUBMITTED** by the owner (form pre-filled by us:
  "GIA Diamond Grading Reports" only — owner carries GIA-graded diamonds
  occasionally; master record; showroom hours; contact = Chris Surette /
  store phone / info@). "Submitted for review" — ◻ watch info@ for GIA's
  approval, then search 34109 on the Retailer Lookup.
- ✅ **BBB free profile SUBMITTED by the owner 09-11** (bbb.org "Thank you
  for submitting" page seen). ✅ **Rechecked 2026-09-19: the profile is
  PUBLISHED** —
  https://www.bbb.org/us/fl/naples/profile/gold-buyers/naples-estate-jewelry-0653-90465534
  (first result for the name near Naples, FL). Naples Estate Jewelry · 6240
  Shirley St Ste 104 · Naples, FL 34109-6254 · (239) 404-8505 · Visit Website
  → https://naplesestatejewelry.com/ — all match the citation standard.
  Alternate name Naples Antiques LLC; Christopher Surette, Owner; BBB of West
  Florida; file opened 9/11/2026; NOT accredited (not sought). Two things to
  know, neither an error: only **Gold Buyers** shows as a category (Estate
  Jewelry + Silver Buyers were submitted), and the rating reads **"Not Rated
  … in business less than 6 months"** — BBB dates the business from the file,
  the same 2010-vs-2026 wording question already on the owner's list. ◻
  Owner, optional: the profile's "Own this business?" link claims it (a BBB
  account — the way to add hours, the two categories and a start date).
- (was) ◻ **BBB free profile — form PRE-FILLED, owner clicks "Create Profile"**
  (bbb.org/get-listed → I own a business). Categories Gold Buyers, Estate
  Jewelry, Silver Buyers. Not clicked by us: it creates a BBB account and
  accepts BBB's terms.
- ◻ **Bing Places — NOT signed in.** The 09-01 listing (bizid f818777b…)
  lives under the owner's **Microsoft account**, "Pending publish" with a
  7–12 day ETA (→ ~09-13). The sign-in page's "Continue as Chris" is
  info@surettesystems.com (Google) — would start a separate empty account;
  never use it. Recheck Bing Maps after 09-13; if absent, owner signs in via
  "Microsoft account" and reads the status.
- Owner-only still: Apple Business Connect hours/About, JA (paid), JBT
  (needs principals/references), Chamber + partner emails.

**Staging (Apple + BBB look-back, docs only):** ✅ synced 2026-09-19 — dry
run listed exactly the 3 touched files (CHANGELOG, CURRENT_STATUS, TASKS), 0
Extras, 1142 total; real run copied 3 / 0 FAILED (exit 1 = copied only);
follow-up dry run 0/0/0, exit 0; leak check 0 `.env*` / `.log`, 0 `.git`;
positive control 217 = 217 `.tsx`; SHA-256 MATCH on all 3. Docs-only re-sync
after this line: dry run 1 (TASKS.md) → copied → follow-up 0. Nothing to
push — no app code changed.

(Step 1 baseline record, 09-10 night:)

Owner asked for a 5-step citation project (baseline → audit Apple/Bing/BBB/
Yelp → jewelry directories → Chamber outreach email → Moz Local vs Yext),
source of truth = the website + GBP. Step 1 read-only: source
`next-app/src/lib/business-location.ts`, live homepage HTML (HTTP 200,
JewelryStore schema), public Maps listing + local pack in the owner's Chrome.

| Field | Website (visible / schema) | GBP (public Maps) | Citation standard |
|---|---|---|---|
| Name | Naples Estate Jewelry | Naples Estate Jewelry | Naples Estate Jewelry |
| Street | 6240 Shirley St, Ste 104 | 6240 Shirley St Ste 104 | 6240 Shirley St, Ste 104 (line 2 = Ste 104 where split) |
| City/ZIP | Naples, FL 34109 | Naples, FL 34109 | Naples, FL 34109 |
| Phone | (239) 404-8505 (151 uses); schema +12394048505 | (239) 404-8505 | (239) 404-8505 |
| Website | https://naplesestatejewelry.com | naplesestatejewelry.com | https://naplesestatejewelry.com |

The site and GBP match; the only difference is Google's display dropping the
comma before "Ste" (not a discrepancy). Phone variants 239-404-8505 etc.
exist only in `phone.test.ts`. Stale identities to hunt in Step 2: legal
entity Naples Antiques LLC, old trading names (Naples Jewelry Buyers, Naples
Gold & Silver Buyer), old domains (.co, naplesantiquesllc.com), pre-08-17
"mobile / no storefront" copy.

🔴 **Found in passing — GBP shows "Opens September"** on Maps and in the
local pack (competitors show "Closed · Opens 9 AM"): the opening date set
today is September 2026 with the day unset, so Google treats the business as
pre-opening and hides its hours. Owner decision: set a past opening date
(the true start, or a September day ≤ today). Also settles the Yelp
"Established in 2010" question. No change made.

### ✅ DONE 2026-09-10 (night) — Yelp moved to buyer-first (owner: "go ahead with all of it"); ◻ one category change unconfirmed

Every save was re-read after a reload; the last three were also read on the
public page. Budget $15/day and radius 15 miles unchanged (keeps the $135.39
Bonus Ads credit).

1. ✅ **Blocked** engagement rings, custom jewelry, handmade jewelry, gift
   shops, buy gold bullion (12 blocked terms total).
2. ✅ **Boosts:** removed Gold (still eligible) and Antique Jewelry (a custom
   term, so it left the list entirely); added best place to sell gold, coin &
   gold buyers, sell jewelry, sell estate jewelry, jewelry buyers, silver
   buyers — Yelp accepted all four typed terms. 15 boosted terms total.
3. ✅ **Post** edited in place (same photo, runs Aug 21 – Nov 19): "Selling
   gold, silver or jewelry?" / "Bring single pieces, broken chains, sterling
   flatware or a whole inherited collection to our Shirley Street showroom
   for a free, no-obligation offer. Calls answered daily, 9 AM–6 PM."
4. ✅ **Highlights** order: Free estimates, Walk-ins welcome (the two shown in
   search), Available by appointment, Free consultations, Mobile services,
   Locally owned & operated. "Committed to satisfaction" dropped.
5. ✅ **CTA** "Sell gold & silver · 9 AM–6 PM" (exactly 30 chars) / Call for
   details → (239) 404-8505.
6. ✅ **Ad photo** smart selection OFF, pinned the gold-jewelry pile.
   **Slideshow** pinned: gold pile, mixed lot box, coin tubes, chain in hand,
   logo, brooches; chain display + jewelry trays left unpinned (auto-sorted
   last).
7. ◻ **Estate Liquidation category — submitted, NOT visible.** The post-save
   screen showed Gold Buyers, Jewelry, Diamond Buyers (stale) with no Estate
   Liquidation; after a reload and on the public page only Gold Buyers,
   Jewelry. Yelp moderates categories and shows stale lists meanwhile. Not
   resubmitted (a second request could collide). Recheck ~09-12: if Estate
   Liquidation is still absent, add it once more; if Diamond Buyers ever
   reappears publicly, remove it again.
8. ✅ **History** "Established in 2010" + "Chris Surette has bought estate
   jewelry, gold and sterling silver from Naples families since 2010. Sellers
   get a free evaluation and a clear, no-obligation offer at our Shirley
   Street showroom." ⚠️ Yelp REQUIRES the year; 2010 matches the approved
   text, but GBP's opening date was changed to **September 2026** today —
   owner to decide which is right and align the other (Yelp: Business
   Information → History → Edit). **Meet the Business Owner** card: Chris S.,
   Business Owner, bio "We buy gold jewelry, sterling silver and flatware,
   coins and estate jewelry, one piece or a whole collection. Every
   evaluation is free, and you're never obligated to sell." No photo.
9. ✅ **Website** → `https://naplesestatejewelry.com/sell/naples` (Yelp
   "reviews" basic-info edits; the public page already links the new URL).
10. ✅ Budget/radius untouched.

◻ **Owner:** buying photos (gold testing, scale, sterling flatware, a
counter evaluation) to replace the retail-looking chain display and trays.
◻ **Measure** ~09-24 on the same Yelp dashboard: impressions, clicks, CPC,
leads, cost per lead, calls (baseline above: 6.6K / 55 / $4.82 / 15 /
$16.06, 4 calls), plus whether callers are sellers.

### (plan record) 2026-09-10 (night) — Yelp buyer-focus plan: AUDITED read-only, then approved and implemented above

Owner: "audit my Yelp ads … move it towards mainly us buying jewelry, gold,
and silver and move away from advertising that we sell it. plan then i will
confirm before implement." Audit in the owner's Chrome; **nothing saved**
(every dialog cancelled, category search typed and cancelled).

**State found:** budget $15/day, 15 miles, goal Get more phone calls (call
reporting off), audience "Limited". Last 30 days 6.6K ad impressions, 55
clicks, $4.82 CPC, 15 ad leads, $16.06 per lead; Sept 1–10 spend $144.55;
Yelp Bonus Ads $135.39 free through Feb 17 2027 (needs a minimum budget).
Ad text + Specialties already seller-led. Categories now **Gold Buyers,
Jewelry** — the Diamond Buyers removal DID go through. Retail leaks left:
eligible keywords engagement rings / custom jewelry / handmade jewelry /
gift shops / buy gold bullion; "Gold" and "Antique Jewelry" boosted; the
public Update "We both buy and sell fine jewelry…"; the two highlights shown
in search are "Locally owned & operated" + "Free consultations"; smart photo
selection rotates 8 photos, none showing buying (hanging chains / trays read
retail); History, Intro, Slideshow, Portfolio empty; website field = homepage.

**Proposed changes (owner to confirm item by item):** block the five retail
keywords; un-boost Gold + Antique Jewelry; boost best place to sell gold +
coin & gold buyers (+ try sell jewelry / sell estate jewelry / jewelry
buyers / silver buyers); replace the Update with a buy-only one; highlights
top two = Free estimates + Walk-ins welcome; CTA text seller-led; ad photo
pinned to a buying-lot photo + slideshow ordered buying-first; add category
Estate Liquidation; write History + Intro; website → `/sell/naples`. Not
proposed: Pawn Shops / Antiques / Appraisal categories, removing Jewelry
(no Jewelry Buyers category exists), Yelp's "Let Yelp optimize" / smart ad
text nags, budget or radius changes. Owner-only: new buying photos (testing,
scale, sterling flatware, a counter evaluation).

### ✅ DEPLOYED 2026-09-10 (night) — Turbopack build-cache fix + the whole 09-10 SEO/seller batch — owner-confirmed

Owner: "pushed and deployed successfully, update docs, no production
verification needed." No probe run. **Staging equals source; nothing is in
flight.**

✅ **IndexNow done 2026-09-10 (night):** `npm run indexnow` from `next-app/`
in PowerShell → **200 OK for 220 URLs** from the live sitemap. The
gold-page / estate-page / qualified-call look-backs in the item below now
start from this deploy date.

**Staging (session close):** ✅ synced 2026-09-10 (night, post-deploy) — dry run listed exactly the 3 flipped docs (CHANGELOG, CURRENT_STATUS, TASKS), 0 Extras, 1075 total; real run copied 3 / 0 FAILED; follow-up dry run 0/0/0; leak check 0 (`.env*`, `.git`, `node_modules`, `.next`); SHA256 MATCH on all 3. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

### (pre-deploy record) 🟡 READY TO PUSH 2026-09-10 (night) — Netlify "Exposed secrets" FIXED (Turbopack build cache off) + the whole 09-10 SEO batch below (no SQL, no env vars)

The 22:45 ET failure is diagnosed and fixed — `CHANGELOG.md` 2026-09-10
(night). One app file changed: `next-app/next.config.ts`
(`experimental.turbopackFileSystemCacheForBuild: false`). The staged tree
never contained a secret; the leak was Next 16.3.4's new persistent build
cache inside the published `.next`. Gate: tsc 0 · lint 0 · 1276/1276 (130
files) · build exit 0 · build-output secret grep 0 hits. **Not rotated:**
nothing was served and the log prints names only — owner's call.

◻ **Owner:** copy staging to the repo and push. Expect the Netlify log to
show `Secrets scanning … found 0` and Deploying to run. After it is live:
spot-check `/`, `/gold-services`, `/estate-jewelry`, then `npm run indexnow`
from `next-app/` (PowerShell) because the SEO batch changed titles/content.
If the scanner still fails, read the log's `found value at line … in …`
paths first — do not add `SECRETS_SCAN_OMIT_PATHS`.

**Staging:** ✅ synced 2026-09-10 (night) — dry run listed exactly the 8 touched files (next.config.ts + CHANGELOG, CURRENT_STATUS, DECISIONS, INTEGRITY, SEO_LEAD_AUDIT, TASKS, features/lead-capture — the last six include the closing docs the prior agent never re-synced), 0 Extras, 1075 total; real run copied 8 / 0 FAILED (exit 1 = copied only); follow-up dry run 0/0/0; leak check 0 (`.env*`, `.git`, `node_modules`, `.next`, `worktrees`, `*.tsbuildinfo`, `next-env.d.ts`); 1072 files on disk (= 1075 − the 3 `/XF`-excluded); SHA256 MATCH on all 8; staged next.config.ts carries `turbopackFileSystemCacheForBuild: false`. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

### ✅ (resolved above) 2026-09-10 — STOPPED: other agent to resolve staging/Netlify secrets alert before deployment

- **Pre-deploy follow-up implemented and verified locally:**
  home gold-card link to `/gold-services` retains evaluation; estate body and
  wayfinding welcome ordinary pieces and showroom visits with accurate process
  claims; inherited-jewelry guide links to `/estate-jewelry`. Three existing
  files, EN/ES parity, no new routes and no new estate FAQ/schema.
  All automated gates and focused responsive/link checks pass. Estate offer card
  grows with its text; the mobile clipping found during QA is fixed.
- After the repair is verified, owner deploys **14 unique app source files plus package manifests**
  including the newly changed inherited-guide file; verification is complete.
  **NOT cleared: the 22:45 ET deployment failed with “Exposed secrets detected.”**
  Submit IndexNow after deployment because titles/content changed.
- **Gold-page follow-up before cosmetic home work:** Aug 19–28 → Aug 29–Sep 7,
  exact `/gold-services` was 60→68 impressions and position 12.2→20.4. Shared
  brand/antique queries were stable; `estate jewelry naples fl` worsened 10→22.1.
  With exact page + U.S. + that query, desktop was 6→7 impressions, 9.3→22.1;
  mobile 2→0, 12→missing, not rank 0. All clicks 0. New weak-position queries
  worsen the exposed mix, but its 34→43 impressions do not reconcile 60→68.
  Other-URL inspection found estate page 10→18.3 and no diamond page among 15
  exposed rows. After deployment, repeat identical page/query/country/device
  scopes; no observed diamond-page replacement. The limited three-file follow-up
  above is implemented; its effect on rankings or qualified calls is unmeasured.
  Inspect live/indexed gold and estate URLs, request Google recrawl once as needed,
  and assess roughly two-/four-week windows plus qualified calls. These are
  planning checkpoints; no automation or recovery deadline was set.
- Recheck all four revised GBP services: saved **Pending review**. Description
  accepted and number-free Update published. Jewelry buyer primary is unchanged;
  secondary Diamond buyer removal accepted.
- ✅ Yelp Diamond Buyers category removal **confirmed 2026-09-10 (night)**: Business
  Information, the ad preview and the public page all list only Gold Buyers, Jewelry.
- Measure qualified calls after the changes. OpenAI seller contexts/ad copy
  and `/sell/naples` landing reloaded/verified, still Serving with 14 Naples ZIPs
  and $25/day. No conversion setup or measured lead-quality lift established.
- Satellite source is absent from this project. Gold-satellite appointment copy
  remains unresolved until its actual source/workspace is available.
- **Later, explicitly deferred by the owner — no outreach or review requests now:**
  investigate/recover missing Google reviews using evidence and Google's support
  process; invite honest reviews from genuine customers without incentives or
  selective positive-review requests; pursue legitimate local business mentions
  and relevant links. Reassess these after deployment, separate from this batch.
- ✅ (superseded 2026-09-13) The **320×660 homepage H1/newsletter overlap** turned
  out to be height-driven and site-wide on short windows; fixed by the headline
  fit (top item). 320×568 and 375×552 still overlap at the type floor — see there.

Latest checks after the three-file follow-up, from `next-app/`:
`npm test -- --maxWorkers=4` — **1276/1276 tests, 130 files, 18.24s**;
`npx tsc --noEmit`, `npm run lint`, `npm run build` — pass after the final
estate-card responsive fix. `npm audit --omit=dev` — **0 vulnerabilities**;
dependencies unchanged in this follow-up. Final manifest **86 = 40 EN + 40 ES + 6**.
EN/ES at 320, 768, 1024 and 1920px checked; all four new localized links reach
the correct destinations and estate phone buttons remain reachable. No calls made.

✅ Yelp saved/rechecked: 11 boosted terms (including gold jewelry/silver/sterling/
flatware; Sell Diamonds boost removed), seven irrelevant exclusions, seller-led
ad and automatically mirrored Specialties, “Call daily, 9 AM–6 PM / Call for
details” CTA, and Get more phone calls with Free call reporting **unchecked**.
$15/day and 15-mile radius unchanged; no forwarding numbers activated. Screenshot
confirmed correct CTA number; initial AX/DOM output omitted its value. Actual
outbound dialing remains untested. Full record: `SEO_LEAD_AUDIT.md`, implementation.

**Initial audit context (before the authorized targeting change):**

Evidence and ordered next steps: `SEO_LEAD_AUDIT.md`. No proven single cause;
main Google clicks rose 33→46 and GBP interactions stayed 41→41 in comparable
ten-day periods. Reconstruct answered/missed calls, time/material/source and
quality; check 9 AM phone screening/forwarding and local availability signals.
OpenAI campaign was national and had no conversions; the initial Yelp keyword
set lacked silver/sterling/flatware. Its apparent blank phone field was later
resolved as an AX/DOM omission, not an empty destination. Gold satellite retains appointment-only
copy; Google sterling post is rejected. Review these after the audit, without
bundling speculative code/category/budget changes. Owner says today's opening
date change is not the cause and the Google review loss followed the slowdown.
Yelp review presence is longstanding; recommendation-status timing unknown.
The 09-08 “root cause” assertion and interaction-as-call inference are withdrawn.
Read-only Bing check completed: gold/silver indexed; no useful historical AI
baseline. No indexing requests, test submissions, calls or settings saves made.
Those statements describe the initial read-only phase. The implementation above
now supersedes its pending proposals. Staging was subsequently synced; see record below.

### ✅ DEPLOYED 2026-09-10 (evening) — shop gallery "Newest arrivals" sort + homepage hero "New Arrivals →" link — owner-verified

Owner: "pushed and deployed successfully, update docs, no live verification
needed." No probe run. **Staging equals source; nothing is in flight.**
The block below is the pre-deploy record.

**Staging (session close 09-10 evening):** ✅ synced 2026-09-10 (evening) — dry run listed exactly the 3 flipped docs (CHANGELOG, CURRENT_STATUS, TASKS), 0 Extras, 1074 total; real run copied 3 / 0 FAILED; follow-up dry run 0/0/0; leak check 0 `.env*`; CHANGELOG hash MATCH. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

### (pre-deploy record) 🟡 STAGED 2026-09-10 (later) — shop gallery "Newest arrivals" sort + homepage hero "New Arrivals →" link (no SQL, no env vars)

Five files: `ShopSortSelect.tsx` (option), `shop-filter-state.ts`
(`VALID_SORTS`), `shop-page-renderer.tsx` (`created_at` column + comparator),
`shop-filter-state.test.ts`, and `components/home/HomeHeroOverlay.tsx` (the
text link under the trio — Option C from the mockup; the trio itself is
unchanged). Dev-verified: `/shop?sort=newest` order matches the DB's
`created_at desc` (#137 first); the hero link is centred under Visit Us at
935 / 375 / 320 px, single line (0.85rem desktop / 0.78rem phone after the
owner's "tiny bit bigger"), and links `/shop?sort=newest` (EN) /
`/es/shop?sort=newest` (ES). Gate tsc 0 · lint 0 · 1276/1276 (130 files) · build exit 0 (86 routes = 40 EN + 40 ES + 6). Bundle any follow-up into the
same push (owner pays per deploy). After the push, a spot check is enough:
open `naplesestatejewelry.com`, tap "New Arrivals →" under the hero buttons —
the shop should open with Sort = "Newest arrivals" and the newest inventory
number leading.

**Staging:** ✅ synced 2026-09-10 (later) — dry run listed exactly the 8 touched files (shop-page-renderer.tsx, ShopSortSelect.tsx, shop-filter-state.ts, shop-filter-state.test.ts + CHANGELOG, CURRENT_STATUS, DECISIONS, TASKS), 0 Extras, 1074 total; real run copied 8 / 0 FAILED; follow-up dry run 0/0/0; leak check 0 `.env*`; SHA256 MATCH on the renderer, the sort select, the filter-state lib and CHANGELOG. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

**Staging (hero link):** ✅ synced 2026-09-10 (later still) — dry run listed exactly the 5 touched files (HomeHeroOverlay.tsx + CHANGELOG, CURRENT_STATUS, DECISIONS, TASKS), 0 Extras, 1074 total; real run copied 5 / 0 FAILED; follow-up dry run 0/0/0; leak check 0 `.env*`; SHA256 MATCH on HomeHeroOverlay.tsx, CHANGELOG, DECISIONS. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

**Staging (size bump):** ✅ synced 2026-09-10 (later still, 2) — dry run listed exactly the 4 touched files (HomeHeroOverlay.tsx + CHANGELOG, DECISIONS, TASKS), 0 Extras, 1074 total; real run copied 4 / 0 FAILED; follow-up dry run 0/0/0; leak check 0 `.env*`; SHA256 MATCH on HomeHeroOverlay.tsx and CHANGELOG. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

### ✅ DEPLOYED 2026-09-10 — photo-upload hotfix (production 502 "SharedArrayBuffer is not allowed") — owner-verified

Owner: "fix was successful, deployed successfully and tested … no live
verification needed." No probe run. Fix = `toOwnedBuffer()` in
`lib/product-image-encode.ts` (sharp's Netlify output is SAB-backed;
supabase-js refuses it; does not reproduce locally — production-only
verification, done by the owner). **Staging equals source; nothing is in
flight.**

**Staging (session close 09-10):** ✅ synced 2026-09-10 — dry run listed exactly the 3 flipped docs (CHANGELOG, CURRENT_STATUS, TASKS), 0 Extras, 1074 total; real run copied 3 / 0 FAILED; follow-up dry run 0/0/0; leak check 0 `.env*`; CHANGELOG hash MATCH. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

**Staging (hotfix):** ✅ synced 2026-09-09 (night) — dry run listed exactly the 5 touched files (product-image-encode.ts, product-image-encode.test.ts + CHANGELOG, CURRENT_STATUS, TASKS), 0 Extras, 1074 total; real run copied 5 / 0 FAILED; leak check 0 `.env*`; SHA256 MATCH on the encode lib, its test, CHANGELOG. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

### ✅ DEPLOYED 2026-09-09/10 — Smart Listing Assistant rebuilt (fill-the-form, 50 s timeout) + server-side WebP uploads — owner-verified 09-10

No SQL, no env vars. What changed and why: `CHANGELOG.md` 2026-09-09
(three entries). Still open from this work, owner's timing:
- ✅ Phone photo size — every photo is now encoded to WebP on the server
  and the assistant shrinks its copies to 1600px WebP (owner-verified
  09-10).
- ◻ **Optional, only if Storage cost ever matters — convert the existing
  46 PNG + ~42 JPEG originals to WebP.** Deliberately NOT done: shoppers
  already get WebP/AVIF via the Netlify Image CDN, so it changes nothing
  they see, and it would mint new URLs for every affected product
  (`images`/`image_urls`, cache keys, GC reference set, marketplace/social
  rows). If wanted: a dry-run-first script using `encodeProductImageToWebp`,
  old objects left until the GC's reference scan clears them.
- ◻ Optional cleanup later: `/api/admin/ai-speech` + `lib/ai-speech.ts` are
  now uncalled (read-aloud removed). Left in place in case the owner wants
  the voice back; delete only on request.

**Staging (WebP encode batch):** ✅ synced 2026-09-09 (later) — dry run listed exactly the 9 touched files (product-images/route.ts NEW, product-image-encode.ts NEW, product-image-encode.test.ts NEW, AdminShell.tsx, ai-product-provider.ts + CHANGELOG, CURRENT_STATUS, STRUCTURE, TASKS), 0 Extras, 1074 total (= 1071 + the 3 new files); real run copied 9 / 0 FAILED; follow-up dry run 0/0/0; leak check 0 `.env*`; SHA256 MATCH on encode lib, route, AdminShell, provider, CHANGELOG. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

**Staging (assistant batch):** ✅ synced 2026-09-09 — dry run listed exactly the 11 touched files (route.ts, AdminShell.tsx, ai-product-provider.ts, ai-product-schema.ts, ai-product-schema.test.ts + ARCHITECTURE, CHANGELOG, CURRENT_STATUS, DECISIONS, TASKS, features/shop-listings.md), 0 Extras, 1071 total (no new files, no strays); real run copied 11 / 0 FAILED (robocopy exit 1 = copied only); follow-up dry run 0/0/0; leak check 0 `.env*`; SHA256 MATCH on AdminShell, provider, schema, route, CHANGELOG. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

### ◻ CONSOLIDATED at session end 2026-09-08 — everything outstanding, in one place (nothing is in flight; staging equals source)

**Owner-only, from the gold/silver plan (do in this order):**
1. ◻ Paste into the Google Business Profile **description**: "Calls and
   appointments answered 9 AM to 6 PM, seven days a week." — no phone
   number in that text; the main hours stay the showroom's (Option C).
2. ◻ Ask every gold/silver seller for a Google review that **names what
   they sold** (`naplesestatejewelry.com/review`; the card's gold button).
3. ◻ Add gold-testing / flatware buying **photos** to the profile.
4. ◻ For 30 days, **ask callers where they found us** (GBP hides low-volume
   search terms — this is the only attribution).

**Search Console / Bing — nothing is OWED right now.** `/reviews` was
requested 09-08 ("Indexing requested"); `/es/reviews` was already indexed;
IndexNow 200 for 212 URLs the same night. Dated look-backs:
- ✅ **2026-09-10 — Bing Webmaster Tools rechecked read-only:** 31 indexed
  in Site Explorer; gold/silver URL inspections both indexed successfully.
  AI report exposes no pre-decline baseline. Details: `SEO_LEAD_AUDIT.md`.
- ◻ **mid-Sept — GSC Enhancements → Breadcrumbs** report (the 55 pages
  with BreadcrumbList since 09-02) and **GSC Pages**: `/reviews` indexed
  yet? `/silver-services` still ~pos 9 (the nearest lander to page 1)?
  `/gold-services` (pos 24) moving after the FAQ + phone description?
- ◻ **~2026-09-20 — GSC validations** started 09-06: "Page with redirect"
  (the `/en/…` 307→308) and "Blocked by robots.txt" (`/account`).
- ◻ **monthly — GBP Performance → Calls plus actual phone log:** Sept 10
  read shows August 2 call-button clicks, 78 interactions; September 1 call
  click, 24 interactions. Neither measures completed calls or material mix.
  Older August 71 was an earlier interaction snapshot, not 71 calls.
- ◻ **Optional, quota permitting (10/day):** the landers changed content
  today without new URLs — a GSC "Request indexing" on `/gold-services`,
  `/silver-services` (EN + ES) nudges the recrawl, and
  `npm run indexnow -- --urls=/gold-services,/silver-services,/es/gold-services,/es/silver-services`
  (run from **PowerShell**, not Git Bash — MSYS rewrites the leading `/`;
  memory `session-tooling-gotchas`). Not required: the sitemap and normal
  recrawl cover it.

**Also parked (owner's timing):** pg_cron overlap cleanup + the admin "last
sweep ran N min ago" line (see the 09-09 02:49Z CHANGELOG entry — the
pushes were confirmed on the minute, so the overlap window is closed);
inbound marketplace-sale detection proposal; the /free-evaluation bench
photo; GBP "Google updates (1)" pending on the profile (review it — it may
be a user-suggested edit, which is exactly what inaccurate hours attract).

### ✅ DEPLOYED 2026-09-08 (late night) — storefront photo on four surfaces + centred homepage Visit Us with photo/map pair (production-verified)

Owner: "pushed and deployed, verify it live." Verified: all six showroom
surfaces (EN + ES) render `showroom-storefront.webp` with the alt text,
`/sell/fort-myers` does not, `/` has one `#visit-us` and two square tiles,
the asset and its optimized rendition serve as `image/webp`, smoke 200s,
`/review` 302. Detail: `CHANGELOG.md` 2026-09-08 (late night, deployed).
Gate tsc 0 · lint 0 · **1271/1271 (129 files)** · build exit 0.

**Staging (session close):** ✅ synced 2026-09-08 (late night, post-deploy) — dry run listed exactly the 3 flipped docs (CHANGELOG, CURRENT_STATUS, TASKS), 0 Extras; real run copied 3; follow-up dry run 0/0/0; leak check 0; CHANGELOG hash MATCH. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

**Staging (storefront photo):** ✅ synced 2026-09-08 (late night) — dry run listed exactly the 13 touched files (showroom-storefront.webp NEW, StorefrontPhoto.tsx NEW, storefront-photo.test.ts NEW; (home)/page.tsx, card, sell/[city], VisitUsPanel.tsx, ShowroomMap.tsx (timestamp only — the 4:3 option was added and reverted) + CHANGELOG, CURRENT_STATUS, DECISIONS, STRUCTURE, TASKS), 0 Extras; real run copied 13 / 0 FAILED; follow-up dry run 0/0/0; leak check 0; SHA256 MATCH on the photo, StorefrontPhoto, home page, CHANGELOG. The CHANGELOG also carries a 2026-09-09 02:49Z pg_cron entry written by a parallel session — it travelled too. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

### ✅ PLAN 2026-09-08 — bring gold + silver calls up to par with diamonds — every site-side item DEPLOYED + production-verified; ◻ four owner-only items remain

Owner: "pushed and deployed, verify it live" (night). Verified: FAQ schema
on gold + silver (6 Q each), all five buy-side descriptions ≤157 with the
phone last, the phone-hours line on `/card` + Visit Us + `/spot-prices`,
`contactPoint` in the schema, call buttons in both heroes, old buttons
gone; smoke 200s, `/review` 302. Detail: `CHANGELOG.md` 2026-09-08 (night,
deployed). **Staging equals source; nothing in flight.**

◻ **Owner-only, in this order:** (1) paste into the GBP description:
"Calls and appointments answered 9 AM to 6 PM, seven days a week." (no
phone number in that text; main hours stay the showroom's); (2) ask every
gold/silver seller for a Google review that names what they sold
(`naplesestatejewelry.com/review`); (3) add gold-testing / flatware
buying photos to the profile; (4) for 30 days ask callers where they found
us. Then read GBP Performance → Calls and the GSC silver lander (pos 9.1)
at the mid-September look.

**Staging (deploy record):** ✅ synced 2026-09-08 (night, post-deploy) — dry run listed exactly the 3 flipped docs (CHANGELOG, CURRENT_STATUS, TASKS), 0 Extras; real run copied 3; follow-up dry run 0/0/0; leak check 0; CHANGELOG hash MATCH. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

**Status after the build pass (same night, pre-deploy record):**
- ✅ **Item 1 verified read-only:** categories = Jewelry buyer (primary),
  Coin dealer, **Gold dealer**, Diamond buyer, Jewelry store, Estate
  liquidator, Jewelry appraiser. Nothing to add; primary left alone.
- ◻ **Item 2 (hours) — owner decision:** GBP lists Mon–Fri 11–3, Sat 11–4.
  Only extend if calls are genuinely answered outside those hours.
- ◻ **Item 3 (reviews that name the metal) — owner:** suggested ask, at
  the counter after a gold/silver purchase: "Would you leave us a quick
  Google review? Mentioning what you sold — the gold chain, the flatware —
  helps other sellers find us." Link = naplesestatejewelry.com/review (the
  card's gold button does the same).
- ✅ **Item 4 verified read-only:** services exist for gold and silver under
  Jewelry buyer / Coin dealer / Gold dealer (Gold jewelry buying, Sterling
  silver buying, Scrap gold buying, Dental gold buying, Gold coin & bullion
  buying, Gold & silver coin buying, Bullion buying). **Diamond buyer has no
  services** (fine). Service descriptions not opened (overlay freezes the
  tab); ◻ owner may add buying photos (gold testing, flatware) — GBP-side.
- 🟡 **Item 6 BUILT + STAGED:** FAQ schema + accordion + phone-in-description
  on `/gold-services` and `/silver-services` — see `CHANGELOG.md` 2026-09-08
  (night, FAQ). Rides with the next push. After the deploy: curl both pages
  for `"@type":"FAQPage"` and the phone in `<meta name="description">`.
- 🟡 **Item 7 (call CTA in heroes / spot-prices) + the phone-hours line —
  BUILT + STAGED 2026-09-08 (night, latest)** on the owner's word ("change
  9am-8pm to 9am-6pm and build them all as you recommend"): `PHONE_HOURS`
  constant 09:00–18:00 in `business-location.ts`; the line on `/card`, the
  homepage Visit Us block and `/spot-prices`; `contactPoint` in the site
  schema; call buttons in the gold and silver heroes; footer left alone.
  Detail: `CHANGELOG.md` 2026-09-08 (night, latest). Rides with the push.
  **Option C, owner's half — ◻ paste into the GBP description:** "Calls and
  appointments answered 9 AM to 6 PM, seven days a week." (no phone number
  in that text). GBP main hours stay the showroom's.
  After the deploy: `/card` shows the phone line; `/` HTML contains
  `"contactPoint"`; `/gold-services` hero shows CALL (239) 404-8505.

**Staging (Option C build):** ✅ synced 2026-09-08 (night, latest) — dry run listed exactly the 13 touched files (phone-hours.test.ts NEW; business-location.ts, layout.tsx, (home)/page.tsx, card, gold-services, silver-services, spot-prices pages + CHANGELOG, CURRENT_STATUS, DECISIONS, STRUCTURE, TASKS), 0 Extras; real run copied 13 / 0 FAILED; follow-up dry run 0/0/0; leak check 0; SHA256 MATCH on business-location, card, home, layout, CHANGELOG. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.
- 🟡 **Also STAGED the same night:** diamond / watch / appraisal meta
  descriptions trimmed to ≤ 155 with the phone last (watch had NO phone);
  all five landers now guarded (ends with phone, ≤ 160).

**Staging (description trims):** ✅ synced 2026-09-08 (night, later) — dry run listed exactly the 8 touched files (diamond-buyers, watch-buyers, jewelry-appraisal pages, service-landers-faq.test.ts + CHANGELOG, CURRENT_STATUS, DECISIONS, TASKS), 0 Extras; real run copied 8 / 0 FAILED; follow-up dry run 0/0/0; leak check 0; SHA256 MATCH on diamond, watch, CHANGELOG. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.
- ◻ **Measure:** owner asks callers where they found us for 30 days.

**Staging (item 3 build):** ✅ synced 2026-09-08 (night) — dry run listed exactly the 9 touched files (FaqSection.tsx NEW, service-landers-faq.test.ts NEW, gold-services/page.tsx, silver-services/page.tsx + CHANGELOG, CURRENT_STATUS, DECISIONS, STRUCTURE, TASKS), 0 Extras; real run copied 9 / 0 FAILED; follow-up dry run 0/0/0; leak check 0; SHA256 MATCH on FaqSection, both pages, CHANGELOG. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

Original plan text follows.

Owner: "just in the past few weeks I've noticed more diamond activity, so
it must've been something we did relatively recently." Findings +
evidence: `CHANGELOG.md` 2026-09-08 (night, investigation) and the
research addendum right after it. **Root cause, high confidence: the
Google Business Profile's local-pack eligibility.** The profile was
rebuilt on 08-30 (7 categories incl. "Diamond buyer", 18 services,
booking link); its interactions went Jul 3 → Aug 71. Live SERP checks
(owner's Chrome, Naples): we ARE in the 3-pack for "sell diamond ring
naples fl", "jewelry buyer naples fl", "sell jewelry naples fl" and
"silver buyers naples fl" — every pack made of "Jewelry buyer" listings —
and we are NOT in the pack for "sell gold naples fl" (Park Shore Coin, The
Gold Center = "Gold dealer", Covenant), nor in its organic top 8. "sell
sterling silver naples fl" shows NO pack; organically we are #2 (homepage)
behind naplesjewelrybuyers.com. The website is not the diamond driver:
organic search gave 0 diamond clicks in 3 months and the site's own leads
are GOLD (3 real free-evaluation requests, all gold; 11 product-interest
clicks, all gold items). Primary category is the #1 pack factor (Whitespark
2026); there is NO "silver" GBP category at all; "Gold dealer" exists and
is what wins gold packs.

**Do first — GBP, owner-only, no code (the lever that actually moves calls):**
1. ◻ **Verify the secondary categories** in Business Profile Manager: "Gold
   dealer" and "Coin dealer" must be present (recorded 08-30 via their
   services; confirm). ⛔ Do NOT switch the primary from "Jewelry buyer" to
   "Gold dealer": that trades the diamond/jewelry/silver packs we now hold
   (#3–4 behind Covenant 183 reviews / Naples Jewelry Buyers 39) for a gold
   pack owned by 63–80-review gold dealers — likely a net loss. Revisit only
   if gold is the business priority AND reviews have doubled.
2. ◻ **Hours are a ranking factor now** ("open at time of search" = #5,
   Whitespark 2026). Every pack showed us "Closed · Opens 11 AM" beside
   competitors opening 9–10 AM. If the owner truly answers 9–11 and 3–5 by
   phone/appointment, list those as hours (or add "by appointment" hours);
   if not, leave it — never list hours nobody answers.
3. ◻ **Reviews that say gold/silver.** We have 18 GBP reviews (competitors
   39–183); the pack quotes review text matching the query ("Brought in a
   few gold rings…" is how Covenant wins gold snippets). Of our 22 quoted
   reviews only 3 mention gold, 4 silver, 0 diamond. Ask every gold/silver
   seller for a review and ask them to say what they sold (the /review link
   and the card's gold button already exist).
4. ◻ **Services + photos:** confirm "Gold jewelry buying" and "Sterling
   silver buying" service descriptions carry the words people search
   (scrap gold, 14k, flatware, tea set); add gold-testing / flatware buying
   photos. GBP posts stay the owner's call — the 08-30 post was REJECTED
   and the owner said "do not post" (`CHANGELOG.md` 09-03 late).
5. ⛔ Do not add "gold" to the business NAME on GBP (keywords-in-title is a
   ranking factor but a policy violation that gets listings suspended).

**Then — website parity (small code, no design change, no mockup):**
6. ◻ FAQPage schema on `/gold-services` + `/silver-services` (the
   diamond/watch/appraisal pages have it; silver already has FAQ copy),
   and "Call (239) 404-8505" in both meta descriptions.

**Optional — website CTA (visible → mockup first; weaker evidence):**
7. ◻ A call button in the gold/silver heroes (today both buttons go to the
   form) and a "call for today's offer" line on `/spot-prices`. Downgraded:
   the web funnel already produces gold leads; the bottleneck is the pack.

**Measure (30 days):** ◻ ask every caller where they found us (GBP hides
low-volume search terms, so this is the only attribution); ◻ GBP
Performance → Calls monthly; ◻ GSC: `/silver-services` (pos 9.1) and the
near-page-1 gold queries ("gold buyers near me" 7.7, "sell gold near me"
8.0) at the mid-September look. Price-transparency effect (`/spot-prices`
lets gold/silver sellers self-serve) stays a plausible, unproven factor.

**Staging (plan record):** ✅ synced 2026-09-08 (night) — dry run listed exactly the 3 touched docs (CHANGELOG, CURRENT_STATUS, TASKS), 0 Extras; real run copied 3; follow-up dry run 0/0/0; leak check 0; CHANGELOG hash MATCH. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

**Staging (investigation record):** ✅ synced 2026-09-08 (night) — dry run listed exactly the 3 touched docs (CHANGELOG, CURRENT_STATUS, TASKS), 0 Extras; real run copied 3; follow-up dry run 0/0/0; leak check 0; CHANGELOG hash MATCH. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

### ✅ DEPLOYED 2026-09-08 (late) — locale-switch fade fix + `/reviews` count removal (production-verified)

Owner: "pushed and deployed, verify it live, if all is good, update docs and
end session." Verified (detail in `CHANGELOG.md` 2026-09-08 late): pages
200, count gone in EN + ES, deployed chunk carries the exemption, and in
the owner's Chrome on production three switches counted 0 `pending`
stamps while a real page change still faded. Staging equals source;
nothing in flight. **The GSC requests + IndexNow were then settled the
same night (item below) — nothing left from today.**

**Staging (deploy record):** ✅ synced 2026-09-08 (late, post-deploy) — dry run listed exactly the 3 flipped docs (CHANGELOG, CURRENT_STATUS, TASKS), 0 Extras; real run copied 3; follow-up dry run 0/0/0; leak check 0; CHANGELOG hash MATCH. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

The block below is the pre-deploy record.

### (pre-deploy record) 🟡 STAGED 2026-09-08 (late) — language switch keeps its text, drops the entrance fade (`CustomerReveal`) + `/reviews` count removed

Owner: the EN↔ES toggle on `/card` "flash reload" is back → traced to the
site-wide entrance fade replaying on the remounted page, not a reload;
fixed for every locale-only navigation sitewide. Also: no review count on
`/reviews` (intro + meta, EN + ES). Detail + the three timing traps:
`CHANGELOG.md` 2026-09-08 (late). Files: `components/layout/CustomerReveal.tsx`,
`lib/__tests__/customer-reveal-locale-switch.test.ts` (NEW),
`[locale]/reviews/page.tsx`. Gate: `tsc` 0 · lint 0 · **1252/1252 (126
files)** · build exit 0 (481 static pages) · dev-verified (0 `pending`
stamps on four switches, fade intact on a real page change).

◻ **Owner — push** (bundle with anything else pending at your call). After
the deploy, on the phone: `/card` → Español → English — the text swaps, no
fade; `/reviews` intro has no number. Tell me "verify it live" for the curl
checks (`/reviews` HTML must contain 0 "22 Google").
◻ **Then the two GSC indexing requests + IndexNow** from the item below.

**Staging:** ✅ synced 2026-09-08 (late) — dry run listed exactly the 8 touched files (CustomerReveal.tsx, reviews/page.tsx, customer-reveal-locale-switch.test.ts NEW + CHANGELOG, CURRENT_STATUS, DECISIONS, STRUCTURE, TASKS), 0 Extras; real run copied 8 / 0 FAILED; follow-up dry run 0/0/0; leak check 0; SHA256 MATCH on CustomerReveal.tsx, reviews page, CHANGELOG. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

### ✅ DEPLOYED 2026-09-08 (evening) — `/card` reviews button + `/reviews` page (production-verified) — ◻ GSC indexing requests owed

Owner: "pushed and deployed, verify it live." Verified (detail in
`CHANGELOG.md` 2026-09-08 evening): `/reviews`, `/es/reviews`, `/card`,
`/es/card` → 200 with the new content; `/review` → 302 unchanged;
`/sitemap.xml` 212 URLs with both new ones and 0 `/card`; About menu +
footer links live; homepage band intact. Staging equals source; nothing in
flight.

✅ **GSC + IndexNow SETTLED 2026-09-08 (owner: "do the google search
console tasks and the indexnow run, chrome is open"):** `/reviews` was
"Discovered – currently not indexed" → REQUEST INDEXING → **"Indexing
requested"**; `/es/reviews` was **already "URL is on Google · Page is
indexed"** → no request made (no quota spent). `npm run indexnow` → **200
OK for 212 URLs**. Method: memory `gsc-url-inspection-method` (worked
again, coordinate click at (1112, 260)). Nothing owed.

**Staging (GSC record):** ✅ synced 2026-09-08 (night) — dry run listed exactly the 3 touched docs (CHANGELOG, CURRENT_STATUS, TASKS), 0 Extras; real run copied 3; follow-up dry run 0/0/0; leak check 0; CHANGELOG hash MATCH. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

**Staging (deploy record):** ✅ synced 2026-09-08 (evening, post-deploy) — dry run listed exactly the 3 flipped docs (CHANGELOG, CURRENT_STATUS, TASKS), 0 Extras; real run copied 3; follow-up dry run 0/0/0; leak check 0; CHANGELOG hash MATCH. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

The block below is the pre-deploy record.

### (pre-deploy record) 🟡 STAGED 2026-09-08 (evening) — `/card` "Read Our Reviews" + "View Full Website & Shop", NEW `/reviews` page

Built on the owner's word ("Option A, those labels, build the /reviews
page, speech bubbles"). Detail: `CHANGELOG.md` 2026-09-08 (evening). Files:
`[locale]/card/page.tsx`, `[locale]/reviews/page.tsx` (NEW),
`components/home/TestimonialCard.tsx` (NEW, extracted from
`TestimonialsSection.tsx`), `AppIcon.tsx` (`forum`), `globals.css`
(`.reviews-grid`), `sitemap.ts`, `proxy.ts` (`review$`),
`SiteHeader.tsx`, `SiteFooter.tsx`, `messages/en.json` + `es.json`,
`lib/__tests__/reviews-page.test.ts` (NEW). Gate: `tsc` 0 · lint 0 ·
**1249/1249 (125 files)** · build exit 0 (481 static pages) · dev-verified
(routes, 302s, sitemap, links, screenshots at 375 + desktop, console 0).

◻ **Owner (optional): eyeball on the dev server** — `/card` (new pill under
the gold one, new bottom label; tap Español for the short label) and
`/reviews` (phone: one column, full quotes; desktop: two columns; bottom
buttons open Google in a new tab).
◻ **Owner — push.** Bundle at your discretion with the pg_cron overlap
cleanup below (one deploy). After the deploy: `curl -sI
https://naplesestatejewelry.com/reviews` → 200, `/es/reviews` → 200,
`/review` → 302, `/card` HTML contains `Read Our Reviews`.
◻ **After the deploy — GSC:** request indexing for
`https://naplesestatejewelry.com/reviews` and `/es/reviews` (the only
driving method that works is in memory `gsc-url-inspection-method`), then
`npm run indexnow` from `next-app/`. Two requests owed once live.

**Staging:** ✅ synced 2026-09-08 (evening) — dry run listed exactly the 18 touched files (reviews/page.tsx NEW, TestimonialCard.tsx NEW, reviews-page.test.ts NEW, card/page.tsx, TestimonialsSection.tsx, AppIcon.tsx, globals.css, sitemap.ts, proxy.ts, SiteHeader.tsx, SiteFooter.tsx, en.json, es.json + CHANGELOG, CURRENT_STATUS, DECISIONS, STRUCTURE, TASKS), 0 Extras; real run copied 18 / 0 FAILED; follow-up dry run 0/0/0; leak check 0 `.env*`; positive control 206 `.tsx`; SHA256 MATCH on reviews page, card page, TestimonialCard, proxy.ts, CHANGELOG. 1061 files on disk (robocopy 1064 = the documented 3 `/XF`-excluded). Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

### ✅ 2026-09-09 02:49Z — price pushes CONFIRMED on the minute; pg_cron overlap window CLOSED → ◻ cleanup batch is next (owner's timing)

Owner pinged; read-only check (nothing changed — another agent had worked on
the project in between). 09-08 `scheduled_price_push`: **Etsy 11:15:04Z**
(ok, 1 pushed / 72 unchanged) and **eBay 11:45:04Z** (ok, 0 / 70) = pg_cron;
GitHub's overlap duplicates at 15:03:40Z / 15:17:52Z (ok, 0 pushed —
harmless). Sweeps: every `:00`/`:30` boundary from 09-08 00:00Z through
09-09 02:30Z present on both channels (**54 of 54**, all ok; 8 off-minute
rows = GitHub stragglers). Every one of the eight `nej-*` jobs has now been
seen firing on schedule.

◻ **Next batch (one push, owner's timing) — the cleanup below** (the
"if both landed" branch): delete the `schedule:` block from
`.github/workflows/scheduled-jobs.yml` (keep `workflow_dispatch`; rewrite
the header), delete `next-app/netlify/functions/*.mts` (5), fix the
"Netlify function log" copy in `ARCHITECTURE.md` / `DECISIONS.md` / Admin
Settings (`resolvePricePushHealth`), and build the admin "last sweep ran N
min ago" line (mockup first). Then the usual gate.

**Staging (price-push confirmation):** ✅ synced 2026-09-09 02:5xZ — dry run listed the 3 touched docs (CHANGELOG, CURRENT_STATUS, TASKS) plus ONE unexpected new file, `next-app/public/assets/images/pages/showroom-storefront.webp` (360 KB, written 09-08 22:42 local, referenced by nothing in code or docs — not this session's work); synced with that file EXCLUDED (`/XF showroom-storefront.webp`) pending the owner's word; real run copied 3; follow-up dry run 0/0/0; image confirmed ABSENT on staging; leak check 0; CHANGELOG hash MATCH. ⚠️ The next sync WITHOUT that exclusion will copy the image — decide first whether it belongs in the repo. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

### (record) ◻ 2026-09-08 (after 7:45 a.m. Eastern / 11:45Z) — FIRST THING: read the two price-push rows, then decide the pg_cron overlap cleanup

The last unobserved pg_cron jobs are the two daily price pushes. The owner
will ping after they are due; do this read-only check (service key, from
`next-app/`), nothing else first:

1. `etsy_sync_log` / `ebay_sync_log`, action `scheduled_price_push`, rows
   dated 2026-09-08. **Expect** one row at **11:15:0xZ (Etsy)** and one at
   **11:45:0xZ (eBay)** — seconds after the minute = pg_cron. A SECOND row
   per channel minutes-to-hours later is GitHub's overlap copy (expected
   until the cleanup; harmless — it finds prices unchanged). Pattern to
   run: the `cron-check.mjs` shape in memory
   `github-cron-degraded-2026-08-27` (per-day rows with HH:MM + outcome).
2. `reconcile_status` rows per channel since 00:00Z → every `:00`/`:30`
   boundary present (the overnight cadence held).
3. Netlify function log / `net._http_response` are NOT needed — the log
   rows are the proof.

**If both pushes landed on the minute → the overlap window is CLOSED.**
Next batch (one push, owner's timing): delete the `schedule:` block from
`.github/workflows/scheduled-jobs.yml` (keep `workflow_dispatch`; rewrite
the header), delete `next-app/netlify/functions/*.mts` (5 files), fix the
"Netlify function log" copy in `ARCHITECTURE.md` / `DECISIONS.md` / Admin
Settings (`resolvePricePushHealth`), and build the admin "last sweep ran N
min ago" line (mockup first — it is a visible admin change). Then
`npm run build` and the usual gate.

**If either push is missing or late →** do NOT remove anything; read
`cron.job_run_details` for the job (`nej-etsy-price-push` /
`nej-ebay-price-push`) in the Supabase dashboard → Integrations → Cron,
and `net._http_response` if within 6 h, and report before deciding.

### ✅ DEPLOYED 2026-09-08 — lead-form Location + Preferred-contact fields + Netlify stub deletion (production-verified)

Owner: "pushed and deployed, verify it live." Verified: all five form pages
200 with the fields on exactly the right forms (EN + ES), Spanish labels
present, `/netlify-forms.html` 404, and the API's Email-without-address
check answers 400 on production. Staging equals source; nothing in flight.
The leftover test inquiry is GONE (0 rows named TEST delete me — owner
deleted it). On the next real submission glance at Admin → Inquiries for
the chips. The
block below is the pre-deploy record.

### (pre-deploy record) 🔴 STAGED 2026-09-08 — lead-form Location + Preferred-contact fields — ⚠️ SQL TO RUN FIRST, then one test submission, then push

Built on the owner's approval (option A, note kept, all required). Detail:
`CHANGELOG.md` 2026-09-08. Gate: `tsc` 0 · lint 0 · **1243/1243 (124 files)**
· build exit 0 · dev-verified in the pane (reveal, pills, Email-needs-email
error) + SSR on all four form pages.

✅ **1. SQL RUN by the owner 2026-09-08** (verify query: 3 columns, nullable).
✅ **2. End-to-end test submission VERIFIED 2026-09-08 00:12Z** — `inquiries`
row had all three columns populated, message-center body had both lines
(detail in `CHANGELOG.md` 2026-09-08). Notification row deleted.
◻ **2b. Owner — delete the leftover test inquiry** (the service role has no
DELETE grant on `inquiries`; nothing in the app can delete one either). In
the SQL editor:
`delete from public.inquiries where name = 'TEST delete me';` → expect 1
row. Also: the owner's inbox should hold "New inquiry: Free Evaluation
Request · prefers Email · Outside Southwest Florida — Sarasota, FL" and a
customer confirmation addressed to the owner's own address (the test used
it as the sender email) — both can be deleted.
◻ **3. Owner — push.** Bundle: this + the `netlify-forms.html` deletion +
(optionally) the pg_cron overlap cleanup. After the deploy: open
`/free-evaluation`, pick "Outside Southwest Florida" and watch the city line
+ note appear; on the next real submission open Admin → Inquiries and look
for the chips.

**Staging (deploy record):** ✅ synced 2026-09-08 — dry run listed exactly the 3 touched docs (CHANGELOG, CURRENT_STATUS, TASKS), 0 Extras; real run copied 3; follow-up dry run 0/0/0; leak check 0; CHANGELOG hash MATCH. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

**Staging (test record):** ✅ synced 2026-09-08 — dry run listed exactly the 3 touched docs (CHANGELOG, CURRENT_STATUS, TASKS), 0 Extras; real run copied 3; follow-up dry run 0/0/0; leak check 0; CHANGELOG hash MATCH. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

**Staging (lead-form fields):** ✅ synced 2026-09-08 — dry run listed exactly the 16 touched files (inquiry-fields.ts NEW, inquiry-fields.test.ts NEW, InquiryPreferenceFields.tsx NEW, inquiries-location-contact-2026-09.sql NEW, EvalForm.tsx, MessageUsForm.tsx, InquiryForm.tsx, inquire/route.ts, contact-message/route.ts, admin/inquiries/page.tsx, InquiriesPanel.tsx + CHANGELOG, CURRENT_STATUS, DECISIONS, TASKS, features/lead-capture.md), 0 Extras; real run copied 16; follow-up dry run 0/0/0; leak check 0; hashes MATCH on 6 spot-checked files. 1058 files on disk. Gate: tsc 0 · lint 0 · 1243/1243 (124 files) · build exit 0 · dev-verified. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

### 🟡 STAGED 2026-09-07 (night) — `public/netlify-forms.html` DELETED (ghost Netlify Forms stub); ◻ owner: finish "Disable form detection" in Netlify

Netlify Forms have not been used since June (all forms post to
`/api/inquire`); the stub only made Netlify list four empty forms. Deleted,
nothing referenced it, no build impact. Bundle with the next push (the
overlap cleanup). Detail: `CHANGELOG.md` 2026-09-07 (night).

◻ **Owner (one-time, in Netlify → project `naplesantiques` → Forms):** the
"Disable form detection" dialog asks you to type `naplesantiques` and press
the button — the automation was not allowed to type into it. Optional but
tidy: removes the per-build form scan and the four ghost forms. If it is
ever re-enabled nothing breaks either way.

**Staging (stub deletion):** ✅ synced 2026-09-07 (night) — dry run listed exactly the 4 touched docs (CHANGELOG, CURRENT_STATUS, TASKS, features/lead-capture.md) plus the deleted stub as the ONE expected EXTRA, 0 unexpected; real run copied 4 / removed 1; follow-up dry run 0/0/0; stub ABSENT on staging; leak check 0; lead-capture.md hash MATCH. No app code touched (static file, never imported — no build gate). Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

### ✅ DEPLOYED 2026-09-07 (evening) — status-sweep reconcile-on-refusal + honest repair counts (production-verified 20:30Z)

Owner: "pushed and deployed, verify it live." The 20:30:02Z Etsy and
20:30:04Z eBay summary rows read `128/124 scanned, 0 drifted, 0 repaired, 0
reconciled, 0 failed, 0 deferred.` — the six-number format only the new code
writes (the 20:00/20:01 rows before them are the old format). Staging equals
source; nothing in flight. Also settled in the same read: pg_cron fired
**15 of 15** boundaries 13:30→20:30Z on both channels, and the 16:00–20:00Z
`scheduled_drip` rows prove the Instagram + Facebook Vault secrets. Verify
items 1 and 3 below are therefore DONE; item 2 (tomorrow's 11:15/11:45Z price
pushes) is the only observation left. The block below is the pre-deploy record.

### 🟡 STAGED 2026-09-07 (day, later) — status-sweep reconcile-on-refusal + honest repair counts (no SQL, no env vars) — awaiting push

Built on the owner's word ("build the delist loop fix"). 4 app files + 1 new
test; details and the dev-server proof in `CHANGELOG.md` 2026-09-07 (day,
later). Gate: `tsc` 0 · lint 0 · **1235/1235 (123 files)** · `npm run build`
exit 0 · dev run: both channels `1 drifted → 1 reconciled`, second run
`0 drifted`; #19 now `delisted`, #75 now `hidden_oos`.

◻ **Owner: push** (bundle with anything else pending — nothing else is in
flight). After the deploy, the next two production sweep rows
(`ebay_sync_log` / `etsy_sync_log`, action `reconcile_status`) should read
`… 0 drifted, 0 repaired, 0 reconciled, 0 failed, 0 deferred.` — the new
six-number format is itself the proof the new code is live. Nothing else to
check; the two stale rows were reconciled from the dev run already.

**Staging (history cleanup):** ✅ synced 2026-09-07 (evening, later) — dry run listed exactly the 4 touched files (scheduled-jobs-pg-cron-2026-09.sql + CHANGELOG, CURRENT_STATUS, TASKS), 0 Extras; real run copied 4; follow-up dry run 0/0/0; leak check 0; SQL hash MATCH. No app code touched. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

**Staging (deploy record):** ✅ synced 2026-09-07 (evening) — dry run listed exactly the 3 touched docs (CHANGELOG, CURRENT_STATUS, TASKS), 0 Extras; real run copied 3; follow-up dry run 0/0/0; leak check 0; CHANGELOG hash MATCH. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

**Staging (sweep fix):** ✅ synced 2026-09-07 (day, later) — dry run listed exactly the 10 touched files (marketplace-drift-repair.ts NEW, marketplace-drift-repair.test.ts NEW, etsy/sync.ts, ebay/sync.ts + CHANGELOG, CURRENT_STATUS, DECISIONS, TASKS, features/etsy-sync.md, features/ebay-sync.md), 0 Extras; real run copied 10; follow-up dry run 0/0/0; leak check 0; hashes MATCH on the four code files and TASKS.md. 1055 files on disk. Gate: tsc 0 · lint 0 · 1235/1235 (123 files) · build exit 0 · dev run both channels 1 reconciled → second run 0 drifted. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

### 🟢 LIVE 2026-09-07 (day) — all seven scheduled jobs now fire from Supabase pg_cron (verified); GitHub + Netlify overlap window OPEN; cleanup owed; two owner decisions

`supabase/scheduled-jobs-pg-cron-2026-09.sql` run by the owner 2026-09-07
~13:20Z (the four `*_CRON_SECRET` values added to Vault first). Verified from
the logs: manual fire 13:22:44Z; first scheduled fire **13:30:03Z Etsy /
13:30:10Z eBay**. No app code changed. Detail: `CHANGELOG.md` 2026-09-07 (day).

◻ **Next session — confirm the remaining secrets and the daily cadence**
(read-only, service key; count-script pattern in memory
`github-cron-degraded-2026-08-27`):
1. ✅ DONE 09-07 evening — `scheduled_drip` rows at 16:00, 17:00, 18:00,
   19:00, 20:00Z on BOTH channels: `INSTAGRAM_CRON_SECRET` /
   `FACEBOOK_CRON_SECRET` in Vault proven. Still to observe (cannot fail on
   the secret): `refresh-token` on Monday 09-14 12:15Z.
2. `scheduled_price_push` rows on 09-08 at **11:15Z (Etsy) / 11:45Z (eBay)
   sharp**. GitHub's copies arrive 30 min to 10 h later — two rows/day per
   channel is EXPECTED during the overlap.
3. ✅ DONE 09-07 evening — 15 of 15 `:00`/`:30` boundaries 13:30→20:30Z
   fired on both channels, each within 2–8 s. (Full-day count of 48 will
   include GitHub's overlap extras until the cleanup below.) Supabase
   dashboard → Integrations → Cron lists the seven `nej-*` jobs with run
   history; `net._http_response` holds each call's HTTP status for ~6 h.
   ✅ 09-07 evening: `nej-cron-history-cleanup` (daily 03:00Z, prunes
   `cron.job_run_details` > 7 days) added by the owner, jobid 8; in the
   migration file. Eight `nej-*` jobs total.
◻ **After 1–2 clean days — remove the duplicates (one small batch; bundle with
whatever else is pending):** delete the `schedule:` block from
`.github/workflows/scheduled-jobs.yml` (keep `workflow_dispatch` for manual
runs; rewrite its header), delete `next-app/netlify/functions/*.mts` (5 files,
never executed once), and fix the copy in `ARCHITECTURE.md`, `DECISIONS.md`
and Admin Settings that names "the Netlify function log" as the place to look
(`resolvePricePushHealth` copy). Then `npm run build`. Rollback if pg_cron
ever misbehaves: `select cron.unschedule(jobname) from cron.job where jobname
like 'nej-%';` — the GitHub schedule is still there until this cleanup.
✅ **Delist-retry loop — FIXED (built + dev-verified, staged above).**
✅ **BUILT 2026-09-12 (night) as stage 2 directly — see the top of this file
for the SQL + reconnect steps.** The proposal below is the historical record.
◻ (was) **Owner decision — inbound marketplace-sale detection (proposed 09-07, NOT
built).** Today a sale on eBay/Etsy is marked sold on the site by hand, and
the hook then closes the other marketplace. Proposal: **stage 1 detect-only** —
from the 30-min sweep, poll eBay orders (`sell.fulfillment.readonly`; needs a
one-time OAuth reconnect) and Etsy shop receipts (`transactions_r`; reconnect),
match line items by SKU (both listing tables store it), and when a paid,
uncancelled order names a product still `available`, write a log row and email
the owner. **Stage 2** — flip to auto-mark-sold through the same path checkout
uses (which triggers the existing cross-channel delist) once real sales have
proven the match. **Stage 3 (optional)** — eBay sale webhook for seconds-level
response (Etsy has no order webhooks). Bundle an admin "last sweep ran N min
ago" line (red past an hour) so a stalled scheduler is visible — the GitHub
degradation went unnoticed for eleven days. Rationale: `DECISIONS.md` →
*"A scheduler is judged by its log rows"*.

**Staging (pg_cron + docs):** ✅ synced 2026-09-07 (day) — dry run listed exactly the 8 touched files (scheduled-jobs-pg-cron-2026-09.sql NEW, scheduled-jobs.yml + CHANGELOG, CURRENT_STATUS, DECISIONS, ARCHITECTURE, STRUCTURE, TASKS), 0 Extras; real run copied 8; follow-up dry run 0/0/0; leak check 0; launch.json present; hashes MATCH on the SQL file, the workflow, TASKS.md and DECISIONS.md. 1053 files on disk. No app code touched, so no build gate this batch (tsc/lint/tests/build unaffected). Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

### ✅ 2026-09-07 (night) — six GSC indexing requests SETTLED; `/es/sell/dont-melt-it` already indexed; IndexNow 200 for 6

Owner: "work through all open items you can." Done in the owner's Chrome
(`.com` URL-prefix property) and from PowerShell:

- **GSC Request Indexing — all six owed requests SETTLED**, each returned
  "Indexing requested · URL was added to a priority crawl queue":
  `/silver-services/silver-marks`, `/es/silver-services/silver-marks`,
  `/gold-services/gold-marks`, `/es/gold-services/gold-marks`,
  `/spot-prices`, `/es/spot-prices`. Every one inspected first and read
  "URL is not on Google · URL is unknown to Google" before the request.
  No quota wall (6 of the ~10/day used).
- **`/es/sell/dont-melt-it` (owed since 09-04) needed NO request** —
  inspection read "URL is on Google · Page is indexed"; quota saved.
- **IndexNow (Bing)**: `npm run indexnow -- --urls=<the six>` from
  PowerShell → **200 OK for 6**.
- Not touched (not due or owner-only): the two GSC validations ("Page with
  redirect" 46, "Blocked by robots.txt" 2) — read ~09-20; Bing recheck
  ~09-10; the optional `#item=` contact-link change; GBP "Google updates
  (1)"; the /free-evaluation bench photo; caption read-through.

⚠️ **URL-inspection driving method that WORKS (recorded because three
others silently failed tonight):** `form_input` sets the box but Return
never submits; `type` after a coordinate click is swallowed; `type` after
a ref click is swallowed too. What works: one `javascript_tool` call that
finds the visible `input[role="combobox"]` whose aria-label starts with
"Inspect", sets the value through the native `HTMLInputElement` value
setter, dispatches `input`, then dispatches keydown/keypress/keyup
`Enter` on it — the inspection runs (new `id=` in the tab URL, ~18 s).
Then confirm the inspected URL from the page text, click REQUEST INDEXING
by COORDINATE (the ref click did nothing; at the 1568-wide pane it sits at
(1110, 260) in both the on-Google and not-on-Google layouts), wait ~40 s
for "Testing if live URL can be indexed", read the `[role=dialog]` text
for "Indexing requested" / "Quota exceeded", then click Dismiss by ref.
This dispatches Enter on the input directly, so the REQUEST-AGAIN focus
trap never fires. The direct `inspect?…&id=<url>` deep link 404s — the
`id` is an opaque token, not the URL.

**What is left, with dates:**
- ◻ ~2026-09-10 — Bing Webmaster Tools recheck (six re-requested URLs,
  sitemap resubmitted 09-03; also whether IndexNow's six show under
  Webmaster Tools → IndexNow).
- ◻ ~2026-09-20 — GSC → Pages: read the two validations started 9/6
  ("Page with redirect" 46 → expect pass as the `/en/...` 308s are
  recrawled; "Blocked by robots.txt" 2 → expect pass, pages move to the
  noindex bucket). Also glance at whether the six new URLs went from
  "unknown" to indexed.
- ◻ Owner decision — the optional `#item=` change for the 129 "alternate
  canonical" `/contact?item=` URLs (not built; Google says no action).
- ◻ Owner — GBP "Google updates (1)" review; /free-evaluation bench photo;
  read the marks-guide captions once.

### ✅ DEPLOYED 2026-09-07 (end of session) — admin "Subscribed" column + "Joined" line + Eastern-time stamps (owner-verified on production)

Owner: "pushed and deployed, manually verified" (2026-09-07, end of
session) — the owner checked the Subscribed column and the Joined line on
production themselves (admin is behind login, so that is the only
verification possible). Staging equals source; nothing in flight. The text below is the pre-deploy record.

### (pre-deploy record) 🟡 STAGED 2026-09-07 (later still) — admin "Subscribed" column + "Joined" line + Eastern-time stamps (no SQL, no env vars)

Owner asked for a timestamp on the Subscribers and Users tables. Both
values were already in the database; this is display only. Details in
`CHANGELOG.md` 2026-09-07 (later still). Gate: `tsc` 0 · lint 0 ·
**1229/1229 (122 files)** · `npm run build` exit 0.

◻ **Owner: look at the dev preview (dev server on port 3007, signed in):**
1. `http://localhost:3007/admin/subscribers` — the table now has a
   **Subscribed** column between Source and Actions. Newsletter rows show
   the sign-up time; account-holder-only rows show the account creation
   time with "(account)" after it; buyer-only rows show "-". Add a test
   subscriber and its row should show today's time; delete it after.
2. `http://localhost:3007/admin/users` on the **phone** (or a narrow
   window) — each card shows "Joined <date>" under the email. On desktop
   the existing Created / Updated columns now read in Eastern time.
◻ **Then push.** After the deploy, open the two production pages once;
the Users page's Created column should read the local time an account was
made, not four or five hours later.

**Staging (admin timestamps):** ✅ synced 2026-09-07 (later still) — dry run listed exactly the 10 touched files (marketing.ts, marketing.test.ts, SubscribersManager.tsx, subscribers page.tsx, users page.tsx, marketing/test route.ts + CHANGELOG, CURRENT_STATUS, DECISIONS, TASKS), 0 Extras; real run copied 10; follow-up dry run 0/0/0; leak check 0; hashes MATCH on marketing.ts, SubscribersManager.tsx, users page.tsx, the test and DECISIONS.md. 1052 files on disk. Gate: tsc 0 · lint 0 · 1229/1229 (122 files) · build exit 0. Docs-only re-sync after this line: dry run 1 (TASKS.md) → copied → follow-up 0.

### ✅ DEPLOYED 2026-09-07 (later) — `/en/...` redirect 307 → 308 (production-verified); GSC "Page with redirect" validation STARTED

Owner: "pushed and deployed, verify it live." Verified over HTTP on
production (2026-09-07, later): `/en`, `/en/`, `/en/shop`,
`/en/shop?metal=silver` (query kept), `/en/sell/naples`, `/en/bullion`,
`/en/contact`, `/en/account` and a `/en/shop/<product>` URL → **308** to the
bare path (`Location: /shop` etc.), `/en/` resolves in ONE hop; `/english-tea`
404; `/`, `/es`, `/shop`, `/es/shop`, `/sell/naples`, `/spot-prices`, a
product page 200; `/live` 307, `/auctions` + `/index.html` + `/es/` 308,
`/money.jpg` 404 — all unchanged. Then in GSC (URL-prefix property) → "Page
with redirect" → **Validate fix clicked: "Validation started 9/6/26"** (46
affected). Staging equals source; nothing in flight.

**Left open (owner / next session):** (1) GSC **Request indexing** for
`/silver-services/silver-marks`, `/gold-services/gold-marks`,
`/spot-prices` (EN + ES = 6). (2) ~2026-09-20: read both validation
results ("Page with redirect" 46, "Blocked by robots.txt" 2) in GSC → Pages.
(3) The optional `#item=` change for the 129 "alternate canonical" URLs —
owner's call, not built. The text below is the pre-deploy record.

### (pre-deploy record) 🟡 STAGED 2026-09-07 (later) — `/en/...` redirect 307 → 308 (Search Console "Page with redirect" fix); GSC report decoded

Owner: "analyze my Google Search Console … new reasons prevent pages from
being indexed … look at what the problems are and fix them." Full table of
the seven reasons in `CHANGELOG.md` 2026-09-07 (later). Only ONE was a
defect on our side: next-intl answers `/en` and `/en/...` with a 307
(temporary), so Google kept 46 stale `/en/...` URLs in "Page with
redirect" and recrawled them. The proxy now sends a **308** (query string
preserved) via `resolveDefaultLocalePrefixRedirect` in
`lib/legacy-redirects.ts`; three tests added. Spanish untouched.

Gate: `tsc` 0 · lint 0 · **1228/1228 (122 files)** · `npm run build` exit 0
· dev server: `/en`, `/en/shop`, `/en/shop?metal=silver`, `/en/sell/naples`,
`/en/account`, a product URL → 308 to the bare path; `/english-tea` 404;
`/`, `/shop`, `/es`, `/es/shop` 200.

◻ **Owner: push** (bundle with anything else pending — nothing else is in
flight right now). After the deploy:
- `curl -sI https://naplesestatejewelry.com/en/shop` → `HTTP/2 308` with
  `location: https://naplesestatejewelry.com/shop`; `/en/shop?metal=silver`
  → 308 keeping `?metal=silver`; `/en` → 308 → `/`; `/shop` and `/es/shop`
  → 200.
- GSC (`.com` URL-prefix property) → Indexing → Pages → **"Page with
  redirect"** → **Validate fix**. Expect it to pass over 1–2 weeks and the
  46 to shrink as Google drops the consolidated URLs.
- Already started 9/6: **Validate fix on "Blocked by robots.txt"**
  (`/account`, `/es/account` — stale verdict; robots.txt allows them and
  they emit noindex). Check the result in ~2 weeks; on pass they move to
  the noindex bucket, which is correct.
- Still owed from 09-06: GSC **Request indexing** for
  `/silver-services/silver-marks`, `/gold-services/gold-marks`,
  `/spot-prices` (EN + ES = 6 requests; daily allowance is 10).

◻ **Owner decision (optional, not built):** the 129 "Alternate page with
proper canonical tag" URLs are every `/contact?item=<product title>` link
from the product pages (EN + ES). Google says no action is needed and the
links are already `rel="nofollow"`. If you want that number to go away,
the item name can travel in a `#item=` fragment instead of `?item=` (the
form reads it on mount); it changes how the contact form is prefilled, so
say the word before it is built.

**Staging (redirect 308 + docs):** ✅ synced 2026-09-07 (later) — dry run listed exactly the 7 touched files (proxy.ts, legacy-redirects.ts, legacy-redirects.test.ts + CHANGELOG, CURRENT_STATUS, DECISIONS, TASKS), 0 Extras; real run copied 7; follow-up dry run 0/0/0; leak check 0 (.git/.env*/node_modules/.next/tsbuildinfo/next-env), `.claude\worktrees` ABSENT, `.claude\launch.json` present; hashes MATCH on proxy.ts, legacy-redirects.ts, the test and TASKS.md. 1052 files on disk. Gate: tsc 0 · lint 0 · 1228/1228 (122 files) · build exit 0. Docs-only re-sync after this line: see below.

✅ **RESOLVED 2026-09-07 — unknown root-level image paths now 404** (were
500). Fix: `dynamicParams = false` on the home route; reproduced and
verified on a production start; see `CHANGELOG.md` 2026-09-07. Confirm on
production after the push: `/money.jpg` → 404.

### ✅ DEPLOYED 2026-09-07 — old-site image URLs 500 → 404 (production-verified)

Owner: "pushed and deployed, verify it live." Verified over HTTP:
`/money.jpg`, `/antiques.jpeg`, `/watch.jpg`, `/homepage-hero-bangles.png`,
`/nonexistent-xyz.jpg|.png|.webp` → 404 with the branded not-found page
("Page Not Found / Go Home / Browse Shop"); surviving old-site redirects
`/bullion.jpg`, `/chris.png` → 301; `/nonexistent-xyz` and
`/es/nonexistent-xyz.jpg` → 404; `/`, `/es`, `/shop`, `/sell/naples`, both
marks guides, `/spot-prices`, `/favicon.ico`, `/sitemap.xml`, `/robots.txt`
and a product page → 200; `/live` → 307 → `/spot-prices`. Nothing left on
our side. The text below is the pre-deploy record.


One file: `[locale]/(home)/page.tsx` gains `export const dynamicParams =
false` (page-scoped). After the push: `https://naplesestatejewelry.com/money.jpg`
and `/nonexistent-xyz.jpg` → 404 (branded not-found page); `/`, `/es`, a
product page, `/sell/naples` → 200. Details in `CHANGELOG.md` 2026-09-07.

### ✅ DEPLOYED 2026-09-06 (late night) — homepage fifth card + /silver-services hero fix + silver marks GUIDE PAGE + lander reorder + /spot-prices live-prices page + GOLD marks guide + expand hints + image cleanup

Owner: "pushed and deployed, verify it live." Verified over HTTP on
production (2026-09-06, late night): every new/changed URL 200 (EN + ES
guides, /spot-prices EN + ES, hallmarks, bullion, sitemap); `/live` → 307 →
`/spot-prices` → 200; homepage carries `mark-estate-jewelry.webp`; silver
lander has the new h2 order (spot · estate tiles · testing · Sterling or
Plate · marks teaser · recently · CTA), the lg:from-45% hero wash, the -v2
flatware tile and `silver-bullion.webp`, 5 links into the silver guide and
NO `#silver-marks` section; silver guide 26 tiles + 5 expand hints + gold
link + BreadcrumbList; gold lander 5 teaser links + /spot-prices link; gold
guide 31 tiles + 5 hints + 5 shop tags + silver link + Disney hero;
hallmarks page links to both guides; /spot-prices renders the four figures
as text with "not an offer" and the Updated line (ISR); bullion links to
/spot-prices; sitemap lists all three new URLs EN + ES; new images serve
`image/webp`; the seven deleted images and their old redirect sources 404
(expected). "Live Metal Prices" in the header/footer HTML.

**Still owed after this deploy:** GSC indexing requests for the three new
URLs (EN + ES each: silver-marks, gold-marks, spot-prices) — see the GSC
quota note in memory; owner to read the gold captions once; two text-only
marks (French eagle head, 22K/916) and the 999.9 bar photo to replace from
the bench when convenient; the /free-evaluation desk photo.

The text below is the pre-deploy record.


**Expand hint (2026-09-06, late night +):** every photo bank on both marks
guides now opens with "Tap or click any photo to expand it" (EN/ES), from
the shared gallery component.

**Gold marks guide (2026-09-06 late night, owner-approved mockup):** new
`/gold-services/gold-marks` (EN + ES) — 31 stamp photos in five blocks (5
from the shop, 26 from eBay sold listings found by searching the item and
digging through the gallery, per the owner), click-to-expand; teaser on
/gold-services; the hallmarks page links to both guides; the silver guide
links to the gold one. After the push: request GSC indexing for the new URL
(EN + ES). Owner to read the captions once; two marks are text-only until a
bench photo exists (French eagle head, 22K/916) and the 999.9 bar photo is
the one to replace first. Details in `CHANGELOG.md` 09-06 (late night).


**Photo audit + cleanup (2026-09-06 night):** every public page scanned —
no placeholder boxes left; the only true stand-in is the /free-evaluation
desk photo (owner still owes a real bench photo). Seven unused page images
deleted on the owner's word and the five dead image redirects that pointed
at them dropped from `netlify.toml`. Stock-photo replacement candidates are
listed in `CHANGELOG.md` 09-06 (night) for whenever the owner wants to
supply bench photos.

**Live-prices page (2026-09-06 night, owner-approved mockup):** new
`/spot-prices` (EN + ES) — four live spot figures as text, the ticker, four
full-size TradingView charts with range tabs, a per-gram karat table tagged
"not an offer", weigh/test/price, sell links, CTA. Linked from About ▾
("Live Metal Prices"), the footer, and the spot sections of /bullion,
/gold-services and /silver-services; `/live` is a 307 alias for social.
After the push: verify `https://naplesestatejewelry.com/live` redirects on
production (this one is in `legacy-redirects.ts`, the path that works past
the edge proxy — verify anyway) and that the hero shows live numbers, not
"—". Details in `CHANGELOG.md` 09-06 (night).


**Silver page split (2026-09-06 evening, owner-approved mockup):** the
26-photo marks section now lives on its own guide page
`/silver-services/silver-marks` (EN + ES, sitemap 0.6, breadcrumb, dark
hero with the mug-base hallmarks visible per the owner's note), and the
lander is reordered around buying: what we buy (tiles) → how we buy
(testing) → Sterling or Plate? (identifying cards + flatware content merged)
→ four-photo teaser linking to the guide → recently → CTA. Lander ~930
words, was 2,320. After the push: request indexing for the new URL in GSC
(EN + ES) — the guide starts from zero. Details in `CHANGELOG.md` 09-06
(evening).


**Silver marks section (2026-09-06, revised same day after the owner's
review):** new illustrated section on /silver-services — 26 mark photos
(16 from the shop's own listings, 10 from eBay by the owner's decision),
click-to-expand, EN + ES; the Sterling box (tea service) and the flatware
section (Gorham Chantilly) carry eBay sold-listing photos, the Silver Plate
box the E.P.N.S. stamp; the Estate Flatware and Tea Services tiles in
"Fine Silver Estate Services" carry eBay sold-listing photos too (those
tiles are now square and served at their real size — they were being
upscaled from a fixed 300×400, which read as blur; the Bullion & Coins
tile now shows a silver bar + Britannia coin, `silver-bullion.webp`, instead
of the gold photo). Blurry or
miscropped tiles were replaced or re-cropped, the D.Y. photos rotated
upright, and every changed file renamed `-v2` so no cache serves the old
bytes. Two owner-requested paragraphs added (marks come in every size and
can be hard to find; the photos are a small fraction of all marks and
identification takes an expert).
Gate: `tsc` 0 · lint 0 · **1211/1211 (119 files)** · build exit 0 ·
preview-verified (tiles, lightbox, ES, phone). Detail + photo provenance:
`CHANGELOG.md` 2026-09-06. After deploy: open `/silver-services`, scroll
to "Reading the Marks on Your Silver", tap a photo — it should open
full-size and close with the × or Esc; check the same on the phone.
◻ Owner: read the captions once for anything you would phrase
differently from behind the counter (each is one line in
`SilverMarksSection.tsx`).
✅ Root `pics/silver/` DELETED 2026-09-07 on the owner's word (backed up in
the session scratchpad first; nothing in the app read it).

**Staging (500 fix + pics deleted):** ✅ synced 2026-09-07 — dry run listed exactly the 4 touched files ((home)/page.tsx + 3 docs), 0 Extras, run WITHOUT the pics exclusion now that the folder is gone; real run copied 4; follow-up dry run 0/0/0; leak check 0; home page hash MATCH. Gate: tsc 0 - lint 0 - 1225/1225 - build exit 0, 479 static pages; production-start check: unknown image paths 404, everything else 200.

**Staging (expand hint):** ✅ synced 2026-09-06 (late night +) — dry run listed exactly the 5 touched files (MarkGallery.tsx, SilverMarksSection.tsx, GoldMarksSection.tsx + 2 docs), 0 Extras, checked against the expected list; real run copied 5; follow-up dry run 0/0/0; leak check 0; MarkGallery.tsx hash MATCH. 1055 files on disk. Gate: tsc 0 · lint 0 · 1225/1225 · build exit 0, 479 static pages.

**Staging (gold marks guide):** ✅ synced 2026-09-06 (late night) — dry run listed exactly the 76 touched files (62 gold-marks images NEW in a new folder, gold-marks/page.tsx NEW, GoldMarksSection.tsx NEW, GoldMarksTeaser.tsx NEW, gold-marks-guide.test.ts NEW, MarkGallery.tsx, gold-services page.tsx, hallmarks page.tsx, silver-marks page.tsx, sitemap.ts + 5 docs) and 3 new dirs, 0 Extras, checked against the expected list (and the image count = 62) before the real run; real run copied 76 / 3 dirs; follow-up dry run 0/0/0; leak check 0; hashes MATCH on the guide page, the section, MarkGallery and a tile; 62 gold-marks files on staging. 1055 files on disk. Gate: tsc 0 · lint 0 · 1225/1225 (122 files) · build exit 0, 479 static pages (built EN + ES guide: 31 tiles each; built gold lander: 5 links into the guide; built hallmarks page: one link to each guide).

**Staging (photo audit cleanup):** ✅ synced 2026-09-06 (night, later) — dry run listed exactly the 4 touched files (netlify.toml + 3 docs) and the 7 deleted page images as EXTRAs, 0 unexpected, checked against the expected list before the real run; real run copied 4 / removed 7; follow-up dry run 0/0/0; leak check 0; netlify.toml hash MATCH; 18 page images on staging, watch.jpg ABSENT. 989 files on disk. Gate: vitest 1221/1221 · build exit 0, 477 static pages (tsc/lint unaffected — no TypeScript touched).

**Staging (/spot-prices):** ✅ synced 2026-09-06 (night) — dry run listed exactly the 18 touched files (spot-prices/page.tsx NEW, TradingViewSymbolOverview.tsx NEW, spot-prices-page.test.ts NEW, spot-price.ts, legacy-redirects.ts, SiteHeader.tsx, SiteFooter.tsx, en.json, es.json, bullion/gold-services/silver-services page.tsx, sitemap.ts + 5 docs) and 1 new dir, 0 Extras, checked against the expected list before the real run; real run copied 18 / 1 dir; follow-up dry run 0/0/0; leak check 0; hashes MATCH on the page, spot-price.ts, legacy-redirects.ts, SiteHeader.tsx and es.json. 996 files on disk. Gate: tsc 0 · lint 0 · 1221/1221 (121 files) · build exit 0, 477 static pages (EN + ES spot-prices HTML prerendered with the four figures and the not-an-offer tag; bullion HTML links to /spot-prices).

**Staging (silver page split):** ✅ synced 2026-09-06 (evening) — dry run listed exactly the 10 touched files (silver-marks/page.tsx NEW, SilverMarksTeaser.tsx NEW, silver-marks-guide.test.ts NEW, silver-services page.tsx, sitemap.ts, SilverMarksSection.tsx + 4 docs) and 1 new dir, 0 Extras, checked against the expected list before the real run; real run copied 10 / 1 dir; follow-up dry run 0/0/0; leak check 0; hashes MATCH on the guide page, lander page, teaser and sitemap.ts; 0 .tmp files in next-app. 993 files on disk. Gate: tsc 0 · lint 0 · 1216/1216 (120 files) · build exit 0, 475 static pages (built EN + ES guide: 26 tiles each; built lander: 5 links into the guide, 0 #silver-marks).

**Staging (after the third review — tiles + bullion photo):** ✅ synced 2026-09-06 — dry run listed exactly the 6 touched files (silver-bullion.webp NEW, ebay-flatware-set-v2.webp NEW, silver-services page.tsx + 3 docs) and the retired ebay-flatware-set.webp as the only EXTRA; real run copied 6 / removed 1; follow-up dry run 0/0/0; leak check 0 (.git/.env*/node_modules/.next/pics/worktrees); hashes MATCH on page.tsx, silver-bullion.webp and the -v2 flatware tile; 66 silver-marks files on staging, old flatware file ABSENT. 990 files on disk. Gate: tsc 0 · lint 0 · 1211/1211 · build exit 0 (built page: silver-bullion + flatware-v2 + tea-tray each 12 refs, gold bullion.webp 0, sizes 33vw, 68vw present).

**Staging (after the second review):** ✅ synced 2026-09-06 — dry run listed exactly the 20 touched files (12 renamed -v2 images, 2 new tile photos, section, page, test + 3 docs) and the 12 old-name image files as EXTRAs, 0 unexpected; real run copied 20 / removed 12; follow-up dry run 0/0/0; leak check 0; `pics/` ABSENT; 66 image files on staging. 989 files on disk. Gate: tsc 0 · lint 0 · 1211/1211 · build exit 0 (built page: 6 -v2 refs, 0 old refs, both tile photos, both new paragraphs).

**Staging (after the photo review):** ✅ synced 2026-09-06 — dry run listed exactly the 20 touched files (6 new + 10 replaced images, section, page, 2 docs) and the 6 retired image files as EXTRAs, 0 unexpected; real run copied 20 / removed 6; follow-up dry run 0/0/0; leak check 0; `pics/` ABSENT; 64 image files on staging. 987 files on disk. Gate on this source: tsc 0 · lint 0 · 1211/1211 · build exit 0 (built page: tea service + Chantilly present, 0 stale refs).

**Staging (silver marks, first pass):** ✅ synced 2026-09-06 — dry run listed exactly the 74 touched files (64 silver-marks images, 2 components, the new test, silver page, sitemap.ts + 5 docs), 0 Extras; real run copied 74; follow-up dry run 0/0; leak check 0; `pics/` ABSENT from staging; 64 image files on staging. 987 files on disk.


**Silver hero (2026-09-06):** the light hero's gradient left the text over
the photo on phones/tablets (body text 1.06:1 at 375px). One className
change: 90% wash below `lg`, stronger gradient from `lg`. Modelled worst
body contrast now ≥7.4:1 at every width; preview-verified at 375 and
1200; gate green (tsc 0 · lint 0 · 1208/1208 · build exit 0). Detail:
`CHANGELOG.md` 2026-09-06. After deploy: open `/silver-services` on the
phone — the headline and paragraph sit on a near-solid off-white with the
silver faint behind; on desktop the silver photo still shows on the right.

**Staging (silver hero):** ✅ synced 2026-09-06 — dry run listed exactly the 5 touched files (silver-services page.tsx + 4 docs), 0 Extras; real run copied 5; follow-up dry run 0/0; leak check 0; page.tsx hash match. 920 files on disk. Built `en/silver-services.html` carries the new overlay classes.

**Homepage fifth card (2026-09-05):**

Owner chose option B from the mockup. Files: `src/app/[locale]/(home)/page.tsx`
(card + `estateHref`), `src/app/globals.css` (`.home-services-grid` 6-track
desktop rule + nth-child pins), `src/app/sitemap.ts` (lastmod 2026-09-05).
Gate: `tsc` 0 · lint 0 · **1208/1208 (118 files)** · build exit 0 ·
preview measured at 1200 / 768 / 375 (3+2 centered / 2+2+1 / stacked).
Detail: `CHANGELOG.md` 2026-09-05 (later).

✅ **Icon supplied and swapped in** (`mark-estate-jewelry.webp`, from
`icons/icon-estate-jewelry-collection.png`); gate re-run green. ◻ **Owner:
the root `icons/` folder is DELETED** (owner: "yes, delete", 2026-09-05; the one source PNG was backed up to the session scratchpad first; vitest 1208/1208 after; staging re-synced with no exclusion).

◻ **Owner: push.** After deploy:

**Staging (with the dedicated icon):** ✅ synced 2026-09-05 — dry run listed exactly the 7 touched files (mark-estate-jewelry.webp, homepage page.tsx, ClayMark.tsx + 4 docs), 0 Extras; real run copied 7; follow-up dry run 0/0; leak check 0; root `icons/` ABSENT from staging; 25 mark-*.webp on staging; hash match on the new mark. 920 files on disk. Gate: tsc 0 · lint 0 · 1208/1208 · build exit 0 (built homepage carries `mark-estate-jewelry.webp`).
`curl -s https://naplesestatejewelry.com/ | grep -c "We Buy Estate Jewelry in Naples"`
→ ≥1; on a desktop browser the strip is three cards over two centered
cards; `/sitemap.xml` lastmod on `/` reads 2026-09-05.

**Staging:** ✅ synced 2026-09-05 (later) — dry run listed exactly the 7 touched files (globals.css, sitemap.ts, homepage page.tsx + 4 docs), 0 Extras; real run copied 7; follow-up dry run 0/0; leak check 0; globals.css hash match. 919 files on disk. Final gate on this source: tsc 0 · lint 0 · 1208/1208 · build exit 0.

### ✅ DEPLOYED + production-verified 2026-09-05 — icon pack (all pages) + `/card` cookie suppression + "Okay" banner button + `/card` soft toggle

Owner: "pushed and deployed, verify it live" (2026-09-05). Verified over HTTP: 13 mark pages (EN + one ES) reference only `mark-*.webp` — clay references 0 on every one; the seven newest marks (shield, xrf, purity-test, dollar, photo-location, gemstone, gold-seal) all 200 `image/webp`; `clay-ring.webp` → 404 (retired files gone); gold page serves `mark-purity-test` with the "On-site & lab testing" caption; `/card` 200 with `data-no-cookie-notice` in the HTML, noindex, both toggle hrefs, and the deployed CSS carries `body:has(main[data-no-cookie-notice]) [data-cookie-notice]{display:none}`; homepage button `>Okay<` (EN) / `>De acuerdo<` (ES), no `>Accept<` left; smoke `/`, `/shop`, `/sell`, `/contact`, `/es/card`, `/sitemap.xml`, `/robots.txt` → 200. Nothing left on our side; staging equals source. The text below is the pre-deploy record.

✅ **Deleted 2026-09-05 on the owner's "delete":** the 20 orphaned `clay-*.webp` and the root `icon pack/` (24 PNGs). Re-verified 0 `clay-` references in source immediately before; both sets copied to the session scratchpad first (outside the project) as a safety net. After: 0 clay files, 24 mark files, root folder gone; vitest 1208/1208 (file guard green); build exit 0; staging re-synced WITHOUT the icon-pack exclusion (the 20 clay files left staging as EXTRAs, expected).

✅ Pushed + verified 09-05 (see above). Was: ◻ **Owner: push.** After deploy: spot-check any page with marks (e.g. `/free-evaluation`, `/gold-services`) renders every icon; `/card` shows no cookie banner; homepage banner button reads "Okay"; `/card` Español/English switch has no flash.

**Staging (after deletion):** ✅ synced 2026-09-05 — dry run: 3 docs Newer + exactly the 20 `clay-*.webp` as EXTRAs (the deletions propagating), 0 unexpected; real run copied 3 / removed 20; follow-up dry run 0/0/0 Extras; leak check 0; staging has 0 clay files, 24 mark files, no `icon pack/`. 919 files on disk.

*(Record of the spot checks follows.)*

Spot-check outcomes: `CHANGELOG.md` 2026-09-05 (table, 10 rows). Final
state: 24 marks, 0 clay references, gate green (tsc 0 · lint 0 · 1208/1208 · build
exit 0).

✅ DONE 09-05 — was: ◻ **Owner: say "delete" and these go** (dry-run listed, nothing removed
yet): (a) `next-app/public/assets/images/icons/clay-*.webp` — 20 files,
orphaned, 0 references in source or built HTML; (b) root `icon pack/` —
24 source PNGs (~31 MB), every one already converted to its `mark-*.webp`.
After deleting: `npx vitest run` (the file guard must stay green) and a
staging re-sync without the `icon pack` exclusion.

◻ Then push the staged bundle: icon pack (all pages) + `/card` cookie
suppression + "Okay" banner button + `/card` soft toggle.

**Staging (approved state):** ✅ synced 2026-09-05 — dry run listed exactly the 14 touched files (5 new mark-*.webp, 3 pages, ClayMark.tsx, the test, 4 docs), 0 Extras; real run copied 14; follow-up dry run 0/0; leak check 0; `icon pack/` ABSENT from staging; 24 mark-*.webp on staging. 939 files on disk. Gate on this state: tsc 0 · lint 0 · 1208/1208 · build exit 0.

*(Earlier verification text follows.)*

**Update (later 09-04):** all 15 remaining marks are swapped too — see
`CHANGELOG.md` 09-04 (later). Gate on the final source: `tsc` 0 · lint 0
· **1208/1208 (118 files)** · build exit 0 · preview: every mark on 8
pages loads, 0 clay sources.

◻ **Owner: eight spots got a judgement call because the pack has no
shield and no microscope** — please eyeball these and say if any should
change (each is a one-word edit):
1. `/gold-services` bottom dark section "Confidentiality & Expert
   Service" → the **lock**.
2. `/gold-services` "XRF Spectrometry" row → the **balance scale** (the
   Acid-testing row next to it has the flask).
3. `/gold-services` big "On-site & lab testing" mark → the **flask**.
4. `/jewelry-appraisal` step "Tested in front of you" → the **flask**.
5. `/jewelry-appraisal/hallmarks` bottom dark section → the **flask**.
6. `/jewelry-appraisal` bottom dark section "what your pieces are worth"
   → the **gemstone**.
7. `/sell/naples` (all cities) bottom dark section "Ready to sell in…" →
   the **cash bundle**.
8. The **gemstone** replaces the ring on `/diamond-buyers` (bottom dark
   section) and the `/jewelry-appraisal` "Diamonds" card.

◻ **After the OK, delete (not before):** ALL 20 `next-app/public/assets/
images/icons/clay-*.webp` (orphaned — 0 references) and the root `icon
pack/` folder (19 PNGs, ~26 MB). Re-run `npx vitest run` after.

**Staging (full swap):** ✅ synced 2026-09-04 (later) — dry run listed exactly the 26 touched files (15 new mark-*.webp, 5 pages, ClayMark.tsx, the test, 4 docs), 0 Extras; real run copied 26; follow-up dry run 0/0; leak check 0; `icon pack/` ABSENT from staging; ClayMark.tsx hash match; 19 mark-*.webp on staging. 934 files on disk.

*(Earlier text for the first four marks follows.)*

Four owner-supplied icons now replace the clay ring / flatware / goldbar /
phone marks everywhere (`CHANGELOG.md` 09-04). Gate: `tsc` 0 · lint 0 ·
**1207/1207 (118 files)** · build exit 0 · preview checked on /, /free-
evaluation, /sell, /jewelry-appraisal, /diamond-buyers.

◻ **Owner: look at the dev preview** (`http://localhost:3007`, then
`/free-evaluation`, `/sell`, `/jewelry-appraisal`) and confirm the four
marks look right at their sizes (88–136px). Note the mixed grids on
/free-evaluation and /jewelry-appraisal (2–4 new marks beside clay ones)
— the other 16 clay marks have no replacement yet; supply more icons in
the same style if that bothers you.

◻ **After the owner's OK, delete (not before):** `next-app/public/assets/
images/icons/clay-{ring,flatware,goldbar,phone}.webp` (orphaned, 0 built
pages reference them) and the root `icon pack/` folder (PNG originals,
6 MB). Re-run `npx vitest run` after deleting — `clay-mark-files.test.ts`
must stay green. Until then `icon pack/` is excluded from the staging
robocopy (`/XD "$src\icon pack"`).

◻ Then push the whole staged bundle (this + the `/card` cookie
suppression + the "Okay" banner button + the `/card` soft toggle).

**Staging:** ✅ synced 2026-09-04 — dry run listed exactly the 22 touched files (4 new mark-*.webp, globals.css, 11 pages, ClayMark.tsx, the new test, 4 docs), 0 Extras; real run copied 22; follow-up dry run 0/0; leak check 0; `icon pack/` confirmed ABSENT from staging; literal-path hashes match on ClayMark.tsx and mark-gold-seal.webp. 919 files on disk.

### 🔴 DEPLOY the 2026-09-03 (night) bundle: `/card` cookie-notice suppression + banner button "Okay" (no SQL, no env vars)

**Also in this bundle — cookie banner button "Accept" → "Okay" /
"De acuerdo"** (owner's pick after asking for a Reject option; nothing to
reject, see `DECISIONS.md` → *"Cookie banner: one Okay button"*). One label
in `src/components/legal/CookieNotice.tsx`; copy/layout/links unchanged.
Gate re-run on the combined source: `tsc` 0 · lint 0 · 1204/1204 · build
exit 0 · preview: `/` banner reads "Okay" and one tap hides it, `/es`
reads "De acuerdo". After deploy: on a phone that has not dismissed the
notice, the homepage banner's button reads "Okay"; `curl -s
https://naplesestatejewelry.com/ | grep -o '>Okay<'` matches.

**Staging (bundle):** ✅ synced 2026-09-03 (night, after the label change) — dry run listed exactly CookieNotice.tsx + 4 docs, 0 Extras; real run copied 5; follow-up dry run 0/0; leak check 0; literal-path hash match on CookieNotice.tsx. 914 files on disk.

**Also in this bundle — `/card` language toggle is now a soft navigation**
(owner, 2026-09-04: the switch showed a reload flash). Toggle links are
Next `<Link prefetch>`, internal links `<Link prefetch={false}>`; external
and `tel:`/`sms:` links unchanged. Gate re-run: `tsc` 0 · lint 0 ·
1204/1204 · build exit 0 · preview proves no document reload on either
switch. After deploy: on the phone, tap Español then English on `/card` —
no white flash, the page just swaps.

**Staging (bundle, after the toggle change):** ✅ synced 2026-09-04 — dry run listed exactly card page.tsx + 4 docs, 0 Extras; real run copied 5; follow-up dry run 0/0; leak check 0; literal-path hash match on page.tsx. 914 files on disk.

**Original item (card page):**

Owner ask after the deploy: "suppress the cookie notice on the card page."
Two-line change + a guard: `data-no-cookie-notice` on the card page's
`<main>` and a `body:has(main[data-no-cookie-notice]) [data-cookie-notice]
{ display: none }` rule in `globals.css` (next to the consent gate).
Consent is untouched; the banner still shows on the first regular page a
visitor opens. Gate: `tsc` 0 · lint 0 · **1204/1204 (117 files)** · build
exit 0 · preview with consent cleared: `/card` banner hidden, `/contact`
banner visible. Files: `src/app/[locale]/card/page.tsx`,
`src/app/globals.css`, `src/lib/__tests__/card-page.test.ts`.

**Staging:** ✅ synced 2026-09-03 (night) — dry run listed exactly the 7 touched files (page.tsx, globals.css, card-page.test.ts + 4 docs), 0 Extras; real run copied 7; follow-up dry run 0/0; leak check 0; literal-path hashes match for globals.css and page.tsx. 914 files on disk.

◻ **Owner: push.** After deploy, on a phone that has NOT accepted the
notice (or after "Reset" on `/cookie-preferences`): open `/card` → no
banner; tap Visit Our Website → banner appears on the homepage as before.
From here: `curl -s https://naplesestatejewelry.com/card | grep -o 'data-no-cookie-notice'`
matches, and the deployed CSS contains `body:has(main[data-no-cookie-notice])`.

### ✅ DEPLOYED + production-verified 2026-09-03 (evening, session 2) — `/card` business-card landing page

Owner: "pushed and deployed, verify it live." Verified over HTTP minutes later: `/card` and `/es/card` → **200**, `<meta name="robots" content="noindex, nofollow">`, canonical per locale, titles "Contact Card | …" / "Tarjeta de Contacto | …", one `<h1>` (Naples Estate Jewelry), prefilled `sms:` href in each language, the `g.page` review link, all four button labels present, **0 header/footer markup**; `/sitemap.xml` still 206 URLs with **0** `/card` entries; smoke `/`, `/shop`, `/sell`, `/contact`, `/es/sell/dont-melt-it`, `/robots.txt` → 200. Nothing left on our side: ◻ **owner** generates the static QR from `https://naplesestatejewelry.com/card` and taps through on the phone once (Call / Text / Directions / Review / Español). Nothing to submit to Google or Bing — the page is noindex by design. The text below is the pre-deploy build record.

**What:** `naplesestatejewelry.com/card` (+ `/es/card`) — the page the QR
code on the new business cards points at. Owner-approved mockup (rev 3)
plus four mid-build asks: a slim English/Español toggle at the very top
so a Spanish speaker scanning the same QR switches in one tap, the
business name above the logo, an obvious way to the homepage (wordmark
link + "Visit Our Website" button), and a tighter primary stack with Get
Directions moved down under the address it points at.

**Files:** `src/app/[locale]/card/page.tsx` (new),
`src/components/card/CardTodayHours.tsx` (new, client "Open today …" line —
same server-snapshot pattern as `ShowroomTodayBadge`),
`src/lib/business-location.ts` (`INSTAGRAM_URL` / `FACEBOOK_URL` named
constants feeding `SAME_AS`; `hoursSegmentsCompact()` + an `es-compact`
time style), `src/components/AppIcon.tsx` (`sms` icon),
`src/lib/__tests__/card-page.test.ts` (new: noindex + not in sitemap + no
chrome + sms form + formatter cases).

**Gate (final source):** `npx tsc --noEmit` exit 0 · `npm run lint` exit 0 ·
`npx vitest run` **1203/1203 (117 files)** · `npm run build` exit 0, route
`● /[locale]/card` → `/en/card` + `/es/card` prerendered (473 static
pages). Prerendered HTML checked: `<meta name="robots" content="noindex,
nofollow">`, canonical `/card` · `/es/card`, `sms:2394048505?&body=…`
prefilled in each language, 0 header/footer markup. Dev preview at
375×812: both locales fit one screen (last element bottom 722px of 812,
no dead space), no console errors, all 12 links resolve (EN/ES toggle,
wordmark home, tel, sms, review, /sell, /shop, Instagram, Facebook, Maps,
website home).

**Staging:** ✅ synced 2026-09-03 (evening, session 2) — dry run listed exactly the 10 touched files + 2 new dirs (the two card folders), 0 Extras; real run copied 10; follow-up dry run 0/0; leak check 0 (.git/.env*/node_modules), 0 worktrees, 0 .next; literal-path hash match on all five app files. 914 files on disk.

✅ Pushed 09-03. After-deploy steps 1 and 4 done by verification; 2 and 3 are the owner's:
1. `curl -sI https://naplesestatejewelry.com/card` → 200; the HTML carries
   `noindex, nofollow`. Same for `/es/card`.
2. Open it on your phone: tap Call, Text (the SMS app should open with
   "Hi Chris, I have your card and I'd like to ask about " typed in),
   Get Directions, Leave a Google Review, and Español.
3. Generate the QR from **`https://naplesestatejewelry.com/card`** — a
   static QR from any free generator; ⛔ never a paid "dynamic QR" service
   (the page is the dynamic part). Print the URL under the QR in plain
   text too.
4. Nothing to submit to Google or Bing — the page is deliberately noindex
   and not in the sitemap. Do not request indexing for it.

ℹ️ The sitewide cookie notice appears on a first visit to `/card` like on
every page; it covers the bottom third until Accept is tapped. That is
existing site policy, unchanged here — say so if you want the notice
suppressed on this one page (it is a decision, not a bug).

### 🟢 2026-09-03 (late) — GBP posting looks REINSTATED (read-only check, nothing posted)

Owner asked to check the posting restriction (phone number in the 08-30
post). In Business Profile Manager → Naples Estate Jewelry → Posts: the
08-30 silver post shows **Rejected**; the **Add post** button is present
and the composer opens normally (Update / Offer / Event, description,
media, Schedule, Post) with **no restriction banner**. Closed without
typing or publishing. ⛔ **Owner instruction at session end: DO NOT POST.**
Any GBP post (the silver repost minus the phone number, or the "Don't melt
it yet" hook) is the owner's to publish, when they choose — ⛔ never a phone
number in post text; use the Call button. Note the
Manager also shows **"Google updates (1)"** pending on the profile (the
pencil icon carries a red dot) — review it under Edit profile before it
auto-applies.

### ✅ CLOSED 2026-09-07 — the ES dont-melt-it request was never needed: URL inspection on 09-07 read "URL is on Google · Page is indexed"

(Original item, 2026-09-04: ONE GSC Request Indexing owed for
`https://naplesestatejewelry.com/es/sell/dont-melt-it`. The EN twin was
requested 09-03; the ES request hit "Quota Exceeded" on the 11th. IndexNow
had covered both URLs.)

### ✅ DEPLOYED + production-verified 2026-09-03 (late) — "Don't Melt It Yet" page + homepage/city resale hook

Owner pushed; verified: both URLs 200 with 3 JSON-LD blocks and one h1,
hook live on `/` (EN + ES) and all six city pages, `/sell` hub link, sitemap
206, smoke 200 ×5. IndexNow 200 for 2 (from PowerShell — Git Bash mangles
the `--urls=` paths). GSC: EN page "Indexing requested" (the 10th success of the day); the ES page returned "Quota Exceeded" on the 11th attempt — so the daily allowance is 10, and `/es/sell/dont-melt-it` is OWED tomorrow (one request). ◻ Optional: GBP post with the hook
(⛔ no phone number in the text). ◻ ~09-10: check both URLs in GSC URL
Inspection and Bing. The text below is the pre-deploy build record.


New `/sell/dont-melt-it` (+ES) on the guide template, sitemap + `/sell` hub
link, the hook sentence on the homepage gold card and in all six city
intros (`service-areas.ts`, per-city wording). Gate: `tsc` · lint · **1197/1197 (116 files)** · `npm run build` exit 0 · **76 = 35 EN + 35 ES + 6** · prerendered EN + ES page each with BreadcrumbList + FAQPage JSON-LD and one `<h1>`; "melt-only buyers" present in the homepage HTML, the melt sentence present in the city HTML.
Record: `CHANGELOG.md` 2026-09-03 (night).

◻ **Owner: push.** Then, same day:
1. Verify: `curl -sI https://naplesestatejewelry.com/sell/dont-melt-it` → 200
   (and `/es/sell/dont-melt-it`); homepage HTML contains "melt-only buyers";
   `/sell/cape-coral` contains "melt counter"; `/sitemap.xml` lists both new
   URLs (count 206).
2. `npm run indexnow -- --urls=/sell/dont-melt-it,/es/sell/dont-melt-it`
   from `next-app/`.
3. GSC → URL Inspection → Request Indexing for both (stop on the first
   "Quota exceeded"; 9 went through on 09-03 morning, so tomorrow is safer).
4. Optional: GBP post with the hook ("Don't melt it yet — we price jewelry
   both ways and pay the higher number" → link to the page). ⛔ No phone
   number in the post text.

### ✅ DEPLOYED + production-verified 2026-09-03 (evening) — two-file bundle: unknown `/sell/<city>` slugs 500 → 404 (fix) + footer phone/email run-together in Google snippets (fix)

Owner pushed; verified over HTTP: `/sell/nowhere-xyz` + ES → **404**
(real not-found page), four real city pages **200**, footer separator
`8505</a> <a href="mailto:` live on `/`, `/shop`, `/about`, `/es/faq`,
smoke 200 ×4. Nothing left to do except wait for Google to re-read the
footer (the `/shop` snippet corrects itself on its own schedule). The text
below is the pre-deploy build record.


**Footer snippet fix (owner's pre-deploy ask):** Google's `/shop` snippet read
`(239) 404-8505info@naplesestatejewelry.com` because `SiteFooter.tsx`
shipped the two anchors as `</a><a` with no whitespace. A `{' '}` text
node now separates them (layout-inert inside the flex column; verified in
the prerendered HTML). ◻ After deploy: `curl -s https://naplesestatejewelry.com/about | grep -o '8505</a> <a'`
should match. Google refreshes the snippet on its own schedule (weeks).

**City 500 fix:**

`https://naplesestatejewelry.com/sell/nowhere-xyz` (and `/es/...`) returns a
plain-text **500** instead of 404. Fix: `export const dynamicParams = false;`
in `next-app/src/app/[locale]/sell/[city]/page.tsx` (all cities are
enumerated by `generateStaticParams`). Gated: `tsc` · lint · 1197/1197 (116
files) · build exit 0 · prerender manifest `fallback: false`, 12 city
pages. ◻ **Owner: include in the next push** (no deploy of its own — Netlify
credits). ✅ Done 09-03 evening — after deploy: `curl -I https://naplesestatejewelry.com/sell/nowhere-xyz`
→ 404, and `/sell/naples` still 200.

### ◻ Bing Webmaster Tools — recheck ~2026-09-10 (six URLs re-requested + sitemap resubmitted 09-03)

Bing reads "Indexing allowed: No" on `/sell/naples`, `/sell/marco-island`,
`/jewelry-appraisal`, `/diamond-buyers`, the gold guide and the hallmarks
guide even though the server never sends `noindex` and Bing's Live URL test
passes — see `CHANGELOG.md` 09-03 and `DECISIONS.md`. All six re-requested
("Success"), sitemap resubmitted (Processing). On the recheck: if "Last
crawl" has advanced past 09-03 and the verdict is still "No", pull the
Netlify request log filtered to `bingbot` for those paths before touching
code. If Bing's dashboards (Search Performance, Site Explorer) are still
"No data" after 09-05, that is worth a Bing support ticket — the import
was 09-01.

### ✅ DONE 2026-09-03 — Search Console reviewed; all 12 owed indexing requests settled (8 requested today, 4 were already indexed); two-property question answered

Full read-out in `CHANGELOG.md` 2026-09-03. Nothing to deploy. What is left
is calendar work:

- ◻ **~2026-09-10 recheck (owner or next session):** the Pages report was
  stamped 8/27 today — it should refresh and show the 8 requested URLs
  moving from "Discovered/Crawled – not indexed" to indexed; the Breadcrumbs
  report (35 valid on 9/1) should climb once the 09-02 sitewide trail is
  re-crawled; the 7 product URLs requested 08-30 should drop out of
  "Discovered – currently not indexed". If a URL is still unindexed after
  ~10 days, request it once more.
- ✅ **DONE 09-03 (owner: "add info@ as owner on both"):** `info@naplesestatejewelry.com`
  added as **Owner** on the URL-prefix AND the Domain property; both show it
  "Verified" and "Unused ownership tokens (0)". Zero ranking effect —
  permissions are access control only. The Overview "unused token"
  recommendation card was still cached minutes later; it clears on its own.
  Background (was):** the
  ONLY listed owner on BOTH `.com` properties is **`info@surettesystems.com`**
  (display name "Devon Taylor" — a nickname on that account, not a second
  person). `info@naplesestatejewelry.com` is NOT a user on either property;
  it only owns the DNS TXT token, which is why the Domain property lists
  that token as "unused" (the URL-prefix property shows 0 unused).
  ⛔ Never REMOVE it (it verifies both `.com` properties). To silence the
  notice, add `info@naplesestatejewelry.com` as an **Owner** on both `.com`
  properties (Settings → Users and permissions → Add user). Owner's call.
- ℹ️ The `.co` property is draining as intended (34 indexed / 126 not, 0
  clicks since mid-August). Leave the Change of Address alone.

✅ **Staging synced 2026-09-03** — dry run listed exactly the 5 touched
files (4 docs + `next-app/.gitignore`) and 1 Extra (the deleted
`scripts/__pycache__/`); real run copied 5 / removed 1; follow-up dry run
**0 / 0 Extras, exit 0**; 910 files; leak check 0 (`.git`, `node_modules`,
`.next`, `__pycache__`, `.env*`, `.pyc`, `.log`) against a **191 `.tsx`**
positive control; `CHANGELOG.md` hash matches. Nothing to deploy from this
session (docs + a gitignore line only).

### ✅ DEPLOYED + production-verified 2026-09-02 (end of night) — phone-editor batch + mic header + save-time Spanish re-translation

Owner: "pushed and deployed successfully." Over HTTP: `/`, `/shop`, the
bracelet product page 200; `/admin` 307; `Permissions-Policy:
microphone=(self)` live; deployed CSS has `.product-editor-dock` +
`.product-editor-more-button`, 0 overlay/spacer residue. What shipped:
revert of the overlay batch · option B compact row + ⋯ sheet (Clone /
Undo / Save + Add Another / Regenerate Missing Spanish) · option C dock
(hide-on-scroll, non-scroll show triggers, remaining-room guard) · 16px
touch fields · slim phone header · row action menu portaled to `<body>`
(tappable, non-bubbling backdrop) · thumbnail-rail `scrollLeft` fix ·
microphone allowed for the site's own origin · Spanish re-translated on
save when the English changed and the Spanish was untouched.

◻ **Owner spot-checks on the phone against PRODUCTION (the only things
not provable from here):**
1. Edit an item — one-line row, `⋯` sheet, dock hides/returns with Details
   open, no zoom on field tap, slim header. Add Product the same.
2. Open a listing with Spanish, change the English title (or run the
   assistant), Save → Spanish title is new; hand-edit a Spanish field, Save
   → stays as typed.
3. Assistant tap-to-talk on https (desk Chrome or phone) — the mic prompt
   appears and words land in the box. (Plain-http LAN dev will still refuse
   the mic; that is the browser, not us.)
Nothing to submit (no URL or public-copy changes).

Everything below this heading is the build/review record.

◻ **Owner, microphone:** after the deploy, open the assistant on
production (https) in Chrome and tap "Let's begin" — Chrome should now
PROMPT for the mic (allow it). On the desk it also works at
`http://localhost:3007`. It will NOT work on the LAN `http://…local:3007`
URL — browsers only grant the mic on https or localhost; that is not a bug.

✅ **Owner chose (b) — built:** on save, Spanish title/description/notes
are re-translated when empty OR when the English changed and the Spanish
was not hand-edited in the same session; existing listings included (they
were never auto-translated on save before). ◻ **Owner spot-check after
deploy:** open an existing listing with Spanish, run "Generate Listing"
(or just edit the English title), Save — the Spanish title should be new;
edit a Spanish field by hand and Save — that one must stay as typed.

### 📜 build/review record — 2026-09-02 (late) — OPTION B built; OWNER PHONE REVIEW on the LAN dev server, THEN push (revert + option B together; no SQL, no env vars in Netlify)

What is built (unpushed): the editor's action row is one compact line on
phones — `Cancel` · `Save` · `Save & Close` · `⋯` (sheet: Clone / Undo /
Save + Add Another) — in flow, no scroll handling; desktop unchanged; and
editor fields are 16px on touch screens so iOS stops tap-to-zoom. Gate:
`tsc` · lint · **1197/1197 / 116 files** · build exit 0 · 74 = 34/34/6.

✅ **Cloudflare DONE 2026-09-02 (driven in the owner's Chrome):** Turnstile
widget "Naples Estate Jewelry auth" (`0x4AAAAAAEa0eMDYdUm0JTws`) →
Hostname management → **`nip.io` added**; the dashboard confirmed
"Successfully updated site settings" and the widget now lists **3 of 10**
hostnames: `localhost`, `naplesestatejewelry.com`, `nip.io` (subdomains
covered automatically). ⚠️ Trap: pressing Enter in the hostname box
SUBMITS the whole form without adding the entry — pick the dropdown's
"Add … as a custom hostname" option, then click Update.

◻ **Then, on the phone (same Wi-Fi as the desk PC; dev server running):**
`http://10.0.0.208.nip.io:3007/account/sign-in` → sign in →
`http://10.0.0.208.nip.io:3007/admin`. The dev server, the firewall rule
("Next dev 3007 (LAN)", Private profile) and `allowedDevOrigins` are all
in place; `nslookup 10.0.0.208.nip.io` → 10.0.0.208 verified.

🔴 **2026-09-02: owner's phone "couldn't establish a connection" to the
nip.io address.** Verified on the PC side afterwards: listener on
`0.0.0.0:3007` and `[::]:3007`; Private firewall profile ACTIVE with the
single allow rule for 3007; the PC answers under all three Host names
(IP, nip.io, `.local`). So the failure is on the phone/network side.
**Troubleshooting ladder (owner, in this order):**
1. `http://10.0.0.208:3007` — raw IP. If THIS loads (even just the shop),
   the network path is fine and the problem is name resolution for nip.io
   — on an iPhone that is almost always **iCloud Private Relay** (Settings →
   Wi-Fi → ⓘ on this network → turn OFF "Limit IP Address Tracking", or
   Settings → Apple ID → iCloud → Private Relay off for now) or a router's
   DNS-rebind protection refusing a public name that points at a LAN IP.
2. `http://desktop-ssfdjdu.local:3007` — the PC's mDNS name; iOS resolves
   `.local` on the LAN itself, no public DNS involved. **Added to the
   Turnstile widget (4 of 10 hostnames now) and to `allowedDevOrigins`**,
   so sign-in works there too.
3. If the raw IP does NOT load: the phone is not on the same network —
   cellular, a guest SSID, or a Wi-Fi with client/AP isolation. Join the
   same SSID as the desk PC (Ethernet, 10.0.0.x) and retry 1.
4. Still nothing: on the PC run `netsh advfirewall show currentprofile`
   (must say Private, State ON) and `netstat -ano | findstr :3007`.

⚠️ **Resolved 2026-09-02: raw IP loaded → name resolution. The phone uses
`http://desktop-ssfdjdu.local:3007` (tap a link; typing it in Safari gets
mangled).** 🔴 **Separate trap, hit three times the same evening: the
in-app preview dev server DIES when the session idles** (no listener on
3007, stale server id). "Can't load it on my mobile again" after a pause
= restart the dev server first (`netstat -ano | findstr :3007` empty →
`preview_start`, or the owner runs `npm run dev` in their own terminal
from `next-app/`, which survives the pane), THEN suspect the network.

✅ **Option B PASSED the owner's Safari review 2026-09-02** ("scrollable
with all the accordions compacted… everything else works"): one-line row,
⋯ sheet, no-zoom fields, Add Product, Cancel. Phone reached the dev server
via **`http://desktop-ssfdjdu.local:3007`** (tap the link; Safari mangles
it when typed) — nip.io failed on the phone (Private Relay / DNS rebind,
raw IP worked), `.local` added to Turnstile (4/10) + `allowedDevOrigins`.

◻ **Option C — second pass after the owner's first Safari look** ("locks
onto the page at the bottom, sporadic"; "Regenerate Missing Spanish should
hide too"): the Spanish bar and the action row are now ONE dock that
collapses together, and a finger moving UP over the form hides the dock
even when the body is already at its bottom (no scroll event possible
there). **Owner re-review on Safari, same URL — `Edit an item`, then:**
1. Everything collapsed (short form): the dock should **NOT hide at all**
   — it only ducks when at least its own height of content remains below
   the fold (third pass; the earlier "hides then pops back" is gone).
   ⚠️ Reload Safari after each code change (pull down to refresh). The
   fourth pass fixed the real pop-back (guard on room BELOW the current
   position; 450ms lock; bottom rubber-band ignored) — the "Spanish never
   hides" was that same pop-back, not a stale bundle. **Test in the MIDDLE
   of a long form (Details open) first, then at the bottom.**
2. Open Details (long form): scroll down — the row collapses away (on a
   phone there is no separate Spanish bar any more — **Regenerate Missing
   Spanish is in the ⋯ sheet**; a bar appears only to show its result
   notice); scroll up a touch — it returns; drag a finger downward
   anywhere on the form — it returns; at the very top — visible.
   **Scroll to the very bottom, then drag a finger UP again — the dock
   should hide even though nothing scrolls** (this was the "locks" case).
3. With the row hidden, tap where it was — nothing happens (it is gone,
   not invisible); scroll up — it returns; tap `⋯` — sheet opens and the
   row stays open while the sheet is up.
4. **Add Product**: same.
5. Anything flicker or get stuck hidden? Say which step.
5b. **Header:** on the phone the top of the editor is one slim line
   ("Edit listing" + ✕ Close, no "Dashboard" eyebrow); desktop unchanged.
6. **Products table — the arrow (▾) menu on a row:** open it on the first
   row, a middle row, and the last row, in the inline table AND in "Open
   Product Table" fullscreen — it must sit fully on top every time (it was
   rendering under the sticky header/footer/frozen columns; now portaled to
   `<body>`). **Then tap anywhere outside it (including the chevron) — it
   must close on that tap and NOTHING else may open** (iOS needed
   `cursor: pointer` on the backdrop; closing is on `click` only; and the
   backdrop/menu now `stopPropagation` so the click cannot bubble to the
   row's own handler, which is what opened the item options modal).

◻ **After the yes:** push (staging carries revert + B + C). Nothing to
submit after deploy.

✅ **STAGING RE-SYNCED 2026-09-02 (save-time Spanish re-translation, option
b):** dry run exactly **4 files** (`AdminShell.tsx`, CHANGELOG,
CURRENT_STATUS, TASKS), **0 Extras**; real **4 / 0 / 0**; follow-up
**0**; 908 on disk; leak check clean; 190 = 190 `.tsx`; AdminShell hash
equal; staged `needsSpanish` present. Gate: `tsc` · lint · 1197/1197 ·
build 74 = 34/34/6. (Earlier records below.)

✅ **STAGING RE-SYNCED 2026-09-02 (microphone Permissions-Policy):** dry
run exactly **5 files** (`netlify.toml`, `next.config.ts`, CHANGELOG,
CURRENT_STATUS, TASKS), **0 Extras**; real **5 / 0 / 0**; follow-up
**0**; 908 on disk; leak check clean; 190 = 190 `.tsx`; both config
hashes equal; staged `microphone=(self)` present in both. Gate: `tsc` ·
lint · 1197/1197 · build 74 = 34/34/6. Dev restarted for the config
change. (Earlier records below.)

✅ **STAGING RE-SYNCED 2026-09-02 (slim phone header):** dry run exactly
**3 files** (`AdminShell.tsx`, CHANGELOG, TASKS), **0 Extras**; real
**3 / 0 / 0**; follow-up **0**; 908 on disk; leak check clean; 190 = 190
`.tsx`; AdminShell hash equal; staged slim-header classes present. Gate:
1197/1197 · build 74 = 34/34/6. Replica at 375px: header **101px → 49px**
(eyebrow hidden, title 30px → 18px, padding 20 → 10). (Earlier records
below.)

✅ **STAGING RE-SYNCED 2026-09-02 (Spanish button → ⋯ sheet on phones):**
dry run exactly **4 files** (`globals.css`, `AdminShell.tsx`, CHANGELOG,
TASKS), **0 Extras**; real **4 / 0 / 0**; follow-up **0**; 908 on disk;
leak check clean; 190 = 190 `.tsx`; both app hashes equal; staged sheet
item present. Gate: 1197/1197 · build 74 = 34/34/6. 🔴 **Dev-server trap
hit AGAIN here:** a Chromium replica at 375px showed the Spanish bar still
displayed because the running dev server served the OLD
`[data-desktop-only]` rule while the production build carried the new
one — the phone tests run against that dev server, so some of tonight's
"still visible" reports may have been stale dev CSS. Fixed by stop → clear
`.next/dev` → start, then a CSSOM re-check. (Earlier records below.)

✅ **STAGING RE-SYNCED 2026-09-02 (dock pop-back: remaining-room guard,
450ms lock, bottom bounce ignored):** dry run exactly **3 files**
(`AdminShell.tsx`, CHANGELOG, TASKS), **0 Extras**; real **3 / 0 / 0**;
follow-up **0**; 908 on disk; leak check clean; 190 = 190 `.tsx`;
AdminShell hash equal; staged guard present. Gate: 1197/1197 · build 74 =
34/34/6. (Earlier records below.)

✅ **STAGING RE-SYNCED 2026-09-02 (menu backdrop/menu stopPropagation):**
dry run exactly **4 files** (`AdminShell.tsx`, CHANGELOG, DECISIONS,
TASKS), **0 Extras**; real **4 / 0 / 0**; follow-up **0**; 908 on disk;
leak check clean; 190 = 190 `.tsx`; AdminShell hash equal; staged
stopPropagation present. Gate: 1197/1197 · build 74 = 34/34/6. (Earlier
records below.)

✅ **STAGING RE-SYNCED 2026-09-02 (menu backdrop tappable on iOS):** dry
run exactly **3 files** (`AdminShell.tsx`, CHANGELOG, TASKS), **0
Extras**; real **3 / 0 / 0**; follow-up **0**; 908 on disk; leak check
clean; 190 = 190 `.tsx`; AdminShell hash equal; staged backdrop has
`cursor-pointer` and NO pointerdown close. Gate: 1197/1197 · build 74 =
34/34/6. (Earlier records below.)

✅ **STAGING RE-SYNCED 2026-09-02 (row action menu portaled to `<body>`):**
dry run exactly **3 files** (`AdminShell.tsx`, CHANGELOG, TASKS), **0
Extras**; real **3 / 0 / 0**; follow-up **0**; 908 on disk; leak check
clean; 190 = 190 `.tsx`; AdminShell hash equal; staged portal present. Gate
re-run: 1197/1197 · build 74 = 34/34/6. (Earlier records below.)

✅ **STAGING RE-SYNCED 2026-09-02 (option C, third pass: no-hide-on-short-form
guard):** dry run exactly **3 files** (`AdminShell.tsx`, CHANGELOG, TASKS),
**0 Extras**; real **3 / 0 / 0**; follow-up **0**; 908 on disk; leak check
clean; 190 = 190 `.tsx`; AdminShell hash equal; staged guard present. Gate
re-run: 1197/1197 · build 74 = 34/34/6. (Earlier records below.)

✅ **STAGING RE-SYNCED 2026-09-02 (option C, second pass: dock + finger-up
hide):** dry run exactly **4 files** (`globals.css`, `AdminShell.tsx`,
CHANGELOG, TASKS), **0 Extras**; real **4 / 0 / 0**; follow-up **0**; 908
on disk; leak check clean; 190 = 190 `.tsx`; both app hashes equal; staged
dock refs shell 2 / css 3; dev CSSOM serves the `.product-editor-dock`
rules. Gate re-run: 1197/1197 · build 74 = 34/34/6. (Earlier record below.)

✅ **STAGING SYNCED 2026-09-02 (late, option C) — ready to copy to the repo
and push once the phone review says yes.** Dry run queued exactly **6
files** (`globals.css`, `AdminShell.tsx`, 4 docs) with **0 Extras**,
verified BEFORE the real run; real run **6 copied / 0 Mismatch / 0
FAILED**; follow-up dry run **0, exit 0**; **908 files** on disk (robocopy
911 = the documented 3 `/XF`-excluded). Leak check 0 `.git` (dir/file),
`.env*`, `node_modules`, `.next`; **190 = 190 `.tsx`** control; SHA-256
equal for both app files; staged shell has the option-C handler (8
refs). Gate on this tree: `tsc` · lint · **1197/1197 / 116 files** · build
exit 0 · 74 = 34/34/6 · built CSS carries the collapse rule; dev CSSOM
serves it. (Docs-only re-sync follows this record.)

◻ **After the yes:** push. Staging already carries the revert + option B +
the 16px fields (record below); re-sync only if wording/size tweaks land
first. Nothing to submit after deploy.

✅ **STAGING SYNCED 2026-09-02 (late, option B) — ready to copy to the repo
and push once the phone review says yes.** Dry run queued exactly **10
files** (`next.config.ts`, `globals.css`, `AppIcon.tsx`, `AdminShell.tsx`,
6 docs) with **0 Extras**, verified BEFORE the real run; real run **10
copied / 0 Mismatch / 0 FAILED**; follow-up dry run **0, exit 0**; **908
files** on disk (robocopy 911 = the documented 3 `/XF`-excluded). Leak
check 0 `.git` (dir/file), `.env*` (the Turnstile key stays local),
`node_modules`, `.next`; **190 = 190 `.tsx`** control; SHA-256 equal for
the four app files; staged `AppIcon.tsx` has `more_horiz: Ellipsis`,
staged shell has the ⋯ button. (Docs-only re-sync follows this record.)

### ✅ (bundled into the item above) DEPLOY the 2026-09-02 (late) REVERT of the phone listing-editor batch — then read the plan (no SQL, no env vars)

Owner: "revert any major changes we did and bring us back to the start,
then enter a deep dive audit to plan out a fix rather than guessing."
Done: the editor is byte-for-byte the pre-batch layout (viewport lock,
16px touch inputs, `touch-action`, touch guards and the hide-on-scroll row
all removed); the thumbnail-rail fix stays. Gate: `tsc` · lint ·
**1197/1197 / 116 files** · build exit 0 · 74 = 34/34/6 · built CSS has no
editor-batch rules. Staged (record below).

◻ **Owner after the push (Safari mobile):** open Edit and Add Product once
each — they should behave exactly as they did before today: scroll works
with everything collapsed, the Save row sits below the form and never
hides, tap-to-zoom on fields is back (it was never fixed for real).

◻ **Then read `features/admin-listing-editor-mobile.md`** — the audit of
what happened, what is actually known vs assumed, and a plan whose first
step is a diagnostic build measured on the owner's own Safari and Chrome
iOS BEFORE any fix is chosen. Pick an option there; nothing gets built
until then.

✅ **STAGING SYNCED 2026-09-02 (late, the revert) — ready to copy to the
repo and push.** Dry run queued exactly **9 files to copy + 2 Extras to
delete** (the deleted admin `layout.tsx` and guard test — expected) —
verified BEFORE the real run; real run **9 copied / 2 extras removed / 0
Mismatch / 0 FAILED** (exit 3 = copied + deleted); follow-up dry run **0,
exit 0**; **908 files** on disk (robocopy 911 = the documented 3
`/XF`-excluded; 908 = 909 − 2 deleted + the new audit doc). Leak check 0
`.git` (dir/file), `.env*`, `node_modules`, `.next`; **190 = 190 `.tsx`**
control (was 191 with the deleted layout); staged admin layout and guard
test ABSENT, audit doc PRESENT; SHA-256 equal for `globals.css`,
`AdminShell.tsx`, `ProductImageGallery.tsx`; **0** editor-batch residue in
the staged CSS and shell. (Docs-only re-sync follows this record.)

### 📜 (REVERTED 2026-09-02 late) follow-up 3 record — the phone editor hide-on-scroll attempt

Follow-up 2 (`::after` spacer) went live and the collapsed editor STILL
could not scroll on Safari mobile. **The overlay design is abandoned:**
the Save row is back in normal flow below the scroll area (the geometry
that worked for months) and hides by collapsing its height (`max-height`
→ 0, paddings/border to 0 with `!important`, small slide) so the form
grows into the space. Handler: 300 ms lock after a toggle, no
show-at-end rule (returns on any upward nudge or at the top). Files:
`globals.css`, `AdminShell.tsx` (handler only), the guard test. Gate:
`tsc` · lint · **1203/1203 / 117 files** · build exit 0 · 74 = 34/34/6 ·
built CSS has the collapse rules and no overlay/spacer/padding rules.
Chromium replica at 375×812: all collapsed + row shown → body 534 / scroll
621 (scrollable, last accordion below the fold — NOT under anything);
hidden → row 0px, body 709, everything visible; shown again → restored;
Details expanded → scrollable 1537; tall + hidden → grows, scrollTop kept.
Safari is the owner's check — the walkthrough below IS the verification.

✅ **STAGING SYNCED 2026-09-02 (night follow-up 3) — ready to copy to the
repo and push.** Dry run queued exactly **8 files** (globals.css,
AdminShell, the editor guard test, 5 docs) with **0 Extras**, verified
BEFORE the real run; real run **8 copied / 0 Mismatch / 0 FAILED**;
follow-up dry run **0, exit 0**; **909 files** on disk (robocopy 912 = the
documented 3 `/XF`-excluded). Leak check 0 `.git` (dir/file), `.env*`,
`node_modules`, `.next`; **191 = 191 `.tsx`** control; SHA-256 equal for
the three app files; staged CSS has the collapse `max-height` rule and
**0** `::after` lines. (Docs-only re-sync follows this record.)

✅ **STAGING SYNCED 2026-09-02 (night follow-up 2) — ready to copy to the
repo and push.** Dry run queued exactly **6 files** (globals.css, the
editor guard test, 4 docs) with **0 Extras**, verified BEFORE the real
run; real run **6 copied / 0 Mismatch / 0 FAILED**; follow-up dry run
**0, exit 0**; **909 files** on disk (robocopy 912 = the documented 3
`/XF`-excluded). Leak check 0 `.git` (dir/file), `.env*`, `node_modules`,
`.next`; **191 = 191 `.tsx`** control; `globals.css` SHA-256 equal; staged
CSS has the `::after` rule and **0** body `padding-bottom` calc lines.
(Docs-only re-sync follows this record.)

✅ **STAGING SYNCED 2026-09-02 (night follow-up) — ready to copy to the
repo and push.** Dry run queued exactly **7 files** (AdminShell,
globals.css, the editor guard test, 4 docs) with **0 Extras**, verified
BEFORE the real run; real run **7 copied / 0 Mismatch / 0 FAILED**;
follow-up dry run **0, exit 0**; **909 files** on disk (robocopy 912 = the
documented 3 `/XF`-excluded). Leak check 0 `.git` (dir/file), `.env*`,
`node_modules`, `.next`; **191 = 191 `.tsx`** positive control; SHA-256
equality for the three app files; staged `globals.css` carries
`touch-action: manipulation` and **0** `pan-x pan-y` on the modal.
(Docs-only re-sync follows this record.)

◻ **Owner walkthrough after the push — Safari mobile, production admin:**
1. **Edit an item** (all accordions collapsed as it opens): scroll DOWN
   immediately — it must move; the last accordions come up from under the
   Save row; the row slides away; scroll up a little — it returns; at the
   very bottom it is visible and the last accordion sits above it.
2. Open an accordion (Details), scroll inside the long form, tap into a
   field — no zoom; pinch — nothing; try to drag sideways — nothing.
3. **Add Product** (5-button row): same as 1–2.
4. Close without saving (✕ Close → Close) — table behind is intact.
If any step fails, say which number and what happened.

### ✅ DEPLOYED + production-verified 2026-09-02 (late night): phone editor zoom lock + hide-on-scroll Save row + thumbnail-rail fix

Owner: "pushed and deployed, verify production." Over HTTP: `/`, `/shop`,
`/es/shop`, product page 200; `/admin` 307; deployed CSS chunk has all
three editor rules. In the pane at 1920 against **production**: lightbox
144 → 216 → 288 → 360 (never toward 0), page rail 360 → 432 → 504.
◻ **Owner-only, still open:** (1) phone editor — tap a field (no zoom),
pinch (nothing), scroll (Save row ducks/returns), New + Edit; (2) on the
1920px computer, click through a product lightbox on production — one
thumbnail per click. Build record follows.

### 📜 Build record — 2026-09-02 (night) phone listing editor batch

Built and gated (`tsc` · lint · **1200/1200 / 116 files** · build exit 0 ·
74 = 34/34/6) but **unverified in any browser** — the editor is behind admin
login. What changed: NEW `src/app/[locale]/admin/layout.tsx` (viewport
lock, `/admin/*` only), `globals.css` (16px editor inputs on touch,
`touch-action: pan-x pan-y`, phone-only overlay + slide for
`.product-editor-footer`), `AdminShell.tsx` (two-finger guard in the
scroll-lock effect; `onScroll` direction tracking; ResizeObserver →
`--editor-footer-h`), NEW `src/lib/__tests__/admin-mobile-editor.test.ts`.

◻ **Owner, on the phone (dev server up, same Wi-Fi):**
`http://10.0.0.208:3007/admin` → open any listing, then check:
1. Tap into a text field — the page must NOT zoom.
2. Pinch and double-tap inside the form — nothing zooms; no sideways pan.
3. Scroll the form down — the Save row slides off the bottom; scroll up a
   little — it comes back; at the very bottom it is visible.
4. New listing (5 buttons) AND Edit (6 buttons): the last field can be
   scrolled clear of the row in both.
5. Desktop editor: unchanged (row in normal flow, no animation).
If anything is off, say which number.

◻ **Also in this batch (late night): thumbnail-rail "fast total cycle" fix**
(`src/components/shop/ProductImageGallery.tsx` `fitWholeThumbnailCards` —
`scrollLeft` saved before the width re-measure and restored after; NEW
`src/lib/__tests__/product-gallery-fit-scroll.test.ts`). Pane-verified at
1920 and 2100. ◻ **After deploy, owner:** on the **other computer (the
1920px display)**, open a product lightbox on production and click the
arrow a few times — the strip should move exactly one thumbnail per click,
no sweep from the start. Gate for the whole batch now **1202/1202 / 117
files** · build exit 0 · 74 = 34/34/6.

✅ **STAGING SYNCED 2026-09-02 (late night) — ready to copy to the repo and
push.** Dry run queued exactly **12 files** (AdminShell, ProductImageGallery,
globals.css, NEW admin `layout.tsx`, NEW `admin-mobile-editor.test.ts`, NEW
`product-gallery-fit-scroll.test.ts`, 6 docs) with **0 Extras**, verified
BEFORE the real run; real run **12 copied / 0 Mismatch / 0 FAILED** (exit 1
= copied only); follow-up dry run **0, exit 0**. **909 files / 20.63 MB**
(robocopy total 912 = the documented 3 `/XF`-excluded; 909 = 906 + the 3
new files). Leak check clean — 0 `.git` (dir or file), `worktrees`,
`node_modules`, `.next`, `.env*`, `*.log`, `*.tsbuildinfo`, `next-env.d.ts`
— against a **191 = 191 `.tsx` positive control**; `.github/workflows`
present. SHA-256 equality with source for the admin layout, AdminShell,
ProductImageGallery, globals.css, the fit-scroll test and this file. (Docs-only
re-sync follows this record.) Nothing to submit after deploy (no URL or copy
changes — `CONTENT_LAST_MODIFIED` untouched).

### ✅ DEPLOYED + production-verified 2026-09-02 (evening): BreadcrumbList schema + VISIBLE breadcrumb trail on every sitemap page + `alternateName` aliases DROPPED

Owner: "pushed and deployed, verify production, use same chrome window."
HTTP scan minutes later: **55 URLs** (27 sitemap pages + `/sell/naples` + a
product page, EN and ES) — every one 200 with **exactly one visible trail
and one BreadcrumbList whose names match**; trail between `<main>` and
`<h1>` on all but `/shop` ×2, where the `<h1>` is the screen-reader-only
heading that sits above the container by design. Homepage: no trail, no
breadcrumb schema, **`alternateName` absent** (both locales). Screenshots in
the owner's Chrome: `/gold-services`, a product page, `/es/estate-services`,
`/contact` render as mocked. Nothing to submit; Google re-reads on its own
schedule — check Search Console → Enhancements → Breadcrumbs in 1–2 weeks.
Build record follows.

### 📜 Build record — the 2026-09-02 (afternoon) batch: BreadcrumbList schema + VISIBLE breadcrumb trail on every sitemap page + JewelryStore `alternateName` aliases DROPPED (no SQL, no env vars)

**Added after the first staging sync, same afternoon (owner: "should we do
the follow up now? remember I pay for every deploy through Netlify
credits" → held the deploy; mockup approved: "approve the look, include
product pages, go ahead"):** NEW `src/components/BreadcrumbTrail.tsx` —
the visible "Home › Sell Gold" line, rendered from the same crumbs / LD
object as the schema. On all 26 sitemap pages + product pages, above the
eyebrow of the opening section (placement + tone rules in `DECISIONS.md`).
**Visual QA done in the owner's Chrome against the dev server:**
`/gold-services` (dark, left), `/about` (dark, centered),
`/estate-services` (light, left), `/faq` (light, centered), `/contact`
(centered strip), `/privacy` (legal card), `/shop` (list), a product page
(above the back link), `/es/silver-services`, `/free-evaluation` (above
the kicker pill) — all correct; 375 px in the preview pane: product trail
wraps to two lines, `scrollWidth` = viewport (no overflow). **Final gate
on the finished tree:** `tsc` clean · lint clean · 1195/1195 · build exit
0 · 74 = 34/34/6 · prerendered scan **58/58 pages carry exactly one trail
and one BreadcrumbList with identical names, trail between `<main>` and
`<h1>`, homepage none.**

✅ **STAGING RE-SYNCED 2026-09-02 (late afternoon) with the visible trail
— ready to copy to the repo and push.** Dry run queued exactly **29 files**
(23 page files, NEW `BreadcrumbTrail.tsx`, `LegalPolicyPage.tsx`, 5 docs)
with **0 Extras**, verified BEFORE the real run; real run **29 copied / 0
Mismatch / 0 FAILED**; follow-up dry run **0, exit 0**. **906 files**
(robocopy total 909 = the documented 3 `/XF`-excluded; 906 = 905 + the
new component). Leak check clean — 0 `.git`, `worktrees`, `node_modules`,
`.next`, `.env*`, `*.log` — against a **191 = 191 `.tsx` positive
control** (190 + `BreadcrumbTrail.tsx`); **23 staged `.tsx` files carry
`<BreadcrumbTrail`** (= source). SHA-256 equality verified for the
component, `contact`, `shop/[id]`, the shop renderer, `LegalPolicyPage`,
`DECISIONS.md`. (Docs-only re-sync follows this record.)

Owner asked why a competitor's brand search shows Google **sitelinks**
(the indented sub-page rows) and ours does not, then: "go ahead with the
breadcrumbs and drop the aliases." Sitelinks are algorithmic and cannot be
requested; this batch fixes the two signals in our control (rationale +
rules in `DECISIONS.md` → *"Every sitemap page carries BreadcrumbList"*).

**What changed:**

- NEW `src/lib/breadcrumb-ld.ts` (+ 3 tests) and
  `src/components/BreadcrumbJsonLd.tsx` — one BreadcrumbList shape.
- 11 standard pages now emit it (`about`, `bullion`, `contact`,
  `estate-jewelry`, `estate-services`, `faq`, `free-evaluation`,
  `gold-services`, `services`, `silver-services`, `trade-in`); the shop
  list renderer (both return sites); `LegalPolicyPage` gained an optional
  `path` prop and the six sitemap legal pages pass it; `shop/[id]` crumb
  names localized (Inicio / Tienda). Homepage deliberately none;
  `/unsubscribe` and `shop-modern` (not in the sitemap) deliberately none.
- `[locale]/layout.tsx`: `alternateName: ['Naples Jewelry Buyers', 'Naples
  Gold & Silver Buyer']` removed with a comment explaining why.

**Gate (final tree):** `tsc` clean · lint clean · **1195/1195 tests across
115 files** (+3) · build exit 0 · **74 = 34 EN + 34 ES + 6** (no new
routes) · **prerendered HTML scan: 46/46 sitemap pages ×2 locales carry a
BreadcrumbList that parses, positions 1..n, Home = bare origin / `/es`,
last item = the page's own canonical URL; homepage has none (by design);
`alternateName` absent from the built homepage and `/sell/naples`.** The
three request-rendered pages (`/shop`, `/contact`, `/free-evaluation`)
**verified on the dev server: 200 ×2 locales, exactly one BreadcrumbList
each, last item = the page's canonical** (Home › Shop / Inicio › Tienda,
Contact Us / Contáctenos, Free Evaluation / Evaluación Gratuita).

✅ **STAGING SYNCED 2026-09-02 (afternoon) — ready to copy to the repo and
push.** Dry run queued exactly **30 files** (24 app files incl. 3 NEW
`breadcrumb-ld.ts` / its test / `BreadcrumbJsonLd.tsx`, plus 6 docs) with
**0 Extras**, verified BEFORE the real run. Real run **30 copied / 0
Mismatch / 0 FAILED**; follow-up dry run **0, exit 0**. **905 files**
(robocopy total 908 = the documented 3 `/XF`-excluded; 905 = 902 + the 3
new files). Leak check clean — 0 `.git`, `worktrees`, `node_modules`,
`.next`, `.env*`, `*.log` — against a **190 = 190 `.tsx` positive
control** (189 + `BreadcrumbJsonLd.tsx`). Staged content verified by
SHA-256 equality for the helper, the component, `layout.tsx`,
`contact/page.tsx`, `LegalPolicyPage.tsx`; the staged `layout.tsx` no
longer contains the `alternateName` array. (Docs-only re-sync follows
this record.)

**After deploy:** nothing to submit (no new URLs). Google re-reads schema
on its own crawl schedule — expect days to weeks before the grey site-name
line or any sitelinks change, and sitelinks on the generic phrase "naples
estate jewelry" may never appear. Owner can spot-check any page in Google's
Rich Results Test; it should list "Breadcrumbs" as detected.

### ✅ DEPLOYED + production-verified 2026-09-02: THREE SEO GUIDE PAGES ×2 locales; IndexNow 200 for all six

Owner: "pushed and deployed, verify production and run the indexnow push."
Verified over HTTP minutes later: **all six guide URLs 200**, one `<h1>`,
**3/3 JSON-LD** (JewelryStore + BreadcrumbList + FAQPage), per-locale
canonicals, no robots meta, and every owner-corrected string live (9k ·
375, 14KP · 18KP, 14K HGE · 18K HGE, the dental send-out answer, "We do not
issue written insurance appraisals"). Parent-page guide links live on all
four parents + `/sell` ×2 locales. Sitemap **200 `<loc>`**, the six guides
at `2026-09-02` / monthly / 0.6 (56 URLs carry the new lastmod).
`npm run indexnow -- --urls=<the six>` → **IndexNow 200 OK for 6 URL(s)**.
**Still owed (owner-side, quota):** GSC Request Indexing — 12 URLs now (4
parked + `/watch-buyers` ×2 + these six); Bing Request indexing for the
six is optional (IndexNow already told Bing). Build record follows.

Owner, after the watch/logo deploy: **"start the gold-worth pilot and all
the rest of the recommended guides."** All three built on the
`/silver-services/flatware-value` template (hero → mark/karat tables →
worked math or sort steps → "worth more than melt" → 5-question FAQ with
FAQPage + BreadcrumbList schema → CTA with a clay mark), each nested under
its parent service page so the URL itself carries the topic:

| Page | Title (with brand suffix) | Parent | Mark |
|---|---|---|---|
| `/gold-services/what-is-my-gold-worth` | What Is My Gold Worth? (46) | `/gold-services` | `goldbar` |
| `/jewelry-appraisal/hallmarks` | Hallmarks: Real Gold or Silver? (55) | `/jewelry-appraisal` | `microscope` |
| `/estate-services/selling-inherited-jewelry` | Selling Inherited Jewelry: A Guide (58) | `/estate-services` | `heirloom` |

**Wiring:** `sitemap.ts` +3 paths (priority 0.6, monthly; `CONTENT_LAST_MODIFIED`
→ **2026-09-02**, so every lastmod moves on deploy); guide-link lines on
`/gold-services` (after the karat cards), `/estate-services` (after How It
Works), `/jewelry-appraisal` (after the FAQ), `/sell` ("Full guides:" line
after "Melt is the floor"); the guides cross-link each other and the
flatware guide. NOT in the footer (the footer lists service landers, not
guides) and NOT on the homepage.

⛔ **Claims are limited to copy the site already ships** — the karat table
and the 20 g / 14k / $2,600 worked example are the ones on `/sell`; the
"one evaluation, not five" and executor lines come from `/estate-services`;
the hallmarks guide says plainly that the shop does **not** issue written
insurance appraisals and that a stamp is never the final word (touchstone +
electronic test in the shop; XRF referred out — as `/jewelry-appraisal`
already states). Legal questions on the inherited-jewelry page (probate,
who may sell) are deferred to the family's attorney, not answered.

✅ **Owner read the 15 FAQ answers 2026-09-02 and asked for four changes,
all applied and re-gated** (`tsc` · lint · build exit 0 · 74 = 34/34/6 ·
both guides ×2 locales re-verified over HTTP, 3/3 JSON-LD, FAQPage text
updated):

1. **Dental gold** — the shop CANNOT determine its karat in store; dental
   gold is **sent out for testing to establish the exact karat before
   purchase**, and the offer is set from that result. The FAQ answer now
   says exactly that (rule recorded in `DECISIONS.md`).
2. **Karat table** now runs 8k · 333 through 24k · 999 including 9k, 12k,
   15k, 20k, 21k, 23k, plus a "14KP · 18KP = plumb" row, with a note under
   the table on sub-10k gold (real gold, below the US minimum to be sold as
   "gold") and the odd standards.
3. **"Marks that do NOT mean solid gold"** now lists **14K HGE · 18K HGE**
   on its own row ("the karat describes the plating, not the piece").
4. **14KP = karat plumb, NOT "plated"** — stated in the karat table and
   the note paragraph.

The same three facts (9K row, karat-prefixed HGE row, KP-is-not-plated)
were mirrored into the hallmarks guide's gold / not-gold tables so the two
guides cannot contradict each other; descriptions now read "8k–24k" (gold)
and "9K–24K" (hallmarks). The hallmarks and inherited-jewelry FAQ answers
were approved as built.

**Gate (final tree):** `tsc` clean · lint clean (one fix: the hallmarks
`MarkTable` helper was defined inside the page function —
`react-hooks/static-components` — now module-level with `isEs` as a prop) ·
**114/114 test files (1192 tests, unchanged)** · build exit 0 · **74 = 34 EN
+ 34 ES + 6** (was 68 = 31/31/6; +3 per locale) · dev server: all six URLs
200, one `<h1>`, **3/3 JSON-LD parse** (JewelryStore + BreadcrumbList +
FAQPage), canonicals per locale, cross-links present, parent-page links on
all four parents ×2 locales, sitemap **200 `<loc>`** (was 194; +6). Titles
≤ 58 chars with suffix; EN descriptions trimmed to ≤ 160 (the inherited
title was 65 and two descriptions 178/191 on the first pass).

✅ **STAGING SYNCED 2026-09-01 (late night) — ready to copy to the repo and
push.** Dry run queued exactly **13 files** (3 new guide pages, the 4 parent
pages, `sitemap.ts`, 5 docs) with **0 Extras**, verified BEFORE the real
run. Real run: **13 copied / 3 new dirs / 0 Extras / 0 Mismatch / 0 FAILED**
(robocopy exit 1 = copied only); follow-up dry run **0, exit 0**. **902
files / 20.84 MB** (robocopy total 905 = the documented 3 `/XF`-excluded;
902 = the previous 899 + the 3 guides). Leak check clean — 0 `.git` (dir
or file), `worktrees`, `node_modules`, `.next`, `.env*`, `*.log`,
`*.tsbuildinfo`, `next-env.d.ts`, `*.pem` — against a **189 = 189 `.tsx`
positive control** (source and staging counted with the same filter; the
dry run's named 13-file list is the bound on what entered staging). Staged
content verified by **SHA-256 equality with source** for all three guide
pages, `sitemap.ts`, `sell/page.tsx`, `TASKS.md`; staged `sitemap.ts`
carries the 3 guide paths and `new Date('2026-09-02')`. (Docs-only
re-sync follows this record, per the standing second step.)

✅ **RE-SYNCED 2026-09-02 after the owner's FAQ corrections:** dry run
queued exactly **5 files** (the two corrected guides + CHANGELOG /
DECISIONS / TASKS), **0 Extras**; real run 5 copied / 0 Mismatch / 0 FAILED;
follow-up dry run **0, exit 0**; both guide pages SHA-256-identical to
source; the staged gold guide carries the dental send-out answer, the
`14K HGE · 18K HGE` row and the `9k · 375` row; leak check 0 / 0 / 0 / 0
at **902 files**. Docs-only re-sync follows this record.

**After deploy:** from `next-app/`,
`npm run indexnow -- --urls=/gold-services/what-is-my-gold-worth,/es/gold-services/what-is-my-gold-worth,/jewelry-appraisal/hallmarks,/es/jewelry-appraisal/hallmarks,/estate-services/selling-inherited-jewelry,/es/estate-services/selling-inherited-jewelry`;
verify the six URLs 200 with FAQPage schema and the sitemap at 200 URLs
with `2026-09-02` lastmods; GSC requests when quota allows (see the parked
list below). Later, owner-supplied: **real photos of hallmarks from the
shop's own bench** for the hallmarks guide (never stock images) — the page
is built to take a photo row without restructuring.

### ✅ DEPLOYED + production-verified 2026-09-01 (night): /watch-buyers + schema logo switch + "Naples Jewelry Buyers" logo REMOVED

Verified over HTTP after the owner's push: JSON-LD `logo` reads
`…/branding/nav-logo.webp` on `/`, `/es`, `/sell/naples`;
`https://naplesestatejewelry.com/logo.png` **301 → nav-logo.webp**; the old
`branding/logo.webp` URL **404**; `/watch-buyers` + `/es/watch-buyers` 200
with 3/3 JSON-LD; sitemap 194; footer-scoped ES check **25/26** as
predicted. `npm run indexnow -- --urls=/watch-buyers,/es/watch-buyers` →
**200 OK**. Google refetches the schema logo on its own schedule. Build
record below is historical.

Owner, 2026-09-01 night: **"approve the watch page copy, switch the logo,
remove the naples jewelry buyers logo entirely from this site."** All three
done and gated on one tree:

- `/watch-buyers` ×2 — copy approved as built (record below).
- **Schema `logo` → `nav-logo.webp`** in `[locale]/layout.tsx` and
  `sell/[city]/page.tsx` (the octopus; 157×120 clears Google's 112px
  minimum — a larger square version would be an upgrade whenever the owner
  has one).
- **`public/assets/images/branding/logo.webp` DELETED** (hash-verified
  backup in the session scratchpad only, not the repo). Its only other
  reference, the legacy `/logo.png` redirect in root `netlify.toml`, now
  points at `nav-logo.webp`. `logo2.webp` ("Naples Antiques & Estate
  Jewelry" wordmark, reached only by the `/logo2.png` legacy redirect) was
  NOT touched — not asked for; flag if it should go too.

**Gate (final tree):** `tsc` clean · lint clean · 1192/1192 · build exit 0 ·
**68 = 31 EN + 31 ES + 6** · dev server: JSON-LD `logo` reads
`…/branding/nav-logo.webp` on `/`, `/es`, `/sell/naples`; `nav-logo.webp`
200 (16,174 B); `logo.webp` **404**; `/watch-buyers` + `/es/watch-buyers`
200 with 3/3 JSON-LD, crossover/footer/city-card links, 2 sitemap entries.

✅ **STAGING SYNCED 2026-09-01 (night) — ready to copy to the repo and
push.** Dry run queued exactly **12 files** (`netlify.toml`, `sitemap.ts`,
`layout.tsx`, `jewelry-appraisal`, `sell/[city]`, NEW `watch-buyers`,
`SiteFooter.tsx` + 5 memory docs) and exactly **1 Extra — the removed
`branding/logo.webp`**, verified by name BEFORE the real run (the guard
allows that one file and nothing else). Real run: **12 copied / 1 new dir /
1 Extra deleted / 0 Mismatch / 0 FAILED** (robocopy exit 3 = copied +
extras removed); follow-up dry run **0, exit 0**. **899 files / 20.49 MB**
(robocopy total 902 = the documented 3 `/XF`-excluded). Leak check clean —
0 `.git` (dir or file), `worktrees`, `node_modules`, `.next`, `.env*`,
`*.log`, `*.tsbuildinfo`, `next-env.d.ts`, `*.pem` — against a **185 = 185
`.tsx` positive control** (184 + the watch page). Staged content verified
(UTF-8 reads): watch page present, `logo.webp` gone, `layout.tsx` schema
logo = `nav-logo.webp`, `netlify.toml` `/logo.png` → `nav-logo.webp`,
`sitemap.ts` carries `/watch-buyers`.

**After deploy:** `npm run indexnow -- --urls=/watch-buyers,/es/watch-buyers`
from `next-app/`; request both in GSC when quota allows; confirm
`https://naplesestatejewelry.com/logo.png` 301s to the octopus and the old
`logo.webp` URL 404s; the footer-scoped ES check now expects **25/26**.
Google will refetch the schema logo on its own schedule.

📜 Build record (the page):

The one buy category with no service page. Evidence: every `/sell/[city]`
card already said "Rolex, Omega, Cartier, and vintage timepieces, running or
not, with or without box and papers" and **linked nowhere** (`href: null`,
comment "no service page yet"), and GSC shows queries with no lander —
"sell jewelry watch naples", "fort myers cartier watch buyer", "sell rolex
submariner fort myers", "vintage watch buyer near me", "sell watches for
cash". Built on the `/diamond-buyers` template (same honest resale-vs-retail
framing, 3 offer factors, timeline band, 5-question FAQ with FAQPage
schema, crossover line, final CTA with the `watch` clay mark).

⛔ **Every claim was taken from copy the site already ships** (city cards,
`/free-evaluation`, the FAQ's signed-brand list incl. Patek Philippe) or is
an objective secondary-market fact. Nothing about pricing method,
authentication tooling, or brand preferences was invented. **The owner
should read the FAQ answers and the three factor cards before this goes
live** — especially "Which brands do you buy?" and "Do you buy watches that
are not running?" — and correct anything that is not how they actually
operate.

**Files:** NEW `src/app/[locale]/watch-buyers/page.tsx`; `sitemap.ts`
(+`/watch-buyers`, priority 0.8); `SiteFooter.tsx` (+"Sell Watches" /
"Vender Relojes"); `sell/[city]/page.tsx` (watch card now links);
`jewelry-appraisal/page.tsx` (watch card → `/watch-buyers` instead of the
evaluation form).

**Gate:** `tsc` clean · lint clean · **1192/1192** · build exit 0 ·
**68 prerendered = 31 EN + 31 ES + 6** · dev server: both locales 200, one
`<h1>`, titles 50/52 chars, descriptions 151/165, **3/3 JSON-LD blocks
parse** (JewelryStore + BreadcrumbList + FAQPage), crossover anchors to
gold / diamonds / sterling silver / estate jewelry, footer "Sell Watches",
`/sell/naples` card links, 2 sitemap entries.

**NOT staged yet** — staging still holds the sitemap-bump/description batch
above. On the owner's yes: sync staging (expect ~5 app files + docs), push,
then `npm run indexnow -- --urls=/watch-buyers,/es/watch-buyers` and a GSC
request for both once quota allows. ⚠️ The ES footer check will then read
**25/26**.

### ✅ DONE 2026-09-03 (record) — GSC: 12 indexing requests owed (4 parked + /watch-buyers ×2 + the six 09-02 guides) — quota was EXCEEDED on the first try 2026-09-01 (late); ~10/day, so 2–3 sessions

✅ **Settled 2026-09-03:** 4 were already indexed (`/es/watch-buyers`,
`/es/silver-services/flatware-value`, `/diamond-buyers`,
`/es/diamond-buyers`); the other 8 were requested and each returned
"Indexing requested" (six guides, `/watch-buyers`,
`/silver-services/flatware-value`). Recheck item at the top of this file.
The text below is the pre-09-03 record.

Order when quota opens: the six guides first (newest, no other discovery
signal on Google yet), then `/watch-buyers` ×2, then the four parked. Drive
the inspect box in the owner's Chrome (their standing ask — not the in-app
pane): `find` the combobox → `form_input` the URL → Return; stop on the
first "Quota Exceeded".

`/es/jewelry-appraisal` turned out to be **already "URL is on Google"** (no
request needed — struck from the list). The first real request,
`/silver-services/flatware-value` ("Discovered – currently not indexed"),
returned **Quota Exceeded** immediately, so per the standing rule nothing
else was tried. Still owed: `/silver-services/flatware-value`,
`/es/silver-services/flatware-value`, `/diamond-buyers`,
`/es/diamond-buyers`, `/watch-buyers` ×2 (live since 09-01 night), and the
three guides ×2 once the 09-02 batch is deployed — **12 in all**, so plan on
two or three days of quota. ℹ️ Driving GSC's
inspect box: `find` the combobox ref → `form_input` the URL → `Return`
(typed keystrokes were swallowed, exactly as the 08-31 trap says); there
is no working deep-link URL for inspection.

### ◻ Citations audit 2026-09-01 (late) — mostly a clean slate; two things to know

Searched Bing for the business name on the usual directories:

- **Yelp — claimed and current.** 6240 Shirley St, (239) 404-8505, 11–3
  hours, 3 reviews, "Visit us on Shirley Street". (Bing's cached snippet
  still shows the OLD "private, mobile, appointment-only" copy — that is
  Bing's cache, not the live listing.)
- **Instagram, Facebook** — exist (in `SAME_AS`). The Facebook page is
  public (bio: "Trusted estate jewelry buyer serving Southwest Florida…",
  category Jewelry/watches, website `.com`); its About text did not expose
  phone/address/hours to a read, so ◻ the owner should confirm those three
  fields are filled in with the NAP below.
- ✅ **Citation kit delivered to the owner 2026-09-01 (night)** — a
  ready-to-paste file (NAP, hours, GBP description + short version,
  categories, service area, socials, photo list, and the six directories to
  create in order with their start URLs). Every one of those needs the
  owner's own account, which is the boundary of what can be done from here.
- **Bizapedia** (scrapes Sunbiz) shows the LLC's registered **principal
  address 4243 30th Ave SW, Naples 34116**, not the showroom. That is the
  state filing, not a directory to edit — if the owner wants the public
  record to read Shirley St, it is a Sunbiz principal/mailing-address
  update (an LLC filing decision, not a site task).
- **Not found anywhere:** BBB, YellowPages, Nextdoor, MapQuest, Chamber of
  Commerce, Manta, Foursquare, Apple Business Connect (not checkable
  without login). These are the citation opportunities.

**The NAP to use everywhere, verbatim** (from `business-location.ts` /
the JSON-LD): **Naples Estate Jewelry · 6240 Shirley St, Ste 104, Naples,
FL 34109 · (239) 404-8505 · https://naplesestatejewelry.com** · hours from
Admin → Store Hours (currently Mon–Fri 11–3, Sat 11–4). ⛔ Never "Naples
Antiques LLC" (legal entity, not a trading name) and never the `.co`.
Suggested order: Apple Business Connect (Apple Maps + DuckDuckGo), then
Nextdoor, BBB, YellowPages, Chamber. All need the owner's accounts.

### ✅ RESOLVED (deploy item above) — brand asset finding — the JSON-LD `logo` was the WRONG mark

`[locale]/layout.tsx:51` and `sell/[city]/page.tsx:191` set the JewelryStore
`logo` to `/assets/images/branding/logo.webp`, which is a **160×160 "Naples
Jewelry Buyers"** artwork — a different trading name (the one removed from
`sameAs` on 08-28). `logo2.webp` is "Naples Antiques & Estate Jewelry"
(the legal-entity wordmark, also not the brand). The only current-brand
file is `nav-logo.webp`, the octopus (157×120 — clears Google's 112px
minimum). ◻ Owner call: point the schema `logo` at `nav-logo.webp` now
(consistent with the favicon decision of 08-16), and ideally supply a
square octopus + wordmark logo for schema/social later. Two-line change
once decided.

### 🔴 DEPLOY the 2026-09-01 (latest) pre-deploy finish: sitemap `lastmod` bump + description trim (no SQL, no env vars)

Two app files + two structure docs, gated (`tsc` · lint · **1192/1192** ·
build exit 0 · 66 = 30/30/6), dev-verified (`/about` `<lastmod>` =
`2026-09-01`; EN description 151 chars, ES 190):

- `next-app/src/app/sitemap.ts` — `CONTENT_LAST_MODIFIED` 08-29 → **09-01**
  (today's copy changes on 7 pages + the homepage card were unsignalled)
- `next-app/src/app/[locale]/silver-services/flatware-value/page.tsx` —
  description trimmed (EN 173 → 151, ES 210 → 190); claims unchanged
- `project-docs/STRUCTURE.md`, `project-docs/INTEGRITY.md` — IndexNow,
  sitemap-freshness and `LinkedPhrase` rows; checklist line

✅ **STAGING SYNCED 2026-09-01 (latest) — ready to copy to the repo and
push.** Final-tree `tsc` 0 · lint 0. Dry run queued exactly **7 files** (the
2 app files + `STRUCTURE.md`, `INTEGRITY.md`, `CHANGELOG.md`,
`CURRENT_STATUS.md`, `TASKS.md`), **0 Extras**; real run **7 copied / 0
Mismatch / 0 FAILED**; follow-up dry run **0, exit 0**. **899 files / 20.46
MB** (robocopy total 902 = the documented 3 `/XF`-excluded). Leak check
clean — 0 `.git`, `worktrees`, `node_modules`, `.next`, `.env*`, `*.log`,
`*.tsbuildinfo`, `next-env.d.ts`, `*.pem` — against a **184 = 184 `.tsx`
positive control**. Staged `sitemap.ts` carries `new Date('2026-09-01')`;
the staged flatware page was verified by **SHA-256 equality with source**
(⚠️ a `Get-Content -Raw` substring check on the `×` character read False
under PowerShell 5.1's default encoding — a false negative; use
`-Encoding UTF8` or a hash for any file containing non-ASCII).

**After deploy:** nothing to run — this batch changes no URLs (IndexNow not
needed); Google picks the new `lastmod` up on its next sitemap read.
ℹ️ Bing's "Title too long" on `/sell` (76 chars) was deliberately NOT
acted on — see `CHANGELOG.md`.

### ✅ DEPLOYED 2026-09-01 (late) + FIRST INDEXNOW PUSH DONE — key file + matcher fix + `npm run indexnow`

Owner approved ("go ahead with 1 and 2"), pushed and deployed the same
night. **Verified on production:** `/5f41b4c6500c156c3ddaec86d7e313b6.txt`
→ **200 `text/plain`, body = the key** (CDN `Age` 0); `/`, `/es`,
`/robots.txt`, `/sell/naples` all 200 (the matcher change broke nothing).
`npm run indexnow -- --dry-run` read **192** URLs from the live sitemap;
`npm run indexnow` → **IndexNow 202 Accepted for 192 URLs** (202 = accepted,
key validation pending — the normal first-call response). ℹ️ 192, not the
198 Bing imported this morning: the sitemap drops sold products, so the
delta is inventory movement, not a missing page. ◻ Next day: Bing
Webmaster Tools → IndexNow should list the submission and Site Explorer's
indexed count should start climbing from ~15. Standing procedure: run
`npm run indexnow` after any deploy that adds, removes or retitles URLs.

📜 Build record:

✅ **STAGING SYNCED 2026-09-01 (late) — ready to copy to the repo and
push.** Dry run queued exactly **8 files** (the 4 app files below + 4
memory docs), **0 Extras**; real run **8 copied / 0 Mismatch / 0 FAILED**;
follow-up dry run **0, exit 0**. **899 files / 20.45 MB** on disk (robocopy
total 902 = the documented 3 `/XF`-excluded). Leak check clean — 0 `.git`
(dir *or* file), 0 `worktrees`, 0 `node_modules`, 0 `.next`, 0 `.env*`,
0 `*.log`, 0 `*.tsbuildinfo`, 0 `next-env.d.ts`, 0 `*.pem` — against a
**184 = 184 `.tsx` positive control**. Staged content verified by bytes:
key file present with the exact key, `proxy.ts` carries `|pdf|txt)`,
`scripts/indexnow-submit.mjs` present, `package.json` carries `"indexnow"`.
(Docs-only re-sync follows this record, per the standing second step.)

**Files:**

- NEW `next-app/public/5f41b4c6500c156c3ddaec86d7e313b6.txt` — the IndexNow
  key, served at the site root. ⚠️ **Not a secret** (the protocol requires
  it to be publicly readable; it is how Bing proves the submitter owns the
  host) — it is deliberately NOT in `.env`.
- `next-app/src/proxy.ts` — `txt` added to the matcher's extension
  exclusions so the key file bypasses the next-intl locale rewrite
  (`robots.txt` was already carved out by name for the same reason).
- NEW `next-app/scripts/indexnow-submit.mjs` + `"indexnow"` script in
  `package.json` — reads every `<loc>` from the LIVE sitemap and POSTs them
  to `api.indexnow.org` (fans out to Bing, Yandex, Seznam, Naver). Refuses
  to run until it reads the key back from the live site. `--dry-run` lists
  without sending; `--urls=/a,/b` submits an explicit list.

**Gate:** `tsc` clean · lint clean · **1192/1192 (114 files)** · build exit 0 ·
**66 = 30 EN + 30 ES + 6, `en === es`** · dev server: `/<key>.txt` → **200
`text/plain`, body = key**; `/robots.txt`, `/`, `/es` unaffected (200) ·
`npm run indexnow -- --dry-run` correctly refuses against production
(404 — key not live yet).

**After the push (do in this order):**

1. `curl https://naplesestatejewelry.com/5f41b4c6500c156c3ddaec86d7e313b6.txt`
   → must be 200 with exactly the key (if it is HTML, the matcher change did
   not deploy).
2. From `next-app/`: `npm run indexnow -- --dry-run` (expect **198**), then
   `npm run indexnow` (expect **200** or **202**; 202 = accepted, key
   validation pending — normal on the first call).
3. Next day: Bing Webmaster Tools → **IndexNow** should list the submission;
   Site Explorer's indexed count should start climbing from ~15.

**Standing procedure from now on:** run `npm run indexnow` after any deploy
that adds, removes or retitles URLs (new product batch, new page, sitemap
changes). ◻ Optional later: an automatic ping from the product-status hooks
so a sale drops the product from Bing within minutes — not built; it
touches the payment-path hooks and deserves its own session.

### ◻ 2026-09-01 — Bing Webmaster Tools: imported from GSC, index is THIN (~15 of 198 URLs); actions below

Owner imported the property into Bing Webmaster Tools (both
`naplesestatejewelry.co` and `.com` are in the account, alongside the
owner's other sites). Checked the same evening:

- **Sitemap: fine.** `https://naplesestatejewelry.com/sitemap.xml`
  imported 9/1/2026, last crawl 9/1/2026, **Success, 198 URLs** — the full
  bilingual sitemap. Nothing to do.
- **Index coverage: thin.** `site:naplesestatejewelry.com` on Bing returns
  **~15 results** (`/`, `/shop`, `/about`, `/faq`, `/free-evaluation`,
  `/silver-services`, `/es`, `/es/bullion`…) against Google's ~192. URL
  Inspection: `/` and `/silver-services` **Indexed**, but **`/sell/naples`
  is "Discovered but not crawled"** — i.e. the six city pages (the
  best-ranking family on Google) are absent from Bing. No block anywhere:
  Bingbot fetches return 200 with no robots directives and correct
  canonicals; `robots.txt` allows `/` and declares the sitemap.
  Site Explorer / Recommendations / URL Submission all still say "no data"
  — the 48-hour post-import processing banner is literal; re-check after
  2026-09-03.
- **IndexNow: not set up.** Would need a key file served from the site
  root (`next-app/public/<key>.txt`) plus one bulk POST of the 198 sitemap
  URLs to `api.indexnow.org`, and ideally a ping when products change (the
  reconcile sweep or admin save). It pushes the whole site into Bing,
  Yandex, Seznam, Naver at once and keeps sold-out product pages current.
  Small code change — **ask before doing**.
- **"Alt attribute missing" notice (4 on `/`, 3 on `/silver-services`) is
  a FALSE POSITIVE.** Every flagged `<img>` is a decorative clay mark with
  `alt=""` + `aria-hidden="true"` — the correct pattern (Lighthouse a11y is
  100). ⛔ Do not add alt text to them to satisfy Bing; it would make screen
  readers announce decoration.
- **Bing Places for Business — unverified.** A Bing search for the business
  name + street showed no local panel, only organic results, which usually
  means no (or an unclaimed) listing. bingplaces.com was not signed in, so
  this needs the owner: sign in and use **"Import from Google Business
  Profile"** — it mirrors the GBP (hours, photos, categories) and is the
  Bing/Copilot/DuckDuckGo-adjacent equivalent of the GBP work already done.
- ℹ️ `site:` trap: with `&count=30` Bing silently redirected (`rdr=1`) to
  generic cruise/landscaping results that looked like "zero indexed";
  without the param it returned the real ~15. Verify with a brand query
  or URL Inspection before concluding a domain is absent.

✅ **DONE 2026-09-01 (late) — 27 URLs submitted via URL Inspection →
Request indexing, every one "Success : URL submitted successfully".**
EN: the 6 `/sell/[city]` pages, `/sell`, `/gold-services`, `/estate-jewelry`,
`/bullion`, `/trade-in`, `/estate-services`, `/jewelry-appraisal`,
`/diamond-buyers`, `/silver-services/flatware-value`. ES: the 6 city pages,
`/es/silver-services`, `/es/gold-services`, `/es/estate-jewelry`,
`/es/jewelry-appraisal`, `/es/diamond-buyers`,
`/es/silver-services/flatware-value`. Bing's quota read **100/day** and
ended at 59 (two Chrome-extension drops forced ~14 resubmits; duplicates
are harmless). Method: `urlinspection?urlToInspect=<double-URL-encoded>`
deep link → JS-click "Request indexing" → "Submit".

🔴 **Found while submitting — the 08-30 pages were stuck on the 404's
`noindex`.** `/jewelry-appraisal` and `/diamond-buyers` showed "Crawl
allowed: Yes · Page Fetch: Successful · **Indexing allowed: No**" with a
last crawl of **31 Aug 10:36** — Bing fetched them before that morning's
deploy landed and recorded the not-found page, which correctly carries
`<meta name="robots" content="noindex">`. The live pages have no robots
directive. Re-requesting them forces a fresh fetch. ⛔ Standing rule (also
in DECISIONS): **after any deploy that adds pages, request indexing in BWT
or run `npm run indexnow` the same day**, so Bing's first fetch is the real
page, not the 404.

ℹ️ Bing's SEO analyzer flags two indexed pages: `/sell` **"Title too long"**
(76 chars with the brand suffix — Google-trimmed on 08-16 to keep the
qualifier, Bing's limit is tighter) and `/silver-services/flatware-value`
**"Meta Description too long or too short"** (173 chars). Cosmetic; decide
whether Bing's thresholds are worth a retitle before touching either.

✅ **Bing Places for Business — IMPORTED from the Google Business Profile
2026-09-01 (late).** Owner signed in (Microsoft account, then the Google
consent); the "Import from your Google Business Profile" path ran with
**weekly GBP→Bing sync ON** (recommended default, kept deliberately: the
owner changes hours on the fly and the GBP is the copy they maintain).
Result: **verified instantly, "Pending publish" — Bing's ETA 7–12 days**,
`bizid f818777b-f86a-49a8-82b4-9d7025178d85`, GBP store code
`04174729584373572986`. Every imported field checked against the live
JSON-LD: name, phone, 6240 Shirley St Suite 104 / 34109-6253, `.com` URL,
hours **Mon–Fri 11–3 · Sat 11–4** (matches the admin-panel hours the site
serves today), the six `areaServed` cities as service areas, "customers
visit this address — show full address" (store-first), Instagram + Facebook
(+ WhatsApp from GBP), 12 photos, the GBP description.

- ✅ **Email added by the owner the same night:**
  `info@naplesestatejewelry.com` (the one monitored mailbox) — verified on
  the listing.
- One cosmetic item left alone — **Categories:** primary "Gold buyer"; additional "Coin dealers, **Gold
  buyer** (duplicate of the primary), Diamond dealer, Jewelry store, Estate
  liquidation, Professional services". The duplicate comes from two GBP
  categories mapping to one Bing category; with weekly sync on, a manual
  dedupe may be re-imported. Cosmetic — Bing will likely collapse it on
  publish. Leave unless it survives publication.
⚠️ Name/address/phone/website are LOCKED in Bing ("update your information
in Google and sync again") — NAP changes go through the GBP, never Bing.

**Still owner-side:** re-check BWT Site Explorer after 2026-09-03 for the
indexed count (was ~15) and any crawl errors; watch for Bing's "listing
published" email (7–12 days), then search the business name on Bing to see
the local panel.

### ✅ DEPLOYED 2026-09-01 + PRODUCTION-VERIFIED — /silver-services internal-linking pass + homepage silver card (no SQL, no env vars)

**Owner pushed the same evening; production verified minutes later (CDN
`Age` 39–42s).** All **14** page/locale combos return 200 with the intended
`/silver-services` body anchor (bullion / gold-services / about →
"sterling silver" / "plata esterlina"; estate-jewelry + faq → "…flatware and
hollowware" / "cubertería y vajilla…"; sell → "Sterling silver flatware";
trade-in → "sterling silver flatware" / "cubiertos de plata esterlina").
Homepage `/` and `/es` serve **four strip `<h2>`s with the silver card
second** and the "Sell silver →" / "Vender plata →" anchor; the
`home-services-grid` class is in the HTML and **1 of 3 deployed CSS bundles
carries `.home-services-grid`**. ES footer reads "Vender Plata Esterlina"
on every ES page. Footer-scoped ES check: **24/25 + ES chrome** on `/es/*`,
**0/25 + EN chrome** on the English twins — identical to the 08-31 figures,
no regression.

✅ **PSI re-check DONE the same evening — no movement, nothing outstanding.**
Mobile ×5 (pagespeed.web.dev, Moto G Power / Slow 4G, Lighthouse 13.4.1):
**72 · 91 · 79 · 77 · 79** (median 79) — the documented bimodal shape
exactly: the 72 was the hero-image mode (LCP 9.1s, LCP element = a
carousel card `<img fetchpriority="low">`, element render delay 2,950ms),
the 77/79/79 the banner mode (LCP 4.4–4.5s), the 91 a high draw (LCP
3.3s). A11y / Best Practices / SEO **100 / 100 / 100 on all five**, CLS 0
on all five. Desktop ×3: **70 · 95 · 99** — the 70 was a slow-worker draw
(TBT 620ms against 160ms and 20ms on the other two, with LCP 0.9s / 0.5s /
0.5s), i.e. the "TBT-noise draw" the 08-23 entry already describes.
Baseline for comparison (08-23): mobile 98/80/80/71, desktop 86 (TBT
noise) and 96–98. ⛔ Still the standing rule: never change code off a
single PSI run. ℹ️ Method notes: the keyless PSI API 429s immediately —
use the web UI; the Browser pane's `wait` caps at 10s per step; two
parallel lanes both finish but slow each other, and one run came back
"Unable to resolve <url>" (Google-side transient, the site was serving).

📜 Build record (kept for the file list and gate):

✅ **STAGING SYNCED 2026-09-01 — ready to copy to the repo folder and push.**
Dry run queued exactly **17 files** — the 10 edited app files, the 3 new
files (`LinkedPhrase.tsx`, `link-phrase.ts`, its test) and the 4 memory docs
— i.e. this session file-for-file, nothing leaking in. Real run **17 copied
/ 0 Extras / 0 Mismatch / 0 FAILED**; follow-up dry run **0 to copy, exit
0**. **897 files / 20.43 MB** on disk (robocopy total 900 = the documented 3
`/XF`-excluded). Leak check clean — 0 `.git` (dir *or* file), 0
`worktrees`, 0 `node_modules`, 0 `.next`, 0 `.env*`, 0 `*.log`, 0
`*.tsbuildinfo`, 0 `next-env.d.ts`, 0 `*.pem` — against a **positive
control of 184 `.tsx` matching source exactly**. Staged-content checks
(bytes, not filenames): the 3 new files present by `-LiteralPath`;
`globals.css` carries `.home-services-grid` ×3 (base + 2 media);
`(home)/page.tsx` carries "We Buy Sterling Silver in Naples" and the
`home-services-grid` class (its single `md:grid-cols-3` hit is the comment
recording it as dead); `SiteFooter` reads "Vender Plata Esterlina"; `faq`
and `trade-in` import `LinkedPhrase`; bullion / gold-services /
estate-jewelry / about each reference `silver-services`; hidden paths
present (`.github/workflows/scheduled-jobs.yml`, `.gitignore`,
`.claude/launch.json`, `next-app/.npmrc`, `netlify.toml`); the standing CSP
hazard reads **1 hit each** for `maps.google.com` in root `netlify.toml` and
`next-app/next.config.ts`. (ℹ️ Recording this drifts staging by memory docs
only until the standing docs-only re-sync below — done the same session.)

**Files (all EN + ES):**

- `src/app/[locale]/bullion/page.tsx` — Tip box links "sterling silver"
- `src/app/[locale]/gold-services/page.tsx` — sibling crossover line (+ `p()`)
- `src/app/[locale]/estate-jewelry/page.tsx` — sibling crossover line (+ `p()`)
- `src/app/[locale]/faq/page.tsx` — items-we-buy answer links the phrase via
  `LinkedPhrase` (JSON-LD string untouched)
- `src/app/[locale]/about/page.tsx` — Meet Chris paragraph links "sterling silver"
- `src/app/[locale]/trade-in/page.tsx` — step 1 copy + `LinkedPhrase`
- `src/app/[locale]/sell/page.tsx` — anchor text only
- `src/components/layout/SiteFooter.tsx` — ES label → "Vender Plata Esterlina"
- NEW `src/lib/link-phrase.ts`, `src/lib/__tests__/link-phrase.test.ts`,
  `src/components/LinkedPhrase.tsx`
- `src/app/[locale]/(home)/page.tsx` — fourth services-strip card "We Buy
  Sterling Silver in Naples" → `/silver-services` (owner chose B, later the
  same day); marks moved to a `mark` field
- `src/app/globals.css` — NEW `.home-services-grid` (columns pinned 1/2/4;
  the strip's Tailwind `md:grid-cols-3` had never applied — see DECISIONS)

**Gate (final tree, after the homepage card):** `tsc` clean · lint clean ·
**1192/1192 (114 files)** · build exit 0 · **66 prerendered = 30 EN + 30 ES
+ 6, `en === es`** · all 14 page/locale combos fetched from the dev server
list the intended `/silver-services` anchor · `/` and `/es` SSR show four
strip `<h2>`s with the silver card second · strip ladder measured 1/2/2/4/4
tracks at 375/700/900/1024/1280 with 0px overflow · 0 live console errors.

**After deploy:** open `/gold-services` and `/es/faq` and confirm the new
underlined silver link renders and resolves; open `/` and confirm four
cards with "We Buy Sterling Silver in Naples" second (2×2 on a tablet, four
across on desktop). ⚠️ The footer-scoped ES check (command under the 08-30
Spanish-footer entry) now expects the label **"Vender Plata Esterlina"** —
"Vender Plata" alone means the deploy did not land, not that the footer
regressed. 📊 Then **re-check PSI mobile across several runs** — the card is
below the fold with one lazy 88px WebP, so expect no movement; do not react
to a single number (bimodal rule).

### ✅ DECIDED + BUILT 2026-09-01 — homepage services strip: fourth silver card (owner chose B)

**Built the same day** ("do whatever one is best for capturing clients");
in the deploy item above. The option record below is kept for the
reasoning. 🔴 Building it exposed that the strip's `md:grid-cols-3` had
never applied (cascade layers — `DECISIONS.md`); columns are now pinned by
`.home-services-grid`.

The homepage carries 38 of the site's 44 clicks and has **no body link to
`/silver-services`** — the striking-distance page gets nav + footer only.
The services strip (`(home)/page.tsx` ~L241) is three deliberate `<h2>`
cards: "We Buy Gold in Naples" → `/free-evaluation`, "We Sell Estate Jewelry
in Naples" → `/shop`, "Direct Contact" → `/contact`.

Two options were rendered in-chat with the real tokens (Libre Caslon, Hanken
Grotesk, `#735c00`, `#f3f3f3` strip, `#d0c5af` rule):

- **A — inline link in the gold card, layout untouched.** Retitle to "We Buy
  Gold & Silver in Naples", body gains an underlined "sterling silver
  flatware" link; CTA stays Free evaluation →. Cheapest; passes a body link,
  no heading weight.
- **B — a fourth card (RECOMMENDED).** "We Buy Sterling Silver in Naples" →
  `/silver-services`, body "Flatware, tea services, and hollowware — priced by
  weight and by pattern, whichever is higher.", CTA "Sell silver →", clay mark
  `flatware`. Grid `md:grid-cols-3` → 4 (or 2×2). Gives the page an
  `<h2>`-weighted link from the highest-authority page — the exact signal the
  code comment at ~L243 says the homepage was starved of.

⛔ Per the show-design-before-building rule this stays unbuilt until the
owner picks. If B: the ClayMark union already has `flatware`; the card body
should not name makers (premium-pattern framing rule). Also noticed, not
changed and not part of this decision: the gold card links to
`/free-evaluation`, not `/gold-services` — presumably conversion-first.

ℹ️ **A homepage→silver body link was DEFERRED once before** (`CHANGELOG.md`
2026-08-30, item 5): the reasons were that the hero **BUY card is a single
stretched link** (a nested anchor breaks it), plus mockup-gating and LCP
sensitivity. Neither option above touches the hero — the services-strip
cards are plain `<div>`s with one `<Link>` CTA, so A's inline body link and
B's fourth card nest nothing; and the mockup gate is now satisfied. What
remains of that deferral is LCP: the strip is below the fold and B adds one
88px clay-mark WebP, so expect no movement — but re-check PSI **across
several runs** after deploy, never off a single number (bimodal rule).

### ✅ DEPLOYED 2026-08-31 + OWNER-CONFIRMED ON A COLD LOAD — hero reveal-gate fix

**Owner deployed same day, tested a genuinely COLD load, and confirmed the
second card now appears with the rest.** (Unlike the 08-30 confirmation,
which turned out to be a warm load, this one exercised the actual race.)
Production HTML verified serving the new gate: `.slice(0,2)` + `i.decode`
present, cap still `setTimeout(go,1800)`. Residual watch: a very slow
connection could still beat slot 1 past the cap — the reserve lever
(slot 1 → `fetchPriority: 'high'`, PSI-remeasured) stays documented below.

The backfill below fixed cache lifetimes but the owner STILL reproduced the
blank second card (regular Chrome, incognito, Edge). Second root-cause layer:
**both hero reveal gates waited on ALL 8 ring images with an 1800 ms cap** —
the inline `nej-hero-go` script in `(home)/page.tsx` and the React gate in
`HomeHero.tsx`. On any cold or stale-revalidating load the slowest of eight
always lost to the cap, so the hero unveiled with unready cards blank; slot 1
(the men's diamond ring, second-most-visible) is the one the owner catches.
The cap itself is LCP-load-bearing (PSI bimodal warning, 08-23) and was NOT
touched.

**Fix (gated, awaiting the owner's usual copy + push):** both gates now wait
on the **first two** card images only — the cards actually facing the visitor
at reveal, both `<link rel=preload>`ed at high/auto — and await
**`img.decode()`**, not just `load`, so a loaded-but-undecoded frame can't
paint blank. Two small preloaded images can beat the cap where eight never
could; reveal gets EARLIER on warm loads. Files:
`src/app/[locale]/(home)/page.tsx` (inline script) +
`src/components/home/HomeHero.tsx` (React gate — comments on both demand they
stay in step). Gate: `tsc` clean · lint clean · **1186/1186 (113 files)** ·
build **66 = 30 EN + 30 ES + 6** · dev-server verified (`nej-hero-go` +
`.is-ready` both flip, 0 console errors).

**After deploy, the owner's cold-load test is the acceptance test** (their
browsers still hold stale 1h-header copies until first revisit, so the FIRST
load may still revalidate — judge from the second cold-ish load onward).
If a slow connection still misses the cap for slot 1, the held-in-reserve
lever is `fetchPriority: 'high'` on slot 1 (contradicts the documented
one-high rule — would need PSI re-measurement across multiple runs).

### ✅ DONE 2026-08-31 (owner-approved) — cache-metadata backfill for pre-08-30 Storage objects

**Executed and verified same day.** Dry-run inventory: 942 objects in
`product-images`, **197 at `max-age=3600`** (all June-era; both hero rings in
the list), 745 already year-long. Backfill: **197/197 re-uploaded with the
same bytes** (sha256-verified identical before/after, 10.8 MB round-tripped,
0 failures, `update()` so URLs unchanged). Post-state: inventory reads
**942/942 at `max-age=31536000`**; fresh `/_next/image` variants of BOTH hero
rings now serve `public,max-age=31536000` and store at the edge for a year;
28 homepage-srcset variants (w=384–1080, Chrome Accept header) pre-warmed.
Old 1-hour edge entries expire within the hour and re-derive year-long.
**Cold-load blank-second-card should now be structurally gone** — owner
should confirm on a genuinely cold load (e.g. tomorrow morning).

**Symptom (owner-reported 2026-08-31):** the hero's second card (men's 10K
diamond ring) is blank again on COLD loads until it nearly rotates away; warm
loads are fine. The 08-30 `fetchPriority` fix is live and working (verified:
HTML emits high/auto/low + preloads; the ring is fetched 2nd; 10.6 KB WebP) —
the 08-30 "fixed" confirmation was simply a warm load.

**Root cause (proven 6/6):** Netlify's image CDN sets the transformed
response's TTL from the SOURCE object's stored `cacheControl` metadata.
Objects re-uploaded by the 08-30 re-encode carry `31536000` → transforms
cache **1 year**. The ~223 objects that were already valid WebP and were
therefore SKIPPED by the re-encode — including BOTH hero ring images (slot 0
`jsltovk1sr`, slot 1 `rqs5cw4bp89`, both June-17 uploads) — still carry the
old 1-hour metadata → transforms cache **max-age=3600**. On a low-traffic
site that means nearly every real visitor hits an expired edge entry, the
cold transform takes longer than the hero reveal's 1800 ms fallback
(`HomeHero.tsx`), and the second card unveils blank. ⚠️ The public Supabase
endpoint reports `Cache-Control: no-cache` for BOTH groups — do not probe
origin headers to tell them apart; correlate `Last-Modified` (< Aug 30 =
short group) with a fresh `/_next/image` variant's `max-age`.
ℹ️ `images.minimumCacheTTL` in next.config.ts is a no-op on Netlify — the
image CDN derives TTL from source metadata, not from Next config. New
uploads are already fine (`AdminShell.tsx:2925` sets `31536000`).

**Proposed fix (production Storage mutation — dry-run first, then approval):**
re-upload every `product-images` object with `Last-Modified` before the
08-30 re-encode window using the SAME bytes and `cacheControl: '31536000'`
(supabase `update()`), then verify a fresh ring variant serves
`max-age=31536000` and bytes hash-match. Backups from 08-30 still exist at
`C:\Users\rcman\NEJ-image-backup-2026-08-30`. No code change needed.

### ✅ DEPLOYED 2026-08-31 — the 2026-08-30 SEO growth batch (no SQL, no env vars)

**Production verified 2026-08-31 after the owner's push:** all 7 new/changed
routes return 200 in both locales; `/sell/naples` renders the buyer-noun H1 +
showroom band; `robots.txt` shows `Allow: /api/merchant-feed`; the feed
returns 200 with **76 items / 0 skipped / 0 sold** (sold rope chain absent,
Gorham knife present), headers `Content-Type: application/xml` +
`X-Robots-Tag: noindex`. Merchant Center swap + GSC follow-ups below.

Everything is gated (`tsc` · lint · **1186/1186 (113 files)** · build exit 0 ·
**66 prerendered = 30 EN + 30 ES + 6 non-locale**) and dev-server-verified in
both locales.

✅ **STAGING SYNCED 2026-08-31 — ready to copy to the repo and push.**
15 files copied (11 app + 4 project-docs), 4 new dirs, 0 failed; follow-up dry
run **0 to copy**. **894 files / 20.38 MB** on disk (robocopy total 897 = the
documented 3 `/XF`-excluded). The 3 new pages + `api/merchant-feed/route.ts`
literal-path-verified in staging (⚠️ `Test-Path` needs `-LiteralPath` for
`[locale]` paths — brackets are wildcards otherwise); `.git` absent.
(ℹ️ Doc-recording + docs-only re-sync done — the standing 2nd-sync step.)

**Files:**

- `src/lib/service-areas.ts` — per-city override fields + Naples entry
  (buyer-noun title/H1/meta, `hasShowroom`)
- `src/app/[locale]/sell/[city]/page.tsx` — metadata/H1 overrides, showroom
  band, walk-in FAQ, card-heading links
- `src/app/[locale]/jewelry-appraisal/page.tsx` — NEW
- `src/app/[locale]/silver-services/flatware-value/page.tsx` — NEW
- `src/app/[locale]/diamond-buyers/page.tsx` — NEW
- `src/app/[locale]/silver-services/page.tsx` — flatware band closing line now
  links the guide
- `src/app/[locale]/shop/[id]/page.tsx` — buy-side crossover band
- `src/components/layout/SiteFooter.tsx` — +"Sell Diamonds", +"Free Appraisals"
- `src/app/sitemap.ts` — +3 paths
- `src/app/api/merchant-feed/route.ts` — NEW (2026-08-31, Google Merchant
  product feed; see the Merchant Center block below)
- `src/app/robots.ts` — `/api/merchant-feed` carved out of the `/api` disallow

**After deploying:** spot-check `/sell/naples` + `/es/sell/naples` (new H1 +
showroom band with live hours), the three new pages in both locales, and one
gold + one silver product page (crossover band). Then request indexing for the
6 new URLs in GSC (quota permitting — it reset today). ⚠️ The footer-scoped ES
production check now expects **24/25** links (was 22/23) — the two new footer
links are the delta, not a regression.

🟡 **GSC indexing 2026-08-31: 1 of 6 done, then QUOTA EXCEEDED.**
`/jewelry-appraisal` (EN) requested successfully. Two blind Enter keypresses
then re-fired "REQUEST AGAIN" on that same URL (duplicates don't change queue
position but DO burn quota) and the 4th submission returned "Quota Exceeded —
try again tomorrow". ⚠️ **GSC UI trap to add to the list: after a request,
keyboard focus stays on the REQUEST AGAIN button — Enter re-submits it, and
typing goes nowhere until the inspect box is re-focused via its element ref
(coordinate clicks + type were silently swallowed).** Compensations done:
sitemap.xml **resubmitted** ("Sitemap submitted successfully") so the 6 new
URLs enter normal discovery.
⏸ **PARKED (owner decision, end of 2026-08-31 session)** — the remaining 5
indexing requests (`/es/jewelry-appraisal`, `/silver-services/flatware-value`
+ `/es/…`, `/diamond-buyers` + `/es/…`, optionally re-inspect `/sell/naples`)
are deliberately on hold, NOT owed on a schedule. The resubmitted sitemap
already queues all 6 URLs for normal discovery, so this is an accelerant,
not a requirement. Pick up only when the owner asks (quota resets daily).

**◻ Owner follow-ups from the SEO session:**

0. 🔴 **2026-09-01: the 08-30 GBP silver post was REMOVED by Google and
   posting was TURNED OFF for the profile** (email, Routing ID DPNB). Cause:
   the post text ended "Or call/text (239) 404-8505…" and Google's posts
   content policy flatly bans phone numbers in post content ("To avoid the
   risk of abuse, we do not allow your post content to include a phone
   number") — a drafting error on our side; it passed the instant check and
   was swept by the slower review ~2 days later. The silver/flatware content
   itself is fine. ⛔ **STANDING RULE: no phone numbers in GBP post text,
   ever — use the Call button/CTA instead.**
   ◻ Recovery: wait a few days and check whether the "Add update" button
   returns on the profile; if posting stays disabled, contact GBP support
   citing the routing ID. When restored, re-post the SAME text minus the
   call/text sentence (end instead with "Prefer we come to you? Book a free
   evaluation at the link below."), keep Learn more → /silver-services and
   the same JPG. Weekly post cadence is ON HOLD until posting is restored.

1. **GBP photo batch** (audit item 4, owner-held): exterior with the Sharon
   Lynch entrance, interior, testing bench/XRF in use, Chris at work, a
   flatware lot on the scale — then set a real photo as cover.
2. ✅ **Merchant Center setup COMPLETED 2026-08-30 (5/5 tasks, "You're all
   set")** — done in-session at the owner's request. Shipping = price-based
   table mirroring `checkout-shipping.ts` Standard tiers exactly
   ($0.01–99.99→$19 · 100–249.99→$25 · 250–599.99→$29 · 600–999.99→$35 ·
   1,000–2,499.99→$59 · 2,500–14,999.99→$99 (the two $99 bands merged) ·
   15,000+→$165), max handling 2 business days (owner-set). Returns =
   "defective products only" (maps to the site's 5-day misrepresentation
   guarantee), no exchanges, policy URL /returns-refunds, match-my-website
   attestation confirmed (Google may review, up to 10 days).
   ◻ **Watch:** products list read "No products added yet" right after setup —
   the "products found by Google" crawl source needs hours-to-days to ingest
   the site's Product schema. If still empty after ~a week, set up a real feed.
   ℹ️ A "Link to Business Profile" dialog offered ONLY the Surette profile
   (NEJ's likely already associated) — deliberately cancelled; never link the
   wrong business there.
   ⚠️ If the site's shipping tiers in `checkout-shipping.ts` are ever
   re-priced, update this Merchant Center table in the same change — nothing
   syncs them automatically.
   🆕 **2026-08-31 — the crawl source ingested 106 entries including all sold
   pages (correctly Out of stock, nothing mislisted — every entry was still
   "Under review") and BOTH locales of each product.** Owner flagged it. Fix
   BUILT: `/api/merchant-feed` (Google Shopping RSS; available products only;
   one entry per product keyed `nej-<inventory#>` — g:id caps at 50 chars so
   slugs can't be the key; canonical `getProductPriceValue` prices; fails
   closed with 503 when live spot is down, exactly like eBay/Etsy pushes, so
   Google keeps its last good copy; skip counts in an XML comment, never
   silent). `robots.ts` carves `/api/merchant-feed` out of the `/api`
   disallow (specific rule wins) and the route sends `X-Robots-Tag: noindex`.
   Verified on dev: 200, 76 items, 76/76 ids unique (max 7 chars), 0 sold
   items, 0 unescaped entities, headers correct.
   ✅ **MERCHANT CENTER SWAP DONE 2026-08-31** (on the owner's tab, at their
   request): (1) feed added as a data source — named **"Website Feed
   (naplesestatejewelry.com)"**, File (URL) scheduled fetch daily at 12:00 AM,
   countries **United States only** (defaults offered all ~246 — changed),
   language English, feed label `US`, marketing methods Free listings + Free
   local listings; first manual fetch 7:51 AM ET = **76 total updated
   products, "All recognized" attributes, "No issues found"** in the file;
   (2) "Found by Google" crawl source **stopped** ("Stop managing products"
   confirmed — its 106 entries incl. the sold/dual-locale clutter will drain);
   (3) automatic item updates left ON.
   ◻ **Watch (re-check in a few days):**
   - Source header showed **59** products vs 76 in the file right after the
     swap — attribution lag while the stopped crawl source drains; the 12 AM
     scheduled fetch should reconcile it to 76. Chase only if it persists.
   - **`nej-108` (William Suckling salt cellar) "Not approved": "Dangerous
     knives"** — an automated false positive (it is a salt cellar); MC notes
     "other products may have the same issue," so expect the same flag on the
     Gorham carving knife / Whiting grape shears.
     ✅ **Dispute submitted 2026-08-31 at the owner's request** — reason "My
     product meets the policy requirements", banner now reads "Review
     requested on Aug 31, 2026. It can take a few days to complete."
     ⚠️ If NOT approved, MC enforces a multi-day cooldown before the next
     request. If the knife/shears get the same flag, THEIR truthful dispute
     reason is "designed as a utility and household purposes" (they are real
     cutlery), not "meets the policy requirements".
   - **ℹ️ "Unsupported image type [additional_image_link]"** (info-level, on
     nej-108 and likely catalog-wide): MC accepts only **JPEG/PNG/GIF** for
     additional images and the whole catalog is WebP by design — so listings
     keep the main image but lose the extra gallery shots. Main `image_link`
     drew no format complaint (watch whether one appears after full
     processing — that would be a real problem). Optional fix later: a
     transcode route (sharp WebP→JPEG) or Supabase image transformations for
     the feed's `additional_image_link` URLs only — do NOT convert the site's
     stored images (the WebP pipeline is a deliberate site-wide rule).
   - Product images showed "In progress" (Google still crawling them) and
     everything sits "Under review" until the ≤10-day store review finishes —
     both normal, no action.
3. ✅ **DONE 2026-08-31 — "Recently Through Our Doors" proof strip BUILT on
   /silver-services** (owner approved the mockup). Owner had suggested mock
   set specs + internet photos; DECLINED — fabricated purchase records and
   unowned photos. The strip is 100% real instead: three catalog pieces
   (Tiffany Acanthus punch ladle 53, Whiting grape shears 127, Ball Tompkins &
   Black coffee pot 55 — own product photos via next/image + supabase remote,
   accurate `sizes`, cards link to live product pages which persist after
   sale) + Linda Cusumano's quote rendered FROM `testimonials.ts` (already
   there verbatim — no duplication, single-source rule holds). Both locales
   verified on dev; gate green (1186/1186 · 66 routes = 30/30); zero console
   errors. ⛔ Never swap in mock sets/stock photos — provability is the point.
   ℹ️ Curated by hand: swap the three entries in `silver-services/page.tsx`
   whenever the owner wants new features. Deploys with the batch above.
4. ✅ **DONE 2026-08-31 — /silver-services maker card aligned** with the
   top-tier-only rule (owner chose "light align"): list → "patterns such as
   Tiffany Chrysanthemum, Georg Jensen"; price-both-ways promise and the
   we-stock-Chantilly/Francis-I line KEPT. Both locales, gate green
   (1186/1186, 66 routes), verified on dev. Deploys with the batch above.
5. ✅ **DECIDED 2026-08-31 — Facebook stays, grow lightly.** Auto-posting
   already feeds it; it's linked on GBP + in SAME_AS. Growth = invite
   customers/friends, link it from receipts/email footer. Never retire it
   silently — it's a citation now.
6. ✅ **DECIDED 2026-08-31 — the gov-ID checklist line on /sell/naples
   STAYS** (owner call): practical what-to-bring prep is a different surface
   than a GBP Q&A headline. The GBP-Q&A veto still stands (module is retired
   anyway).
7. **Weekly GBP post cadence** (rotation: new arrival → what we're buying →
   review spotlight → showroom note; reuse admin social-queue cards; convert
   WebP→JPG before upload).
8. **Review replies**: keep the 48-hour SLA — reply to each new review from
   Read Reviews (all 23 are answered as of 2026-08-30).

### ✅ DONE 2026-08-30 — ALL 7 owed Request Indexing calls submitted successfully

Quota was open; all seven product URLs (amethyst earrings 93, cufflinks 80,
Whiting teaspoon 101, grape shears 127, William Henry 90, salt cellar 108,
Zina brooch 78) show "Indexing requested". The salt cellar had already been
crawled Aug 29 on Google's own — the sitemap is working. This closes the item
open since 2026-08-28.

### ✅ DONE 2026-08-30 — blank carousel card DEPLOYED + owner-confirmed fixed

Two separate problems, found together. **Both shipped. Nothing outstanding.**
Production emits `high / auto / low…`; owner confirmed the second card now
appears with the rest.

**1. The reported symptom — the second card stayed blank.** Cause was
`fetchPriority`, not payload: slot 0 was `high` and *every* other slot `low`, so
slot 1 (adjacent to the front card, among the first seen) shared a bandwidth
lane with slot 7. Fixed in `src/lib/storefront-image-loading.ts` — slot 1 is now
**`auto`** (never `high`; that lane is the front card's). +2 regression tests.

🔴 **An earlier note here said NOT to touch that file in the same pass, on the
theory that image payload was the dominant cause. That theory was WRONG** — see
the correction in `CHANGELOG.md`. At the width browsers actually request
(`w=640`, resolved from `sizes`) the heavy images deliver 36–38 KB, and
re-encoding did not move that number at all.

**2. 659 of 882 bucket objects were PNG under `.webp` names** (75%, 1,116.9 MB).
Re-encoded to real WebP: **1,116.9 MB → 99.4 MB (91.1% smaller)**, 659 uploaded,
**0 failed, 0 skipped**. Origin objects now return `image/webp`.

- Backups: `C:\Users\rcman\NEJ-image-backup-2026-08-30` — 659 files under their
  TRUE extension plus `_manifest.json`; counts matched before any write, and the
  re-encode read from that archive rather than re-downloading.
- Uploaded to the SAME object paths (`upsert`), so `products.image_urls` and any
  eBay/Etsy listing pointing at those URLs still resolve.
- ⚠️ **Transparency guard ran on every one of the 659**, not a sample: 0 had
  real transparency, so dropping the (fully opaque) alpha channel was lossless.

✅ **STAGING SYNCED 2026-08-30 (2nd sync) — ready to copy to the repo and push.**
Dry run queued exactly **12 files** — the 5 source/test files, `package.json` +
`package-lock.json`, `AGENTS.md`, and 4 memory docs. Real run **12 copied /
0 Extras / 0 Mismatch / 0 FAILED**; follow-up dry run **0, exit 0**.
**890 files / 20.27 MB** (robocopy total 893 = the documented 3 `/XF`-excluded).

Leak check clean — 0 `.git` (dir *or* file), 0 `worktrees`, 0 `node_modules`,
0 `.next`, 0 `.env*`, 0 `*.log`, 0 `*.tsbuildinfo`, 0 `next-env.d.ts`, 0
`*.pem` — against a **positive control of 181 `.tsx` matching source exactly**.

Staged-content checks (bytes, not just filenames): `image-encode.ts` present and
compares `blob.type === type` with a JPEG fallback; `storefront-image-loading.ts`
carries the slot-1 `auto` branch; `AdminShell.tsx` imports the helper and has
**no** hardcoded `.webp` filename or `contentType`; `package.json` carries the
nanoid override; `AGENTS.md` carries the verify-the-encode rule. Hidden paths
present; CSP hazard reads 1 hit each.

◻ **Owner glance:** the admin now **warns** when a browser cannot save WebP. If
that appears while uploading, that browser is the source — add photos from
Chrome or Edge instead.

✅ **VERIFIED AFTER DEPLOY.** Production carousel emits `high` (slot 0) /
`auto` (slot 1) / `low` (2–7), and **the owner confirmed the symptom is gone**.

⚠️ Worth remembering how this was closed: **no automated check could prove it.**
The gate proved the markup correct; only a real cold load could prove the card
appears. When a symptom is timing/bandwidth-shaped, plan for an owner check
rather than treating a green gate as confirmation.

ℹ️ No cache purge was needed. The `w=640` transforms were verified with
`cached == fresh`, so nothing stale is being served at the delivered width.

### ✅ DEPLOYED AND PRODUCTION-VERIFIED 2026-08-30 — the Spanish footer fix

Five pages passed no `locale` to `SiteFooter`, so their `/es` versions served
an English footer whose 23 links all dropped the `/es` prefix — every footer
click ejected a Spanish visitor into the English site. **Fixed, deployed, and
confirmed live.** No SQL, no env vars. Nothing outstanding.

**Production, footer-scoped, all five at 22/23 Spanish links + ES chrome**
(they were **0/23 with an English footer**), matching the `/es/sell` control
exactly:

| Page | Footer `/es/` | Footer total | Chrome |
| --- | --- | --- | --- |
| `/es/faq`, `/es/bullion`, `/es/gold-services`, `/es/silver-services`, `/es/estate-services` | **22** | 23 | Spanish |
| `/es/sell` (control, untouched) | 22 | 23 | Spanish |
| `/faq`, `/bullion`, `/shipping` (negative control) | **0** | 23 | English |

The negative control is the one that mattered — a fix that over-applied would
have looked identical on the positive check alone.

Files (one token each, `locale={locale}` added):
`src/app/[locale]/{silver-services,gold-services,faq,estate-services,bullion}/page.tsx`,
plus `components/layout/SiteFooter.tsx` — the prop is now **required**
(`locale: string`, no default), so this cannot silently recur.

Gate: `tsc` clean · lint clean · **1176/1176 (112 files)** · build exits 0 with
**60 prerendered routes = 27 EN + 27 ES** (⛔ do not read the `(N/N)` progress
line as a page count — see `STRUCTURE.md`).

✅ **STAGING SYNCED 2026-08-30 — ready to copy to the repo folder and push.**
Dry run queued exactly **11 files** (the 6 app files above + 5 memory docs),
real run **11 copied / 0 Extras / 0 Mismatch / 0 FAILED**, follow-up dry run
**0 to copy, exit 0**. **888 files / 20.24 MB** on disk (robocopy total 891 =
the documented 3 `/XF`-excluded files — not a missing-file bug).

Leak check clean — 0 `.git` (dir *or* file), 0 `worktrees`, 0 `node_modules`,
0 `.next`, 0 `.env*`, 0 `*.log`, 0 `*.tsbuildinfo`, 0 `next-env.d.ts`, 0
`*.pem` — against a **positive control of 181 `.tsx`, matching in source and
staging**, so the zeros are real rather than a broken scan.

Staged-content checks: `SiteFooter.tsx` has `locale: string` with **no** `?:`
and **no** `= 'en'`; all six pages (the five fixed + `sell` as control) carry
`locale={locale}`; **0** bare `<SiteFooter />` anywhere under staged
`next-app/src`. Hidden paths present: `.github/workflows/scheduled-jobs.yml`,
`.gitignore`, `.claude/launch.json`, `next-app/.npmrc`, `netlify.toml`. The
standing CSP hazard reads **1 hit each** for `maps.google.com` in root
`netlify.toml` and `next-app/next.config.ts`.

ℹ️ Recording this result drifts staging by memory docs only — the owner's
accepted standing preference.

🔴 **The re-check command MUST be footer-scoped.** A whole-page grep for
`href="/es/` is the obvious version and it is WRONG — it counts header nav and
the language switcher too. Run this instead (expect **22 / ES** on `/es/*`,
**0 / EN** on the English twins):

```bash
for u in es/faq es/bullion es/gold-services es/silver-services es/estate-services faq bullion; do h=$(curl -s "https://naplesestatejewelry.com/$u"); f=$(printf '%s' "$h" | sed -n 's/.*<footer/<footer/p' | sed 's#</footer>.*#</footer>#'); printf "%-24s es=%-4s total=%-4s %s\n" "/$u" "$(printf '%s' "$f" | grep -o 'href="/es/[^"]*"' | wc -l)" "$(printf '%s' "$f" | grep -o 'href="/[^"]*"' | wc -l)" "$(printf '%s' "$f" | grep -qo 'Vender Oro' && echo ES || echo EN)"; done
```

⚠️ **The trap, measured 2026-08-30 — an unscoped grep reports two false
signals at once**, and both look like the deploy failed:

- `/es/*` reads **24**, not 22. The 3 extra unique hits are header-nav links
  (`/es/sell`, `/es/bullion`, `/es/services`), which were always correct.
- An English page reads **1**, not 0. That hit is `href="/es/faq"` — the
  **language switcher**, which every English page correctly has.

⛔ So "0 `/es/` links on an English page" is only true of the FOOTER. State the
scope in any future check, or the negative control invents a regression.

✅ **DONE in the same session — the prop is now required**, so a missing
`locale` is `TS2741` at the call site instead of a silent English footer.
Mutation-tested (removed it from `bullion`, confirmed the error, reverted).
⚠️ It needed **no** call-site changes: all 21 already passed `locale={locale}`.
The earlier "touches LegalPolicyPage / not-found / shop / checkout / account"
sizing was wrong — `LegalPolicyPage` already required `locale`, and root
`not-found.tsx` never renders a footer. ⛔ Never reintroduce a default.

✅ **DONE 2026-08-30 — the 456/457/458 disagreement is resolved, and the answer
is that it was never an invariant.** The `(N/N) static pages` build line is a
progress counter that scales with the CATALOG (`shop/[id]` enumerates every
available/sold product during generation, then renders dynamically anyway — 0
product pages are prerendered). ⛔ Do not pin it to a number or treat a delta as
a defect. The stable figures are in `STRUCTURE.md`: **60 prerendered routes =
27 EN + 27 ES + 6 non-locale**, with **`en === es`** as the check worth making.

### ✅ DONE — the 2026-08-27/28 SEO batches are DEPLOYED and verified live

Both changes sit in the working folder only; production is unchanged. No SQL,
no env vars, nothing to run in Supabase.

1. `next-app/src/app/robots.ts` — removed `/account`, `/checkout` and their
   `/en/` + `/es/` variants (they emit their own `noindex`, which the crawl
   block was making unreachable). `/admin`, `/api`, `/shop-modern`,
   `/en/admin`, `/es/admin` stay.
2. `next-app/src/app/[locale]/shop/[id]/page.tsx` lines 758 + 767 — the two
   `/contact?item=` inquire links gained `rel="nofollow"`.
3. `next-app/src/lib/business-location.ts` — `HOURS.days` gains `'Monday'`
   (owner opened Mondays; the live site was already correct, the constant was
   the stale part). 8 test expectations updated with it.
4. `next-app/src/app/sitemap.ts` — emits BOTH locales, 99 → **200 URLs**
   (100 EN + 100 ES, paired), each with `en`/`es`/`x-default` alternates.
   ⚠️ After deploying, resubmit `/sitemap.xml` in Search Console and expect the
   "not indexed" count to rise as ~100 new URLs await crawl — that is expected.

Gate, run after each change independently: `tsc` clean · lint clean ·
**1176/1176 across 112 files** · build **456/456**. Built `robots.txt` body
verified; `rel:"nofollow"` confirmed exactly twice in the built SSR chunk.

**After deploying,** confirm `https://naplesestatejewelry.com/robots.txt` no
longer lists `/account` or `/checkout` and still lists `/admin`, `/api`,
`/shop-modern`. Then expect the two `/account` rows in Page indexing to migrate
from "Blocked by robots.txt" to "Excluded by `noindex`" over some weeks — both
are non-indexed states, so nothing that currently ranks changes.

### ✅ DONE 2026-08-29 — content batch DEPLOYED and production-verified (probes in `CHANGELOG.md`)

One file of app code (`next-app/src/app/[locale]/sell/page.tsx`) plus the
`CONTENT_LAST_MODIFIED` bump in `sitemap.ts`. No SQL, no env vars. After
deploying: spot-check `/sell` and `/es/sell` render the table and the three
links; city pages must be unchanged.

### ✅ DONE 2026-08-29 — /silver-services flatware band built (mockup approved,
price-both-ways claim owner-confirmed). In the deploy batch above. After deploy,
watch this page's position for "flatware" queries over the coming weeks — it is
the likeliest first non-brand click on the site.

### ✅ DONE 2026-08-29 — per-city local grounding added (data-only, owner-authorized)

12 intro strings extended in `service-areas.ts` with verifiable local detail;
template untouched. ◻ Standing invitation: if the owner ever supplies REAL
customer-pattern detail per city ("Marco sellers bring X"), it upgrades these —
researched geography is the floor, owner knowledge is the ceiling.

### ✅ DONE 2026-08-29 — Saturday hours corrected; site and Google now agree

Owner set it in **Admin → Settings → Store Hours**. Verified on production:
the JSON-LD emits **two** specs — `['Monday'…'Friday'] 11:00–15:00` and
`['Saturday'] 11:00–16:00` — and the visible table reads
`Saturday 11:00 AM – 4:00 PM`. Matches the Google Business Profile exactly.

🟢 This is the first production proof that the **split-week grouping works in
the wild**: `openingHoursSchema()` correctly split one uniform block into two
when a single day diverged, rather than flattening it.

ℹ️ The `HOURS` fallback in `business-location.ts` still cannot express per-day
times and remains one hour short on Saturday by design. It renders only if
`shop_settings.store_hours` is null or unreachable; its docblock says so.

### ◻ 2026-08-28 — owner follow-ups on the `/review` work

- **Print/QR:** the string to encode is `https://naplesestatejewelry.com/review`.
  No QR asset is in the repo — it needs either a QR dependency or an externally
  generated image. Ask before adding a dependency.
- **Post-purchase thank-you page** was deliberately NOT built; it touches the
  checkout flow and needs a decision on where in the order flow it belongs.
- **Site shows 18 testimonials** (`TESTIMONIALS.length`) against 21 on the live
  Google profile — three real reviews are not yet on the site.
- ⚠️ **Never add `aggregateRating`** for the business's own reviews. Google
  disallows self-serving review markup on LocalBusiness and it risks a
  structured-data manual action.

### ◻ 2026-08-28 — 7 Request Indexing calls still owed (quota is a ROLLING window)

⚠️ **Still quota-blocked at the 2026-08-29 later-day retry too** — confirmed
property-wide with two different URLs. The window is harsher than a simple
rolling 24 h from the 08-28 burst; failed attempts may extend it, or the real
daily allowance is smaller than the ~10 assumed. ⛔ Do not burn retries probing:
tomorrow, submit ONE url — continue only if it succeeds.

**11 of the 18 are now requested.** The daily quota ran out on the 12th attempt
("Quota Exceeded — try submitting this again tomorrow"), same as 2026-08-27.
⚠️ The quota is **per SITE, shared across properties** — the Domain property
returns the same error, so it is not a workaround. Budget ~10–11/day.

🟢 **Two of the 18 turned out to be ALREADY INDEXED** — `…teaspoon-73` and
`…monogrammed-mad-104` both now report **"URL is on Google"**. Neither was
indexed as of the 8/20 report, so Google crawled them in between: evidence the
Aug 27 sitemap resubmission is landing.

**Still owed — paste each into URL Inspection → REQUEST INDEXING:**

```
https://naplesestatejewelry.com/shop/vintage-sterling-silver-amethyst-cabochon-earrings-convertible-pendants-93
https://naplesestatejewelry.com/shop/vintage-sterling-silver-men-s-cufflinks-with-carved-figural-scene-80
https://naplesestatejewelry.com/shop/whiting-lily-pattern-sterling-silver-teaspoon-monogrammed-art-nouveau-101
https://naplesestatejewelry.com/shop/whiting-sterling-silver-handled-grape-shears-with-german-steel-blades-127
https://naplesestatejewelry.com/shop/william-henry-juno-sterling-silver-cable-link-necklace-men-s-90
https://naplesestatejewelry.com/shop/william-suckling-sterling-silver-footed-salt-cellar-with-cobalt-glass-liner-birmingham-1955-108
https://naplesestatejewelry.com/shop/zina-sterling-silver-dragonfly-brooch-78
```

✅ Requested 2026-08-28 (all show "✓ Indexing requested"): koma-garment-hook-66,
art-nouveau-whiting-fork-94, gorham-chantilly-81, joseph-mayer-124,
english-salt-cellars-74, iced-tea-spoon-116, teaspoon-73, japanese-tazza-54,
monogram-brooch-79, tiffany-punch-ladle-53, victorian-napkin-ring-104.
✅ Requested 2026-08-27: bill-tompkins-coffee-pot-55.

⚠️ **UI trap for whoever finishes these:** the green "Indexing requested" toast
AUTO-DISMISSES after ~20s, so a screenshot taken late looks like nothing
happened. The reliable signal is the button row itself changing to
**"✓ Indexing requested · REQUEST AGAIN"**. Re-clicking is harmless — Google
states resubmitting does not change queue position.

⚠️ The inspection search box needs a click in one round trip and the typing in
the NEXT one; typing immediately after the click silently goes nowhere.

ℹ️ Still an accelerator, not a repair — the sitemap is submitted and Google is
reaching these on its own, as the two already-indexed pages show.

### 🟡 2026-08-27 — the real ranking problem is CTR, not indexing

Average position **36.7** (page four). The site is being *seen and skipped*:

| Query | Clicks | Impressions |
| --- | --- | --- |
| estate jewelry buyers | **0** | 60 |
| custom jewelry design marco island, fl | **0** | 36 |
| antique jewelry naples fl | **0** | 35 |
| estate jewelry buyers near me | **0** | 28 |

By page: `/sell/naples` **220 impressions → 1 click**, `/sell/marco-island`
103 → 1, `/sell/fort-myers` 62 → 1. The homepage carries 38 of the 44 clicks,
and "naples estate jewelry" (brand) is 16 of them. Nothing in the two fixes
above touches this — it is title/meta/content work and deserves its own session.

### ◻ 2026-08-27 — recheck in a day or two

- The new Domain property's Settings showed **"No robots.txt file"** and "No
  data available yet" — expected for a property hours old (the URL-prefix
  property reports it **Valid**, fetched 8/9/26). Confirm it flips to Valid.
- The Domain property renders the **old gold palm-tree favicon** in the picker
  while the URL-prefix property shows the octopus. Google's favicon cache lags;
  ⛔ do not re-cut the artwork over it.


✅ **DONE 2026-08-25 — store hours + homepage banner are DEPLOYED and both were
exercised in production the same evening.** Nothing outstanding. Full evidence
in `CHANGELOG.md` 2026-08-25.

- Post-deploy smoke: 10 routes **200**, one `<h1>`, zero `Tue–Sat` left in any
  meta description.
- **Owner used both panels** (DB `updated_at` 2026-08-26T03:43Z): Wednesday
  closed (JSON-LD correctly groups the non-contiguous `["Tuesday","Thursday",
  "Friday","Saturday"]`), and a link-OFF banner announcing the closure —
  production renders a `<div>` with 0 anchors and 0 arrows in both locales.
- ✅ **`revalidatePath('/', 'layout')` is CONFIRMED working on Netlify's durable
  cache.** The saves propagated to the statically prerendered homepage in both
  locales. ⛔ The documented `export const revalidate = 3600` fallback is **not
  needed** — do not add per-page revalidate windows for this.

◻ **Only soft follow-up:** the live banner copy is 51 (EN) / 52 (ES) chars —
inside the 49–53 amber band the panel flags. It should fit (a single fragment
has no `·` separator and link-off has no `→`, leaving ~23–28px slack at 320px),
but it is worth an eyeball on a real phone while that copy is up.

⚠️ **NAP, now live and real:** the showroom hours on the site now say Wednesday
closed. Update the Google Business Profile, eBay merchant location, and Etsy
shop location to match — the panel warns about this, and Google compares.



✅ **DEPLOYED 2026-08-25 — the weak-GPU hero-freeze batch is LIVE.** Owner
pushed and deployed (published ~9:42 AM); owner confirmed the live site looks
normal on a normal machine. Post-deploy scare resolved the same morning: the
~24% "Errors" in Netlify Observability are the PRE-EXISTING eBay-webhook 499s,
not this deploy — see the ℹ️ note under the eBay `account_deletion` item below
before ever re-diagnosing that panel.

◻ **The one remaining check — the owner's weak desktop** (owner said they will
check later): load the homepage there; expect a few choppy seconds (watchdog
warm-up + measurement window), then the ring freezes and stays quiet; reload
should freeze immediately (session latch). `?heroFreeze=0` there = old
always-spinning behavior for A/B; `?heroFreeze=1` anywhere previews the frozen
look without latching.

📜 What the batch is (2026-08-24; no SQL): owner-reported choppy carousel on a
weak-GPU desktop, persisting after load. Built with the owner's explicit
choices (freeze-the-ring + housekeeping): an FPS watchdog freezes the hero
rings on machines that sustain a median frame time > 40ms (~25fps),
prefers-reduced-motion now fully stops the ring instead of slowing it, the
customer reveal releases its `will-change` ~800ms after revealing, and the
testimonial marquee pauses while offscreen. Zero change on machines that keep
up — verified: default local state is identical (pane A running, B/C paused,
no latch). Detail: `CHANGELOG.md` 2026-08-24 (weak-GPU entry); durable rules:
`DECISIONS.md` *"A machine that cannot hold the spin gets a FROZEN ring"*.

Files: `src/lib/hero-frame-guard.ts` (new) + its test (new, 11 tests),
`carousel/components/Carousel.tsx`, `carousel/components/Carousel.module.css`,
`src/components/layout/CustomerReveal.tsx`,
`src/components/home/TestimonialMarqueeBand.tsx` (new),
`src/components/home/TestimonialsSection.tsx`, `src/app/globals.css`.

Gate (final tree, deleted `.next`): `tsc` clean · lint clean · **1136/1136
across 110 files** · build **456/456**.

👀 **The check that matters after deploying — the owner's weak desktop itself:**

1. Load the homepage cold. Expect a few seconds of choppy spin (the watchdog's
   warm-up + measurement window), then the ring freezes and the page goes
   quiet. Reload: it should now freeze immediately (session latch).
2. `?heroFreeze=0` on the same machine = the old always-spinning behavior, for
   an A/B. `?heroFreeze=1` on ANY machine previews the frozen look without
   latching.
3. On a normal machine: the hero must look exactly as before — spinning ring,
   handover on scroll, marquee moving when visible.

✅ **Staging re-synced for this batch, 2026-08-25** — ready to copy to the repo
folder and push. Dry run queued exactly **12 files** (the 8 app files + 4
memory docs above), real run **12 copied / 0 Extras / 0 Mismatch / 0 FAILED**,
follow-up dry run **0 to copy**. **876 files / ~20.05 MB** on disk (robocopy
total 879 = the documented 3 `/XF`-excluded files). Leak check clean — 0
`.git` (dir or file), 0 `worktrees`, 0 `node_modules`, 0 `.next`, 0 `.env*`,
0 `*.log`, 0 `*.tsbuildinfo`, 0 `next-env.d.ts`, 0 `*.pem` — against a
**positive control of 179 `.tsx`** (= 177 at the 08-24 morning rebuild
+ `TurnstileWidget.tsx` + `TestimonialMarqueeBand.tsx`; source and staging
both count 179). Hidden paths present: `.github/workflows/scheduled-jobs.yml`,
`.gitignore`, `.claude/launch.json`, `next-app/.npmrc`. Staged-content spot
checks: `maps.google.com` **1 hit each** in root `netlify.toml` and
`next-app/next.config.ts` (the standing CSP hazard); `hero-frame-guard.ts` +
its test + `TestimonialMarqueeBand.tsx` present; staged `Carousel.tsx` imports
the guard (8 guard-symbol hits); staged `Carousel.module.css` has
`animation-play-state: paused` and its only `128s` hit is the comment
explaining the removal; staged `CustomerReveal.tsx` has 4 `'done'` refs;
staged `globals.css` has `data-marquee-paused`; all four staged memory docs
carry this session's entries. (Post-sync doc edits recording this very result
drift staging by memory docs only — the owner's accepted standing preference.)

✅ **ACTIVE IN PRODUCTION 2026-08-24 (later session) — the Turnstile bot gate
is LIVE and verified.** All five activation steps completed: code deployed
(`main@94fe20c` "turnstile update" — the first push shipped a stale staging
folder without this batch; re-synced and re-pushed), Netlify
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` set (site key `0x4AAAAAAEa0eMDYdUm0JTws`),
widget code + site key + CSP verified in the LIVE bundle by static curl
inspection, then the owner saved the secret in Supabase. Negative controls all
pass: tokenless POSTs to `/auth/v1/signup`, `/auth/v1/token?grant_type=password`
and `/auth/v1/recover` each return 400 `captcha_failed`. Rollback if ever
needed: turn the Supabase CAPTCHA toggle off — the code side needs no revert.

◻ Remaining human check: one real sign-in on the live site (owner, any
browser). ⛔ NEVER verify those pages via the in-app Browser pane or any
automated browser — loading the live Turnstile challenge in the embedded
pane hard-crashed the Claude app twice on 2026-08-24 (Cloudflare analytics:
2 "Electron" challenges, both unsolved) and forced a reinstall. Verify with
curl (bundle grep + CSP header) or the owner's own eyes only.

📜 Historical runbook (completed; kept for the reasoning):

🔴 ~~DEPLOY the Turnstile bot gate, then ACTIVATE it — order is load-bearing~~
(2026-08-24; no SQL). Five bot accounts were created via direct calls to
Supabase's `/auth/v1/signup` (the anon key is public; no route of ours is in
that path). The five were deleted from admin the same day. The code is built,
tested (1125/1125, build 456/456) and **inert** until activated.

Activation, in this exact order:

1. Deploy this batch (widget + CSP for `challenges.cloudflare.com` in both
   `next.config.ts` and root `netlify.toml`).
2. Cloudflare dashboard → Turnstile → create a widget for
   `naplesestatejewelry.com` (+ `localhost` for dev), **Managed** mode. Free.
3. Netlify → set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (the SITE key — public by
   design) → redeploy so it inlines.
4. Supabase dashboard → Authentication → Attack Protection → enable CAPTCHA,
   provider Turnstile, paste the SECRET key (lives ONLY there — never in the
   repo or Netlify).
5. Verify: sign-in works with your real account on `.com` (EN + ES); a raw
   `curl` POST to `/auth/v1/signup` without a token is rejected; bot cadence
   was ~every 3h, so 24 quiet hours on `/admin/users` confirms.

⛔ **Never flip step 4 before steps 1–3 are live** — GoTrue then demands a
token no deployed form is sending, and sign-in breaks for everyone. Roll back
by turning the Supabase toggle OFF (tokens sent to a toggle-off project are
ignored, so the code side never needs reverting).

◻ **Phase 2 hardening (after activation):**

- Exclude never-confirmed accounts from `buildMarketingAudience()`
  (`lib/marketing.ts` selects all `profiles` with `marketing_opt_out = false`;
  bot leftovers read as "Reachable" until confirmed-email is checked).
- Tighten Supabase Auth rate limits (dashboard).
- Optional: "unconfirmed" badge on the admin Users table.
- ✅ SMTP check DONE and FIXED 2026-08-24: auth emails HAD been on Supabase's
  built-in mailer the whole time; now on Resend SMTP (sender
  `noreply@naplesestatejewelry.com`, new sending-only key
  `supabase-auth-smtp`, 30/hr cap). Verified delivered with the branded From.
  Safe only BECAUSE the Turnstile gate now fronts every email-triggering
  endpoint — never disable the gate while custom SMTP is on. Detail:
  `CHANGELOG.md` 2026-08-24 (SMTP entry).

✅ **DEPLOYED 2026-08-24 — the invoice heading fix** (`SUBJECT_HEADING_PX` 28 →
20). Email-only, so the real check is the next invoice/receipt that goes out.
Post-deploy smoke check passed: 7 routes 200, CSP intact, one `<h1>`.

✅ **DEPLOYED AND VERIFIED ON PRODUCTION 2026-08-24.** All five batches are live.
The reported cookie/language bug was re-exercised as a user on the live site in
both directions, with the negative control passing. Full evidence table in
`CURRENT_STATUS.md`. No SQL was outstanding.

⚠️ **Sitemap 105 vs the old 107 is normal** — 85 product + 20 static, static
unchanged, two products sold. Not a regression; do not chase it.

◻ **Still not exercised — none blocking, all "first real use" items:**

1. **No order email has actually been SENT** through the new templates. They
   were rendered and unit-tested, not delivered. The first real receipt is the
   first live exercise.
2. 📧 **The pickup block has never been seen in a real mail client.** Outlook
   desktop is the one worth checking — the panel is a `<table>` specifically
   because Word-rendered Outlook drops padding and background on a `<div>`.
3. 📱 **The Visit Us / contact layouts have not been seen on real phone
   hardware.** Measured at 375px and at 320px in Spanish with 0px overflow, but
   measurement is not the same as looking.
4. 📊 **PSI has not been re-run since the homepage section changed.** The block
   is below the fold and the map was already there, so no LCP change is
   expected. ⛔ Per the standing rule, do not react to a single run — the mobile
   number is a distribution.
5. ◻ **The landmark still appears in 8 other places** (footer, About, both FAQ
   surfaces, `/shipping`, checkout pickup, product trust copy, Spanish legal
   copy, order-email pickup block). Deliberately not swept — owner decision.

🔴 **DEPLOY the script-tag console-warning fix** (2026-08-24; no SQL). One line:
`ScriptTagWarningGuard` is now mounted in `[locale]/layout.tsx` instead of only
on the shop list page, so React 19's dev-only "Encountered a script tag while
rendering React component" no longer clutters the overlay on every page.

✅ **Nothing user-facing changes** — the warning is dev-only and was verified
absent from a real production build. The inline `<head>` scripts are untouched.

⛔ **Do not "properly fix" the scripts later.** Both alternatives were built and
measured this session and are worse: `next/script` `beforeInteractive` defers
execution past first paint (reintroducing the layout jump and banner flash), and
raw-HTML emission forces the scripts and JSON-LD out of `<head>`. Full reasoning
in `DECISIONS.md`, *"The inline `<head>` scripts stay…"*.

🔴 **DEPLOY the contact-page match + landmark removal** (2026-08-24; no SQL).
"inside Sharon Lynch Collections" is gone from the homepage Visit Us block, and
`components/contact/VisitUsPanel.tsx` is rebuilt in the same two-column format.
Detail: `CHANGELOG.md` 2026-08-24.

◻ **Owner decision — how far does the landmark removal go?** It is now off three
surfaces (order-email footer, homepage, contact) but still appears in **eight**
places, listed by name in `DECISIONS.md` under *"A display address is laid
out…"*. The notable ones: the **sitewide footer**, **About**, and the **FAQ
answers on `/faq` and the homepage**. Several are prose where it still earns its
place, so this was NOT swept — say the word if you want the rest gone.

🔴 **DEPLOY the homepage "Visit Us" rebuild** (2026-08-23; no SQL). Two-column
layout from an owner-supplied reference — mocked up and approved first, four
design calls answered explicitly. Detail: `CHANGELOG.md` 2026-08-23 (Visit Us).

Files: `app/[locale]/(home)/page.tsx`, `components/ShowroomHours.tsx`,
`components/ShowroomTodayBadge.tsx` (new), `lib/business-location.ts`,
`app/globals.css`, `lib/__tests__/showroom-today.test.ts` (new).

⛔ **The address now leads and the phone is a button — that REVERSES an older
recorded rule** ("must not out-weigh the phone number this section exists to
show"). It is an owner decision, not drift. Do not restore the old hierarchy.

👀 **Worth a look on a real phone after deploying**, since it is a layout
change: the section stacks to one column with no sideways scroll (measured 0px
at 375px and at 320px in Spanish), and the **Today** badge should sit on the
current day — it appears a frame after load, by design, and is pinned to Naples
time, so it is correct even for a visitor in another timezone.

🔴 **DEPLOY the order-email fixes** (2026-08-23; no SQL). Three owner reports
from a real receipt — footer named the shared suite, the phone number broke
across two lines, and the summary read "Shipping method: Shipping". Detail:
`CHANGELOG.md` 2026-08-23 (order-email entry).

Files: `lib/order-email-branding.ts`, `lib/order-invoice-email.ts`,
`lib/order-fulfillment-email.ts`, `lib/checkout-shipping.ts`, and
`lib/__tests__/order-invoice-email.test.ts`.

✅ **Settled:** the landmark is gone from the FOOTER and kept in the PICKUP
block, where it is directions to a door whose sign reads someone else's name.
It now renders as its own muted line rather than joined onto the address.

**Also in this batch — the pickup details are a laid-out block, not a run-on
sentence** (owner request, design mocked up and approved first). Payment
sentence → *Pickup Location* panel (address on its own lines, hours below a
hairline) → contact line. ❌ The business name is deliberately NOT a line in it.
Adds `InvoicePickupBlock`/`contactNote` to `InvoiceEmailContent` and updates the
admin email preview, which rendered `note` directly and would otherwise have
stopped showing the address. Detail: `CHANGELOG.md` 2026-08-23 (pickup block).

📱 **Worth one glance after deploying:** send yourself a pickup receipt and open
it on a phone. The panel was measured at a 340px column and stacks correctly,
but no human has looked at it in a real mail client. Outlook desktop is the one
worth checking if you have it — the panel is a `<table>` specifically for it.

⛔ The shipping tier is INFERRED from `subtotal` + `shipping_fee`, not stored.
That is deliberate (storing it means altering `orders` and rewriting the
`create_paypal_order` RPC — the live payment path). It only names a tier on an
exact, unique fee match and falls back to generic wording otherwise, so
re-pricing the tiers can never mislabel an old order. **If the tier table is
ever re-priced, historical invoices quietly become generic — that is the
intended trade, not a bug.**

🔴 **DEPLOY the cookie-banner language-switch fix** (2026-08-23, later session;
no SQL). Owner-reported: accepting cookies did not stick when switching EN↔ES.
Reproduced, root-caused, fixed and verified locally — see `CHANGELOG.md`
2026-08-23 (cookie banner entry).

Files: `lib/cookie-consent.ts` (new), `components/legal/CookieNotice.tsx`,
`components/legal/CookiePreferencesClient.tsx`, `app/[locale]/layout.tsx`
(comment only), `app/globals.css` (comment only), and
`lib/__tests__/cookie-consent-gate.test.ts` (new, 15 tests, mutation-tested).

Gate from a deleted `.next`: `tsc` clean · `lint` clean · **1101/1101 across
108 files** · build **456/456 static pages** (unchanged — no new routes).

⚠️ **Staging has NOT been re-synced for this change.** Do that before the copy.

**After deploying, one 20-second check on the live site** (this is the whole
bug, and it is trivial to confirm): accept the banner, click **ES**, confirm it
does not come back; click **EN**, same. Then in a private window, DON'T accept,
switch language, and confirm the banner IS still there — that negative control
is the one that matters, because a fix that over-hides would look identical on
the first check.

⛔ Do not "simplify" the new re-stamp as a duplicate of the inline `<head>`
script. They cover different events: the script covers page loads, the effect
covers soft navigation. The guard test fails if the layout effect is downgraded
to `useEffect` or its `[locale]` key is dropped.

0. ✅ **FINAL STATE DEPLOYED 2026-08-23 (owner's choice): a11y/BP sweep +
   hero-reveal batch, nothing else.** Front-card pin reverted after its one
   PSI run read 72. Post-deploy PSI mobile: **98** (LCP 1.7s green — best run
   of the day) and **80** (4.3s, banner mode); desktop that session: 86 (a
   TBT-noise draw; 96–98 earlier). A11y/BP/SEO held 100/100/100 in every run
   all day. The lab perf number remains a distribution, not a constant —
   treat single runs accordingly; CrUX field data (currently No Data) is the
   number that will matter. No further lab-score work planned unless the
   owner asks; untested levers remain listed in the CHANGELOG front-card
   revert entry. The owner chose
   the state that loads fastest in practice over further lab-score chasing.
   After deploy the site is: a11y/BP sweep + hero-reveal batch, nothing else.
   Lab expectation: ~79–81 typical with a known ~71–73 tail that NO tested
   configuration removes (see `CHANGELOG.md` front-card-revert entry for the
   full analysis and the untested levers). Prior item:

   ~~**Front-card LCP pin BUILT — deploy pending, then PSI 2–3x.**~~ Owner
   chose the deterministic fix: pane A's slot-0 card is `priority`-preloaded
   and exempt from the reveal fade, so the page's largest element gets an
   early paint record (verified locally: LCP element = front card, observed
   LCP 497ms, load delay 0). Expectation: the 71–73 image-mode tail
   disappears; the score should sit stably ~79–81, upside uncertain (lantern
   still charges the JS graph). Files: `Carousel.tsx`, `HomeHero.tsx`.
   Staging synced. Detail: `CHANGELOG.md` front-card entry. Prior analysis:

   ◻ ~~**Hero-reveal batch restored + deployed; PSI bimodality is INTRINSIC —
   next-step decision pending.**~~ Post-restore PSI mobile: **73** (LCP 9.2s,
   hero-image mode) and **80** (4.3s, banner mode). ⚠️ CORRECTION to the
   earlier analysis: the image mode fires in BOTH states — full dataset across
   the day: sweep-only 81/79, +batch 79, reverted 71/80/80, restored 73/80.
   Every configuration is ~79–81 when the banner text wins LCP and 71–73 when
   the hero card image's paint registers instead (lantern balloons any
   post-FCP image LCP to ~9s sim). The batch did NOT eliminate the tail; it
   remains live because it measurably improves real paint (observed FCP==LCP)
   and does not hurt the distribution.

   **The only deterministic fix for the 71–73 tail**: let the FRONT card
   paint at first paint — `priority` on the front-slot `<Image>` (preload)
   and exclude it from the opacity fade, so the LCP image has an early paint
   record (~2.7s sim, likely green) instead of a late one. Visible design
   change (front card appears instantly, rest still fade in) — owner call.
   Alternative: accept ~80-with-tail; field data (CrUX) will reflect the
   good real-world paint once traffic accrues.

   The measurement that decided it:

   ◻ ~~**Hero-reveal batch: reverted, redeployed, and PSI measured 3x — owner
   decision pending on whether to restore it.**~~ Post-revert PSI mobile runs:
   **71** (LCP 9.2s — the hero image at its hydration-gated paint), **80**
   (4.4s, banner), **80** (4.4s, banner). The reverted site is BIMODAL: usually
   80, but when the late hero paint lands inside the Lighthouse trace the
   score drops to ~71. The hero batch eliminated that failure mode entirely
   (its runs anchored at 79–81 with the banner font-swap as LCP) AND made real
   paint first-paint. Net: the revert did not raise the score — it restored an
   intermittent ~71 mode. The batch is preserved in `CHANGELOG.md` (hero-reveal
   entry) and can be re-applied verbatim if the owner wants the stable floor.

   Prior record:

   🔴 ~~**REVERTED, REDEPLOY PENDING (2026-08-23)**~~ — after the PSI re-run below
   came back 79 (vs 81 pre-batch, within variance), the owner chose to revert
   the hero-reveal batch entirely. All three files are back to their pre-batch
   state (`grep nej-hero-go` = 0 hits); staging re-synced. **The production
   site still runs the batch until the owner deploys the revert.** History and
   the still-valid lab-score analysis: `CHANGELOG.md` 2026-08-23 (revert
   entry). The record of the deployed run follows:

   ✅ ~~**DONE 2026-08-23 — hero-reveal batch deployed, PSI re-run.**~~ Mobile
   **79 / 100 / 100 / 100**, desktop **96 / 100 / 100 / 100** (79 and 96 are
   within PSI's ±2–3 run variance of the prior 81/98 — the sim perf number is
   flat, as predicted). The reveal itself is live and working: deploy verified
   by curl (nej-hero-go in production HTML). **The LCP element is the cookie
   banner paragraph again, for a NEW reason**: it paints at first paint now,
   but Chrome re-emits the LCP entry when the web font swaps in (~2.5s on
   slow-4G), and lantern maps that to 4.5s sim. The lab number is therefore
   bounded by (a) the font-swap re-emission and (b) the JS dependency graph.
   Next levers, in rising invasiveness: font-display `optional` on the body/
   label font (kills the swap re-emission; trade: slow connections may keep
   the fallback font for a pageview), `experimental.inlineCss`, and the
   ~85KB unused/legacy JS. All are owner-decision design trades — none
   attempted without a call. Real-user loading DID improve: content paints at
   first paint (observed FCP == LCP locally), hero appears ~2s in on a
   throttled phone instead of after a hydration-length splash hold.

   Original item follows for the record:

   🔴 ~~**Deploy the hero-reveal batch, then re-run PSI mobile.**~~ (2026-08-23,
   third batch of the day; no SQL.) Three files: `HomeHero.tsx`,
   `[locale]/(home)/page.tsx`, `globals.css` — pane A's carousel and the boot
   splash no longer wait for React hydration (inline `nej-hero-go` stamp; see
   `CHANGELOG.md` 2026-08-23 hero-reveal entry). Locally verified: 1086/1086 ·
   lint/tsc clean · build 456/456 · observed FCP == LCP on the prod build.
   ⚠️ Expectation-setting: real paint moved to first paint, but the SIM number
   is lantern-bound by the JS graph — PSI perf may move only a few points.
   Post-deploy glance: splash still shows briefly then fades into the hero
   (fast machines), and on a throttled phone the hero appears ~2s in with no
   long branded-splash hold.

1. ✅ **DONE 2026-08-23 — deployed and PSI re-tested on production.**
   PSI mobile: **81 / 100 / 100 / 100** (was 80 / 93 / 96 / 100); desktop
   **98 / 100 / 100 / 100** (was 97 / 96 / 100 / 100). The LCP element is no
   longer the cookie banner — it is now a hero carousel product image (real
   content), confirmed by a local Lighthouse run against production naming
   `a.Carousel… > img` ("Kurt Goldschmidt 14K…") with a11y 1.0 / BP 1.0.
   Deploy presence proven by curl: the SSR banner and the pre-paint gate
   script are in the production HTML. `/_next/image` now serves
   `Cache-Control: public,max-age=31536000` on cache miss (the six 1h entries
   Lighthouse still saw were pre-deploy edge caches; they age out within the
   hour — do not chase).

   ⚠️ **Mobile perf is now bounded by the hero reveal, not the banner.** The
   LCP image's sim breakdown is render-delay-dominated: it paints when the
   hero fade-in runs (fonts + card images + hydration — `HomeHero`'s
   `heroReady` gate and the boot splash), which on throttled mobile lands
   near where the banner used to. Moving 81 → 90+ means loosening that
   reveal for the front card, `experimental.inlineCss`, or a JS diet — a
   deliberate design trade, listed under "Deliberately NOT done" in
   `CHANGELOG.md` 2026-08-23. Owner's call whether to pursue.

   Remaining manual glances (phone-in-hand, no tooling): banner Accept sticks
   across reload; no banner flash for a long-ago-accepted visitor; ES
   announcement strip still fits at 320px.

   <details><summary>Pre-deploy record (what shipped and how it was verified)</summary>

   (original task text follows)

   🔴 **Deploy the PageSpeed/a11y batch, then re-test PSI** (2026-08-23, later
   session; no SQL). Files: `CookieNotice.tsx`, `[locale]/layout.tsx`,
   `globals.css`, `CookiePreferencesClient.tsx`, `carousel/components/
   Carousel.tsx`, `SiteFooter.tsx`, `ShowroomHours.tsx`,
   `TestimonialsSection.tsx`, `[locale]/(home)/page.tsx`, `next.config.ts`.
   Locally verified: 1086/1086 · lint/tsc clean · build **456/456** ·
   Lighthouse a11y **1.0** + best-practices **1.0** on the local prod build.
   After deploy: PSI mobile on `https://naplesestatejewelry.com/` — the LCP
   element must NOT be the cookie banner anymore (was
   `body > div.fixed > div.min-w-0 > p`, render delay 2,360ms, the whole
   reason mobile perf was 80). Expected: a11y 100, BP 100, SEO 100, perf
   up from 80. Detail: `CHANGELOG.md` 2026-08-23 (PageSpeed sweep).

   ⚠️ Regression tripwires for this batch, worth one manual glance after
   deploy: (a) fresh visitor still gets the cookie banner and Accept sticks
   across a reload; (b) a visitor who accepted long ago does NOT see a flash
   of banner on load; (c) the homepage announcement strip still fits at 320px
   in Spanish (an sr-only span was added inside it — position:absolute, so it
   should be layout-inert, verified locally at desktop width only).

   </details>


2. **Delete two junk rows?** Created 2026-08-23 by a verification probe that used
   a *passing* payload and so ran the whole success path (inquiry row, admin
   notification, owner email, and a confirmation to a non-existent address that
   bounced). They are junk — unlike the 10 spam rows deliberately kept as the
   heuristic's labelled sample — so deleting loses nothing, but nothing was
   removed without the owner's say-so.

   ```sql
   delete from inquiries where id = 'a317891f-4509-4c95-ac09-e5074c1fd1c0';
   delete from admin_notifications where id = '5e46cc7d-7bc3-400f-856e-7763bd485a9f';
   ```

   ⛔ **Never probe `/api/inquire` or `/api/contact-message` with a payload that
   passes validation.** Test the rejection paths; they return before any insert
   or email.

3. **The hard-bounce path has never run for real.** Every live exercise used the
   *soft* path deliberately, because it writes nothing. The first genuine
   permanent bounce is the first real test — expect an `[email-bounce]` line in
   the Netlify function log and a red **Bounced** chip in the admin message
   center. Nothing to do but watch.

## ✅ DEPLOYED AND CONFIRMED — transactional email bounce handler (2026-08-23)

**Live on production.** No SQL.

`/api/webhooks/resend` returned early on any event without a `campaign_id`, so
every **transactional** bounce was discarded — a mistyped checkout email meant the
receipt hard-bounced, Resend reported it, and the report was thrown away. Now the
campaign-id gate applies only to campaign analytics, and a failure is processed
either way: new `lib/email-bounce.ts` classifies the bounce, matches the address
to the most recent order and inquiry, and writes an `email_bounce` admin
notification naming who to call and their phone number.

Gate: `tsc`/`lint` clean · **1086/1086** · build **456/456**. Detail:
`CHANGELOG.md` 2026-08-22 (6).

### ✅ CHECKED IN THE RESEND DASHBOARD 2026-08-23 — both preconditions hold

1. ✅ The webhook is **Enabled** with a signing secret set (the route fails
   CLOSED, so a missing secret would 401 everything — it does not).
2. ✅ It listens for all 5 events, including **`email.bounced`** and
   **`email.complained`**.

✅ **Confirmed live by replaying a real bounce**: ATTEMPTS 1 → 2, response body
`{"success":true,"ignored":true}` → `{"success":true}`. That difference IS the
deploy.

✅ **Endpoint re-pointed to `.com` 2026-08-23** (owner-requested):
`https://naplesestatejewelry.com/api/webhooks/resend`. The old `.co` form worked
via the `netlify.toml` `/api/*` 200-rewrite, but that quietly made the rewrite
load-bearing — a plain 301 there would have killed bounce handling, because a
redirect does not replay a POST body. No longer a dependency.

⛔ **Always use "Edit endpoint" for this — never "Duplicate webhook" or delete +
recreate.** Those mint a NEW signing secret and every event 401s until Netlify's
`PROVIDER_WEBHOOK_SECRET` is updated to match. The 2026-08-23 change was verified
in-place: same webhook id `16c348b8-4075-4d71-a61b-540ec88d456b`, CREATED still
"2mo ago", still Enabled, still 5 events.

✅ Re-verified after the move: replay → **200 `{"success":true}`** (a rotated
secret would 401, so this proves the secret still matches), and still 0
`email_bounce` rows written by the soft bounce.

### ⛔ Two rules not to "simplify" later

1. **Only a CONFIRMED transient bounce is spared from suppression** — `unknown`
   still suppresses. The route used to suppress on any bounce; weakening that
   leaves dead addresses on the list, which costs sending reputation on the ONE
   verified domain that also carries order receipts. **Behaviour change:** a
   `MailboxFull` bounce no longer unsubscribes someone permanently.
2. **Notifications are transactional-only.** Campaign bounces are handled by
   suppression; notifying per bounce would bury the message center on a big send.

### ◻ Not exercised in production

The hard-bounce path has unit tests but was **deliberately not fired** against
the live database, because it writes an admin notification — the accidental-write
mistake recorded above. Its first real run will be a genuine bounce. The
side-effect-free paths (401 on bad signature, soft bounce writes nothing,
`delivered` still ignored) were verified against a live server.

### ℹ️ `ymail.com` is NOT a typo

Confirmed by MX lookup: `ymail.com` → `mta5.am0.yahoodns.net`, Yahoo's own mail
servers, same infrastructure as `yahoo.com`. It is a real Yahoo domain from 2008.

⛔ **Do not add an edit-distance "did you mean?" check without `ymail.com` on the
known-good list** — it is ONE character from `gmail.com`, so the naive version
flags a real customer's correct address.

## ✅ DEPLOYED — name + phone validation, checkout AND the lead forms (2026-08-23)

**Live on production.** No SQL.

A real paid order arrived with **name "Sara", phone "Catlett"** — the buyer typed
her first name, tabbed, and typed her surname into the next box. Checkout only
ever checked that name and phone were **non-empty**, on both the client and the
server, so it went through. The owner was left with a paid order carrying a
first name and no phone number.

**Fixed, in two parts:**

1. **Validation** — new `lib/phone.ts` and `lib/person-name.ts`, enforced in
   `create-order/route.ts` with a 400 **before any order row, PayPal order, or
   money**, and stored in canonical form on **both** write paths. The PayPal
   shipping label now uses the validated name too.
2. **The cause** — checkout collects **First Name + Last Name** as two fields,
   and Phone moved out of the position right after the name.

⚠️ **Field ORDER is load-bearing, not cosmetic.** Contact fields run
**First → Last → Email → Phone** in two grid rows. Phone used to sit next to the
name (side by side on desktop, stacked directly below on mobile), which is what
made a surname feel like the right thing to type there. Do not move it back.

The two fields join into the single `customer_name` the `orders` table already
stores, so **no migration**. Prefill prefers `profiles.first_name`/`last_name`,
which already existed.

Gate: `tsc`/`lint` clean · **1075/1075** · build **456/456**. Server matrix
replayed against a live server; the original failing payload now 400s on the name
and, once fixed, on the phone. Detail: `CHANGELOG.md` 2026-08-22 (4).

⛔ **`normalizePersonName` is deliberately the most lenient rule that works: two
tokens.** No length floor, no character classes, no shape heuristics. Likewise
`normalizePhoneNumber` rejects only on structural NANP/E.164 facts, and accepts
extensions and explicit `+` international numbers on purpose. **A false positive
in either is a lost sale.** If you ever revisit them, keep that property: every
assignable number and every real name must still pass.

ℹ️ Considered and rejected: one Full Name field requiring a space in it. Same
outcome, one fewer field (it is Amazon's pattern), but it rejects mononyms and
only states the requirement after the buyer has already tripped on it.

### ✅ Done — the other forms now share the same rule

`InquiryForm`, `MessageUsForm` and `EvalForm` all validate through
`lib/phone.ts` (as did `ContactForm`, deleted later the same day as dead code), and so do `/api/contact-message` and **both** `/api/inquire`
paths, which store the normalized number. One rule, one message
(`phoneErrorMessage`), shown inline under the field. Detail: `CHANGELOG.md`
2026-08-22 (5).

⛔ **The phone rejection is a VISIBLE 400 in `/api/inquire`, deliberately NOT
folded into the silent spam drop directly above it.** A bot should vanish; a real
person who mistyped their number must be told so they can fix it. Keep those two
paths distinct.

⚠️ `MessageUsForm` and `/api/contact-message` each had their own "10–15 digits"
copy, which accepted `0000000000` and `1234567890`. Both now defer to the shared
rule. An international number typed **without** a `+` used to pass and now fails.

### 🔴 Owner decision needed — a test submission reached production data

While verifying, a probe of the `/api/inquire` JSON path with a **valid** phone
ran the entire success path against the live database. The rejection probes are
side-effect-free; the success case is not, and that was a mistake.

It created:

- inquiry row **`a317891f-4509-4c95-ac09-e5074c1fd1c0`** — "Test Chain" /
  "Sara Catlett" / `a@b.com` / `(239) 404-8505` / "hello there"
- admin notification **`5e46cc7d-7bc3-400f-856e-7763bd485a9f`**
- an owner notification email, and a **confirmation email to `a@b.com`**, which
  does not exist and will have bounced from the verified `.com` sender

◻ **Decide whether to delete the two rows.** They are junk, unlike the 10 spam
rows deliberately kept as the heuristic's labelled sample, so deleting them loses
nothing — but nothing was removed without the owner's say-so.

```sql
delete from inquiries where id = 'a317891f-4509-4c95-ac09-e5074c1fd1c0';
delete from admin_notifications where id = '5e46cc7d-7bc3-400f-856e-7763bd485a9f';
```

⚠️ **Never probe an inquiry/contact endpoint with a passing payload again.** Test
the rejection paths, which return before any insert or email.

### ✅ `ContactForm.tsx` was dead code — DELETED 2026-08-22

Nothing imported it — a grep for the symbol across `src/`, `netlify/` and
`messages/` returned only its own definition, there were no barrel files and no
variable-path dynamic imports that could reach it. `/contact` renders
`MessageUsForm`, or `InquiryForm` when `?item=` is present. It was kept in sync
with the phone change rather than left inconsistent, then removed. `/api/inquire`
— the route it posted to — stays live for `InquiryForm` and `EvalForm`. Build
after deletion: **456/456 pages**, unchanged. Detail: `CHANGELOG.md` 2026-08-22
(7).

## ✅ DEPLOYED — inquiry-form bot filter (2026-08-23)

**Live on production.** No SQL.

A bot used the product-inquiry form as an **email relay** — 10 submissions in 18
hours from `2026-08-22T00:25Z`, each making Resend send a confirmation to a
stranger's address from `noreply@naplesestatejewelry.com`. One victim was hit
twice. `.com` is the only verified Resend sender, so this threatened order
receipts and marketing, not just the admin inbox.

**Root cause:** the `bot-field` honeypot was checked server-side on both paths
but `InquiryForm.tsx` never rendered it — and that is the only one of the three
forms that got spammed.

**Fixed:** honeypot added to `InquiryForm.tsx`; new `lib/spam-heuristics.ts`
catches generated-looking names even when a bot POSTs JSON directly and never
sees the form; drops are now logged as `[inquiry-spam]` instead of vanishing.

Gate: `tsc`/`lint` clean · **1061/1061** · **456/456**. Threshold mutation-tested
both ways. Real spam payloads replayed against a live server: all dropped, 13
rows before and after. Detail: `CHANGELOG.md` 2026-08-22 (3).

### ✅ OWNER DECISIONS — both settled 2026-08-22

1. ✅ **The 10 spam rows STAY.** Owner's call: leave them, react if abuse
   recurs. Do not "tidy" them away in a later session — they are the labelled
   sample the heuristic was derived from, and `spam-heuristics.test.ts` encodes
   those exact names.

2. ✅ **The confirmation-to-submitter email STAYS as-is, as an accepted risk.**
   Owner's call: wait and see rather than change customer-facing behaviour now.

   ⚠️ Record the residual exposure honestly so nobody re-discovers it in a
   panic: `sendEmails` still does `to: email` with an address nobody verified.
   The filters stop *this* bot. A next bot using plausible two-word names walks
   past the name heuristic and the relay works again.

### ◻ Watch after deploying

- **`[inquiry-spam]` lines in the Netlify function log = the filter working.**
- **No lines and no new junk rows** = the bot moved on. Nothing to do.
- 🔴 **No lines but NEW junk rows = the heuristic is being evaded.** That is the
  case that needs work, and the playbook is below.

### ◻ If abuse recurs — the playbook

⛔ **Re-measure before changing any constant.** The threshold in
`lib/spam-heuristics.ts` was first set to 4 by eye and would have silently
discarded a real customer named `VanDerBeek`. The value that shipped (**6**) came
from measuring human-max 5 against spam-min 7. Do the same again rather than
nudging it.

```sql
-- the new sample to look at
select created_at, name, email, phone from inquiries
where created_at > '2026-08-22' order by created_at desc;
```

Then pick by **what shape the new names take**:

- **Still single-token random strings** → re-derive the threshold against the new
  sample plus the human list already in the test file. Lower the length gate only
  if the measurement supports it.
- **Plausible two-word names** → the name heuristic cannot help and widening it
  will start eating real customers. Escalate instead, cheapest first:
  1. a submit-timing check (reject sub-second submissions),
  2. a tighter per-IP limit on the JSON path specifically — the current
     `inquire:${ip}` cap is **5/hour**, which the hourly bot slipped straight
     under,
  3. stop sending the confirmation email, which removes the motive entirely,
  4. Turnstile/CAPTCHA — real friction, so last.
- **High volume from one IP** → the rate limit is the right lever, not the
  heuristic.

## ✅ Inventory #82 reattached — DONE ON PRODUCTION 2026-08-21

The mug is back under normal management: detached relist `800354878200` ended,
offer `204558136011` published as **[`800547117368`](https://www.ebay.com/itm/800547117368)**
at **$1,068.35**, and `EBAY_WRITE_BLOCKED_PRODUCT_IDS` is now **empty**. The
daily push owns it like every other listing — the planner reports **0 blocked**.

⚠️ **Shipping moved $15.00 → $59.00 and that is correct** — $1,068.35 sits in
the `$1,000–2,500 → $59` band. The old $15 was a pre-tier leftover on an
unmanaged listing, so it had been under-charging shipping by $44. Say so if the
owner asks why the listing looks different.

ℹ️ The new listing starts at zero views/watchers. The old one had 16 views and
one buyer with it in the cart; that was the accepted cost of the repair
(owner-approved) and is the only way an unmanaged listing can be brought back
under the Inventory API.

Full detail and the reasoning: `CHANGELOG.md` 2026-08-21 (2).

## ✅ Auto-delist hook FIXED, DEPLOYED and CONFIRMED on production 2026-08-21

The hook was a **floating promise** at six call sites; Netlify froze the
container before it finished. It dropped **~1 sale in 20** (39/41 delisted
correctly). Now scheduled with `after()` via new
`lib/product-status-hooks.ts`, with `allSettled` and real error logging. A
second hole — `adminRevalidateProduct` sitting after the video-commit early
return in `AdminShell.tsx` — is closed too. `queueDeepFieldSync` deleted as dead
broken-shape code.

Gate: `tsc`/`lint` clean · **1037/1037** · **454/454**. Tests mutation-tested per
property. Detail: `CHANGELOG.md` 2026-08-21 (3).

### ✅ Confirmed end-to-end on production

Deployed `main@e81f9f9`. Both previously-stale products were run through a
no-change edit-modal save and are now **`hidden_oos` qty 0 on eBay** and
**`delisted`/`inactive` on Etsy**, with `etsy delist ok` and `ebay hide_oos ok`
rows. `after()` proven live: the Netlify log shows `[deepfield] synced 1
product(s)` emitted from inside the callback. Sale prices preserved (1146.63,
1116.66). Detail: `CHANGELOG.md` 2026-08-21 (4).

⛔ **Never use the "mark sold" quick action to re-fire hooks on an
already-sold item.** `adminUpdateProductsStatus` recomputes `sold_price` from
current spot and overwrites the recorded sale price. Use a no-change save in the
edit modal, which fires the same hooks and writes nothing.

### ◻ Still worth doing

1. ✅ **BUILT 2026-08-21 — the reconcile sweep (needs deploying).** Diagnosed:
   the "missing" `hide_oos` row was not missing, it landed **127.6s late**, when
   the frozen Lambda thawed on the next request.
   Two sequential awaits cannot be 128s apart unless the process stops between
   them. The Next docs list `after()` as requiring **graceful shutdown support**
   (`deploying-to-platforms.md`), which Netlify's freeze-on-response model does
   not provide.

   Work finishing inside the response window now lands reliably (Etsy, Deep
   Field). Slower work (eBay, which adds a token round-trip) still freezes and
   completes only if the container is reused before being reclaimed. **That is
   the residual ~5% risk, unchanged in kind, reduced in size.**

   **Built:** `reconcile{Ebay,Etsy}StatusDrift()` + `/api/admin/{ebay,etsy}/
   reconcile-status`, on the existing GitHub Actions workflow **every 30 minutes**
   (`*/30 * * * *`), each guarded by that channel's existing cron secret so no
   new repository secret is needed. Verified against production read-only
   (0 drift on 124 + 128 listings) and then for real (1131ms / 781ms, audit rows
   written). Detail: `CHANGELOG.md` 2026-08-21 (5).

   ⚠️ **The static page count is now 456, not 454** — the two new API routes.
   STRUCTURE.md treats the count as an invariant; this is the new baseline.

   ### ✅ DEPLOYED AND CONFIRMED 2026-08-22

   Run **#153** (`workflow_dispatch`, job `reconcile-status`): both jobs green in
   **6s**, all five other jobs **skipped**, and both audit rows written 8s later
   — `124 scanned, 0 drifted` (eBay) and `128 scanned, 0 drifted` (Etsy). Nothing
   else in the database moved. Routes 401 unauthenticated on production.

   ⛔ **If you ever dispatch this by hand again, change the job dropdown.** It
   defaults to `all`, which fires both price pushes and both drips off-schedule.

   ### ✅ Firing unattended, confirmed 2026-08-22

   **18 runs per channel** overnight, every one `ok` with `0 drifted`
   (124 eBay / 128 Etsy scanned). Gaps **18–56 min, mean ~33** — that spread is
   GitHub's best-effort scheduling, not a fault, and a backstop does not care
   about a dropped run.

   **Now leave it alone.** A `reconcile_status` row every 30 min with
   `0 drifted` is the net working. A row with `drifted > 0` means something
   upstream missed a delist — worth reading, not worth panicking about, since the
   sweep just fixed it.

   ⛔ **DECIDED 2026-08-21 — do NOT await the hook in the PayPal capture path.**
   The payment is already captured before that line runs, so a hang there turns a
   successful payment into an error page for the buyer. Neither marketplace
   client has a request timeout (verified) and both retry with 1s/2s/4s backoff,
   so the tail is unbounded against a ~26–30s gateway ceiling. The 30-minute
   sweep bounds the exposure from outside with no buyer-facing risk. If near-zero
   exposure is ever wanted, the safe shape is: start the work, await it with a
   ~3s cap, and hand the SAME promise to `after()` regardless — never a plain
   `await`.

   ℹ️ **If you do want it awaited somewhere**, the PayPal **webhook** is the free
   one — no buyer is waiting on that response.

## 🟡 Marketplace clients have no request timeout (latent, not urgent)

`lib/ebay/client.ts` and `lib/etsy/client.ts` both call `fetch()` with **no
`AbortSignal`**, so a hung connection blocks indefinitely, and both retry 3×
with 1s/2s/4s backoff on top. Today that only strands background work, which is
why it is not urgent — but it is the specific reason awaiting a marketplace call
in a buyer-facing route is unsafe.

⚠️ **Not a drive-by fix.** It changes every eBay/Etsy call site, including
legitimately slow ones (Etsy image upload, publish). Pick per-operation timeouts
deliberately rather than one global number, and gate it properly.
2. **A real website sale still has not exercised this path.** The confirmation
   above went through the admin route. The PayPal capture route shares the same
   helper, but has not run in production since the fix.
3. **Watch for `[product-status-hooks]` lines** in the Netlify function log.
   Before this change such failures were silent; if any appear, that is the new
   logging working, not a new problem.

## ✅ RESOLVED 2026-08-21 — the two sold listings are reconciled

Both `10k-gold-monaco-cuban-link-necklace` and `10k-gold-rope-chain-necklace` are
now **`hidden_oos` qty 0 on eBay** and **`delisted`/`inactive` on Etsy**, fixed as
a side effect of confirming the auto-delist fix. Kept below for the reasoning
about why they were never a live risk.

## 🟡 (historical) Two sold listings carried stale local state

`10k-gold-monaco-cuban-link-necklace` and `10k-gold-rope-chain-necklace` are
`status: sold` in the app, and:

- **eBay** — offers PUBLISHED but listings `OUT_OF_STOCK`. Both sold on eBay
  itself (Monaco: "You sold this item on Aug 9"; rope chain: "out of stock").
  Not purchasable. Local `last_pushed_qty` is still `1` because eBay decremented
  the quantity itself — we never pushed a zero.
- **Etsy** — local rows still say `sync_state: active` / `listing_state: active`,
  while Etsy itself serves *"Sorry, this item is unavailable."* Not purchasable.

✅ **Verified on both marketplaces — there is NO double-sale exposure.** This is
stale local state only.

⚠️ **But the auto-delist hook did not log anything after either sale.** The
product went `sold` on 2026-08-09 / 2026-08-10 and there is no
`status_change_hook`, `delist`, `withdraw` or `hide_oos` row on either channel
after those dates. Earlier hook runs DID log (`delist ok` 2026-07-20), so the
mechanism works — it just did not fire this time. Worth finding out why before a
future sale leaves something genuinely purchasable.

Side effect while it stands: both rows are re-selected and skipped by every
price-push run, forever. Same class as the 33-item residue from 2026-08-08.

## ✅ VERIFIED 2026-08-22 — marketplace price-push timeout fix works

**Shipped in `main@e81f9f9`. No SQL.** Confirmed by the first unattended morning
run:

- **eBay: success in 2s** — `0 pushed, 85 unchanged, 0 blocked, 0 failed,
  0 deferred`. Run **#142 was 38s and a 504**; this one is green.
- **Etsy: success in 14s** — `32 pushed, 55 unchanged, 0 blocked, 0 failed,
  0 deferred`, with the 32 item writes taking **2.14s** against 20.9s for 41
  items before. **Per item 522ms → 67ms.**
- **`0 deferred` on both channels.** Etsy's silent 15–18/day backlog is gone.
- **`0 blocked` on eBay** (was 1) — the Inventory #82 reattachment confirmed
  through the cron, so the empty write-block list is proven in production.
- **0 failed workflow runs since #143.**

Detail: `CHANGELOG.md` 2026-08-22 (2).

`ebay-price-push` failed (run #142, 504 after 32s) **after successfully pushing
all 50 prices** — the gateway hung up just before the handler returned. Etsy had
the same defect and was silently deferring **15–18 listings a day** since
2026-08-20 without ever going red.

**What changed** — `lib/{ebay,etsy}/sync.ts` + `lib/{ebay,etsy}/store.ts`:

1. Bookkeeping batched — `bulkPatchListings` + `insertSyncLogs` replace two
   awaited round-trips per listing. That was 15.7s of a 22.2s run.
2. Budget is now an absolute `deadlineAt` stamped on entry (20s, was a 22s
   loop-relative budget that could not bound the request).

**Gate, from a deleted `.next`:** `tsc` clean · `lint` clean · **1033/1033
across 101 files** · build **454/454 pages**. New tests were **mutation-tested**
— reintroducing either bug fails them.

### ◻ After deploying

1. **Watch the 7:15 and 7:45 a.m. EDT runs tomorrow.** Both should be green and
   noticeably faster. Success looks like `0 deferred` in the summary row:

   ```bash
   curl -s -o /dev/null -w "%{http_code} %{time_total}s
" -X POST https://naplesestatejewelry.com/api/admin/ebay/price-push
   ```

   (401 unauthenticated — that is the point; it times the route, not the work.)

2. **Confirm the Etsy backlog clears.** It should push all ~56 candidates in one
   run instead of 41. Check the newest `scheduled_price_push` row in
   `etsy_sync_log` for `0 deferred`.

3. ⚠️ **If `deferred` is still non-zero**, the catalog has outgrown a single
   synchronous request. Move the push to a Netlify **background** function
   (15-minute ceiling) — do NOT raise the 20s constant toward 26.

## 🟡 eBay `account_deletion` webhook rows are 97% of the sync log

Found while investigating the above; **not** its cause, and not urgent.

ℹ️ **This same webhook is also what makes Netlify Observability's error rate
look scary** (checked 2026-08-25 after the owner asked about ~24% errors
post-deploy). The "errors" are `499 Client Disconnected` on
`POST /api/webhooks/ebay-account-deletion` — eBay's sender hangs up when our
response takes >~1s (slow ones run 0.9–2.9s; fast ones 200). ~794/day, a
perfectly even drumbeat across the last 24h, predating that day's deploy —
**status-code breakdown showed zero server errors in the same window** (the
only 5xx were 6/day-scale bot POSTs to `/contact`, a sitemap-variant probe,
and one `/_next/image` 502 blip, all pre-deploy). Netlify counts 499 in its
error rollup and the cadence is constant, so quiet hours show a HIGHER
percentage. Do not re-diagnose this from the Observability panel; filter by
status code first. An ack-immediately-process-later webhook handler would
clear the 499s cosmetically — same latent-priority bucket as the log noise.

`ebay_sync_log` holds **77,617 rows, 75,459 of them `account_deletion`**
receipts from eBay's marketplace-account-deletion webhook, arriving at
**~126/hour** (~3,000/day). `pruneOldSyncLogs` keeps 90 days, and the oldest row
is only 42 days old, so nothing has ever been deleted.

These are compliance pings about eBay users unrelated to this shop. Options, in
order of preference: stop logging them at all, log only a daily count, or prune
that one action on a much shorter retention. Anything that keeps the real
sync history readable — right now `price_push` rows are 563 of 77,617 and the
table is unusable for eyeballing.

⚠️ Do not "fix" this by shortening the global 90-day prune; the genuine sync
history is the part worth keeping.

## ✅ DEPLOYED 2026-08-19 — the checkout sign-in/guest gate

Shipped and **owner-confirmed good on production**. No SQL.

**Verified by fetching production, not assumed** — all 15 JS chunks behind
`/checkout` scanned: **0** `checkout-auth-overlay`, **0** `checkout-auth-card`,
**0** of the old two-option heading, against controls of **1** `checkout-page`,
**1** `How would you like to continue`, and **3** chunks carrying `--app-vh`.
`/`, `/es`, `/checkout`, `/es/checkout` all 200.

⚠️ **A zero is not evidence without a positive control in the same scan.** Two
false passes were hit producing that table: the downloaded chunks saved with a
**double** leading underscore (URL path starts with `/`), so the glob matched
nothing and every grep returned 0; and the static `.css` files returned 0 for
the deleted classes **and** for the control, because styled-jsx rules compile
into the JS bundle and never appear in a stylesheet.

The double sign-in/guest prompt is gone (the drawer now records the buyer's
answer before routing), the two-option screen is deleted in favour of the
owner's four-option one, and the survivor no longer renders inside
`.checkout-page` — which had been anchoring it 1114px down a 812px phone screen.
Full detail and measurements in `CHANGELOG.md` 2026-08-19 (4); the rule is in
`DECISIONS.md`, *"There is exactly ONE sign-in/guest gate…"*.

**Gate passed from a deleted `.next`:** `tsc` clean · `lint` clean ·
**1024/1024** · build **454/454 pages**.

📱 **Still worth ten seconds on a real phone** — the whole bug was reported from
one, and none of this has been looked at on real hardware:

- Proceed to checkout signed out. You should see the four-option screen
  **once**, centred, and land on checkout with **no** second prompt.
- Open `/checkout` directly in a fresh tab with something in the cart (this is
  the bookmark / Back-out-of-PayPal path). The gate should appear **centred in
  the viewport**, with no Cancel button, and must not require scrolling.
- Both locales — ES reads `¿Cómo desea continuar?` /
  `Iniciar sesión · Crear cuenta · Continuar como invitado`.

✅ **Staging was rebuilt for this batch and re-synced after the deploy** — see
*Copying to the repo folder*. It mirrors the source, so the next batch starts
from a clean baseline.

## ✅ Hydration warning on `<html>` — FIXED 2026-08-19, deployed with the gate batch

Found while investigating the gate bug and fixed the same day, at owner request.
It had fired on **every page** in dev since the 2026-08-18 `--app-vh` work.

`<html style={{ backgroundColor: '#f9f9f7' }}>` in `[locale]/layout.tsx` had no
`suppressHydrationWarning`, while the inline script below it writes `--app-vh`
onto `document.documentElement.style` before React hydrates — deliberately,
since the token must land before first paint. React compared its prop against
the real attribute (`background-color: rgb(249, 249, 247); --app-vh: 812px`),
found the extra property, and logged "A tree hydrated but some attributes …
didn't match".

**Fix:** `suppressHydrationWarning` on that `<html>`, the pattern already used
at `shop/(list)/shop-page-renderer.tsx:754`.

⚠️ It is the correct resolution, not a silencer — React already said it "won't
be patched up", so the DOM was never touched and the token always survived. And
it applies to **that element only**, not descendants, so a genuine mismatch
anywhere inside the app is still reported.

**Verified in a clean tab** (the console buffer is cumulative across
navigations, so a stale buffer will lie to you here): `/` and `/es/shop` both
load with **zero** console errors, and `--app-vh` still lands —
`htmlStyleAttr: "background-color: rgb(249, 249, 247); --app-vh: 1278px"`,
`body class="min-h-[var(--app-vh)] flex flex-col"`.

**Re-gated after the change**, because this file is the root layout and the
prerender count is a structural invariant: `tsc` clean · `lint` clean ·
**1024/1024** · build **454/454 pages**.

## 🟡 SCHEDULED-JOBS: `facebook-drip` failed once; cause NOT established

Run #124 (2026-08-19, 03:00 UTC) failed with `curl (56)` after 25s — Netlify
cutting a synchronous function at its 26s ceiling. **123 of the 124 runs before
it passed.**

✅ **Established:** the 25s was startup or platform, NOT handler work. With the
queue empty (owner-confirmed) `runScheduledDrip` does three Supabase calls;
warm, the endpoint answers in **0.2s**, and that 0.2s is the route itself
(`proxy.ts:21` — `/api/*` is outside the middleware matcher).

🔴 **NOT established:** what consumed the 25s. Two theories were formed and
neither survived as proven — first "it published more than fit in 26s"
(impossible: empty queue), then "the `sharp` + `next/og` import graph makes cold
starts expensive" (chain is real, causation unproven; three measurement attempts
failed, see `CHANGELOG.md` 2026-08-20). **A transient Netlify/Supabase stall is
not excluded.**

### ◻ What to do

1. ✅ **DEPLOYED 2026-08-20** — a 20s wall-clock budget on both drip loops, and a
   lazy `./images` import so a no-op drip cannot load the image stack. Both are
   correct on their own terms and **neither is claimed as a fix**. Gate:
   `tsc`/`lint` clean, **1029/1029**, **454/454**. Endpoints verified live and
   still secret-guarded after the deploy (401, 0.29–0.40s) — which confirms they
   serve, not that either change did anything.
2. ✅ **Run #125 passed and proves the new code is live.** Its `facebook-drip`
   log returned `HTTP 200` with
   `{"published":0,"skipped":0,"deferred":0,...}` — `deferred` exists only in
   the new code — and the step took **1s** against #124's 25s.

   ⚠️ **That is not proof the budget fixed anything.** With zero rows the loop
   never iterates, so 1s is just the trivial handler on a healthy platform —
   which supports the transient-stall reading. The lazy `./images` import
   shipped later and has **not** yet had a scheduled run.

3. 🟡 **OWNER: keep half an eye on the next few runs.** One failure in 125 does
   not justify more surgery. Run list:
   `github.com/DarkMatter-WebDev/NaplesAntiquesLLC.com/actions/workflows/scheduled-jobs.yml`
4. **If it recurs, run the one measurement that settles it:** leave the site
   idle ~15 minutes, then time a single unauthenticated POST to
   `/api/admin/facebook/drip`. Seconds ⇒ cold-start cost is real. Fast ⇒ the 25s
   was transient and the import theory is dead.

⚠️ **Do not re-run the three failed measurements** (grepping the built route
chunk, timing a local `next start`, or a `Module._load` probe) — all three are
recorded in `CHANGELOG.md` 2026-08-20 with why they proved nothing.

## ✅ ALL `svh` SURFACES CONVERTED — DONE, DEPLOYED, OWNER-VERIFIED 2026-08-19

The five listed after the hero fix are converted, plus `.site-loading-screen` as
a sixth. Shipped, and the owner confirmed the hero-text drift is gone in the
Instagram browser. Verified on production: `.responsive-hero`,
`.site-loading-screen` and `.checkout-page` all carry `var(--app-vh)`, the
homepage hero carries 16 `--app-vh` occurrences with zero bare `Nsvh` in its
clamps, and the deployed checkout JS has **0** `min-height:100svh`. Detail and
per-surface measurements in `CHANGELOG.md` 2026-08-19 (3).

**Nothing is left to convert.** The rule is now enforced by
`lib/__tests__/viewport-units.test.ts`, which rejects `svh` sizing or
positioning anywhere under `src/app` + `src/components`, with two encoded
exemptions: `max-height` on a transient overlay, and the `--app-vh` declaration
itself. ⛔ Do not add a third exemption without reading DECISIONS first.

⚠️ **`tsc` and `lint` pass on a broken styled-jsx template literal.** The
compile check for a `<style jsx>` change is a **real build**. A stray backtick
in a comment inside one of those literals ends the string and 500s every route;
this bit twice on 2026-08-19.

## ✅ IN-APP-BROWSER VIEWPORT JUMP — FIXED AND OWNER-CONFIRMED 2026-08-18

Deployed and confirmed by the owner from inside Instagram: **the jump is gone.**
Closed. Full detail in `CHANGELOG.md` 2026-08-18 (11)–(13) and `DECISIONS.md`,
*"`svh` is NOT stable in an in-app browser"*.

**Root cause, measured rather than inferred.** `vh`, `svh` and `dvh` all resolve
to the SAME value in Instagram's iOS webview, and all three track the chrome
(`innerHeight` 729 ↔ 853, 124px). Instagram resizes the WKWebView natively, so
WebKit sees a plain window resize with no small-vs-large viewport to
distinguish. The 2026-08-11 batch adopted `svh` *because* it is "stable across
exactly this event" — true per spec, false there, which is why two rounds of
fixes changed nothing.

The homepage hero amplified it: runway `(100svh - header) + 240svh` = **3.4 × the
unit**, so 124px of chrome became 3.4 × 124 = **421.6px** against **423px**
measured. A page whose height moves under a scroll is the jump.

**Fix:** `--app-vh`, written before first paint and refreshed only through
`onLayoutAffectingResize`. ⚠️ Do not "simplify" a `var(--app-vh)` back to
`100svh` — it looks like a pointless indirection and is the whole fix. Guarded
by `lib/__tests__/viewport-units.test.ts`.

**The temporary diagnostic is REMOVED** (2026-08-18): `ViewportDebugOverlay`,
its mount, the DEBUG button, the `?vpdebug=1` handling, and its `dvh` allowlist
entry. Verified: **0** occurrences of `vpdebug` in the built JS.

✅ Two things this closed that had been left open as suspects: the **hero touch
snap is cleared** (homepage `auto-scroll` maxed at 134px ≈ the 124px toolbar
travel — scroll clamping, not the 1s animated snap), and the `*-screen` → `svh`
conversion was a **real defect but not the cause**, kept because it is correct
everywhere `svh` behaves per spec.

## 🔴 TOP OF THE LIST (2026-08-18)

0. ✅ **DEPLOYED 2026-08-18 — this batch is LIVE.** It passed the gate from a
   deleted `.next` (`tsc` clean, `lint` clean, **1016/1016**, **454/454 pages**)
   and shipped the same day. No SQL was outstanding. Contents are listed in
   `CURRENT_STATUS.md` and detailed in `CHANGELOG.md` 2026-08-18 (1)–(9).

   ✅ **The CSP hazard cleared.** The risk was that `frame-src`'s new
   `https://www.google.com https://maps.google.com` lived in
   **`next-app/next.config.ts` AND root `netlify.toml`** — the root file is what
   serves production — and that a copy missing the root file would blank every
   map with nothing but a console error. It travelled; the live header carries
   both origins. Re-check any time with:

   ```bash
   curl -s -D - -o /dev/null https://naplesestatejewelry.com/ | grep -i "content-security-policy"
   ```

   ✅ **Confirmed serving**, fetched from production: homepage 200 with the
   correct title; `Call or Visit Us Today`, the `#visit-us` hero anchor, the
   `6240 Shirley` / `Sharon Lynch` address block, the copy-address control and
   the review marquee all present; and **both maps render** — homepage and
   `/contact` each carry the lazy
   `maps.google.com/maps?q=26.222053,-81.781429&z=17&output=embed` frame.

   👀 **Three things still have not been LOOKED at by a human** — the Browser
   pane was hidden for the session that built them. The smooth scroll, the
   clipboard copy and the marquee loop are listed with their measured reasons in
   the phone-check items below. All three are now exercisable on the live site
   and are worth ten seconds each.

   ⚠️ **Rebuild staging before the next batch** — recording this deploy makes
   it stale by definition. Command under *Copying to the repo folder*.

1. ✅ **DEPLOYED 2026-08-17 — that batch is live.** The batch that had
   been queued since 2026-08-09 is live, owner-confirmed, and verified by
   fetching production: homepage title/h1/eyebrow correct with exactly one
   `<h1>`; six pages across both locales all 200 with `og:image` present and
   `og:title` == `<title>`; sitemap 107 URLs with 20 on `2026-08-17`, none left
   on `2026-07-11`, and no `noindex` leaks; brand assets byte-identical to
   source. Evidence in `CHANGELOG.md` (2026-08-17) and `CURRENT_STATUS.md`.

   ✅ It passed a pre-deploy audit first, from a deleted `.next`: `tsc` clean,
   `lint` clean, **998/998 tests** across 98 files, **454/454 static pages**. A
   runtime sweep of **30 indexable pages across both locales found zero
   problems**, and the money invariant was proven through the live quote API —
   a `$5,558` card produced a `5558` charge.

   ✅ **Staging re-synced after the deploy** — `C:\Users\rcman\NEJ-repo-staging`,
   **843 files, ~19.3 MB**, dry run **Copied 0 / Extras 0 / Mismatch 0 /
   FAILED 0**. It now mirrors what is live, so the next batch starts clean.

   ℹ️ Recording a rebuild in this file necessarily makes staging stale by this
   file, so the sequence is always: edit docs LAST, then sync, then confirm a
   0-copy dry run. The figures above are measured a moment before that final
   sync; the file COUNT is the stable number to check, not the megabytes.
   Leak check clean — 0 `.git`, 0 `node_modules`, 0 `.next`, 0 `.env*`,
   0 `.pem`, 0 `*.tsbuildinfo`, 0 `next-env.d.ts`, 0 `*.log` — against a
   **positive control of 170 `.tsx`**, so the zeros are real rather than a
   broken scan. Hidden paths confirmed present: `.github/workflows/
   scheduled-jobs.yml`, `.gitignore`, `.claude/launch.json`, `next-app/.npmrc`,
   `next-app/.gitignore`. Content spot-checks in the staged copy: the
   `RouteProgressBar` mount, `data-site-header`, the
   `body:has([data-site-header])` offset, `roundToWholeDollar`, `pageMetadata`,
   the settled hero copy, and the ABSENCE of the removed un-layered
   `font: inherit`. The three regenerated binaries are present at their source
   sizes — `nav-logo.webp` 16KB, `src/app/icon.png` 23KB, `favicon.ico` 11KB.
   No SQL outstanding; all three migrations are applied, and the 2026-08-15/16
   work adds none.

   ℹ️ **Robocopy reports 846 total files against 843 on disk, and that is
   correct** — it counts `/XF`-excluded files in its total. The three are
   `.env.local`, `tsconfig.tsbuildinfo`, and `next-env.d.ts`, all verified
   absent from staging. Do not chase this gap as a missing-file bug.

   ⚠️ Still a point-in-time snapshot — rebuild again after any further edit.

   ✅ **Those four changes shipped too**, in the 2026-08-18 deploy — see item 2.
   ⚠️ Staging is stale again as of this doc update; rebuild it (command under
   *Copying to the repo folder*) before the next batch.
2. ✅ **DEPLOYED 2026-08-18 — the showroom map and the "visit us" copy.**
   Gate passed: `tsc` clean, `lint` clean, **1016/1016**, **454/454 pages**.
   Detail: CHANGELOG 2026-08-18 (1); DECISIONS, *"The showroom map is a keyless
   embed, pinned to GEO, and always lazy"* and *"The homepage invites a visit,
   and the invitation is hours-conditional"*.

   🔴 **Deploy hazard — the CSP change must travel with the code.** `frame-src`
   gained `https://www.google.com https://maps.google.com` in **two** files:
   `next-app/next.config.ts` and **root `netlify.toml`**. The root file is the
   one that serves production. If the copy to the repo folder misses it, every
   map on the live site renders as an empty rounded box with only a console
   error — the page still looks finished, so this failure will not announce
   itself. **Check the live CSP header after deploying:**

   ```bash
   curl -s -D - -o /dev/null https://naplesestatejewelry.com/ | grep -i "content-security-policy"
   ```

   👀 **Nobody has actually looked at these maps.** The Browser pane was hidden
   for the whole session, so every check was a DOM/network measurement — the
   frame is confirmed to hold a cross-origin document, but no human or
   screenshot has seen a tile render. This is the first thing to eyeball.

   📱 **Phone checks after deploy:**
   - **Homepage** — the map is deliberately small (`clamp(190px, 42vw, 260px)`,
     341×190 measured at 375px). Confirm it reads as orientation and does not
     out-weigh the phone number above it. If it feels like an afterthought,
     grow the clamp; if it steals the section, shrink it.
   - **Contact** — the taller map (`clamp(240px, 52vw, 380px)`) sits directly
     above *Get directions*. Confirm the two read as one unit and that the pin
     lands on the right building, not the plaza next door.
   - **Scroll past both on a slow connection** and confirm the lazy frame does
     not cause a visible layout jump when it swaps in.
   - **Both locales.** ES strings: `Llámenos o Visítenos Hoy`, `Visítenos hoy:
     pase por nuestro salón…`, `Ahora Tenemos Salón en Naples`.

   ⚠️ **The homepage copy is hours-conditional on purpose** — "walk in during
   opening hours", never "no appointment needed". The showroom is closed Sunday
   and Monday and the page is cached, so an unconditional invitation is false
   two days in seven. Strengthening it means making the page time-aware.

   📱 **Also check, from 2026-08-18 (2):**
   - **The zoom buttons.** Each press *reloads* the Google frame (a cross-origin
     iframe cannot be scripted), so expect a brief redraw per step rather than a
     smooth native zoom. Confirm that reads as acceptable on a phone on
     cellular, where the reload is slowest. If it feels broken rather than
     merely slow, the honest options are to widen the debounce, drop to a single
     "View larger map" link, or pay for a Maps API key — not to pretend it is
     instant.
   - **Press Back after zooming.** It must leave the page, not rewind through
     zoom levels. Measured `history.length` growth of 0, but this is the exact
     thing a future `src`-instead-of-`key` "simplification" would silently
     break.
   - **Zoom 17 is the new default.** Confirm it opens close enough to read the
     plaza without losing the surrounding roads someone navigates by.
   - **Control size is 36px.** Above the WCAG 2.2 AA minimum, but it is a
     judgement call against the homepage map's 190px minimum height — say if
     they read as cramped or as too dominant.
   - **The address block, in BOTH locales**, in the footer, the homepage CTA and
     About: "Sharon Lynch Collections" must never split across lines. Verified
     at 320px in Spanish (the worst case), but this is a font-rendering question
     and real devices have their own fonts.

   📱 **And from 2026-08-18 (3) — the hours list:**
   - **Seven rows in the footer** is the biggest layout change: the footer's
     brand column grew by roughly five lines on every page. Check it does not
     unbalance the footer on desktop or add awkward scroll on a phone. If it is
     too heavy there, switch the footer to `variant="grouped"` — same
     component, one prop.
   - **The homepage CTA is the ONE surface using the 2-row grouped form.**
     Confirm it does not read as evasive next to the seven-row lists elsewhere.
     Switching it to `full` is also one prop.
   - **Column alignment on a real screen**, both locales — times should form a
     single right edge. Measured clean at 320px in Spanish (no row wraps,
     nothing overflows), but this is a font-metrics question.
   - ⚠️ **If the open days ever change**, re-read the warning on
     `hoursRowsGrouped()`: it hardcodes "Sunday – Monday" as the closed pair and
     will silently lie if the closed days stop being contiguous.

   📱 **And from 2026-08-18 (4) — the hierarchy pass:**
   - **The homepage CTA ladder on a real screen.** Ten steps from a 10.4px gold
     eyebrow to a 12.6px footnote. ✅ The two judgement calls here were already
     put to the owner and answered on 2026-08-18: the deck is **colour-only, not
     bold** (600 read as shouting) and the block carries **one rule on top, not
     a bracket** (closed both ends read as a stray box). Confirm the pulled-back
     version on a real screen, and see DECISIONS before touching either.
   - **The footer, contact and About got the shared half of this** (bolder
     street line, bolder days/times, dimmer closed rows). Confirm the footer
     hours do not now out-shout the address above them at 12px.
   - ⚠️ **Do not "simplify" the emphasis into a colour.** Both components
     render on four surfaces with four inherited palettes; weight and opacity
     are what survive that. See DECISIONS.

   ✅ **OWNER ACTIONS from 2026-08-18 (5) — both CLOSED 2026-08-19:**

   - ✅ **Google Business Profile hours FIXED.** Were `Mon–Sat 10:00 AM–5:00 PM`,
     matching neither the site nor the schema. Now **Sun + Mon closed, Tue–Sat
     11:00 AM–3:00 PM**, byte-identical to `HOURS` in `business-location.ts`.
     ✅ **Applied and live** — re-checked in the profile editor after review.
   - ✅ **The profile Description no longer claims to be mobile-only.** It still
     read "We're private, mobile, and appointment-only…", the last place
     contradicting the store-first rewrite. Now leads on the showroom, the
     Sharon Lynch Collections landmark and Tue–Sat 11am–3pm, with home visits
     framed as on request. ✅ **Also applied and live.**
   - ✅ **Linda Cusumano's review is published**, without the stray "Hi baby"
     line. She had not edited it; the owner chose to trim rather than wait. That
     is a deliberate, recorded override of the verbatim rule — see DECISIONS and
     the inline note in `testimonials.ts`. ⛔ One exception, not a new policy.
   - ✅ **DONE AND DEPLOYED 2026-08-19 — all five missing reviews are in**, and
     confirmed on production (`/`, `/es`, a product page and the legacy `.co`
     all serve the new list; `Nolan Olivier` and `Onur` return 0 on every one).
     With the reconciliation below, `TESTIMONIALS` is **13 → 16**. Five were
     missing, not four: the earlier count came from a Maps feed that stopped
     paginating after ten, so the tail was never seen.
     Added: **Ruthe Lloyd, Ariel Babastro, Ryan Smith, Edna Cavazos, Mayelin
     Pérez**.

     ⚠️ **Mayelin Pérez is the Spanish one, and her entry inverts the pair** —
     `quoteEs` is her verbatim original, `quote` is our translation. Google's
     card shows a machine translation by default; the original is only behind
     its *"See original (Spanish)"* control. Publishing the visible text would
     have shipped a machine translation as a customer's words.

     **How to read the full list** (the pagination trap that caused the
     undercount): the Reviews pane must be scrolled by its own scroll container
     — `div.m6QErb.DxyBCb.kA9KIf.dS8AEf` — until the card count stops growing,
     then every *"More"* expander clicked. Scrolling the window does nothing.
     ⚠️ Google appends a trailing `" …"` to `textContent` on emoji-ending cards
     (Cristian's, Douglas's) even when the text is complete — strip it; it is a
     UI marker, not the reviewer's words.

   - ✅ **RESOLVED — the list is reconciled against the profile, 16 matching
     1:1.** Three entries did not reconcile, and the owner supplied the reason:
     **he accidentally deleted his original Google Business Profile and rebuilt
     it from scratch.** Those reviews were real and his; they did not survive.

     | Entry | Action |
     | --- | --- |
     | **Nolan Olivier** | removed — gone with the old profile |
     | **Onur** | removed — gone with the old profile |
     | **Yisel Perez** | **quote replaced** — she re-reviewed on the new profile |

     Yisel was refreshed rather than dropped: she is still a live reviewer, only
     her text is new. Leaving the old words under her name was the worst option —
     a reader clicking "Read on Google" would find her saying something else.

     ⛔ **Standing rule, now in `testimonials.ts`: every entry must still exist
     on the live profile.** Each card links to it, so an absent quote sends the
     reader to look for something they will not find. Reconcile the list against
     the profile — drop what vanished, refresh what changed — don't only append.

     ⚠️ ***Naples Jewelry Buyers* (5.0/33) is NOT the owner's business** — the
     name is coincidence. A guess made during this session said it was the
     likely source of those entries; that was wrong. Do not repeat the
     inference.

   🔴 **NEXT, owner: Google address verification** — owner is going 2026-08-20.
   Until the address is verified, the showroom's NAP is not fully trusted by
   Google. The hours and description edits above should have cleared review by
   then; check both before going.

   📱 **And check the marquee itself:**
   - **Speed.** Measured ~49px/s (84s per cycle at 12 reviews). Duration is
     derived from the card count, so it stays at that speed as reviews are
     added — confirm it is readable rather than hypnotic on a real screen.
   - **The seam.** It should loop with no visible jump. Measured exact (track
     8115px, half 4057px), but a jerk once per 84s is the symptom if the
     `margin-inline-end` rule is ever "tidied" into `gap`.
   - **On a phone**, confirm the band does not fight vertical page scrolling.
   - **Product pages still show the GRID**, deliberately — confirm that still
     looks right next to the new homepage treatment.

   📱 **And from 2026-08-18 (6) — the footer:**
   - The address and hours are now a **centred band under all four link
     columns**, not inside the brand column. Column heights measured
     222/222/222/222 (spread zero) after the move, against a roughly 2:1
     imbalance before. Confirm the centred band reads as deliberate on a wide
     desktop, where it sits alone under four left-aligned columns.
   - On a phone the two halves **stack, still centred**. Confirm the footer has
     not become tediously long — it is the seven-row hours list that drives the
     height, and `variant="grouped"` on that one instance is the lever.
   - ◻️ **The phone number stayed in the brand column** (it is a bordered tap
     target on mobile). That splits N-A-P across the footer. Say if it should
     move down beside the address for a contiguous NAP signal instead.

   📱 **And from 2026-08-18 (7):**
   - 🔴 **Watch the "Visit Us" button scroll, once.** The smooth animation
     is the one thing this session could NOT verify: the hidden Browser pane
     freezes `requestAnimationFrame`, measured directly (no rAF callback in
     1500ms; a smooth scroll sat at scrollY 0 for six seconds). The instant
     path was proven correct — scrolled to 5871 and landed the block exactly at
     the header's bottom edge — so the anchor, id and offset are right and only
     the animation is unseen.
   - Check it lands cleanly on a **phone**, where the header token is 3.5rem
     rather than 4.5rem. Both were verified by measurement.
   - ◻️ **`/trade-in` has lost its only prominent entry point.** It is now
     only in the footer under *Sell to Us*. Decide whether the trade-in program
     needs a new home — taking the hero slot back would cost the showroom its
     link.

   📱 **And from 2026-08-18 (8) — the copy-address button:**
   - 🔴 **Press it once on each of the three surfaces.** The copy could not
     be exercised here: the hidden Browser pane leaves `document.hasFocus()`
     **false**, and the browser blocks both paths on an unfocused document
     (Clipboard API threw `NotAllowedError`, `execCommand` returned `false`).
     `isSecureContext` is true and the API exists, so a real focused page has
     both. Paste the result somewhere and confirm it is
     `6240 Shirley St, Ste 104, Naples, FL 34109` — street and city only, with
     **no** landmark and **no** business name.
   - **On a phone**, confirm 24px is a comfortable tap target beside the
     address. It is small by request; if it is fiddly in practice the box can
     grow without touching the icon.
   - ✅ **The footer address got one too** (2026-08-18 (9)), so all four
     address surfaces now carry it.

   📱 **And from 2026-08-18 (9) — the square map:**
   - The frame is now **1:1**: 448px on the homepage, 512px on contact, 288px at
     a 320px viewport. Confirm the extra height earns its space on the homepage,
     where it sits under the CTA — it is roughly 190px taller than the strip it
     replaced.
   - ⚠️ `maxWidth` caps the WIDTH but binds the height too. If a surface wants
     a wider map it also gets a taller one; re-check both.

   ◻️ **Owner call:** the About page has **no map** by design (text + directions
   link only), on the reasoning that its job is to say the store exists and the
   contact page one click away does wayfinding properly. Say so if you want one
   there — it is a one-line change.

3. ✅ **DEPLOYED 2026-08-18 — four owner-requested changes.** Gate passed: `tsc` clean,
   `lint` clean, **1016/1016**, **454/454 pages** from a deleted `.next`.
   Detail: CHANGELOG 2026-08-17 (3) through (6), and DECISIONS,
   *"The header brand row is full on a phone"*, *"The route bar is immediate,
   and that is the whole point"*, and *"An undecided swipe is not a scroll"*.

   All four are 📱 **phone-first checks** — every one of them turns on a
   judgement the measurements could not make. Taken in order:

   (a) **The octopus mark now shows at every viewport width** — it was
   `hidden md:block`, so phones and sub-768px tablets showed the wordmark alone.
   (b) **The ES/EN chip is md-and-up only**, collapsed into the mobile menu's
   existing language item, which is what paid for (a).
   (c) **The route progress bar is now immediate on every navigation.**
   (d) **The photo swipe triggers on a slight sideways move**, and is now one
   shared gesture.

   Detail follows **most recent first**, so (d), then (c), then (a)+(b).

   (d) 📱 **Photo swipe — the change that most needs a real thumb.** The product
   gallery had never received the 2026-08-09 fix and was structurally unable to
   swipe (React `pointermove` cannot cancel a scroll). Synthetic touch proves the
   thresholds fire, not how it feels:
   - On a phone, swipe the main photo on a product page and a shop card. It
     should catch on a **slight** sideways move now, including when your thumb
     arcs downward as it travels.
   - Then deliberately **scroll the page with a drag that starts on a photo**,
     both surfaces. This is the risk side of the change: if scrolling now feels
     sticky or steals into a photo change, the cone (1.6) is too greedy — lower
     it in `lib/photo-swipe.ts`, do not raise the vertical trigger.
   - Confirm a swipe still does not open the product/lightbox, and that a plain
     tap still does.

   (c) **The route progress bar is now immediate on every navigation** — the
   120ms delay is gone, query-only navigations (shop filter/sort/view/
   pagination) arm it, and navigations started from a `<button>` arm it via
   `startRouteProgress()`. It was never gated by page or viewport; the delay
   plus uneven prefetch coverage is what made it look that way.

   📱 **Check after deploy:**
   - **The flash is deliberate.** On a fast connection most navigations commit
     in tens of milliseconds, so the bar will blink rather than travel. A
     minimum display time was offered and declined — if it now reads as
     glitchy, that decision is the thing to revisit, not the delay.
   - **`/shop` lost its centred spinner** (duplicate of the bar once filters
     started arming it). Run a filter, a sort, a view toggle and a pagination
     click and confirm the top bar is enough acknowledgement on a long catalog
     page, including scrolled to the bottom — the bar is at the fixed header, so
     it should always be in view. Restoring the spinner is a markup revert in
     `ShopNavigationProgress.tsx`.
   - Confirm the **cart drawer's Checkout button** and **Sign out** show the bar
     — those navigate from a button and are newly covered.
   - ⚠️ **Do not remove the `<Suspense>` wrapper** around `RouteProgressBar` in
     `[locale]/layout.tsx`. It is what keeps `useSearchParams` from deopting all
     454 prerendered pages.

   (a) + (b) 📱 **Header mark and language chip — check on a real phone and a
   real tablet, in BOTH locales:**
   - The mark renders at **28px tall on a phone**, below the 40px it gets on
     desktop. It is a small, detailed illustration; whether it still reads as
     the octopus at that size on a real screen is exactly the open question
     TASKS already raised for the 40px header case. **If it reads as mud, the
     fix is a tighter crop on the body, not a bigger box** — the box is the
     header's content budget and growing it moves `--site-header-height`.
     ℹ️ There IS spare room now (11.7–25.9px across the phone band), so a
     modestly larger mark is affordable if the owner wants one — but it must be
     re-measured, not assumed.
   - **Open the mobile menu on a narrow phone in Spanish** (`Cerrar` is the
     longest toggle label — the widest this row ever gets) and confirm the
     wordmark still ends in a clean "y", not a clipped "Jewelr".
   - **Confirm switching language still feels findable on a phone**: it is now
     the last item in the hamburger menu (`Español` / `English`) and no longer a
     chip in the header. This is the one behaviour change a returning visitor
     could notice. The link itself was exercised at 390px — `/es` → `/`, menu
     closes.
   - Confirm the chip is back to normal at tablet/desktop widths (it returns at
     768px), and that the wordmark reads well: it is fluid now and is at or
     above its old size at every width.
4. ✅ **DONE 2026-08-27 (sitemap half) — resubmitted, read Success, 99 pages.**
   The Request-Indexing half is superseded by the 2026-08-27 item at the top of
   this file. Original text kept for context:

   ◻️ **Resubmit the sitemap in Search Console, and Request Indexing on the
   four pages whose titles changed** — `/`, `/sell`, `/services`,
   `/silver-services`. Owner action; nobody has done it yet.

   Search Console → **Sitemaps** → resubmit `https://naplesestatejewelry.com/sitemap.xml`,
   then **URL Inspection** → *Request Indexing* on each of the four.

   ℹ️ **There is no sitemap file to edit** — `src/app/sitemap.ts` generates it at
   build time, and the deploy already published the new one (verified live
   2026-08-17: 107 URLs, 20 carrying `2026-08-17`, zero `noindex` leaks).
   Resubmitting only asks Google to re-fetch sooner; it changes nothing about
   what is served. `CONTENT_LAST_MODIFIED` was bumped `2026-07-11` → `2026-08-17`
   for the same reason.

   This is a **nudge, not a repair.** Nothing in the deploy can hurt search — no
   URL, route, or robots directive changed. Left undone, Google finds everything
   anyway on its own cadence; done, the new titles land sooner. Expect titles to
   swap in over days-to-weeks and the favicon to lag longer still.

   While there, check that the **"Submitted URL marked noindex"** errors for the
   six legal pages clear — they were being submitted and refused simultaneously
   until this batch removed them from the sitemap (113 → 107 URLs).
5. **Re-measure first paint on production** (snippet below, under *After the
   next deploy*). Baseline to beat: 533KB across 30 requests before FCP.
6. **Confirm the first real refund records itself.** The fix is proven locally
   against real PayPal refunds but its automatic path has never run in
   production.

7. **Now live — check the two 2026-08-15 changes on a real screen:**
   - 📱 **Shop-card photo arrows** are the one customer-facing visual change from
     the button font fix — now **14px/700** where they were 16px/400 (bolder,
     slightly smaller). Confirm they still read well on a phone and a desktop,
     on both a light- and a dark-backdrop card. The drawer `✕` and the header
     Menu button changed the same way.
   - **Whole-dollar prices**: confirm no shop card, product page, cart drawer or
     checkout line item shows cents, and that a checkout line item equals its
     shop-card price exactly. Tax, and therefore a Florida total, **should**
     still show cents — that is correct, not a miss. The gold/silver spot
     tickers (`$4,377.60/oz`) keep their cents deliberately.
   - Spot-check one eBay and one Etsy listing after their next price push: both
     should now carry whole-dollar prices.
   - 📱 **Tap feedback, on a real phone AND a real tablet** — this is the change
     that cannot be judged from measurements. Tap a shop-card cart/wishlist
     button, a gold CTA, and a nav link: each should visibly acknowledge the
     touch. Confirm the gold tap highlight reads as deliberate rather than
     grubby on both a light and a dark product page. Then **swipe a shop card
     photo and confirm the swipe still works and does not flash a press state**
     — cards are deliberately excluded from press feedback for this reason.
   - 🔎 **Homepage title + site name in Google — check WEEKS later, not days.**
     Both are re-crawl-gated. Search `naplesestatejewelry.com` and confirm the
     result reads *"Naples Estate Jewelry - Sell Gold…"* and that the line above
     it shows **Naples Estate Jewelry** rather than the bare domain. Fastest
     nudge: request indexing for the homepage in Search Console. The title is
     now **65 characters**, inside Google's display limit, so the whole line
     including `in Naples, FL` should be visible. Note Google may still rewrite
     a title regardless of what we set; that is its prerogative, not a bug.
   - 🔎 **Spanish share card.** Paste `https://naplesestatejewelry.com/es` into
     Facebook's Sharing Debugger and X's Card Validator and confirm a **Spanish**
     title and description, the og-preview **image present**, and the URL
     resolving to `/es` rather than the English homepage. Do the English
     homepage too — the same edit rewrote its block. ⚠️ Facebook caches
     scrapes; use "Scrape Again" rather than assuming it did not work.
     ✅ Interior pages now emit their own cards via `pageMetadata()`. **Check
     `/sell` and one `/sell/[city]` specifically** — those were posting BLANK
     cards (hand-rolled `openGraph` with no `images`), so they are the pages
     most worth confirming, and Facebook will be holding the old blank scrape
     until you press "Scrape Again". Also check one product page shows the
     PRODUCT photo, not the site card.
   - 📱 **Homepage hero on a real PHONE, both locales.** Eyebrow **"One Piece or
     an Entire Estate"** over h1 **"Naples Premier Gold, Sterling & Jewelry
     Buyers"** (46 chars). **Desktop is confirmed good** — the headline block was
     widened to `72rem` and it renders two clean lines, screenshotted. **Phone
     still renders THREE lines** at 30.4px and was deliberately left alone; that
     is the one view nobody has seen on real hardware. Measured clean (no
     overflow, no horizontal scroll, 124px EN / 105px ES clearance to the sign-up
     block), but three lines is the largest hero block this page has carried.
     ⚠️ If it reads heavy, the fix is **fewer characters, not smaller type** —
     shrinking the font keeps three lines until 20px, which is body-text size.
     `Naples Premier Gold & Jewelry Buyers` (36) is the natural trim.
     ℹ️ The old tagline *"Rare. Authentic. Timeless."* is gone from the page
     entirely; say so if you want it kept somewhere (footer or `/about`).
   - 🔎 **Confirm the homepage H2s read naturally.** *"We Buy Gold in Naples"*
     and *"We Sell Estate Jewelry in Naples"* were lengthened for local signal
     (headings mentioning Naples: 0 → 3). Card titles re-measured at 320px in
     Spanish and wrap to at most 2 lines, but check the three-card strip still
     looks balanced on a real screen in both locales.
   - 🔎 **Spanish search results (2026-08-16 audit fixes).** After re-crawl,
     search a Spanish query (e.g. *vender oro naples*) and confirm the `/es`
     pages now show SPANISH titles. Eight of them served English titles over
     Spanish bodies until this batch. In Search Console, the **"Submitted URL
     marked noindex"** errors for the six legal pages should also clear — they
     were being submitted and refused at the same time.
   - 📱 **New octopus mark — check the HEADER on a real screen.** The framed
     emblem was replaced by the floating octopus in both the header and the
     favicon. At the header's 40px it is a small, detailed illustration on cream
     `#f9f9f7`; it renders cleanly in a synthetic preview, but whether it reads
     well beside the wordmark at real device pixel ratios is a judgement call.
     Check a retina laptop and a phone. If it looks weak, the fix is a tighter
     crop on the body, not a bigger file — the asset is deliberately capped at
     120px tall / 16KB because it loads on every page.
   - 🔎 **Favicon — check the browser tab immediately, Google much later.** The
     tab icon should be the octopus the moment the deploy lands (hard-refresh;
     browsers cache favicons hard). In Google results it is re-crawl-gated and
     Google caches favicons **aggressively — expect weeks**. Do not re-cut the
     artwork because the palm tree is still showing a few days after deploy.
     If it never updates, confirm `https://naplesestatejewelry.com/favicon.ico`
     and `/icon.png` both return 200 to Googlebot.
   - 🔎 **Also check `/silver-services` after re-crawl.** Its title now reads
     *"Sell Sterling Silver in Naples, FL"* (58 chars) — it is the page that
     should rank for "sell sterling silver naples", and it previously had that
     phrase everywhere except its title. Worth watching whether it starts
     outranking the homepage for that query. ℹ️ Note its title and description
     are **not localized** (same string in EN and ES) — pre-existing, unrelated
     to this change, and worth a separate decision.
   - 📱 **Route progress bar, in production specifically.** Most routes are
     prefetched there, so it should appear **rarely** — mainly on product-card
     taps (`prefetch={false}`) and on a slow connection. If it flashes on
     ordinary fast navigations, raise `SHOW_DELAY_MS` in
     `components/layout/RouteProgressBar.tsx`; the owner rule is that it appears
     only when genuinely needed. Also confirm it never lingers after a page has
     rendered, including on browser Back. Check it sits flush against the
     header's bottom edge at both a phone width and a desktop width — the header
     changes height at md — and that it does not appear to overlap or detach
     from the header while scrolling.

8. ✅ **Showroom copy rollout DONE 2026-08-17, deployed 2026-08-18.**
   Owner gave the address, hours and shared-space arrangement on 2026-08-17:
   **6240 Shirley St, Ste 104, Naples, FL 34109**, **Tue–Sat 11:00–15:00 or by
   appointment**, inside **Sharon Lynch Collections**. Decision recorded:
   **store-first, home visits by request** — so the 6 city pages are reframed,
   not deleted. Scoped by grep: **15 files, 61 strings, both locales**, plus 8
   surfaces that need the address added. Two strings are outright FALSE today
   (schema hours claim Mon–Sat 10:00–17:00; the homepage strip says Mon–Sat).
   All 15 files rewritten in both locales and both false strings fixed. Gate
   passed from a deleted `.next`: `tsc` clean, lint clean, **1016/1016**,
   **454/454 pages**. Verified by fetching the running app: address + landmark
   + hours present on `/`, `/es`, `/contact`, `/es/contact`, `/shipping`,
   `/es/shipping`, `/checkout`, `/faq`, `/sell/naples` and `/shop`, and no
   stale mobile-only claim served on any of 8 pages checked.
   🔴 **Two owner actions still outstanding — see *PHYSICAL LOCATION* below:
   the real `geo` coordinates, and the CAN-SPAM marketing mailing address.**

Nothing else in this file blocks a deploy.

## ✅ Stray nested git repo inside `next-app/` — DELETED 2026-08-14

`next-app/.git` was a **second, orphaned git repository**. Removed on owner
instruction; nothing referenced it and the root repo at
`https://github.com/DarkMatter-WebDev/NaplesAntiquesLLC.com.git` is the real one.

**What it actually contained** (read off disk before deleting, not assumed): 47
files / 101 KB, created **2026-06-12**, HEAD on its own `main`, **no remote**, no
packed-refs, no stash, and exactly **one commit — "Initial commit from Create
Next App"**. It was the leftover `git init` from scaffolding the app. Note the
earlier entry here said "176K, created 2026-08-08"; both figures were wrong.

**Why it mattered:** had it reached the repo folder, git would have treated
`next-app/` as an embedded repository and stopped tracking its contents normally,
silently dropping the entire application from commits. It never broke anything
because the files under `next-app/` were already tracked individually, and the
staging robocopy excludes `.git` at every level.

**Backup, if it is ever wanted:**
`C:\Users\rcman\NEJ-next-app-git-backup-2026-08-14.zip` (92.8 KB, all 47 files
including `refs/heads/main` and both reflogs). Delete it once you are satisfied.

Verified after removal: exactly one `.git` remains (the root), root repo
unchanged at 535 files with its remote intact, and `tsc` / `npm test` 963/963 /
`npm run build` all still clean.

⚠️ Still worth a glance, unchanged: the root `.git/config` carries
`[submodule] active = .`, a leftover from some earlier submodule wrangling. There
is no `.gitmodules`, so it is inert — but it is why the nested repo was worth
removing rather than ignoring.

## Copying to the repo folder — use the staging folder

**A ready-made, verified staging copy lives at `C:\Users\rcman\NEJ-repo-staging`**
(rebuilt **2026-08-21**, deliberately OUTSIDE this folder and outside OneDrive so
it neither pollutes the source of truth nor triggers a sync storm). Its contents
are exactly what belongs in the repo — copy *everything* in it into the repo
folder with no exclusions to think about.

✅ **Rebuilt 2026-08-22 and READY TO DEPLOY.** It carries the inquiry-form bot
filter, checkout name+phone validation, phone validation on all remaining
contact/lead forms, the transactional email bounce handler, and the
`ContactForm.tsx` dead-code deletion.

**868 files / 19.84 MB**, **21 copied, 1 Extra DELETED, 0 FAILED / 0 Mismatch**,
and a follow-up dry run reported **0 to copy / 0 extras**. The single Extra was
the staged `ContactForm.tsx`, correctly removed by `/MIR` because the source
deleted it — verified to be that file and nothing else BEFORE the real run.

🔴 **This rebuild caught the `.claude/worktrees` leak** — see the robocopy block
below. The dry run wanted **1,122 files** under `.claude` against **20** real
ones, including a worktree `.git` **file** that `/XD .git` cannot exclude. The
command has been fixed; do not use an older copy of it.

Leak check clean — 0 `.git`, 0 `worktrees`, 0 `node_modules`, 0 `.next`,
0 `.env*`, 0 `.pem`, 0 `*.tsbuildinfo`, 0 `next-env.d.ts`, 0 `*.log` — against a
**positive control of 176 `.tsx`**. ℹ️ That 176 is itself a check: it was 177
before `ContactForm.tsx` was deleted. Hidden paths confirmed present:
`.github/workflows/scheduled-jobs.yml`, `.gitignore`, `.claude/launch.json`,
`next-app/.npmrc`.

Content spot-checks run against the STAGED copy, not the source:

- 🔴 **`maps.google.com` present in BOTH root `netlify.toml` and
  `next-app/next.config.ts`** — the standing item that fails silently if it does
  not travel. Confirmed **1 hit each** after this sync.
- `lib/phone.ts`, `lib/person-name.ts`, `lib/email-bounce.ts` and their three
  test files all present; `components/contact/ContactForm.tsx` **absent**.
- Staged `CheckoutClient.tsx`: **2** `checkout-first-name`, **0**
  `id="checkout-name"` (paired zero — the old single field is gone).
- Staged `create-order/route.ts`: **5** `normalizedName`, **4** `normalizedPhone`.
- Staged `webhooks/resend/route.ts`: **2** `classifyBounceEvent`.
- All three remaining forms import `isValidPhoneNumber` (**2** each); staged
  `MessageUsForm.tsx` has **0** `digits.length` — its old private rule is gone.
- Staged `.gitignore` carries `.claude/worktrees` (**1**).
- Docs carry this session: `CHANGELOG.md` has `2026-08-22 (4)`, `(5)` and `(6)`;
  `CURRENT_STATUS.md` leads with the three-undeployed handoff.

<details><summary>Previous rebuild, 2026-08-21 (marketplace fixes + reconcile sweep) — now superseded</summary>

It carried the marketplace price-push timeout fix, the auto-delist `after()`
fix, the empty write-block list, and the status-drift reconcile sweep.

**861 files / 19.79 MB**, **25 copied, 0 FAILED / 0 Extras / 0 Mismatch**, and a
follow-up dry run reported **0 to copy**. The +6 files over the previous 855 are
exactly the new ones: `product-status-hooks.ts`, the two `reconcile-status`
routes, and three test files.

</details>

⚠️ **The staging folder was NOT the source of the 2026-08-21 19:55 deploy**
(`main@e81f9f9`). It was still on the 2026-08-19 snapshot at that point, so that
deploy came from somewhere else. Worth knowing if the repo folder and staging
ever look out of step. `/MIR` deleted nothing — the
dry run showed 0 Extras *before* it ran, which is the check that makes `/MIR`
safe. Leak check clean — 0 `.git`, 0 `node_modules`, 0 `.next`, 0 `.env*`,
0 `.pem`, 0 `*.tsbuildinfo`, 0 `next-env.d.ts`, 0 `*.log` — against a
**positive control of 177 `.tsx`** (re-confirmed 2026-08-21), so the zeros are a real result rather than a
broken scan. Hidden paths confirmed present: `.github/workflows/
scheduled-jobs.yml`, `.gitignore`, `.claude/launch.json`, `next-app/.npmrc`.

Content spot-checks run against the STAGED copy, not the source:

- 🔴 **`maps.google.com` present in BOTH root `netlify.toml` and
  `next-app/next.config.ts`** — the standing item that fails silently if it does
  not travel. Confirmed **1 hit each** after this sync.
- Workflow: **3** `*/30 * * * *` hits and **2** `reconcile-status:` jobs.
- `lib/product-status-hooks.ts` present and importing `after` from
  `next/server`; both `reconcile-status/route.ts` files present.
- Staged `lib/ebay/sync.ts` has the write-block list as `new Set([])` (**1** hit)
  and **8** `deadlineAt` references; `lib/etsy/sync.ts` has **6**.
- `bulkPatchListings` present in both stores (**3** / **2**), and
  `export function queueDeepFieldSync` is **0** — it was deliberately deleted.
- Docs carry this session: `CHANGELOG.md` has `2026-08-21 (3)`, `(4)` and `(5)`;
  `STRUCTURE.md` says **456 pages**; `DECISIONS.md` carries the never-await rule.

⚠️ **A wrapped phrase produces a false negative.** Searching staged
`CURRENT_STATUS.md` for "reconcile sweep" returns 0 because the phrase breaks
across a line; single-line tokens return 13. Same trap as any zero-without-a-
positive-control.

<details><summary>Previous rebuild, 2026-08-19 (checkout gate + reviews) — now superseded</summary>

**855 files / ~19.65 MB**, 8 files copied — 4 sources and the 4 memory files:
`CheckoutGate.tsx` (new), `CartDrawer.tsx`, `CheckoutClient.tsx`, and
`[locale]/layout.tsx`. Its spot-checks were the staged `CheckoutGate.tsx`,
`rememberGuestCheckout` in `CartDrawer.tsx`, **0** `checkout-auth-overlay` in
`CheckoutClient.tsx`, and `suppressHydrationWarning` in `[locale]/layout.tsx`.

</details>

Older spot-checks, retained because the CSP one is a standing hazard:

- 🔴 **`maps.google.com` present in BOTH root `netlify.toml` and
  `next-app/next.config.ts`** — the standing item that fails silently if it does
  not travel. Confirmed 1 hit each after this sync.
- Staged `CheckoutGate.tsx` present; staged `CartDrawer.tsx` carries
  `rememberGuestCheckout`; staged `CheckoutClient.tsx` has **0** occurrences of
  `checkout-auth-overlay` (the deleted second prompt) and 2 of `CheckoutGate`.
- Staged `[locale]/layout.tsx` carries `suppressHydrationWarning` and still has
  its 8 `--app-vh` references.
- Docs carry this session: `CHANGELOG.md` has `2026-08-19 (4)`,
  `CURRENT_STATUS.md` leads with the undeployed-gate handoff, `DECISIONS.md`
  carries the one-gate rule, and this file has both the deploy item and the
  hydration fix.

<details><summary>Previous rebuild, 2026-08-18 (viewport-jump batch) — now superseded</summary>

**854 files / 19.59 MB**, 13 files copied, 0 FAILED / 0 Extras / 0 Mismatch,
follow-up dry run 0 to copy, positive control 176 `.tsx`. The 13 files were the
7 sources carrying the eight `*-screen` → `min-h-svh` conversions, the 2 new
files (`ViewportDebugOverlay.tsx`, `viewport-units.test.ts`), and the 4 memory
files. Its spot-checks were the `min-h-svh` body class, the
`<ViewportDebugOverlay />` mount, and zero CODE occurrences of `*-screen` under
staged `next-app/src` (the six remaining lines are COMMENTS explaining the ban,
which is also why the compiled CSS still emits the dead rule).

</details>

⚠️ **Verifying a staged path containing `[locale]` needs `-LiteralPath`.**
PowerShell reads `[...]` as a wildcard character class, so a plain `Test-Path`
reports `next-app/src/app/[locale]/...` as MISSING when the file is there. That
false alarm is easy to act on by mistake.

ℹ️ **Robocopy reports 858 total against 855 on disk, and that is correct** — it
counts `/XF`-excluded files in its total. The three are `.env.local`,
`tsconfig.tsbuildinfo` and `next-env.d.ts`, all verified absent from staging.
Do not chase this gap as a missing-file bug.

⚠️ **It is a point-in-time snapshot.** Rebuild it after any further edits:

```powershell
$src="C:\Users\rcman\OneDrive\Documents\NaplesEstateJewelry.com"; $dst="C:\Users\rcman\NEJ-repo-staging"
robocopy $src $dst /MIR /XD .git node_modules .next .turbo .cache .vercel coverage out build "$src\.claude\worktrees" /XF *.log *.tmp *.bak *.orig *.tsbuildinfo next-env.d.ts .env .env.*
```

🔴 **`"$src\.claude\worktrees"` was ADDED 2026-08-22 and is not optional.**
Background agent sessions create git worktrees under `.claude/worktrees/`, and a
single one adds **~860 files**. Worse, a worktree's `.git` is a **FILE** (a
pointer to the parent repo's metadata), not a directory — so **`/XD .git` does
not exclude it** and a `.git` entry would be copied into the repo folder.

Caught by a dry run on 2026-08-22: **1,122 files** under `.claude` were queued
for copy, versus **20** real ones. `.claude/worktrees/` is now gitignored too,
but robocopy does not read `.gitignore`, so the `/XD` entry is what actually
protects the copy.

⚠️ Note the exclusion must be the **full path**, not the bare folder name —
`/XD worktrees` would exclude any directory of that name anywhere in the tree.

⚠️ **`.claude/launch.json` must still travel.** Never exclude `.claude` wholesale.

⛔ **The dry run is not optional, and "0 Extras" is not the only thing to check.**
Read the file COUNT as well: this procedure expects a number close to what the
session actually changed. A count in the hundreds means something is leaking in,
not that you did more work than you thought.

(`/MIR` is safe against `$dst` here because that folder exists only for this
purpose. Never point `/MIR` at the real repo folder without `/XD .git`.)

### Why a wholesale copy of the project root is wrong

Two directories must be excluded, which is the whole reason the staging folder
exists:

1. **`.git` at the root** (345 MB). It points at `origin =
   DarkMatter-WebDev/NaplesAntiquesLLC.com` — the same repo you push to — so
   copying it over the destination's `.git` replaces that folder's HEAD, index,
   refs, and stash with this folder's. Same remote, so it is recoverable, but it
   can silently rewind the destination's working state.
2. **`next-app/.git`** — the stray above.

Optional but strongly advised: exclude `node_modules/` and `.next/`. Both are
gitignored so they would never be committed, and skipping them turns a multi-
minute copy into a few seconds.

Dry-run first (robocopy `/L` lists without writing anything). `/XD .git` matches
that directory name at every level, so it protects the destination's own `.git`
from `/MIR` as well:

```
robocopy "C:\Users\rcman\OneDrive\Documents\NaplesEstateJewelry.com" "<repo folder>" /MIR /XD .git node_modules .next /L
```

Then re-run without `/L`. **After the copy, confirm `.github/workflows/` landed** —
it is a hidden directory and some copy methods skip dotfiles. `.env.local` will
be copied onto disk but stays gitignored and uncommitted, same as today.

## ✅ PHYSICAL LOCATION — copy rollout DONE 2026-08-17 (deployed 2026-08-18)

Owner confirmed **2026-08-17**: the showroom is **open**, in a shared space,
and the site still tells every visitor the opposite on every page. The earlier
"copy pass across 10 files" estimate here was low. Re-scoped by grep against
the tree on 2026-08-17: **15 files, 61 strings, both locales.**

### ✅ What shipped into the working tree 2026-08-17

All 15 files rewritten, both locales. New single source of truth:
**`next-app/src/lib/business-location.ts`** — address, hours, wayfinding copy,
`PostalAddress` and `OpeningHoursSpecification` builders. Every surface imports
from it; nothing retypes the address. New component
`components/contact/VisitUsPanel.tsx` (server component) gives `/contact` the
address, hours and a directions link it never had.

`service-areas.ts` and the six city pages were **reframed, not stripped** —
"visit the Naples showroom, or ask us to come to you" — so the travel-intent
ranking survives the change.

⚠️ **Still open, both owner-side:**

1. ✅ **`geo` DONE 2026-08-17** — owner supplied **26.222053, -81.781429**;
   verified live in the JSON-LD. The old pin (26.142, -81.795) measured
   **5.59 miles** from the real door.
2. ✅ **CAN-SPAM mailing address DONE 2026-08-17 — in code, no data entry.**
   `getMarketingSettings()` now falls back to `addressOneLine()`, so marketing
   email can never send without a physical address and the Admin field became
   an OVERRIDE rather than the only source. The dead "add an address before
   sending" warning was removed from the composer, and the Settings panel now
   states which address is used when the box is blank. Deliberately the plain
   postal address, NOT the "inside Sharon Lynch Collections" form — the
   landmark is wayfinding and does not belong in a legal footer.
3. ❌ **eBay item-location ZIP — WON'T FIX (owner decision, 2026-08-17).**
   The inventory location is created from a hand-typed postal code and nothing
   in this codebase records what was entered, so eBay's "Item location" may not
   read 34109. **Owner has accepted this: anywhere in Southwest Florida is
   fine.** Do not re-raise it as a NAP defect, do not implement
   `POST /location/{key}/update_location_details`, and do not spend a future
   session auditing it. The admin field is now prefilled from
   `business-location.ts`, which is enough for any future setup.
4. ❌ **Etsy shop location — WON'T FIX (owner decision, 2026-08-17).** There is
   no address anywhere in `src/lib/etsy/` and none is needed; the shop location
   is an Etsy account setting. Owner is not changing it. Do not re-raise.
5. ❌ **`naplesjewelrybuyers.com` — WON'T FIX (owner decision, 2026-08-17).**
   Listed in `sameAs`. Owner is not updating it for the showroom. Do not
   re-raise.
6. 🔴 **Google Business Profile — the ONLY external item still open.** Name,
   address and hours byte-identical to the site; hours must match
   `openingHoursSpecification` (Tue–Sat 11:00–15:00) or Google compares them
   and the mismatch costs ranking.

### Copy rewrite — 15 files, 61 strings, both locales

Under the store-first decision, `travelEn`/`travelEs` and the city pages are
REFRAMED (serving <city> from the Naples showroom, visits on request), not
deleted — the 6 city pages keep their local-SEO value.

| File | Hits | What is there |
| --- | --- | --- |
| `src/lib/service-areas.ts` | **18** | ⚠️ **Missed by the old 10-file list, and it is the biggest one.** `travelEn`/`travelEs` for all 6 cities + blurbs ("crosses the bridge to you") |
| `[locale]/sell/[city]/page.tsx` | 10 | `:107` "We come to you" heading, `:141` "Do I have to come to you?", `:143` "so you never have to carry valuables into a store" |
| `[locale]/(home)/page.tsx` | 7 | `:263` "No storefront, no middlemen", `:441` hours strip, `:350`/`:356` the "see a piece in person" FAQ |
| `[locale]/about/page.tsx` | 5 | `:117` "no storefront pressure", `:131` a stat tile reading literally **"Mobile / We Come to You"** |
| `[locale]/sell/page.tsx` | 4 | `:75` "Private, mobile buyer … we come to you" |
| `[locale]/faq/page.tsx` | 4 | ⚠️ Missed by the old list. `:74` "Most clients prefer this approach **over a public storefront**" |
| `[locale]/free-evaluation/page.tsx` | 3 | `:490` "Mobile and appointment-only" |
| ~~`components/contact/ContactForm.tsx`~~ | 2 | `:428` "Mobile, appointment-only evaluations in…" — **file deleted 2026-08-22 as dead code** |
| `[locale]/trade-in/page.tsx` | 2 | `:167` "we come to you" |
| `components/layout/SiteFooter.tsx` | 1 | `:56` "we come to you" — sitewide, every page |
| `app/layout.tsx` | 1 | `:26` root meta description |
| `[locale]/services/page.tsx` | 1 | ⚠️ Missed by the old list. Meta description "appointment-only" |
| `[locale]/silver-services/page.tsx` | 1 | ⚠️ Missed by the old list. `:320` "evaluación móvil privada" |
| `[locale]/contact/page.tsx` | 1 | ⚠️ Missed by the old list. Meta "Mobile, private evaluations" |

Also stale: the code comment at `components/home/HomeHeroOverlay.tsx:105`
explaining why the hero deliberately omits the service model.

### Add address / hours — where, and why it matters

| Where | Why |
| --- | --- |
| `[locale]/layout.tsx:39-48` | Add `streetAddress` + `postalCode`; add `hasMap`. ⚠️ **`geo` is 26.142, -81.795 — downtown Naples, miles from Shirley St.** Pull the real lat/long from Google Maps; do NOT estimate it, a wrong pin is worse than none |
| `components/checkout/CheckoutClient.tsx:651` | Local Pickup says "in the Naples area" and never says where. A buyer committing $5k should see the address first |
| `lib/order-invoice-email.ts:116` | 🔴 **Sharpest gap found.** The pickup receipt tells the buyer to *call to find out where to go* |
| `[locale]/shipping/page.tsx:30` | "Local pickup by appointment in the Naples / Southwest Florida area" |
| `components/layout/SiteFooter.tsx:51-75` | Contact column has phone + email, no address. Sitewide NAP signal |
| `[locale]/contact/page.tsx` | Call button + form only — no address block, no hours, no map. Best home for the full wayfinding sentence |
| `[locale]/(home)/page.tsx:356` | FAQ "Can I see a piece in person?" — the answer changes completely |
| `lib/order-email-branding.ts:30` | Every order email footer says just "Naples, FL" |

### Owner-side, not code

1. 🔴 **Verified Google Business Profile at 6240 Shirley St.** Still the single
   biggest lever — a storefront competes in the local pack where a service-area
   business cannot. Hours there MUST match `openingHoursSpecification`.
2. 🔴 **Marketing email mailing address** — `lib/marketing-email-html.ts:10`
   injects `mailingAddress` from the `marketing_settings` DB row (Admin →
   Marketing Settings). CAN-SPAM requires a real physical address on marketing
   mail; update it to Shirley St. Sending is already blocked when it is empty.
3. **NAP consistency** across GBP, eBay `merchant_location_key`, Etsy shop
   location, and `naplesjewelrybuyers.com`. Mismatches are a common
   local-ranking own goal.

### Order of work

1. Fix the two FALSE strings (schema hours + homepage strip) — smallest edit,
   removes the active liability.
2. Add address/hours to the 8 surfaces above, starting with the pickup receipt
   and checkout, which are transactional rather than marketing.
3. Reframe the 61 marketing strings, both locales, `service-areas.ts` first
   since it feeds all 6 city pages.
4. Owner: GBP, marketing mailing address, marketplace NAP.
5. Then re-check `PROJECT_OVERVIEW.md`'s "Service model" line, which still
   reads "mobile, appointment-only, no physical storefront".

## ◻️ OWNER: delete four pre-go-live test orders

Audited 2026-08-13, all confirmed against PayPal. **No customer money involved;
nothing is owed to anyone.** Owner is deleting these manually.

| Order | Amount | Environment | Why it should go |
| --- | --- | --- | --- |
| `NEJ-20260703-XBFR0` | $5,646.90 | SANDBOX | fictional money inflating the live orders table |
| `NEJ-20260709-6EZ4X` | $37.10 | SANDBOX | same |
| `NEJ-20260705-SPWIC` | $1.06 | LIVE | DB says refunded; PayPal never refunded it |
| `NEJ-20260709-DLNY0` | $1.06 | LIVE | same |

The two sandbox rows are why the live `orders` table shows revenue that never
existed. The two live rows are the opposite error — the record claims a refund
PayPal never performed ($2.12 total, both owner test addresses). Owner confirmed
2026-08-13 that the live pair is fine to simply delete rather than refund.

⚠️ Deleting an order also removes its `order_items`. That is correct here — the
products involved were test data or have long since been re-listed — but do not
generalize it to a real order.

## ◻️ After the next deploy: re-measure first paint on production

The 2026-08-14 first-paint work must be confirmed against production —
**localhost reports `transferSize: 0` and cannot measure it.**

Baseline before the fix: **533KB across 30 requests before FCP**, FCP 488ms on
a fast desktop connection. Run this in the console on
`https://naplesestatejewelry.com/` and compare:

```js
const fcp = performance.getEntriesByType('paint').find(p => p.name === 'first-contentful-paint').startTime;
const before = performance.getEntriesByType('resource').filter(r => r.startTime < fcp);
({ FCP: Math.round(fcp), requests: before.length,
   KB: Math.round(before.reduce((s, r) => s + (r.transferSize || 0), 0) / 1024) });
```

Expect the carousel images (157KB) to fall out of the pre-FCP window and the
stylesheet to start much earlier than 336ms.

◻️ **Then test on a real phone on cellular, not office wifi.** This bug was
invisible on a fast connection with a warm cache, which is why it went
unreported for so long. Watch specifically for how long the screen is blank
before the branded splash appears.

◻️ **Remaining lever if it is still slow: 258KB of scripts before FCP.** Not
touched in this pass — deferring or splitting them is a larger change than
priority hints and needs its own measurement.

## 🔴 BEFORE THE NEXT DEPLOY — this batch specifically (2026-08-17)

Everything in code is gated green: `tsc`, lint, **1016/1016**, **454/454 pages**
from a deleted `.next`. No SQL outstanding. No new env vars. What is left is
judgement and procedure, not code.

1. ✅ **Amethyst CONFIRMED by the owner, 2026-08-17.** The product attribute
   colors (CHANGELOG 2026-08-17 (7)) are signed off as shipped: emerald status /
   metal-true / sapphire karat / amethyst length. No further review needed —
   do not re-open the palette.
2. ✅ **Test email DELIVERED and owner-verified, 2026-08-17.** Sent to
   `info@naplesestatejewelry.com` (Resend id `e1a0a905-d546-4f39-9d98-c93fda214ce8`),
   **arrived in the inbox — not Spam — and the owner confirmed the address,
   hours and landmark all read correctly** on the receipt note, the order footer
   (HTML and text) and the marketing footer. The only complaint was the wrapping
   of the test harness's own layout, which is scaffold from the one-off send and
   is not part of any production template.
   ⚠️ Sent from LOCAL using the production Resend key and `EMAIL_FROM`, so it
   proves Resend + DNS + DKIM/DMARC + inbox placement. It does **not** prove
   Netlify's env vars, which have silently differed before (`EBAY_CRON_SECRET`,
   `EMAIL_FROM`). Original note: **this deploy TOUCHES EMAIL, so deploy-day
   item 3 applies: test send and OPEN THE INBOX.** Three email paths changed — the pickup line in
   `order-invoice-email.ts`, the address in BOTH `order-email-branding.ts`
   footers (HTML *and* plain text), and the marketing footer's mailing address,
   which now falls back to the showroom address in code. DMARC is
   `p=quarantine`: a DKIM or alignment fault lands in spam **without erroring**,
   so a green "sent" in Resend's log proves nothing.
3. ✅ **Hours CONFIRMED TRUE by the owner, 2026-08-17.** The showroom really is
   open Tue–Sat 11:00–15:00, so publishing them in the present tense is honest
   and this no longer blocks the deploy. (Signage is not up yet, which is why
   the Google Business Profile is still pending — but the copy already names
   Sharon Lynch Collections as the landmark, so wayfinding does not depend on
   our own sign existing.)
4. ✅ **Staging rebuilt 2026-08-17** — see *Copying to the repo folder* for the
   verified figures. Docs were written BEFORE the sync, then a dry run confirmed
   0 copies outstanding.
5. 📱 **The four changes from 2026-08-17 still want a real thumb** — octopus
   mark at 28px, the route bar's deliberate flash, the photo-swipe cone, the
   ES/EN chip. See item 2 at the top of this file. They have now been sitting
   unverified across several sessions.
6. ℹ️ **Local builds run Node v24.16.0; Netlify pins NODE_VERSION 20** and
   `package.json` declares no `engines`. Production has always built on 20, so
   the risk is low — but watch the Netlify log rather than trusting the local
   pass.

**After it publishes:** resubmit the sitemap and Request Indexing on the pages
whose descriptions changed (`/`, `/sell`, `/about`, `/faq`, `/services`,
`/contact`, and all six city pages). Then re-measure first paint on production —
still open from the last batch, and localhost cannot measure it.

**Deliberately NOT blocking this deploy:** the Google Business Profile. It needs
the store signage up and a verification video, and the owner is doing it soon.
Publishing the address first is the right order anyway — the site becomes a
citation that already matches when the profile is verified.

## Deploy-day checklist (reusable)

Standing procedure for every deploy from this folder — the last run of it was
2026-08-08, and the 2026-08-06 sign-off evidence behind it is in CHANGELOG.

1. **Copy this folder to the repo folder and deploy.**
2. **Watch the Netlify build log.** Local builds run on **Node v24**; Netlify
   pins **NODE_VERSION = 20** and `package.json` declares no `engines`.
   Production has built on 20 all along, so risk is low — but a local green
   build is not literally proof of theirs.
3. **If the deploy touches email, test send and OPEN THE INBOX.** DMARC is
   `p=quarantine`, so a DKIM or alignment fault delivers to spam **without
   erroring** — a green "sent" in Resend's log is not the check that matters.
4. **Check for outstanding manual SQL** before deploying. (None is outstanding
   as of 2026-08-09.)
5. ⚠️ **"The change didn't land" is usually BROWSER CACHE, not the deploy.**
   Prove it from outside the browser before re-deploying or re-syncing staging —
   neither of those fixes a client-side cache, and both are wasted work. Hit the
   live URL with `curl` and grep for a marker the change removed or added:

   ```bash
   curl -s "https://naplesestatejewelry.com/" | grep -c "SOME_REMOVED_STRING"
   ```

   If that returns what you expect, the deploy is fine and the fix is a hard
   refresh (Ctrl+F5 / Cmd+Shift+R, or a private window; on iOS Safari close the
   tab entirely — it has no hard-refresh). This cost a round trip on 2026-08-19.
   Context that makes it near-certain: the origin sends
   `Cache-Control: public, max-age=0, must-revalidate`, and the site has **no
   service worker**, so nothing is deliberately serving an offline copy.

Closed and moved to CHANGELOG — do not re-litigate:

- **2026-08-06 pre-deploy sign-off** (clean-build gate, 38-route production
  smoke, legacy-host single-hop, webhook carve-out 401, email end-state, DNS
  record counts). CHANGELOG 2026-08-06.
- **2026-08-05 `EMAIL_FROM` Netlify blocker** — the marketing sender precedence
  chain read the env var *before* the corrected code default; corrected in all
  five deploy contexts and in `.env.local`. The durable rule (env precedence
  can silently defeat a code-level fix) is in DECISIONS under the email
  entries. CHANGELOG 2026-08-05.

## Standing Local-Environment Warnings

⚠️ **Local checkout loads a LIVE PayPal client ID** from `.env.local`
(`AamwcjQe…`). Do not click PayPal buttons on localhost — it can create real
orders. This matters most when testing on a phone over LAN, where checkout is
two taps from any product page.

⚠️ **Local dev shares PRODUCTION Supabase**, and the Deep Field sync fires for
real from dev (no `DEEPFIELD_SYNC_DRY_RUN` set). Any admin save from a dev
session is a real product change.

⚠️ **Node here is v24; Netlify pins NODE_VERSION 20** with no `engines` in
`package.json`. Local green builds are strong evidence, not proof of theirs.

⚠️ **`npm run build` and `npm run dev` share `.next`, and the dev server does
not survive it.** Running a production build (correctly, with the dev server
stopped) leaves production artifacts in `.next`; restarting dev on top of them
throws `SyntaxError: Unexpected non-whitespace character after JSON` and serves
**500s on every route**. Seen twice — position 746 and 763. It looks exactly
like corrupted `messages/*.json`, and it is not: validate the JSON to rule that
out (it has always passed), then **stop dev, `rm -rf .next`, restart**. The
fix is reliable. The same wipe also clears the separate Turbopack **per-rule
CSS staleness** bug, where one rule in a file updates while another in the same
file keeps serving old declarations — a reload does not fix that one either.

## Verified Healthy — Do Not Re-Audit

Recorded so these are not re-checked every session. All confirmed 2026-08-05
against the **production build** (`next start`), and the deploy that followed
was verified on 2026-08-06/08:

- Server-authoritative checkout pricing with `$0`/negative rejection and a
  stale-spot guard; no `cost_basis`/keys/JWTs in public HTML; rate limits on
  every public endpoint plus honeypots on all three public forms; security
  headers live with CSP **enforcing** (every browser-loaded origin allowlisted,
  which resolved the old "verify after deploy" note at `netlify.toml:168`).
- 46 route/locale combos with no 4xx/5xx; all 23 legacy redirects resolve to
  200 with no soft-404 dead ends; `/p/` shortlinks resolve; the proxy host
  redirect is single-hop on every legacy host and does not loop; `/api/*` never
  redirects; `.co/api/webhooks/resend` returns **401, not 301** (a 301 there
  would break the live webhooks); zero horizontal overflow at 320px; robots and
  sitemap contain zero `.co` URLs; 404s return a real 404.
- Five customer-facing findings from that audit were all fixed and shipped
  (legacy two-hop redirects, homepage heading skip, Spanish chip units,
  product-page 11px floor, wishlist drawer viewport cap). Detail in CHANGELOG
  2026-08-05; the drawer's durable rule is in DECISIONS under *"Always-mounted
  off-canvas panels must cap their width at the viewport"*.
- **`?returnTo=` hidden-product disclosure** — shipped alone 2026-08-08 and
  verified against production (28/28 anonymous probes 404). Durable rule in
  DECISIONS under *"A query parameter is never an authorization signal"*.

## ✅ Contact Address Moved To .com — CLOSED

The public contact mailbox changed `info@naplesestatejewelry.co` →
`info@naplesestatejewelry.com` sitewide (owner, 2026-08-08), reversing the
mailbox half of the 2026-08-01 split. Six occurrences in five files: footer,
account dashboard, root JSON-LD, per-city JSON-LD, and the order-notification
default.

- ✅ **`info@naplesestatejewelry.com` RECEIVES MAIL — owner-confirmed
  2026-08-09.** This was the last open verification on the email surface, and it
  is not verifiable from the code side, so the owner's confirmation is the
  evidence. Do not re-open or re-audit it.

  Worth keeping visible because it does not stop being true: **`info@…com` is
  the single point of failure for the entire email surface** — footer inquiries,
  account-page inquiries, new-order notifications, marketing campaign From *and*
  Reply-To, campaign bounce handling, and both JSON-LD blocks all route through
  that one mailbox. If it is ever deleted or renamed in Google Workspace, all of
  them break silently and at once.

- ⚠️ **OWNER: delete `ORDER_NOTIFY_EMAIL` from Netlify** (all deploy contexts)
  if it is set there. Local is already done. Background: the code used to read
  `ORDER_NOTIFICATION_EMAIL` (set nowhere) while every environment configured
  `ORDER_NOTIFY_EMAIL` (read by nothing), so the override silently never worked.
  `ownerNotificationRecipient()` now accepts **both** names — do not narrow it
  back to one — which means that previously-dead Netlify variable would become
  live on the next deploy and redirect order alerts to a personal `@aol.com`
  inbox. Leave it set only if you genuinely want that. Detail: CHANGELOG
  2026-08-08.

- ✅ Closed 2026-08-08, detail in CHANGELOG: marketing Reply-To and From both
  moved to `info@…com`; zero `@naplesestatejewelry.co` and zero `chris@`
  addresses remain in a clean production build.

- ✅ **Owner's personal `@aol.com` address no longer ships in the public client
  bundle** (2026-08-08). `ADMIN_EMAIL` was imported by a client-side module, so
  it compiled into the browser bundle; `isCurrentUserAdmin()` now reads
  `profiles.is_admin`. Verified 0 occurrences in `.next`. **Owner confirmed the
  carousel admin panel still loads and saves — 2026-08-09**, which closes the
  one behavior that needed an authenticated session. Note
  `carousel/sql/setup.sql:24` still hard-codes the email in
  `is_carousel_admin()` on purpose: database-side, never reaches a browser, and
  it remains the real enforcement for every write.

## Deep Field Gallery Sync

**LIVE.** Bulk import complete against production, live hooks armed and proven.
See `features/deepfield-sync.md`.

✅ Closed and moved to CHANGELOG 2026-08-08 / `features/deepfield-sync.md`:
the 128-product / 974-image production import (reconciled exactly, 0 failed),
Netlify env vars across all 5 contexts, the live hook proven end to end, the
archived-product push, `image_count` in the feed, and Deep Field's own
confirmations (zero duplicate storage objects, live pricing, 128 rows matching).

Still true and worth keeping visible:

- ⚠️ **No environment writes to a sandbox.** `.env.local` points at PRODUCTION
  Deep Field deliberately — dev shares production Supabase, so a dev save is a
  real product change and must not silently skip the partner. Set
  `DEEPFIELD_SYNC_DRY_RUN=true` locally if a safe run is ever needed.
- ⚠️ **Do not normalize the reconciliation feed's timestamp.** The raw
  microsecond `+00:00` form is emitted deliberately (see the pinning comment at
  the emitting line); under a rounding runtime roughly half the catalog would
  compare as permanently stale.
- ◻️ **Deep Field side, not yet running in production:** their hourly
  reconciliation cron is written and tested but undeployed; they poll manually.
  Until it runs, hard deletes and dropped pushes depend on someone remembering.
  Their first manual run found real drift — `test-item-111-131` displaying as
  available after being archived here — exactly the class the push cannot cover.
- ◻️ **`deleted_at` tombstone: withdrawn, do not build.** Absence already
  produces "hide" on their side, so reconciliation by absence covers both
  archived and hard-deleted.
- ◻️ **Raise the image budget 30 → ~50 only after Deep Field supplies the
  timeout line** from their dashboard. Not urgent. (The 18 → 30 retune is in
  the batch that shipped 2026-08-17.)
- ◻️ **Pin the production batching defaults.** `IMAGE_BUDGET_PER_REQUEST` and
  `MAX_PRODUCTS_PER_REQUEST` have **no test asserting their values**. The
  batching tests pass budgets in as explicit arguments — correct, because it
  keeps them from silently re-baselining on a retune — but it means changing 30
  to 300 breaks nothing. This is the *policy test* half of the mechanism/policy
  split described in DECISIONS, and it is the same "unenforced claim" class Deep
  Field found in their `{n}/20 photos` label. Fix is three lines in
  `src/lib/__tests__/deepfield-batching.test.ts`:

  ```ts
  it('pins the gateway-safe production budget', () => {
    expect(IMAGE_BUDGET_PER_REQUEST).toBe(30);
    expect(MAX_PRODUCTS_PER_REQUEST).toBe(3);
  });
  ```

  Found 2026-08-09 by re-running the constant sweep; deliberately left undone
  rather than expanded into a session that was closing.

## ✅ Discount-codes SQL — APPLIED 2026-08-12

**`supabase/discount-codes-2026-08.sql` has been run in Supabase** and verified
by a real $42.39 purchase (all 18 checks passed, CHANGELOG 2026-08-12). Nothing
outstanding here; the notes below are kept for the deploy record.

The original instruction, for reference:

- **Why the order matters:** the checkout and admin code read
  `public.discount_codes`. The failure is graceful, not catastrophic — a missing
  table makes every code report "not valid" and the admin page shows a
  "run the migration" message instead of a Postgres error — but no discount code
  can work until it runs.
- **What it does:** creates `discount_codes` and `discount_code_redemptions`,
  adds three snapshot columns to `orders`, and **replaces `create_paypal_order`
  and `capture_paypal_order`** (both restated in full from
  `checkout-quantity-2026-07.sql` with the discount additions). Safe to re-run.
- **Run it after `checkout-quantity-2026-07.sql`**, which is already applied.
- **After running,** create one test code in Admin → Discount Codes and confirm
  it applies at checkout. See the smoke list below.

Everything else below remains true: the carousel migrations are all applied.

## Next Deployment And Production Smoke

- ⚠️ **One manual SQL IS outstanding** — the discount-codes migration above.
  The statement below refers to the carousel work only.
- ✅ **NO CAROUSEL SQL IS OUTSTANDING.** Every carousel migration has been run and
  verified against the live database (project `evzluixourmsefwdsieu`):
  `add-second-lineup.sql` and `add-random-lineup-modes.sql` (2026-08-04),
  `add-third-lineup.sql` (2026-08-06, RLS confirmed — anon INSERT refused
  `42501`), and `add-slideshow-bg-colors.sql` (2026-08-09, owner-run, colors
  save and render). All three lineup modes read `manual`, so the storefront
  draws the curated lineups rather than random draws.
- 🔴 **REDEPLOY NEEDED — shop-card date collision.** The 2026-08-09 batch
  shipped as `main@27c12e2` and verified clean except for this: on 2-up shop
  cards the `Ca. YYYY` label overlaps the price (measured **-9px** on production
  at 390px, most other cards at 2px clearance). Fixed locally via a container
  query on `.modern-price-row` that drops the "Ca." prefix below 185px of
  content width, leaving the bare year in place; `tsc`/`lint` clean and measured
  across 320/390/472/1280 in both locales with zero negative gaps and no change
  in row height. **The pre-deploy gate is now GREEN:** `npm test` 848/848 and a
  from-scratch `npm run build` (`.next` deleted, dev server stopped) compiled
  successfully at 449/449 pages with no warnings. **This is waiting on a
  redeploy only.** Detail: CHANGELOG *2026-08-09 (post-deploy)*.
- ◻️ **OWNER: supply a real photograph of Chris for the /free-evaluation hero.**
  It currently shows `evaluation-desk-placeholder.webp` — a generated desk shot
  with the face deliberately out of frame, because the copy beside it is first
  person and a recognisable stranger there would imply he is Chris. When the
  real photo lands, replace the file **and** the alt text together (the alt
  text currently describes a desk, not a person).
- 🔴 **Same redeploy carries the /free-evaluation clay marks.** Three trust
  pillars + six category tiles now use matte-clay WebP illustrations
  (`public/assets/images/icons/clay-*.webp`). After deploy, look at the page on
  a real screen in both locales and check the marks read at 72px/56px and that
  the pillar drop-shadow looks right on the cream band. The pipeline and the
  hard-won rules (generate-then-recolour, all-or-nothing per grid, no shadow on
  dark) are in DECISIONS.
  - ✅ **Rolled out sitewide** — the homepage services strip plus `/sell`,
    `/sell/[city]`, `/trade-in`, `/bullion`, `/gold-services` and
    `/silver-services` now use clay marks through `components/ClayMark.tsx`
    (20 marks total). The earlier inconsistency note is closed. After deploy,
    check each of those pages in both locales.
  - ◻️ The large empty placeholder blocks from the audit are still untouched:
    `/estate-jewelry` "Professional Integrity" (726x726 card, 63px icon) and the
    two `/gold-services` cards. Those want photography, not marks.
- 🔴 **Same redeploy carries the icon fix.** Every `AppIcon` was rendering
  filled wherever a legacy `fontVariationSettings: "'FILL' 1"` style survived,
  turning Lucide outline icons into solid blobs (14 of 24 on
  `/free-evaluation`). The bridge is deleted and all 27 usages cleaned; 137
  icons across 10 pages now show only the 2 intentional rating stars filled.
  Four semantic swaps as well (chains, heirlooms, sterling silver ×2, tea
  services). Guarded by two new tests (846 → 848). Detail: CHANGELOG
  *2026-08-09 (post-deploy 2)*.
  - ◻️ **After deploying, look at the marketing pages on a real screen.** The
    measurements prove the icons are no longer filled; whether every glyph is
    the RIGHT one is a judgement call — `redeem` (gift box) for "Sell Jewelry"
    on the city pages is the one remaining choice worth a second opinion.
- ◻️ **Consider raising Netlify `NODE_VERSION` 20 → 22.** Build log for
  `27c12e2` warns every build: `@netlify/plugin-nextjs` cannot execute on the
  pinned 20.20.2, so Netlify runs the plugin on 22.23.1 instead. Builds succeed;
  this is drift, not breakage.
- 🔴 **Same redeploy carries the /free-evaluation hero rework.** Prose
  hierarchy (lede / gold `<h2>` kicker / `<dl>` metal panel / quiet footnote /
  bright closer), wrap groups centred below `lg`, and the eyebrow contrast fix
  (**2.96:1 → 12.19:1** — it was below AA). Detail: CHANGELOG *2026-08-09
  (post-deploy 5)* and *(post-deploy 6)*.
- 🔴 **Same redeploy carries Free Evaluation in the header Sell nav.** The page
  was previously reachable only from the footer. Detail: CHANGELOG *2026-08-09
  (post-deploy 7)*.
- **Deploy the batch. The full gate has passed on the COMPLETE batch** —
  clean from-scratch `npm run build` exit 0 / 449 pages, **848/848** tests
  across 87 files, tsc and lint clean. **Last run 2026-08-10, after the final
  code change**, with the dev server stopped and `.next` deleted. Exact
  figures, the compiled-output spot check, and the email invariant re-check are
  in `CURRENT_STATUS.md`. Nothing needs re-running before you copy and deploy.
- **Discount codes — smoke after running the SQL and deploying:**
  - Admin → **Discount Codes**: create a percent code (e.g. `THANKYOU`, 15%) and
    a fixed code (e.g. `FIFTY`, $50). Confirm the value field switches between a
    `%` and a `$` prefix with the type, that a percent over 100 is refused, and
    that a duplicate code name is refused with a readable message.
  - Checkout: apply the percent code and confirm the discount row appears
    **directly under Subtotal**, the total drops, and **tax is charged on the
    discounted merchandise plus shipping** (a $1,000 order with 15% off, $35
    shipping, FL address should read $150 off, $53.10 tax, $938.10 total).
  - Apply the fixed code to a cart **smaller than the code** (e.g. $50 off an
    $80 item) and confirm the discount clamps to $80, merchandise reads $0, and
    the order is still payable for shipping + tax.
  - **Complete one real discounted purchase.** This is the check that cannot be
    made locally: confirm PayPal accepts the breakdown (a wrong discount key is
    a 422 at create-order), the captured amount matches the discounted total,
    and the code's **Used** count increments by exactly 1 in Admin.
  - Set a code's total-uses to 1, redeem it, and confirm it then reports
    "Limit reached" and is refused at checkout.
  - Try the same code twice with the SAME email and confirm it is refused;
    ⚠️ then note that a DIFFERENT email will be accepted — that is by design,
    see DECISIONS, *"the cap is the control"*.
  - Set a `minimum order` above the cart total and confirm the refusal names the
    threshold, in both locales.
  - Spanish: apply and remove a code on `/es/checkout` and confirm the discount
    row, the applied chip, and each refusal message are Spanish.
  - Apply a code, then edit the cart, and confirm the discount recalculates
    against the new subtotal rather than showing a stale figure.
- **New surfaces to smoke after the NEXT deploy (2026-08-09 batch), on a real
  phone where marked 📱:**
  - Shop cards 📱: bottom ADD button present on every card; corner cart icon
    (mobile) and header/drawer/checkout icons all render as a CART, not a bag;
    swipe a card photo left/right (dots advance, vertical swipe still scrolls,
    tap still opens the product, a swipe does NOT open it); swipe a second
    card and confirm the first snaps back to its cover; dots float without a
    pill on touch and stay legible on a white-backdrop piece; arrows absent on
    touch, present on desktop aligned with the brand-flag baseline.
  - Hero 📱: flick through the hero — each flick lands on exactly the next
    slideshow, never past it (the momentum override is the one thing synthetic
    touch could not prove); ~1s smooth settle; scrolling out at either end is
    free; desktop wheel behavior unchanged.
  - Hero backgrounds: solid per slideshow, no gradient sweep anywhere; set
    Slideshow 1 black in Admin (its lineup is black-backdrop) and confirm the
    overlay text flips light and the crossing shows a clean color change at
    the midpoint; confirm the admin panel's per-tab background control saves
    without the missing-column warning.
  - Shop card date 📱: confirm the `Ca. YYYY` label is back at the left of the
    price row on a phone, and that it never touches the price or the width
    chip — check a card with a long price and one with no width chip.
  - Hero CTAs 📱: on a real phone confirm Buy/Sell sit side by side with Trade
    centred beneath them — never three stacked rows — and that Trade opens
    `/trade-in` (it used to go to `/contact`). Check Spanish too, where
    `Intercambiar` is the long label.
  - Reviews band 📱: on a real phone confirm the client reviews sit TWO across,
    never one, and that the quote text is comfortably readable at that size —
    this is the judgement call the measurements cannot make for you. The long
    reviews now clamp to 8 lines, so all four cards should be the same height.
    Confirm Spanish too, and the band on a product page including a
    dark-backdrop one, since it renders there from the same component.
  - 🔴 **Reviews → Google link: click one card on the deployed site.** Every
    card links to `https://share.google/KAE0mjQwhKx9EqEZ1` (owner-supplied).
    It is an opaque Google redirect and google.com is unreachable from the
    development environment, so **nothing has verified where it actually
    lands** — confirm it opens the Naples Estate Jewelry profile with the
    reviews visible. One constant to change if not:
    `GOOGLE_REVIEWS_URL` in `next-app/src/lib/testimonials.ts`. While there,
    confirm the whole card is clickable (not just the "Read on Google" line)
    on both a phone and a desktop.
  - `/free-evaluation` as a landing page 📱: open it the way a customer will —
    from a TEXTED link on a phone. The form must NOT be the first thing in
    view; the hero should explain the service, and the form lives in the
    "Send a request below" block underneath. Submit one real test request and
    confirm it arrives at `info@naplesestatejewelry.com`.
  - `/free-evaluation` hero hierarchy 📱: the block should read as lede →
    gold kicker → metal panel → footnote → closer, not as one wall of text.
    The three metal terms (GOLD / SILVER / EVERYTHING ELSE) sit in a left
    column that stays aligned from `sm` up; check Spanish, where the terms are
    shorter but the details are longer.
  - Pills centred 📱: the `/free-evaluation` trust chips wrap 2/1/1 on a phone
    and 3/1 on a tablet — every row should look centred, not ragged-left. This
    is the judgement call the measurements cannot make.
  - Eyebrow contrast 📱: "100% Free — No Obligation" should read as a bright
    gold accent, not a dimmed/disabled label. It was **2.96:1** (below AA) and
    is now 12.19:1 — worth confirming on a real screen in daylight.
  - Header nav: **Free Evaluation** now appears last in the Sell dropdown
    (desktop) and the Sell accordion (mobile), after Trade-In Program. Confirm
    both, in both locales, and note that the parent **Sell** tab now highlights
    while you are on `/free-evaluation` — that is intended.
  - Hero perf spot-checks: network tab shows NO raw-original image fetches
    beside the `/_next/image` ones (formerly a full duplicate set), hero
    images at `q=82`, and the loading spinner disappears from the DOM after
    the fade rather than spinning invisibly.
- After deployment, verify these focused surfaces against production:
  - `/admin/social-queues`: seven Eastern choices, responsive row actions,
    individual and selected-row background **Post now**, change/remove
    confirmation, both worker-health summaries, and **Latest Posts** view/
    manage/refresh/comment/removal controls. Confirm both channel headers fully
    collapse and independently reopen their sections. Do not comment, remove,
    or publish merely for QA.
  - One Instagram and one Facebook manager: guided step order, Save & prepare,
    generated card as slide 1 with **NOW AVAILABLE**, exact prepared framing,
    slide viewer arrows, AI opener controls, and wording/photo/both sync.
  - One remotely deleted social post: Refresh status should mark it Removed only
    when Meta confirms absence; an ambiguous read must retain Published.
  - Admin Products at 2100px+: no right-side table gap; Brand expands first.
  - Manage Instagram, Shop, a product, My Account, Admin Orders, and a service
    page at 2000px+: application/grid canvases expand while prose, checkout,
    auth cards, and dialogs remain readable.
  - Purchase panel: on a phone and a tablet confirm the scrap-value and
    based-on-spot tiles sit side by side (never stacked), and that the buy
    buttons form a flush block — one row of four on a wide column, or Add to
    Cart full width above Save/Inquire/Call on a narrow one. Check a sold item
    too (its two buttons stack until the column is wide), and Spanish.
  - Dark-theme product page (one whose first photo is on a black backdrop, e.g.
    `/shop/10k-gold-rope-chain-necklace`): scroll to "You Might Also Like" and
    the reviews band and confirm the card text is dark-on-white and fully
    legible, in both locales. Compare against a light-backdrop product to be
    sure nothing there changed.
  - Product detail two-column fill: open a product at ~1280-1440 and confirm
    column 1 reads gallery → Notes → the three policy accordions while column 2
    reads price panel → description → Specifications, both columns ending
    together, clear blank space before the three trust icons, and the icons
    spanning the full page width. On a phone (below 640px) confirm the stacked
    trust badges AND the three policy accordions are centred, and that at 640px+
    the badges go 3-up while the accordion titles return to the left with their
    chevrons on the right. Confirm the phone layout still reads
    gallery → price → description → specs → notes → policies. Also check one
    ultra-wide screen (2000px+), where the notes/accordions aside should
    instead sit under the info column, and one Spanish product page.
  - Product specifications: confirm a necklace and a bracelet each show a
    **Width** row in mm (Ancho in Spanish) matching their shop-card chip, and
    that a ring/pendant shows no Width row.
  - "You Might Also Like" cards: confirm each shows purity / weight / length /
    width chips matching that piece's shop card, and that a piece with no stored
    width shows only three. The pills must stay on ONE line at every width —
    check a phone (they shrink and sit under the price) and a desktop (they sit
    beside the price) — must never spill outside the card, and within one strip
    must either ALL sit beside the price or ALL sit below it, never a mix. Below
    361px the strip should show one card per row at full title/pill size.
  - Homepage carousel backdrops: confirm black-backdrop photos render as solid
    rounded black cards with no white bars or square photo corners. (The
    swept-background half of this check is OBSOLETE as of 2026-08-09 — the
    hero background is now one solid color per slideshow; see the new smoke
    items above.)
  - Product gallery/lightbox: no clipped thumbnail border or wrap stutter.
    Confirm the hover/touch magnifier is gone everywhere, that tapping a
    prev/next arrow on the main photo changes the image WITHOUT opening the
    lightbox, that clicking the photo itself still opens it, and that a vertical
    swipe starting on the photo scrolls the page on a real phone. The arrows are
    now narrow full-height bars hugging each side, present only from 768px up.
    On a real PHONE confirm there are no bars and that swiping the photo changes
    it (left = next, right = previous), that a vertical swipe still scrolls the
    page, and that a tap still opens the lightbox. On a real TABLET confirm the
    bars are there AND the swipe works. On desktop confirm each bar
    fades UP as the cursor approaches that side (independently — the far bar
    stays hidden) and is solid once the pointer is over it, that they are
    permanently
    visible on a phone, legible on both a white-backdrop and a black-backdrop
    product, advance the photo when clicked near the top or bottom of the bar
    rather than on the chevron, and that clicking the middle of the photo opens
    the lightbox rather than catching a bar. Step through EVERY photo of a
    product whose first image is on black: the bars must stay visible as a
    continuous strip on each one, including photos whose backdrop differs from
    the frame's padding colour.
  - `/account/sign-in`, `/account/sign-up`, My Account Change Password, and a
    real reset-password link: every password field uses the shared eye toggle.
  - Redirect smoke: `/shop.html` and `/cart` redirect correctly;
    `/shop/new-listing-04` intentionally 404s because its listing was deleted.
  - Checkout two-column layout, a $5,000+ item, spot refresh, and product
    weight/specs. Confirm the sticky summary rail, Back to cart / Edit cart
    reopening the drawer without losing entered details, the confirmation
    checkbox still gating the PayPal buttons, and Local Pickup hiding the
    required address.
  - Homepage hero parallax stack: text/form/CTAs stay pinned through the
    crossing and hold, only slideshows move, sticky release carries text and
    slideshow away together, scroll-back restores, offscreen pane is inert,
    overlay theme flips with the dominant slideshow, and the reduced-motion
    single-hero fallback works on a real device.
  - Second slideshow lineup: confirm the scroll reveal shows the curated
    Slideshow 2 lineup (and that clearing it falls back to mirroring
    Slideshow 1). Confirm slideshow B's photos flow left-to-right (opposite
    of A) and still cycle through the full lineup.
  - Random fill: on each slideshow tab try Gold jewelry / Silver jewelry /
    Non-jewelry items, adjust the drawn order, then **Save All Slideshows**
    and confirm the homepage shows exactly that saved arrangement (it should
    NOT re-randomize on the next cache refresh).
  - Sold pieces in slideshows (**not yet exercised end-to-end** — verifying
    storefront rendering requires saving a sold piece, a live DB write left
    to the owner): switch the picker to Sold items, add one sold piece, Save
    All Slideshows, and confirm the hero renders it with NO price caption and
    that clicking its card lands on the product page showing Sold. Also
    confirm the All/Available/Sold checkboxes scope both the picker and the
    random fill buttons.
  - Hero pane seam: `PANE_A_TRAVEL` is **85**, so the arriving pane overlaps
    the departing one by ~15% of a frame. Scroll the homepage and confirm the
    join reads as one continuous move with no band of empty backdrop between
    the two slideshows.
  - Header height token: page content now starts exactly at the header's bottom
    edge (measured 72/72 desktop, 56/56 mobile) instead of 9px behind it. On a
    real device check a few converted pages — `/`, `/about`, `/faq`,
    `/checkout`, `/contact` — plus the hero pin and the mobile menu panel's
    scroll height. Mobile page tops sit 8px higher than before (56px reserved
    vs the old 64px) because the reservation now matches the real 56px header.
- Reconfirm that production build and development server are never writing
  `.next` concurrently; stop local dev before a manual production build.

## Checkout, Tax, Orders, And Email

- **Complete accountant review before changing tax.** Keep the current 6%
  Florida-only policy. Review destination county rate lookup, Florida's
  per-item $5,000 discretionary-surtax cap, registered nexus states, estimate
  wording, and PayPal jurisdiction cases.
- ✅ **Refunds — full AND partial — are verified (2026-08-12).** The first live
  refund found that every refund silently failed to record; fixed, and a full
  refund verified end to end against a real PayPal capture. The partial path was
  then exercised against the **real `apply_paypal_refund` Postgres function**
  with a synthetic $100 order — 18 checks covering the
  `cumulative - alreadyRefunded` increment, `PENDING`-ledger attachment,
  idempotent replay, the full-refund flip, and the over-refund clamp. Detail in
  CHANGELOG 2026-08-12.
  - ✅ **Live partial refunds DONE 2026-08-13.** Two real partial refunds
    ($0.50 then $0.56 on a $1.06 purchase) confirmed the payload shape against
    PayPal's API directly. `total_refunded_amount` is **cumulative** — proven by
    re-fetching the first refund and seeing `amount $0.50` alongside
    `total_refunded_amount $1.06`. Nothing here remains open.
- ✅ **`paypal_refunds.amount` settled 2026-08-13 — DONE.**
  `supabase/paypal-refund-ledger-2026-08-13.sql` is **applied**. The column now
  means *this refund's own amount* (read from the payload, never derived),
  `orders.refund_amount` is SET from PayPal's cumulative and clamped
  monotonically, and an applied row's amount is immutable. The ledger is keyed
  by PayPal's real refund id, which removed the synthetic `event:<id>` key and
  the fuzzy amount-matching that caused mis-attachment.
  20 checks passed against the real function, including out-of-order delivery.
  Reconciling against a SUM of `paypal_refunds.amount` is now valid.
  - ✅ **Both halves are live as of 2026-08-17** — the migration was already
    applied and `webhook/route.ts` has now shipped, so the CAPTURE.REFUNDED
    handler sends PayPal's cumulative and its real refund id rather than the
    derived increment and the synthetic `event:<id>` key. The interim state was
    never harmful (the old accumulate branch still produced a correct
    `orders.refund_amount`), but the ledger shape is only correct from here on.
    ⚠️ **This path has still never run automatically in production** — confirm
    it on the first real refund.
  - ◻️ **Cosmetic, unreachable in practice:** an over-refund writes a
    `paypal_refunds` row for the full increment while `orders.refund_amount`
    clamps at the total, so the ledger would sum higher than the order. PayPal
    cannot refund more than was captured, so this only occurs in the defensive
    path. Left alone deliberately.
- **Run the rest of the controlled PayPal matrix** in the configured
  environment: create retry, successful/declined/ambiguous capture,
  local-finalization retry, duplicate webhooks, two-buyer race,
  partial/idempotent refunds, pending/failed refund states, locked shipped
  address, Local Pickup, invoice, guest confirmation, and receipt history.
  ⚠️ The refund bug is the standing argument for actually running this: it sat
  undetected because no live refund had ever been issued, and a green unit suite
  had asserted the broken behavior.
- Verify one shipped PayPal order retains the exact approved shipping address
  and one Local Pickup order omits shipping.
- Verify Available → Sold → Available sold-price locking on a deliberate item;
  separately review the three legacy manually sold rows without order snapshots.
- Print one invoice on the affected physical laser printer.
- Verify shipment carrier/tracking save plus fulfillment email, paid/manual
  invoice rows, automatic/manual Email History, order restore/permanent delete,
  Reopen Order, and Messages recycle-bin behavior.
- Verify production inquiry/contact/free-evaluation uploads and Resend delivery,
  including Spanish public notes and image attachments.
- Verify duplicate sign-up and reset-password redirects against production
  Supabase Auth settings.

## Etsy And eBay

- 🔴 **OWNER / NETLIFY — no scheduled function on this site has EVER run.** Not
  the two price pushes, not the three social workers. Verified 2026-08-10 from
  both sides: zero `scheduled_price_push` rows across 1,538 Etsy and 56,480 eBay
  log rows, zero `scheduled_drip` rows with Instagram and Facebook both
  `connected`, and Netlify's own function log empty for the last 24h on both
  `ebay-price-push` and `instagram-drip` (the latter should show ~14). Already
  ruled out — the functions ARE deployed (6 on `main@7576826`), all five carry
  the Scheduled badge with a Next execution time, all four `*_CRON_SECRET`
  variables exist scoped to Functions, and 614 credits remain. An erroring
  function would still log; these are never invoked.
  - ✅ **Run now was tried and it fails too** (2026-08-10). `instagram-drip` was
    pressed with the due-row query verified server-side as returning `[]` first,
    making it a guaranteed no-op that nonetheless logs unconditionally — it wrote
    no `scheduled_drip` row and no Netlify log line. (`instagram-token-refresh`
    was tried first and was inconclusive: the token is `not_due` until late
    September, and that branch used to return without logging. It logs now.)
  - **Research conclusion (2026-08-10): this is a known, recurring Netlify
    platform bug, not a limitation and not our code.**
    - **Not a plan gate.** Netlify's docs state scheduled functions are
      "available on all pricing plans".
    - **Not deprecated.** Async Workloads is an additional product, not a
      replacement; scheduled functions are current.
    - **Exact signature, repeatedly reported** on the Netlify forums from April
      2023 through July 2026: Scheduled badge present, next-execution countdown
      correct, function never fires, no errors and no logs. A **platform-wide
      incident on 2026-04-12** matched precisely and Netlify support fixed it
      within ~24–48h without publishing a root cause.
    - **Ours is worse than those reports.** In every forum thread manual "Run
      now" still worked. Here the dashboard's invoke API returns **HTTP 202
      Accepted** (verified in the network panel, with the success toast) and the
      function still never executes — nothing in `instagram_sync_log` 45 seconds
      later, nothing in Netlify's log. Scheduler *and* manual invocation are both
      dead for this site.
  - **Fix path A — Netlify support ticket** (owner, account-level). This is the
    proven route; they fixed the April 2026 incident. Send them: site
    `naplesantiques`, the 202-accepted invoke that produced no execution, and
    that the Next.js Server Handler function on the same site works fine.
  - 🟢 **CUT OVER AND WORKING (2026-08-11).** Deployed, secrets added, workflow
    run manually twice. Four of five jobs succeed and wrote log rows that had
    never existed — including the **first-ever `scheduled_price_push`** on Etsy:
    *"42 pushed, 32 unchanged, 0 blocked, 0 failed, 16 deferred."* Zero
    failures; the 16 deferred are the 22-second budget and roll to the next run.
    Instagram/Facebook drips and the Instagram token refresh all logged `ok`.
  - ✅ **`EBAY_CRON_SECRET` rotated; all five jobs now green (2026-08-11).** The
    first eBay attempt failed `HTTP 401 {"code":"unauthorized","message":"Invalid
    cron secret."}` — the secret existed but its value differed from Netlify's
    (local ended `3bb6`, Netlify production ended `4e67`). It could **not** be
    re-copied: Netlify marks that variable secret in four of five deploy
    contexts, which is write-only (lock icons; Options offers only Edit/Delete).
    Owner rotated it in Netlify, redeployed, updated the GitHub secret, reran:
    **"50 pushed, 67 unchanged, 1 blocked, 0 failed, 6 deferred."** The 1 blocked
    is inventory #82 via `EBAY_WRITE_BLOCKED_PRODUCT_IDS`, working as designed.
    Zero listings carry `error_count > 0`. For contrast, a pre-fix eBay run
    produced **139 errors**.
    - ⚠️ Durable lesson: `.env.local` was stale for exactly one of four cron
      secrets. Netlify remains authoritative — check, never assume.
    - ⚠️ If either cron secret is ever rotated again, it must change in **three**
      places: Netlify (+ redeploy), the GitHub Actions secret, and `.env.local`.
  - ✅ **Deferred listings cleared 2026-08-11 02:47 UTC** by a second dispatch.
    Etsy finished `done:true, pushed:16, remaining:0` — outcome **`ok`**, the
    first completely clean scheduled run in the project's history. eBay finished
    `done:true, pushed:6, blocked:1, remaining:0` (`warning` solely because of
    #82's deliberate write block). **Day totals: Etsy 58 pushed, eBay 56 pushed,
    0 failures on either, 0 listings at the backoff ceiling.**
  - ✅ **The crons FIRED ON THEIR OWN, 2026-08-11 — the automation arc is closed.**
    Etsy at **11:54 UTC** (11 pushed, 79 unchanged, 0 failed) and eBay at
    **12:27 UTC** (1 pushed, 86 unchanged, 1 blocked, 0 failed). 39 and 42 minutes
    after their 11:15/11:45 slots, which is ordinary GitHub Actions best-effort
    scheduling — not a fault. Zero failures on either; eBay's `warning` outcome is
    only #82's deliberate block. Nothing left to prove here.
  - **Superseded detail from when this was still pending:**
  - 🟡 **FIX PATH B WAS BUILT AND WAITING ON FOUR SECRETS (2026-08-10).**
    `.github/workflows/scheduled-jobs.yml` replaces all five Netlify schedules
    with GitHub Actions, using the same cron expressions, the same routes, and
    the same `x-cron-secret` header. **No application code changed.** Verified:
    valid YAML, five jobs, four cron entries, four secrets, five routes matching
    the `.mts` files exactly; Actions is enabled on the repo ("Allow all"), and
    the default branch is `main` — the only branch GitHub runs schedules on.
    - ✅ **Secrets added by the owner 2026-08-11.** `ETSY_CRON_SECRET`,
      `EBAY_CRON_SECRET`, `INSTAGRAM_CRON_SECRET`, and `FACEBOOK_CRON_SECRET`
      are now repository secrets on
      `DarkMatter-WebDev/NaplesAntiquesLLC.com` (the repo previously had none).
      **The `.env.local` copies matched Netlify's production values** — owner-
      confirmed while adding them — so for these four variables the usual
      "`.env.local` is stale" caution did not apply. Until the secrets existed
      every job failed with a named error, which was deliberate.
    - **Then test it without waiting for a cron:** Actions tab → *Scheduled
      jobs* → **Run workflow**, and pick a single job from the dropdown. Start
      with `instagram-token-refresh` (a `not_due` no-op that now logs) or
      `instagram-drip` (no due rows). A successful run writes the matching row
      to `instagram_sync_log`, which is the proof the whole chain works.
    - ⚠️ **Check `.github/` actually survives the copy** into the repo folder.
      It is a hidden directory; a copy method that skips dotfiles would drop it
      silently (`.gitignore` travels today, so it should be fine).
    - ⚠️ **Overlap is intentional and reversible.** The Netlify `.mts` functions
      are left in place. If Netlify ever fixes the fault, both triggers fire and
      each job runs twice daily — tolerable (the second price push finds prices
      unchanged, the second drip finds no due rows, the second token refresh
      returns `too_young`) but untidy. At that point delete **either** this
      workflow **or** `next-app/netlify/functions/*.mts`, not both.
  - ✅ **The routes are reachable from outside Netlify — verified 2026-08-11.**
    `curl.exe -i -X POST https://naplesestatejewelry.com/api/admin/etsy/price-push`
    returned **401 `{"error":"Unauthorized."}`**, the exact body from
    `price-push/route.ts`. (In PowerShell use `curl.exe`; bare `curl` is an alias
    for `Invoke-WebRequest` and rejects `-i -X POST`.)
  - **Fix path B — move the trigger off Netlify entirely.** All five routes are
    **already trigger-agnostic and secret-header-guarded** — see the comment in
    `app/api/admin/etsy/price-push/route.ts`, which explicitly names "an external
    cron hitting a secret-token-guarded internal route" as a supported option.
    **No application code changes are required**, only a new caller:
    - **GitHub Actions scheduled workflow** (recommended): the repo is already on
      GitHub, it is free, the run history is visible, and the four
      `*_CRON_SECRET` values go in repo secrets. Caveats: Actions cron is
      best-effort and can run 5–15 min late, and GitHub disables scheduled
      workflows in a repo with 60 days of no activity.
    - **Supabase `pg_cron` + `pg_net`**: more punctual and already in the stack,
      but the secret has to live in the DB/vault and runs are harder to inspect.
    - Third-party pingers (cron-job.org, Upstash QStash) also work.
  - ◻️ One link is still unverified: whether the cron routes are reachable from
    outside at all. A production `POST` probe expecting a 401 was blocked by the
    development environment's command classifier. Worth one manual
    `curl -X POST https://naplesestatejewelry.com/api/admin/etsy/price-push`
    — a **401 Unauthorized** is the healthy answer.
  - Until this is resolved, **prices only move when someone clicks "Push prices
    now"** in Admin Settings. That is the current de facto process.
- ✅ **DONE 2026-08-11 — the sold-hidden repair ran and landed exactly as
  predicted.** It was never blocked by a deploy: the fix has been in
  `src/lib/ebay/sync.ts` since 2026-08-04 (`resolveFreshnessScanAction`,
  sync.ts:1317, called from the scan at sync.ts:1347), and
  `api/admin/ebay/eligibility-summary/route.ts:39` calls `scanAndMarkOutOfDate()`
  on load — it only ever needed one admin page-load in production.

  | | Before | After |
  | --- | --- | --- |
  | `hidden_oos` + sold | 0 | **36** |
  | `out_of_date` + sold | 38 | **2** |
  | `out_of_date` + available | 84 | 84 |
  | `published` + available | 2 | 2 |

  **Trigger used:** Admin → Products → Actions → **Publish all ready to eBay**,
  then **Cancel**. `EbayBulkPublishModal` fetches the eligibility summary from a
  mount `useEffect`, so simply OPENING it runs the server-side scan; publishing
  only happens on an explicit start, and the modal reported "0 listings in the
  Ready to publish state" with the button disabled. Verified afterwards: **zero**
  `ebay_sync_log` entries in the following 15 minutes and zero listings with
  `error_count > 0` — the repair is a local state correction and touched nothing
  on eBay. Use this same route if rows are ever mis-flagged again; it is safer
  than the bulk-sync modal, which stages writes.

  The 2 remaining `out_of_date` + sold rows are correct: they lack
  `last_pushed_qty === 0`, the marker written by `hideListingQuantityZero()` that
  proves the auto-hide actually ran. Repairing without it would be guessing.
- ⚠️ **A newer commit `main@78af2ed` ("stage") shows CANCELED on Netlify**, so
  `main` is ahead of production. Watch the next deploy actually reach Published
  rather than assuming it did.
- ✅ *(superseded by the entry above — closed 2026-08-11.)* The scan had never
  run since the fix deployed, which is why 38 sold rows sat in `out_of_date` with
  zero `hidden_oos`. Available listings remain **86** (84 `out_of_date` +
  2 `published`), matching the campaign figure below — the repair did not touch
  them.
- ✅ **`ORDER_NOTIFY_EMAIL` is not set on Netlify** (checked 2026-08-10 in the
  dashboard). The owner action recorded above under the contact-address section
  is already satisfied — nothing to delete.

- ✅ **CAMPAIGN COMPLETE 2026-08-11 — 85 of 86 available listings on the correct
  tier.** The only one left is **#82**, write-blocked by design (fix it on eBay).
  Post-fix runs cleared 25, 23 and 12; `published` 85, `out_of_date` 1.
  Verified on the live public listings across two bands: $714.80 → **$35.00**,
  $663.58 → **$35.00**, and $10,098.83 → **$99.00 "Signed"** (the Registered Mail
  treatment the $5,000–15,000 band requires). Nothing further to do here.
  - ⚠️ **Correction to the note below:** the eBay 25604 "Availability not found"
    failures were **transient, not item-specific**. The failing pair rotated each
    run (26/31 → 29/23) and every one succeeded on a later attempt. Roughly 2 per
    25, cleared by retry. None remain.
  - ⛔ **#83 and #84 (the two Rolexes) are NOT going on eBay — owner decision,
    2026-08-11. Do NOT build the `Department` aspect mapping.** They fail
    deterministically with *"The item specific Department is missing"* because
    eBay category 31387 (Wristwatches) requires a Men's/Women's/Unisex aspect
    `mapAspects` does not send — `mapping.ts` flags this at the `Watch` entry as
    `TODO(ebay-verify)`. That TODO now has an answer: **not needed, we are not
    listing watches.** Its aside that "no Watch-type item exists in the catalog
    yet" is stale (two do), but the conclusion stands for a different reason.
    - ✅ **Handled in code 2026-08-11 (deployed 2026-08-17).** `EBAY_EXCLUDED_PRODUCT_IDS`
      (`ebay/guards.ts`) holds the two ids; pre-flight now fails `eligibility`
      with "This item is not listed on eBay per owner decision", and
      `enqueueProducts` drops them alongside write-blocked ids so no bulk run
      wastes a slot on them. **Per item, deliberately — NOT a `Watch` category
      rule**, so a future watch still syncs normally (pinned by a test).
    - ✅ **Their stale `error` rows were reset to `pending` ("Not listed") in
      production.** Dry-run first: both had `ebay_listing_id: null`, so nothing
      live on eBay was affected. `error_count` → 0, `last_error` → null. Zero
      listings remain in `error` state.
    - ⚠️ Until this deploys, `pending` sorts FIRST in `orderEnqueueCandidates`,
      so a bulk eBay sync run before deployment would pick them up and fail them
      back to `error`. The campaign is finished, so just avoid bulk runs until
      this ships.
- 🟡 *(superseded — kept for the sequence)* **CAMPAIGN STARTED 2026-08-11 — 21 of 81 done, tier mechanism PROVEN.**
  The controlled single-item test and a bulk-batch item were both verified on
  the live public eBay listings: $714.80 → **$35.00 shipping** and $663.58 →
  **$35.00 shipping**, both correct for the $600–1,000 band (policy
  `252701347026`). **This closes the "one controlled listing update remains
  open" gate from 2026-08-01, for both the single-item and bulk paths.** The run
  also reported "1 write-blocked item skipped" — #82 held back as designed.
  - ⚠️ **Do NOT re-run the campaign until this deploy lands.** The old
    `enqueueProducts` took the first 25 of whatever was selected with no notion
    of what still needed writing, so "select all → sync → repeat" re-pushed the
    same items (measured: 21 of 23 repeated on the second run). Fixed in this
    batch by `orderEnqueueCandidates` (stale → error → published). After
    deploying, the remaining **60** finish in three runs.
  - ◻️ **Two items need eBay-side attention**, both eBay errorId **25604**
    ("Availability not found"):
    `vintage-tiffany-and-co-18k-tricolor-gold-cuban-curb-link-bracelet-26` and
    `vintage-14k-yellow-gold-patriotic-eagle-pendant-31`. Their rows are
    identical in shape to the successes (available, qty 1, valid offer id), so
    the condition is on eBay's inventory items, not our payload. Flagged `error`
    with 2 of 3 retries used; listings untouched and still live. Check their
    inventory-item availability in Seller Hub.
  - **Remaining:** 61 `out_of_date` + available (60 writable), 2 `error`,
    23 `published`.
- **🔴 OWNER ACTION — apply the new shipping policies to the flagged eBay
  listings, in batches, from the deployed admin.** (The count once read 123;
  the true figure is **86 writable** — see the sold-hidden fix below.) The
  2026-08-01/02 tier
  policies (`252701344026`–`252701350026`) are part of the eBay content hash, so
  every listing created before them is correctly flagged `out_of_date`; the
  daily price push can never clear it because it only sends price/quantity
  (`bulkUpdatePriceQuantity`, [sync.ts:1443](next-app/src/lib/ebay/sync.ts:1443)).
  Only a full offer update carries `fulfillmentPolicyId`. The real campaign is
  **86 items ≈ 4 runs** of the capped bulk sync (87 available listings are
  flagged; #82 is write-blocked). Sequence: sync **one** item from its product
  drawer first, confirm on eBay that the shipping shown is the new tier, then
  run Sync all to eBay once per batch, spot-checking between runs. Guards now
  enforce the cautions automatically — see `features/ebay-sync.md`.
- ✅ **Sold-hidden freshness bug fixed** (was listed below as open). The scan
  hashed `hidden_oos` rows, so the new tier policy flipped all 36 sold-and-
  hidden listings to `out_of_date` — that is why the count read 123 instead of
  the expected ~90. `resolveFreshnessScanAction` now skips any non-available
  product and repairs the mis-flagged rows back to `hidden_oos`. **Repair runs
  automatically on the next freshness scan** (any `/api/admin/ebay/eligibility-
  summary` load, i.e. opening the eBay bulk-sync modal) once this is deployed;
  no manual SQL. Verified by dry run 2026-08-04: all 36 qualify
  (`last_pushed_qty === 0`), leaving 87 `out_of_date`, all available.
- Two available products have no `ebay_listings` row at all (90 available
  products, 88 linked). Confirm that is intentional (never listed) rather than a
  dropped link.
- ✅ **Daily price pushes diagnosed, fixed, and SHIPPED 2026-08-08.** Four
  defects: the schedules had never actually run (zero `scheduled_price_push`
  rows ever), `price_push_enabled` was `false` (owner enabled it), sold products
  were permanent eBay candidates producing guaranteed HTTP 400s (pool 124 → 88),
  `error_count` never incremented so nothing could back off, and `err.detail`
  was discarded so every failure logged an unusable message. Etsy carried the
  same defects but is clean in practice via auto-delist. Full write-up in
  CHANGELOG 2026-08-08.
- ◻️ **After the first real scheduled run, confirm both sync logs** — expect a
  `scheduled_price_push` row per provider (the first ever) and, for eBay,
  roughly 88 eligible with 0 failures. ⚠️ **Blocked by the Netlify scheduling
  fault at the top of this section** — as of 2026-08-10 there has still never
  been a scheduled run to confirm. The Admin last-run card now says so in red
  instead of showing a green "Ready for…".
- ◻️ **`antique-georgian-…-82` needs manual repair on eBay.** Held back by
  `isEbayWriteBlocked` — relisted manually and no longer attached to the
  app-managed offer. It is the one genuinely stale price: **$861.29 stored vs
  $984.82 target**. Cannot be fixed from the app; reattach it on eBay.
- **Verify the Admin Settings last-run card** after that first scheduled run.
- **Verify one tier-shipped listing per marketplace.** On eBay, let a boundary
  change flag the listing `out_of_date`, review-first publish one update, and
  confirm the fulfillment-policy charge. On Etsy, Sync Updates on one listing
  and confirm the expected tier profile plus `shipping_tier` log action.
  Provisioned policy/profile IDs are recorded in
  `features/shipping-tiers.md`.
- ✅ Fixed 2026-08-04: the eBay sold-hidden freshness scan no longer hashes a
  `hidden_oos` sold item into `out_of_date`, and repairs rows it previously
  mis-flagged. Covered by three `resolveFreshnessScanAction` tests. Confirm the
  repair landed after deploy: sold pieces should read Hidden, not Out of date.
- Keep eBay inventory #82 / listing `800354878200` write-blocked until an
  owner-approved reattachment or end-and-republish migration is tested against
  stored offer `204558136011`. This is now enforced in code by
  `EBAY_WRITE_BLOCKED_PRODUCT_IDS`
  ([sync.ts:62](next-app/src/lib/ebay/sync.ts:62)) — removing that entry is the
  only way to unblock it, and it must not be removed before that migration is
  tested.
- Complete the remaining controlled checks: publish eBay #83/#84 only if
  desired, never blanket re-sync, never sync sold #6, and observe Etsy's fixed
  cumulative image counter on the next genuine image upload. The first two are
  now mechanical: `EBAY_BULK_ENQUEUE_LIMIT = 25`
  ([guards.ts:12](next-app/src/lib/ebay/guards.ts:12)) bounds every bulk run,
  and `enqueueProducts` drops non-available products before queueing.
- Only after fresh confirmation, perform the scoped eBay account-deletion event
  scrub. Re-run the dry count, update only the audited event type, and prove no
  `payload.notification.data` identifiers remain. This is destructive database
  work and must follow the backup/dry-run rules.
- Resolve the remaining provider-spec verification notes documented in
  `features/etsy-sync.md` and `features/ebay-sync.md`; fail closed when a live
  provider contract is unknown.

## Instagram And Facebook

- After deployment, re-prepare one product per channel so new card/caption/
  framing behavior is proven on fresh renditions. Review only; publish solely
  when the owner intends a public post.
- Before Meta's reported **2026-10-31** Facebook data-access limit, derive and
  validate a replacement Page token through Settings. Rotation must preserve
  the old credential until the replacement passes app, Page, read-access, and
  lifetime checks.
- Delete the 2026-08-01 Instagram test post for item 21 manually if it is still
  live (`instagram.com/p/Dbf7lhNoN-T/`), then use **Already removed on
  Instagram** or Refresh status to reconcile local state. Instagram's API
  cannot delete it.
- Reset item 21's test lineup if desired; verification left 8 of 9 images and a
  promoted cover. Nothing depends on that arrangement.
- Wire the existing idempotent `markPostSold()` helper into the
  Available → Sold transition only after a controlled live test.
- Add social out-of-date detection. Instagram changes must flag the owner to
  delete/forget/re-prepare rather than claiming API deletion is possible.
- Consider bulk social queueing only if the per-product, review-first flow proves
  too slow in practice.
- Treat AI on-model imagery as an optional research project: run the fidelity
  bake-off and decide disclosure policy before writing implementation code.

## UX Backlog From The mels-treasures.com Review (2026-08-04)

> Owner-requested competitive review; recommendations only, no code yet.
> Priorities the owner explicitly named: on-product shipping/returns
> dropdowns and "sustainably sourced" trust messaging.

- ✅ **Product page accordions + trust strip** — DONE 2026-08-04
  (`ProductTrustSections.tsx`: Shipping & Returns / Condition & Wear /
  Payment Options accordions plus the Sustainably Sourced / Fully Insured /
  Local Pickup badge trio; see CHANGELOG). Production smoke: open one product
  page per locale and expand all three accordions.
- ✅ **Name the trade-in program** — DONE 2026-08-04. `/trade-in` (Gold &
  Silver Trade-In Program), localized, in the sitemap, linked from the Sell
  menu, footer, and every product page's trade-in line ("How it works").
  Production smoke: load both locales and click through from a product page.
- ✅ **Customer reviews/testimonials** — DONE 2026-08-04. (Correction: the
  homepage already showed three real Google reviews; the review's "we display
  none" was wrong.) The reviews now live once in `src/lib/testimonials.ts`
  and render on the homepage and as a compact band on every product page via
  the shared `TestimonialsSection`. To add a review, append a verbatim entry
  to that file — never invent or paraphrase a quote. **Google review text
  cannot be fetched from here** (the browser pane blocks google.com, Maps
  renders reviews client-side so WebFetch sees nothing, and search returns only
  paraphrases) — ask the owner to paste the text and reviewer name, and whether
  Google badges them a Local Guide. The grid is pinned to 1/2/4 columns and so
  assumes an EVEN count; a fifth review will need that ladder revisited.
  Currently four (Cristian Reatiga added 2026-08-05). Per-product reviews
  remain a possible later step. **Column ladder changed 2026-08-09: the grid is
  now 2 / 4, never 1** (owner: minimum 2-up) — the even-count assumption above
  is unchanged. See DECISIONS, *"The reviews band is never one column"*.
- **Spanish review translations want a native-speaker check**, including the
  newest (`Cristian Reatiga`). The English is the customer's own wording; the
  Spanish is ours.
  - ⚠️ **Now also covers the 8 page titles + meta descriptions localized
    2026-08-16** (`/es/about`, `/es/services`, `/es/estate-jewelry`,
    `/es/gold-services`, `/es/silver-services`, `/es/bullion`, `/es/faq`,
    `/es/estate-services`). These are OUR translations and they are the text
    Google shows in Spanish results, so they matter more than body copy. Terms
    used, for consistency if they are revised: `Joyería de Patrimonio` (estate
    jewelry), `Vender` / `Compramos`, `Suroeste de Florida`,
    `Plata Esterlina`, `Lingotes`, `Liquidación de Patrimonios`.
- ✅ **Related items ("You might also like")** — DONE 2026-08-04.
  Same-category available pieces, same-type-first ranking, lean query, lazy
  images, spot-computed prices. Production smoke: open a product page in both
  locales and click a related card.
- **Admin reorder needs one live verification:** the drag-reorder write was
  changed from upsert to UPDATE-only after a live "null value in column
  title" failure (2026-08-04, see CHANGELOG). Reload Admin Products and
  perform one drag; expect "Inventory order saved" — possibly with a note
  that N listed items no longer exist, which means reload to refresh the
  list. While there, confirm the new edge auto-scroll with a real mouse drag
  (hold a row above the top of the table; it should run up to the beginning).
- ✅ **Homepage story + education + FAQs + announcement bar** — DONE
  2026-08-04. Meet the Owner (chris.webp + story), Why Buy Estate Gold?,
  four FAQ accordions linking to /faq, and a static announcement bar at the
  top of the homepage content (not the fixed header — its 4rem height is
  load-bearing). Production smoke: load both locales, open an accordion, and
  confirm the bar shows two items on a phone, three from 780px, and stays on
  ONE line at every width in BOTH locales (Spanish is the tight one).
- **Cart add-on/upsell (optional):** Mel sells a $29 tarot add-on and shows a
  cross-sell strip in the cart. A local-flavor equivalent (gift wrap,
  handwritten appraisal card) plus a "Discover something new" strip is a
  possible later experiment.
- **Keep (already at parity or better):** single-page checkout shape, guest
  checkout, insured shipping tiers with clear method descriptions (clearer
  than Mel's tariff prose), live spot pricing + scrap value (unique to us),
  INQUIRE/CALL direct-contact actions, "Taxes/shipping calculated at
  checkout"-style transparency (ours shows real numbers earlier than theirs).

## Business, Content, And Operations

- Complete Google Business Profile video verification; duplicate draft profiles
  are already removed.
- Have owner/counsel review Privacy, Terms, Returns/Refunds, Shipping,
  Accessibility, and cookie disclosures.
- Confirm Resend sending-domain SPF/DKIM and intended From identities.
- ✅ **Resend `.co` → `.com` migration — COMPLETE and SHIPPED 2026-08-08.**
  Domain swapped and Verified in Resend, DNS at GoDaddy confirmed against the
  authoritative nameserver, every sender moved, deployed. Detail in CHANGELOG
  2026-08-05/08.

  ⛔ **Email is now FULLY `.com` — senders AND mailboxes.** An earlier version of
  this section said contact/display addresses "stay on `.co`"; that was reversed
  on 2026-08-08 and is **wrong now**. Zero `@naplesestatejewelry.co` addresses
  remain in shipped code, verified in a clean production build. **Never restore
  a `.co` address.** (Separately and permanently: never touch the `.co` MX
  records — that domain still carries live mailboxes.)

  Remaining, both optional and owner's call:

  - **Click/open tracking not re-enabled.** Resend now implements it as a
    `links.` tracking subdomain that redirects every link in every email —
    receipts included — plus another DNS record. That is a behavior change
    beyond a domain swap, not an oversight.
  - **Resend webhook is still registered on `.co`** and still Enabled (webhooks
    are account-level, so it survived the domain deletion). It keeps working
    because `netlify.toml` serves `.co/api/*` as a **200 rewrite, not a
    redirect** — do not let that become a 301. Re-registering on `.com` is
    optional cleanup.
- Complete `CLIENTS.md` unknowns: Netlify site ID, service/dashboard owners,
  password-manager references, maintenance scope, billing status, and production
  Supabase Auth redirects.
- Resolve duplicate live inventory #21 if it still exists.
- Decide whether root `banner.png` should replace the current eBay banner after
  removing every off-eBay website/contact reference. Do not publish either
  banner until policy-safe.
- Native-speaker review of Spanish marketing/product/legal copy remains useful.

## Deferred And Optional

- Phase 2 high-value shipping: evaluate Parcel Pro, JM Shipping Solution, or
  FedEx Declared Value Advantage after owner quotes/account setup. Until then,
  retain the documented USPS Registered Mail rules for $5,000+ shipments.
- Finish Cloudflare Stream deployment only when video is a priority: configure
  the four documented Netlify variables, reconcile the webhook, run the device
  matrix, and validate one controlled Etsy/eBay MP4 before enabling marketplace
  video writes.
- Migrate remaining legacy local-only product photos to Supabase Storage and
  optionally optimize the remaining near-guideline assets.
- Add a localized catch-all only if Spanish 404 body localization is worth the
  extra route; existing 404 metadata/noindex behavior is correct.
- Add `OPENAI_API_KEY` only if server-generated read-aloud is desired; device
  speech remains the fallback.
- Revisit ESLint 10 only when the stable Next lint stack supports it. Keep the
  production audit clean and do not force an incompatible dev-only upgrade.
- Profile Admin Products virtualization only if production timing shows the
  current table is slow. Consider moving dependencies outside OneDrive only if
  synchronization overhead remains material.
- Evaluate Next.js 16.3 when stable, add analytics only with consent/policy
  updates, expand catalog categories as inventory warrants, and revisit a keyed
  metal provider only if production traffic justifies it.

## Recently Completed

Headlines only — full detail lives in `CHANGELOG.md` under each date.

- **2026-08-16/17 (deployed 2026-08-17):** homepage hero rewritten (eyebrow
  *"One Piece or an Entire Estate"* over an h1 naming Naples, location in the H2s);
  `pageMetadata()` gave every public page its own social card and fixed blank
  cards on `/sell` and all city pages; 8 Spanish pages stopped serving English
  metadata; an SEO audit's four findings all fixed; nav dropdowns now close on
  outside tap/Escape; the octopus mark replaced in the header and the tab.
  Closed with a pre-deploy audit — 998/998 tests, 454/454 pages, 30 pages swept
  live with zero problems.
- **2026-08-15 (deployed 2026-08-17):** whole-dollar item prices (rounding moved
  onto the value, so a card and its charge are one number), the sitewide
  button-font cascade fix, touch tap feedback gated by pointer instead of width,
  and the route progress bar at the header's base.
- **2026-08-09 (deployed 2026-08-17):** shop-card touch overhaul, hero touch snap
  + slower handover, hero performance batch, and one solid background per
  slideshow replacing the per-photo sweep. This was the head of the queue that
  had been waiting since 2026-08-09; it shipped with everything added since.
- **2026-08-08 (shipped):** email fully `.com`, `?returnTo=` disclosure fix,
  Deep Field production import + live hooks, daily price-push defects fixed,
  admin email removed from the client bundle.
- **2026-08-06:** pre-deploy sign-off; hero runway compressed and crossings
  overlapped so the handover never stops.
- **2026-08-04:** hero random-fill lineups, product-page accordions + trust
  strip, `/trade-in` page, related-products strip, homepage story/education/FAQ
  blocks, single-page checkout.
- **2026-08-03:** hero became a scroll-pinned multi-slideshow parallax stack;
  Social Queues gained Latest Posts, row selection, background Post now, and
  the seven Eastern slots; 41 superseded planning docs removed.
- **2026-08-01/02:** `.com` became the live primary domain (DNS, redirects,
  cert, sitemap, Search Console, Change of Address all production-verified);
  seven insured-shipping policies/profiles provisioned on both marketplaces;
  Facebook Page token validated.

## 2026-09-10 22:43 ET — staging copy verification (superseded by failed deploy below)

`C:\Users\rcman\NEJ-repo-staging` now contains the complete tested seller-acquisition
batch, the three-file gold/estate follow-up, dependency manifests and memory docs.
Resolved source/target paths were checked. Runbook `robocopy /MIR /L` with its
exclusions plus `/XJ` and `/XF .git` listed exactly 24 updates, 0 Extras, 0 failures.
The actual copy used `/E` (no deletion): 24 copied, 0 failed, exit 1 = success.
Follow-up `/MIR /L` returned 0 to copy / 0 Extras / 0 mismatches, exit 0.
SHA256 comparison of every one of the 1072 staged files matched source; excluded
file scan found no `.env*`, Git metadata, dependencies, build output or worktrees.
Robocopy's 1075 total includes three excluded generated/env files, as documented.
Final memory handoff: the four updated docs were re-synced using the same exclusions;
a final dry run returned zero differences and the four updated hashes matched.
No app edits or tests rerun during that copy. The owner's subsequent deployment failed; see below.

## 2026-09-10 — staging incident: owner transferred repair to another agent

**This agent stopped investigation/repair on the owner's instruction. Only closing
memory docs were updated; do not resume repair or re-sync staging from this task.**
The earlier ready-to-deploy assurance is withdrawn. No identified secret has been
removed or rotated, and no corrected Netlify deploy has been verified.

- **Next agent:** obtain the exact Netlify secret-scanning finding (variable/type
  and flagged path/line, never the value) from the failed deploy linked in
  `SEO_LEAD_AUDIT.md`. Determine whether a credential was exposed or a public/test
  value was flagged; current checks establish neither conclusion.
- Establish the actual source of the failure and the exposure scope, including
  whether the flagged material exists in the owner's published repository/history
  or built output. The deploy was blocked, which does not establish repository
  safety. Handle any confirmed credential exposure through the relevant provider
  and owner workflow; no credential or history repair has been performed here.
- Correct only the files that require correction. **Keep the same staging path,
  folder hierarchy and unaffected files; no wholesale rebuild or restructuring.**
  The owner explicitly reinforced this constraint after reporting the failure.
  Preserve hidden deployment/config files and existing secret/build exclusions.
- Verify the bounded changed-file list and scan actual file contents, including
  Netlify-relevant configured values and any flagged generated output. Matching
  source hashes and excluding `.env*` alone did not establish deploy readiness.
  Do not bypass or disable the scanner to clear the error.
- After repair, the owner handles the separate repo/deployment. Verify the new
  Netlify build/secret scan and successful publication before marking deployed.
  The last observed published version was the earlier New Arrivals release.
- These closing source docs are newer than staging. Have the next agent include
  only the relevant updated docs in its verified handoff; this task did not copy
  them or touch staging again after the stop.

Other outstanding work remains in the opening task block: Google live/indexed
gold/estate inspection and IndexNow after successful deployment; scoped two-/four-
week ranking and qualified-call measurements; real early-call/forwarding checks;
four GBP services Pending review; unconfirmed Yelp Diamond Buyers category removal;
paid-lead quality/attribution; missing satellite source and appointment-copy issue;
deferred 320px homepage overlap. Reviews, review recovery and legitimate local
business mentions remain explicitly deferred by the owner. Existing unrelated
owner-timed infrastructure/store tasks below are not superseded or marked done.
