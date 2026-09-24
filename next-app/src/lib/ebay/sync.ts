import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/service';
import { fetchSpotData } from '@/lib/spot-price';
import { getMarketplaceShippingProfileMap } from '@/lib/marketplace-shipping';
import type { Product, SpotData } from '@/types/product';
import { normalizeProductQuantity, normalizeProductStatus } from '@/types/product';
import { EbayApiError, ebayFetch, ebayTradingGetItemStatus, type EbayTradingItemStatus } from './client';
import { EBAY_BULK_ENQUEUE_LIMIT, EBAY_EXCLUDED_PRODUCT_IDS } from './guards';
import { MAX_PRICE_PUSH_ATTEMPTS } from '@/lib/marketplace-price-chip';
import {
  classifyDriftRepair,
  countDriftRepairs,
  driftRepairOutcomeLevel,
  formatDriftRepairSummary,
  type DriftRepairOutcome,
} from '@/lib/marketplace-drift-repair';
import { ensureFreshAccessToken } from './auth';
import {
  buildMappedPayload,
  buildPreflightChecks,
  computeContentHash,
  computeEbayPrice,
  isPreflightPassing,
  type EbayConnectionDefaults,
  type MappedEbayPayload,
} from './mapping';
import {
  claimNextPendingListing,
  claimNextReviewListing,
  countPendingListings,
  countReviewListings,
  getConnection,
  bulkPatchListings,
  getLatestHideMessages,
  getListing,
  insertSyncLog,
  insertSyncLogs,
  pruneOldSyncLogs,
  upsertListing,
  type EbayConnectionRow,
  type EbayListingRow,
  type EbaySyncState,
} from './store';

// The step machine + queue drain + price push + status-change hook. Mirrors
// the SHAPE of next-app/src/lib/etsy/sync.ts (checkpointed steps, content-hash
// change detection, claim-RPC queue drain with a seen-guard and
// re-enqueue/update detection, price-push threshold, fire-and-forget product
// status hook) — copied, never imported, per BUILD-PROMPT.md hard rule 9.
// eBay needs far fewer calls per product (~3-4 vs Etsy's ~12, no images step,
// no draft state — see ebay-sync-plan/03-sync-lifecycle.md), so most
// publishes complete in a single runSyncStep() call; the resumable/bounded
// shape is kept anyway for crash-window safety and bulk-drain uniformity.

export type SyncMode = 'publish' | 'update' | 'price-only' | 'publish-live';

export const RELISTED_LISTING_WARNING =
  'This item is live through an eBay relist that is no longer attached to the app-managed offer. Manage it on eBay until it is reattached.';

/**
 * Hard, data-independent write block. The detached-relist guard below infers
 * its block from `last_error` still holding RELISTED_LISTING_WARNING — which
 * evaporates the moment anything overwrites that column (a different error, a
 * manual clear, a partial sync). For a listing the owner has deliberately
 * quarantined, that is too fragile, so the product id is pinned here as well.
 * Both checks must pass before any eBay write.
 *
 * EMPTY since 2026-08-21, deliberately. Inventory #82 was pinned here because
 * eBay listing 800354878200 was live through an external relist not attached to
 * stored offer 204558136011, so the Inventory-API price push could not reach
 * it — it sat 17 days at a stale price while silver moved. The owner-approved
 * end-and-republish ran that day: the detached relist was ended and offer
 * 204558136011 was published in its place, putting the item back under normal
 * management. See CHANGELOG 2026-08-21.
 *
 * ⚠️ Keep this mechanism. Pinning is the right response to a listing that is
 * live but unreachable, and an empty set is a statement that none exist today —
 * not that the hazard is gone.
 */
export const EBAY_WRITE_BLOCKED_PRODUCT_IDS: ReadonlySet<string> = new Set([]);

export const EBAY_WRITE_BLOCKED_WARNING =
  'This listing is write-blocked pending an owner-approved reattachment on eBay. Manage it on eBay until the block is lifted.';

function isDetachedRelistedListing(listing: EbayListingRow | null): boolean {
  return listing?.last_error === RELISTED_LISTING_WARNING;
}

/**
 * The single question every eBay write path must ask. Pinned block first so it
 * holds even when listing state is missing or `last_error` has been rewritten.
 */
export function isEbayWriteBlocked(productId: string, listing: EbayListingRow | null): boolean {
  return EBAY_WRITE_BLOCKED_PRODUCT_IDS.has(productId) || isDetachedRelistedListing(listing);
}

function writeBlockedResult(productId: string, listing: EbayListingRow | null): SyncStepResult {
  const pinned = EBAY_WRITE_BLOCKED_PRODUCT_IDS.has(productId);
  return {
    done: true,
    syncState: listing?.sync_state ?? 'pending',
    error: {
      code: pinned ? 'write_blocked' : 'detached_relist',
      message: pinned ? EBAY_WRITE_BLOCKED_WARNING : RELISTED_LISTING_WARNING,
    },
  };
}

export interface SyncStepResult {
  done: boolean;
  syncState: EbaySyncState;
  progress?: { step: string };
  listingId?: string;
  listingUrl?: string;
  warnings?: string[];
  error?: { code: string; message: string };
}

function listingUrlFor(listingId: string): string {
  return `https://www.ebay.com/itm/${listingId}`;
}

function toConnectionDefaults(connection: EbayConnectionRow): EbayConnectionDefaults {
  return {
    fulfillment_policy_id: connection.fulfillment_policy_id,
    express_fulfillment_policy_id: connection.express_fulfillment_policy_id,
    high_value_shipping_threshold: connection.high_value_shipping_threshold,
    payment_policy_id: connection.payment_policy_id,
    return_policy_id: connection.return_policy_id,
    merchant_location_key: connection.merchant_location_key,
    price_markup_pct: connection.price_markup_pct,
    marketplace_id: connection.marketplace_id,
    selling_limit_amount: connection.selling_limit_amount,
    selling_limit_quantity: connection.selling_limit_quantity,
  };
}

async function loadProduct(service: SupabaseClient, productId: string): Promise<Product | null> {
  const { data } = await service.from('products').select('*').eq('id', productId).maybeSingle();
  return (data as Product | null) ?? null;
}

// Site shipping tiers -> provisioned eBay fulfillment policies. Best-effort:
// an unreadable map must never block a sync — an empty map simply keeps the
// legacy standard/express policy resolution.
async function loadTierPolicyMap(service: SupabaseClient): Promise<Record<string, string>> {
  try {
    return await getMarketplaceShippingProfileMap(service, 'ebay');
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Low-level eBay Sell Inventory API calls. See
// ebay-sync-plan/rest-endpoints-used.md. TODO(ebay-verify): request/response
// field names are pinned from well-established eBay Sell API conventions,
// not a live fetch (see next-app/src/lib/ebay/client.ts's header note) — spot
// check against the real contract before the first production sync.
// ---------------------------------------------------------------------------
async function putInventoryItem(accessToken: string, payload: MappedEbayPayload): Promise<void> {
  await ebayFetch({
    method: 'PUT',
    path: `/sell/inventory/v1/inventory_item/${encodeURIComponent(payload.sku)}`,
    accessToken,
    contentLanguage: true,
    json: {
      product: {
        title: payload.title,
        description: payload.description,
        aspects: payload.aspects,
        imageUrls: payload.images.map((image) => image.url),
      },
      condition: payload.conditionId,
      conditionDescription: payload.conditionDescription,
      availability: { shipToLocationAvailability: { quantity: payload.quantity } },
    },
  });
}

interface CreateOfferResponse {
  offerId: string;
}

export function offerBody(payload: MappedEbayPayload) {
  return {
    sku: payload.sku,
    marketplaceId: payload.marketplaceId,
    format: 'FIXED_PRICE',
    listingDuration: 'GTC',
    listingDescription: payload.description,
    availableQuantity: payload.quantity,
    categoryId: payload.categoryId,
    listingPolicies: {
      fulfillmentPolicyId: payload.fulfillmentPolicyId,
      paymentPolicyId: payload.paymentPolicyId,
      returnPolicyId: payload.returnPolicyId,
    },
    pricingSummary: { price: { value: String(payload.price ?? 0), currency: 'USD' } },
    merchantLocationKey: payload.merchantLocationKey,
  };
}

async function createOffer(accessToken: string, payload: MappedEbayPayload): Promise<string> {
  const res = await ebayFetch<CreateOfferResponse>({
    method: 'POST',
    path: '/sell/inventory/v1/offer',
    accessToken,
    contentLanguage: true,
    json: offerBody(payload),
  });
  return res.data.offerId;
}

interface ExistingOfferSummary {
  offerId: string;
  format?: string;
  marketplaceId?: string;
}

export function selectExistingFixedPriceOfferId(
  offers: ExistingOfferSummary[] | undefined,
  marketplaceId: string,
): string | null {
  return offers?.find((offer) => offer.format === 'FIXED_PRICE' && offer.marketplaceId === marketplaceId)?.offerId ?? null;
}

async function findExistingOfferId(accessToken: string, sku: string, marketplaceId: string): Promise<string | null> {
  try {
    const res = await ebayFetch<{ offers?: ExistingOfferSummary[] }>({
      method: 'GET',
      path: '/sell/inventory/v1/offer',
      accessToken,
      query: { sku },
    });
    return selectExistingFixedPriceOfferId(res.data.offers, marketplaceId);
  } catch {
    return null;
  }
}

async function updateOffer(accessToken: string, offerId: string, payload: MappedEbayPayload): Promise<void> {
  await ebayFetch({
    method: 'PUT',
    path: `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`,
    accessToken,
    contentLanguage: true,
    json: offerBody(payload),
  });
}

interface PublishOfferResponse {
  listingId: string;
  warnings?: Array<{ message?: string }>;
}

async function publishOfferCall(accessToken: string, offerId: string): Promise<{ listingId: string; warnings: string[] }> {
  const res = await ebayFetch<PublishOfferResponse>({
    method: 'POST',
    path: `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`,
    accessToken,
  });
  return {
    listingId: res.data.listingId,
    warnings: (res.data.warnings ?? []).map((warning) => warning.message ?? '').filter(Boolean),
  };
}

async function withdrawOfferCall(accessToken: string, offerId: string): Promise<void> {
  await ebayFetch({ method: 'POST', path: `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/withdraw`, accessToken });
}

// Deletes an UNPUBLISHED offer outright (the prepared draft). Only valid for
// an unpublished offer — a live/published listing must be withdrawn first.
async function deleteOfferCall(accessToken: string, offerId: string): Promise<void> {
  await ebayFetch({ method: 'DELETE', path: `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`, accessToken });
}

interface GetOfferResponse {
  offerId: string;
  // Offer publication state: "PUBLISHED" | "UNPUBLISHED". Confirmed live
  // 2026-07-10: an ended-on-eBay listing returns status "UNPUBLISHED" with
  // listing.listingStatus "ENDED" — but listing.listingId is STILL present
  // (the old, now-dead id), which is exactly why the prior liveness check
  // (isPublished = Boolean(listingId)) wrongly reported it as live.
  status?: string;
  listing?: { listingId?: string; listingStatus?: string; soldQuantity?: number };
}

async function getOfferCall(accessToken: string, offerId: string): Promise<GetOfferResponse> {
  const res = await ebayFetch<GetOfferResponse>({
    method: 'GET',
    path: `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`,
    accessToken,
  });
  return res.data;
}

interface BulkPriceQuantityEntry {
  sku: string;
  quantity?: number;
  offerId?: string;
  price?: number;
}

interface BulkPriceQuantityResponse {
  responses?: Array<{
    statusCode?: number;
    offerId?: string;
    sku?: string;
    errors?: Array<{ message?: string }>;
  }>;
}

export function bulkPriceQuantityFailureMessage(
  response: BulkPriceQuantityResponse,
  expectedResponses: number,
): string | null {
  const responses = response.responses ?? [];
  if (responses.length < expectedResponses) return 'eBay returned an incomplete bulk price/quantity response.';
  const failed = responses.find((entry) => entry.statusCode == null || entry.statusCode < 200 || entry.statusCode >= 300);
  if (!failed) return null;
  const target = failed.offerId ? `offer ${failed.offerId}` : failed.sku ? `SKU ${failed.sku}` : 'an offer';
  return failed.errors?.find((error) => error.message)?.message ?? `eBay rejected the price/quantity update for ${target}.`;
}

// TODO(ebay-verify): batching shape (entries appear one-SKU-each, <=25/call
// per the plan's own flag at rest-endpoints-used.md) — this build sends one
// entry per call for isolation/simplicity; batch if verified safe.
async function bulkUpdatePriceQuantity(accessToken: string, entries: BulkPriceQuantityEntry[]): Promise<void> {
  if (!entries.length) return;
  const requests = entries.map((entry) => ({
    sku: entry.sku,
    ...(entry.quantity != null ? { shipToLocationAvailability: { quantity: entry.quantity } } : {}),
    ...(entry.offerId
      ? { offers: [{ offerId: entry.offerId, ...(entry.price != null ? { price: { value: String(entry.price), currency: 'USD' } } : {}) }] }
      : {}),
  }));
  const res = await ebayFetch<BulkPriceQuantityResponse>({
    method: 'POST',
    path: '/sell/inventory/v1/bulk_update_price_quantity',
    accessToken,
    json: { requests },
  });
  const failure = bulkPriceQuantityFailureMessage(res.data, entries.length);
  if (failure) {
    throw new EbayApiError({
      status: 400,
      code: 'bulk_item_failed',
      operatorMessage: failure,
      retryable: false,
      detail: { responses: res.data.responses },
    });
  }
}

// ---------------------------------------------------------------------------
// Main step machine. See ebay-sync-plan/03-sync-lifecycle.md for the state
// diagram. Idempotent at every step (full-replace PUTs, checkpoint reads
// before each write) so a repeated call always converges.
// ---------------------------------------------------------------------------
export async function runSyncStep(productId: string, mode: SyncMode = 'publish'): Promise<SyncStepResult> {
  const service = createServiceClient();
  const listing = await getListing(service, productId);

  if (mode === 'publish-live') return publishLiveStep(service, productId, listing);
  if (mode === 'price-only') return priceOnlyStep(service, productId, listing);
  if (isEbayWriteBlocked(productId, listing)) return writeBlockedResult(productId, listing);

  const product = await loadProduct(service, productId);
  if (!product) {
    return { done: true, syncState: 'error', error: { code: 'product_not_found', message: 'Product not found.' } };
  }

  const connectionRow = await getConnection(service);
  if (!connectionRow || connectionRow.status !== 'connected') {
    return {
      done: true,
      syncState: listing?.sync_state ?? 'pending',
      error: { code: 'not_connected', message: 'Connect eBay in Settings before syncing.' },
    };
  }
  const connection = toConnectionDefaults(connectionRow);
  const spotData = await fetchSpotData().catch(() => null);

  const checks = buildPreflightChecks(product, connection, spotData);
  if (!isPreflightPassing(checks)) {
    const failing = checks.find((check) => !check.ok);
    const message = failing?.message ?? 'Pre-flight failed.';
    await upsertListing(service, productId, {
      ebay_sku: listing?.ebay_sku ?? product.id,
      sync_state: 'error',
      last_error: message,
      error_count: (listing?.error_count ?? 0) + 1,
    });
    await insertSyncLog(service, { product_id: productId, action: 'preflight', outcome: 'error', message });
    return { done: true, syncState: 'error', error: { code: 'preflight_failed', message } };
  }

  // Runaway-prevention (required from day one — ebay-sync-plan/
  // 08-database-schema.md — unlike Etsy, where this was a later production
  // fix): a bulk enqueue resets an item to 'pending'. For an item that
  // already has an offer, a fresh-publish pass creates nothing new and
  // would just sit in 'pending' forever, so the drain loop would re-claim it
  // every pass without end. Treat it as an update instead. Also covers a
  // re-sync of an ENDED item (owner ended/deleted it on eBay, then re-syncs
  // to re-list) — its existing offer's content must be refreshed before it
  // can be re-published with current price/details.
  const effectiveMode: SyncMode =
    mode === 'publish' && listing?.ebay_offer_id != null && (listing.sync_state === 'pending' || listing.sync_state === 'ended')
      ? 'update'
      : mode;

  const payload = buildMappedPayload(product, connection, spotData, undefined, await loadTierPolicyMap(service));

  try {
    const { accessToken } = await ensureFreshAccessToken(service);
    let remoteOfferState: ReturnType<typeof reconcileEbayStateFromOffer> | null = null;
    let remoteListingId = listing?.ebay_listing_id ?? null;

    if (listing?.ebay_offer_id) {
      const offer = await getOfferCall(accessToken, listing.ebay_offer_id);
      remoteOfferState = reconcileEbayStateFromOffer(listing.sync_state, offer.status, offer.listing?.listingStatus);
      remoteListingId = offer.listing?.listingId ?? remoteListingId;

      // Never write an ended managed offer when eBay has an active external
      // relist. That old offer can accept updates without changing the listing
      // buyers actually see.
      if (!remoteOfferState.live && remoteOfferState.syncState === 'ended' && remoteListingId) {
        const relist = await resolveEbayRelistChain({
          startingListingId: remoteListingId,
          expectedSku: listing.ebay_sku,
          lookup: (listingId) => ebayTradingGetItemStatus(accessToken, listingId),
        });
        if (relist.state === 'active') {
          await upsertListing(service, productId, {
            sync_state: 'published',
            ebay_listing_id: relist.listingId,
            last_error: RELISTED_LISTING_WARNING,
          });
          await insertSyncLog(service, {
            product_id: productId,
            listing_id: relist.listingId,
            action: 'sync',
            outcome: 'warning',
            message: RELISTED_LISTING_WARNING,
          });
          return {
            done: true,
            syncState: 'published',
            listingId: relist.listingId,
            listingUrl: listingUrlFor(relist.listingId),
            error: { code: 'detached_relist', message: RELISTED_LISTING_WARNING },
          };
        }
      }
    }

    // Step 1 — inventory item (full replace; idempotent, safe to repeat).
    await putInventoryItem(accessToken, payload);
    await upsertListing(service, productId, {
      ebay_sku: payload.sku,
      sync_state: listing?.ebay_offer_id ? listing.sync_state : 'item_synced',
      category_id: payload.categoryId,
    });

    // Step 2 — offer (create once; full-replace update thereafter).
    let offerId = listing?.ebay_offer_id ?? null;
    if (!offerId) {
      try {
        offerId = await createOffer(accessToken, payload);
      } catch (err) {
        // Crash-window adoption: a prior invocation may have created the
        // offer without persisting the id (eBay enforces one offer per
        // SKU+marketplace+format, so "already exists" is the only way this
        // create can fail for an otherwise-valid payload).
        const adopted = await findExistingOfferId(accessToken, payload.sku, payload.marketplaceId);
        if (!adopted) throw err;
        offerId = adopted;
      }
      await upsertListing(service, productId, { ebay_offer_id: offerId, sync_state: 'offer_created', category_id: payload.categoryId });
    } else if (effectiveMode === 'update') {
      await updateOffer(accessToken, offerId, payload);
    }

    // Step 3 — publish decision. A stale ebay_listing_id lingers on an ENDED
    // listing (eBay keeps returning the old id even after it's ended — see
    // checkListingStatus), so "already live" is keyed on sync_state, NOT just
    // the id's presence. Re-syncing an ended item must go through the
    // review/publish gate — never silently re-mark it published/live (reported
    // bug 2026-07-10: "Sync to eBay" showed an un-published item as LIVE).
    const isLiveOnEbay = remoteOfferState
      ? remoteOfferState.live || remoteOfferState.syncState === 'hidden_oos'
      : listing?.ebay_listing_id != null && listing.sync_state !== 'ended';
    if (!isLiveOnEbay) {
      if (connectionRow.auto_publish) {
        const published = await publishOfferCall(accessToken, offerId!);
        const hash = computeContentHash(payload);
        await upsertListing(service, productId, {
          sync_state: 'published',
          ebay_listing_id: published.listingId,
          content_hash: hash,
          last_pushed_price: payload.price,
          last_pushed_qty: payload.quantity,
          last_error: null,
          error_count: 0,
        });
        await insertSyncLog(service, { product_id: productId, listing_id: published.listingId, action: 'publish', outcome: 'ok' });
        return {
          done: true,
          syncState: 'published',
          listingId: published.listingId,
          listingUrl: listingUrlFor(published.listingId),
          warnings: published.warnings,
        };
      }

      // Q1: review-first default — stop here. Publish is a distinct,
      // deliberately-clicked action (mode: 'publish-live') since eBay has no
      // draft state — an unpublished offer is invisible in Seller Hub, so
      // this preview IS the review surface. Clear any stale ebay_listing_id
      // (an ended item carries the old, dead id): a review item has no live
      // listing, and leaving it set would make publishLiveStep short-circuit
      // as "already published" and never actually re-publish.
      await upsertListing(service, productId, { sync_state: 'review', ebay_listing_id: null, last_error: null, error_count: 0 });
      await insertSyncLog(service, { product_id: productId, action: 'offer_ready', outcome: 'ok' });
      return {
        done: true,
        syncState: 'review',
        warnings: ['Ready to publish — review the preview, then click Publish on eBay (goes live immediately).'],
      };
    }

    // Already published — this is an update pass. isLiveOnEbay (true in this
    // branch) guarantees a live listing id.
    const liveListingId = remoteListingId ?? listing!.ebay_listing_id!;
    const hash = computeContentHash(payload);
    const nextState: EbaySyncState = listing!.sync_state === 'hidden_oos' ? 'hidden_oos' : 'published';
    await upsertListing(service, productId, {
      sync_state: nextState,
      ebay_listing_id: liveListingId,
      content_hash: hash,
      last_pushed_price: payload.price,
      last_pushed_qty: nextState === 'hidden_oos' ? 0 : payload.quantity,
      last_error: null,
      error_count: 0,
    });
    await insertSyncLog(service, { product_id: productId, listing_id: liveListingId, action: 'update', outcome: 'ok' });
    return {
      done: true,
      syncState: nextState,
      listingId: liveListingId,
      listingUrl: listingUrlFor(liveListingId),
    };
  } catch (err) {
    return handleSyncError(service, productId, listing, err, 'sync');
  }
}

async function handleSyncError(
  service: SupabaseClient,
  productId: string,
  listing: EbayListingRow | null,
  err: unknown,
  action: string,
): Promise<SyncStepResult> {
  const isConnectionLevel = err instanceof EbayApiError && (err.code === 'auth_expired' || err.code === 'missing_scope');
  const message = err instanceof EbayApiError ? err.operatorMessage : err instanceof Error ? err.message : 'Unknown error.';
  const code = err instanceof EbayApiError ? err.code : 'unknown';

  if (isConnectionLevel) {
    // Connection-level failures are not this product's fault — leave its
    // sync_state untouched so it doesn't need to be re-triggered once
    // reconnected.
    await insertSyncLog(service, { product_id: productId, action, outcome: 'error', message });
    return { done: true, syncState: listing?.sync_state ?? 'pending', error: { code, message } };
  }

  // ebay_sku is NOT NULL — on a first-ever sync attempt there's no existing
  // row yet, so this upsert is really an INSERT and must supply it (falls
  // back to productId, same convention as the preflight-failure branch
  // above and enqueueProducts()) or the error-logging write itself throws
  // and masks the real failure that got us here.
  await upsertListing(service, productId, {
    ebay_sku: listing?.ebay_sku ?? productId,
    sync_state: 'error',
    last_error: message,
    error_count: (listing?.error_count ?? 0) + 1,
  });
  await insertSyncLog(service, {
    product_id: productId,
    action,
    outcome: 'error',
    message,
    detail: err instanceof EbayApiError ? { code: err.code, status: err.status, errorId: err.errorId } : undefined,
  });
  return { done: true, syncState: 'error', error: { code, message } };
}

async function publishLiveStep(
  service: SupabaseClient,
  productId: string,
  listing: EbayListingRow | null,
): Promise<SyncStepResult> {
  if (isEbayWriteBlocked(productId, listing)) return writeBlockedResult(productId, listing);
  if (!listing?.ebay_offer_id) {
    return {
      done: true,
      syncState: listing?.sync_state ?? 'pending',
      error: { code: 'no_offer', message: 'Sync this item first to prepare an offer before publishing.' },
    };
  }
  if (listing.ebay_listing_id && ['published', 'out_of_date', 'hidden_oos'].includes(listing.sync_state)) {
    return { done: true, syncState: listing.sync_state, listingId: listing.ebay_listing_id, listingUrl: listingUrlFor(listing.ebay_listing_id) };
  }
  try {
    const { accessToken } = await ensureFreshAccessToken(service);
    const published = await publishOfferCall(accessToken, listing.ebay_offer_id);

    // Record a content_hash/last_pushed_* baseline at publish time — the
    // review step (runSyncStep's Q1 branch) never sets one, so without this
    // scanAndMarkOutOfDate spuriously flags a freshly-published item
    // 'out_of_date' the moment it next runs (confirmed live 2026-07-10: the
    // review→Publish Now path is this shop's only publish path since
    // auto_publish is off, and produced exactly this — content_hash null on
    // an otherwise-fine 'published' row). Best-effort: the publish itself
    // must still succeed even if this lookup fails.
    let contentPatch: Partial<Pick<EbayListingRow, 'content_hash' | 'last_pushed_price' | 'last_pushed_qty'>> = {};
    const product = await loadProduct(service, productId).catch(() => null);
    const connectionRow = product ? await getConnection(service).catch(() => null) : null;
    if (product && connectionRow) {
      const connection = toConnectionDefaults(connectionRow);
      const spotData = await fetchSpotData().catch(() => null);
      const payload = buildMappedPayload(product, connection, spotData, undefined, await loadTierPolicyMap(service));
      contentPatch = {
        content_hash: computeContentHash(payload),
        last_pushed_price: payload.price,
        last_pushed_qty: payload.quantity,
      };
    }

    await upsertListing(service, productId, {
      sync_state: 'published',
      ebay_listing_id: published.listingId,
      last_error: null,
      error_count: 0,
      ...contentPatch,
    });
    await insertSyncLog(service, { product_id: productId, listing_id: published.listingId, action: 'publish', outcome: 'ok' });
    return {
      done: true,
      syncState: 'published',
      listingId: published.listingId,
      listingUrl: listingUrlFor(published.listingId),
      warnings: published.warnings,
    };
  } catch (err) {
    return handleSyncError(service, productId, listing, err, 'publish');
  }
}

async function priceOnlyStep(
  service: SupabaseClient,
  productId: string,
  listing: EbayListingRow | null,
): Promise<SyncStepResult> {
  if (isEbayWriteBlocked(productId, listing)) return writeBlockedResult(productId, listing);
  if (!listing?.ebay_offer_id) {
    return {
      done: true,
      syncState: listing?.sync_state ?? 'pending',
      error: { code: 'no_offer', message: 'This item has no eBay offer yet.' },
    };
  }
  const product = await loadProduct(service, productId);
  const connectionRow = await getConnection(service);
  if (!product || !connectionRow || connectionRow.status !== 'connected') {
    return { done: true, syncState: listing.sync_state, error: { code: 'not_connected', message: 'eBay is not connected.' } };
  }
  const connection = toConnectionDefaults(connectionRow);
  const spotData = await fetchSpotData().catch(() => null);
  const priceResult = computeEbayPrice(product, spotData, connection.price_markup_pct);
  if (priceResult.price == null) {
    return {
      done: true,
      syncState: listing.sync_state,
      error: { code: 'price_unavailable', message: priceResult.rejectedReason ?? 'No computable price.' },
    };
  }
  try {
    const { accessToken } = await ensureFreshAccessToken(service);
    await bulkUpdatePriceQuantity(accessToken, [{ sku: listing.ebay_sku, offerId: listing.ebay_offer_id, price: priceResult.price }]);
    await upsertListing(service, productId, { last_pushed_price: priceResult.price });
    await insertSyncLog(service, {
      product_id: productId,
      listing_id: listing.ebay_listing_id,
      action: 'price_push',
      outcome: 'ok',
      detail: { price: priceResult.price },
    });
    return { done: true, syncState: listing.sync_state, listingId: listing.ebay_listing_id ?? undefined };
  } catch (err) {
    return handleSyncError(service, productId, listing, err, 'price_push');
  }
}

// ---------------------------------------------------------------------------
// Manual delist verbs (Q7): hide (quantity-zero, Out-of-Stock Control),
// withdraw (archived/deleted), restore.
// ---------------------------------------------------------------------------
async function withdrawListing(
  service: SupabaseClient,
  listing: EbayListingRow,
  productId: string,
): Promise<void> {
  const { accessToken } = await ensureFreshAccessToken(service);
  if (listing.ebay_offer_id) await withdrawOfferCall(accessToken, listing.ebay_offer_id);
  await upsertListing(service, productId, { sync_state: 'ended' });
  await insertSyncLog(service, { product_id: productId, listing_id: listing.ebay_listing_id, action: 'withdraw', outcome: 'ok' });
}

/**
 * Who zeroed the quantity. Recorded in the `hide_oos` log row's message and
 * read back by the manual-hold rule (`isEbayManualHold`): only an `auto` hide
 * is ever auto-restored by the sweep or the hook. Default `manual` so a caller
 * that forgets to say gets the safe (sticky) behaviour.
 */
export type EbayHideSource = 'manual' | 'auto';

export const EBAY_HIDE_MESSAGE: Record<EbayHideSource, string> = {
  manual: 'manual: quantity zeroed from the admin — stays hidden until restored by hand',
  auto: 'auto: product sold or out of stock on the site',
};

async function hideListingQuantityZero(
  service: SupabaseClient,
  listing: EbayListingRow,
  productId: string,
  source: EbayHideSource = 'manual',
): Promise<void> {
  const { accessToken } = await ensureFreshAccessToken(service);
  await bulkUpdatePriceQuantity(accessToken, [{ sku: listing.ebay_sku, quantity: 0, offerId: listing.ebay_offer_id ?? undefined }]);
  await upsertListing(service, productId, { sync_state: 'hidden_oos', last_pushed_qty: 0 });
  await insertSyncLog(service, {
    product_id: productId,
    listing_id: listing.ebay_listing_id,
    action: 'hide_oos',
    outcome: 'ok',
    message: EBAY_HIDE_MESSAGE[source],
  });
}

async function restoreListingQuantity(
  service: SupabaseClient,
  listing: EbayListingRow,
  productId: string,
  quantity: number | string | null,
): Promise<void> {
  const { accessToken } = await ensureFreshAccessToken(service);
  const qty = normalizeProductQuantity(quantity);
  await bulkUpdatePriceQuantity(accessToken, [{ sku: listing.ebay_sku, quantity: qty, offerId: listing.ebay_offer_id ?? undefined }]);
  await upsertListing(service, productId, { sync_state: 'published', last_pushed_qty: qty });
  await insertSyncLog(service, { product_id: productId, listing_id: listing.ebay_listing_id, action: 'restore', outcome: 'ok' });
}

async function findDetachedRelistListingId(accessToken: string, listing: EbayListingRow): Promise<string | null> {
  if (!listing.ebay_offer_id || !listing.ebay_listing_id) return null;
  const offer = await getOfferCall(accessToken, listing.ebay_offer_id);
  const state = reconcileEbayStateFromOffer(listing.sync_state, offer.status, offer.listing?.listingStatus);
  if (state.live || state.syncState !== 'ended') return null;
  const relist = await resolveEbayRelistChain({
    startingListingId: offer.listing?.listingId ?? listing.ebay_listing_id,
    expectedSku: listing.ebay_sku,
    lookup: (listingId) => ebayTradingGetItemStatus(accessToken, listingId),
  });
  return relist.state === 'active' ? relist.listingId : null;
}

async function restoreEndedListing(
  service: SupabaseClient,
  listing: EbayListingRow,
  product: Product,
  connectionRow: EbayConnectionRow,
  productId: string,
): Promise<string> {
  if (!listing.ebay_offer_id) throw new Error('This ended listing no longer has an eBay offer to republish.');
  const connection = toConnectionDefaults(connectionRow);
  const spotData = await fetchSpotData().catch(() => null);
  const checks = buildPreflightChecks(product, connection, spotData);
  const failing = checks.find((check) => !check.ok);
  if (failing) throw new Error(failing.message ?? 'This item is not ready to be restored on eBay.');

  const payload = buildMappedPayload(product, connection, spotData, undefined, await loadTierPolicyMap(service));
  const { accessToken } = await ensureFreshAccessToken(service);
  await putInventoryItem(accessToken, payload);
  await updateOffer(accessToken, listing.ebay_offer_id, payload);
  const published = await publishOfferCall(accessToken, listing.ebay_offer_id);
  await upsertListing(service, productId, {
    sync_state: 'published',
    ebay_listing_id: published.listingId,
    content_hash: computeContentHash(payload),
    last_pushed_price: payload.price,
    last_pushed_qty: payload.quantity,
    last_error: null,
    error_count: 0,
  });
  await insertSyncLog(service, {
    product_id: productId,
    listing_id: published.listingId,
    action: 'restore',
    outcome: 'ok',
    detail: { priorListingId: listing.ebay_listing_id },
  });
  return published.listingId;
}

export async function runDelist(productId: string, action: 'hide' | 'withdraw' | 'restore'): Promise<SyncStepResult> {
  const service = createServiceClient();
  const connectionRow = await getConnection(service);
  const listing = await getListing(service, productId);
  if (isEbayWriteBlocked(productId, listing)) return writeBlockedResult(productId, listing);
  if (!connectionRow || connectionRow.status !== 'connected') {
    return { done: true, syncState: listing?.sync_state ?? 'pending', error: { code: 'not_connected', message: 'eBay is not connected.' } };
  }
  if (!listing?.ebay_listing_id) {
    return {
      done: true,
      syncState: listing?.sync_state ?? 'pending',
      error: { code: 'not_published', message: 'This item has never been published to eBay.' },
    };
  }
  try {
    const { accessToken } = await ensureFreshAccessToken(service);
    const detachedRelistId = await findDetachedRelistListingId(accessToken, listing);
    if (detachedRelistId) {
      await upsertListing(service, productId, {
        sync_state: 'published',
        ebay_listing_id: detachedRelistId,
        last_error: RELISTED_LISTING_WARNING,
      });
      await insertSyncLog(service, {
        product_id: productId,
        listing_id: detachedRelistId,
        action: `delist_${action}`,
        outcome: 'warning',
        message: RELISTED_LISTING_WARNING,
      });
      return {
        done: true,
        syncState: 'published',
        listingId: detachedRelistId,
        listingUrl: listingUrlFor(detachedRelistId),
        error: { code: 'detached_relist', message: RELISTED_LISTING_WARNING },
      };
    }
    if (action === 'withdraw') {
      await withdrawListing(service, listing, productId);
      return { done: true, syncState: 'ended' };
    }
    if (action === 'hide') {
      await hideListingQuantityZero(service, listing, productId);
      return { done: true, syncState: 'hidden_oos' };
    }
    const product = await loadProduct(service, productId);
    if (!product) throw new Error('Product not found.');
    if (listing.sync_state === 'ended') {
      const listingId = await restoreEndedListing(service, listing, product, connectionRow, productId);
      return { done: true, syncState: 'published', listingId, listingUrl: listingUrlFor(listingId) };
    }
    await restoreListingQuantity(service, listing, productId, product.quantity);
    return {
      done: true,
      syncState: 'published',
      listingId: listing.ebay_listing_id ?? undefined,
      listingUrl: listing.ebay_listing_id ? listingUrlFor(listing.ebay_listing_id) : undefined,
    };
  } catch (err) {
    return handleSyncError(service, productId, listing, err, `delist_${action}`);
  }
}

// "Un-stage": fully discard a PREPARED-but-not-live offer (a 'review' item, or
// an 'ended' item whose unpublished offer still lingers) — delete the offer on
// eBay and reset the row to not-listed, so it drops out of the review/publish
// queue and shows "Not listed" again. A live listing is refused (must be
// ended/hidden first). Idempotent: a 404 on delete (offer already gone) still
// resets the local state.
export async function runUnstage(productId: string): Promise<SyncStepResult> {
  const service = createServiceClient();
  const connectionRow = await getConnection(service);
  const listing = await getListing(service, productId);
  if (!connectionRow || connectionRow.status !== 'connected') {
    return { done: true, syncState: listing?.sync_state ?? 'pending', error: { code: 'not_connected', message: 'eBay is not connected.' } };
  }
  if (!listing?.ebay_offer_id) {
    // Nothing staged — already not listed on eBay.
    return { done: true, syncState: 'pending' };
  }
  if (listing.ebay_listing_id != null && ['published', 'out_of_date', 'hidden_oos'].includes(listing.sync_state)) {
    return {
      done: true,
      syncState: listing.sync_state,
      error: { code: 'is_live', message: 'This item is live on eBay — end the listing first, then un-stage it.' },
    };
  }
  try {
    const { accessToken } = await ensureFreshAccessToken(service);
    try {
      await deleteOfferCall(accessToken, listing.ebay_offer_id);
    } catch (err) {
      // 404 = the offer is already gone on eBay; still reset local state.
      if (!(err instanceof EbayApiError && err.status === 404)) throw err;
    }
    await upsertListing(service, productId, {
      sync_state: 'pending',
      ebay_offer_id: null,
      ebay_listing_id: null,
      content_hash: null,
      last_pushed_price: null,
      last_pushed_qty: null,
      last_error: null,
      error_count: 0,
    });
    await insertSyncLog(service, { product_id: productId, action: 'unstage', outcome: 'ok', message: 'Discarded the prepared eBay offer — reset to not-listed.' });
    return { done: true, syncState: 'pending' };
  } catch (err) {
    return handleSyncError(service, productId, listing, err, 'unstage');
  }
}

// ---------------------------------------------------------------------------
// Reconciliation — read-only calls that pull local state back in line with
// what eBay actually shows, for out-of-band changes (manual Seller Hub edits,
// a listing eBay auto-ended, etc.).
// ---------------------------------------------------------------------------
export interface CheckListingStatusResult {
  found: boolean;
  syncState: EbaySyncState;
  message: string;
  error?: boolean;
}

/**
 * PURE: given our current sync_state and what eBay's GetOffer actually
 * reports, the reconciled sync_state + whether the listing is live. The
 * authoritative "is it live" signal is `listing.listingStatus`, NOT the mere
 * presence of a listingId — eBay keeps returning the old listingId on an
 * ENDED offer (confirmed live 2026-07-10, the reported bug: a listing the
 * owner deleted on eBay kept showing "Confirmed live" because the prior check
 * treated any listingId as proof of publication). Mirrors the Etsy
 * reconcileSyncStateFromEtsy discipline: map eBay's real state, never guess.
 */
export function reconcileEbayStateFromOffer(
  current: EbaySyncState,
  offerStatus: string | undefined,
  listingStatus: string | undefined,
): { syncState: EbaySyncState; live: boolean } {
  const ls = (listingStatus ?? '').toUpperCase();
  const os = (offerStatus ?? '').toUpperCase();

  if (ls === 'ENDED') return { syncState: 'ended', live: false };
  if (ls === 'OUT_OF_STOCK') return { syncState: 'hidden_oos', live: false };
  // Genuinely live: eBay shows an ACTIVE listing (or a PUBLISHED offer with no
  // finer listing status). Preserve a local hidden_oos (quantity-zeroed via
  // Out-of-Stock control but still an active listing on eBay's side). Preserve
  // out_of_date too: lifecycle status does not prove content freshness.
  if (ls === 'ACTIVE' || (os === 'PUBLISHED' && ls === '')) {
    return {
      syncState: current === 'hidden_oos' || current === 'out_of_date' ? current : 'published',
      live: true,
    };
  }
  // Offer exists but is UNPUBLISHED with no active/ended listing. If we thought
  // it was live, eBay ended it out of band → 'ended'; if it was never
  // published, it's a prepared offer awaiting publish → 'review'.
  if (['published', 'out_of_date', 'hidden_oos'].includes(current)) return { syncState: 'ended', live: false };
  return { syncState: 'review', live: false };
}

export type EbayRelistChainResult =
  | { state: 'active'; listingId: string; hops: number }
  | { state: 'inactive'; listingId: string; hops: number; listingStatus: string | null }
  | { state: 'sku_mismatch'; listingId: string; hops: number; actualSku: string | null }
  | { state: 'loop_or_limit'; listingId: string; hops: number };

/** Follow eBay's old-listing -> RelistedItemID chain without adopting another product. */
export async function resolveEbayRelistChain(params: {
  startingListingId: string;
  expectedSku: string;
  lookup: (listingId: string) => Promise<EbayTradingItemStatus>;
  maxHops?: number;
}): Promise<EbayRelistChainResult> {
  const maxHops = params.maxHops ?? 8;
  const seen = new Set<string>();
  let listingId = params.startingListingId;

  for (let hops = 0; hops < maxHops; hops += 1) {
    if (seen.has(listingId)) return { state: 'loop_or_limit', listingId, hops };
    seen.add(listingId);
    const item = await params.lookup(listingId);
    if (item.sku !== params.expectedSku) {
      return { state: 'sku_mismatch', listingId, hops, actualSku: item.sku };
    }
    if ((item.listingStatus ?? '').toUpperCase() === 'ACTIVE') {
      return { state: 'active', listingId: item.itemId, hops };
    }
    if (!item.relistedItemId) {
      return { state: 'inactive', listingId: item.itemId, hops, listingStatus: item.listingStatus };
    }
    listingId = item.relistedItemId;
  }
  return { state: 'loop_or_limit', listingId, hops: maxHops };
}

export async function checkListingStatus(productId: string): Promise<CheckListingStatusResult> {
  const service = createServiceClient();
  const listing = await getListing(service, productId);
  if (!listing?.ebay_offer_id) {
    return { found: false, syncState: listing?.sync_state ?? 'pending', message: 'No linked eBay offer yet.' };
  }
  try {
    const { accessToken } = await ensureFreshAccessToken(service);
    let offer: GetOfferResponse;
    try {
      offer = await getOfferCall(accessToken, listing.ebay_offer_id);
    } catch (err) {
      // Only GetOffer can prove that the managed offer itself is gone. A 404
      // from the later Trading relist lookup must not sever a valid offer link.
      if (!(err instanceof EbayApiError && err.status === 404)) throw err;
      await upsertListing(service, productId, {
        sync_state: 'pending',
        ebay_offer_id: null,
        ebay_listing_id: null,
        content_hash: null,
        last_error: null,
        error_count: 0,
      });
      await insertSyncLog(service, { product_id: productId, action: 'verify', outcome: 'ok', message: 'Offer no longer exists on eBay - reset to not-listed.' });
      return { found: false, syncState: 'pending', message: 'This offer no longer exists on eBay - reset to not-listed. You can sync it fresh.' };
    }
    const offerState = reconcileEbayStateFromOffer(listing.sync_state, offer.status, offer.listing?.listingStatus);
    let syncState = offerState.syncState;
    let live = offerState.live;
    // Only trust eBay's listingId, never our stale stored one.
    let remoteListingId = offer.listing?.listingId ?? listing.ebay_listing_id;
    let relisted = false;

    // The Inventory offer remains ENDED when a seller relists that item in
    // eBay. Trading GetItem exposes the replacement ID, so follow that chain
    // before deciding the product is truly gone.
    if (!live && syncState === 'ended' && (listing.ebay_listing_id ?? remoteListingId)) {
      const relist = await resolveEbayRelistChain({
        startingListingId: listing.ebay_listing_id ?? remoteListingId!,
        expectedSku: listing.ebay_sku,
        lookup: (listingId) => ebayTradingGetItemStatus(accessToken, listingId),
      });
      if (relist.state === 'sku_mismatch') {
        throw new Error('eBay relisted this item under a different SKU, so it was not adopted automatically.');
      }
      if (relist.state === 'loop_or_limit') {
        throw new Error('eBay returned an invalid or unusually long relist chain; local status was left unchanged.');
      }
      remoteListingId = relist.listingId;
      if (relist.state === 'active') {
        syncState = 'published';
        live = true;
        relisted = true;
      }
    }

    await upsertListing(service, productId, {
      sync_state: syncState,
      ebay_listing_id: remoteListingId,
      last_error: relisted ? RELISTED_LISTING_WARNING : null,
      error_count: 0,
    });
    await insertSyncLog(service, {
      product_id: productId,
      listing_id: remoteListingId,
      action: 'verify',
      outcome: relisted ? 'warning' : 'ok',
      message: relisted ? RELISTED_LISTING_WARNING : null,
      detail: relisted ? { source: 'trading_relist', activeListingId: remoteListingId } : null,
    });
    const message = relisted
      ? `Confirmed live on eBay as relisted item ${remoteListingId}. The linked listing ID was corrected here.`
      : live && syncState === 'out_of_date'
        ? 'Confirmed live on eBay; local updates still need to be synced.'
      : live
        ? 'Confirmed live on eBay.'
      : syncState === 'ended'
        ? 'This listing has ended on eBay (ended or removed there) — marked as ended here.'
        : syncState === 'hidden_oos'
          ? 'This listing is out of stock / hidden on eBay.'
          : 'Offer exists but is not published yet.';
    return { found: true, syncState, message };
  } catch (err) {
    const message = err instanceof EbayApiError ? err.operatorMessage : err instanceof Error ? err.message : 'Could not verify.';
    return { found: false, syncState: listing.sync_state, message, error: true };
  }
}

export interface CheckAllStatusResult {
  checked: number;
  updated: number;
  reset: number;
  errors: number;
  /** Requested products that do not have a linked eBay offer. */
  skipped: number;
  items: Array<{
    productId: string;
    syncState: EbaySyncState;
    linked: boolean;
    checkError: boolean;
  }>;
}

export async function checkAllListingStatuses(productIds?: string[]): Promise<CheckAllStatusResult> {
  const service = createServiceClient();
  if (productIds && productIds.length === 0) {
    return { checked: 0, updated: 0, reset: 0, errors: 0, skipped: 0, items: [] };
  }

  let query = service.from('ebay_listings').select('product_id, sync_state').not('ebay_offer_id', 'is', null);
  if (productIds) query = query.in('product_id', productIds);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as Array<{ product_id: string; sync_state: EbaySyncState }>;
  const skipped = productIds ? Math.max(0, productIds.length - rows.length) : 0;
  const requestedIds = productIds ?? rows.map((row) => row.product_id);
  const itemStatus = new Map(rows.map((row) => [row.product_id, {
    productId: row.product_id,
    syncState: row.sync_state,
    linked: true,
    checkError: false,
  }]));
  let updated = 0;
  let reset = 0;
  let errors = 0;
  for (const row of rows) {
    try {
      const result = await checkListingStatus(row.product_id);
      if (row.sync_state !== result.syncState) updated += 1;
      if (!result.found && !result.error && result.syncState === 'pending') reset += 1;
      if (result.error) errors += 1;
      itemStatus.set(row.product_id, {
        productId: row.product_id,
        syncState: result.syncState,
        linked: result.error ? true : result.found,
        checkError: Boolean(result.error),
      });
    } catch {
      errors += 1;
      itemStatus.set(row.product_id, { productId: row.product_id, syncState: row.sync_state, linked: true, checkError: true });
    }
  }
  return {
    checked: rows.length,
    updated,
    reset,
    errors,
    skipped,
    items: requestedIds.map((productId) => itemStatus.get(productId)
      ?? { productId, syncState: 'pending', linked: false, checkError: false }),
  };
}

// ---------------------------------------------------------------------------
// Phase 2 — bulk queue + drain.
// ---------------------------------------------------------------------------
/**
 * Largest number of listings one bulk enqueue may stage for live eBay writes.
 * "Never blanket re-sync" is a standing project rule: a single click that
 * rewrites the entire catalog on a live marketplace has no undo, and one bad
 * mapping would be multiplied across every listing. Work proceeds in reviewable
 * batches instead — drain, check the results on eBay, enqueue the next batch.
 */
export { EBAY_BULK_ENQUEUE_LIMIT } from './guards';

export interface EnqueueResult {
  /** Listings actually staged for a write. */
  queued: number;
  /** Skipped because the product id is write-blocked (e.g. inventory #82). */
  blocked: number;
  /** Skipped because the product is no longer available (sold/held/removed). */
  notAvailable: number;
  /** Eligible but withheld by EBAY_BULK_ENQUEUE_LIMIT; enqueue again for more. */
  withheld: number;
}

/**
 * Bounded, guarded bulk enqueue. Three filters run before anything is staged:
 * pinned write-blocks, non-available products, then the batch cap. Together
 * they are the mechanical form of the standing cautions — never blanket
 * re-sync, and never write a quarantined or sold listing.
 */
/**
 * Where a listing sits in the enqueue queue, lowest first.
 *
 * 0 — needs the write: never listed, mid-flight, or content-stale.
 * 1 — `error`: worth retrying, but only once the clean backlog is drained. Two
 *     permanently-failing items sitting at the head of every run would eat two
 *     of the 25 slots forever and climb their error count for nothing.
 * 2 — `published`: already current, so it goes last and is only reached when a
 *     run has nothing better to do (which is what makes a deliberate
 *     force-re-push of a live selection still work).
 */
export function enqueueCandidatePriority(state: EbaySyncState | null | undefined): number {
  if (state === 'published') return 2;
  if (state === 'error') return 1;
  return 0;
}

/** PURE: stale-first ordering for one enqueue batch. Stable within each group. */
export function orderEnqueueCandidates(
  productIds: string[],
  stateByProduct: ReadonlyMap<string, EbaySyncState | null>,
): string[] {
  return [...productIds].sort(
    (a, b) => enqueueCandidatePriority(stateByProduct.get(a)) - enqueueCandidatePriority(stateByProduct.get(b)),
  );
}

export async function enqueueProducts(productIds: string[]): Promise<EnqueueResult> {
  const service = createServiceClient();
  // Write-blocked ids never enter the queue at all — the per-step guard would
  // stop them anyway, but keeping them out avoids parking a permanently
  // un-drainable row in 'pending'.
  // Owner-excluded items are dropped here too, for the same reason: queueing
  // one only parks a row that pre-flight will reject, and (since
  // orderEnqueueCandidates ranks `error` ahead of `published`) it would then sit
  // at the front of every later run burning a slot on a write nobody wants.
  const isHeldBack = (id: string) => EBAY_WRITE_BLOCKED_PRODUCT_IDS.has(id) || EBAY_EXCLUDED_PRODUCT_IDS.has(id);
  const blocked = productIds.filter(isHeldBack).length;
  const notBlocked = productIds.filter((id) => !isHeldBack(id));

  // Sold pieces would fail runSyncStep's pre-flight anyway ("Only available
  // items can be published to eBay") — but only after flipping the row to
  // 'error' and writing a log line each. A catalog-wide re-sync would bury the
  // real failures under dozens of those, so drop them before they are queued.
  const available = new Set<string>();
  for (let index = 0; index < notBlocked.length; index += 200) {
    const { data, error } = await service
      .from('products')
      .select('id')
      .eq('status', 'available')
      .in('id', notBlocked.slice(index, index + 200));
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as { id: string }[]) available.add(row.id);
  }
  const allowed = notBlocked.filter((id) => available.has(id));

  // Order the batch so a repeated run ADVANCES instead of redoing its own work.
  //
  // This used to be a bare `allowed.slice(0, LIMIT)`, which meant passing the
  // same selection twice queued the same first 25 both times. The shipping-tier
  // campaign is run exactly that way — "select all, sync, run it again for the
  // next batch" — and the second run re-pushed 21 of the same 23 listings and
  // made no progress (measured 2026-08-11).
  //
  // Ordering rather than FILTERING is deliberate: excluding already-current rows
  // would break the other use of this path, where an admin selects a handful of
  // live items and deliberately force-re-pushes them. Sorting keeps that working
  // (nothing stale to outrank them) while making backlog runs drain properly.
  // Array.prototype.sort is stable, so the caller's order survives within groups.
  const listingStates = new Map<string, EbaySyncState | null>();
  for (let index = 0; index < allowed.length; index += 200) {
    const { data } = await service
      .from('ebay_listings')
      .select('product_id, sync_state')
      .in('product_id', allowed.slice(index, index + 200));
    for (const row of (data ?? []) as { product_id: string; sync_state: EbaySyncState | null }[]) {
      listingStates.set(row.product_id, row.sync_state);
    }
  }
  const batch = orderEnqueueCandidates(allowed, listingStates).slice(0, EBAY_BULK_ENQUEUE_LIMIT);

  let queued = 0;
  for (const productId of batch) {
    // Re-enqueuing an already-listed item as 'pending' is safe: runSyncStep's
    // effectiveMode reinterpretation treats it as an update, never a
    // re-publish, so it can never spin forever in the drain loop.
    await upsertListing(service, productId, { sync_state: 'pending', ebay_sku: productId });
    queued += 1;
  }
  return {
    queued,
    blocked,
    notAvailable: notBlocked.length - allowed.length,
    withheld: allowed.length - batch.length,
  };
}

export async function enqueueAllEligible(): Promise<EnqueueResult> {
  const service = createServiceClient();
  const { data: products } = await service.from('products').select('*').eq('status', 'available');
  const connectionRow = await getConnection(service);
  const connection = connectionRow ? toConnectionDefaults(connectionRow) : null;
  const spotData = await fetchSpotData().catch(() => null);

  const eligibleIds: string[] = [];
  for (const product of (products ?? []) as Product[]) {
    const checks = buildPreflightChecks(product, connection, spotData);
    if (isPreflightPassing(checks)) eligibleIds.push(product.id);
  }
  return enqueueProducts(eligibleIds);
}

export interface DrainDeps {
  claimNext: () => Promise<string | null>;
  runStep: (productId: string) => Promise<SyncStepResult>;
  now: () => number;
  budgetMs: number;
}

export interface DrainCoreResult {
  results: Array<{ productId: string; syncState: EbaySyncState }>;
  exhausted: boolean;
}

// Pure orchestration loop — unit-tested with fake deps. Ports the Etsy
// build's production runaway-fix intent (a seen-guard so a re-claimed item
// can't cycle a drain pass forever) as a day-one requirement.
export async function drainQueueCore(deps: DrainDeps): Promise<DrainCoreResult> {
  const start = deps.now();
  const results: DrainCoreResult['results'] = [];
  const seen = new Set<string>();
  for (;;) {
    if (deps.now() - start > deps.budgetMs) return { results, exhausted: false };
    const productId = await deps.claimNext();
    if (!productId) return { results, exhausted: true };
    if (seen.has(productId)) return { results, exhausted: false };
    seen.add(productId);
    const result = await deps.runStep(productId);
    results.push({ productId, syncState: result.syncState });
    if (!result.done) break;
  }
  return { results, exhausted: false };
}

const DRAIN_TIME_BUDGET_MS = 8000;

export interface DrainResult {
  done: boolean;
  remaining: number;
  results: DrainCoreResult['results'];
}

export async function drainQueue(): Promise<DrainResult> {
  const service = createServiceClient();
  const core = await drainQueueCore({
    claimNext: () => claimNextPendingListing(service),
    runStep: (productId) => runSyncStep(productId, 'publish'),
    now: () => Date.now(),
    budgetMs: DRAIN_TIME_BUDGET_MS,
  });
  const remaining = await countPendingListings(service);
  return { done: core.exhausted && remaining === 0, remaining, results: core.results };
}

// Bulk-publish drain — publishes every already-prepared 'review' listing
// live, in the same time-budgeted, resumable, seen-guarded shape as
// drainQueue (reuses drainQueueCore). Distinct from drainQueue because
// publishing is a deliberate go-live action (Q1), never folded into sync.
export async function drainPublishQueue(): Promise<DrainResult> {
  const service = createServiceClient();
  const core = await drainQueueCore({
    claimNext: () => claimNextReviewListing(service),
    runStep: (productId) => runSyncStep(productId, 'publish-live'),
    now: () => Date.now(),
    budgetMs: DRAIN_TIME_BUDGET_MS,
  });
  const remaining = await countReviewListings(service);
  return { done: core.exhausted && remaining === 0, remaining, results: core.results };
}

// ---------------------------------------------------------------------------
// Content-hash change detection — no eBay reads needed.
//
// Mirrors the Etsy fix (lib/etsy/sync.ts scanAndMarkOutOfDate): this was
// fully built and unit-tested but never actually CALLED from anywhere, so a
// price edit on an already-published listing was never detected — confirmed
// live 2026-07-10 via the identical Etsy bug report. Wired into the same
// adminRevalidateProduct/adminRevalidateProducts chokepoint as the Etsy
// version (see admin-products.ts). Pass `productIds` to check just those
// products (the intended per-save call shape) instead of the full catalog.
// ---------------------------------------------------------------------------
/**
 * What the freshness scan should do with one row, before any hashing.
 *
 * A sold/hidden piece is never a content-push candidate: `out_of_date` means
 * "this listing needs a push", and pushing a sold piece is precisely what must
 * never happen — so hashing one can only ever produce a false flag.
 *
 * Until 2026-08-04 the scan hashed `hidden_oos` rows too. The tier
 * shipping-policy change duly flipped all 36 sold-and-hidden listings to
 * `out_of_date`, destroying the state that records "hidden on eBay because it
 * sold" and inflating the re-sync campaign by a third.
 *
 * `repair-hidden` undoes exactly that. `last_pushed_qty === 0` is durable proof
 * that `hideListingQuantityZero()` really did zero the listing on eBay (the
 * scan never touches that column), so it separates a mis-flagged hidden row
 * from a just-sold row whose auto-hide has not run yet — the latter must stay
 * visible as work to do rather than be relabelled as already hidden.
 */
export type FreshnessScanAction = 'hash' | 'skip' | 'repair-hidden';

export function resolveFreshnessScanAction(
  listing: Pick<EbayListingRow, 'sync_state' | 'last_pushed_qty'>,
  productStatus: string | null | undefined,
): FreshnessScanAction {
  if (normalizeProductStatus(productStatus) !== 'available') {
    return listing.sync_state === 'out_of_date' && listing.last_pushed_qty === 0 ? 'repair-hidden' : 'skip';
  }
  // Already flagged — re-hashing would only rewrite the same value.
  if (listing.sync_state === 'out_of_date') return 'skip';
  return 'hash';
}

export async function scanAndMarkOutOfDate(productIds?: string[]): Promise<number> {
  const service = createServiceClient();
  const connectionRow = await getConnection(service);
  if (!connectionRow) return 0;
  const connection = toConnectionDefaults(connectionRow);
  const spotData = await fetchSpotData().catch(() => null);

  // 'out_of_date' is selected only so the repair branch below can see rows this
  // scan itself mis-flagged; an already-flagged available row is skipped.
  let query = service.from('ebay_listings').select('*').in('sync_state', ['published', 'hidden_oos', 'out_of_date']);
  if (productIds) query = query.in('product_id', productIds);
  const { data: listings } = await query;
  let flagged = 0;
  const tierPolicyMap = await loadTierPolicyMap(service);
  for (const listing of (listings ?? []) as EbayListingRow[]) {
    const product = await loadProduct(service, listing.product_id);
    if (!product) continue;

    const action = resolveFreshnessScanAction(listing, product.status);
    if (action === 'repair-hidden') {
      await upsertListing(service, listing.product_id, { sync_state: 'hidden_oos' });
      continue;
    }
    if (action === 'skip') continue;

    // The shipping policy is price-tiered and participates in the content
    // hash. During a live-spot outage, skip spot-priced rows instead of
    // falsely marking them out of date with a fallback/unknown tier.
    if (product.price_mode === 'spot-multiplier'
      && computeEbayPrice(product, spotData, connection.price_markup_pct).price == null) {
      continue;
    }
    const payload = buildMappedPayload(product, connection, spotData, undefined, tierPolicyMap);
    const hash = computeContentHash(payload);
    if (hash !== listing.content_hash) {
      await upsertListing(service, listing.product_id, { sync_state: 'out_of_date' });
      flagged += 1;
    }
  }
  return flagged;
}

// ---------------------------------------------------------------------------
// Price-push threshold (Q3) — pure, exported standalone for unit testing.
// ---------------------------------------------------------------------------
export function shouldPushPrice(newPrice: number, lastPushedPrice: number | null, thresholdPct: number): boolean {
  if (lastPushedPrice == null || lastPushedPrice <= 0) return true;
  const changePct = (Math.abs(newPrice - lastPushedPrice) / lastPushedPrice) * 100;
  return changePct >= thresholdPct;
}

const PRICE_PRODUCT_COLUMNS = [
  'id',
  'category',
  'price_mode',
  'manual_price_label',
  'asking_price',
  'pricing_multiplier',
  'gram_weight',
  'weight_grams',
  'purity',
  'status',
  'sold_price',
].join(',');

export interface EbayPricePushCandidate {
  listing: EbayListingRow;
  price: number;
}

export interface EbayPricePushResult {
  done: boolean;
  pushed: number;
  skipped: number;
  failed: number;
  blocked: number;
  remaining: number;
}

function emptyPricePushResult(): EbayPricePushResult {
  return { done: true, pushed: 0, skipped: 0, failed: 0, blocked: 0, remaining: 0 };
}

async function loadPriceProducts(service: SupabaseClient, productIds: string[]): Promise<Map<string, Product>> {
  if (!productIds.length) return new Map();
  const { data, error } = await service.from('products').select(PRICE_PRODUCT_COLUMNS).in('id', productIds);
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as unknown as Product[]).map((product) => [product.id, product]));
}

/**
 * Consecutive price-push failures before a listing stops being retried.
 *
 * The manual "push prices" button runs one bounded batch and the client polls
 * until done. A failed listing keeps its old `last_pushed_price`, so it stays a
 * candidate and is re-attempted on every poll — 33 broken listings produced 139
 * error rows in a single run (2026-08-08). A successful push clears the count.
 *
 * Defined in `lib/marketplace-price-chip.ts` and re-exported here: this module is
 * `server-only`, and the Product Admin price chip has to state the same ceiling
 * the planner enforces. Same reasoning as `guards.ts` — see that file.
 */
export { MAX_PRICE_PUSH_ATTEMPTS };

export function planEbayPricePush(
  listings: EbayListingRow[],
  products: Map<string, Product>,
  spotData: SpotData,
  markupPct: number,
  thresholdPct: number | null,
): { candidates: EbayPricePushCandidate[]; skipped: number; blocked: number } {
  const candidates: EbayPricePushCandidate[] = [];
  let skipped = 0;
  let blocked = 0;

  for (const listing of listings) {
    if (isEbayWriteBlocked(listing.product_id, listing) || !listing.ebay_offer_id) {
      blocked += 1;
      continue;
    }
    const product = products.get(listing.product_id);
    if (!product) {
      skipped += 1;
      continue;
    }
    // A SOLD product's listing is already withdrawn on eBay (quantity pushed to
    // 0 by the auto-delist path), and eBay rejects a price update on an ended
    // or zero-quantity offer with HTTP 400. But the listing row stays
    // `out_of_date` forever — it genuinely is out of date, it is just also dead
    // — so the sync_state filter alone keeps re-selecting it every run.
    //
    // Measured 2026-08-08: of 33 products that always failed the price push,
    // 32 were `sold` with `last_pushed_qty = 0`. That is ~33 guaranteed eBay
    // 400s per run, every run, forever.
    //
    // Keyed on CURRENT product status, deliberately, rather than marking the
    // listing dead: relisting a sold item flips it back to `available` and it
    // becomes a candidate again on the next run with no manual repair.
    if (normalizeProductStatus(product.status) !== 'available') {
      skipped += 1;
      continue;
    }
    // Backstop for anything the status check does not catch (one of the 33 was
    // `available`). A listing that has failed repeatedly is almost certainly
    // broken on eBay's side, and retrying it every run burns API quota to
    // produce the same error. A successful push resets the counter, so this
    // un-sticks itself the moment the underlying problem is fixed.
    if ((listing.error_count ?? 0) >= MAX_PRICE_PUSH_ATTEMPTS) {
      skipped += 1;
      continue;
    }
    const priceResult = computeEbayPrice(product, spotData, markupPct);
    if (priceResult.price == null) {
      blocked += 1;
      continue;
    }
    const shouldPush = thresholdPct == null
      ? priceResult.price !== listing.last_pushed_price
      : shouldPushPrice(priceResult.price, listing.last_pushed_price, thresholdPct);
    if (!shouldPush) {
      skipped += 1;
      continue;
    }
    candidates.push({ listing, price: priceResult.price });
  }

  return { candidates, skipped, blocked };
}

/**
 * Record a whole batch of successful pushes in TWO round-trips, not two per
 * listing.
 *
 * This was per-candidate until 2026-08-21, and that is what made the scheduled
 * push time out. eBay itself was never slow: 50 prices go up in two
 * `bulk_update_price_quantity` calls, but recording them cost 100 serialized
 * Supabase round-trips at ~157ms each — 15.7s of a 22.2s run. The push then
 * blew the gateway's ceiling at 32s and GitHub marked the job failed even
 * though every price had actually landed.
 */
async function recordEbayPricePushSuccesses(
  service: SupabaseClient,
  candidates: EbayPricePushCandidate[],
): Promise<void> {
  if (!candidates.length) return;
  // Clearing the counter is what makes the backoff self-healing: once whatever
  // was wrong on eBay is fixed and one push lands, the listing is eligible again.
  await bulkPatchListings(service, candidates.map((candidate) => ({
    product_id: candidate.listing.product_id,
    // Required by bulkPatchListings — `ebay_sku` is `not null`, so the INSERT
    // half of the upsert needs it. Taken off the row we just read.
    ebay_sku: candidate.listing.ebay_sku,
    last_pushed_price: candidate.price,
    error_count: 0,
    last_error: null,
  })));
  await insertSyncLogs(service, candidates.map((candidate) => ({
    product_id: candidate.listing.product_id,
    listing_id: candidate.listing.ebay_listing_id,
    action: 'price_push',
    outcome: 'ok' as const,
    detail: { price: candidate.price },
  })));
}

/** One failed candidate, paired with the error eBay returned for it. */
interface EbayPricePushFailure {
  candidate: EbayPricePushCandidate;
  err: unknown;
}

/**
 * Bulk twin of the old per-candidate failure recorder. Same two writes and the
 * same detail payload, batched for the same reason as
 * `recordEbayPricePushSuccesses`.
 */
async function recordEbayPricePushFailures(
  service: SupabaseClient,
  failures: EbayPricePushFailure[],
): Promise<void> {
  if (!failures.length) return;
  const described = failures.map(({ candidate, err }) => ({
    candidate,
    message: describeEbayPricePushError(err),
    detail: describeEbayPricePushDetail(candidate, err),
  }));

  // Rotate the failed rows behind untouched rows without changing their pushed
  // price, so a single bad offer cannot block the rest of a manual run.
  //
  // Also COUNT the failure. This was a no-op patch `{}` before, so
  // `error_count` never moved off 0 and nothing could ever back off — every
  // broken listing was retried on every poll forever. `last_error` gives the
  // admin panel something to show besides a bare count.
  //
  // Best-effort, exactly as the per-item version was: bookkeeping for a failed
  // push must not itself throw and abandon the rest of the run.
  await bulkPatchListings(service, described.map(({ candidate, message }) => ({
    product_id: candidate.listing.product_id,
    ebay_sku: candidate.listing.ebay_sku,
    error_count: (candidate.listing.error_count ?? 0) + 1,
    last_error: message.slice(0, 500),
  }))).catch(() => {});
  await insertSyncLogs(service, described.map(({ candidate, message, detail }) => ({
    product_id: candidate.listing.product_id,
    listing_id: candidate.listing.ebay_listing_id,
    action: 'price_push',
    outcome: 'error' as const,
    message,
    detail,
  })));
}

function describeEbayPricePushError(err: unknown): string {
  return err instanceof EbayApiError ? err.operatorMessage : err instanceof Error ? err.message : 'Price push failed.';
}

function describeEbayPricePushDetail(
  candidate: EbayPricePushCandidate,
  err: unknown,
): Record<string, unknown> {
  // Persist the API detail, not just the operator sentence.
  //
  // `EbayApiError.detail` is redacted at construction specifically so it is
  // safe to store here, and `mapErrorResponse` notes it is "often the only
  // place the SPECIFIC reason behind a generic top-level message shows up".
  // It was being dropped, which is why a real investigation (2026-08-08) found
  // 140 rows all reading `eBay API error (HTTP 400).` and no cause: eBay
  // returned a 400 whose envelope carried no top-level message, so the operator
  // string fell back to the generic form and the useful part was discarded.
  return err instanceof EbayApiError
    ? {
      status: err.status,
      code: err.code,
      errorId: err.errorId,
      category: err.category,
      retryable: err.retryable,
      response: err.detail,
      offerId: candidate.listing.ebay_offer_id,
      sku: candidate.listing.ebay_sku,
      attemptedPrice: candidate.price,
    }
    : { message: String(err).slice(0, 500), offerId: candidate.listing.ebay_offer_id };
}

async function pushEbayPriceCandidates(params: {
  service: SupabaseClient;
  candidates: EbayPricePushCandidate[];
  maxItems?: number;
  /**
   * ABSOLUTE epoch-ms deadline for the whole REQUEST, not a duration for this
   * loop. It used to be `budgetMs`, measured from the top of this function —
   * which could not bound the request, because everything before it (spot
   * fetch, connection read, listing + product queries) fell outside the
   * measurement. On 2026-08-21 that setup ran ~10s, the loop then used its
   * full 22s, and the 32s total blew the gateway's ceiling. The caller now
   * stamps the deadline on entry so this is a real ceiling.
   */
  deadlineAt?: number;
}): Promise<{ pushed: number; failed: number; remaining: number }> {
  const limit = Math.min(params.maxItems ?? params.candidates.length, params.candidates.length);
  const { accessToken } = limit > 0
    ? await ensureFreshAccessToken(params.service)
    : { accessToken: '' };
  let attempted = 0;
  let pushed = 0;
  let failed = 0;
  // The deadline is only testable BETWEEN chunks, so a naive check can still
  // overshoot by a whole chunk — and one bulk eBay call was measured at 6.5s
  // (2026-08-21). Require headroom equal to the worst chunk seen SO FAR in
  // this run: costs nothing on a fast day, self-tightens on a slow one, and
  // never blocks the first chunk (which must run for the push to progress).
  let worstChunkMs = 0;
  const outOfTime = () => params.deadlineAt != null
    && attempted > 0
    && Date.now() + worstChunkMs > params.deadlineAt;

  while (attempted < limit) {
    if (outOfTime()) break;
    const chunkStartedAt = Date.now();
    const chunk = params.candidates.slice(attempted, Math.min(attempted + 25, limit));
    const entries = chunk.map((candidate) => ({
      sku: candidate.listing.ebay_sku,
      offerId: candidate.listing.ebay_offer_id!,
      price: candidate.price,
    }));

    try {
      await bulkUpdatePriceQuantity(accessToken, entries);
      await recordEbayPricePushSuccesses(params.service, chunk);
      pushed += chunk.length;
      attempted += chunk.length;
    } catch {
      // A mixed eBay bulk response can contain one bad offer. Retry this chunk
      // one item at a time so the valid offers still advance. Results are
      // accumulated and written once at the end of the chunk rather than per
      // item — same reason the success path is batched.
      const succeeded: EbayPricePushCandidate[] = [];
      const failures: EbayPricePushFailure[] = [];
      for (const candidate of chunk) {
        // Per-item granularity here, so no headroom term is needed: the
        // overshoot is one single-offer call, not a 25-offer bulk one.
        if (params.deadlineAt != null && attempted > 0 && Date.now() > params.deadlineAt) break;
        try {
          await bulkUpdatePriceQuantity(accessToken, [{
            sku: candidate.listing.ebay_sku,
            offerId: candidate.listing.ebay_offer_id!,
            price: candidate.price,
          }]);
          succeeded.push(candidate);
        } catch (err) {
          failures.push({ candidate, err });
        }
        attempted += 1;
      }
      await recordEbayPricePushSuccesses(params.service, succeeded);
      await recordEbayPricePushFailures(params.service, failures);
      pushed += succeeded.length;
      failed += failures.length;
    }

    worstChunkMs = Math.max(worstChunkMs, Date.now() - chunkStartedAt);
  }

  return { pushed, failed, remaining: params.candidates.length - attempted };
}

/**
 * Wall-clock ceiling for the WHOLE scheduled request, stamped on entry.
 *
 * 20s, not the old 22s, and measured from a different place. The old value was
 * a budget for the push loop alone; setup ran outside it, so the real ceiling
 * was 22s + however long setup took. On 2026-08-21 that was 32s and the
 * gateway returned a 504 `Inactivity Timeout` after every price had already
 * been pushed — the work succeeded and the job still went red.
 *
 * 20s leaves headroom under Netlify's 26s synchronous-function ceiling. With
 * the bookkeeping batched this should now be slack rather than the thing that
 * shapes a run: the same 55-candidate day that needed 22s+ of loop time fits
 * in a few seconds of it. If runs start reporting `deferred` again, that is
 * the signal the catalog has outgrown a single synchronous request — move the
 * push to a background function rather than raising this number toward 26.
 */
const SCHEDULED_PRICE_PUSH_BUDGET_MS = 20_000;

export async function runScheduledPricePush(): Promise<EbayPricePushResult> {
  // Stamped FIRST — before the prune, the connection read, the spot fetch and
  // the listing/product queries — so the deadline covers setup too.
  const deadlineAt = Date.now() + SCHEDULED_PRICE_PUSH_BUDGET_MS;
  const service = createServiceClient();
  await pruneOldSyncLogs(service).catch(() => {});

  try {
    const connectionRow = await getConnection(service);
    if (!connectionRow || connectionRow.status !== 'connected' || !connectionRow.price_push_enabled) {
      const message = !connectionRow || connectionRow.status !== 'connected'
        ? 'Scheduled eBay price push skipped because eBay is not connected.'
        : 'Scheduled eBay price push ran, but daily price pushes are disabled.';
      await insertSyncLog(service, { action: 'scheduled_price_push', outcome: 'warning', message });
      return emptyPricePushResult();
    }

    const connection = toConnectionDefaults(connectionRow);
    const [spotData, listingResult] = await Promise.all([
      fetchSpotData(),
      service
        .from('ebay_listings')
        .select('*')
        .in('sync_state', ['published', 'out_of_date'])
        .order('updated_at', { ascending: true }),
    ]);
    if (listingResult.error) throw new Error(listingResult.error.message);

    const listings = (listingResult.data ?? []) as EbayListingRow[];
    const products = await loadPriceProducts(service, listings.map((listing) => listing.product_id));
    const plan = planEbayPricePush(
      listings,
      products,
      spotData,
      connection.price_markup_pct,
      connectionRow.price_push_threshold_pct,
    );
    const processed = await pushEbayPriceCandidates({
      service,
      candidates: plan.candidates,
      deadlineAt,
    });
    const result: EbayPricePushResult = {
      done: processed.remaining === 0,
      pushed: processed.pushed,
      skipped: plan.skipped,
      failed: processed.failed,
      blocked: plan.blocked,
      remaining: processed.remaining,
    };
    const outcome = result.failed || result.blocked || result.remaining ? 'warning' : 'ok';
    const message = `Scheduled eBay price push: ${result.pushed} pushed, ${result.skipped} unchanged, ${result.blocked} blocked, ${result.failed} failed, ${result.remaining} deferred.`;
    await insertSyncLog(service, { action: 'scheduled_price_push', outcome, message, detail: { ...result } });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Scheduled eBay price push failed.';
    await insertSyncLog(service, { action: 'scheduled_price_push', outcome: 'error', message });
    throw err;
  }
}

// Manual "Push prices to eBay now" — one bounded batch, client polls until done.
export async function pushPricesBatch(): Promise<EbayPricePushResult> {
  const service = createServiceClient();
  const connectionRow = await getConnection(service);
  if (!connectionRow || connectionRow.status !== 'connected') return emptyPricePushResult();
  const connection = toConnectionDefaults(connectionRow);
  const [spotData, listingResult] = await Promise.all([
    fetchSpotData(),
    service
      .from('ebay_listings')
      .select('*')
      .in('sync_state', ['published', 'out_of_date'])
      .order('updated_at', { ascending: true }),
  ]);
  if (listingResult.error) throw new Error(listingResult.error.message);

  const listings = (listingResult.data ?? []) as EbayListingRow[];
  const products = await loadPriceProducts(service, listings.map((listing) => listing.product_id));
  const plan = planEbayPricePush(listings, products, spotData, connection.price_markup_pct, null);
  const processed = await pushEbayPriceCandidates({
    service,
    candidates: plan.candidates,
    maxItems: 25,
  });
  return {
    done: processed.remaining === 0,
    pushed: processed.pushed,
    skipped: plan.skipped,
    failed: processed.failed,
    blocked: plan.blocked,
    remaining: processed.remaining,
  };
}

// ---------------------------------------------------------------------------
// Status-drift reconciliation (2026-08-21)
//
// WHY THIS EXISTS — the auto-delist hook cannot be made reliable in-request
// ------------------------------------------------------------------------
// `handleProductStatusChange` runs after the response via `after()`, and on
// Netlify that is best-effort BY DESIGN: Next's own feature matrix lists
// `after()` as "Requires graceful shutdown support", which the Lambda
// freeze-on-response model does not provide. Measured 2026-08-21: a `hide_oos`
// log insert landed 127.6s after the `upsertListing` two lines above it, when
// the frozen container thawed on a later request. Work on a container that is
// reclaimed while cold is lost outright — that is how two sold products stayed
// live on both marketplaces for twelve days.
//
// So this sweep does NOT try to schedule better. It asks a different question:
// "does any listing's state disagree with its product's status right now?" and
// repairs what it finds. That catches a missed delist regardless of cause — a
// frozen container, a marketplace API error, or a status-write path nobody
// hooked — which no scheduling primitive can.
//
// It deliberately DELEGATES the repair to `handleProductStatusChange` rather
// than reimplementing withdraw/hide/restore. The sweep owns detection only;
// duplicating the write logic is how the two drift apart.
// ---------------------------------------------------------------------------

/** What a drifted listing needs. `null` when local state already agrees. */
export type EbayStatusDrift = 'delist' | 'restore' | null;

/**
 * Pure mirror of `handleProductStatusChange`'s branches. Kept pure and exported
 * so the drift rules are testable without a database or an eBay account — and
 * so a future change to the hook that forgets this function fails a test rather
 * than silently making the sweep blind.
 */
export function detectEbayStatusDrift(
  listing: EbayListingRow,
  product: { status?: string | null; quantity?: number | null } | null,
  manualHold = false,
): EbayStatusDrift {
  // A write-blocked listing is quarantined on purpose; the sweep must not
  // "repair" it into a write the owner deliberately suspended.
  if (isEbayWriteBlocked(listing.product_id, listing)) return null;
  if (!listing.ebay_listing_id) return null;
  if (!product) return null;

  const status = normalizeProductStatus(product.status);
  const quantity = normalizeProductQuantity(product.quantity);
  const isSoldOut = status === 'sold' || quantity <= 0;

  if (status === 'archived' || status === 'draft') {
    return listing.sync_state === 'ended' ? null : 'delist';
  }
  if (isSoldOut) {
    return listing.sync_state === 'published' || listing.sync_state === 'out_of_date' ? 'delist' : null;
  }
  // `manualHold` (2026-09-24, owner ruling): a listing the OWNER hid — the
  // drawer's Hide button, or quantity zeroed on eBay itself and picked up by
  // the status check — is never auto-restored. Only a hide automation wrote
  // (`auto:` in the newest hide_oos log row) is undone when the product comes
  // back; see `isEbayManualHold`. Twin of the Etsy rule. `ended` listings were
  // never auto-restored and still are not.
  if (status === 'available' && quantity > 0 && listing.sync_state === 'hidden_oos') {
    return manualHold ? null : 'restore';
  }
  return null;
}

/**
 * The manual-hold rule, from the newest successful `hide_oos` log message for
 * the product. Only a message automation wrote (`auto: …`) releases the hold.
 * No row at all (quantity zeroed on eBay's side, or hidden before this rule)
 * and every `manual: …` row keep the listing hidden.
 */
export function isEbayManualHold(latestHideMessage: string | null | undefined): boolean {
  return !(typeof latestHideMessage === 'string' && latestHideMessage.startsWith('auto:'));
}

/** Manual-hold lookup for one product — the hook's and the repair's per-item path. */
async function loadEbayManualHold(service: SupabaseClient, productId: string): Promise<boolean> {
  const latest = await getLatestHideMessages(service, [productId]);
  return isEbayManualHold(latest.get(productId));
}

export interface EbayReconcileResult {
  scanned: number;
  drifted: number;
  /** Direct withdraw/hide/restore succeeded and the drift is gone. */
  repaired: number;
  /** eBay refused the write but already showed the listing ended; local row pulled in line. */
  reconciled: number;
  /** Still drifted after the write AND the read-only check. */
  failed: number;
  remaining: number;
  skipped: boolean;
}

/** Wall-clock ceiling, stamped on entry. Same reasoning as the price push. */
const RECONCILE_BUDGET_MS = 20_000;

/**
 * Find every eBay listing whose state disagrees with its product's status and
 * repair it. Safe to run on any schedule: with nothing drifted it is three
 * queries and no marketplace calls.
 */
export async function reconcileEbayStatusDrift(): Promise<EbayReconcileResult> {
  const deadlineAt = Date.now() + RECONCILE_BUDGET_MS;
  const service = createServiceClient();
  const empty: EbayReconcileResult = { scanned: 0, drifted: 0, repaired: 0, reconciled: 0, failed: 0, remaining: 0, skipped: true };

  try {
    const connectionRow = await getConnection(service);
    if (!connectionRow || connectionRow.status !== 'connected') {
      await insertSyncLog(service, {
        action: 'reconcile_status',
        outcome: 'warning',
        message: 'Status reconcile skipped because eBay is not connected.',
      });
      return empty;
    }

    // Only states a drift can exist in. 'pending'/'review'/'error' are mid-flow
    // and are not this sweep's business.
    const { data: listingRows, error } = await service
      .from('ebay_listings')
      .select('*')
      .in('sync_state', ['published', 'out_of_date', 'hidden_oos', 'ended']);
    if (error) throw new Error(error.message);
    const listings = (listingRows ?? []) as EbayListingRow[];
    if (!listings.length) return { scanned: 0, drifted: 0, repaired: 0, reconciled: 0, failed: 0, remaining: 0, skipped: false };

    const { data: productRows } = await service
      .from('products')
      .select('id, status, quantity')
      .in('id', listings.map((listing) => listing.product_id));
    const products = new Map(
      ((productRows ?? []) as Array<{ id: string; status: string | null; quantity: number | null }>)
        .map((product) => [product.id, product]),
    );

    // Manual-hold rule: only a hidden listing on an available, in-stock product
    // can be a restore candidate, so only those need their newest hide log read.
    const restoreCandidates = listings
      .filter((listing) => {
        const product = products.get(listing.product_id);
        return listing.sync_state === 'hidden_oos'
          && normalizeProductStatus(product?.status) === 'available'
          && normalizeProductQuantity(product?.quantity) > 0;
      })
      .map((listing) => listing.product_id);
    const latestHides = await getLatestHideMessages(service, restoreCandidates);
    const driftOf = (listing: EbayListingRow) =>
      detectEbayStatusDrift(listing, products.get(listing.product_id) ?? null, isEbayManualHold(latestHides.get(listing.product_id)));

    const drifted = listings.filter((listing) => driftOf(listing) !== null);

    // One outcome per attempted listing. A repair is counted from the state
    // that FOLLOWED the attempt, never from the attempt itself — see
    // marketplace-drift-repair.ts for why (inventory #75 was "repaired" 197
    // times while eBay refused every write with HTTP 400).
    const outcomes: DriftRepairOutcome[] = [];
    for (const listing of drifted) {
      // Checked per product, not per batch: one repair is one marketplace call,
      // so the overshoot is a single item.
      if (outcomes.length > 0 && Date.now() > deadlineAt) break;
      outcomes.push(
        await repairEbayStatusDrift(
          service,
          connectionRow,
          listing.product_id,
          driftOf(listing),
        ),
      );
    }

    const counts = countDriftRepairs(outcomes);
    const result: EbayReconcileResult = {
      scanned: listings.length,
      drifted: drifted.length,
      repaired: counts.repaired,
      reconciled: counts.reconciled,
      failed: counts.failed,
      remaining: drifted.length - outcomes.length,
      skipped: false,
    };
    // Logged even on a clean run: "the sweep ran and found nothing" is the
    // evidence that the safety net is alive. A silent no-op is indistinguishable
    // from a cron that stopped firing.
    await insertSyncLog(service, {
      action: 'reconcile_status',
      outcome: driftRepairOutcomeLevel(result),
      message: formatDriftRepairSummary('eBay', result),
      detail: { ...result },
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'eBay status reconcile failed.';
    await insertSyncLog(service, { action: 'reconcile_status', outcome: 'error', message });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Phase 2 — auto hide/withdraw on product-status change (Q7). Fire-and-forget
// and never throws, exactly like Etsy's handleProductStatusChange — a
// marketplace hiccup must never block the caller's cache revalidation. Only
// acts on products that already have a live/hidden eBay listing.
// ---------------------------------------------------------------------------
export async function handleProductStatusChange(productIds: string[]): Promise<void> {
  try {
    const service = createServiceClient();
    const connectionRow = await getConnection(service);
    if (!connectionRow || connectionRow.status !== 'connected') return;

    for (const productId of productIds) {
      try {
        await applyEbayProductStatus(service, connectionRow, productId);
      } catch (err) {
        await logEbayStatusRefusal(productId, err);
      }
    }
  } catch {
    // Never throw — fire-and-forget contract.
  }
}

/**
 * Apply the product's CURRENT status to its eBay listing (withdraw, quantity
 * zero, or restore — the owner's sold_handling choice decides which). Re-reads
 * both rows so a stale caller cannot act on old state. THROWS on an eBay
 * refusal; the caller decides what a refusal means (the hook logs it, the
 * sweep falls back to a read-only status check).
 */
async function applyEbayProductStatus(
  service: SupabaseClient,
  connectionRow: EbayConnectionRow,
  productId: string,
): Promise<'repaired' | 'noop'> {
  const listing = await getListing(service, productId);
  if (!listing?.ebay_listing_id) return 'noop';

  const { data: productRow } = await service.from('products').select('status, quantity').eq('id', productId).maybeSingle();
  if (!productRow) return 'noop';
  const status = normalizeProductStatus(productRow.status);
  const quantity = normalizeProductQuantity(productRow.quantity);
  const isSoldOut = status === 'sold' || quantity <= 0;

  if (status === 'archived' || status === 'draft') {
    if (listing.sync_state === 'ended') return 'noop';
    await withdrawListing(service, listing, productId);
    return 'repaired';
  }
  if (isSoldOut) {
    if (listing.sync_state !== 'published' && listing.sync_state !== 'out_of_date') return 'noop';
    if (connectionRow.sold_handling === 'withdraw') {
      await withdrawListing(service, listing, productId);
    } else {
      await hideListingQuantityZero(service, listing, productId, 'auto');
    }
    return 'repaired';
  }
  if (status === 'available' && quantity > 0 && listing.sync_state === 'hidden_oos') {
    // Manual hold (2026-09-24): only automation's own hide is undone here.
    if (await loadEbayManualHold(service, productId)) return 'noop';
    await restoreListingQuantity(service, listing, productId, productRow.quantity);
    return 'repaired';
  }
  return 'noop';
}

async function logEbayStatusRefusal(productId: string, err: unknown): Promise<void> {
  try {
    const service = createServiceClient();
    const listing = await getListing(service, productId);
    await insertSyncLog(service, {
      product_id: productId,
      listing_id: listing?.ebay_listing_id ?? null,
      action: 'status_change_hook',
      outcome: 'error',
      message: err instanceof EbayApiError
        ? `eBay refused the status change (HTTP ${err.status}): ${err.operatorMessage}`
        : err instanceof Error ? err.message : 'Unknown error.',
      detail: err instanceof EbayApiError ? { status: err.status, code: err.code, response: err.detail ?? null } : null,
    });
  } catch {
    // Logging must never throw out of a fire-and-forget hook.
  }
}

/**
 * One drifted listing, for the sweep. eBay refuses a quantity or withdraw
 * write on a listing it has already ended (a `Completed` item — inventory #75,
 * 2026-09-07 — answered every write with HTTP 400 for 17 days), so a refused
 * write is followed by the read-only status check, which maps eBay's real
 * state into the local row (`reconcileEbayStateFromOffer` + the relist chain).
 * The outcome is judged from the re-read state afterwards, never from the
 * write's own return.
 */
async function repairEbayStatusDrift(
  service: SupabaseClient,
  connectionRow: EbayConnectionRow,
  productId: string,
  driftBefore: EbayStatusDrift,
): Promise<DriftRepairOutcome> {
  if (driftBefore === null) return 'noop';
  let directError = false;
  try {
    await applyEbayProductStatus(service, connectionRow, productId);
  } catch (err) {
    directError = true;
    await logEbayStatusRefusal(productId, err);
    // checkListingStatus never throws — a failed check returns error: true and
    // leaves the row alone, which the re-read below then reports as 'failed'.
    await checkListingStatus(productId);
  }

  const listingAfter = await getListing(service, productId);
  const { data: productAfter } = await service.from('products').select('status, quantity').eq('id', productId).maybeSingle();
  const driftAfter = listingAfter
    ? detectEbayStatusDrift(listingAfter, productAfter ?? null, await loadEbayManualHold(service, productId))
    : null;
  const outcome = classifyDriftRepair({ driftBefore, directError, driftAfter });

  if (outcome === 'reconciled') {
    await insertSyncLog(service, {
      product_id: productId,
      listing_id: listingAfter?.ebay_listing_id ?? null,
      action: 'reconcile_status',
      outcome: 'warning',
      message: `eBay refused the status change but already shows this listing closed on its side — local state reconciled to ${listingAfter?.sync_state ?? 'unknown'}.`,
    });
  } else if (outcome === 'failed') {
    await insertSyncLog(service, {
      product_id: productId,
      listing_id: listingAfter?.ebay_listing_id ?? null,
      action: 'reconcile_status',
      outcome: 'error',
      message: `Still out of sync after the status change and a status check (product ${productAfter?.status ?? 'unknown'}, listing ${listingAfter?.sync_state ?? 'unknown'}) — needs a look in Admin.`,
    });
  }
  return outcome;
}
