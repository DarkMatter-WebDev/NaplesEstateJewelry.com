import 'server-only';

import sharp from 'sharp';

/**
 * Studio-backdrop analysis for product photos.
 *
 * Every listing photo is shot on a uniform sweep — cream for most of the
 * catalog, black for the chains (measured 2026-08-01: 109 cream/white covers,
 * 19 black, 0 non-uniform across 128 products with images). Knowing that colour
 * turns several otherwise-fiddly problems into one-liners:
 *
 *   * Square padding can match the photo instead of assuming white, so a
 *     black-backdrop chain stops getting white bars down both sides.
 *   * A generated card can paint its background in the same colour, which makes
 *     the photo's own drop shadow land on the surface it was cast on. That
 *     removes the need to cut the product out at all — no alpha matte, no
 *     shadow/crevice threshold tuning, and no chance of eroding the product.
 *
 * Analysis runs on a downscaled copy: a uniform region stays uniform under a
 * good resampling kernel, so the colour is unchanged, but the per-pixel scans
 * get an order of magnitude cheaper and shrug off sensor noise. Results are
 * returned in normalized (0..1) coordinates so they stay valid against the
 * full-resolution original.
 */

/** Max per-channel corner disagreement still considered a single flat sweep. */
const UNIFORM_SPREAD_MAX = 12;
/** Longest edge used for analysis. */
const ANALYSIS_EDGE_PX = 800;
/** Corner patches are inset to dodge any encoder ringing at the frame edge. */
const CORNER_INSET_PX = 3;
const CORNER_PATCH_PX = 6;

export interface Backdrop {
  /** Mean corner colour, composited over white so transparency reads as white. */
  rgb: [number, number, number];
  /** Largest per-channel range across the four corners. Low means a flat sweep. */
  spread: number;
  /** Whether the four corners agree closely enough to treat as one colour. */
  uniform: boolean;
  luminance: number;
  isDark: boolean;
}

export interface NormalizedRect {
  /** All values are fractions of the source dimensions, in [0, 1]. */
  x: number;
  y: number;
  w: number;
  h: number;
}

interface RawImage {
  data: Buffer;
  width: number;
  height: number;
}

async function decodeForAnalysis(input: Buffer): Promise<RawImage> {
  const { data, info } = await sharp(input)
    .resize({
      width: ANALYSIS_EDGE_PX,
      height: ANALYSIS_EDGE_PX,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Mean colour of a patch, each pixel composited over white by its own alpha. */
function samplePatch(img: RawImage, x0: number, y0: number): [number, number, number] {
  const size = Math.max(1, Math.min(CORNER_PATCH_PX, img.width, img.height));
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = y0; y < y0 + size; y += 1) {
    for (let x = x0; x < x0 + size; x += 1) {
      const i = (y * img.width + x) * 4;
      const a = img.data[i + 3] / 255;
      r += img.data[i] * a + 255 * (1 - a);
      g += img.data[i + 1] * a + 255 * (1 - a);
      b += img.data[i + 2] * a + 255 * (1 - a);
      n += 1;
    }
  }
  return [r / n, g / n, b / n];
}

const luminanceOf = ([r, g, b]: [number, number, number]) => 0.299 * r + 0.587 * g + 0.114 * b;
const saturationOf = (r: number, g: number, b: number) =>
  Math.max(r, g, b) - Math.min(r, g, b);

function analyzeBackdrop(img: RawImage): Backdrop {
  const inset = Math.min(CORNER_INSET_PX, Math.max(0, Math.min(img.width, img.height) - CORNER_PATCH_PX));
  const far = (extent: number) => Math.max(0, extent - inset - CORNER_PATCH_PX);
  const corners: Array<[number, number, number]> = [
    samplePatch(img, inset, inset),
    samplePatch(img, far(img.width), inset),
    samplePatch(img, inset, far(img.height)),
    samplePatch(img, far(img.width), far(img.height)),
  ];

  const rgb = [0, 1, 2].map((c) =>
    Math.round(corners.reduce((sum, corner) => sum + corner[c], 0) / corners.length),
  ) as [number, number, number];
  const spread = Math.max(
    ...[0, 1, 2].map(
      (c) =>
        Math.max(...corners.map((corner) => corner[c])) -
        Math.min(...corners.map((corner) => corner[c])),
    ),
  );
  const luminance = luminanceOf(rgb);

  return {
    rgb,
    spread: Math.round(spread),
    uniform: spread <= UNIFORM_SPREAD_MAX,
    luminance,
    isDark: luminance < 128,
  };
}

export async function detectBackdrop(input: Buffer): Promise<Backdrop> {
  return analyzeBackdrop(await decodeForAnalysis(input));
}

/**
 * Backdrop colour as the per-channel MEDIAN of samples around the image's
 * border ring.
 *
 * Corner sampling breaks down on cropped regions: a content-box crop hugs the
 * product, so its corners routinely land on drop shadow or the piece itself
 * (measured: a uniform-cream photo sampled tan because two crop corners sat in
 * shadow). A median over the full perimeter treats those touches as the
 * outliers they are and lands on the dominant surrounding colour — which is
 * exactly what the generated card must match.
 */
export async function detectBorderBackdrop(input: Buffer): Promise<Backdrop> {
  const img = await decodeForAnalysis(input);
  const inset = Math.max(2, Math.round(Math.min(img.width, img.height) * 0.02));

  const samples: Array<[number, number, number]> = [];
  const sampleAt = (x: number, y: number) => {
    const cx = Math.min(Math.max(x, 0), img.width - 1);
    const cy = Math.min(Math.max(y, 0), img.height - 1);
    const i = (cy * img.width + cx) * 4;
    const a = img.data[i + 3] / 255;
    samples.push([
      img.data[i] * a + 255 * (1 - a),
      img.data[i + 1] * a + 255 * (1 - a),
      img.data[i + 2] * a + 255 * (1 - a),
    ]);
  };

  const STEPS = 16;
  for (let s = 0; s < STEPS; s += 1) {
    const tx = inset + Math.round(((img.width - 2 * inset) * s) / (STEPS - 1));
    const ty = inset + Math.round(((img.height - 2 * inset) * s) / (STEPS - 1));
    sampleAt(tx, inset); // top edge
    sampleAt(tx, img.height - 1 - inset); // bottom edge
    sampleAt(inset, ty); // left edge
    sampleAt(img.width - 1 - inset, ty); // right edge
  }

  const channel = (c: number) => samples.map((s) => s[c]).sort((a, b) => a - b);
  const rgbChannels = [channel(0), channel(1), channel(2)];
  const at = (sorted: number[], q: number) => sorted[Math.floor(sorted.length * q)];
  const rgb = rgbChannels.map((sorted) => Math.round(at(sorted, 0.5))) as [number, number, number];
  // Interquartile range as the uniformity measure — immune to the same
  // outliers the median ignores.
  const spread = Math.round(
    Math.max(...rgbChannels.map((sorted) => at(sorted, 0.75) - at(sorted, 0.25))),
  );
  const luminance = luminanceOf(rgb);

  return {
    rgb,
    spread,
    uniform: spread <= UNIFORM_SPREAD_MAX,
    luminance,
    isDark: luminance < 128,
  };
}

/**
 * How a content box decides what counts as "the product".
 *
 * `tolerance` — any pixel far enough from the backdrop colour. Frames every
 * object in the shot, including whatever the piece rests on.
 *
 * `saturation` — only pixels notably more saturated than the backdrop. On the
 * chain photos the piece hangs on a black velvet bust: a tolerance box frames
 * the whole bust and leaves a fine chain small in a lot of dead space, whereas
 * gold is strongly saturated and the neutral velvet is not, so this frames the
 * jewelry. It is NOT safe in general — sterling on cream is barely more
 * saturated than the sweep and would vanish — which is why the caller picks by
 * backdrop and not by preference.
 */
export type ContentBoxMode = 'tolerance' | 'saturation';

const TOLERANCE_MIN_DELTA = 26;
const SATURATION_MIN_DELTA = 30;
/** Fraction of the longest edge added around the detected content. */
const CONTENT_MARGIN = 0.015;
/** Reject a box this small as a detection failure rather than cropping to noise. */
const MIN_CONTENT_FRACTION = 0.004;

export function pickContentBoxMode(backdrop: Backdrop): ContentBoxMode {
  // Only the dark sweeps have a neutral prop in frame worth excluding, and only
  // there is the metal reliably more saturated than the background.
  return backdrop.isDark ? 'saturation' : 'tolerance';
}

/**
 * Bounding box of the product, as a normalized rect.
 *
 * Returns null when nothing stands out from the backdrop (a blank frame) or
 * when the detected region is so small it is more likely noise than jewelry —
 * callers treat null as "use the whole frame".
 */
export function findContentRect(
  img: RawImage,
  backdrop: Backdrop,
  mode: ContentBoxMode,
): NormalizedRect | null {
  const { data, width, height } = img;
  const backdropSaturation = saturationOf(...backdrop.rgb);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const hit =
        mode === 'saturation'
          ? saturationOf(r, g, b) - backdropSaturation > SATURATION_MIN_DELTA
          : Math.max(
              Math.abs(r - backdrop.rgb[0]),
              Math.abs(g - backdrop.rgb[1]),
              Math.abs(b - backdrop.rgb[2]),
            ) > TOLERANCE_MIN_DELTA;

      if (hit) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) return null;

  const margin = Math.round(Math.max(width, height) * CONTENT_MARGIN);
  const left = Math.max(0, minX - margin);
  const top = Math.max(0, minY - margin);
  const right = Math.min(width - 1, maxX + margin);
  const bottom = Math.min(height - 1, maxY + margin);

  const boxW = right - left + 1;
  const boxH = bottom - top + 1;
  if ((boxW * boxH) / (width * height) < MIN_CONTENT_FRACTION) return null;

  return { x: left / width, y: top / height, w: boxW / width, h: boxH / height };
}

export interface BackdropAnalysis {
  backdrop: Backdrop;
  mode: ContentBoxMode;
  /** Suggested crop; null means "nothing detected, use the full frame". */
  rect: NormalizedRect | null;
}

/** One decode, both answers — the common case for callers that need each. */
export async function analyzeImage(input: Buffer): Promise<BackdropAnalysis> {
  const img = await decodeForAnalysis(input);
  const backdrop = analyzeBackdrop(img);
  const mode = pickContentBoxMode(backdrop);
  // A non-uniform frame has no meaningful backdrop to measure against, so a
  // content box would be arbitrary. Leave it uncropped.
  const rect = backdrop.uniform ? findContentRect(img, backdrop, mode) : null;
  return { backdrop, mode, rect };
}

export function clampRect(rect: NormalizedRect): NormalizedRect {
  const x = Math.min(Math.max(rect.x, 0), 1);
  const y = Math.min(Math.max(rect.y, 0), 1);
  return {
    x,
    y,
    w: Math.min(Math.max(rect.w, 0), 1 - x),
    h: Math.min(Math.max(rect.h, 0), 1 - y),
  };
}

/**
 * Apply a normalized rect to an image, in that image's own pixel space.
 *
 * Rects are stored normalized precisely so they survive the source being
 * re-encoded or resized; this is where they become pixels again. A rect that
 * would produce a degenerate (sub-pixel) extract is ignored rather than
 * throwing — a bad stored crop must not be able to block a post.
 */
export async function applyCropRect(input: Buffer, rect: NormalizedRect): Promise<Buffer> {
  const safe = clampRect(rect);
  const meta = await sharp(input).metadata();
  if (!meta.width || !meta.height) return input;

  const left = Math.round(safe.x * meta.width);
  const top = Math.round(safe.y * meta.height);
  const width = Math.round(safe.w * meta.width);
  const height = Math.round(safe.h * meta.height);
  if (width < 1 || height < 1) return input;

  return sharp(input)
    .extract({
      left: Math.min(left, meta.width - 1),
      top: Math.min(top, meta.height - 1),
      width: Math.min(width, meta.width - left),
      height: Math.min(height, meta.height - top),
    })
    .toBuffer();
}

/** `[251, 248, 243]` -> `#fbf8f3`, for SVG and sharp background options. */
export function toHexColor([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}
