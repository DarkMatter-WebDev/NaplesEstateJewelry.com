// Browser-side shrinking of the photos a seller attaches to a lead form.
//
// Why (2026-09-20): the free-evaluation and contact forms post every photo in
// ONE multipart request, and until now they posted the camera originals.
// Netlify cuts a synchronous function request at 6 MB, and a binary body is
// base64-encoded on the way in (~30% overhead), so roughly 4.5 MB of photos is
// the real ceiling — two ordinary iPhone pictures. Above it the platform
// rejects the request before our route runs, and the seller only sees "Failed
// to send". Every photo submission that had ever succeeded totalled under
// 1.5 MB. Evidence: `CHANGELOG.md` 2026-09-20.
//
// What this does: downsizes each photo in the browser so the whole set fits the
// budget below, stepping the size down as the photo count goes up. The server
// (`lead-photo-encode.ts`) then re-encodes to WebP, so what the browser
// produces is only an intermediate — WebKit cannot encode WebP in a canvas, and
// that no longer matters.
//
// ⛔ Never throw away a photo silently. A file the browser cannot decode is sent
// as it is; if the set still cannot fit, the form says so in plain words and
// offers the phone instead of failing.

import { encodeCanvasForUpload } from './image-encode';
import { capLeadPhotos } from './lead-photo-limits';

/**
 * Bytes of photos one submission may carry. 6 MB platform cap → ~4.5 MB of
 * binary after base64; the text fields and multipart framing are a few KB.
 * 3.8 MB leaves real headroom rather than sailing at the limit.
 */
export const LEAD_PHOTO_BUDGET_BYTES = Math.floor(3.8 * 1024 * 1024);

export type LeadPhotoTier = { maxEdge: number; quality: number };

/**
 * Largest first. 2048 matches the site's upload rule; the smaller tiers exist
 * only so ten photos still fit one request. 1024px is still plenty to read a
 * hallmark photographed up close.
 */
export const LEAD_PHOTO_TIERS: readonly LeadPhotoTier[] = [
  { maxEdge: 2048, quality: 0.85 },
  { maxEdge: 1600, quality: 0.82 },
  { maxEdge: 1280, quality: 0.8 },
  { maxEdge: 1024, quality: 0.76 },
];

/**
 * Where to start for a given photo count, so a phone does not encode ten
 * photos four times over. A 2048px JPEG at these qualities runs 0.5–1.5 MB, a
 * 1024px one 120–300 KB.
 */
export function startTierIndex(photoCount: number): number {
  if (photoCount <= 2) return 0;
  if (photoCount <= 4) return 1;
  if (photoCount <= 7) return 2;
  return 3;
}

export function totalBytes(files: readonly { size: number }[]): number {
  return files.reduce((sum, file) => sum + file.size, 0);
}

export function fitsLeadPhotoBudget(files: readonly { size: number }[]): boolean {
  return totalBytes(files) <= LEAD_PHOTO_BUDGET_BYTES;
}

/** `IMG_0042.HEIC` + `jpg` → `IMG_0042.jpg`; never a name without an extension. */
export function renameForEncodedType(originalName: string, extension: string): string {
  const base = originalName.replace(/\.[^./\\]+$/, '').trim() || 'photo';
  return `${base}.${extension}`;
}

/** The message a form shows when the photos cannot be made to fit. */
export function leadPhotosTooLargeMessage(isEs: boolean): string {
  return isEs
    ? 'Esas fotos son demasiado grandes para enviarlas juntas. Envíe menos fotos, o mándelas por mensaje de texto al (239) 404-8505.'
    : 'Those photos are too large to send together. Please send fewer photos, or text them to (239) 404-8505.';
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through: some browsers reject a type createImageBitmap cannot
      // sniff but an <img> can still draw.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function shrinkOne(file: File, tier: LeadPhotoTier): Promise<File> {
  const source = await decode(file);
  const width = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const height = 'naturalHeight' in source ? source.naturalHeight : source.height;
  if (!width || !height) throw new Error('Image has no size');

  const scale = Math.min(1, tier.maxEdge / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2d canvas context');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ('close' in source) source.close();

  const encoded = await encodeIntermediate(canvas, tier.quality);
  canvas.width = 0;
  canvas.height = 0;
  return new File([encoded.blob], renameForEncodedType(file.name, encoded.extension), {
    type: encoded.contentType,
    lastModified: file.lastModified,
  });
}

/**
 * JPEG first, on purpose. The server re-encodes to WebP, so asking the browser
 * for WebP buys nothing — and on WebKit (every iPhone browser) that request
 * silently produces a PNG, a slow lossless encode that is then thrown away.
 * Measured 2026-09-20 with ten 12 MP photos: 23 s with the WebP attempt.
 * `blob.type` is still the only truth (see image-encode.ts); anything other
 * than a real JPEG falls back to the shared encoder.
 */
async function encodeIntermediate(canvas: HTMLCanvasElement, quality: number) {
  const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (jpeg && jpeg.type === 'image/jpeg') {
    return { blob: jpeg, contentType: 'image/jpeg', extension: 'jpg' };
  }
  return encodeCanvasForUpload(canvas, quality);
}

/** Shrink at one tier. A photo that cannot be decoded, or that would GROW, is kept as it was. */
async function shrinkAll(files: readonly File[], tier: LeadPhotoTier): Promise<File[]> {
  const out: File[] = [];
  for (const file of files) {
    try {
      const shrunk = await shrinkOne(file, tier);
      out.push(shrunk.size < file.size ? shrunk : file);
    } catch {
      out.push(file);
    }
  }
  return out;
}

export type PreparedLeadPhotos = {
  files: File[];
  totalBytes: number;
  fits: boolean;
  /** The tier that produced `files`, for diagnostics. */
  tier: LeadPhotoTier;
};

/**
 * Shrink a seller's photos so the whole set fits one request. Non-image files
 * are dropped (the server ignores them anyway), and only the first
 * `LEAD_PHOTO_MAX` images are kept — the form has already told the customer so
 * in red (`LeadPhotoCount`), and the server keeps the same number, so nothing is
 * encoded and uploaded only to be thrown away. Steps down a tier at a time and
 * stops at the first set that fits.
 */
export async function prepareLeadPhotos(input: readonly File[]): Promise<PreparedLeadPhotos> {
  const images = capLeadPhotos(input.filter((file) => file.size > 0 && file.type.startsWith('image/')));
  let index = startTierIndex(images.length);
  let files = await shrinkAll(images, LEAD_PHOTO_TIERS[index]);
  while (!fitsLeadPhotoBudget(files) && index < LEAD_PHOTO_TIERS.length - 1) {
    index += 1;
    files = await shrinkAll(images, LEAD_PHOTO_TIERS[index]);
  }
  return { files, totalBytes: totalBytes(files), fits: fitsLeadPhotoBudget(files), tier: LEAD_PHOTO_TIERS[index] };
}

/**
 * Replace a form's photo field with the shrunken set, in place. Returns the
 * result so the caller can stop with `leadPhotosTooLargeMessage` when it does
 * not fit.
 */
export async function shrinkFormPhotos(formData: FormData, field = 'photos'): Promise<PreparedLeadPhotos> {
  const originals = formData.getAll(field).filter((value): value is File => value instanceof File);
  const prepared = await prepareLeadPhotos(originals);
  formData.delete(field);
  for (const file of prepared.files) formData.append(field, file, file.name);
  return prepared;
}
