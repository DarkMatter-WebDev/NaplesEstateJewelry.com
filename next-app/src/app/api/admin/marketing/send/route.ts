import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import {
  buildMarketingAudience,
  countByLanguage,
  getMarketingSettings,
  normalizeSenderProfile,
  senderForProfile,
  sendDirectMarketingCampaign,
  type AudienceScope,
} from '@/lib/marketing';

function normalizeScope(value: unknown): AudienceScope {
  return value === 'subscribers' || value === 'accounts' || value === 'buyers' || value === 'all' ? value : 'all';
}

export async function POST(req: Request) {
  const { user, supabase: adminSupabase, error } = await requireAdmin();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const subject = typeof body?.subject === 'string' ? body.subject.trim() : '';
  const html = typeof body?.html === 'string' ? body.html.trim() : '';
  const scope = normalizeScope(body?.scope);
  const senderProfile = normalizeSenderProfile(body?.senderProfile);
  // The Spanish version (2026-11-22). Both parts or neither: an empty one = Spanish subscribers get the English email (owner "3A").
  const subjectEs = typeof body?.subjectEs === 'string' ? body.subjectEs.trim() : '';
  const htmlEs = typeof body?.htmlEs === 'string' ? body.htmlEs.trim() : '';
  const spanish = subjectEs && htmlEs ? { subject: subjectEs, html: htmlEs } : null;

  if (!subject) return NextResponse.json({ error: 'Subject is required.' }, { status: 400 });
  if (!html) return NextResponse.json({ error: 'Email HTML/body is required.' }, { status: 400 });
  if (html.length > 100000) return NextResponse.json({ error: 'Email body is too long.' }, { status: 400 });
  if (htmlEs.length > 100000) return NextResponse.json({ error: 'The Spanish email body is too long.' }, { status: 400 });
  if (Boolean(subjectEs) !== Boolean(htmlEs)) {
    return NextResponse.json({ error: 'The Spanish version needs both a subject and a body — or leave both empty to send everyone the English email.' }, { status: 400 });
  }

  try {
    const settings = await getMarketingSettings();
    if (!settings.mailingAddress) {
      return NextResponse.json({ error: 'Set a physical mailing address in Admin Settings before sending marketing email.' }, { status: 400 });
    }
    if (settings.transport === 'broadcast') {
      return NextResponse.json({ error: 'Broadcast transport is configured but not implemented for this site yet. Use MARKETING_TRANSPORT=direct.' }, { status: 400 });
    }

    const recipients = await buildMarketingAudience(scope, adminSupabase);
    if (recipients.length === 0) return NextResponse.json({ error: 'No eligible recipients for this audience.' }, { status: 400 });

    const supabase = createServiceClient();
    const sender = senderForProfile(settings, senderProfile);
    const campaignInsert = {
        subject,
        html,
        audience_scope: scope,
        sender_profile: senderProfile,
        from_address: sender.fromAddress,
        reply_to: sender.replyTo,
        transport: settings.transport,
        status: 'sending',
        total_count: recipients.length,
        created_by: user.id,
      };
    // The Spanish version is stored with the campaign once its columns exist
    // (supabase/spanish-subscribers-2026-11.sql); before that it still SENDS,
    // it just is not kept on the record.
    let { data: campaign, error: campaignError } = await supabase
      .from('email_campaigns')
      .insert(spanish ? ({ ...campaignInsert, subject_es: spanish.subject, html_es: spanish.html } as Record<string, unknown>) : campaignInsert)
      .select('id')
      .single();

    if (spanish && (campaignError?.code === '42703' || campaignError?.code === 'PGRST204')) {
      const retry = await supabase.from('email_campaigns').insert(campaignInsert).select('id').single();
      campaign = retry.data;
      campaignError = retry.error;
    }

    if (campaignError?.code === '42703') {
      const fallback = await supabase
        .from('email_campaigns')
        .insert({
          subject,
          html,
          audience_scope: scope,
          transport: settings.transport,
          status: 'sending',
          total_count: recipients.length,
          created_by: user.id,
        })
        .select('id')
        .single();
      campaign = fallback.data;
      campaignError = fallback.error;
    }

    if (campaignError || !campaign?.id) throw campaignError ?? new Error('Campaign could not be created.');

    await supabase.from('email_campaign_sends').insert(
      recipients.map((recipient) => ({
        campaign_id: campaign.id,
        email: recipient.email,
        status: 'pending',
      }))
    );

    const result = await sendDirectMarketingCampaign({
      campaignId: campaign.id,
      subject,
      html,
      recipients,
      senderProfile,
      settings,
      spanish,
    });

    await Promise.all(result.perRecipient.map((item) => (
      supabase
        .from('email_campaign_sends')
        .update({
          status: item.ok ? 'sent' : 'failed',
          error: item.error ?? null,
          sent_at: item.ok ? new Date().toISOString() : null,
        })
        .eq('campaign_id', campaign.id)
        .eq('email', item.email)
    )));

    await supabase
      .from('email_campaigns')
      .update({
        status: result.failed > 0 && result.sent === 0 ? 'failed' : 'sent',
        sent_count: result.sent,
        failed_count: result.failed,
        sent_at: new Date().toISOString(),
      })
      .eq('id', campaign.id);

    const split = countByLanguage(recipients);
    return NextResponse.json({
      success: true,
      campaignId: campaign.id,
      sent: result.sent,
      failed: result.failed,
      total: recipients.length,
      // How many got the Spanish version (0 when there was none).
      spanish: spanish ? split.es : 0,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not send marketing campaign.' },
      { status: 500 }
    );
  }
}
