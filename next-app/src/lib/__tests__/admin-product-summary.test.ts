import { describe, expect, it } from 'vitest';
import {
  ADMIN_PRODUCT_SUMMARY_COLUMNS,
  toAdminProductSummary,
} from '@/lib/admin-product-summary';

describe('admin product summaries', () => {
  it('keeps list fields and one complete image URL array without private editor content', () => {
    const summary = toAdminProductSummary({
      id: 'ring-1',
      title: 'Estate ring',
      status: 'available',
      sold_price: 1250,
      image_urls: ['https://example.com/one.webp', 'https://example.com/two.webp'],
      images: ['https://example.com/one.webp', 'https://example.com/two.webp'],
      description: 'Long public description',
      internal_notes: 'Private acquisition notes',
    });

    expect(summary.id).toBe('ring-1');
    expect(summary.sold_price).toBe(1250);
    expect(summary.image_urls).toEqual([
      'https://example.com/one.webp',
      'https://example.com/two.webp',
    ]);
    expect(summary.images).toEqual([]);
    expect(summary.description).toBeUndefined();
    expect(summary.internal_notes).toBeUndefined();
  });

  it('does not request full editor text or the mirrored legacy image array', () => {
    expect(ADMIN_PRODUCT_SUMMARY_COLUMNS).toContain('image_urls');
    expect(ADMIN_PRODUCT_SUMMARY_COLUMNS).toContain('sold_price');
    expect(ADMIN_PRODUCT_SUMMARY_COLUMNS).not.toContain('description');
    expect(ADMIN_PRODUCT_SUMMARY_COLUMNS.split(', ')).not.toContain('images');
    expect(ADMIN_PRODUCT_SUMMARY_COLUMNS).not.toContain('internal_notes');
  });
});
