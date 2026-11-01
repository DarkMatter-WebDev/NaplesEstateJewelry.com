import { describe, expect, it } from 'vitest';
import {
  partitionRowsByLiveImages,
  planImageAdoptions,
  planImageDiff,
  type EtsyListingImageApi,
} from '../images';
import { DELETED_LISTING_RESET_PATCH } from '../sync';
import type { EtsyListingImageRow } from '../store';

// 2026-09-13 photo-sync repair. Inv #33: the owner replaced 5 of 7 photos; the
// crash-window adoption recorded the OLD Etsy images at those ranks as the new
// uploads, then the same pass deleted those old images — Etsy kept 2 of 7
// photos while our rows said all 7 were uploaded, so every retry did nothing.
// Inv #82 (2026-07-10): Etsy showed 7 of 10 photos the same way. These tests
// pin the three guards: never adopt a tracked image, verify rows against the
// live listing, and delete before uploading.

const STORAGE_PREFIX = 'https://evzluixourmsefwdsieu.supabase.co/storage/v1/object/public/product-images/';
const url = (name: string) => `${STORAGE_PREFIX}products/${name}.webp`;

function row(name: string, rank: number, etsyId: number, id = rank): EtsyListingImageRow {
  return {
    id,
    product_id: 'p33',
    etsy_listing_id: 4534660277,
    source_url: url(name),
    source_key: `products/${name}.webp`,
    bytes_sha256: 'sha',
    etsy_listing_image_id: etsyId,
    rank,
    uploaded_at: '2026-07-08T18:10:00Z',
  };
}

const live = (id: number, rank: number): EtsyListingImageApi => ({ listing_image_id: id, rank });

describe('planImageDiff — deletes run before uploads', () => {
  it('puts every delete ahead of the uploads and re-ranks', () => {
    const existing = [row('old-1', 1, 101), row('old-2', 2, 102), row('kept', 3, 103)];
    const ops = planImageDiff([url('new-1'), url('kept'), url('new-2')], existing);
    expect(ops.map((op) => op.type)).toEqual(['delete', 'delete', 'upload', 'rerank', 'upload']);
    expect(ops.slice(0, 2).map((op) => (op.type === 'delete' ? op.row.source_key : ''))).toEqual(['products/old-1.webp', 'products/old-2.webp']);
  });
});

describe('planImageAdoptions — the inv #33 bug', () => {
  it('never adopts an image a checkpoint row already tracks, even at the planned rank', () => {
    // Old photos 101/102 sit at ranks 1-2 and are about to be deleted.
    const existing = [row('old-1', 1, 101), row('old-2', 2, 102), row('kept', 3, 103)];
    const ops = planImageDiff([url('new-1'), url('new-2'), url('kept')], existing);
    const liveImages = [live(101, 1), live(102, 2), live(103, 3)];
    const { adoptions, remaining } = planImageAdoptions(ops, liveImages, new Set([101, 102, 103]));
    expect(adoptions).toEqual([]);
    expect(remaining).toEqual(ops);
    expect(remaining.filter((op) => op.type === 'upload')).toHaveLength(2);
  });

  it('still adopts a genuine orphan (an upload that landed before its row was written)', () => {
    const existing = [row('kept', 1, 103)];
    const ops = planImageDiff([url('kept'), url('new-1')], existing);
    const liveImages = [live(103, 1), live(555, 2)];
    const { adoptions, remaining } = planImageAdoptions(ops, liveImages, new Set([103]));
    expect(adoptions).toHaveLength(1);
    expect(adoptions[0].image.listing_image_id).toBe(555);
    expect(adoptions[0].op.sourceKey).toBe('products/new-1.webp');
    expect(remaining).toEqual([]);
  });

  it('adopts each orphan at most once', () => {
    const ops = planImageDiff([url('a'), url('b')], []);
    const { adoptions } = planImageAdoptions(ops, [live(700, 1), live(701, 1)], new Set());
    expect(adoptions.map((a) => a.image.listing_image_id)).toEqual([700]);
  });
});

describe('partitionRowsByLiveImages — trust but verify', () => {
  it('flags rows whose Etsy image is gone (the inv #82 state: 10 rows, 7 photos on Etsy)', () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(`p${i + 1}`, i + 1, 900 + i, i + 1));
    const liveImages = rows.slice(0, 7).map((r) => live(r.etsy_listing_image_id, r.rank));
    const { present, missing } = partitionRowsByLiveImages(rows, liveImages);
    expect(present).toHaveLength(7);
    expect(missing.map((r) => r.rank)).toEqual([8, 9, 10]);
    // With the missing rows dropped, the next pass uploads exactly those three photos.
    const ops = planImageDiff(rows.map((r) => r.source_url), present);
    expect(ops).toEqual([
      { type: 'upload', sourceUrl: url('p8'), sourceKey: 'products/p8.webp', rank: 8 },
      { type: 'upload', sourceUrl: url('p9'), sourceKey: 'products/p9.webp', rank: 9 },
      { type: 'upload', sourceUrl: url('p10'), sourceKey: 'products/p10.webp', rank: 10 },
    ]);
  });

  it('treats nothing as missing when Etsy reports no images at all (no mass duplicate re-upload)', () => {
    const rows = [row('a', 1, 1), row('b', 2, 2)];
    expect(partitionRowsByLiveImages(rows, [])).toEqual({ present: rows, missing: [] });
  });
});

describe('DELETED_LISTING_RESET_PATCH — a listing deleted on etsy.com', () => {
  it('returns the row to "not listed" so Sync to Etsy creates it fresh', () => {
    expect(DELETED_LISTING_RESET_PATCH).toMatchObject({
      etsy_listing_id: null,
      sync_state: 'pending',
      listing_state: null,
      content_hash: null,
      last_pushed_price: null,
      last_error: null,
      error_count: 0,
    });
  });
});
