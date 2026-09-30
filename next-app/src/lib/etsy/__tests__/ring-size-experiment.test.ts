import { describe, expect, it } from 'vitest';
import {
  buildRingSizePayload,
  decimalToRingSizeFraction,
  findRingSizeProperty,
  parseRingSize,
  verifyRingSizeReadback,
  type RingSizePropertyMatch,
} from '../ring-size-experiment';
import type { EtsyTaxonomyProperty, EtsyListingPropertyValue } from '../client';

// Fixtures use the REAL possible_values confirmed live 2026-07-08 (session 9)
// against getPropertiesByTaxonomyId for taxonomy 1240 (Ring), property
// 54142602013 ("Ring size", 230 possible_values total). US/CA is scale_id
// 20; UK/AU (scale_id 21) uses letter notation ("A", "A 1/2", "B"...) for
// completely different physical sizes — real proof that scale-scoping
// matters, not a hypothetical.
const RING_PROPERTIES: EtsyTaxonomyProperty[] = [
  {
    propertyId: 148789511893,
    name: 'Material multi',
    displayName: 'Materials',
    scales: [],
    supportsAttributes: true,
    supportsVariations: false,
    possibleValues: [{ valueId: 5261, name: 'Gold', scaleId: null }],
  },
  {
    propertyId: 54142602013,
    name: 'Ring size',
    displayName: 'Ring size',
    // Deliberately shuffled — proves the US/CA match is by NAME, not index.
    scales: [
      { scaleId: 22, displayName: 'FR' },
      { scaleId: 20, displayName: 'US/CA' },
      { scaleId: 23, displayName: 'DE' },
      { scaleId: 21, displayName: 'UK/AU' },
    ],
    supportsAttributes: true,
    supportsVariations: true,
    possibleValues: [
      { valueId: 1525, name: '6', scaleId: 20 },
      { valueId: 1536, name: '6 1/2', scaleId: 20 },
      { valueId: 1542, name: '7', scaleId: 20 },
      { valueId: 1548, name: '7 1/4', scaleId: 20 },
      { valueId: 1551, name: '7 1/2', scaleId: 20 },
      { valueId: 1557, name: '7 3/4', scaleId: 20 },
      { valueId: 1559, name: '8', scaleId: 20 },
      // UK/AU letter notation — same property, different scale, unrelated names/ids.
      { valueId: 1442, name: 'A', scaleId: 21 },
      { valueId: 1444, name: 'A 1/2', scaleId: 21 },
      { valueId: 1446, name: 'B', scaleId: 21 },
    ],
  },
];

const NO_RING_SIZE_PROPERTIES: EtsyTaxonomyProperty[] = [
  { propertyId: 1, name: 'Material multi', displayName: 'Materials', scales: [], supportsAttributes: true, supportsVariations: false, possibleValues: [] },
];

describe('decimalToRingSizeFraction', () => {
  it('converts whole numbers', () => {
    expect(decimalToRingSizeFraction(7)).toBe('7');
    expect(decimalToRingSizeFraction(8)).toBe('8');
  });

  it('converts quarter increments', () => {
    expect(decimalToRingSizeFraction(7.25)).toBe('7 1/4');
    expect(decimalToRingSizeFraction(7.5)).toBe('7 1/2');
    expect(decimalToRingSizeFraction(7.75)).toBe('7 3/4');
  });

  it('rounds a non-quarter decimal to the nearest quarter', () => {
    expect(decimalToRingSizeFraction(7.1)).toBe('7');
    expect(decimalToRingSizeFraction(7.4)).toBe('7 1/2');
  });

  it('rounds up to the next whole size when the fraction rounds to 4/4', () => {
    expect(decimalToRingSizeFraction(7.9)).toBe('8');
  });
});

describe('parseRingSize', () => {
  it('accepts a bare decimal (the common stored format)', () => {
    expect(parseRingSize('7.5')).toBe(7.5);
    expect(parseRingSize('7')).toBe(7);
  });

  it('accepts the defensive "Size: N" / "size N" form', () => {
    expect(parseRingSize('Size: 7.5')).toBe(7.5);
    expect(parseRingSize('size 7')).toBe(7);
  });

  it('rejects a range or free text', () => {
    expect(parseRingSize('6 to 6.5')).toBeNull();
    expect(parseRingSize('adjustable')).toBeNull();
  });

  it('rejects missing/empty values', () => {
    expect(parseRingSize(null)).toBeNull();
    expect(parseRingSize('')).toBeNull();
  });
});

describe('findRingSizeProperty', () => {
  it('finds Ring size (54142602013) and its US/CA scale id (20), scoping possible_values to that scale only', () => {
    const match = findRingSizeProperty(RING_PROPERTIES);
    expect(match?.propertyId).toBe(54142602013);
    expect(match?.usScaleId).toBe(20);
    // Only the 7 US/CA-scoped entries — the 3 UK/AU letter entries are excluded.
    expect(match?.possibleValues).toHaveLength(7);
    expect(match?.possibleValues.some((v) => v.name === 'A')).toBe(false);
  });

  it('returns null when no Ring size property exists', () => {
    expect(findRingSizeProperty(NO_RING_SIZE_PROPERTIES)).toBeNull();
  });

  it('returns null when the matching property has no US/CA-ish scale', () => {
    const properties: EtsyTaxonomyProperty[] = [
      {
        propertyId: 999,
        name: 'Ring size',
        displayName: 'Ring size',
        scales: [{ scaleId: 21, displayName: 'UK/AU' }],
        supportsAttributes: true,
        supportsVariations: true,
        possibleValues: [{ valueId: 1, name: 'A', scaleId: 21 }],
      },
    ];
    expect(findRingSizeProperty(properties)).toBeNull();
  });
});

describe('buildRingSizePayload — only ever a real, matched value_id, never a guess', () => {
  const match: RingSizePropertyMatch = findRingSizeProperty(RING_PROPERTIES) as RingSizePropertyMatch;

  it('finds the real value_id for a whole size', () => {
    const payload = buildRingSizePayload(match, 7);
    expect(payload).toEqual({ propertyId: 54142602013, valueIds: [1542], values: ['7'], scaleId: 20 });
  });

  it('finds the real value_id for a half size', () => {
    const payload = buildRingSizePayload(match, 7.5);
    expect(payload).toEqual({ propertyId: 54142602013, valueIds: [1551], values: ['7 1/2'], scaleId: 20 });
  });

  it('finds the real value_id for a quarter size', () => {
    const payload = buildRingSizePayload(match, 6.5);
    expect(payload).toEqual({ propertyId: 54142602013, valueIds: [1536], values: ['6 1/2'], scaleId: 20 });
  });

  // The core safety guarantee: an unmatched size returns null (unsupported),
  // never a fabricated id and never the empty-string placeholder Length uses
  // (that mechanism was never proven for an enumerated property like this).
  it('returns null (never a placeholder, never a guess) when no chart entry matches the target size', () => {
    const payload = buildRingSizePayload(match, 99);
    expect(payload).toBeNull();
  });
});

describe('verifyRingSizeReadback — fails closed', () => {
  const expected = 7.5;

  function makeReadback(overrides: Partial<EtsyListingPropertyValue> = {}): EtsyListingPropertyValue {
    return {
      propertyId: 54142602013,
      propertyName: 'Ring size',
      scaleId: 20,
      scaleName: 'US/CA',
      valueIds: [1551],
      values: ['7 1/2'],
      ...overrides,
    };
  }

  it('passes when the read-back exactly matches what was intended', () => {
    expect(verifyRingSizeReadback(makeReadback(), expected)).toEqual({ ok: true });
  });

  it('flags a wrong size', () => {
    expect(verifyRingSizeReadback(makeReadback({ values: ['8'] }), expected).ok).toBe(false);
  });

  it('flags a value in an unrecognized/unparsable format (e.g. UK/AU letter notation leaking through)', () => {
    expect(verifyRingSizeReadback(makeReadback({ values: ['A 1/2'] }), expected).ok).toBe(false);
  });

  it('flags a wrong scale (e.g. UK/AU instead of US/CA)', () => {
    expect(verifyRingSizeReadback(makeReadback({ scaleName: 'UK/AU' }), expected).ok).toBe(false);
  });

  it('flags a property name that is not Ring size', () => {
    expect(verifyRingSizeReadback(makeReadback({ propertyName: 'Gold purity' }), expected).ok).toBe(false);
  });

  it('flags an empty values array', () => {
    expect(verifyRingSizeReadback(makeReadback({ values: [] }), expected).ok).toBe(false);
  });
});
