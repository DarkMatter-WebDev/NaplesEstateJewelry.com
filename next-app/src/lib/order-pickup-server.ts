import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isMissingPickupTable,
  ORDER_PICKUP_COLUMNS,
  ORDER_PICKUP_TABLE,
  type OrderPickupRow,
  type OrderPickupState,
  type PickupPaperOrder,
} from '@/lib/order-pickup';
import { buildPickupEmail, PICKUP_EMAIL_TYPE } from '@/lib/order-pickup-email';
import { logOrderEmail } from '@/lib/email-copies';

/**
 * The server half of the Local Pickup log (`order-pickup.ts`): reading the
 * row for the order page, the order fields the sheet and email need, and
 * sending the customer's pickup copy (Resend, then `emailed_at` + the order's
 * email history). Same sender and reply-to as every order email.
 */

/** The order fields the pickup sheet + email use. Never prices. */
export const PICKUP_ORDER_COLUMNS =
  'id, order_number, customer_name, customer_email, customer_phone, created_at, shipping_method, payment_method, fulfillment_status, deleted_at, order_items(inventory_number, title_snapshot, item_year_snapshot, metal_snapshot, purity_snapshot, gram_weight_snapshot, quantity, image_snapshot, created_at)';

export type PickupOrder = PickupPaperOrder & {
  id: string;
  shipping_method: string | null;
  payment_method: string | null;
  fulfillment_status: string | null;
  deleted_at: string | null;
};

export async function loadPickupOrder(supabase: SupabaseClient, orderId: string): Promise<PickupOrder | null> {
  const { data, error } = await supabase.from('orders').select(PICKUP_ORDER_COLUMNS).eq('id', orderId).maybeSingle();
  if (error) console.error('[order-pickup] order read failed', error.message);
  if (!data) return null;
  const order = data as unknown as PickupOrder & { order_items: (PickupPaperOrder['order_items'][number] & { created_at?: string })[] };
  // Same order as the order page lists them.
  order.order_items = [...(order.order_items ?? [])].sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));
  return order;
}

/** For the order page: `supported: false` until the SQL file has run (the card then says so). */
export async function loadOrderPickup(supabase: SupabaseClient, orderId: string): Promise<OrderPickupState> {
  const { data, error } = await supabase.from(ORDER_PICKUP_TABLE).select(ORDER_PICKUP_COLUMNS).eq('order_id', orderId).maybeSingle();
  if (error) {
    if (!isMissingPickupTable(error)) console.error('[order-pickup] read failed', error.message);
    return { supported: !isMissingPickupTable(error), row: null };
  }
  return { supported: true, row: (data as unknown as OrderPickupRow | null) ?? null };
}

export type PickupEmailEntry = {
  id: string | null;
  email_type: string;
  recipient: string;
  subject: string;
  status: string | null;
  sent_by_email: string | null;
  created_at: string;
};

export type SendPickupEmailResult =
  | { ok: true; pickup: OrderPickupRow; email: PickupEmailEntry }
  | { ok: false; error: string };

/** Email the BUYER their pickup copy. Never the ID photo, ID details or the signature picture. */
export async function sendPickupEmail(opts: {
  supabase: SupabaseClient;
  order: PickupOrder;
  pickup: OrderPickupRow;
  sentBy: { id: string; email: string | null };
}): Promise<SendPickupEmailResult> {
  const to = String(opts.order.customer_email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { ok: false, error: 'This order has no email address to send the pickup copy to.' };
  }
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return { ok: false, error: 'Email sending is not configured on the server.' };

  const content = buildPickupEmail(opts.order, opts.pickup);
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
    console.error('[order-pickup] email failed', error instanceof Error ? error.message : error);
    return { ok: false, error: 'The pickup copy could not be emailed. The pickup itself is saved.' };
  }

  const sentAt = new Date().toISOString();
  // Best effort from here: the email is already on its way.
  const [{ data: stamped }, { error: logError, id: logId }] = await Promise.all([
    opts.supabase
      .from(ORDER_PICKUP_TABLE)
      .update({ emailed_at: sentAt, emailed_to: to })
      .eq('order_id', opts.order.id)
      .select(ORDER_PICKUP_COLUMNS)
      .maybeSingle(),
    logOrderEmail(opts.supabase, {
      order_id: opts.order.id,
      email_type: PICKUP_EMAIL_TYPE,
      recipient: to,
      subject: content.subject,
      status: 'picked_up',
      sent_by: opts.sentBy.id,
      sent_by_email: opts.sentBy.email,
    }, { html: content.html, text: content.text }),
  ]);
  if (logError) console.error('[order-pickup] order_emails insert failed', logError);

  return {
    ok: true,
    pickup: (stamped as unknown as OrderPickupRow | null) ?? { ...opts.pickup, emailed_at: sentAt, emailed_to: to },
    email: {
      id: logId,
      email_type: PICKUP_EMAIL_TYPE,
      recipient: to,
      subject: content.subject,
      status: 'picked_up',
      sent_by_email: opts.sentBy.email,
      created_at: sentAt,
    },
  };
}
