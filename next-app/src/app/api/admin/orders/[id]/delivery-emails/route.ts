import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { saveDeliveryEmailSetting } from '@/lib/order-delivery-emails-server';

/**
 * "Send customer shipping updates" (2026-11-24): turn this order's automatic
 * carrier emails on or off. Called by Save Fulfillment (Mark Shipped / Edit
 * Shipping Details) when the box differs from the saved setting, and by the
 * Delivery line's Turn off / Turn on button.
 */
export const runtime = 'nodejs';

interface Props {
  params: Promise<{ id: string }>;
}

export async function PUT(req: Request, { params }: Props) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  if (typeof body?.on !== 'boolean') {
    return NextResponse.json({ error: 'Send { "on": true } or { "on": false }.' }, { status: 400 });
  }

  const result = await saveDeliveryEmailSetting(createServiceClient(), id, body.on);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ setting: result.setting });
}
