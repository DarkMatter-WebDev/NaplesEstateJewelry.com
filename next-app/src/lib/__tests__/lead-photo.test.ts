import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  LEAD_PHOTO_BUDGET_BYTES,
  LEAD_PHOTO_TIERS,
  fitsLeadPhotoBudget,
  leadPhotosTooLargeMessage,
  renameForEncodedType,
  startTierIndex,
  totalBytes,
} from '../lead-photo-prep';
import { encodeLeadPhoto } from '../lead-photo-encode';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

describe('lead photos: the browser-side budget', () => {
  it('keeps one submission under Netlify’s 6 MB request cap after base64', () => {
    // 6 MB cap, ~4/3 base64 growth → about 4.5 MB of binary. Stay clearly below.
    expect(LEAD_PHOTO_BUDGET_BYTES * (4 / 3)).toBeLessThan(5.5 * 1024 * 1024);
    expect(LEAD_PHOTO_BUDGET_BYTES).toBeGreaterThan(3 * 1024 * 1024);
  });

  it('steps the size down, never up, and starts at the site’s 2048px rule', () => {
    expect(LEAD_PHOTO_TIERS[0].maxEdge).toBe(2048);
    for (let i = 1; i < LEAD_PHOTO_TIERS.length; i += 1) {
      expect(LEAD_PHOTO_TIERS[i].maxEdge).toBeLessThan(LEAD_PHOTO_TIERS[i - 1].maxEdge);
    }
    // Small enough that ten photos fit, large enough to read a hallmark.
    expect(LEAD_PHOTO_TIERS.at(-1)!.maxEdge).toBeGreaterThanOrEqual(1024);
  });

  it('starts lower the more photos there are', () => {
    expect(startTierIndex(0)).toBe(0);
    expect(startTierIndex(2)).toBe(0);
    expect(startTierIndex(4)).toBe(1);
    expect(startTierIndex(6)).toBe(2);
    expect(startTierIndex(10)).toBe(LEAD_PHOTO_TIERS.length - 1);
  });

  it('adds up sizes and compares them with the budget', () => {
    expect(totalBytes([{ size: 10 }, { size: 32 }])).toBe(42);
    expect(fitsLeadPhotoBudget([{ size: LEAD_PHOTO_BUDGET_BYTES }])).toBe(true);
    expect(fitsLeadPhotoBudget([{ size: LEAD_PHOTO_BUDGET_BYTES }, { size: 1 }])).toBe(false);
  });

  it('renames to the type the bytes really are', () => {
    expect(renameForEncodedType('IMG_0042.HEIC', 'jpg')).toBe('IMG_0042.jpg');
    expect(renameForEncodedType('ring.photo.png', 'webp')).toBe('ring.photo.webp');
    expect(renameForEncodedType('', 'jpg')).toBe('photo.jpg');
  });

  it('tells the seller what to do instead of a bare failure, with the cell number', () => {
    expect(leadPhotosTooLargeMessage(false)).toContain('(239) 404-8505');
    expect(leadPhotosTooLargeMessage(true)).toContain('(239) 404-8505');
    expect(leadPhotosTooLargeMessage(false)).not.toMatch(/888/);
  });
});

describe('lead photos: wiring', () => {
  it.each([
    ['src/components/free-evaluation/EvalForm.tsx', "fetch('/api/inquire'"],
    ['src/components/contact/MessageUsForm.tsx', "fetch('/api/contact-message'"],
  ])('%s shrinks the photos before it posts, and stops when they cannot fit', (file, post) => {
    const source = read(...file.split('/'));
    expect(source.indexOf('shrinkFormPhotos(fd)')).toBeGreaterThan(-1);
    expect(source.indexOf('shrinkFormPhotos(fd)')).toBeLessThan(source.indexOf(post));
    expect(source).toContain('leadPhotosTooLargeMessage(isEs)');
    // The picker must stay a plain multi-select: `capture` would force the
    // camera and kill choosing several from the camera roll.
    expect(source).toContain('accept="image/*"');
    expect(source).not.toMatch(/\bcapture=/);
  });

  it.each([
    'src/app/api/inquire/route.ts',
    'src/app/api/contact-message/route.ts',
  ])('%s stores what encodeLeadPhoto produced, under its true type', (file) => {
    const source = read(...file.split('/'));
    expect(source).toContain('await encodeLeadPhoto(file)');
    expect(source).toContain('contentType: photo.contentType');
    expect(source).toContain("cacheControl: '31536000'");
  });
});

describe('lead photos: the server encode', () => {
  it('turns a large JPEG into a WebP no bigger than 2048px', async () => {
    const jpeg = await sharp({
      create: { width: 4032, height: 3024, channels: 3, background: { r: 180, g: 140, b: 40 } },
    }).jpeg({ quality: 90 }).toBuffer();
    const result = await encodeLeadPhoto(new File([new Uint8Array(jpeg)], 'IMG_0001.jpg', { type: 'image/jpeg' }));

    expect(result.reencoded).toBe(true);
    expect(result.contentType).toBe('image/webp');
    expect(result.extension).toBe('webp');
    const meta = await sharp(result.buffer).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(2048);
    // supabase-js rejects a SharedArrayBuffer-backed body on Netlify.
    expect(result.buffer.buffer).toBeInstanceOf(ArrayBuffer);
  });

  it('keeps the original bytes and type when the file cannot be read as an image', async () => {
    const bytes = new TextEncoder().encode('not an image at all');
    const result = await encodeLeadPhoto(new File([bytes], 'IMG_0002.HEIC', { type: 'image/heic' }));

    expect(result.reencoded).toBe(false);
    expect(result.contentType).toBe('image/heic');
    expect(result.extension).toBe('heic');
    expect(Buffer.compare(result.buffer, Buffer.from(bytes))).toBe(0);
  });
});
