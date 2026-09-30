import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createDripBudget, SOCIAL_SCHEDULED_DRIP_BATCH_SIZE } from '@/lib/social-queue-schedule';
import type { Product } from '@/types/product';
import { fetchSpotData } from '@/lib/spot-price';
import { getSiteUrl } from '@/lib/order-email-branding';
import {
  FACEBOOK_PHOTO_TTL_MS,
  FacebookApiError,
  createComment,
  createFeedPost,
  createUnpublishedPhoto,
  deleteFacebookPost,
  facebookPostReadCandidates,
  fetchRecentPagePosts,
  fetchPageProfile,
  fetchPost,
  findSingleRecentFacebookPostByExactMessage,
  isFacebookPhotoAlreadyPostedError,
  isFacebookPostMissingError,
  isFacebookPostReadPermissionError,
  verifyPagePostReadAccess,
} from './client';
import { ensurePageAccessToken, markNeedsReauth } from './auth';
import { buildFacebookPost, computeFacebookContentHash } from './mapping';
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
  type FacebookPostRow,
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

async function buildFacebookRenditions(
  ...args: Parameters<ImagesModule['buildFacebookRenditions']>
): Promise<Awaited<ReturnType<ImagesModule['buildFacebookRenditions']>>> {
  return (await import('./images')).buildFacebookRenditions(...args);
}

async function deleteRenditions(
  ...args: Parameters<ImagesModule['deleteRenditions']>
): Promise<Awaited<ReturnType<ImagesModule['deleteRenditions']>>> {
  return (await import('./images')).deleteRenditions(...args);
}


/**
 * Facebook publishing state machine — same states and operator flow as
 * Instagram's (prepare locally -> review -> a separate, deliberate go-live),
 * with a simpler publish step: no container polling, and unpublished photos are
 * created synchronously.
 *
 * Every step is bounded and resumable. Photo ids are checkpointed as they are
 * created so a timeout mid-upload resumes rather than re-uploading, and stale
 * checkpoints (unpublished photos live ~24h) are discarded rather than
 * published blind.
 */

export type FacebookSyncMode = 'prepare' | 'publish';

export interface SyncStepResult {
  done: boolean;
  state: FacebookPostRow['sync_state'];
  message: string;
  permalink?: string | null;
  warnings?: string[];
}

export interface FacebookStatusCheckResult {
  checked: boolean;
  changed: boolean;
  syncState: FacebookPostRow['sync_state'] | null;
  message: string;
  reason?: 'not_recorded' | 'not_published' | 'missing_remote_id' | 'not_connected' | 'permission' | 'unavailable';
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

/** On a token rejection, flip the connection to needs_reauth as well. */
async function recordAuthError(
  service: SupabaseClient,
  productId: string,
  action: string,
  err: FacebookApiError,
): Promise<SyncStepResult> {
  await markNeedsReauth(service);
  return recordError(
    service,
    productId,
    action,
    `${err.operatorMessage} Paste a fresh Page token in Admin → Settings → Facebook.`,
  );
}

/**
 * Build renditions + post text and park the product at 'review'.
 *
 * Nothing is sent to Facebook here. Re-running replaces the previous
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
  const existing = await getPost(service, productId);
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

  const post = buildFacebookPost({
    product,
    spotData,
    siteUrl: getSiteUrl(),
    captionOpening: opening,
    imageSelection: existing?.image_selection ?? null,
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
  const preparedMessage = captionTemplate
    ? adaptSocialCaptionForTarget(captionTemplate, post.message)
    : post.message;

  try {
    const { renditions, warnings: renditionWarnings } = await buildFacebookRenditions({
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
      posted_caption: preparedMessage,
      posted_price: post.quotedPrice,
      content_hash: computeFacebookContentHash({ ...post, message: preparedMessage }),
      // Any previously-created unpublished photos are void now that images changed.
      photo_ids: [],
      photos_expire_at: null,
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
      message: `Prepared ${renditions.length} slide(s). Review the post text, then publish.`,
      warnings,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not prepare the post.';
    return recordError(service, productId, 'prepare', message);
  }
}

/** Unpublished photos live ~24h; anything near that boundary is rebuilt. */
function photosUsable(row: FacebookPostRow | null): boolean {
  if (!row?.photos_expire_at || !row.photo_ids?.length) return false;
  // 30-minute safety margin so we never attach a photo that expires mid-call.
  return new Date(row.photos_expire_at).getTime() - Date.now() > 30 * 60 * 1000;
}

/** The unpublished-photo checkpoint begins one TTL before its saved expiry. */
function photoCheckpointStartedAt(row: FacebookPostRow): Date {
  const expiryMs = row.photos_expire_at ? new Date(row.photos_expire_at).getTime() : Number.NaN;
  return new Date(
    Number.isFinite(expiryMs)
      ? expiryMs - FACEBOOK_PHOTO_TTL_MS - 60_000
      : Date.now() - 2 * 60 * 60 * 1000,
  );
}

async function savePublishedPost(params: {
  service: SupabaseClient;
  productId: string;
  postId: string;
  permalink: string | null;
  recovered: boolean;
  postedAt?: string | null;
}): Promise<SyncStepResult> {
  await upsertPost(params.service, params.productId, {
    sync_state: 'published',
    fb_post_id: params.postId,
    permalink: params.permalink,
    posted_at: params.postedAt ? new Date(params.postedAt).toISOString() : new Date().toISOString(),
    queued_at: null,
    scheduled_for: null,
    photo_ids: [],
    photos_expire_at: null,
    last_error: null,
    error_count: 0,
  });

  await insertSyncLog(params.service, {
    product_id: params.productId,
    post_id: params.postId,
    action: 'publish',
    outcome: 'ok',
    message: params.recovered
      ? `Recovered the Facebook post after the remote publish completed (${params.permalink ?? params.postId}).`
      : `Published to Facebook${params.permalink ? ` (${params.permalink})` : ''}.`,
  });
  await pruneOldSyncLogs(params.service);

  return {
    done: true,
    state: 'published',
    message: params.recovered ? 'Facebook post found and marked Published.' : 'Published to Facebook.',
    permalink: params.permalink,
  };
}

async function recoverPublishedPost(
  service: SupabaseClient,
  productId: string,
  row: FacebookPostRow,
  auth: { pageId: string; accessToken: string },
): Promise<SyncStepResult | null> {
  if (!row.posted_caption || !row.photo_ids?.length) return null;
  const since = photoCheckpointStartedAt(row);
  const recentPosts = await fetchRecentPagePosts({
    pageId: auth.pageId,
    accessToken: auth.accessToken,
    since,
  });
  const match = findSingleRecentFacebookPostByExactMessage(recentPosts, row.posted_caption, since);
  if (!match) return null;
  return savePublishedPost({
    service,
    productId,
    postId: match.id,
    permalink: match.permalink_url ?? null,
    recovered: true,
    postedAt: match.created_time ?? null,
  });
}

/**
 * Go live. Uploads unpublished photos (resuming from checkpoints when fresh),
 * creates the feed post, then verifies by reading it back.
 */
export async function runPublishStep(
  service: SupabaseClient,
  productId: string,
): Promise<SyncStepResult> {
  const row = await getPost(service, productId);
  if (!row) return recordError(service, productId, 'publish', 'This product has not been prepared yet.');

  if (row.sync_state === 'published' && row.fb_post_id) {
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

  const auth = await ensurePageAccessToken(service);
  if (!auth) {
    return recordError(
      service,
      productId,
      'publish',
      'Facebook is not connected, or the stored token needs to be replaced.',
    );
  }

  try {
    // If Meta completed an earlier feed request but the server stopped before
    // its local commit, the photo checkpoint remains. Recover that one exact
    // Page post before attempting another public write.
    if (row.photo_ids?.length) {
      const recovered = await recoverPublishedPost(service, productId, row, auth).catch(() => null);
      if (recovered) return recovered;
      if (isFacebookPhotoAlreadyPostedError(row.last_error)) {
        return recordError(
          service,
          productId,
          'publish',
          'Facebook says these prepared photos were already posted, but the matching Page post could not be verified automatically.',
        );
      }
    }

    // Public URLs for the already-uploaded renditions.
    const imageUrls = row.rendition_paths.map((path) => {
      const { data } = service.storage.from('product-images').getPublicUrl(path);
      return data.publicUrl;
    });

    let photoIds = photosUsable(row) ? row.photo_ids : [];

    if (photoIds.length < imageUrls.length) {
      await upsertPost(service, productId, { sync_state: 'publishing' });
      const expiresAt = new Date(Date.now() + FACEBOOK_PHOTO_TTL_MS).toISOString();

      // Resume from however many photos a previous attempt got through.
      for (let index = photoIds.length; index < imageUrls.length; index += 1) {
        const photoId = await createUnpublishedPhoto({
          pageId: auth.pageId,
          accessToken: auth.accessToken,
          imageUrl: imageUrls[index],
        });
        photoIds = [...photoIds, photoId];
        // Checkpoint after each photo so a timeout resumes rather than restarts.
        await upsertPost(service, productId, {
          photo_ids: photoIds,
          photos_expire_at: expiresAt,
        });
      }
    }

    const postId = await createFeedPost({
      pageId: auth.pageId,
      accessToken: auth.accessToken,
      message: row.posted_caption,
      photoIds,
    });

    // Commit Meta's receipt immediately. Permalink lookup is useful but must not
    // sit between a successful public write and the durable local state change.
    await upsertPost(service, productId, {
      sync_state: 'published',
      fb_post_id: postId,
      permalink: null,
      posted_at: new Date().toISOString(),
      queued_at: null,
      scheduled_for: null,
      photo_ids: [],
      photos_expire_at: null,
      last_error: null,
      error_count: 0,
    });

    // Verify by reading it back — proof the post really exists.
    const post = await fetchPost(postId, auth.accessToken).catch(() => null);

    if (post?.permalink_url) {
      // The durable receipt above is authoritative. A best-effort permalink
      // enrichment must never turn a real public post back into an error state.
      await upsertPost(service, productId, { permalink: post.permalink_url }).catch(() => null);
    }

    await insertSyncLog(service, {
      product_id: productId,
      post_id: postId,
      action: 'publish',
      outcome: 'ok',
      message: `Published to Facebook${post?.permalink_url ? ` (${post.permalink_url})` : ''}.`,
    });
    await pruneOldSyncLogs(service);

    return {
      done: true,
      state: 'published',
      message: 'Published to Facebook.',
      permalink: post?.permalink_url ?? null,
    };
  } catch (err) {
    if (err instanceof FacebookApiError && err.code === 'invalid_token') {
      return recordAuthError(service, productId, 'publish', err);
    }
    if (isFacebookPhotoAlreadyPostedError(err)) {
      const latest = await getPost(service, productId);
      if (latest) {
        const recovered = await recoverPublishedPost(service, productId, latest, auth).catch(() => null);
        if (recovered) return recovered;
      }
    }
    const message =
      err instanceof FacebookApiError
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
  mode: FacebookSyncMode,
  captionOpeningCandidate?: unknown,
): Promise<SyncStepResult> {
  return mode === 'prepare'
    ? runPrepareStep(service, productId, captionOpeningCandidate)
    : runPublishStep(service, productId);
}

/**
 * Comment the configured SOLD marker on a published post. Idempotent: a post
 * that already carries the comment is left alone.
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
  if (!row?.fb_post_id || row.sync_state !== 'published') {
    return { commented: false, message: 'No published Facebook post for this product.' };
  }
  if (row.sold_comment_id) {
    return { commented: false, message: 'This post is already marked sold.' };
  }

  const auth = await ensurePageAccessToken(service);
  if (!auth) return { commented: false, message: 'Facebook is not connected.' };

  try {
    const commentId = await createComment({
      postId: row.fb_post_id,
      accessToken: auth.accessToken,
      message: connection.sold_comment_text || 'SOLD',
    });
    await upsertPost(service, productId, {
      sold_comment_id: commentId,
      sold_comment_at: new Date().toISOString(),
    });
    await insertSyncLog(service, {
      product_id: productId,
      post_id: row.fb_post_id,
      action: 'sold_comment',
      outcome: 'ok',
      message: 'Commented the sold marker on the Facebook post.',
    });
    return { commented: true, message: 'Marked the Facebook post as sold.' };
  } catch (err) {
    const message =
      err instanceof FacebookApiError ? err.operatorMessage : 'Could not comment on the post.';
    await insertSyncLog(service, {
      product_id: productId,
      action: 'sold_comment',
      outcome: 'error',
      message,
    });
    return { commented: false, message };
  }
}

/** Add an owner-written comment to one currently published Facebook post. */
export async function addPostComment(
  service: SupabaseClient,
  productId: string,
  comment: string,
): Promise<{ commented: boolean; message: string; commentId?: string }> {
  const row = await getPost(service, productId);
  if (!row?.fb_post_id || row.sync_state !== 'published') {
    return { commented: false, message: 'No published Facebook post for this product.' };
  }

  const auth = await ensurePageAccessToken(service);
  if (!auth) return { commented: false, message: 'Facebook is not connected.' };

  try {
    const commentId = await createComment({
      postId: row.fb_post_id,
      accessToken: auth.accessToken,
      message: comment,
    });
    await insertSyncLog(service, {
      product_id: productId,
      post_id: row.fb_post_id,
      action: 'comment',
      outcome: 'ok',
      message: 'Added an owner-written comment to the Facebook post.',
    });
    return { commented: true, commentId, message: 'Comment posted to Facebook.' };
  } catch (err) {
    const message = err instanceof FacebookApiError ? err.operatorMessage : 'Could not comment on the post.';
    await insertSyncLog(service, {
      product_id: productId,
      post_id: row.fb_post_id,
      action: 'comment',
      outcome: 'error',
      message,
    });
    return { commented: false, message };
  }
}

/**
 * Remove a published post. Unlike Instagram, Facebook's API genuinely supports
 * this, so there is no manual-delete detour: the post is deleted remotely, then
 * local state and renditions are cleared.
 */
export async function deletePost(
  service: SupabaseClient,
  productId: string,
): Promise<{ deleted: boolean; message: string }> {
  const row = await getPost(service, productId);
  if (!row) return { deleted: false, message: 'No Facebook post recorded for this product.' };

  if (row.fb_post_id) {
    const auth = await ensurePageAccessToken(service);
    if (!auth) return { deleted: false, message: 'Facebook is not connected.' };
    try {
      await deleteFacebookPost(row.fb_post_id, auth.accessToken);
    } catch (err) {
      if (err instanceof FacebookApiError && err.code === 'invalid_token') {
        await markNeedsReauth(service);
      }
      const message =
        err instanceof FacebookApiError ? err.operatorMessage : 'Could not delete the post.';
      await insertSyncLog(service, {
        product_id: productId,
        post_id: row.fb_post_id,
        action: 'delete',
        outcome: 'error',
        message,
      });
      return { deleted: false, message };
    }
  }

  await forgetPost(service, productId, 'Deleted the Facebook post and its renditions.');
  return { deleted: true, message: 'Deleted the Facebook post.' };
}

/**
 * Reconcile one locally published post against Facebook.
 *
 * A missing-object response is not trusted by itself: Meta uses the same
 * wording for some permission failures. We only clear local state after /me
 * proves the stored Page token is valid and still belongs to the same Page.
 */
export async function refreshPostStatus(
  service: SupabaseClient,
  productId: string,
): Promise<FacebookStatusCheckResult> {
  const row = await getPost(service, productId);
  if (!row) {
    return {
      checked: false,
      changed: false,
      syncState: null,
      message: 'No Facebook post is recorded for this product.',
      reason: 'not_recorded',
    };
  }
  if (row.sync_state !== 'published') {
    return {
      checked: false,
      changed: false,
      syncState: row.sync_state,
      message: 'This Facebook post is not marked published, so no remote check was needed.',
      reason: 'not_published',
    };
  }
  if (!row.fb_post_id) {
    return {
      checked: false,
      changed: false,
      syncState: row.sync_state,
      message: 'The published Facebook record has no remote post id. Its status was not changed.',
      reason: 'missing_remote_id',
    };
  }

  const auth = await ensurePageAccessToken(service);
  if (!auth) {
    return {
      checked: false,
      changed: false,
      syncState: row.sync_state,
      message: 'Facebook is not connected. Reconnect it before refreshing this status.',
      reason: 'not_connected',
    };
  }

  let err: unknown;
  for (const candidateId of facebookPostReadCandidates(row.fb_post_id, row.permalink)) {
    try {
      const remote = await fetchPost(candidateId, auth.accessToken);
      const postPatch: Partial<FacebookPostRow> = {};
      if (candidateId !== row.fb_post_id) postPatch.fb_post_id = candidateId;
      if (remote.permalink_url && remote.permalink_url !== row.permalink) {
        postPatch.permalink = remote.permalink_url;
      }
      if (Object.keys(postPatch).length > 0) {
        await upsertPost(service, productId, postPatch);
      }
      return {
        checked: true,
        changed: false,
        syncState: 'published',
        message: 'Facebook confirms this post is still published.',
      };
    } catch (candidateError) {
      err = candidateError;
      if (
        !isFacebookPostMissingError(candidateError) &&
        !isFacebookPostReadPermissionError(candidateError)
      ) {
        break;
      }
    }
  }

  try {
    if (err instanceof FacebookApiError && err.code === 'invalid_token') {
      await markNeedsReauth(service);
    }

    if (isFacebookPostMissingError(err)) {
      try {
        const [page] = await Promise.all([
          fetchPageProfile(auth.accessToken),
          verifyPagePostReadAccess(auth.pageId, auth.accessToken),
        ]);
        if (String(page.id) === auth.pageId && page.category) {
          const message =
            'Facebook no longer reports this post. Its local status was changed to Removed.';
          await forgetPost(service, productId, message, 'status_check');
          return { checked: true, changed: true, syncState: 'deleted', message };
        }
      } catch (profileError) {
        if (profileError instanceof FacebookApiError && profileError.code === 'invalid_token') {
          await markNeedsReauth(service);
        }
      }
    }

    const message = isFacebookPostReadPermissionError(err)
      ? 'Facebook cannot verify published posts with the current Page token. Reconnect Facebook with pages_read_engagement, or use “Already removed on Facebook” if you deleted this post manually.'
      : err instanceof FacebookApiError
        ? `Facebook could not confirm this post: ${err.operatorMessage}`
        : 'Facebook could not confirm this post. Its local status was not changed.';
    await insertSyncLog(service, {
      product_id: productId,
      post_id: row.fb_post_id,
      action: 'status_check',
      outcome: 'warning',
      message,
    });
    return {
      checked: false,
      changed: false,
      syncState: row.sync_state,
      message,
      reason: isFacebookPostReadPermissionError(err) ? 'permission' : 'unavailable',
    };
  } catch (unexpectedError) {
    const message =
      unexpectedError instanceof FacebookApiError
        ? `Facebook could not confirm this post: ${unexpectedError.operatorMessage}`
        : 'Facebook could not confirm this post. Its local status was not changed.';
    await insertSyncLog(service, {
      product_id: productId,
      post_id: row.fb_post_id,
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
 * Facebook. Used by the delete path above, and directly when the operator
 * removed the post by hand on Facebook.
 */
export async function forgetPost(
  service: SupabaseClient,
  productId: string,
  logMessage = 'Cleared the local Facebook record.',
  logAction = 'forget',
): Promise<{ forgotten: boolean; message: string }> {
  const row = await getPost(service, productId);
  if (!row) return { forgotten: false, message: 'No Facebook post recorded for this product.' };

  await deleteRenditions(service, row.rendition_paths ?? []);
  await upsertPost(service, productId, {
    sync_state: 'deleted',
    fb_post_id: null,
    permalink: null,
    rendition_paths: [],
    photo_ids: [],
    photos_expire_at: null,
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
 * clear the prepared post text, price, hash, staged photos, and queue entry —
 * while KEEPING the operator's curation (lineup, crops, card
 * source/background). Mirrors the Instagram discard; see its docblock for the
 * rationale and the published/publishing guards.
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
    photo_ids: [],
    photos_expire_at: null,
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
 * Drip runner: publish the next bounded batch from the approved due queue,
 * earliest scheduled time first. The batch bound protects one worker
 * invocation; it is not a per-day limit. Only admin-approved rows qualify.
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
    const message = 'Scheduled queue check skipped because Facebook is not connected.';
    await insertSyncLog(service, { action: 'scheduled_drip', outcome: 'warning', message });
    return { published: 0, skipped: 0, deferred: 0, message };
  }

  const { data: queued } = await service
    .from('facebook_posts')
    .select('*')
    .in('sync_state', ['pending', 'review'])
    .not('queued_at', 'is', null)
    .not('scheduled_for', 'is', null)
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .order('queued_at', { ascending: true })
    .limit(SOCIAL_SCHEDULED_DRIP_BATCH_SIZE);

  const budget = createDripBudget();
  const rows = (queued as FacebookPostRow[]) ?? [];
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
