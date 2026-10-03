# Feature: Google Ads Conversion Tracking

> What the Google tag on this site does, for whom, and how to check it.
> Built 2026-10-02 (owner decision, reversing the 2026-09-20 "no site tag"
> rule — `DECISIONS.md` → *"Google Ads conversion tracking…"*). Last updated:
> **2026-10-02** (night: account state note under *Outside the site*).

## In one paragraph

Visitors who arrive from a Google ad (the URL carries a click ID — `gclid`,
or `gbraid` / `wbraid` from an iPhone) load Google's tag; everyone else gets
the site exactly as before — no Google script, no new cookie. For those
visitors the site reports three things to Google Ads: a seller form that the
server accepted, a tap on a call link to the shop's number, and a click on a
Directions link. **Every call dials (239) 404-8505 — no Google forwarding
number is used anywhere on the site, and the number people see is never
replaced** (owner, evening of 2026-10-02; the first version that afternoon
swapped a tap's dial target and was taken out the same day). Ad
personalization is off. The click ID is saved with the lead so Admin →
Inquiries shows a **Google Ad** chip and a later offline-conversion import is
possible.

## Account values

| What | Value |
|---|---|
| Google tag ID | `AW-18463845461` |
| Lead form submit (Primary) | `AW-18463845461/KySvCNOCo44dENXYn-RE` |
| Click-to-call tap (the site's call signal — make it Primary in Google Ads) | `AW-18463845461/4vRpCNmCo44dENXYn-RE` |
| Get directions click (Secondary) | `AW-18463845461/kH-kCM6d5v4cENXYn-RE` |
| Website call, 60+ s, via forwarding number — **exists in Google Ads, NOT used by the site** | `AW-18463845461/FIP-CNaCo44dENXYn-RE` |
| Google Ads account | 321-137-8976 (login info@naplesestatejewelry.com) |

All four actions were created in Google Ads by another agent on 2026-10-02;
the site fires the first three exactly as given
(`next-app/src/lib/ads-tracking.ts`). The forwarding-number action would need
Google's phone snippet, which the owner ruled out; in Google Ads it was set
**Secondary** and the tap action **Primary** the same evening (read back in
the all-actions table). **Call reporting is OFF** in the account since then
too (owner: the ad's call button must dial the real number) — Google's
"Calls from ads" action stays enabled but records nothing.

## When the tag loads (`shouldLoadAdsTag`)

The tag starts when **all** of these hold:

1. Measurement is not switched off in this browser (`localStorage`
   `nej_ads_measurement_v1 = off`) and the browser does not send Global
   Privacy Control.
2. The page is not under `/admin`, `/account`, `/checkout` or `/order-lookup`
   (no ad lands there, and those URLs carry order and record IDs).
3. One of: the URL has a valid click ID · the browser remembers a click from
   the last 90 days (`localStorage` `nej_ad_click_v1`, cookie `nej_gclid`) ·
   Google's own `_gcl_aw` / `_gcl_gb` cookie exists · the URL has `gtm_debug`
   (Google Tag Assistant).

A visit without any of those loads nothing. Once the tag is in memory it
stays for the page session (client-side navigation never reloads it).

## What a visitor from an ad gets

- `https://www.googletagmanager.com/gtag/js?id=AW-18463845461`, then Google's
  page-view hit (`www.google.com/ccm/collect`, `npa=1`) and the click cookies
  `_gcl_aw`, `_gcl_au` (plus Google's own partitioned cookies on Google
  domains). Nothing else: no phone snippet, so no `gstatic.com` script and no
  forwarding-number lookup — the acceptance check asserts their absence.
- For the record, what the phone snippet did in the first (same-day) version,
  in case it is ever wanted again: `gtag('config', '<call label>', {
  phone_conversion_number, phone_conversion_callback })` loads
  `www.gstatic.com/wcm/loader.js` → `call-tracking_N.js` → a lookup at
  `googleadservices.com/pagead/conversion/<id>/wcm` /
  `google.com/pagead/attribution/wcm`; a real click gets
  `{ phoneNumber, formattedPhoneNumber, refreshDuration, refreshPeriod }`, a
  fake one `errorCode 2 "no ad click"`; the callback form hands the number
  over without rewriting the page; Google skipped the lookup in ~1 visit in
  20 (its own `tag_exp` arms); `https://www.gstatic.com` must then be in
  `script-src` of BOTH header files, plus `http://www.gstatic.com` in dev.

## What fires, and from where

| Conversion | Where | Rule |
|---|---|---|
| Lead form | `EvalForm.tsx` (`/free-evaluation`), `MessageUsForm.tsx` (`/contact`) | Only after `res.ok` from the API, once per submission. ⛔ Never on the button, never from the `?submitted=1` page state. Not the shop's product inquiry (`InquiryForm.tsx`, a buyer) and not Join the List. |
| Click-to-call tap | one capture-phase listener on `document` (`ads-tracking-browser.ts`) | `a[href^="tel:"]` that dials the shop's number (`dialsBusinessNumber`); one event per tap; the link is never blocked, delayed or changed — it dials exactly what the page says. |
| Directions | same listener | `isDirectionsHref`: Google Maps links (`mapsUrl()`); the Business Profile `?cid=` link, the embedded map and the review link do not count. |
| Website call (forwarding number) | — | Not used. Exists in Google Ads only. |

One `gtag('event', 'conversion')` makes **three** requests that carry the
label: `www.googleadservices.com/pagead/conversion/<id>/` (the count),
`googleads.g.doubleclick.net/pagead/viewthroughconversion/<id>/` and
`www.google.com/pagead/1p-conversion/<id>/`. Count the first.

## The click ID on the lead

- Added at SEND time (`appendAdClickFields(fd)` / `adClickFormValues()`), not
  as hidden inputs — the forms sit on pages that rank and their HTML did not
  change.
- Validated server-side (`sanitizeAdClickId`: `[A-Za-z0-9_-]{1,255}`) in
  `/api/inquire` (both paths) and `/api/contact-message`.
- Stored in `inquiries.gclid` / `gbraid` / `wbraid`
  (`supabase/inquiries-ad-click-2026-10.sql`). Until that SQL has run, the
  insert falls back and keeps the fact in the message text ("Source: Google ad
  — gclid …"); nothing is lost. Contact messages have no table row of their
  own: the line goes into the message-center body.
- Owner email: `Source: Google ad — gclid …` at the bottom, and ` · Google ad`
  on the subject. The customer's confirmation never carries it.
- Admin → Inquiries: a **Google Ad** chip beside the preference chips.

## The visitor's switch

- Cookie notice (`CookieNotice.tsx`): **Okay** leaves measurement on,
  **Essential only** turns it off and keeps it off; both dismiss the notice.
- `/cookie-preferences` → "Google Ads Measurement" block: Turn off / Turn on
  (`CookiePreferencesClient.tsx`). Off removes the remembered click and
  Google's `_gcl_*` / `_gac_*` cookies at once; the script already in memory
  goes with the next page load.
- Global Privacy Control is honoured as off; the Preferences page says so and
  disables both buttons.
- Privacy and Cookie Preferences (EN + ES) describe all of this; the old "no
  Google tag was found" statement is gone.

## Security policy

Both header files carry exactly Google's documented hosts for "Google Ads
conversions" (`googletagmanager.com`, `googleadservices.com`,
`googleads.g.doubleclick.net`, `pagead2.googlesyndication.com`,
`www.google.com`, `ad.doubleclick.net`). `next.config.ts` (`GOOGLE_ADS_CSP`)
and root `netlify.toml` must stay in sync; `lib/__tests__/ads-tracking.test.ts`
compares them and asserts `www.gstatic.com` is NOT there — that host is only
needed by the phone snippet the owner ruled out, so its return is the signal
that decision changed.

## Outside the site

- **Auto-tagging must be ON** in Google Ads (Admin → Account settings). It
  was switched off on 2026-09-20 because the site had no tag; Google:
  *"Auto-tagging is a required feature"* for conversion tracking. Without it no
  URL carries a click ID and nothing records.
- **Account state after 2026-10-02 night** (`CHANGELOG.md` 2026-10-02 (7)–(8)):
  budget **$25.00/day** (was $19), 99 campaign-level negatives (9 electronics
  terms added as insurance — the search terms showed no device or bullion-buyer
  traffic to speak of), Maximize Clicks re-learning. The campaign's two
  conversions before this build were Google's own "Calls from ads" (forwarding
  number) — that counter stops with call reporting off; the site's tap action
  and the Mobile clicks-to-call click type are the call signals now.
  ⚠️ Google's "Confirm it's you" prompt on sensitive saves can be skipped only
  until **Oct 4, 2026**; afterwards those saves need the owner's passkey.
- A `gclid` in the URL does **not** bypass Netlify's page cache: the Next.js
  runtime sets `Netlify-Vary: query=__nextDataReq|_rsc`, so only those two
  parameters vary the cache key (`@netlify/plugin-nextjs` 5.15.11,
  `dist/run/headers.js`). The 2026-09-20 note that gclid "busted the CDN
  cache" was wrong for this setup.
- The owner's desk Chrome runs an ad blocker; Google Tag Assistant there will
  show the tag blocked. Use another browser or the phone for a live check.

## Verification

### Local (2026-10-02)

Headless Chrome over the DevTools protocol, one clean browser context per
scenario (scratchpad scripts `cdp-harness.mjs` + `verify.mjs`; the method is
in `DECISIONS.md` and the memory notes). Final, taps-only build, against the
production build (`next start`, http://localhost:3003): **55 / 55** — organic
visit loads nothing · ad visit loads the tag once, no `gstatic.com` script
and no forwarding lookup, visible number and every call link unchanged,
nothing blocked, no console error · one tap = one click-to-call conversion,
one Directions click = one directions conversion, a Text link fires nothing ·
free-evaluation and contact forms: one lead conversion after a 200, none
after a 500, none on an invalid phone, none for an organic visitor; click ID
in the POST; product inquiry fires no lead conversion · Essential only / the
Preferences switch / Global Privacy Control stop everything · the tag never
starts on `/checkout` or `/order-lookup` · Spanish, `gtm_debug`, `wbraid` and
client-side navigation behave. Lead POSTs were answered by the test script,
so no lead, email or database row was created. Notice buttons and the
Preferences switch: 16 / 16 (EN + ES, GPC). Built HTML vs the live site for
`/`, `/gold-services`, `/silver-services`, `/estate-jewelry`,
`/free-evaluation`, `/sell/naples`, `/bullion`, `/es/gold-services`,
`/contact`: title, description, canonical, hreflang, H1, JSON-LD and body
text identical (the only body differences are the live spot prices); no
Google tag in any page's HTML. (The first, same-day version with the
forwarding-number swap had passed 62 / 62 on dev and live before it was
taken out.)

### Live (after a deploy; auto-tagging is ON since 2026-10-02)

1. Open a seller page with `?gclid=test` in a browser without an ad blocker:
   the tag loads once, no `gstatic.com` script is requested, the number shown
   stays (239) 404-8505 and every call link dials it.
2. Google Tag Assistant: connect to `https://naplesestatejewelry.com` (it
   adds `gtm_debug`, which opens the gate).
3. Google Ads → Goals → Conversions: the website actions read *No recent
   conversions* once Google has seen the tag (read 2026-10-02) and *Recording
   conversions* after the first credited one. Only a real ad click can be
   credited — test pings carry a fake click ID.
4. The headless run below can be pointed at production with
   `BASE=https://naplesestatejewelry.com` (it answers the lead POSTs itself,
   so no lead is created).

## Code map

- `next-app/src/lib/ads-tracking.ts` — IDs, labels, click-ID validation,
  storage shape, `shouldLoadAdsTag`, link classifiers (pure; the API routes
  import only this).
- `next-app/src/lib/ads-tracking-browser.ts` — storage, the tag boot (no
  phone snippet), the click listener, `sendAdsConversion`,
  `setAdsMeasurement`.
- `next-app/src/components/ads/GoogleAdsTag.tsx` — mounted once in
  `[locale]/layout.tsx`; renders nothing.
- Forms: `components/free-evaluation/EvalForm.tsx`,
  `components/contact/MessageUsForm.tsx`, `components/contact/InquiryForm.tsx`.
- Routes: `app/api/inquire/route.ts`, `app/api/contact-message/route.ts`.
- Admin: `app/[locale]/admin/inquiries/page.tsx`,
  `components/admin/InquiriesPanel.tsx`.
- Consent: `components/legal/CookieNotice.tsx`,
  `components/legal/CookiePreferencesClient.tsx`,
  `app/[locale]/cookie-preferences/page.tsx`, `app/[locale]/privacy/page.tsx`,
  `lib/spanish-legal-copy.ts`.
- Policy: `next.config.ts` (`GOOGLE_ADS_CSP`), root `netlify.toml`.
- SQL: `supabase/inquiries-ad-click-2026-10.sql`.
- Guard: `lib/__tests__/ads-tracking.test.ts`.
