import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/service';
import { fetchSpotData } from '@/lib/spot-price';
import { getMarketplaceShippingTier } from '@/lib/checkout-shipping';
import { getMarketplaceShippingProfileMap, resolveTierExternalId } from '@/lib/marketplace-shipping';
import { MAX_PRICE_PUSH_ATTEMPTS } from '@/lib/marketplace-price-chip';
import {
  classifyDriftRepair,
  countDriftRepairs,
  driftRepairOutcomeLevel,
  formatDriftRepairSummary,
  type DriftRepairOutcome,
} from '@/lib/marketplace-drift-repair';
import type { Product, SpotData } from '@/types/product';
import { normalizeProductJewelryType, normalizeProductQuantity, normalizeProductStatus } from '@/types/product';
import { ensureFreshAccessToken } from './auth';
import { etsyFetch, updateListingProperty, EtsyApiError, type EtsyResponse } from './client';
import { attemptLengthSync, parseWearableLengthInches } from './length-experiment';
import { attemptRingSizeSync, parseRingSize } from './ring-size-experiment';
import {
  buildMappedPayload,
  buildPreflightChecks,
  computeEtsyPrice,
  computeContentHash,
  isPreflightPassing,
  mapProperties,
  type MappedEtsyPayload,
} from './mapping';
import {
  IMAGE_STEP_BUDGET,
  deleteEtsyListingImage,
  fetchEtsyListingImages,
  partitionRowsByLiveImages,
  planImageDiff,
  reconcileMissingImageRows,
  uploadListingImage,
} from './images';
import {
  claimNextRepairableListing,
  claimNextPendingListing,
  claimNextDraftReviewListing,
  countDraftReviewListings,
  countPendingListings,
  countRepairableListings,
  deleteListingImageRow,
  deleteListingImagesByListingId,
  getConnection,
  getLatestDelistMessages,
  getListing,
  getListingImages,
  insertListingImage,
  bulkPatchListings,
  insertSyncLog,
  insertSyncLogs,
  type EtsySyncLogInput,
  pruneOldSyncLogs,
  upsertListing,
  ETSY_REPAIRABLE_SYNC_STATES,
  ETSY_RESUMABLE_SYNC_STATES,
  type EtsyConnectionRow,
  type EtsyListingRow,
  type EtsySyncState,
} from './store';

// Sync engine: the step machine described in etsy-sync-plan/03-sync-lifecycle.md.
// Every route (preview/sync/sync-batch/delist, plus the scheduled price push)
// calls into this module; routes stay thin (auth gate + parse + call here).

export interface SyncProgress {
  step: 'draft' | 'images' | 'inventory' | 'activate';
  uploaded?: number;
  total?: number;
}

export interface SyncStepResult {
  done: boolean;
  syncState: EtsyListingRow['sync_state'];
  progress?: SyncProgress;
  listingId?: number;
  listingUrl?: string;
  warnings?: string[];
  error?: { code: string; message: string };
}

/** Consecutive zero-progress image batches before giving up — see the image step's circuit breaker below (session 9 incident). */
const IMAGE_STALL_LIMIT = 5;

export type SyncMode = 'publish' | 'update' | 'price-only';

async function fetchProduct(service: SupabaseClient, productId: string): Promise<Product | null> {
  const { data, error } = await service.from('products').select('*').eq('id', productId).maybeSingle();
  if (error || !data) return null;
  return data as Product;
}

// Site shipping tiers -> provisioned Etsy shipping profiles. Best-effort: an
// unreadable map must never block a sync — an empty map simply keeps the
// connection's single default shipping profile.
async function loadTierProfileMap(service: SupabaseClient): Promise<Record<string, string>> {
  try {
    return await getMarketplaceShippingProfileMap(service, 'etsy');
  } catch {
    return {};
  }
}

/** Provisioned Etsy shipping-profile id for a listing price, or null. */
function tierShippingProfileIdFor(map: Record<string, string>, price: number | null | undefined): number | null {
  const resolved = resolveTierExternalId(map, price);
  if (!resolved) return null;
  const id = Number(resolved.externalId);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function listingUrlFor(listingId: number): string {
  return `https://www.etsy.com/listing/${listingId}`;
}

// The former SKU-adoption crash-recovery guard (adopt an existing Etsy draft
// on retry by matching our own SKU, if a prior run died between the create
// call succeeding and etsy_listing_id being saved) was removed 2026-07-08
// (session 9, fifth addendum) alongside no longer pushing SKU to Etsy at
// all — see DECISIONS.md for the reasoning and the accepted trade-off.
async function createDraftListing(params: {
  shopId: number;
  accessToken: string;
  connection: EtsyConnectionRow;
  payload: MappedEtsyPayload;
  /** Provisioned tier profile for this price band; falls back to the
   *  connection's single default profile when tiers aren't provisioned. */
  tierShippingProfileId?: number | null;
}): Promise<number> {
  const shopSectionId = params.payload.taxonomyPath ? params.connection.section_map?.[params.payload.taxonomyPath] : undefined;

  const res = await etsyFetch<{ listing_id: number }>({
    method: 'POST',
    path: `/v3/application/shops/${params.shopId}/listings`,
    accessToken: params.accessToken,
    json: {
      quantity: params.payload.quantity,
      title: params.payload.title,
      description: params.payload.description,
      price: params.payload.price,
      who_made: params.payload.whoMade,
      is_supply: params.payload.isSupply,
      when_made: params.payload.whenMade,
      taxonomy_id: params.payload.taxonomyId,
      tags: params.payload.tags,
      materials: params.payload.materials,
      shipping_profile_id: params.tierShippingProfileId ?? params.connection.shipping_profile_id,
      return_policy_id: params.connection.return_policy_id,
      readiness_state_id: params.connection.readiness_state_id ?? undefined,
      shop_section_id: shopSectionId,
      item_weight: params.payload.itemWeight ?? undefined,
      item_weight_unit: params.payload.itemWeightUnit ?? undefined,
    },
  });
  return res.data.listing_id;
}

async function updateListingInventory(params: {
  listingId: number;
  accessToken: string;
  price: number;
  quantity: number;
  readinessStateId: number | null;
}): Promise<void> {
  // Confirmed live 2026-07-08: Etsy rejected the first real sync with "All
  // offerings need readiness state" — the requestBody schema for this
  // operation requires `readiness_state_id` on EVERY offering (not just at
  // listing-create time), and `legacy=true` is needed to enable
  // processing-profile fields on this endpoint at all (per the operation's
  // own `legacy` query param description).
  await etsyFetch({
    method: 'PUT',
    path: `/v3/application/listings/${params.listingId}/inventory`,
    query: { legacy: true },
    accessToken: params.accessToken,
    json: {
      products: [
        {
          // Deliberately no `sku` here — see the comment above createDraftListing.
          property_values: [],
          offerings: [{
            price: params.price,
            quantity: params.quantity,
            is_enabled: true,
            readiness_state_id: params.readinessStateId,
          }],
        },
      ],
    },
  });
}

export function isWritableEtsyListingState(state: string): boolean {
  return state === 'active' || state === 'draft';
}

/**
 * Best-effort structured category properties (Material, Gold purity,
 * Bracelet length, etc — see mapping.ts's mapProperties). Deliberately
 * per-property try/catch: one bad property (e.g. the not-independently-
 * verified scale-only Length wire format, see OWNER-SETUP.md) must never
 * fail the sync or block price/qty/images, which is why this returns
 * warnings instead of throwing.
 */
async function pushListingProperties(params: {
  shopId: number;
  listingId: number;
  accessToken: string;
  product: Product;
  service: SupabaseClient;
  listing: EtsyListingRow;
}): Promise<string[]> {
  const warnings: string[] = [];
  for (const update of mapProperties(params.product)) {
    try {
      await updateListingProperty({
        shopId: params.shopId,
        listingId: params.listingId,
        accessToken: params.accessToken,
        propertyId: update.propertyId,
        valueIds: update.valueIds,
        values: update.values,
        scaleId: update.scaleId,
      });
    } catch (err) {
      const message = err instanceof EtsyApiError ? err.operatorMessage : err instanceof Error ? err.message : 'failed';
      warnings.push(`Category property ${update.propertyId} skipped — ${message}`);
    }
  }

  // ON by default as of 2026-07-08 (session 9) — the owner confirmed Length
  // works live across multiple categories and asked for it to auto-push, so
  // this no longer needs the ETSY_SYNC_BRACELET_LENGTH=true env flag flipped
  // in Netlify; set ETSY_SYNC_BRACELET_LENGTH=false to disable it instead.
  // Deliberately separate from the property loop above (see DECISIONS.md
  // session 5's "Gray" incident and length-experiment.ts): every write goes
  // through the discover→write→read-back→verify cycle, so a bad value fails
  // closed into a warning, never silently corrupts the listing. Excludes Ring
  // (no length concept for a buyer — Ring size instead, see below) and any
  // category with no source `length` value.
  const productType = normalizeProductJewelryType(params.product.product_type ?? params.product.jewelry_type);
  const hasWearableLength = productType != null && LENGTH_BEARING_PRODUCT_TYPES.has(productType);
  if (process.env.ETSY_SYNC_BRACELET_LENGTH !== 'false' && hasWearableLength) {
    const inches = parseWearableLengthInches(params.product.length);
    if (inches != null) {
      try {
        const result = await attemptLengthSync({ service: params.service, listing: params.listing, inches });
        if (!result.success) warnings.push(`Length: ${result.message}`);
      } catch (err) {
        const message = err instanceof EtsyApiError ? err.operatorMessage : err instanceof Error ? err.message : 'failed';
        warnings.push(`Length skipped — ${message}`);
      }
    }
  }

  // Ring size — a completely different, enumerated property (real
  // possible_values per region, e.g. "7 1/2" under a US/CA scale), never a
  // continuous measurement. ON by default as of 2026-07-08 (session 9,
  // eighth addendum) — same as Length now; the owner confirmed it works live
  // and asked for it to auto-push. Set ETSY_SYNC_RING_SIZE=false to disable.
  // A separate flag from Length so either can be turned off independently.
  // Same write→read-back→verify safety, and buildRingSizePayload only ever
  // uses a real matched chart value (never a guess), so a bad size fails
  // closed into a warning.
  if (process.env.ETSY_SYNC_RING_SIZE !== 'false' && productType === 'Ring') {
    const size = parseRingSize(params.product.length);
    if (size != null) {
      try {
        const result = await attemptRingSizeSync({ service: params.service, listing: params.listing, size });
        if (!result.success) warnings.push(`Ring size: ${result.message}`);
      } catch (err) {
        const message = err instanceof EtsyApiError ? err.operatorMessage : err instanceof Error ? err.message : 'failed';
        warnings.push(`Ring size skipped — ${message}`);
      }
    }
  }

  return warnings;
}

/** Categories confirmed (session 3 research) to have a buyer-facing length attribute on their taxonomy node — Ring is deliberately absent (Ring size instead, an unrelated enumerated property). */
const LENGTH_BEARING_PRODUCT_TYPES = new Set([
  'Necklace',
  'Bracelet',
  'Pendant',
  'Charm',
  'Earrings',
  'Brooch',
  'Cufflinks',
  'Watch',
  'Coin',
  'Bullion',
  'Silverware',
]);

async function setListingState(params: { shopId: number; listingId: number; accessToken: string; state: 'active' | 'inactive' }): Promise<void> {
  await etsyFetch({
    method: 'PATCH',
    path: `/v3/application/shops/${params.shopId}/listings/${params.listingId}`,
    accessToken: params.accessToken,
    json: { state: params.state },
  });
}

async function setListingCopy(params: { shopId: number; listingId: number; accessToken: string; payload: MappedEtsyPayload }): Promise<void> {
  // Confirmed live 2026-07-08: Etsy rejected an update-mode PATCH with
  // "Cannot update 'when_made' without 'who_made' and without 'is_supply'
  // and vice versa" — this endpoint treats the three as a linked group, so
  // when_made can never be sent alone (createDraftListing already sends all
  // three together; this call previously sent when_made by itself).
  await etsyFetch({
    method: 'PATCH',
    path: `/v3/application/shops/${params.shopId}/listings/${params.listingId}`,
    accessToken: params.accessToken,
    json: {
      title: params.payload.title,
      description: params.payload.description,
      tags: params.payload.tags,
      materials: params.payload.materials,
      taxonomy_id: params.payload.taxonomyId,
      who_made: params.payload.whoMade,
      is_supply: params.payload.isSupply,
      when_made: params.payload.whenMade,
    },
  });
}

/**
 * PURE: the sync_state a listing should land at after an 'update' pass that
 * started from 'out_of_date'/'pending' (i.e. a re-enqueued EXISTING listing,
 * not a fresh draft). An update only pushes content via setListingCopy — it
 * never calls setListingState — so it can't change whether the listing is
 * actually live on Etsy. Deciding the resulting LOCAL sync_state from the
 * connection's auto_activate policy (as if this were a brand-new listing)
 * was wrong: it silently demoted every already-active listing to
 * 'draft_review' on every re-sync once out-of-date detection started working
 * (confirmed live 2026-07-10 — 63 genuinely-active listings relabeled
 * "needs review" after one bulk price sync, even though their real Etsy
 * listing_state never left 'active'). Use the listing's real last-known
 * listing_state instead: if it was actually active, it stays active; only a
 * listing that was genuinely still a draft goes through the auto-activate
 * decision, matching the ORIGINAL first-publish semantics this branch was
 * meant to preserve.
 */
export function resolveUpdatedListingSyncState(
  listingState: EtsyListingRow['listing_state'],
  autoActivate: boolean,
): EtsySyncState {
  if (listingState === 'active') return 'active';
  return autoActivate ? 'active' : 'draft_review';
}

/** Persist the price baseline whenever the inventory write itself succeeded. */
export function resolveInventoryCheckpointPatch(
  syncState: EtsySyncState,
  mode: SyncMode,
  pushedPrice: EtsyListingRow['last_pushed_price'],
): { sync_state?: EtsySyncState; last_pushed_price?: EtsyListingRow['last_pushed_price'] } {
  if (syncState === 'images_synced') {
    return { sync_state: 'inventory_synced', last_pushed_price: pushedPrice };
  }
  if (mode === 'update') return { last_pushed_price: pushedPrice };
  return {};
}

export function isReadyToPublishEtsyListing(
  listing: Pick<EtsyListingRow, 'sync_state' | 'listing_state' | 'etsy_listing_id'>,
): boolean {
  return listing.sync_state === 'draft_review'
    && listing.listing_state === 'draft'
    && listing.etsy_listing_id != null;
}

/** Runs one bounded step-machine invocation for a single product. Idempotent — safe to call again. */
export async function runSyncStep(productId: string, mode: SyncMode = 'publish'): Promise<SyncStepResult> {
  const service = createServiceClient();
  const product = await fetchProduct(service, productId);
  if (!product) return { done: true, syncState: 'error', error: { code: 'not_found', message: 'Product not found.' } };

  const connection = await getConnection(service);
  const spotData = await fetchSpotData();
  let listing = await getListing(service, productId);
  const taxonomyOverride = listing?.taxonomy_override_id
    ? { id: listing.taxonomy_override_id, path: listing.taxonomy_override_path ?? '' }
    : null;
  const preflight = buildPreflightChecks(product, connection, spotData, taxonomyOverride);
  if (!isPreflightPassing(preflight)) {
    const message = preflight
      .filter((check) => !check.ok)
      .map((check) => check.message)
      .filter(Boolean)
      .join(' ') || 'This item is not eligible for Etsy sync yet.';
    await upsertListing(service, productId, { sync_state: 'error', last_error: message });
    await insertSyncLog(service, { product_id: productId, action: 'preflight', outcome: 'error', message });
    return { done: true, syncState: 'error', error: { code: 'preflight_failed', message } };
  }
  if (!connection) return { done: true, syncState: 'error', error: { code: 'not_connected', message: 'Etsy is not connected.' } };

  const { accessToken, shopId } = await ensureFreshAccessToken(service);
  const payload = buildMappedPayload(product, connection, spotData, taxonomyOverride, listing?.extra_tags ?? null);
  const warnings: string[] = [];
  // Value-based shipping tier for this listing's price (2026-07-30). Null
  // until the owner provisions tier profiles — then the connection default
  // continues to apply, exactly as before.
  const tierProfileId = tierShippingProfileIdFor(await loadTierProfileMap(service), payload.price);

  // A bulk enqueue resets items to 'pending'. For an item that ALREADY exists
  // on Etsy (has a listing_id), a fresh-publish pass does NOTHING — every
  // publish step gates on a later state (create needs no listing_id, images
  // need draft_created/error, inventory needs images_synced) — so it would sit
  // in 'pending' forever and the bulk drain (which claims 'pending' and bumps
  // updated_at) would re-claim the same items every pass without end
  // (confirmed live 2026-07-08: "Processed 79 of 55 · 55 remaining", climbing).
  // Treat such an item as an UPDATE: push the current mapping (image DIFF —
  // not a re-upload — plus inventory/properties/copy) and move it to a
  // terminal state so it leaves the queue.
  const effectiveMode: SyncMode =
    mode === 'publish'
      && listing?.etsy_listing_id != null
      && ['pending', 'out_of_date'].includes(listing.sync_state)
      ? 'update'
      : mode;

  try {
    if (listing?.etsy_listing_id && (effectiveMode === 'update' || effectiveMode === 'price-only')) {
      const listingId = listing.etsy_listing_id;
      let remote: EtsyResponse<{ state: string; shipping_profile_id?: number | null }>;
      try {
        remote = await etsyFetch<{ state: string; shipping_profile_id?: number | null }>({
          path: `/v3/application/listings/${listingId}`,
          accessToken,
        });
      } catch (err) {
        // Deleted on etsy.com (2026-09-13, inv #33): every retry used to 404
        // here and leave the item stuck in 'error' holding a dead listing id.
        // Reset it to not-listed exactly like "Check Etsy Status" does and say
        // so. Never re-create the listing from here — this path also serves
        // price pushes, which must not bring back a listing the owner deleted.
        if (err instanceof EtsyApiError && err.status === 404) {
          await resetDeletedEtsyListing(
            service,
            productId,
            listingId,
            'Listing no longer exists on Etsy (deleted there) — reset to not-listed during a sync.',
          );
          return {
            done: true,
            syncState: 'pending',
            error: {
              code: 'listing_deleted',
              message: 'This listing no longer exists on Etsy (it was deleted there), so it was reset to not listed. Use "Sync to Etsy" to create it again.',
            },
          };
        }
        throw err;
      }
      const remoteState = remote.data.state;
      const preserveQueuedState = listing.sync_state === 'pending' && isWritableEtsyListingState(remoteState);
      const patch = reconcileQueuedUpdateState(listing.sync_state, remoteState);
      await applyEtsyReconciliation(service, listing, remoteState, { preserveSyncState: preserveQueuedState });
      listing = { ...listing, ...patch };
      if (!isWritableEtsyListingState(remoteState)) {
        const message = `This listing is ${remoteState} on Etsy. Reactivate it before syncing updates.`;
        return {
          done: true,
          syncState: listing.sync_state,
          listingId,
          listingUrl: listingUrlFor(listingId),
          error: { code: 'remote_listing_inactive', message },
        };
      }

      // Tier shipping-profile reconciliation (2026-07-30): the profile follows
      // the price band, so it rides the price path like price itself — this
      // reuses the listing GET above and PATCHes only on a real change.
      if (tierProfileId && remote.data.shipping_profile_id !== tierProfileId) {
        await etsyFetch({
          method: 'PATCH',
          path: `/v3/application/shops/${shopId}/listings/${listingId}`,
          accessToken,
          json: { shipping_profile_id: tierProfileId },
        });
        await insertSyncLog(service, {
          product_id: productId,
          listing_id: listingId,
          action: 'shipping_tier',
          outcome: 'ok',
          detail: { shipping_profile_id: tierProfileId, previous: remote.data.shipping_profile_id ?? null },
        });
      }
    }

    // Step 1 — draft.
    if (!listing || !listing.etsy_listing_id) {
      const listingId = await createDraftListing({ shopId, accessToken, connection, payload, tierShippingProfileId: tierProfileId });
      listing = await upsertListing(service, productId, {
        etsy_listing_id: listingId,
        sync_state: 'draft_created',
        listing_state: 'draft',
        taxonomy_id: payload.taxonomyId,
      });
      await insertSyncLog(service, { product_id: productId, listing_id: listingId, action: 'create_draft', outcome: 'ok' });
    }
    const listingId = listing.etsy_listing_id as number;

    // Step 2 — images, bounded per invocation so a large product spans
    // multiple calls without ever duplicating an already-uploaded image.
    // 'error' is included here (not excluded) so a retry after ANY failure —
    // including one that happened at a later step, like inventory — re-enters
    // the pipeline instead of getting stuck: the diff/upload logic is already
    // idempotent (planImageDiff no-ops when nothing changed), so re-running
    // it on a retry is always safe, just sometimes redundant.
    if (['draft_created', 'error'].includes(listing.sync_state) || effectiveMode === 'update') {
      const storedImages = await getListingImages(service, listingId);
      // Trust but verify (2026-09-13): a checkpoint row whose image is no
      // longer on the Etsy listing is dropped so that photo uploads again.
      // Self-heals the adoption bug (inv #33, #82 — rows said "uploaded" for
      // photos Etsy never had) and photos deleted directly on etsy.com.
      const liveImages = await fetchEtsyListingImages({ listingId, accessToken });
      const { present: existingImages, missing } = partitionRowsByLiveImages(storedImages, liveImages);
      if (missing.length > 0) {
        for (const row of missing) await deleteListingImageRow(service, row.id);
        await insertSyncLog(service, {
          product_id: productId,
          listing_id: listingId,
          action: 'image_repair',
          outcome: 'warning',
          message: `${missing.length} photo${missing.length === 1 ? '' : 's'} recorded as uploaded ${missing.length === 1 ? 'was' : 'were'} not on the Etsy listing — uploading again.`,
          detail: { ranks: missing.map((row) => row.rank), etsyListingImageIds: missing.map((row) => row.etsy_listing_image_id) },
        });
      }
      let ops = planImageDiff(
        payload.images.map((image) => image.sourceUrl),
        existingImages,
      );
      ops = await reconcileMissingImageRows({
        service,
        productId,
        listingId,
        accessToken,
        ops,
        liveImages,
        trackedImageIds: new Set(existingImages.map((row) => row.etsy_listing_image_id)),
      });

      const batch = ops.slice(0, IMAGE_STEP_BUDGET);
      let succeeded = 0;
      for (const op of batch) {
        if (op.type === 'upload') {
          try {
            const result = await uploadListingImage({ shopId, listingId, accessToken, sourceUrl: op.sourceUrl, rank: op.rank });
            await insertListingImage(service, {
              product_id: productId,
              etsy_listing_id: listingId,
              source_url: op.sourceUrl,
              source_key: op.sourceKey,
              bytes_sha256: result.bytesSha256,
              etsy_listing_image_id: result.etsyListingImageId,
              rank: op.rank,
            });
            succeeded += 1;
            if (result.warning) warnings.push(result.warning);
          } catch (err) {
            warnings.push(`Image skipped (source unreadable) — ${err instanceof Error ? err.message : 'upload failed'}`);
          }
        } else if (op.type === 'delete') {
          try {
            await deleteEtsyListingImage({ shopId, listingId, listingImageId: op.row.etsy_listing_image_id, accessToken });
          } catch {
            // Already gone on Etsy is fine — still drop our checkpoint row below.
          }
          await deleteListingImageRow(service, op.row.id);
          succeeded += 1;
        } else {
          try {
            const result = await uploadListingImage({ shopId, listingId, accessToken, sourceUrl: op.sourceUrl, rank: op.newRank });
            await deleteEtsyListingImage({ shopId, listingId, listingImageId: op.row.etsy_listing_image_id, accessToken }).catch(() => {});
            await deleteListingImageRow(service, op.row.id);
            await insertListingImage(service, {
              product_id: productId,
              etsy_listing_id: listingId,
              source_url: op.sourceUrl,
              source_key: op.sourceKey,
              bytes_sha256: result.bytesSha256,
              etsy_listing_image_id: result.etsyListingImageId,
              rank: op.newRank,
            });
            succeeded += 1;
          } catch (err) {
            warnings.push(`Re-rank skipped — ${err instanceof Error ? err.message : 'failed'}`);
          }
        }
      }

      if (ops.length > batch.length) {
        // More ops remain — but a batch that makes ZERO real progress must
        // never be retried forever. Confirmed live 2026-07-08 (session 9):
        // a persistently-failing image caused 100+ identical retries in a
        // tight client-side poll loop, hammering Etsy's API, with the real
        // per-image failure reason silently dropped by the client the whole
        // time (warnings were only ever surfaced once `done` became true —
        // fixed in EtsyProductPanel.tsx too). Reuses the same error_count
        // column the top-level catch-all below already uses for the same
        // "give up after repeated failure" concept.
        if (succeeded === 0) {
          const newErrorCount = (listing.error_count ?? 0) + 1;
          if (newErrorCount >= IMAGE_STALL_LIMIT) {
            const message = `Image upload stalled after ${newErrorCount} attempts with no progress. ${warnings[warnings.length - 1] ?? ''}`.trim();
            listing = await upsertListing(service, productId, { sync_state: 'error', last_error: message, error_count: newErrorCount });
            await insertSyncLog(service, { product_id: productId, listing_id: listingId, action: 'sync_step', outcome: 'error', message });
            return { done: true, syncState: 'error', listingId, error: { code: 'image_stall', message } };
          }
          listing = await upsertListing(service, productId, { error_count: newErrorCount });
        } else if (listing.error_count) {
          listing = await upsertListing(service, productId, { error_count: 0 });
        }
        return {
          done: false,
          syncState: listing.sync_state,
          progress: { step: 'images', uploaded: succeeded, total: ops.length },
          listingId,
          warnings: warnings.length ? warnings : undefined,
        };
      }
      if (listing.sync_state === 'draft_created' || listing.sync_state === 'error') {
        listing = await upsertListing(service, productId, { sync_state: 'images_synced' });
      }
    }

    // Step 3 — inventory (price/qty/sku), then best-effort category
    // properties (Material/Gold purity/length-equivalent — see mapping.ts's
    // mapProperties). Properties are skipped for price-only pushes: that
    // mode runs frequently (daily scheduled push) and only price should move.
    if (listing.sync_state === 'images_synced' || effectiveMode === 'update' || effectiveMode === 'price-only') {
      await updateListingInventory({
        listingId,
        accessToken,
        price: payload.price!,
        quantity: payload.quantity,
        readinessStateId: connection.readiness_state_id,
      });
      await insertSyncLog(service, {
        product_id: productId,
        listing_id: listingId,
        action: effectiveMode === 'price-only' ? 'price_push' : 'set_inventory',
        outcome: 'ok',
        detail: effectiveMode === 'price-only' ? { price: payload.price } : undefined,
      });
      if (effectiveMode === 'price-only') {
        listing = await upsertListing(service, productId, { last_pushed_price: payload.price, last_synced_at: new Date().toISOString() });
        return { done: true, syncState: listing.sync_state, listingId, listingUrl: listingUrlFor(listingId) };
      }

      warnings.push(...(await pushListingProperties({ shopId, listingId, accessToken, product, service, listing })));

      const checkpointPatch = resolveInventoryCheckpointPatch(listing.sync_state, effectiveMode, payload.price);
      if (Object.keys(checkpointPatch).length > 0) listing = await upsertListing(service, productId, checkpointPatch);
    }

    // Step 4 — activate, or hold for owner review (Q1 default).
    if (listing.sync_state === 'inventory_synced') {
      if (connection.auto_activate) {
        await setListingState({ shopId, listingId, accessToken, state: 'active' });
        listing = await upsertListing(service, productId, {
          sync_state: 'active',
          listing_state: 'active',
          content_hash: computeContentHash(payload),
          last_synced_at: new Date().toISOString(),
          last_error: null,
          error_count: 0,
        });
        await insertSyncLog(service, { product_id: productId, listing_id: listingId, action: 'activate', outcome: 'ok' });
      } else {
        listing = await upsertListing(service, productId, {
          sync_state: 'draft_review',
          content_hash: computeContentHash(payload),
          last_synced_at: new Date().toISOString(),
          last_error: null,
          error_count: 0,
        });
        await insertSyncLog(service, { product_id: productId, listing_id: listingId, action: 'update', outcome: 'ok', message: 'Left in draft for owner review (Q1 default).' });
      }
    } else if (effectiveMode === 'update' && ['active', 'draft_review', 'out_of_date', 'pending'].includes(listing.sync_state)) {
      await setListingCopy({ shopId, listingId, accessToken, payload });
      // 'pending' here means a re-enqueued existing listing (see effectiveMode
      // above) — resolve it to a terminal state so it leaves the drain queue.
      const nextState =
        listing.sync_state === 'out_of_date' || listing.sync_state === 'pending'
          ? resolveUpdatedListingSyncState(listing.listing_state, connection.auto_activate)
          : listing.sync_state;
      listing = await upsertListing(service, productId, {
        content_hash: computeContentHash(payload),
        last_synced_at: new Date().toISOString(),
        sync_state: nextState,
        last_error: null,
        error_count: 0,
      });
      await insertSyncLog(service, { product_id: productId, listing_id: listingId, action: 'update', outcome: 'ok' });
    }

    return {
      done: true,
      syncState: listing.sync_state,
      listingId,
      listingUrl: listingUrlFor(listingId),
      warnings: warnings.length ? warnings : undefined,
    };
  } catch (err) {
    const message = err instanceof EtsyApiError ? err.operatorMessage : err instanceof Error ? err.message : 'Sync failed.';
    const code = err instanceof EtsyApiError ? err.code : 'sync_failed';
    if (err instanceof EtsyApiError && err.code === 'auth_expired') {
      // Auth failures are the CONNECTION's problem, not this product's — leave
      // sync_state alone so the product doesn't show a false "error" chip
      // (etsy-sync-plan/11-error-handling.md).
      return { done: true, syncState: listing?.sync_state ?? 'pending', error: { code, message } };
    }
    await upsertListing(service, productId, {
      sync_state: 'error',
      last_error: message,
      error_count: (listing?.error_count ?? 0) + 1,
    });
    await insertSyncLog(service, {
      product_id: productId,
      listing_id: listing?.etsy_listing_id ?? null,
      action: 'sync_step',
      outcome: 'error',
      message,
      detail: err instanceof EtsyApiError ? { code: err.code, status: err.status, detail: err.detail } : null,
    });
    return { done: true, syncState: 'error', error: { code, message } };
  }
}

/** The patch that returns a listing deleted on etsy.com to "not listed". Exported for tests. */
export const DELETED_LISTING_RESET_PATCH: Partial<EtsyListingRow> = {
  etsy_listing_id: null,
  sync_state: 'pending',
  listing_state: null,
  taxonomy_id: null,
  content_hash: null,
  last_pushed_price: null,
  last_error: null,
  error_count: 0,
};

/**
 * A listing that 404s on Etsy was deleted there: drop its photo checkpoints and
 * reset the row to not-listed so "Sync to Etsy" creates it fresh. Shared by
 * "Check Etsy Status", the bulk status check and the sync step itself.
 */
async function resetDeletedEtsyListing(
  service: SupabaseClient,
  productId: string,
  etsyListingId: number,
  message: string,
): Promise<EtsyListingRow> {
  await deleteListingImagesByListingId(service, etsyListingId);
  const updated = await upsertListing(service, productId, { ...DELETED_LISTING_RESET_PATCH });
  await insertSyncLog(service, {
    product_id: productId,
    listing_id: etsyListingId,
    action: 'check_status',
    outcome: 'ok',
    message,
  });
  return updated;
}

export interface CheckListingStatusResult {
  /** False when the listing no longer exists on Etsy (never synced, or just found deleted — see message). */
  found: boolean;
  syncState: EtsyListingRow['sync_state'];
  etsyState?: string;
  message: string;
}

/**
 * PURE: given our current sync_state and Etsy's reported listing state, the
 * state patch to apply (empty = leave as-is). Also CLEARS a stale 'error' — a
 * listing that errored on our side (e.g. the missing-API-key incident
 * 2026-07-08) but is actually fine on Etsy reconciles back to its real state.
 * Unknown Etsy states return an empty patch (report only, never guess).
 */
export function reconcileSyncStateFromEtsy(
  current: EtsyListingRow['sync_state'],
  etsyState: string,
): { sync_state?: EtsyListingRow['sync_state']; listing_state?: EtsyListingRow['listing_state'] } {
  switch (etsyState) {
    case 'active':
      // Remote lifecycle confirms that the listing is live, but it does not
      // prove that our mapped content still matches the last pushed hash.
      return {
        sync_state: current === 'out_of_date' ? 'out_of_date' : 'active',
        listing_state: 'active',
      };
    case 'inactive':
    case 'sold_out':
    // 'edit' is a real Etsy listing state, not a guess — confirmed live
    // 2026-07-10 against a genuinely-sold single-quantity listing (Sterling
    // Silver Modernist Marquise-Form Openwork Ring, inv #61): Etsy pulled it
    // back to 'edit' rather than 'sold_out', but it's equally gone from the
    // shop and needs the seller's attention before it could go active again
    // — same terminal handling as inactive/sold_out. Previously fell into
    // the "unknown state, don't guess" default, which is why syncing this
    // item's status never cleared its stale 'active' chip.
    case 'edit':
      return { sync_state: 'delisted', listing_state: 'inactive' };
    case 'expired':
      return { sync_state: 'delisted', listing_state: 'ended' };
    case 'draft':
      // A draft on Etsy. If our state is stale — recorded active/delisted, or a
      // leftover 'error' from a transient failure — reset to the terminal draft
      // state; otherwise keep our finer draft-family state (draft_created/…).
      return ['active', 'delisted', 'error'].includes(current)
        ? { sync_state: 'draft_review', listing_state: 'draft' }
        : { listing_state: 'draft' };
    default:
      return {};
  }
}

/** Keep an explicitly queued update queued while refreshing its remote listing state. */
export function reconcileQueuedUpdateState(current: EtsySyncState, etsyState: string) {
  const patch = reconcileSyncStateFromEtsy(current, etsyState);
  if (current === 'pending' && isWritableEtsyListingState(etsyState)) delete patch.sync_state;
  return patch;
}

/** Applies the reconciliation patch to one row; returns whether it changed. Shared by the per-item and bulk status checks. */
async function applyEtsyReconciliation(
  service: SupabaseClient,
  listing: EtsyListingRow,
  etsyState: string,
  options: { preserveSyncState?: boolean } = {},
): Promise<{ changed: boolean; syncState: EtsyListingRow['sync_state'] }> {
  const patch = reconcileSyncStateFromEtsy(listing.sync_state, etsyState);
  if (options.preserveSyncState) delete patch.sync_state;
  const nextSync = patch.sync_state ?? listing.sync_state;
  const nextListing = patch.listing_state !== undefined ? patch.listing_state : listing.listing_state;
  if (nextSync === listing.sync_state && nextListing === listing.listing_state) {
    return { changed: false, syncState: listing.sync_state };
  }
  const clearError = listing.sync_state === 'error' && nextSync !== 'error';
  const updated = await upsertListing(service, listing.product_id, {
    ...patch,
    last_synced_at: new Date().toISOString(),
    ...(clearError ? { last_error: null, error_count: 0 } : {}),
  });
  await insertSyncLog(service, {
    product_id: listing.product_id,
    listing_id: listing.etsy_listing_id,
    action: 'check_status',
    outcome: 'ok',
    message: `Reconciled with Etsy — listing state: ${etsyState}.`,
  });
  return { changed: true, syncState: updated.sync_state };
}

/**
 * Manual reconciliation for when the Etsy-side listing changed outside this
 * app. Two cases:
 *
 * 1. The listing is gone (404) — most commonly the owner deleting a draft
 *    directly on etsy.com. Etsy hard-deletes draft listings, so the local row
 *    is reset to not-listed (etsy_listing_id cleared, sync_state 'pending') so
 *    "Sync to Etsy" — a fresh publish — reappears instead of "Sync Updates".
 *
 * 2. The listing still exists — GET its real state and write it back into our
 *    row when it changed out of band. The important case (confirmed live
 *    2026-07-08): the owner activates a draft directly on Etsy; without this,
 *    our chip stayed "Draft on Etsy — needs review" forever. Etsy's state axis
 *    is coarser than our sync_state, so for a still-"draft" listing we KEEP
 *    whatever draft-family sync_state we recorded (draft_created/images_synced/
 *    inventory_synced/draft_review) — that encodes our own pipeline progress
 *    and is strictly more informative than a bare "draft".
 */
export async function checkListingStatus(productId: string): Promise<CheckListingStatusResult> {
  const service = createServiceClient();
  const listing = await getListing(service, productId);
  if (!listing?.etsy_listing_id) {
    return { found: false, syncState: listing?.sync_state ?? 'pending', message: 'This product has never been synced to Etsy.' };
  }

  const { accessToken } = await ensureFreshAccessToken(service);
  try {
    const res = await etsyFetch<{ state: string }>({ path: `/v3/application/listings/${listing.etsy_listing_id}`, accessToken });
    const etsyState = res.data.state;
    const { changed, syncState } = await applyEtsyReconciliation(service, listing, etsyState);
    return {
      found: true,
      syncState,
      etsyState,
      message: syncState === 'out_of_date'
        ? `Confirmed ${etsyState} on Etsy; local updates still need to be synced.`
        : changed
        ? `Updated — this listing is now ${etsyState} on Etsy.`
        : `Already in sync — listing state on Etsy: ${etsyState}.`,
    };
  } catch (err) {
    if (err instanceof EtsyApiError && err.status === 404) {
      const updated = await resetDeletedEtsyListing(
        service,
        productId,
        listing.etsy_listing_id,
        'Listing no longer exists on Etsy (likely deleted there) — reset to not-listed.',
      );
      return { found: false, syncState: updated.sync_state, message: 'This listing no longer exists on Etsy — reset to not-listed. You can sync it fresh.' };
    }
    throw err;
  }
}

export interface CheckAllStatusResult {
  checked: number;
  updated: number;
  /** Listings gone from Etsy (404) — reset to not-listed. */
  reset: number;
  errors: number;
  /** Requested products that do not have a linked Etsy listing. */
  skipped: number;
  items: Array<{
    productId: string;
    syncState: EtsyListingRow['sync_state'];
    linked: boolean;
    checkError: boolean;
  }>;
}

/**
 * Bulk "Check Etsy status of all" — reconciles every LINKED listing's local
 * state against what Etsy actually reports (read-only GET per listing; no
 * content is re-pushed). Clears stale local states — most importantly the
 * 'error' rows left by a transient failure (e.g. the 2026-07-08 missing-API-key
 * incident) that are actually fine drafts on Etsy — so they return to their
 * real state instead of being stuck un-syncable. A connection-level failure
 * (bad token) stops the run so the owner gets a clear "reconnect" message
 * rather than every item flapping. One call handles the whole catalog well
 * under the route's 60s budget.
 */
export async function checkAllListingStatuses(productIds?: string[]): Promise<CheckAllStatusResult> {
  const service = createServiceClient();
  if (productIds && productIds.length === 0) {
    return { checked: 0, updated: 0, reset: 0, errors: 0, skipped: 0, items: [] };
  }

  let query = service.from('etsy_listings').select('*').not('etsy_listing_id', 'is', null);
  if (productIds) query = query.in('product_id', productIds);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as EtsyListingRow[];
  const skipped = productIds ? Math.max(0, productIds.length - rows.length) : 0;
  const requestedIds = productIds ?? rows.map((row) => row.product_id);
  const itemStatus = new Map(rows.map((row) => [row.product_id, {
    productId: row.product_id,
    syncState: row.sync_state,
    linked: true,
    checkError: false,
  }]));
  if (rows.length === 0) {
    return {
      checked: 0,
      updated: 0,
      reset: 0,
      errors: 0,
      skipped,
      items: requestedIds.map((productId) => ({ productId, syncState: 'pending', linked: false, checkError: false })),
    };
  }

  const { accessToken } = await ensureFreshAccessToken(service);
  let checked = 0;
  let updated = 0;
  let reset = 0;
  let errors = 0;

  for (const listing of rows) {
    if (!listing.etsy_listing_id) continue;
    try {
      const res = await etsyFetch<{ state: string }>({ path: `/v3/application/listings/${listing.etsy_listing_id}`, accessToken });
      checked += 1;
      const { changed, syncState } = await applyEtsyReconciliation(service, listing, res.data.state);
      if (changed) updated += 1;
      itemStatus.set(listing.product_id, { productId: listing.product_id, syncState, linked: true, checkError: false });
    } catch (err) {
      if (err instanceof EtsyApiError && err.status === 404) {
        // Gone on Etsy (deleted there) — reset to not-listed, same as the per-item check.
        await resetDeletedEtsyListing(service, listing.product_id, listing.etsy_listing_id, 'No longer on Etsy — reset to not-listed.');
        checked += 1;
        reset += 1;
        itemStatus.set(listing.product_id, { productId: listing.product_id, syncState: 'pending', linked: false, checkError: false });
      } else if (isConnectionLevelEtsyError(err)) {
        throw err; // connection issue affects every listing — stop and surface it
      } else {
        errors += 1;
        itemStatus.set(listing.product_id, { productId: listing.product_id, syncState: listing.sync_state, linked: true, checkError: true });
      }
    }
  }

  return {
    checked,
    updated,
    reset,
    errors,
    skipped,
    items: requestedIds.map((productId) => itemStatus.get(productId)
      ?? { productId, syncState: 'pending', linked: false, checkError: false }),
  };
}

/**
 * Who asked for a deactivation. Recorded in the delist log row's message and
 * read back by the manual-hold rule (`isEtsyManualHold`): only `auto` delists
 * are ever auto-restored. Default is `manual` so a new caller that forgets to
 * say gets the safe (sticky) behaviour.
 */
export type EtsyDelistSource = 'manual' | 'auto';

export const ETSY_DELIST_MESSAGE: Record<EtsyDelistSource, string> = {
  manual: 'manual: deactivated from the admin — stays off Etsy until reactivated by hand',
  auto: 'auto: product sold or archived on the site',
};

export async function runDelist(productId: string, source: EtsyDelistSource = 'manual'): Promise<SyncStepResult> {
  const service = createServiceClient();
  const listing = await getListing(service, productId);
  if (!listing?.etsy_listing_id) {
    return { done: true, syncState: 'delisted', warnings: ['This product was never synced to Etsy.'] };
  }
  const { accessToken, shopId } = await ensureFreshAccessToken(service);
  await setListingState({ shopId, listingId: listing.etsy_listing_id, accessToken, state: 'inactive' });
  const updated = await upsertListing(service, productId, {
    sync_state: 'delisted',
    listing_state: 'inactive',
    last_synced_at: new Date().toISOString(),
  });
  await insertSyncLog(service, {
    product_id: productId,
    listing_id: listing.etsy_listing_id,
    action: 'delist',
    outcome: 'ok',
    message: ETSY_DELIST_MESSAGE[source],
  });
  return { done: true, syncState: updated.sync_state, listingId: listing.etsy_listing_id, listingUrl: listingUrlFor(listing.etsy_listing_id) };
}

export async function runReactivate(productId: string): Promise<SyncStepResult> {
  const service = createServiceClient();
  const listing = await getListing(service, productId);
  if (!listing?.etsy_listing_id) {
    throw new Error('This product has never been synced to Etsy — use "Sync to Etsy" instead.');
  }
  const { accessToken, shopId } = await ensureFreshAccessToken(service);
  // This is an explicit publish action. Etsy has no "reactivate as draft"
  // transition; updateListing accepts only active or inactive for state.
  await setListingState({ shopId, listingId: listing.etsy_listing_id, accessToken, state: 'active' });
  const updated = await upsertListing(service, productId, {
    sync_state: 'active',
    listing_state: 'active',
    last_synced_at: new Date().toISOString(),
  });
  await insertSyncLog(service, { product_id: productId, listing_id: listing.etsy_listing_id, action: 'relist', outcome: 'ok' });
  return { done: true, syncState: updated.sync_state, listingId: listing.etsy_listing_id, listingUrl: listingUrlFor(listing.etsy_listing_id) };
}

/** Explicitly publishes one completed review draft. Never used by normal sync. */
export async function runPublishReady(productId: string): Promise<SyncStepResult> {
  const service = createServiceClient();
  const listing = await getListing(service, productId);
  if (!listing || !isReadyToPublishEtsyListing(listing)) {
    return {
      done: true,
      syncState: listing?.sync_state ?? 'pending',
      warnings: ['This listing is not a completed Etsy draft awaiting review.'],
    };
  }
  const listingId = listing.etsy_listing_id;
  if (listingId == null) {
    return { done: true, syncState: listing.sync_state, warnings: ['This Etsy draft has no linked listing ID.'] };
  }

  const product = await fetchProduct(service, productId);
  if (!product || normalizeProductStatus(product.status) !== 'available') {
    throw new Error('This product is no longer available and was not published to Etsy.');
  }

  const { accessToken, shopId } = await ensureFreshAccessToken(service);
  await setListingState({ shopId, listingId, accessToken, state: 'active' });
  const updated = await upsertListing(service, productId, {
    sync_state: 'active',
    listing_state: 'active',
    last_synced_at: new Date().toISOString(),
    last_error: null,
    error_count: 0,
  });
  await insertSyncLog(service, {
    product_id: productId,
    listing_id: listingId,
    action: 'activate',
    outcome: 'ok',
    message: 'Published completed review draft live from the bulk action.',
  });
  return {
    done: true,
    syncState: updated.sync_state,
    listingId,
    listingUrl: listingUrlFor(listingId),
  };
}

// ---------------------------------------------------------------------------
// Phase 2 — bulk queue (enqueue + drain) and content-hash-driven "out of date"
// detection. `etsy_listings.sync_state = 'pending'` rows ARE the queue.
// ---------------------------------------------------------------------------
export function isSelectedEtsySyncCandidate(
  listing: Pick<EtsyListingRow, 'sync_state' | 'etsy_listing_id'> | null,
): boolean {
  if (!listing) return true;
  return ETSY_RESUMABLE_SYNC_STATES.includes(listing.sync_state)
    || listing.sync_state === 'error';
}

export async function enqueueProducts(productIds: string[]): Promise<number> {
  await scanAndMarkOutOfDate(productIds);
  const service = createServiceClient();
  let count = 0;
  for (const id of new Set(productIds)) {
    const existing = await getListing(service, id);
    if (!isSelectedEtsySyncCandidate(existing)) continue;
    if (!existing || ['error', 'unlinked'].includes(existing.sync_state)) {
      await upsertListing(service, id, { sync_state: 'pending' });
    }
    count += 1;
  }
  return count;
}

export async function enqueueAllEligible(): Promise<number> {
  await scanAndMarkOutOfDate();
  const service = createServiceClient();
  const connection = await getConnection(service);
  const spotData = await fetchSpotData();
  const { data } = await service.from('products').select('*').eq('status', 'available');
  const products = (data ?? []) as Product[];
  let count = 0;
  for (const product of products) {
    const existing = await getListing(service, product.id);
    const taxonomyOverride = existing?.taxonomy_override_id
      ? { id: existing.taxonomy_override_id, path: existing.taxonomy_override_path ?? '' }
      : null;
    const preflight = buildPreflightChecks(product, connection, spotData, taxonomyOverride);
    if (!isPreflightPassing(preflight)) continue;
    if (existing && (existing.sync_state === 'active' || existing.sync_state === 'draft_review')) continue;
    if (!existing || !ETSY_RESUMABLE_SYNC_STATES.includes(existing.sync_state)) {
      await upsertListing(service, product.id, { sync_state: 'pending' });
    }
    count += 1;
  }
  return count;
}

export interface DrainResult {
  done: boolean;
  remaining: number;
  results: { productId: string; syncState: string; done: boolean }[];
}

const DRAIN_TIME_BUDGET_MS = 8000;

export interface DrainDeps {
  claimNext: () => Promise<string | null>;
  runStep: (productId: string) => Promise<SyncStepResult>;
  now: () => number;
  budgetMs: number;
}

export interface DrainCoreResult {
  results: { productId: string; syncState: string; done: boolean }[];
  /** true when the queue emptied (claimNext returned null); false when the time budget was hit first. */
  exhausted: boolean;
}

/**
 * Pure orchestration loop (unit-tested in __tests__/sync.test.ts with fake
 * deps). The cross-invocation atomicity guarantee — two concurrent drains
 * never claiming the same product — comes from the `FOR UPDATE SKIP LOCKED`
 * Postgres RPC this calls into (supabase/etsy-sync.sql), which requires the
 * live migration to exercise for real (owner checklist item).
 */
export async function drainQueueCore(deps: DrainDeps): Promise<DrainCoreResult> {
  const start = deps.now();
  const results: DrainCoreResult['results'] = [];
  const seen = new Set<string>();
  for (;;) {
    if (deps.now() - start > deps.budgetMs) return { results, exhausted: false };
    const productId = await deps.claimNext();
    if (!productId) return { results, exhausted: true };
    // Safety net (2026-07-08): if we re-claim an item we already processed this
    // pass, it isn't leaving the queue (it finished a step but stayed claimable
    // — e.g. a bug that leaves it 'pending'). Stop the pass instead of cycling
    // the same items forever and burning Etsy's rate budget. The client's own
    // stall guard then ends the poll loop. Root cause of the reported runaway
    // is fixed above (effectiveMode); this bounds the damage of any future one.
    if (seen.has(productId)) return { results, exhausted: false };
    seen.add(productId);
    const result = await deps.runStep(productId);
    results.push({ productId, syncState: result.syncState, done: result.done });
    // A product still mid-image-batch (done:false) stays claimable by design —
    // break so the rest of the queue drains before we come back to it.
    if (!result.done) break;
  }
  return { results, exhausted: false };
}

/**
 * A connection-level failure (bad/expired OAuth token, missing shop id) affects
 * EVERY item, not just this one — the batch should stop with a clear "reconnect
 * Etsy" message rather than march on marking the whole catalog errored. Every
 * other throw is this item's problem and is contained (see drainQueue).
 */
function isConnectionLevelEtsyError(err: unknown): boolean {
  if (err instanceof EtsyApiError) {
    return err.status === 401 || err.code === 'invalid_grant' || err.code === 'auth_expired' || err.code === 'oauth_token_failed';
  }
  const message = err instanceof Error ? err.message : '';
  return /reconnect|not connected|refresh token|shop id/i.test(message);
}

export async function drainQueue(): Promise<DrainResult> {
  const service = createServiceClient();
  const core = await drainQueueCore({
    claimNext: () => claimNextPendingListing(service),
    // runSyncStep catches its OWN step errors, but a throw from its pre-flight
    // setup (e.g. a token refresh) is uncaught and would otherwise fail the
    // whole drain with a 500 (confirmed 2026-07-08). Contain per-item throws
    // so one bad listing can't sink the batch; rethrow connection-level ones so
    // the batch stops with an actionable message instead of erroring everything.
    runStep: async (id) => {
      try {
        return await runSyncStep(id, 'publish');
      } catch (err) {
        if (isConnectionLevelEtsyError(err)) throw err;
        const message = err instanceof Error ? err.message : 'Sync step failed unexpectedly.';
        await upsertListing(service, id, { sync_state: 'error', last_error: message }).catch(() => {});
        await insertSyncLog(service, { product_id: id, action: 'sync_step', outcome: 'error', message }).catch(() => {});
        return { done: true, syncState: 'error', error: { code: 'sync_failed', message } };
      }
    },
    now: () => Date.now(),
    budgetMs: DRAIN_TIME_BUDGET_MS,
  });
  const remaining = await countPendingListings(service);
  return { done: core.exhausted && remaining === 0, remaining, results: core.results };
}

export interface EtsyRepairSummary {
  total: number;
  outOfDate: number;
  incomplete: number;
}

export async function getEtsyRepairSummary(): Promise<EtsyRepairSummary> {
  await scanAndMarkOutOfDate();
  const service = createServiceClient();
  const { data, error } = await service
    .from('etsy_listings')
    .select('sync_state')
    .not('etsy_listing_id', 'is', null)
    .in('sync_state', ETSY_REPAIRABLE_SYNC_STATES);
  if (error) throw new Error(error.message);
  const states = (data ?? []) as Array<{ sync_state: EtsySyncState }>;
  return {
    total: states.length,
    outOfDate: states.filter((row) => row.sync_state === 'out_of_date').length,
    incomplete: states.filter((row) => row.sync_state !== 'out_of_date').length,
  };
}

async function runRepairStep(productId: string): Promise<SyncStepResult> {
  const checked = await checkListingStatus(productId);
  if (!checked.found) {
    return {
      done: true,
      syncState: checked.syncState,
      warnings: [checked.message],
    };
  }

  await scanAndMarkOutOfDate([productId]);
  const service = createServiceClient();
  const listing = await getListing(service, productId);
  if (!listing?.etsy_listing_id || !ETSY_REPAIRABLE_SYNC_STATES.includes(listing.sync_state)) {
    return {
      done: true,
      syncState: listing?.sync_state ?? 'pending',
      warnings: ['This listing no longer needs Etsy repair.'],
    };
  }

  const mode: SyncMode = listing.sync_state === 'out_of_date' || listing.listing_state === 'active'
    ? 'update'
    : 'publish';
  return runSyncStep(productId, mode);
}

export async function drainRepairQueue(): Promise<DrainResult> {
  const service = createServiceClient();
  const core = await drainQueueCore({
    claimNext: () => claimNextRepairableListing(service),
    runStep: async (productId) => {
      try {
        return await runRepairStep(productId);
      } catch (err) {
        if (isConnectionLevelEtsyError(err)) throw err;
        const message = err instanceof Error ? err.message : 'Etsy repair failed unexpectedly.';
        await upsertListing(service, productId, { sync_state: 'error', last_error: message }).catch(() => {});
        await insertSyncLog(service, { product_id: productId, action: 'repair', outcome: 'error', message }).catch(() => {});
        return { done: true, syncState: 'error', error: { code: 'repair_failed', message } };
      }
    },
    now: () => Date.now(),
    budgetMs: DRAIN_TIME_BUDGET_MS,
  });
  const remaining = await countRepairableListings(service);
  return { done: core.exhausted && remaining === 0, remaining, results: core.results };
}

// Deliberate go-live drain for completed Etsy drafts. This is separate from
// normal sync so review-first remains the default and every activation starts
// from an explicit admin confirmation.
export async function drainPublishQueue(): Promise<DrainResult> {
  const service = createServiceClient();
  const core = await drainQueueCore({
    claimNext: () => claimNextDraftReviewListing(service),
    runStep: async (productId) => {
      try {
        return await runPublishReady(productId);
      } catch (err) {
        if (isConnectionLevelEtsyError(err)) throw err;
        const message = err instanceof Error ? err.message : 'Etsy publish failed unexpectedly.';
        const listing = await getListing(service, productId).catch(() => null);
        await upsertListing(service, productId, {
          sync_state: 'error',
          last_error: message,
          error_count: (listing?.error_count ?? 0) + 1,
        }).catch(() => {});
        await insertSyncLog(service, {
          product_id: productId,
          listing_id: listing?.etsy_listing_id ?? null,
          action: 'activate',
          outcome: 'error',
          message,
        }).catch(() => {});
        return { done: true, syncState: 'error', error: { code: 'publish_failed', message } };
      }
    },
    now: () => Date.now(),
    budgetMs: DRAIN_TIME_BUDGET_MS,
  });
  const remaining = await countDraftReviewListings(service);
  return { done: core.exhausted && remaining === 0, remaining, results: core.results };
}

/**
 * Marks active/draft_review listings whose mapped payload no longer matches
 * the last pushed hash — the mechanism that's supposed to catch a price (or
 * any other mapped-field) edit on an already-synced product and flip it to
 * 'out_of_date' so "Sync all to Etsy" and the per-item panel pick it back up.
 *
 * Pass `productIds` to check just those products (cheap — the intended call
 * shape from adminRevalidateProduct/adminRevalidateProducts, which already
 * fires after every admin product save) instead of the full catalog. Omit it
 * for a full sweep (e.g. a future cron safety net).
 *
 * Confirmed live 2026-07-10: this function was fully built and unit-tested
 * but never actually CALLED from anywhere — so no price edit on a live
 * listing was ever detected, and "Sync all to Etsy" always reported 0
 * eligible for already-active items. Wiring it into the existing
 * revalidate-on-save chokepoint (see admin-products.ts) fixes this without a
 * new "when do products change" audit.
 */
export async function scanAndMarkOutOfDate(productIds?: string[]): Promise<number> {
  const service = createServiceClient();
  const connection = await getConnection(service);
  const spotData = await fetchSpotData();
  let query = service.from('etsy_listings').select('*').in('sync_state', ['active', 'draft_review']);
  if (productIds) query = query.in('product_id', productIds);
  const { data } = await query;
  let count = 0;
  for (const row of (data ?? []) as EtsyListingRow[]) {
    const product = await fetchProduct(service, row.product_id);
    if (!product) continue;
    const taxonomyOverride = row.taxonomy_override_id ? { id: row.taxonomy_override_id, path: row.taxonomy_override_path ?? '' } : null;
    const payload = buildMappedPayload(product, connection, spotData, taxonomyOverride, row.extra_tags ?? null);
    if (computeContentHash(payload) !== row.content_hash) {
      await upsertListing(service, row.product_id, { sync_state: 'out_of_date' });
      count += 1;
    }
  }
  return count;
}

/**
 * Pure threshold decision for the scheduled price push (Q4: push only when
 * |delta| >= threshold%). Exported standalone for unit testing.
 */
export function shouldPushPrice(newPrice: number, lastPushedPrice: number | null, thresholdPct: number): boolean {
  if (lastPushedPrice == null || lastPushedPrice <= 0) return true;
  const changePct = (Math.abs(newPrice - lastPushedPrice) / lastPushedPrice) * 100;
  return changePct >= thresholdPct;
}

const LIVE_LISTING_STATES = ['draft_created', 'images_synced', 'inventory_synced', 'draft_review', 'active', 'out_of_date'];

/**
 * Phase 2 auto-delist/relist (etsy-sync-plan/03-sync-lifecycle.md Flow 3).
 * Called from the existing product-status/cache-revalidation chokepoints
 * (adminRevalidateProduct(s) in app/actions/admin-products.ts, PayPal
 * capture-order, and the PayPal webhook) rather than threading a new "who
 * changes product status" audit through the app. ALWAYS best-effort and
 * non-throwing — a delist/relist failure must never block the caller's real
 * operation (an order capture, an admin status change). No-ops entirely when
 * `auto_delist_on_sold` is off (Phase 1 default) or Etsy isn't connected.
 */
// ---------------------------------------------------------------------------
// Status-drift reconciliation (2026-08-21) — twin of the eBay sweep.
//
// The auto-delist hook runs after the response via `after()`, which on Netlify
// is best-effort BY DESIGN (Next lists `after()` as requiring graceful-shutdown
// support; the Lambda freeze-on-response model does not provide it). Work still
// in flight when the response flushes is frozen, and lost outright if the
// container is reclaimed while cold — that is how two sold products stayed live
// on Etsy and eBay for twelve days.
//
// This sweep asks "does any listing disagree with its product's status right
// now?" and repairs what it finds, which catches a missed delist regardless of
// cause. Detection only — the repair DELEGATES to handleProductStatusChange so
// the delist/reactivate logic has exactly one implementation.
//
// See the eBay twin in lib/ebay/sync.ts; the two must not drift apart.
// ---------------------------------------------------------------------------

/** What a drifted listing needs. `null` when local state already agrees. */
export type EtsyStatusDrift = 'delist' | 'restore' | null;

/**
 * Pure mirror of `handleProductStatusChange`'s branches, exported so the drift
 * rules are testable without a database or an Etsy account.
 *
 * ⚠️ Etsy keys on STATUS ONLY — unlike eBay it does not consider quantity.
 * That asymmetry is in the hook it mirrors; do not "fix" it here in isolation.
 *
 * `manualHold` (2026-09-24): a listing the OWNER deactivated — the admin's
 * "Deactivate on Etsy" button, or a deactivation done on Etsy itself and picked
 * up by the read-only status check — is never auto-restored, however available
 * the product is on the site. Before this rule the sweep put 33 deliberately
 * deactivated high-value listings straight back on Etsy. Only a delist that
 * automation performed (product sold/archived) is undone when the product comes
 * back; see `isEtsyManualHold`. The `delist` branch is unaffected: a sold
 * product's listing always comes down.
 */
export function detectEtsyStatusDrift(
  row: EtsyListingRow,
  product: { status?: string | null } | null,
  manualHold = false,
): EtsyStatusDrift {
  if (!row.etsy_listing_id) return null;
  if (!product) return null;
  const status = normalizeProductStatus(product.status);
  if (status !== 'available' && LIVE_LISTING_STATES.includes(row.sync_state)) return 'delist';
  if (status === 'available' && row.sync_state === 'delisted') return manualHold ? null : 'restore';
  return null;
}

/**
 * The manual-hold rule, from the newest successful `delist` log message for the
 * product. Only a message automation wrote (`auto: …`) releases the hold. No
 * row at all (the listing went inactive on Etsy's side, or was delisted before
 * this rule existed) and every `manual: …` row hold the listing off Etsy.
 */
export function isEtsyManualHold(latestDelistMessage: string | null | undefined): boolean {
  return !(typeof latestDelistMessage === 'string' && latestDelistMessage.startsWith('auto:'));
}

/** Manual-hold lookup for one product — the hook's and the repair's per-item path. */
async function loadEtsyManualHold(service: SupabaseClient, productId: string): Promise<boolean> {
  const latest = await getLatestDelistMessages(service, [productId]);
  return isEtsyManualHold(latest.get(productId));
}

export interface EtsyReconcileResult {
  scanned: number;
  drifted: number;
  /** Direct delist/relist succeeded and the drift is gone. */
  repaired: number;
  /** Etsy refused the write but already showed the listing closed; local row pulled in line. */
  reconciled: number;
  /** Still drifted after the write AND the read-only check. */
  failed: number;
  remaining: number;
  skipped: boolean;
}

/** Wall-clock ceiling, stamped on entry. Same reasoning as the price push. */
const RECONCILE_BUDGET_MS = 20_000;

/**
 * Find every Etsy listing whose state disagrees with its product's status and
 * repair it. With nothing drifted this is three queries and no Etsy calls.
 */
export async function reconcileEtsyStatusDrift(): Promise<EtsyReconcileResult> {
  const deadlineAt = Date.now() + RECONCILE_BUDGET_MS;
  const service = createServiceClient();
  const empty: EtsyReconcileResult = { scanned: 0, drifted: 0, repaired: 0, reconciled: 0, failed: 0, remaining: 0, skipped: true };

  try {
    const connection = await getConnection(service);
    // Mirrors the hook's own gate: with auto-delist off, an "out of sync"
    // listing is the owner's deliberate choice, not drift to repair.
    if (!connection || connection.status !== 'connected' || !connection.auto_delist_on_sold) {
      await insertSyncLog(service, {
        action: 'reconcile_status',
        outcome: 'warning',
        message: !connection || connection.status !== 'connected'
          ? 'Status reconcile skipped because Etsy is not connected.'
          : 'Status reconcile skipped because auto-delist on sold is disabled.',
      });
      return empty;
    }

    const { data: listingRows, error } = await service
      .from('etsy_listings')
      .select('*')
      .in('sync_state', [...LIVE_LISTING_STATES, 'delisted']);
    if (error) throw new Error(error.message);
    const rows = (listingRows ?? []) as EtsyListingRow[];
    if (!rows.length) return { scanned: 0, drifted: 0, repaired: 0, reconciled: 0, failed: 0, remaining: 0, skipped: false };

    const { data: productRows } = await service
      .from('products')
      .select('id, status')
      .in('id', rows.map((row) => row.product_id));
    const products = new Map(
      ((productRows ?? []) as Array<{ id: string; status: string | null }>).map((p) => [p.id, p]),
    );

    // Manual-hold rule: only a delisted listing on an AVAILABLE product can be
    // a restore candidate, so only those need their newest delist log read.
    const restoreCandidates = rows
      .filter((row) => row.sync_state === 'delisted' && normalizeProductStatus(products.get(row.product_id)?.status) === 'available')
      .map((row) => row.product_id);
    const latestDelists = await getLatestDelistMessages(service, restoreCandidates);
    const driftOf = (row: EtsyListingRow) =>
      detectEtsyStatusDrift(row, products.get(row.product_id) ?? null, isEtsyManualHold(latestDelists.get(row.product_id)));

    const drifted = rows.filter((row) => driftOf(row) !== null);

    // One outcome per attempted listing. A repair is counted from the state
    // that FOLLOWED the attempt, never from the attempt itself — see
    // marketplace-drift-repair.ts for why.
    const outcomes: DriftRepairOutcome[] = [];
    for (const row of drifted) {
      if (outcomes.length > 0 && Date.now() > deadlineAt) break;
      outcomes.push(await repairEtsyStatusDrift(service, row.product_id, driftOf(row)));
    }

    const counts = countDriftRepairs(outcomes);
    const result: EtsyReconcileResult = {
      scanned: rows.length,
      drifted: drifted.length,
      repaired: counts.repaired,
      reconciled: counts.reconciled,
      failed: counts.failed,
      remaining: drifted.length - outcomes.length,
      skipped: false,
    };
    // Logged even on a clean run — a silent no-op is indistinguishable from a
    // cron that stopped firing.
    await insertSyncLog(service, {
      action: 'reconcile_status',
      outcome: driftRepairOutcomeLevel(result),
      message: formatDriftRepairSummary('Etsy', result),
      detail: { ...result },
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Etsy status reconcile failed.';
    await insertSyncLog(service, { action: 'reconcile_status', outcome: 'error', message });
    throw err;
  }
}

export async function handleProductStatusChange(productIds: string[]): Promise<void> {
  if (productIds.length === 0) return;
  try {
    const service = createServiceClient();
    const connection = await getConnection(service);
    if (!connection || !connection.auto_delist_on_sold || connection.status !== 'connected') return;

    for (const productId of productIds) {
      try {
        await applyEtsyProductStatus(service, productId);
      } catch (err) {
        console.error(`Etsy auto-delist/relist failed for product ${productId}:`, err);
        // A refusal used to stop here, in the console nobody reads on Netlify.
        // It now leaves a row the admin can see, like the eBay hook always did.
        await logEtsyStatusRefusal(service, productId, err);
      }
    }
  } catch (err) {
    console.error('Etsy auto-delist/relist hook failed:', err);
  }
}

/**
 * Apply the product's CURRENT status to its Etsy listing — delist a live
 * listing whose product is no longer available, reactivate a delisted one
 * whose product is available again. Re-reads both rows so a stale caller
 * cannot act on old state. THROWS on an Etsy refusal; the caller decides what
 * a refusal means (the hook logs it, the sweep falls back to a read-only
 * status check).
 */
async function applyEtsyProductStatus(service: SupabaseClient, productId: string): Promise<'repaired' | 'noop'> {
  const listing = await getListing(service, productId);
  if (!listing?.etsy_listing_id) return 'noop'; // never synced to Etsy — nothing to do
  const { data: product } = await service.from('products').select('status').eq('id', productId).maybeSingle();
  if (!product) return 'noop';

  const drift = detectEtsyStatusDrift(listing, product, await loadEtsyManualHold(service, productId));
  if (drift === 'delist') {
    await runDelist(productId, 'auto');
    return 'repaired';
  }
  if (drift === 'restore') {
    await runReactivate(productId);
    return 'repaired';
  }
  return 'noop';
}

async function logEtsyStatusRefusal(service: SupabaseClient, productId: string, err: unknown): Promise<void> {
  try {
    const listing = await getListing(service, productId);
    await insertSyncLog(service, {
      product_id: productId,
      listing_id: listing?.etsy_listing_id ?? null,
      action: 'status_change_hook',
      outcome: 'error',
      message: err instanceof EtsyApiError
        ? `Etsy refused the status change (HTTP ${err.status}): ${err.operatorMessage}`
        : err instanceof Error ? err.message : 'Unknown error.',
      detail: err instanceof EtsyApiError ? { status: err.status, code: err.code, response: err.detail ?? null } : null,
    });
  } catch (logErr) {
    console.error('Etsy status refusal could not be logged:', logErr);
  }
}

/**
 * One drifted listing, for the sweep. Etsy will not change the state of a
 * listing it has already closed — a sold single-quantity listing sits in
 * `edit` with quantity 0 (inventory #19, 2026-09-07) — so a refused delist is
 * followed by the read-only status check, which maps Etsy's real state into
 * the local row (`reconcileSyncStateFromEtsy`). The outcome is judged from the
 * re-read state afterwards, never from the write's own return.
 */
async function repairEtsyStatusDrift(
  service: SupabaseClient,
  productId: string,
  driftBefore: EtsyStatusDrift,
): Promise<DriftRepairOutcome> {
  if (driftBefore === null) return 'noop';
  let directError = false;
  try {
    await applyEtsyProductStatus(service, productId);
  } catch (err) {
    directError = true;
    await logEtsyStatusRefusal(service, productId, err);
    try {
      await checkListingStatus(productId);
    } catch (checkErr) {
      console.error(`Etsy status check after a refused status change failed for product ${productId}:`, checkErr);
    }
  }

  const listingAfter = await getListing(service, productId);
  const { data: productAfter } = await service.from('products').select('status').eq('id', productId).maybeSingle();
  const driftAfter = listingAfter
    ? detectEtsyStatusDrift(listingAfter, productAfter ?? null, await loadEtsyManualHold(service, productId))
    : null;
  const outcome = classifyDriftRepair({ driftBefore, directError, driftAfter });

  if (outcome === 'reconciled') {
    await insertSyncLog(service, {
      product_id: productId,
      listing_id: listingAfter?.etsy_listing_id ?? null,
      action: 'reconcile_status',
      outcome: 'warning',
      message: `Etsy refused the status change but already shows this listing ${listingAfter?.listing_state ?? 'closed'} on its side — local state reconciled to ${listingAfter?.sync_state ?? 'unknown'}.`,
    });
  } else if (outcome === 'failed') {
    await insertSyncLog(service, {
      product_id: productId,
      listing_id: listingAfter?.etsy_listing_id ?? null,
      action: 'reconcile_status',
      outcome: 'error',
      message: `Still out of sync after the status change and a status check (product ${productAfter?.status ?? 'unknown'}, listing ${listingAfter?.sync_state ?? 'unknown'}) — needs a look in Admin.`,
    });
  }
  return outcome;
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
  'quantity',
  'status',
  'sold_price',
].join(',');

interface EtsyPricePushCandidate {
  row: EtsyListingRow;
  price: number;
  quantity: number;
}

export interface EtsyPricePushResult {
  done: boolean;
  pushed: number;
  skipped: number;
  failed: number;
  blocked: number;
  remaining: number;
}

function emptyPricePushResult(): EtsyPricePushResult {
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
 * See the incident behind it in `lib/marketplace-price-chip.ts`, which now owns
 * the constant so the Product Admin price chip can state the same ceiling this
 * planner enforces — this module is `server-only`. A successful push clears the
 * count, so it un-sticks itself. (Both providers previously declared their own
 * `= 3`; one source of truth means they cannot drift apart.)
 */
export { MAX_PRICE_PUSH_ATTEMPTS };

function planEtsyPricePush(
  rows: EtsyListingRow[],
  products: Map<string, Product>,
  spotData: SpotData,
  markupPct: number,
  thresholdPct: number | null,
): { candidates: EtsyPricePushCandidate[]; skipped: number; blocked: number } {
  const candidates: EtsyPricePushCandidate[] = [];
  let skipped = 0;
  let blocked = 0;

  for (const row of rows) {
    if (!row.etsy_listing_id) {
      skipped += 1;
      continue;
    }
    const product = products.get(row.product_id);
    if (!product) {
      skipped += 1;
      continue;
    }
    // Defence in depth, mirroring the eBay planner. Today this changes nothing:
    // Etsy's auto-delist moves a sold product's listing to `delisted`, which is
    // outside this function's selection, so 0 of the 90 current candidates are
    // non-available (measured 2026-08-08). eBay leaves them `out_of_date` and
    // therefore selected, which is exactly how it ended up sending ~33
    // guaranteed-400 price updates on withdrawn listings every run.
    //
    // The protection here is against the delist step failing or being skipped:
    // without this check, Etsy inherits the same failure mode silently.
    if (normalizeProductStatus(product.status) !== 'available') {
      skipped += 1;
      continue;
    }
    if ((row.error_count ?? 0) >= MAX_PRICE_PUSH_ATTEMPTS) {
      skipped += 1;
      continue;
    }
    const priceResult = computeEtsyPrice(product, spotData, markupPct);
    if (priceResult.price == null) {
      blocked += 1;
      continue;
    }
    const shouldPush = thresholdPct == null
      ? priceResult.price !== row.last_pushed_price
      : shouldPushPrice(priceResult.price, row.last_pushed_price, thresholdPct);
    if (!shouldPush) {
      skipped += 1;
      continue;
    }
    candidates.push({
      row,
      price: priceResult.price,
      quantity: normalizeProductQuantity(product.quantity),
    });
  }

  return { candidates, skipped, blocked };
}

async function pushEtsyPriceCandidates(params: {
  service: SupabaseClient;
  connection: EtsyConnectionRow;
  candidates: EtsyPricePushCandidate[];
  maxItems?: number;
  /**
   * ABSOLUTE epoch-ms deadline for the whole REQUEST, not a duration for this
   * loop. It used to be `budgetMs`, measured from the top of this function, so
   * everything before it (spot fetch, connection read, listing + product
   * queries) fell outside the ceiling it claimed to enforce. The eBay twin hit
   * exactly that on 2026-08-21 and 504'd; this side had been quietly deferring
   * 15-18 listings a day since 2026-08-20 for the same reason.
   */
  deadlineAt?: number;
}): Promise<{ pushed: number; failed: number; remaining: number }> {
  const limit = Math.min(params.maxItems ?? params.candidates.length, params.candidates.length);
  let attempted = 0;
  let pushed = 0;
  let failed = 0;
  const { accessToken, shopId } = limit > 0
    ? await ensureFreshAccessToken(params.service)
    : { accessToken: '', shopId: 0 };
  const tierProfileMap = limit > 0 ? await loadTierProfileMap(params.service) : {};

  // Bookkeeping is accumulated and flushed in batches instead of written twice
  // per listing. Etsy has no bulk price endpoint, so the per-item API call
  // stays — but the two Supabase round-trips per listing were ~60% of the
  // measured 522ms/item, and they are the part that can be batched away.
  let pendingPatches: Array<{ product_id: string } & Record<string, unknown>> = [];
  let pendingLogs: EtsySyncLogInput[] = [];
  const flushBookkeeping = async () => {
    if (!pendingPatches.length && !pendingLogs.length) return;
    const patches = pendingPatches;
    const logs = pendingLogs;
    pendingPatches = [];
    pendingLogs = [];
    // Best-effort, matching the per-item behaviour it replaces: bookkeeping
    // must never throw and abandon listings that were pushed successfully.
    await bulkPatchListings(params.service, patches).catch(() => {});
    await insertSyncLogs(params.service, logs);
  };

  for (const candidate of params.candidates.slice(0, limit)) {
    // Per-item granularity, so the overshoot is a single listing rather than a
    // batch — no headroom term needed, unlike the eBay twin's 25-offer chunks.
    if (params.deadlineAt != null && attempted > 0 && Date.now() > params.deadlineAt) break;
    attempted += 1;
    try {
      await updateListingInventory({
        listingId: candidate.row.etsy_listing_id!,
        accessToken,
        price: candidate.price,
        quantity: candidate.quantity,
        readinessStateId: params.connection.readiness_state_id,
      });

      // Tier shipping-profile follow-up (2026-07-30): only when this price
      // change crossed a shipping-tier boundary (or the last pushed price is
      // unknown) — the common within-band drift adds zero extra Etsy calls.
      const targetProfileId = tierShippingProfileIdFor(tierProfileMap, candidate.price);
      const previousTierKey = candidate.row.last_pushed_price != null
        ? getMarketplaceShippingTier(candidate.row.last_pushed_price)?.key ?? null
        : null;
      const nextTierKey = getMarketplaceShippingTier(candidate.price)?.key ?? null;
      if (targetProfileId && nextTierKey && previousTierKey !== nextTierKey) {
        await etsyFetch({
          method: 'PATCH',
          path: `/v3/application/shops/${shopId}/listings/${candidate.row.etsy_listing_id}`,
          accessToken,
          json: { shipping_profile_id: targetProfileId },
        });
        pendingLogs.push({
          product_id: candidate.row.product_id,
          listing_id: candidate.row.etsy_listing_id,
          action: 'shipping_tier',
          outcome: 'ok',
          detail: { shipping_profile_id: targetProfileId, price: candidate.price },
        });
      }

      // Clearing the counter is what makes the attempt ceiling self-healing.
      pendingPatches.push({
        product_id: candidate.row.product_id,
        last_pushed_price: candidate.price,
        last_synced_at: new Date().toISOString(),
        error_count: 0,
        last_error: null,
      });
      pendingLogs.push({
        product_id: candidate.row.product_id,
        listing_id: candidate.row.etsy_listing_id,
        action: 'price_push',
        outcome: 'ok',
        detail: { price: candidate.price },
      });
      pushed += 1;
    } catch (err) {
      failed += 1;
      const message = err instanceof EtsyApiError ? err.operatorMessage : err instanceof Error ? err.message : 'Price push failed.';
      // Persist the API detail, not just the operator sentence. EtsyApiError
      // documents `detail` as "Redacted response detail — safe to store in
      // etsy_sync_log.detail", and it was being dropped. The eBay twin had the
      // same hole, which is why a real investigation found 140 log rows all
      // reading `eBay API error (HTTP 400).` with no recoverable cause.
      const detail = err instanceof EtsyApiError
        ? {
          status: err.status,
          code: err.code,
          response: err.detail,
          listingId: candidate.row.etsy_listing_id,
          attemptedPrice: candidate.price,
        }
        : { message: String(err).slice(0, 500), listingId: candidate.row.etsy_listing_id };

      // Rotate failures behind untouched rows without pretending the price was
      // pushed, so one bad listing cannot starve the rest of the catalog.
      //
      // Also COUNT the failure. This was a no-op `{}` patch, so `error_count`
      // never moved off 0 and the attempt ceiling could never engage — a
      // permanently broken listing was retried on every single run.
      pendingPatches.push({
        product_id: candidate.row.product_id,
        error_count: (candidate.row.error_count ?? 0) + 1,
        last_error: message.slice(0, 500),
      });
      pendingLogs.push({
        product_id: candidate.row.product_id,
        listing_id: candidate.row.etsy_listing_id,
        action: 'price_push',
        outcome: 'error',
        message,
        detail,
      });
    }

    // Flush periodically rather than only at the end, so a run cut short by
    // the deadline still records everything it actually pushed.
    if (pendingPatches.length >= 25 || pendingLogs.length >= 25) await flushBookkeeping();
  }

  await flushBookkeeping();
  return { pushed, failed, remaining: params.candidates.length - attempted };
}

/**
 * Wall-clock ceiling for the WHOLE scheduled request, stamped on entry.
 * See the eBay twin's constant for the full rationale — same change, same
 * reason, and the two must not drift apart.
 */
const SCHEDULED_PRICE_PUSH_BUDGET_MS = 20_000;

/** Phase 2 scheduled daily price push — see /api/admin/etsy/price-push (Netlify Scheduled Function target). */
export async function runScheduledPricePush(): Promise<EtsyPricePushResult> {
  // Stamped FIRST, before the prune / connection read / spot fetch / queries,
  // so the deadline covers setup rather than just the push loop.
  const deadlineAt = Date.now() + SCHEDULED_PRICE_PUSH_BUDGET_MS;
  const service = createServiceClient();
  await pruneOldSyncLogs(service).catch(() => {});

  try {
    const connection = await getConnection(service);
    if (!connection || connection.status !== 'connected' || !connection.price_push_enabled) {
      const message = !connection || connection.status !== 'connected'
        ? 'Scheduled Etsy price push skipped because Etsy is not connected.'
        : 'Scheduled Etsy price push ran, but daily price pushes are disabled.';
      await insertSyncLog(service, { action: 'scheduled_price_push', outcome: 'warning', message });
      return emptyPricePushResult();
    }

    const [spotData, listingResult] = await Promise.all([
      fetchSpotData(),
      service
        .from('etsy_listings')
        .select('*')
        .in('sync_state', ['active', 'draft_review', 'out_of_date'])
        .order('updated_at', { ascending: true }),
    ]);
    if (listingResult.error) throw new Error(listingResult.error.message);

    const rows = (listingResult.data ?? []) as EtsyListingRow[];
    const products = await loadPriceProducts(service, rows.map((row) => row.product_id));
    const plan = planEtsyPricePush(
      rows,
      products,
      spotData,
      connection.price_markup_pct,
      connection.price_push_threshold_pct,
    );
    const processed = await pushEtsyPriceCandidates({
      service,
      connection,
      candidates: plan.candidates,
      deadlineAt,
    });
    const result: EtsyPricePushResult = {
      done: processed.remaining === 0,
      pushed: processed.pushed,
      skipped: plan.skipped,
      failed: processed.failed,
      blocked: plan.blocked,
      remaining: processed.remaining,
    };
    const outcome = result.failed || result.blocked || result.remaining ? 'warning' : 'ok';
    const message = `Scheduled Etsy price push: ${result.pushed} pushed, ${result.skipped} unchanged, ${result.blocked} blocked, ${result.failed} failed, ${result.remaining} deferred.`;
    await insertSyncLog(service, { action: 'scheduled_price_push', outcome, message, detail: { ...result } });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Scheduled Etsy price push failed.';
    await insertSyncLog(service, { action: 'scheduled_price_push', outcome: 'error', message });
    throw err;
  }
}

/** Live listings processed per "Push prices now" invocation — keeps each call well under any function timeout. */
const PRICE_PUSH_BATCH = 8;

/**
 * Manual "Push prices now" — re-sends the current computed price of every live
 * (active/draft_review) listing whose price differs from what was last sent to
 * Etsy, IGNORING the daily scheduled push's threshold (a markup change is a
 * deliberate, immediate re-price, not spot-drift noise the threshold exists to
 * suppress). Uses the lean price-only path (updateListingInventory only — no
 * image/property work), unlike a full "Sync Updates".
 *
 * Batched + resumable so it can't time out: the caller polls until `done`.
 * Idempotent — a listing already at the right price is skipped, so re-running
 * converges. A failure doesn't update last_pushed_price, so a persistently
 * failing item keeps `remaining` from reaching 0; the caller's stall guard
 * (identical repeated `remaining`) ends the loop instead of retrying forever.
 *
 * NOTE: this is the right tool after a markup change because the bulk "Sync
 * All to Etsy" (enqueueAllEligible) deliberately SKIPS already-active/
 * draft_review listings — it never re-prices what's already up.
 */
export async function pushPricesBatch(): Promise<EtsyPricePushResult> {
  const service = createServiceClient();
  const connection = await getConnection(service);
  if (!connection || connection.status !== 'connected') return emptyPricePushResult();

  const [spotData, listingResult] = await Promise.all([
    fetchSpotData(),
    service
      .from('etsy_listings')
      .select('*')
      .in('sync_state', ['active', 'draft_review'])
      .order('updated_at', { ascending: true }),
  ]);
  if (listingResult.error) throw new Error(listingResult.error.message);

  const rows = (listingResult.data ?? []) as EtsyListingRow[];
  const products = await loadPriceProducts(service, rows.map((row) => row.product_id));
  const plan = planEtsyPricePush(rows, products, spotData, connection.price_markup_pct, null);
  const processed = await pushEtsyPriceCandidates({
    service,
    connection,
    candidates: plan.candidates,
    maxItems: PRICE_PUSH_BATCH,
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
