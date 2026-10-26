// Admin listing editor → "choose from library": how photos are prepared and
// uploaded, and the one message the owner sees afterwards.
//
// Why the message counts what was RECEIVED (owner, 2026-10-25, iPad: "some are
// left out and skipped"): two different things can lose a photo, and only the
// count tells them apart.
//   - iPadOS's photo picker hands the page only the photos it has ready.
//   - The page itself can fail to read or shrink a photo. Storage proved this
//     one on 2026-10-25: in two 14-photo batches exactly 13 reached the server,
//     both times the 2nd photo, and the same photo went in fine moments later.
// So "Received 3 photos" after picking 4 = the picker kept one back;
// "Received 4 · 3 added" = the page could not add one, and names it with why.
//
// A photo that fails is retried at the END of the batch after a pause (what
// worked for the owner), and on that retry, if the browser still cannot shrink
// it, the original file is sent when it is small enough (the server re-encodes
// to WebP either way). Only then is it reported — with a Try again button.

import type { LeadPhotoTier } from './lead-photo-prep';

/** 2048px longest edge (the site's upload rule); high quality, since the server re-encodes to WebP. */
export const LISTING_PHOTO_TIER: LeadPhotoTier = { maxEdge: 2048, quality: 0.92 };

/** Pause before the end-of-batch retry. 0.4 s in place was not enough on the iPad. */
export const LISTING_PHOTO_RETRY_PAUSE_MS = 2000;

/**
 * Largest original sent as-is when the browser cannot shrink it. The route
 * takes 5 MB; Netlify base64-encodes a binary body (~33%) under its 6 MB
 * request cap, so ~4.5 MB is the real ceiling. 4 MB leaves headroom.
 */
export const LISTING_PHOTO_ORIGINAL_MAX_BYTES = 4 * 1024 * 1024;

/** Types the server's encoder reads for certain. */
const ORIGINAL_FALLBACK_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type ListingPhotoFailure = { file: File; reason: string };

export type ListingPhotoUploadDeps = {
  /** Downsize in the browser (`shrinkPhotoFile` with LISTING_PHOTO_TIER). */
  shrink: (file: File) => Promise<Blob>;
  /** POST to /api/admin/product-images; never throws for a server refusal. */
  upload: (blob: Blob) => Promise<{ url: string } | { error: string }>;
  /**
   * Called the moment a photo lands, so the editor shows it right away.
   * `index` = its place in the batch as picked, so a photo that lands late (the
   * end-of-batch retry) can go back into its spot (`insertBatchPhoto`).
   */
  onAdded: (url: string, index: number) => void;
  /** Overridable for tests. */
  wait?: (ms: number) => Promise<void>;
};

function shortError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.trim().slice(0, 80);
}

export function canSendOriginal(file: File): boolean {
  return file.size > 0 && file.size <= LISTING_PHOTO_ORIGINAL_MAX_BYTES && ORIGINAL_FALLBACK_TYPES.has(file.type);
}

async function attempt(
  file: File,
  deps: ListingPhotoUploadDeps,
  allowOriginal: boolean,
): Promise<{ url: string } | { reason: string }> {
  let prepared: Blob;
  try {
    prepared = await deps.shrink(file);
  } catch (error) {
    if (!(allowOriginal && canSendOriginal(file))) {
      const detail = shortError(error);
      return { reason: `this device could not read it${detail ? ` (${detail})` : ''}` };
    }
    prepared = file;
  }
  try {
    const result = await deps.upload(prepared);
    return 'url' in result ? result : { reason: result.error };
  } catch (error) {
    return { reason: shortError(error) || 'the upload failed' };
  }
}

/**
 * Upload a batch one photo at a time. Failures are retried once at the end,
 * after `LISTING_PHOTO_RETRY_PAUSE_MS`, with the original-file fallback; what
 * still fails is returned with a reason. Never throws.
 */
export async function uploadListingPhotos(
  files: readonly File[],
  deps: ListingPhotoUploadDeps,
): Promise<{ added: number; failed: ListingPhotoFailure[] }> {
  const wait = deps.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let added = 0;
  const retry: number[] = [];

  for (const [index, file] of files.entries()) {
    const result = await attempt(file, deps, false);
    if ('url' in result) {
      added++;
      deps.onAdded(result.url, index);
    } else {
      retry.push(index);
    }
  }

  const failed: ListingPhotoFailure[] = [];
  if (retry.length > 0) {
    await wait(LISTING_PHOTO_RETRY_PAUSE_MS);
    for (const index of retry) {
      const file = files[index];
      const result = await attempt(file, deps, true);
      if ('url' in result) {
        added++;
        deps.onAdded(result.url, index);
      } else {
        failed.push({ file, reason: result.reason });
      }
    }
  }

  return { added, failed };
}

/**
 * Put a batch photo into the listing's photo list at ITS place in the batch,
 * not at the end (owner, 2026-10-25: a retried photo should "insert in where
 * it was supposed to go instead of as the last photo"). `batchUrls[i]` = the
 * URL of the batch's i-th photo once it landed, else null.
 *
 * Anchored to the batch's own photos, never a fixed position, so it stays right
 * even if a photo is removed or dragged while the batch is still uploading:
 * after the nearest EARLIER batch photo still in the list; else before the
 * nearest LATER one (so a retried first photo becomes the cover again, when it
 * was meant to be); else at the end.
 */
export function insertBatchPhoto(
  images: readonly string[],
  url: string,
  index: number,
  batchUrls: readonly (string | null)[],
): string[] {
  for (let j = index - 1; j >= 0; j--) {
    const at = batchUrls[j] ? images.indexOf(batchUrls[j]!) : -1;
    if (at >= 0) return [...images.slice(0, at + 1), url, ...images.slice(at + 1)];
  }
  for (let j = index + 1; j < batchUrls.length; j++) {
    const at = batchUrls[j] ? images.indexOf(batchUrls[j]!) : -1;
    if (at >= 0) return [...images.slice(0, at), url, ...images.slice(at)];
  }
  return [...images, url];
}

export type ListingPhotoUploadResult = {
  /** Photos the picker (or a drop) handed to the page. */
  received: number;
  added: number;
  /** Photos that could not be added, each with why. */
  failed: readonly { name: string; reason: string }[];
  /** Photos left out because the listing ran out of its 20 slots. */
  overLimit: number;
  /** Photos left out for being over 25 MB. */
  oversized: number;
  /** Slots that were free before this batch. */
  availableSlots: number;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function listingPhotoUploadSummary(result: ListingPhotoUploadResult): string {
  const parts = [`Received ${plural(result.received, 'photo')}`, `${result.added} added`];
  if (result.failed.length > 0) {
    const names = result.failed.map((f) => `${f.name || 'photo'} (${f.reason})`).join(', ');
    parts.push(`Couldn't add ${names}`);
  }
  if (result.overLimit > 0) {
    parts.push(`${plural(result.overLimit, 'photo')} left out: only room for ${result.availableSlots} more (20 max)`);
  }
  if (result.oversized > 0) {
    parts.push(`${plural(result.oversized, 'photo')} over 25 MB left out`);
  }
  return `${parts.join(' · ')}.`;
}
