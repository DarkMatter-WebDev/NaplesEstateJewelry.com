import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { recordOfflinePayment } from '@/lib/instant-sale-server';
import { IN_STORE_PAYMENT_LABELS, IN_STORE_PAYMENT_METHODS, remotePaymentMethodValue, type InStorePaymentMethod } from '@/lib/in-store-sale';
import { remoteLinkExpiry, type RemoteLinkDays } from '@/lib/remote-sale';
import { cardData, findRemoteInvoiceById, sendRemoteInvoiceEmail } from '@/lib/remote-sale-server';

/**
 * POST { action } on one remote-sale invoice (the card on Admin → Instant Sale):
 *   resend — a fresh link period (`link_days` from now; the link itself stays
 *            the same) and the invoice email again;
 *   cancel — the invoice and its unpaid order are cancelled; the link stops;
 *   record — paid outside the site (Zelle, check, …): recorded exactly like an
 *            in-store sale (items sold, listings end, receipt emailed), with
 *            payment_method `remote_<method>`. Fulfillment stays pending: the
 *            customer has not collected it yet.
 * A paid invoice is never touched here; paid online it closed itself.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, { params }: Props) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = String(body?.action ?? '');

  const service = createServiceClient();
  const found = await findRemoteInvoiceById(service, id);
  if (!found) return NextResponse.json({ error: 'That invoice was not found.' }, { status: 404 });
  if (found.state === 'paid') return NextResponse.json({ error: 'This invoice is already paid.', invoice: cardData(found) }, { status: 409 });
  if (found.state === 'cancelled') return NextResponse.json({ error: 'This invoice was cancelled.', invoice: cardData(found) }, { status: 409 });

  if (action === 'resend') {
    const expiresAt = remoteLinkExpiry(new Date(), found.invoice.link_days as RemoteLinkDays).toISOString();
    const { error } = await service.from('remote_sale_invoices').update({ expires_at: expiresAt }).eq('id', id);
    if (error) return NextResponse.json({ error: 'Could not update the invoice.' }, { status: 500 });
    found.invoice.expires_at = expiresAt;
    const sent = await sendRemoteInvoiceEmail(service, found.invoice, found.order, { id: admin.user.id, email: admin.user.email ?? null });
    if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: 502 });
    const sentCount = found.invoice.sent_count + 1;
    await service.from('remote_sale_invoices').update({ sent_count: sentCount, last_sent_at: new Date().toISOString() }).eq('id', id);
    const refreshed = await findRemoteInvoiceById(service, id);
    return NextResponse.json({ invoice: refreshed ? cardData(refreshed) : null });
  }

  if (action === 'cancel') {
    const { error } = await service.from('remote_sale_invoices').update({ cancelled_at: new Date().toISOString() }).eq('id', id);
    if (error) return NextResponse.json({ error: 'Could not cancel the invoice.' }, { status: 500 });
    // Conditional on still unpaid, so a payment racing in is never cancelled.
    await service
      .from('orders')
      .update({ order_status: 'cancelled', fulfillment_status: 'cancelled' })
      .eq('id', found.order.id)
      .eq('payment_status', 'unpaid');
    return NextResponse.json({ cancelled: true });
  }

  if (action === 'record') {
    const paidBy = String(body?.paidBy ?? '') as InStorePaymentMethod;
    if (!IN_STORE_PAYMENT_METHODS.includes(paidBy)) return NextResponse.json({ error: 'Pick how it was paid.' }, { status: 400 });
    const label = IN_STORE_PAYMENT_LABELS[paidBy];
    const paid = await recordOfflinePayment(service, {
      orderId: found.order.id,
      orderNumber: found.order.order_number,
      listedIds: found.items.flatMap((item) => (item.product_id ? [item.product_id] : [])),
      paidBy,
      paymentMethodValue: remotePaymentMethodValue(paidBy),
      reference: `Invoice · ${label}`,
      captureIdPrefix: 'remote',
      pickedUp: false,
      note: null,
      recordedBy: admin.user.email ?? null,
      sendCustomerReceipt: true,
    });
    if (!paid.ok) return NextResponse.json({ error: paid.error }, { status: paid.status });
    return NextResponse.json({ recorded: true, receiptEmailed: paid.receiptEmailed });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
