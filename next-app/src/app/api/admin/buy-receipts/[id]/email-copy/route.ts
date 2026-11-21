import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { BUY_RECEIPT_COLUMNS, isReceiptId, type BuyReceiptRow } from '@/lib/buy-receipts';
import { buildBuyReceiptEmail } from '@/lib/buy-receipt-email';
import { isMissingCopyColumn, type EmailCopyResponse } from '@/lib/email-copies';

/**
 * The buy receipt's "Emailed to …" viewer (owner, 2026-11-21, mockup 2): GET
 * the seller's-copy email as last sent (`buy_receipts.emailed_html`, kept since
 * `supabase/email-copies-2026-11.sql`), or — for one emailed before that —
 * rebuilt from the receipt as it is now (`rebuilt: true`). Never the ID photo.
 * Read only.
 */
export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: Context) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { id } = await context.params;
  if (!isReceiptId(id)) return NextResponse.json({ error: 'Receipt not found.' }, { status: 404 });

  let result = await admin.supabase.from('buy_receipts').select(`${BUY_RECEIPT_COLUMNS}, emailed_html, emailed_text`).eq('id', id).maybeSingle();
  if (result.error && isMissingCopyColumn(result.error)) {
    result = await admin.supabase.from('buy_receipts').select(BUY_RECEIPT_COLUMNS).eq('id', id).maybeSingle();
  }
  if (result.error) console.error('[email-copies] receipt read failed', result.error.message);
  const receipt = result.data as unknown as (BuyReceiptRow & { emailed_html?: string | null; emailed_text?: string | null }) | null;
  if (!receipt) return NextResponse.json({ error: 'Receipt not found.' }, { status: 404 });
  if (!receipt.emailed_at) return NextResponse.json({ error: 'This receipt has not been emailed.' }, { status: 404 });

  const subject = buildBuyReceiptEmail(receipt).subject;
  if (receipt.emailed_html) {
    const body: EmailCopyResponse = { html: receipt.emailed_html, text: receipt.emailed_text ?? '', rebuilt: false, subject };
    return NextResponse.json(body);
  }
  const rebuilt = buildBuyReceiptEmail(receipt);
  const body: EmailCopyResponse = { html: rebuilt.html, text: rebuilt.text, rebuilt: true, subject: rebuilt.subject };
  return NextResponse.json(body);
}
