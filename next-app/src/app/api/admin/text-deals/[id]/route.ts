import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { normalizeUsPhone } from '@/lib/subscriber-phone';
import { dealMediaUrls, dealPhotos, deleteDeal, loadDeal, markDealAvailable, markDealSold, notifyDealSold } from '@/lib/text-alerts/deals';
import { normalizeDealInput } from '@/lib/text-alerts/deal-input';

/**
 * GET: one deal with its send tally and the replies in clock order (the first
 * one flagged). PATCH: edit a draft's words, or { action: 'sold' | 'available' }.
 * DELETE: remove a past deal and its unshared pictures (never mid-send).
 */
export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: Context) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await context.params;
  const service = createServiceClient();
  const deal = await loadDeal(service, id);
  if (!deal) return NextResponse.json({ error: 'Deal not found.' }, { status: 404 });

  const [{ data: sends }, { data: replies }] = await Promise.all([
    service.from('text_deal_sends').select('status').eq('deal_id', id),
    service
      .from('text_inbound')
      .select('id, from_phone, body, num_media, received_at, forwarded_at, forward_error, auto_reply_sent_at, subscriber_id')
      .eq('deal_id', id)
      .eq('kind', 'reply')
      .order('received_at', { ascending: true })
      .limit(200),
  ]);
  const tally: Record<string, number> = {};
  for (const row of sends ?? []) tally[row.status] = (tally[row.status] ?? 0) + 1;

  // Names for the replies, from the subscriber rows.
  const subscriberIds = [...new Set((replies ?? []).map((r) => r.subscriber_id).filter((v): v is string => typeof v === 'string'))];
  const names = new Map<string, string | null>();
  if (subscriberIds.length > 0) {
    const { data: subs } = await service.from('homepage_subscribers').select('id, full_name').in('id', subscriberIds);
    for (const s of subs ?? []) names.set(s.id, s.full_name ?? null);
  }
  const seen = new Set<string>();
  const withNames = (replies ?? []).map((r) => {
    const first = !seen.has(r.from_phone) && seen.size === 0;
    seen.add(r.from_phone);
    return { ...r, name: r.subscriber_id ? names.get(r.subscriber_id) ?? null : null, first };
  });

  const card = deal.card_path ? service.storage.from('product-images').getPublicUrl(deal.card_path).data.publicUrl : null;
  // Every picture that went (or will go) out, the main one first; just the card until Preview has run.
  const media = dealMediaUrls(service, deal) ?? (card ? [card] : []);
  return NextResponse.json({ deal: { ...deal, card_url: card, photos: dealPhotos(service, deal), media_urls: media }, tally, replies: withNames });
}

export async function DELETE(_req: Request, context: Context) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await context.params;
  try {
    const result = await deleteDeal(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not delete the deal.';
    return NextResponse.json({ error: message }, { status: /not found/i.test(message) ? 404 : /still sending/i.test(message) ? 409 : 500 });
  }
}

export async function PATCH(req: Request, context: Context) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await context.params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });

  try {
    if (body.action === 'sold') {
      const soldTo = body.soldToPhone ? normalizeUsPhone(body.soldToPhone) : null;
      const deal = await markDealSold(id, { soldToPhone: soldTo, replyText: typeof body.replyText === 'string' ? body.replyText : null });
      // Buyer confirmation + "spoken for" notices — best-effort, never fails the click.
      const notified = await notifyDealSold(id);
      return NextResponse.json({ deal, notified });
    }
    if (body.action === 'available') {
      return NextResponse.json({ deal: await markDealAvailable(id) });
    }
    const service = createServiceClient();
    const current = await loadDeal(service, id);
    if (!current) return NextResponse.json({ error: 'Deal not found.' }, { status: 404 });
    if (current.status !== 'draft') return NextResponse.json({ error: 'Only a draft can be edited.' }, { status: 409 });
    const input = normalizeDealInput(body);
    if ('error' in input) return NextResponse.json({ error: input.error }, { status: 400 });
    // New words need a new picture (the price and line are drawn on it).
    const { data, error: updateError } = await service
      .from('text_deals')
      .update({ ...input.value, card_path: null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (updateError) throw new Error(updateError.message);
    return NextResponse.json({ deal: data });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not update the deal.' }, { status: 500 });
  }
}
