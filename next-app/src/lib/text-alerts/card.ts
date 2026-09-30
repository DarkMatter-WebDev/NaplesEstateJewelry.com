import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import React from 'react';
import sharp from 'sharp';
import { ImageResponse } from 'next/og';
import { toOwnedBuffer } from '@/lib/product-image-encode';

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
      fontSize: Math.round(26 * unit),
      fontWeight: 500,
      letterSpacing: Math.round(3 * unit),
      textShadow: '0 1px 8px rgba(0,0,0,0.7)',
    }),
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
export async function renderDealCard(photo: Buffer, content: DealCardContent): Promise<RenderedDealCard> {
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
  if (jpeg.byteLength > DEAL_CARD_TARGET_BYTES) {
    jpeg = toOwnedBuffer(await composed.clone().jpeg({ quality: 70, mozjpeg: true }).toBuffer());
  }
  let outWidth = width;
  let outHeight = height;
  if (jpeg.byteLength > DEAL_CARD_TARGET_BYTES) {
    const shrunk = sharp(jpeg).resize(Math.round(width * 0.8));
    jpeg = toOwnedBuffer(await shrunk.jpeg({ quality: 70, mozjpeg: true }).toBuffer());
    const m = await sharp(jpeg).metadata();
    outWidth = m.width ?? outWidth;
    outHeight = m.height ?? outHeight;
  }
  return { jpeg, width: outWidth, height: outHeight, bytes: jpeg.byteLength };
}
