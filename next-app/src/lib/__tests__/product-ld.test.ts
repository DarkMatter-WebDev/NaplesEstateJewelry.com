import { describe, expect, it } from 'vitest';
import { productOfferLd } from '../product-ld';
import { getProductPriceValue } from '../pricing';
import type { Product } from '@/types/product';

const URL_77 = 'https://naplesestatejewelry.com/shop/charm-bracelet-77';

describe('productOfferLd', () => {
  it('a sold item still carries a price (the recorded sale) with SoldOut and no validity window', () => {
    const offer = productOfferLd({ priceValue: 245, url: URL_77, isPurchasable: false, priceValidUntil: '2026-09-18' });
    expect(offer).toEqual({
      '@type': 'Offer',
      url: URL_77,
      priceCurrency: 'USD',
      price: '245',
      availability: 'https://schema.org/SoldOut',
      itemCondition: 'https://schema.org/UsedCondition',
      seller: { '@type': 'Organization', name: 'Naples Estate Jewelry' },
    });
    expect(offer).not.toHaveProperty('priceValidUntil');
  });

  it('an in-stock item carries price, InStock and priceValidUntil', () => {
    const offer = productOfferLd({ priceValue: 1460, url: URL_77, isPurchasable: true, priceValidUntil: '2026-09-18' });
    expect(offer?.price).toBe('1460');
    expect(offer?.availability).toBe('https://schema.org/InStock');
    expect(offer?.priceValidUntil).toBe('2026-09-18');
  });

  it('returns null when there is no numeric price, so the caller omits the Product schema', () => {
    for (const priceValue of [null, undefined, Number.NaN, -1]) {
      expect(productOfferLd({ priceValue, url: URL_77, isPurchasable: true, priceValidUntil: '2026-09-18' })).toBeNull();
    }
  });

  it('never emits a prose label as a price', () => {
    // Regression guard for the 2026-09-16 Search Console error: the schema
    // reads the price VALUE, so "Sold" / "Contact for price" can never leak in.
    const offer = productOfferLd({ priceValue: 0, url: URL_77, isPurchasable: false, priceValidUntil: '2026-09-18' });
    expect(offer?.price).toBe('0');
    expect(offer?.price).toMatch(/^\d+(\.\d+)?$/);
  });
});

describe('sold product → schema price source', () => {
  const base = {
    id: 'charm-bracelet-77',
    title: 'Charm bracelet',
    category: 'Silver',
    price_mode: 'manual',
    manual_price_label: '$300',
  } as unknown as Product;

  it('uses the recorded sale price when one exists', () => {
    const value = getProductPriceValue({ ...base, status: 'sold', sold_price: 245 } as Product, null);
    expect(productOfferLd({ priceValue: value, url: URL_77, isPurchasable: false, priceValidUntil: '2026-09-18' })?.price).toBe('245');
  });

  it('falls back to the last asking price when no sale price was recorded', () => {
    const value = getProductPriceValue({ ...base, status: 'sold', sold_price: null } as Product, null);
    expect(productOfferLd({ priceValue: value, url: URL_77, isPurchasable: false, priceValidUntil: '2026-09-18' })?.price).toBe('300');
  });
});
