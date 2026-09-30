import { describe, expect, it } from 'vitest';
import { compactShopCardProductImages, getMountedProductImageIndexes } from '@/lib/shop-card-images';
import type { Product } from '@/types/product';

describe('getMountedProductImageIndexes', () => {
  it('mounts only the cover before carousel interaction', () => {
    expect(getMountedProductImageIndexes(8, 0, false)).toEqual([0]);
  });

  it('mounts the active image and immediate neighbors after interaction', () => {
    expect(getMountedProductImageIndexes(8, 4, true)).toEqual([3, 4, 5]);
  });

  it('does not exceed the image bounds at either end', () => {
    expect(getMountedProductImageIndexes(8, 0, true)).toEqual([0, 1]);
    expect(getMountedProductImageIndexes(8, 7, true)).toEqual([6, 7]);
  });

  it('handles empty and single-image galleries', () => {
    expect(getMountedProductImageIndexes(0, 0, false)).toEqual([]);
    expect(getMountedProductImageIndexes(1, 0, true)).toEqual([0]);
  });
});

describe('compactShopCardProductImages', () => {
  it('keeps the preferred image array and converts padding to index keys', () => {
    const product = {
      image_urls: ['primary.webp', 'detail.webp'],
      images: ['duplicate-primary.webp', 'duplicate-detail.webp'],
      image_padding: 'white',
      image_padding_by_image: {
        'primary.webp': 'black',
        'detail.webp': 'white',
      },
    } as unknown as Product;

    expect(compactShopCardProductImages(product)).toMatchObject({
      image_urls: ['primary.webp', 'detail.webp'],
      images: [],
      image_padding_by_image: { 0: 'black' },
    });
  });

  it('retains legacy images when no image_urls are present', () => {
    const product = {
      image_urls: [],
      images: ['legacy.webp'],
      image_padding: 'none',
      image_padding_by_image: null,
    } as unknown as Product;

    expect(compactShopCardProductImages(product)).toMatchObject({
      image_urls: [],
      images: ['legacy.webp'],
      image_padding_by_image: null,
    });
  });
});
