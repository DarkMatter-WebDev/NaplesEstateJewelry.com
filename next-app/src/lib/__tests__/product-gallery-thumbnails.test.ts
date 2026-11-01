import { describe, expect, it } from 'vitest';
import {
  buildCircularThumbnailItems,
  getThumbnailLoopDirection,
  getWholeThumbnailScrollLeft,
  getWholeThumbnailTrackLayout,
} from '@/lib/product-gallery-thumbnails';

describe('buildCircularThumbnailItems', () => {
  it('keeps a single item uncloned', () => {
    expect(buildCircularThumbnailItems(['a'])).toEqual([
      { item: 'a', logicalIndex: 0, copy: 'original' },
    ]);
  });

  it('clones every item for small collections (capped by the collection size)', () => {
    expect(buildCircularThumbnailItems(['a', 'b', 'c'])).toEqual([
      { item: 'a', logicalIndex: 0, copy: 'before' },
      { item: 'b', logicalIndex: 1, copy: 'before' },
      { item: 'c', logicalIndex: 2, copy: 'before' },
      { item: 'a', logicalIndex: 0, copy: 'original' },
      { item: 'b', logicalIndex: 1, copy: 'original' },
      { item: 'c', logicalIndex: 2, copy: 'original' },
      { item: 'a', logicalIndex: 0, copy: 'after' },
      { item: 'b', logicalIndex: 1, copy: 'after' },
      { item: 'c', logicalIndex: 2, copy: 'after' },
    ]);
  });

  it('adds four clones per side for larger collections — enough for a 6-visible layout', () => {
    const items = buildCircularThumbnailItems(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']);
    expect(items.filter((entry) => entry.copy === 'before').map((entry) => entry.logicalIndex)).toEqual([5, 6, 7, 8]);
    expect(items.filter((entry) => entry.copy === 'original')).toHaveLength(9);
    expect(items.filter((entry) => entry.copy === 'after').map((entry) => entry.logicalIndex)).toEqual([0, 1, 2, 3]);
  });

  it('keeps every scroll target reachable so boundary motion never freezes on the clamp', () => {
    // Regression for the wrap "stutter": with too few clones (or more visible
    // slots than originals) the desired scrollLeft for the last original and
    // for both wrap clones exceeds the track's maximum scroll, the browser
    // clamps every animation frame, and the rail visibly freezes. The
    // component caps visibleCount at the original count and the clone counts
    // below must keep all four boundary targets inside [0, maxScroll].
    const CARD = 64;
    const GAP = 8;
    const STRIDE = CARD + GAP;
    for (let originals = 2; originals <= 12; originals++) {
      const items = buildCircularThumbnailItems(Array.from({ length: originals }, (_, i) => i));
      const leading = items.filter((entry) => entry.copy === 'before').length;
      const contentWidth = items.length * STRIDE - GAP;
      for (let visible = 2; visible <= Math.min(6, originals); visible++) {
        const trackWidth = visible * CARD + (visible - 1) * GAP;
        const maxScroll = contentWidth - trackWidth;
        const targets = {
          firstOriginal: leading,
          lastOriginal: leading + originals - 1,
          forwardWrapClone: leading + originals,
          backwardWrapClone: leading - 1,
        };
        for (const [name, position] of Object.entries(targets)) {
          const left = getWholeThumbnailScrollLeft(position * STRIDE, visible, CARD, GAP);
          expect(left, `${name} for ${originals} originals at ${visible} visible`).toBeGreaterThanOrEqual(0);
          expect(left, `${name} for ${originals} originals at ${visible} visible`).toBeLessThanOrEqual(maxScroll);
        }
      }
    }
  });
});

describe('getThumbnailLoopDirection', () => {
  it('recognizes forward and backward boundary wraps', () => {
    expect(getThumbnailLoopDirection(4, 0, 5)).toBe('forward');
    expect(getThumbnailLoopDirection(0, 4, 5)).toBe('backward');
  });

  it('does not treat ordinary navigation as a loop', () => {
    expect(getThumbnailLoopDirection(1, 2, 5)).toBeNull();
    expect(getThumbnailLoopDirection(2, 1, 5)).toBeNull();
    expect(getThumbnailLoopDirection(0, 0, 1)).toBeNull();
  });
});

describe('whole thumbnail track geometry', () => {
  it('snaps the available width down to complete 64px cards', () => {
    expect(getWholeThumbnailTrackLayout(169, 64, 8)).toEqual({
      visibleCount: 2,
      trackWidth: 136,
    });
    expect(getWholeThumbnailTrackLayout(439, 64, 8)).toEqual({
      visibleCount: 6,
      trackWidth: 424,
    });
  });

  it('accounts for inline padding and caps very wide tracks', () => {
    expect(getWholeThumbnailTrackLayout(1440, 64, 8, 8)).toEqual({
      visibleCount: 6,
      trackWidth: 440,
    });
  });

  it('aligns scrolling to card boundaries while keeping active and next visible', () => {
    expect(getWholeThumbnailScrollLeft(288, 2, 64, 8)).toBe(288);
    expect(getWholeThumbnailScrollLeft(288, 4, 64, 8)).toBe(216);
    expect(getWholeThumbnailScrollLeft(296, 6, 64, 8, 8)).toBe(144);
  });
});
