// Admin listing editor → "choose from library": how photos are prepared, and
// the one message the owner sees afterwards.
//
// Why the message counts what was RECEIVED (owner, 2026-10-25, iPad: "some are
// left out and skipped"): two different things can lose a photo, and only the
// count tells them apart.
//   - iPadOS's photo picker hands the page only the photos it has ready. Tapping
//     its ✓ while it is still grey (originals still downloading from iCloud) can
//     leave some behind — the page never sees them.
//   - The page itself used to stop partway on iPad (canvas memory), dropping the
//     rest without a word. Fixed: every photo is released before the next, and
//     a photo that still fails is NAMED here.
// So "Received 3 photos" after picking 4 = the picker kept one back;
// "Received 4 · 3 added" = the page could not add one, and says which.

import type { LeadPhotoTier } from './lead-photo-prep';

/** 2048px longest edge (the site's upload rule); high quality, since the server re-encodes to WebP. */
export const LISTING_PHOTO_TIER: LeadPhotoTier = { maxEdge: 2048, quality: 0.92 };

export type ListingPhotoUploadResult = {
  /** Photos the picker (or a drop) handed to the page. */
  received: number;
  added: number;
  /** File names of photos that could not be prepared or uploaded. */
  failed: readonly string[];
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
    const names = result.failed.join(', ');
    parts.push(`Couldn't add ${names} — try ${result.failed.length === 1 ? 'it' : 'them'} again`);
  }
  if (result.overLimit > 0) {
    parts.push(`${plural(result.overLimit, 'photo')} left out: only room for ${result.availableSlots} more (20 max)`);
  }
  if (result.oversized > 0) {
    parts.push(`${plural(result.oversized, 'photo')} over 25 MB left out`);
  }
  return `${parts.join(' · ')}.`;
}
