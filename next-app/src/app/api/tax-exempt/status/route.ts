import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { findCertificate, findRequestByToken, requestIsLive, storeApprovalWindow } from '@/lib/tax-exempt-server';
import { exemptShortTag, requestRefLabel } from '@/lib/tax-exempt';

/**
 * GET ?token=… — where the buyer's request stands. Checkout polls this every
 * few seconds while it waits, so the total can drop the moment the owner
 * approves. Read-only; it says nothing that the token holder did not send.
 * An approval past its 24 hours reads as `expired`.
 */
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const ip = getClientIp(req);
  if (!(await checkRateLimit(`tax-exempt-status:${ip}`, 900, 3600))) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  }
  const url = new URL(req.url);
  const isEs = url.searchParams.get('locale') === 'es';
  const service = createServiceClient();
  const request = await findRequestByToken(service, url.searchParams.get('token') ?? '');
  if (!request) return NextResponse.json({ status: 'missing' }, { status: 404 });

  const live = requestIsLive(request);
  const status = request.status === 'approved' && !live ? 'expired' : request.status;
  const certificate = live && request.certificate_id ? await findCertificate(service, request.certificate_id) : null;
  const window = status === 'pending' ? await storeApprovalWindow(new Date(), isEs) : null;
  return NextResponse.json({
    status,
    ref: requestRefLabel(request.ref),
    email: request.customer_email,
    businessName: certificate?.business_name ?? request.business_name,
    tag: exemptShortTag({ certType: certificate?.cert_type ?? request.cert_type, certNumber: certificate?.cert_number ?? request.cert_number }),
    declineReason: status === 'declined' ? request.decline_reason : null,
    submittedAt: request.submitted_at,
    approvedUntil: live ? request.approved_until : null,
    storeOpen: window?.open ?? null,
    opensLabel: window?.opensLabel ?? null,
  });
}
