import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { buildAddressObject, generateOrderNumber } from '@/lib/sales';
import { buildSaleItemPayloads, createOrderErrorStatus } from '@/lib/instant-sale-server';
import { IN_STORE_SHIPPING_LABELS } from '@/lib/in-store-sale';
import { normalizeRemoteSaleInput, remoteLinkExpiry } from '@/lib/remote-sale';
import { upsertOrderInvoice } from '@/lib/order-invoices';
import {
  cardData,
  findRemoteInvoiceById,
  newPayToken,
  REMOTE_INVOICE_COLUMNS,
  sendRemoteInvoiceEmail,
  type RemoteInvoiceRow,
} from '@/lib/remote-sale-server';
import { formatCurrency } from '@/types/sales';
import { applyOrderExemption, resolveSaleCertificate } from '@/lib/tax-exempt-server';
import { exemptShortTag, snapshotFromCertificate } from '@/lib/tax-exempt';

/**
 * POST: Instant Sale → Remote sale → "Email invoice" (owner, mockup v2,
 * 2026-10-21). Creates a normal UNPAID order through the checkout's own
 * `create_paypal_order` RPC (payment_method `invoice`; listed items are only
 * checked, never reserved), one `remote_sale_invoices` row with the private pay
 * link, the invoice row, then emails the invoice. A failed email leaves the
 * invoice in place — "Resend email" on its card tries again.
 * SQL: supabase/remote-sales-2026-10.sql.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;

  const body = await req.json().catch(() => null);
  const input = normalizeRemoteSaleInput(body);
  if ('error' in input) return NextResponse.json({ error: input.error }, { status: 400 });
  const sale = input.value;

  const service = createServiceClient();
  const lines = await buildSaleItemPayloads(service, sale.items);
  if ('error' in lines) return NextResponse.json({ error: lines.error }, { status: lines.status });

  // "Tax-exempt sale" (owner, 2026-10-27): settled before the order exists.
  const certificate = sale.taxExempt
    ? await resolveSaleCertificate(service, sale.taxExempt, {
      source: 'remote_sale',
      approvedBy: admin.user.email ?? null,
      customer: { name: sale.customer.name, email: sale.customer.email, phone: sale.customer.phone },
    })
    : null;
  if (certificate && 'error' in certificate) return NextResponse.json({ error: certificate.error }, { status: 400 });

  const { delivery } = sale;
  const shipped = delivery.method === 'ship';
  const deliveryNote = delivery.method === 'ship'
    ? `Ship · ${IN_STORE_SHIPPING_LABELS[delivery.shipping]} ${formatCurrency(delivery.shippingFee)}${delivery.address ? '' : ' · address from the customer'}`
    : null;
  const exemptNote = certificate ? `Tax-exempt · ${exemptShortTag({ certType: certificate.cert_type, certNumber: certificate.cert_number })}` : null;
  const internalNotes = [`Remote sale · invoice · sent by ${admin.user.email ?? 'admin'}`, deliveryNote, exemptNote, sale.note]
    .filter(Boolean)
    .join(' | ');
  const orderNumber = generateOrderNumber();
  const orderPayload = {
    order_number: orderNumber,
    user_id: null,
    customer_name: sale.customer.name,
    customer_email: sale.customer.email,
    customer_phone: sale.customer.phone,
    subtotal: sale.subtotal,
    tax: sale.tax,
    shipping_fee: sale.shippingFee,
    discount: 0,
    total: sale.total,
    payment_method: 'invoice',
    shipping_method: shipped ? 'shipping' : 'pickup',
    shipping_address: delivery.address
      ? buildAddressObject({
        line1: delivery.address.line1,
        line2: delivery.address.line2 ?? undefined,
        city: delivery.address.city,
        state: delivery.address.state,
        postalCode: delivery.address.postalCode,
        country: 'United States',
      })
      : null,
    billing_address: null,
    internal_notes: internalNotes,
    customer_notes: null,
  };

  const { data: created, error: createError } = await service.rpc('create_paypal_order', {
    order_payload: orderPayload,
    items_payload: lines.payloads,
  });
  if (createError) {
    console.error('remote sale create_paypal_order error:', createError);
    return NextResponse.json({ error: createError.message ?? 'Could not create the order.' }, { status: createOrderErrorStatus(createError.message) });
  }
  const createdRow = Array.isArray(created) ? created[0] : created;
  const orderId = createdRow?.order_id as string | undefined;
  if (!orderId) return NextResponse.json({ error: 'Could not create the order.' }, { status: 500 });

  // Noted before the invoice email, so the email and the pay page drop the tax.
  if (certificate) {
    await applyOrderExemption(service, orderId, snapshotFromCertificate(certificate, {
      approvedVia: 'remote_sale',
      taxNotCharged: sale.taxNotCharged,
      approvedBy: admin.user.email ?? null,
    }));
  }

  const now = new Date();
  const { data: invoice, error: invoiceError } = await service
    .from('remote_sale_invoices')
    .insert({
      order_id: orderId,
      pay_token: newPayToken(),
      expires_at: remoteLinkExpiry(now, sale.linkDays).toISOString(),
      link_days: sale.linkDays,
      pay_online: sale.pay.online,
      pay_zelle: sale.pay.zelle,
      pay_check: sale.pay.check,
      pay_phone: sale.pay.phone,
      message: sale.message,
      sent_count: 0,
      created_by: admin.user.id,
      created_by_email: admin.user.email ?? null,
    })
    .select(REMOTE_INVOICE_COLUMNS)
    .single();
  if (invoiceError || !invoice) {
    console.error('remote_sale_invoices insert error:', invoiceError);
    // No invoice row = no way to pay: take the order back out of the open list.
    await service.from('orders').update({ order_status: 'cancelled', fulfillment_status: 'cancelled' }).eq('id', orderId);
    const missing = /remote_sale_invoices/.test(invoiceError?.message ?? '') && /does not exist|schema cache/i.test(invoiceError?.message ?? '');
    return NextResponse.json(
      { error: missing ? 'Could not save the invoice — the Remote sale SQL has not been run yet (supabase/remote-sales-2026-10.sql).' : 'Could not save the invoice. Nothing was emailed.' },
      { status: 500 },
    );
  }

  // Sent from a draft: the invoice replaces it (owner, 2026-10-21 "Save draft").
  const draftId = typeof (body as Record<string, unknown> | null)?.draftId === 'string' ? String((body as Record<string, unknown>).draftId) : '';
  if (/^[0-9a-f-]{36}$/i.test(draftId)) {
    const { error: draftError } = await service.from('remote_sale_drafts').delete().eq('id', draftId);
    if (draftError) console.error('remote_sale_drafts delete after send error:', draftError);
  }

  await upsertOrderInvoice(service, orderId);
  const found = await findRemoteInvoiceById(service, (invoice as unknown as RemoteInvoiceRow).id);
  if (!found) return NextResponse.json({ error: 'The invoice was saved but could not be read back.' }, { status: 500 });

  const sent = await sendRemoteInvoiceEmail(service, found.invoice, found.order, { id: admin.user.id, email: admin.user.email ?? null });
  if (sent.ok) {
    await service
      .from('remote_sale_invoices')
      .update({ sent_count: 1, last_sent_at: new Date().toISOString() })
      .eq('id', found.invoice.id);
    found.invoice.sent_count = 1;
  }

  return NextResponse.json({
    invoice: cardData(found),
    emailed: sent.ok,
    emailError: sent.ok ? null : sent.error,
  });
}
