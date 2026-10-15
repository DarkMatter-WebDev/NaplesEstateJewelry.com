import {
  PRODUCT_JEWELRY_TYPES,
  PRODUCT_METAL_TYPES,
  PRODUCT_METAL_VARIANTS,
  normalizeProductItemYear,
  normalizeProductLengthSizeValue,
  normalizeProductMetalType,
  normalizeProductMetalVariant,
  normalizeProductTypeValue,
  normalizeProductWidthMm,
  type Product,
  type ProductMetalType,
  type ProductMetalVariant,
} from '@/types/product';

export type ProductAutofillFields = {
  title: string | null;
  product_type: string | null;
  brand: string | null;
  metal_type: ProductMetalType | null;
  metal_variant: ProductMetalVariant | null;
  gender: 'Unisex' | 'Men' | 'Women' | null;
  chain_type: string | null;
  length: string | null;
  width_mm: number | null;
  price_mode: 'spot-multiplier' | 'manual' | null;
  purity: number | null;
  weight_grams: number | null;
  item_year: number | null;
  pricing_multiplier: number | null;
  asking_price: number | null;
  manual_price_label: string | null;
  show_spot_price: boolean | null;
  quantity: number | null;
  description: string | null;
  public_notes: string | null;
  /**
   * The editor's "Accept offers" box (site shop Make an Offer, 2026-10-15).
   * Set ONLY when the admin's own words ask for it — the route drops any value
   * when the latest input does not mention offers (lib/offers.ts mentionsOffers).
   */
  accepts_offers: boolean | null;
};

/**
 * What the assistant hands back: the fields (applied straight to the form) and a
 * few short notes — what it could not fill and what it was unsure about. There is
 * no review/confirmation layer any more (removed 2026-09-09 on the owner's word:
 * "it should simply fill out the form for me"); the admin clears a wrong field and
 * re-runs with the correction.
 */
export type ProductAutofillDraft = {
  fields: ProductAutofillFields;
  notes: string[];
};

export type ProductAutofillProviderResult = {
  fields?: Partial<Record<keyof ProductAutofillFields, unknown>>;
  notes?: unknown;
  /** Older/custom saved prompts may still emit these; they are folded into notes. */
  warnings?: unknown;
  uncertainties?: unknown;
};

export const MAX_PRODUCT_AUTOFILL_NOTES = 5;

export const PRODUCT_AUTOFILL_FIELD_KEYS = [
  'title',
  'product_type',
  'brand',
  'metal_type',
  'metal_variant',
  'gender',
  'chain_type',
  'length',
  'width_mm',
  'price_mode',
  'purity',
  'weight_grams',
  'item_year',
  'pricing_multiplier',
  'asking_price',
  'manual_price_label',
  'show_spot_price',
  'quantity',
  'description',
  'public_notes',
  'accepts_offers',
] as const satisfies readonly (keyof ProductAutofillFields)[];

export const EMPTY_PRODUCT_AUTOFILL_FIELDS: ProductAutofillFields = {
  title: null,
  product_type: null,
  brand: null,
  metal_type: null,
  metal_variant: null,
  gender: null,
  chain_type: null,
  length: null,
  width_mm: null,
  price_mode: null,
  purity: null,
  weight_grams: null,
  item_year: null,
  pricing_multiplier: null,
  asking_price: null,
  manual_price_label: null,
  show_spot_price: null,
  quantity: null,
  description: null,
  public_notes: null,
  accepts_offers: null,
};

export const PRODUCT_AUTOFILL_FIELD_LABELS: Record<keyof ProductAutofillFields, string> = {
  title: 'Title (English)',
  product_type: 'Product Type',
  brand: 'Brand',
  metal_type: 'Metal Type',
  metal_variant: 'Metal Color',
  gender: 'Gender',
  chain_type: 'Link Type',
  length: 'Length / Size',
  width_mm: 'Width (mm)',
  price_mode: 'Price Mode',
  purity: 'Purity',
  weight_grams: 'Weight (g)',
  item_year: 'Date (Year Made)',
  pricing_multiplier: 'Multiplier',
  asking_price: 'Asking Price',
  manual_price_label: 'Price Label',
  show_spot_price: 'Show Spot/Melt Value',
  quantity: 'Quantity',
  description: 'Description (English)',
  public_notes: 'Notes (English)',
  accepts_offers: 'Accept offers',
};

export const PRODUCT_AUTOFILL_SCHEMA = {
  name: 'product_listing_draft',
  description: 'Nullable catalog fields for a Naples Estate Jewelry product listing. Product type may be one of the common values or a concise new item form when the item does not fit the list. Do not return operational fields (status, location) — they are not AI-controlled.',
  fields: PRODUCT_AUTOFILL_FIELD_KEYS,
  productTypes: PRODUCT_JEWELRY_TYPES.map((item) => item.value),
  metalTypes: PRODUCT_METAL_TYPES.map((item) => item.value),
  metalVariants: [...PRODUCT_METAL_VARIANTS.Gold, ...PRODUCT_METAL_VARIANTS.Silver].map((item) => item.value),
  genders: ['Unisex', 'Men', 'Women'],
  priceModes: ['spot-multiplier', 'manual'],
} as const;

const MAX_TEXT_LENGTH = 2400;
const MAX_SHORT_TEXT_LENGTH = 180;
const MAX_PRICE = 1_000_000;

function cleanString(value: unknown, maxLength = MAX_TEXT_LENGTH): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const cleaned = String(value).replace(/\u0000/g, '').trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLength);
}

// Measured specs that live in their own fields must never appear in the title. The prompt
// forbids them, but enforce it here so a model slip (e.g. "13.44 g", "1.6 in", "size 7",
// "20 mm", "$1,200") can never reach the title. Karat/metal descriptors like "14K" or
// "18 carat gold" are intentionally preserved — they identify the item, not a spec field.
const TITLE_SPEC_PATTERNS: RegExp[] = [
  /\b\d+(?:\.\d+)?\s*(?:grams?|gms?|gr|g|dwt|ozt|oz)\b\.?/gi, // weight: 13.44 g, 2 dwt, 1.2 oz
  /\b\d+(?:\.\d+)?\s*(?:millimeters?|mm|centimeters?|cm)\b\.?/gi, // dimensions: 20 mm, 4.3 cm
  /\b\d+(?:\.\d+)?\s*(?:inch(?:es)?|in)\b\.?/gi, // length: 1.6 in, 7 inches
  /\d+(?:\.\d+)?\s*"/g, // length in inch-mark form: 18"
  /\b(?:sizes?|sz)\s*\d+(?:\.\d+)?\b/gi, // ring/bracelet size: size 7, sz 6.5
  /(?<![\dkK])\b(?:800|850|900|925|950|999)\b(?![\dkK])/g, // bare millesimal purity: 925
  /\$\s*\d[\d,]*(?:\.\d+)?\b/g, // price: $1,200
];

// Minor hardware and findings clutter the title without identifying the item — clasp type,
// jump rings, end links, closures. Strip them too. Each descriptor word is only consumed
// when immediately followed by "clasp"/"closure", so real item nouns (e.g. "Hook Earrings",
// "Box Link Necklace", "Toggle-Bar Necklace") are preserved.
const TITLE_TRIVIA_PATTERNS: RegExp[] = [
  /\s*(?:,\s*|with\s+|featuring\s+|and\s+(?:a\s+)?|w\/\s*)?(?:(?:lobster(?:\s+claw)?|spring[-\s]?ring|toggle|box|fold[-\s]?over|push|barrel|hook|fish[-\s]?hook|s[-\s]?hook|magnetic|screw|snap|bolt[-\s]?ring|bayonet|fishhook)\s+)?(?:clasps?|closures?|fastenings?)\b\.?/gi,
  /\s*(?:,\s*|with\s+|and\s+(?:a\s+)?)?(?:jump[-\s]?rings?|spring[-\s]?rings?|end[-\s]?links?|findings?)\b\.?/gi,
];

function cleanTitle(value: unknown): string | null {
  const raw = cleanString(value, MAX_SHORT_TEXT_LENGTH);
  if (!raw) return null;
  let out = raw;
  for (const pattern of TITLE_SPEC_PATTERNS) out = out.replace(pattern, ' ');
  for (const pattern of TITLE_TRIVIA_PATTERNS) out = out.replace(pattern, ' ');
  out = out
    // Drop connective words left dangling once their spec/finding was removed (e.g. "Ring With" / "weighing").
    .replace(/\s+(?:with|featuring|and|weigh(?:s|ing)?|measur(?:es|ing)|total(?:ing)?|approx(?:imately)?)\s*(?=$|[,.;:)\]])/gi, ' ')
    .replace(/\s{2,}/g, ' ') // collapse gaps left by removals
    .replace(/\s+([,.;:])/g, '$1') // tidy space before punctuation
    .replace(/[\s,;:.–—-]+$/g, '') // trailing separators/dashes
    .replace(/^[\s,;:.–—-]+/g, '') // leading separators/dashes
    .trim();
  return out || null;
}

// Notes are plain one-liners for the admin. Strip any Markdown the model slips in.
function cleanNote(value: unknown): string | null {
  const cleaned = cleanString(value, 220);
  if (!cleaned) return null;
  return cleaned
    .replace(/\*\*/g, '')
    .replace(/__+/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[-*•]\s+/, '')
    .trim() || null;
}

function cleanNotes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(cleanNote).filter((item): item is string => Boolean(item));
}

/**
 * The one deterministic note: the pricing facts a listing cannot be priced
 * without. Everything else the model says for itself. Returns null when
 * nothing pricing-critical is missing.
 */
export function buildMissingPricingNote(fields: ProductAutofillFields): string | null {
  const missing: string[] = [];
  if (fields.price_mode === 'spot-multiplier') {
    if (fields.purity == null) missing.push(PRODUCT_AUTOFILL_FIELD_LABELS.purity);
    if (fields.weight_grams == null) missing.push(PRODUCT_AUTOFILL_FIELD_LABELS.weight_grams);
  }
  if (fields.price_mode === 'manual' && !fields.manual_price_label && fields.asking_price == null) {
    missing.push(PRODUCT_AUTOFILL_FIELD_LABELS.manual_price_label);
  }
  if (missing.length === 0) return null;
  return `Not filled (needed for pricing): ${missing.join(', ')}.`;
}

const SELLER_ATTRIBUTION_PATTERNS: RegExp[] = [
  /\b(?:the\s+)?seller\s+(?:suggests?|recommends?|believes?|thinks?|says?|states?|reports?|describes?|identifies?|calls?|mentions?)\b[^.!?\r\n]*(?:[.!?]|$)/gi,
  /\baccording\s+to\s+(?:the\s+)?seller\b[^.!?\r\n]*(?:[.!?]|$)/gi,
  /\b(?:seller|owner)[-'\s](?:suggested|recommended|believed|thought|stated|reported|described|identified)\b[^.!?\r\n]*(?:[.!?]|$)/gi,
];

export function sanitizeBuyerFacingText(value: string | null): { value: string | null; removed: string[] } {
  if (!value) return { value: null, removed: [] };

  const removed: string[] = [];
  let cleaned = value;
  for (const pattern of SELLER_ATTRIBUTION_PATTERNS) {
    cleaned = cleaned.replace(pattern, (match) => {
      const suggestion = match.trim();
      if (suggestion) removed.push(suggestion);
      return ' ';
    });
  }

  cleaned = cleaned
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();

  if (removed.length > 0) {
    cleaned = cleaned.replace(/^[\s,.;:]+|[\s,.;:]+$/g, '').trim();
  }

  return { value: cleaned || null, removed };
}

function cleanNumber(value: unknown, options: { min?: number; max?: number; decimals?: number } = {}): number | null {
  if (value == null) return null;
  // Guard against empty/whitespace strings: Number('') is 0, which would otherwise
  // pass a `min: 0` check and silently populate a field the model never set.
  const cleaned = typeof value === 'number' ? value : String(value).replace(/[$,\s]/g, '');
  if (cleaned === '') return null;
  const numeric = typeof cleaned === 'number' ? cleaned : Number(cleaned);
  if (!Number.isFinite(numeric)) return null;
  if (options.min != null && numeric < options.min) return null;
  if (options.max != null && numeric > options.max) return null;
  const multiplier = 10 ** (options.decimals ?? 2);
  return Math.round(numeric * multiplier) / multiplier;
}

function cleanBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  const normalized = cleanString(value, MAX_SHORT_TEXT_LENGTH)?.toLowerCase();
  if (!normalized) return null;
  if (['true', 'yes', 'show', 'shown', 'visible'].includes(normalized)) return true;
  if (['false', 'no', 'hide', 'hidden', 'do not show', "don't show"].includes(normalized)) return false;
  return null;
}

function cleanGender(value: unknown): ProductAutofillFields['gender'] {
  const normalized = cleanString(value, MAX_SHORT_TEXT_LENGTH)?.toLowerCase();
  if (!normalized) return null;
  if (normalized === 'unisex') return 'Unisex';
  if (normalized === 'men' || normalized === 'mens' || normalized === "men's" || normalized === 'male') return 'Men';
  if (normalized === 'women' || normalized === 'womens' || normalized === "women's" || normalized === 'female' || normalized === 'ladies') return 'Women';
  return null;
}

function cleanPriceMode(value: unknown): ProductAutofillFields['price_mode'] {
  const normalized = cleanString(value, MAX_SHORT_TEXT_LENGTH)?.toLowerCase().replace(/[_-]+/g, ' ');
  if (!normalized) return null;
  if (normalized === 'spot' || normalized === 'spot multiplier' || normalized === 'spot x multiplier') return 'spot-multiplier';
  if (normalized === 'manual' || normalized === 'fixed' || normalized === 'manual fixed') return 'manual';
  return null;
}

function cleanPurity(value: unknown): number | null {
  const raw = cleanString(value, MAX_SHORT_TEXT_LENGTH);
  if (!raw) return null;
  // Accept bare numbers, karat marks ("14K", "18K"), plumb-gold suffix ("14KP"),
  // karat-spelled-out ("14KT", "14 karat"), and millesimal fineness ("925", "800/1000").
  const match = raw.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(?:k(?:[pt])?|karat|%|\/1000)?$/);
  const numeric = match ? Number(match[1]) : Number(raw);
  if (!Number.isFinite(numeric)) return null;
  // Gold karat (1–24) or silver/metal millesimal fineness as parts per 1000
  // (e.g. 800, 830, 835, 900, 925, 950, 999). Anything else is rejected.
  if (numeric >= 1 && numeric <= 24) return Math.round(numeric);
  if (numeric >= 100 && numeric <= 1000) return Math.round(numeric);
  return null;
}

function cleanMetalVariant(value: unknown, fallbackCategory: Product['category'] = 'Gold'): ProductMetalVariant | null {
  const raw = cleanString(value, MAX_SHORT_TEXT_LENGTH);
  if (!raw) return null;
  const normalized = normalizeProductMetalVariant(raw, fallbackCategory);
  const allValues = [...PRODUCT_METAL_VARIANTS.Gold, ...PRODUCT_METAL_VARIANTS.Silver].map((item) => item.value);
  return allValues.includes(normalized) ? normalized : null;
}

function cleanLength(value: unknown): string | null {
  const raw = cleanString(value, MAX_SHORT_TEXT_LENGTH);
  if (!raw) return null;
  // Accept only a single numeric value, optionally with an inch, mm or cm unit
  // (metric converts to inches in normalizeProductLengthSizeValue — the owner
  // measures in millimetres, and a bare metric number used to be stored as
  // inches). Reject ranges like "6 to 6.25 inches" and any free text — the
  // field stores one measurement.
  const match = raw.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(?:in(?:ch(?:es?)?)?|"|mm|millimet(?:er|re)s?|cm|centimet(?:er|re)s?)?$/);
  if (!match) return null;
  return normalizeProductLengthSizeValue(match[0]);
}

// Only meaningful when the seller explicitly states they have more than one
// unit of the exact same item (e.g. "I have 3 of these", "listing a pair of
// identical rounds"). Reject 0/negative and anything absurdly large — those
// are almost certainly a misread of some other stated number (a price, a
// weight, a year) rather than a real multi-unit count.
function cleanQuantity(value: unknown): number | null {
  const numeric = cleanNumber(value, { min: 1, max: 500, decimals: 0 });
  return numeric != null ? Math.round(numeric) : null;
}

export function coerceProductAutofill(input: ProductAutofillProviderResult): ProductAutofillDraft {
  // Models sometimes return the fields flat at the top level instead of nested under `fields`.
  // Prefer a non-empty nested `fields` object; otherwise read from the top-level object.
  const nestedFields = input.fields;
  const rawFields = (
    nestedFields && typeof nestedFields === 'object' && !Array.isArray(nestedFields) && Object.keys(nestedFields).length > 0
      ? nestedFields
      : input
  ) as Partial<Record<keyof ProductAutofillFields, unknown>>;
  const fallbackMetalType = cleanString(rawFields.metal_type, MAX_SHORT_TEXT_LENGTH);
  const metalType = fallbackMetalType ? normalizeProductMetalType(fallbackMetalType, 'Gold') : null;
  const fallbackCategory: Product['category'] = metalType === 'Silver' || metalType === 'Platinum' || metalType === 'Palladium' ? 'Silver' : 'Gold';
  const productType = normalizeProductTypeValue(cleanString(rawFields.product_type, MAX_SHORT_TEXT_LENGTH));
  const sellerSuggestions: string[] = [];
  const cleanBuyerField = (value: string | null) => {
    const sanitized = sanitizeBuyerFacingText(value);
    sellerSuggestions.push(...sanitized.removed);
    return sanitized.value;
  };
  const sanitizedTitle = sanitizeBuyerFacingText(cleanString(rawFields.title, MAX_SHORT_TEXT_LENGTH));
  sellerSuggestions.push(...sanitizedTitle.removed);

  const fields: ProductAutofillFields = {
    title: cleanTitle(sanitizedTitle.value),
    product_type: productType,
    brand: cleanString(rawFields.brand, MAX_SHORT_TEXT_LENGTH),
    metal_type: metalType,
    metal_variant: cleanMetalVariant(rawFields.metal_variant, fallbackCategory),
    gender: cleanGender(rawFields.gender),
    chain_type: cleanString(rawFields.chain_type, MAX_SHORT_TEXT_LENGTH),
    length: cleanLength(rawFields.length),
    width_mm: normalizeProductWidthMm(rawFields.width_mm as string | number | null | undefined),
    price_mode: cleanPriceMode(rawFields.price_mode),
    purity: cleanPurity(rawFields.purity),
    weight_grams: cleanNumber(rawFields.weight_grams, { min: 0.01, max: 100000, decimals: 2 }),
    item_year: normalizeProductItemYear(rawFields.item_year as string | number | null | undefined),
    pricing_multiplier: cleanNumber(rawFields.pricing_multiplier, { min: 0.01, max: 100, decimals: 3 }),
    asking_price: cleanNumber(rawFields.asking_price, { min: 0, max: MAX_PRICE, decimals: 2 }),
    manual_price_label: cleanString(rawFields.manual_price_label, MAX_SHORT_TEXT_LENGTH),
    show_spot_price: cleanBoolean(rawFields.show_spot_price),
    quantity: cleanQuantity(rawFields.quantity),
    description: cleanBuyerField(cleanString(rawFields.description)),
    public_notes: cleanBuyerField(cleanString(rawFields.public_notes)),
    accepts_offers: cleanBoolean(rawFields.accepts_offers),
  };

  if (fields.product_type && fields.product_type !== 'Necklace' && fields.product_type !== 'Bracelet') {
    fields.chain_type = null;
    fields.width_mm = null;
  }
  // The size/length field carries the length for Necklace/Bracelet, the ring size for Ring,
  // and the item's height for every other form (e.g. a 1.5 in brooch, a 0.75 in pendant).
  // It is kept for all product types, so no clearing here.

  // Pricing default: when the draft carries no pricing signal at all — no mode,
  // no multiplier, no manual/asking price — fall back to the standard spot×1.5 so
  // every listing has a usable pricing method even if the model (or a custom/older
  // prompt) omitted it. A stated manual price or an explicit multiplier is left
  // untouched; a spot mode missing its multiplier is completed with the 1.5 default.
  const hasAnyPricingSignal =
    fields.price_mode != null ||
    fields.pricing_multiplier != null ||
    fields.asking_price != null ||
    fields.manual_price_label != null;
  if (!hasAnyPricingSignal) {
    fields.price_mode = 'spot-multiplier';
    fields.pricing_multiplier = 1.5;
  } else if (fields.price_mode === 'spot-multiplier' && fields.pricing_multiplier == null) {
    fields.pricing_multiplier = 1.5;
  }

  // Notes, in priority order: the pricing facts we cannot list without, the
  // model's own "not filled / unsure" lines, then legacy warnings/uncertainties
  // (older or custom saved prompts) and any seller claim stripped from buyer copy.
  const notes: string[] = [];
  const addNote = (note: string | null) => {
    if (note && !notes.some((item) => item.toLowerCase() === note.toLowerCase())) notes.push(note);
  };
  addNote(buildMissingPricingNote(fields));
  cleanNotes(input.notes).forEach(addNote);
  cleanNotes(input.warnings).forEach(addNote);
  cleanNotes(input.uncertainties).forEach(addNote);
  sellerSuggestions.forEach((claim) => addNote(`Left out of buyer copy (unverified seller claim): ${claim}`));

  return { fields, notes: notes.slice(0, MAX_PRODUCT_AUTOFILL_NOTES) };
}
