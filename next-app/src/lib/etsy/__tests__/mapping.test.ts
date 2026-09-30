import { describe, expect, it } from 'vitest';
import type { Product } from '@/types/product';
import {
  ETSY_FORBIDDEN_PRODUCT_FIELDS,
  buildMappedPayload,
  buildPreflightChecks,
  computeContentHash,
  computeEtsyPrice,
  mapMaterials,
  mapProperties,
  mapSku,
  mapTags,
  mapTitle,
  mapWhenMade,
  resolveEffectiveTaxonomy,
  resolveTaxonomy,
  titleImpliedJewelryType,
} from '../mapping';

const NOW_2026 = new Date('2026-07-08T00:00:00Z');

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'test-product-id',
    category: 'Gold',
    metal_type: 'Gold',
    metal_variant: 'yellow_gold',
    // Only metal/karat/color words, all filtered out of title-tag extraction,
    // so the default product adds no title-derived tags — existing tag tests
    // stay deterministic. Tests that exercise title broadening set their own.
    title: '14K Yellow Gold',
    title_es: null,
    price_label: null,
    manual_price_label: null,
    price_mode: 'spot-multiplier',
    purity: 14,
    weight_grams: 10,
    inventory_number: 42,
    sku: null,
    slug: 'test-product',
    metal: 'gold',
    gram_weight: 10,
    stone_details: null,
    brand: null,
    product_type: 'Necklace',
    jewelry_type: 'Necklace',
    chain_type: null,
    length: '20 in',
    pricing_multiplier: 2,
    show_spot_price: true,
    special_price_override_enabled: false,
    special_price_override_amount: null,
    special_price_override_mode: 'amount',
    special_price_override_percent: null,
    quantity: 1,
    status: 'available',
    location: null,
    images: [],
    image_urls: ['https://example.supabase.co/storage/v1/object/public/product-images/products/a.webp'],
    image_padding: 'none',
    image_padding_by_image: null,
    description: 'A lovely test necklace.',
    description_es: null,
    details: [],
    details_es: [],
    tags: ['jt:Necklace', 'len:20 in', 'estate jewelry'],
    tags_es: [],
    private_price_label: 'SECRET-PRIVATE-LABEL',
    gender: null,
    item_year: 1985,
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

describe('mapTitle', () => {
  it('leaves short titles untouched', () => {
    expect(mapTitle('14K Gold Cuban Link Chain')).toBe('14K Gold Cuban Link Chain');
  });

  it('truncates to 140 chars at a word boundary', () => {
    const long = `${'A'.repeat(20)} `.repeat(20).trim(); // > 140 chars, space-separated
    const result = mapTitle(long);
    expect(result.length).toBeLessThanOrEqual(140);
    expect(result.endsWith(' ')).toBe(false);
    expect(long.startsWith(result)).toBe(true);
  });

  it('collapses internal whitespace', () => {
    expect(mapTitle('  Gold   Ring  ')).toBe('Gold Ring');
  });

  // Live 400 (2026-07-08): Etsy allows "&" at most once in a title ("& can
  // only be used once"). Two real sterling pieces with "X & Y … A & B" titles
  // failed. The first "&" is kept; the rest become "and".
  it('keeps only the first "&" and spells the rest as "and"', () => {
    expect(mapTitle('Gran & Laglye Serving Spoon With Grape & Scroll Design')).toBe(
      'Gran & Laglye Serving Spoon With Grape and Scroll Design',
    );
    expect(mapTitle('A & B & C & D')).toBe('A & B and C and D');
  });

  it('leaves a single "&" untouched', () => {
    expect(mapTitle('Sterling & Silver Bracelet')).toBe('Sterling & Silver Bracelet');
  });
});

describe('mapTags', () => {
  // Regression test for the live bug found 2026-07-08: the raw internal tags
  // for a real bracelet were ["jt:Bracelet", "ct:Cuban link", "len:7.75"].
  // The old implementation only stripped jt:/len: (per the plan doc), missed
  // ct: (chain type) entirely, and mangled "7.75" into "7 75" (period ->
  // space) when sanitizing disallowed characters — producing the exact
  // nonsense tags "ct Cuban link" and "7 75" the owner spotted live.
  it('never leaks a jt:/ct:/len: internal filter tag verbatim (regression: real bracelet had "ct Cuban link" and "7 75")', () => {
    const product = makeProduct({
      tags: ['jt:Bracelet', 'ct:Cuban link', 'len:7.75'],
      chain_type: 'Cuban link',
      product_type: 'Bracelet',
      metal_variant: 'yellow_gold',
      purity: 14,
    });
    const tags = mapTags(product);
    for (const tag of tags) {
      expect(tag.toLowerCase()).not.toContain('ct cuban');
      expect(tag).not.toBe('7 75');
      expect(tag.toLowerCase()).not.toMatch(/^(jt|ct|len):/);
    }
  });

  it('composes buyer-searchable phrases from structured fields (karat, metal, chain type, product type)', () => {
    const product = makeProduct({
      tags: [],
      chain_type: 'Cuban link',
      product_type: 'Bracelet',
      metal_variant: 'yellow_gold',
      metal_type: 'Gold',
      category: 'Gold',
      purity: 14,
    });
    const tags = mapTags(product);
    expect(tags).toContain('14k gold bracelet');
    expect(tags).toContain('cuban link bracelet');
    expect(tags).toContain('cuban link chain');
    expect(tags).toContain('solid gold bracelet');
    expect(tags).toContain('yellow gold bracelet');
  });

  it('expands to both compound and single-word tags (14k gold bracelet AND 14k AND gold)', () => {
    const product = makeProduct({
      tags: [],
      chain_type: null,
      product_type: 'Bracelet',
      metal_variant: 'yellow_gold',
      metal_type: 'Gold',
      category: 'Gold',
      purity: 14,
    });
    const tags = mapTags(product);
    expect(tags).toContain('14k gold');
    expect(tags).toContain('14k');
    expect(tags).toContain('gold');
    // NB: the standalone product-type word ("bracelet") is the lowest-priority
    // single word and yields its slot to the vintage/antique category tags for
    // a fully-loaded gold listing (2026-07-08) — it still appears inside the
    // compound tags "14k gold bracelet" / "gold bracelet". For a
    // lighter-tagged (e.g. silver) item it still lands standalone; see the
    // vintage/antique tests below.
  });

  it('folds in genuine free-text seller tags (no internal prefix) as fallback', () => {
    const product = makeProduct({ tags: ['handmade gift'], product_type: 'Other', chain_type: null, purity: null });
    const tags = mapTags(product);
    expect(tags).toContain('handmade gift');
  });

  it('caps at 13 tags', () => {
    const product = makeProduct({ tags: Array.from({ length: 20 }, (_, i) => `tag${i}`) });
    expect(mapTags(product)).toHaveLength(13);
  });

  it('caps every tag at 20 chars', () => {
    const product = makeProduct({ tags: ['a'.repeat(40)], product_type: 'Other', chain_type: null, purity: null });
    for (const tag of mapTags(product)) expect(tag.length).toBeLessThanOrEqual(20);
  });

  // Live bug 2026-07-08: a sterling bracelet's composed "solid silver bracelet"
  // (21 chars) was hard-sliced to "solid silver bracele" — a word chopped
  // mid-way, which reads as broken to a buyer. Over-long tags must be cut at a
  // word boundary instead.
  it('never truncates a word mid-way to fit the 20-char cap (regression: "solid silver bracele")', () => {
    const product = makeProduct({
      product_type: 'Bracelet',
      jewelry_type: 'Bracelet',
      metal_type: 'Silver',
      category: 'Silver',
      metal_variant: 'silver',
      purity: 925,
      chain_type: null,
      tags: [],
    });
    const tags = mapTags(product);
    expect(tags).not.toContain('solid silver bracele');
    expect(tags).toContain('solid silver'); // the phrase, cut cleanly at the word boundary
    for (const tag of tags) expect(tag.length).toBeLessThanOrEqual(20);
  });

  // Owner request 2026-07-08: every item (all attested vintage/estate) carries
  // BOTH "vintage" and "antique" category tags — jewelry-level, plus a
  // metal-specific pair ("sterling" for silver, the metal word otherwise).
  it('adds paired vintage + antique tags: jewelry-level plus metal-specific "sterling" for silver', () => {
    const product = makeProduct({
      product_type: 'Bracelet',
      jewelry_type: 'Bracelet',
      metal_type: 'Silver',
      category: 'Silver',
      metal_variant: 'silver',
      purity: 925,
      chain_type: null,
      tags: [],
    });
    const tags = mapTags(product);
    expect(tags).toContain('vintage jewelry');
    expect(tags).toContain('antique jewelry');
    expect(tags).toContain('vintage sterling');
    expect(tags).toContain('antique sterling');
  });

  it('does NOT tag a silver TABLEWARE item as jewelry (owner report 2026-07-10: silver mug) — uses silver-object keywords instead', () => {
    const product = makeProduct({
      title: 'Antique Georgian Sterling Silver Handled Mug, London 1824, Edward Farrell',
      product_type: 'Mug',
      jewelry_type: 'Mug',
      metal_type: 'Silver',
      category: 'Silver',
      metal_variant: 'silver',
      purity: 925,
      chain_type: null,
      brand: 'Edward Farrell',
      tags: [],
    });
    const tags = mapTags(product);
    // No jewelry-category tags on a mug.
    expect(tags).not.toContain('silver jewelry');
    expect(tags).not.toContain('estate jewelry');
    expect(tags).not.toContain('vintage jewelry');
    expect(tags).not.toContain('antique jewelry');
    // Object-appropriate silver keywords instead.
    expect(tags).toContain('sterling silver');
    expect(tags).toContain('estate silver');
    expect(tags).toContain('vintage silver');
    expect(tags).toContain('antique silver');
    // The metal-specific "sterling" pair still applies (metal is known).
    expect(tags).toContain('vintage sterling');
    expect(tags).toContain('antique sterling');
  });

  it('flatware (a silver spoon) also gets object tags, not jewelry tags', () => {
    const product = makeProduct({
      title: 'Gorham Chantilly Sterling Silver Salt Spoon',
      product_type: 'Salt Spoon',
      jewelry_type: 'Salt Spoon',
      metal_type: 'Silver',
      category: 'Silver',
      metal_variant: 'silver',
      purity: 925,
      chain_type: null,
      tags: [],
    });
    const tags = mapTags(product);
    expect(tags).not.toContain('estate jewelry');
    expect(tags).not.toContain('vintage jewelry');
    expect(tags).toContain('estate silver');
  });

  it('a silver BRACELET (real jewelry) still gets the jewelry tags — the fix is object-only', () => {
    const product = makeProduct({
      product_type: 'Bracelet',
      jewelry_type: 'Bracelet',
      metal_type: 'Silver',
      category: 'Silver',
      metal_variant: 'silver',
      purity: 925,
      chain_type: null,
      tags: [],
    });
    const tags = mapTags(product);
    expect(tags).toContain('estate jewelry');
    expect(tags).toContain('vintage jewelry');
    expect(tags).toContain('antique jewelry');
  });

  it('uses a "gold" metal-specific vintage/antique pair for gold items', () => {
    const product = makeProduct({
      product_type: 'Ring',
      jewelry_type: 'Ring',
      metal_type: 'Gold',
      category: 'Gold',
      metal_variant: 'yellow_gold',
      purity: 14,
      chain_type: null,
      tags: [],
    });
    const tags = mapTags(product);
    expect(tags).toContain('vintage gold');
    expect(tags).toContain('antique gold');
    expect(tags).toContain('vintage jewelry');
    expect(tags).toContain('antique jewelry');
  });

  // The owner's explicit rule: never a lone "vintage X" without its "antique
  // X" — pairs are atomic even when the 13-tag budget runs out mid-pair.
  it('never emits a lone "vintage X" without the matching "antique X"', () => {
    // A tag-heavy gold item (chain + color + brand) exercises the budget edge.
    const product = makeProduct({
      product_type: 'Bracelet',
      jewelry_type: 'Bracelet',
      metal_type: 'Gold',
      category: 'Gold',
      metal_variant: 'yellow_gold',
      purity: 14,
      chain_type: 'Cuban link',
      brand: 'David Yurman',
      tags: ['925', 'articulated', 'dy'],
    });
    const tags = mapTags(product);
    for (const tag of tags) {
      if (tag.startsWith('vintage ')) {
        expect(tags).toContain(`antique ${tag.slice('vintage '.length)}`);
      }
    }
  });

  it('dedupes case-insensitively', () => {
    const product = makeProduct({ tags: ['Gold', 'gold', 'GOLD'], product_type: 'Other', chain_type: null, purity: null, metal_type: 'Non-Metal', category: 'Silver' });
    const tags = mapTags(product);
    expect(tags.filter((t) => t.toLowerCase() === 'gold')).toHaveLength(1);
  });

  it('drops disallowed characters from free-text tags', () => {
    const product = makeProduct({ tags: ['14K & Co.!'], product_type: 'Other', chain_type: null, purity: null, metal_type: 'Non-Metal', category: 'Silver' });
    const tags = mapTags(product);
    expect(tags).toContain('14K Co');
  });

  // Owner report 2026-07-08: a "…Charm Bracelet" typed only as a Bracelet had no
  // "charm" tag. Title broadening now surfaces meaningful title words the
  // structured fields miss.
  it('pulls an important title word ("charm") — and its type phrase — into the tags', () => {
    const product = makeProduct({
      title: '14K Gold Charm Bracelet',
      product_type: 'Bracelet',
      jewelry_type: 'Bracelet',
      chain_type: null,
      tags: [],
    });
    const tags = mapTags(product);
    expect(tags).toContain('charm');
    expect(tags).toContain('charm bracelet');
  });

  it('surfaces other distinctive title words (e.g. "byzantine") while filtering metal/karat/color/unit noise', () => {
    const product = makeProduct({
      title: '18K Yellow Gold Byzantine Link Bracelet 7.5 in',
      product_type: 'Bracelet',
      jewelry_type: 'Bracelet',
      purity: 18,
      chain_type: null,
      tags: [],
    });
    const tags = mapTags(product);
    expect(tags).toContain('byzantine');
    // Title extraction contributes no standalone noise: "yellow" (a color) and
    // bare measurement tokens are never added by it. ("18k" can still appear,
    // but via the structured karat logic — not from the title.)
    expect(tags).not.toContain('yellow');
    expect(tags).not.toContain('7'); // measurement stripped
    expect(tags).not.toContain('5'); // "7.5" split → digits filtered
  });

  it('does not add a title word that just repeats the product type', () => {
    const product = makeProduct({
      title: 'Gold Bracelet',
      product_type: 'Bracelet',
      jewelry_type: 'Bracelet',
      chain_type: null,
      tags: [],
    });
    // "bracelet" still appears via structured logic, but the title added nothing
    // beyond it — no duplicate, and no bogus phrase like "gold bracelet bracelet".
    const tags = mapTags(product);
    expect(tags.filter((t) => t === 'bracelet').length).toBeLessThanOrEqual(1);
    expect(tags).not.toContain('bracelet bracelet');
  });

  // Owner request 2026-07-08: custom tags entered in the Etsy drawer merge into
  // the auto-generated set and are guaranteed to appear (added first).
  it('merges owner-supplied custom tags first, deduped and cap-respecting', () => {
    const product = makeProduct({
      product_type: 'Bracelet',
      jewelry_type: 'Bracelet',
      metal_variant: 'yellow_gold',
      metal_type: 'Gold',
      category: 'Gold',
      purity: 14,
      chain_type: null,
      tags: [],
    });
    const tags = mapTags(product, ['gift for her', 'estate find']);
    expect(tags[0]).toBe('gift for her');
    expect(tags).toContain('estate find');
    expect(tags.length).toBeLessThanOrEqual(13);
  });

  it('ignores empty/blank custom tags and dedupes them against auto tags', () => {
    const product = makeProduct({
      product_type: 'Bracelet',
      jewelry_type: 'Bracelet',
      metal_type: 'Gold',
      category: 'Gold',
      metal_variant: 'yellow_gold',
      purity: 14,
      chain_type: null,
      tags: [],
    });
    const tags = mapTags(product, ['  ', '', 'estate jewelry']);
    expect(tags.filter((t) => t.toLowerCase() === 'estate jewelry')).toHaveLength(1);
    expect(tags).not.toContain('');
  });
});

describe('mapMaterials', () => {
  it('maps gold karat purity to a materials list', () => {
    const materials = mapMaterials({ metal_variant: 'yellow_gold', metal_type: 'Gold', purity: 14, category: 'Gold' });
    expect(materials).toContain('14k gold');
    expect(materials).toContain('solid gold');
  });

  it('also adds the decomposed 14k and gold entries alongside "14k gold"', () => {
    const materials = mapMaterials({ metal_variant: 'yellow_gold', metal_type: 'Gold', purity: 14, category: 'Gold' });
    expect(materials).toContain('14k gold');
    expect(materials).toContain('14k');
    expect(materials).toContain('gold');
  });

  it('maps silver to sterling silver, plus a standalone silver entry', () => {
    const materials = mapMaterials({ metal_variant: 'silver', metal_type: 'Silver', purity: 925, category: 'Silver' });
    expect(materials).toContain('sterling silver');
    expect(materials).toContain('silver');
  });
});

describe('mapProperties — structured category properties, one per pinned taxonomy family', () => {
  // Real bracelet from the live regression (2026-07-08): metal_type Gold,
  // metal_variant yellow_gold, purity 14. Materials/purity ids were
  // confirmed live against getPropertiesByTaxonomyId(1196) AND confirmed
  // correct by the owner's own live listing screenshot (Materials "Yellow
  // gold", Gold solidity "Solid gold", Gold purity "14k" all landed right).
  it('Bracelet: materials, gold solidity, gold purity', () => {
    const product = makeProduct({ product_type: 'Bracelet', jewelry_type: 'Bracelet', metal_type: 'Gold', metal_variant: 'yellow_gold', purity: 14 });
    const updates = mapProperties(product);

    const materials = updates.find((u) => u.propertyId === 148789511893);
    expect(materials?.valueIds.sort()).toEqual([139, 5261].sort());

    const solidity = updates.find((u) => u.propertyId === 570246213608);
    expect(solidity).toEqual({ propertyId: 570246213608, valueIds: [5105], values: ['Solid gold'] });

    const purity = updates.find((u) => u.propertyId === 570246213609);
    expect(purity).toEqual({ propertyId: 570246213609, valueIds: [5111], values: ['14k'] });
  });

  // The user's explicit ask: generalize beyond bracelets to every product
  // type, including the sterling silver categories like spoons (Silverware).
  it('Silverware (e.g. a sterling silver spoon): materials only — no gold purity/solidity (property does not exist on this taxonomy node)', () => {
    const product = makeProduct({
      product_type: 'Silverware',
      jewelry_type: 'Silverware',
      metal_type: 'Silver',
      metal_variant: 'silver',
      category: 'Silver',
      purity: 925,
    });
    const updates = mapProperties(product);

    const materials = updates.find((u) => u.propertyId === 148789511893);
    expect(materials?.valueIds.sort()).toEqual([246, 5113].sort());

    expect(updates.find((u) => u.propertyId === 570246213608)).toBeUndefined(); // Gold solidity
    expect(updates.find((u) => u.propertyId === 570246213609)).toBeUndefined(); // Gold purity
  });

  it('Cufflinks/Coin/Bullion also get no gold purity/solidity even when metal_type is Gold (not exposed on those taxonomy nodes)', () => {
    for (const productType of ['Cufflinks', 'Coin', 'Bullion']) {
      const product = makeProduct({ product_type: productType, jewelry_type: productType, metal_type: 'Gold', metal_variant: 'yellow_gold', purity: 14 });
      const updates = mapProperties(product);
      expect(updates.find((u) => u.propertyId === 570246213608)).toBeUndefined();
      expect(updates.find((u) => u.propertyId === 570246213609)).toBeUndefined();
      // Materials still applies everywhere.
      expect(updates.find((u) => u.propertyId === 148789511893)).toBeDefined();
    }
  });

  it('Watch keeps gold purity/solidity (present on that taxonomy node)', () => {
    const product = makeProduct({ product_type: 'Watch', jewelry_type: 'Watch', metal_type: 'Gold', metal_variant: 'yellow_gold', purity: 18 });
    const updates = mapProperties(product);
    expect(updates.find((u) => u.propertyId === 570246213609)).toEqual({ propertyId: 570246213609, valueIds: [5109], values: ['18k'] });
  });

  it('vermeil resolves Gold solidity to "Gold vermeil" instead of "Solid gold"', () => {
    const product = makeProduct({ product_type: 'Necklace', metal_type: 'Gold', metal_variant: 'vermeil', purity: null });
    const solidity = mapProperties(product).find((u) => u.propertyId === 570246213608);
    expect(solidity).toEqual({ propertyId: 570246213608, valueIds: [5112], values: ['Gold vermeil'] });
  });

  // Length joined this list 2026-07-08 (session 5): a live test proved
  // guessing its value_ids silently corrupts the listing instead of failing
  // safely (Etsy stored "Gray" — a color from its shared global value
  // vocabulary — as the bracelet's length). See mapping.ts's block comment
  // and DECISIONS.md for the full story.
  it('never guesses Gemstone/width/Adjustable/Closure/Ring size/Watch band material/Length — no verified-safe source for any of them', () => {
    const product = makeProduct({ product_type: 'Bracelet' });
    const updates = mapProperties(product);
    const NEVER_SET_PROPERTY_IDS = [
      102868018123, // Gemstone type
      47626759898, // Bracelet/Pendant width
      164901868006, // Small jewelry width
      99837394348, // Adjustable
      164901867924, // Jewelry closure type
      54142602013, // Ring size
      164901868340, // Watch band material
      47626759838, // Bracelet/Necklace/Pendant/Charm length
      102448162796, // Earrings/Brooch "Small jewelry length"
      506, // generic Length (Cufflinks/Watch/Coin/Bullion/Silverware)
    ];
    for (const id of NEVER_SET_PROPERTY_IDS) {
      expect(updates.find((u) => u.propertyId === id)).toBeUndefined();
    }
  });

  it('skips gold purity/solidity when purity is not a known karat, but still sets materials', () => {
    const product = makeProduct({ product_type: 'Necklace', metal_type: 'Gold', metal_variant: 'yellow_gold', purity: null });
    const updates = mapProperties(product);
    expect(updates.find((u) => u.propertyId === 148789511893)).toBeDefined();
    expect(updates.find((u) => u.propertyId === 570246213608)).toBeDefined(); // solidity doesn't need a karat
    expect(updates.find((u) => u.propertyId === 570246213609)).toBeUndefined(); // purity does
  });

  it('sets no materials for a non-metal or unrecognized product', () => {
    const product = makeProduct({ metal_type: 'Non-Metal', category: 'Silver', metal_variant: null, purity: null });
    const updates = mapProperties(product);
    expect(updates.find((u) => u.propertyId === 148789511893)).toBeUndefined();
  });
});

describe('mapSku', () => {
  it('prefers an explicit sku', () => {
    expect(mapSku({ sku: 'ABC-1', inventory_number: 5 })).toBe('ABC-1');
  });

  it('falls back to NEJ-{inventory_number}', () => {
    expect(mapSku({ sku: null, inventory_number: 5 })).toBe('NEJ-5');
  });

  it('returns empty string when neither is present', () => {
    expect(mapSku({ sku: null, inventory_number: null })).toBe('');
  });
});

describe('mapWhenMade — buckets and the Q2 vintage fallback', () => {
  it('maps the 2000-2006 boundary correctly', () => {
    expect(mapWhenMade(2006, NOW_2026)).toEqual({ whenMade: '2000_2006', usedFallback: false });
    expect(mapWhenMade(2000, NOW_2026)).toEqual({ whenMade: '2000_2006', usedFallback: false });
  });

  it('falls back to 1990s for anything newer than the 20-year cutoff', () => {
    // cutoff = 2026 - 20 = 2006; 2007 is one year over.
    expect(mapWhenMade(2007, NOW_2026)).toEqual({ whenMade: '1990s', usedFallback: true });
  });

  it('falls back to 1990s for a missing year', () => {
    expect(mapWhenMade(null, NOW_2026)).toEqual({ whenMade: '1990s', usedFallback: true });
    expect(mapWhenMade(undefined, NOW_2026)).toEqual({ whenMade: '1990s', usedFallback: true });
  });

  it('maps the 1990-1999 boundary', () => {
    expect(mapWhenMade(1999, NOW_2026)).toEqual({ whenMade: '1990s', usedFallback: false });
    expect(mapWhenMade(1990, NOW_2026)).toEqual({ whenMade: '1990s', usedFallback: false });
  });

  it('maps every decade bucket down to before_1700', () => {
    expect(mapWhenMade(1850, NOW_2026).whenMade).toBe('1800s');
    expect(mapWhenMade(1750, NOW_2026).whenMade).toBe('1700s');
    expect(mapWhenMade(1699, NOW_2026).whenMade).toBe('before_1700');
  });

  it('the cutoff rolls forward with the current year (not frozen at 2006)', () => {
    const now2030 = new Date('2030-01-01T00:00:00Z');
    // 2010 is within 20 years of 2030, so it should NOT fall back.
    expect(mapWhenMade(2010, now2030)).toEqual({ whenMade: '2000_2006', usedFallback: false });
  });
});

describe('computeEtsyPrice', () => {
  it('applies the markup percentage on top of the manual price', () => {
    const product = makeProduct({ price_mode: 'manual', manual_price_label: '$100' });
    const result = computeEtsyPrice(product, null, 8);
    expect(result.basePrice).toBe(100);
    expect(result.price).toBe(108);
    expect(result.rejectedReason).toBeNull();
  });

  it('applies the markup on top of the spot-computed price', () => {
    const product = makeProduct({ price_mode: 'spot-multiplier', purity: 14, gram_weight: 10, pricing_multiplier: 2 });
    const spotData = { goldPerTroyOz: 3110.34768, silverPerTroyOz: null, fetchedAt: Date.now(), source: 'api' as const };
    // melt = weight(10) * (14/24) * (spotPerOz/31.1034768) = 10 * 0.5833.. * 100 = ~583.33;
    // price = melt * 2 = ~1166.67, rounded to the whole dollar the storefront shows.
    const result = computeEtsyPrice(product, spotData, 0);
    expect(result.basePrice).toBe(1167);
    expect(result.price).toBe(1167);
  });

  it('fails closed instead of pushing a storefront fallback spot price', () => {
    const product = makeProduct({ price_mode: 'spot-multiplier', purity: 14, gram_weight: 10, pricing_multiplier: 2 });
    const fallback = { goldPerTroyOz: 3300, silverPerTroyOz: null, fetchedAt: Date.now(), source: 'fallback' as const };
    const result = computeEtsyPrice(product, fallback, 8);
    expect(result.price).toBeNull();
    expect(result.rejectedReason).toMatch(/live metal spot pricing is unavailable/i);
  });

  it('requires a live silver quote for silver spot-priced inventory', () => {
    const product = makeProduct({ category: 'Silver', price_mode: 'spot-multiplier', purity: 925, gram_weight: 100, pricing_multiplier: 2 });
    const goldOnly = { goldPerTroyOz: 3300, silverPerTroyOz: null, fetchedAt: Date.now(), source: 'api' as const };
    const result = computeEtsyPrice(product, goldOnly, 8);
    expect(result.price).toBeNull();
    expect(result.rejectedReason).toMatch(/live silver spot pricing is unavailable/i);
  });

  it('uses a sold product price lock instead of the latest metal price', () => {
    const product = makeProduct({ status: 'sold', sold_price: 800, price_mode: 'spot-multiplier' });
    const spotData = { goldPerTroyOz: 9_999, silverPerTroyOz: null, fetchedAt: Date.now(), source: 'api' as const };
    const result = computeEtsyPrice(product, spotData, 8);
    expect(result.basePrice).toBe(800);
    expect(result.price).toBe(864);
  });

  it('rejects prices under $0.20', () => {
    // Product prices are whole dollars now, so a negative markup is the only
    // way left to land between $0 and Etsy's floor. The guard stays regardless.
    const product = makeProduct({ price_mode: 'manual', manual_price_label: '$1' });
    const result = computeEtsyPrice(product, null, -90);
    expect(result.basePrice).toBe(1);
    expect(result.price).toBeNull();
    expect(result.rejectedReason).toMatch(/0\.20/);
  });

  it('rejects a sub-50-cent price, which rounds away to $0', () => {
    const product = makeProduct({ price_mode: 'manual', manual_price_label: '$0.10' });
    const result = computeEtsyPrice(product, null, 0);
    expect(result.price).toBeNull();
    expect(result.rejectedReason).toMatch(/no price could be computed/i);
  });

  it('returns null when no price can be computed', () => {
    const product = makeProduct({ price_mode: 'manual', manual_price_label: null, asking_price: null });
    const result = computeEtsyPrice(product, null, 8);
    expect(result.price).toBeNull();
  });
});

describe('buildMappedPayload — private-field allowlist guarantee', () => {
  it('never leaks cost_basis, minimum_price, internal_notes, or other private fields', () => {
    const product = makeProduct();
    const payload = buildMappedPayload(product, null, null);
    const serialized = JSON.stringify(payload);

    for (const field of ETSY_FORBIDDEN_PRODUCT_FIELDS) {
      const value = product[field as keyof Product];
      if (typeof value === 'string' && value) {
        expect(serialized).not.toContain(value);
      }
    }
    // The forbidden field NAMES also shouldn't appear as JSON keys.
    for (const field of ETSY_FORBIDDEN_PRODUCT_FIELDS) {
      expect(Object.prototype.hasOwnProperty.call(payload, field)).toBe(false);
    }
  });

  it('flags the 1990s fallback in the payload for a mislabeled/missing year', () => {
    const payload = buildMappedPayload(makeProduct({ item_year: 2020 }), null, null);
    expect(payload.whenMade).toBe('1990s');
    expect(payload.whenMadeUsedFallback).toBe(true);
  });

  it('caps images at 20 (raised from 10 in August 2025) and assigns 1-based rank', () => {
    const urls = Array.from({ length: 25 }, (_, i) => `https://example.com/img-${i}.webp`);
    const payload = buildMappedPayload(makeProduct({ image_urls: urls }), null, null);
    expect(payload.images).toHaveLength(20);
    expect(payload.images[0].rank).toBe(1);
    expect(payload.images[19].rank).toBe(20);
  });
});

describe('resolveEffectiveTaxonomy — manual per-product category override', () => {
  it('falls back to the automatic ETSY_TAXONOMY_MAP guess when no override is given', () => {
    expect(resolveEffectiveTaxonomy('Bracelet', null)).toEqual(resolveTaxonomy('Bracelet'));
  });

  // Owner's deliberate choice 2026-07-08 (session 9): the Necklace product
  // type defaults to "Chains" (1221), NOT the old "Pendant Necklaces" (1229)
  // "closest match" — this catalog is predominantly chains, and Pendant is
  // its own product type. Not approximate, so it raises no "review" nag. The
  // real id was pinned from a live nodes fetch. See DECISIONS.md.
  it('maps the Necklace product type to Chains (1221), as an exact non-approximate default', () => {
    expect(resolveTaxonomy('Necklace')).toEqual({ taxonomyId: 1221, path: 'Jewelry > Necklaces > Chains' });
    const payload = buildMappedPayload(makeProduct({ product_type: 'Necklace' }), null, null);
    expect(payload.taxonomyId).toBe(1221);
    expect(payload.taxonomyIsApproximate).toBe(false);
  });

  it('keeps the distinct Pendant product type on Pendant Necklaces (1229)', () => {
    expect(resolveTaxonomy('Pendant')).toEqual({ taxonomyId: 1229, path: 'Jewelry > Necklaces > Pendant Necklaces' });
  });

  // Granular silver holloware / flatware / serveware / adornment types the
  // owner enters (22 real items that used to fail pre-flight's taxonomy check,
  // confirmed live 2026-07-08 session 9). Real Etsy leaf ids fetched live.
  describe('granular silver-tableware keyword fallback', () => {
    it('maps flatware types to Flatware & Silverware (1048), exact', () => {
      for (const t of ['Berry Spoon', 'Serving Spoon', 'Cold Meat Fork', 'Fish Server', 'Ladle', 'Knife', 'Mote Spoon']) {
        expect(resolveTaxonomy(t)).toEqual({
          taxonomyId: 1048,
          path: 'Home & Living > Kitchen & Dining > Dining & Serving > Flatware & Silverware',
        });
      }
    });

    it('maps holloware/serveware types to their closest real leaf, flagged approximate', () => {
      expect(resolveTaxonomy('Tray')).toMatchObject({ taxonomyId: 2537, approximate: true });
      expect(resolveTaxonomy('Tazza Set')).toMatchObject({ taxonomyId: 2538, approximate: true });
      expect(resolveTaxonomy('Coffee Pot')).toMatchObject({ taxonomyId: 1932, approximate: true });
      expect(resolveTaxonomy('Salt Cellar')).toMatchObject({ taxonomyId: 1050, approximate: true });
      expect(resolveTaxonomy('Napkin Ring')).toMatchObject({ taxonomyId: 1048, approximate: true });
      expect(resolveTaxonomy('Decanter Label')).toMatchObject({ taxonomyId: 1048, approximate: true });
    });

    it('maps Bhutanese Koma clasps / garment hooks to Brooches (1201), not tableware', () => {
      expect(resolveTaxonomy('Koma Clasp')).toMatchObject({ taxonomyId: 1201, approximate: true });
      expect(resolveTaxonomy('Garment Hook')).toMatchObject({ taxonomyId: 1201 });
    });

    it('pre-mapped 2026-07-10: the new Mug item + expected future silver forms resolve to real leaves', () => {
      expect(resolveTaxonomy('Mug')).toMatchObject({ taxonomyId: 1062 });
      expect(resolveTaxonomy('Cup')).toMatchObject({ taxonomyId: 1062 });
      expect(resolveTaxonomy('Goblet')).toMatchObject({ taxonomyId: 1861 });
      expect(resolveTaxonomy('Tankard')).toMatchObject({ taxonomyId: 1861 });
      expect(resolveTaxonomy('Candlestick')).toMatchObject({ taxonomyId: 2214 });
      expect(resolveTaxonomy('Candelabra')).toMatchObject({ taxonomyId: 2213 });
      expect(resolveTaxonomy('Pitcher')).toMatchObject({ taxonomyId: 1938 });
      expect(resolveTaxonomy('Vase')).toMatchObject({ taxonomyId: 1026 });
      expect(resolveTaxonomy('Bell')).toMatchObject({ taxonomyId: 6081 });
      expect(resolveTaxonomy('Inkwell')).toMatchObject({ taxonomyId: 6415 });
      expect(resolveTaxonomy('Cigarette Case')).toMatchObject({ taxonomyId: 134 });
      expect(resolveTaxonomy('Snuff Box')).toMatchObject({ taxonomyId: 6102 });
    });

    it('maps the four 2026-07-21 failed catalog types to verified Etsy leaves', () => {
      expect(resolveTaxonomy('Grape Shears')).toEqual({
        taxonomyId: 1052,
        path: 'Home & Living > Kitchen & Dining > Dining & Serving > Serving Utensils',
      });
      expect(resolveTaxonomy('Serving Set')).toEqual({
        taxonomyId: 1052,
        path: 'Home & Living > Kitchen & Dining > Dining & Serving > Serving Utensils',
      });
      expect(resolveTaxonomy('Coaster')).toEqual({
        taxonomyId: 1060,
        path: 'Home & Living > Kitchen & Dining > Drink & Barware > Drinkware > Coasters',
      });
      expect(resolveTaxonomy('Matchbox Holder')).toEqual({
        taxonomyId: 1867,
        path: 'Art & Collectibles > Collectibles > Tobacciana > Lighters',
        approximate: true,
      });
    });

    it('"Butter Dish" beats the generic bowl/dish rule (order matters — first match wins)', () => {
      expect(resolveTaxonomy('Butter Dish')).toMatchObject({ taxonomyId: 1045 });
      expect(resolveTaxonomy('Serving Dish')).toMatchObject({ taxonomyId: 1044 }); // still the generic bowl leaf
    });

    it('does not disturb a coarse mapped type (Necklace still → Chains 1221, exact)', () => {
      expect(resolveTaxonomy('Necklace')).toEqual({ taxonomyId: 1221, path: 'Jewelry > Necklaces > Chains' });
    });

    it('uses a visibly approximate generic collectible leaf for an unmapped future type', () => {
      expect(resolveTaxonomy('Flux Capacitor')).toEqual({
        taxonomyId: 69,
        path: 'Art & Collectibles > Collectibles > Figurines & Knick Knacks',
        approximate: true,
      });

      const checks = buildPreflightChecks(makeProduct({ product_type: 'Flux Capacitor', jewelry_type: 'Flux Capacitor' }), null, null);
      const taxonomyCheck = checks.find((check) => check.check === 'taxonomy');
      expect(taxonomyCheck?.ok).toBe(true);
      expect(taxonomyCheck?.message).toMatch(/category picker/i);
    });
  });

  it('an override wins over the automatic guess', () => {
    const result = resolveEffectiveTaxonomy('Ring', { id: 1233, path: 'Jewelry > Rings > Fraternal & Class Rings' });
    expect(result).toEqual({ taxonomyId: 1233, path: 'Jewelry > Rings > Fraternal & Class Rings' });
  });

  it('buildMappedPayload marks an override as such and never as approximate', () => {
    const product = makeProduct({ product_type: 'Ring' }); // automatic guess for Ring is approximate
    const withoutOverride = buildMappedPayload(product, null, null);
    expect(withoutOverride.taxonomyIsApproximate).toBe(true);
    expect(withoutOverride.taxonomyIsOverride).toBe(false);

    const withOverride = buildMappedPayload(product, null, null, { id: 1238, path: 'Jewelry > Rings > Solitaire Rings' });
    expect(withOverride.taxonomyId).toBe(1238);
    expect(withOverride.taxonomyIsOverride).toBe(true);
    expect(withOverride.taxonomyIsApproximate).toBe(false);
  });

  it('buildPreflightChecks does not flag an overridden category as approximate', () => {
    const product = makeProduct({ product_type: 'Ring' });
    const checks = buildPreflightChecks(product, null, null, { id: 1238, path: 'Jewelry > Rings > Solitaire Rings' });
    const taxonomyCheck = checks.find((check) => check.check === 'taxonomy');
    expect(taxonomyCheck?.ok).toBe(true);
    expect(taxonomyCheck?.message).toBeUndefined();
  });
});

describe('titleImpliedJewelryType', () => {
  it('returns the single mainstream type a title implies', () => {
    expect(titleImpliedJewelryType('Italian 18K Gold Cuban Curb Link Bracelet')).toBe('Bracelet');
    expect(titleImpliedJewelryType('Vintage Diamond Solitaire Ring')).toBe('Ring');
    expect(titleImpliedJewelryType('14K Gold Diamond Stud Earrings')).toBe('Earrings');
  });

  it('returns null when zero or multiple types appear (spoons, sets, ambiguous)', () => {
    expect(titleImpliedJewelryType('Antique Sterling Silver Berry Spoon')).toBeNull();
    expect(titleImpliedJewelryType('Gold Necklace and Bracelet Set')).toBeNull();
    expect(titleImpliedJewelryType('Diamond Pendant Necklace')).toBeNull();
  });

  it('does not mistake "earring" for "ring"', () => {
    expect(titleImpliedJewelryType('Pearl Drop Earrings')).toBe('Earrings');
  });
});

describe('pre-flight: title↔product_type mismatch warning (session 9, fifteenth addendum)', () => {
  const mismatch = (checks: ReturnType<typeof buildPreflightChecks>) => checks.find((c) => c.check === 'type_title_mismatch');

  it('warns (non-blocking) when the title implies a different type GROUP than the product type', () => {
    // The exact live case: a bracelet mistyped as Necklace.
    const product = makeProduct({ title: 'Vintage 18K Gold Cuban Curb Link Bracelet', product_type: 'Necklace', jewelry_type: 'Necklace' });
    const c = mismatch(buildPreflightChecks(product, null, null));
    expect(c).toBeDefined();
    expect(c?.ok).toBe(true); // never blocks the sync
    expect(c?.message).toMatch(/bracelet/i);
  });

  it('does not warn when the title and product type agree', () => {
    const product = makeProduct({ title: 'Vintage 18K Gold Cuban Curb Link Bracelet', product_type: 'Bracelet', jewelry_type: 'Bracelet' });
    expect(mismatch(buildPreflightChecks(product, null, null))).toBeUndefined();
  });

  it('does not warn on a within-group swap (a "Pendant" title on a Charm)', () => {
    const product = makeProduct({ title: '14K Gold Mickey Mouse Diamond Pendant', product_type: 'Charm', jewelry_type: 'Charm' });
    expect(mismatch(buildPreflightChecks(product, null, null))).toBeUndefined();
  });

  it('does not warn on an ambiguous multi-type title (a set)', () => {
    const product = makeProduct({ title: 'Gold Necklace and Bracelet Set', product_type: 'Necklace', jewelry_type: 'Necklace' });
    expect(mismatch(buildPreflightChecks(product, null, null))).toBeUndefined();
  });

  it('does not warn for a granular silver type whose title has no mainstream keyword', () => {
    const product = makeProduct({ title: 'Antique Sterling Silver Berry Spoon', product_type: 'Silverware', jewelry_type: 'Silverware' });
    expect(mismatch(buildPreflightChecks(product, null, null))).toBeUndefined();
  });
});

describe('computeContentHash', () => {
  it('is stable for identical payloads', () => {
    const payload = buildMappedPayload(makeProduct(), null, null);
    expect(computeContentHash(payload)).toBe(computeContentHash({ ...payload }));
  });

  it('does NOT change on a price-only change (2026-07-10) — price has its own dedicated push path; this hash is for content, not market drift', () => {
    const a = buildMappedPayload(makeProduct({ manual_price_label: '$100', price_mode: 'manual' }), null, null);
    const b = buildMappedPayload(makeProduct({ manual_price_label: '$200', price_mode: 'manual' }), null, null);
    expect(a.price).not.toBe(b.price);
    expect(computeContentHash(a)).toBe(computeContentHash(b));
  });

  it('still changes when a non-price field changes (title)', () => {
    const a = buildMappedPayload(makeProduct({ title: 'Original Title' }), null, null);
    const b = buildMappedPayload(makeProduct({ title: 'Different Title' }), null, null);
    expect(computeContentHash(a)).not.toBe(computeContentHash(b));
  });
});
