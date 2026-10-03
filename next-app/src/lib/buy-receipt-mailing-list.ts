import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';

/** How the Subscribers page tells these sign-ups from the homepage's. */
export const BUY_RECEIPT_SUBSCRIBER_SOURCE = 'buy_receipt';

export type MailingListResult = { ok: true } | { ok: false; error: string };

/**
 * A seller ticked "Add me to the mailing list" on the customer input screen
 * (owner, 2026-10-03). Their email joins the same list as the homepage's
 * "Join the List", through the same function, so a returning subscriber is
 * re-activated rather than duplicated and an earlier unsubscribe is lifted by
 * this fresh, in-person request.
 *
 * Email only: text alerts need their own consent wording and a "reply YES",
 * which a tick box on a receipt form is not.
 *
 * This is the ONLY service-role call in the buy-receipt feature, and it never
 * touches `buy_receipts` — that table stays behind the admin's own session.
 * `subscribe_homepage_v2` is granted to the service role alone
 * (supabase/text-subscribers-2026-09.sql).
 */
export async function addSellerToMailingList(input: { email: string; name: string | null }): Promise<MailingListResult> {
  const failed: MailingListResult = { ok: false, error: 'The email could not be added to the mailing list.' };
  try {
    const service = createServiceClient();
    const { error } = await service.rpc('subscribe_homepage_v2', {
      subscriber_email: input.email,
      subscriber_name: input.name,
      subscriber_locale: 'en',
      subscriber_phone: null,
      subscriber_sms_consent: false,
      subscriber_sms_consent_text: null,
      subscriber_sms_consent_version: null,
      subscriber_source: BUY_RECEIPT_SUBSCRIBER_SOURCE,
    });
    if (error) {
      console.error('[buy-receipts] mailing list sign-up failed', error.message);
      return failed;
    }
    return { ok: true };
  } catch (caught) {
    console.error('[buy-receipts] mailing list sign-up failed', caught instanceof Error ? caught.message : caught);
    return failed;
  }
}
