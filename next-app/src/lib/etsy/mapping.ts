import crypto from 'node:crypto';
import type { Product, SpotData } from '@/types/product';
import {
  formatProductPurityLabel,
  normalizeProductJewelryType,
  normalizeProductMetalType,
  normalizeProductQuantity,
  normalizeProductStatus,
  productLengthSizeDisplay,
  productMetalVariantLabel,
} from '@/types/product';
import { getMarketplaceSpotPriceError, getProductPriceValue } from '@/lib/pricing';
import { getProductImages } from '@/lib/sales';
import { getProductImageStoragePath } from '@/lib/product-image-storage';
import type { EtsyConnectionRow } from './store';

// Product -> Etsy payload mapping. Pure, unit-testable functions — no network
// or DB I/O here (sync.ts/images.ts do the I/O). Source of truth for every
// transform: etsy-sync-plan/02-field-mapping.md.
//
// ALLOWLIST, not blocklist: buildMappedPayload() below only ever reads named
// Product fields into a fresh object. Private fields (cost_basis,
// minimum_price, internal_notes, private_price_label, melt_value,
// live_spot_snapshot, acquisition_*) are never referenced anywhere in this
// file, so they structurally cannot leak into a payload — see
// __tests__/mapping.test.ts for the guarantee test.
export const ETSY_FORBIDDEN_PRODUCT_FIELDS = [
  'cost_basis',
  'minimum_price',
  'internal_notes',
  'private_price_label',
  'melt_value',
  'live_spot_snapshot',
  'acquisition_date',
  'acquisition_source',
] as const;

// ---------------------------------------------------------------------------
// when_made — verified 2026-07-08 against the live spec
// (https://www.etsy.com/openapi/generated/oas/3.0.0.json), createDraftListing
// request schema, "when_made" property. Enum confirmed verbatim (19 values,
// no deprecation notice, granular buckets and "before_2007" coexist in the
// same enum). Recorded discrepancy vs. the plan: 02-field-mapping.md guessed
// a "before_2007 family" bucket for 2000-2006; the live spec has a discrete
// "2000_2006" value, which is what this module uses (more precise, no
// deviation from the plan's *intent*, just a better-informed literal string).
// ---------------------------------------------------------------------------
export const ETSY_WHEN_MADE_VALUES = [
  'made_to_order',
  '2020_2026',
  '2010_2019',
  '2007_2009',
  'before_2007',
  '2000_2006',
  '1990s',
  '1980s',
  '1970s',
  '1960s',
  '1950s',
  '1940s',
  '1930s',
  '1920s',
  '1910s',
  '1900s',
  '1800s',
  '1700s',
  'before_1700',
] as const;

export interface WhenMadeResult {
  whenMade: (typeof ETSY_WHEN_MADE_VALUES)[number];
  usedFallback: boolean;
}

/**
 * Etsy's vintage policy requires 20+ years old. Q2 (etsy-sync-plan/13-open-questions.md):
 * the owner attests all inventory is genuinely vintage, so any item_year newer
 * than the 20-year cutoff (or missing) pushes as the '1990s' fallback instead
 * of being blocked — flagged in the dry-run, database/site untouched. The
 * cutoff is computed from `now` (not a hard-coded 2006) so it stays a correct
 * rolling 20-year window as calendar years pass; it evaluates to 2006 for any
 * call made during 2026, matching the plan's dated example exactly.
 */
export function vintageCutoffYear(now: Date = new Date()): number {
  // UTC, not local time: this runs on both a developer's machine (whatever
  // local zone) and Netlify's servers (UTC) — using UTC keeps the cutoff
  // stable across environments instead of drifting by a year right around
  // New Year's in zones behind UTC.
  return now.getUTCFullYear() - 20;
}

export function mapWhenMade(itemYear: number | null | undefined, now: Date = new Date()): WhenMadeResult {
  const cutoff = vintageCutoffYear(now);
  if (itemYear == null || itemYear > cutoff) return { whenMade: '1990s', usedFallback: true };
  if (itemYear >= 2000) return { whenMade: '2000_2006', usedFallback: false };
  if (itemYear >= 1990) return { whenMade: '1990s', usedFallback: false };
  if (itemYear >= 1980) return { whenMade: '1980s', usedFallback: false };
  if (itemYear >= 1970) return { whenMade: '1970s', usedFallback: false };
  if (itemYear >= 1960) return { whenMade: '1960s', usedFallback: false };
  if (itemYear >= 1950) return { whenMade: '1950s', usedFallback: false };
  if (itemYear >= 1940) return { whenMade: '1940s', usedFallback: false };
  if (itemYear >= 1930) return { whenMade: '1930s', usedFallback: false };
  if (itemYear >= 1920) return { whenMade: '1920s', usedFallback: false };
  if (itemYear >= 1910) return { whenMade: '1910s', usedFallback: false };
  if (itemYear >= 1900) return { whenMade: '1900s', usedFallback: false };
  if (itemYear >= 1800) return { whenMade: '1800s', usedFallback: false };
  if (itemYear >= 1700) return { whenMade: '1700s', usedFallback: false };
  return { whenMade: 'before_1700', usedFallback: false };
}

// ---------------------------------------------------------------------------
// Title / tags / materials / description
// ---------------------------------------------------------------------------
export function mapTitle(title: string | null | undefined): string {
  let cleaned = (title ?? '').trim().replace(/\s+/g, ' ');
  // Etsy allows "&" at most once in a listing title — a second one is a hard
  // 400 ("& can only be used once", confirmed live 2026-07-08 on two sterling
  // pieces with descriptive "X & Y ... A & B" titles). Keep the first, spell
  // the rest as "and" so multi-"&" titles still publish. Done before the
  // 140-char cap since "and" is longer than "&".
  const firstAmp = cleaned.indexOf('&');
  if (firstAmp !== -1) {
    cleaned = (cleaned.slice(0, firstAmp + 1) + cleaned.slice(firstAmp + 1).replace(/&/g, 'and')).replace(/\s+/g, ' ').trim();
  }
  if (cleaned.length <= 140) return cleaned;
  const truncated = cleaned.slice(0, 140);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 40 ? truncated.slice(0, lastSpace) : truncated).trim();
}

const TAG_MAX_COUNT = 13;
const TAG_MAX_LENGTH = 20;
const TAG_DISALLOWED_CHARS = /[^a-z0-9\s-]/gi;
// Internal filter-UI prefixes (drive the site's own product-type/chain-type/
// length filters) — never buyer-facing keywords, so raw internal tags using
// them are excluded from the free-text fallback pass below.
const INTERNAL_TAG_PREFIX = /^(jt|ct|len):/i;

/**
 * Clamp a tag to Etsy's 20-char limit WITHOUT chopping a word in half. A live
 * listing (2026-07-08) showed "solid silver bracele" — "solid silver
 * bracelet" (21 chars) hard-sliced to 20 — which looks broken to a buyer. So
 * when a phrase is too long we drop the trailing partial word at the last
 * space instead. A single word longer than 20 chars (rare) has no space to
 * fall back to, so it's still hard-cut — nothing better is possible there.
 */
function clampTagToWordBoundary(value: string): string {
  if (value.length <= TAG_MAX_LENGTH) return value;
  const cut = value.slice(0, TAG_MAX_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim();
}

function karatFromPurity(purity: number | null | undefined): number | null {
  if (!purity) return null;
  const karat = purity <= 24 ? Math.round(purity) : Math.round((purity / 1000) * 24);
  return karat > 0 ? karat : null;
}

// Words in a title that carry ~no standalone Etsy-search value or are already
// captured by the structured tags (metal, karat, color, product type). Filtered
// out of the title-word broadening below so only genuinely useful descriptors
// (e.g. "charm", "byzantine", "figaro", "diamond") survive.
const TITLE_NOISE_WORDS = new Set<string>([
  // grammar / filler
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'your', 'our', 'plus',
  'new', 'used', 'pre', 'owned', 'lot', 'set', 'pair',
  // descriptors already implied or low-value on their own
  'solid', 'genuine', 'real', 'fine', 'estate', 'vintage', 'antique',
  // metals / finishes (covered by structured metal tags)
  'gold', 'silver', 'platinum', 'palladium', 'sterling', 'vermeil', 'plated', 'filled',
  // colors (covered by the "<color> <metal> <type>" compound)
  'yellow', 'white', 'rose', 'tricolor', 'tri', 'bicolor', 'bi', 'two', 'tone', 'multi', 'color', 'colour',
]);

// Measurement / unit tokens that shouldn't become tags on their own.
const TITLE_UNIT_WORDS = new Set<string>([
  'in', 'inch', 'inches', 'mm', 'cm', 'ct', 'cts', 'ctw', 'tcw', 'tw', 'carat', 'carats',
  'gram', 'grams', 'gr', 'dwt', 'oz', 'ozt', 'pc', 'pcs',
]);

// Cap on standalone title words added as tags, so title broadening can't crowd
// out the on-brand estate/vintage/antique tags within Etsy's 13-tag budget.
// (Type-word phrases like "charm bracelet" are added separately, before this.)
const TITLE_WORD_TAG_LIMIT = 4;

/** Naive singularizer good enough to match a plural title word to a singular product type (bracelets→bracelet, charms→charm). */
function singularizeWord(word: string): string {
  return word.endsWith('s') && word.length > 3 ? word.slice(0, -1) : word;
}

/**
 * Broadens the tag set with meaningful words from the product TITLE that the
 * structured fields don't already cover — the fix for a "…Charm Bracelet" whose
 * `product_type` is only "Bracelet" ending up with no "charm" tag (owner report
 * 2026-07-08). Returns:
 *  - `phrases`: a word immediately preceding the product-type word, joined with
 *    it ("charm" + bracelet → "charm bracelet") — the highest-value derived tag.
 *  - `words`: standalone meaningful words in title order.
 * Noise (metal/color/karat/units, pure numbers, grammar words, and the product
 * type word itself) is filtered so only search-useful descriptors remain.
 */
function extractTitleTags(title: string | null | undefined, typeWord: string): { phrases: string[]; words: string[] } {
  if (!title) return { phrases: [], words: [] };
  const tokens = title.toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean);
  const typeSingular = typeWord ? singularizeWord(typeWord) : '';
  const isNoise = (word: string): boolean =>
    word.length < 3 ||
    /\d/.test(word) || // numbers, karat tokens (14k), purity (925), sizes
    TITLE_NOISE_WORDS.has(word) ||
    TITLE_UNIT_WORDS.has(word) ||
    (typeSingular !== '' && singularizeWord(word) === typeSingular);

  const words: string[] = [];
  for (const token of tokens) {
    if (isNoise(token) || words.includes(token)) continue;
    words.push(token);
  }

  const phrases: string[] = [];
  if (typeSingular !== '') {
    for (let i = 1; i < tokens.length; i += 1) {
      if (singularizeWord(tokens[i]) === typeSingular && !isNoise(tokens[i - 1])) {
        const phrase = `${tokens[i - 1]} ${typeWord}`;
        if (!phrases.includes(phrase)) phrases.push(phrase);
      }
    }
  }
  return { phrases, words };
}

/**
 * Whether an item is worn JEWELRY (vs. silver holloware/flatware, a coin, …)
 * for TAG purposes, decided by its resolved Etsy taxonomy: jewelry lives under
 * "Jewelry >" or "Accessories >" (brooches/cufflinks live under Accessories),
 * everything else (Home & Living tableware, Art & Collectibles coins, …) is
 * not. Drives whether the jewelry-specific category tags ("silver jewelry",
 * "estate jewelry", "vintage/antique jewelry") apply — a silver mug should not
 * be tagged "estate jewelry" (owner report 2026-07-10). An unmapped type
 * (can't sync anyway) defaults to jewelry, preserving prior behavior for this
 * jewelry-dominant catalog.
 */
function isJewelryProductType(productType: string | null | undefined): boolean {
  const taxonomy = resolveTaxonomy(productType);
  if (!taxonomy?.path) return true;
  return taxonomy.path.startsWith('Jewelry >') || taxonomy.path.startsWith('Accessories >');
}

/**
 * Composed, buyer-searchable tags built from the product's own structured
 * fields (metal/purity/chain type/product type), not a sanitized pass-through
 * of the site's internal filter tags (`jt:`/`ct:`/`len:` — meant for this
 * site's own filter UI, not Etsy search; a bare reformatted `len:` value like
 * "7 75" has ~zero buyer search value). Mixes specific multi-word phrases
 * (front-loaded — Etsy weighs earlier tags more heavily, and longer phrases
 * face less competition) with broader single-word terms, then tops up with
 * any genuine free-text seller tags that aren't one of the internal prefixes.
 */
export function mapTags(
  product: Pick<Product, 'title' | 'tags' | 'chain_type' | 'metal_variant' | 'metal_type' | 'category' | 'purity' | 'product_type' | 'jewelry_type' | 'brand'>,
  /** Owner-supplied custom tags (Etsy drawer) merged into the auto-generated set. */
  extraTags?: string[] | null,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const add = (value: string | null | undefined) => {
    if (out.length >= TAG_MAX_COUNT || !value) return;
    const normalized = value
      .replace(TAG_DISALLOWED_CHARS, ' ')
      .trim()
      .replace(/\s+/g, ' ');
    const cleaned = clampTagToWordBoundary(normalized);
    if (!cleaned) return;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(cleaned);
  };

  // Add a "vintage X" / "antique X" pair only if BOTH fit the 13-tag cap. The
  // owner's rule is that the two always travel together, so a pair is
  // all-or-nothing rather than leaving a lone "vintage X" when the tag budget
  // runs out mid-pair. (Both phrases are unique and generated nowhere else, so
  // neither is ever dedup-dropped — a pre-check on count alone is sufficient.)
  const addVintageAntiquePair = (vintage: string, antique: string) => {
    if (out.length + 2 > TAG_MAX_COUNT) return;
    add(vintage);
    add(antique);
  };

  // Owner-supplied custom tags go FIRST — deliberately chosen, so they're
  // guaranteed to fit within Etsy's 13-tag cap and carry the most search weight.
  // They pass through the same clean/dedup/clamp as every other tag via add().
  for (const extra of extraTags ?? []) add(extra);

  const productTypeLabel = normalizeProductJewelryType(product.product_type ?? product.jewelry_type);
  const typeWord = productTypeLabel && productTypeLabel !== 'Other' ? productTypeLabel.toLowerCase() : '';
  const metalType = normalizeProductMetalType(product.metal_type, product.category);
  const metalWord =
    metalType === 'Gold' ? 'gold' : metalType === 'Silver' ? 'silver' : metalType === 'Platinum' ? 'platinum' : metalType === 'Palladium' ? 'palladium' : '';
  const karat = metalType === 'Gold' ? karatFromPurity(product.purity) : null;
  const karatWord = karat ? `${karat}k` : '';
  const colorWord = /^(yellow|white|rose|tricolor|bicolor)_gold$/.exec(product.metal_variant ?? '')?.[1] ?? '';
  const chainWord = product.chain_type?.trim().toLowerCase() ?? '';
  // Metal-specific word for the vintage/antique pair below. Silver items use
  // "sterling" (the buyer-facing premium term), not the bare "silver".
  const vintageMetalWord =
    metalType === 'Silver' ? 'sterling' : metalType === 'Gold' ? 'gold' : metalType === 'Platinum' ? 'platinum' : metalType === 'Palladium' ? 'palladium' : '';

  if (karatWord && metalWord && typeWord) add(`${karatWord} ${metalWord} ${typeWord}`); // "14k gold bracelet"
  if (chainWord && typeWord) add(`${chainWord} ${typeWord}`); // "cuban link bracelet"
  if (chainWord) add(`${chainWord} chain`); // "cuban link chain"
  if (metalWord && typeWord) add(`solid ${metalWord} ${typeWord}`); // "solid gold bracelet"
  if (colorWord && metalWord && typeWord) add(`${colorWord} ${metalWord} ${typeWord}`); // "yellow gold bracelet"

  // Broaden with meaningful words from the TITLE the structured fields miss —
  // e.g. "charm" / "charm bracelet" from a "…Charm Bracelet" typed only as a
  // Bracelet (owner report 2026-07-08). Type-word phrases ("charm bracelet")
  // rank highest, then standalone words. Capped so it can't crowd out the
  // on-brand estate/vintage/antique tags below; noise is already filtered out.
  const titleTags = extractTitleTags(product.title, typeWord);
  for (const phrase of titleTags.phrases) add(phrase);
  let titleWordsAdded = 0;
  for (const word of titleTags.words) {
    if (titleWordsAdded >= TITLE_WORD_TAG_LIMIT) break;
    const before = out.length;
    add(word);
    if (out.length > before) titleWordsAdded += 1;
  }

  if (product.brand) add(product.brand);
  if (karatWord && metalWord) add(`${karatWord} ${metalWord}`); // "14k gold"
  if (metalWord && typeWord) add(`${metalWord} ${typeWord}`); // "gold bracelet"

  // JEWELRY-specific category tags — but ONLY for actual worn jewelry. A
  // silver mug/tray/spoon is not "estate jewelry" (owner report 2026-07-10);
  // it gets object-appropriate silver keywords instead. Determined by the
  // resolved Etsy taxonomy (jewelry vs. Home & Living / Collectibles).
  const isJewelry = isJewelryProductType(product.product_type ?? product.jewelry_type);
  const isSilverObject = !isJewelry && metalType === 'Silver';
  if (isJewelry) {
    if (metalWord) add(`${metalWord} jewelry`); // "gold jewelry"
    add('estate jewelry');
  } else if (isSilverObject) {
    add('sterling silver');
    add('estate silver');
  }
  // Vintage/antique category signals. This whole catalog is attested estate/
  // vintage (Q2 — see mapWhenMade), and buyers search both "vintage" and
  // "antique" loosely, so per the owner's request (2026-07-08) every item
  // carries BOTH terms — antique is always paired with vintage — plus a
  // metal-specific pair when the metal is known ("vintage sterling"/"antique
  // sterling", "vintage gold"/"antique gold", …). Placed right after the
  // category tags so these on-brand terms outrank the generic single words
  // below within the 13-tag budget. The generic "…jewelry" pair likewise
  // becomes a "…silver" pair for non-jewelry silver objects.
  if (vintageMetalWord) addVintageAntiquePair(`vintage ${vintageMetalWord}`, `antique ${vintageMetalWord}`);
  if (isJewelry) {
    addVintageAntiquePair('vintage jewelry', 'antique jewelry');
  } else if (isSilverObject) {
    addVintageAntiquePair('vintage silver', 'antique silver');
  }
  if (karatWord) add(karatWord); // "14k"
  if (metalWord) add(metalWord); // "gold"
  if (typeWord) add(typeWord); // "bracelet"

  for (const raw of product.tags ?? []) {
    if (out.length >= TAG_MAX_COUNT) break;
    if (!raw || INTERNAL_TAG_PREFIX.test(raw)) continue;
    add(raw);
  }

  return out;
}

export function mapMaterials(
  product: Pick<Product, 'metal_variant' | 'metal_type' | 'purity' | 'category'>,
): string[] {
  const materials = new Set<string>();
  const metalType = normalizeProductMetalType(product.metal_type, product.category);

  if (metalType === 'Gold') {
    const karat = karatFromPurity(product.purity);
    if (karat) {
      materials.add(`${karat}k gold`);
      materials.add(`${karat}k`);
    }
    materials.add('solid gold');
    materials.add('gold');
  } else if (metalType === 'Silver') {
    materials.add('sterling silver');
    materials.add('silver');
  } else if (metalType === 'Platinum') {
    materials.add('platinum');
  } else if (metalType === 'Palladium') {
    materials.add('palladium');
  }

  const variantLabel = productMetalVariantLabel(product.metal_variant, product.category === 'Silver' ? 'Silver' : 'Gold')
    .toLowerCase()
    .trim();
  if (variantLabel) materials.add(variantLabel);

  return Array.from(materials).slice(0, 13);
}

// ---------------------------------------------------------------------------
// Structured category properties — the same fields Etsy's own listing editor
// shows as "Suggested" chips (Material, Gold purity, Bracelet length, etc)
// when a seller edits a listing by hand. The v3 API has no endpoint that
// returns those UI suggestions (only `suggested_title` exists — confirmed by
// a full-spec search 2026-07-08), so this pushes the same values ourselves
// from data already on the product record via updateListingProperty.
//
// Property/value ids below were verified live 2026-07-08 against
// getPropertiesByTaxonomyId for every taxonomy id in ETSY_TAXONOMY_MAP (see
// OWNER-SETUP.md). Only fields backed by a real product column are ever
// pushed — Gemstone, Bracelet/Pendant width, Adjustable, Closure, Ring size,
// and Watch band material have no source field anywhere in the schema, so
// they are never set. Guessing at any of those would be fabricating a fact
// on a live listing for a business priced on real melt value/purity — worse
// than just leaving Etsy's manual "Suggested" chip for the seller to confirm.
//
// Length is ALSO deliberately never pushed, despite having a real source
// field (`length`) — a live test (2026-07-08, session 5) proved this
// property is unsafe to guess at. Scale-based properties like Length have no
// enumerated `possible_values` to pick a `value_id` from; Etsy's own
// tutorial shows an example value_id for one (18156809190) that is neither
// the scale_id nor anything derivable from listing data, and never explains
// where it comes from. Passing `value_ids: [scale_id]` as a guess did NOT
// fail — Etsy silently resolved it against its shared global value
// vocabulary and stored "Gray" (a color, from a wholly unrelated property)
// as the bracelet's length. Unlike every other property here, a wrong guess
// for a scale-based one doesn't fail safely into a warning — it silently
// corrupts the live listing — so this stays off until the real mechanism is
// confirmed. See DECISIONS.md 2026-07-08 (session 5).
// ---------------------------------------------------------------------------

// Global Etsy value vocabulary — confirmed stable across every taxonomy node
// it appears in (compared Material-multi/Gold-solidity/Gold-purity possible
// value lists across all 10 pinned nodes; the ids didn't change).
const ETSY_MATERIAL_VALUE_ID: Record<string, number> = {
  gold: 5261,
  'yellow gold': 139,
  'white gold': 285,
  'rose gold': 230,
  silver: 246,
  'sterling silver': 5113,
  platinum: 208,
  palladium: 2536,
};
const ETSY_GOLD_PURITY_VALUE_ID: Record<number, number> = {
  9: 5102,
  10: 5103,
  14: 5111,
  18: 5109,
  20: 5107,
  22: 5106,
  24: 5110,
};
const ETSY_GOLD_SOLIDITY_SOLID_ID = 5105;
const ETSY_GOLD_SOLIDITY_VERMEIL_ID = 5112;

const MATERIALS_PROPERTY_ID = 148789511893;
const GOLD_SOLIDITY_PROPERTY_ID = 570246213608;
const GOLD_PURITY_PROPERTY_ID = 570246213609;

/** Categories where Etsy's own taxonomy has no Gold solidity/purity property at all (confirmed live) — pushing either would 400. */
const NO_GOLD_PURITY_PRODUCT_TYPES = new Set(['Cufflinks', 'Coin', 'Bullion', 'Silverware']);

export interface EtsyPropertyUpdate {
  propertyId: number;
  valueIds: number[];
  values: string[];
  scaleId?: number;
}

/**
 * Structured Etsy listing properties built from the product's own fields —
 * additive and best-effort. An empty array means nothing here was
 * confidently derivable; callers must never let a failed/partial push here
 * fail the sync (see sync.ts).
 */
export function mapProperties(
  product: Pick<Product, 'metal_type' | 'metal_variant' | 'category' | 'purity' | 'product_type' | 'jewelry_type'>,
): EtsyPropertyUpdate[] {
  const updates: EtsyPropertyUpdate[] = [];
  const productType = normalizeProductJewelryType(product.product_type ?? product.jewelry_type) ?? 'Other';
  const metalType = normalizeProductMetalType(product.metal_type, product.category);

  const materialIds = new Set<number>();
  if (metalType === 'Gold') {
    materialIds.add(ETSY_MATERIAL_VALUE_ID.gold);
    const colorKey = /^(yellow|white|rose)_gold$/.exec(product.metal_variant ?? '')?.[0]?.replace('_', ' ');
    if (colorKey && ETSY_MATERIAL_VALUE_ID[colorKey] != null) materialIds.add(ETSY_MATERIAL_VALUE_ID[colorKey]);
  } else if (metalType === 'Silver') {
    materialIds.add(ETSY_MATERIAL_VALUE_ID.silver);
    materialIds.add(ETSY_MATERIAL_VALUE_ID['sterling silver']);
  } else if (metalType === 'Platinum') {
    materialIds.add(ETSY_MATERIAL_VALUE_ID.platinum);
  } else if (metalType === 'Palladium') {
    materialIds.add(ETSY_MATERIAL_VALUE_ID.palladium);
  }
  if (materialIds.size > 0) {
    const ids = Array.from(materialIds).slice(0, 5);
    const names = Object.entries(ETSY_MATERIAL_VALUE_ID).reduce<Record<number, string>>((acc, [name, id]) => ({ ...acc, [id]: name }), {});
    updates.push({ propertyId: MATERIALS_PROPERTY_ID, valueIds: ids, values: ids.map((id) => names[id] ?? '') });
  }

  if (metalType === 'Gold' && !NO_GOLD_PURITY_PRODUCT_TYPES.has(productType)) {
    const isVermeil = product.metal_variant === 'vermeil';
    const solidityId = isVermeil ? ETSY_GOLD_SOLIDITY_VERMEIL_ID : ETSY_GOLD_SOLIDITY_SOLID_ID;
    updates.push({ propertyId: GOLD_SOLIDITY_PROPERTY_ID, valueIds: [solidityId], values: [isVermeil ? 'Gold vermeil' : 'Solid gold'] });

    const karat = karatFromPurity(product.purity);
    const purityId = karat ? ETSY_GOLD_PURITY_VALUE_ID[karat] : undefined;
    if (purityId) updates.push({ propertyId: GOLD_PURITY_PROPERTY_ID, valueIds: [purityId], values: [`${karat}k`] });
  }

  // Length is intentionally never pushed here — see the block comment above
  // this section for why (confirmed-live silent data corruption risk).

  return updates;
}

export function mapSku(product: Pick<Product, 'sku' | 'inventory_number'>): string {
  const explicit = product.sku?.trim();
  if (explicit) return explicit;
  if (product.inventory_number != null) return `NEJ-${product.inventory_number}`;
  return '';
}

/**
 * Buyer-facing description: the site's own copy plus a plain-text spec block.
 * Deliberately omits any URL (Etsy restricts off-site links that steer buyers
 * to buy the same item elsewhere — etsy-sync-plan/15-compliance.md).
 */
export function mapDescription(
  product: Pick<
    Product,
    | 'description'
    | 'public_notes'
    | 'details'
    | 'length'
    | 'purity'
    | 'gram_weight'
    | 'weight_grams'
    | 'brand'
    | 'item_year'
    | 'sku'
    | 'inventory_number'
    | 'title'
    | 'title_es'
    | 'metal_variant'
    | 'metal_type'
    | 'category'
    | 'product_type'
    | 'jewelry_type'
    | 'chain_type'
    | 'tags'
    | 'tags_es'
  >,
): string {
  const bodyParts = [product.description?.trim(), product.public_notes?.trim(), ...(product.details ?? [])].filter(
    (part): part is string => Boolean(part && part.trim()),
  );
  const body = bodyParts.join('\n\n').trim();

  const specLines: string[] = [];
  const metalLabel = productMetalVariantLabel(product.metal_variant, product.category === 'Silver' ? 'Silver' : 'Gold');
  if (metalLabel) specLines.push(`Metal: ${metalLabel}`);
  // "14K" / "925", never the bare column number (owner report 2026-09-12: the
  // description read "Purity: 14").
  const purityLabel = formatProductPurityLabel(product.purity);
  if (purityLabel) specLines.push(`Purity: ${purityLabel}`);
  const weight = product.gram_weight ?? product.weight_grams;
  if (weight) specLines.push(`Weight: ${weight}g`);
  // Same words the product page prints ("18.5 in" / "Size: 7"), so a raw
  // "470 mm" or bare "18.5" never reaches a buyer unlabelled.
  const lengthDisplay = productLengthSizeDisplay(product);
  if (lengthDisplay) specLines.push(`Length/Size: ${lengthDisplay}`);
  if (product.brand) specLines.push(`Maker/Brand: ${product.brand}`);
  if (product.item_year) specLines.push(`Era: ${product.item_year}`);
  const sku = mapSku(product);
  if (sku) specLines.push(`Inventory #: ${sku}`);

  const spec = specLines.length ? `Specifications:\n${specLines.join('\n')}` : '';
  return [body, spec].filter(Boolean).join('\n\n').trim() || mapTitle(product.title);
}

// ---------------------------------------------------------------------------
// Price — reuses next-app/src/lib/pricing.ts, never reimplements the math.
// Etsy has no formula pricing, so the concrete USD price is flattened at push
// time, then an optional Etsy-fee markup is applied (Q5). Rounds to 2
// decimals; rejects under Etsy's $0.20 minimum.
// ---------------------------------------------------------------------------
export interface EtsyPriceResult {
  /** Final price to push (after markup), or null if unpriceable/rejected. */
  price: number | null;
  /** Site price before the markup, for display in the dry-run preview. */
  basePrice: number | null;
  rejectedReason: string | null;
}

export function computeEtsyPrice(product: Product, spotData: SpotData | null, markupPct: number): EtsyPriceResult {
  const spotError = getMarketplaceSpotPriceError(product, spotData);
  if (spotError) {
    return { price: null, basePrice: null, rejectedReason: spotError };
  }

  const basePrice = getProductPriceValue(product, spotData)
    ?? (product.price_mode === 'manual' && product.asking_price != null ? Number(product.asking_price) : null);

  if (basePrice == null || !Number.isFinite(basePrice) || basePrice <= 0) {
    return { price: null, basePrice: null, rejectedReason: 'No price could be computed for this item.' };
  }

  const marked = basePrice * (1 + (markupPct || 0) / 100);
  const rounded = Math.round((marked + Number.EPSILON) * 100) / 100;
  if (rounded < 0.2) {
    return { price: null, basePrice, rejectedReason: 'Etsy rejects prices under $0.20.' };
  }
  return { price: rounded, basePrice, rejectedReason: null };
}

// ---------------------------------------------------------------------------
// Taxonomy — pinned 2026-07-08 from a live GET
// /v3/application/seller-taxonomy/nodes call (3065 total nodes). Etsy's
// jewelry taxonomy has no generic "plain chain necklace" / "plain ring" /
// "plain earrings" leaf, and no dedicated "bullion" category at all — the
// entries marked `approximate: true` are the closest available leaf, a
// judgment call rather than an exact match, and worth owner review (e.g. if
// most rings are actually solitaires, "Statement Rings" may not be the best
// default). Entries without that flag matched exactly.
// ---------------------------------------------------------------------------
export interface TaxonomyMapping {
  taxonomyId: number | null;
  /** Human-readable target node, shown in the dry-run preview regardless of pin status. */
  path: string;
  /** True when no exact-fit leaf exists and this is the closest reasonable pick — see the block comment above. */
  approximate?: boolean;
}

export const ETSY_TAXONOMY_MAP: Record<string, TaxonomyMapping> = {
  // "Chains" (1221) is the deliberate default for the Necklace product type —
  // this catalog is predominantly chain-style necklaces (Cuban links, rope,
  // etc.), and the distinct Pendant product type already routes to Pendant
  // Necklaces (1229) below, so a plain "Necklace" here genuinely means a
  // chain, not an approximation. Chosen by the owner 2026-07-08 (session 9)
  // after reviewing Etsy's full Necklaces subcategory list; the real id was
  // pinned from a live nodes fetch (siblings cross-checked: 1229 Pendant /
  // 1222 Charm both matched the already-pinned ids) and 1221 confirmed to
  // carry the same Material/Gold solidity/Gold purity properties this app
  // pushes. Not `approximate` — it's the intended category for this type.
  Necklace: { taxonomyId: 1221, path: 'Jewelry > Necklaces > Chains' },
  Bracelet: { taxonomyId: 1196, path: 'Jewelry > Bracelets > Chain & Link Bracelets' },
  // No generic "ring" leaf exists; Statement Rings is the closest catch-all
  // for a ring that isn't specifically solitaire/stackable/signet/wedding-etc.
  Ring: { taxonomyId: 1240, path: 'Jewelry > Rings > Statement Rings', approximate: true },
  Pendant: { taxonomyId: 1229, path: 'Jewelry > Necklaces > Pendant Necklaces' },
  // No standalone "loose charm" finished-jewelry leaf exists (Etsy's "Charms"
  // node is a craft-supply component category, not a finished-jewelry one).
  Charm: { taxonomyId: 1222, path: 'Jewelry > Necklaces > Charm Necklaces', approximate: true },
  // No generic "earrings" leaf exists; Stud is the single most common style.
  Earrings: { taxonomyId: 1214, path: 'Jewelry > Earrings > Stud Earrings', approximate: true },
  Brooch: { taxonomyId: 1201, path: 'Accessories > Pins & Clips > Brooches' },
  Cufflinks: { taxonomyId: 57, path: 'Accessories > Suit & Tie Accessories > Cuff Links & Tie Clips' },
  // No gender-neutral-by-default leaf at the top level; Unisex avoids
  // assuming gender absent per-item data.
  Watch: { taxonomyId: 6076, path: 'Jewelry > Watches > Wrist Watches > Unisex Wrist Watches', approximate: true },
  Coin: { taxonomyId: 68, path: 'Art & Collectibles > Collectibles > Coins & Money' },
  // No dedicated bullion/bar/ingot category exists anywhere in Etsy's
  // taxonomy (confirmed by keyword search across all 3065 nodes) — reuses
  // the Coins & Money leaf, same as the plan's own original approach.
  Bullion: { taxonomyId: 68, path: 'Art & Collectibles > Collectibles > Coins & Money', approximate: true },
  Silverware: { taxonomyId: 1048, path: 'Home & Living > Kitchen & Dining > Dining & Serving > Flatware & Silverware' },
};

// Etsy-specific keyword fallback for the granular silver holloware / flatware /
// serveware / adornment product types the owner enters (e.g. "Berry Spoon",
// "Cold Meat Fork", "Coffee Pot", "Salt Cellar", "Koma Clasp") that aren't one
// of the coarse ProductJewelryType keys in ETSY_TAXONOMY_MAP above — so they
// used to fail pre-flight's taxonomy check and stay un-syncable (22 real items,
// confirmed live 2026-07-08 session 9). Each maps the raw product_type to the
// best REAL Etsy leaf — ids fetched live from seller-taxonomy/nodes, same
// "never guess an id" discipline as ETSY_TAXONOMY_MAP. Ordered: FIRST match
// wins, so specific rules precede generic ones (koma and "sugar bowl" before
// the catch-all "bowl"/flatware rules). `approximate` marks a close-but-not-
// exact fit — the owner sees "Closest match — review" in the dry-run and can
// override per item. Only consulted when the coarse map lookup misses, so it
// never affects an already-mapped jewelry type.
const ETSY_KEYWORD_TAXONOMY: { pattern: RegExp; mapping: TaxonomyMapping }[] = [
  // Bhutanese koma / garment hooks are worn brooches, not tableware.
  { pattern: /\bkoma\b|garment hook/i, mapping: { taxonomyId: 1201, path: 'Accessories > Pins & Clips > Brooches', approximate: true } },
  // Napkin rings / decanter labels have no dedicated Etsy leaf — bucket under
  // the silver-tableware catch-all (Flatware & Silverware), flagged approximate.
  { pattern: /napkin/i, mapping: { taxonomyId: 1048, path: 'Home & Living > Kitchen & Dining > Dining & Serving > Flatware & Silverware', approximate: true } },
  { pattern: /decanter label|bottle ticket|wine label|decanter tag/i, mapping: { taxonomyId: 1048, path: 'Home & Living > Kitchen & Dining > Dining & Serving > Flatware & Silverware', approximate: true } },
  // Holloware serving vessels — closest real serving leaf per piece.
  { pattern: /gravy|sauce ?boat/i, mapping: { taxonomyId: 2639, path: 'Home & Living > Kitchen & Dining > Dining & Serving > Serving Odds & Ends > Gravy Boats' } },
  { pattern: /sugar bowl/i, mapping: { taxonomyId: 2641, path: 'Home & Living > Kitchen & Dining > Dining & Serving > Serving Odds & Ends > Sugar Bowls & Creamers > Sugar Bowls' } },
  { pattern: /creamer/i, mapping: { taxonomyId: 2642, path: 'Home & Living > Kitchen & Dining > Dining & Serving > Serving Odds & Ends > Sugar Bowls & Creamers > Creamers' } },
  { pattern: /salt cellar|\bcellar\b|caster|muffineer|shaker/i, mapping: { taxonomyId: 1050, path: 'Home & Living > Kitchen & Dining > Dining & Serving > Salt & Pepper Shakers', approximate: true } },
  { pattern: /coffee ?pot|tea ?pot|teapot|chocolate ?pot/i, mapping: { taxonomyId: 1932, path: 'Home & Living > Kitchen & Dining > Coffee & Tea Makers > Tea Makers > Teapots', approximate: true } },
  { pattern: /tazza|compote|comport|epergne/i, mapping: { taxonomyId: 2538, path: 'Home & Living > Kitchen & Dining > Dining & Serving > Trays & Platters > Platters', approximate: true } },
  // Catalog types confirmed against Etsy's live seller taxonomy on 2026-07-21.
  { pattern: /grape shears?/i, mapping: { taxonomyId: 1052, path: 'Home & Living > Kitchen & Dining > Dining & Serving > Serving Utensils' } },
  { pattern: /serving set/i, mapping: { taxonomyId: 1052, path: 'Home & Living > Kitchen & Dining > Dining & Serving > Serving Utensils' } },
  { pattern: /coaster/i, mapping: { taxonomyId: 1060, path: 'Home & Living > Kitchen & Dining > Drink & Barware > Drinkware > Coasters' } },
  // Etsy has no matchbox-holder/vesta leaf. Antique vesta cases fit its
  // Tobacciana collection most closely under Lighters.
  { pattern: /matchbox|match box|vesta(?: case)?/i, mapping: { taxonomyId: 1867, path: 'Art & Collectibles > Collectibles > Tobacciana > Lighters', approximate: true } },
  // --- 2026-07-10 round 2: pre-mapped for the new "Mug" item + antique-silver
  // forms the shop may acquire. Etsy's taxonomy is craft/handmade-oriented and
  // has no dedicated antique-silver leaves, so most are closest-fit
  // (approximate) — owner can override per item. Ids fetched live from
  // seller-taxonomy/nodes (scripts/research-etsy-taxonomy.mjs). "butter dish"
  // precedes the generic bowl/dish rule below on purpose (first-match wins).
  { pattern: /\bmug\b|\bcup\b/i, mapping: { taxonomyId: 1062, path: 'Home & Living > Kitchen & Dining > Drink & Barware > Drinkware > Mugs', approximate: true } },
  { pattern: /goblet|chalice|tankard|beaker|\bstein\b/i, mapping: { taxonomyId: 1861, path: 'Home & Living > Kitchen & Dining > Drink & Barware > Barware > Steins', approximate: true } },
  { pattern: /candelabra/i, mapping: { taxonomyId: 2213, path: 'Home & Living > Home Decor > Candles & Home Fragrances > Candleholders > Candelabras' } },
  { pattern: /candlestick|candle ?holder/i, mapping: { taxonomyId: 2214, path: 'Home & Living > Home Decor > Candles & Home Fragrances > Candleholders > Candlestick Holders' } },
  { pattern: /pitcher|\bewer\b|water jug/i, mapping: { taxonomyId: 1938, path: 'Home & Living > Kitchen & Dining > Drink & Barware > Drinkware > Pitchers & Drinking Sets > Pitchers', approximate: true } },
  { pattern: /\bvase\b|\burn\b/i, mapping: { taxonomyId: 1026, path: 'Home & Living > Home Decor > Home Accents > Vases', approximate: true } },
  { pattern: /\bbell\b/i, mapping: { taxonomyId: 6081, path: 'Home & Living > Home Decor > Home Accents > Bells', approximate: true } },
  { pattern: /inkwell|inkstand/i, mapping: { taxonomyId: 6415, path: 'Craft Supplies & Tools > Paints, Inks & Dyes > Inks > Inkwells', approximate: true } },
  { pattern: /butter dish/i, mapping: { taxonomyId: 1045, path: 'Home & Living > Kitchen & Dining > Dining & Serving > Serving Odds & Ends > Butter Dishes' } },
  { pattern: /porringer/i, mapping: { taxonomyId: 1044, path: 'Home & Living > Kitchen & Dining > Dining & Serving > Bowls', approximate: true } },
  { pattern: /cigarette case/i, mapping: { taxonomyId: 134, path: 'Bags & Purses > Accessory Cases > Cigarette Cases' } },
  { pattern: /card case/i, mapping: { taxonomyId: 192, path: 'Bags & Purses > Wallets & Money Clips > Business Card Cases', approximate: true } },
  { pattern: /vesta|match ?safe/i, mapping: { taxonomyId: 134, path: 'Bags & Purses > Accessory Cases > Cigarette Cases', approximate: true } },
  { pattern: /snuff ?box|vinaigrette|trinket|\bbox\b/i, mapping: { taxonomyId: 6102, path: 'Jewelry > Jewelry Storage > Jewelry Boxes', approximate: true } },
  { pattern: /\btray\b|salver/i, mapping: { taxonomyId: 2537, path: 'Home & Living > Kitchen & Dining > Dining & Serving > Trays & Platters > Trays', approximate: true } },
  { pattern: /platter/i, mapping: { taxonomyId: 2538, path: 'Home & Living > Kitchen & Dining > Dining & Serving > Trays & Platters > Platters' } },
  { pattern: /\bbowl\b|\bdish\b/i, mapping: { taxonomyId: 1044, path: 'Home & Living > Kitchen & Dining > Dining & Serving > Bowls', approximate: true } },
  // Flatware & serving utensils — the canonical silver-flatware bucket (exact).
  { pattern: /spoon|fork|knife|ladle|server|flatware|silverware|tongs|sifter|scoop|caddy|marrow/i, mapping: { taxonomyId: 1048, path: 'Home & Living > Kitchen & Dining > Dining & Serving > Flatware & Silverware' } },
];

// Etsy exposes no universal "Other" seller-taxonomy leaf. This is its broadest
// practical vintage-collectible catch-all for an estate item whose custom
// product type misses every explicit mapping. It remains approximate so the
// admin is prompted to use the category picker before submitting when needed.
const ETSY_GENERIC_TAXONOMY: TaxonomyMapping = {
  taxonomyId: 69,
  path: 'Art & Collectibles > Collectibles > Figurines & Knick Knacks',
  approximate: true,
};

export function resolveTaxonomy(productType: string | null | undefined): TaxonomyMapping | null {
  const normalized = normalizeProductJewelryType(productType) ?? 'Other';
  const direct = ETSY_TAXONOMY_MAP[normalized];
  if (direct) return direct;
  // Coarse map missed — try the granular silver-tableware keyword fallback.
  const raw = productType ?? '';
  for (const rule of ETSY_KEYWORD_TAXONOMY) {
    if (rule.pattern.test(raw)) return rule.mapping;
  }
  return ETSY_GENERIC_TAXONOMY;
}

// ---------------------------------------------------------------------------
// Images — pure URL -> stable identity resolution (no I/O; images.ts fetches
// bytes). Storage URLs resolve to their bucket path; legacy /assets/... paths
// are already domain-stable identifiers. See etsy-sync-plan/05-image-pipeline.md.
// ---------------------------------------------------------------------------
export function resolveImageSourceKey(url: string): string {
  const storagePath = getProductImageStoragePath(url);
  if (storagePath) return storagePath;
  return url.split('?')[0];
}

export interface MappedImageEntry {
  sourceUrl: string;
  sourceKey: string;
  rank: number;
}

// Etsy raised its platform-wide listing photo limit from 10 to 20 in August
// 2025 (per Etsy's own listing-editor UI: "Add up to 20 photos and 2 videos"
// — confirmed live 2026-07-10, owner screenshot) — the 10-cap here was
// correct when etsy-sync-plan/05-image-pipeline.md was researched, but is
// now stale. Multiple independent sources (seller community posts, and a
// third-party Etsy listing tool's own "full 20-image support" announcement —
// such tools integrate exclusively via the public API, so this isn't just a
// client-side UI change) corroborate the API cap moved with the UI, not just
// the editor. The image pipeline already uploads in step-budgeted batches
// (IMAGE_STEP_BUDGET, images.ts) so this needed no structural change.
export const ETSY_MAX_IMAGES = 20;

// ---------------------------------------------------------------------------
// Pre-flight — never reaches Etsy; blocks sync with a per-check message.
// item_year/when_made is INTENTIONALLY non-blocking (Q2: no item is blocked
// on age — the fallback is flagged, not rejected). Note: this differs from
// the illustrative (pre-Q2) example payload in etsy-sync-plan/09-api-routes.md,
// which shows item_year as a blocking check; Q2 is the later, dated, explicit
// owner decision and takes precedence per the plan's own rule that decisions
// in 13-open-questions.md are "requirements, not suggestions."
// ---------------------------------------------------------------------------
export interface PreflightCheck {
  check: string;
  ok: boolean;
  message?: string;
  value?: number | string | null;
}

/** A manually-picked category (etsy_listings.taxonomy_override_id/_path) — see the admin category picker. */
export interface TaxonomyOverride {
  id: number;
  path: string;
}

/** Manual override wins over the automatic ETSY_TAXONOMY_MAP guess, per-product. */
export function resolveEffectiveTaxonomy(
  productType: string | null | undefined,
  override?: TaxonomyOverride | null,
): TaxonomyMapping | null {
  if (override) return { taxonomyId: override.id, path: override.path };
  return resolveTaxonomy(productType);
}

// --- Title↔product_type sanity (pre-flight warning) ---------------------------
// A mistyped product_type silently mis-categorizes an item everywhere (shop
// filters, Etsy category, Etsy tags) — e.g. a "…Bracelet" typed as Necklace
// (found live 2026-07-08). This flags the clear cases without false-positiving.
const TITLE_TYPE_PATTERNS: { pattern: RegExp; type: string }[] = [
  { pattern: /\bbracelets?\b/i, type: 'Bracelet' },
  { pattern: /\bnecklaces?\b/i, type: 'Necklace' },
  { pattern: /\bpendants?\b/i, type: 'Pendant' },
  { pattern: /\bcharms?\b/i, type: 'Charm' },
  { pattern: /\brings?\b/i, type: 'Ring' },
  { pattern: /\bearrings?\b/i, type: 'Earrings' },
  { pattern: /\bbrooch(?:es)?\b/i, type: 'Brooch' },
  { pattern: /\bcuff ?links?\b/i, type: 'Cufflinks' },
  { pattern: /\bwatch(?:es)?\b/i, type: 'Watch' },
];

// Grouped so a swap WITHIN a group never warns — Pendant/Charm/Necklace are all
// neck-worn and routinely interchangeable in titles; only a CROSS-group clash
// (a "bracelet" title on a Necklace) is a likely mistype.
const JEWELRY_TYPE_GROUP: Record<string, string> = {
  Necklace: 'neck', Pendant: 'neck', Charm: 'neck',
  Bracelet: 'wrist', Ring: 'ring', Earrings: 'ears',
  Brooch: 'pin', Cufflinks: 'cuff', Watch: 'watch',
};

/**
 * The jewelry type a title implies — but ONLY when it mentions exactly one
 * mainstream type. Zero (e.g. "Berry Spoon") or two-plus distinct types (e.g.
 * "Necklace and Bracelet Set", "Pendant Necklace") return null, so sets and
 * ambiguous titles never trigger the mistype warning.
 */
export function titleImpliedJewelryType(title: string | null | undefined): string | null {
  const found = new Set<string>();
  const text = title ?? '';
  for (const { pattern, type } of TITLE_TYPE_PATTERNS) if (pattern.test(text)) found.add(type);
  return found.size === 1 ? [...found][0] : null;
}

export function buildPreflightChecks(
  product: Product,
  connection: EtsyConnectionRow | null,
  spotData: SpotData | null,
  taxonomyOverride?: TaxonomyOverride | null,
): PreflightCheck[] {
  const checks: PreflightCheck[] = [];

  const connected = connection?.status === 'connected';
  checks.push({ check: 'connected', ok: connected, message: connected ? undefined : 'Etsy is not connected. Connect it in Admin Settings -> Etsy Sync.' });

  const hasDefaults = Boolean(connection?.shipping_profile_id && connection?.return_policy_id && connection?.readiness_state_id);
  checks.push({
    check: 'shop_defaults',
    ok: hasDefaults,
    message: hasDefaults ? undefined : 'No shipping profile / return policy / readiness state chosen. Choose them in Settings -> Etsy Sync.',
  });

  const status = normalizeProductStatus(product.status);
  checks.push({
    check: 'status',
    ok: status === 'available',
    message: status === 'available' ? undefined : `Product status is "${status}" — only "available" items sync to Etsy.`,
  });

  const quantity = normalizeProductQuantity(product.quantity);
  checks.push({ check: 'quantity', ok: quantity >= 1, message: quantity >= 1 ? undefined : 'Quantity must be at least 1.' });

  const priceResult = computeEtsyPrice(product, spotData, connection?.price_markup_pct ?? 8);
  checks.push({
    check: 'price',
    ok: priceResult.price != null,
    message: priceResult.rejectedReason ?? undefined,
    value: priceResult.price,
  });

  const images = getProductImages(product);
  checks.push({ check: 'images', ok: images.length > 0, message: images.length > 0 ? undefined : 'This item has no photos — add at least one.' });
  if (images.length > ETSY_MAX_IMAGES) {
    checks.push({
      check: 'image_count',
      ok: true,
      message: `${images.length} photos — Etsy allows ${ETSY_MAX_IMAGES} per listing; only the first ${ETSY_MAX_IMAGES} (by display order) will be pushed.`,
    });
  }

  const sku = mapSku(product);
  checks.push({ check: 'sku', ok: sku.length > 0, message: sku ? undefined : 'This item has no SKU or inventory number.' });

  const taxonomy = resolveEffectiveTaxonomy(product.product_type ?? product.jewelry_type, taxonomyOverride);
  const hasTaxonomyId = Boolean(taxonomy?.taxonomyId);
  checks.push({
    check: 'taxonomy',
    ok: Boolean(taxonomy) && hasTaxonomyId,
    message: !taxonomy
      ? 'No Etsy category is mapped for this product type. Assign a recognized product type first.'
      : !hasTaxonomyId
        ? `Etsy category id not yet pinned for "${taxonomy.path}" — see OWNER-SETUP.md (run getSellerTaxonomyNodes and update lib/etsy/mapping.ts).`
        : taxonomyOverride
          ? undefined
          : taxonomy.approximate
            ? `Using "${taxonomy.path}" as the closest available Etsy category — no exact match exists for this product type. Use the category picker if this isn't right.`
            : undefined,
  });

  const whenMade = mapWhenMade(product.item_year);
  checks.push({
    check: 'item_year',
    ok: true,
    message: whenMade.usedFallback
      ? 'Year missing or newer than the 20-year vintage cutoff — pushed to Etsy as 1990s (owner-attested fallback, Q2). Set the real item year to fix.'
      : undefined,
  });

  // Non-blocking: warn when the title clearly implies a different type than the
  // product_type driving the category/tags (a likely mistype — see the two
  // bracelets found typed as Necklace, 2026-07-08). Grouped so neck-worn swaps
  // (Pendant/Charm/Necklace) don't nag; only a cross-group clash does.
  const impliedType = titleImpliedJewelryType(product.title);
  const actualType = normalizeProductJewelryType(product.product_type ?? product.jewelry_type);
  const impliedGroup = impliedType ? JEWELRY_TYPE_GROUP[impliedType] : undefined;
  const actualGroup = actualType ? JEWELRY_TYPE_GROUP[actualType] : undefined;
  if (impliedType && actualType && impliedGroup && actualGroup && impliedGroup !== actualGroup) {
    checks.push({
      check: 'type_title_mismatch',
      ok: true,
      message: `The title reads like a ${impliedType.toLowerCase()}, but this item's product type is "${actualType}" — it will sync under the ${actualType} category with ${actualType.toLowerCase()} tags. Fix the product type if that's wrong.`,
    });
  }

  return checks;
}

export function isPreflightPassing(checks: PreflightCheck[]): boolean {
  return checks.every((check) => check.ok);
}

// ---------------------------------------------------------------------------
// Full mapped payload — what would be pushed. Powers both the dry-run preview
// and the real sync steps, so preview and reality can never drift apart.
// ---------------------------------------------------------------------------
export interface MappedEtsyPayload {
  title: string;
  description: string;
  tags: string[];
  materials: string[];
  taxonomyId: number | null;
  taxonomyPath: string | null;
  /** True when taxonomyId/Path came from a manual per-product override, not the automatic ETSY_TAXONOMY_MAP guess. */
  taxonomyIsOverride: boolean;
  /** True when the automatic guess has no exact-fit leaf (see ETSY_TAXONOMY_MAP comments) — never true alongside taxonomyIsOverride. */
  taxonomyIsApproximate: boolean;
  whoMade: 'someone_else';
  isSupply: false;
  whenMade: string;
  whenMadeUsedFallback: boolean;
  itemWeight: number | null;
  itemWeightUnit: 'g' | null;
  price: number | null;
  priceBeforeMarkup: number | null;
  priceRejectedReason: string | null;
  quantity: number;
  sku: string;
  images: MappedImageEntry[];
}

export function buildMappedPayload(
  product: Product,
  connection: EtsyConnectionRow | null,
  spotData: SpotData | null,
  taxonomyOverride?: TaxonomyOverride | null,
  extraTags?: string[] | null,
): MappedEtsyPayload {
  const markupPct = connection?.price_markup_pct ?? 8;
  const whenMade = mapWhenMade(product.item_year);
  const taxonomy = resolveEffectiveTaxonomy(product.product_type ?? product.jewelry_type, taxonomyOverride);
  const priceResult = computeEtsyPrice(product, spotData, markupPct);
  const weight = product.gram_weight ?? product.weight_grams ?? null;
  const images = getProductImages(product).slice(0, ETSY_MAX_IMAGES);

  return {
    title: mapTitle(product.title),
    description: mapDescription(product),
    tags: mapTags(product, extraTags),
    materials: mapMaterials(product),
    taxonomyId: taxonomy?.taxonomyId ?? null,
    taxonomyPath: taxonomy?.path ?? null,
    taxonomyIsOverride: Boolean(taxonomyOverride),
    taxonomyIsApproximate: !taxonomyOverride && Boolean(taxonomy?.approximate),
    whoMade: 'someone_else',
    isSupply: false,
    whenMade: whenMade.whenMade,
    whenMadeUsedFallback: whenMade.usedFallback,
    itemWeight: weight,
    itemWeightUnit: weight != null ? 'g' : null,
    price: priceResult.price,
    priceBeforeMarkup: priceResult.basePrice,
    priceRejectedReason: priceResult.rejectedReason,
    quantity: normalizeProductQuantity(product.quantity),
    sku: mapSku(product),
    images: images.map((url, index) => ({ sourceUrl: url, sourceKey: resolveImageSourceKey(url), rank: index + 1 })),
  };
}

/**
 * Stable hash of the mapped output, for cheap out-of-date detection (no Etsy
 * reads needed).
 *
 * `price` is deliberately EXCLUDED (2026-07-10) — spot-multiplier items
 * reprice on every gold/silver tick, which would flag most of the catalog
 * out_of_date daily from market drift alone. Price already has its own
 * dedicated path (Q4 threshold-gated scheduled push + the "Push prices now"
 * bulk action, both keyed off last_pushed_price directly, not this hash) —
 * see shouldPushPrice/pushPricesBatch below. This hash is for everything
 * ELSE: any real content edit (title, description, tags, materials,
 * taxonomy, images, quantity) still flags out-of-date.
 */
export function computeContentHash(payload: MappedEtsyPayload): string {
  const stable = {
    title: payload.title,
    description: payload.description,
    tags: payload.tags,
    materials: payload.materials,
    taxonomyId: payload.taxonomyId,
    whenMade: payload.whenMade,
    itemWeight: payload.itemWeight,
    quantity: payload.quantity,
    sku: payload.sku,
    images: payload.images.map((image) => ({ sourceKey: image.sourceKey, rank: image.rank })),
  };
  return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}
