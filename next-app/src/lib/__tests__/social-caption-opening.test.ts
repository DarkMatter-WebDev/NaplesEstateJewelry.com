import { describe, expect, it } from 'vitest';
import type { Product } from '@/types/product';
import {
  extractSocialCaptionOpening,
  fallbackSocialCaptionOpening,
  getPreparedSocialCaption,
  normalizeSocialCaptionDirection,
  normalizeSocialCaptionOpening,
  validateEditedSocialCaptionOpening,
} from '@/lib/social-caption-opening';

const TITLE = 'Heavy Italian 14K Yellow Gold Cuban Link Bracelet';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'test-product',
    title: TITLE,
    status: 'available',
    ...overrides,
  } as Product;
}

describe('social caption opening', () => {
  it('keeps the reviewed caption available while a prepared post is queued', () => {
    expect(getPreparedSocialCaption('Reviewed caption.', ['social/card.jpg'])).toBe('Reviewed caption.');
    expect(getPreparedSocialCaption('Reviewed caption.', [])).toBeNull();
    expect(getPreparedSocialCaption(null, ['social/card.jpg'])).toBeNull();
  });

  it('combines availability and the exact title in its safe fallback', () => {
    expect(fallbackSocialCaptionOpening(makeProduct())).toBe(`Available now: ${TITLE}.`);
  });

  it('accepts one personable sentence containing the exact title', () => {
    const opening = `We’re happy to share the ${TITLE}, available now.`;
    expect(normalizeSocialCaptionOpening(opening, makeProduct())).toBe(opening);
  });

  it('rejects ownership wording in generated or edited openers', () => {
    const product = makeProduct();
    expect(normalizeSocialCaptionOpening(`Our ${TITLE} is available now.`, product)).toBeNull();
    expect(validateEditedSocialCaptionOpening('Our heavy Italian bracelet is available now.', product)).toBeNull();
  });

  it('allows an admin-edited sentence without repeating the exact catalog title', () => {
    const opening = 'This heavy Italian bracelet is available now.';
    expect(validateEditedSocialCaptionOpening(opening, makeProduct())).toBe(opening);
  });

  it('accepts a natural this-based AI sentence without the exact catalog title', () => {
    const opening = 'This heavy Italian 14K yellow gold Cuban link bracelet is available now.';
    expect(
      normalizeSocialCaptionOpening(opening, makeProduct(), {
        requireExactTitle: false,
        requireProductReference: true,
      }),
    ).toBe(opening);
  });

  it('expands Tiffany references to Tiffany & Co. in social openers', () => {
    const product = makeProduct({
      title: 'Vintage Tiffany and Co. 18K Tricolor Gold Cuban Curb Link Bracelet',
      brand: 'Tiffany',
    });
    expect(fallbackSocialCaptionOpening(product)).toBe(
      'Available now: Vintage Tiffany & Co. 18K Tricolor Gold Cuban Curb Link Bracelet.',
    );
    expect(
      normalizeSocialCaptionOpening(
        'Hard to walk past a vintage Tiffany tricolor gold Cuban curb bracelet like this one—it’s available now.',
        product,
        { requireExactTitle: false, requireProductReference: true },
      ),
    ).toBe('Hard to walk past a vintage Tiffany & Co. tricolor gold Cuban curb bracelet like this one — it’s available now.');
  });

  it('puts one space on each side of typographic dashes', () => {
    const product = makeProduct();
    expect(
      validateEditedSocialCaptionOpening(
        'This heavy Italian bracelet—and it’s available now.',
        product,
      ),
    ).toBe('This heavy Italian bracelet — and it’s available now.');
    expect(
      validateEditedSocialCaptionOpening(
        'This heavy Italian bracelet –and it’s available now.',
        product,
      ),
    ).toBe('This heavy Italian bracelet – and it’s available now.');
  });

  it('rejects a vague generated opener that does not identify the product', () => {
    expect(
      normalizeSocialCaptionOpening('This one is available now.', makeProduct(), {
        requireExactTitle: false,
        requireProductReference: true,
      }),
    ).toBeNull();
  });

  it('rejects stale titles, links, hashtags, inventory numbers and a second sentence', () => {
    const product = makeProduct();
    expect(normalizeSocialCaptionOpening('Available now: Another Bracelet.', product)).toBeNull();
    expect(normalizeSocialCaptionOpening(`${TITLE} — https://example.com`, product)).toBeNull();
    expect(normalizeSocialCaptionOpening(`${TITLE} #gold`, product)).toBeNull();
    expect(normalizeSocialCaptionOpening(`${TITLE}, inventory #21.`, product)).toBeNull();
    expect(normalizeSocialCaptionOpening(`${TITLE} is available now. Take a look.`, product)).toBeNull();
    expect(normalizeSocialCaptionOpening(`"${TITLE} is available now."`, product)).toBeNull();
  });

  it('rejects an availability claim after the product is sold', () => {
    expect(
      normalizeSocialCaptionOpening(`${TITLE} is available now.`, makeProduct({ status: 'sold' })),
    ).toBeNull();
  });

  it('extracts a valid first paragraph from a prepared caption', () => {
    const opening = `We’re happy to share the ${TITLE}, available now.`;
    expect(extractSocialCaptionOpening(`${opening}\n\n14K Yellow Gold · 53.91g`, makeProduct())).toBe(opening);
  });

  it('normalizes optional operator direction and rejects oversized guidance', () => {
    expect(normalizeSocialCaptionDirection('  Warm and   conversational.  ')).toBe(
      'Warm and conversational.',
    );
    expect(normalizeSocialCaptionDirection('   ')).toBeNull();
    expect(normalizeSocialCaptionDirection('x'.repeat(401))).toBeNull();
  });
});
