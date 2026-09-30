import 'server-only';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/service';
import { PRODUCT_IMAGES_BUCKET } from '@/lib/product-image-storage';
import { encodeProductImageToWebp } from '@/lib/product-image-encode';
import { brandMediaUrl, twilioConfigured } from './config';
import { renderDealCard } from './card';
import { dealText, DEFAULT_SOLD_REPLY, soldNoticeText, winnerText } from './messages';
import { sendTwilioMessage, TwilioError } from './twilio';

/**
 * Text deals — pieces that never reach the website (owner, 2026-09-15):
 * a phone photo, a price, one line, the owner's message → a picture message
 * to every CONFIRMED number. The reply is the claim.
 *
 * Send discipline (memory: after-is-best-effort-on-netlify): one queued row
 * per recipient is written FIRST, each row flips to sent/failed as Twilio
 * answers, and anything still queued when the function is cut off is
 * finished by the 15-minute sweep. Nothing here can double-send.
 */
export const TEXT_DEALS_PREFIX = 'text-deals';
/** Sends per request — well inside Netlify's 60 s synchronous cap at ~0.3 s each. */
export const SEND_PASS_LIMIT = 40;

export type DealStatus = 'draft' | 'sending' | 'sent' | 'sold';

export type DealRow = {
  id: string;
  title: string;
  price_text: string;
  message: string;
  photo_path: string | null;
  card_path: string | null;
  status: DealStatus;
  recipients_count: number;
  sent_at: string | null;
  sold_at: string | null;
  sold_to_phone: string | null;
  sold_reply_text: string | null;
  created_at: string;
  updated_at: string;
};

export type SendPassResult = {
  attempted: number;
  sent: number;
  failed: number;
  remaining: number;
  finished: boolean;
  notConfigured: boolean;
};

function publicUrl(service: SupabaseClient, path: string): string {
  const { data } = service.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('Could not resolve the deal picture URL.');
  return data.publicUrl;
}

function safeId(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, '_');
}

/** Store the owner's photo as WebP under the deal (the site's upload rule). */
export async function storeDealPhoto(service: SupabaseClient, dealId: string, input: Buffer): Promise<{ path: string; url: string }> {
  const encoded = await encodeProductImageToWebp(input, { maxEdge: 2048, quality: 82 });
  const hash = createHash('sha256').update(encoded.buffer).digest('hex').slice(0, 12);
  const path = `${TEXT_DEALS_PREFIX}/${safeId(dealId)}/photo-${hash}.webp`;
  const { error } = await service.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(path, encoded.buffer, { contentType: 'image/webp', cacheControl: '31536000', upsert: true });
  if (error) throw new Error(`Could not store the deal photo: ${error.message}`);
  return { path, url: publicUrl(service, path) };
}

export async function readStoredPhoto(service: SupabaseClient, path: string): Promise<Buffer> {
  const { data, error } = await service.storage.from(PRODUCT_IMAGES_BUCKET).download(path);
  if (error || !data) throw new Error(`Could not read the deal photo: ${error?.message ?? 'missing'}`);
  return Buffer.from(await data.arrayBuffer());
}

/** Render + store the picture message for a deal; returns its public URL. */
export async function buildDealCard(service: SupabaseClient, deal: DealRow): Promise<{ path: string; url: string; bytes: number }> {
  if (!deal.photo_path) throw new Error('Add a photo before sending.');
  const photo = await readStoredPhoto(service, deal.photo_path);
  const card = await renderDealCard(photo, { price: deal.price_text, line: deal.title, badge: 'First reply wins' });
  const hash = createHash('sha256').update(card.jpeg).digest('hex').slice(0, 12);
  const path = `${TEXT_DEALS_PREFIX}/${safeId(deal.id)}/card-${hash}.jpg`;
  const { error } = await service.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(path, card.jpeg, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: true });
  if (error) throw new Error(`Could not store the deal picture: ${error.message}`);
  const { error: updateError } = await service
    .from('text_deals')
    .update({ card_path: path, updated_at: new Date().toISOString() })
    .eq('id', deal.id);
  if (updateError) throw new Error(`Could not save the deal picture: ${updateError.message}`);
  return { path, url: publicUrl(service, path), bytes: card.bytes };
}

export async function loadDeal(service: SupabaseClient, dealId: string): Promise<DealRow | null> {
  const { data, error } = await service.from('text_deals').select('*').eq('id', dealId).maybeSingle<DealRow>();
  if (error) throw new Error(`Could not load the deal: ${error.message}`);
  return data ?? null;
}

/** Confirmed numbers only — nothing else is ever texted a deal. */
export async function listConfirmedRecipients(service: SupabaseClient): Promise<Array<{ id: string; phone_e164: string }>> {
  const { data, error } = await service
    .from('homepage_subscribers')
    .select('id, phone_e164')
    .eq('sms_status', 'confirmed')
    .not('phone_e164', 'is', null);
  if (error) throw new Error(`Could not load confirmed numbers: ${error.message}`);
  return (data ?? []).filter((row): row is { id: string; phone_e164: string } => typeof row.phone_e164 === 'string');
}

/**
 * Queue the deal for everyone confirmed, then run the first send pass.
 * Idempotent: a second call adds no rows (unique deal + phone) and just
 * continues sending.
 */
export async function startDealSend(dealId: string): Promise<SendPassResult> {
  const service = createServiceClient();
  const deal = await loadDeal(service, dealId);
  if (!deal) throw new Error('Deal not found.');
  if (deal.status === 'sold') throw new Error('This deal is marked sold.');
  if (!deal.card_path) await buildDealCard(service, deal);

  const recipients = await listConfirmedRecipients(service);
  if (recipients.length === 0) throw new Error('Nobody has confirmed text alerts yet.');

  const rows = recipients.map((r) => ({ deal_id: dealId, subscriber_id: r.id, phone_e164: r.phone_e164, status: 'queued' }));
  const { error: queueError } = await service
    .from('text_deal_sends')
    .upsert(rows, { onConflict: 'deal_id,phone_e164', ignoreDuplicates: true });
  if (queueError) throw new Error(`Could not queue the sends: ${queueError.message}`);

  const { error: statusError } = await service
    .from('text_deals')
    .update({ status: 'sending', recipients_count: recipients.length, updated_at: new Date().toISOString() })
    .eq('id', dealId)
    .in('status', ['draft', 'sending', 'sent']);
  if (statusError) throw new Error(`Could not start the deal: ${statusError.message}`);

  return runDealSendPass(dealId, SEND_PASS_LIMIT);
}

/** Send up to `limit` queued rows for a deal; marks the deal sent when none remain. */
export async function runDealSendPass(dealId: string, limit = SEND_PASS_LIMIT): Promise<SendPassResult> {
  const service = createServiceClient();
  const deal = await loadDeal(service, dealId);
  if (!deal) throw new Error('Deal not found.');
  const result: SendPassResult = { attempted: 0, sent: 0, failed: 0, remaining: 0, finished: false, notConfigured: false };
  if (!twilioConfigured()) {
    result.notConfigured = true;
    return result;
  }
  if (!deal.card_path) throw new Error('The deal has no picture yet.');
  const mediaUrl = publicUrl(service, deal.card_path);
  const body = dealText({ title: deal.title, price: deal.price_text, message: deal.message });

  const { data: queued, error } = await service
    .from('text_deal_sends')
    .select('id, phone_e164, subscriber_id')
    .eq('deal_id', dealId)
    .eq('status', 'queued')
    .order('id', { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Could not read the queue: ${error.message}`);

  for (const row of queued ?? []) {
    result.attempted += 1;
    // Claim the row first; a second pass running at the same time skips it.
    const { data: claimed } = await service
      .from('text_deal_sends')
      .update({ status: 'sending', updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('status', 'queued')
      .select('id');
    if (!claimed || claimed.length === 0) continue;
    try {
      const sent = await sendTwilioMessage({ to: row.phone_e164, body, mediaUrl });
      await service
        .from('text_deal_sends')
        .update({ status: 'sent', message_sid: sent.sid, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', row.id);
      if (row.subscriber_id) {
        await service.from('homepage_subscribers').update({ sms_last_deal_id: dealId }).eq('id', row.subscriber_id);
      }
      result.sent += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Send failed.';
      const code = err instanceof TwilioError ? err.code : null;
      await service
        .from('text_deal_sends')
        .update({ status: 'failed', error_code: code == null ? null : String(code), error_message: message, updated_at: new Date().toISOString() })
        .eq('id', row.id);
      result.failed += 1;
    }
  }

  const { count } = await service
    .from('text_deal_sends')
    .select('id', { count: 'exact', head: true })
    .eq('deal_id', dealId)
    .eq('status', 'queued');
  result.remaining = count ?? 0;
  if (result.remaining === 0) {
    result.finished = true;
    await service
      .from('text_deals')
      .update({ status: 'sent', sent_at: deal.sent_at ?? new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', dealId)
      .eq('status', 'sending');
  }
  return result;
}

/** A test to one number (the owner's cell); logged, never counted as a deal send. */
export async function sendDealTest(dealId: string, to: string): Promise<{ sid: string }> {
  const service = createServiceClient();
  const deal = await loadDeal(service, dealId);
  if (!deal) throw new Error('Deal not found.');
  if (!twilioConfigured()) throw new Error('Twilio is not configured yet.');
  const card = deal.card_path ? { url: publicUrl(service, deal.card_path) } : await buildDealCard(service, deal);
  const body = dealText({ title: deal.title, price: deal.price_text, message: deal.message });
  const sent = await sendTwilioMessage({ to, body, mediaUrl: card.url });
  await service.from('text_system_messages').insert({ kind: 'deal_test', to_phone: to, deal_id: dealId, message_sid: sent.sid, status: sent.status });
  return { sid: sent.sid };
}

export async function markDealSold(dealId: string, input: { soldToPhone?: string | null; replyText?: string | null }): Promise<DealRow> {
  const service = createServiceClient();
  const { data, error } = await service
    .from('text_deals')
    .update({
      status: 'sold',
      sold_at: new Date().toISOString(),
      sold_to_phone: input.soldToPhone ?? null,
      sold_reply_text: input.replyText?.trim() || DEFAULT_SOLD_REPLY,
      updated_at: new Date().toISOString(),
    })
    .eq('id', dealId)
    .select('*')
    .single<DealRow>();
  if (error || !data) throw new Error(`Could not mark the deal sold: ${error?.message ?? 'no row'}`);
  return data;
}

export type SoldNotifyOutcome = {
  winner: 'sent' | 'already' | 'failed' | 'none';
  others: { sent: number; failed: number; already: number };
};

/**
 * The texts that go out when a deal is marked sold (owner, 2026-09-17):
 *   - the buyer (`sold_to_phone`) gets "It's yours …";
 *   - everyone else the deal was delivered to gets the "spoken for" line.
 * Both are picture messages (brand logo) so they stay in the one thread.
 * Idempotent per phone via `text_system_messages` (kinds `deal_winner` /
 * `deal_sold`): clicking Mark sold twice, or Mark available → Mark sold
 * again, never texts anyone twice. Best-effort — a failed send is logged on
 * its row and never fails the Mark sold click. Sends run in batches of 10.
 */
export async function notifyDealSold(dealId: string): Promise<SoldNotifyOutcome> {
  const outcome: SoldNotifyOutcome = { winner: 'none', others: { sent: 0, failed: 0, already: 0 } };
  if (!twilioConfigured()) return outcome;
  const service = createServiceClient();
  const deal = await loadDeal(service, dealId);
  if (!deal || deal.status !== 'sold') return outcome;

  const { data: priorRows } = await service
    .from('text_system_messages')
    .select('kind, to_phone')
    .eq('deal_id', dealId)
    .in('kind', ['deal_winner', 'deal_sold']);
  const already = new Set((priorRows ?? []).map((row) => `${row.kind}:${row.to_phone}`));
  const mediaUrl = brandMediaUrl();

  async function sendOne(kind: 'deal_winner' | 'deal_sold', to: string, body: string): Promise<'sent' | 'failed' | 'already'> {
    if (already.has(`${kind}:${to}`)) return 'already';
    try {
      const sent = await sendTwilioMessage({ to, body, mediaUrl });
      await service.from('text_system_messages').insert({ kind, to_phone: to, deal_id: dealId, message_sid: sent.sid, status: sent.status });
      return 'sent';
    } catch (error) {
      const message = error instanceof Error ? error.message : 'send failed';
      await service.from('text_system_messages').insert({ kind, to_phone: to, deal_id: dealId, status: 'failed', error: message });
      console.error(`[text-alerts] ${kind} to ${to} failed:`, message);
      return 'failed';
    }
  }

  const winner = deal.sold_to_phone;
  if (winner) {
    outcome.winner = await sendOne('deal_winner', winner, winnerText({ title: deal.title, price: deal.price_text }));
  }

  // Everyone the deal actually reached (accepted by Twilio or delivered), minus the buyer.
  const { data: sends } = await service
    .from('text_deal_sends')
    .select('phone_e164, status')
    .eq('deal_id', dealId)
    .in('status', ['sent', 'delivered']);
  const others = Array.from(new Set((sends ?? []).map((row) => row.phone_e164 as string).filter((phone) => phone && phone !== winner)));
  const notice = soldNoticeText(deal.sold_reply_text);
  for (let i = 0; i < others.length; i += 10) {
    const results = await Promise.all(others.slice(i, i + 10).map((phone) => sendOne('deal_sold', phone, notice)));
    for (const result of results) outcome.others[result] += 1;
  }
  return outcome;
}

/** The message a reopened deal starts with (the owner edits it before sending). */
export const REOPEN_MESSAGE = 'Back available - the earlier sale fell through. First reply takes it. Pickup at our Naples showroom or we ship.';

/**
 * "Reopen — edit & resend" (owner, 2026-09-18): when a sale falls through,
 * the deal goes out again as a NEW draft that copies the title, price and
 * photo (same stored object), with a fresh message the owner can edit. A new
 * row — not a status flip — because every send is once-per-phone-per-deal
 * (`text_deal_sends`), replies attach to a subscriber's LAST deal, and the
 * sold deal keeps its history. The old row stays as it was.
 */
export async function reopenDealAsDraft(dealId: string): Promise<DealRow> {
  const service = createServiceClient();
  const source = await loadDeal(service, dealId);
  if (!source) throw new Error('Deal not found.');
  const { data, error } = await service
    .from('text_deals')
    .insert({
      title: source.title,
      price_text: source.price_text,
      message: REOPEN_MESSAGE,
      photo_path: source.photo_path,
      card_path: null,
      status: 'draft',
      sold_reply_text: source.sold_reply_text,
    })
    .select('*')
    .single<DealRow>();
  if (error || !data) throw new Error(`Could not reopen the deal: ${error?.message ?? 'no row'}`);
  return data;
}

/**
 * Delete a past deal (owner, 2026-09-18). Refused while it is still sending.
 * Its send rows go with it (cascade); replies and system messages keep their
 * rows with `deal_id` cleared (set null). The stored photo/picture objects are
 * removed only when no OTHER deal still points at them (a reopened copy
 * shares the photo), so the storage GC reference set stays honest.
 */
export async function deleteDeal(dealId: string): Promise<{ removedObjects: number }> {
  const service = createServiceClient();
  const deal = await loadDeal(service, dealId);
  if (!deal) throw new Error('Deal not found.');
  if (deal.status === 'sending') throw new Error('This deal is still sending — wait for it to finish, then delete it.');

  const candidates = [deal.photo_path, deal.card_path].filter((p): p is string => Boolean(p));
  let removable: string[] = [];
  if (candidates.length > 0) {
    const { data: others } = await service
      .from('text_deals')
      .select('photo_path, card_path')
      .neq('id', dealId);
    const stillUsed = new Set<string>();
    for (const row of others ?? []) {
      if (row.photo_path) stillUsed.add(row.photo_path);
      if (row.card_path) stillUsed.add(row.card_path);
    }
    removable = candidates.filter((p) => !stillUsed.has(p));
  }

  const { error } = await service.from('text_deals').delete().eq('id', dealId);
  if (error) throw new Error(`Could not delete the deal: ${error.message}`);
  if (removable.length > 0) {
    const { error: storageError } = await service.storage.from(PRODUCT_IMAGES_BUCKET).remove(removable);
    if (storageError) console.error('[text-alerts] deal object cleanup failed', storageError.message);
  }
  return { removedObjects: removable.length };
}

export async function markDealAvailable(dealId: string): Promise<DealRow> {
  const service = createServiceClient();
  const { data, error } = await service
    .from('text_deals')
    .update({ status: 'sent', sold_at: null, sold_to_phone: null, updated_at: new Date().toISOString() })
    .eq('id', dealId)
    .eq('status', 'sold')
    .select('*')
    .single<DealRow>();
  if (error || !data) throw new Error(`Could not reopen the deal: ${error?.message ?? 'no row'}`);
  return data;
}
