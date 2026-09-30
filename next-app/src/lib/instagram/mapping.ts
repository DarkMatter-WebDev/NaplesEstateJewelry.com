import type { Product, SpotData } from '@/types/product';
import { getProductImages, getProductMetal, getProductWeight } from '@/lib/sales';
import { formatPublicPurity } from '@/types/sales';
import { getMarketplaceSpotPriceError, getProductPriceValue } from '@/lib/pricing';
import { normalizeLegacyLocalImageUrl } from '@/lib/image-url';
import { fallbackSocialCaptionOpening, normalizeSocialCaptionOpening } from '@/lib/social-caption-opening';
import {
  INSTAGRAM_MAX_CAPTION_CHARS,
  INSTAGRAM_MAX_CAROUSEL_ITEMS,
  INSTAGRAM_MAX_HASHTAGS,
  INSTAGRAM_MAX_PHOTO_ITEMS,
} from './client';

/**
 * Pure product -> Instagram caption/media mapping. No I/O, no Supabase, no
 * network: everything here is deterministic so the caption that gets published
 * can be unit-tested and previewed byte-for-byte before it goes live.
 *
 * This matters more than for Etsy/eBay because Instagram captions are
 * IMMUTABLE after publishing — the only correction is delete-and-repost, which
 * destroys the post's likes and comments.
 */

/** Fields that must never appear in a caption, mirroring the Etsy/eBay firewall. */
export const INSTAGRAM_FORBIDDEN_PRODUCT_FIELDS = [
  'cost_basis',
  'minimum_price',
  'internal_notes',
  'private_price_label',
  'melt_value',
  'acquisition_date',
  'acquisition_source',
  'live_spot_snapshot',
] as const;

export interface InstagramCaptionSettings {
  includePrice: boolean;
  spanishLine: boolean;
  cta: string | null;
  baseHashtags: string[];
}

export const DEFAULT_CAPTION_SETTINGS: InstagramCaptionSettings = {
  includePrice: true,
  spanishLine: true,
  // "The site" leans on the Shop line right above it — the caption already
  // names the domain once there, and repeating it read as noise (owner,
  // 2026-08-01). Still carries the live-pricing pointer that the "at time of
  // posting" price qualifier depends on.
  cta: 'DM us or visit the site for live spot-linked pricing.',
  baseHashtags: [
    'estatejewelry',
    'naplesflorida',
    'finejewelry',
    'vintagejewelry',
    'goldjewelry',
  ],
};

/**
 * Resolve the ordered images a post should actually use.
 *
 * `selection` is the operator's Instagram-only lineup (see
 * supabase/instagram-image-selection-2026-08.sql). It is definitive when
 * present: entries are honoured in order, entries that no longer exist on the
 * product are dropped, and product images absent from it stay excluded — a
 * photo added to the product later must not silently reappear in a curated
 * carousel. With no selection the product's own image order is used.
 */
export function resolveImageLineup(params: {
  productImages: string[];
  selection?: string[] | null;
}): { lineup: string[]; notIncluded: string[] } {
  const available = params.productImages.filter((url) => Boolean(url && url.trim()));
  const selection = (params.selection ?? []).filter((url) => Boolean(url && url.trim()));

  if (selection.length === 0) {
    return { lineup: available, notIncluded: [] };
  }

  const availableSet = new Set(available);
  const seen = new Set<string>();
  const lineup: string[] = [];
  for (const url of selection) {
    if (!availableSet.has(url) || seen.has(url)) continue;
    seen.add(url);
    lineup.push(url);
  }

  return {
    lineup,
    notIncluded: available.filter((url) => !seen.has(url)),
  };
}

/** Text for the generated ad card. Derived here so preview and prepare agree. */
export interface InstagramCardContent {
  title: string;
  /** Pre-formatted price, or null when the caption omits one. */
  price: string | null;
  /** Upper-cased spec line, sized for a single line of card type. */
  specs: string | null;
  /** Small qualifier under the price, e.g. the spot basis. Null when no price. */
  priceNote?: string | null;
}

/**
 * "$4,044/oz gold spot" — the live basis behind a spot-linked price, for the
 * card's price note and the Facebook post's parenthetical. Null for manually
 * priced items (their price has no spot basis to cite) and when spot data is
 * absent — callers already fail closed on that for spot-linked products.
 */
export function formatSpotBasis(product: Product, spotData: SpotData | null): string | null {
  if (!spotData) return null;
  if (product.price_mode === 'manual') return null;

  const metalText = `${product.metal ?? ''} ${product.metal_type ?? ''} ${product.category ?? ''}`.toLowerCase();
  const isSilver = metalText.includes('silver');
  const perOz = isSilver ? spotData.silverPerTroyOz : spotData.goldPerTroyOz;
  if (!perOz || perOz <= 0) return null;

  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    // Silver trades in two-digit dollars; cents matter there and are noise on gold.
    maximumFractionDigits: perOz >= 100 ? 0 : 2,
  }).format(perOz);

  return `${formatted}/oz ${isSilver ? 'silver' : 'gold'} spot`;
}

export interface MappedInstagramPost {
  caption: string;
  /** Ordered source image URLs (pre-rendition), capped at Instagram's limit. */
  imageUrls: string[];
  /** Accessibility text for the first image. */
  altText: string;
  /** Price quoted in the caption, or null when omitted/unavailable. */
  quotedPrice: number | null;
  /** Copy for the generated card that leads the carousel. */
  cardContent: InstagramCardContent;
  /** Non-fatal notes for the admin preview (e.g. images dropped by the cap). */
  warnings: string[];
  /** Set when the post must not be published (fail-closed conditions). */
  blockedReason: string | null;
}

/**
 * Card spec line: the caption's spec line, upper-cased and without the
 * inventory number.
 *
 * The card has room for one line at 20px, and the inventory number is
 * bookkeeping rather than a selling point — it stays in the caption, where
 * buyers who care can still find it.
 */
export function buildCardSpecs(product: Product): string | null {
  const specs = buildSpecLine(product)
    .split(' · ')
    .filter((part) => !/^Inventory\b/i.test(part));
  return specs.length ? specs.join('  ·  ').toUpperCase() : null;
}

/**
 * First N sentences of a description.
 *
 * Splits only at a terminator followed by whitespace AND a capital/opening
 * character, so decimals inside measurements ("Measures 7.75 inches") are not
 * mistaken for sentence ends — a naive `[^.!?]+` split truncated real captions
 * to "Measures 7." (caught in live preview 2026-08-01).
 */
export function sentenceSummary(text: string | null | undefined, maxSentences = 2): string | null {
  const trimmed = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;
  const sentences = trimmed.split(/(?<=[.!?])\s+(?=[A-Z¡¿"'“(])/);
  return sentences.slice(0, maxSentences).join(' ').trim() || null;
}

/** "$1,718" — whole dollars, matching how the storefront quotes spot prices. */
export function formatCaptionPrice(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Specification line: "14K Yellow Gold · 53.91g · 7.75 in · Inventory #21".
 * Only facts that are actually present are included — no empty labels.
 */
export function buildSpecLine(product: Product): string {
  const parts: string[] = [];

  const purity = formatPublicPurity(product.purity);
  const metal = getProductMetal(product);
  const metalLabel = [purity, metal].filter(Boolean).join(' ').trim();
  if (metalLabel) parts.push(metalLabel);

  const weight = getProductWeight(product);
  if (weight) parts.push(`${weight}g`);

  const length = (product.length ?? '').trim();
  if (length) parts.push(/[a-z"']/i.test(length) ? length : `${length} in`);

  if (product.width_mm) parts.push(`${product.width_mm}mm`);
  if (product.item_year) parts.push(`ca. ${product.item_year}`);
  // Deliberately NO "#" before the number: Instagram auto-links "#21" into a
  // hashtag pointing at an unrelated tag page (seen on the first live post,
  // 2026-08-01), and captions cannot be edited afterwards.
  if (product.inventory_number != null) parts.push(`Inventory ${product.inventory_number}`);

  return parts.join(' · ');
}

/**
 * The spec line as it may appear in PUBLIC post copy: buildSpecLine minus the
 * inventory number. Owner decision (2026-08-01): the number is internal
 * bookkeeping and stays out of published posts on every channel — the Shop
 * short link (/p/<inventory#>) identifies the piece instead. Shared by both
 * channels so the rule can never drift.
 */
export function buildPublicSpecLine(product: Product): string {
  return buildSpecLine(product)
    .split(' · ')
    .filter((part) => !/^Inventory\b/i.test(part))
    .join(' · ');
}

/** Normalize a tag into a bare hashtag token (letters/digits only). */
function toHashtag(value: string): string | null {
  const cleaned = value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toLowerCase();
  // House style: every direct Tiffany brand-tag variant collapses to the one
  // explicit public spelling requested by the owner. This also repairs legacy
  // configured tags such as #tiffanyco instead of letting both variants appear.
  if (
    cleaned === 'tiffany'
    || cleaned === 'tiffanyco'
    || cleaned === 'tiffanyandco'
    || cleaned === 'tiffanycompany'
    || cleaned === 'tiffanyandcompany'
  ) {
    return 'tiffanyandco';
  }
  return cleaned.length >= 3 ? cleaned : null;
}

/**
 * Internal taxonomy tags use a "prefix:value" convention (`jt:Bracelet`,
 * `ct:Cuban link`, `len:7.75`) and are for filtering, not for the public. They
 * stripped down to nonsense hashtags like #jtbracelet and #len775 in the first
 * live preview (2026-08-01), so they are excluded outright.
 */
function isInternalTaxonomyTag(raw: string): boolean {
  return /^[a-z]{1,6}:/i.test(raw.trim());
}

export function buildHashtags(product: Product, baseHashtags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const push = (raw: string | null | undefined) => {
    if (!raw || isInternalTaxonomyTag(raw)) return;
    const tag = toHashtag(raw);
    if (!tag || seen.has(tag)) return;
    seen.add(tag);
    out.push(tag);
  };

  // Product-specific first: they are the most useful for discovery.
  push(product.product_type);
  push(product.jewelry_type);
  push(product.brand);
  (product.tags ?? []).forEach(push);
  baseHashtags.forEach(push);

  return out.slice(0, INSTAGRAM_MAX_HASHTAGS);
}

/**
 * Build the complete post payload for a product.
 *
 * Fails closed (blockedReason) when:
 *   * the product has no usable images, or
 *   * a price would be quoted but live spot data is unavailable — an external
 *     publish is a durable public claim about price, so it obeys the same
 *     fail-closed rule as Etsy/eBay writes (DECISIONS.md).
 */
export function buildInstagramPost(params: {
  product: Product;
  spotData: SpotData | null;
  /** AI-generated and server-validated opening from the review/prepare flow. */
  captionOpening?: string | null;
  settings?: Partial<InstagramCaptionSettings>;
  /** Operator's Instagram-only ordered lineup; null means product order. */
  imageSelection?: string[] | null;
  siteUrl?: string;
}): MappedInstagramPost {
  const { product, spotData } = params;
  // Merged field by field rather than by spread: callers build these from
  // nullable DB columns (`cta: connection?.caption_cta ?? undefined`), and a
  // spread would let an explicit `undefined` clobber the default instead of
  // falling back to it. `cta` uses an explicit undefined check because `null`
  // is meaningful there (it means "no call-to-action line").
  const provided = params.settings ?? {};
  const settings: InstagramCaptionSettings = {
    includePrice: provided.includePrice ?? DEFAULT_CAPTION_SETTINGS.includePrice,
    spanishLine: provided.spanishLine ?? DEFAULT_CAPTION_SETTINGS.spanishLine,
    cta: provided.cta !== undefined ? provided.cta : DEFAULT_CAPTION_SETTINGS.cta,
    baseHashtags: provided.baseHashtags ?? DEFAULT_CAPTION_SETTINGS.baseHashtags,
  };
  const warnings: string[] = [];
  let blockedReason: string | null = null;

  // ---- Images -------------------------------------------------------------
  const productImages = getProductImages(product)
    .map((url) => normalizeLegacyLocalImageUrl(url))
    .filter((url): url is string => Boolean(url && url.trim()));

  const { lineup: allImages } = resolveImageLineup({
    productImages,
    selection:
      params.imageSelection
        ?.map((url) => normalizeLegacyLocalImageUrl(url))
        .filter((url): url is string => Boolean(url)) ?? null,
  });

  if (allImages.length === 0) {
    blockedReason = productImages.length
      ? 'Every image has been removed from this post\'s lineup. Add at least one back.'
      : 'This product has no images, so there is nothing to post.';
  }

  const imageUrls = allImages.slice(0, INSTAGRAM_MAX_PHOTO_ITEMS);
  if (allImages.length > INSTAGRAM_MAX_PHOTO_ITEMS) {
    warnings.push(
      `Instagram allows ${INSTAGRAM_MAX_CAROUSEL_ITEMS} images per post and the card takes the first slot, so the first ${INSTAGRAM_MAX_PHOTO_ITEMS} of ${allImages.length} photos will be used.`,
    );
  }

  // ---- Price --------------------------------------------------------------
  let quotedPrice: number | null = null;
  if (settings.includePrice) {
    const spotError = getMarketplaceSpotPriceError(product, spotData);
    if (spotError) {
      // Never publish an immutable caption quoting a fallback estimate.
      blockedReason = blockedReason ?? spotError;
    } else {
      const price = getProductPriceValue(product, spotData);
      if (price != null && price > 0) {
        quotedPrice = price;
      } else {
        warnings.push('No resolvable price for this product; the caption will omit a price.');
      }
    }
  }

  // ---- Caption ------------------------------------------------------------
  // Mirrors the Facebook message structure line for line: one short,
  // personable sentence combines the availability hook and exact title, the
  // spec line carries the facts, and the price sentence closes the facts block —
  // with exactly one blank line between EVERY line (uniform rhythm) and no
  // description body. Spot-linked prices carry their basis in parentheses so
  // "at time of posting" reads as a fact, not a hedge.
  const spotBasis = formatSpotBasis(product, spotData);
  const priceSentence =
    quotedPrice != null
      ? `≈ ${formatCaptionPrice(quotedPrice)} at time of posting${spotBasis ? ` (based on ${spotBasis})` : ''}.`
      : null;

  const lines: string[] = [];
  // Revalidate even server-generated text here so direct callers and tests
  // cannot accidentally publish a stale title or availability claim.
  const captionOpening = normalizeSocialCaptionOpening(params.captionOpening, product, {
    requireExactTitle: false,
  })
    ?? fallbackSocialCaptionOpening(product);
  lines.push(captionOpening);
  lines.push('');

  const specLine = buildPublicSpecLine(product);
  if (specLine) {
    lines.push(specLine);
    lines.push('');
  }
  if (priceSentence) {
    lines.push(priceSentence);
  }

  if (settings.spanishLine) {
    const esTitle = (product.title_es ?? '').trim();
    const esSummary = sentenceSummary(product.description_es, 1);
    const spanish = esSummary || esTitle;
    if (spanish) {
      lines.push('');
      lines.push(`🇪🇸 ${spanish}`);
    }
  }

  // Instagram never linkifies caption URLs. Point people to the profile's live
  // store link, then keep this item's typeable short path directly underneath.
  // The two lines intentionally have no blank line between them; the normal
  // caption spacing still surrounds the block.
  lines.push('');
  lines.push('Store link in bio');
  lines.push(
    product.inventory_number != null
      ? `Item: NaplesEstateJewelry.com/p/${product.inventory_number}`
      : 'Item: NaplesEstateJewelry.com',
  );

  if (settings.cta) {
    lines.push('');
    lines.push(settings.cta);
  }

  const hashtags = buildHashtags(product, settings.baseHashtags);
  if (hashtags.length) {
    lines.push('');
    lines.push(hashtags.map((tag) => `#${tag}`).join(' '));
  }

  let caption = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  if (caption.length > INSTAGRAM_MAX_CAPTION_CHARS) {
    // Drop hashtags before truncating real copy: they are the least
    // information-dense part of the caption.
    const withoutHashtags = lines
      .slice(0, hashtags.length ? -2 : undefined)
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    caption = withoutHashtags.slice(0, INSTAGRAM_MAX_CAPTION_CHARS).trim();
    warnings.push('Caption exceeded Instagram\'s 2,200 character limit and was shortened.');
  }

  // ---- Alt text -----------------------------------------------------------
  // Public copy like the caption, so the inventory number stays out of it too.
  const altText = [product.title.trim(), buildPublicSpecLine(product)]
    .filter(Boolean)
    .join('. ')
    .slice(0, 1000);

  // ---- Card copy ----------------------------------------------------------
  // Every post leads with a card, so this is always part of the mapping and is
  // derived here rather than at render time — the preview and the published
  // card read from the same value.
  const cardContent: InstagramCardContent = {
    title: product.title.trim(),
    price: quotedPrice != null ? formatCaptionPrice(quotedPrice) : null,
    specs: buildCardSpecs(product),
    priceNote:
      quotedPrice != null
        ? `Price at time of posting${spotBasis ? ` · ${spotBasis}` : ''}`
        : null,
  };

  return { caption, imageUrls, altText, quotedPrice, cardContent, warnings, blockedReason };
}

/**
 * Stable hash over everything that would change the published post. Used to
 * flag a live post as out_of_date. Deliberately EXCLUDES price: prices move
 * daily and captions are immutable, so a price move must not imply the post
 * should be deleted and reposted (same rule as marketplace price drift).
 */
export function computeInstagramContentHash(post: MappedInstagramPost): string {
  // Strips the whole price sentence including the spot-basis parenthetical —
  // spot moves daily and must never flag a post as out of date.
  const captionWithoutPrice = post.caption.replace(
    /≈ \$[\d,.]+ at time of posting( \(based on [^)]+\))?\.?\n?/g,
    '',
  );
  const payload = JSON.stringify({
    caption: captionWithoutPrice,
    images: post.imageUrls.map((url) => url.split('?')[0]),
  });

  // Simple deterministic FNV-1a; this is a change detector, not a security
  // primitive, and keeping it dependency-free lets it run in any context.
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
