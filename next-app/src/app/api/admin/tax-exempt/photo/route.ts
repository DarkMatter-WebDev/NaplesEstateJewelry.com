import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { signedCertificateUrl } from '@/lib/tax-exempt-server';
import { isAdminCertificatePath, isRequestCertificatePath } from '@/lib/tax-exempt';

/**
 * GET ?path=certificates/<uuid>.webp — "View certificate": a redirect to a
 * signed link that works for five minutes. Admins only; only paths inside the
 * private tax-certificates bucket's two folders.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const path = new URL(req.url).searchParams.get('path') ?? '';
  if (!isAdminCertificatePath(path) && !isRequestCertificatePath(path)) {
    return NextResponse.json({ error: 'Not a certificate.' }, { status: 404 });
  }
  const url = await signedCertificateUrl(createServiceClient(), path);
  if (!url) return NextResponse.json({ error: 'The certificate file could not be opened.' }, { status: 404 });
  return NextResponse.redirect(url, { status: 302, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
