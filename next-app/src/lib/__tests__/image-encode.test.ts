import { describe, it, expect } from 'vitest';
import { extensionForImageType, encodeCanvasForUpload } from '../image-encode';

/**
 * Fake canvas whose `toBlob` mimics the real spec behaviour: it produces the
 * requested type only if `supported` lists it, and otherwise SILENTLY returns
 * `image/png`. That silent substitution is the actual production bug — 46 live
 * product images were PNG under `.webp` names because nothing checked.
 */
function fakeCanvas(supported: string[], { empty = false } = {}) {
  return {
    toBlob(cb: (b: Blob | null) => void, type: string) {
      if (empty) return cb(null);
      const actual = supported.includes(type) ? type : 'image/png';
      cb(new Blob(['x'], { type: actual }));
    },
  } as unknown as HTMLCanvasElement;
}

describe('extensionForImageType', () => {
  it('maps the types we actually produce', () => {
    expect(extensionForImageType('image/webp')).toBe('webp');
    expect(extensionForImageType('image/jpeg')).toBe('jpg');
    expect(extensionForImageType('image/png')).toBe('png');
  });

  it('is case- and parameter-insensitive', () => {
    expect(extensionForImageType('IMAGE/WEBP')).toBe('webp');
    expect(extensionForImageType('image/jpeg; charset=binary')).toBe('jpg');
  });

  it('falls back to png rather than inventing webp', () => {
    // The old code assumed webp. Anything unrecognised must NOT be named .webp,
    // because a mislabelled file is invisible to the optimizer and to audits.
    expect(extensionForImageType('application/octet-stream')).toBe('png');
    expect(extensionForImageType('')).toBe('png');
  });
});

describe('encodeCanvasForUpload', () => {
  it('uses WebP when the browser supports it', async () => {
    const r = await encodeCanvasForUpload(fakeCanvas(['image/webp', 'image/jpeg']));
    expect(r.contentType).toBe('image/webp');
    expect(r.extension).toBe('webp');
    expect(r.isPreferred).toBe(true);
  });

  it('falls back to JPEG — not PNG — when WebP encoding is unsupported', async () => {
    // This is the Safari-shaped case that caused the incident. JPEG is roughly
    // an order of magnitude smaller than PNG for a 2048px photograph.
    const r = await encodeCanvasForUpload(fakeCanvas(['image/jpeg']));
    expect(r.contentType).toBe('image/jpeg');
    expect(r.extension).toBe('jpg');
    expect(r.isPreferred).toBe(false);
  });

  it('REGRESSION: never labels a PNG as WebP', async () => {
    // The exact production failure: browser supports neither, silently returns
    // PNG. The bytes must be labelled png/png, never webp.
    const r = await encodeCanvasForUpload(fakeCanvas([]));
    expect(r.blob.type).toBe('image/png');
    expect(r.contentType).toBe('image/png');
    expect(r.extension).toBe('png');
    expect(r.isPreferred).toBe(false);
    expect(r.extension).not.toBe('webp');
  });

  it('reports contentType matching the blob it returns, always', async () => {
    for (const supported of [['image/webp'], ['image/jpeg'], []]) {
      const r = await encodeCanvasForUpload(fakeCanvas(supported));
      expect(r.contentType).toBe(r.blob.type);
      expect(r.extension).toBe(extensionForImageType(r.blob.type));
    }
  });

  it('throws only when the canvas yields nothing at all', async () => {
    await expect(encodeCanvasForUpload(fakeCanvas([], { empty: true }))).rejects.toThrow(
      /produced no data/,
    );
  });
});
