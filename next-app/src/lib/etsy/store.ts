import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// Typed access to the five etsy_* tables (supabase/etsy-sync.sql). Every
// function here expects a SERVICE-ROLE client — these tables have no
// anon/authenticated RLS policies (see etsy-sync-plan/08-database-schema.md).

export type EtsyConnectionStatus = 'disconnected' | 'connected' | 'needs_reauth';

export interface EtsyConnectionRow {
  id: 1;
  status: EtsyConnectionStatus;
  etsy_user_id: number | null;
  shop_id: number | null;
  shop_name: string | null;
  scopes: string[] | null;
  access_token_enc: string | null;
  access_token_expires_at: string | null;
  refresh_token_enc: string | null;
  refresh_token_updated_at: string | null;
  shipping_profile_id: number | null;
  return_policy_id: number | null;
  readiness_state_id: number | null;
  section_map: Record<string, number>;
  auto_activate: boolean;
  auto_delist_on_sold: boolean;
  price_push_enabled: boolean;
  price_push_threshold_pct: number;
  price_markup_pct: number;
  /** Mark a product sold on the site when its Etsy listing sells (2026-09-12; needs the transactions_r scope). */
  auto_mark_sold?: boolean;
  /** Receipts created after this instant are read by the sales sweep; null = not armed yet. */
  sales_cursor?: string | null;
  connected_at: string | null;
  updated_at: string;
}

export type EtsySyncState =
  | 'pending'
  | 'draft_created'
  | 'images_synced'
  | 'inventory_synced'
  | 'draft_review'
  | 'active'
  | 'out_of_date'
  | 'delisted'
  | 'error';

export const ETSY_RESUMABLE_SYNC_STATES: EtsySyncState[] = [
  'pending',
  'draft_created',
  'images_synced',
  'inventory_synced',
  'out_of_date',
];

export const ETSY_REPAIRABLE_SYNC_STATES: EtsySyncState[] = [
  'draft_created',
  'images_synced',
  'inventory_synced',
  'out_of_date',
];

export type EtsyListingState = 'draft' | 'active' | 'inactive' | 'ended' | null;

export interface EtsyListingRow {
  product_id: string;
  etsy_listing_id: number | null;
  sync_state: EtsySyncState;
  listing_state: EtsyListingState;
  content_hash: string | null;
  last_pushed_price: number | null;
  taxonomy_id: number | null;
  /** Manual per-product category override — wins over the automatic ETSY_TAXONOMY_MAP guess when set. */
  taxonomy_override_id: number | null;
  taxonomy_override_path: string | null;
  /** Owner-supplied extra Etsy tags (added 2026-07-08), merged into the auto-generated tags. */
  extra_tags: string[] | null;
  last_synced_at: string | null;
  last_error: string | null;
  error_count: number;
  created_at: string;
  updated_at: string;
}

export interface EtsyListingImageRow {
  id: number;
  product_id: string;
  etsy_listing_id: number;
  source_url: string;
  source_key: string;
  bytes_sha256: string | null;
  etsy_listing_image_id: number;
  rank: number;
  uploaded_at: string;
}

export type EtsySyncLogOutcome = 'ok' | 'warning' | 'error';

export interface EtsySyncLogInput {
  product_id?: string | null;
  listing_id?: number | null;
  action: string;
  outcome: EtsySyncLogOutcome;
  message?: string | null;
  detail?: Record<string, unknown> | null;
}

export interface EtsySyncLogRow extends EtsySyncLogInput {
  id: number;
  created_at: string;
}

/** True when a Postgres/PostgREST error means the table/column doesn't exist yet (pre-migration). */
function isMissingSchemaError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  // 42P01 = undefined_table, 42703 = undefined_column (Postgres); PostgREST also
  // surfaces schema-cache misses as PGRST errors with "schema cache" in the message.
  return error.code === '42P01' || error.code === '42703' || /schema cache|does not exist/i.test(error.message ?? '');
}

export class EtsyNotMigratedError extends Error {
  constructor() {
    super('Etsy sync tables are not set up yet. Run supabase/etsy-sync.sql in the Supabase project first.');
    this.name = 'EtsyNotMigratedError';
  }
}

export async function getConnection(service: SupabaseClient): Promise<EtsyConnectionRow | null> {
  const { data, error } = await service.from('etsy_connection').select('*').eq('id', 1).maybeSingle();
  if (error) {
    if (isMissingSchemaError(error)) return null;
    throw new Error(error.message);
  }
  return (data as EtsyConnectionRow | null) ?? null;
}

export async function updateConnection(
  service: SupabaseClient,
  patch: Partial<Omit<EtsyConnectionRow, 'id'>>,
): Promise<void> {
  const { error } = await service
    .from('etsy_connection')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) throw new Error(error.message);
}

export async function getListing(service: SupabaseClient, productId: string): Promise<EtsyListingRow | null> {
  const { data, error } = await service.from('etsy_listings').select('*').eq('product_id', productId).maybeSingle();
  if (error) {
    if (isMissingSchemaError(error)) throw new EtsyNotMigratedError();
    throw new Error(error.message);
  }
  return (data as EtsyListingRow | null) ?? null;
}

/**
 * Bulk map for the admin product table's per-row Etsy status chip. Returns an
 * empty map (never throws) when the tables aren't migrated yet, so the product
 * table keeps rendering "Not listed" for everyone rather than erroring.
 */
export async function getListingsMap(service: SupabaseClient): Promise<Record<string, EtsyListingRow>> {
  const { data, error } = await service.from('etsy_listings').select('*');
  if (error || !data) return {};
  const map: Record<string, EtsyListingRow> = {};
  for (const row of data as EtsyListingRow[]) map[row.product_id] = row;
  return map;
}

export async function upsertListing(
  service: SupabaseClient,
  productId: string,
  patch: Partial<Omit<EtsyListingRow, 'product_id' | 'created_at'>>,
): Promise<EtsyListingRow> {
  const { data, error } = await service
    .from('etsy_listings')
    .upsert(
      { product_id: productId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'product_id' },
    )
    .select('*')
    .single();
  if (error) {
    if (isMissingSchemaError(error)) throw new EtsyNotMigratedError();
    throw new Error(error.message);
  }
  return data as EtsyListingRow;
}

export async function deleteListingRow(service: SupabaseClient, productId: string): Promise<void> {
  const { error } = await service.from('etsy_listings').delete().eq('product_id', productId);
  if (error && !isMissingSchemaError(error)) throw new Error(error.message);
}

export async function getListingImages(service: SupabaseClient, etsyListingId: number): Promise<EtsyListingImageRow[]> {
  const { data, error } = await service
    .from('etsy_listing_images')
    .select('*')
    .eq('etsy_listing_id', etsyListingId)
    .order('rank', { ascending: true });
  if (error) {
    if (isMissingSchemaError(error)) return [];
    throw new Error(error.message);
  }
  return (data as EtsyListingImageRow[]) ?? [];
}

export async function insertListingImage(
  service: SupabaseClient,
  row: Omit<EtsyListingImageRow, 'id' | 'uploaded_at'>,
): Promise<void> {
  const { error } = await service.from('etsy_listing_images').insert(row);
  if (error) throw new Error(error.message);
}

export async function deleteListingImageRow(service: SupabaseClient, id: number): Promise<void> {
  const { error } = await service.from('etsy_listing_images').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// Called when a listing_id is being retired (reset-to-not-listed after a 404,
// or replaced by a new draft) — without this, its etsy_listing_images rows
// become orphaned bookkeeping with no live listing to reconcile against.
export async function deleteListingImagesByListingId(service: SupabaseClient, etsyListingId: number): Promise<void> {
  const { error } = await service.from('etsy_listing_images').delete().eq('etsy_listing_id', etsyListingId);
  if (error && !isMissingSchemaError(error)) throw new Error(error.message);
}

/**
 * Bulk twin of `insertSyncLog` — ONE round-trip for a whole batch.
 *
 * The scheduled price push awaited this once per listing, alongside an
 * `upsertListing`. Measured 2026-08-21: ~522ms per listing, of which the Etsy
 * API call was only part — the two bookkeeping round-trips were ~314ms of it.
 * That capped the run at 41 of 56 candidates inside its budget, silently
 * deferring 15 listings a day. See `bulkPatchListings`.
 */
export async function insertSyncLogs(service: SupabaseClient, inputs: EtsySyncLogInput[]): Promise<void> {
  if (!inputs.length) return;
  const { error } = await service.from('etsy_sync_log').insert(
    inputs.map((input) => ({
      product_id: input.product_id ?? null,
      listing_id: input.listing_id ?? null,
      action: input.action,
      outcome: input.outcome,
      message: input.message ?? null,
      detail: input.detail ?? null,
    })),
  );
  if (error && !isMissingSchemaError(error)) {
    console.error('etsy_sync_log bulk insert error:', error.message);
  }
}

/**
 * Bulk twin of `upsertListing` — ONE round-trip for a whole batch of patches.
 * Same `onConflict: 'product_id'` semantics as the singular version; unlike
 * the eBay twin no extra column is required, because `product_id` is the only
 * `not null` column here without a default.
 */
export async function bulkPatchListings(
  service: SupabaseClient,
  patches: Array<{ product_id: string } & Partial<Omit<EtsyListingRow, 'product_id' | 'created_at'>>>,
): Promise<void> {
  if (!patches.length) return;
  const updatedAt = new Date().toISOString();
  const { error } = await service
    .from('etsy_listings')
    .upsert(patches.map((patch) => ({ ...patch, updated_at: updatedAt })), { onConflict: 'product_id' });
  if (error) {
    if (isMissingSchemaError(error)) throw new EtsyNotMigratedError();
    throw new Error(error.message);
  }
}

export async function insertSyncLog(service: SupabaseClient, input: EtsySyncLogInput): Promise<void> {
  const { error } = await service.from('etsy_sync_log').insert({
    product_id: input.product_id ?? null,
    listing_id: input.listing_id ?? null,
    action: input.action,
    outcome: input.outcome,
    message: input.message ?? null,
    detail: input.detail ?? null,
  });
  // Logging must never break the caller — swallow (the sync result itself
  // already carries the outcome back to the admin UI).
  if (error) console.error('etsy_sync_log insert error:', error);
}

/**
 * Newest successful `delist` log message per product, for the manual-hold
 * rule in `detectEtsyStatusDrift` (2026-09-24). Rows are read newest-first and
 * the first one seen per product wins. A product with no delist row is absent
 * from the map — callers treat "absent" as a manual hold, never as automation.
 */
export async function getLatestDelistMessages(
  service: SupabaseClient,
  productIds: string[],
): Promise<Map<string, string | null>> {
  const latest = new Map<string, string | null>();
  if (!productIds.length) return latest;
  const { data, error } = await service
    .from('etsy_sync_log')
    .select('product_id, message, created_at')
    .eq('action', 'delist')
    .eq('outcome', 'ok')
    .in('product_id', productIds)
    .order('created_at', { ascending: false });
  if (error || !data) return latest;
  for (const row of data as Array<{ product_id: string | null; message: string | null }>) {
    if (row.product_id && !latest.has(row.product_id)) latest.set(row.product_id, row.message);
  }
  return latest;
}

export async function getRecentSyncLog(service: SupabaseClient, limit = 50): Promise<EtsySyncLogRow[]> {
  const { data, error } = await service
    .from('etsy_sync_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data as EtsySyncLogRow[]) ?? [];
}

/**
 * The newest `scheduled_price_push` row, fetched by its own indexed query.
 *
 * Do NOT go back to scanning a page of `getRecentSyncLog()` for this: one manual
 * "Push prices now" writes ~130 `price_push` rows, so a scheduled run falls out
 * of any 25-row window within minutes and the Admin last-run card silently
 * reverts to "no run recorded" — indistinguishable from a dead cron.
 */
export async function getLastScheduledPricePush(service: SupabaseClient): Promise<EtsySyncLogRow | null> {
  const { data, error } = await service
    .from('etsy_sync_log')
    .select('*')
    .eq('action', 'scheduled_price_push')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as EtsySyncLogRow | null) ?? null;
}

/**
 * The newest RUN SUMMARY of the 30-minute status reconcile, for the Admin
 * "30-minute checks" card. Per-listing `reconcile_status` rows carry a
 * product_id; the run summary (and a whole-run failure) does not. Its own
 * query for the same reason as getLastScheduledPricePush.
 */
export async function getLastStatusCheck(service: SupabaseClient): Promise<EtsySyncLogRow | null> {
  const { data, error } = await service
    .from('etsy_sync_log')
    .select('*')
    .eq('action', 'reconcile_status')
    .is('product_id', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as EtsySyncLogRow | null) ?? null;
}

/** The newest `marketplace_sales` row (the sales sweep that runs just before the reconcile). */
export async function getLastSalesCheck(service: SupabaseClient): Promise<EtsySyncLogRow | null> {
  const { data, error } = await service
    .from('etsy_sync_log')
    .select('*')
    .eq('action', 'marketplace_sales')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as EtsySyncLogRow | null) ?? null;
}

/** Opportunistic housekeeping: prune log rows older than ~90 days (no cron dependency). */
export async function pruneOldSyncLogs(service: SupabaseClient): Promise<void> {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  await service.from('etsy_sync_log').delete().lt('created_at', cutoff);
}

/** Atomically claims one resumable row via the SQL-level FOR UPDATE SKIP LOCKED RPC (see supabase/etsy-sync.sql). */
export async function claimNextPendingListing(service: SupabaseClient): Promise<string | null> {
  const { data, error } = await service.rpc('claim_next_pending_etsy_listing');
  if (error) {
    if (isMissingSchemaError(error)) throw new EtsyNotMigratedError();
    throw new Error(error.message);
  }
  return (data as string | null) ?? null;
}

export async function countPendingListings(service: SupabaseClient): Promise<number> {
  const { count, error } = await service
    .from('etsy_listings')
    .select('product_id', { count: 'exact', head: true })
    .in('sync_state', ETSY_RESUMABLE_SYNC_STATES);
  if (error) return 0;
  return count ?? 0;
}

export async function claimNextRepairableListing(service: SupabaseClient): Promise<string | null> {
  const { data, error } = await service.rpc('claim_next_repairable_etsy_listing');
  if (error) {
    if (isMissingSchemaError(error)) throw new EtsyNotMigratedError();
    throw new Error(error.message);
  }
  return (data as string | null) ?? null;
}

export async function countRepairableListings(service: SupabaseClient): Promise<number> {
  const { count, error } = await service
    .from('etsy_listings')
    .select('product_id', { count: 'exact', head: true })
    .not('etsy_listing_id', 'is', null)
    .in('sync_state', ETSY_REPAIRABLE_SYNC_STATES);
  if (error) return 0;
  return count ?? 0;
}

// Bulk-publish queue: completed drafts that were intentionally held for owner
// review. Selecting the oldest row is sufficient because a successful publish
// moves it to active and a contained item error moves it to error.
export async function claimNextDraftReviewListing(service: SupabaseClient): Promise<string | null> {
  const { data, error } = await service
    .from('etsy_listings')
    .select('product_id')
    .eq('sync_state', 'draft_review')
    .eq('listing_state', 'draft')
    .order('updated_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isMissingSchemaError(error)) return null;
    throw new Error(error.message);
  }
  return (data as { product_id: string } | null)?.product_id ?? null;
}

export async function countDraftReviewListings(service: SupabaseClient): Promise<number> {
  const { count, error } = await service
    .from('etsy_listings')
    .select('product_id', { count: 'exact', head: true })
    .eq('sync_state', 'draft_review')
    .eq('listing_state', 'draft');
  if (error) {
    if (isMissingSchemaError(error)) return 0;
    throw new Error(error.message);
  }
  return count ?? 0;
}

export interface OauthStateRow {
  state: string;
  code_verifier: string;
  admin_user_id: string;
  created_at: string;
}

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export async function createOauthState(
  service: SupabaseClient,
  input: { state: string; codeVerifier: string; adminUserId: string },
): Promise<void> {
  // Opportunistically purge expired rows on every new attempt — no cron needed.
  await service.from('etsy_oauth_states').delete().lt('created_at', new Date(Date.now() - OAUTH_STATE_TTL_MS).toISOString());
  const { error } = await service.from('etsy_oauth_states').insert({
    state: input.state,
    code_verifier: input.codeVerifier,
    admin_user_id: input.adminUserId,
  });
  if (error) throw new Error(error.message);
}

/** Single-use: looks up and deletes the state row. Returns null if unknown/expired. */
export async function consumeOauthState(service: SupabaseClient, state: string): Promise<OauthStateRow | null> {
  const { data, error } = await service.from('etsy_oauth_states').select('*').eq('state', state).maybeSingle();
  if (error || !data) return null;
  await service.from('etsy_oauth_states').delete().eq('state', state);
  const row = data as OauthStateRow;
  if (Date.now() - new Date(row.created_at).getTime() > OAUTH_STATE_TTL_MS) return null;
  return row;
}
