import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { listCertificatesForPicker } from '@/lib/tax-exempt-server';
import { certificateSummary, hasCopyOnFile } from '@/lib/tax-exempt';

/** GET ?q=… — Instant Sale's "Certificate on file" picker: approved, saved for reuse, still usable. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const q = new URL(req.url).searchParams.get('q') ?? '';
  const rows = await listCertificatesForPicker(createServiceClient(), q.slice(0, 60));
  return NextResponse.json({
    certificates: rows.map((row) => ({
      id: row.id,
      summary: certificateSummary(row),
      customer: [row.customer_name, row.customer_email].filter(Boolean).join(' · ') || null,
      hasPhoto: Boolean(row.photo_path),
      // A photo or a filed paper copy. Without one the sale box asks for this sale's FL authorization number.
      hasCopy: hasCopyOnFile(row),
      physicalCopySeen: row.physical_copy_seen,
    })),
  });
}
