// Single source of truth for paths the app no longer serves.
//
// WHY THIS IS NOT IN next.config.ts OR netlify.toml
// ------------------------------------------------
// On Netlify the next-intl proxy (src/proxy.ts) is deployed as an EDGE
// FUNCTION that runs ahead of both the Netlify redirect engine and the
// Next.js server. It rewrites every locale-less path to `/en/...`, so a bare
// `/cart` becomes `/en/cart` — a route that does not exist — and 404s before
// any redirect layer is consulted. Only the `/es/*` twins ever reached
// next.config's `redirects()`, which is why this class of bug looks
// half-working and hid in production for months (found 2026-08-02: all 22
// English-side redirects were returning 404 while every Spanish one worked).
//
// `next dev` DOES honour next.config redirects, so a local test passes while
// production still 404s. Verify redirects against the deployed site.
//
// Keys are locale-less; the proxy matches `/x`, `/en/x`, and `/es/x` against
// them and re-prefixes the destination for Spanish.

export type LegacyRedirect = {
  to: string;
  /** true -> 308 (SEO-consolidating), false -> 307 (convenience only). */
  permanent: boolean;
};

/** Legacy static-site pages, retired routes, drawer-only URLs, and re-slugged products. */
export const LEGACY_REDIRECTS: Record<string, LegacyRedirect> = {
  // Pages retired 2026-08-01 (auctions + the two aspirational legal pages).
  '/auctions': { to: '/shop', permanent: true },
  '/auction-terms': { to: '/terms', permanent: true },
  '/vendor-terms': { to: '/terms', permanent: true },

  // Short spoken/social alias for the live-prices page (2026-09-06). 307 on
  // purpose: /live is a convenience, /spot-prices is the canonical URL.
  '/live': { to: '/spot-prices', permanent: false },

  // Print Station (Admin → Buy Receipts). Its desktop shortcut carries Chrome
  // switches, and Windows keeps only 259 characters of a shortcut target, so
  // the shortcut opens a short address (2026-10-03; `stationShortcutTarget` in
  // lib/buy-receipts.ts). The second line is the address the owner's FIRST
  // shortcut ended up with: the pasted text was 260 characters and Windows
  // dropped the final "n". Keeping it means that shortcut works as it is.
  '/admin/station': { to: '/admin/buy-receipts/station', permanent: false },
  '/admin/buy-receipts/statio': { to: '/admin/buy-receipts/station', permanent: false },

  // Cart / saved items are drawers, not pages — keep habitual URLs off 404.
  '/cart': { to: '/shop', permanent: false },
  '/wishlist': { to: '/shop', permanent: false },
  '/saved': { to: '/shop', permanent: false },
  '/account/saved': { to: '/shop', permanent: false },

  // Legacy static-site URLs (the pre-Next.js site). Still indexed/linked, so
  // these carry real link equity.
  '/index.html': { to: '/', permanent: true },
  '/shop.html': { to: '/shop', permanent: true },
  '/about.html': { to: '/about', permanent: true },
  '/contact.html': { to: '/contact', permanent: true },
  '/free-evaluation.html': { to: '/free-evaluation', permanent: true },
  // The old static site's "process" page became the free-evaluation page.
  // netlify.toml carried /process.html -> /free-evaluation for years, but the
  // proxy rewrite (header comment above) meant only the /es/ twin ever
  // reached it — the English URL 404'd in production (found 2026-09-11).
  '/process.html': { to: '/free-evaluation', permanent: true },
  '/estate-jewelry.html': { to: '/estate-jewelry', permanent: true },
  '/gold-services.html': { to: '/gold-services', permanent: true },
  '/silver-services.html': { to: '/silver-services', permanent: true },
  '/bullion.html': { to: '/bullion', permanent: true },
  '/faq.html': { to: '/faq', permanent: true },
  '/privacy.html': { to: '/privacy', permanent: true },
  '/estate-services.html': { to: '/estate-services', permanent: true },

  // Auto-named products re-slugged to keyword URLs. Pairs with
  // supabase/reslug-new-listing-products-2026-07.sql.
  //
  // `new-listing-04` (-> `14k-gold-rope-chain-necklace`) is deliberately
  // ABSENT: the owner deleted that listing, so the destination 404s. A rule
  // pointing at a deleted product is worse than no rule — it turns an honest
  // "gone" into a redirect that dead-ends, and Google treats such hops as soft
  // 404s anyway. Without the rule the URL 404s exactly like every other
  // deleted listing, and the 404 page offers Browse Shop / Go Home.
  //
  // Same applies if any destination below is ever deleted: remove its line
  // rather than re-point it at an unrelated product.
  '/shop/new-listing-01': { to: '/shop/italian-14k-two-tone-cuban-link-ring-station-necklace', permanent: true },
  '/shop/new-listing-02': { to: '/shop/14k-gold-round-box-link-chain-necklace', permanent: true },
  '/shop/new-listing-03': { to: '/shop/10k-gold-monaco-cuban-link-necklace', permanent: true },
  '/shop/new-listing-05': { to: '/shop/10k-gold-rope-chain-necklace', permanent: true },
  '/shop/new-listing-06': { to: '/shop/14k-gold-semi-solid-cuban-link-chain-necklace', permanent: true },
};

/**
 * Resolve a request path to its legacy redirect, normalising locale so
 * `/cart`, `/en/cart`, and `/es/cart` all match the one `/cart` rule.
 * Returns the fully-localised destination, or null when nothing matches.
 */
export function resolveLegacyRedirect(
  pathname: string,
): { destination: string; permanent: boolean } | null {
  const isEs = pathname === '/es' || pathname.startsWith('/es/');
  const bare = isEs ? (pathname.slice(3) || '/') : pathname.replace(/^\/en(?=\/|$)/, '') || '/';
  const rule = LEGACY_REDIRECTS[bare];
  if (!rule) return null;
  // `/es` + `/` would produce `/es/`; the locale root is just `/es`.
  const destination = isEs ? (rule.to === '/' ? '/es' : `/es${rule.to}`) : rule.to;
  return { destination, permanent: rule.permanent };
}

/**
 * The default locale never carries its prefix (`localePrefix: 'as-needed'`),
 * so an EXTERNAL request for `/en` or `/en/...` is a stale URL whose only
 * correct home is the bare path. next-intl answers those with a 307, which
 * Google reads as temporary: it kept 40-odd `/en/...` URLs in Search
 * Console's "Page with redirect" bucket for weeks and recrawled them instead
 * of consolidating (seen 2026-09-07). The proxy sends them with a 308 instead.
 *
 * Returns the bare path (query string is the caller's job), or null when the
 * path is not `/en`-prefixed. `/english-tea` is NOT prefixed; `/en/` is the
 * root.
 */
export function resolveDefaultLocalePrefixRedirect(pathname: string): string | null {
  if (pathname !== '/en' && !pathname.startsWith('/en/')) return null;
  return pathname.slice(3) || '/';
}
