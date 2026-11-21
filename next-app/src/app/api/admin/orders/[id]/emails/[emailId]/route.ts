import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { isMissingCopyColumn, rebuildPlan, type EmailCopyResponse } from '@/lib/email-copies';
import { buildOrderInvoiceEmail } from '@/lib/order-invoice-mailer';
import { buildFulfillmentUpdateEmailContent } from '@/lib/order-fulfillment-email';
import { isDeliveryTrackingConfigured } from '@/lib/easypost';
import { buildPickupEmail } from '@/lib/order-pickup-email';
import { loadPickupOrder } from '@/lib/order-pickup-server';
import { isOrderId, ORDER_PICKUP_COLUMNS, ORDER_PICKUP_TABLE, type OrderPickupRow } from '@/lib/order-pickup';

/**
 * The Email History viewer (owner, 2026-11-21, mockup 2): GET one logged
 * email of this order. A saved copy (`order_emails.body_html`, kept since
 * `supabase/email-copies-2026-11.sql`) comes back as sent. An older row is
 * REBUILT from the order as it is now (`rebuilt: true`, the pop-up says so),
 * except the automatic delivery emails, which cannot be (`missing`).
 * Read only: nothing is sent or written.
 */
export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string; emailId: string }> };

type LoggedEmail = { id: string; order_id: string; email_type: string; subject: string | null; status: string | null; body_html?: string | null; body_text?: string | null };

const BASE_COLUMNS = 'id, order_id, email_type, subject, status';

export async function GET(_req: Request, context: Context) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { id, emailId } = await context.params;
  if (!isOrderId(id) || !isOrderId(emailId)) return NextResponse.json({ error: 'Email not found.' }, { status: 404 });

  let result = await admin.supabase.from('order_emails').select(`${BASE_COLUMNS}, body_html, body_text`).eq('id', emailId).eq('order_id', id).maybeSingle();
  if (result.error && isMissingCopyColumn(result.error)) {
    result = await admin.supabase.from('order_emails').select(BASE_COLUMNS).eq('id', emailId).eq('order_id', id).maybeSingle();
  }
  if (result.error) console.error('[email-copies] read failed', result.error.message);
  const email = result.data as LoggedEmail | null;
  if (!email) return NextResponse.json({ error: 'Email not found.' }, { status: 404 });

  if (email.body_html) {
    const body: EmailCopyResponse = { html: email.body_html, text: email.body_text ?? '', rebuilt: false, subject: email.subject };
    return NextResponse.json(body);
  }

  const plan = rebuildPlan(email.email_type, email.status);
  let rebuilt: { html: string; text: string } | null = null;
  if (plan.kind === 'invoice') {
    const built = await buildOrderInvoiceEmail(admin.supabase, id);
    if (built.ok) rebuilt = built.content;
  } else if (plan.kind === 'fulfillment') {
    let orderResult = await admin.supabase.from('orders').select('order_number, customer_name, shipping_carrier, tracking_number').eq('id', id).maybeSingle();
    if (orderResult.error && /shipping_carrier|tracking_number/i.test(orderResult.error.message)) {
      orderResult = await admin.supabase.from('orders').select('order_number, customer_name').eq('id', id).maybeSingle();
    }
    const order = orderResult.data as { order_number: string; customer_name: string | null; shipping_carrier?: string | null; tracking_number?: string | null } | null;
    if (order) {
      rebuilt = buildFulfillmentUpdateEmailContent(
        { ...order, shipping_carrier: order.shipping_carrier ?? null, tracking_number: order.tracking_number ?? null },
        plan.status,
        { deliveryUpdates: isDeliveryTrackingConfigured() },
      );
    }
  } else if (plan.kind === 'pickup') {
    const [order, { data: pickup }] = await Promise.all([
      loadPickupOrder(admin.supabase, id),
      admin.supabase.from(ORDER_PICKUP_TABLE).select(ORDER_PICKUP_COLUMNS).eq('order_id', id).maybeSingle(),
    ]);
    if (order && pickup) rebuilt = buildPickupEmail(order, pickup as unknown as OrderPickupRow);
  } else {
    const body: EmailCopyResponse = { missing: true, reason: plan.reason };
    return NextResponse.json(body);
  }

  if (!rebuilt) {
    const body: EmailCopyResponse = { missing: true, reason: 'This email was sent before the site kept copies, and the order it came from can no longer be read to rebuild it.' };
    return NextResponse.json(body);
  }
  const body: EmailCopyResponse = { html: rebuilt.html, text: rebuilt.text, rebuilt: true, subject: email.subject };
  return NextResponse.json(body);
}
