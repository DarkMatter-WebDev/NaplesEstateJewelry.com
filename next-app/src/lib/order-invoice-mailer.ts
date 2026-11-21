import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildInvoiceEmailContent,
  formatPickupHours,
  isOrderPaid,
  withInvoiceLineDiscounts,
  type InvoiceEmailOrder,
  type InvoicePaymentBlock,
} from '@/lib/order-invoice-email';
import { getStoreHours } from '@/lib/store-hours';
import { loadOrderTaxExemption } from '@/lib/tax-exempt-server';
import { loadOrderGift } from '@/lib/order-gift-server';
import { SPLIT_PAYMENTS_COLUMN } from '@/lib/in-store-sale';
import { logOrderEmail } from '@/lib/email-copies';

const ORDER_INVOICE_COLUMNS = [
  'id',
  'order_number',
  'user_id',
  'customer_name',
  'customer_email',
  'customer_phone',
  'subtotal',
  'tax',
  'shipping_fee',
  'discount',
  'total',
  'payment_status',
  'fulfillment_status',
  'order_status',
  'payment_method',
  SPLIT_PAYMENTS_COLUMN,
  'payment_reference',
  'shipping_method',
  'shipping_address',
  'billing_address',
  'internal_notes',
  'customer_notes',
  'created_at',
  'updated_at',
  'order_items(id, order_id, product_id, inventory_number, title_snapshot, item_year_snapshot, metal_snapshot, purity_snapshot, gram_weight_snapshot, price_snapshot, quantity, discount, image_snapshot, created_at)',
].join(', ');
const ORDER_INVOICE_COLUMNS_WITHOUT_ITEM_YEAR_SNAPSHOT = ORDER_INVOICE_COLUMNS
  .replace('item_year_snapshot, ', '')
  .replace('quantity, ', '');

function isMissingItemYearColumnError(error: { message?: string | null } | null | undefined) {
  return Boolean(error?.message?.toLowerCase().includes('item_year'))
    || Boolean(error?.message?.toLowerCase().includes('quantity'));
}

export type SentInvoiceEmail = {
  /** The Email History row (null if the log write failed). */
  id: string | null;
  email_type: 'invoice' | 'receipt';
  recipient: string;
  subject: string;
  status: null;
  sent_by_email: string | null;
  created_at: string;
};

export type SendInvoiceEmailResult =
  | { ok: true; email: SentInvoiceEmail }
  | { ok: false; status: number; error: string };

/**
 * The invoice / receipt email for an order, built exactly as `sendOrderInvoiceEmail`
 * sends it (without sending). Also used by the Email History viewer to rebuild an
 * email sent before copies were kept (2026-11-21).
 */
export async function buildOrderInvoiceEmail(
  supabase: SupabaseClient,
  orderId: string,
  opts: { itemDiscounts?: Record<string, number>; payment?: InvoicePaymentBlock | null } = {},
): Promise<
  | { ok: true; content: ReturnType<typeof buildInvoiceEmailContent>; emailType: 'invoice' | 'receipt' }
  | { ok: false; status: number; error: string }
> {
  const [orderResult, { data: invoices }] = await Promise.all([
    supabase.from('orders').select(ORDER_INVOICE_COLUMNS).eq('id', orderId).single(),
    supabase
      .from('invoices')
      .select('invoice_number')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  let order = orderResult.data;
  let orderError = orderResult.error;
  if (isMissingItemYearColumnError(orderError)) {
    const fallback = await supabase
      .from('orders')
      .select(ORDER_INVOICE_COLUMNS_WITHOUT_ITEM_YEAR_SNAPSHOT)
      .eq('id', orderId)
      .single();
    order = fallback.data;
    orderError = fallback.error;
  }

  if (orderError || !order) {
    return { ok: false, status: 404, error: orderError?.message ?? 'Order not found.' };
  }

  const invoiceNumber = invoices?.[0]?.invoice_number ?? null;
  const emailOrder = withInvoiceLineDiscounts(
    order as unknown as InvoiceEmailOrder,
    opts.itemDiscounts ?? {},
  );
  // Admin-editable hours, resolved at SEND time so the pickup block always
  // prints the current schedule (defaults to Tue–Sat if unconfigured).
  const content = buildInvoiceEmailContent(emailOrder, invoiceNumber, {
    pickupHours: formatPickupHours(await getStoreHours()),
    payment: opts.payment ?? null,
    // Tax-exempt sales (owner, 2026-10-27) print the certificate line.
    taxExempt: await loadOrderTaxExemption(supabase, orderId),
    gift: await loadOrderGift(supabase, orderId),
  });
  const emailType: 'invoice' | 'receipt' = isOrderPaid(emailOrder) ? 'receipt' : 'invoice';
  return { ok: true, content, emailType };
}

/**
 * Send an order's invoice/receipt email (paid orders get a "receipt", unpaid get
 * an "invoice") and record it in the order's email history. Shared by the admin
 * "Email Invoice" route and the automatic on-payment send from capture.
 */
export async function sendOrderInvoiceEmail(opts: {
  supabase: SupabaseClient;
  resendKey: string;
  orderId: string;
  recipient: string;
  itemDiscounts?: Record<string, number>;
  /** null id + a label email records an automatic (system) send. */
  sentBy?: { id?: string | null; email?: string | null };
  /** Remote sale invoices only: the Pay online button + other ways to pay. */
  payment?: InvoicePaymentBlock | null;
}): Promise<SendInvoiceEmailResult> {
  const { supabase, resendKey, orderId, recipient } = opts;
  const built = await buildOrderInvoiceEmail(supabase, orderId, { itemDiscounts: opts.itemDiscounts, payment: opts.payment });
  if (!built.ok) return built;
  const { content, emailType } = built;

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(resendKey);
    const result = await resend.emails.send(
      {
        from: 'Naples Estate Jewelry <noreply@naplesestatejewelry.com>',
        // Customers do reply to receipts; point those at a monitored mailbox
        // instead of the unattended no-reply sender.
        replyTo: 'info@naplesestatejewelry.com',
        to: recipient,
        subject: content.subject,
        html: content.html,
        text: content.text,
      },
      opts.sentBy?.id === null
        ? { idempotencyKey: `order-${orderId}-automatic-receipt` }
        : undefined,
    );
    if (result.error || !result.data?.id) {
      throw new Error(result.error?.message ?? 'Resend did not return an accepted email ID.');
    }
  } catch (error) {
    console.error('Invoice/receipt email error:', error);
    return { ok: false, status: 500, error: `Could not send the ${emailType} email.` };
  }

  // Record for the order's email history. Best-effort — the email already sent.
  // With the email's own copy (2026-11-21), for the Email History viewer.
  const { error: logError, id: logId } = await logOrderEmail(supabase, {
    order_id: orderId,
    email_type: emailType,
    recipient,
    subject: content.subject,
    sent_by: opts.sentBy?.id ?? null,
    sent_by_email: opts.sentBy?.email ?? null,
  }, { html: content.html, text: content.text });
  if (logError) console.error('order_emails insert failed:', logError);

  return {
    ok: true,
    email: {
      id: logId,
      email_type: emailType,
      recipient,
      subject: content.subject,
      status: null,
      sent_by_email: opts.sentBy?.email ?? null,
      created_at: new Date().toISOString(),
    },
  };
}
