import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { isValidEmail, normalizeEmail } from '@/lib/marketing';
import { loadPersonDetail, resumePerson, sendPersonNow, stopPerson } from '@/lib/follow-ups-server';

export const runtime = 'nodejs';

/** People → Open: their visits and every follow-up. */
export async function GET(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;
  const email = normalizeEmail(new URL(req.url).searchParams.get('email'));
  if (!isValidEmail(email)) return NextResponse.json({ error: 'Unknown person.' }, { status: 400 });
  try {
    return NextResponse.json(await loadPersonDetail(createServiceClient(), email));
  } catch (loadError) {
    return NextResponse.json({ error: loadError instanceof Error ? loadError.message : 'Could not load this person.' }, { status: 500 });
  }
}

/** Send a thank-you now · Stop all follow-ups · Resume. */
export async function POST(req: Request) {
  const { user, error } = await requireAdmin();
  if (error) return error;
  const body = (await req.json().catch(() => null)) as { email?: string; action?: string } | null;
  const email = normalizeEmail(body?.email);
  if (!isValidEmail(email)) return NextResponse.json({ error: 'Unknown person.' }, { status: 400 });
  const service = createServiceClient();
  try {
    if (body?.action === 'send_now') {
      const outcome = await sendPersonNow(service, email, user.email ?? null);
      return NextResponse.json(outcome, { status: outcome.ok ? 200 : 409 });
    }
    if (body?.action === 'stop') {
      const failure = await stopPerson(service, email, user.email ?? null);
      return failure ? NextResponse.json({ error: failure }, { status: 500 }) : NextResponse.json({ ok: true });
    }
    if (body?.action === 'resume') {
      const failure = await resumePerson(service, email);
      return failure ? NextResponse.json({ error: failure }, { status: 500 }) : NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (actionError) {
    return NextResponse.json({ error: actionError instanceof Error ? actionError.message : 'Something went wrong.' }, { status: 500 });
  }
}
