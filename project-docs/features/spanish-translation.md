# Feature: Spanish Localization

> Current EN/ES localization model. Last updated: **2026-11-22** (Spanish subscribers section).

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

## Spanish subscribers — texts and emails (2026-11-22)

Each subscriber has a language (`homepage_subscribers.locale`). Spanish
subscribers get the text deals, every text-deal system text and the marketing
emails in Spanish. Rules: `DECISIONS.md` → "Spanish subscribers"; files:
`STRUCTURE.md` → "Spanish subscribers" row; history: `CHANGELOG.md` 2026-11-22 (2).

- **How someone becomes Spanish:** joins on the /es site, or taps
  "¿Prefiere español?" in the Join window; a Spanish buy receipt's mailing-list
  add; or the owner's Language switch in Admin → Subscribers. Email recipients
  with no newsletter row follow their latest order's language.
- **Texts:** fixed Spanish wording in `lib/text-alerts/messages.ts`; STOP / HELP
  stay the words to type. Spanish stop words (ALTO, PARAR…) are handled by the
  site, not Twilio.
- **Deals:** Preview machine-translates the owner's words into the Español box
  (corrections kept; "Translate again" redoes it) and renders a Spanish set of
  pictures. "Test in Español" sends the Spanish version to the owner's cell.
- **Email:** "Translate to Spanish" on Compose Campaign; empty = English for
  everyone. Spanish footer + `/es/unsubscribe`.
- **Lead forms (2026-11-22 (3)):** the Free Evaluation / Sell by Mail / shop
  inquiry forms send `locale`; the customer's confirmation email comes back in
  that language (`lib/inquiry-confirmation.ts`).
- **Still English:** Supabase account emails (sign-up confirmation, password
  reset) — dashboard templates; open in `TASKS.md`.
- ⚠️ The Spanish wording is Claude's draft — the owner's translator confirms it.

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
