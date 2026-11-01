import { describe, expect, it } from 'vitest';
import { sanitizeSocialCuration } from '@/lib/social-curation';

const crop = { x: 0.1, y: 0.2, w: 0.7, h: 0.7 };

describe('sanitizeSocialCuration', () => {
  it('keeps the saved lineup order, crops, card image, and card background', () => {
    expect(sanitizeSocialCuration(
      {
        image_selection: ['/two.jpg', '/one.jpg'],
        image_crops: { '/one.jpg': crop },
        card_source_url: '/two.jpg',
        card_background: '#F4EEDC',
      },
      ['/one.jpg', '/two.jpg'],
    )).toEqual({
      imageSelection: ['/two.jpg', '/one.jpg'],
      imageCrops: { '/one.jpg': crop },
      cardSourceUrl: '/two.jpg',
      cardBackground: '#f4eedc',
      droppedImages: 0,
    });
  });

  it('drops stale and duplicate lineup images plus orphaned photo settings', () => {
    expect(sanitizeSocialCuration(
      {
        image_selection: ['/kept.jpg', '/removed.jpg', '/kept.jpg'],
        image_crops: { '/kept.jpg': crop, '/removed.jpg': crop, '/not-selected.jpg': crop },
        card_source_url: '/removed.jpg',
        card_background: 'cream',
      },
      ['/kept.jpg', '/not-selected.jpg'],
    )).toEqual({
      imageSelection: ['/kept.jpg'],
      imageCrops: { '/kept.jpg': crop },
      cardSourceUrl: null,
      cardBackground: null,
      droppedImages: 1,
    });
  });

  it('preserves product-order mode and crops for any current product image', () => {
    expect(sanitizeSocialCuration(
      {
        image_selection: null,
        image_crops: { '/one.jpg': crop, '/gone.jpg': crop },
        card_source_url: '/two.jpg',
        card_background: null,
      },
      ['/one.jpg', '/two.jpg'],
    )).toEqual({
      imageSelection: null,
      imageCrops: { '/one.jpg': crop },
      cardSourceUrl: '/two.jpg',
      cardBackground: null,
      droppedImages: 0,
    });
  });
});
