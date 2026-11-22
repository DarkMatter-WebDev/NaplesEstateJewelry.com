import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { BUY_RECEIPT_COLUMNS, BUY_RECEIPT_VOID_REASON_MAX, buyReceiptTrade, isReceiptId, type BuyReceiptRow } from '@/lib/buy-receipts';

/**
 * Void a receipt. It keeps its number and stays in the log (and reprints with
 * a VOID mark); it can no longer be edited and cannot be un-voided — duplicate
 * it to record the corrected purchase. Body `{ reason }`, required.
 *
 * A Trade-in receipt (2026-11-21) paid toward a sale. Its void dialog ASKS
 * whether that sale goes too (owner pick 5: ask, never silently): with
 * `alsoOrder: true` the sale moves to the Orders Recycle Bin — record-only,
 * like the order page's plain "Move to Recycle Bin" (the item stays sold; the
 * order page's "return to inventory" is the way to put it back).
 */
export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

export async function POST(req: Request, context: Context) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { id } = await context.params;
  if (!isReceiptId(id)) return NextResponse.json({ error: 'Receipt not found.' }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { reason?: unknown; alsoOrder?: unknown } | null;
  const reason = String(body?.reason ?? '').replace(/\s+/g, ' ').trim().slice(0, BUY_RECEIPT_VOID_REASON_MAX);
  if (reason.length < 3) return NextResponse.json({ error: 'Say why this receipt is being voided.' }, { status: 400 });

  const { data, error } = await admin.supabase
    .from('buy_receipts')
    .update({
      status: 'void',
      void_reason: reason,
      voided_at: new Date().toISOString(),
      voided_by: admin.user.email ?? null,
    })
    .eq('id', id)
    .eq('status', 'recorded')
    .select(BUY_RECEIPT_COLUMNS)
    .maybeSingle();

  if (error) {
    console.error('[buy-receipts] void failed', error.message);
    return NextResponse.json({ error: 'Could not void the receipt.' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'That receipt is already void, or it no longer exists.' }, { status: 409 });
  const receipt = data as unknown as BuyReceiptRow;

  const trade = buyReceiptTrade(receipt);
  let orderMoved = false;
  let orderError: string | null = null;
  if (body?.alsoOrder === true && trade?.orderId) {
    const { data: moved, error: moveError } = await admin.supabase
      .from('orders')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', trade.orderId)
      .is('deleted_at', null)
      .select('id');
    if (moveError) {
      console.error('[buy-receipts] trade sale recycle failed', moveError.message);
      orderError = `The receipt is void, but sale ${trade.orderNumber ?? ''} could not be moved to the Recycle Bin — do it from the order.`;
    } else {
      orderMoved = (moved ?? []).length > 0;
    }
  }
  return NextResponse.json({ receipt, orderMoved, orderError });
}
