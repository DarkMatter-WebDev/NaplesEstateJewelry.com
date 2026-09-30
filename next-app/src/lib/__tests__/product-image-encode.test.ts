import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  AI_IMAGE_MAX_EDGE_PX,
  PRODUCT_IMAGE_MAX_EDGE_PX,
  PRODUCT_IMAGE_MAX_UPLOAD_BYTES,
  encodeProductImageToWebp,
  shrinkImageForAi,
  toOwnedBuffer,
} from '@/lib/product-image-encode';

describe('toOwnedBuffer', () => {
  it('moves SharedArrayBuffer-backed bytes (sharp on Netlify) onto a plain ArrayBuffer a Blob will accept', () => {
    const shared = new SharedArrayBuffer(6);
    const view = new Uint8Array(shared);
    view.set([0x52, 0x49, 0x46, 0x46, 0x00, 0x01]);
    const sharedBuffer = Buffer.from(shared);
    expect(sharedBuffer.buffer).toBeInstanceOf(SharedArrayBuffer);

    const owned = toOwnedBuffer(sharedBuffer);
    expect(owned.buffer).not.toBeInstanceOf(SharedArrayBuffer);
    expect([...owned]).toEqual([0x52, 0x49, 0x46, 0x46, 0x00, 0x01]);
    expect(new Blob([owned]).size).toBe(6);
  });
});

// Fixtures are generated in memory (a flat colour plus noise so the encoders
// have something to work on) rather than committed as binaries.
async function makeImage(width: number, height: number, format: 'jpeg' | 'png') {
  const channels = 3;
  const raw = Buffer.alloc(width * height * channels);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 7919) % 251;
  const pipeline = sharp(raw, { raw: { width, height, channels } });
  return format === 'jpeg' ? pipeline.jpeg({ quality: 92 }).toBuffer() : pipeline.png().toBuffer();
}

describe('encodeProductImageToWebp', () => {
  it('turns a phone JPEG into WebP capped at the longest edge, never upscaling', async () => {
    const big = await makeImage(3000, 2000, 'jpeg');
    const out = await encodeProductImageToWebp(big);
    const meta = await sharp(out.buffer).metadata();

    expect(meta.format).toBe('webp');
    expect(out.buffer.buffer).not.toBeInstanceOf(SharedArrayBuffer);
    expect(out.width).toBe(PRODUCT_IMAGE_MAX_EDGE_PX);
    expect(out.height).toBe(1365);
    expect(out.sourceFormat).toBe('jpeg');
    expect(out.bytes).toBe(out.buffer.byteLength);

    const small = await makeImage(640, 480, 'png');
    const kept = await encodeProductImageToWebp(small);
    expect([kept.width, kept.height]).toEqual([640, 480]);
    expect((await sharp(kept.buffer).metadata()).format).toBe('webp');
    expect(kept.sourceFormat).toBe('png');
  });

  it('rejects bytes that are not an image', async () => {
    await expect(encodeProductImageToWebp(Buffer.from('not an image'))).rejects.toThrow();
  });

  it('keeps the upload cap under Netlify’s 6 MB synchronous body limit', () => {
    expect(PRODUCT_IMAGE_MAX_UPLOAD_BYTES).toBeLessThan(6 * 1024 * 1024);
    expect(PRODUCT_IMAGE_MAX_UPLOAD_BYTES).toBeGreaterThanOrEqual(3 * 1024 * 1024);
  });
});

describe('shrinkImageForAi', () => {
  it('leaves a small image alone and shrinks a large one to WebP', async () => {
    const small = await makeImage(800, 600, 'jpeg');
    const untouched = await shrinkImageForAi(small, 'image/jpeg');
    expect(untouched.shrunk).toBe(false);
    expect(untouched.mimeType).toBe('image/jpeg');
    expect(untouched.buffer).toBe(small);

    const large = await makeImage(2048, 1536, 'jpeg');
    const shrunk = await shrinkImageForAi(large, 'image/jpeg');
    expect(shrunk.shrunk).toBe(true);
    expect(shrunk.mimeType).toBe('image/webp');
    const meta = await sharp(shrunk.buffer).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(AI_IMAGE_MAX_EDGE_PX);
    expect(shrunk.buffer.byteLength).toBeLessThan(large.byteLength);
  });
});
