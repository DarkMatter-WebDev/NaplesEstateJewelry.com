import type { NextRequest } from 'next/server';
import { isPageScanSource, shouldCountScan } from '@/lib/scan-sources';
import { recordScan } from '@/lib/qr-scans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/scan — the one-line ping a counted PAGE sends when it opens
 * (components/ScanBeacon.tsx; today /card and /kittcard). Body: `{"source":"card"}`
 * as text (navigator.sendBeacon). Only PAGE_SCAN_SOURCES are accepted —
 * /magnet counts itself server side, so a page can never inflate it.
 * Always answers 204: the ping is fire-and-forget and must never show an error.
 */
export async function POST(request: NextRequest) {
  try {
    const raw = (await request.text()).slice(0, 200);
    const source = (JSON.parse(raw) as { source?: unknown }).source;
    if (isPageScanSource(source) && shouldCountScan(request.headers.get('user-agent'))) {
      await recordScan(source);
    }
  } catch {
    // Malformed body: nothing to count.
  }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
