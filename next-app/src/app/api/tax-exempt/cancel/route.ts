import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { findRequestByToken, removeUnreferencedCertificateFile } from '@/lib/tax-exempt-server';

/**
 * POST { token } — the buyer chose "pay with tax instead". A draft is deleted
 * with its file; a pending request is marked cancelled (kept, because the
 * owner already got a text about it — the review page then says so).
 */
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const ip = getClientIp(req);
  if (!(await checkRateLimit(`tax-exempt-cancel:${ip}`, 30, 3600))) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const service = createServiceClient();
  const request = await findRequestByToken(service, String(body?.token ?? ''));
  if (!request) return NextResponse.json({ ok: true });
  if (request.status === 'draft') {
    await service.from('tax_exempt_requests').delete().eq('id', request.id).eq('status', 'draft');
    await removeUnreferencedCertificateFile(service, request.photo_path);
  } else if (request.status === 'pending') {
    await service.from('tax_exempt_requests').update({ status: 'cancelled' }).eq('id', request.id).eq('status', 'pending');
  }
  return NextResponse.json({ ok: true });
}
