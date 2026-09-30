# Feature: Customer Accounts (Supabase)

## Summary

Customer accounts support sign-in, editable customer profile/contact/address
details, saved favorites, and cart-related state. Accounts are backed by
Supabase Auth and Postgres. Setup instructions live in `ACCOUNT_SETUP.md`.
Account form submissions expose immediate saving/loading states. Sign-out also
switches to a disabled localized busy label before awaiting Supabase and
navigating home, preventing duplicate requests during a slow response.

Administrator accounts receive one localized Admin Panel access card. On
mobile (700px and below), it is the first dashboard card after the account tabs,
above Account Overview. At 701px and wider, it occupies its original right-side
rail position. The mobile and rail placements share one card component and are
CSS-exclusive, so only one is visible; non-admin accounts render neither.

## Key Files

- `next-app/src/app/[locale]/account/page.tsx` - account dashboard route.
- `next-app/src/components/account/AccountProfileForm.tsx` - editable profile,
  contact, phone, and complete address form.
- `next-app/src/app/[locale]/account/sign-in/page.tsx` and
  `next-app/src/app/[locale]/account/sign-up/page.tsx` - auth entry points.
- `next-app/src/components/checkout/CheckoutClient.tsx` - checkout prefill from
  saved profile data.
- `next-app/src/components/admin/DeleteUserButton.tsx` - admin account deletion
  confirmation and destructive action.
- `next-app/src/lib/supabase/client.ts` and
  `next-app/src/lib/supabase/server.ts` - browser/server Supabase clients.
- `supabase/schema.sql` - tables, triggers, RLS.
- `supabase/profile-contact-fields.sql` - idempotent upgrade for full profile
  contact/address columns.
- `supabase/fix-permissions.sql` - idempotent fixup for grants/columns.

## Data Model

See `ARCHITECTURE.md` -> Data Model. Tables: `profiles`, `customer_carts`, and
`favorites`, all RLS-protected so users only access their own rows. A new user
triggers auto-creation of a profile + empty cart.

`profiles` stores:

- name fields: `first_name`, `last_name`, `full_name`
- contact fields: `email`, `phone`, `alternate_phone`
- address fields: `address_line1`, `address_line2`, `city`, `state`,
  `postal_code`, `country`
- customer flags/preferences: marketing opt-out/consent fields, `is_vip`,
  `is_admin`

## Auth Flow

1. Next/Supabase client config reads `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
2. Sign up sends a confirmation email and stores account consent metadata for
   Terms/Privacy acceptance.
3. Supabase trigger creates `profiles` + `customer_carts` rows.
4. `/account` reads the profile server-side and renders the editable profile
   form.
5. Checkout prefill reads signed-in profile contact data when available.
6. `/account/security` exposes security/account preference surfaces.

## VIP / Private Pricing

`profiles.is_vip` can be set manually in Supabase for future private pricing
flows. `profiles.is_admin` grants access to the admin routes.

## Admin Account Deletion

The Admin Users table exposes account deletion only for non-admin rows. Its
confirmation is portaled to `document.body` so table whitespace and overflow
styles cannot leak into the dialog. Long names, emails, warnings, and returned
errors wrap within the card; the card is bounded by the dynamic viewport and
its actions stack on narrow phones.

## Setup Reminders

- Run `supabase/schema.sql` in the SQL Editor; enable Email auth.
- For existing projects, run `supabase/profile-contact-fields.sql` once.
- Run `supabase/compliance-consent.sql` so Terms/Privacy acceptance metadata can
  persist on profiles.
- Set **Auth -> URL configuration** Site URL + Redirect URLs to match the live
  domain and localhost dev URLs.
- Only the anon key belongs in browser config. Never use a service-role key in
  client code.
