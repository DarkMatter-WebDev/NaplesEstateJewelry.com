# Integrity Rules And Pre-Publish Checklist

> Current rules for the Next.js app. Last reconciled: **2026-10-07**.

## Verification Commands

Run from `next-app/`:

```bash
npm test -- --maxWorkers=4
npx tsc --noEmit
npm run lint
npm run build
npm audit --omit=dev
```

`npm run build` is the publish gate and must exit 0. Current local baseline
(measured 2026-10-07 ~11:25 AM ET, text deals with up to five photos; 1731 /
160 files after the buy-receipt thumbprint work of 10-06; 1710 / 159 files on
2026-10-03 ~8:40 PM, the buy receipt's "Mailing list" box and the
same-form customer view; 1704 after the first customer input mode build ~5 PM,
1651 / 156 files after the buy-receipt delete + payment methods that afternoon,
1647 after the storefront-photo swap, 1643 after the print-station shortcut fix
that morning):
**1743/1743 tests across 161 files**, TypeScript clean, lint clean (4 `<img>`
warnings in `TextDealsManager.tsx`), and a build that exits 0 with **88
prerendered routes = 41 EN + 41 ES + 6 non-locale** (`/_global-error`,
`/_not-found`, `/favicon.ico`, `/icon.png`, `/robots.txt`, `/sitemap.xml`).
(2026-09-02 baseline, for the record: 1197 tests / 116 files, 74 routes = 34 +
34 + 6.) Every locale page adds one to each side; a lopsided count means a
page is missing from one locale.

⛔ **Do not record the build's `(N/N) static pages` line as the baseline.** It
is a progress counter that scales with the product catalog, not a page count —
the older "443-page build" figure here was that counter. Assert
**`en === es`** on the prerender manifest instead; see `STRUCTURE.md` for the
one-line command and the full reasoning.

## Rules

### Keep one runtime

App code and public assets live in `next-app/`. Root static HTML/scripts/assets
and root Netlify Functions must not return.

### Keep product schema synchronized

Supabase `products` is the catalog source. Every product-column change updates
the relevant `supabase/*.sql`, `src/types/product.ts`, selected query columns,
admin/public UI, tests, and docs.

### Preserve IDs and lifecycle

Product IDs are permanent route/saved-state keys. Prefer Draft/Archived/Sold
over renaming or deletion. Permanent deletion is explicit and cleans owned
Storage/Stream resources.

### Keep media ownership clear

Product rows contain URL/path metadata only. New images go to Supabase Storage
with WebP/downscale/cache defaults. Video bytes go only to Cloudflare Stream.
Cleanup is reference-aware, dry-run-first, and provider-first where required.

### Keep checkout authoritative

Never trust browser amounts, shipping fees, method labels, country/state/ZIP,
or product availability. Recompute them with `checkout-pricing.ts`,
`checkout-shipping.ts`, and `us-address.ts`. PayPal breakdown and stored order
totals must reconcile exactly to cents.

Current tax behavior is 6% on merchandise plus charged shipping for Florida
taxable orders, and $0 Florida tax for non-Florida destinations. Do not add
county or other-state tax rules without reviewed jurisdiction requirements.

### Keep the Google tag behind its gate

The Google Ads tag (`src/lib/ads-tracking.ts`, 2026-10-02) loads ONLY for a
visit that came from an ad click. Any change that makes Google's script load
for an organic visitor, adds Google's phone snippet (a forwarding number —
every call must dial the real number), replaces or rewrites the visible phone
number, fires a conversion before the server accepted a lead, or counts the
shop's product-inquiry form breaks an owner decision (`DECISIONS.md` →
*"Google Ads conversion tracking…"*). The security policy must list exactly
Google's documented Ads hosts in BOTH `next.config.ts` and root
`netlify.toml`; `lib/__tests__/ads-tracking.test.ts` guards all of it.

### Keep customer input mode locked on the server

The buy receipt's customer input mode (2026-10-03) hands a signed-in admin
tablet to a seller. A screen that covers the admin page is not a lock; the
lock is the `nej_customer_mode` cookie, enforced by `src/proxy.ts` (admin and
account pages), `requireAdmin()` (admin API routes, 423) and the New receipt
page. Any change that breaks one of these breaks an owner requirement
(`DECISIONS.md` → *"Customer input mode (2026-10-03)"*):

- the staff code is compared anywhere but the server, or exists in a second
  file (`lib/buy-receipt-staff-code.ts` is the only one);
- the seller's screen appears before the server lock is set;
- an admin route that answers a GET uses its own inline check instead of
  `requireAdmin()`, or another route passes `duringCustomerMode: true`;
- `/account/security` or `/account/reset-password` becomes reachable on a
  locked browser (both change the signed-in password without the old one);
- a seller becomes able to CHANGE an ID, date-of-birth, item or money box. The
  seller's screen is the form's own paper (since 2026-10-03, night), so those
  parts are on it — greyed, `disabled` and `inert`. Only the seven seller boxes
  and the two small email boxes may be switched on;
- the owner's own form is drawn differently because of the mode: everything
  the seller's view adds to `BuyReceiptSheet.tsx` must hang on its `customer`
  prop, which only the locked screen passes;
- the paper area on the locked screen becomes a scroller (`overflow: clip` on
  `.brc-page` and on the cut paper is deliberate — as a scroller, a focused box
  drags the paper out of place);
- an admin page has neither the admin menu nor `<CustomerModeTabGuard />`, or
  an `admin/layout.tsx` is added to carry it.

`lib/__tests__/buy-receipt-customer-mode.test.ts`, `admin-auth.test.ts` and the
route's own test guard all of it. ⚠️ The staff code is a kiosk convenience, not
a credential: it only works on a browser already signed in as an admin, which
is why it may live in source. It is still never written into a client file.

### Keep public writes behind the app

Apply edge plus distributed route limits before expensive/provider work.
Service-role access stays server-side. Public subscriber/account/inquiry/
checkout mutations pass through validated Next routes rather than directly
executable database RPCs.

### Keep EN/ES behavior paired

Changed user-facing routes, metadata, messages, filters, validation, legal copy,
and transactional content must be checked in both languages.

### Never store secrets in project files

Keep `.env`, `.env.local`, provider keys, service-role keys, and webhook secrets
out of project memory and source. Document only variable names and dashboard/
password-manager locations. Netlify is the operating environment source.

The BUILD OUTPUT counts too: Netlify publishes `.next` and its secrets scanner
reads every file in it. `experimental.turbopackFileSystemCacheForBuild` in
`next-app/next.config.ts` must stay `false` — Next 16.3 turned it on by default
and its `.next/cache/turbopack/*.sst` files hold a snapshot of every env value
(16 secrets flagged, deploy failed, 2026-09-10). After any Next upgrade, build
locally, confirm `.next/cache/turbopack/` does not exist, and grep `.next`
(excluding `.next/dev`) for the `.env.local` values — expect hits only for
`NEXT_PUBLIC_*`, `PAYPAL_CLIENT_ID`, `EBAY_ENV`, `EMAIL_FROM`, `AI_PROVIDER`.

### Keep memory bounded

Update present state in `CURRENT_STATUS.md`, open work in `TASKS.md`, durable
rationale in `DECISIONS.md`, and chronology in `CHANGELOG.md`. Do not append
the same session report to all four files.

## Pre-Publish Checklist

- [ ] `npm test -- --maxWorkers=4` passes.
- [ ] `npx tsc --noEmit` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run build` exits 0.
- [ ] After a Next upgrade: no `.next/cache/turbopack/` after the build, and the
      build-output secret grep is clean (see *Never store secrets*).
- [ ] If the batch changes page COPY, `CONTENT_LAST_MODIFIED` in `sitemap.ts`
      is bumped; if it adds, removes or retitles URLs, run `npm run indexnow`
      from `next-app/` AFTER the deploy is live (it refuses to run before).
- [ ] `npm audit --omit=dev` has no unresolved production vulnerability.
- [ ] EN and ES render correctly for changed customer-facing behavior.
- [ ] Responsive checks cover 320px mobile, tablet, short desktop, and wide
      desktop without page-level overflow or unreachable controls.
- [ ] New local assets live under `next-app/public/assets`; loose root source
      artwork has an explicit temporary reason.
- [ ] Product/media changes preserve Storage/Stream ownership and cleanup.
- [ ] Schema/type/query/UI changes are synchronized.
- [ ] Checkout changes are tested for Local Pickup, Florida shipping,
      non-Florida shipping, invalid address/method tampering, and exact cents.
- [ ] Public mutation changes preserve edge/distributed limits and server-only
      secrets.
- [ ] A new admin page shows the admin menu (or renders `<CustomerModeTabGuard />`),
      and a new admin route that answers a GET starts with `requireAdmin()` —
      otherwise a tablet in customer input mode can still reach it.
- [ ] No `zz-*` preview page is left under `src/app`.
- [ ] Root `netlify.toml` still builds from `next-app`.
- [ ] Production SQL/environment/manual steps are called out in `TASKS.md`.
- [ ] `CURRENT_STATUS.md`, `TASKS.md`, `DECISIONS.md`, and `CHANGELOG.md` reflect
      the resulting state without duplicating full history.
