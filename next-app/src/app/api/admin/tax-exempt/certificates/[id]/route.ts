import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { findCertificate, removeUnreferencedCertificateFile, updateCertificateDetails } from '@/lib/tax-exempt-server';
import { isAdminCertificatePath, normalizeCertificateEdit } from '@/lib/tax-exempt';

/**
 * POST { action } on one certificate (Admin → Tax Exempt):
 *   - `revoke`  — withdrawn: no longer offered in Instant Sale or applied at
 *                 checkout. The row, the photo and every order that used it stay.
 *   - `restore` — undo a revoke.
 *   - `update`  — "Add photo & details" (owner, 2026-11-09): the photo taken in
 *                 the window (already stored by `api/admin/tax-exempt/read`) and
 *                 the details → the certificate AND the Tax exemption card of
 *                 every order that used it. Tax amounts never change.
 *   - `discard` — the window was closed without saving: remove its upload,
 *                 only if nothing points at it.
 * Nothing is ever deleted here: certificates are the store's tax records.
 */
export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

export async function POST(req: Request, context: Context) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Certificate not found.' }, { status: 404 });
  const body = await req.json().catch(() => null);
  const action = body?.action;
  const service = createServiceClient();

  if (action === 'update') {
    const current = await findCertificate(service, id);
    if (!current) return NextResponse.json({ error: 'Certificate not found.' }, { status: 404 });
    const result = normalizeCertificateEdit(body, current);
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
    const saved = await updateCertificateDetails(service, id, result.value, admin.user.email ?? null);
    if ('error' in saved) return NextResponse.json({ error: saved.error }, { status: 500 });
    return NextResponse.json({ certificate: { id: saved.certificate.id }, ordersUpdated: saved.ordersUpdated, orderErrors: saved.orderErrors });
  }

  if (action === 'discard') {
    const path = String(body?.path ?? '');
    if (isAdminCertificatePath(path)) await removeUnreferencedCertificateFile(service, path);
    return NextResponse.json({ ok: true });
  }

  if (action !== 'revoke' && action !== 'restore') return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  const { data, error } = await service
    .from('tax_exempt_certificates')
    .update({ status: action === 'revoke' ? 'revoked' : 'approved' })
    .eq('id', id)
    .select('id, status')
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: 'Could not update the certificate.' }, { status: 500 });
  return NextResponse.json({ certificate: data });
}
