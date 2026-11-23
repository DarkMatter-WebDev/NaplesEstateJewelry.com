import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { translateEmailToSpanish } from '@/lib/ai-translate';

/**
 * POST { subject, html } → { subjectEs, htmlEs } — the "Translate to Spanish"
 * button on Compose Campaign (2026-11-22). Only the visible words are
 * translated; tags, links and images are kept. The owner corrects the result
 * in the Spanish boxes before sending. Nothing is saved or sent here.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const subject = typeof body?.subject === 'string' ? body.subject : '';
  const html = typeof body?.html === 'string' ? body.html : '';
  if (!subject.trim() && !html.trim()) {
    return NextResponse.json({ error: 'Write the English subject and body first.' }, { status: 400 });
  }

  try {
    const translated = await translateEmailToSpanish({ subject, html });
    return NextResponse.json({ subjectEs: translated.subject_es, htmlEs: translated.html_es });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not translate the email.' }, { status: 502 });
  }
}
