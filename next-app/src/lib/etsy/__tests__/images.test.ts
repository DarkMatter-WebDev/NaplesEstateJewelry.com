import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { getSiteUrl } from '@/lib/order-email-branding';
import { computeUploadWarnings, formatUploadWarnings, planImageDiff, resolveImageUrl, sha256Hex, transcodeToJpeg } from '../images';
import type { EtsyListingImageRow } from '../store';

/**
 * "Local WebP fixtures" generated in-memory via sharp (rather than committing
 * binary files to the repo, per the project's "keep the folder pristine"
 * convention) — this still exercises the real WebP encode/decode path.
 */
async function makeWebpFixture(withAlpha: boolean): Promise<Buffer> {
  const width = 12;
  const height = 12;
  const channels = withAlpha ? 4 : 3;
  const pixel = withAlpha ? [200, 40, 40, 128] : [200, 40, 40];
  const raw = Buffer.alloc(width * height * channels);
  for (let i = 0; i < width * height; i += 1) {
    for (let c = 0; c < channels; c += 1) raw[i * channels + c] = pixel[c];
  }
  return sharp(raw, { raw: { width, height, channels } }).webp().toBuffer();
}

describe('transcodeToJpeg', () => {
  it('transcodes an opaque WebP fixture to JPEG', async () => {
    const webp = await makeWebpFixture(false);
    const sourceMeta = await sharp(webp).metadata();
    expect(sourceMeta.format).toBe('webp');

    const result = await transcodeToJpeg(webp);
    const outMeta = await sharp(result.buffer).metadata();
    expect(outMeta.format).toBe('jpeg');
    expect(outMeta.width).toBe(12);
    expect(outMeta.height).toBe(12);
  });

  it('transcodes a WebP fixture with an alpha channel to a flattened (white background) JPEG', async () => {
    const webp = await makeWebpFixture(true);
    const sourceMeta = await sharp(webp).metadata();
    expect(sourceMeta.hasAlpha).toBe(true);

    const result = await transcodeToJpeg(webp);
    const outMeta = await sharp(result.buffer).metadata();
    expect(outMeta.format).toBe('jpeg');
    expect(outMeta.hasAlpha).toBeFalsy(); // JPEG carries no alpha channel — it was flattened onto white
  });

  it('flags source images below the recommended longest edge, without upscaling', async () => {
    const webp = await makeWebpFixture(false); // 12x12, far under the 2000px recommendation
    const result = await transcodeToJpeg(webp);
    expect(result.warning).toMatch(/2000px/);
    expect(result.width).toBe(12); // confirms no upscaling happened
  });

  it('sniffs the real format from bytes rather than trusting an extension', async () => {
    // A WebP buffer with no filename/extension anywhere near it still decodes correctly.
    const webp = await makeWebpFixture(false);
    await expect(transcodeToJpeg(webp)).resolves.toMatchObject({ width: 12, height: 12 });
  });

  it('resizes an oversized source down to the 2400px cap without distorting aspect ratio', async () => {
    // 3000x3000 solid-color source — well over the cap, but cheap to encode/decode.
    const raw = Buffer.alloc(3000 * 3000 * 3, 128);
    const oversized = await sharp(raw, { raw: { width: 3000, height: 3000, channels: 3 } }).png().toBuffer();

    const result = await transcodeToJpeg(oversized);
    expect(result.width).toBe(2400);
    expect(result.height).toBe(2400);
    // Still comfortably clears Etsy's 2000px recommendation, so no warning.
    expect(result.warning).toBeUndefined();
  });
});

describe('resolveImageUrl — the session 9 "Failed to parse URL" regression', () => {
  it('leaves an already-absolute URL (the normal Supabase Storage case) untouched', () => {
    const url = 'https://evzluixourmsefwdsieu.supabase.co/storage/v1/object/public/product-images/products/a.webp';
    expect(resolveImageUrl(url)).toBe(url);
  });

  it('also passes through an absolute http:// URL untouched', () => {
    expect(resolveImageUrl('http://example.com/a.webp')).toBe('http://example.com/a.webp');
  });

  // Direct regression test: a bare legacy path like this is exactly what
  // made fetch() throw "Failed to parse URL" live (session 9) — Node has no
  // implicit page origin to resolve a relative path against, unlike a
  // browser.
  it('resolves a legacy same-origin path against the site\'s canonical URL', () => {
    const path = '/assets/images/shop/shop-14k-heavy-diamond-cut-cuban-chain-04.webp';
    expect(resolveImageUrl(path)).toBe(`${getSiteUrl()}${path}`);
  });

  it('still resolves correctly if the relative path is missing its leading slash', () => {
    expect(resolveImageUrl('assets/images/shop/a.webp')).toBe(`${getSiteUrl()}/assets/images/shop/a.webp`);
  });
});

describe('computeUploadWarnings', () => {
  it('flags a too-small first photo (rank 1) — Etsy\'s stricter, ranking-affecting floor', () => {
    const warnings = computeUploadWarnings({ rank: 1, width: 600, height: 600, byteLength: 50_000 });
    expect(warnings.some((w) => w.includes('635px'))).toBe(true);
  });

  it('does not flag the same small dimensions on a non-first photo', () => {
    const warnings = computeUploadWarnings({ rank: 2, width: 600, height: 600, byteLength: 50_000 });
    expect(warnings.some((w) => w.includes('635px'))).toBe(false);
  });

  it('does not flag a first photo that clears the 635px floor', () => {
    const warnings = computeUploadWarnings({ rank: 1, width: 800, height: 800, byteLength: 50_000 });
    expect(warnings).toEqual([]);
  });

  it('flags an upload over 1MB regardless of rank', () => {
    const warnings = computeUploadWarnings({ rank: 2, width: 2000, height: 2000, byteLength: 1.5 * 1024 * 1024 });
    expect(warnings.some((w) => w.includes('1MB'))).toBe(true);
  });

  it('can flag both the first-photo floor and the file-size guidance at once', () => {
    const warnings = computeUploadWarnings({ rank: 1, width: 500, height: 500, byteLength: 2 * 1024 * 1024 });
    expect(warnings).toHaveLength(2);
  });

  it('flags nothing for a well-sized, small-file photo', () => {
    const warnings = computeUploadWarnings({ rank: 1, width: 2000, height: 2000, byteLength: 400_000 });
    expect(warnings).toEqual([]);
  });
});

describe('formatUploadWarnings', () => {
  it('labels warnings by photo rank and removes exact duplicates', () => {
    expect(formatUploadWarnings(3, ['Small source.', 'Small source.', 'Large upload.']))
      .toBe('Photo 3: Small source. Large upload.');
  });

  it('returns undefined when there is nothing to report', () => {
    expect(formatUploadWarnings(1, [undefined])).toBeUndefined();
  });
});

describe('sha256Hex', () => {
  it('is deterministic for identical bytes', () => {
    expect(sha256Hex(Buffer.from('hello world'))).toBe(sha256Hex(Buffer.from('hello world')));
  });

  it('differs for different bytes', () => {
    expect(sha256Hex(Buffer.from('a'))).not.toBe(sha256Hex(Buffer.from('b')));
  });
});

describe('planImageDiff', () => {
  const STORAGE_PREFIX = 'https://evzluixourmsefwdsieu.supabase.co/storage/v1/object/public/product-images/';

  function makeRow(overrides: Partial<EtsyListingImageRow> = {}): EtsyListingImageRow {
    return {
      id: 1,
      product_id: 'p1',
      etsy_listing_id: 999,
      source_url: `${STORAGE_PREFIX}products/a.webp`,
      source_key: 'products/a.webp',
      bytes_sha256: null,
      etsy_listing_image_id: 111,
      rank: 1,
      uploaded_at: '2026-01-01T00:00:00Z',
      ...overrides,
    };
  }

  it('uploads a new image that has no existing row', () => {
    const url = `${STORAGE_PREFIX}products/new.webp`;
    const ops = planImageDiff([url], []);
    expect(ops).toEqual([{ type: 'upload', sourceUrl: url, sourceKey: 'products/new.webp', rank: 1 }]);
  });

  it('deletes a row whose URL is gone from the product', () => {
    const existing = [makeRow()];
    const ops = planImageDiff([], existing);
    expect(ops).toEqual([{ type: 'delete', row: existing[0] }]);
  });

  it('does nothing when URL and rank are unchanged', () => {
    const existing = [makeRow({ source_key: 'products/a.webp', rank: 1 })];
    const ops = planImageDiff([`${STORAGE_PREFIX}products/a.webp`], existing);
    expect(ops).toEqual([]);
  });

  it('re-ranks when the display order changes but the URLs are unchanged', () => {
    const existing = [
      makeRow({ id: 1, source_key: 'products/a.webp', rank: 1 }),
      makeRow({ id: 2, source_key: 'products/b.webp', rank: 2, etsy_listing_image_id: 222 }),
    ];
    const ops = planImageDiff([`${STORAGE_PREFIX}products/b.webp`, `${STORAGE_PREFIX}products/a.webp`], existing);
    expect(ops).toHaveLength(2);
    expect(ops.every((op) => op.type === 'rerank')).toBe(true);
  });

  it('caps the desired set at 20 images (Etsy per-listing max, raised from 10 in August 2025)', () => {
    const urls = Array.from({ length: 25 }, (_, i) => `${STORAGE_PREFIX}products/img-${i}.webp`);
    const ops = planImageDiff(urls, []);
    expect(ops).toHaveLength(20);
  });
});
