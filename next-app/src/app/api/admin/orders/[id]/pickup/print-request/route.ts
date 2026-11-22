import { NextResponse } from 'next/server';
import { loadOrderLanguage } from '@/lib/order-language-server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { queueSalePrint } from '@/lib/sale-print-requests-server';
import {
  buildPickupPaper,
  isMissingPickupTable,
  isOrderId,
  isPickupCopies,
  isPickupOrder,
  ORDER_PICKUP_COLUMNS,
  ORDER_PICKUP_TABLE,
  type OrderPickupRow,
} from '@/lib/order-pickup';
import { loadPickupOrder } from '@/lib/order-pickup-server';
import { formatPickupHours } from '@/lib/order-invoice-email';
import { getStoreHours } from '@/lib/store-hours';

/**
 * "Send to Desktop Printer" on the Pickup card: one `sale_print_requests` row
 * for the Print Station, the same queue as an in-store sale receipt. The paper
 * carries the private ID photo and signature as PATHS (`data-nej-private`); the
 * station, signed in as the admin, swaps them for short-lived pictures as it
 * prints. Body: `{ copies: 'both' | 'store' | 'customer', blank?: true }`.
 */
export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

export async function POST(req: Request, context: Context) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { id } = await context.params;
  if (!isOrderId(id)) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { copies?: unknown; blank?: unknown };
  const copies = isPickupCopies(body.copies) ? body.copies : 'both';

  const [order, pickupResult, schedule] = await Promise.all([
    loadPickupOrder(admin.supabase, id),
    admin.supabase.from(ORDER_PICKUP_TABLE).select(ORDER_PICKUP_COLUMNS).eq('order_id', id).maybeSingle(),
    getStoreHours(),
  ]);
  if (!order || order.deleted_at) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  if (!isPickupOrder(order)) return NextResponse.json({ error: 'Only Local Pickup orders have a pickup sheet.' }, { status: 409 });
  if (pickupResult.error && !isMissingPickupTable(pickupResult.error)) {
    console.error('[order-pickup] read failed', pickupResult.error.message);
  }
  const pickup = body.blank === true ? null : ((pickupResult.data as unknown as OrderPickupRow | null) ?? null);
  if (!pickup && body.blank !== true) return NextResponse.json({ error: 'Log the pickup first, or print the blank sheet.' }, { status: 409 });

  const paper = buildPickupPaper(order, pickup, {
    copies,
    hoursLine: formatPickupHours(schedule),
    hoursLineEs: formatPickupHours(schedule, 'es'),
    printedAt: new Date().toISOString(),
    // The customer copy in the order's language (2026-11-21).
    language: await loadOrderLanguage(admin.supabase, id),
  });
  const queued = await queueSalePrint(admin.supabase, createServiceClient(), {
    orderId: id,
    requestedBy: admin.user.email ?? null,
    paper,
  });
  if ('error' in queued) return NextResponse.json({ error: queued.error }, { status: queued.status });
  return NextResponse.json({ request: queued.request });
}
