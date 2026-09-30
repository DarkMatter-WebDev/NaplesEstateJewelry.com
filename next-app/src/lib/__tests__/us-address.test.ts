import { describe, expect, it } from 'vitest';
import {
  isUnitedStatesCountry,
  normalizeUsState,
  normalizeUsZip,
  validateUsShippingAddress,
} from '@/lib/us-address';

describe('U.S. checkout address normalization', () => {
  it('normalizes state names and abbreviations to USPS codes', () => {
    expect(normalizeUsState('Florida')).toBe('FL');
    expect(normalizeUsState(' fl. ')).toBe('FL');
    expect(normalizeUsState('District of Columbia')).toBe('DC');
    expect(normalizeUsState('Floridda')).toBeNull();
  });

  it('accepts ZIP and ZIP+4 while returning a canonical value', () => {
    expect(normalizeUsZip('34102')).toBe('34102');
    expect(normalizeUsZip('341021234')).toBe('34102-1234');
    expect(normalizeUsZip('34102 1234')).toBe('34102-1234');
    expect(normalizeUsZip('A1A 1A1')).toBeNull();
  });

  it('recognizes U.S. aliases and rejects international countries', () => {
    expect(isUnitedStatesCountry('United States')).toBe(true);
    expect(isUnitedStatesCountry('USA')).toBe(true);
    expect(isUnitedStatesCountry('CA')).toBe(false);
    expect(isUnitedStatesCountry('Canada')).toBe(false);
  });

  it('returns a normalized domestic address', () => {
    expect(validateUsShippingAddress({
      line1: ' 123 Main St ',
      line2: ' Unit 4 ',
      city: ' Naples ',
      state: 'Florida',
      postalCode: '341021234',
      country: 'USA',
    })).toEqual({
      address: {
        line1: '123 Main St',
        line2: 'Unit 4',
        city: 'Naples',
        state: 'FL',
        postalCode: '34102-1234',
        country: 'United States',
        countryCode: 'US',
      },
    });
  });

  it('rejects invalid state, ZIP, and international destinations', () => {
    const base = {
      line1: '123 Main St',
      city: 'Naples',
      state: 'FL',
      postalCode: '34102',
      country: 'United States',
    };
    expect(validateUsShippingAddress({ ...base, state: 'Floridda' })).toEqual({
      error: 'Select a valid U.S. state.',
    });
    expect(validateUsShippingAddress({ ...base, postalCode: '3410' })).toEqual({
      error: 'Enter a valid U.S. ZIP code (12345 or 12345-6789).',
    });
    expect(validateUsShippingAddress({ ...base, country: 'Canada' })).toEqual({
      error: 'Shipping is currently available only to addresses in the United States.',
    });
  });
});
