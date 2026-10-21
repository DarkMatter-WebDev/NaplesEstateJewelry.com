import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { upsertOrderInvoice } from '@/lib/order-invoices';

/**
 * Post-payment finalization shared by BOTH capture paths — the client
 * `capture-order` route and the `webhook` backstop. Upserts the invoice
 * (idempotent on invoice_number) and best-effort emails the buyer their receipt.
 * Safe to call from either path: the invoice upsert de-dupes, and automatic
 * receipt/owner sends use stable Resend idempotency keys.
 *
 * Previously this lived only in capture-order, so an order completed by the
 * webhook (buyer's browser died after PayPal approval) got no invoice row and no
 * receipt email.
 */
export async function finalizePaidOrder(
  service: SupabaseClient,
  orderId: string,
  /**
   * `sendCustomerReceipt: false` = Instant Sale with "Email copy" unticked
   * (owner, 2026-10-21): the email stays on the order (tracking emails use
   * it) but no receipt goes out now. The invoice row and the owner's email
   * are unchanged.
   */
  options: { sendCustomerReceipt?: boolean } = {},
): Promise<boolean> {
  const { data: order, error: orderError } = await service
    .from('orders')
    .select('id, customer_email, payment_status')
    .eq('id', orderId)
    .maybeSingle();
  if (orderError || !order) {
    console.error('Automatic finalization order lookup error:', orderError);
    return false;
  }
  if (order.payment_status !== 'paid') return true;

  const invoiceResult = await upsertOrderInvoice(service, order.id);
  let complete = invoiceResult.ok;
  if (!invoiceResult.ok) {
    console.error('Automatic invoice upsert error:', invoiceResult.error);
  }

  const resendKey = process.env.RESEND_API_KEY;
  const { data: priorAutomaticReceipts, error: receiptLookupError } = await service
    .from('order_emails')
    .select('id')
    .eq('order_id', order.id)
    .eq('email_type', 'receipt')
    .is('sent_by', null)
    .limit(1);
  if (receiptLookupError) {
    console.error('Automatic receipt history lookup error:', receiptLookupError);
    return false;
  }
  const alreadyNotified = Boolean(priorAutomaticReceipts?.length);

  if (resendKey && order.customer_email && !alreadyNotified && options.sendCustomerReceipt !== false) {
    try {
      const { sendOrderInvoiceEmail } = await import('@/lib/order-invoice-mailer');
      const result = await sendOrderInvoiceEmail({
        supabase: service,
        resendKey,
        orderId: order.id,
        recipient: order.customer_email as string,
        sentBy: { id: null, email: 'Automatic — order confirmation' },
      });
      if (!result.ok) complete = false;
    } catch (err) {
      console.error('Auto receipt email error:', err);
      complete = false;
    }
  }

  // Also alert the shop directly (in addition to the admin Orders list) so the
  // owner is notified of a new order by email. Best-effort and independent of the
  // customer receipt above — it doesn't need the buyer to have an email on file.
  if (resendKey && !alreadyNotified) {
    try {
      const { sendNewOrderOwnerNotification } = await import('@/lib/order-owner-notification');
      await sendNewOrderOwnerNotification({ supabase: service, resendKey, orderId: order.id });
    } catch (err) {
      console.error('Owner new-order notification error:', err);
    }
  }

  // Site offers (lib/offers-server.ts): mark the offer this order came from as
  // accepted / bought at counter, and close every other open offer on an item
  // that just sold — releasing its PayPal hold. Best-effort and never part of
  // `complete`: the 15-minute offers sweep reconciles anything missed here.
  try {
    const { settleOffersAfterPaidOrder } = await import('@/lib/offers-server');
    await settleOffersAfterPaidOrder(service, order.id);
  } catch (err) {
    console.error('Offer settlement error:', err);
  }

  return complete;
}

/**
 * Race loser on a one-of-one item: PayPal captured the buyer's money but the item
 * was already sold to someone else, so `capture_paypal_order` flagged the order
 * `failed`. The buyer was told a refund is coming — alert an admin so it actually
 * happens. De-duped (the losing capture can arrive via both the client route and
 * the webhook) and best-effort.
 */
export async function notifyItemConflict(
  service: SupabaseClient,
  order: { id: string; orderNumber: string; captureId?: string | null },
): Promise<void> {
  try {
    const { data: existing } = await service
      .from('admin_notifications')
      .select('id')
      .eq('order_id', order.id)
      .eq('type', 'order')
      .ilike('title', 'Refund needed%')
      .limit(1);
    if (existing && existing.length > 0) return;

    await service.from('admin_notifications').insert({
      type: 'order',
      title: `Refund needed — item already sold (${order.orderNumber})`,
      body:
        `Order ${order.orderNumber} captured payment, but its item(s) were already sold to another buyer, ` +
        `so the order is flagged 'failed'. Issue a full PayPal refund to this buyer.` +
        (order.captureId ? ` PayPal capture: ${order.captureId}.` : ''),
      order_id: order.id,
    });
  } catch (err) {
    console.error('item_conflict admin notification error:', err);
  }
}
