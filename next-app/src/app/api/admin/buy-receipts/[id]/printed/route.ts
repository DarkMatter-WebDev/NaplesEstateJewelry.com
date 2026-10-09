import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { BUY_RECEIPT_COLUMNS, isReceiptId, type BuyReceiptRow } from '@/lib/buy-receipts';

/**
 * Records a print made on THIS computer ("Print here"). The Print Station does
 * not call this — it writes its own bookkeeping straight to Supabase so it
 * costs no function invocations. Body `{ copies }` (1–5, default 1).
 */
export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

export async function POST(req: Request, context: Context) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { id } = await context.params;
  if (!isReceiptId(id)) return NextResponse.json({ error: 'Receipt not found.' }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { copies?: unknown } | null;
  const requested = Number(body?.copies ?? 1);
  const copies = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), 5) : 1;

  const { data: current } = await admin.supabase.from('buy_receipts').select('id, status, print_count').eq('id', id).maybeSingle();
  if (!current) return NextResponse.json({ error: 'Receipt not found.' }, { status: 404 });
  // A draft is never printed (2026-10-09), so it has no print to record.
  if (current.status === 'draft') {
    return NextResponse.json({ error: 'Finish the draft before printing it.' }, { status: 409 });
  }

  const { data, error } = await admin.supabase
    .from('buy_receipts')
    .update({ printed_at: new Date().toISOString(), print_count: (current.print_count ?? 0) + copies })
    .eq('id', id)
    .select(BUY_RECEIPT_COLUMNS)
    .single();

  if (error || !data) {
    console.error('[buy-receipts] printed mark failed', error?.message);
    return NextResponse.json({ error: 'Printed, but the log could not be updated.' }, { status: 500 });
  }
  return NextResponse.json({ receipt: data as unknown as BuyReceiptRow });
}
