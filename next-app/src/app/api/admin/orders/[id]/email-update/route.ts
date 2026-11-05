import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { FulfillmentStatus } from '@/types/sales';
import { buildFulfillmentUpdateEmailContent } from '@/lib/order-fulfillment-email';
import { isDeliveryTrackingConfigured } from '@/lib/easypost';

interface Props {
  params: Promise<{ id: string }>;
}

const VALID_STATUSES: FulfillmentStatus[] = ['pending', 'packed', 'shipped', 'picked_up', 'cancelled'];

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(req: Request, { params }: Props) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const recipient = String(body?.recipient ?? '').trim();
  const status = body?.status as FulfillmentStatus | undefined;

  if (!recipient || !isValidEmail(recipient)) {
    return NextResponse.json({ error: 'A valid recipient email is required.' }, { status: 400 });
  }
  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'A valid fulfillment status is required.' }, { status: 400 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ error: 'Email sending is not configured. Missing RESEND_API_KEY.' }, { status: 500 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }

  let orderResult = await supabase
    .from('orders')
    .select('order_number, customer_name, shipping_carrier, tracking_number')
    .eq('id', id)
    .single();

  if (orderResult.error && /shipping_carrier|tracking_number/i.test(orderResult.error.message)) {
    orderResult = await supabase
      .from('orders')
      .select('order_number, customer_name')
      .eq('id', id)
      .single();
  }

  const { data: order, error: orderError } = orderResult;

  if (orderError || !order) {
    return NextResponse.json({ error: orderError?.message ?? 'Order not found.' }, { status: 404 });
  }

  const content = buildFulfillmentUpdateEmailContent({
    ...order,
    shipping_carrier: 'shipping_carrier' in order ? order.shipping_carrier : null,
    tracking_number: 'tracking_number' in order ? order.tracking_number : null,
  }, status, { deliveryUpdates: isDeliveryTrackingConfigured() });

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(resendKey);
    const result = await resend.emails.send({
      from: 'Naples Estate Jewelry <noreply@naplesestatejewelry.com>',
      // Shipping/fulfillment updates invite customer replies — route them to a
      // monitored mailbox rather than the unattended no-reply sender.
      replyTo: 'info@naplesestatejewelry.com',
      to: recipient,
      subject: content.subject,
      html: content.html,
      text: content.text,
    });
    if (result.error || !result.data?.id) {
      throw new Error(result.error?.message ?? 'Resend did not return an accepted email ID.');
    }
  } catch (error) {
    console.error('Fulfillment update email error:', error);
    return NextResponse.json({ error: 'Could not send update email.' }, { status: 500 });
  }

  // Record the sent email for the order's history (best-effort — see email-invoice).
  const sentAt = new Date().toISOString();
  const { error: logError } = await supabase.from('order_emails').insert({
    order_id: id,
    email_type: 'fulfillment_update',
    recipient,
    subject: content.subject,
    status,
    sent_by: user.id,
    sent_by_email: user.email ?? null,
  });
  if (logError) console.error('order_emails insert (update) failed:', logError.message);

  return NextResponse.json({
    success: true,
    email: {
      email_type: 'fulfillment_update',
      recipient,
      subject: content.subject,
      status,
      sent_by_email: user.email ?? null,
      created_at: sentAt,
    },
  });
}
