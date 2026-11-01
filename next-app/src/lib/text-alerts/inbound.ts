import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import { normalizeUsPhone } from '@/lib/subscriber-phone';
import { brandMediaUrl, twilioConfig } from './config';
import { classifyInbound, DEFAULT_SOLD_REPLY, forwardText, optInReplyText, twiml } from './messages';
import { sendTwilioMessage } from './twilio';

/**
 * What happens when a text arrives on the toll-free number.
 *
 *   YES / START …  → the number is confirmed; TwiML replies with the opt-in
 *                    message on file with Twilio.
 *   STOP …         → the number is marked stopped. Twilio itself answers
 *                    STOP and blocks the number on US numbers, so no reply
 *                    from us (two texts would look sloppy).
 *   HELP           → recorded; Twilio answers HELP itself.
 *   anything else  → a reply: stored, tied to the last deal that number was
 *                    sent, forwarded to the owner's cell with "[1st]" when it
 *                    is the first reply to that deal, and — if the deal is
 *                    already marked sold — answered with the sold line once.
 *
 * Every inbound is keyed by Twilio's MessageSid, so a retried webhook is
 * inert.
 */
export type InboundParams = {
  MessageSid?: string;
  From?: string;
  Body?: string;
  NumMedia?: string;
};

type Subscriber = { id: string; full_name: string | null; sms_status: string | null; sms_last_deal_id: string | null };
type Deal = { id: string; title: string; status: string; sold_at: string | null; sold_reply_text: string | null };

export async function handleInbound(params: InboundParams): Promise<{ twiml: string; kind: string }> {
  const service = createServiceClient();
  const sid = params.MessageSid?.trim();
  const from = normalizeUsPhone(params.From) ?? params.From?.trim() ?? '';
  const body = params.Body ?? '';
  const numMedia = Number(params.NumMedia ?? 0) || 0;
  if (!sid || !from) return { twiml: twiml(), kind: 'ignored' };

  const kind = classifyInbound(body);

  const { data: subscriber } = await service
    .from('homepage_subscribers')
    .select('id, full_name, sms_status, sms_last_deal_id')
    .eq('phone_e164', from)
    .maybeSingle<Subscriber>();

  const dealId = kind === 'reply' ? subscriber?.sms_last_deal_id ?? null : null;

  // Once-only: the SID is unique; a retried webhook stops here.
  const { data: inserted, error: insertError } = await service
    .from('text_inbound')
    .insert({
      message_sid: sid,
      from_phone: from,
      body,
      num_media: numMedia,
      kind,
      subscriber_id: subscriber?.id ?? null,
      deal_id: dealId,
    })
    .select('id')
    .maybeSingle<{ id: number }>();
  if (insertError) {
    if (insertError.code === '23505') return { twiml: twiml(), kind: 'duplicate' };
    console.error('[text-alerts] inbound insert failed', insertError.message);
  }
  const inboundId = inserted?.id ?? null;
  const now = new Date().toISOString();

  if (kind === 'confirm') {
    if (subscriber) {
      await service
        .from('homepage_subscribers')
        .update({ sms_status: 'confirmed', sms_confirmed_at: now, sms_stopped_at: null, updated_at: now })
        .eq('id', subscriber.id);
      return { twiml: twiml(optInReplyText(), brandMediaUrl()), kind };
    }
    // Not on the list: they never signed up on the site, so there is no consent record to confirm.
    return { twiml: twiml(), kind: 'confirm_unknown' };
  }

  if (kind === 'stop') {
    if (subscriber) {
      await service
        .from('homepage_subscribers')
        .update({ sms_status: 'stopped', sms_stopped_at: now, updated_at: now })
        .eq('id', subscriber.id);
    }
    return { twiml: twiml(), kind };
  }

  if (kind === 'help') return { twiml: twiml(), kind };

  // A reply. Which deal, and is it the first?
  let deal: Deal | null = null;
  let isFirst = false;
  if (dealId) {
    const { data } = await service
      .from('text_deals')
      .select('id, title, status, sold_at, sold_reply_text')
      .eq('id', dealId)
      .maybeSingle<Deal>();
    deal = data ?? null;
    if (deal) {
      const { count } = await service
        .from('text_inbound')
        .select('id', { count: 'exact', head: true })
        .eq('deal_id', deal.id)
        .eq('kind', 'reply')
        .neq('from_phone', from);
      const { count: mine } = await service
        .from('text_inbound')
        .select('id', { count: 'exact', head: true })
        .eq('deal_id', deal.id)
        .eq('kind', 'reply')
        .eq('from_phone', from);
      isFirst = (count ?? 0) === 0 && (mine ?? 0) <= 1;
    }
  }

  // Forward to the owner's cell. Best effort: a failure is logged on the row, never thrown at Twilio.
  const config = twilioConfig();
  if (config) {
    try {
      const forwarded = await sendTwilioMessage({
        to: config.forwardTo,
        body: forwardText({ fromPhone: from, name: subscriber?.full_name ?? null, dealTitle: deal?.title ?? null, body, isFirst }),
      });
      if (inboundId) {
        await service.from('text_inbound').update({ forwarded_at: now, forward_sid: forwarded.sid }).eq('id', inboundId);
      }
    } catch (error) {
      console.error('[text-alerts] forward failed', error instanceof Error ? error.message : error);
      if (inboundId) {
        await service.from('text_inbound').update({ forward_error: error instanceof Error ? error.message : 'forward failed' }).eq('id', inboundId);
      }
    }
  }

  // Late reply to a sold deal: the polite line, once per number per deal.
  if (deal && deal.status === 'sold') {
    const { count } = await service
      .from('text_inbound')
      .select('id', { count: 'exact', head: true })
      .eq('deal_id', deal.id)
      .eq('from_phone', from)
      .not('auto_reply_sent_at', 'is', null);
    if ((count ?? 0) === 0) {
      if (inboundId) await service.from('text_inbound').update({ auto_reply_sent_at: now }).eq('id', inboundId);
      return { twiml: twiml(deal.sold_reply_text || DEFAULT_SOLD_REPLY, brandMediaUrl()), kind: 'reply_sold' };
    }
  }

  return { twiml: twiml(), kind };
}
