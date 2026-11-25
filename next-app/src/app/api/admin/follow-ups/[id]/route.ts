import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import type { EmailCopyResponse } from '@/lib/email-copies';
import { parseSocialScheduleInput } from '@/lib/social-queue-schedule';
import {
  previewFollowUp,
  rescheduleFollowUp,
  sendFollowUp,
  skipFollowUp,
  unskipFollowUp,
} from '@/lib/follow-ups-server';
import { normalizeOwnerOpening } from '@/lib/follow-up-opening';
import { setOpening, writeOpeningNow } from '@/lib/follow-up-opening-server';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f-]{36}$/i;

/** The email: its saved copy once sent, otherwise how it would look if sent now (the viewer's shape). */
export async function GET(_req: Request, { params }: Params) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Unknown email.' }, { status: 404 });
  try {
    const preview = await previewFollowUp(createServiceClient(), id);
    if (!preview) return NextResponse.json({ error: 'Unknown email.' }, { status: 404 });
    const body: EmailCopyResponse = { html: preview.html, text: preview.text, rebuilt: false, subject: preview.subject };
    return NextResponse.json({ ...body, saved: preview.saved });
  } catch (loadError) {
    return NextResponse.json({ error: loadError instanceof Error ? loadError.message : 'Could not build the email.' }, { status: 500 });
  }
}

/** Send now · Change time · Skip · Put back · the opening line: Edit (own words) · Rewrite (AI again) · Standard wording. */
export async function POST(req: Request, { params }: Params) {
  const { user, error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Unknown email.' }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { action?: string; sendAt?: string; text?: string } | null;
  const service = createServiceClient();
  const byEmail = user.email ?? null;

  try {
    switch (body?.action) {
      case 'send_now': {
        const outcome = await sendFollowUp(service, id, { manual: true, byEmail });
        return NextResponse.json(outcome, { status: outcome.ok ? 200 : 409 });
      }
      case 'reschedule': {
        // `sendAt` is an Eastern "YYYY-MM-DDTHH:MM" from the picker.
        const when = typeof body.sendAt === 'string' ? parseSocialScheduleInput(body.sendAt) : null;
        if (!when) return NextResponse.json({ error: 'Pick a date and time.' }, { status: 400 });
        if (when.getTime() < Date.now() - 60_000) return NextResponse.json({ error: 'That time has already passed. Use Send now instead.' }, { status: 400 });
        const failure = await rescheduleFollowUp(service, id, when);
        return failure ? NextResponse.json({ error: failure }, { status: 409 }) : NextResponse.json({ ok: true, sendAt: when.toISOString() });
      }
      case 'skip': {
        const failure = await skipFollowUp(service, id, byEmail);
        return failure ? NextResponse.json({ error: failure }, { status: 409 }) : NextResponse.json({ ok: true });
      }
      case 'unskip': {
        const failure = await unskipFollowUp(service, id);
        return failure ? NextResponse.json({ error: failure }, { status: 409 }) : NextResponse.json({ ok: true });
      }
      case 'set_opening': {
        const opening = normalizeOwnerOpening(body.text);
        if ('error' in opening) return NextResponse.json({ error: opening.error }, { status: 400 });
        const failure = await setOpening(service, id, { source: 'owner', text: opening.value });
        return failure ? NextResponse.json({ error: failure }, { status: 409 }) : NextResponse.json({ ok: true });
      }
      case 'standard_opening': {
        const failure = await setOpening(service, id, { source: 'standard' });
        return failure ? NextResponse.json({ error: failure }, { status: 409 }) : NextResponse.json({ ok: true });
      }
      case 'rewrite_opening': {
        const written = await writeOpeningNow(service, id);
        return written.ok ? NextResponse.json({ ok: true, opening: written.opening }) : NextResponse.json({ error: written.error }, { status: 409 });
      }
      default:
        return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }
  } catch (actionError) {
    return NextResponse.json({ error: actionError instanceof Error ? actionError.message : 'Something went wrong.' }, { status: 500 });
  }
}
