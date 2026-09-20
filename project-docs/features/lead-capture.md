# Feature: Lead Capture

> Current lead and subscriber capture surfaces. Last updated: **2026-09-20**.

## Photos on the lead forms fit one request; phone contact bar (2026-09-20)

- **Photos.** `EvalForm` (`/free-evaluation`, up to 10) and `MessageUsForm`
  (`/contact`, up to 6) post all photos in ONE multipart request. Netlify caps
  that request at 6 MB (~4.5 MB of photos), so `lib/lead-photo-prep.ts` shrinks
  the set in the browser to 3.8 MB (2048 → 1024 px by count, JPEG intermediate)
  and `lib/lead-photo-encode.ts` stores WebP on the server. Undecodable photos
  are sent as they are; a set that still cannot fit posts nothing and tells the
  seller to send fewer or text them to (239) 404-8505. Before this, camera
  originals were posted and no photo submission above 1.5 MB had ever succeeded.
  The picker stays `accept="image/*" multiple` with no `capture`.
- **Phone contact bar.** Call · Text · Directions fixed to the bottom of the
  seller pages on phones (`components/cta/MobileContactBar.tsx`, pages from
  `lib/contact-bar-paths.ts`, links from `lib/contact-links.ts`). Text opens a
  message to the owner's cell that starts "Hi, I have something I'd like to
  sell. Sending photos:" — never the toll-free deals number.
- No analytics or ad tracking was added for either; the owner judges by
  business (`DECISIONS.md` → *"Google Ads runs with NO site tag"*).

## Homepage "Join the List" window — email, text alerts, or both (2026-09-15)

The hero's Name / Email / Join row is gone. The block is the caption ("Get
first look at new pieces") over ONE gold **Join the List** button
(`components/home/HomeSubscriberForm.tsx`, file name kept for the hero's
imports and guard test). The button opens `HomeSubscribeModal.tsx`, loaded on
the tap (`next/dynamic`, `ssr: false`, portalled into `<body>`), so it never
joins the homepage's first paint.

**Second entry point — the business card (2026-09-15, live):** `/card`
has a full-width tinted "Join the List · email or text deals" tile under its
grid (`components/card/CardJoinListButton.tsx`) that opens the same window,
so a card scanned at the counter feeds the same list with the same consent
record. Rules in `DECISIONS.md` → *"The /card page"*.

- **Choice at the top:** Email / Text / Both — **Text preselected** (owner).
  Fields change to match: Name (optional) · Email (email/both) · Cell number
  (text/both) with the "Text-only deals" box: the pitch, the consent checkbox
  (store wording: "Text me the moment a good deal drops. Pieces move fast;
  first reply takes it."), and the carrier-required statement.
- ⛔ **The consent box is never pre-ticked.** The statement shown is
  `SMS_CONSENT_TEXT` in `lib/subscriber-phone.ts`; the server stores ITS copy
  of that wording on the row (`sms_consent_text` + `sms_consent_version`) as
  the record of consent — never text the browser sends. A rewording bumps
  `SMS_CONSENT_VERSION`; old rows keep the wording they agreed to.
- **Text-only sign-ups are allowed** (no email). `homepage_subscribers.email`
  is nullable since `supabase/text-subscribers-2026-09.sql`; a row must have
  an email or a `phone_e164` (check constraint), phones are unique.
- **API:** `POST /api/subscribe` with `{ channel, fullName, email?, phone?,
  smsConsent?, locale }` → `subscribe_homepage_v2` (service-role only).
  Numbers are US only, stored as `+1` + ten digits (`normalizeUsPhone`,
  rejects anything not dialable — no "cleanup" into a wrong number).
  Matching: by email first, then by phone; a phone already on ANOTHER row
  stays there and the sign-up is saved without it.
- **Nothing sends a text yet.** A phone row is saved as `sms_status =
  'pending'`. The window tells the visitor "Before any deal goes out, you'll
  get one text asking you to reply YES" — true now (nothing is sent) and after
  the texting batch (which sends it at once). `confirmed` / `stopped` are set
  by that later batch (Twilio toll-free, the owner's account).
- **Admin → Subscribers** (`lib/marketing.ts` `buildSubscriberDirectory`):
  Phone + Alerts columns (channel pill + Confirmed / Pending YES / Stopped),
  three tiles (reachable by email · confirmed for texts · pending), "Copy
  Confirmed Numbers" (only YES-confirmed numbers), a text-list-only filter;
  text-only rows can be deleted by number (`DELETE /api/admin/subscribers`
  with `{ phone }`). Email sends still use `buildMarketingAudience`, which
  skips rows without a valid email.
- **Legal:** Terms → "Text Message Program" section (`id="text-messages"`,
  EN + ES) and one Privacy bullet (STOP + "we do not share mobile numbers…"),
  both linked from the consent statement. Carriers check for these.
- Guards: `lib/__tests__/home-subscribe-modal.test.ts`,
  `subscriber-phone.test.ts`, `subscriber-sort.test.ts`,
  `app/api/subscribe/route.test.ts`, `hero-short-screens.test.ts`.
- Rules: `DECISIONS.md` → *"The hero sign-up is one button; the window offers
  Email, Text or Both"*. Mockup (owner-approved, v2):
  https://claude.ai/artifact/Wnst13mirihcKMmoSgfT7B

## Text alerts — Step 2: Twilio, confirmation, Text Deals, replies (2026-09-15 night, STAGED)

- **Number:** Twilio toll-free +1 (888) 423-7522 (bought 09-15; toll-free
  registration submitted 09-15; sends refused until verified). Twilio account
  = the owner's; Netlify holds the credentials (`lib/text-alerts/config.ts`).
- **Flow:** web sign-up → `sendConfirmation` (attempt recorded first) →
  handset replies YES → `/api/webhooks/twilio/inbound` marks `confirmed` and
  answers with the opt-in text → Admin → Text Deals sends a picture message
  (`lib/text-alerts/card.ts`) to confirmed numbers only, one queued
  `text_deal_sends` row per number before any request → replies land in
  `text_inbound`, forward to `TWILIO_FORWARD_TO` with `[1st]`, and get the
  sold line once the deal is marked sold. STOP → `stopped` (Twilio replies).
  Sweep every 15 min: `/api/admin/text-alerts/sweep` (pg_cron, Vault secret).
- **Tables** (`supabase/text-deals-2026-09.sql`, service-role only):
  `text_deals`, `text_deal_sends`, `text_inbound`, `text_system_messages`;
  subscriber columns `sms_confirmation_sent_at/_attempted_at/_attempts`,
  `sms_last_deal_id`. Storage: `product-images/text-deals/<deal>/photo-*.webp`
  + `card-*.jpg` (GC-referenced).
- **Words** are in `lib/text-alerts/messages.ts` and match the registration.
- Guards: `lib/__tests__/text-alerts.test.ts`; rules `DECISIONS.md` →
  *"Text deals: the reply is the claim…"*.

The September 10 audit and authorized seller-acquisition implementation are in
`../SEO_LEAD_AUDIT.md`. Local seller copy/call presentation is built and verified,
deployment blocked by Netlify's secrets alert; another agent owns repair. See audit handoff.
Yelp seller ads/Specialties, phone-hours CTA and phone-call goal are saved with
call reporting off. GBP category/description accepted and new Update published;
four revised services remain Pending. OpenAI's verified seller ad leads to
`/sell/naples`. The audit distinguishes accepted, pending and unconfirmed edits.
Do not treat GBP/Yelp actions or retained spam inquiry rows as qualified calls.
Current form `source` identifies the form, not the marketing channel; no
historical call-to-channel attribution is established by the app.

The completed pre-deployment follow-up adds a home gold-card link and an inherited-
jewelry guide link to their seller pages, retaining direct evaluation actions.
Estate copy now welcomes ordinary pieces and walk-ins, explains the offer, and
uses shared showroom wayfinding. The text-sized offer card passes mobile checks.
Reviews/recovery and legitimate local business mentions remain owner-deferred tasks.

## `/free-evaluation` is the sendable lead surface (2026-08-09/10 rework)

The page is built to be **texted to someone who does not know what they own**,
so its structure is deliberate and should not be casually rearranged:

- **2026-09-11 rebuild (supersedes the original order):** the page is
  call/visit-first. The hero's buttons are Call and Visit the Showroom
  (`#ways`), with a phone-hours line and a small "Prefer to write?" link.
  The second block is `#ways` ("Come to Us, or We Come to You": showroom +
  home-visit cards). The form (`#request`) sits just above the closing CTA
  as "Prefer to Write? Send a Quick Note". Title: "Free Estate Jewelry
  Appraisal — Home or Showroom". Rule: `DECISIONS.md` (2026-09-11).
- The **form is never in the hero** — the owner's read was that arriving
  straight into a form "feels like it's shoved down their throat".
- **Photos are optional.** `EvalForm` accepts a submission with either photos
  **or** a one-line description — it only blocks when both are empty. Do not
  make photos required; the whole pitch is "you don't need to sort anything
  first".
- Reachable from the header **Sell** menu (added 2026-08-09) and the footer.

Submissions post to `/api/inquire` with `source: 'free-evaluation'`, same as the
other inquiry forms below.

## Location + preferred contact (2026-09-08)

Both seller forms (`EvalForm`, `MessageUsForm`) ask **"Where are you
located?"** (select: Naples · Marco Island · Bonita Springs · Estero · Fort
Myers · Cape Coral · Elsewhere in Southwest Florida · Outside Southwest
Florida; the last two reveal a "City & state" line and the out-of-area note)
and **"How should we contact you?"** (Call · Text · Email pills). The
product-inquiry form asks only the contact preference. Both are required in
the browser; choosing Email with an empty email box is an inline error.
Vocabulary + parsers + display strings: `src/lib/inquiry-fields.ts`; the
fields: `components/contact/InquiryPreferenceFields.tsx`; storage:
`inquiries.location_area` / `location_detail` / `preferred_contact`
(`supabase/inquiries-location-contact-2026-09.sql`). Admin → Inquiries shows
them as chips (red `Outside SWFL · <city>`); the message center gets
`Location:` / `Preferred contact:` lines under the phone; the owner email
gets the two rows and a subject suffix (`· prefers Text · Naples`). Rules in
`DECISIONS.md` → *"Lead forms ask where the sender is…"*.

## Summary

Lead capture now happens inside the Next.js app, not the retired root static
HTML site. The major paths are:

- seller/buyer inquiry forms on contact and evaluation surfaces,
- newsletter/homepage subscriber signup,
- checkout/order follow-up,
- click-to-call and appointment CTAs.

## Inquiry Forms

Current form components:

- `next-app/src/components/contact/InquiryForm.tsx` — product inquiry, rendered
  by `/contact` when `?item=` is present
- `next-app/src/components/contact/MessageUsForm.tsx` — general message,
  rendered by `/contact` otherwise
- `next-app/src/components/free-evaluation/EvalForm.tsx`

⚠️ `ContactForm.tsx` was **deleted 2026-08-22** — it was dead code, imported by
nothing. Do not re-add it from an old copy of this list.

Current inquiry APIs:

- `next-app/src/app/api/inquire/route.ts` — `InquiryForm` (JSON) and `EvalForm`
  (multipart)
- `next-app/src/app/api/contact-message/route.ts` — `MessageUsForm`
- `next-app/src/app/api/inquiries/[id]/route.ts`

Submitted inquiry records live in Supabase `inquiries`. Admin review lives under
`/admin/inquiries`. Inquiry email delivery uses the Next route handler and
configured email provider keys when present.

The older Jotform and root static Netlify Form instructions are historical.
`next-app/public/netlify-forms.html` (a hidden form-definition stub that only
made Netlify register four empty "ghost" forms on every deploy) was DELETED
2026-09-07; Netlify Forms are not part of the inquiry path at all — every
submission is a row in `inquiries` plus a Resend email. Do not re-add the stub.

## Bot protection (2026-08-22)

All three inquiry forms render a `bot-field` honeypot and `/api/inquire` checks
it on both the JSON and multipart paths. ⚠️ **`InquiryForm.tsx` shipped without
one** and was the only form that got spammed — a bot used it as an email relay,
10 submissions in 18 hours. Keep the honeypot on every form that posts here.

`lib/spam-heuristics.ts` adds a content check that works even when a bot POSTs
JSON directly and never sees the form. Its case-transition threshold is
**measured** (human max 5 / spam min 7 → 6) and pinned by tests from both
directions; a false positive is a lost customer.

Drops are silent to the caller but logged as `[inquiry-spam]`. Do not make them
silent in the log too — that is how the original gap went unnoticed.

⛔ `sendEmails` still sends a confirmation to whatever address is submitted.
That is the underlying abuse surface and is an open owner decision — see
`TASKS.md`.

## Phone validation (2026-08-22)

Every surface that collects a phone — checkout plus `InquiryForm`,
`MessageUsForm` and `EvalForm` — validates through **`lib/phone.ts`**
(`normalizePhoneNumber` / `isValidPhoneNumber` / `phoneErrorMessage`), and the
routes store the **normalized** value. `/api/inquire` (both paths) and
`/api/contact-message` enforce it server-side.

⚠️ **`type="tel"` validates nothing.** Before this, a real paid order came in
with `customer_name` "Sara" and `customer_phone` "Catlett" — the buyer typed her
first name, tabbed, and typed her surname into the next box.

⛔ **One rule, one message, one file.** `MessageUsForm` and
`/api/contact-message` each carried their own looser "10–15 digits" copy that
accepted `0000000000`. That per-surface duplication is the same shape as the
photo-swipe bug. Do not reintroduce a local phone check.

⛔ **The rule must stay the most lenient thing that works** — structural
NANP/E.164 facts only, with extensions and explicit `+` international accepted.
**A false positive is a lost lead.**

⚠️ **In `/api/inquire` the phone rejection is a VISIBLE 400**, deliberately NOT
folded into the silent spam drop directly above it. A bot should vanish; a real
person who mistyped must be told.

## Bounced confirmations (2026-08-22)

A bounced inquiry confirmation is no longer discarded. `/api/webhooks/resend`
handles transactional bounces via `lib/email-bounce.ts`, matches the address to
the most recent order and inquiry, and raises an `email_bounce` admin
notification naming who to call and their phone number. See
`DECISIONS.md` → *Email Deliverability* for the suppression rules.

## Newsletter / Marketing Audience

Newsletter signup writes to `homepage_subscribers` through `/api/subscribe`.
Admin subscriber management lives at `/admin/subscribers`.

Marketing email uses:

- `next-app/src/lib/marketing.ts` as the shared audience builder.
- `/admin/marketing` for campaign composition and history.
- `/api/admin/marketing/*` for admin-gated sends, tests, settings, audience
  counts, and campaign-history actions.
- `/api/unsubscribe` and `/unsubscribe` for opt-out handling.
- `supabase/email-marketing.sql` and `supabase/homepage-subscribers.sql` for
  live database support.

Current consent model:

- Newsletter subscribers are explicit opt-in.
- Account holders are eligible for marketing by default unless
  `profiles.marketing_opt_out = true`.
- Marketing sends require the configured physical mailing address and include an
  unsubscribe link.

## Checkout / Order Leads

The storefront checkout uses `/api/paypal/create-order` followed by
`/api/paypal/capture-order`. It creates an unpaid internal order before PayPal
approval but does not reserve inventory; the first successful capture marks the
order paid and products sold. Paid capture sends buyer/owner email when Resend
is configured.

The older `/api/checkout/order` unpaid/manual follow-up route is retained for
non-storefront workflows. That path may move products to `pending_payment` and
add an admin notification; it is not the public PayPal checkout path.

## Click-To-Call And CTAs

The primary phone/text CTA remains `(239) 404-8505` via `tel:` links throughout
the app. The showroom is at 6240 Shirley St, Suite 104, Naples, FL 34109;
walk-ins are welcome during its configured hours, with home visits by
appointment. Phone availability is 9 AM–6 PM daily, separate from showroom
hours. These hours describe availability; they do not operate the telephone
or establish that an incoming call rang or was answered.

The September 10 source batch uses `phoneHoursLabel()` beside gold, silver,
estate-jewelry, Sell and city hero calls, the Naples city showroom call group,
`SiteFooter`, the `MessageUsForm` introduction and the `VisitUsPanel` call action.
Existing card/home/spot-prices labels
and ContactPoint schema remain. Showroom hours continue to come from the live
schedule. The estate-jewelry hero gains a direct `tel:` action; gold/silver
already had one. Seller copy welcomes single everyday pieces and collections;
the gold page's appointment-only closing contradiction is removed.

The diamond route remains for complete-jewelry evaluations. Broad loose/lab-grown
solicitation was removed from marketing at the owner's request; that does not
reverse the historical lab-grown purchasing policy. No new tracking or form
attribution was added. Local source is not yet a verified production deployment.

## Privacy / Compliance Notes

- Forms include privacy disclosures and link to the Privacy Policy.
- Account signup records Terms/Privacy acceptance in Supabase Auth metadata,
  with profile persistence supported by `supabase/compliance-consent.sql`.
- Cookie notice/preferences cover essential cookies and local storage; no
  behavioral tracking pixels were found in the 2026-06-19 source audit.

## Verification

After form/API/marketing changes:

```bash
cd next-app
npm run lint
npm run build
```

Then verify at least one public form render and the relevant admin surface.
