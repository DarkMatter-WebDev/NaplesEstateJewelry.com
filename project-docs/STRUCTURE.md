# Structure And Build Integrity

> Canonical project map and single sources of truth. Last reconciled:
> **2026-09-15**.

## Runtime Shape

The active site is the Next.js App Router application in `next-app/`. Root
`netlify.toml` intentionally points Netlify at that directory:

```toml
[build]
  base = "next-app"
  command = "npm run build"
  publish = ".next"
```

The retired root static site must not return. Root is for operating
instructions, deployment config, SQL, project memory, and dedicated marketplace
plans. App source and runtime assets belong under `next-app/`.

## Directory Map

```text
NaplesEstateJewelry.co/
|-- AGENTS.md
|-- ACCOUNT_SETUP.md
|-- CLAUDE.md
|-- netlify.toml
|-- project-docs/
|   |-- features/
|   |-- PROJECT_OVERVIEW.md
|   |-- CURRENT_STATUS.md
|   |-- TASKS.md
|   |-- DECISIONS.md
|   |-- CHANGELOG.md
|   `-- ...
|-- supabase/
`-- next-app/
    |-- package.json
    |-- package-lock.json
    |-- next.config.ts
    |-- netlify/
    |   `-- edge-functions/        # (functions/ deleted 2026-09-13 — Supabase pg_cron is the only scheduler)
    |-- messages/
    |-- public/
    |   |-- assets/
    |   `-- <indexnow-key>.txt      # IndexNow key file; public by protocol design
    |-- scripts/                   # dev-cache guard, route/compression probes, indexnow-submit
    `-- src/
        |-- app/
        |-- assets/                # vendored static TTFs for the social ad card
        |-- components/
        |-- context/
        |-- hooks/
        |-- i18n/
        |-- lib/
        `-- types/
```

`banner.png` is a temporary owner-supplied source candidate for eBay artwork.
It is not a runtime asset and is retained only because it differs materially
from the shipped WebP. Resolve its policy/content decision in `TASKS.md`; do not
let additional loose app assets accumulate at root.

## Single Sources Of Truth

| Concern | Source |
|---|---|
| Localized pages/routes | `next-app/src/app/[locale]/` |
| Lead-form photos (free-evaluation + contact forms) | Browser: `src/lib/lead-photo-prep.ts` (`shrinkFormPhotos`, `LEAD_PHOTO_BUDGET_BYTES` 3.8 MB, tiers 2048→1024 px, JPEG intermediate, too-large message) called by `components/free-evaluation/EvalForm.tsx` and `components/contact/MessageUsForm.tsx` BEFORE the POST. Server: `src/lib/lead-photo-encode.ts` (`encodeLeadPhoto` → WebP via `product-image-encode.ts`, original bytes kept when unreadable) in `api/inquire/route.ts` (`inquiries/`) and `api/contact-message/route.ts` (`messages/`). Cap: `src/lib/lead-photo-limits.ts` (`LEAD_PHOTO_MAX` 10 + the hint / count / red over-cap strings) imported by both forms, both routes and the shrink; shown by `components/contact/LeadPhotoCount.tsx`. After a send: `components/contact/FormSuccessPanel.tsx` (shared by `EvalForm`, `MessageUsForm`, `InquiryForm` — scrolls itself into view, "Send another", call/text line) and `src/lib/lead-form-errors.ts` (429 wording). Guards `lib/__tests__/lead-photo.test.ts`, `lead-photo-limits.test.ts`, `form-success-panel.test.ts`. Rule `DECISIONS.md` → *"Lead-form photos are shrunk in the browser"* |
| Phone contact bar (Call · Text · Directions, phones, seller pages only) | `src/components/cta/MobileContactBar.tsx` mounted ONCE in `[locale]/layout.tsx`; pages from `src/lib/contact-bar-paths.ts` (`CONTACT_BAR_SECTIONS`, `showsContactBar`, `stripLocalePrefix`); CSS `.mobile-contact-bar` + the two `body:has([data-mobile-contact-bar])` rules in `globals.css` (bottom padding, cookie notice lifted above the bar); guard `lib/__tests__/mobile-contact-bar.test.ts`. ⛔ Never mounted from a page file. Rule `DECISIONS.md` → *"The phone contact bar is mounted from the layout"* |
| "Text Us" links (beside the places that say "call or text", + the phone menu rows) | `src/components/cta/TextUsLink.tsx` (`opening="seller"` on seller pages only; shoppers and the homepage get an empty message) used in `sell/[city]/page.tsx`, `free-evaluation/page.tsx`, `(home)/page.tsx` owner block, `components/shop/ProductTrustSections.tsx`; menu rows inline in `components/layout/SiteHeader.tsx` (panel, never the header row). Guard `lib/__tests__/text-us-links.test.ts` |
| Customer Call / Text / Directions hrefs for NEW contact CTAs | `src/lib/contact-links.ts` (`TEL_HREF`, `smsHref(body?)` in the cross-platform `sms:…?&body=` form, `sellerTextBody(isEs)`, `directionsHref()` = `mapsUrl()`); ⛔ the owner's cell only, never the toll-free text-deals number; guard `lib/__tests__/contact-links.test.ts`. The 66 older hand-written `tel:` links are left alone. Rule `DECISIONS.md` → *"Customer Call / Text / Directions links come from `contact-links.ts`"* |
| Text alerts sending (Twilio): confirmation, inbound YES/STOP/HELP/replies, Text Deals, sweep | `src/lib/text-alerts/` — `config.ts` (env + webhook URLs), `twilio.ts` (Messages API over fetch), `signature.ts` (pure signature check), `messages.ts` (pure: every outbound text + `classifyInbound` + TwiML), `deal-input.ts` (pure form → row), `card.ts` (photo + price overlay JPEG), `confirmations.ts`, `deals.ts` (queue-first sends; `notifyDealSold` = buyer "It's yours" + "spoken for" notices on Mark sold, once per phone; `reopenDealAsDraft`, `deleteDeal`), `inbound.ts`, `sweep.ts`; routes `app/api/webhooks/twilio/{inbound,status}`, `app/api/admin/text-alerts/sweep`, `app/api/admin/text-deals/**` (incl. `[id]` DELETE + `[id]/reopen`), `app/api/admin/subscribers/resend-confirmation`; UI `[locale]/admin/text-deals` + `components/admin/TextDealsManager.tsx`; SQL `supabase/text-deals-2026-09.sql`; fonts traced in `next.config.ts`; guard `lib/__tests__/text-alerts.test.ts`; rules `DECISIONS.md` → *"Text deals: the reply is the claim…"* |
| Homepage "Join the List" sign-up (email / text / both) + text-alert phone rules | `components/home/HomeSubscriberForm.tsx` (caption + the one button; hooks `home-subscriber-label` / `-join` for the hero's compact mode) → `components/home/HomeSubscribeModal.tsx` (the window, loaded on tap, portalled); `lib/subscriber-phone.ts` (US-number normalizer, channel parsing, `SMS_CONSENT_TEXT` + version, admin labels); `app/api/subscribe/route.ts` → `subscribe_homepage_v2` (`supabase/text-subscribers-2026-09.sql`: nullable email, `phone_e164`, `sms_*` columns); Admin → Subscribers reads `lib/marketing.ts` `buildSubscriberDirectory` and sorts via `lib/subscriber-sort.ts` (`phone` / `alerts` keys); legal anchor `[locale]/terms` section `id: 'text-messages'` (EN in the page, ES in `lib/spanish-legal-copy.ts`); guards `lib/__tests__/home-subscribe-modal.test.ts` + `subscriber-phone.test.ts`; rules `DECISIONS.md` → *"The hero sign-up is one button"* |
| SEO guide pages (nested under the parent lander, never `/guides/` or `/blog/`) | `[locale]/silver-services/flatware-value/` (the template), `[locale]/silver-services/silver-marks/` and `[locale]/gold-services/gold-marks/` (the illustrated marks guides — copy lives in `components/silver/SilverMarksSection.tsx` / `components/gold/GoldMarksSection.tsx`, no FAQ LD), `[locale]/gold-services/what-is-my-gold-worth/`, `[locale]/jewelry-appraisal/hallmarks/`, `[locale]/estate-services/selling-inherited-jewelry/` — each `page.tsx` self-contains its copy, FAQPage + BreadcrumbList JSON-LD, and metadata; listed in `sitemap.ts` at 0.6; content rules in `DECISIONS.md` → *"Guide pages live UNDER their parent"* |
| Guest order lookup (no account) | `src/lib/order-lookup.ts` (pure: number normalisation, email/phone second factor, tracking URLs, `toPublicOrderView`) + `src/lib/__tests__/order-lookup.test.ts`; route `app/api/orders/lookup` (per-IP + per-number rate limits, one generic not-found); page `[locale]/order-lookup` (noindex, off the sitemap, `?order=` prefill) + `components/orders/OrderLookupForm.tsx`; footer link in `SiteFooter.tsx`; order emails link here via `order-email-branding.ts` (`getOrderLookupUrl`, `SITE_DOMAIN_LABEL = NaplesEstateJewelry.com`). Rule `DECISIONS.md` → *"Guest order lookup needs the order number AND…"* |
| Shipping service on the admin order page (which postage to buy) | `src/lib/shipping-service.ts` (`describeShippingService`: fee + subtotal → Priority / Express / Registered / pickup / unknown) + `src/lib/__tests__/shipping-service.test.ts`; shown in `components/admin/OrderDetailPanel.tsx` Summary (red box for Express) and `admin/orders/[id]/print/PrintOrderClient.tsx`. Tier tables live in `lib/checkout-shipping.ts` |
| Text-alert brand picture (MMS on every customer text) | `public/assets/images/branding/text-brand-wordmark-v5.jpg` (URL from `lib/text-alerts/config.ts` `brandMediaUrl()`); `messages.ts` `twiml(message, mediaUrl?)`; attached in `confirmations.ts` + `inbound.ts` (YES reply, sold auto-reply); guard in `lib/__tests__/text-alerts.test.ts`. Rule `DECISIONS.md` → *"Text alerts: every customer-facing text is a picture message"* |
| Text-alert tables: service-role grant | `supabase/text-alerts-service-role-grant-2026-09.sql` — run once; `text-deals-2026-09.sql` revoked anon/authenticated but never granted `service_role`, so every server path failed "permission denied" until this ran (found 2026-09-17). Same class as the invoices grant |
| Orders Recycle Bin multi-select (checkbox per row, select-all, Delete … Forever) | `src/lib/trash-selection.ts` (pure selection rules + labels) + `src/lib/__tests__/trash-selection.test.ts`; UI in `components/admin/OrdersPanel.tsx` (trash view only, one `delete().in('id', …)`) |
| Business-card QR landing pages (`/card`, `/kittcard`, + `/es/…`) | ONE component `src/components/card/CardLanding.tsx` (the page + `cardMetadata`); per-person values in `src/lib/card-holders.ts` (`CARD_HOLDERS`); routes `[locale]/card/page.tsx`, `[locale]/kittcard/page.tsx` are two-line wrappers. Guards `lib/__tests__/card-page.test.ts` (noindex, off the sitemap for every holder, thin wrappers). Rule `DECISIONS.md` → *"Business-card pages: one component, per-holder values"* |
| Automatic invoices (service-role grant on `invoices`) | `supabase/invoices-service-role-grant-2026-09.sql` — run once; without it every automatic invoice upsert (`lib/order-finalize.ts`, `api/paypal/create-order`, `api/admin/in-store-sales`) fails on "permission denied" while receipts still send. `CHANGELOG.md` 2026-09-16 (late night) |
| In-store sale recorder (card taken on Zettle; the site records a paid, picked-up order) | `src/lib/in-store-sale.ts` (pure: price parsing, 6% FL totals, `normalizeInStoreSaleInput`, `in_store_<method>` values + `paymentMethodLabel`) + `src/lib/__tests__/in-store-sale.test.ts`; route `app/api/admin/in-store-sales` (create_paypal_order → capture_paypal_order → in-store stamp → hooks → finalizePaidOrder); page `[locale]/admin/in-store-sale` + `components/admin/InStoreSaleForm.tsx`; nav in `AdminHeader.tsx`. Unlisted items = order lines with `product_id null`, never a product row. Rules `DECISIONS.md` → *"In-store sales: Zettle takes the card…"* |
| Product page structured data (`Product` + `Offer`) | `src/lib/product-ld.ts` (`productOfferLd`: the Offer from the canonical price VALUE — sold pages carry `sold_price` + `SoldOut`; no numeric price → the page emits no Product schema) + `src/lib/__tests__/product-ld.test.ts`; assembled in `src/app/[locale]/shop/[id]/page.tsx`. Rule in `DECISIONS.md` → *"Product schema: the Offer price is the canonical value"* |
| Breadcrumbs — schema AND visible trail (every sitemap page except `/`, plus product pages) | `src/lib/breadcrumb-ld.ts` (the one `BreadcrumbList` shape + tests), `src/components/BreadcrumbJsonLd.tsx` (the script tag), `src/components/BreadcrumbTrail.tsx` (the visible "Home › Sell Gold" line; `BreadcrumbTrailFromLd` variant for pages that build the LD object by hand). Legal pages get both through `LegalPolicyPage`'s `path` prop. Pages that pre-date the helper (`/sell`, `/sell/[city]`, `/shop/[id]`, `/jewelry-appraisal`, `/diamond-buyers`, `/watch-buyers`, the four guides) still build the LD shape by hand and feed it to the trail — same names for the same parents, placement/tone rules in `DECISIONS.md` |
| Business-card QR landing page (`/card`, `/es/card`; noindex, not in the sitemap, no site chrome) | `[locale]/card/page.tsx` + `src/components/card/CardTodayHours.tsx` + `src/components/card/CardJoinListButton.tsx` (the page's only client piece: the tinted "Join the List" tile under the grid, opens `components/home/HomeSubscribeModal.tsx` on tap); facts from `business-location.ts` + admin hours; "Read Our Reviews" → `/reviews`; the EN/ES toggle is a soft navigation with NO entrance fade (`components/layout/CustomerReveal.tsx` exempts locale-only pathname changes sitewide; `lib/__tests__/customer-reveal-locale-switch.test.ts`); rules in `DECISIONS.md` → *"The /card page"* + *"A language switch is a text swap"*; guarded by `lib/__tests__/card-page.test.ts` + `reviews-page.test.ts` (labels) |
| Storefront photo ("which door"; no caption) | `src/components/StorefrontPhoto.tsx` (aspects 4:3 / 16:9 / 1:1, required `sizes`, alt text with the visual cues) over `public/assets/images/pages/showroom-storefront.webp` (1600×1200); rendered on `[locale]/(home)/page.tsx` Visit Us (square, beside the square `ShowroomMap`), `components/contact/VisitUsPanel.tsx`, `[locale]/sell/[city]/page.tsx` (showroom city only), `[locale]/card/page.tsx` (16:9); rules in `DECISIONS.md` → *"The storefront photo says which door"*; guarded by `lib/__tests__/storefront-photo.test.ts` |
| Phone hours (9 AM–6 PM daily; distinct from showroom hours) | `PHONE_HOURS` + `phoneHours()` / `phoneHoursLabel()` / `phoneContactPointSchema()` in `src/lib/business-location.ts`; rendered on `[locale]/card/page.tsx`, `[locale]/(home)/page.tsx` (Visit Us), `[locale]/spot-prices/page.tsx`, `[locale]/gold-services/page.tsx`, `[locale]/silver-services/page.tsx`, `[locale]/estate-jewelry/page.tsx`, `[locale]/sell/page.tsx`, `[locale]/sell/[city]/page.tsx` (hero and Naples showroom call group), `components/layout/SiteFooter.tsx`, `components/contact/MessageUsForm.tsx` and `components/contact/VisitUsPanel.tsx`; `contactPoint` in `[locale]/layout.tsx` schema; rules in `DECISIONS.md` → *"Phone hours are stated in words"*; guarded by `lib/__tests__/phone-hours.test.ts` |
| Page FAQ block (visible accordion + FAQPage JSON-LD from ONE list) | `src/components/FaqSection.tsx` (`Faq` = qEn/qEs/aEn/aEs); used by `[locale]/gold-services/page.tsx` (`GOLD_FAQS`) and `[locale]/silver-services/page.tsx` (`SILVER_FAQS`); the diamond/watch/appraisal pages still carry the same markup inline; answers restate existing page copy only (owner facts in `DECISIONS.md`); guarded by `lib/__tests__/service-landers-faq.test.ts` |
| Reviews page (`/reviews`, `/es/reviews`; sitemap 0.5; About ▾ menu `nav.reviews` + footer + `/card`) | `[locale]/reviews/page.tsx` renders `TESTIMONIALS` (`lib/testimonials.ts`, the single verbatim list) through `components/home/TestimonialCard.tsx` — the ONE card, extracted 2026-09-08 and also rendered by `TestimonialsSection` (homepage marquee, product grid); `.reviews-grid` in `globals.css`; ⛔ no rating schema; `/review` (the 302 handler) is carved out of the proxy matcher as `review$` so `/reviews` still reaches the locale rewrite; rules in `DECISIONS.md` → *"The /reviews page"*; guarded by `lib/__tests__/reviews-page.test.ts` |
| Gold marks guide (`/gold-services/gold-marks`; the gold lander shows a four-photo teaser, `components/gold/GoldMarksTeaser.tsx`) | `src/components/gold/GoldMarksSection.tsx` (copy EN/ES + photo list, five blocks) reusing `components/silver/MarkGallery.tsx` via its `dir` prop; assets `public/assets/images/pages/gold-marks/<key>.webp` + `<key>-full.webp`; guarded by `lib/__tests__/gold-marks-guide.test.ts`; provenance in `CHANGELOG.md` 2026-09-06 (late night); rules in `DECISIONS.md` → *"Silver-marks photos"* (same rules) and *"eBay photo research"* |
| Live metal prices page (`/spot-prices`, `/live` alias) | `[locale]/spot-prices/page.tsx` (EN/ES copy, karat table, `revalidate = 300`); feed `lib/spot-price.ts` → `fetchMetalSpotPrices()` (four metals, nulls on failure — never a fallback number); charts `components/trading/TradingViewSymbolOverview.tsx` (full size, range tabs) + `TradingViewTicker.tsx`; nav item `SiteHeader` ABOUT_ITEMS `livePrices` + `nav.livePrices` in `messages/*.json`; footer link; alias in `lib/legacy-redirects.ts`; guarded by `lib/__tests__/spot-prices-page.test.ts` (karat fractions must equal the gold-worth guide's) |
| Silver marks guide (`/silver-services/silver-marks` → "Reading the Marks on Your Silver"; the lander shows a four-photo teaser, `SilverMarksTeaser.tsx`) | `src/components/silver/SilverMarksSection.tsx` (copy EN/ES + photo list) + `MarkGallery.tsx` (click-to-expand); split guarded by `lib/__tests__/silver-marks-guide.test.ts`; assets `public/assets/images/pages/silver-marks/<key>.webp` + `<key>-full.webp`; guarded by `lib/__tests__/silver-marks-assets.test.ts`; photo provenance in `CHANGELOG.md` 2026-09-06; rules in `DECISIONS.md` → *"Silver-marks photos"* |
| Marketplace preflight pencil edits — review window (Products → select → Sync → Review), the listing editor's Etsy/eBay accordions, and the Manage Etsy/eBay pages | ONE shared editor `components/admin/ProductFieldInlineEditor.tsx` (`useProductFieldEditor`, `PencilButton`, `EbayAspectRows`) used by `components/admin/SelectedMarketplaceReviewFlow.tsx` (rows, tags) and `components/admin/EtsyProductPanel.tsx` / `EbayProductPanel.tsx`; inside the open listing editor a save is merged into the form by `AdminShell.applyDrawerFieldEdit` → `applyFieldPatchToEditorState` (form, type/chain/length inputs, undo stack) + `components/admin/EtsyCategoryDropdown.tsx` (grouped Etsy taxonomy picker over `/api/admin/etsy/taxonomy`); edits go through `app/api/admin/products/fields/route.ts` over the pure allow-list + normalizers in `lib/product-field-edits.ts` (guarded by `lib/__tests__/product-field-edits.test.ts`); both preview routes return `productFields` + `priceMarkupPct`. Rules: `DECISIONS.md` → *"Review-window edits write to the product"* |
| Wearable length (inches; `mm`/`cm` input converts once) and purity label | `parseLengthInches()` / `normalizeProductLengthSizeValue()` / `formatProductPurityLabel()` in `src/types/product.ts` — the ONE parser the editor, AI autofill (`lib/ai-product-schema.ts`), product page, Etsy `length-experiment.ts` and eBay `mapping.ts` share. Rules: `DECISIONS.md` → *"Length is stored in inches"* |
| Admin → Subscribers table order (click a header; default Subscribed newest-first, blanks/undated last) | `src/lib/subscriber-sort.ts` (pure: `SubscriberRow`, `DEFAULT_SUBSCRIBER_SORT`, `nextSubscriberSort`, `sortSubscriberRows`, `subscriberSourceLabel`) rendered by `components/admin/SubscribersManager.tsx`; guarded by `lib/__tests__/subscriber-sort.test.ts` |
| Marketplace sale → site sold (Etsy/eBay order → `products.status = 'sold'` → other channel ended) | `src/lib/marketplace-sales.ts` (pure: which order lines count, product mapping, unit price, cursor overlap, summaries; `lib/__tests__/marketplace-sales.test.ts`) + `src/lib/marketplace-sales-sweep.ts` (server: `sweepEtsySales` / `sweepEbaySales`, called first from `api/admin/{etsy,ebay}/reconcile-status`); API reads `lib/etsy/client.ts` `getShopReceipts` and `lib/ebay/client.ts` `getOrders`; DB `supabase/marketplace-sales-2026-09.sql` (`apply_marketplace_sale()`, `marketplace_sale_events`, `auto_mark_sold` switches, `etsy_connection.sales_cursor` / `ebay_connection.orders_cursor`). Scopes `transactions_r` / `sell.fulfillment.readonly` in the auth scope constants. Rules: `DECISIONS.md` → *"A marketplace sale marks the product sold"* |
| Homepage hero headline fit (shrinks in place on a short window so it clears the sign-up form) | `src/components/home/HomeHeroOverlay.tsx` styles: `.home-hero-overlay` (size container, two-row grid), `.home-hero-top-zone` (row 1, size container, `z-index: 5`, registered `--hero-quarter`), the sign-up block in flow in row 2 via `margin-bottom`, and the `@supports (height: 1cqh)` fit rules for `.home-hero-top h1` (desktop + ≤640px); width ratios are tied to the current headline wording. Compact mode (eyebrow hidden, sign-up block tightened, smaller controls, higher phone headline) is the `@container hero-overlay (max-height: …)` blocks at the end of the styles, one per width band, built from the `COMPACT_*` constants at the top of the file, with one band table per headline language (`COMPACT_BANDS_EN` / `COMPACT_BANDS_ES`, written out by `compactBandCss` — each page renders only its own); the form's `home-subscriber-*` class hooks live in `HomeSubscriberForm.tsx`. Minimum hero height on the tiniest windows: `HomeHeroStack.tsx` (`--hero-min-vh` per width band, `--app-vh: max(var(--app-vh-page), …)`, the runway's 0-or-1 switch, `settleOnPaneA()`) over the `--app-vh-page` copy in `globals.css`. Guarded by `lib/__tests__/hero-short-screens.test.ts`. Rules: `DECISIONS.md` → *"The homepage headline shrinks in place on a short window"*, *"A hero too short to fit goes compact"* and *"The hero keeps a minimum height on the tiniest windows"* |
| Shared layout | `next-app/src/components/layout/` |
| Product data | Supabase `products` |
| Product TypeScript contract | `next-app/src/types/product.ts` |
| Product uploads | Supabase Storage bucket `product-images`, written ONLY by `src/app/api/admin/product-images/route.ts` since 2026-09-09: the browser downsizes to 2048px and posts a high-quality intermediate, the server encodes WebP with sharp (`src/lib/product-image-encode.ts`, also `shrinkImageForAi()` for the assistant payload) and uploads with `cacheControl: '31536000'`. ⛔ WebKit (every iPhone browser) cannot encode WebP in a canvas — never move the encode back to the client. Guarded by `lib/__tests__/product-image-encode.test.ts` |
| Product video | Cloudflare Stream bytes; Supabase `product_videos` metadata; `src/lib/product-video*.ts` and `cloudflare-stream.ts` |
| Product pricing | `next-app/src/lib/pricing.ts` and `spot-price.ts` |
| Authoritative checkout totals | `next-app/src/lib/checkout-pricing.ts` |
| Shipping methods and fees | `next-app/src/lib/checkout-shipping.ts` |
| U.S. address normalization | `next-app/src/lib/us-address.ts` |
| PayPal integration | `src/lib/paypal*.ts`, PayPal API routes, and `features/paypal-checkout.md` |
| Etsy integration | `src/lib/etsy/`, Etsy API routes, and `features/etsy-sync.md` |
| eBay integration | `src/lib/ebay/`, eBay API routes, and `features/ebay-sync.md` |
| Instagram posting | `src/lib/instagram/`, `/api/admin/instagram/*`, and `features/instagram-posting.md` |
| Facebook posting | `src/lib/facebook/`, `/api/admin/facebook/*`, and `features/facebook-posting.md` |
| Deep Field Gallery product push (outbound, one-way) | `src/lib/deepfield/{payload,sync}.ts`, hooked from `app/actions/admin-products.ts` + `api/paypal/{capture-order,webhook}`, and `features/deepfield-sync.md`. No API route of its own — NEJ is the sender, never a receiver |
| Social captions/card/renditions (shared by both channels) | `src/lib/instagram/{mapping,card,images,backdrop}.ts` + fonts in `src/assets/fonts` |
| Social queue scheduling + background publishing | `src/app/[locale]/admin/social-queues/`, `[locale]/layout.tsx`, `components/admin/{SocialQueuesDashboard,SocialQueueRowActions,SocialScheduleModal,SocialBackgroundPublishProvider}.tsx`, `src/lib/{social-queue-schedule,social-background-publish}.ts`, channel sync APIs/stores, Netlify drip functions, and `supabase/social-scheduled-posting-2026-08.sql` |
| Short product links (`/p/<inventory#>`) | `next-app/src/app/p/[code]/route.ts` |
| Distributed rate limits | `next-app/src/lib/rate-limit.ts` and hardening SQL |
| Broad API edge limit | `next-app/netlify/edge-functions/api-rate-limit.ts` |
| Blocked scanner probes | `next-app/netlify/edge-functions/blocked-probes.ts` with fallback rules in root `netlify.toml` |
| Homepage announcement strip (copy, link, visibility) | `next-app/src/lib/home-banner.ts` (pure: shape, default, resolve, parse, the MEASURED length budget) + `home-banner-server.ts` (cached fetch), edited via `/api/admin/home-banner` and `components/admin/AdminHomeBannerPanel.tsx`. ⚠️ The strip is `nowrap` — `BANNER_SAFE_CHARS`/`BANNER_MAX_CHARS` encode the 320px Spanish measurement and are enforced in the parser, not just the panel |
| Admin-editable weekly store hours | `next-app/src/lib/store-hours.ts` (server-only fetch) over the pure formatters in `business-location.ts`, edited via `/api/admin/store-hours` and `components/admin/AdminStoreHoursPanel.tsx` |
| Public-shop cache invalidation | `next-app/src/app/actions/admin-products.ts` |
| Supabase clients | `next-app/src/lib/supabase/client.ts` and `server.ts` |
| Translations | `next-app/messages/en.json` and `es.json` |
| Local runtime assets | `next-app/public/assets/` |
| Search-engine push after URL changes (Bing/Yandex/Seznam/Naver) | `npm run indexnow` → `next-app/scripts/indexnow-submit.mjs`, keyed by `public/5f41b4c6500c156c3ddaec86d7e313b6.txt`. The key is public by protocol design (never in `.env`); `txt` is excluded from the `proxy.ts` matcher so the file is served verbatim at the root. The script reads the LIVE sitemap and refuses to submit until it reads the key back from production |
| Sitemap freshness signal | `CONTENT_LAST_MODIFIED` in `next-app/src/app/sitemap.ts` — bumped by hand when a batch changes page COPY (not for doc-only or infrastructure deploys); `/shop` alone uses "now" |
| A link inside copy that ALSO feeds JSON-LD or a data array | `next-app/components/LinkedPhrase.tsx` over `lib/link-phrase.ts`: finds the literal phrase at render and links only that span, falling back to plain text. Used by `/faq` (FAQPage answer) and `/trade-in` (STEPS). ⚠️ Never fork such a sentence into a second JSX copy — that is how visible text drifts from the schema |
| SEO robots/sitemap | `next-app/src/app/robots.ts` and `sitemap.ts` |
| Page titles, descriptions, canonicals and social cards | `next-app/src/lib/seo.ts` — `pageMetadata()`. Public pages call it rather than hand-rolling `openGraph`; a hand-rolled block that omits `images` silently ships a blank share card |
| `noindex` legal pages (and their sitemap exclusion) | `next-app/src/lib/legal-metadata.ts` — `LEGAL_NOINDEX_PATHS`, which `sitemap.ts` subtracts |
| Brand mark (header + browser tab + JSON-LD `logo`, one artwork) | `public/assets/images/branding/nav-logo.webp`, `src/app/icon.png`, `src/app/favicon.ico`; the schema `logo` in `[locale]/layout.tsx` and `sell/[city]/page.tsx` points at the same file. ⛔ `branding/logo.webp` (a "Naples Jewelry Buyers" mark) was removed 2026-09-01 — never bring it back |
| Touch photo-swipe gesture (product gallery AND shop cards) | `next-app/src/lib/photo-swipe.ts` — thresholds and axis arbitration included. It was duplicated per surface until 2026-08-17, and the gallery's copy silently missed the fix the cards got, so **both surfaces must keep importing this** |
| Route-change progress bar | `next-app/src/components/layout/RouteProgressBar.tsx`, mounted once in `[locale]/layout.tsx` **inside `<Suspense>`**. Navigations begun in code arm it via its `startRouteProgress(href)` export rather than a second indicator |
| Showroom address, hours, and shared-suite wayfinding copy | `next-app/src/lib/business-location.ts` — schema, footer, checkout, receipts and page copy all read from it. ⚠️ Since 2026-08-25 the weekly HOURS are admin-editable data (`shop_settings.store_hours` via `src/lib/store-hours.ts`); the formatters here are pure and take the schedule as a parameter, and `HOURS` is only the fallback default. The phone number was never centralised and is now hardcoded in 105 places across 37 files; the address must not repeat that |
| Embedded showroom map (homepage CTA + contact `VisitUsPanel`) | `next-app/src/components/ShowroomMap.tsx`, pinned by `mapsEmbedUrl()` in `business-location.ts`. ⚠️ It frames Google, so `frame-src` must list `https://www.google.com` AND `https://maps.google.com` in **both** `next-app/next.config.ts` and root `netlify.toml` — the frame is SQUARE (`aspect-ratio: 1/1`, capped by `maxWidth`, which binds height too); the embed 301s between those origins, and a CSP-blocked iframe blanks silently. `loading="lazy"` is required, not cosmetic |
| Showroom address as a DISPLAY block (footer, homepage CTA, About) | `next-app/src/components/ShowroomAddress.tsx`. Puts the landmark on its own line so "Sharon Lynch Collections" cannot split. ⚠️ Only the NAME is `nowrap` — an unbreakable full clause overflows a 320px column. `addressWithLandmark()` is still the right call for prose and email; both compose from `landmarkParts()` |
| Copy-address control (footer, homepage CTA, contact panel, About) | `next-app/src/components/CopyAddressButton.tsx`, copying `addressOneLine()` via `lib/clipboard.ts`. ⚠️ Street+city only — never the landmark or business name, because the paste target is a geocoder. Must remain a SIBLING of the maps link, never nested inside the `<a>` or the `<address>` |
| Opening hours as a DISPLAY list (footer, contact, About, homepage CTA) | `next-app/src/components/ShowroomHours.tsx`, rows from `hoursRows()` / `hoursRowsGrouped()`. Closed days are derived from `HOURS.days`, never a second list. ⚠️ The grouped 2-row variant hardcodes "Sunday – Monday" and is only valid while the closed days stay a contiguous pair. `hoursLine()` remains the right call for prose and email |
| Customer reviews (content + both presentations) | `next-app/src/lib/testimonials.ts` is the only review list; `components/home/TestimonialsSection.tsx` renders it as a grid (product pages) or a CSS-only marquee (homepage, `variant="marquee"`). ⚠️ Marquee card spacing must stay `margin-inline-end` not `gap`, and the wrapper must keep `data-customer-reveal-skip` — both fail silently. Quotes are verbatim; a review that cannot be published verbatim is not published |
| Phone listing editor (Add / Edit modal on `< 768px`) | The modal in `components/admin/AdminShell.tsx` (`h-svh` column: header, `.product-editor-body` scroller, `.product-editor-actions` row IN FLOW with the phone-only `⋯` sheet; `cloneListing()` shared by both surfaces) plus the body-scroll-lock effect beside it. CSS: the "option B" block at the end of `globals.css` (16px touch fields, compact pills, `[data-desktop-only]` / `[data-phone-only]` visibility). ⛔ No admin `layout.tsx`, no viewport lock, no hide-on-scroll (reverted 2026-09-02). Rationale: `features/admin-listing-editor-mobile.md`; rules in `DECISIONS.md` → *"Admin on a phone"* |
| LAN phone preview of the dev server | `next.config.ts` `allowedDevOrigins` (includes `*.nip.io`), the Windows firewall rule "Next dev 3007 (LAN)", and the public Turnstile site key in `.env.local`; the phone uses `http://10.0.0.208.nip.io:3007` because Turnstile widgets only accept FQDNs (owner adds `nip.io` in Cloudflare once) |
| Project memory | `project-docs/` |

## Structural Invariants

1. Keep the runtime under `next-app/` unless the entire deployment structure is
   deliberately migrated and all config/docs change together.
2. Never rebuild a static product catalog. Public/admin product reads come from
   Supabase and select only needed columns.
3. Preserve product IDs. They are route and saved-state keys.
4. Store image/video references in database rows, never media bytes.
5. New product images use Supabase Storage and WebP/downscale/cache defaults.
6. Video bytes go directly to Cloudflare Stream and only ready projections
   reach public product pages.
7. Keep EN/ES route behavior paired.
8. Browser code gets only public Supabase values. Service-role and provider
   secrets stay server-only.
9. Every public product write that should change `/shop` calls the shared
   product cache revalidation helper.
10. Checkout amounts, shipping methods, and destination validity are recomputed
    server-side from their shared libraries.
11. Public mutations use layered rate limits and validated app routes; do not
    expose direct public database mutation RPCs.
12. Supabase schema changes update SQL, TypeScript contracts, query projections,
    UI, tests, and project memory together.
13. `CURRENT_STATUS.md`, `TASKS.md`, and `DECISIONS.md` stay concise.
    `CHANGELOG.md` is the only full-history memory file.
14. Do not run git commands in this source-of-truth folder.

## Current Build Structure

`src/app/[locale]/shop/(list)/page.tsx` remains a thin Next route entry with
only supported route exports. The reusable implementation lives beside it in
`shop-page-renderer.tsx` and is shared with `/shop-modern`.

### ⚠️ The `(N/N) static pages` build line is NOT the prerendered page count

Reconciled by measurement 2026-08-30, after this file (456), `CURRENT_STATUS.md`
(458) and the actual build (457) all disagreed. **All three were "right" when
written; the figure simply is not stable.**

`✓ Generating static pages (457/457)` is a **progress counter for the
generation phase**. It is not the number of pages emitted, and it moves on its
own:

- `shop/[id]/page.tsx:187` runs `generateStaticParams()` over every product with
  status `available` **or** `sold`, two entries per product. The generation
  phase therefore **scales with the catalog**, and adding or permanently
  removing a product shifts the counter without any code change. (Marking an
  item *sold* does not — `sold` is in that filter, which is why a 2-product
  sale once left the counter unmoved while the sitemap dropped by 2.)
- None of those product pages are actually prerendered. `/[locale]/shop/[id]`
  builds as **ƒ dynamic**, because the page decides visibility from the session.

⛔ **Do not treat that line as an invariant, and do not "correct" it to a fixed
number.** Measure it if you want, but a delta is not by itself a defect.

### The numbers that ARE stable

From `.next/prerender-manifest.json` (authoritative) on 2026-08-30:

| Measure | Value |
|---|---|
| Prerendered routes, total | **60** |
| — English | **27** |
| — Spanish | **27** |
| — non-locale (`_global-error`, `_not-found`, `favicon.ico`, `icon.png`, `robots.txt`, `sitemap.xml`) | **6** |
| Prerendered product pages | **0** |
| `.html` files under `.next/server/app` | 56 |

**`en === es` is the invariant worth asserting** — it is a direct check of the
"Keep EN/ES route behavior paired" rule, and unlike the progress counter it
cannot be moved by inventory.

⚠️ **The regression this guards against is real, so keep guarding it — just with
the right number.** `[locale]/layout.tsx` reads `useSearchParams` through
`RouteProgressBar`, and that hook client-renders everything up to the nearest
`<Suspense>` boundary. The boundary around that component is the only thing
keeping the deopt contained; remove it and the build still succeeds while
prerendering silently collapses. After touching the root layout, check the
manifest, not the progress line:

```bash
node -e "const m=require('./.next/prerender-manifest.json');const r=Object.keys(m.routes);console.log(r.length,'routes | en',r.filter(x=>x.startsWith('/en')).length,'| es',r.filter(x=>x.startsWith('/es')).length)"
```

## Cleanup Notes

- Generated `.next`, `*.tsbuildinfo`, logs, caches, and dependency folders are
  disposable and must remain ignored.
- `COMPLIANCE_AUDIT.md` is retained point-in-time evidence, not startup memory.
- The remaining legacy local-only product-image migration is tracked in
  `TASKS.md`.
