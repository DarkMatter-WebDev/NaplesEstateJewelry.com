# Supabase Account Setup

The current site is the Next.js app in `next-app/`. Supabase supports:

- customer auth
- profiles
- product catalog/admin data
- product image/object storage through Storage bucket `product-images`
- inquiries
- wishlist/cart-related state used by the app
- subscribers, orders, invoices, admin notifications, and marketing tables when
  the additive SQL migrations are applied

## 1. Create or Open the Supabase Project

Project ref: `evzluixourmsefwdsieu`.

In the Supabase SQL Editor, run the relevant scripts in `supabase/`:

- `schema.sql` - account/profile/favorites/cart foundation
- `profile-contact-fields.sql` - upgrade existing projects with complete
  customer contact/address profile fields
- `products.sql` - product table and product policies
- `inquiries.sql` - inquiry table and policies
- `fix-permissions.sql` - idempotent permission/column repair
- additive migration scripts such as `sales-workflow.sql`,
  `admin-notifications-checkout.sql`, `order-item-line-discounts.sql`,
  `paypal-checkout.sql` (PayPal checkout: order/product reservation columns,
  `webhook_events`, reserve/capture/release RPCs, `service_role` grants),
  `homepage-subscribers.sql`, `email-marketing.sql`, `compliance-consent.sql`,
  and product taxonomy/image migrations as needed

## 2. Auth URL Configuration

In **Authentication -> URL configuration**:

- Site URL: `https://naplesestatejewelry.com`
- Redirect URLs:
  - `https://naplesestatejewelry.com/**`
  - `https://naplesestatejewelry.co/**` (legacy domain — keep during the
    .co→.com transition so any email links issued before the switch still work)
  - `http://localhost:3000/**`
  - `http://127.0.0.1:3000/**`

The Next app account routes are:

- `/account/sign-in`
- `/account/sign-up`
- `/account` - editable customer profile/contact/address details

## 3. Environment Variables

Local values live in `next-app/.env.local` and must not be committed.

Required public values:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SITE_URL=
# Cloudflare Turnstile SITE key (public by design) — bot gate on the auth
# forms. Unset = widget renders nothing, auth calls send no token. The SECRET
# key lives only in the Supabase dashboard (Auth -> Attack Protection), never
# in this repo or Netlify. Deploy the site key BEFORE enabling the Supabase
# CAPTCHA toggle, or sign-in breaks for everyone.
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
```

Server-only values, if enabled:

```bash
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
EMAIL_PROVIDER_API_KEY=
SITE_URL=
PROVIDER_WEBHOOK_SECRET=
# PayPal checkout — credentials MUST match PAYPAL_ENV (sandbox vs live).
# The client id is public (sent to the browser to load the PayPal JS SDK);
# the secret + webhook id stay server-side.
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_ENV=sandbox
PAYPAL_WEBHOOK_ID=
```

Only `NEXT_PUBLIC_*` values are exposed to browser code. Never use a Supabase
service-role key in client code.

## 4. Deploy

Root `netlify.toml` builds from `next-app/`:

```bash
npm run build
```

Set the same environment variables in Netlify. Keep secrets in Netlify's
environment settings, not in repository files.
