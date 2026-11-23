import 'server-only';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/service';
import { PRODUCT_IMAGES_BUCKET } from '@/lib/product-image-storage';
import { encodeProductImageToWebp } from '@/lib/product-image-encode';
import { brandMediaUrl, twilioConfigured } from './config';
import { renderDealCard, renderDealDetail } from './card';
import {
  DEAL_BADGE,
  dealMediaPaths,
  dealMediaPathsEs,
  dealPhotoCounter,
  dealPhotoLimitMessage,
  dealPhotoList,
  dealPhotoUpdate,
  dealPictureBudget,
  DEAL_PHOTO_MAX,
  withDealPhotoAdded,
  withDealPhotoAsMain,
  withDealPhotoRemoved,
} from './deal-photos';
import {
  dealLine,
  dealLineEs,
  dealMessageEs,
  dealMetalLabel,
  dealMetalLabelEs,
  dealReadyProblem,
  dealSizeLabel,
  dealSizeLabelEs,
  dealTitleEs,
  spanishTranslationPlan,
} from './deal-input';
import {
  dealText,
  DEFAULT_SOLD_REPLY,
  soldNoticeText,
  soldReplyFor,
  textLanguage,
  winnerText,
  type DealCopy,
  type TextLanguage,
} from './messages';
import { sendTwilioMessage, TwilioError } from './twilio';
import { translateDealWordsToSpanish } from '@/lib/ai-translate';

/**
 * Text deals — pieces that never reach the website (owner, 2026-09-15):
 * a phone photo, a price, one line, the owner's message → a picture message
 * to every CONFIRMED number. The reply is the claim.
 *
 * Since 2026-10-07 a deal holds up to five photos — one main picture with the
 * full price card and up to four detail shots with a small price strip — sent
 * as ONE message. The rules are in `deal-photos.ts`.
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
  /** The 2026-10-24 boxes; absent on a row read before `text-deals-details-2026-10.sql` ran. */
  description?: string | null;
  comparable_price_text?: string | null;
  metal?: string | null;
  purity?: string | null;
  size_text?: string | null;
  photo_path: string | null;
  card_path: string | null;
  /** Detail shots and their rendered JPEGs; absent on a row read before `text-deals-photos-2026-10.sql` ran. */
  detail_photo_paths?: string[] | null;
  detail_media_paths?: string[] | null;
  status: DealStatus;
  recipients_count: number;
  sent_at: string | null;
  sold_at: string | null;
  sold_to_phone: string | null;
  sold_reply_text: string | null;
  created_at: string;
  updated_at: string;
  /** Spanish (2026-11-22); absent on a row read before `spanish-subscribers-2026-11.sql` ran. */
  title_es?: string | null;
  size_text_es?: string | null;
  description_es?: string | null;
  message_es?: string | null;
  sold_reply_text_es?: string | null;
  card_path_es?: string | null;
  detail_media_paths_es?: string[] | null;
  es_source_hash?: string | null;
  es_machine_hash?: string | null;
};

/** Has the Spanish SQL run for this row? Every Spanish write checks it first. */
export function dealHasSpanishColumns(deal: Partial<DealRow> | null | undefined): boolean {
  return Boolean(deal && 'title_es' in deal);
}

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

export type DealPicture = { path: string; url: string; bytes: number; main: boolean };
export type DealPhoto = { path: string; url: string };

/** The deal's photos with their public URLs, the main one first (for the composer). */
export function dealPhotos(service: SupabaseClient, deal: DealRow): DealPhoto[] {
  return dealPhotoList(deal).map((path) => ({ path, url: publicUrl(service, path) }));
}

/** The rendered pictures' public URLs in sending order, or null when Preview has not run. */
export function dealMediaUrls(service: SupabaseClient, deal: DealRow): string[] | null {
  return dealMediaPaths(deal)?.map((path) => publicUrl(service, path)) ?? null;
}

/**
 * The pictures a subscriber in this language gets: the Spanish set when it is
 * rendered, otherwise the English one (never none).
 */
export function dealMediaUrlsFor(service: SupabaseClient, deal: DealRow, language: TextLanguage): string[] | null {
  if (language === 'es') {
    const spanish = dealMediaPathsEs(deal);
    if (spanish) return spanish.map((path) => publicUrl(service, path));
  }
  return dealMediaUrls(service, deal);
}

async function storeDealJpeg(service: SupabaseClient, dealId: string, kind: 'card' | 'detail' | 'card-es' | 'detail-es', jpeg: Buffer): Promise<string> {
  const hash = createHash('sha256').update(jpeg).digest('hex').slice(0, 12);
  const path = `${TEXT_DEALS_PREFIX}/${safeId(dealId)}/${kind}-${hash}.jpg`;
  const { error } = await service.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(path, jpeg, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: true });
  if (error) throw new Error(`Could not store the deal picture: ${error.message}`);
  return path;
}

/**
 * Render + store every picture the deal sends: the main photo with the full
 * price card, then each detail shot with the small price strip. What Preview
 * shows is exactly what goes out (a phone may show them in another order).
 */
export async function buildDealMedia(
  service: SupabaseClient,
  deal: DealRow,
): Promise<{ pictures: DealPicture[]; totalBytes: number; picturesEs: DealPicture[] | null; totalBytesEs: number }> {
  const [main, ...details] = dealPhotoList(deal);
  if (!main) throw new Error('Add a photo before sending.');
  // Photos may come first (2026-10-24); the boxes are checked here, before any picture is drawn.
  const problem = dealReadyProblem(deal);
  if (problem) throw new Error(problem);
  const budget = dealPictureBudget(details.length);
  // "Photo 2 of 5" on every picture of a deal with more than one — the main picture is 1.
  const total = details.length + 1;
  const sources = await Promise.all([main, ...details].map((path) => readStoredPhoto(service, path)));

  /** One set of pictures in one language — the same photos, the words on them translated (owner, 2026-11-22: "1B"). */
  async function renderSet(language: TextLanguage): Promise<DealPicture[]> {
    const line = language === 'es' ? dealLineEs(deal) : dealLine(deal);
    const suffix = language === 'es' ? '-es' : '';
    const card = await renderDealCard(sources[0], { price: deal.price_text, line, badge: DEAL_BADGE[language], counter: dealPhotoCounter(0, total, language) }, budget.card);
    const cardPath = await storeDealJpeg(service, deal.id, `card${suffix}` as 'card' | 'card-es', card.jpeg);
    const set: DealPicture[] = [{ path: cardPath, url: publicUrl(service, cardPath), bytes: card.bytes, main: true }];
    for (const [index, source] of sources.slice(1).entries()) {
      const detail = await renderDealDetail(source, { price: deal.price_text, line, counter: dealPhotoCounter(index + 1, total, language) }, budget.detail);
      const path = await storeDealJpeg(service, deal.id, `detail${suffix}` as 'detail' | 'detail-es', detail.jpeg);
      set.push({ path, url: publicUrl(service, path), bytes: detail.bytes, main: false });
    }
    return set;
  }

  const pictures = await renderSet('en');
  // The Spanish set only once its columns exist (the SQL has run).
  const picturesEs = dealHasSpanishColumns(deal) ? await renderSet('es') : null;

  const update: Record<string, unknown> = { card_path: pictures[0].path, updated_at: new Date().toISOString() };
  // Named only when the row has the column or needs it — see `dealPhotoUpdate`.
  if (details.length > 0 || Array.isArray(deal.detail_media_paths)) {
    update.detail_media_paths = pictures.slice(1).map((picture) => picture.path);
  }
  if (picturesEs) {
    update.card_path_es = picturesEs[0].path;
    update.detail_media_paths_es = picturesEs.slice(1).map((picture) => picture.path);
  }
  const { error: updateError } = await service.from('text_deals').update(update).eq('id', deal.id);
  if (updateError) throw new Error(`Could not save the deal pictures: ${updateError.message}`);
  const sum = (set: DealPicture[]) => set.reduce((total, picture) => total + picture.bytes, 0);
  return { pictures, totalBytes: sum(pictures), picturesEs, totalBytesEs: picturesEs ? sum(picturesEs) : 0 };
}

/* ── Spanish words (2026-11-22) ──────────────────────────────────────────── */

const hashWords = (parts: Array<string | null | undefined>) =>
  createHash('sha256').update(JSON.stringify(parts.map((part) => (part ?? '').trim()))).digest('hex').slice(0, 16);

/** What the Spanish was (or would be) translated from: the English boxes the owner types. */
export function dealSourceHash(deal: Partial<DealRow>): string {
  return hashWords([deal.title, deal.size_text, deal.description, deal.message]);
}

/** The Spanish boxes as they are now. */
export function dealSpanishHash(deal: Partial<DealRow>): string {
  return hashWords([deal.title_es, deal.size_text_es, deal.description_es, deal.message_es]);
}

export type SpanishWordsResult = {
  deal: DealRow;
  /** The machine translated just now. */
  translated: boolean;
  /** The English changed after the owner corrected the Spanish — kept, but worth a look. */
  stale: boolean;
  /** Why the translation did not run (not set up, timed out…); the deal still works, Spanish falls back to English words. */
  error: string | null;
};

/**
 * Fill the Spanish boxes from the English ones when they are empty, or when
 * the English changed and the owner had not corrected the Spanish (owner,
 * 2026-11-22, "2A": a deal goes out with the automatic Spanish even unread).
 * The owner's corrections are never overwritten unless `force` ("Translate
 * again"). Never throws: a failed translation is reported in `error`.
 */
export async function ensureDealSpanishWords(service: SupabaseClient, deal: DealRow, options: { force?: boolean } = {}): Promise<SpanishWordsResult> {
  if (!dealHasSpanishColumns(deal)) return { deal, translated: false, stale: false, error: null };
  const plan = spanishTranslationPlan({
    hasSpanish: Boolean(deal.title_es?.trim() || deal.message_es?.trim()),
    sourceHash: dealSourceHash(deal),
    storedSourceHash: deal.es_source_hash ?? null,
    spanishHash: dealSpanishHash(deal),
    machineHash: deal.es_machine_hash ?? null,
    force: options.force === true,
  });
  if (plan !== 'translate') return { deal, translated: false, stale: plan === 'stale', error: null };

  try {
    const words = await translateDealWordsToSpanish({
      title: deal.title ?? '',
      size_text: deal.size_text ?? '',
      description: deal.description ?? '',
      message: deal.message ?? '',
    });
    const update = {
      ...words,
      es_source_hash: dealSourceHash(deal),
      es_machine_hash: dealSpanishHash(words),
      // New words need new Spanish pictures.
      card_path_es: null,
      detail_media_paths_es: [],
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await service.from('text_deals').update(update).eq('id', deal.id).select('*').single<DealRow>();
    if (error || !data) throw new Error(error?.message ?? 'Could not save the Spanish.');
    return { deal: data, translated: true, stale: false, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Translation failed.';
    console.error('[text-alerts] Spanish translation failed', message);
    return { deal, translated: false, stale: false, error: message };
  }
}

/** Thrown for a photo change the owner can fix (limit reached, not a draft, not on the deal). */
export class DealPhotoError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'DealPhotoError';
  }
}

async function saveDealPhotos(service: SupabaseClient, deal: DealRow, list: string[]): Promise<DealRow> {
  const { data, error } = await service
    .from('text_deals')
    .update({ ...dealPhotoUpdate(list, Array.isArray(deal.detail_photo_paths), dealHasSpanishColumns(deal)), updated_at: new Date().toISOString() })
    .eq('id', deal.id)
    .eq('status', 'draft')
    .select('*')
    .maybeSingle<DealRow>();
  if (error) throw new Error(`Could not save the photos: ${error.message}`);
  if (!data) throw new DealPhotoError('The photos can only be changed before the deal is sent.', 409);
  return data;
}

function assertDraft(deal: DealRow): void {
  if (deal.status !== 'draft') throw new DealPhotoError('The photos can only be changed before the deal is sent.', 409);
}

/** Add one photo to a draft: the first is the main picture, the rest are detail shots. */
export async function addDealPhoto(service: SupabaseClient, deal: DealRow, input: Buffer): Promise<DealRow> {
  assertDraft(deal);
  const current = dealPhotoList(deal);
  if (current.length >= DEAL_PHOTO_MAX) throw new DealPhotoError(dealPhotoLimitMessage(), 409);
  const stored = await storeDealPhoto(service, deal.id, input);
  const next = withDealPhotoAdded(current, stored.path);
  if ('error' in next) throw new DealPhotoError(next.error, 409);
  return saveDealPhotos(service, deal, next.list);
}

/**
 * Remove one photo from a draft. Its stored object goes too unless another
 * deal (a reopened copy) still uses it. The rendered JPEGs are left for the
 * Storage GC: Twilio may still be fetching one for a test sent a moment ago.
 */
export async function removeDealPhoto(service: SupabaseClient, deal: DealRow, path: string): Promise<DealRow> {
  assertDraft(deal);
  const current = dealPhotoList(deal);
  if (!current.includes(path)) throw new DealPhotoError('That photo is not on this deal.', 404);
  const saved = await saveDealPhotos(service, deal, withDealPhotoRemoved(current, path));
  await removeUnsharedObjects(service, [path], deal.id);
  return saved;
}

/** "Make main": the photo swaps into the first place; it gets the full price card at the next Preview. */
export async function makeDealPhotoMain(service: SupabaseClient, deal: DealRow, path: string): Promise<DealRow> {
  assertDraft(deal);
  const current = dealPhotoList(deal);
  if (!current.includes(path)) throw new DealPhotoError('That photo is not on this deal.', 404);
  return saveDealPhotos(service, deal, withDealPhotoAsMain(current, path));
}

/** Every stored object a deal row points at: its photos and its rendered pictures (English and Spanish). */
function dealObjectPaths(row: Partial<DealRow>): string[] {
  const detailMedia = Array.isArray(row.detail_media_paths) ? row.detail_media_paths : [];
  const detailMediaEs = Array.isArray(row.detail_media_paths_es) ? row.detail_media_paths_es : [];
  return [
    ...dealPhotoList({ photo_path: row.photo_path ?? null, detail_photo_paths: row.detail_photo_paths }),
    row.card_path,
    ...detailMedia,
    row.card_path_es,
    ...detailMediaEs,
  ].filter((path): path is string => typeof path === 'string' && path.length > 0);
}

/**
 * Remove stored objects that no OTHER deal still points at (a reopened copy
 * shares its source photos). `select('*')` on purpose: the table is small and
 * the read must not depend on the detail columns existing. ⛔ If the other
 * deals cannot be read, nothing is removed — the Storage GC cleans up later.
 */
async function removeUnsharedObjects(service: SupabaseClient, candidates: string[], dealId: string): Promise<number> {
  if (candidates.length === 0) return 0;
  const { data: others, error } = await service.from('text_deals').select('*').neq('id', dealId);
  if (error) {
    console.error('[text-alerts] deal object cleanup skipped', error.message);
    return 0;
  }
  const stillUsed = new Set<string>();
  for (const row of (others as Array<Partial<DealRow>> | null) ?? []) {
    for (const path of dealObjectPaths(row)) stillUsed.add(path);
  }
  const removable = candidates.filter((p) => !stillUsed.has(p));
  if (removable.length === 0) return 0;
  const { error: storageError } = await service.storage.from(PRODUCT_IMAGES_BUCKET).remove(removable);
  if (storageError) {
    console.error('[text-alerts] deal object cleanup failed', storageError.message);
    return 0;
  }
  return removable.length;
}

export async function loadDeal(service: SupabaseClient, dealId: string): Promise<DealRow | null> {
  const { data, error } = await service.from('text_deals').select('*').eq('id', dealId).maybeSingle<DealRow>();
  if (error) throw new Error(`Could not load the deal: ${error.message}`);
  return data ?? null;
}

/** Confirmed numbers only — nothing else is ever texted a deal. Each with its language. */
export async function listConfirmedRecipients(service: SupabaseClient): Promise<Array<{ id: string; phone_e164: string; language: TextLanguage }>> {
  const { data, error } = await service
    .from('homepage_subscribers')
    .select('id, phone_e164, locale')
    .eq('sms_status', 'confirmed')
    .not('phone_e164', 'is', null);
  if (error) throw new Error(`Could not load confirmed numbers: ${error.message}`);
  return (data ?? [])
    .filter((row) => typeof row.phone_e164 === 'string')
    .map((row) => ({ id: row.id as string, phone_e164: row.phone_e164 as string, language: textLanguage(row.locale) }));
}

/** Subscriber id → language, for the rows of one send pass. English on any error. */
async function languagesById(service: SupabaseClient, ids: string[]): Promise<Map<string, TextLanguage>> {
  const out = new Map<string, TextLanguage>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return out;
  const { data, error } = await service.from('homepage_subscribers').select('id, locale').in('id', unique);
  if (error) {
    console.error('[text-alerts] subscriber languages unreadable; sending English', error.message);
    return out;
  }
  for (const row of data ?? []) out.set(row.id as string, textLanguage(row.locale));
  return out;
}

/** Phone → language, for the sold notices. English on any error. */
export async function languagesByPhone(service: SupabaseClient, phones: string[]): Promise<Map<string, TextLanguage>> {
  const out = new Map<string, TextLanguage>();
  const unique = [...new Set(phones.filter(Boolean))];
  if (unique.length === 0) return out;
  const { data, error } = await service.from('homepage_subscribers').select('phone_e164, locale').in('phone_e164', unique);
  if (error) {
    console.error('[text-alerts] subscriber languages unreadable; sending English', error.message);
    return out;
  }
  for (const row of data ?? []) if (row.phone_e164) out.set(row.phone_e164 as string, textLanguage(row.locale));
  return out;
}

/**
 * Queue the deal for everyone confirmed, then run the first send pass.
 * Idempotent: a second call adds no rows (unique deal + phone) and just
 * continues sending.
 */
export async function startDealSend(dealId: string): Promise<SendPassResult> {
  const service = createServiceClient();
  let deal = await loadDeal(service, dealId);
  if (!deal) throw new Error('Deal not found.');
  if (deal.status === 'sold') throw new Error('This deal is marked sold.');

  const recipients = await listConfirmedRecipients(service);
  if (recipients.length === 0) throw new Error('Nobody has confirmed text alerts yet.');

  // Spanish subscribers get the Spanish words + pictures (2026-11-22). Filled
  // here too in case Preview did not (owner "2A": goes out unread); a failed
  // translation never stops the send — the Spanish falls back to English words.
  const anySpanish = recipients.some((r) => r.language === 'es');
  if (anySpanish) deal = (await ensureDealSpanishWords(service, deal)).deal;
  if (!dealMediaPaths(deal) || (anySpanish && dealHasSpanishColumns(deal) && !dealMediaPathsEs(deal))) {
    await buildDealMedia(service, deal);
  }

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
  // One message, every picture, the main one first — in the subscriber's language.
  if (!dealMediaUrls(service, deal)) throw new Error('The deal has no picture yet.');
  const versions: Record<TextLanguage, { body: string; mediaUrls: string[] }> = {
    en: { body: dealText(dealCopy(deal)), mediaUrls: dealMediaUrlsFor(service, deal, 'en') ?? [] },
    es: { body: dealText(dealCopyEs(deal), 'es'), mediaUrls: dealMediaUrlsFor(service, deal, 'es') ?? [] },
  };

  const { data: queued, error } = await service
    .from('text_deal_sends')
    .select('id, phone_e164, subscriber_id')
    .eq('deal_id', dealId)
    .eq('status', 'queued')
    .order('id', { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Could not read the queue: ${error.message}`);
  const languages = await languagesById(service, (queued ?? []).map((row) => row.subscriber_id as string));

  for (const row of queued ?? []) {
    const language: TextLanguage = (typeof row.subscriber_id === 'string' && languages.get(row.subscriber_id)) || 'en';
    const { body, mediaUrls } = versions[language];
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
      const sent = await sendTwilioMessage({ to: row.phone_e164, body, mediaUrls });
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

/** The words of a deal's text, from its row — one line per box (layout B, `dealText`). */
export function dealCopy(deal: DealRow): DealCopy {
  return {
    item: deal.title,
    metal: dealMetalLabel(deal),
    size: dealSizeLabel(deal),
    price: deal.price_text,
    comparable: deal.comparable_price_text ?? null,
    description: deal.description ?? null,
    message: deal.message,
  };
}

/**
 * The Spanish words of a deal's text: the fixed labels are Spanish
 * (`dealText(…, 'es')`), the owner's words come from the Spanish boxes, and
 * an empty Spanish box falls back to the English one.
 */
export function dealCopyEs(deal: DealRow): DealCopy {
  return {
    item: dealTitleEs(deal),
    metal: dealMetalLabelEs(deal),
    size: dealSizeLabelEs(deal),
    price: deal.price_text,
    comparable: deal.comparable_price_text ?? null,
    description: deal.description_es?.trim() || deal.description || null,
    message: dealMessageEs(deal),
  };
}

/** A test to one number (the owner's cell); logged, never counted as a deal send. `language: 'es'` = the Spanish version. */
export async function sendDealTest(dealId: string, to: string, language: TextLanguage = 'en'): Promise<{ sid: string }> {
  const service = createServiceClient();
  let deal = await loadDeal(service, dealId);
  if (!deal) throw new Error('Deal not found.');
  if (!twilioConfigured()) throw new Error('Twilio is not configured yet.');
  if (language === 'es') deal = (await ensureDealSpanishWords(service, deal)).deal;
  const needsPictures = !dealMediaPaths(deal) || (language === 'es' && dealHasSpanishColumns(deal) && !dealMediaPathsEs(deal));
  if (needsPictures) {
    await buildDealMedia(service, deal);
    deal = (await loadDeal(service, dealId)) ?? deal;
  }
  const mediaUrls = dealMediaUrlsFor(service, deal, language) ?? [];
  const body = language === 'es' ? dealText(dealCopyEs(deal), 'es') : dealText(dealCopy(deal));
  const sent = await sendTwilioMessage({ to, body, mediaUrls });
  await service.from('text_system_messages').insert({ kind: 'deal_test', to_phone: to, deal_id: dealId, message_sid: sent.sid, status: sent.status });
  return { sid: sent.sid };
}

export async function markDealSold(dealId: string, input: { soldToPhone?: string | null; replyText?: string | null; replyTextEs?: string | null }): Promise<DealRow> {
  const service = createServiceClient();
  const current = await loadDeal(service, dealId);
  const { data, error } = await service
    .from('text_deals')
    .update({
      status: 'sold',
      sold_at: new Date().toISOString(),
      sold_to_phone: input.soldToPhone ?? null,
      sold_reply_text: input.replyText?.trim() || DEFAULT_SOLD_REPLY,
      // The Spanish "spoken for" line, once its column exists.
      ...(dealHasSpanishColumns(current) && typeof input.replyTextEs === 'string' ? { sold_reply_text_es: input.replyTextEs.trim() || null } : {}),
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

  // Everyone the deal actually reached (accepted by Twilio or delivered), minus the buyer.
  const winner = deal.sold_to_phone;
  const { data: sends } = await service
    .from('text_deal_sends')
    .select('phone_e164, status')
    .eq('deal_id', dealId)
    .in('status', ['sent', 'delivered']);
  const others = Array.from(new Set((sends ?? []).map((row) => row.phone_e164 as string).filter((phone) => phone && phone !== winner)));
  // Each person in their own language (2026-11-22).
  const languages = await languagesByPhone(service, [...others, ...(winner ? [winner] : [])]);
  const languageOf = (phone: string): TextLanguage => languages.get(phone) ?? 'en';

  if (winner) {
    const spanish = languageOf(winner) === 'es';
    outcome.winner = await sendOne(
      'deal_winner',
      winner,
      winnerText({ title: spanish ? dealLineEs(deal) : dealLine(deal), price: deal.price_text }, spanish ? 'es' : 'en'),
    );
  }

  const notices: Record<TextLanguage, string> = {
    en: soldNoticeText(deal.sold_reply_text),
    es: soldNoticeText(soldReplyFor('es', deal.sold_reply_text, deal.sold_reply_text_es), 'es'),
  };
  for (let i = 0; i < others.length; i += 10) {
    const results = await Promise.all(others.slice(i, i + 10).map((phone) => sendOne('deal_sold', phone, notices[languageOf(phone)])));
    for (const result of results) outcome.others[result] += 1;
  }
  return outcome;
}

const DETAIL_COLUMNS = ['description', 'comparable_price_text', 'metal', 'purity', 'size_text'] as const;

/** The detail boxes a reopened deal copies — only the ones the source row has, so reopen works before the SQL ran. */
function reopenedDetails(source: DealRow): Partial<DealRow> {
  const out: Record<string, unknown> = {};
  for (const key of DETAIL_COLUMNS) if (key in source) out[key] = source[key];
  return out as Partial<DealRow>;
}

/** The message a reopened deal starts with (the owner edits it before sending). */
export const REOPEN_MESSAGE = 'Back available - the earlier sale fell through. First reply takes it. Pickup at our Naples showroom.';

/**
 * "Reopen — edit & resend" (owner, 2026-09-18): when a sale falls through,
 * the deal goes out again as a NEW draft that copies the title, price and
 * every photo (same stored objects), with a fresh message the owner can edit. A new
 * row — not a status flip — because every send is once-per-phone-per-deal
 * (`text_deal_sends`), replies attach to a subscriber's LAST deal, and the
 * sold deal keeps its history. The old row stays as it was.
 */
export async function reopenDealAsDraft(dealId: string): Promise<DealRow> {
  const service = createServiceClient();
  const source = await loadDeal(service, dealId);
  if (!source) throw new Error('Deal not found.');
  const details = dealPhotoList(source).slice(1);
  const { data, error } = await service
    .from('text_deals')
    .insert({
      title: source.title,
      price_text: source.price_text,
      message: REOPEN_MESSAGE,
      // The 2026-10-24 boxes come along, named only when the old row has them.
      ...reopenedDetails(source),
      photo_path: source.photo_path,
      card_path: null,
      // The detail shots come along; their pictures are rendered again on Preview.
      ...(details.length > 0 ? { detail_photo_paths: details } : {}),
      status: 'draft',
      sold_reply_text: source.sold_reply_text,
      // The Spanish words are translated again on Preview (the message is new);
      // only the owner's Spanish "spoken for" line comes along.
      ...(dealHasSpanishColumns(source) ? { sold_reply_text_es: source.sold_reply_text_es ?? null } : {}),
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

  const { error } = await service.from('text_deals').delete().eq('id', dealId);
  if (error) throw new Error(`Could not delete the deal: ${error.message}`);
  return { removedObjects: await removeUnsharedObjects(service, dealObjectPaths(deal), dealId) };
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
