import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getVerifiedUser } from '@/lib/auth-claims';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { CertificateUnreadableFileError, readCertificateWithAi } from '@/lib/tax-exempt-ai';
import {
  findRequestByToken,
  newRequestToken,
  removeUnreferencedCertificateFile,
  storeCertificateFile,
  sweepAbandonedDrafts,
} from '@/lib/tax-exempt-server';
import {
  TAX_CERT_MAX_BYTES,
  TAX_EXEMPT_AI_READS_PER_ACCOUNT_DAY,
  TAX_EXEMPT_AI_READS_PER_DAY,
  TAX_EXEMPT_UPLOADS_PER_HOUR,
  TAX_CERT_TYPE_LABELS,
  certificateProblemMessage,
  checkCertificateRead,
  formatCertDate,
  type CertificateChecks,
  type CertificateRead,
} from '@/lib/tax-exempt';

/**
 * Checkout / My Account → the buyer's certificate photo or PDF.
 *
 * Abuse limits (owner, 2026-10-27): 6 uploads an hour per connection, and the
 * AI read itself is capped per signed-in account per day and for the whole
 * site per day (`TAX_EXEMPT_AI_READS_*`). Past an AI cap the upload is kept
 * UNREAD (`unread: true`): no instant refusal, the owner reads the photo.
 *
 * POST (multipart: `certificate`, optional `replaceToken`, `locale`):
 *   1. the AI reads it (`tax-exempt-ai.ts`), when under the caps;
 *   2. the checks run (`checkCertificateRead`): Florida-issued, a resale or
 *      exemption certificate, not expired, readable. Any "no" → 422 with the
 *      plain reason, NOTHING stored and nothing sent to the owner;
 *   3. otherwise the file goes to the private bucket and a DRAFT request row is
 *      made. The browser gets its token and what was read, to show the buyer.
 * The owner hears nothing until the buyer presses "Send for approval" (submit).
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const ip = getClientIp(req);
  if (!(await checkRateLimit(`tax-exempt-upload:${ip}`, TAX_EXEMPT_UPLOADS_PER_HOUR, 3600))) {
    return NextResponse.json({ error: 'Too many uploads. Please text us at (239) 404-8505.' }, { status: 429 });
  }
  const form = await req.formData().catch(() => null);
  const isEs = form?.get('locale') === 'es';
  const file = form?.get('certificate');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: isEs ? 'No recibimos el archivo.' : 'No file was received.' }, { status: 400 });
  }
  if (file.size > TAX_CERT_MAX_BYTES) {
    return NextResponse.json({ error: isEs ? 'El archivo es muy grande (máximo 5 MB).' : 'That file is too large (5 MB at most).' }, { status: 413 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const user = await getVerifiedUser(await createClient()).catch(() => null);

  // AI caps (owner, 2026-10-27): per account per day, then site-wide per day.
  // Short-circuit order matters: a capped account does not use up the site's
  // allowance. A limiter outage counts as "capped" (no AI), never as an error.
  const aiAllowed = (!user || await checkRateLimit(`tax-exempt-ai-user:${user.id}`, TAX_EXEMPT_AI_READS_PER_ACCOUNT_DAY, 86_400))
    && await checkRateLimit('tax-exempt-ai-site', TAX_EXEMPT_AI_READS_PER_DAY, 86_400);

  let read: CertificateRead | null = null;
  let checks: CertificateChecks | null = null;
  if (aiAllowed) {
    try {
      read = await readCertificateWithAi(buffer);
    } catch (error) {
      if (!(error instanceof CertificateUnreadableFileError)) {
        console.error('[tax-exempt] buyer read failed', error instanceof Error ? error.message : error);
        return NextResponse.json(
          { error: isEs ? 'No pudimos leer el certificado ahora mismo. Intente de nuevo en un momento.' : "We couldn't read the certificate just now. Please try again in a moment." },
          { status: 502 },
        );
      }
      read = null;
    }
    checks = read ? checkCertificateRead(read) : null;
    if (!read || !checks || !checks.ok) {
      const problem = checks?.problem ?? 'unreadable';
      return NextResponse.json(
        { problem, error: certificateProblemMessage(problem, { issuingState: read?.issuingState ?? null }, isEs) },
        { status: 422 },
      );
    }
  }

  const service = createServiceClient();
  // Unread uploads still have to be a real picture or PDF: storing re-encodes
  // (and so rejects) anything else.
  const stored = await storeCertificateFile(service, buffer, 'requests');
  if ('error' in stored) return NextResponse.json({ error: stored.error }, { status: stored.status });

  const token = newRequestToken();
  const { error } = await service.from('tax_exempt_requests').insert({
    token,
    status: 'draft',
    locale: isEs ? 'es' : 'en',
    photo_path: stored.path,
    photo_mime: stored.mime,
    ai_read: read,
    ai_checks: checks,
    cert_type: read?.certType === 'resale' || read?.certType === 'exemption' ? read.certType : null,
    business_name: read?.businessName ?? null,
    cert_number: read?.certNumber ?? null,
    expires_on: read?.expiresOn ?? null,
    user_id: user?.id ?? null,
  });
  if (error) {
    console.error('[tax-exempt] draft insert failed', error.message);
    await service.storage.from('tax-certificates').remove([stored.path]);
    return NextResponse.json({ error: isEs ? 'No se pudo guardar. Intente de nuevo.' : 'Could not save it. Please try again.' }, { status: 500 });
  }

  // A retake replaces the earlier draft (and its file).
  const replaceToken = String(form?.get('replaceToken') ?? '');
  if (replaceToken) {
    const previous = await findRequestByToken(service, replaceToken);
    if (previous?.status === 'draft') {
      await service.from('tax_exempt_requests').delete().eq('id', previous.id).eq('status', 'draft');
      await removeUnreferencedCertificateFile(service, previous.photo_path);
    }
  }
  await sweepAbandonedDrafts(service).catch(() => undefined);

  // Over the AI cap: received, unread — the owner reads the photo.
  if (!read) return NextResponse.json({ token, read: null, checks: null, unread: true });

  const type = read.certType === 'resale' || read.certType === 'exemption' ? TAX_CERT_TYPE_LABELS[read.certType] : null;
  return NextResponse.json({
    token,
    read: {
      businessName: read.businessName,
      typeLabel: type ? (isEs ? type.es : `Florida ${type.long}`) : null,
      certNumber: read.certNumber,
      validThrough: formatCertDate(read.expiresOn),
    },
    checks,
  });
}
