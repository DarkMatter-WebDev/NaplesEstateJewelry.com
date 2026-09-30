import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { BUY_RECEIPT_COLUMNS, BUY_RECEIPT_VOID_REASON_MAX, isReceiptId, type BuyReceiptRow } from '@/lib/buy-receipts';

/**
 * Void a receipt. It keeps its number and stays in the log (and reprints with
 * a VOID mark); it can no longer be edited and cannot be un-voided — duplicate
 * it to record the corrected purchase. Body `{ reason }`, required.
 */
export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

export async function POST(req: Request, context: Context) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { id } = await context.params;
  if (!isReceiptId(id)) return NextResponse.json({ error: 'Receipt not found.' }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { reason?: unknown } | null;
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
  return NextResponse.json({ receipt: data as unknown as BuyReceiptRow });
}
