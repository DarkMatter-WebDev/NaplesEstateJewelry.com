// Every counted QR code / short link (2026-10-31) — the one list the counter,
// the page ping and Admin → Insights all read. Rows live in `qr_scans`
// (supabase/qr-scans-2026-10.sql): time + source only, never a visitor detail.
//
// To count another printed code: add it here (a lowercase key), then either
// count it server side like /magnet (lib/qr-scans.ts → recordScan) or render
// <ScanBeacon source="…" /> on its page and add the key to PAGE_SCAN_SOURCES.
//
// Imported by the edge proxy (via magnet-redirect.ts) and by client code:
// keep it free of server-only imports.

export const SCAN_SOURCES = {
  magnet: { label: 'Car magnets', path: '/magnet' },
  card: { label: "Chris's business card", path: '/card' },
  kittcard: { label: "Kitt's business card", path: '/kittcard' },
} as const;

export type ScanSource = keyof typeof SCAN_SOURCES;
export const SCAN_SOURCE_KEYS = Object.keys(SCAN_SOURCES) as ScanSource[];

/** Sources a PAGE may report through POST /api/scan. /magnet counts itself server side. */
export const PAGE_SCAN_SOURCES = ['card', 'kittcard'] as const satisfies readonly ScanSource[];
export type PageScanSource = (typeof PAGE_SCAN_SOURCES)[number];

export function isPageScanSource(value: unknown): value is PageScanSource {
  return typeof value === 'string' && (PAGE_SCAN_SOURCES as readonly string[]).includes(value);
}

// Scanners, link unfurlers and our own test tools follow these links too; none
// of them is a person holding a phone. An empty user agent is not counted.
const NOT_A_PERSON =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|slack|skype|curl|wget|python|httpclient|axios|node-fetch|headless|lighthouse|pagespeed/i;

/** Whether a request should be counted as a person's scan / visit. */
export function shouldCountScan(userAgent: string | null | undefined): boolean {
  if (!userAgent || !userAgent.trim()) return false;
  return !NOT_A_PERSON.test(userAgent);
}
