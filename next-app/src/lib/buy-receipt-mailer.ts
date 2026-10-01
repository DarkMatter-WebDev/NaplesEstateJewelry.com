import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildBuyReceiptEmail } from '@/lib/buy-receipt-email';
import { BUY_RECEIPT_COLUMNS, type BuyReceiptRow } from '@/lib/buy-receipts';

/**
 * Email the seller their copy of a buy receipt through Resend, then stamp
 * `emailed_at` / `emailed_to` on the row. Same sender and reply-to as the
 * order receipts (order-invoice-mailer.ts). Never attaches or links the ID
 * photo. Used by the create route (the "send via email" box) and by the
 * receipt page's "Email to seller".
 */
export type SendBuyReceiptEmailResult =
  | { ok: true; receipt: BuyReceiptRow; to: string }
  | { ok: false; error: string };

export async function sendBuyReceiptEmail(opts: {
  supabase: SupabaseClient;
  receipt: BuyReceiptRow;
  /** Overrides the receipt's own seller email; must be a plausible address. */
  to?: string | null;
}): Promise<SendBuyReceiptEmailResult> {
  const to = (opts.to ?? opts.receipt.seller_email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { ok: false, error: 'There is no email address on this receipt to send it to.' };
  }
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return { ok: false, error: 'Email sending is not configured on the server.' };

  const content = buildBuyReceiptEmail(opts.receipt);
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(resendKey);
    const result = await resend.emails.send({
      from: 'Naples Estate Jewelry <noreply@naplesestatejewelry.com>',
      replyTo: 'info@naplesestatejewelry.com',
      to,
      subject: content.subject,
      html: content.html,
      text: content.text,
    });
    if (result.error || !result.data?.id) {
      throw new Error(result.error?.message ?? 'Resend did not return an accepted email ID.');
    }
  } catch (error) {
    console.error('[buy-receipts] email failed', error instanceof Error ? error.message : error);
    return { ok: false, error: 'The receipt could not be emailed. The receipt itself is saved.' };
  }

  // Best effort: the email is already on its way.
  const { data } = await opts.supabase
    .from('buy_receipts')
    .update({ emailed_at: new Date().toISOString(), emailed_to: to })
    .eq('id', opts.receipt.id)
    .select(BUY_RECEIPT_COLUMNS)
    .maybeSingle();
  return { ok: true, receipt: (data as unknown as BuyReceiptRow | null) ?? { ...opts.receipt, emailed_at: new Date().toISOString(), emailed_to: to }, to };
}
