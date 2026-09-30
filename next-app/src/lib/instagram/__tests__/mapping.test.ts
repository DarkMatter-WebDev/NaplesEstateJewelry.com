import { describe, expect, it } from 'vitest';
import type { Product, SpotData } from '@/types/product';
import {
  INSTAGRAM_FORBIDDEN_PRODUCT_FIELDS,
  buildCardSpecs,
  buildHashtags,
  buildInstagramPost,
  buildSpecLine,
  computeInstagramContentHash,
  formatCaptionPrice,
  resolveImageLineup,
  sentenceSummary,
} from '../mapping';
import {
  INSTAGRAM_MAX_CAROUSEL_ITEMS,
  INSTAGRAM_MAX_HASHTAGS,
  INSTAGRAM_MAX_PHOTO_ITEMS,
} from '../client';

const LIVE_SPOT: SpotData = {
  goldPerTroyOz: 4044,
  silverPerTroyOz: 57.69,
  fetchedAt: Date.parse('2026-07-31T20:00:00Z'),
  source: 'api',
};

const FALLBACK_SPOT: SpotData = { ...LIVE_SPOT, source: 'fallback' };

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'test-product-id',
    category: 'Gold',
    metal_type: 'Gold',
    metal_variant: 'yellow_gold',
    title: 'Heavy Italian 14K Yellow Gold Cuban Link Bracelet',
    title_es: 'Pesada Pulsera Italiana de Oro Amarillo de 14K',
    price_label: null,
    manual_price_label: null,
    price_mode: 'spot-multiplier',
    purity: 14,
    weight_grams: 53.91,
    inventory_number: 21,
    sku: null,
    slug: 'test-product',
    metal: 'gold',
    gram_weight: 53.91,
    stone_details: null,
    brand: null,
    product_type: 'Bracelet',
    jewelry_type: 'Bracelet',
    chain_type: 'Cuban link',
    length: '7.75',
    pricing_multiplier: 1.5,
    show_spot_price: true,
    special_price_override_enabled: false,
    special_price_override_amount: null,
    special_price_override_mode: 'amount',
    special_price_override_percent: null,
    quantity: 1,
    status: 'available',
    location: null,
    images: [],
    image_urls: [
      'https://example.supabase.co/storage/v1/object/public/product-images/products/a.webp',
      'https://example.supabase.co/storage/v1/object/public/product-images/products/b.webp',
    ],
    image_padding: 'none',
    image_padding_by_image: null,
    description: 'A heavy Italian bracelet in excellent condition. Solid gold throughout. Third sentence here.',
    description_es: 'Una pesada pulsera italiana en excelente estado. Segunda frase.',
    details: [],
    details_es: [],
    tags: ['estate jewelry', 'cuban link'],
    tags_es: [],
    private_price_label: 'SECRET-PRIVATE-LABEL',
    gender: null,
    item_year: 1960,
    cost_basis: 999999,
    melt_value: 888888,
    asking_price: null,
    minimum_price: 777777,
    live_spot_snapshot: { secret: 'do-not-leak' },
    acquisition_date: '2020-01-01',
    acquisition_source: 'SECRET-SOURCE',
    internal_notes: 'SECRET-INTERNAL-NOTE',
    public_notes: null,
    public_notes_es: null,
    featured: false,
    sort_order: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('formatCaptionPrice', () => {
  it('formats whole dollars with separators', () => {
    expect(formatCaptionPrice(1718.19)).toBe('$1,718');
    expect(formatCaptionPrice(49)).toBe('$49');
  });
});

describe('sentenceSummary', () => {
  it('does not split on a decimal point inside a measurement', () => {
    // Regression: "Measures 7.75 inches." used to truncate to "Measures 7."
    const text = 'A solid gold bracelet. Measures 7.75 inches long. Third sentence.';
    expect(sentenceSummary(text, 2)).toBe('A solid gold bracelet. Measures 7.75 inches long.');
  });

  it('limits to the requested number of sentences', () => {
    expect(sentenceSummary('One. Two. Three.', 1)).toBe('One.');
  });

  it('returns null for empty input', () => {
    expect(sentenceSummary(null)).toBeNull();
    expect(sentenceSummary('   ')).toBeNull();
  });

  it('handles text with no terminator', () => {
    expect(sentenceSummary('No terminator here', 2)).toBe('No terminator here');
  });
});

describe('buildSpecLine', () => {
  it('joins only the facts that exist', () => {
    const line = buildSpecLine(makeProduct());
    expect(line).toContain('14K');
    expect(line).toContain('53.91g');
    expect(line).toContain('7.75 in');
    expect(line).toContain('ca. 1960');
    expect(line).toContain('Inventory 21');
  });

  it('writes the inventory number without a "#" so Instagram cannot auto-link it', () => {
    // Regression from the first live post: "Inventory #21" rendered as a
    // clickable #21 hashtag linking to an unrelated tag page, and Instagram
    // captions cannot be edited after publishing.
    const line = buildSpecLine(makeProduct({ inventory_number: 21 }));
    expect(line).toContain('Inventory 21');
    expect(line).not.toContain('#');
  });

  it('omits missing fields without leaving empty separators', () => {
    const line = buildSpecLine(
      makeProduct({ length: null, item_year: null, inventory_number: null, gram_weight: null, weight_grams: null }),
    );
    expect(line).not.toContain('· ·');
    expect(line).not.toMatch(/·\s*$/);
    expect(line).not.toContain('undefined');
  });

  it('does not double a unit when length already carries one', () => {
    expect(buildSpecLine(makeProduct({ length: '18 in' }))).toContain('18 in');
    expect(buildSpecLine(makeProduct({ length: '18 in' }))).not.toContain('18 in in');
  });
});

describe('buildHashtags', () => {
  it('normalizes tags and dedupes case-insensitively', () => {
    const tags = buildHashtags(makeProduct({ tags: ['Estate Jewelry', 'estate jewelry'] }), ['EstateJewelry']);
    expect(tags.filter((t) => t === 'estatejewelry')).toHaveLength(1);
  });

  it('always canonicalizes direct Tiffany brand hashtags to tiffanyandco', () => {
    const tags = buildHashtags(
      makeProduct({
        brand: 'Tiffany & Co.',
        tags: ['Tiffany', '#tiffanyco', 'Tiffany and Company'],
      }),
      ['tiffanyandco'],
    );

    expect(tags.filter((tag) => tag === 'tiffanyandco')).toHaveLength(1);
    expect(tags).not.toContain('tiffany');
    expect(tags).not.toContain('tiffanyco');
  });

  it('strips punctuation and drops fragments shorter than three characters', () => {
    const tags = buildHashtags(makeProduct({ tags: ['14k!', 'a', 'ok'] }), []);
    expect(tags).toContain('14k');
    expect(tags).not.toContain('a');
    expect(tags).not.toContain('ok');
  });

  it('excludes internal prefixed taxonomy tags from public hashtags', () => {
    // Regression from the first live preview: jt:/ct:/len: tags produced
    // #jtbracelet, #ctcubanlink and #len775 on a public post.
    const tags = buildHashtags(
      makeProduct({ tags: ['jt:Bracelet', 'ct:Cuban link', 'len:7.75', 'estate jewelry'] }),
      [],
    );
    expect(tags).toContain('estatejewelry');
    expect(tags).not.toContain('jtbracelet');
    expect(tags).not.toContain('ctcubanlink');
    expect(tags).not.toContain('len775');
  });

  it('never exceeds Instagram\'s hashtag cap', () => {
    const many = Array.from({ length: 60 }, (_, i) => `tagnumber${i}`);
    expect(buildHashtags(makeProduct({ tags: many }), many).length).toBeLessThanOrEqual(
      INSTAGRAM_MAX_HASHTAGS,
    );
  });
});

describe('resolveImageLineup', () => {
  const images = ['a.webp', 'b.webp', 'c.webp'];

  it('falls back to product order when there is no selection', () => {
    expect(resolveImageLineup({ productImages: images, selection: null })).toEqual({
      lineup: images,
      notIncluded: [],
    });
    expect(resolveImageLineup({ productImages: images, selection: [] }).lineup).toEqual(images);
  });

  it('honours the operator order', () => {
    const { lineup } = resolveImageLineup({ productImages: images, selection: ['c.webp', 'a.webp'] });
    expect(lineup).toEqual(['c.webp', 'a.webp']);
  });

  it('treats the selection as definitive and reports what was left out', () => {
    // A photo added to the product later must NOT silently rejoin a curated
    // carousel; it surfaces as "not included" instead.
    const { lineup, notIncluded } = resolveImageLineup({
      productImages: images,
      selection: ['b.webp'],
    });
    expect(lineup).toEqual(['b.webp']);
    expect(notIncluded).toEqual(['a.webp', 'c.webp']);
  });

  it('drops selected images that no longer exist on the product', () => {
    const { lineup } = resolveImageLineup({
      productImages: ['a.webp'],
      selection: ['deleted.webp', 'a.webp'],
    });
    expect(lineup).toEqual(['a.webp']);
  });

  it('ignores duplicates in the selection', () => {
    const { lineup } = resolveImageLineup({
      productImages: images,
      selection: ['a.webp', 'a.webp', 'b.webp'],
    });
    expect(lineup).toEqual(['a.webp', 'b.webp']);
  });
});

describe('buildInstagramPost', () => {
  it('builds a caption with title, qualified price, specs and hashtags', () => {
    const post = buildInstagramPost({ product: makeProduct(), spotData: LIVE_SPOT });

    expect(post.blockedReason).toBeNull();
    expect(post.caption).toContain('Heavy Italian 14K Yellow Gold Cuban Link Bracelet');
    expect(post.caption).toMatch(/≈ \$[\d,]+ at time of posting/);
    expect(post.caption).toContain('#');
    expect(post.quotedPrice).toBeGreaterThan(0);
  });

  it('combines availability and title in one opening sentence, then shows specs and price', () => {
    const post = buildInstagramPost({ product: makeProduct(), spotData: LIVE_SPOT });
    expect(post.caption).toMatch(
      /^Available now: Heavy Italian 14K Yellow Gold Cuban Link Bracelet\.\n\n14K Yellow Gold · 53\.91g[^\n]*\n\n≈ \$[\d,]+ at time of posting \(based on \$4,044\/oz gold spot\)\./,
    );
  });

  it('uses a validated AI-assisted opening verbatim', () => {
    const opening = 'We’re delighted to share the Heavy Italian 14K Yellow Gold Cuban Link Bracelet, available now.';
    const post = buildInstagramPost({
      product: makeProduct(),
      spotData: LIVE_SPOT,
      captionOpening: opening,
    });
    expect(post.caption.startsWith(`${opening}\n\n14K Yellow Gold`)).toBe(true);
  });

  it('uses an admin-edited opener without requiring the full catalog title', () => {
    const opening = 'This heavy Italian bracelet is available now.';
    const post = buildInstagramPost({
      product: makeProduct(),
      spotData: LIVE_SPOT,
      captionOpening: opening,
    });
    expect(post.caption.startsWith(`${opening}\n\n14K Yellow Gold`)).toBe(true);
  });

  it('keeps blank-line rhythm everywhere except the intentional Store/Item pair', () => {
    const post = buildInstagramPost({ product: makeProduct(), spotData: LIVE_SPOT });
    const rows = post.caption.split('\n');
    for (let i = 1; i < rows.length; i += 1) {
      if (rows[i - 1] !== '' && rows[i] !== '') {
        expect(rows[i - 1]).toBe('Store link in bio');
        expect(rows[i]).toMatch(/^Item: /);
      }
    }
  });

  it('never claims availability for a product that is not available', () => {
    const post = buildInstagramPost({
      product: makeProduct({ status: 'sold' }),
      spotData: LIVE_SPOT,
    });
    expect(post.caption).not.toMatch(/Available now/);
    expect(post.caption).toMatch(/≈ \$[\d,]+ at time of posting \(based on .*\)\./);
  });

  it('omits the spot parenthetical for manually priced items', () => {
    const post = buildInstagramPost({
      product: makeProduct({ price_mode: 'manual', asking_price: 2500 }),
      spotData: LIVE_SPOT,
    });
    expect(post.caption).not.toMatch(/based on/);
  });

  it('omits the inventory number from caption and alt text, which stays internal', () => {
    const post = buildInstagramPost({ product: makeProduct(), spotData: LIVE_SPOT });
    expect(post.caption).not.toMatch(/Inventory/i);
    expect(post.altText).not.toMatch(/Inventory/i);
    // The rest of the spec line survives the strip.
    expect(post.caption).toContain('14K Yellow Gold');
    expect(post.caption).toContain('53.91g');
  });

  it('stacks the link-in-bio direction directly above the typeable item path', () => {
    const post = buildInstagramPost({ product: makeProduct(), spotData: LIVE_SPOT });
    expect(post.caption).toContain('\n\nStore link in bio\nItem: NaplesEstateJewelry.com/p/21\n\n');
    expect(post.caption).not.toContain('Shop: NaplesEstateJewelry.com');
  });

  it('falls back to the bare storefront domain when there is no inventory number', () => {
    const post = buildInstagramPost({
      product: makeProduct({ inventory_number: null }),
      spotData: LIVE_SPOT,
    });
    expect(post.caption).toContain('Store link in bio\nItem: NaplesEstateJewelry.com');
    expect(post.caption).not.toContain('/p/');
  });

  it('excludes the description body — the spec line carries the facts', () => {
    const post = buildInstagramPost({ product: makeProduct(), spotData: LIVE_SPOT });
    // Distinctive description phrases must not leak into the caption.
    expect(post.caption).not.toContain('excellent condition');
    expect(post.caption).not.toContain('Third sentence');
    // The Spanish line survives; it is a setting, not the description body.
    expect(post.caption).toContain('🇪🇸');
  });

  it('includes a Spanish line when enabled and omits it when disabled', () => {
    const withEs = buildInstagramPost({ product: makeProduct(), spotData: LIVE_SPOT });
    expect(withEs.caption).toContain('🇪🇸');

    const withoutEs = buildInstagramPost({
      product: makeProduct(),
      spotData: LIVE_SPOT,
      settings: { spanishLine: false },
    });
    expect(withoutEs.caption).not.toContain('🇪🇸');
  });

  it('never leaks private product fields into the caption', () => {
    const post = buildInstagramPost({ product: makeProduct(), spotData: LIVE_SPOT });
    for (const secret of ['SECRET-PRIVATE-LABEL', 'SECRET-INTERNAL-NOTE', 'SECRET-SOURCE', '999999', '888888', '777777']) {
      expect(post.caption).not.toContain(secret);
    }
    // The firewall list itself must stay in sync with the private columns.
    expect(INSTAGRAM_FORBIDDEN_PRODUCT_FIELDS).toContain('cost_basis');
    expect(INSTAGRAM_FORBIDDEN_PRODUCT_FIELDS).toContain('internal_notes');
  });

  it('fails closed when a price would be quoted but spot is a fallback estimate', () => {
    const post = buildInstagramPost({ product: makeProduct(), spotData: FALLBACK_SPOT });
    expect(post.blockedReason).toBeTruthy();
  });

  it('does not block on fallback spot when price is omitted from the caption', () => {
    const post = buildInstagramPost({
      product: makeProduct(),
      spotData: FALLBACK_SPOT,
      settings: { includePrice: false },
    });
    expect(post.blockedReason).toBeNull();
    expect(post.caption).not.toContain('at time of posting');
  });

  it('blocks a product with no images', () => {
    const post = buildInstagramPost({
      product: makeProduct({ image_urls: [], images: [] }),
      spotData: LIVE_SPOT,
    });
    expect(post.blockedReason).toContain('no images');
  });

  it('caps photos one below the carousel limit and warns, since the card takes a slot', () => {
    const many = Array.from({ length: 15 }, (_, i) => `https://example.com/${i}.webp`);
    const post = buildInstagramPost({
      product: makeProduct({ image_urls: many }),
      spotData: LIVE_SPOT,
    });
    expect(post.imageUrls).toHaveLength(INSTAGRAM_MAX_PHOTO_ITEMS);
    expect(post.warnings.join(' ')).toContain('15');
  });

  it('falls back to defaults when a caller passes explicit undefined settings', () => {
    // Regression: callers build the settings object from nullable DB columns
    // (`cta: connection?.caption_cta ?? undefined`). A plain spread would set
    // the key to undefined and crash on `baseHashtags.forEach`.
    const post = buildInstagramPost({
      product: makeProduct(),
      spotData: LIVE_SPOT,
      settings: { baseHashtags: undefined, cta: undefined, includePrice: undefined },
    } as Parameters<typeof buildInstagramPost>[0]);
    expect(post.blockedReason).toBeNull();
    expect(post.caption).toContain('#');
  });

  it('points at the website rather than a phone number, naming the domain exactly once', () => {
    const post = buildInstagramPost({ product: makeProduct(), spotData: LIVE_SPOT });
    // The Shop line carries the domain; the default CTA leans on it ("the
    // site") rather than repeating it (owner, 2026-08-01).
    expect(post.caption).toContain('DM us or visit the site for live spot-linked pricing.');
    expect(post.caption.match(/NaplesEstateJewelry\.com/g)).toHaveLength(1);
    expect(post.caption).not.toContain('239');
  });

  it('uses the operator image lineup, including its cover choice', () => {
    const product = makeProduct({ image_urls: ['one.webp', 'two.webp', 'three.webp'] });
    const post = buildInstagramPost({
      product,
      spotData: LIVE_SPOT,
      imageSelection: ['three.webp', 'one.webp'],
    });
    expect(post.imageUrls).toEqual(['three.webp', 'one.webp']);
  });

  it('blocks when the operator has emptied the lineup', () => {
    const post = buildInstagramPost({
      product: makeProduct(),
      spotData: LIVE_SPOT,
      imageSelection: ['not-a-product-image.webp'],
    });
    expect(post.blockedReason).toContain('lineup');
  });

  it('produces alt text describing the piece', () => {
    const post = buildInstagramPost({ product: makeProduct(), spotData: LIVE_SPOT });
    expect(post.altText).toContain('Cuban Link Bracelet');
    expect(post.altText.length).toBeLessThanOrEqual(1000);
  });
});

describe('computeInstagramContentHash', () => {
  it('is stable for identical input', () => {
    const a = buildInstagramPost({ product: makeProduct(), spotData: LIVE_SPOT });
    const b = buildInstagramPost({ product: makeProduct(), spotData: LIVE_SPOT });
    expect(computeInstagramContentHash(a)).toBe(computeInstagramContentHash(b));
  });

  it('changes when the title changes', () => {
    const a = buildInstagramPost({ product: makeProduct(), spotData: LIVE_SPOT });
    const b = buildInstagramPost({ product: makeProduct({ title: 'A Different Title' }), spotData: LIVE_SPOT });
    expect(computeInstagramContentHash(a)).not.toBe(computeInstagramContentHash(b));
  });

  it('ignores price movement, so a spot change never marks a post out of date', () => {
    const a = buildInstagramPost({ product: makeProduct(), spotData: LIVE_SPOT });
    const b = buildInstagramPost({
      product: makeProduct(),
      spotData: { ...LIVE_SPOT, goldPerTroyOz: 4500 },
    });
    expect(a.quotedPrice).not.toBe(b.quotedPrice);
    expect(computeInstagramContentHash(a)).toBe(computeInstagramContentHash(b));
  });

  it('changes when the image set changes', () => {
    const a = buildInstagramPost({ product: makeProduct(), spotData: LIVE_SPOT });
    const b = buildInstagramPost({
      product: makeProduct({ image_urls: ['https://example.com/only.webp'] }),
      spotData: LIVE_SPOT,
    });
    expect(computeInstagramContentHash(a)).not.toBe(computeInstagramContentHash(b));
  });
});

describe('buildCardSpecs', () => {
  it('upper-cases the spec line for the card', () => {
    expect(buildCardSpecs(makeProduct())).toContain('14K YELLOW GOLD');
  });

  it('drops the inventory number, which is bookkeeping rather than a selling point', () => {
    const specs = buildCardSpecs(makeProduct({ inventory_number: 21 }));
    expect(buildSpecLine(makeProduct({ inventory_number: 21 }))).toContain('Inventory 21');
    expect(specs).not.toMatch(/INVENTORY/i);
    expect(specs).not.toMatch(/\b21\b/);
  });

  it('leaves no dangling separator when the inventory number is stripped off the end', () => {
    const specs = buildCardSpecs(
      makeProduct({
        weight_grams: null,
        gram_weight: null,
        length: null,
        width_mm: null,
        item_year: null,
        inventory_number: 21,
      } as unknown as Partial<Product>),
    );

    expect(specs).toBeTruthy();
    expect(specs!.trim()).toBe(specs);
    expect(specs).not.toMatch(/·\s*$/);
    expect(specs).not.toMatch(/^\s*·/);
  });

  it('separates remaining parts consistently', () => {
    const specs = buildCardSpecs(makeProduct());
    // Wider spacing than the caption's " · ", because the card sets this
    // letter-spaced at 20px where a tight separator reads as noise.
    expect(specs).toContain('  ·  ');
    expect(specs).not.toMatch(/[a-z]/);
  });
});

describe('card content', () => {
  it('carries the title, formatted price and spec line', () => {
    const post = buildInstagramPost({ product: makeProduct(), spotData: LIVE_SPOT });

    expect(post.cardContent.title).toBe('Heavy Italian 14K Yellow Gold Cuban Link Bracelet');
    expect(post.cardContent.price).toMatch(/^\$[\d,]+$/);
    expect(post.cardContent.specs).toContain('14K YELLOW GOLD');
  });

  it('omits the price when the caption omits it, so the two can never disagree', () => {
    const post = buildInstagramPost({
      product: makeProduct(),
      spotData: LIVE_SPOT,
      settings: { includePrice: false },
    });

    expect(post.quotedPrice).toBeNull();
    expect(post.cardContent.price).toBeNull();
    expect(post.caption).not.toMatch(/at time of posting/);
  });

  it('is built even while the card feature is switched off, so it can be previewed', () => {
    const post = buildInstagramPost({ product: makeProduct(), spotData: LIVE_SPOT });
    expect(post.cardContent.title).toBeTruthy();
  });

  it('carries the spot basis into the card price note', () => {
    const post = buildInstagramPost({ product: makeProduct(), spotData: LIVE_SPOT });
    expect(post.cardContent.priceNote).toBe('Price at time of posting · $4,044/oz gold spot');
  });
});

describe('card slot reservation', () => {
  const manyImages = Array.from(
    { length: INSTAGRAM_MAX_CAROUSEL_ITEMS + 3 },
    (_, i) => `https://example.supabase.co/storage/v1/object/public/product-images/products/${i}.webp`,
  );

  it('always holds one carousel slot back, because every post leads with a card', () => {
    const post = buildInstagramPost({
      product: makeProduct({ image_urls: manyImages }),
      spotData: LIVE_SPOT,
    });

    expect(post.imageUrls).toHaveLength(INSTAGRAM_MAX_PHOTO_ITEMS);
    expect(INSTAGRAM_MAX_PHOTO_ITEMS).toBe(INSTAGRAM_MAX_CAROUSEL_ITEMS - 1);
  });

  it('explains the tighter cap, so the reviewed count is the published count', () => {
    const post = buildInstagramPost({
      product: makeProduct({ image_urls: manyImages }),
      spotData: LIVE_SPOT,
    });

    expect(post.warnings.join(' ')).toMatch(/card takes the first slot/i);
  });

  it('does not warn when every photo fits alongside the card', () => {
    const post = buildInstagramPost({
      product: makeProduct({ image_urls: manyImages.slice(0, 4) }),
      spotData: LIVE_SPOT,
    });

    expect(post.imageUrls).toHaveLength(4);
    expect(post.warnings).toHaveLength(0);
  });

  it('does not warn at exactly the photo cap', () => {
    const post = buildInstagramPost({
      product: makeProduct({ image_urls: manyImages.slice(0, INSTAGRAM_MAX_PHOTO_ITEMS) }),
      spotData: LIVE_SPOT,
    });

    expect(post.imageUrls).toHaveLength(INSTAGRAM_MAX_PHOTO_ITEMS);
    expect(post.warnings).toHaveLength(0);
  });
});
