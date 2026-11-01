import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import React from 'react';
import sharp from 'sharp';
import { ImageResponse } from 'next/og';
import {
  analyzeImage,
  applyCropRect,
  detectBorderBackdrop,
  toHexColor,
  type Backdrop,
  type NormalizedRect,
} from './backdrop';

/**
 * Generated "ad card" — an optional designed first slide for a carousel.
 *
 * The product is never redrawn, only cropped, scaled and placed, so the piece
 * in the card is pixel-identical to the listing photo. Nothing here is
 * generative; there is no model that could alter a gemstone or invent a hallmark.
 *
 * The design rests on one decision: the card's background is the PHOTO'S OWN
 * backdrop colour, sampled from its corners. An earlier attempt cut the product
 * out and dropped it on a fixed black card, which meant separating the studio
 * drop shadow (near-neutral, only ~10-35 luminance below the sweep) from real
 * dark detail like the crevices between links — per-image threshold tuning that
 * punched holes through polished metal and failed outright on sterling against
 * cream. Matching the backdrop deletes the problem: the shadow lands on the
 * surface it was cast on, no matte is needed, and the same code path serves the
 * cream sweep and the black one (109 vs 19 covers as of 2026-08-01).
 *
 * Rendering is split by strength. sharp does the pixel work; Satori (via
 * next/og) does the type, because it takes font buffers directly and therefore
 * works on a serverless runtime with no system fonts installed — sharp's SVG
 * text goes through fontconfig, which on Netlify's image has nothing to find.
 */

const CARD_PX = 1080;
/** Vertical band the photo is placed within, leaving room for the type block. */
const WELL_TOP_PX = 152;
const WELL_HEIGHT_PX = 588;
const WELL_WIDTH_RATIO = 0.86;
const WELL_WIDTH_PX = Math.round(CARD_PX * WELL_WIDTH_RATIO);
/** Alpha ramp at the photo's edge, as a fraction of its shorter side. */
const FEATHER_RATIO = 0.06;

const FONT_DIR = path.join(process.cwd(), 'src', 'assets', 'fonts');

export interface CardContent {
  title: string;
  /** Pre-formatted, e.g. "$5,111". Omitted when the caption omits a price. */
  price?: string | null;
  /** Pre-formatted spec line, e.g. "14K YELLOW GOLD · 53.91G · 7.75 IN". */
  specs?: string | null;
  /** Small qualifier under the price, e.g. "Price at time of posting · $4,044/oz gold spot". */
  priceNote?: string | null;
  brandMark?: string;
}

interface LoadedFonts {
  caslonRegular: Buffer;
  caslonBold: Buffer;
  hankenMedium: Buffer;
  hankenSemiBold: Buffer;
}

let fontsPromise: Promise<LoadedFonts> | null = null;

/**
 * Brand faces, vendored as OFL static TTFs (see src/assets/fonts). They are
 * read from disk rather than fetched so a card never depends on the network,
 * and cached for the life of the lambda because a cold read is ~290KB.
 *
 * STATIC instances specifically: Satori's bundled opentype parser throws on a
 * variable font's `fvar` table ("Cannot read properties of undefined (reading
 * '256')"), so the single-file `Family[wght].ttf` builds Google ships on GitHub
 * cannot be used here. One file per weight is the working form.
 *
 * next.config.ts must keep these in `outputFileTracingIncludes`, or the build
 * will drop them from the serverless bundle and every card will fail at render.
 */
async function loadFonts(): Promise<LoadedFonts> {
  if (!fontsPromise) {
    fontsPromise = Promise.all([
      readFile(path.join(FONT_DIR, 'LibreCaslonText-Regular.ttf')),
      readFile(path.join(FONT_DIR, 'LibreCaslonText-Bold.ttf')),
      readFile(path.join(FONT_DIR, 'HankenGrotesk-Medium.ttf')),
      readFile(path.join(FONT_DIR, 'HankenGrotesk-SemiBold.ttf')),
    ])
      .then(([caslonRegular, caslonBold, hankenMedium, hankenSemiBold]) => ({
        caslonRegular,
        caslonBold,
        hankenMedium,
        hankenSemiBold,
      }))
      .catch((err) => {
        // Reset so a transient failure does not poison every later render.
        fontsPromise = null;
        throw new Error(
          `Could not load the card fonts from ${FONT_DIR}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }
  return fontsPromise;
}

interface Palette {
  background: string;
  vignette: string;
  accent: string;
  /** Secondary type: brand mark, spec line, price note. */
  subtle: string;
  text: string;
  borderOpacity: number;
}

function buildPalette(backdrop: Backdrop): Palette {
  const dark = backdrop.isDark;
  const shade = (factor: number) =>
    toHexColor(
      backdrop.rgb.map((v) => Math.max(0, Math.min(255, Math.round(v * factor)))) as [
        number,
        number,
        number,
      ],
    );
  return {
    background: toHexColor(backdrop.rgb),
    // Barely-there falloff so the card reads as designed rather than as a bare
    // photo. Kept subtle on light backdrops because the seam where the photo
    // meets the card would otherwise become visible (measured: 1-4 levels).
    vignette: shade(dark ? 0.62 : 0.94),
    // The bright brand gold only works on dark cards; on cream/white it reads
    // washed-out (owner, 2026-08-01), so light cards use a deeper bronze for
    // the price/divider and a warm charcoal for the small type.
    accent: dark ? '#d6b872' : '#7e6222',
    subtle: dark ? '#d6b872' : '#6a5e4e',
    text: dark ? '#f2ece1' : '#1c1815',
    borderOpacity: dark ? 0.28 : 0.4,
  };
}

/** "#fbf8f3" (with or without the #) -> [251, 248, 243]; null when invalid. */
function parseHexColor(value: string | null | undefined): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(value ?? '');
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A Backdrop for an explicitly chosen colour — bypasses detection entirely. */
function syntheticBackdrop(rgb: [number, number, number]): Backdrop {
  const luminance = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  return { rgb, spread: 0, uniform: true, luminance, isDark: luminance < 128 };
}

/**
 * Ramp alpha to zero around the photo's edge.
 *
 * A crop that sits on bare backdrop needs no help — the card is that same
 * colour, so the join is already invisible, and this is a no-op. It matters for
 * any TIGHTER crop, auto-proposed or dragged by an operator, which necessarily
 * cuts through whatever the piece rests on: the black velvet bust reads
 * rgb(3,3,3) against a rgb(0,0,0) card, and three levels along a long straight
 * edge is enough to show a rectangle. Fading the cut removes it, which is what
 * makes an arbitrary crop safe.
 */
async function featherEdges(image: Buffer, width: number, height: number): Promise<Buffer> {
  const feather = Math.round(Math.min(width, height) * FEATHER_RATIO);
  if (feather < 1) return image;

  const { data } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const edgeDistance = Math.min(x, y, width - 1 - x, height - 1 - y);
      if (edgeDistance >= feather) continue;
      const t = edgeDistance / feather;
      // smoothstep: a linear ramp leaves a visible kink where it reaches full
      // opacity, which is exactly the artifact this is meant to remove.
      const alpha = t * t * (3 - 2 * t);
      const i = (y * width + x) * 4;
      data[i + 3] = Math.round(data[i + 3] * alpha);
    }
  }

  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

/** Backdrop-coloured canvas with the (already cropped) photo in the well. */
async function renderPhotoLayer(cropped: Buffer, palette: Palette): Promise<Buffer> {
  const scaled = await sharp(cropped)
    .resize({
      width: Math.round(CARD_PX * WELL_WIDTH_RATIO),
      height: WELL_HEIGHT_PX,
      fit: 'inside',
      withoutEnlargement: false,
    })
    .toBuffer();
  const meta = await sharp(scaled).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new Error('The source image could not be scaled for the card.');

  const feathered = await featherEdges(scaled, width, height);

  const backgroundSvg = Buffer.from(
    `<svg width="${CARD_PX}" height="${CARD_PX}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="bg" cx="50%" cy="40%" r="78%">
          <stop offset="0%" stop-color="${palette.background}"/>
          <stop offset="55%" stop-color="${palette.background}"/>
          <stop offset="100%" stop-color="${palette.vignette}"/>
        </radialGradient>
      </defs>
      <rect width="${CARD_PX}" height="${CARD_PX}" fill="url(#bg)"/>
    </svg>`,
  );

  return sharp(backgroundSvg)
    .composite([
      {
        input: feathered,
        left: Math.round((CARD_PX - width) / 2),
        top: Math.round(WELL_TOP_PX + (WELL_HEIGHT_PX - height) / 2),
      },
    ])
    .png()
    .toBuffer();
}

/** Split a title across two lines at the nearest word boundary to the middle. */
export function splitTitleLines(title: string): [string, string] {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [words[0] ?? '', ''];

  // Balance by character count, not word count: "David Yurman Sterling & 14K
  // Articulated Bangle" splits badly on a naive midpoint.
  const total = words.join(' ').length;
  let best = 1;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (let i = 1; i < words.length; i += 1) {
    const head = words.slice(0, i).join(' ').length;
    const delta = Math.abs(head - (total - head));
    if (delta < bestDelta) {
      bestDelta = delta;
      best = i;
    }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}

const textNode = (
  content: string,
  style: React.CSSProperties,
): React.ReactElement | null =>
  content ? React.createElement('div', { style: { display: 'flex', ...style } }, content) : null;

/**
 * Transparent overlay carrying the border rule and all type.
 *
 * Satori only implements flexbox, so every container is explicitly `display:
 * flex`; absolute positioning is used to hold the exact vertical rhythm rather
 * than relying on flow.
 */
async function renderTextLayer(content: CardContent, palette: Palette): Promise<Buffer> {
  const fonts = await loadFonts();
  const [line1, line2] = splitTitleLines(content.title);
  // The domain rather than the bare name (owner decision 2026-08-01): the card
  // is the feed thumbnail, and on channels where links are dead text this line
  // is the only way the card itself tells people where to buy.
  const brandMark = content.brandMark ?? 'NAPLESESTATEJEWELRY.COM';

  const element = React.createElement(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: CARD_PX,
        height: CARD_PX,
        position: 'relative',
        backgroundColor: 'transparent',
      },
    },
    // Border rule.
    React.createElement('div', {
      style: {
        position: 'absolute',
        left: 26,
        top: 26,
        width: CARD_PX - 52 - 2,
        height: CARD_PX - 52 - 2,
        border: `1px solid ${palette.accent}`,
        opacity: palette.borderOpacity,
      },
    }),
    textNode(brandMark, {
      position: 'absolute',
      top: 84,
      width: '100%',
      justifyContent: 'center',
      color: palette.subtle,
      fontFamily: 'Hanken',
      fontSize: 19,
      fontWeight: 600,
      letterSpacing: 7.5,
      // Letter-spacing is applied after each glyph including the last, which
      // shifts a centred line left by one space. Nudge it back.
      paddingLeft: 7.5,
    }),
    textNode('NOW AVAILABLE', {
      position: 'absolute',
      top: 768,
      width: '100%',
      justifyContent: 'center',
      color: palette.accent,
      fontFamily: 'Hanken',
      fontSize: 15,
      fontWeight: 600,
      letterSpacing: 4.2,
      // Keep true optical centering after Satori spaces the final glyph.
      paddingLeft: 4.2,
      opacity: 0.9,
    }),
    textNode(line1, {
      position: 'absolute',
      top: 800,
      width: '100%',
      justifyContent: 'center',
      color: palette.text,
      fontFamily: 'Caslon',
      fontSize: 43,
    }),
    textNode(line2, {
      position: 'absolute',
      top: 848,
      width: '100%',
      justifyContent: 'center',
      color: palette.text,
      fontFamily: 'Caslon',
      fontSize: 43,
    }),
    textNode(content.specs ?? '', {
      position: 'absolute',
      top: 918,
      width: '100%',
      justifyContent: 'center',
      color: palette.subtle,
      fontFamily: 'Hanken',
      fontSize: 20,
      fontWeight: 500,
      letterSpacing: 2.6,
      paddingLeft: 2.6,
      opacity: 0.9,
    }),
    content.price
      ? React.createElement('div', {
          style: {
            position: 'absolute',
            top: 964,
            left: CARD_PX / 2 - 54,
            width: 108,
            height: 1,
            backgroundColor: palette.accent,
            opacity: 0.45,
          },
        })
      : null,
    textNode(content.price ?? '', {
      position: 'absolute',
      top: 986,
      width: '100%',
      justifyContent: 'center',
      color: palette.accent,
      fontFamily: 'Caslon',
      fontSize: 40,
      fontWeight: 700,
    }),
    // Small qualifier under the price ("PRICE AT TIME OF POSTING · $4,044/OZ
    // GOLD SPOT"). Sized to clear the border rule at the card's bottom inset.
    textNode(content.price && content.priceNote ? content.priceNote.toUpperCase() : '', {
      position: 'absolute',
      top: 1033,
      width: '100%',
      justifyContent: 'center',
      color: palette.subtle,
      fontFamily: 'Hanken',
      fontSize: 12,
      fontWeight: 500,
      letterSpacing: 1.6,
      paddingLeft: 1.6,
      opacity: 0.85,
    }),
  );

  const response = new ImageResponse(element, {
    width: CARD_PX,
    height: CARD_PX,
    fonts: [
      { name: 'Caslon', data: fonts.caslonRegular, weight: 400, style: 'normal' },
      { name: 'Caslon', data: fonts.caslonBold, weight: 700, style: 'normal' },
      { name: 'Hanken', data: fonts.hankenMedium, weight: 500, style: 'normal' },
      { name: 'Hanken', data: fonts.hankenSemiBold, weight: 600, style: 'normal' },
    ],
  });

  return Buffer.from(await response.arrayBuffer());
}

/**
 * Discard an AUTO-proposed crop that the photo well would have to enlarge.
 *
 * The auto-crop is advisory composition, and composition never justifies
 * upscaling: enlarging a tight crop to fill the well is exactly what made a
 * card read zoomed-in and blurry (owner-reported 2026-08-01, small-subject
 * ring photo). `renderPhotoLayer` fits the crop inside WELL_WIDTH_PX ×
 * WELL_HEIGHT_PX, so enlargement happens only when the region is smaller than
 * the well on BOTH axes — in that case the full frame is used instead, which
 * always carries at least as many source pixels. Operator-set crops are exempt
 * on purpose: they are a deliberate choice made against a live preview.
 */
async function guardProposedCrop(
  source: Buffer,
  rect: NormalizedRect | null,
): Promise<NormalizedRect | null> {
  if (!rect) return null;
  const meta = await sharp(source).metadata();
  if (!meta.width || !meta.height) return rect;
  const regionW = rect.w * meta.width;
  const regionH = rect.h * meta.height;
  return regionW < WELL_WIDTH_PX && regionH < WELL_HEIGHT_PX ? null : rect;
}

export interface RenderedCard {
  jpeg: Buffer;
  backdrop: Backdrop;
  /** The crop actually used, so callers can persist an auto-proposed one. */
  crop: NormalizedRect | null;
}

/**
 * Render the card.
 *
 * `crop` overrides the automatic proposal — that is the operator's manual crop.
 * Passing `null` explicitly still means "auto"; pass a full-frame rect to force
 * no cropping. The automatic proposal is dropped in favour of the full frame
 * whenever honouring it would mean upscaling (guardProposedCrop).
 *
 * `background` is an optional hex override the admin picked; without it the
 * card colour is detected from the CROPPED region — the backdrop immediately
 * around the product — not the full frame's corners. Studio photos have
 * lighting falloff (cream corners, near-white behind the piece), and corner
 * sampling painted a cream card around a white patch (owner-reported
 * 2026-08-01).
 */
export async function renderInstagramCard(params: {
  source: Buffer;
  content: CardContent;
  crop?: NormalizedRect | null;
  background?: string | null;
}): Promise<RenderedCard> {
  const { source, content } = params;
  const analysis = await analyzeImage(source);
  const crop =
    params.crop != null
      ? params.crop
      : await guardProposedCrop(source, analysis.rect);
  const cropped = crop ? await applyCropRect(source, crop) : source;

  const override = parseHexColor(params.background);
  // Border-median of the region actually composited — corner sampling fails
  // both on lighting falloff (full frame) and on shadow-touching crop corners.
  const backdrop = override ? syntheticBackdrop(override) : await detectBorderBackdrop(cropped);
  const palette = buildPalette(backdrop);

  const [photoLayer, textLayer] = await Promise.all([
    renderPhotoLayer(cropped, palette),
    renderTextLayer(content, palette),
  ]);

  const jpeg = await sharp(photoLayer)
    .composite([{ input: textLayer, left: 0, top: 0 }])
    .toColorspace('srgb')
    .jpeg({ quality: 90, chromaSubsampling: '4:4:4', mozjpeg: true })
    .toBuffer();

  return { jpeg, backdrop, crop };
}
