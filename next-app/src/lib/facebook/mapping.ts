import type { Product, SpotData } from '@/types/product';
import { getProductImages } from '@/lib/sales';
import { getMarketplaceSpotPriceError, getProductPriceValue } from '@/lib/pricing';
import { normalizeLegacyLocalImageUrl } from '@/lib/image-url';
import { fallbackSocialCaptionOpening, normalizeSocialCaptionOpening } from '@/lib/social-caption-opening';
// The pure caption builders are channel-agnostic and already unit-tested where
// they live; importing them keeps the two channels' captions consistent by
// construction (a spec-line fix lands on both). The API CLIENTS stay separate —
// this sharing is deliberate and limited to pure text/lineup helpers.
import {
  DEFAULT_CAPTION_SETTINGS,
  buildCardSpecs,
  buildHashtags,
  buildPublicSpecLine,
  formatCaptionPrice,
  formatSpotBasis,
  resolveImageLineup,
  sentenceSummary,
  type InstagramCaptionSettings,
  type InstagramCardContent,
} from '@/lib/instagram/mapping';
import {
  FACEBOOK_MAX_CAPTION_CHARS,
  FACEBOOK_MAX_HASHTAGS,
  FACEBOOK_MAX_PHOTO_ITEMS,
} from './client';

/**
 * Pure product -> Facebook post mapping. No I/O, no Supabase, no network:
 * deterministic so the exact post text can be unit-tested and previewed before
 * it goes live.
 *
 * Two Facebook-specific differences from the Instagram caption:
 *   * Facebook renders URLs as real links, so the post carries a clickable
 *     "Shop:" line pointing at the product page — the single biggest reason to
 *     be on Facebook at all. Instagram captions render URLs as dead text.
 *   * The length ceiling is 63,206 characters rather than 2,200, so truncation
 *     is a formality kept only as a guard.
 */

export type FacebookCaptionSettings = InstagramCaptionSettings;
export type FacebookCardContent = InstagramCardContent;

export const DEFAULT_FACEBOOK_CAPTION_SETTINGS: FacebookCaptionSettings = {
  ...DEFAULT_CAPTION_SETTINGS,
  // The Facebook CTA can lean on the clickable Shop link that precedes it.
  cta: 'Message us here or shop the full collection online.',
};

export interface MappedFacebookPost {
  message: string;
  /** Ordered source image URLs (pre-rendition), capped at the photo limit. */
  imageUrls: string[];
  /** Price quoted in the message, or null when omitted/unavailable. */
  quotedPrice: number | null;
  /** Copy for the generated card that leads the photo set. */
  cardContent: FacebookCardContent;
  /** Clickable product URL included in the message. */
  productUrl: string;
  warnings: string[];
  blockedReason: string | null;
}

/**
 * Build the complete post payload for a product.
 *
 * Fails closed (blockedReason) under the same conditions as Instagram: no
 * usable images, or a price would be quoted while live spot data is
 * unavailable — a public post is a durable price claim (DECISIONS.md), and
 * "editable later" is not a licence to publish a wrong number now.
 */
export function buildFacebookPost(params: {
  product: Product;
  spotData: SpotData | null;
  siteUrl: string;
  /** AI-generated and server-validated opening from the review/prepare flow. */
  captionOpening?: string | null;
  settings?: Partial<FacebookCaptionSettings>;
  /** Operator's Facebook-only ordered lineup; null means product order. */
  imageSelection?: string[] | null;
}): MappedFacebookPost {
  const { product, spotData } = params;
  // Field-by-field merge for the same reason as Instagram's: callers build
  // these from nullable DB columns, and a spread would let an explicit
  // `undefined` clobber a default instead of falling back to it.
  const provided = params.settings ?? {};
  const settings: FacebookCaptionSettings = {
    includePrice: provided.includePrice ?? DEFAULT_FACEBOOK_CAPTION_SETTINGS.includePrice,
    spanishLine: provided.spanishLine ?? DEFAULT_FACEBOOK_CAPTION_SETTINGS.spanishLine,
    cta: provided.cta !== undefined ? provided.cta : DEFAULT_FACEBOOK_CAPTION_SETTINGS.cta,
    baseHashtags: provided.baseHashtags ?? DEFAULT_FACEBOOK_CAPTION_SETTINGS.baseHashtags,
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

  const imageUrls = allImages.slice(0, FACEBOOK_MAX_PHOTO_ITEMS);
  if (allImages.length > FACEBOOK_MAX_PHOTO_ITEMS) {
    warnings.push(
      `This pipeline posts the generated card plus up to ${FACEBOOK_MAX_PHOTO_ITEMS} photos, so the first ${FACEBOOK_MAX_PHOTO_ITEMS} of ${allImages.length} will be used.`,
    );
  }

  // ---- Price --------------------------------------------------------------
  let quotedPrice: number | null = null;
  if (settings.includePrice) {
    const spotError = getMarketplaceSpotPriceError(product, spotData);
    if (spotError) {
      blockedReason = blockedReason ?? spotError;
    } else {
      const price = getProductPriceValue(product, spotData);
      if (price != null && price > 0) {
        quotedPrice = price;
      } else {
        warnings.push('No resolvable price for this product; the post will omit a price.');
      }
    }
  }

  // ---- Product link -------------------------------------------------------
  // Facebook linkifies the literal URL text — anchor text with a hidden href
  // does not exist there — so the only way to show a tidy link is a short URL.
  // /p/<inventory#> 302s to the product page (src/app/p/[code]/route.ts);
  // products without an inventory number fall back to the full slug URL.
  const base = params.siteUrl.replace(/\/+$/, '');
  const productUrl =
    product.inventory_number != null
      ? `${base}/p/${product.inventory_number}`
      : `${base}/shop/${encodeURIComponent(product.id)}`;

  // ---- Message ------------------------------------------------------------
  // The AI-assisted hook is the very first line and combines the availability
  // message with the exact product title. It is revalidated here so a queued
  // post can never retain a stale title or availability claim.
  // Spot-linked prices carry their basis in parentheses so "at time of
  // posting" reads as a fact, not a hedge.
  const spotBasis = formatSpotBasis(product, spotData);
  const priceSentence =
    quotedPrice != null
      ? `≈ ${formatCaptionPrice(quotedPrice)} at time of posting${spotBasis ? ` (based on ${spotBasis})` : ''}.`
      : null;

  // Final structure: one short opening sentence, then specs and the price
  // sentence underneath.
  // Uniform vertical rhythm (owner, 2026-08-01): exactly one blank line
  // between EVERY line of the post — no tight two-line clusters mixed with
  // spaced ones. The trailing join collapses any accidental doubles.
  const lines: string[] = [];
  const captionOpening = normalizeSocialCaptionOpening(params.captionOpening, product, {
    requireExactTitle: false,
  })
    ?? fallbackSocialCaptionOpening(product);
  lines.push(captionOpening);
  lines.push('');

  // Owner decision (2026-08-01): no inventory number in public post copy on
  // either channel — the Shop link identifies the piece precisely, and the
  // number is internal bookkeeping. The generated card strips it for the same
  // reason (buildCardSpecs).
  const specLine = buildPublicSpecLine(product);
  if (specLine) {
    lines.push(specLine);
    lines.push('');
  }
  if (priceSentence) {
    lines.push(priceSentence);
  }

  // Owner decision (2026-08-01): NO description body on Facebook. The spec
  // line already carries every hard fact, and the full story lives one tap
  // away behind the Shop link — a long paragraph just pushes the link and
  // hashtags below the fold.

  if (settings.spanishLine) {
    const esTitle = (product.title_es ?? '').trim();
    const esSummary = sentenceSummary(product.description_es, 1);
    const spanish = esSummary || esTitle;
    if (spanish) {
      lines.push('');
      lines.push(`🇪🇸 ${spanish}`);
    }
  }

  // Facebook renders this as a clickable link with a preview-free inline URL —
  // the storefront is one tap away, which Instagram never allows.
  lines.push('');
  lines.push(`Shop: ${productUrl}`);

  if (settings.cta) {
    lines.push('');
    lines.push(settings.cta);
  }

  const hashtags = buildHashtags(product, settings.baseHashtags).slice(0, FACEBOOK_MAX_HASHTAGS);
  if (hashtags.length) {
    lines.push('');
    lines.push(hashtags.map((tag) => `#${tag}`).join(' '));
  }

  let message = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  if (message.length > FACEBOOK_MAX_CAPTION_CHARS) {
    // Effectively unreachable with real product data; kept as a guard so a
    // pathological description can never fail the publish call.
    const withoutHashtags = lines
      .slice(0, hashtags.length ? -2 : undefined)
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    message = withoutHashtags.slice(0, FACEBOOK_MAX_CAPTION_CHARS).trim();
    warnings.push('Post text exceeded Facebook\'s length limit and was shortened.');
  }

  // ---- Card copy ----------------------------------------------------------
  // Identical inputs to the Instagram card, so the same product renders the
  // same lead slide on both channels.
  const cardContent: FacebookCardContent = {
    title: product.title.trim(),
    price: quotedPrice != null ? formatCaptionPrice(quotedPrice) : null,
    specs: buildCardSpecs(product),
    priceNote:
      quotedPrice != null
        ? `Price at time of posting${spotBasis ? ` · ${spotBasis}` : ''}`
        : null,
  };

  return { message, imageUrls, quotedPrice, cardContent, productUrl, warnings, blockedReason };
}

/**
 * Stable hash over everything that would change the published post.
 * Deliberately EXCLUDES price (prices move daily) and the product URL host —
 * same rationale as the Instagram/marketplace drift rules.
 */
export function computeFacebookContentHash(post: MappedFacebookPost): string {
  // Strips the whole price sentence including the spot-basis parenthetical —
  // spot moves daily and must never flag a post as out of date.
  const messageWithoutPrice = post.message.replace(
    /≈ \$[\d,.]+ at time of posting( \(based on [^)]+\))?\.?\n?/g,
    '',
  );
  const payload = JSON.stringify({
    message: messageWithoutPrice,
    images: post.imageUrls.map((url) => url.split('?')[0]),
  });

  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
