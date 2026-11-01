import { describe, expect, it } from 'vitest';
import {
  buildLengthPropertyPayload,
  findLengthProperty,
  parseWearableLengthInches,
  verifyLengthReadback,
  type LengthPropertyMatch,
} from '../length-experiment';
import type { EtsyTaxonomyProperty, EtsyListingPropertyValue } from '../client';

// Fixtures mirror the REAL shape confirmed live 2026-07-08 against
// getPropertiesByTaxonomyId for taxonomy 1196 (Bracelet) and 1048
// (Silverware) — see DECISIONS.md sessions 5 & 7. Property ids, scale ids,
// and the empty possible_values are the actual recorded live values, not
// invented; only `supportsAttributes`/`supportsVariations` (not printed in
// the original research dump) are reasonable representative fills.

const BRACELET_PROPERTIES: EtsyTaxonomyProperty[] = [
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
    propertyId: 47626759898,
    name: 'Width',
    displayName: 'Bracelet width',
    scales: [
      { scaleId: 7, displayName: 'Centimeters' },
      { scaleId: 11, displayName: 'Feet' },
      { scaleId: 5, displayName: 'Inches' },
      { scaleId: 10, displayName: 'Meters' },
      { scaleId: 4, displayName: 'Millimeters' },
      { scaleId: 9, displayName: 'Yards' },
    ],
    supportsAttributes: true,
    supportsVariations: false,
    possibleValues: [],
  },
  {
    propertyId: 47626759838,
    name: 'Length',
    displayName: 'Bracelet length',
    // Deliberately shuffled order — proves the match is by NAME, not by
    // "the Inches option happens to be at some fixed index."
    scales: [
      { scaleId: 9, displayName: 'Yards' },
      { scaleId: 7, displayName: 'Centimeters' },
      { scaleId: 5, displayName: 'Inches' },
      { scaleId: 11, displayName: 'Feet' },
      { scaleId: 10, displayName: 'Meters' },
      { scaleId: 4, displayName: 'Millimeters' },
    ],
    supportsAttributes: true,
    supportsVariations: false,
    possibleValues: [], // confirmed live: empty for this property
  },
];

// Silverware's generic Length property uses a COMPLETELY DIFFERENT property
// id and Inches scale id than Bracelet's — proves findLengthProperty never
// assumes either carries over from one category to another.
const SILVERWARE_PROPERTIES: EtsyTaxonomyProperty[] = [
  {
    propertyId: 506,
    name: 'Length',
    displayName: 'Length',
    scales: [
      { scaleId: 350, displayName: 'Inches' },
      { scaleId: 351, displayName: 'Centimeters' },
      { scaleId: 352, displayName: 'Other' },
    ],
    supportsAttributes: true,
    supportsVariations: false,
    possibleValues: [],
  },
];

const NO_LENGTH_PROPERTIES: EtsyTaxonomyProperty[] = [
  { propertyId: 1, name: 'Material multi', displayName: 'Materials', scales: [], supportsAttributes: true, supportsVariations: false, possibleValues: [] },
  { propertyId: 2, name: 'Gemstone type', displayName: 'Gemstone', scales: [], supportsAttributes: true, supportsVariations: false, possibleValues: [] },
];

describe('findLengthProperty', () => {
  it('finds Bracelet length (47626759838) and its real Inches scale id (5), not an assumed one', () => {
    const match = findLengthProperty(BRACELET_PROPERTIES);
    expect(match).toEqual({
      propertyId: 47626759838,
      propertyName: 'Bracelet length',
      inchesScaleId: 5,
      possibleValues: [],
    });
  });

  it("finds Silverware's generic Length (506) with its OWN Inches scale id (350) — different from Bracelet's, proving no cross-category assumption", () => {
    const match = findLengthProperty(SILVERWARE_PROPERTIES);
    expect(match?.propertyId).toBe(506);
    expect(match?.inchesScaleId).toBe(350);
  });

  it('never matches the Width property instead of Length', () => {
    const match = findLengthProperty(BRACELET_PROPERTIES);
    expect(match?.propertyId).not.toBe(47626759898);
  });

  it('returns null when no length-like property exists at all', () => {
    expect(findLengthProperty(NO_LENGTH_PROPERTIES)).toBeNull();
  });

  it('returns null when the matching property does not support attributes (would need updateListingInventory, not updateListingProperty)', () => {
    const properties: EtsyTaxonomyProperty[] = [
      {
        propertyId: 999,
        name: 'Length',
        displayName: 'Length',
        scales: [{ scaleId: 5, displayName: 'Inches' }],
        supportsAttributes: false,
        supportsVariations: true,
        possibleValues: [],
      },
    ];
    expect(findLengthProperty(properties)).toBeNull();
  });

  it('returns null when the matching property has no Inches scale (never falls back to another unit)', () => {
    const properties: EtsyTaxonomyProperty[] = [
      {
        propertyId: 999,
        name: 'Length',
        displayName: 'Length',
        scales: [{ scaleId: 7, displayName: 'Centimeters' }],
        supportsAttributes: true,
        supportsVariations: false,
        possibleValues: [],
      },
    ];
    expect(findLengthProperty(properties)).toBeNull();
  });
});

describe('buildLengthPropertyPayload — never a guessed value_id', () => {
  const braceletMatch: LengthPropertyMatch = {
    propertyId: 47626759838,
    propertyName: 'Bracelet length',
    inchesScaleId: 5,
    possibleValues: [],
  };

  // Confirmed live 2026-07-08 (session 8): a bare empty array (zero
  // value_ids on the wire) is rejected outright — "Missing input parameter:
  // [value_ids]". ['']  is a genuinely different request (one key, empty
  // value) — the current, owner-approved fallback.
  it("uses a single empty-string placeholder (never a guessed number) when there are no possible_values — the real Bracelet-length shape", () => {
    const payload = buildLengthPropertyPayload(braceletMatch, 7.75);
    expect(payload).toEqual({ propertyId: 47626759838, valueIds: [''], values: ['7.75'], scaleId: 5 });
  });

  // Direct regression test for the exact incident this feature exists to
  // prevent: value_ids must never be [scale_id] or [inches-derived-number].
  it('never sends value_ids: [5] (the scale_id) or any value derived from the inches number, even when the inches value coincides with a small "plausible-looking" id', () => {
    const payload = buildLengthPropertyPayload(braceletMatch, 5); // 5 inches — same number as the scale_id
    expect(payload.valueIds).toEqual(['']);
    expect(payload.valueIds).not.toEqual([5]);
    expect(payload.valueIds).not.toContain(5);
  });

  it('uses the real value_id from possible_values when one genuinely names the target length', () => {
    const matchWithValues: LengthPropertyMatch = {
      ...braceletMatch,
      possibleValues: [
        { valueId: 999111, name: '7.75 Inches' },
        { valueId: 999222, name: '8 Inches' },
      ],
    };
    const payload = buildLengthPropertyPayload(matchWithValues, 7.75);
    expect(payload.valueIds).toEqual([999111]);
  });

  it('falls back to the empty-string placeholder when no possible_values entry matches the target', () => {
    const matchWithValues: LengthPropertyMatch = {
      ...braceletMatch,
      possibleValues: [{ valueId: 999222, name: '8 Inches' }],
    };
    const payload = buildLengthPropertyPayload(matchWithValues, 7.75);
    expect(payload.valueIds).toEqual(['']);
  });

  it('always sends the plain numeric string in values, regardless of the possible_values path', () => {
    expect(buildLengthPropertyPayload(braceletMatch, 7.75).values).toEqual(['7.75']);
  });
});

describe('verifyLengthReadback — fails closed, a 200 is never enough on its own', () => {
  const expected = 7.75;

  function makeReadback(overrides: Partial<EtsyListingPropertyValue> = {}): EtsyListingPropertyValue {
    return {
      propertyId: 47626759838,
      propertyName: 'Bracelet length',
      scaleId: 5,
      scaleName: 'Inches',
      valueIds: [],
      values: ['7.75'],
      ...overrides,
    };
  }

  it('passes when the read-back exactly matches what was intended', () => {
    expect(verifyLengthReadback(makeReadback(), expected)).toEqual({ ok: true });
  });

  // The exact live incident (DECISIONS.md session 5): a 200 response whose
  // stored value was actually "Gray" — a color from an unrelated property.
  it('flags the real "Gray" incident as a mismatch, not a success', () => {
    const result = verifyLengthReadback(makeReadback({ values: ['Gray'] }), expected);
    expect(result.ok).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('flags a wrong numeric value', () => {
    expect(verifyLengthReadback(makeReadback({ values: ['5'] }), expected).ok).toBe(false);
  });

  it('flags a wrong scale (e.g. Centimeters instead of Inches)', () => {
    expect(verifyLengthReadback(makeReadback({ scaleName: 'Centimeters' }), expected).ok).toBe(false);
  });

  it('flags a property name that is not length-related', () => {
    expect(verifyLengthReadback(makeReadback({ propertyName: 'Gold purity' }), expected).ok).toBe(false);
  });

  it('flags an empty values array', () => {
    expect(verifyLengthReadback(makeReadback({ values: [] }), expected).ok).toBe(false);
  });
});

describe('parseWearableLengthInches', () => {
  it('accepts a bare decimal', () => {
    expect(parseWearableLengthInches('7.75')).toBe(7.75);
  });

  it('accepts an inch-unit suffix in a few forms', () => {
    expect(parseWearableLengthInches('7.75 inches')).toBe(7.75);
    expect(parseWearableLengthInches('7.75in')).toBe(7.75);
    expect(parseWearableLengthInches('7.75"')).toBe(7.75);
  });

  it('converts a millimetre or centimetre value to inches (the owner measures in mm)', () => {
    expect(parseWearableLengthInches('470 mm')).toBe(18.5);
    expect(parseWearableLengthInches('470mm')).toBe(18.5);
    expect(parseWearableLengthInches('47 cm')).toBe(18.5);
    expect(parseWearableLengthInches('40 millimeters')).toBe(1.57);
  });

  it('rejects a ring-size-style string', () => {
    expect(parseWearableLengthInches('size 7')).toBeNull();
  });

  it('rejects a range', () => {
    expect(parseWearableLengthInches('6 to 6.25 in')).toBeNull();
  });

  it('rejects missing/empty values', () => {
    expect(parseWearableLengthInches(null)).toBeNull();
    expect(parseWearableLengthInches('')).toBeNull();
  });
});
