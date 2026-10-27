import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import {
  emailBuyerDecision,
  findRequestById,
  insertCertificate,
  REQUEST_COLUMNS,
  type TaxExemptRequestRow,
} from '@/lib/tax-exempt-server';
import { TAX_EXEMPT_APPROVAL_HOURS, TAX_EXEMPT_DECLINE_MAX, cleanCertNumber } from '@/lib/tax-exempt';

/**
 * The owner's Approve / Decline on a website buyer's certificate (the page the
 * text links to, `/admin/tax-exempt/[id]`).
 *
 * POST { action: 'approve', flAuthNumber?, certNumber?, businessName? }:
 *   stores the certificate (source `website`; saved to the buyer's account when
 *   they chose it), marks the request approved for 24 hours, and emails the
 *   buyer the link back to checkout. The buyer's open checkout picks it up on
 *   its next status check and drops the tax.
 * POST { action: 'decline', reason }: the reason shows on the buyer's checkout
 *   and goes out by email.
 * Only a PENDING request can be decided, so a double tap does nothing twice.
 */
export const runtime = 'nodejs';
export const maxDuration = 30;

type Context = { params: Promise<{ id: string }> };

export async function POST(req: Request, context: Context) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { id } = await context.params;
  const service = createServiceClient();
  const request = await findRequestById(service, id);
  if (!request) return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
  if (request.status !== 'pending') {
    return NextResponse.json({ error: request.status === 'cancelled' ? 'The buyer cancelled this request.' : `This request is already ${request.status}.` }, { status: 409 });
  }
  const body = await req.json().catch(() => null);
  const now = new Date();

  if (body?.action === 'decline') {
    const reason = String(body.reason ?? '').replace(/\s+/g, ' ').trim().slice(0, TAX_EXEMPT_DECLINE_MAX) || null;
    const { data, error } = await service
      .from('tax_exempt_requests')
      .update({ status: 'declined', decline_reason: reason, decided_at: now.toISOString(), decided_by_email: admin.user.email ?? null })
      .eq('id', request.id)
      .eq('status', 'pending')
      .select(REQUEST_COLUMNS)
      .maybeSingle();
    if (error || !data) return NextResponse.json({ error: 'Could not decline it. Try again.' }, { status: 500 });
    const declined = data as unknown as TaxExemptRequestRow;
    await emailBuyerDecision(service, declined, null);
    return NextResponse.json({ request: { id: declined.id, status: declined.status } });
  }

  if (body?.action !== 'approve') return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });

  // The owner may correct what the AI read before approving.
  const typedNumber = typeof body.certNumber === 'string' && body.certNumber.trim() ? cleanCertNumber(body.certNumber) : null;
  if (typeof body.certNumber === 'string' && body.certNumber.trim() && !typedNumber) {
    return NextResponse.json({ error: 'The certificate number does not look right.' }, { status: 400 });
  }
  const typedName = typeof body.businessName === 'string' ? body.businessName.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
  const certificate = await insertCertificate(service, {
    certType: request.cert_type,
    businessName: typedName || request.business_name,
    certNumber: typedNumber ?? request.cert_number,
    expiresOn: request.expires_on,
    photoPath: request.photo_path,
    photoMime: request.photo_mime,
    physicalCopySeen: false,
    flAuthNumber: typeof body.flAuthNumber === 'string' ? body.flAuthNumber.replace(/\s+/g, ' ').trim().slice(0, 40) || null : null,
    source: 'website',
    requestId: request.id,
    customer: { name: request.customer_name, email: request.customer_email, phone: request.customer_phone },
    userId: request.save_to_account ? request.user_id : null,
    savedForReuse: true,
    approvedBy: admin.user.email ?? null,
  });
  if ('error' in certificate) return NextResponse.json({ error: certificate.error }, { status: 500 });

  const { data, error } = await service
    .from('tax_exempt_requests')
    .update({
      status: 'approved',
      certificate_id: certificate.id,
      decided_at: now.toISOString(),
      decided_by_email: admin.user.email ?? null,
      approved_until: new Date(now.getTime() + TAX_EXEMPT_APPROVAL_HOURS * 3_600_000).toISOString(),
    })
    .eq('id', request.id)
    .eq('status', 'pending')
    .select(REQUEST_COLUMNS)
    .maybeSingle();
  if (error || !data) {
    // Someone else decided it in the meantime: take the extra certificate back out.
    await service.from('tax_exempt_certificates').delete().eq('id', certificate.id);
    return NextResponse.json({ error: 'Could not approve it — it may have been decided already. Reload the page.' }, { status: 409 });
  }
  const approved = data as unknown as TaxExemptRequestRow;
  await emailBuyerDecision(service, approved, certificate);
  return NextResponse.json({ request: { id: approved.id, status: approved.status }, certificateId: certificate.id });
}
