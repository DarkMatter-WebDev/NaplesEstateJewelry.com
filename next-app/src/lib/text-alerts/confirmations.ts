import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/service';
import { brandMediaUrl, twilioConfigured } from './config';
import { confirmationText } from './messages';
import { sendTwilioMessage, TwilioError } from './twilio';

/**
 * The "reply YES" confirmation (owner, 2026-09-15: double opt-in).
 *
 * Sent once after a web sign-up and again only on the owner's "Resend
 * confirmation" or by the sweep for rows the first attempt missed. Every
 * attempt is recorded on the row (`sms_confirmation_sent_at`,
 * `sms_confirmation_attempts`) and in `text_system_messages`, so a frozen
 * function can never send twice and a dead Twilio (before verification)
 * never loops.
 */
export const CONFIRMATION_MAX_ATTEMPTS = 5;
/** The sweep leaves a failed attempt alone for this long before trying again. */
export const CONFIRMATION_RETRY_AFTER_MS = 6 * 60 * 60 * 1000;
/**
 * Twilio error codes that mean OUR number is not ready yet (toll-free not
 * verified: 30032; unregistered sender: 30034). Those attempts are not the
 * subscriber's fault and do not count toward the cap, so everyone who joined
 * while Twilio was still reviewing the number gets their confirmation the
 * first sweep after approval instead of needing a manual resend.
 */
export const NUMBER_NOT_READY_CODES = new Set([30032, 30034]);

export type ConfirmationResult =
  | { outcome: 'sent'; sid: string }
  | { outcome: 'not_configured' }
  | { outcome: 'not_pending' }
  | { outcome: 'failed'; error: string; code: number | null };

type SubscriberRow = {
  id: string;
  phone_e164: string | null;
  sms_status: string | null;
  sms_confirmation_attempts: number | null;
};

async function logSystemMessage(
  service: SupabaseClient,
  row: { kind: string; to_phone: string; subscriber_id?: string | null; deal_id?: string | null; message_sid?: string | null; status: string; error?: string | null },
) {
  const { error } = await service.from('text_system_messages').insert(row);
  if (error) console.error('[text-alerts] system message log failed', error.message);
}

/**
 * Send the confirmation to one subscriber (by phone). Records the attempt
 * whether or not Twilio accepted it. Never throws.
 */
export async function sendConfirmation(phone: string, options: { force?: boolean } = {}): Promise<ConfirmationResult> {
  const service = createServiceClient();
  const { data: subscriber } = await service
    .from('homepage_subscribers')
    .select('id, phone_e164, sms_status, sms_confirmation_attempts')
    .eq('phone_e164', phone)
    .maybeSingle<SubscriberRow>();
  if (!subscriber?.phone_e164 || subscriber.sms_status !== 'pending') return { outcome: 'not_pending' };
  if (!twilioConfigured()) return { outcome: 'not_configured' };
  const attempts = (subscriber.sms_confirmation_attempts ?? 0) + 1;
  if (!options.force && attempts > CONFIRMATION_MAX_ATTEMPTS) {
    return { outcome: 'failed', error: 'Confirmation attempts exhausted.', code: null };
  }

  // Record the attempt BEFORE the send so a crash mid-request cannot repeat it.
  await service
    .from('homepage_subscribers')
    .update({ sms_confirmation_attempts: attempts, sms_confirmation_attempted_at: new Date().toISOString() })
    .eq('id', subscriber.id);

  try {
    // MMS on purpose: see brandMediaUrl() — one thread on the customer's phone.
    const sent = await sendTwilioMessage({ to: subscriber.phone_e164, body: confirmationText(), mediaUrl: brandMediaUrl() });
    await service
      .from('homepage_subscribers')
      .update({ sms_confirmation_sent_at: new Date().toISOString() })
      .eq('id', subscriber.id);
    await logSystemMessage(service, {
      kind: 'confirmation',
      to_phone: subscriber.phone_e164,
      subscriber_id: subscriber.id,
      message_sid: sent.sid,
      status: sent.status,
    });
    return { outcome: 'sent', sid: sent.sid };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Send failed.';
    const code = error instanceof TwilioError ? error.code : null;
    if (code != null && NUMBER_NOT_READY_CODES.has(code)) {
      // Not counted: the number, not the subscriber, was the problem.
      await service
        .from('homepage_subscribers')
        .update({ sms_confirmation_attempts: attempts - 1 })
        .eq('id', subscriber.id);
    }
    await logSystemMessage(service, {
      kind: 'confirmation',
      to_phone: subscriber.phone_e164,
      subscriber_id: subscriber.id,
      status: 'failed',
      error: message,
    });
    return { outcome: 'failed', error: message, code };
  }
}
