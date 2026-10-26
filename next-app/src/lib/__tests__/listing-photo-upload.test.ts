import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  LISTING_PHOTO_ORIGINAL_MAX_BYTES,
  LISTING_PHOTO_RETRY_PAUSE_MS,
  LISTING_PHOTO_TIER,
  canSendOriginal,
  insertBatchPhoto,
  listingPhotoUploadSummary,
  uploadListingPhotos,
  type ListingPhotoUploadDeps,
} from '../listing-photo-upload';

const base = { received: 4, added: 4, failed: [], overLimit: 0, oversized: 0, availableSlots: 19 };

// Owner, 2026-10-25 (iPad): photos chosen from the library were "left out and
// skipped". The message must always say how many photos the page RECEIVED, so
// a photo the picker kept back is told apart from one the page failed to add.
describe('listing photo upload summary', () => {
  it('says how many were received and added', () => {
    expect(listingPhotoUploadSummary(base)).toBe('Received 4 photos · 4 added.');
    expect(listingPhotoUploadSummary({ ...base, received: 1, added: 1 })).toBe('Received 1 photo · 1 added.');
  });

  it('names every photo it could not add, with why', () => {
    expect(
      listingPhotoUploadSummary({ ...base, added: 3, failed: [{ name: 'IMG_4521.jpeg', reason: 'this device could not read it' }] }),
    ).toBe("Received 4 photos · 3 added · Couldn't add IMG_4521.jpeg (this device could not read it).");
  });

  it('counts the photos left out for the 20-photo limit or size', () => {
    expect(listingPhotoUploadSummary({ ...base, received: 5, added: 2, overLimit: 3, availableSlots: 2 })).toBe(
      'Received 5 photos · 2 added · 3 photos left out: only room for 2 more (20 max).',
    );
    expect(listingPhotoUploadSummary({ ...base, added: 3, oversized: 1 })).toContain('1 photo over 25 MB left out');
  });

  it('keeps the 2048px upload rule', () => {
    expect(LISTING_PHOTO_TIER.maxEdge).toBe(2048);
  });
});

const photo = (name: string, size = 3 * 1024 * 1024, type = 'image/jpeg') =>
  new File([new Uint8Array(size)], name, { type });

/** Fake deps: `shrinkFails[name]` = how many shrink calls fail for that photo. */
function harness(opts: { shrinkFails?: Record<string, number>; uploadFails?: Record<string, number> } = {}) {
  const shrinkFails = { ...(opts.shrinkFails ?? {}) };
  const uploadFails = { ...(opts.uploadFails ?? {}) };
  const log: string[] = [];
  const added: string[] = [];
  const waits: number[] = [];
  const deps: ListingPhotoUploadDeps = {
    shrink: async (file) => {
      log.push(`shrink ${file.name}`);
      if ((shrinkFails[file.name] ?? 0) > 0) {
        shrinkFails[file.name] -= 1;
        throw new Error('No 2d canvas context');
      }
      return new File([new Uint8Array(10)], `${file.name}.small`, { type: 'image/jpeg' });
    },
    upload: async (blob) => {
      const name = (blob as File).name;
      log.push(`upload ${name}`);
      const key = name.replace(/\.small$/, '');
      if ((uploadFails[key] ?? 0) > 0) {
        uploadFails[key] -= 1;
        return { error: 'Upload failed: storage busy' };
      }
      return { url: `https://cdn/${name}` };
    },
    onAdded: (url) => added.push(url),
    wait: async (ms) => { waits.push(ms); log.push(`wait ${ms}`); },
  };
  return { deps, log, added, waits };
}

describe('uploadListingPhotos', () => {
  it('a clean batch uploads every photo in order, with no pause', async () => {
    const h = harness();
    const result = await uploadListingPhotos([photo('a'), photo('b'), photo('c')], h.deps);
    expect(result).toEqual({ added: 3, failed: [] });
    expect(h.added).toEqual(['https://cdn/a.small', 'https://cdn/b.small', 'https://cdn/c.small']);
    expect(h.waits).toEqual([]);
  });

  it('retries a failed photo at the END of the batch, after the pause (the 10-25 case)', async () => {
    const h = harness({ shrinkFails: { b: 1 } });
    const result = await uploadListingPhotos([photo('a'), photo('b'), photo('c')], h.deps);
    expect(result).toEqual({ added: 3, failed: [] });
    expect(h.log).toEqual([
      'shrink a', 'upload a.small', 'shrink b', 'shrink c', 'upload c.small',
      `wait ${LISTING_PHOTO_RETRY_PAUSE_MS}`, 'shrink b', 'upload b.small',
    ]);
    expect(LISTING_PHOTO_RETRY_PAUSE_MS).toBeGreaterThanOrEqual(2000);
  });

  it('on the retry, sends the ORIGINAL when the browser still cannot shrink it', async () => {
    const h = harness({ shrinkFails: { b: 2 } });
    const result = await uploadListingPhotos([photo('a'), photo('b')], h.deps);
    expect(result).toEqual({ added: 2, failed: [] });
    expect(h.log.slice(-2)).toEqual(['shrink b', 'upload b']);
  });

  it('reports a photo that still fails, with the reason, and never stops the batch', async () => {
    const big = photo('huge', LISTING_PHOTO_ORIGINAL_MAX_BYTES + 1);
    const h = harness({ shrinkFails: { huge: 2 }, uploadFails: { c: 2 } });
    const result = await uploadListingPhotos([big, photo('b'), photo('c')], h.deps);
    expect(result.added).toBe(1);
    expect(result.failed.map((f) => [f.file.name, f.reason])).toEqual([
      ['huge', 'this device could not read it (No 2d canvas context)'],
      ['c', 'Upload failed: storage busy'],
    ]);
  });

  it('never sends an original that is too big or a type the server may not read', () => {
    expect(canSendOriginal(photo('ok'))).toBe(true);
    expect(canSendOriginal(photo('big', LISTING_PHOTO_ORIGINAL_MAX_BYTES + 1))).toBe(false);
    expect(canSendOriginal(photo('heic', 1000, 'image/heic'))).toBe(false);
    expect(canSendOriginal(photo('empty', 0))).toBe(false);
  });

  it('never throws, even when the upload itself throws', async () => {
    const h = harness();
    h.deps.upload = async () => { throw new Error('network gone'); };
    const result = await uploadListingPhotos([photo('a')], h.deps);
    expect(result.added).toBe(0);
    expect(result.failed[0].reason).toBe('network gone');
  });
});

// Owner, 2026-10-25: a retried photo should "insert in where it was supposed to
// go instead of as the last photo".
describe('a retried photo goes back into its place', () => {
  it('the 10-25 case: the 2nd photo fails, lands last, and is put back 2nd', async () => {
    const h = harness({ shrinkFails: { b: 1 } });
    let images = ['old1'];
    const batchUrls: (string | null)[] = [null, null, null, null];
    await uploadListingPhotos([photo('a'), photo('b'), photo('c'), photo('d')], {
      ...h.deps,
      onAdded: (url, index) => {
        batchUrls[index] = url;
        images = insertBatchPhoto(images, url, index, batchUrls);
      },
    });
    expect(images).toEqual(['old1', 'https://cdn/a.small', 'https://cdn/b.small', 'https://cdn/c.small', 'https://cdn/d.small']);
  });

  // Owner, 2026-10-25: "the auto-retry feature placed the photos where they
  // should go, but the manual button 'retry' placed them at the end".
  it('Try again continues the SAME batch: the photo goes back into its place', async () => {
    // The editor's own mapping: entries carry the ORIGINAL batch index.
    let images = ['old1'];
    const batchUrls: (string | null)[] = [null, null, null, null];
    const run = async (files: File[], indices: number[], h: ReturnType<typeof harness>) => {
      const result = await uploadListingPhotos(files, {
        ...h.deps,
        onAdded: (url, i) => {
          batchUrls[indices[i]] = url;
          images = insertBatchPhoto(images, url, indices[i], batchUrls);
        },
      });
      return result.failed.map((f) => indices[f.index]);
    };
    // b fails the first try AND the automatic retry (upload refused twice).
    const first = await run([photo('a'), photo('b'), photo('c'), photo('d')], [0, 1, 2, 3], harness({ uploadFails: { b: 2 } }));
    expect(first).toEqual([1]);
    expect(images).toEqual(['old1', 'https://cdn/a.small', 'https://cdn/c.small', 'https://cdn/d.small']);
    // Try again: only b, at its original index 1, same batchUrls.
    const second = await run([photo('b')], first, harness());
    expect(second).toEqual([]);
    expect(images).toEqual(['old1', 'https://cdn/a.small', 'https://cdn/b.small', 'https://cdn/c.small', 'https://cdn/d.small']);
  });

  it('reports a failed photo with its position in the batch', async () => {
    const h = harness({ uploadFails: { c: 2 } });
    const result = await uploadListingPhotos([photo('a'), photo('b'), photo('c')], h.deps);
    expect(result.failed.map((f) => [f.file.name, f.index])).toEqual([['c', 2]]);
  });

  it('a failed FIRST photo becomes the cover again on an empty listing', () => {
    expect(insertBatchPhoto(['b', 'c'], 'a', 0, [null, 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('two failed neighbours both go back in order', () => {
    let images = ['x', 'a', 'd'];
    const batch: (string | null)[] = ['a', null, null, 'd'];
    batch[1] = 'b'; images = insertBatchPhoto(images, 'b', 1, batch);
    batch[2] = 'c'; images = insertBatchPhoto(images, 'c', 2, batch);
    expect(images).toEqual(['x', 'a', 'b', 'c', 'd']);
  });

  it('follows its neighbour if the owner dragged it while uploading', () => {
    // batch a,b,c; b retried; the owner moved "a" to the front meanwhile.
    expect(insertBatchPhoto(['a', 'old1', 'c'], 'b', 1, ['a', null, 'c'])).toEqual(['a', 'b', 'old1', 'c']);
  });

  it('goes to the end when none of its batch is left (all removed)', () => {
    expect(insertBatchPhoto(['old1'], 'b', 1, ['a', null, 'c'])).toEqual(['old1', 'b']);
  });

  it('a clean batch is simply appended in order', () => {
    let images = ['old1'];
    const batch: (string | null)[] = [null, null];
    batch[0] = 'a'; images = insertBatchPhoto(images, 'a', 0, batch);
    batch[1] = 'b'; images = insertBatchPhoto(images, 'b', 1, batch);
    expect(images).toEqual(['old1', 'a', 'b']);
  });
});

describe('the listing editor upload', () => {
  const shell = readFileSync(join(process.cwd(), 'src', 'components', 'admin', 'AdminShell.tsx'), 'utf8');
  const prep = readFileSync(join(process.cwd(), 'src', 'lib', 'lead-photo-prep.ts'), 'utf8');
  const handler = shell.slice(shell.indexOf('const handleImageUpload'), shell.indexOf('async function saveCroppedImage'));

  it('prepares photos with the shared shrinker and the shared batch logic', () => {
    expect(handler).toContain('shrinkPhotoFile(file, LISTING_PHOTO_TIER)');
    expect(handler).toContain('uploadListingPhotos(uploadEntries.map((e) => e.file)');
    expect(shell).not.toMatch(/createImageBitmap\(file\)/);
  });

  it('shows the result INSIDE the editor, never with the page flash (hidden behind it)', () => {
    expect(handler).not.toMatch(/\bflash\(/);
    expect(handler).toContain('showPhotoUploadNotice(');
    expect(shell).toMatch(/\{photoUploadNotice && \(/);
    expect(shell).toContain('Try again');
  });

  it('Try again resumes the original batch (its batchUrls + original places)', () => {
    expect(shell).toContain('handleImageUpload(retry.files, { batchUrls: retry.batchUrls, indices: retry.indices })');
    expect(handler).toContain('const batchUrls: (string | null)[] = resume ? resume.batchUrls');
    expect(handler).toContain('indices: outcome.failed.map((f) => uploadEntries[f.index].index)');
  });

  it('places each photo by its batch position, never a plain append', () => {
    expect(handler).toContain('insertBatchPhoto(prev.images, url, index, batchUrls)');
    expect(handler).not.toMatch(/images: \[\.\.\.prev\.images, url\]/);
  });

  it('"Uploading…" always clears', () => {
    expect(handler).toMatch(/\} finally \{\s*setUploading\(false\);/);
  });

  it('the shrinker releases the decoded photo and the canvas on every path', () => {
    const fn = prep.slice(prep.indexOf('export async function shrinkPhotoFile'), prep.indexOf('async function encodeIntermediate'));
    expect(fn).toMatch(/finally \{\s*if \('close' in source\) source\.close\(\);\s*canvas\.width = 0;\s*canvas\.height = 0;/);
  });
});
