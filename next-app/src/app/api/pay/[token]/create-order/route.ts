import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createPayPalOrder, paypalConfigured } from '@/lib/paypal';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { buildAddressObject } from '@/lib/sales';
import { upsertOrderInvoice } from '@/lib/order-invoices';
import { normalizePayPageCustomer, payPageTotals } from '@/lib/remote-sale';
import { loadOrderTaxExemption } from '@/lib/tax-exempt-server';
import { findRemoteInvoiceByToken } from '@/lib/remote-sale-server';
import { isProductPurchasable } from '@/types/product';

/**
 * POST /api/pay/<token>/create-order — the customer pressed PayPal or Debit or
 * Credit Card on a remote-sale invoice's pay page (owner, 2026-10-21).
 *
 * The invoice IS the order (created unpaid when it was emailed). This route
 * writes the customer's details onto it, re-checks that every listed item is
 * still for sale (nothing was reserved), sets the tax for their address (the
 * web checkout rule), and opens a PayPal order for that exact total. The
 * buttons then call the normal `/api/paypal/capture-order`, which finds the
 * order by `paypal_order_id` and finishes it like any web sale.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

interface Props {
  params: Promise<{ token: string }>;
}

export async function POST(req: Request, { params }: Props) {
  const ip = getClientIp(req);
  if (!(await checkRateLimit(`pay-invoice:${ip}`, 20, 3600))) {
    return NextResponse.json({ error: 'Too many requests. Please try again in a bit.' }, { status: 429 });
  }
  if (!paypalConfigured()) return NextResponse.json({ error: 'PayPal is not configured.' }, { status: 503 });

  const { token } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const isEs = body?.locale === 'es';

  const service = createServiceClient();
  const found = await findRemoteInvoiceByToken(service, decodeURIComponent(token));
  if (!found || !found.invoice.pay_online) {
    return NextResponse.json({ error: isEs ? 'Esta factura no se puede pagar en línea.' : 'This invoice cannot be paid online.' }, { status: 404 });
  }
  if (found.state !== 'open') {
    const message = found.state === 'paid'
      ? (isEs ? 'Esta factura ya está pagada.' : 'This invoice has already been paid.')
      : found.state === 'expired'
        ? (isEs ? 'Este enlace de pago venció. Llámenos y se lo enviamos de nuevo.' : 'This payment link has expired. Call us and we will send it again.')
        : (isEs ? 'Esta factura fue cancelada.' : 'This invoice was cancelled.');
    return NextResponse.json({ error: message, code: `invoice_${found.state}` }, { status: 409 });
  }

  const { order, items } = found;
  const ships = order.shipping_method === 'shipping';
  const customer = normalizePayPageCustomer(body?.customer, ships, isEs);
  if ('error' in customer) return NextResponse.json({ error: customer.error }, { status: 400 });

  // Nothing is reserved: a listed piece may have sold since the invoice went out.
  const listedIds = items.flatMap((item) => (item.product_id ? [item.product_id] : []));
  if (listedIds.length > 0) {
    const { data: products } = await service.from('products').select('id, title, status, quantity').in('id', listedIds);
    const sold = (products ?? []).filter((p) => !isProductPurchasable(p.status as string, p.quantity as number | null));
    if (sold.length > 0 || (products ?? []).length !== listedIds.length) {
      return NextResponse.json(
        { error: isEs ? 'Lo sentimos, una pieza de esta factura ya se vendió. No se le cobró nada; llámenos.' : 'Sorry, a piece on this invoice has already sold. You have not been charged — please call us.', code: 'invoice_item_sold' },
        { status: 409 },
      );
    }
  }

  const address = customer.value.address;
  // A tax-exempt invoice (owner, 2026-10-27) stays at $0 tax for any address.
  const exemption = await loadOrderTaxExemption(service, order.id);
  const totals = payPageTotals(
    { subtotal: Number(order.subtotal), shipping_fee: Number(order.shipping_fee), shipping_method: order.shipping_method, tax_exempt: Boolean(exemption) },
    address?.state ?? null,
  );
  const { data: updated, error: updateError } = await service
    .from('orders')
    .update({
      customer_name: customer.value.name,
      customer_email: customer.value.email,
      customer_phone: customer.value.phone,
      ...(address
        ? {
          shipping_address: buildAddressObject({
            line1: address.line1,
            line2: address.line2 ?? undefined,
            city: address.city,
            state: address.state,
            postalCode: address.postalCode,
            country: 'United States',
          }),
        }
        : {}),
      tax: totals.tax,
      total: totals.total,
      payment_status: 'unpaid',
    })
    .eq('id', order.id)
    // 'failed' with no capture = a declined card (PayPal's DECLINED webhook);
    // the buyer may try another card on the same link (2026-10-28). A failed
    // order that DID capture (item conflict) keeps its capture id and is skipped.
    .in('payment_status', ['unpaid', 'failed'])
    .is('paypal_capture_id', null)
    .select('id')
    .maybeSingle();
  if (updateError || !updated) {
    console.error('pay-invoice order update error:', updateError);
    return NextResponse.json({ error: isEs ? 'No se pudo iniciar el pago.' : 'Could not start payment.' }, { status: 500 });
  }
  await upsertOrderInvoice(service, order.id);

  // After a declined payment the retry must get a NEW PayPal order, not the
  // declined one back (lib/paypal.ts requestIdSalt, 2026-10-28).
  let requestIdSalt: string | null = null;
  if (body?.newPayPalOrder === true) {
    const { data: current } = await service.from('orders').select('paypal_order_id').eq('id', order.id).maybeSingle();
    requestIdSalt = (current?.paypal_order_id as string | null | undefined) ?? null;
  }

  try {
    const paypalOrder = await createPayPalOrder({
      currency: 'USD',
      subtotal: totals.subtotal,
      tax: totals.tax,
      shipping: totals.shippingFee,
      total: totals.total,
      items: items.map((item) => ({
        name: item.title_snapshot,
        quantity: '1',
        unitAmount: Number(item.price_snapshot),
        sku: item.inventory_number ?? undefined,
      })),
      referenceId: order.id,
      shippingAddress: address
        ? {
          fullName: customer.value.name,
          addressLine1: address.line1,
          addressLine2: address.line2,
          city: address.city,
          state: address.state,
          postalCode: address.postalCode,
          countryCode: 'US',
        }
        : null,
      requestIdSalt,
    });
    const { error: linkError } = await service.from('orders').update({ paypal_order_id: paypalOrder.id }).eq('id', order.id);
    if (linkError) throw new Error(`Could not link the PayPal order: ${linkError.message}`);
    return NextResponse.json({ paypalOrderId: paypalOrder.id, orderId: order.id });
  } catch (err) {
    console.error('pay-invoice PayPal create error:', err);
    // The invoice stays open — unlike an abandoned web checkout, it is never cancelled here.
    return NextResponse.json({ error: isEs ? 'No se pudo iniciar el pago con PayPal.' : 'Could not start PayPal checkout.' }, { status: 502 });
  }
}
