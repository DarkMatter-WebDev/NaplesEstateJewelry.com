import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { clearScans } from '@/lib/qr-scans';
import { SCAN_SOURCE_KEYS, type ScanSource } from '@/lib/scan-sources';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ source: string }>;
};

// Admin → Insights "Clear" (2026-10-31): deletes the saved scans of ONE code.
export async function DELETE(_req: Request, { params }: RouteContext) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { source } = await params;
  if (!(SCAN_SOURCE_KEYS as string[]).includes(source)) {
    return NextResponse.json({ error: 'Unknown code.' }, { status: 400 });
  }

  const result = await clearScans(source as ScanSource);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true, removed: result.removed });
}
