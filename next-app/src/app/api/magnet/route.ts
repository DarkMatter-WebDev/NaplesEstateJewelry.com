import { NextResponse, type NextRequest } from 'next/server';
import { MAGNET_DESTINATION, shouldCountScan } from '@/lib/magnet-redirect';
import { recordScan } from '@/lib/qr-scans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `/magnet` (vehicle-magnet QR) lands here through the proxy rewrite: count the
 * scan (source 'magnet'), then 302 to the tagged free-evaluation page
 * (lib/magnet-redirect.ts).
 *
 * - HEAD (e.g. `curl -I`) answers the same 302 and is never counted.
 * - `no-store` on the browser AND Netlify's CDN: a cached 302 would skip this
 *   function, and every scan after the first would go uncounted.
 * - The counter never blocks or breaks the redirect (lib/qr-scans.ts).
 */
function magnetRedirect() {
  const response = NextResponse.redirect(MAGNET_DESTINATION, 302);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Netlify-CDN-Cache-Control', 'no-store');
  return response;
}

export async function GET(request: NextRequest) {
  if (shouldCountScan(request.headers.get('user-agent'))) await recordScan('magnet');
  return magnetRedirect();
}

export function HEAD() {
  return magnetRedirect();
}
