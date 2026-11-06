# Delivery Tracking Emails (Shipped → Out for delivery → Delivered)

> Status: **SQL RUN + DEPLOYED 2026-11-05 (owner-reported).** Still needs an
> EasyPost account + two Netlify variables + redeploy, and one Connect click —
> `TASKS.md` top block. Until then only the redesigned Shipped email is live. Owner-approved design: mockup 4 (2026-11-05).

## What the customer gets

| Email | When | Who sends it |
|---|---|---|
| **Your order … has shipped** | The owner clicks Mark Shipped (or Edit Shipping Details) and Send, as before | The owner's click |
| **Your order … is out for delivery** | The carrier scans the package onto the truck | Automatic, once per order |
| **Your order … was delivered** | The carrier scans it delivered | Automatic, once per order |

All three come from `noreply@naplesestatejewelry.com` (replies → `info@`), in the
order-email look, with our own wording (`lib/order-fulfillment-email.ts`). The
carrier and EasyPost never email the customer.

- **Shipped:** progress line (1 of 3), Carrier + Tracking number, **Track Your
  Package** button (USPS / UPS / FedEx / DHL tracking page), and "We'll email you
  again when it's out for delivery and when it's delivered" — that last line only
  when EasyPost is connected and the order has a number.
- **Out for delivery:** "on the delivery truck and should arrive today", Latest
  scan (town, then time, each on its own line), **"Someone will need to be there
  to sign for it."** on EVERY order (the site promises signature on all shipping —
  checkout "Fully insured shipping with delivery signature"; `shipping-service.ts`
  lists signature for Priority, Registered and Express).
- **Delivered:** date · time and "Where" from the scan ("Left with Individual",
  "as reported by USPS"), the owner's **"Not in your hands yet?"** box (early scan →
  usually turns up next day → call/text if not by end of tomorrow), and the Google
  review link (`GOOGLE_REVIEW_URL`).
- **Layout rules (owner, mockups 3–4):** "Tracking number" + the number on one
  line when they fit, the number on its own line below when the screen is too
  narrow — never wrapped (justified inline-blocks + a full-width zero-height
  spacer; no media query). Labels never wrap; each value sits on its label's
  baseline (`valign=baseline`, 20px line height on both).
- Other fulfillment statuses (packed, picked up, cancelled) keep the original
  "Order Update" email and subject.

## How it works

```
Mark Shipped ──► POST /api/admin/orders/[id]/tracking ──► EasyPost tracker (POST /v2/trackers)
EasyPost webhook ─► POST /api/webhooks/easypost ─┐
pg_cron hourly ───► POST /api/admin/orders/tracking-sweep ─┴► applyTrackerUpdate ──► email
```

- **Service:** EasyPost Tracker API (owner's pick, 2026-11-05: cheapest long-term;
  works with the USPS labels printed through PayPal). $0.01–$0.03 per shipment
  (easypost.com/pricing). Re-registering the same number within three months
  returns the original tracker (no duplicate).
- **Table:** `public.order_tracking` (one row per order; `supabase/order-tracking-2026-11.sql`).
  Server-only writes; admins read it on the order page. Scan times are stored as
  the RAW EasyPost string (TEXT) so the scan's local offset survives.
- **Times:** shown in the scan's own local time — EasyPost stamps a scan with the
  local offset when it knows the place, else UTC; a UTC stamp is shown in Eastern.
  No Intl (`formatScanTime` in `lib/shipment-tracking.ts`).
- **Webhook:** `X-Hmac-Signature` = `hmac-sha256-hex=` + hex HMAC-SHA256 of the
  body with `EASYPOST_WEBHOOK_SECRET` (NFKD) — the easypost-node algorithm,
  including its integer-"weight" fix-up. Fails closed. ⛔ The body only names the
  tracker; the tracker is **re-read from EasyPost with our key** before anything
  is stored or sent.
- **Exactly once:** each email is CLAIMED (`… set delivered_email_at = now() where
  … is null`) before sending; a failed send releases the claim; Resend also gets
  an idempotency key. The order must still be Shipped, shipping, not in the
  recycle bin, with the SAME tracking number, and have a customer email.
- **Freshness:** no out-for-delivery email for a scan older than 24 h; no
  delivered email for a delivery older than 7 days (a package registered late).
- **Sweep** (`nej-order-tracking-sweep`, :20 every hour, `TEXT_ALERTS_CRON_SECRET`):
  registers shipped orders from the last 30 days that have no working tracker, and
  re-reads every package still on its way (or delivered with the email unsent,
  for 7 days). The safety net for Netlify freezing a function mid-flight.
- **Order page:** Fulfillment box → "Delivery" line: status, last scan, which
  emails went, **Check tracking now**. Email history shows the automatic ones as
  "Update — Out For Delivery / Delivered", "Automatic (delivery tracking)".
- **Settings:** Admin → Settings → **Delivery Tracking** — key set? (test/production
  by the `EZTK` / `EZAK` prefix), secret set?, webhook connected?, and
  **Connect** (creates or repairs the EasyPost webhook for
  `<site>/api/webhooks/easypost` with the secret; https only — use the live site).

## Setup (owner) — see `TASKS.md` for the live checklist

1. Run `supabase/order-tracking-2026-11.sql` (last row: every value true).
2. Push + deploy.
3. Sign up at easypost.com; copy the **production** API key (`EZAK…`).
4. Netlify → Environment variables: `EASYPOST_API_KEY` = that key;
   `EASYPOST_WEBHOOK_SECRET` = any long random string (30+ characters). Redeploy.
5. Admin → Settings → Delivery Tracking → **Connect** → "Webhook: Connected".

## Files

`src/lib/shipment-tracking.ts` (pure) · `src/lib/easypost.ts` · `src/lib/order-tracking-server.ts` ·
`src/lib/order-fulfillment-email.ts` · routes `api/admin/orders/[id]/tracking`,
`api/admin/orders/tracking-sweep`, `api/webhooks/easypost`, `api/admin/easypost` ·
`components/admin/OrderDeliveryTracking.tsx`, `AdminDeliveryTrackingPanel.tsx`,
`OrderDetailPanel.tsx`, `AdminSettingsPanel.tsx` · `[locale]/admin/orders/[id]/page.tsx` ·
`api/admin/orders/[id]/email-update/route.ts` · SQL `supabase/order-tracking-2026-11.sql` ·
tests `lib/__tests__/shipment-tracking.test.ts`, `delivery-tracking-email.test.ts`.

## To turn it off

Delete `EASYPOST_API_KEY` in Netlify and redeploy → nothing registers, no
automatic emails, the shipped email drops the "we'll email you again" line (the
Track button stays). Optional: `select cron.unschedule('nej-order-tracking-sweep');`.
