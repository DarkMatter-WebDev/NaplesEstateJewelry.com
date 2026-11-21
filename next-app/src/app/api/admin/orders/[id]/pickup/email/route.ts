import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { isMissingPickupTable, isOrderId, ORDER_PICKUP_COLUMNS, ORDER_PICKUP_TABLE, type OrderPickupRow } from '@/lib/order-pickup';
import { loadPickupOrder, sendPickupEmail } from '@/lib/order-pickup-server';

/**
 * "Email Now" / "Email Again" on the Pickup card: emails the BUYER their
 * pickup copy (`order-pickup-email.ts`) and records it in the order's email
 * history. Never the ID photo, ID details or the signature picture.
 */
export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

export async function POST(_req: Request, context: Context) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { id } = await context.params;
  if (!isOrderId(id)) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });

  const [order, { data, error }] = await Promise.all([
    loadPickupOrder(admin.supabase, id),
    admin.supabase.from(ORDER_PICKUP_TABLE).select(ORDER_PICKUP_COLUMNS).eq('order_id', id).maybeSingle(),
  ]);
  if (!order || order.deleted_at) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  if (error && !isMissingPickupTable(error)) console.error('[order-pickup] read failed', error.message);
  if (!data) return NextResponse.json({ error: 'Log the pickup first.' }, { status: 409 });

  const sent = await sendPickupEmail({
    supabase: admin.supabase,
    order,
    pickup: data as unknown as OrderPickupRow,
    sentBy: { id: admin.user.id, email: admin.user.email ?? null },
  });
  if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: 502 });
  return NextResponse.json({ pickup: sent.pickup, email: sent.email });
}
