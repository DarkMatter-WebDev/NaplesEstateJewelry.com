import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import {
  capturePayPalOrder,
  getPayPalOrder,
  getPayPalOrderCapture,
  isPayPalCaptureDecline,
  paypalConfigured,
  paypalErrorInfo,
  paypalThreeDSecureFailed,
  type PayPalCaptureResult,
} from '@/lib/paypal';
import { finalizePaidOrder, notifyItemConflict } from '@/lib/order-finalize';
import { scheduleProductStatusHooks } from '@/lib/product-status-hooks';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

const CURRENCY = 'USD';
const AMOUNT_TOLERANCE = 0.01;

export async function POST(req: Request) {
  const ip = getClientIp(req);
  if (!(await checkRateLimit(`capture-order:${ip}`, 30, 3600))) {
    return NextResponse.json({ error: 'Too many requests. Please try again in a bit.' }, { status: 429 });
  }

  if (!paypalConfigured()) {
    return NextResponse.json({ error: 'PayPal is not configured.' }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const paypalOrderId = body && typeof body.paypalOrderId === 'string' ? body.paypalOrderId : null;
  if (!paypalOrderId) {
    return NextResponse.json({ error: 'Missing paypalOrderId' }, { status: 400 });
  }

  const service = createServiceClient();

  // Find the internal order this PayPal order belongs to.
  const { data: order, error: orderError } = await service
    .from('orders')
    .select('id, order_number, total, payment_status, paypal_capture_id, payment_response, user_id, customer_name, customer_email, subtotal, tax, shipping_fee, discount')
    .eq('paypal_order_id', paypalOrderId)
    .maybeSingle();

  if (orderError || !order) {
    return NextResponse.json({ error: 'Order not found for this payment.' }, { status: 404 });
  }

  // Idempotent: already paid — return success without recapturing. We key only on
  // payment_status='paid' (the final state); a non-paid order that happens to carry
  // a capture id is a prior mismatch/manual-review case and must not report success.
  if (order.payment_status === 'paid') {
    await finalizePaidOrder(service, order.id);
    return NextResponse.json({ success: true, orderId: order.id, orderNumber: order.order_number, alreadyPaid: true });
  }
  if (order.payment_status === 'partially_refunded' || order.payment_status === 'refunded') {
    return NextResponse.json({ error: 'This payment has already been refunded.' }, { status: 409 });
  }

  // A card/funding decline: nothing was charged, so the buyer may simply pay
  // another way (checkout shows "declined — not charged" and keeps the button
  // live). Never the "status unknown" lock below — a declined capture still
  // carries a capture id, which used to read as "unknown" and told the buyer
  // not to pay again (2026-10-28).
  const declined = () =>
    NextResponse.json(
      { error: 'Your payment was declined.', code: 'card_declined', orderId: order.id },
      { status: 402 },
    );

  // Card form / Google Pay (2026-10-28): if the card's bank security check
  // (3-D Secure) ran and failed, never capture — treat it as a decline. The
  // client names the method; PayPal-button and Apple Pay orders carry no such
  // check. A failed lookup does not block: it is the same capture as before.
  const paymentMethod = body && typeof body.paymentMethod === 'string' ? body.paymentMethod : null;
  if (paymentMethod === 'card' || paymentMethod === 'google_pay') {
    try {
      if (paypalThreeDSecureFailed(await getPayPalOrder(paypalOrderId))) {
        console.error('PayPal capture issue:', JSON.stringify({ order: order.order_number, issues: ['3DS_FAILED'], paymentMethod }));
        return declined();
      }
    } catch (lookupError) {
      console.error('PayPal 3-D Secure lookup error:', lookupError);
    }
  }

  // Capture server-side.
  let capture: PayPalCaptureResult;
  try {
    capture = await capturePayPalOrder(paypalOrderId);
  } catch (err) {
    console.error('PayPal capture error:', err);
    // The plain log above collapses PayPal's `details` to [Object]; print the
    // issue codes on their own line so a decline reason is readable in Netlify.
    const { issues, debugId } = paypalErrorInfo((err as { raw?: unknown })?.raw);
    console.error('PayPal capture issue:', JSON.stringify({ order: order.order_number, issues, debugId }));
    try {
      const recovered = await getPayPalOrderCapture(paypalOrderId);
      if (recovered.status === 'COMPLETED' && recovered.captureId) {
        capture = recovered;
      } else if (isPayPalCaptureDecline(issues, recovered.status)) {
        return declined();
      } else if (recovered.captureId) {
        return NextResponse.json(
          {
            error: 'PayPal is still resolving this payment. Do not submit it again.',
            paymentStatusUnknown: true,
            orderId: order.id,
          },
          { status: 502 },
        );
      } else {
        return NextResponse.json({ error: 'Payment could not be captured.' }, { status: 502 });
      }
    } catch (recoveryError) {
      console.error('PayPal capture recovery lookup error:', recoveryError);
      // PayPal's own error already named a decline — authoritative even when the
      // follow-up lookup fails.
      if (isPayPalCaptureDecline(issues, null)) return declined();
      return NextResponse.json(
        {
          error: 'PayPal did not confirm the payment status. Do not submit it again until it is reviewed.',
          paymentStatusUnknown: true,
          orderId: order.id,
        },
        { status: 502 },
      );
    }
  }

  if (capture.status !== 'COMPLETED' || !capture.captureId) {
    if (isPayPalCaptureDecline([], capture.status)) {
      console.error('PayPal capture issue:', JSON.stringify({ order: order.order_number, captureStatus: capture.status }));
      return declined();
    }
    return NextResponse.json(
      { error: 'Payment was not completed.', status: capture.status },
      { status: 402 },
    );
  }

  // Verify the captured amount + currency match our authoritative order total.
  const expectedTotal = Number(order.total);
  const amountOk =
    capture.capturedAmount != null && Math.abs(capture.capturedAmount - expectedTotal) <= AMOUNT_TOLERANCE;
  const currencyOk = capture.capturedCurrency === CURRENCY;

  if (!amountOk || !currencyOk) {
    // Money was captured but does not match the order. Do NOT auto-fulfill —
    // record the capture details and flag for manual review.
    const { data: mismatchOrder, error: mismatchRecordError } = await service
      .from('orders')
      .update({
        payment_status: 'pending',
        payment_reference: capture.captureId,
        paypal_capture_id: capture.captureId,
        payment_response: capture.raw as object,
        internal_notes:
          `PayPal amount/currency mismatch — captured ` +
          `${capture.capturedAmount} ${capture.capturedCurrency}, expected ${expectedTotal} ${CURRENCY}. Manual review required.`,
      })
      .eq('id', order.id)
      .select('id')
      .maybeSingle();

    if (mismatchRecordError || !mismatchOrder) {
      console.error('PayPal mismatch capture persistence error:', mismatchRecordError);
      return NextResponse.json(
        {
          error: 'Payment was captured, but the order requires manual reconciliation. Do not submit payment again.',
          paymentCaptured: true,
          orderId: order.id,
        },
        { status: 500 },
      );
    }

    await service.from('admin_notifications').insert({
      type: 'order',
      title: `PayPal amount mismatch on ${order.order_number}`,
      body: `Captured ${capture.capturedAmount} ${capture.capturedCurrency}, expected ${expectedTotal} ${CURRENCY}. Capture ${capture.captureId}. Review before fulfilling.`,
      order_id: order.id,
    });

    return NextResponse.json(
      {
        error: 'Payment amount did not match the order. Our team will follow up.',
        paymentCaptured: true,
        orderId: order.id,
      },
      { status: 409 },
    );
  }

  // Persist the external money movement before attempting inventory/order
  // finalization. If the RPC fails, retries can see the capture and must not
  // create a second payable PayPal order.
  const { data: captureOrder, error: captureRecordError } = await service
    .from('orders')
    .update({
      payment_status: 'pending',
      payment_reference: capture.captureId,
      paypal_capture_id: capture.captureId,
      payment_response: capture.raw as object,
    })
    .eq('id', order.id)
    .select('id')
    .maybeSingle();

  if (captureRecordError || !captureOrder) {
    console.error('PayPal capture persistence error:', captureRecordError);
    return NextResponse.json(
      {
        error: 'Payment was captured, but the order update is still pending. Do not submit payment again.',
        paymentCaptured: true,
        orderId: order.id,
      },
      { status: 500 },
    );
  }

  // Mark paid and sell the items (atomic + idempotent). The RPC also locks product
  // rows so concurrent captures for the same item serialize here — the second caller
  // sees item_conflict=true if the first already sold the item.
  const { data: rpcData, error: rpcError } = await service.rpc('capture_paypal_order', {
    p_order_id: order.id,
    p_capture_id: capture.captureId,
    p_payment_response: capture.raw as object,
  });

  if (rpcError) {
    console.error('capture_paypal_order RPC error:', rpcError);
    return NextResponse.json(
      {
        error: 'Payment was captured, but the order update is still pending. Do not submit payment again.',
        paymentCaptured: true,
        orderId: order.id,
      },
      { status: 500 },
    );
  }

  const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;

  if (result?.item_conflict) {
    // Another buyer completed payment first. The order is flagged in the DB for
    // manual refund — alert an admin (the buyer's money was captured) and surface
    // a clear message to this buyer.
    await notifyItemConflict(service, {
      id: order.id,
      orderNumber: (result?.order_number as string | undefined) ?? order.order_number,
      captureId: capture.captureId,
    });
    return NextResponse.json(
      {
        error: 'Sorry, one or more items in your order were just purchased by another buyer. Our team will contact you to process a full refund.',
        paymentCaptured: true,
        itemConflict: true,
        orderId: order.id,
      },
      { status: 409 },
    );
  }

  // { expire: 0 } forces immediate expiration — 'max' uses stale-while-revalidate,
  // which would serve the buyer their own just-sold item as available on the very
  // next /shop visit (only revalidating in the background for the visit after that).
  revalidateTag('shop-catalog', { expire: 0 }); // purchased items are now 'sold' in the gallery

  // Phase 2 auto-delist (etsy-sync-plan/03-sync-lifecycle.md Flow 3 and
  // ebay-sync-plan/03-sync-lifecycle.md Flow 3). Runs after the response, so it
  // still never blocks the buyer's confirmation — but as work the runtime
  // drains rather than a floating promise the freeze kills.
  //
  // 🔴 This path is the one that matters most. A WEBSITE sale has no safety
  // net: when the August misses happened the items had sold on eBay, so eBay
  // zeroed its own quantity and covered for us. Nothing covers a sale made
  // here — a missed delist leaves the item live and buyable on both channels.
  //
  // Deep Field mirrors the sold flip too. The status change happens inside the
  // capture_paypal_order database function, so this HTTP path is the only place
  // application code learns about it — adminRevalidateProduct(s) is never called
  // here, and hooking only there would leave Deep Field showing sold items as
  // available.
  const { data: capturedItems } = await service.from('order_items').select('product_id').eq('order_id', order.id);
  const capturedProductIds = (capturedItems ?? []).map((item) => item.product_id).filter((id): id is string => Boolean(id));
  scheduleProductStatusHooks(capturedProductIds);

  // Invoice upsert (idempotent) + auto receipt email. Shared with the webhook
  // backstop so a browser-death capture still produces both. Best-effort — the
  // payment already succeeded, so a failure here must not fail the capture. Only
  // runs on this fresh capture (an already-paid order returns earlier).
  await finalizePaidOrder(service, order.id);

  return NextResponse.json({
    success: true,
    orderId: order.id,
    orderNumber: (result?.order_number as string | undefined) ?? order.order_number,
  });
}
