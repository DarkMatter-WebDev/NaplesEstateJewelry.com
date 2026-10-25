import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { dealDetailColumns, normalizeDealDraft } from '@/lib/text-alerts/deal-input';

/**
 * GET: the deals list (newest first) + the confirmed count. POST: create a
 * draft — every box may still be empty, so photos can come first (2026-10-24);
 * Preview checks what the deal needs.
 */
export const runtime = 'nodejs';

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  const service = createServiceClient();
  const [{ data: deals, error: dealsError }, { count: confirmed }, { count: pending }] = await Promise.all([
    service.from('text_deals').select('*').order('created_at', { ascending: false }).limit(100),
    service.from('homepage_subscribers').select('id', { count: 'exact', head: true }).eq('sms_status', 'confirmed'),
    service.from('homepage_subscribers').select('id', { count: 'exact', head: true }).eq('sms_status', 'pending'),
  ]);
  if (dealsError) return NextResponse.json({ error: dealsError.message }, { status: 500 });
  return NextResponse.json({ deals: deals ?? [], confirmed: confirmed ?? 0, pending: pending ?? 0 });
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const body = await req.json().catch(() => null);
  const input = normalizeDealDraft(body);
  if ('error' in input) return NextResponse.json({ error: input.error }, { status: 400 });

  const service = createServiceClient();
  const { data, error } = await service
    .from('text_deals')
    .insert({
      title: input.value.title,
      price_text: input.value.price_text,
      message: input.value.message,
      ...dealDetailColumns(input.value),
      status: 'draft',
      created_by: admin.user.id,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deal: data });
}
