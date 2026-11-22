import { NextResponse } from 'next/server';
import { saveOrderLanguage } from '@/lib/order-language-server';
import { normalizeOrderLanguage } from '@/lib/order-language';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { generateOrderNumber } from '@/lib/sales';
import { addSellerToMailingList } from '@/lib/buy-receipt-mailing-list';
import { sendBuyReceiptEmail } from '@/lib/buy-receipt-mailer';
import {
  BUY_RECEIPT_COLUMNS,
  BUY_RECEIPT_TRADE_CREDIT,
  buyReceiptContentColumns,
  buyReceiptLanguage,
  type BuyReceiptPayment,
  type BuyReceiptRow,
} from '@/lib/buy-receipts';
import { buildSaleItemPayloads, createOrderErrorStatus, recordOfflinePayment } from '@/lib/instant-sale-server';
import {
  SALE_TRADE_CREDIT,
  inStorePaymentMethodValue,
  salePaymentReference,
  type SalePaidBy,
  type SalePaymentPart,
  type SaleTradeIn,
} from '@/lib/in-store-sale';
import { normalizeTradeInSaleInput } from '@/lib/trade-in-sale';
import { formatCurrency } from '@/types/sales';
import { loadPaperReceipt } from '@/lib/order-receipt-paper-server';
import { queueSalePrint } from '@/lib/sale-print-requests-server';

/**
 * POST: a Trade-in sale (owner, 2026-11-21) — the gold the customer sold and
 * what they bought, saved together. Two records that name each other:
 *   1. the BUY RECEIPT, inserted exactly as Buy Receipts saves one (the
 *      admin's own client, so its RLS policy and grant apply — never the
 *      service role), first payment = the trade-in credit;
 *   2. the SALE, recorded exactly as an In-store sale (`create_paypal_order`
 *      then `recordOfflinePayment`), first payment = the trade-in credit
 *      carrying the BUY number, plus `payment_response.trade` for its receipt;
 *   3. the receipt's credit line gets the sale's order number and id;
 *   4. the emails (both, with one "Email copy" box) and the paper, as asked.
 * Anything that stops the sale before it is paid removes the receipt again, so
 * a failed save leaves neither record. The ID photo and thumbprint are sent by
 * the screen afterwards, to the receipt's own routes — as on Buy Receipts.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const input = normalizeTradeInSaleInput(body);
  if ('error' in input) return NextResponse.json({ error: input.error }, { status: 400 });
  const trade = input.value;
  const { sale, balance } = trade;
  const email = admin.user.email ?? null;
  const supabase = admin.supabase;

  const service = createServiceClient();
  // The listed items are checked BEFORE anything is written.
  const lines = await buildSaleItemPayloads(service, sale.items);
  if ('error' in lines) return NextResponse.json({ error: lines.error }, { status: lines.status });

  // 1. The buy receipt.
  const { data: inserted, error: insertError } = await supabase
    .from('buy_receipts')
    .insert({ ...buyReceiptContentColumns(trade.receipt), created_by: admin.user.id, created_by_email: email, updated_by_email: email })
    .select(BUY_RECEIPT_COLUMNS)
    .single();
  if (insertError || !inserted) {
    console.error('[trade-in-sales] receipt insert failed', insertError?.message);
    return NextResponse.json({ error: 'Could not save the buy receipt. Nothing was recorded.' }, { status: 500 });
  }
  let receipt = inserted as unknown as BuyReceiptRow;

  /** The sale did not go through: take the receipt back out, so nothing is half-recorded. */
  async function undoReceipt(): Promise<string> {
    const { error } = await supabase.from('buy_receipts').delete().eq('id', receipt.id);
    if (error) {
      console.error('[trade-in-sales] receipt rollback failed', error.message);
      return ` Buy receipt ${receipt.receipt_number} was saved but could not be removed — void it in Buy Receipts.`;
    }
    return ' Nothing was recorded.';
  }

  // 2. The sale.
  const tradePart: SalePaymentPart = { method: SALE_TRADE_CREDIT, amount: balance.credit, reference: receipt.receipt_number };
  const parts: SalePaymentPart[] = [tradePart, ...sale.collect];
  const paidBy: SalePaidBy = parts.length > 1 ? 'split' : SALE_TRADE_CREDIT;
  const tradeIn: SaleTradeIn = {
    buy_receipt_id: receipt.id,
    receipt_number: receipt.receipt_number,
    description: trade.tradeDescription,
    value: trade.receipt.total,
  };
  const reference = salePaymentReference('In store', paidBy, parts);
  const orderNumber = generateOrderNumber();
  const internalNotes = [
    `Trade-in sale · ${receipt.receipt_number} (${formatCurrency(trade.receipt.total)} received)`,
    reference,
    balance.payout > 0 ? `Paid to the seller: ${formatCurrency(balance.payout)} (on ${receipt.receipt_number})` : null,
    `recorded by ${email ?? 'admin'}`,
    sale.note,
  ].filter(Boolean).join(' | ');

  const { data: created, error: createError } = await service.rpc('create_paypal_order', {
    order_payload: {
      order_number: orderNumber,
      user_id: null,
      customer_name: sale.customer.name,
      customer_email: sale.customer.email,
      customer_phone: sale.customer.phone,
      subtotal: sale.subtotal,
      tax: sale.tax,
      shipping_fee: 0,
      discount: 0,
      total: sale.total,
      payment_method: inStorePaymentMethodValue(paidBy),
      shipping_method: 'pickup',
      shipping_address: null,
      billing_address: null,
      internal_notes: internalNotes,
      customer_notes: null,
    },
    items_payload: lines.payloads,
  });
  const createdRow = Array.isArray(created) ? created[0] : created;
  const orderId = createdRow?.order_id as string | undefined;
  if (createError || !orderId) {
    if (createError) console.error('[trade-in-sales] create_paypal_order error:', createError);
    const undone = await undoReceipt();
    return NextResponse.json(
      { error: `${createError?.message ?? 'Could not create the sale.'}${undone}` },
      { status: createError ? createOrderErrorStatus(createError.message) : 500 },
    );
  }

  // The buy receipt's "Seller's copy" switch sets both receipts (2026-11-21):
  // a Spanish seller's copy means a Spanish sale receipt too.
  await saveOrderLanguage(service, orderId, normalizeOrderLanguage(receipt.seller_language));

  const paid = await recordOfflinePayment(service, {
    orderId,
    orderNumber,
    listedIds: lines.listedIds,
    paidBy,
    payments: parts,
    paymentMethodValue: inStorePaymentMethodValue(paidBy),
    reference,
    captureIdPrefix: 'in-store',
    pickedUp: true,
    note: sale.note,
    recordedBy: email,
    sendCustomerReceipt: trade.emailCopy,
    trade: tradeIn,
  });
  if (!paid.ok) {
    const undone = await undoReceipt();
    return NextResponse.json({ error: `${paid.error}${undone}`, orderId }, { status: paid.status });
  }

  // 3. The receipt names the sale.
  let linkError: string | null = null;
  const linkedPayments: BuyReceiptPayment[] = receipt.payments.map((payment, index) =>
    index === 0 && payment.method === BUY_RECEIPT_TRADE_CREDIT ? { ...payment, reference: orderNumber, order_id: orderId } : payment,
  );
  const { data: linked, error: linkFailed } = await supabase
    .from('buy_receipts')
    .update({ payments: linkedPayments, updated_by_email: email })
    .eq('id', receipt.id)
    .select(BUY_RECEIPT_COLUMNS)
    .single();
  if (linkFailed || !linked) {
    console.error('[trade-in-sales] receipt link failed', linkFailed?.message);
    linkError = `Both are saved, but ${receipt.receipt_number} does not show the sale number yet.`;
  } else {
    receipt = linked as unknown as BuyReceiptRow;
  }

  // 4. The seller's copy of the buy receipt (the sale's receipt went with step 2).
  let emailed = false;
  let emailError: string | null = null;
  if (trade.emailCopy && receipt.seller_email) {
    const sent = await sendBuyReceiptEmail({ supabase, receipt });
    if (sent.ok) {
      receipt = sent.receipt;
      emailed = true;
    } else {
      emailError = sent.error;
    }
  }
  let mailingList: 'added' | 'failed' | null = null;
  if (trade.mailingList && receipt.seller_email) {
    const added = await addSellerToMailingList({ email: receipt.seller_email, name: receipt.seller_name, locale: buyReceiptLanguage(receipt) });
    mailingList = added.ok ? 'added' : 'failed';
  }

  const flags = body ?? {};
  const sendToStation = Boolean(flags.sendToStation);
  const paper = Boolean(flags.print) || sendToStation ? await loadPaperReceipt(service, orderId) : null;
  const queued = sendToStation
    ? await queueSalePrint(supabase, service, { orderId, requestedBy: email, paper })
    : null;

  return NextResponse.json({
    receipt,
    emailed,
    emailError,
    mailingList,
    linkError,
    orderId,
    orderNumber,
    saleReceiptEmailed: paid.receiptEmailed,
    paper,
    stationRequest: queued && 'request' in queued ? queued.request : null,
    stationError: queued && 'error' in queued ? queued.error : null,
  }, { status: 201 });
}
