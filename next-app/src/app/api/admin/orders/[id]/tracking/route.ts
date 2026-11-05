import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { loadOrderTracking, registerOrderTracking } from '@/lib/order-tracking-server';

/**
 * Register (or re-check) an order's package with EasyPost — called by the
 * order page right after Mark Shipped / Edit Shipping Details, and by its
 * "Check tracking now" button. Best-effort for the caller: if this fails the
 * hourly sweep registers the package anyway.
 */
export const runtime = 'nodejs';
export const maxDuration = 30;

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(_req: Request, { params }: Props) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;

  try {
    const service = createServiceClient();
    const result = await registerOrderTracking(service, id);
    const tracking = await loadOrderTracking(service, id);
    return NextResponse.json({ ...result, tracking }, { status: result.ok ? 200 : 202 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: err instanceof Error ? err.message : 'Tracking check failed.' },
      { status: 500 },
    );
  }
}
