import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import {
  getMarketingSettings,
  normalizeSenderProfile,
  sendDirectMarketingCampaign,
  type MarketingRecipient,
} from '@/lib/marketing';

export async function POST(req: Request) {
  const { user, error } = await requireAdmin();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const subject = typeof body?.subject === 'string' ? body.subject.trim() : '';
  const html = typeof body?.html === 'string' ? body.html.trim() : '';
  const senderProfile = normalizeSenderProfile(body?.senderProfile);
  // The Spanish version (2026-11-22): when filled in, the test sends it too, as a second email.
  const subjectEs = typeof body?.subjectEs === 'string' ? body.subjectEs.trim() : '';
  const htmlEs = typeof body?.htmlEs === 'string' ? body.htmlEs.trim() : '';
  const to = user.email;

  if (!to) return NextResponse.json({ error: 'Admin email is unavailable.' }, { status: 400 });
  if (!subject) return NextResponse.json({ error: 'Subject is required.' }, { status: 400 });
  if (!html) return NextResponse.json({ error: 'Email HTML/body is required.' }, { status: 400 });

  try {
    const settings = await getMarketingSettings();
    if (!settings.mailingAddress) {
      return NextResponse.json({ error: 'Set a physical mailing address in Admin Settings before sending a test.' }, { status: 400 });
    }
    const recipient: MarketingRecipient = {
      email: to,
      name: null,
      source: 'account',
      subscriberSource: null,
      unsubscribeToken: null,
      subscribedAt: null,
      accountCreatedAt: null,
      userId: user.id,
      subscriberEmail: null,
    };
    const result = await sendDirectMarketingCampaign({
      campaignId: 'test',
      subject: `[Test] ${subject}`,
      html,
      recipients: [recipient],
      senderProfile,
      settings,
    });
    let sent = result.sent;
    let failed = result.failed;
    let spanishSent = false;
    if (subjectEs && htmlEs) {
      const spanishResult = await sendDirectMarketingCampaign({
        campaignId: 'test',
        subject: `[Test] ${subject}`,
        html,
        recipients: [{ ...recipient, language: 'es' }],
        senderProfile,
        settings,
        spanish: { subject: `[Prueba] ${subjectEs}`, html: htmlEs },
      });
      sent += spanishResult.sent;
      failed += spanishResult.failed;
      spanishSent = spanishResult.sent === 1;
    }
    return NextResponse.json({ success: failed === 0 && sent > 0, sent, failed, spanishSent });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not send test email.' },
      { status: 500 }
    );
  }
}
