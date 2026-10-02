import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Google Ads conversion tag (2026-10-02; lib/ads-tracking.ts). The hosts are
// Google's own list for "Google Ads conversions"
// (developers.google.com/tag-platform/security/guides/csp). The tag is only
// ever loaded for a visit that came from an ad click, but the policy is static,
// so the hosts are allowed for every response. ⛔ Must match root netlify.toml
// (two-CSP rule) — a host missing from either file blocks the tag in production
// while it works locally, or the reverse.
//
// www.gstatic.com is NOT on Google's list and is needed anyway: the phone
// snippet (calls through the forwarding number) loads
// https://www.gstatic.com/wcm/loader.js. Without it the browser blocks that
// script and the 60-second call conversion never records, with only a console
// error to say so (measured 2026-10-02).
const GOOGLE_ADS_CSP = {
  script: 'https://www.googletagmanager.com https://www.googleadservices.com https://www.google.com https://www.gstatic.com',
  img: 'https://www.googletagmanager.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://pagead2.googlesyndication.com https://www.google.com',
  connect: 'https://www.googletagmanager.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://pagead2.googlesyndication.com https://www.google.com https://ad.doubleclick.net',
  frame: 'https://www.googletagmanager.com',
} as const;

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  `img-src 'self' data: blob: https://evzluixourmsefwdsieu.supabase.co https://s3.tradingview.com https://*.tradingview.com https://*.paypal.com https://*.paypalobjects.com https://*.cloudflarestream.com https://*.videodelivery.net ${GOOGLE_ADS_CSP.img}`,
  // challenges.cloudflare.com is Turnstile (Supabase Auth CAPTCHA) — it needs
  // script-src AND frame-src, and must match root netlify.toml (two-CSP rule).
  // Dev only, `http://www.gstatic.com`: Google's call-forwarding loader fetches
  // its second script protocol-relative, so on http://localhost it asks for the
  // http:// address, which the https entry above does not cover. Production is
  // https and never needs this.
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval' http://www.gstatic.com" : ''} https://s3.tradingview.com https://www.paypal.com https://*.paypalobjects.com https://challenges.cloudflare.com ${GOOGLE_ADS_CSP.script}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  `connect-src 'self' https://evzluixourmsefwdsieu.supabase.co https://api.gold-api.com https://s3.tradingview.com https://*.tradingview.com https://*.tradingview-widget.com https://*.paypal.com https://*.cloudflarestream.com https://*.videodelivery.net ${GOOGLE_ADS_CSP.connect}`,
  `frame-src https://*.tradingview.com https://*.tradingview-widget.com https://*.paypal.com https://*.cloudflarestream.com https://*.videodelivery.net https://www.google.com https://maps.google.com https://challenges.cloudflare.com ${GOOGLE_ADS_CSP.frame}`,
  "media-src 'self' blob: https://*.cloudflarestream.com https://*.videodelivery.net",
  "worker-src 'self' blob:",
].join('; ');

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY },
  // microphone=(self): the admin Smart Listing Assistant's tap-to-talk needs it.
  // `microphone=()` (the previous value) forbids the mic in EVERY document, so
  // Chrome denied it with no prompt (owner, 2026-09-02). Same value must live in
  // root netlify.toml — the two-file header rule.
  // camera=(self): Admin → Buy Receipts photographs the seller's ID with the
  // webcam (2026-09-30). `camera=()` forbade it in every document, prompt or no
  // prompt. (self) only lets OUR pages ask; the browser still asks the person.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(), browsing-topics=()' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
] as const;

const nextConfig: NextConfig = {
  compress: true,
  poweredByHeader: false,
  experimental: {
    // ⛔ Keep this OFF. Next 16.3 turned the Turbopack persistent BUILD cache
    // on by default, and that cache (`.next/cache/turbopack/*.sst`) stores a
    // snapshot of every process.env value — RESEND_API_KEY, the PayPal secret,
    // every cron/enc key. Netlify publishes `.next`, so its secrets scanner
    // read them and failed the 2026-09-10 deploy ("Secrets scanning found 16
    // instance(s)", all in .netlify/.next/cache/turbopack/…/00000001.sst).
    // Nothing was served, but the deploy cannot pass with the cache on. The
    // dev cache (`.next/dev/…`) is unaffected and never leaves this machine.
    turbopackFileSystemCacheForBuild: false,
  },
  // The Instagram card renders its type with Satori, which needs the actual
  // font bytes at runtime. Nothing imports these files, so tracing cannot infer
  // them and the serverless bundle would ship without them — every card render
  // would then fail with ENOENT. Keep this in sync with FONT_DIR in
  // src/lib/instagram/card.ts.
  outputFileTracingIncludes: {
    '/api/admin/instagram/**': ['./src/assets/fonts/**'],
    // Facebook prepare renders the same generated card, so it needs the same
    // font files in its serverless bundle.
    '/api/admin/facebook/**': ['./src/assets/fonts/**'],
    // On-demand card rendering for the panels' "Generate card" button.
    '/api/admin/card-preview': ['./src/assets/fonts/**'],
    // Text deals draw the price on the owner's photo with the same faces
    // (lib/text-alerts/card.ts); the preview, send and sweep routes render.
    '/api/admin/text-deals/**': ['./src/assets/fonts/**'],
    '/api/admin/text-alerts/**': ['./src/assets/fonts/**'],
  },
  // Dev-only: lets `npm run dev` (which already binds 0.0.0.0) accept requests
  // from this machine's LAN IP too, not just localhost — needed so hot-reload
  // and internal /_next asset requests aren't blocked when testing from a
  // phone/tablet at http://<your-LAN-IP>:3000. No effect on production/builds.
  // If your LAN IP changes (DHCP), update it here or just add another entry.
  // `*.nip.io` — a public wildcard DNS (10.0.0.208.nip.io → 10.0.0.208) so the
  // owner's phone reaches the LAN dev server under a real hostname. Turnstile
  // widgets only accept FQDNs, so the raw IP cannot complete a sign-in
  // (2026-09-02). Dev only; production ignores this key.
  // `*.local` — the desk PC's mDNS name (`desktop-ssfdjdu.local`), the
  // fallback when a phone cannot use nip.io (iCloud Private Relay or a
  // router's DNS-rebind protection refuses a public name that resolves to a
  // LAN address; a `.local` name is answered on the LAN itself).
  allowedDevOrigins: ['192.168.119.224', '192.168.119.*', '10.0.0.208', '10.0.0.*', '*.nip.io', '10.0.0.208.nip.io', '*.local', 'desktop-ssfdjdu.local'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [...SECURITY_HEADERS],
      },
      {
        source: '/api/metal-prices',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=300, stale-while-revalidate=300',
          },
        ],
      },
    ];
  },
  // NOTE: there is deliberately no `redirects()` here. On Netlify the
  // next-intl proxy runs as an edge function ahead of the Next.js server and
  // rewrites locale-less paths to `/en/...`, so config redirects NEVER fire
  // for English URLs — only the `/es/*` twins ever reached them, which hid
  // 22 dead redirects in production until 2026-08-02. Every legacy/retired
  // path now lives in src/lib/legacy-redirects.ts and is served by
  // src/proxy.ts before the locale rewrite. Do not re-add rules here.
  images: {
    // AVIF first (smaller at the same visual quality), WebP fallback. The
    // browser gets whichever it supports; both are served at the requested
    // display size, so a full-res source is never shipped to a small card.
    formats: ['image/avif', 'image/webp'],
    // Next 16 only honors quality values listed here — a value not in this list
    // is served as an error, not silently clamped. 75 is the default used by
    // other <Image> on the site; 82 is the hero carousel (see below); 90 is
    // retained so any remaining caller keeps working.
    //
    // The carousel moved 90 -> 82 on 2026-08-09. Its cards only ever request
    // w=640 (measured), so the source is already downscaled hard before quality
    // is applied, and 90 was buying detail at a size that cannot show it.
    // Measured on three representative hero photos through this optimizer:
    // 23.3/39.6/98.1 KB at q90 against 13.0/21.8/50.6 KB at q75 — i.e. quality
    // is worth roughly half the payload here, which is the single largest
    // mobile cost in the hero.
    qualities: [75, 82, 90],
    // 31 days, up from the 1-hour default Lighthouse flagged ("use efficient
    // cache lifetimes", ~66 KiB re-downloaded per repeat view). Safe at this
    // length because optimized-image URLs are fully content-addressed: every
    // upload gets a timestamped filename (see the Storage upload path), so a
    // replaced photo is a NEW URL — the old cache entry is orphaned, never
    // stale. Do not raise this to "immutable forever" though: the underlying
    // remote fetch from Supabase still revalidates on this cadence.
    minimumCacheTTL: 2678400,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'evzluixourmsefwdsieu.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default withNextIntl(nextConfig);
