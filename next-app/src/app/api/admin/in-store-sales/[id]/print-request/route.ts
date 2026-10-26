import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { queueSalePrint } from '@/lib/sale-print-requests-server';

/**
 * "Send to desktop printer" on a recorded in-store sale (2026-10-26): adds one
 * `sale_print_requests` row for the Print Station. `[id]` is the ORDER id.
 * Every press prints once more; nothing here touches the order itself.
 */
export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_req: Request, context: Context) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });

  const queued = await queueSalePrint(admin.supabase, createServiceClient(), {
    orderId: id,
    requestedBy: admin.user.email ?? null,
  });
  if ('error' in queued) return NextResponse.json({ error: queued.error }, { status: queued.status });
  return NextResponse.json({ request: queued.request });
}
