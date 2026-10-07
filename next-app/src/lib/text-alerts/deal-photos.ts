/**
 * Text-deal photos — the pure rules (owner, 2026-10-07: "allow admin to upload
 * multiple images (main pics, and a few detail shots)").
 *
 * A deal carries up to five photos: ONE main photo — the price, the line and
 * the brand mark are drawn on it, exactly as before — and up to four detail
 * shots, which are only resized. They all go out in ONE picture message, the
 * main picture first.
 *
 * Stored on `text_deals` as `photo_path` (the main, as it always was) plus
 * `detail_photo_paths`, and for the rendered JPEGs `card_path` plus
 * `detail_media_paths` (`supabase/text-deals-photos-2026-10.sql`). Everything
 * here reads a row that has no detail columns yet as "no detail shots", so a
 * one-photo deal behaves the same before and after that SQL has run.
 */
export const DEAL_PHOTO_MAX = 5;

/** The whole picture message is kept near this, so carriers deliver it. */
export const DEAL_MESSAGE_TARGET_BYTES = 1_000_000;
/** The main picture alone — the rule since 2026-09-15. */
export const DEAL_CARD_SOLO_TARGET_BYTES = 600_000;
/** The main picture when detail shots ride with it. */
export const DEAL_CARD_SHARED_TARGET_BYTES = 400_000;
export const DEAL_DETAIL_TARGET_BYTES = 150_000;

/** Byte targets per picture for a deal with this many detail shots. */
export function dealPictureBudget(detailCount: number): { card: number; detail: number } {
  return {
    card: detailCount > 0 ? DEAL_CARD_SHARED_TARGET_BYTES : DEAL_CARD_SOLO_TARGET_BYTES,
    detail: DEAL_DETAIL_TARGET_BYTES,
  };
}

function pathList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

export type DealPhotoColumns = {
  photo_path: string | null;
  detail_photo_paths?: string[] | null;
};

/** Every photo on the deal, the main one first; never the same path twice. */
export function dealPhotoList(deal: DealPhotoColumns): string[] {
  const all = [deal.photo_path, ...pathList(deal.detail_photo_paths)];
  return Array.from(new Set(all.filter((path): path is string => typeof path === 'string' && path.length > 0)));
}

/** The list back into its two columns. */
export function splitDealPhotos(list: string[]): { photo_path: string | null; detail_photo_paths: string[] } {
  return { photo_path: list[0] ?? null, detail_photo_paths: list.slice(1) };
}

export function dealPhotoLimitMessage(): string {
  return `A deal holds up to ${DEAL_PHOTO_MAX} photos. Remove one to add another.`;
}

/** A new photo goes to the end; the first photo added is the main one. */
export function withDealPhotoAdded(list: string[], path: string): { list: string[] } | { error: string } {
  if (list.includes(path)) return { error: 'That photo is already on this deal.' };
  if (list.length >= DEAL_PHOTO_MAX) return { error: dealPhotoLimitMessage() };
  return { list: [...list, path] };
}

/** Removing the main photo makes the next one the main one. */
export function withDealPhotoRemoved(list: string[], path: string): string[] {
  return list.filter((item) => item !== path);
}

/** "Make main" swaps the photo into the first place; nothing else moves. */
export function withDealPhotoAsMain(list: string[], path: string): string[] {
  const index = list.indexOf(path);
  if (index <= 0) return list;
  const next = [...list];
  [next[0], next[index]] = [next[index], next[0]];
  return next;
}

/**
 * The columns a photo change writes. Any change needs new pictures, so the
 * rendered ones are cleared. The detail columns are named only when the deal
 * has, or had, detail shots — a one-photo deal writes what it always wrote.
 */
export function dealPhotoUpdate(list: string[], rowHasDetailColumns: boolean): Record<string, unknown> {
  const { photo_path, detail_photo_paths } = splitDealPhotos(list);
  const update: Record<string, unknown> = { photo_path, card_path: null };
  if (detail_photo_paths.length > 0 || rowHasDetailColumns) {
    update.detail_photo_paths = detail_photo_paths;
    update.detail_media_paths = [];
  }
  return update;
}

export type DealMediaColumns = DealPhotoColumns & {
  card_path: string | null;
  detail_media_paths?: string[] | null;
};

/**
 * The pictures to send, in sending order — the main picture FIRST (owner:
 * "make sure main pic is sent first"). Null until every photo has its
 * rendered picture, so a deal can never go out with one missing.
 */
export function dealMediaPaths(deal: DealMediaColumns): string[] | null {
  if (!deal.card_path) return null;
  const details = dealPhotoList(deal).slice(1);
  const rendered = pathList(deal.detail_media_paths);
  if (rendered.length !== details.length) return null;
  return [deal.card_path, ...rendered];
}

/** "212 KB" / "1.1 MB" for the composer. */
export function formatPictureBytes(bytes: number): string {
  const kb = Math.round(bytes / 1024);
  return kb < 1000 ? `${kb} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
