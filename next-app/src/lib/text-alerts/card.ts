import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import React from 'react';
import sharp from 'sharp';
import { ImageResponse } from 'next/og';
import { toOwnedBuffer } from '@/lib/product-image-encode';
import { dealLineFontSize } from './deal-photos';

/**
 * The text-deal picture: the owner's phone photo with the price drawn on it
 * (owner, 2026-09-15: "informal photos with price overlay … from within
 * admin"). A smaller cousin of the Instagram ad card (`lib/instagram/card.ts`):
 * the photo is only resized, never redrawn; sharp does the pixels and Satori
 * (next/og) sets the type from the vendored brand faces, because Netlify's
 * runtime has no system fonts.
 *
 * Output is a JPEG at most 1080 px wide and kept under ~600 KB, because
 * carriers deliver small pictures reliably and shrink or drop big ones.
 *
 * next.config.ts must trace `src/assets/fonts/**` into
 * `/api/admin/text-deals/**` or the render fails at runtime with ENOENT.
 */
const FONT_DIR = path.join(process.cwd(), 'src', 'assets', 'fonts');
export const DEAL_CARD_MAX_WIDTH = 1080;
export const DEAL_CARD_MAX_HEIGHT = 1350;
/** Above this the picture is re-encoded harder, then shrunk. */
export const DEAL_CARD_TARGET_BYTES = 600_000;

type Fonts = { caslonBold: Buffer; hankenMedium: Buffer; hankenSemiBold: Buffer };
let fontsPromise: Promise<Fonts> | null = null;

function loadFonts(): Promise<Fonts> {
  if (!fontsPromise) {
    fontsPromise = Promise.all([
      readFile(path.join(FONT_DIR, 'LibreCaslonText-Bold.ttf')),
      readFile(path.join(FONT_DIR, 'HankenGrotesk-Medium.ttf')),
      readFile(path.join(FONT_DIR, 'HankenGrotesk-SemiBold.ttf')),
    ])
      .then(([caslonBold, hankenMedium, hankenSemiBold]) => ({ caslonBold, hankenMedium, hankenSemiBold }))
      .catch((err) => {
        fontsPromise = null;
        throw new Error(`Could not load the deal card fonts from ${FONT_DIR}: ${err instanceof Error ? err.message : String(err)}`);
      });
  }
  return fontsPromise;
}

export interface DealCardContent {
  /** Pre-formatted price, e.g. "$1,460". */
  price: string;
  /** The one line, e.g. "14K rope chain · 22 in · 18.4 g". */
  line: string;
  brandMark?: string;
  badge?: string;
  /** "Photo 2 of 5" — a small gold tag at the right end of the price row; absent on a one-photo deal. */
  counter?: string | null;
}

/**
 * The counter tag, drawn the same way on the main picture and on the detail
 * strip. ⛔ Written as given — "Photo 5 of 5", NOT capitals (owner,
 * 2026-10-07: 'use "Photo" instead of "PHOTO"'), unlike every other word on
 * the pictures.
 */
function counterNode(text: string, unit: number, fontSize: number, place: React.CSSProperties = {}) {
  return node(text, {
    padding: `${Math.round(7.5 * unit)}px ${Math.round(16 * unit)}px`,
    borderRadius: Math.round(999 * unit),
    backgroundColor: '#e9c349',
    color: '#171717',
    fontFamily: 'Hanken',
    fontSize: Math.round(fontSize * unit),
    fontWeight: 600,
    letterSpacing: Math.round(1 * unit),
    whiteSpace: 'nowrap',
    ...place,
  });
}

const node = (children: React.ReactNode, style: React.CSSProperties) =>
  React.createElement('div', { style: { display: 'flex', ...style } }, children);

async function renderTextLayer(width: number, height: number, content: DealCardContent): Promise<Buffer> {
  const fonts = await loadFonts();
  // Type scales with the picture's width so a 1080 and a 720 render read the same.
  const unit = width / 1080;
  const bandHeight = Math.round(height * 0.3);
  const element = React.createElement(
    'div',
    { style: { display: 'flex', width, height, position: 'relative', backgroundColor: 'transparent' } },
    // Dark band at the foot for the price and the line.
    node(null, {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: bandHeight,
      backgroundImage: 'linear-gradient(to top, rgba(0,0,0,0.82), rgba(0,0,0,0))',
    }),
    node((content.brandMark ?? 'NAPLES ESTATE JEWELRY').toUpperCase(), {
      position: 'absolute',
      left: Math.round(36 * unit),
      top: Math.round(30 * unit),
      color: '#e9c349',
      fontFamily: 'Hanken',
      fontSize: Math.round(22 * unit),
      fontWeight: 600,
      letterSpacing: Math.round(5 * unit),
      textShadow: '0 1px 8px rgba(0,0,0,0.7)',
    }),
    content.badge
      ? node(content.badge.toUpperCase(), {
          position: 'absolute',
          right: Math.round(36 * unit),
          top: Math.round(26 * unit),
          padding: `${Math.round(8 * unit)}px ${Math.round(16 * unit)}px`,
          borderRadius: Math.round(999 * unit),
          backgroundColor: '#e9c349',
          color: '#171717',
          fontFamily: 'Hanken',
          fontSize: Math.round(18 * unit),
          fontWeight: 600,
          letterSpacing: Math.round(3 * unit),
        })
      : null,
    node(content.price, {
      position: 'absolute',
      left: Math.round(36 * unit),
      bottom: Math.round(84 * unit),
      color: '#e9c349',
      fontFamily: 'Caslon',
      fontSize: Math.round(92 * unit),
      fontWeight: 700,
      textShadow: '0 2px 14px rgba(0,0,0,0.6)',
    }),
    node(content.line.toUpperCase(), {
      position: 'absolute',
      left: Math.round(36 * unit),
      right: Math.round(36 * unit),
      bottom: Math.round(40 * unit),
      color: '#ffffff',
      fontFamily: 'Hanken',
      // 26 px, or smaller when the line is too long for one row (it must not wrap over the price).
      fontSize: Math.round(dealLineFontSize(content.line, 26, 3) * unit),
      fontWeight: 500,
      letterSpacing: Math.round(3 * unit),
      textShadow: '0 1px 8px rgba(0,0,0,0.7)',
    }),
    // "Photo 1 of 5": the right end of the price row, the one spot free on this picture.
    content.counter
      ? counterNode(content.counter, unit, 25, { position: 'absolute', right: Math.round(36 * unit), bottom: Math.round(95 * unit) })
      : null,
  );

  const response = new ImageResponse(element, {
    width,
    height,
    fonts: [
      { name: 'Caslon', data: fonts.caslonBold, weight: 700, style: 'normal' },
      { name: 'Hanken', data: fonts.hankenMedium, weight: 500, style: 'normal' },
      { name: 'Hanken', data: fonts.hankenSemiBold, weight: 600, style: 'normal' },
    ],
  });
  return Buffer.from(await response.arrayBuffer());
}

export interface RenderedDealCard {
  jpeg: Buffer<ArrayBuffer>;
  width: number;
  height: number;
  bytes: number;
}

/**
 * Photo (any sharp-readable bytes, EXIF-oriented) → the deal picture.
 * Fits inside 1080 × 1350 without enlarging; the type layer is rendered at
 * the resulting size, so nothing is stretched.
 */
export async function renderDealCard(photo: Buffer, content: DealCardContent, targetBytes = DEAL_CARD_TARGET_BYTES): Promise<RenderedDealCard> {
  const fitted = await sharp(photo)
    .rotate()
    .resize(DEAL_CARD_MAX_WIDTH, DEAL_CARD_MAX_HEIGHT, { fit: 'inside', withoutEnlargement: true })
    .toColorspace('srgb')
    .removeAlpha()
    .png()
    .toBuffer();
  const meta = await sharp(fitted).metadata();
  const width = meta.width ?? DEAL_CARD_MAX_WIDTH;
  const height = meta.height ?? DEAL_CARD_MAX_HEIGHT;

  const textLayer = await renderTextLayer(width, height, content);
  const composed = sharp(fitted).composite([{ input: textLayer, left: 0, top: 0 }]);

  let jpeg = toOwnedBuffer(await composed.clone().jpeg({ quality: 82, mozjpeg: true }).toBuffer());
  if (jpeg.byteLength > targetBytes) {
    jpeg = toOwnedBuffer(await composed.clone().jpeg({ quality: 70, mozjpeg: true }).toBuffer());
  }
  let outWidth = width;
  let outHeight = height;
  if (jpeg.byteLength > targetBytes) {
    const shrunk = sharp(jpeg).resize(Math.round(width * 0.8));
    jpeg = toOwnedBuffer(await shrunk.jpeg({ quality: 70, mozjpeg: true }).toBuffer());
    const m = await sharp(jpeg).metadata();
    outWidth = m.width ?? outWidth;
    outHeight = m.height ?? outHeight;
  }
  return { jpeg, width: outWidth, height: outHeight, bytes: jpeg.byteLength };
}

/** Tried in order until a detail shot fits its byte target; the last one is kept regardless. */
const DETAIL_STEPS = [
  { scale: 1, quality: 80 },
  { scale: 1, quality: 68 },
  { scale: 0.8, quality: 68 },
  { scale: 0.65, quality: 64 },
] as const;

/**
 * The small price strip on a detail shot (owner, 2026-10-07, "option a, price
 * and the one line"): the main picture's soft dark fade, shorter, with a
 * smaller price and the line — no brand mark, no badge, so the detail stays
 * the subject. The price sits ABOVE the line in one bottom-anchored column, so
 * a long line that wraps pushes the price up instead of running over it. The
 * "Photo 3 of 5" tag shares the price's row, at its right end.
 */
type DealStripContent = Pick<DealCardContent, 'price' | 'line' | 'counter'>;

async function renderStripLayer(width: number, height: number, content: DealStripContent): Promise<Buffer> {
  const fonts = await loadFonts();
  const unit = width / 1080;
  const fadeHeight = Math.min(height, Math.max(Math.round(height * 0.2), Math.round(170 * unit)));
  const element = React.createElement(
    'div',
    { style: { display: 'flex', width, height, position: 'relative', backgroundColor: 'transparent' } },
    node(null, {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: fadeHeight,
      backgroundImage: 'linear-gradient(to top, rgba(0,0,0,0.82), rgba(0,0,0,0))',
    }),
    React.createElement(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          left: Math.round(36 * unit),
          right: Math.round(36 * unit),
          bottom: Math.round(26 * unit),
        },
      },
      React.createElement(
        'div',
        { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
        node(content.price, {
          color: '#e9c349',
          fontFamily: 'Caslon',
          fontSize: Math.round(54 * unit),
          fontWeight: 700,
          lineHeight: 1.1,
          textShadow: '0 2px 14px rgba(0,0,0,0.6)',
        }),
        content.counter ? counterNode(content.counter, unit, 23) : null,
      ),
      node(content.line.toUpperCase(), {
        marginTop: Math.round(6 * unit),
        color: '#ffffff',
        fontFamily: 'Hanken',
        fontSize: Math.round(dealLineFontSize(content.line, 20, 2.6) * unit),
        fontWeight: 500,
        letterSpacing: Math.round(2.6 * unit),
        textShadow: '0 1px 8px rgba(0,0,0,0.7)',
      }),
    ),
  );
  const response = new ImageResponse(element, {
    width,
    height,
    fonts: [
      { name: 'Caslon', data: fonts.caslonBold, weight: 700, style: 'normal' },
      { name: 'Hanken', data: fonts.hankenMedium, weight: 500, style: 'normal' },
      { name: 'Hanken', data: fonts.hankenSemiBold, weight: 600, style: 'normal' },
    ],
  });
  return Buffer.from(await response.arrayBuffer());
}

/**
 * A detail shot (owner, 2026-10-07): the photo resized, keeping its own
 * shape, with the small price strip at its foot. The strip is there because
 * phones show the pictures of one text in a RANDOM order (the owner's first
 * test: the price picture came second on one phone and last on another) — so
 * every picture has to carry the price. Same 1080 × 1350 box as the main
 * picture, JPEG because carriers do not reliably take WebP, and stepped down
 * until it fits its share of the message.
 */
export async function renderDealDetail(photo: Buffer, content: DealStripContent, targetBytes: number): Promise<RenderedDealCard> {
  const resized = await sharp(photo)
    .rotate()
    .resize(DEAL_CARD_MAX_WIDTH, DEAL_CARD_MAX_HEIGHT, { fit: 'inside', withoutEnlargement: true })
    .toColorspace('srgb')
    .flatten({ background: '#ffffff' })
    .png()
    .toBuffer();
  const meta = await sharp(resized).metadata();
  const width = meta.width ?? DEAL_CARD_MAX_WIDTH;
  const stripLayer = await renderStripLayer(width, meta.height ?? DEAL_CARD_MAX_HEIGHT, content);
  const fitted = await sharp(resized).composite([{ input: stripLayer, left: 0, top: 0 }]).png().toBuffer();

  let jpeg: Buffer<ArrayBuffer> | null = null;
  for (const step of DETAIL_STEPS) {
    const base = step.scale === 1 ? sharp(fitted) : sharp(fitted).resize(Math.round(width * step.scale));
    jpeg = toOwnedBuffer(await base.jpeg({ quality: step.quality, mozjpeg: true }).toBuffer());
    if (jpeg.byteLength <= targetBytes) break;
  }
  if (!jpeg) throw new Error('Could not render the detail shot.');
  const out = await sharp(jpeg).metadata();
  return { jpeg, width: out.width ?? width, height: out.height ?? (meta.height ?? DEAL_CARD_MAX_HEIGHT), bytes: jpeg.byteLength };
}
