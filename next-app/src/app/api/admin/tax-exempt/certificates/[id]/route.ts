import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * POST { action } on one certificate (Admin → Tax Exempt):
 *   - `revoke`  — withdrawn: no longer offered in Instant Sale or applied at
 *                 checkout. The row, the photo and every order that used it stay.
 *   - `restore` — undo a revoke.
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
  if (action !== 'revoke' && action !== 'restore') return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  const { data, error } = await createServiceClient()
    .from('tax_exempt_certificates')
    .update({ status: action === 'revoke' ? 'revoked' : 'approved' })
    .eq('id', id)
    .select('id, status')
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: 'Could not update the certificate.' }, { status: 500 });
  return NextResponse.json({ certificate: data });
}
