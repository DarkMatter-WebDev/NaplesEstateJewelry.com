# Follow-ups — thank-you emails to sellers and shop buyers

> Status: **BUILT + STAGED 2026-11-24 (9), not pushed.** ⛔ SQL
> `supabase/follow-ups-2026-11.sql` must be run (owner) before the page works and
> before anything is sent. No new environment variables. Owner-approved design:
> mockup 1 (2026-11-24), email style **A — a note from Chris**, all seven default
> answers. Record `CHANGELOG.md` 2026-11-24 (9); rules `DECISIONS.md` →
> *Follow-ups*.

## What it does

Admin → **Follow-ups** (top bar, after Buyers). Every seller who gave an email on
a buy receipt, and every shop buyer who paid an order with an email, gets one
thank-you email. The Google review is one soft line near the end, never the
point of the email.

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

Every person gets the same email. The review is asked "if you have a minute" —
never "if you enjoyed it" — and there is no "happy → Google / unhappy → tell us"
split (review gating). No reward for reviewing (FTC 16 CFR 465). The review link
is in step 1 only. A test in `follow-ups.test.ts` fails the build gate if a
default email ever says "if you enjoyed / loved / were happy". The owner's
**Skip** is for dealers, regulars or someone who asked not to be emailed — not
for leaving out unhappy customers.

## How it runs

- pg_cron `nej-follow-ups-sweep` every 15 minutes → `POST /api/admin/follow-ups/sweep`
  (header `x-cron-secret` = `TEXT_ALERTS_CRON_SECRET`, already in Vault + Netlify):
  queue new thank-yous → move waiting buyers along → call off voided / cancelled
  ones → queue step 2 (if on) → send what is due (≤ 10 per run, 18 s budget).
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
