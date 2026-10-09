import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { sendBuyReceiptEmail } from '@/lib/buy-receipt-mailer';
import { BUY_RECEIPT_COLUMNS, isReceiptId, type BuyReceiptRow } from '@/lib/buy-receipts';

/**
 * "Email to seller": sends the seller's copy of a receipt to the email on the
 * receipt (or `{ to }` in the body to send it somewhere else), and records
 * when and to whom. Refuses a void receipt — nothing worth mailing.
 */
export const runtime = 'nodejs';
export const maxDuration = 30;

type Context = { params: Promise<{ id: string }> };

export async function POST(req: Request, context: Context) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { id } = await context.params;
  if (!isReceiptId(id)) return NextResponse.json({ error: 'Receipt not found.' }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { to?: unknown } | null;
  const { data } = await admin.supabase.from('buy_receipts').select(BUY_RECEIPT_COLUMNS).eq('id', id).maybeSingle();
  if (!data) return NextResponse.json({ error: 'Receipt not found.' }, { status: 404 });
  const receipt = data as unknown as BuyReceiptRow;
  if (receipt.status === 'void') {
    return NextResponse.json({ error: 'A void receipt is not emailed.' }, { status: 409 });
  }
  // A draft has no items or total yet (2026-10-09): the seller's copy goes out when it is finished.
  if (receipt.status === 'draft') {
    return NextResponse.json({ error: 'Finish the draft before emailing it.' }, { status: 409 });
  }

  const result = await sendBuyReceiptEmail({
    supabase: admin.supabase,
    receipt,
    to: typeof body?.to === 'string' ? body.to : null,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ receipt: result.receipt, to: result.to });
}
