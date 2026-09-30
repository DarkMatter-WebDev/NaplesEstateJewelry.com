import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createDripBudget, SOCIAL_SCHEDULED_DRIP_BATCH_SIZE } from '@/lib/social-queue-schedule';
import type { Product } from '@/types/product';
import { fetchSpotData } from '@/lib/spot-price';
import {
  INSTAGRAM_CONTAINER_TTL_MS,
  InstagramApiError,
  createCarouselContainer,
  createCarouselItemContainer,
  createComment,
  createImageContainer,
  fetchContainerStatus,
  fetchInstagramProfile,
  fetchMedia,
  fetchPublishingLimit,
  instagramFetch,
  isInstagramMediaMissingError,
} from './client';
import { ensureFreshAccessToken, markNeedsReauth } from './auth';
import { buildInstagramPost, computeInstagramContentHash } from './mapping';
import {
  extractSocialCaptionOpening,
  fallbackSocialCaptionOpening,
  validateEditedSocialCaptionOpening,
} from '@/lib/social-caption-opening';
import { adaptSocialCaptionForTarget } from '@/lib/social-publish-both';
import {
  getConnection,
  getPost,
  insertSyncLog,
  pruneOldSyncLogs,
  upsertPost,
  type InstagramPostRow,
} from './store';

/**
 * `./images` is imported LAZILY, and these two wrappers exist only to make that
 * happen without touching the call sites.
 *
 * WHY
 * ---
 * `./images` reaches `sharp` (19MB of native binaries under `@img`) and
 * `next/og` (3.2MB of Satori + resvg WASM). A STATIC import pulls all of that
 * into this module's graph, so `/api/admin/{channel}/drip` paid the full
 * initialisation cost on every cold invocation — before the handler ran, and
 * even to return a 401.
 *
 * ℹ️ WHAT IS AND IS NOT ESTABLISHED. On 2026-08-19 `facebook-drip` spent 25s
 * and Netlify cut it at the 26s ceiling, with an EMPTY queue — so the handler's
 * own work (three Supabase calls) cannot explain it, and warm the same endpoint
 * answers in 0.2s. Startup is therefore where the time went. That this import
 * graph is what made startup expensive is **plausible but UNPROVEN**: a local
 * probe could not confirm the heavy modules load under the webpack-bundled
 * server, so it neither confirmed nor refuted. 123 of 124 runs had passed, so a
 * transient platform stall remains a live alternative.
 *
 * This change is kept as defence in depth: it costs nothing, and it guarantees
 * the scheduled drip — which usually has nothing to publish — cannot pay for an
 * image stack it never uses. Do not describe it as the fix for that failure.
 *
 * ⚠️ Do NOT "tidy" these back into a static import. The scheduled drip usually
 * has nothing to publish, and this keeps the image stack off that path
 * entirely. The prepare/publish paths that genuinely need it pay the cost then,
 * where it belongs.
 *
 * ℹ️ Scoped to this edge deliberately: `sharp` and `next/og` are reachable only
 * through `lib/instagram/images.ts` and `lib/instagram/card.ts`, so this one
 * import is the whole connection.
 */
type ImagesModule = typeof import('./images');

async function buildRenditions(
  ...args: Parameters<ImagesModule['buildRenditions']>
): Promise<Awaited<ReturnType<ImagesModule['buildRenditions']>>> {
  return (await import('./images')).buildRenditions(...args);
}

async function deleteRenditions(
  ...args: Parameters<ImagesModule['deleteRenditions']>
): Promise<Awaited<ReturnType<ImagesModule['deleteRenditions']>>> {
  return (await import('./images')).deleteRenditions(...args);
}


/**
 * Instagram publishing state machine.
 *
 * Shape mirrors the eBay integration (prepare locally -> review -> a separate,
 * deliberate go-live) rather than Etsy's, because Instagram has no concept of a
 * remote draft: an unpublished container expires after 24 hours, so "prepare"
 * has to mean "prepared locally", not "parked remotely".
 *
 * Every step is bounded and resumable. Container ids are checkpointed as they
 * are created so a timeout mid-carousel does not orphan work or double-post.
 */

export type InstagramSyncMode = 'prepare' | 'publish';

export interface SyncStepResult {
  done: boolean;
  state: InstagramPostRow['sync_state'];
  message: string;
  permalink?: string | null;
  warnings?: string[];
}

export interface InstagramStatusCheckResult {
  checked: boolean;
  changed: boolean;
  syncState: InstagramPostRow['sync_state'] | null;
  message: string;
  reason?: 'not_recorded' | 'not_published' | 'missing_remote_id' | 'not_connected' | 'unavailable';
}

async function loadProduct(service: SupabaseClient, productId: string): Promise<Product | null> {
  const { data } = await service.from('products').select('*').eq('id', productId).maybeSingle();
  return (data as Product) ?? null;
}

async function recordError(
  service: SupabaseClient,
  productId: string,
  action: string,
  message: string,
): Promise<SyncStepResult> {
  const existing = await getPost(service, productId);
  await upsertPost(service, productId, {
    sync_state: 'error',
    last_error: message,
    error_count: (existing?.error_count ?? 0) + 1,
  });
  await insertSyncLog(service, { product_id: productId, action, outcome: 'error', message });
  return { done: true, state: 'error', message };
}

/**
 * Build renditions + caption and park the product at 'review'.
 *
 * Nothing is sent to Instagram here. Re-running replaces the previous
 * renditions (and deletes the old objects) so an edited product always
 * previews what would actually publish.
 */
export async function runPrepareStep(
  service: SupabaseClient,
  productId: string,
  captionOpeningCandidate?: unknown,
  captionTemplateCandidate?: string,
): Promise<SyncStepResult> {
  const product = await loadProduct(service, productId);
  if (!product) return recordError(service, productId, 'prepare', 'Product not found.');

  const connection = await getConnection(service);
  const spotData = await fetchSpotData();
  const existingForLineup = await getPost(service, productId);
  const captionTemplate = captionTemplateCandidate?.trim() || null;
  const opening = captionTemplate
    ? extractSocialCaptionOpening(captionTemplate, product)
    : captionOpeningCandidate === undefined
      ? fallbackSocialCaptionOpening(product)
      : validateEditedSocialCaptionOpening(captionOpeningCandidate, product);
  if (!opening) {
    return recordError(
      service,
      productId,
      'prepare',
      'The opening must be one short sentence without “our,” links, hashtags, inventory numbers, quotes, or an unavailable-item claim.',
    );
  }

  const post = buildInstagramPost({
    product,
    spotData,
    captionOpening: opening,
    imageSelection: existingForLineup?.image_selection ?? null,
    settings: {
      includePrice: connection?.caption_include_price ?? true,
      spanishLine: connection?.caption_spanish_line ?? true,
      cta: connection?.caption_cta ?? undefined,
      baseHashtags: connection?.base_hashtags?.length ? connection.base_hashtags : undefined,
    },
  });

  if (post.blockedReason) {
    return recordError(service, productId, 'prepare', post.blockedReason);
  }
  const preparedCaption = captionTemplate
    ? adaptSocialCaptionForTarget(captionTemplate, post.caption)
    : post.caption;

  const existing = existingForLineup;

  try {
    const { renditions, warnings: renditionWarnings } = await buildRenditions({
      service,
      productId,
      imageUrls: post.imageUrls,
      crops: existing?.image_crops ?? null,
      card: post.cardContent,
      cardSourceUrl: existing?.card_source_url ?? null,
      cardBackground: existing?.card_background ?? null,
    });
    const warnings = [
      ...post.warnings,
      ...renditionWarnings,
    ];

    // Replace, don't accumulate: the previous renditions are now unreferenced.
    if (existing?.rendition_paths?.length) {
      await deleteRenditions(
        service,
        existing.rendition_paths.filter((path) => !renditions.some((r) => r.path === path)),
      );
    }

    await upsertPost(service, productId, {
      sync_state: 'review',
      rendition_paths: renditions.map((r) => r.path),
      posted_caption: preparedCaption,
      posted_price: post.quotedPrice,
      content_hash: computeInstagramContentHash({ ...post, caption: preparedCaption }),
      // Any previously-created containers are void now that images changed.
      child_container_ids: [],
      carousel_container_id: null,
      container_expires_at: null,
      last_error: null,
      error_count: 0,
    });

    await insertSyncLog(service, {
      product_id: productId,
      action: 'prepare',
      outcome: warnings.length ? 'warning' : 'ok',
      message: `Prepared ${renditions.length} slide(s) for review.`,
      detail: warnings.length ? { warnings } : null,
    });

    return {
      done: true,
      state: 'review',
      message: `Prepared ${renditions.length} slide(s). Review the caption, then publish.`,
      warnings,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not prepare the post.';
    return recordError(service, productId, 'prepare', message);
  }
}

/** Containers expire after 24h; anything near that boundary is rebuilt. */
function containersUsable(row: InstagramPostRow | null): boolean {
  if (!row?.container_expires_at) return false;
  // 30-minute safety margin so we never publish a container that expires mid-call.
  return new Date(row.container_expires_at).getTime() - Date.now() > 30 * 60 * 1000;
}

/**
 * Go live. Creates containers (resuming from checkpoints when they are still
 * fresh), publishes, then verifies by reading the media back.
 */
export async function runPublishStep(
  service: SupabaseClient,
  productId: string,
): Promise<SyncStepResult> {
  const row = await getPost(service, productId);
  if (!row) return recordError(service, productId, 'publish', 'This product has not been prepared yet.');

  if (row.sync_state === 'published' && row.ig_media_id) {
    return {
      done: true,
      state: 'published',
      message: 'Already published.',
      permalink: row.permalink,
    };
  }
  if (!row.posted_caption || !row.rendition_paths?.length) {
    return recordError(service, productId, 'publish', 'Prepare this product before publishing.');
  }

  const auth = await ensureFreshAccessToken(service);
  if (!auth) {
    return recordError(
      service,
      productId,
      'publish',
      'Instagram is not connected, or the stored token needs to be replaced.',
    );
  }

  try {
    const limit = await fetchPublishingLimit(auth.igUserId, auth.accessToken);
    if (limit.used >= limit.total) {
      const message = `Instagram's 24-hour publishing limit is reached (${limit.used}/${limit.total}). Try again later.`;
      await insertSyncLog(service, { product_id: productId, action: 'publish', outcome: 'warning', message });
      return { done: false, state: row.sync_state, message };
    }

    // Public URLs for the already-uploaded renditions.
    const imageUrls = row.rendition_paths.map((path) => {
      const { data } = service.storage.from('product-images').getPublicUrl(path);
      return data.publicUrl;
    });

    let carouselContainerId = containersUsable(row) ? row.carousel_container_id : null;
    const isSingleImage = imageUrls.length === 1;

    if (!carouselContainerId) {
      await upsertPost(service, productId, { sync_state: 'publishing' });
      const expiresAt = new Date(Date.now() + INSTAGRAM_CONTAINER_TTL_MS).toISOString();

      if (isSingleImage) {
        carouselContainerId = await createImageContainer({
          igUserId: auth.igUserId,
          accessToken: auth.accessToken,
          imageUrl: imageUrls[0],
          caption: row.posted_caption,
          altText: null,
        });
      } else {
        const childIds: string[] = [];
        for (const imageUrl of imageUrls) {
          const childId = await createCarouselItemContainer({
            igUserId: auth.igUserId,
            accessToken: auth.accessToken,
            imageUrl,
          });
          childIds.push(childId);
          // Checkpoint after each child so a timeout resumes rather than restarts.
          await upsertPost(service, productId, {
            child_container_ids: childIds,
            container_expires_at: expiresAt,
          });
        }

        carouselContainerId = await createCarouselContainer({
          igUserId: auth.igUserId,
          accessToken: auth.accessToken,
          childrenIds: childIds,
          caption: row.posted_caption,
        });
      }

      await upsertPost(service, productId, {
        carousel_container_id: carouselContainerId,
        container_expires_at: expiresAt,
      });
    }

    // Meta fetches and processes each image asynchronously; publishing before
    // it finishes fails, so wait for FINISHED with a bounded number of checks.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const status = await fetchContainerStatus(carouselContainerId, auth.accessToken);
      if (status.status_code === 'FINISHED') break;
      if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
        return recordError(
          service,
          productId,
          'publish',
          `Instagram could not process the images (${status.status_code}). Re-prepare and try again.`,
        );
      }
      if (attempt === 9) {
        return {
          done: false,
          state: 'publishing',
          message: 'Instagram is still processing the images. Retry in a moment to finish publishing.',
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    const mediaId = await instagramFetch<{ id: string }>({
      path: `/${auth.igUserId}/media_publish`,
      accessToken: auth.accessToken,
      method: 'POST',
      params: { creation_id: carouselContainerId },
    }).then((res) => res.id);

    // Verify by reading it back — proof the post really exists.
    const media = await fetchMedia(mediaId, auth.accessToken).catch(() => null);

    await upsertPost(service, productId, {
      sync_state: 'published',
      ig_media_id: mediaId,
      permalink: media?.permalink ?? null,
      posted_at: new Date().toISOString(),
      queued_at: null,
      scheduled_for: null,
      child_container_ids: [],
      carousel_container_id: null,
      container_expires_at: null,
      last_error: null,
      error_count: 0,
    });

    await insertSyncLog(service, {
      product_id: productId,
      media_id: mediaId,
      action: 'publish',
      outcome: 'ok',
      message: `Published to Instagram${media?.permalink ? ` (${media.permalink})` : ''}.`,
    });
    await pruneOldSyncLogs(service);

    return {
      done: true,
      state: 'published',
      message: 'Published to Instagram.',
      permalink: media?.permalink ?? null,
    };
  } catch (err) {
    const message =
      err instanceof InstagramApiError
        ? err.operatorMessage
        : err instanceof Error
          ? err.message
          : 'Publishing failed.';
    return recordError(service, productId, 'publish', message);
  }
}

export async function runSyncStep(
  service: SupabaseClient,
  productId: string,
  mode: InstagramSyncMode,
  captionOpeningCandidate?: unknown,
): Promise<SyncStepResult> {
  return mode === 'prepare'
    ? runPrepareStep(service, productId, captionOpeningCandidate)
    : runPublishStep(service, productId);
}

/**
 * Comment the configured SOLD marker on a published post.
 *
 * Idempotent: a post that already carries the comment is left alone, so a
 * repeated status change never spams the post.
 */
export async function markPostSold(
  service: SupabaseClient,
  productId: string,
): Promise<{ commented: boolean; message: string }> {
  const connection = await getConnection(service);
  if (!connection?.sold_comment_enabled) {
    return { commented: false, message: 'Sold comments are turned off.' };
  }

  const row = await getPost(service, productId);
  if (!row?.ig_media_id || row.sync_state !== 'published') {
    return { commented: false, message: 'No published Instagram post for this product.' };
  }
  if (row.sold_comment_id) {
    return { commented: false, message: 'This post is already marked sold.' };
  }

  const auth = await ensureFreshAccessToken(service);
  if (!auth) return { commented: false, message: 'Instagram is not connected.' };

  try {
    const commentId = await createComment({
      mediaId: row.ig_media_id,
      accessToken: auth.accessToken,
      message: connection.sold_comment_text || 'SOLD',
    });
    await upsertPost(service, productId, {
      sold_comment_id: commentId,
      sold_comment_at: new Date().toISOString(),
    });
    await insertSyncLog(service, {
      product_id: productId,
      media_id: row.ig_media_id,
      action: 'sold_comment',
      outcome: 'ok',
      message: 'Commented the sold marker on the Instagram post.',
    });
    return { commented: true, message: 'Marked the Instagram post as sold.' };
  } catch (err) {
    const message =
      err instanceof InstagramApiError ? err.operatorMessage : 'Could not comment on the post.';
    await insertSyncLog(service, {
      product_id: productId,
      action: 'sold_comment',
      outcome: 'error',
      message,
    });
    return { commented: false, message };
  }
}

/** Add an owner-written comment to one currently published Instagram post. */
export async function addPostComment(
  service: SupabaseClient,
  productId: string,
  comment: string,
): Promise<{ commented: boolean; message: string; commentId?: string }> {
  const row = await getPost(service, productId);
  if (!row?.ig_media_id || row.sync_state !== 'published') {
    return { commented: false, message: 'No published Instagram post for this product.' };
  }

  const auth = await ensureFreshAccessToken(service);
  if (!auth) return { commented: false, message: 'Instagram is not connected.' };

  try {
    const commentId = await createComment({
      mediaId: row.ig_media_id,
      accessToken: auth.accessToken,
      message: comment,
    });
    await insertSyncLog(service, {
      product_id: productId,
      media_id: row.ig_media_id,
      action: 'comment',
      outcome: 'ok',
      message: 'Added an owner-written comment to the Instagram post.',
    });
    return { commented: true, commentId, message: 'Comment posted to Instagram.' };
  } catch (err) {
    const message = err instanceof InstagramApiError ? err.operatorMessage : 'Could not comment on the post.';
    await insertSyncLog(service, {
      product_id: productId,
      media_id: row.ig_media_id,
      action: 'comment',
      outcome: 'error',
      message,
    });
    return { commented: false, message };
  }
}

/**
 * Detects Meta's "this object does not support DELETE" family of responses.
 *
 * Confirmed live 2026-08-01: the Instagram API with Instagram Login provides
 * NO media-deletion endpoint. (The `instagram_manage_contents` permission that
 * can delete posts belongs to the Facebook-Login variant, which requires a
 * linked Facebook Page — an architecture we deliberately do not use.) A post
 * published through this integration can therefore only be removed by hand in
 * the Instagram app.
 */
function isUnsupportedDelete(err: unknown): boolean {
  if (!(err instanceof InstagramApiError)) return false;
  return /does not support this operation|Unsupported \w+ request/i.test(err.operatorMessage);
}

/**
 * Remove a published post.
 *
 * Attempts the API delete, but Instagram does not actually support deleting
 * media through this API. When that is the outcome the local record is left
 * INTACT — the operator still needs the permalink to find and delete the post
 * by hand — and an actionable message is returned. Use `forgetPost` afterwards
 * to clear local state.
 */
export async function deletePost(
  service: SupabaseClient,
  productId: string,
): Promise<{ deleted: boolean; manualDeleteRequired?: boolean; permalink?: string | null; message: string }> {
  const row = await getPost(service, productId);
  if (!row) return { deleted: false, message: 'No Instagram post recorded for this product.' };

  if (row.ig_media_id) {
    const auth = await ensureFreshAccessToken(service);
    if (!auth) return { deleted: false, message: 'Instagram is not connected.' };
    try {
      await instagramFetch({
        path: `/${row.ig_media_id}`,
        accessToken: auth.accessToken,
        method: 'DELETE',
      });
    } catch (err) {
      if (isUnsupportedDelete(err)) {
        const message =
          'Instagram does not allow deleting posts through its API. Open the post in the Instagram app and delete it there, then choose "Forget this post" to clear it here.';
        await insertSyncLog(service, {
          product_id: productId,
          media_id: row.ig_media_id,
          action: 'delete',
          outcome: 'warning',
          message,
        });
        return {
          deleted: false,
          manualDeleteRequired: true,
          permalink: row.permalink,
          message,
        };
      }

      const message =
        err instanceof InstagramApiError ? err.operatorMessage : 'Could not delete the post.';
      await insertSyncLog(service, {
        product_id: productId,
        action: 'delete',
        outcome: 'error',
        message,
      });
      return { deleted: false, message };
    }
  }

  await forgetPost(service, productId, 'Deleted the Instagram post and its renditions.');
  return { deleted: true, message: 'Deleted the Instagram post.' };
}

/**
 * Reconcile one locally published post against Instagram. A missing-media
 * response only becomes Removed after /me proves the account token is healthy
 * and still belongs to the same Instagram account.
 */
export async function refreshPostStatus(
  service: SupabaseClient,
  productId: string,
): Promise<InstagramStatusCheckResult> {
  const row = await getPost(service, productId);
  if (!row) {
    return {
      checked: false,
      changed: false,
      syncState: null,
      message: 'No Instagram post is recorded for this product.',
      reason: 'not_recorded',
    };
  }
  if (row.sync_state !== 'published') {
    return {
      checked: false,
      changed: false,
      syncState: row.sync_state,
      message: 'This Instagram post is not marked published, so no remote check was needed.',
      reason: 'not_published',
    };
  }
  if (!row.ig_media_id) {
    return {
      checked: false,
      changed: false,
      syncState: row.sync_state,
      message: 'The published Instagram record has no remote media id. Its status was not changed.',
      reason: 'missing_remote_id',
    };
  }

  const auth = await ensureFreshAccessToken(service);
  if (!auth) {
    return {
      checked: false,
      changed: false,
      syncState: row.sync_state,
      message: 'Instagram is not connected. Reconnect it before refreshing this status.',
      reason: 'not_connected',
    };
  }

  try {
    const remote = await fetchMedia(row.ig_media_id, auth.accessToken);
    if (remote.permalink && remote.permalink !== row.permalink) {
      await upsertPost(service, productId, { permalink: remote.permalink });
    }
    return {
      checked: true,
      changed: false,
      syncState: 'published',
      message: 'Instagram confirms this post is still published.',
    };
  } catch (err) {
    if (err instanceof InstagramApiError && err.code === 'invalid_token') {
      await markNeedsReauth(service);
    }

    if (isInstagramMediaMissingError(err)) {
      try {
        const profile = await fetchInstagramProfile(auth.accessToken);
        if (String(profile.id) === auth.igUserId) {
          const message =
            'Instagram no longer reports this post. Its local status was changed to Removed.';
          await forgetPost(service, productId, message, 'status_check');
          return { checked: true, changed: true, syncState: 'deleted', message };
        }
      } catch (profileError) {
        if (profileError instanceof InstagramApiError && profileError.code === 'invalid_token') {
          await markNeedsReauth(service);
        }
      }
    }

    const message =
      err instanceof InstagramApiError
        ? `Instagram could not confirm this post: ${err.operatorMessage}`
        : 'Instagram could not confirm this post. Its local status was not changed.';
    await insertSyncLog(service, {
      product_id: productId,
      media_id: row.ig_media_id,
      action: 'status_check',
      outcome: 'warning',
      message,
    });
    return {
      checked: false,
      changed: false,
      syncState: row.sync_state,
      message,
      reason: 'unavailable',
    };
  }
}

/**
 * Clear local state for a post and delete its renditions, without touching
 * Instagram. Used after the operator has deleted a post by hand, and by the
 * successful delete path above.
 */
export async function forgetPost(
  service: SupabaseClient,
  productId: string,
  logMessage = 'Cleared the local Instagram record; the post was removed manually.',
  logAction = 'forget',
): Promise<{ forgotten: boolean; message: string }> {
  const row = await getPost(service, productId);
  if (!row) return { forgotten: false, message: 'No Instagram post recorded for this product.' };

  await deleteRenditions(service, row.rendition_paths ?? []);
  await upsertPost(service, productId, {
    sync_state: 'deleted',
    ig_media_id: null,
    permalink: null,
    rendition_paths: [],
    child_container_ids: [],
    carousel_container_id: null,
    container_expires_at: null,
    queued_at: null,
    scheduled_for: null,
    sold_comment_id: null,
    sold_comment_at: null,
  });
  await insertSyncLog(service, {
    product_id: productId,
    action: logAction,
    outcome: 'ok',
    message: logMessage,
  });

  return { forgotten: true, message: logMessage };
}

/**
 * Discard a prepared-but-unpublished upload: delete the rendition files and
 * clear the prepared caption, price, hash, containers, and queue entry — while
 * KEEPING the operator's curation (lineup, crops, card source/background).
 * Changing your mind must not cost the curation work; a later Prepare rebuilds
 * the draft in one click. Refuses on published posts (that is Remove's job)
 * and while a publish is in flight (discarding mid-publish would race the
 * container flow).
 */
export async function discardPrepared(
  service: SupabaseClient,
  productId: string,
): Promise<{ discarded: boolean; message: string }> {
  const row = await getPost(service, productId);
  if (!row || (!row.rendition_paths?.length && !row.posted_caption && !row.queued_at)) {
    return { discarded: false, message: 'There is no prepared upload to discard.' };
  }
  if (row.sync_state === 'published') {
    return { discarded: false, message: 'This post is live — use Remove post instead of discarding.' };
  }
  if (row.sync_state === 'publishing') {
    return {
      discarded: false,
      message: 'A publish is in flight; wait for it to finish (or fail) before discarding.',
    };
  }

  await deleteRenditions(service, row.rendition_paths ?? []);
  await upsertPost(service, productId, {
    sync_state: 'pending',
    rendition_paths: [],
    posted_caption: null,
    posted_price: null,
    content_hash: null,
    child_container_ids: [],
    carousel_container_id: null,
    container_expires_at: null,
    queued_at: null,
    scheduled_for: null,
    last_error: null,
    error_count: 0,
  });
  await insertSyncLog(service, {
    product_id: productId,
    action: 'discard',
    outcome: 'ok',
    message: 'Discarded the prepared upload; lineup, crops and card choices were kept.',
  });

  return {
    discarded: true,
    message: 'Discarded. Your lineup and card choices were kept — Prepare rebuilds the draft any time.',
  };
}

/**
 * Scheduled runner: publish the next bounded batch of due, approved posts.
 * Future posts and legacy rows without a scheduled time stay untouched. The
 * batch bound protects one worker invocation; it is not a per-day limit.
 */
export async function runScheduledDrip(service: SupabaseClient): Promise<{
  published: number;
  skipped: number;
  /** Due rows this run declined to start, to stay inside the platform ceiling. */
  deferred: number;
  message: string;
}> {
  const connection = await getConnection(service);
  if (connection?.status !== 'connected') {
    // Log the skip too. This path used to return silently, which means a
    // disconnected channel and a worker that never runs at all look identical
    // in the log — the exact ambiguity that hid the dead Netlify schedules for
    // weeks (see DECISIONS, "An absent record is a fault, not a clean slate").
    const message = 'Scheduled queue check skipped because Instagram is not connected.';
    await insertSyncLog(service, { action: 'scheduled_drip', outcome: 'warning', message });
    return { published: 0, skipped: 0, deferred: 0, message };
  }

  const { data: queued } = await service
    .from('instagram_posts')
    .select('*')
    .in('sync_state', ['pending', 'review'])
    .not('queued_at', 'is', null)
    .not('scheduled_for', 'is', null)
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .order('queued_at', { ascending: true })
    .limit(SOCIAL_SCHEDULED_DRIP_BATCH_SIZE);

  const budget = createDripBudget();
  const rows = (queued as InstagramPostRow[]) ?? [];
  let published = 0;
  let skipped = 0;
  let deferred = 0;

  for (let index = 0; index < rows.length; index += 1) {
    // Refuse to START a row that cannot finish inside the platform ceiling.
    // Whatever is left is simply picked up by the next hourly run — the queue
    // drains a little slower instead of the whole job going red and publishing
    // nothing further. See createDripBudget for why this is not `elapsed >
    // budget`.
    if (budget.exhausted(published + skipped)) {
      deferred = rows.length - index;
      break;
    }

    // Publishing changes no storefront data, so there is deliberately no
    // shop-cache revalidation here.
    const rowStartedAt = Date.now();
    const result = await runPublishStep(service, rows[index].product_id);
    budget.record(Date.now() - rowStartedAt);

    if (result.state === 'published') published += 1;
    else skipped += 1;
  }

  const message =
    `Scheduled queue check complete: ${published} published, ${skipped} skipped` +
    (deferred > 0
      ? `, ${deferred} deferred to the next run after ${budget.elapsedMs()}ms.`
      : '.');
  await insertSyncLog(service, {
    action: 'scheduled_drip',
    outcome: skipped > 0 && published === 0 ? 'warning' : 'ok',
    message,
  });

  return { published, skipped, deferred, message };
}
