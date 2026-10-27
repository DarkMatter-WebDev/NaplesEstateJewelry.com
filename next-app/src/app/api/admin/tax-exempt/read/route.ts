import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { CertificateUnreadableFileError, readCertificateWithAi } from '@/lib/tax-exempt-ai';
import { removeUnreferencedCertificateFile, storeCertificateFile } from '@/lib/tax-exempt-server';
import { TAX_CERT_MAX_BYTES, checkCertificateRead, isAdminCertificatePath } from '@/lib/tax-exempt';

/**
 * Instant Sale → "Tax-exempt sale" → Take photo / Choose photo or PDF (owner,
 * 2026-10-27: "use AI to analyze the picture of the cert and fill in the
 * details in the form similar to how we analyze the pic of IDs").
 *
 * POST (multipart: `certificate`, optional `replacePath`): stores the file in
 * the PRIVATE bucket (`certificates/<uuid>`), then the AI reads it. Returns the
 * path (the form sends it with the sale) and what was read + the checks. A
 * failed read still returns the path — the owner types the details instead.
 * A retake removes the previous upload unless a certificate already uses it.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;

  const form = await req.formData().catch(() => null);
  const file = form?.get('certificate');
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'No file was received.' }, { status: 400 });
  if (file.size > TAX_CERT_MAX_BYTES) return NextResponse.json({ error: 'That file is too large (5 MB at most). Take a photo instead.' }, { status: 413 });
  const buffer = Buffer.from(await file.arrayBuffer());

  const service = createServiceClient();
  const stored = await storeCertificateFile(service, buffer, 'certificates');
  if ('error' in stored) return NextResponse.json({ error: stored.error }, { status: stored.status });

  const replacePath = String(form?.get('replacePath') ?? '');
  if (replacePath && replacePath !== stored.path && isAdminCertificatePath(replacePath)) {
    await removeUnreferencedCertificateFile(service, replacePath);
  }

  try {
    const read = await readCertificateWithAi(buffer);
    return NextResponse.json({ path: stored.path, mime: stored.mime, read, checks: checkCertificateRead(read) });
  } catch (error) {
    if (!(error instanceof CertificateUnreadableFileError)) {
      // The provider's own message only — never anything from the document.
      console.error('[tax-exempt] admin read failed', error instanceof Error ? error.message : error);
    }
    return NextResponse.json({ path: stored.path, mime: stored.mime, read: null, checks: null, note: 'The AI could not read it. Type the details in.' });
  }
}
