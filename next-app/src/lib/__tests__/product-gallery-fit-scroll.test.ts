import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Source guard for the thumbnail-rail width re-measure.
//
// `fitWholeThumbnailCards` in `ProductImageGallery.tsx` clears the track's
// inline width to measure the space its parent offers, then snaps it back to
// a whole number of cards. For that one layout the track can be wider than
// the strip it contains — on any screen wider than all 26 cards (~1880px) —
// and a scroll container with no overflow has its `scrollLeft` clamped to 0
// by the browser, silently and permanently. The eased navigation that follows
// then starts from 0 and sweeps the whole strip on every click (owner report,
// 2026-09-02, lightbox on a 1920px display).
//
// jsdom has no layout, so the clamp cannot be exercised here; this pins the
// two lines that neutralise it. If the fit function is refactored, keep the
// read-before-clear / restore-after-snap pair or the sweep comes back on wide
// monitors only, where nobody on a laptop will ever see it.

const GALLERY = join(process.cwd(), 'src', 'components', 'shop', 'ProductImageGallery.tsx');

describe('thumbnail rail fit preserves the scroll position across the re-measure', () => {
  const source = readFileSync(GALLERY, 'utf8');
  const fit = source.slice(
    source.indexOf('function fitWholeThumbnailCards('),
    source.indexOf('function useCircularThumbnailTrack('),
  );

  it('reads scrollLeft before the inline width is cleared', () => {
    const read = fit.indexOf('const scrollLeftBeforeFit = track.scrollLeft;');
    const clear = fit.indexOf("track.style.width = '';");
    expect(read).toBeGreaterThan(-1);
    expect(clear).toBeGreaterThan(-1);
    expect(read).toBeLessThan(clear);
  });

  it('restores it after the snapped width is applied', () => {
    const snap = fit.indexOf('track.style.width = `${trackWidth}px`;');
    const restore = fit.indexOf('track.scrollLeft = scrollLeftBeforeFit;');
    expect(snap).toBeGreaterThan(-1);
    expect(restore).toBeGreaterThan(snap);
  });
});
