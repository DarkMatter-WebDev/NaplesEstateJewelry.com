import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LISTING_PHOTO_TIER, listingPhotoUploadSummary } from '../listing-photo-upload';

const base = { received: 4, added: 4, failed: [], overLimit: 0, oversized: 0, availableSlots: 19 };

// Owner, 2026-10-25 (iPad): photos chosen from the library were "left out and
// skipped". The message must always say how many photos the page RECEIVED, so
// a photo the picker kept back is told apart from one the page failed to add.
describe('listing photo upload summary', () => {
  it('says how many were received and added', () => {
    expect(listingPhotoUploadSummary(base)).toBe('Received 4 photos · 4 added.');
    expect(listingPhotoUploadSummary({ ...base, received: 1, added: 1 })).toBe('Received 1 photo · 1 added.');
  });

  it('names every photo it could not add', () => {
    expect(listingPhotoUploadSummary({ ...base, added: 3, failed: ['IMG_4521.jpeg'] })).toBe(
      "Received 4 photos · 3 added · Couldn't add IMG_4521.jpeg — try it again.",
    );
    expect(listingPhotoUploadSummary({ ...base, added: 2, failed: ['a.jpg', 'b.jpg'] })).toContain("Couldn't add a.jpg, b.jpg — try them again");
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

describe('the listing editor upload', () => {
  const shell = readFileSync(join(process.cwd(), 'src', 'components', 'admin', 'AdminShell.tsx'), 'utf8');
  const prep = readFileSync(join(process.cwd(), 'src', 'lib', 'lead-photo-prep.ts'), 'utf8');

  it('prepares photos with the shared shrinker, not its own canvas code', () => {
    expect(shell).toContain('shrinkPhotoFile(file, LISTING_PHOTO_TIER)');
    expect(shell).not.toMatch(/createImageBitmap\(file\)/);
  });

  it('one failed photo never stops the rest, and "Uploading…" always clears', () => {
    const handler = shell.slice(shell.indexOf('const handleImageUpload'), shell.indexOf('async function saveCroppedImage'));
    expect(handler).toMatch(/for \(const file of uploadFiles\) \{\s*try \{/);
    expect(handler).toMatch(/\} finally \{\s*setUploading\(false\);/);
    expect(handler).toContain('failedNames.push');
  });

  it('the shrinker releases the decoded photo and the canvas on every path', () => {
    const fn = prep.slice(prep.indexOf('export async function shrinkPhotoFile'), prep.indexOf('async function encodeIntermediate'));
    expect(fn).toMatch(/finally \{\s*if \('close' in source\) source\.close\(\);\s*canvas\.width = 0;\s*canvas\.height = 0;/);
  });
});
