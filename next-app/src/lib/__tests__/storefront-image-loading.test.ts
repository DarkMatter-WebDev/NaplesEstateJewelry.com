import { describe, expect, it } from 'vitest';
import { carouselImageLoading, productThumbnailLoading } from '@/lib/storefront-image-loading';

describe('storefront image loading', () => {
  it('eager-loads visible carousel cards while prioritizing only the front slot', () => {
    expect(carouselImageLoading(0)).toEqual({ loading: 'eager', fetchPriority: 'high' });
    // Slot 1 is `auto`, not `low` — see below.
    expect(carouselImageLoading(1)).toEqual({ loading: 'eager', fetchPriority: 'auto' });
    expect(carouselImageLoading(2)).toEqual({ loading: 'eager', fetchPriority: 'low' });
  });

  // REGRESSION 2026-08-30. Owner-reported: on a cold load the SECOND card stayed
  // blank until it had nearly rotated off-screen. Priority was binary (slot 0
  // high, all others low) while urgency is graduated — slot 1 is adjacent to the
  // front card and among the first seen, yet it shared a bandwidth lane with
  // slot 7, which is not seen for far longer.
  it('gives the next-visible card its own lane, without touching the LCP lane', () => {
    expect(carouselImageLoading(1).fetchPriority).toBe('auto');
    // NOT 'high': that lane belongs to the front card alone.
    expect(carouselImageLoading(1).fetchPriority).not.toBe('high');
    // NOT 'low': that is the starvation this fixes.
    expect(carouselImageLoading(1).fetchPriority).not.toBe('low');
    // The 2026-08-14 bandwidth fix still holds for the REST of the ring.
    for (const slot of [2, 3, 4, 5, 6, 7]) {
      expect(carouselImageLoading(slot).fetchPriority).toBe('low');
    }
  });

  it('a parked pane gets no exception — slot 1 included', () => {
    // Panes B and C are offscreen; nothing in them should out-rank the visible
    // hero, so the slot-1 exception must not leak into the deferred path.
    expect(carouselImageLoading(1, true).fetchPriority).toBe('low');
  });

  it('never lets a parked slideshow claim the LCP priority lane', () => {
    // Hero panes B and C mount offscreen. They must still load eagerly — a card
    // decoding as it rotates in is the pop-in the hero exists to avoid — but
    // their front slot must not compete with the visible hero image.
    expect(carouselImageLoading(0, true)).toEqual({ loading: 'eager', fetchPriority: 'low' });
    expect(carouselImageLoading(1, true)).toEqual({ loading: 'eager', fetchPriority: 'low' });
  });

  // REGRESSION 2026-08-14. These two cases previously asserted `auto`, which let
  // NINE carousel images (157KB) compete for bandwidth with the 21KB stylesheet
  // that is the only resource actually blocking the first pixel — measured at
  // 533KB across 30 requests before FCP on production. `low` keeps them eager
  // (no pop-in) while making them yield.
  //
  // The two invariants the original tests protected are unchanged and asserted
  // below: exactly one image may claim `high`, and it is never a parked pane.
  it('lets exactly one image claim the high-priority lane, and never a parked one', () => {
    const visible = [0, 1, 2, 3, 4, 5].map((s) => carouselImageLoading(s, false));
    const parked = [0, 1, 2, 3, 4, 5].map((s) => carouselImageLoading(s, true));

    expect(visible.filter((v) => v.fetchPriority === 'high')).toHaveLength(1);
    expect(visible[0].fetchPriority).toBe('high');
    expect(parked.filter((v) => v.fetchPriority === 'high')).toHaveLength(0);

    // At most ONE card may sit at `auto`. The 2026-08-14 regression was nine of
    // them at once (157KB competing before FCP); one small image is not that.
    expect(visible.filter((v) => v.fetchPriority === 'auto').length).toBeLessThanOrEqual(1);
    expect(parked.filter((v) => v.fetchPriority === 'auto')).toHaveLength(0);

    // Every card still downloads — `lazy` here would reintroduce pop-in.
    expect([...visible, ...parked].every((v) => v.loading === 'eager')).toBe(true);
  });

  it('eager-loads only the thumbnail that duplicates the initial product hero', () => {
    expect(productThumbnailLoading(0)).toBe('eager');
    expect(productThumbnailLoading(1)).toBe('lazy');
  });
});
