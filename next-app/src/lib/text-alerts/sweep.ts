import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import { twilioConfigured } from './config';
import { CONFIRMATION_MAX_ATTEMPTS, CONFIRMATION_RETRY_AFTER_MS, sendConfirmation } from './confirmations';
import { runDealSendPass, SEND_PASS_LIMIT } from './deals';

/**
 * The 15-minute safety net (pg_cron → /api/admin/text-alerts/sweep).
 *
 *   1. Confirmations the sign-up request could not send (Twilio down, the
 *      Lambda frozen, or Twilio not yet configured when they joined) go out
 *      now — at most CONFIRMATIONS_PER_RUN, never more than
 *      CONFIRMATION_MAX_ATTEMPTS per number, with a 6-hour gap between tries
 *      so an unverified number does not burn attempts every quarter hour.
 *   2. Deals still `sending` get another send pass.
 */
export const CONFIRMATIONS_PER_RUN = 25;

export type SweepResult = {
  configured: boolean;
  confirmations: { candidates: number; sent: number; failed: number };
  deals: Array<{ dealId: string; sent: number; failed: number; remaining: number; finished: boolean }>;
};

export async function sweepTextAlerts(): Promise<SweepResult> {
  const result: SweepResult = { configured: twilioConfigured(), confirmations: { candidates: 0, sent: 0, failed: 0 }, deals: [] };
  if (!result.configured) return result;
  const service = createServiceClient();

  const retryBefore = new Date(Date.now() - CONFIRMATION_RETRY_AFTER_MS).toISOString();
  const { data: pending, error } = await service
    .from('homepage_subscribers')
    .select('phone_e164, sms_confirmation_attempts, sms_confirmation_attempted_at')
    .eq('sms_status', 'pending')
    .not('phone_e164', 'is', null)
    .is('sms_confirmation_sent_at', null)
    .order('sms_consent_at', { ascending: true })
    .limit(200);
  if (error) throw new Error(`Could not read pending confirmations: ${error.message}`);

  const due = (pending ?? []).filter((row) => {
    const attempts = row.sms_confirmation_attempts ?? 0;
    if (attempts >= CONFIRMATION_MAX_ATTEMPTS) return false;
    if (!row.sms_confirmation_attempted_at) return true;
    return row.sms_confirmation_attempted_at < retryBefore;
  }).slice(0, CONFIRMATIONS_PER_RUN);
  result.confirmations.candidates = due.length;
  for (const row of due) {
    if (typeof row.phone_e164 !== 'string') continue;
    const outcome = await sendConfirmation(row.phone_e164);
    if (outcome.outcome === 'sent') result.confirmations.sent += 1;
    else if (outcome.outcome === 'failed') result.confirmations.failed += 1;
  }

  const { data: sending } = await service.from('text_deals').select('id').eq('status', 'sending').limit(5);
  let budget = SEND_PASS_LIMIT;
  for (const deal of sending ?? []) {
    if (budget <= 0) break;
    const pass = await runDealSendPass(deal.id, budget);
    budget -= pass.attempted;
    result.deals.push({ dealId: deal.id, sent: pass.sent, failed: pass.failed, remaining: pass.remaining, finished: pass.finished });
  }
  return result;
}
