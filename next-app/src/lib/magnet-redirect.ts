// `/magnet` — the address printed (as a QR code) on the vehicle magnets
// (2026-10-31). It points at the free-evaluation page with UTM tags so a scan
// can be told apart from other visits.
//
// - 302, not 301/308: the address is printed and may later point somewhere
//   else; browsers cache permanent redirects, a 302 changes for everyone at
//   once. Change MAGNET_DESTINATION and redeploy — the magnets stay valid.
// - proxy.ts matches it before the locale rewrite, like every short link on
//   this platform (see lib/legacy-redirects.ts for why next.config / netlify.toml
//   redirects do not work here), and rewrites it to /api/magnet, which counts
//   the scan (lib/qr-scans.ts, source 'magnet') and answers the 302. The
//   destination is absolute so www, the apex and the legacy .co hosts all end
//   on the canonical origin.
// - `/magnet`, `/magnet/` and any capitalisation (`/Magnet`) match; nothing
//   else does (`/magnets`, `/magnet/x`, `/es/magnet` are untouched).
// - Not a page: it never appears in the sitemap and has no locale twin.
//
// This file is imported by the edge proxy: keep it free of server-only code.

export { shouldCountScan } from './scan-sources';

export const MAGNET_DESTINATION =
  'https://naplesestatejewelry.com/free-evaluation?utm_source=car_magnet&utm_medium=qr&utm_campaign=vehicle_magnets';

/** Internal route the proxy rewrites /magnet to (counts, then 302s). */
export const MAGNET_SCAN_ROUTE = '/api/magnet';

export function isMagnetPath(pathname: string): boolean {
  return /^\/magnet\/?$/i.test(pathname);
}
