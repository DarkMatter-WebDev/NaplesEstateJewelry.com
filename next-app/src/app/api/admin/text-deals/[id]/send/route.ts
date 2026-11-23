import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { normalizeUsPhone } from '@/lib/subscriber-phone';
import { twilioConfig } from '@/lib/text-alerts/config';
import { sendDealTest, startDealSend } from '@/lib/text-alerts/deals';

/**
 * POST {} → queue + first send pass to every confirmed number.
 * POST { test: true } → one picture message to the owner's cell (TWILIO_FORWARD_TO), nothing queued.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

export async function POST(req: Request, context: Context) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await context.params;
  const body = (await req.json().catch(() => ({}))) as { test?: boolean; to?: string; language?: string };
  try {
    if (body.test) {
      const config = twilioConfig();
      const to = normalizeUsPhone(body.to) ?? config?.forwardTo;
      if (!to) return NextResponse.json({ error: 'Twilio is not configured yet.' }, { status: 503 });
      // "Test in Español" (2026-11-22): the Spanish version to the owner's cell.
      const language = body.language === 'es' ? 'es' : 'en';
      const sent = await sendDealTest(id, to, language);
      return NextResponse.json({ test: true, to, sid: sent.sid, language });
    }
    const result = await startDealSend(id);
    if (result.notConfigured) {
      return NextResponse.json({ error: 'Twilio is not configured yet; the deal is queued and the sweep will send it once it is.' }, { status: 503 });
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not send the deal.' }, { status: 500 });
  }
}
