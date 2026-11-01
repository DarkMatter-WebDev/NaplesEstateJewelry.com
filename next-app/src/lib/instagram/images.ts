import 'server-only';

import crypto from 'node:crypto';
import sharp from 'sharp';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSiteUrl } from '@/lib/order-email-branding';
import { PRODUCT_IMAGES_BUCKET } from '@/lib/product-image-storage';
import { applyCropRect, detectBorderBackdrop, toHexColor, type NormalizedRect } from './backdrop';
import { renderInstagramCard, type CardContent } from './card';

/**
 * Instagram rendition pipeline.
 *
 * Two hard Instagram constraints drive this whole module:
 *   1. JPEG only. Our entire catalog is WebP, so every image must be transcoded.
 *   2. Meta cURLs `image_url` itself, so renditions must live at a public URL —
 *      we cannot hand it bytes, and we cannot hand it a signed/expiring link.
 *
 * A third constraint shapes the framing: every image in a carousel is cropped
 * to the FIRST image's aspect ratio. Rather than let Instagram crop jewelry
 * (clasps and gemstones live at the edges), we pad every image onto a square
 * canvas painted in that photo's own backdrop colour. Uniform 1:1 means the
 * crop rule becomes a no-op, and matching the sweep means the padding is
 * invisible instead of being white bars around a black-backdrop shot.
 *
 * Renditions are written into the existing product-images bucket under a
 * dedicated prefix so they inherit its public-read policy. The prefix is
 * registered with the Storage GC reference scan (see INSTAGRAM_RENDITION_PREFIX
 * usage in the admin storage-cleanup action) and cleaned up when a post is
 * deleted or re-prepared.
 */

export const INSTAGRAM_RENDITION_PREFIX = 'instagram-renditions';

/** Instagram's recommended square feed size; also its max useful width. */
const RENDITION_EDGE_PX = 1080;
const JPEG_QUALITY = 85;
/** Meta rejects very large fetches; our square 1080 JPEGs land far below this. */
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

/**
 * The client-safe facts needed to draw a source photo exactly as its prepared
 * square rendition will be framed. The raw RGB tuple stays server-side.
 */
export interface SquareImageFraming {
  sourceAspect: number;
  canvasColor: string;
  hasCanvas: boolean;
}

interface ResolvedSquareImageFraming extends SquareImageFraming {
  backgroundRgb: [number, number, number];
}

/**
 * Resolve the source dimensions and the same backdrop used by the square JPEG
 * renderer. Keeping this calculation shared prevents the editor from
 * promising a white (or cropped) preview that Prepare later changes.
 */
async function resolveSquareImageFraming(input: Buffer): Promise<ResolvedSquareImageFraming> {
  const [metadata, backdrop] = await Promise.all([
    sharp(input).metadata(),
    // A tight product crop can put jewelry in one or two corners even though
    // the surrounding sweep is still uniform. The border median ignores those
    // isolated touches and matches the actual dominant canvas colour.
    detectBorderBackdrop(input),
  ]);
  if (!metadata.width || !metadata.height) {
    throw new Error('Could not determine image dimensions for square framing.');
  }

  const backgroundRgb: [number, number, number] = backdrop.uniform ? backdrop.rgb : [255, 255, 255];
  const canvasColor = backdrop.uniform ? toHexColor(backdrop.rgb) : '#ffffff';
  const sourceAspect = metadata.width / metadata.height;

  return {
    sourceAspect,
    canvasColor,
    hasCanvas: Math.abs(sourceAspect - 1) > 0.001,
    backgroundRgb,
  };
}

export async function getSquareImageFraming(input: Buffer): Promise<SquareImageFraming> {
  const framing = await resolveSquareImageFraming(input);
  return {
    sourceAspect: framing.sourceAspect,
    canvasColor: framing.canvasColor,
    hasCanvas: framing.hasCanvas,
  };
}

/**
 * Best-effort framing metadata for the editable lineup. A broken legacy image
 * should still let the owner edit the rest of the lineup; Prepare will report
 * that source's actual error if it remains selected.
 */
export async function getLineupSquareImageFraming(
  imageUrls: string[],
  crops?: Record<string, NormalizedRect> | null,
): Promise<Record<string, SquareImageFraming>> {
  const entries = await Promise.all(imageUrls.map(async (url) => {
    try {
      const source = await fetchImageBytes(url);
      const sourceMetadata = await sharp(source).metadata();
      if (!sourceMetadata.width || !sourceMetadata.height) {
        throw new Error('Could not determine source image dimensions.');
      }
      const framedSource = crops?.[url] ? await applyCropRect(source, crops[url]) : source;
      const preparedFraming = await getSquareImageFraming(framedSource);
      const sourceAspect = sourceMetadata.width / sourceMetadata.height;
      const crop = crops?.[url];
      const cropAspect = sourceAspect * (crop?.w ?? 1) / (crop?.h ?? 1);
      return [url, {
        ...preparedFraming,
        // Keep the original aspect client-side so an unsaved crop can update
        // the thumbnail immediately, before the owner chooses Save & prepare.
        sourceAspect,
        hasCanvas: Math.abs(cropAspect - 1) > 0.001,
      }] as const;
    } catch (error) {
      console.warn('Could not load square framing preview:', url, error instanceof Error ? error.message : error);
      return null;
    }
  }));

  return Object.fromEntries(entries.filter((entry): entry is readonly [string, SquareImageFraming] => entry !== null));
}

/**
 * Legacy product photos can be a bare same-origin path ("/assets/images/..."),
 * which Node's fetch cannot resolve on its own. Resolve against the site's
 * canonical URL, exactly as the Etsy pipeline does.
 */
export function resolveImageUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${getSiteUrl()}${url.startsWith('/') ? '' : '/'}${url}`;
}

export async function fetchImageBytes(url: string): Promise<Buffer> {
  const resolvedUrl = resolveImageUrl(url);
  const res = await fetch(resolvedUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Image fetch failed (${res.status}): ${resolvedUrl}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength > MAX_SOURCE_BYTES) {
    throw new Error(`Source image is too large to process: ${resolvedUrl}`);
  }
  return buffer;
}

/**
 * Any sharp-supported input -> square backdrop-padded sRGB JPEG.
 *
 * `fit: 'contain'` pads rather than crops, so nothing is ever cut off;
 * `withoutEnlargement: false` is intentional here (unlike the Etsy pipeline) —
 * a small legacy photo still has to fill a 1080 square or Instagram would
 * upscale it itself, with worse resampling.
 *
 * The pad colour is sampled from the photo rather than assumed. This used to be
 * hardcoded white, which is invisible on the cream-sweep majority but framed
 * every black-backdrop photo in white bars — the chains are all portrait, so a
 * pure-black shot got ~92px of white down each side (19 products affected,
 * measured 2026-08-01). Matching the sweep makes the padding disappear on both.
 *
 * White stays the fallback for a genuinely non-uniform border
 * (contextual/lifestyle shots), where there is no single backdrop colour to
 * match. Border-median detection prevents a tight studio crop from being
 * misclassified merely because the jewelry reaches one corner.
 */
export async function renderSquareJpeg(input: Buffer): Promise<Buffer> {
  const framing = await resolveSquareImageFraming(input);
  const [r, g, b] = framing.backgroundRgb;

  return sharp(input)
    .resize(RENDITION_EDGE_PX, RENDITION_EDGE_PX, {
      fit: 'contain',
      background: { r, g, b, alpha: 1 },
    })
    .flatten({ background: framing.canvasColor })
    .toColorspace('srgb')
    .jpeg({ quality: JPEG_QUALITY, chromaSubsampling: '4:4:4', mozjpeg: true })
    .toBuffer();
}

export interface RenditionResult {
  /** Public URL Meta will fetch. */
  url: string;
  /** Storage object path, retained for cleanup and GC. */
  path: string;
}

/**
 * Marks the generated card's object. A card render can fail without failing the
 * post, so "slide 0" is not by itself proof the card is there — the filename is
 * what lets the review UI label the slide honestly.
 */
export const INSTAGRAM_CARD_SLIDE_MARKER = 'card';

function renditionPath(
  prefix: string,
  productId: string,
  slideId: number | typeof INSTAGRAM_CARD_SLIDE_MARKER,
  contentHash: string,
): string {
  // Content hash in the filename makes re-preparing a product produce a new
  // object rather than fighting CDN caching on a reused path.
  const safeProductId = productId.replace(/[^A-Za-z0-9_-]/g, '_');
  return `${prefix}/${safeProductId}/${slideId}-${contentHash}.jpg`;
}

/** Whether a stored rendition path is the generated card rather than a photo. */
export function isCardRenditionPath(path: string): boolean {
  return new RegExp(`/${INSTAGRAM_CARD_SLIDE_MARKER}-[0-9a-f]+\\.jpg$`).test(path);
}

async function uploadRendition(
  service: SupabaseClient,
  prefix: string,
  productId: string,
  slideId: number | typeof INSTAGRAM_CARD_SLIDE_MARKER,
  jpeg: Buffer,
): Promise<RenditionResult> {
  const hash = crypto.createHash('sha256').update(jpeg).digest('hex').slice(0, 12);
  const path = renditionPath(prefix, productId, slideId, hash);

  const { error } = await service.storage.from(PRODUCT_IMAGES_BUCKET).upload(path, jpeg, {
    contentType: 'image/jpeg',
    // Renditions are content-addressed, so they can be cached hard.
    cacheControl: '31536000',
    upsert: true,
  });
  if (error) throw new Error(`Could not upload the Instagram rendition: ${error.message}`);

  const { data } = service.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) {
    throw new Error('Could not resolve a public URL for the Instagram rendition.');
  }
  return { url: data.publicUrl, path };
}

export interface BuiltRenditions {
  renditions: RenditionResult[];
  /** Non-fatal notes for the operator (currently: the card was skipped). */
  warnings: string[];
}

/**
 * Build and upload square JPEG renditions for a post, in carousel order.
 * Returns public URLs ready to hand to Instagram's container endpoints.
 *
 * Slide 0 is the generated ad card, built from the card-source image (default:
 * the lineup cover). It is part of the pipeline rather than an option, which is
 * why `buildInstagramPost` caps photos at INSTAGRAM_MAX_PHOTO_ITEMS — the count
 * reviewed in the preview is the count that publishes. The card REPLACES its
 * source photo in the slides (the photo is composited full-bleed inside the
 * card, so posting the standalone copy too duplicated it); a single-photo
 * product therefore prepares as one card-only slide, which the publish paths
 * handle via their single-image branch.
 *
 * A card failure is NOT fatal. The photos and caption are the substance of a
 * post; the card is presentation, so a broken font path or an odd source image
 * degrades to a card-less carousel with a warning rather than blocking the
 * post. (Contrast the fail-closed rule on price, which exists because a
 * published caption is a durable public claim — a missing decorative slide
 * claims nothing.) The operator sees the prepared slides before publishing, so
 * a skipped card cannot slip out unnoticed.
 *
 * Crops are keyed by source URL and applied before squaring, so a crop follows
 * its image through a reorder.
 */
export async function buildRenditions(params: {
  service: SupabaseClient;
  productId: string;
  imageUrls: string[];
  crops?: Record<string, NormalizedRect> | null;
  card: CardContent;
  /**
   * Product image the card is built from. Defaults to the lineup's first
   * image; the admin can pick any other product photo in the panel (stored per
   * channel as card_source_url).
   */
  cardSourceUrl?: string | null;
  /** Hex background override for the card; null = auto-detect. */
  cardBackground?: string | null;
  /**
   * Storage prefix for the uploaded objects. Facebook passes its own prefix so
   * the two channels never share objects — sharing would let one channel's
   * re-prepare delete files the other still references. Any new prefix must
   * also join the Storage GC reference scan.
   */
  pathPrefix?: string;
}): Promise<BuiltRenditions> {
  const { service, productId, imageUrls, crops, card } = params;
  const prefix = params.pathPrefix ?? INSTAGRAM_RENDITION_PREFIX;
  const renditions: RenditionResult[] = [];
  const warnings: string[] = [];

  // Set only when the card actually rendered. The card composites its source
  // photo full-bleed, so once it leads the post the standalone copy of that
  // photo is dropped from the slides — the same image twice in one carousel
  // read as a mistake (owner, 2026-08-01). If the card fails, every photo
  // stays, including the would-be source.
  let renderedCardSource: string | null = null;

  if (imageUrls.length) {
    const coverUrl = params.cardSourceUrl ?? imageUrls[0];
    try {
      const coverBytes = await fetchImageBytes(coverUrl);
      const { jpeg } = await renderInstagramCard({
        source: coverBytes,
        content: card,
        // `undefined` lets the card auto-propose a crop; a stored crop wins.
        crop: crops?.[coverUrl],
        background: params.cardBackground,
      });
      renditions.push(
        await uploadRendition(service, prefix, productId, INSTAGRAM_CARD_SLIDE_MARKER, jpeg),
      );
      renderedCardSource = coverUrl;
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown error';
      console.error('Lead card render failed:', reason);
      warnings.push(`The lead card could not be generated (${reason}); this post will use its photos only.`);
    }
  }

  for (const [index, sourceUrl] of imageUrls.entries()) {
    if (sourceUrl === renderedCardSource) continue;
    const bytes = await fetchImageBytes(sourceUrl);
    const crop = crops?.[sourceUrl];
    const prepared = crop ? await applyCropRect(bytes, crop) : bytes;
    const jpeg = await renderSquareJpeg(prepared);
    renditions.push(await uploadRendition(service, prefix, productId, index, jpeg));
  }

  return { renditions, warnings };
}

/**
 * Delete rendition objects. Best-effort: a failure here must never block the
 * caller (the objects are orphans at worst, and the Storage GC sweep will
 * surface them).
 */
export async function deleteRenditions(
  service: SupabaseClient,
  paths: string[],
): Promise<void> {
  if (!paths.length) return;
  const { error } = await service.storage.from(PRODUCT_IMAGES_BUCKET).remove(paths);
  if (error) console.error('Instagram rendition cleanup failed:', error.message);
}
