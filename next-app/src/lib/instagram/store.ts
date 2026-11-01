import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { NormalizedRect } from './backdrop';
import { getSocialUnqueuedSyncState } from '@/lib/social-workflow';

/**
 * Typed CRUD over the instagram_* tables. Service-role client only — every
 * caller must have already verified the signed-in user is an admin.
 */

export type InstagramConnectionStatus = 'disconnected' | 'connected' | 'needs_reauth';

export type InstagramSyncState =
  | 'pending'
  | 'review'
  | 'publishing'
  | 'published'
  | 'out_of_date'
  | 'deleted'
  | 'error';

export interface InstagramConnectionRow {
  id: number;
  status: InstagramConnectionStatus;
  ig_user_id: string | null;
  username: string | null;
  account_type: string | null;
  scopes: string[] | null;
  access_token_enc: string | null;
  token_expires_at: string | null;
  token_refreshed_at: string | null;
  auto_publish: boolean;
  caption_include_price: boolean;
  caption_spanish_line: boolean;
  caption_cta: string | null;
  base_hashtags: string[];
  sold_comment_enabled: boolean;
  sold_comment_text: string;
  connected_at: string | null;
  updated_at: string;
}

export interface InstagramPostRow {
  product_id: string;
  sync_state: InstagramSyncState;
  ig_media_id: string | null;
  permalink: string | null;
  child_container_ids: string[];
  carousel_container_id: string | null;
  container_expires_at: string | null;
  rendition_paths: string[];
  /**
   * Instagram-only ordered image lineup. Null means "use the product's own
   * image order"; see supabase/instagram-image-selection-2026-08.sql.
   */
  image_selection: string[] | null;
  /**
   * Normalized crop rects keyed by image URL; see
   * supabase/instagram-image-crops-2026-08.sql. Keyed by URL (not index) so
   * a crop survives reordering the lineup. Applied only to Instagram
   * renditions — never to the product's own images.
   */
  image_crops: Record<string, NormalizedRect> | null;
  /**
   * Product image URL the generated lead card is built from; null means the
   * lineup's cover. See supabase/social-card-source-2026-08.sql.
   */
  card_source_url: string | null;
  /** Hex background override for the generated card; null = auto-detect. */
  card_background: string | null;
  content_hash: string | null;
  posted_caption: string | null;
  posted_price: number | null;
  posted_at: string | null;
  sold_comment_id: string | null;
  sold_comment_at: string | null;
  queued_at: string | null;
  scheduled_for: string | null;
  last_error: string | null;
  error_count: number;
  created_at: string;
  updated_at: string;
}

/** Columns safe to send to the browser — never the encrypted token. */
const CONNECTION_PUBLIC_COLUMNS =
  'id, status, ig_user_id, username, account_type, scopes, token_expires_at, token_refreshed_at, ' +
  'auto_publish, caption_include_price, caption_spanish_line, caption_cta, ' +
  'base_hashtags, sold_comment_enabled, sold_comment_text, connected_at, updated_at';

export type InstagramConnectionPublic = Omit<InstagramConnectionRow, 'access_token_enc'>;

export async function getConnection(
  service: SupabaseClient,
): Promise<InstagramConnectionPublic | null> {
  const { data } = await service
    .from('instagram_connection')
    .select(CONNECTION_PUBLIC_COLUMNS)
    .eq('id', 1)
    .maybeSingle();
  return (data as unknown as InstagramConnectionPublic) ?? null;
}

export async function updateConnection(
  service: SupabaseClient,
  patch: Partial<Omit<InstagramConnectionRow, 'id'>>,
): Promise<void> {
  const { error } = await service
    .from('instagram_connection')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) throw new Error(`Could not update the Instagram connection: ${error.message}`);
}

/** Clear all token/account fields. Posting history is intentionally preserved. */
export async function disconnect(service: SupabaseClient): Promise<void> {
  await updateConnection(service, {
    status: 'disconnected',
    ig_user_id: null,
    username: null,
    account_type: null,
    scopes: null,
    access_token_enc: null,
    token_expires_at: null,
    token_refreshed_at: null,
    connected_at: null,
  });
}

export async function getPost(
  service: SupabaseClient,
  productId: string,
): Promise<InstagramPostRow | null> {
  const { data } = await service
    .from('instagram_posts')
    .select('*')
    .eq('product_id', productId)
    .maybeSingle();
  return (data as InstagramPostRow) ?? null;
}

export async function listPosts(
  service: SupabaseClient,
  productIds?: string[],
): Promise<InstagramPostRow[]> {
  let query = service.from('instagram_posts').select('*');
  if (productIds?.length) query = query.in('product_id', productIds);
  const { data } = await query;
  return (data as InstagramPostRow[]) ?? [];
}

export async function upsertPost(
  service: SupabaseClient,
  productId: string,
  patch: Partial<Omit<InstagramPostRow, 'product_id' | 'created_at'>>,
): Promise<InstagramPostRow | null> {
  const { data, error } = await service
    .from('instagram_posts')
    .upsert(
      { product_id: productId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'product_id' },
    )
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`Could not save the Instagram post record: ${error.message}`);
  return (data as InstagramPostRow) ?? null;
}

/** Queue or reschedule a product while preserving its original approval time. */
export async function queueProduct(
  service: SupabaseClient,
  productId: string,
  scheduledFor: Date,
): Promise<InstagramPostRow | null> {
  const existing = await getPost(service, productId);
  return upsertPost(service, productId, {
    sync_state: 'pending',
    queued_at: existing?.queued_at ?? new Date().toISOString(),
    scheduled_for: scheduledFor.toISOString(),
    last_error: null,
    error_count: 0,
  });
}

export async function unqueueProduct(service: SupabaseClient, productId: string): Promise<void> {
  const existing = await getPost(service, productId);
  await upsertPost(service, productId, {
    queued_at: null,
    scheduled_for: null,
    sync_state: getSocialUnqueuedSyncState(existing?.posted_caption, existing?.rendition_paths),
  });
}

/** Products approved and waiting, earliest scheduled time first. */
export async function listQueuedPosts(
  service: SupabaseClient,
  limit = 50,
): Promise<InstagramPostRow[]> {
  const { data } = await service
    .from('instagram_posts')
    .select('*')
    .in('sync_state', ['pending', 'review'])
    .not('queued_at', 'is', null)
    .order('scheduled_for', { ascending: true, nullsFirst: false })
    .order('queued_at', { ascending: true })
    .limit(limit);
  return (data as InstagramPostRow[]) ?? [];
}

export async function countPostsPublishedSince(
  service: SupabaseClient,
  since: Date,
): Promise<number> {
  const { count } = await service
    .from('instagram_posts')
    .select('product_id', { count: 'exact', head: true })
    .eq('sync_state', 'published')
    .gte('posted_at', since.toISOString());
  return count ?? 0;
}

export interface InstagramSyncLogEntry {
  product_id?: string | null;
  media_id?: string | null;
  action: string;
  outcome: 'ok' | 'warning' | 'error';
  message?: string | null;
  detail?: Record<string, unknown> | null;
}

/**
 * Append to the audit log. Swallows its own failures on purpose: logging must
 * never be the reason a publish or a token refresh fails.
 */
export async function insertSyncLog(
  service: SupabaseClient,
  entry: InstagramSyncLogEntry,
): Promise<void> {
  const { error } = await service.from('instagram_sync_log').insert({
    product_id: entry.product_id ?? null,
    media_id: entry.media_id ?? null,
    action: entry.action,
    outcome: entry.outcome,
    message: entry.message ?? null,
    detail: entry.detail ?? null,
  });
  if (error) console.error('instagram_sync_log insert failed:', error.message);
}

export async function getRecentSyncLog(
  service: SupabaseClient,
  limit = 50,
): Promise<Array<InstagramSyncLogEntry & { id: number; created_at: string }>> {
  const { data, error } = await service
    .from('instagram_sync_log')
    .select('id, product_id, media_id, action, outcome, message, detail, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data as Array<InstagramSyncLogEntry & { id: number; created_at: string }>) ?? [];
}

/** Opportunistic 90-day retention, called from sync paths so no cron is needed. */
export async function pruneOldSyncLogs(service: SupabaseClient): Promise<void> {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await service.from('instagram_sync_log').delete().lt('created_at', cutoff);
  if (error) console.error('instagram_sync_log prune failed:', error.message);
}
