import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { loadFollowUpSettings, previewTemplate } from '@/lib/follow-ups-server';
import { findUnknownToken, FOLLOW_UP_BODY_MAX, FOLLOW_UP_SUBJECT_MAX, templateFor } from '@/lib/follow-ups';

export const runtime = 'nodejs';

/** A series card's Preview button: the SAVED wording for ?audience=&step=&language=, with made-up details. */
export async function GET(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;
  const query = new URL(req.url).searchParams;
  const audience = query.get('audience') === 'buyer' ? 'buyer' : query.get('audience') === 'seller' ? 'seller' : null;
  const step = query.get('step') === '2' ? 2 : 1;
  const language = query.get('language') === 'es' ? 'es' : 'en';
  if (!audience) return NextResponse.json({ error: 'Unknown email.' }, { status: 400 });
  const { settings } = await loadFollowUpSettings(createServiceClient());
  const rendered = await previewTemplate(templateFor(settings, audience, step, language), audience, language);
  return NextResponse.json({ html: rendered.html, text: rendered.text, subject: rendered.subject, rebuilt: false });
}

/** Edit emails → Preview: the typed wording with made-up details (Margaret / Linda, "yesterday"). */
export async function POST(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;
  const body = (await req.json().catch(() => null)) as { audience?: string; language?: string; subject?: string; body?: string } | null;
  const audience = body?.audience === 'buyer' ? 'buyer' : body?.audience === 'seller' ? 'seller' : null;
  const language = body?.language === 'es' ? 'es' : 'en';
  const subject = String(body?.subject ?? '').trim().slice(0, FOLLOW_UP_SUBJECT_MAX);
  const text = String(body?.body ?? '').trim().slice(0, FOLLOW_UP_BODY_MAX);
  if (!audience) return NextResponse.json({ error: 'Unknown email.' }, { status: 400 });
  if (!subject || !text) return NextResponse.json({ error: 'Type a subject and the email first.' }, { status: 400 });
  const unknown = findUnknownToken(`${subject}\n${text}`);
  if (unknown) return NextResponse.json({ error: `${unknown} is not a fill-in word.` }, { status: 400 });
  const rendered = await previewTemplate({ subject, body: text }, audience, language);
  return NextResponse.json({ html: rendered.html, text: rendered.text, subject: rendered.subject, rebuilt: false });
}
