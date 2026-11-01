# Feature: Spanish Localization

> Current EN/ES localization model. Last updated: **2026-08-03**.

## Status

Spanish localization is implemented through the current Next.js app using
`next-intl`. The old static `/es/*.html` page model is retired.

English routes are canonical without a visible `/en` prefix. Spanish routes use
`/es`.

Examples:

```text
/shop        <-> /es/shop
/about       <-> /es/about
/contact     <-> /es/contact
/account     <-> /es/account
```

## Key Files

- `next-app/src/i18n/routing.ts` - locale routing configuration.
- `next-app/src/i18n/request.ts` - request locale/message setup.
- `next-app/src/proxy.ts` - locale rewrite/redirect/session handling.
- `next-app/messages/en.json` and `next-app/messages/es.json` - shared UI
  message files.
- `next-app/src/app/[locale]/*` - localized route files.
- `next-app/src/app/sitemap.ts` - SEO URL generation.

## Route Rules

- Unprefixed English URLs such as `/shop` are the public canonical English
  routes.
- `/es/...` serves Spanish pages.
- Direct `/en/...` URLs should canonicalize to unprefixed English equivalents.
- When adding a new public page, confirm both English and Spanish paths render
  or intentionally 404 together.
- Update sitemap behavior when the route should be indexed.

## Translation Sources

Use `messages/en.json` and `messages/es.json` for shared strings. Route files
may also include paired localized copy when the page is highly bespoke, but keep
English and Spanish branches adjacent and easy to audit.

Product listings are single-source in Supabase:

- English fields: `title`, `description`, `details`, `tags`
- Spanish fields: `title_es`, `description_es`, `details_es`, `tags_es`

Do not duplicate product rows per locale. Product ids, prices, inventory state,
and image arrays stay shared.

## Shop Localization

Public shop/card/detail code chooses Spanish product fields when locale is `es`,
falling back to English only when a Spanish field is missing. New listings
should include Spanish title/description/details/tags whenever possible.

Metal, product type, status, policy, cart, account, and marketing UI strings
should use shared translation utilities/messages or paired labels in
`types/product.ts`.

## Forms And Subscribers

Contact/evaluation forms are React components in the Next app and should render
localized labels/copy from the route/component locale. Newsletter subscribers
use the local Supabase-backed subscriber model, not MailerLite.

## SEO Requirements

For changed public pages:

- localized metadata should be accurate for EN and ES,
- canonical English should stay unprefixed,
- Spanish pages should use `/es/...`,
- sitemap entries should match the live route set,
- no route should point to retired `/store`, `/silver-tableware`, or root
  static `.html` pages.

## Glossary

| English | Spanish |
|---------|---------|
| Estate jewelry | Joyeria de patrimonio / joyeria heredada |
| Sell to us | Vendenos |
| Gold | Oro |
| Silver | Plata |
| Bullion | Lingotes |
| Sterling silver | Plata de ley |
| Spot price | Precio spot |
| Appointment | Cita |
| Free evaluation | Evaluacion gratuita |

Brand/proper nouns such as Rolex, Tiffany & Co., Cartier, Naples Estate Jewelry,
and Surette Systems stay as-is unless the owner requests otherwise.

## Remaining Review

- Native-speaker review of Spanish marketing and product copy is still valuable.
- Check new admin/product/customer-facing strings for Spanish coverage whenever
  adding a feature.
