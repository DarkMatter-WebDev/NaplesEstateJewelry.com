import { describe, expect, it } from 'vitest';
import { formatOrderAddress } from './sales';

describe('formatOrderAddress', () => {
  it('treats a country-only checkout object as an absent address', () => {
    expect(formatOrderAddress({ country: 'United States' })).toBeNull();
  });

  it('treats blank address fields as an absent address', () => {
    expect(formatOrderAddress({ address_line1: ' ', city: '', country: 'United States' })).toBeNull();
  });

  it('formats a real address and retains its country', () => {
    expect(formatOrderAddress({
      address_line1: '123 Fifth Ave S',
      city: 'Naples',
      state: 'FL',
      postal_code: '34102',
      country: 'United States',
    })).toBe('123 Fifth Ave S, Naples, FL, 34102, United States');
  });
});
