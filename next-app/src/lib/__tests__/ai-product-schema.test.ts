import { describe, expect, it } from 'vitest';
import {
  EMPTY_PRODUCT_AUTOFILL_FIELDS,
  MAX_PRODUCT_AUTOFILL_NOTES,
  PRODUCT_AUTOFILL_SCHEMA,
  buildMissingPricingNote,
  coerceProductAutofill,
  sanitizeBuyerFacingText,
} from '@/lib/ai-product-schema';
import {
  BUYER_FACING_COPY_GUARDRAILS,
  CURRENT_PRODUCT_FIELD_CONTRACT,
  DEFAULT_TIMEOUT_MS,
  ITERATIVE_LISTING_CONTRACT,
  aiTimeoutMessage,
  buildProductSystemPrompt,
  buildProductUserPrompt,
} from '@/lib/ai-product-provider';

describe('AI buyer-facing copy guardrails', () => {
  it('removes direct seller-attribution sentences and keeps them as a note', () => {
    const result = coerceProductAutofill({
      fields: {
        ...EMPTY_PRODUCT_AUTOFILL_FIELDS,
        title: 'Vintage bracelet. The seller suggests it is antique.',
        description: 'A polished link bracelet. According to the seller, it is solid gold.',
        public_notes: 'The seller says it is a family heirloom.',
      },
    });

    expect(result.fields.title).toBe('Vintage bracelet');
    expect(result.fields.description).toBe('A polished link bracelet');
    expect(result.fields.public_notes).toBeNull();
    expect(result.notes).toEqual(expect.arrayContaining([
      expect.stringContaining('The seller suggests it is antique.'),
      expect.stringContaining('According to the seller, it is solid gold.'),
      expect.stringContaining('The seller says it is a family heirloom.'),
    ]));
  });

  it('leaves ordinary buyer-facing copy unchanged', () => {
    expect(sanitizeBuyerFacingText('Yellow-tone bracelet with a polished finish.')).toEqual({
      value: 'Yellow-tone bracelet with a polished finish.',
      removed: [],
    });
  });

  it('appends the firewall to a saved custom prompt', () => {
    const prompt = buildProductSystemPrompt('Custom admin prompt.');
    expect(prompt.startsWith('Custom admin prompt.')).toBe(true);
    expect(prompt).toContain(CURRENT_PRODUCT_FIELD_CONTRACT);
    expect(prompt).toContain(ITERATIVE_LISTING_CONTRACT);
    expect(prompt.endsWith(BUYER_FACING_COPY_GUARDRAILS)).toBe(true);
  });

  it('keeps canonical length output rules in saved custom prompts', () => {
    const prompt = buildProductSystemPrompt('Custom admin prompt.');
    expect(prompt).toContain('24 in');
    expect(prompt).toContain('stored in INCHES');
    // A metric measurement must keep its unit so the form can convert it.
    expect(prompt).toContain('"470 mm"');
  });
});

describe('AI fill-the-form contract', () => {
  it('states the three rules and the short-notes shape, with no review step', () => {
    expect(ITERATIVE_LISTING_CONTRACT).toContain('already filled in currentListingFields is correct');
    expect(ITERATIVE_LISTING_CONTRACT).toContain('Fill every EMPTY field');
    expect(ITERATIVE_LISTING_CONTRACT).toContain('wins over a filled field');
    expect(ITERATIVE_LISTING_CONTRACT).toContain('at most 4 short plain-text lines');
    expect(ITERATIVE_LISTING_CONTRACT).not.toMatch(/confidence|follow_up_questions|assistant_message/);
  });

  it('builds a fill turn with the current listing and only the admin’s prior inputs', () => {
    const currentFields = {
      ...EMPTY_PRODUCT_AUTOFILL_FIELDS,
      title: 'Yellow-Tone Link Bracelet',
      product_type: 'Bracelet',
    };
    const prompt = JSON.parse(buildProductUserPrompt({
      transcript: 'The hallmark reads 14K and it weighs 18.2 grams.',
      images: ['/assets/example.webp'],
      schema: PRODUCT_AUTOFILL_SCHEMA,
      currentFields,
      priorInputs: ['Please create the listing.'],
    }));

    expect(prompt.task).toBe('fill_product_listing_fields');
    expect(prompt.latestUserInput).toContain('18.2 grams');
    expect(prompt.currentListingFields.title).toBe('Yellow-Tone Link Bracelet');
    expect(prompt.priorInputs).toEqual(['Please create the listing.']);
    expect(prompt.respondWith).toEqual({
      fields: expect.stringContaining('EVERY name'),
      notes: expect.stringContaining('at most 4 short lines'),
    });
  });

  it('leaves headroom under Netlify’s 60 s synchronous cap and names the seconds when it fires', () => {
    expect(DEFAULT_TIMEOUT_MS).toBeGreaterThanOrEqual(40_000);
    expect(DEFAULT_TIMEOUT_MS).toBeLessThanOrEqual(55_000);
    expect(aiTimeoutMessage(50_000)).toContain('50 seconds');
    expect(aiTimeoutMessage(50_000)).not.toContain('aborted');
  });
});

describe('AI notes', () => {
  it('adds the missing-pricing note first, then the model’s notes, and strips Markdown', () => {
    const result = coerceProductAutofill({
      fields: {
        ...EMPTY_PRODUCT_AUTOFILL_FIELDS,
        title: 'Yellow-Tone Link Bracelet',
        product_type: 'Bracelet',
        price_mode: 'spot-multiplier',
        pricing_multiplier: 1.5,
      },
      notes: ['**Brand**: no maker’s mark seen', '- Date: `estimated` from style'],
    });

    expect(result.notes).toEqual([
      'Not filled (needed for pricing): Purity, Weight (g).',
      'Brand: no maker’s mark seen',
      'Date: estimated from style',
    ]);
  });

  it('folds legacy warnings and uncertainties from older prompts into notes, without duplicates', () => {
    const result = coerceProductAutofill({
      fields: { ...EMPTY_PRODUCT_AUTOFILL_FIELDS, title: 'Sterling Brooch', purity: 925, weight_grams: 12 },
      notes: ['Length: not stated'],
      warnings: ['Length: not stated', 'The hallmark is partly worn.'],
      uncertainties: ['Maker mark unreadable.'],
    });

    expect(result.notes).toEqual([
      'Length: not stated',
      'The hallmark is partly worn.',
      'Maker mark unreadable.',
    ]);
  });

  it('caps the notes', () => {
    const result = coerceProductAutofill({
      fields: { ...EMPTY_PRODUCT_AUTOFILL_FIELDS, purity: 14, weight_grams: 5 },
      notes: Array.from({ length: 12 }, (_, index) => `Note ${index + 1}`),
    });
    expect(result.notes).toHaveLength(MAX_PRODUCT_AUTOFILL_NOTES);
  });

  it('names only the pricing facts a listing cannot be priced without', () => {
    expect(buildMissingPricingNote({ ...EMPTY_PRODUCT_AUTOFILL_FIELDS, price_mode: 'spot-multiplier', purity: 14 }))
      .toBe('Not filled (needed for pricing): Weight (g).');
    expect(buildMissingPricingNote({ ...EMPTY_PRODUCT_AUTOFILL_FIELDS, price_mode: 'manual' }))
      .toBe('Not filled (needed for pricing): Price Label.');
    expect(buildMissingPricingNote({ ...EMPTY_PRODUCT_AUTOFILL_FIELDS, price_mode: 'manual', asking_price: 1200 })).toBeNull();
    expect(buildMissingPricingNote({ ...EMPTY_PRODUCT_AUTOFILL_FIELDS, price_mode: 'spot-multiplier', purity: 925, weight_grams: 40 })).toBeNull();
  });
});

describe('AI measurement coercion', () => {
  it('accepts explicit necklace and bracelet widths in millimeters', () => {
    const bracelet = coerceProductAutofill({
      fields: {
        ...EMPTY_PRODUCT_AUTOFILL_FIELDS,
        product_type: 'Bracelet',
        width_mm: '12.345',
      },
    });
    const necklace = coerceProductAutofill({
      fields: {
        ...EMPTY_PRODUCT_AUTOFILL_FIELDS,
        product_type: 'Necklace',
        width_mm: '8 mm',
      },
    });

    expect(bracelet.fields.width_mm).toBe(12.35);
    expect(necklace.fields.width_mm).toBe(8);
  });

  it('normalizes plain and inch-suffixed AI length values identically', () => {
    for (const length of [24, '24', '24 in', '24 inches', '24"', '24.0 in']) {
      const result = coerceProductAutofill({
        fields: {
          ...EMPTY_PRODUCT_AUTOFILL_FIELDS,
          product_type: 'Necklace',
          length,
        },
      });
      expect(result.fields.length).toBe('24');
    }
  });

  it('converts a metric AI length to inches instead of storing the number as inches', () => {
    for (const [length, inches] of [['470 mm', '18.5'], ['47 cm', '18.5'], ['40mm', '1.57']] as const) {
      const result = coerceProductAutofill({
        fields: {
          ...EMPTY_PRODUCT_AUTOFILL_FIELDS,
          product_type: 'Necklace',
          length,
        },
      });
      expect(result.fields.length).toBe(inches);
    }
  });

  it('drops width for non-applicable product types and invalid measurements', () => {
    const ring = coerceProductAutofill({
      fields: {
        ...EMPTY_PRODUCT_AUTOFILL_FIELDS,
        product_type: 'Ring',
        width_mm: 9,
      },
    });
    const invalidBracelet = coerceProductAutofill({
      fields: {
        ...EMPTY_PRODUCT_AUTOFILL_FIELDS,
        product_type: 'Bracelet',
        width_mm: 1001,
      },
    });

    expect(ring.fields.width_mm).toBeNull();
    expect(invalidBracelet.fields.width_mm).toBeNull();
  });
});
