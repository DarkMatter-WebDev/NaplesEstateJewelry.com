import { describe, expect, it } from 'vitest';
import { findUnavailableCartItems } from '@/lib/cart-availability';

describe('findUnavailableCartItems', () => {
  it('returns sold, archived, and zero-stock cart items', () => {
    const items = [
      { id: 'available', status: 'available', stockQuantity: 1 },
      { id: 'sold', status: 'sold', stockQuantity: 1 },
      { id: 'archived', status: 'archived', stockQuantity: 1 },
      { id: 'empty', status: 'available', stockQuantity: 0 },
    ];

    expect(findUnavailableCartItems(items).map((item) => item.id)).toEqual([
      'sold',
      'archived',
      'empty',
    ]);
  });

  it('keeps legacy available items without a quantity purchasable', () => {
    expect(findUnavailableCartItems([{ id: 'legacy', status: 'available' }])).toEqual([]);
  });
});
