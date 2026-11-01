import { describe, expect, it } from 'vitest';
import type { CarouselItem, CarouselSettings } from '../../../carousel/lib/carouselData';
import {
  HOME_CAROUSEL_FALLBACK_SETTINGS,
  resolveHomeCarouselPayload,
} from '@/lib/home-carousel-payload';

const fallback: CarouselItem[] = [
  {
    id: 'fallback',
    imageUrl: '/fallback.webp',
    name: 'Fallback',
    priceLabel: null,
    href: '/shop',
    status: 'available',
    bgColor: null,
  },
];

const curated: CarouselItem[] = [
  {
    id: 'curated',
    imageUrl: 'https://example.com/curated.webp',
    name: 'Curated',
    priceLabel: '$1',
    href: '/shop/curated',
    status: 'available',
    bgColor: '#000000',
  },
];

const settings: CarouselSettings = {
  showPrice: false,
  bgColor: '#ffffff',
  bgColorAlt: '#000000',
  bgColorThird: '#ffffff',
  visibleCountDesktop: 6,
  visibleCountMobile: 4,
  selectionModePrimary: 'manual',
  selectionModeAlt: 'random_gold_jewelry',
  selectionModeThird: 'manual',
};

const altCurated: CarouselItem[] = [
  {
    id: 'alt-curated',
    imageUrl: 'https://example.com/alt.webp',
    name: 'Alt curated',
    priceLabel: null,
    href: '/shop/alt-curated',
    status: 'available',
    bgColor: '#ffffff',
  },
];

describe('resolveHomeCarouselPayload', () => {
  it('uses the server-curated list as the initial and only payload', () => {
    expect(
      resolveHomeCarouselPayload({ items: curated, altItems: altCurated, thirdItems: [], settings }, fallback),
    ).toEqual({
      items: curated,
      altItems: altCurated,
      thirdItems: [],
      settings,
      source: 'curated',
    });
  });

  it('keeps an empty alt lineup empty so the second slideshow mirrors the first', () => {
    expect(
      resolveHomeCarouselPayload({ items: curated, altItems: [], thirdItems: [], settings }, fallback),
    ).toEqual({
      items: curated,
      altItems: [],
      thirdItems: [],
      settings,
      source: 'curated',
    });
  });

  it('uses local assets when the server query fails', () => {
    expect(resolveHomeCarouselPayload(null, fallback)).toEqual({
      items: fallback,
      altItems: [],
      thirdItems: [],
      settings: HOME_CAROUSEL_FALLBACK_SETTINGS,
      source: 'fallback',
    });
  });

  it('uses local assets for an empty curated selection without discarding loaded settings', () => {
    expect(resolveHomeCarouselPayload({ items: [], altItems: altCurated, thirdItems: [], settings }, fallback)).toEqual({
      items: fallback,
      altItems: [],
      thirdItems: [],
      settings,
      source: 'fallback',
    });
  });
});
