import createIntlMiddleware from 'next-intl/middleware';
import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';
import { resolveDefaultLocalePrefixRedirect, resolveLegacyRedirect } from './lib/legacy-redirects';

const intl = createIntlMiddleware(routing);
const INTERNAL_LOCALE_HEADER = 'x-naples-internal-locale';
const NEXT_INTL_LOCALE_HEADER = 'X-NEXT-INTL-LOCALE';

const CANONICAL_ORIGIN = 'https://naplesestatejewelry.com';

// Legacy hosts that must 301 to the canonical .com origin. netlify.toml also
// redirects these, but this proxy runs FIRST and rewrites /shop -> /en/shop
// below, so the netlify rule then splats the already-localized path and emits
// .com/en/shop — which next-intl immediately 307s back to /shop. That is two
// hops for every legacy link, defeating the "hop once, never twice" intent
// documented in netlify.toml. Redirecting here, before the locale rewrite,
// keeps it to one.
//
// Paths outside this proxy's matcher (/api/*, robots.txt, sitemap) never reach
// here and keep using the netlify.toml rules, which already resolve in one hop.
// That is deliberate: the .co/api/* carve-out must stay a 200 rewrite because
// external webhook POSTs (Resend, PayPal, eBay) do not follow 301s.
//
// naplesantiquesllc.com was removed 2026-09-21: since 2026-09-20 it is a
// separate sister site on its own Netlify project and never reaches this app.
const LEGACY_HOSTS = new Set([
  'naplesestatejewelry.co',
  'www.naplesestatejewelry.co',
]);

function canonicalHostRedirect(request: NextRequest): NextResponse | null {
  const host = (request.headers.get('host') ?? '').toLowerCase().split(':')[0];
  if (!LEGACY_HOSTS.has(host)) return null;
  return NextResponse.redirect(
    `${CANONICAL_ORIGIN}${request.nextUrl.pathname}${request.nextUrl.search}`,
    301,
  );
}

const SESSION_PATH_PREFIXES = [
  '/account',
  '/admin',
  '/checkout',
  '/en/account',
  '/en/admin',
  '/en/checkout',
  '/es/account',
  '/es/admin',
  '/es/checkout',
];

function shouldRefreshSupabaseSession(pathname: string) {
  return SESSION_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

// Legacy/retired paths are answered here, before the locale rewrite below.
// They CANNOT live in netlify.toml or next.config.ts on this platform — see
// the header comment in lib/legacy-redirects.ts for the full explanation.
function legacyRedirect(request: NextRequest): NextResponse | null {
  const match = resolveLegacyRedirect(request.nextUrl.pathname);
  if (!match) return null;
  const url = request.nextUrl.clone();
  url.pathname = match.destination;
  return NextResponse.redirect(url, match.permanent ? 308 : 307);
}

async function refreshSupabaseSession(request: NextRequest, response: NextResponse) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getClaims();
  return response;
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Legacy HOSTS first, so the visitor lands on the canonical origin in one hop
  // and every rule below (retired paths, locale) is then evaluated exactly once,
  // on .com only.
  const hostRedirect = canonicalHostRedirect(request);
  if (hostRedirect) return hostRedirect;

  // Legacy/retired paths next — nothing below may run for these.
  const legacy = legacyRedirect(request);
  if (legacy) return legacy;

  const needsSessionRefresh = shouldRefreshSupabaseSession(pathname);

  // Next 16 currently re-runs proxy for next-intl's internal default-locale
  // rewrite (/ -> /en), which can make /en canonicalize back to / forever.
  // Mark our own English rewrite and let the internal /en request render.
  if (
    request.headers.get(INTERNAL_LOCALE_HEADER) === 'en' ||
    (pathname.startsWith('/en') && request.headers.get(NEXT_INTL_LOCALE_HEADER) === 'en')
  ) {
    const headers = new Headers(request.headers);
    headers.set(NEXT_INTL_LOCALE_HEADER, 'en');
    const response = NextResponse.next({ request: { headers } });
    if (!needsSessionRefresh) return response;
    response.cookies.set('NEXT_LOCALE', 'en', { path: '/', sameSite: 'lax' });
    return refreshSupabaseSession(request, response);
  }

  // An EXTERNAL `/en` or `/en/...` request (no internal-locale header, so it
  // is a real visitor or crawler, not next-intl's own re-run) goes home
  // PERMANENTLY. Left to next-intl below it would be a 307, which Google
  // treats as temporary and keeps recrawling — 46 such URLs sat in Search
  // Console's "Page with redirect" bucket on 2026-09-07. Query string kept.
  const bareDefaultLocalePath = resolveDefaultLocalePrefixRedirect(pathname);
  if (bareDefaultLocalePath !== null) {
    const url = request.nextUrl.clone();
    url.pathname = bareDefaultLocalePath;
    return NextResponse.redirect(url, 308);
  }

  if (!pathname.startsWith('/en') && !pathname.startsWith('/es')) {
    const url = request.nextUrl.clone();
    url.pathname = `/en${pathname === '/' ? '' : pathname}`;

    const headers = new Headers(request.headers);
    headers.set(INTERNAL_LOCALE_HEADER, 'en');
    headers.set(NEXT_INTL_LOCALE_HEADER, 'en');

    const response = NextResponse.rewrite(url, { request: { headers } });
    if (!needsSessionRefresh) return response;
    response.cookies.set('NEXT_LOCALE', 'en', { path: '/', sameSite: 'lax' });
    return refreshSupabaseSession(request, response);
  }

  // i18n routing for Spanish and direct prefixed default-locale URLs.
  const response = intl(request);
  if (!needsSessionRefresh) return response;
  return refreshSupabaseSession(request, response);
}

export const config = {
  matcher: [
    // `p/` is the short product-link namespace (/p/<inventory#> -> /shop/...)
    // used in social posts, and `review` is the short review-ask redirect.
    // Both are top-level route handlers and must bypass the locale rewrite,
    // or next-intl sends them to a /[locale]/... page that does not exist.
    // `txt` joined the extension list 2026-09-01: the IndexNow key file
    // (public/<key>.txt) must be served verbatim at the root or Bing cannot
    // verify submissions — robots.txt was already carved out by name for the
    // same reason. A .txt URL never has a locale meaning.
    // ⚠️ `review$` is anchored on purpose (2026-09-08): `/reviews` is a real
    // localized page, and the unanchored `review` prefix carved it out of the
    // locale rewrite too — a 404 in dev before the page had a single visitor.
    // Guarded by lib/__tests__/reviews-page.test.ts.
    '/((?!_next/static|_next/image|favicon.ico|icon|api/|p/|review$|robots.txt|sitemap.*\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?|mp4|webm|mov|ogg|pdf|txt)).*)',
  ],
};
