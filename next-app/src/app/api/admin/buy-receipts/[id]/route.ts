import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import {
  BUY_RECEIPT_COLUMNS,
  buyReceiptContentColumns,
  isReceiptId,
  normalizeBuyReceiptInput,
  type BuyReceiptRow,
} from '@/lib/buy-receipts';

/**
 * GET: one receipt. PUT: edit it (owner ruling 2026-09-30: saved receipts are
 * editable). A VOID receipt is frozen — the route answers 409 and the database
 * guard trigger refuses the write as well; duplicate it instead.
 */
export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

// A Response body can be read once, so these are built per request, never shared.
const notFound = () => NextResponse.json({ error: 'Receipt not found.' }, { status: 404 });

export async function GET(_req: Request, context: Context) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { id } = await context.params;
  if (!isReceiptId(id)) return notFound();

  const { data } = await admin.supabase.from('buy_receipts').select(BUY_RECEIPT_COLUMNS).eq('id', id).maybeSingle();
  if (!data) return notFound();
  return NextResponse.json({ receipt: data as unknown as BuyReceiptRow });
}

export async function PUT(req: Request, context: Context) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { id } = await context.params;
  if (!isReceiptId(id)) return notFound();

  const body = await req.json().catch(() => null);
  const normalized = normalizeBuyReceiptInput(body);
  if ('error' in normalized) return NextResponse.json({ error: normalized.error }, { status: 400 });

  const { data: current } = await admin.supabase.from('buy_receipts').select('id, status').eq('id', id).maybeSingle();
  if (!current) return notFound();
  if (current.status === 'void') {
    return NextResponse.json({ error: 'A void receipt cannot be edited. Duplicate it instead.' }, { status: 409 });
  }

  const { data, error } = await admin.supabase
    .from('buy_receipts')
    .update({ ...buyReceiptContentColumns(normalized.value), updated_by_email: admin.user.email ?? null })
    .eq('id', id)
    .select(BUY_RECEIPT_COLUMNS)
    .single();

  if (error || !data) {
    console.error('[buy-receipts] update failed', error?.message);
    return NextResponse.json({ error: 'Could not save the changes.' }, { status: 500 });
  }
  return NextResponse.json({ receipt: data as unknown as BuyReceiptRow });
}
