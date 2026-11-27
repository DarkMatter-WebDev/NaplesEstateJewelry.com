# Follow-ups — thank-you emails to sellers and shop buyers

> **2026-11-26 (2) — sign-off:** the line that is just "Chris" now renders as
> Chris's signature block ("— Chris Surette" + logo card, `lib/email-signature.ts`);
> "and the Naples Estate Jewelry Team" is gone from the defaults and is dropped
> from owner-saved templates too. `CHANGELOG.md` 2026-11-26 (2).

> **2026-11-25 (1) — BUILT + STAGED, not pushed; ⛔ SQL `supabase/follow-ups-ai-openings-2026-11.sql`:**
> step 1 is now **Rob's blend** (a friend's review of mockups A/B/C, owner's yes):
> a personal **opening line written by the AI** per person, the review as a direct
> ask with a **button**, the **"Here whenever you need us"** box BELOW it, two small
> cards (guides · pass the number along), and "Chris / and the Naples Estate
> Jewelry Team". Plus the **"Note for the thank-you email"** box (internal only)
> on receipts and orders. See *The opening line* below. `CHANGELOG.md` 2026-11-25 (1).
> **2026-11-25 (2):** owner asked for the *"If any questions come up about your visit or
> your receipt (buyers: your order), just reply to this email, or call or text me at {phone}."* line back —
> it now sits right after the opening, BEFORE the review ask, so the email is not all
> about the review; the help box no longer repeats it.
>
> Status before that: **PUSHED + DEPLOYED 2026-11-24 (10)** (owner ran `supabase/follow-ups-2026-11.sql`).
> 🔴 The production check found the sweep cannot read `buy_receipts` (no
> service-role grant, on purpose) → ⛔ owner runs
> `supabase/follow-ups-receipts-grant-2026-11.sql` (nine columns, read only, no ID
> data); until then nothing is queued. Sturdier sweep staged for the next push.
> No new environment variables. Owner-approved design:
> mockup 1 (2026-11-24), email style **A — a note from Chris**, all seven default
> answers. Record `CHANGELOG.md` 2026-11-24 (9); rules `DECISIONS.md` →
> *Follow-ups*.

## What it does

Admin → **Follow-ups** (top bar, after Buyers). Every seller who gave an email on
a buy receipt, and every shop buyer who paid an order with an email, gets one
thank-you email. Since 2026-11-25 it opens with a line written for that person
(from the receipt / order), then asks for a Google review with a button — the
same request for everyone.

| Group | Step 1 (on) | Step 2 (built, OFF until switched on) |
|---|---|---|
| **Sellers** (buy receipts, Trade-ins too) | "Thank you for coming in" — the next morning at 10 AM | "Whenever you're ready again" — ~6 months after the thank-you, only if they have not sold to us since. No review link. |
| **Shop buyers** (paid orders: website, In-store, Remote, Trade-in) | "Thank you for your purchase" — pickup / in-store: next morning 10 AM; shipped: 10 AM the morning after the carrier says Delivered (7 days after shipping if it never does) | "Care tips for your piece" — 30 days after the thank-you. No review link. |

- **From:** "Chris at Naples Estate Jewelry" `<info@naplesestatejewelry.com>`,
  replies to info@ (the same sender as Email Campaigns' "Chris" profile).
- **Language:** the receipt's Seller's copy language / the order's language →
  English or Spanish wording. Spanish was written by Claude — ◻ translator review.
- **Footer:** business name, address, "You're receiving this because you sold to
  us / bought from us", Unsubscribe (the site's `/unsubscribe` page).

## Never sends

- to anyone unsubscribed from ANY of our emails, or stopped by the owner;
- for a voided buy receipt, or an order cancelled / refunded / deleted;
- a second thank-you to the same address within 90 days (a Trade-in = one email);
- on a Sunday (moves to Monday 10 AM); hour-based delays that land outside
  9 AM – 6 PM move to the next 10 AM;
- anything while **Pause all** is on (the queue keeps filling; nothing goes out);
- a step that is switched off (its queued rows wait, marked "Off").

A buy / sale older than 14 days is never scheduled automatically — so on day one
only the last 14 days get thank-yous; older people are in People and get one only
by "Send a thank-you now".

## The page

- **Top:** Auto-send on / Pause all, with the next send time.
- **Series cards:** step switches, the step-1 delay (Next morning 10 AM / 24 h /
  2 days / 3 days), **Edit emails** (subject + text per step and language, fill-in
  words, Preview, Save, "Use our wording"), Preview · English / Español.
- **Upcoming:** every queued email — Send now · Change time (Later today · Next
  10 AM · pick a date, Naples time) · Preview · Skip. Buyers still waiting for
  pickup / delivery show "Waits for …".
- **Sent log:** sent (with "clicked review link" + time), skipped (Put back), not
  sent (why), called off (why), failed (Try again). View copy = the email exactly
  as it went out.
- **People:** one row per email — Seller / Buyer / Both, last visit, sold to us,
  bought from us, language, follow-up status; search, filters, Copy selected
  emails; **Open** → visits (links to the receipt / order), every follow-up, Send
  a thank-you now, Stop all follow-ups (or turn them back on). No ID data here.
- A buyer's thank-you also shows in that order's Email History ("Follow-up —
  Thank you").

## Google's rules (why the wording is what it is)

Every person gets the same review request (since 2026-11-25 a direct one: "As a
small local business, your review means the world to us… Would you take a moment
to share your experience?" + the button; before, "if you have a minute"). Only the
OPENING line differs per person, and it never mentions the review. Never "if you
enjoyed it", and there is no "happy → Google / unhappy → tell us" split (review
gating). No reward for reviewing (FTC 16 CFR 465). The review link
is in step 1 only. A test in `follow-ups.test.ts` fails the build gate if a
default email ever says "if you enjoyed / loved / were happy". The owner's
**Skip** is for dealers, regulars or someone who asked not to be emailed — not
for leaving out unhappy customers.

## The opening line (AI) and the "Note for the thank-you email" (2026-11-25)

- **What the AI writes:** only the first 1–2 sentences after "Hi Margaret,". It
  is given the first name, the language, the item NAMES (prices, weights, sizes
  and "3 ×" cut out first — `cleanItemForAi`) and the owner's note. Never the
  receipt's printed Notes, an amount, an address, ID data, a phone or an email.
  A cut size takes its "de" / "of" with it and a doubled small word is folded
  (2026-11-25 (13): cutting only "5mm" had left "Hueco de de Oro").
  Model: `AI_FOLLOW_UP_MODEL` → `AI_TRANSLATE_MODEL` → `AI_MODEL` (Anthropic,
  the same key as the listing assistant; no new env var).
- **Checks before it is stored** (`checkAiOpening`, `lib/follow-up-opening.ts`):
  20–320 characters, ≤ 3 sentences, `{when}` at most once and no other `{…}`, no
  digits except karat marks (14K), no money / pricing / payment words, no
  review / Google / stars, no offers / promises / "free", no day names (the day
  is the `{when}` placeholder, so Change time never makes it wrong), no greeting,
  sign-off, link or emoji. A refused answer is tried again; after 3 tries the
  row gets the standard line.
- **When:** the 15-minute sweep writes openings for queued step-1 emails,
  soonest first, at most 4 / 8 s per run, BEFORE sending. "Send now" on a row
  without one writes it first. Upcoming shows it (gold dashed box) with **Edit**
  (your own words; `{when}` / `{first_name}` / `{item}` allowed) · **Rewrite**
  (ask the AI again) · **Use standard wording**.
- **Standard line** (AI off / not set up / failed / before the SQL): sellers
  "It was a pleasure meeting you {when}. Thank you for coming in and trusting
  us with your piece / your pieces." (one receipt line → "piece"; owner: not
  every seller brings jewelry); buyers "Thank you for buying your {item} from
  us. I hope it's everything you hoped for." Spanish: "su pieza / sus piezas".
- **Switch:** "AI-written opening lines" on the Follow-ups page (setting
  `ai_openings`, on).
- **Note for the thank-you email** — a box beside the paper, never on it: the
  receipt's "Receipt saved" panel, the receipt's own page (not void), and the
  order page (`ThankYouNoteCard`). ⛔ Internal only: never on either paper copy,
  the Print Station, the seller's emailed copy, an invoice, a print-out or a gift
  slip — its column is read only by `lib/thank-you-note-server.ts` and the
  opening writer, never by `BUY_RECEIPT_COLUMNS`; a test fails if any print /
  email file names it; the card is `print:hidden`. Saving it (or editing the
  receipt / order) clears that person's AI opening so it is written again; an
  opening you typed yourself is never replaced.

## View items (2026-11-25)

Every Upcoming line has a **View items** button under its receipt / order number.
It opens a read-only pop-up (`FollowUpItemsModal`, standard `AdminModal`: ✕ · Esc ·
click outside · Close) with the original lines — buy receipt: Qty · Description ·
Amount + total paid; order: Item · Price (Qty only when ≠ 1) + order total — the
date and state, the queued send time, the internal "Note for the thank-you email"
when set, and **What the AI reads** (the cleaned item names the opening is written
from), plus "Open the receipt / order ↗" in a new tab. Data: `GET
/api/admin/follow-ups/[id]/items` → `lib/follow-up-items-server.ts` (service client;
buy receipts only through the service_role column grant — never ID / address /
payment data; `follow-ups.test.ts` scans it).

## People → Thank-you box (2026-11-25 (15))

People → Open shows, instead of a send-straight-away button, a **Thank-you box** for
the visit a thank-you would go to (the newest recorded buy receipt or paid order with
no SENT thank-you — `personThankYouTarget`, the same rule for box, preview and send):
the item lines (+ internal note + "What the AI reads"), the opening line (Edit /
Rewrite / Use standard wording once prepared), **Preview the email** and **Send it**
(confirm first). Preview prepares the visit's step-1 row — a NEW row is held as
`not_sent` with no send time (the sweep only sends `scheduled`), so it shows in the
Sent log as "Not sent — Ready to send…" until sent from People or the log; the
preview is exactly what Send it sends.

## How it runs

- pg_cron `nej-follow-ups-sweep` every 15 minutes → `POST /api/admin/follow-ups/sweep`
  (header `x-cron-secret` = `TEXT_ALERTS_CRON_SECRET`, already in Vault + Netlify):
  queue new thank-yous → move waiting buyers along → call off voided / cancelled
  ones → queue step 2 (if on) → write AI openings (≤ 4, 8 s) → send what is due
  (≤ 10 per run, 18 s budget from the start).
- Opening the page runs the same "queue" part, so a receipt saved a minute ago is
  already in Upcoming.
- Sending claims the row first (`scheduled → sending`), so two runs never send
  the same email.
- The review link is `/review?f=<token>`; the click is recorded and the visitor
  goes to Google as always.

## Files

- `supabase/follow-ups-2026-11.sql` — 3 tables, RLS, grants, the cron job, verify row.
- `lib/follow-ups.ts` (pure: timing, wording, rendering, readiness) +
  `lib/__tests__/follow-ups.test.ts` (33 tests).
- `lib/follow-ups-server.ts` (database + sending).
- 2026-11-25: `supabase/follow-ups-ai-openings-2026-11.sql`; `lib/follow-up-opening.ts`
  (pure: prompt, item cleaner, checks) + `lib/follow-up-opening-server.ts` (AI call,
  store, sweep step, resets) + `lib/__tests__/follow-up-opening.test.ts`;
  `lib/thank-you-note.ts` + `lib/thank-you-note-server.ts`; `components/admin/ThankYouNoteCard.tsx`,
  `components/admin/follow-ups/OpeningLine.tsx`; routes `api/admin/thank-you-note`,
  `api/admin/follow-ups/openings` (receipt edited → reset) and the `[id]` route's
  `set_opening` / `rewrite_opening` / `standard_opening` actions.
- `app/[locale]/admin/follow-ups/page.tsx`, `components/admin/follow-ups/*`.
- `app/api/admin/follow-ups/{sweep,settings,[id],preview,people}/route.ts`.
- Touched: `AdminHeader.tsx` (link), `app/review/route.ts` (click), `lib/marketing.ts`
  (`suppressMarketingEmail` → follow-ups), `EmailCopyViewer.tsx` (From line prop),
  `OrderDetailPanel.tsx` (Email History label).

## Turning it off / reversing

- Pause: **Pause all** on the page (nothing sends; queue keeps filling).
- Stop one group: switch its step 1 off.
- Remove the job: `select cron.unschedule('nej-follow-ups-sweep');` — the page
  still works, nothing is sent automatically.
- Full rollback SQL is at the bottom of the SQL file.
- AI openings only: switch "AI-written opening lines" off (everyone gets the
  standard line). The 2026-11-25 SQL has its own rollback block.
