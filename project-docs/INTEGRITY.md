# Integrity Rules And Pre-Publish Checklist

> Current rules for the Next.js app. Last reconciled: **2026-08-30**.

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
(measured 2026-09-02, after the editor-batch revert): **1197/1197 tests across 116 files**, TypeScript clean,
lint clean, and a build that exits 0 with **74 prerendered routes = 34 EN +
34 ES + 6 non-locale** (`/_global-error`, `/_not-found`, `/favicon.ico`,
`/icon.png`, `/robots.txt`, `/sitemap.xml`). Every locale page adds one to
each side; a lopsided count means a page is missing from one locale.

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
- [ ] Root `netlify.toml` still builds from `next-app`.
- [ ] Production SQL/environment/manual steps are called out in `TASKS.md`.
- [ ] `CURRENT_STATUS.md`, `TASKS.md`, `DECISIONS.md`, and `CHANGELOG.md` reflect
      the resulting state without duplicating full history.
