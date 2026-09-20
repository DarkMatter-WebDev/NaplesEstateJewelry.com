import { encodeProductImageToWebp, toOwnedBuffer } from './product-image-encode';

/**
 * Server-side encoding of a photo a seller attached to a lead form
 * (`/api/inquire`, `/api/contact-message`) — 2026-09-20.
 *
 * The browser (`lead-photo-prep.ts`) has already downsized it so the request
 * fits Netlify's 6 MB body cap; here sharp turns it into WebP so what lands in
 * Storage follows the site's upload rule (WebP, 2048px cap, truthful name and
 * contentType). Same encoder the admin product uploads use.
 *
 * ⛔ A lead's photo must never be lost to an encoding problem: bytes sharp
 * cannot read (an HEIC from a browser that did not transcode it, a damaged
 * file) are stored exactly as they arrived, under their own type.
 */

export type EncodedLeadPhoto = {
  /** Always on a plain ArrayBuffer — supabase-js rejects sharp's shared one on Netlify. */
  buffer: Buffer<ArrayBuffer>;
  contentType: string;
  extension: string;
  /** False when the original bytes were kept. */
  reencoded: boolean;
};

function extensionFromName(name: string): string {
  return (name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
}

export async function encodeLeadPhoto(file: File): Promise<EncodedLeadPhoto> {
  const original = Buffer.from(await file.arrayBuffer());
  try {
    const encoded = await encodeProductImageToWebp(original);
    return { buffer: encoded.buffer, contentType: 'image/webp', extension: 'webp', reencoded: true };
  } catch (error) {
    console.warn('[lead-photo] kept original bytes; could not re-encode:', error instanceof Error ? error.message : error);
    return {
      buffer: toOwnedBuffer(original),
      contentType: file.type || 'image/jpeg',
      extension: extensionFromName(file.name),
      reencoded: false,
    };
  }
}
