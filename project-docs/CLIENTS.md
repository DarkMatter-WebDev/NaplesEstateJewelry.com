# Clients — Surette Systems

> Client/hosting/maintenance reference for Surette Systems
> (`surettesystems.com`). Historical account and repository names may still use
> `DarkMatter-WebDev`; those are factual identifiers, not current site branding.
> Never store passwords, tokens, secret keys, or service-role values here.

## Naples Estate Jewelry

| Field | Value |
|---|---|
| **Business** | Naples Estate Jewelry; legal entity Naples Antiques LLC |
| **Primary contact** | Chris — (239) 404-8505 |
| **Primary domain** | `naplesestatejewelry.com` — live Netlify primary since 2026-08-01 |
| **Related domains** | `naplesestatejewelry.co` — former primary and current business-email domain; website 301s to `.com`. `naplesantiquesllc.com` — since 2026-09-20 NOT ours on this project: primary domain of the separate sister site Naples Antiques and Estate Services (own Netlify project, owner's cell (239) 304-6229, no GBP); it 301s NEJ's old paths back to `.com` itself (`SEO_LEAD_AUDIT.md` 2026-09-21). `naplesjewelrybuyers.com` — separate live buy-side site. |
| **Business email** | **The monitored mailbox is `info@naplesestatejewelry.com`** on Google Workspace — owner-confirmed receiving 2026-08-09, and the single point of failure for every inbound path the site has (inquiries, order notifications, marketing Reply-To, bounce handling). `info@` / `chris@naplesestatejewelry.co` still exist but the app no longer points anyone at them; **never alter `.co` MX records during site work**. **Senders:** as of 2026-08-05 all outbound From addresses are `@naplesestatejewelry.com` — Resend's verified sending domain. Do not "fix" a sender back to `.co`; it will not send |
| **Hosting** | Netlify site slug `naplesestatejewelry` (renamed from `naplesantiques` 2026-09-20; `naplesantiques.netlify.app` now 404s, nothing depends on it), team slug `rcman12589`; root `netlify.toml` builds `next-app/` and publishes `.next` |
| **DNS / registrar** | GoDaddy; primary apex points to Netlify (`75.2.60.5`) and Netlify owns the active certificate |
| **Supabase** | Project ref `evzluixourmsefwdsieu` |
| **Repository reference** | `https://github.com/DarkMatter-WebDev/NaplesEstateJewelry.com` (renamed from `NaplesAntiquesLLC.com` 2026-09-21; GitHub 301s the old name — ⛔ never create a new repo called `NaplesAntiquesLLC.com` in the org, it would kill that redirect) — manual-copy destination; this source-of-truth folder itself has no git workflow |
| **Maintenance plan** | TBD — define scope, cadence, and response time |
| **Billing status** | TBD |

## Deployment And Domain State

- `.com` DNS, Netlify primary/certificate, application environments, Supabase
  Auth URLs, PayPal/eBay/Etsy registrations, Search Console, sitemap, and Google
  Change of Address are complete.
- `.co` redirects path-preservingly to `.com`. (`naplesantiquesllc.com` left this
  project 2026-09-20 — see Related domains.)
  `.co/api/*` remains available for backward-compatible external callbacks.
- Site credit and current public branding name Surette Systems. Dark Matter
  remains only in historical account/repository identifiers.

## Third-Party Services

| Service | Use | Owner / credential location |
|---|---|---|
| **Supabase** | Auth, Postgres, Storage, products, orders, customer/admin/marketplace/social data | Public anon key in `NEXT_PUBLIC_SUPABASE_ANON_KEY`; service-role value only in gitignored local/Netlify environments |
| **Netlify** | Next.js hosting, environments, scheduled functions | Owner's `rcman12589` team; login/password reference still to document |
| **GoDaddy** | Domain registration and DNS | Owner account; login/password reference still to document |
| **gold-api.com** | Public XAU spot source | No key currently |
| **Resend** | Inquiry/order/fulfillment email | Account `rcman12589` (billing email on file). `RESEND_API_KEY` in local/Netlify environment only. **Free plan — 1 sending domain**; a second needs Pro at $20/mo. Sending domain is **`naplesestatejewelry.com`** (Verified 2026-08-05, us-east-1, GoDaddy DNS, id `bd08d8e7-ca8d-47a5-b28e-d8d608cd772c`); `.co` was deleted to free the single slot. Tracking metrics are OFF (would need a `links.` subdomain that rewrites every email link). Webhook is still registered on `.co/api/...` and still works via the `netlify.toml` 200 rewrite. |
| **PayPal** | Checkout and refunds | Client ID/secret and webhook configuration in Netlify environment/dashboard only |
| **Etsy** | Marketplace listing sync and daily price push | OAuth connection encrypted in Supabase; app/dashboard credentials outside repo |
| **eBay** | Marketplace listing sync, policies, webhooks, and daily price push | OAuth/app values in local/Netlify environment and encrypted provider rows |
| **Meta** | Instagram Business and Facebook Page preparation, scheduling, publishing, and reconciliation | `FACEBOOK_APP_SECRET` in gitignored local plus all Netlify contexts; tokens encrypted in Supabase |
| **Cloudflare Stream** | Optional product-video upload, processing, playback, MP4 | Four documented Netlify variables; feature remains deployment-gated |
| **OpenAI** | Optional AI listing/opener/speech features | `OPENAI_API_KEY` only in server environment when enabled |

## Credential References Still Needed

- Netlify site ID and password-manager login reference.
- Supabase dashboard owner/password-manager reference.
- GoDaddy account/password-manager reference.
- Resend, PayPal, Etsy, eBay, Meta, Cloudflare, and OpenAI dashboard owners or
  password-manager references where applicable.
- Confirm production Supabase Auth redirect URLs during the next deployment
  smoke pass, even though the `.com` migration was completed.
- Define maintenance scope/cadence and billing status.

## Rules

- `.env` and `.env.local` are gitignored and must never be copied into docs.
- Record credential location and owner only, never values.
- Surette Systems is the current service/site-credit identity.
- The owner handles version control manually in a separate folder; never run git
  in this source-of-truth project.

## New Client Template

```markdown
## <Client / business name>

| Field | Value |
|---|---|
| Business | |
| Primary contact | |
| Primary domain | |
| Related domains | |
| Hosting | |
| DNS / registrar | |
| Maintenance plan | |
| Billing status | |

### Third-party services

| Service | Use | Owner / credential location |
|---|---|---|
| | | |

### Outstanding requests

-
```
