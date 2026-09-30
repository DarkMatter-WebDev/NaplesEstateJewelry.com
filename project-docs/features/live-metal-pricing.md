# Feature: Live Metal Pricing

> Current pricing flow for gold/silver spot-backed products. Last updated:
> **2026-07-06**.

## Summary

Shop prices update against server-side spot data in the Next.js app. The old
root Netlify Function and static `window.ShopPricing` script are retired.

Current surfaces:

- public shop cards,
- product detail pricing and melt/scrap context,
- cart, checkout, wishlist, admin pricing previews,
- `/api/metal-prices` for browser/API consumers.

## Key Files

- `next-app/src/lib/spot-price.ts` - fetches/caches spot data from
  `api.gold-api.com`; defines its own `FALLBACK_GOLD_SPOT` used only if the
  upstream API call fails.
- `next-app/src/app/api/metal-prices/route.ts` - Next route handler exposing
  spot data to the app.
- `next-app/src/lib/pricing.ts` - product melt value and display price
  helpers; defines a separate `FALLBACK_GOLD_SPOT` of its own (different
  value, different purpose — a display-time fallback for price computation,
  not the spot-fetch fallback above). Don't assume the two constants are the
  same value or kept in sync.
- `next-app/src/types/product.ts` - product pricing fields and status helpers.
- `next-app/src/app/[locale]/shop/page.tsx` - server-side spot fetch for shop
  listing pricing.
- `next-app/src/app/[locale]/shop/[id]/page.tsx` - product detail price context.
- `next-app/src/components/shop/PriceUpdateTicker.tsx` - visible refresh timing
  where used.

## Data Shape

Pricing inputs live on Supabase `products` rows:

- `category` - legacy broad pricing category, currently `Gold` or `Silver`.
- `metal_type` - broader merchandising metal family.
- `metal_variant` - color/subtype such as yellow gold, white gold, silver,
  vermeil, platinum.
- `purity` - karat for gold, sterling/silver value for silver inventory.
- `weight_grams` / `gram_weight` - product weight used for melt value.
- `price_mode` - `spot-multiplier` or `manual`.
- `pricing_multiplier` - multiplier over melt for spot-priced items.
- `manual_price_label` - fixed/manual display value; `asking_price` is legacy DB
  fallback only and is cleared by current admin product saves.

## Pricing Logic

For spot-multiplier products:

```text
meltValue = spotPerGram * purityRatio * gramWeight
displayPrice = meltValue * pricingMultiplier
```

`pricing.ts` owns the exact helper behavior so shop cards, detail pages, cart,
checkout, and admin surfaces stay consistent.

Manual-priced products skip the live multiplier math and display the saved
manual price label. Bare numeric labels are normalized by the shared helper
(`1` -> `$1`, `1200` -> `$1,200`), and the same parser is used by cart,
checkout, and order snapshot pricing so fixed-price items do not fall back to
dash totals when entered as a plain number.

## Customer trade-in price ("Own gold or silver? … pay as little as ___")

A separate, marketing-only line on `shop/[id]`, independent of the sale price
and the scrap-value box (which always shows the real melt value).
`resolveAdvertisedTradeInPrice(product, meltValue, siteDefault)` in
`types/product.ts` resolves it in strict precedence:

1. **Per-item override** (`products.special_price_override_*` — a flat dollar
   amount or a signed % over melt) — always wins.
2. **Site-wide default** — `shop_settings.special_price_default_enabled` +
   `special_price_default_percent` (signed; negative = below spot). Set once in
   Admin → Settings → **Customer Trade-in Price** (`AdminSpecialPricePanel.tsx`,
   via the `shop-settings` route + `fetchSpecialPriceDefault`). Applies
   `meltValue * (1 + percent/100)` to every item at once.
3. **Plain melt value** — the historical default when neither is set.

Reads degrade to "off" pre-migration. **Migration:
`supabase/shop-special-price-default-2026-07.sql`.** Changes propagate to
product pages within ~5 min (ISR), like the spot values they show.

## Source And Fallback

`spot-price.ts` currently uses `api.gold-api.com` and keeps a fallback so the
shop remains usable if the provider is unavailable. If traffic grows or the
public endpoint becomes unreliable, add a keyed provider behind the same helper
instead of calling a provider directly from the browser.

## Verification

After pricing code, route, or schema-contract changes:

```bash
cd next-app
npm run lint
npm run build
```

Also verify `/api/metal-prices`, `/shop`, and at least one `/shop/[id]` product
detail page in-browser.
