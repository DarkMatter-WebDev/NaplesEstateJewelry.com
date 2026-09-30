import { describe, expect, it } from 'vitest';
import { cumulativeImageProgress } from '../progress';

describe('cumulativeImageProgress', () => {
  it('keeps the original total and advances completed images across batches', () => {
    const fixedTotal = 17;

    expect(cumulativeImageProgress({ step: 'images', uploaded: 4, total: 17 }, fixedTotal)).toEqual({
      step: 'images',
      uploaded: 4,
      total: 17,
    });
    expect(cumulativeImageProgress({ step: 'images', uploaded: 4, total: 13 }, fixedTotal)).toEqual({
      step: 'images',
      uploaded: 8,
      total: 17,
    });
    expect(cumulativeImageProgress({ step: 'images', uploaded: 4, total: 9 }, fixedTotal)).toEqual({
      step: 'images',
      uploaded: 12,
      total: 17,
    });
  });

  it('counts only successful work when a batch partially fails', () => {
    expect(cumulativeImageProgress({ step: 'images', uploaded: 3, total: 13 }, 17)).toEqual({
      step: 'images',
      uploaded: 7,
      total: 17,
    });
  });
});
