import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { BUY_RECEIPT_COLUMNS, isReceiptId, resolvePrintCopies, type BuyReceiptRow } from '@/lib/buy-receipts';

/**
 * "Send to the desktop printer": stamps a print request the Print Station picks
 * up on its next poll. Body `{ plain, withId }` = how many copies without and
 * with the seller's ID photo; a with-ID copy is dropped when there is no photo.
 * Re-sending clears any earlier claim, so a second click prints again.
 * Allowed on a void receipt — it prints with the VOID mark.
 */
export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

export async function POST(req: Request, context: Context) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { id } = await context.params;
  if (!isReceiptId(id)) return NextResponse.json({ error: 'Receipt not found.' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const { data: current } = await admin.supabase
    .from('buy_receipts')
    .select('id, seller_id_photo_path')
    .eq('id', id)
    .maybeSingle();
  if (!current) return NextResponse.json({ error: 'Receipt not found.' }, { status: 404 });

  const copies = resolvePrintCopies(body, Boolean(current.seller_id_photo_path));
  const { data, error } = await admin.supabase
    .from('buy_receipts')
    .update({
      print_requested_at: new Date().toISOString(),
      print_requested_by: admin.user.email ?? null,
      print_copies_plain: copies.plain,
      print_copies_with_id: copies.withId,
      print_claimed_at: null,
      print_claimed_by: null,
    })
    .eq('id', id)
    .select(BUY_RECEIPT_COLUMNS)
    .single();

  if (error || !data) {
    console.error('[buy-receipts] print request failed', error?.message);
    return NextResponse.json({ error: 'Could not send it to the printer.' }, { status: 500 });
  }
  return NextResponse.json({ receipt: data as unknown as BuyReceiptRow });
}
