# Project Overview

> **Read this file first** when starting a new session. It is the highest-level
> summary of the project. For the live state of work, read `CURRENT_STATUS.md`.

## Project Purpose

Marketing + commerce website for **Naples Estate Jewelry** (legal
entity: *Naples Antiques LLC*). The site does two jobs:

1. **Lead generation** for a private buying service run from a Naples
   showroom, with home visits on request —
   the owner travels to clients throughout Southwest Florida to evaluate and buy
   estate jewelry, gold, sterling silver, diamonds, watches, antiques, coins, and
   full estates.
2. **Online shop** that sells curated estate jewelry across chains, bracelets,
   rings, pendants, brooches, and other pieces with live metal-spot-based pricing.

## Business Goals

- Generate qualified seller leads (people looking to sell jewelry/estates) via
  phone calls, the "Submit Your Item" form, and newsletter signups.
- Build trust and authority (private, discreet, knowledgeable, local) to win
  business against pawn shops and national mail-in buyers.
- Sell estate inventory directly online at fair, transparent, spot-linked prices.
- Capture and retain customers via accounts, saved favorites, and saved carts.
- Rank locally in SEO for estate jewelry / gold / silver / antique buying across
  Naples, Marco Island, Bonita Springs, Estero, Fort Myers, and Cape Coral.

## Target Audience

- **Sellers**: Southwest Florida residents (often retirees / estate executors /
  downsizing families) holding inherited jewelry, gold, silver, or full estates.
- **Buyers**: shoppers looking for solid-gold chains and estate pieces priced
  close to melt value with transparent, live pricing.

Primary persona is affluent, 50+, in the Naples/Fort Myers area, who values
discretion and a personal relationship over a storefront transaction.

## Owner / Contact

- **Owner**: Chris (15+ years experience, born and raised in Naples).
- **Phone / text**: (239) 404-8505
- **Showroom**: 6240 Shirley St, Ste 104, Naples, FL 34109 — **inside Sharon
  Lynch Collections** (shared suite; name the landmark, the sign out front is
  theirs). Open **Mon–Fri 11:00–15:00, Sat 11:00–16:00, or by appointment**
  as of 2026-08-29 (Saturday closes an hour later than the rest of the week).
  ⛔ Hours are ADMIN-EDITABLE and the owner changes them on the fly — the DB
  (`shop_settings.store_hours`, Admin → Settings → Store Hours) is the source
  of truth, not this line and not `HOURS` in `business-location.ts`. Treat both
  as a stale-able fallback; never hardcode days into prose or metadata.
- **Service model**: **store-first** since 2026-08-17. Private home visits
  continue **on request** (large estates, downsizing, sellers who would rather
  not transport valuables) but are no longer the default. The site described
  itself as "mobile, appointment-only, no physical storefront" until that date.
- Address, hours and the wayfinding copy have ONE source:
  `next-app/src/lib/business-location.ts`. Do not retype them.
- **Service area**: Naples, Marco Island, Bonita Springs, Estero, Fort Myers,
  Cape Coral, and nearby Southwest Florida communities.

## Tech Stack

- **Frontend**: Next.js app in `next-app/` using the App Router, React,
  TypeScript, Tailwind, and `next-intl` for EN/ES routes.
- **Auth + data**: Supabase (Postgres + Auth) for customer accounts, profiles,
  favorites/wishlist behavior, inquiries, admin data, and products. Project ref:
  `evzluixourmsefwdsieu`.
- **Server/API**: Next route handlers for metal pricing, inquiries, and checkout,
  deployed on Netlify with `@netlify/plugin-nextjs`.
- **Payments**: PayPal (JS SDK on the client, Orders API v2 on the server) wired
  into `/checkout`. No card data touches our servers; totals are computed
  server-side. `PAYPAL_ENV` selects sandbox or live and must match the client
  ID/secret set. Netlify environment values are the operating configuration;
  local `.env.local` is not authoritative.
- **Hosting**: Netlify (`base = "next-app"`, publish `.next`).
- **Email / marketing**: Resend-backed inquiry/order flow plus Supabase-backed
  subscriber and admin marketing surfaces in the Next app.
- **Product catalog**: Supabase `products` table, with local image paths under
  `next-app/public/assets` for legacy/app-bundled assets and newer uploaded
  images via Supabase Storage. Product rows store image URL/path strings, not
  binary image payloads.
- **Legacy note**: the old root static HTML site and vanilla scripts were
  removed on 2026-06-13. The Next.js app is the only active runtime.

## Deployment Details

- **Host**: Netlify, configured by root `netlify.toml` with
  `base = "next-app"` and `publish = ".next"`.
- **Primary domain**: `naplesestatejewelry.com` (owner bought the `.com` and
  decided the switch 2026-08-01; all app canonicals/sitemap/schema/email
  branding now emit `.com`). The external wiring is DONE and verified
  (GoDaddy DNS → Netlify, `.com` is the Netlify PRIMARY with cert, env vars
  and Supabase Auth updated) — `https://naplesestatejewelry.com` serves the
  live site. PayPal/eBay/Etsy registrations, Search Console, sitemap, and
   Google Change of Address are complete. The latest recorded NEJ application
   deployment was verified on 2026-09-21; the 2026-09-23 handoff records no new
   app-code batch awaiting deployment. The pending satellite-site publish belongs
   to its separate project. See `CURRENT_STATUS.md` and `TASKS.md` for remaining
   manual checks; these are recorded handoff facts, not a fresh production probe.
- **Legacy domain**: `naplesestatejewelry.co` stays a Netlify alias with
  path-preserving 301s to `.com` (host redirects live in `proxy.ts` so legacy
  links resolve in ONE hop; `netlify.toml` keeps the host rules for paths outside
  the proxy matcher, plus an `/api/*` carve-out — a **200 rewrite, not a
  redirect** — for backward-compatible external webhook callbacks).
- **Email is fully `.com` — senders AND mailboxes.** (This bullet described a
  `.co`-mailbox / `.com`-sender split until 2026-08-08, when the mailbox half was
  reversed. Older comments and notes saying "mailboxes stay on `.co`" are stale;
  the rule below is current.)
  - **Senders must be `.com`.** Since 2026-08-05, Resend's only verified sending
    domain is `naplesestatejewelry.com`, so every outbound From address is
    `@naplesestatejewelry.com`. A `.co` From address will not send at all.
  - **`info@naplesestatejewelry.com` is the one monitored mailbox** — a live
    Google Workspace inbox, owner-confirmed receiving on 2026-08-09. It is the
    contact address shown on the site, the Reply-To on customer receipts and
    marketing, and the order-notification default. Zero `@naplesestatejewelry.co`
    addresses remain in shipped code; never restore one.
  - **Never touch the `.co` MX records** regardless — that domain still carries
    live mailboxes even though the app no longer points anyone at them.
- **Related domains** (listed as `sameAs`): `naplesjewelrybuyers.com` — a
  separate, live, actively-run buy-side landing site with its own
  LocalBusiness/FAQPage schema (confirmed 2026-07-11).
- **Source**: `https://github.com/DarkMatter-WebDev/NaplesEstateJewelry.com`
  (renamed from `NaplesAntiquesLLC.com` on 2026-09-21; the old URL redirects).
- **Deploy flow**: root `netlify.toml` sets `base = "next-app"`, runs
  `npm run build`, and publishes `.next`.
- See `CLIENTS.md` for hosting/repo/credential reference locations.

## High-Level Summary

A fast, SEO-optimized Next.js site with a luxury "editorial" visual theme. Most
pages are marketing/trust content. The dynamic surfaces are:

- the **shop** (`/shop`, `/shop/[id]`) backed by Supabase products and priced
  live against metal spot,
- **online checkout + payments** (`/checkout`) via PayPal (Orders API v2) —
  creates the order and captures payment server-side, with no inventory hold
  (whoever pays first gets the one-of-one item); see `features/paypal-checkout.md`,
- **customer accounts** backed by Supabase,
- **admin, orders, and inquiries** backed by Supabase/Next route handlers,
- **marketplace + social syndication** run from Admin: Etsy and eBay listing
  sync, and review-first auto-posting to Instagram and Facebook with a
  generated ad card (see `features/*.md`),
- localized EN/ES routes powered by `next-intl`.

Site credit: every page's footer ends with a thin full-width banner linking
"Website built by SuretteSystems.com" (localized in Spanish) to
`https://surettesystems.com` (added 2026-07-31). The earlier Dark Matter Web
Services references were deliberately removed from the app before that;
`CLIENTS.md` retains the historical client/hosting tracking context.
