import crypto from 'node:crypto';
import type { Product, SpotData } from '@/types/product';
import {
  formatProductPurityLabel,
  inferProductJewelryType,
  normalizeProductLengthSizeValue,
  normalizeProductQuantity,
  parseLengthInches,
} from '@/types/product';
import { EBAY_EXCLUDED_PRODUCT_IDS, EBAY_EXCLUDED_REASON } from './guards';
import { getMarketplaceSpotPriceError, getProductPriceValue } from '@/lib/pricing';
import { getMarketplaceShippingTier } from '@/lib/checkout-shipping';
import { getSiteUrl } from '@/lib/order-email-branding';

// Pure allowlist mapper: Product -> eBay InventoryItem + Offer fields. Mirrors
// the SHAPE of next-app/src/lib/etsy/mapping.ts (allowlist-by-construction,
// Pick<Product, ...>-typed sub-mappers, pinned-not-guessed taxonomy, content
// hash for change detection) — copied, never imported, per BUILD-PROMPT.md
// hard rule 9. See ebay-sync-plan/02-field-mapping.md.

// ALLOWLIST, not blocklist: every function below only ever reads named
// Product fields into a fresh object. Private fields (cost_basis,
// minimum_price, internal_notes, private_price_label, melt_value,
// live_spot_snapshot, acquisition_date, acquisition_source) are never
// referenced anywhere in this file, so they structurally cannot leak into a
// payload — see __tests__/mapping.test.ts for the guarantee test.
export const EBAY_FORBIDDEN_PRODUCT_FIELDS = [
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
// Title — 80 chars (tighter than Etsy's 140), word-boundary truncation, no
// "at most one &" rule (that's an Etsy-specific quirk; eBay allows normal
// punctuation).
// ---------------------------------------------------------------------------
const TITLE_MAX_LENGTH = 80;

export function mapTitle(title: string | null | undefined): string {
  const collapsed = (title ?? '').trim().replace(/\s+/g, ' ');
  if (collapsed.length <= TITLE_MAX_LENGTH) return collapsed;
  const cut = collapsed.slice(0, TITLE_MAX_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim();
}

// ---------------------------------------------------------------------------
// SKU — Q11: ebay_sku = products.id, made eBay-legal. Q11's decision assumed
// a 36-char UUID; this catalog's product.id is actually a slugified
// title+inventory-number string (e.g. "heavy-italian-14k-yellow-gold-cuban-
// link-bracelet-53-91g-21", 59 chars) that can exceed both of eBay's real
// constraints — confirmed live 2026-07-09 (errorId 25707): 50-char max,
// alphanumeric only (no hyphens). Stripping non-alphanumeric chars keeps
// most ids under 50 chars and readable in Seller Hub as-is; ids still over
// 50 after stripping get a hash-of-the-full-original-id suffix so two ids
// that only differ after the truncation point can't collide onto the same
// SKU.
// ---------------------------------------------------------------------------
const SKU_MAX_LENGTH = 50;
const SKU_HASH_SUFFIX_LENGTH = 8;

export function mapSku(product: Pick<Product, 'id'>): string {
  const alnum = product.id.replace(/[^a-zA-Z0-9]/g, '');
  if (alnum.length <= SKU_MAX_LENGTH) return alnum;
  const hash = crypto.createHash('sha256').update(product.id).digest('hex').slice(0, SKU_HASH_SUFFIX_LENGTH);
  return `${alnum.slice(0, SKU_MAX_LENGTH - SKU_HASH_SUFFIX_LENGTH)}${hash}`;
}

// ---------------------------------------------------------------------------
// Condition — Q5: USED_EXCELLENT (legacy condition id 3000, "Pre-owned") + one
// standard template for every item, never per-item authoring.
//
// The Sell Inventory API's `condition` field on createOrReplaceInventoryItem
// takes the ConditionEnum string name (e.g. "USED_EXCELLENT"), NOT the
// numeric condition id from the older Trading API. Sending "3000" produces
// eBay error 2004 "Could not serialize field [condition]" — confirmed live
// 2026-07-09 against the production inventory_item endpoint.
// ---------------------------------------------------------------------------
export const EBAY_CONDITION_ID = 'USED_EXCELLENT';
export const EBAY_CONDITION_DESCRIPTION =
  'Estate piece in excellent pre-owned condition. Please review photos for detail.';

// ---------------------------------------------------------------------------
// Description — body copy + a composed spec block. Basic HTML only (no
// active content, no external links — eBay policy). Capped at 4,000 chars.
// ---------------------------------------------------------------------------
function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const DESCRIPTION_MAX_LENGTH = 4000;

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
    | 'stone_details'
    | 'product_type'
    | 'jewelry_type'
    | 'title'
    | 'title_es'
    | 'chain_type'
    | 'tags'
    | 'tags_es'
  >,
): string {
  const bodyParts = [product.description, product.public_notes, ...(product.details ?? [])]
    .map((part) => (part ?? '').trim())
    .filter(Boolean);
  const bodyHtml = bodyParts.length
    ? bodyParts.map((part) => `<p>${escapeHtml(part)}</p>`).join('')
    : '';

  const specLines: string[] = [];
  const weight = product.gram_weight ?? product.weight_grams;
  // "14K" / "925", never the bare column number (owner report 2026-09-12: the
  // description read "Purity: 14").
  const purityLabel = formatProductPurityLabel(product.purity);
  if (purityLabel) specLines.push(`Purity: ${purityLabel}`);
  if (weight) specLines.push(`Weight: ${weight}g`);

  const jewelryType = inferProductJewelryType(product);
  const lengthDisplay = normalizeProductLengthSizeValue(product.length);
  if (lengthDisplay) {
    specLines.push(jewelryType === 'Ring' ? `Ring size: ${lengthDisplay}` : `Length: ${lengthDisplay} in`);
  }
  if (product.item_year) specLines.push(`Era: ${product.item_year}`);
  if (product.brand) specLines.push(`Brand: ${product.brand}`);
  // stone_details is free text only, never parsed into a structured aspect
  // (no verified-safe source for that — same discipline as the Etsy build).
  if (product.stone_details) specLines.push(`Stone details: ${product.stone_details}`);

  const specHtml = specLines.length ? `<ul>${specLines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>` : '';

  return `${bodyHtml}${specHtml}`.trim().slice(0, DESCRIPTION_MAX_LENGTH);
}

// ---------------------------------------------------------------------------
// Ring size / length — eBay's "Ring Size" and "Chain Length" aspects are
// plain free-text-friendly values (no pinned SELECTION_ONLY chart in this
// build — see the aspect-values note below), so this only needs to format a
// decimal, not resolve it against a fraction chart the way the Etsy build's
// ring-size-experiment.ts does. Re-implemented locally (not imported from
// lib/etsy/*) per BUILD-PROMPT.md hard rule 9.
// ---------------------------------------------------------------------------
function parseRingSizeValue(length: string | null | undefined): number | null {
  const trimmed = length?.trim() ?? '';
  if (!trimmed) return null;
  const bare = trimmed.match(/^(\d+(?:\.\d+)?)$/);
  if (bare) return Number(bare[1]);
  const prefixed = trimmed.match(/^size\s*:?\s*(\d+(?:\.\d+)?)$/i);
  return prefixed ? Number(prefixed[1]) : null;
}

function ringSizeDisplay(size: number): string {
  return Number.isInteger(size) ? String(size) : String(Math.round(size * 4) / 4);
}

function parseWearableLengthInchesValue(length: string | null | undefined): number | null {
  // Shared with the product page and the Etsy build (types/product.ts) so a
  // millimetre value converts to inches here too, instead of reading as 470 in.
  const value = parseLengthInches(length);
  return value != null && value > 0 ? value : null;
}

// ---------------------------------------------------------------------------
// Aspects (item specifics) — best-effort key/value pairs from structured
// fields. TODO(ebay-verify): this build has no live Taxonomy access, so
// these values have NOT been cross-checked against each pinned category's
// real getItemAspectsForCategory allowed-value lists (SELECTION_ONLY
// aspects reject a non-matching value at publish time rather than silently
// storing it wrong — unlike Etsy's "Gray" incident, a bad aspect value here
// fails loudly, not silently). Resolve the live aspect tables before the
// first production publish and tighten this mapping if any value doesn't
// match (see OWNER-SETUP.md).
// ---------------------------------------------------------------------------
export type EbayAspects = Record<string, string[]>;

const METAL_ASPECT_LABELS: Record<string, string> = {
  yellow_gold: 'Yellow Gold',
  white_gold: 'White Gold',
  rose_gold: 'Rose Gold',
  tricolor_gold: 'Tricolor Gold',
  bicolor_gold: 'Two-Tone Gold',
  silver: 'Sterling Silver',
  vermeil: 'Vermeil',
  platinum: 'Platinum',
};

function purityAspectValue(product: Pick<Product, 'purity' | 'category'>): string | null {
  if (!product.purity) return null;
  return product.purity > 100 ? String(Math.round(product.purity)) : `${product.purity}k`;
}

// Main Stone / Style — required item specifics across every Fine Jewelry
// leaf this catalog uses (261993 Necklaces/Pendants, 261994 Rings, 261990
// Earrings, 261988 Bracelets & Charms), only enforced at PUBLISH time (not
// at item/offer creation) — confirmed live 2026-07-10 both by trial
// ("A user error has occurred. The item specific Main Stone/Style is
// missing.") and by querying eBay's own Commerce Taxonomy API
// (get_item_aspects_for_category — see scripts/research-ebay-required-
// aspects.mjs) for the authoritative required-aspect list per category,
// instead of continuing to discover them one publish-attempt at a time.
// That same query confirmed both fields are aspectMode FREE_TEXT, not
// SELECTION_ONLY — eBay doesn't validate them against a closed enum, so
// (unlike a SELECTION_ONLY field) it's safe to pass through real
// stone_details text rather than collapsing to a generic placeholder.
const ASPECT_VALUE_MAX_LENGTH = 65; // eBay's common per-value aspect length cap

function mainStoneAspectValue(stoneDetails: string | null | undefined): string {
  const trimmed = (stoneDetails ?? '').trim();
  return trimmed ? trimmed.slice(0, ASPECT_VALUE_MAX_LENGTH) : 'No Stone';
}

export function mapAspects(
  product: Pick<
    Product,
    | 'metal_variant'
    | 'metal_type'
    | 'purity'
    | 'category'
    | 'brand'
    | 'product_type'
    | 'jewelry_type'
    | 'chain_type'
    | 'length'
    | 'item_year'
    | 'gram_weight'
    | 'weight_grams'
    | 'title'
    | 'title_es'
    | 'tags'
    | 'tags_es'
    | 'stone_details'
  >,
  opts: { silverAntique?: boolean } = {},
): EbayAspects {
  const aspects: EbayAspects = {};
  const jewelryType = inferProductJewelryType(product);

  // --- Aspects sensible for BOTH jewelry and silver-antique holloware ---
  const metalLabel = product.metal_variant ? METAL_ASPECT_LABELS[product.metal_variant] : null;
  if (metalLabel) aspects.Metal = [metalLabel];

  const purity = purityAspectValue(product);
  if (purity) aspects['Metal Purity'] = [purity];

  if (jewelryType && jewelryType !== 'Other') aspects.Type = [jewelryType];
  aspects.Brand = [product.brand?.trim() || 'Unbranded'];

  if (product.item_year) aspects['Year Manufactured'] = [String(product.item_year)];

  const weight = product.gram_weight ?? product.weight_grams;
  if (weight) aspects['Item Weight'] = [`${weight} g`];

  // --- Jewelry-only aspects — skipped for silver-antique (Antiques > Silver)
  // categories, where "Main Stone", "Style", "Chain Type", and a "Chain
  // Length" derived from the piece's physical dimension (e.g. a 12.5" punch
  // ladle) are nonsensical and not recognized aspects for those categories
  // anyway. The dimension is still carried in the description spec block. ---
  if (!opts.silverAntique) {
    aspects['Main Stone'] = [mainStoneAspectValue(product.stone_details)];

    // Required for Necklaces/Pendants, Earrings, and Bracelets & Charms; merely
    // recommended for Rings — sent to all jewelry since mapAspects doesn't
    // narrow by leaf. "Classic" mirrors Q5's one-standard-template discipline
    // (never fabricate a specific per-item style claim).
    aspects.Style = ['Classic'];

    if (product.chain_type) aspects['Chain Type'] = [product.chain_type];

    const lengthValue = normalizeProductLengthSizeValue(product.length);
    if (lengthValue) {
      if (jewelryType === 'Ring') {
        const size = parseRingSizeValue(product.length);
        aspects['Ring Size'] = [size != null ? ringSizeDisplay(size) : lengthValue];
      } else {
        const inches = parseWearableLengthInchesValue(product.length);
        aspects['Chain Length'] = [inches != null ? `${inches} in` : lengthValue];
      }
    }
  }

  return aspects;
}

// ---------------------------------------------------------------------------
// Category resolution — pinned candidate leaves from
// ebay-sync-plan/02-field-mapping.md §D (itself flagged TODO(ebay-verify) by
// the plan against a live getCategorySuggestions call; this build
// environment has neither eBay credentials nor network access to run one —
// see the final report). Coin/Bullion are excluded entirely (Q6).
// ---------------------------------------------------------------------------
export interface EbayCategoryMapping {
  categoryId: string;
  path: string;
  approximate?: boolean;
  // Non-jewelry physical object (silver holloware, a bell, an inkwell, …) —
  // gets the lean silver-object aspect set (no Main Stone/Style/Chain
  // Length). Set explicitly for object leaves that DON'T live under the
  // "Antiques > Silver" path (which isSilverAntiqueCategory already detects
  // by path); redundant-but-harmless on the ones that do.
  objectCategory?: boolean;
}

// Fine Jewelry leaves — solid-metal items (Q4b: modern leaves, not Vintage &
// Antique subtree). Brooch/Cufflinks/Watch leaf ids corrected 2026-07-10 via
// live get_category_suggestions + get_item_aspects_for_category
// (scripts/research-ebay-category-suggestions.mjs): the build agent's
// original pins (12595 Brooch, 4196 Cufflinks, 281 Watch) were all invalid
// or non-leaf and would have failed at publish.
const EBAY_FINE_CATEGORY_MAP: Partial<Record<string, EbayCategoryMapping>> = {
  Necklace: { categoryId: '261993', path: 'Jewelry & Watches > Fine Jewelry > Fine Necklaces & Pendants' },
  Pendant: { categoryId: '261993', path: 'Jewelry & Watches > Fine Jewelry > Fine Necklaces & Pendants' },
  Charm: { categoryId: '261993', path: 'Jewelry & Watches > Fine Jewelry > Fine Necklaces & Pendants', approximate: true },
  Ring: { categoryId: '261994', path: 'Jewelry & Watches > Fine Jewelry > Fine Rings' },
  Earrings: { categoryId: '261990', path: 'Jewelry & Watches > Fine Jewelry > Fine Earrings' },
  Bracelet: { categoryId: '261988', path: 'Jewelry & Watches > Fine Jewelry > Fine Bracelets & Charms' },
  Brooch: { categoryId: '261989', path: 'Jewelry & Watches > Fine Jewelry > Brooches & Pins' },
  Cufflinks: { categoryId: '137843', path: "Jewelry & Watches > Men's Jewelry > Cufflinks" },
  // Watch leaf is correct now, but 31387 also REQUIRES a "Department" aspect
  // (Men's/Women's/Unisex) we don't currently map — no Watch-type item exists
  // in the catalog yet, so this is pinned-but-not-fully-publishable. Add
  // Department handling before syncing a watch. TODO(ebay-verify).
  Watch: { categoryId: '31387', path: 'Jewelry & Watches > Watches, Parts & Accessories > Watches > Wristwatches', approximate: true },
  // Generic sterling flatware fallback for the normalized "Silverware" type;
  // specific serving-piece product_types are handled by
  // EBAY_SILVER_CATEGORY_MAP below.
  Silverware: { categoryId: '20104', path: 'Antiques > Silver > Sterling Silver (.925) > Flatware & Silverware' },
};

// Antique silver holloware / flatware — keyed by the free-text serving-piece
// product_type values this catalog actually uses (NOT jewelry; these bypass
// the Fine/Fashion jewelry split entirely and live under Antiques > Silver).
// Every leaf here verified live 2026-07-10 via get_category_suggestions and
// confirmed to have ZERO required item specifics via
// get_item_aspects_for_category (so they publish with just the basics). See
// scripts/research-ebay-category-suggestions.mjs.
const EBAY_SILVER_CATEGORY_MAP: Partial<Record<string, EbayCategoryMapping>> = {
  // Flatware & individual serving pieces → one shared leaf (eBay's own top
  // pick for every one of these).
  Spoon: { categoryId: '20104', path: 'Antiques > Silver > Sterling Silver (.925) > Flatware & Silverware' },
  'Serving Spoon': { categoryId: '20104', path: 'Antiques > Silver > Sterling Silver (.925) > Flatware & Silverware' },
  'Salt Spoon': { categoryId: '20104', path: 'Antiques > Silver > Sterling Silver (.925) > Flatware & Silverware' },
  'Berry Spoon': { categoryId: '20104', path: 'Antiques > Silver > Sterling Silver (.925) > Flatware & Silverware' },
  'Mote Spoon': { categoryId: '20104', path: 'Antiques > Silver > Sterling Silver (.925) > Flatware & Silverware' },
  'Cold Meat Fork': { categoryId: '20104', path: 'Antiques > Silver > Sterling Silver (.925) > Flatware & Silverware' },
  'Fish Server': { categoryId: '20104', path: 'Antiques > Silver > Sterling Silver (.925) > Flatware & Silverware' },
  Ladle: { categoryId: '20104', path: 'Antiques > Silver > Sterling Silver (.925) > Flatware & Silverware' },
  Knife: { categoryId: '20104', path: 'Antiques > Silver > Sterling Silver (.925) > Flatware & Silverware' },
  // Holloware / table articles → their own dedicated leaves.
  Tray: { categoryId: '39441', path: 'Antiques > Silver > Sterling Silver (.925) > Platters & Trays' },
  'Coffee Pot': { categoryId: '37998', path: 'Antiques > Silver > Sterling Silver (.925) > Tea/Coffee Pots & Sets' },
  'Salt Cellar': { categoryId: '163273', path: 'Antiques > Silver > Sterling Silver (.925) > Salt Cellars' },
  'Napkin Ring': { categoryId: '39440', path: 'Antiques > Silver > Sterling Silver (.925) > Napkin Rings & Clips' },
  'Decanter Label': { categoryId: '163056', path: 'Antiques > Silver > Sterling Silver (.925) > Bottles, Decanters & Flasks' },
  'Tazza Set': { categoryId: '63620', path: 'Antiques > Silver > Sterling Silver (.925) > Dishes & Coasters' },

  // --- 2026-07-10 round 2: pre-mapped for the new "Mug" item + antique-silver
  // forms the shop may acquire. Same research method (get_category_suggestions
  // + get_item_aspects_for_category); every leaf below confirmed ZERO required
  // aspects except Bell (needs "Type", which mapAspects always sends). ---
  // Drinking vessels → Cups & Goblets.
  Mug: { categoryId: '37993', path: 'Antiques > Silver > Sterling Silver (.925) > Cups & Goblets' },
  Cup: { categoryId: '37993', path: 'Antiques > Silver > Sterling Silver (.925) > Cups & Goblets' },
  Goblet: { categoryId: '37993', path: 'Antiques > Silver > Sterling Silver (.925) > Cups & Goblets' },
  Tankard: { categoryId: '37993', path: 'Antiques > Silver > Sterling Silver (.925) > Cups & Goblets' },
  Beaker: { categoryId: '37993', path: 'Antiques > Silver > Sterling Silver (.925) > Cups & Goblets' },
  // Bowls (a compote/porringer is a footed/handled bowl form).
  Bowl: { categoryId: '37991', path: 'Antiques > Silver > Sterling Silver (.925) > Bowls' },
  Compote: { categoryId: '37991', path: 'Antiques > Silver > Sterling Silver (.925) > Bowls' },
  Porringer: { categoryId: '37991', path: 'Antiques > Silver > Sterling Silver (.925) > Bowls' },
  // Lighting.
  Candlestick: { categoryId: '20103', path: 'Antiques > Silver > Sterling Silver (.925) > Candlesticks & Candelabra' },
  Candelabra: { categoryId: '20103', path: 'Antiques > Silver > Sterling Silver (.925) > Candlesticks & Candelabra' },
  // Pouring vessels (an ewer/jug is a pitcher form).
  Pitcher: { categoryId: '37995', path: 'Antiques > Silver > Sterling Silver (.925) > Pitchers & Jugs' },
  Ewer: { categoryId: '37995', path: 'Antiques > Silver > Sterling Silver (.925) > Pitchers & Jugs' },
  Jug: { categoryId: '37995', path: 'Antiques > Silver > Sterling Silver (.925) > Pitchers & Jugs' },
  Vase: { categoryId: '39443', path: 'Antiques > Silver > Sterling Silver (.925) > Vases & Urns' },
  Creamer: { categoryId: '163055', path: 'Antiques > Silver > Sterling Silver (.925) > Creamers & Sugar Bowls' },
  'Sugar Bowl': { categoryId: '163055', path: 'Antiques > Silver > Sterling Silver (.925) > Creamers & Sugar Bowls' },
  Teapot: { categoryId: '37998', path: 'Antiques > Silver > Sterling Silver (.925) > Tea/Coffee Pots & Sets' },
  'Butter Dish': { categoryId: '63620', path: 'Antiques > Silver > Sterling Silver (.925) > Dishes & Coasters' },
  // Objets de vertu / small silver.
  Box: { categoryId: '37992', path: 'Antiques > Silver > Sterling Silver (.925) > Boxes' },
  'Snuff Box': { categoryId: '37992', path: 'Antiques > Silver > Sterling Silver (.925) > Boxes' },
  Vinaigrette: { categoryId: '107441', path: 'Antiques > Silver > Sterling Silver (.925) > Vinaigrettes' },
  'Vesta Case': { categoryId: '105900', path: 'Antiques > Silver > Sterling Silver (.925) > Cigarette & Vesta Cases' },
  'Card Case': { categoryId: '105900', path: 'Antiques > Silver > Sterling Silver (.925) > Cigarette & Vesta Cases' },
  'Cigarette Case': { categoryId: '105900', path: 'Antiques > Silver > Sterling Silver (.925) > Cigarette & Vesta Cases' },
  // Non-"Antiques > Silver" object leaves — need objectCategory so the lean
  // aspect set still applies (the path check alone wouldn't catch them).
  Bell: { categoryId: '261598', path: 'Collectibles > Decorative Collectibles > Bells', objectCategory: true },
  Inkwell: { categoryId: '970', path: 'Collectibles > Pens & Writing Instruments > Inkwells', objectCategory: true },
};

// Generic sterling-silver catch-all — "Other Antique Sterling Silver" (zero
// required aspects, verified 2026-07-10). Used ONLY as a last resort for a
// silver item whose product_type matched no explicit map above and isn't a
// real jewelry type — so a NEW/unanticipated silver piece still lands in a
// valid, publishable category (with the clean silver-object aspect set)
// instead of failing preflight with "no category mapped." See resolveCategory.
const EBAY_GENERIC_SILVER_CATEGORY: EbayCategoryMapping = {
  categoryId: '1215',
  path: 'Antiques > Silver > Sterling Silver (.925) > Other Antique Sterling Silver',
  approximate: true,
};

// eBay's jewelry policy bars plated/vermeil items from Fine Jewelry leaves
// (they require solid 925+/9K+/850+ base metal) — vermeil routes to Fashion
// Jewelry instead (Q4). Leaves pinned 2026-07-10 from live
// get_category_suggestions (scripts/research-ebay-category-suggestions.mjs),
// limited to the ones actually verified: Fashion Necklaces & Pendants (the
// catalog's vermeil items are all Bhutanese "Koma Clasp" pendant/strap
// hooks) and Fashion Brooches & Pins. Fashion Ring/Bracelet/Earrings leaves
// are deliberately left unpinned (no vermeil item of those types exists) —
// preflight still blocks any such item with a clear message rather than
// guessing an id. Required aspects confirmed present: 155101 needs
// Style/Brand/Type, 50677 needs Type/Brand — all of which mapAspects sends.
const EBAY_FASHION_CATEGORY_MAP: Partial<Record<string, EbayCategoryMapping>> = {
  Necklace: { categoryId: '155101', path: 'Jewelry & Watches > Fashion Jewelry > Necklaces & Pendants' },
  Pendant: { categoryId: '155101', path: 'Jewelry & Watches > Fashion Jewelry > Necklaces & Pendants' },
  Charm: { categoryId: '155101', path: 'Jewelry & Watches > Fashion Jewelry > Necklaces & Pendants' },
  Brooch: { categoryId: '50677', path: 'Jewelry & Watches > Fashion Jewelry > Brooches & Pins' },
  // The catalog's vermeil items: Bhutanese gold-washed silver pendant/strap
  // hooks entered as product_type "Koma Clasp". Worn as pendants → Fashion
  // Necklaces & Pendants. (An Ethnic/Tribal leaf exists too; owner can
  // per-item override if preferred.)
  'Koma Clasp': { categoryId: '155101', path: 'Jewelry & Watches > Fashion Jewelry > Necklaces & Pendants' },
};

const COIN_BULLION_TYPES = new Set(['Coin', 'Bullion']);

export interface CategoryOverride {
  id: string;
  path: string;
}

// Exact-match first, then case-insensitive — the free-text product_type
// values ("Berry Spoon", "Koma Clasp", …) come from manual/AI entry, so a
// minor casing drift shouldn't silently drop an item to "no category".
function lookupCategory(
  map: Partial<Record<string, EbayCategoryMapping>>,
  key: string,
): EbayCategoryMapping | null {
  if (map[key]) return map[key]!;
  const lower = key.toLowerCase();
  for (const [k, v] of Object.entries(map)) {
    if (k.toLowerCase() === lower) return v!;
  }
  return null;
}

export function resolveCategory(
  product: Pick<Product, 'product_type' | 'jewelry_type' | 'metal_variant' | 'title' | 'title_es' | 'chain_type' | 'tags' | 'tags_es'>,
  override?: CategoryOverride | null,
): EbayCategoryMapping | null {
  if (override) return { categoryId: override.id, path: override.path };

  const jewelryType = inferProductJewelryType(product);
  if (COIN_BULLION_TYPES.has(jewelryType)) return null;

  // Antique silver holloware/flatware — resolved before the jewelry
  // Fine/Fashion split (these are Antiques > Silver, not jewelry, so the
  // vermeil branch below doesn't apply to them).
  const silver = lookupCategory(EBAY_SILVER_CATEGORY_MAP, jewelryType);
  if (silver) return silver;

  const isVermeil = product.metal_variant === 'vermeil';
  const map = isVermeil ? EBAY_FASHION_CATEGORY_MAP : EBAY_FINE_CATEGORY_MAP;
  const mapped = lookupCategory(map, jewelryType);
  if (mapped) return mapped;

  // Last resort: a SILVER item whose product_type matched neither an explicit
  // silver-object leaf nor a real jewelry type (a new/unanticipated holloware
  // form, or a typo'd type) still gets a valid, publishable home in the
  // generic "Other Antique Sterling Silver" leaf — flagged approximate so the
  // owner sees "review / consider a more specific category" — rather than
  // failing preflight. Non-silver metals with an unknown type still return
  // null (they genuinely need an explicit jewelry mapping). Never applies to
  // vermeil (handled by the Fashion branch) or Coin/Bullion (excluded above).
  if (!isVermeil && product.metal_variant === 'silver') return EBAY_GENERIC_SILVER_CATEGORY;
  return null;
}

export function isEbayIneligibleProductType(jewelryType: string): boolean {
  return COIN_BULLION_TYPES.has(jewelryType);
}

// A resolved category is a non-jewelry physical object (silver holloware, a
// bell, an inkwell, …) if it lives under the Antiques > Silver tree OR is
// explicitly flagged objectCategory. Used to drop jewelry-only aspects (Main
// Stone, Style, Chain Length, …) that don't apply to these.
export function isSilverAntiqueCategory(category: EbayCategoryMapping | null): boolean {
  return Boolean(category?.objectCategory || category?.path?.startsWith('Antiques > Silver'));
}

// ---------------------------------------------------------------------------
// Price — flattened via the same helpers Etsy reuses (never reimplemented),
// then the eBay-specific admin-variable markup (Q2, seeded 15%) applied. No
// platform price floor (unlike Etsy's $0.20) — eBay has none.
// ---------------------------------------------------------------------------
export interface EbayPriceResult {
  price: number | null;
  basePrice: number | null;
  rejectedReason: string | null;
}

export function computeEbayPrice(product: Product, spotData: SpotData | null, markupPct: number): EbayPriceResult {
  const spotError = getMarketplaceSpotPriceError(product, spotData);
  if (spotError) {
    return { price: null, basePrice: null, rejectedReason: spotError };
  }

  const base = getProductPriceValue(product, spotData)
    ?? (product.price_mode === 'manual' ? product.asking_price ?? null : null);

  if (base == null || !Number.isFinite(base) || base <= 0) {
    return {
      price: null,
      basePrice: null,
      rejectedReason: 'No computable price for this item — set a manual price or check spot pricing inputs.',
    };
  }

  const marked = base * (1 + (markupPct || 0) / 100);
  return {
    price: Math.round((marked + Number.EPSILON) * 100) / 100,
    basePrice: Math.round((base + Number.EPSILON) * 100) / 100,
    rejectedReason: null,
  };
}

// ---------------------------------------------------------------------------
// Q16 — price-tiered shipping. Pure mapping-time branch, no new API call.
// As of 2026-07-30 the site's value-based shipping tiers take precedence:
// when a provisioned tier policy exists for the item's price band
// (marketplace_shipping_profiles via lib/marketplace-shipping.ts), that
// policy is used. Otherwise the original two-policy behavior remains —
// compare the flattened price against the admin-editable threshold (seeded
// $1000) and pick between the two live Business Policies — so live listings
// keep working unchanged until the owner provisions the tier policies.
// ---------------------------------------------------------------------------
export interface EbayConnectionDefaults {
  fulfillment_policy_id: string | null;
  express_fulfillment_policy_id: string | null;
  high_value_shipping_threshold: number;
  payment_policy_id: string | null;
  return_policy_id: string | null;
  merchant_location_key: string | null;
  price_markup_pct: number;
  marketplace_id?: string | null;
  selling_limit_amount?: number | null;
  selling_limit_quantity?: number | null;
}

export interface FulfillmentPolicyResolution {
  policyId: string | null;
  tier: 'standard' | 'express' | 'tiered';
}

export function resolveFulfillmentPolicyId(
  price: number | null,
  connection: EbayConnectionDefaults | null,
  tierPolicyMap?: Record<string, string> | null,
): FulfillmentPolicyResolution {
  if (!connection) return { policyId: null, tier: 'standard' };
  if (price != null && tierPolicyMap) {
    const shippingTier = getMarketplaceShippingTier(price);
    const mappedPolicyId = shippingTier ? tierPolicyMap[shippingTier.key] : undefined;
    if (mappedPolicyId) return { policyId: mappedPolicyId, tier: 'tiered' };
  }
  const threshold = connection.high_value_shipping_threshold ?? 1000;
  if (price != null && price > threshold && connection.express_fulfillment_policy_id) {
    return { policyId: connection.express_fulfillment_policy_id, tier: 'express' };
  }
  return { policyId: connection.fulfillment_policy_id ?? null, tier: 'standard' };
}

// ---------------------------------------------------------------------------
// Tier fulfillment-policy payload — pure builder for the admin "Provision
// shipping tiers" action. One FLAT_RATE domestic policy per distinct site
// shipping fee; the canonical name is supplied by the caller
// (marketplaceShippingTierLabel) and doubles as the idempotency key when the
// provisioning route matches existing policies by exact name.
// ---------------------------------------------------------------------------
export function buildTierFulfillmentPolicyPayload(input: {
  name: string;
  fee: number;
  marketplaceId: string;
}): Record<string, unknown> {
  return {
    name: input.name.slice(0, 64),
    marketplaceId: input.marketplaceId,
    categoryTypes: [{ name: 'ALL_EXCLUDING_MOTORS_VEHICLES' }],
    handlingTime: { value: 1, unit: 'DAY' },
    shippingOptions: [
      {
        optionType: 'DOMESTIC',
        costType: 'FLAT_RATE',
        shippingServices: [
          {
            sortOrder: 1,
            shippingCarrierCode: 'USPS',
            shippingServiceCode: 'USPSPriority',
            shippingCost: { value: input.fee.toFixed(2), currency: 'USD' },
            // One-of-one estate pieces: additional-quantity discounting does
            // not apply; each unit carries the full insured-tier fee.
            additionalShippingCost: { value: input.fee.toFixed(2), currency: 'USD' },
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Images — direct URL handoff, no transcode/upload (05-image-pipeline.md).
// Absolutizes legacy /assets/... paths against the site's canonical URL,
// same resolution rule the Etsy build needed for Node's origin-less fetch —
// here it's eBay's own fetcher that needs the absolute URL.
// ---------------------------------------------------------------------------
const EBAY_MAX_IMAGES = 24;

export function resolveEbayImageUrl(url: string): string {
  const trimmed = (url ?? '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const base = getSiteUrl();
  // Local static-asset paths (public/assets/...) come straight from a
  // filename on disk, never URL-encoded — a space or other reserved char
  // (e.g. "IMG_5132 (Product Staging).webp") produces a literal space in
  // the URL, which eBay rejects with errorId 25721 "Incorrect URL format"
  // (confirmed live 2026-07-10). encodeURI leaves "/" intact so multi-segment
  // paths still resolve correctly.
  const encoded = encodeURI(trimmed);
  return `${base}${encoded.startsWith('/') ? '' : '/'}${encoded}`;
}

export function resolveImageUrls(product: Pick<Product, 'image_urls' | 'images'>): string[] {
  const source = product.image_urls?.length ? product.image_urls : (product.images ?? []);
  return source
    .map((url) => resolveEbayImageUrl(url))
    .filter((url) => url.length > 0)
    .slice(0, EBAY_MAX_IMAGES);
}

// ---------------------------------------------------------------------------
// Pre-flight checks — no eBay calls. Blocking checks gate the sync; ok:true
// informational checks (e.g. the selling-limit readout) never block.
// ---------------------------------------------------------------------------
export interface PreflightCheck {
  check: string;
  ok: boolean;
  message?: string;
  value?: unknown;
}

export function buildPreflightChecks(
  product: Product,
  connection: EbayConnectionDefaults | null,
  spotData: SpotData | null,
  categoryOverride?: CategoryOverride | null,
): PreflightCheck[] {
  const checks: PreflightCheck[] = [];

  checks.push({
    check: 'connected',
    ok: Boolean(connection),
    message: connection ? undefined : 'Connect eBay in Settings before syncing.',
  });

  const hasDefaults = Boolean(
    connection?.fulfillment_policy_id &&
      connection?.payment_policy_id &&
      connection?.return_policy_id &&
      connection?.merchant_location_key,
  );
  checks.push({
    check: 'account_defaults',
    ok: !connection || hasDefaults,
    message: connection && !hasDefaults ? 'eBay needs shipping/payment/return policies and a location. Finish setup in Settings → eBay Sync.' : undefined,
  });

  const jewelryType = inferProductJewelryType(product);
  // Two independent reasons to be ineligible, reported through one check: a
  // whole CATEGORY the owner keeps off eBay (Coin/Bullion), or an INDIVIDUAL
  // item they have held back. The per-item message wins because it is the more
  // specific explanation of why this particular product will not sync.
  const excluded = EBAY_EXCLUDED_PRODUCT_IDS.has(product.id);
  const ineligible = isEbayIneligibleProductType(jewelryType) || excluded;
  checks.push({
    check: 'eligibility',
    ok: !ineligible,
    message: excluded
      ? EBAY_EXCLUDED_REASON
      : ineligible
        ? 'Coins and bullion are not synced to eBay per owner decision.'
        : undefined,
  });

  checks.push({
    check: 'status',
    ok: product.status === 'available',
    message: product.status === 'available' ? undefined : 'Only available items can be published to eBay.',
  });

  const quantity = normalizeProductQuantity(product.quantity);
  checks.push({
    check: 'quantity',
    ok: quantity >= 1,
    message: quantity >= 1 ? undefined : 'This item has zero quantity.',
  });

  const priceResult = computeEbayPrice(product, spotData, connection?.price_markup_pct ?? 15);
  checks.push({
    check: 'price',
    ok: priceResult.price != null,
    message: priceResult.rejectedReason ?? undefined,
    value: priceResult.price ?? undefined,
  });

  const images = resolveImageUrls(product);
  checks.push({
    check: 'images',
    ok: images.length > 0,
    message: images.length > 0 ? undefined : 'Add at least one photo before syncing.',
    value: images.length,
  });

  if (!ineligible) {
    const category = resolveCategory(product, categoryOverride);
    checks.push({
      check: 'category',
      ok: Boolean(category),
      message: category
        ? category.approximate
          ? `Category "${category.path}" is an approximate/unpinned match — review before publishing.`
          : undefined
        : product.metal_variant === 'vermeil'
          ? "Plated/vermeil items route to Fashion Jewelry, but no Fashion Jewelry category id is pinned yet — resolve via eBay's Taxonomy API before publishing this item."
          : 'No eBay category is mapped for this product type yet.',
      value: category?.path,
    });

    checks.push({
      check: 'aspect_values_unverified',
      ok: true,
      message: "Aspect values (Metal, Metal Purity, etc.) haven't been cross-checked against eBay's live category value lists yet — review the preview before publishing.",
    });
  }

  if (connection?.selling_limit_amount != null || connection?.selling_limit_quantity != null) {
    checks.push({
      check: 'selling_limit',
      ok: true,
      message: `Monthly selling limit on file: ${connection.selling_limit_quantity ?? '—'} items / $${connection.selling_limit_amount ?? '—'}. Informational only.`,
    });
  }

  return checks;
}

export function isPreflightPassing(checks: PreflightCheck[]): boolean {
  return checks.every((check) => check.ok);
}

// ---------------------------------------------------------------------------
// Full mapped payload — the allowlist enforcement point. Only ever reads
// named fields into a fresh object; never spreads ...product.
// ---------------------------------------------------------------------------
export interface MappedEbayImage {
  url: string;
}

export interface MappedEbayPayload {
  sku: string;
  title: string;
  description: string;
  aspects: EbayAspects;
  conditionId: string;
  conditionDescription: string;
  categoryId: string | null;
  categoryPath: string | null;
  categoryIsApproximate: boolean;
  categoryIsOverride: boolean;
  price: number | null;
  priceBeforeMarkup: number | null;
  quantity: number;
  images: MappedEbayImage[];
  fulfillmentPolicyId: string | null;
  shippingTier: 'standard' | 'express' | 'tiered';
  paymentPolicyId: string | null;
  returnPolicyId: string | null;
  merchantLocationKey: string | null;
  marketplaceId: string;
  /** The item's own Best Offer choice (`products.ebay_best_offer`) — sent on every offer
   *  write, since eBay's updateOffer replaces the whole offer. NOT in the content hash. */
  bestOfferEnabled: boolean;
}

export function buildMappedPayload(
  product: Product,
  connection: EbayConnectionDefaults | null,
  spotData: SpotData | null,
  categoryOverride?: CategoryOverride | null,
  tierPolicyMap?: Record<string, string> | null,
): MappedEbayPayload {
  const category = resolveCategory(product, categoryOverride);
  const priceResult = computeEbayPrice(product, spotData, connection?.price_markup_pct ?? 15);
  const { policyId: fulfillmentPolicyId, tier } = resolveFulfillmentPolicyId(priceResult.price, connection, tierPolicyMap);

  return {
    sku: mapSku(product),
    title: mapTitle(product.title),
    description: mapDescription(product),
    aspects: mapAspects(product, { silverAntique: isSilverAntiqueCategory(category) }),
    conditionId: EBAY_CONDITION_ID,
    conditionDescription: EBAY_CONDITION_DESCRIPTION,
    categoryId: category?.categoryId ?? null,
    categoryPath: category?.path ?? null,
    categoryIsApproximate: categoryOverride ? false : Boolean(category?.approximate),
    categoryIsOverride: Boolean(categoryOverride),
    price: priceResult.price,
    priceBeforeMarkup: priceResult.basePrice,
    quantity: normalizeProductQuantity(product.quantity),
    images: resolveImageUrls(product).map((url) => ({ url })),
    fulfillmentPolicyId,
    shippingTier: tier,
    paymentPolicyId: connection?.payment_policy_id ?? null,
    returnPolicyId: connection?.return_policy_id ?? null,
    merchantLocationKey: connection?.merchant_location_key ?? null,
    marketplaceId: connection?.marketplace_id ?? 'EBAY_US',
    bestOfferEnabled: product.ebay_best_offer === true,
  };
}

// ---------------------------------------------------------------------------
// Content hash — cheap out-of-date detection with zero eBay reads.
//
// `price` is deliberately EXCLUDED (2026-07-10) — spot-multiplier items
// reprice on every gold/silver tick, which would flag most of the catalog
// out_of_date daily just from market drift. Price has its own dedicated
// path (Q3 threshold-gated scheduled push + the "Push prices now" bulk
// action, both keyed off last_pushed_price directly, not this hash) — see
// shouldPushPrice/runScheduledPricePush/pushPricesBatch below. This hash is
// for everything ELSE: any real content edit (title, description, aspects,
// condition, category, images, quantity) still flags out-of-date.
//
// `fulfillmentPolicyId` stays IN the hash on purpose (Q16): a price crossing
// the high-value shipping threshold changes which shipping policy applies —
// that's a structural listing change, not mere price drift, so it should
// still trigger an update push despite price itself being excluded.
//
// `bestOfferEnabled` is deliberately EXCLUDED (2026-10-14): the "Allow offers"
// box pushes its own change to a live listing the moment it is ticked (see
// setEbayBestOffer in sync.ts), and adding it here would have flagged every
// existing listing "Content stale" the day it shipped.
// ---------------------------------------------------------------------------
export function computeContentHash(payload: MappedEbayPayload): string {
  const stable = {
    title: payload.title,
    description: payload.description,
    aspects: payload.aspects,
    conditionId: payload.conditionId,
    conditionDescription: payload.conditionDescription,
    categoryId: payload.categoryId,
    quantity: payload.quantity,
    images: payload.images.map((image) => image.url),
    fulfillmentPolicyId: payload.fulfillmentPolicyId,
    paymentPolicyId: payload.paymentPolicyId,
    returnPolicyId: payload.returnPolicyId,
    merchantLocationKey: payload.merchantLocationKey,
  };
  return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}
