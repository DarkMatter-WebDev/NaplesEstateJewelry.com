/**
 * The seller's thumbprint on a buy receipt (owner, 2026-10-06).
 *
 * The reader is a SecuGen Hamster Pro 20. SecuGen's own browser API is licensed
 * per site address, so the print comes in through the free "Device Diagnostic
 * Utility" instead: the owner captures there and uses File → Save Image (BMP).
 * The receipt form WATCHES the folder that file is saved into and attaches the
 * new print by itself ("Wait for a print"); "Choose a file" is the same thing
 * by hand, and the only way on a browser that cannot watch a folder (the iPad).
 *
 * This file is the part that needs no browser: which file in the folder is the
 * print that was just saved. The watching itself is in `ThumbprintField.tsx`.
 */

/** How often the watched folder is looked at. */
export const THUMBPRINT_WATCH_EVERY_MS = 1_000;
/** A wait nobody finished stops by itself. */
export const THUMBPRINT_WATCH_GIVE_UP_MS = 10 * 60_000;
/**
 * Longest edge kept. The reader's own picture is 300 × 400; this only matters
 * for a chosen file (a phone photo of an inked print), which is scaled DOWN to it.
 */
export const THUMBPRINT_MAX_EDGE_PX = 1000;

/** What the folder watch needs to know about one file. */
export type WatchedFile = { name: string; lastModified: number; size: number };

const PICTURE_RE = /\.(bmp|png|jpe?g)$/i;

/** The capture program saves BMP; a PNG or JPEG dropped in the folder is taken too. */
export function isPrintPicture(name: string): boolean {
  return PICTURE_RE.test(name);
}

/**
 * The print that was just saved, or null while there is none (yet).
 *
 * ⛔ Only a picture saved AT OR AFTER `since` (the moment "Wait for a print" was
 * pressed) counts. An older file in the folder is the previous seller's print —
 * attaching it to this receipt would put the wrong person's thumbprint on file.
 *
 * A file is handed over only once its size is the same on two looks in a row:
 * the capture program may still be writing it on the first one. `seen` is what
 * the caller passes back as `previousSizes` on the next look.
 */
export function pickFreshPrint(
  files: WatchedFile[],
  since: number,
  previousSizes: Record<string, number>,
): { ready: WatchedFile | null; seen: Record<string, number> } {
  const fresh = files
    .filter((file) => isPrintPicture(file.name) && file.size > 0 && file.lastModified >= since)
    .sort((a, b) => b.lastModified - a.lastModified || a.name.localeCompare(b.name));
  const seen: Record<string, number> = {};
  for (const file of fresh) seen[file.name] = file.size;
  const newest = fresh[0] ?? null;
  const settled = newest !== null && previousSizes[newest.name] === newest.size;
  return { ready: settled ? newest : null, seen };
}
