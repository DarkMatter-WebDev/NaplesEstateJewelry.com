import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  analyzeImage,
  applyCropRect,
  clampRect,
  detectBackdrop,
  detectBorderBackdrop,
  pickContentBoxMode,
  toHexColor,
} from '../backdrop';

/**
 * Synthetic studio shots. Building them here rather than fixture files keeps
 * the tests deterministic and network-free, and lets each case isolate exactly
 * one property of the analysis.
 */
async function makeImage(svg: string, width = 400, height = 300): Promise<Buffer> {
  return sharp(Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`))
    .png()
    .toBuffer();
}

const CREAM = 'rgb(251,248,243)';
const GOLD = 'rgb(198,150,44)';

describe('detectBackdrop', () => {
  it('reads a flat cream sweep as a uniform light backdrop', async () => {
    const image = await makeImage(`<rect width="400" height="300" fill="${CREAM}"/>`);
    const backdrop = await detectBackdrop(image);

    expect(backdrop.uniform).toBe(true);
    expect(backdrop.spread).toBeLessThanOrEqual(2);
    expect(backdrop.isDark).toBe(false);
    expect(backdrop.rgb[0]).toBeGreaterThan(240);
  });

  it('reads a flat black sweep as a uniform dark backdrop', async () => {
    const image = await makeImage('<rect width="400" height="300" fill="rgb(0,0,0)"/>');
    const backdrop = await detectBackdrop(image);

    expect(backdrop.uniform).toBe(true);
    expect(backdrop.isDark).toBe(true);
    expect(backdrop.rgb).toEqual([0, 0, 0]);
  });

  it('rejects a frame whose corners disagree, so a lifestyle shot is not keyed', async () => {
    const image = await makeImage(
      '<rect width="400" height="300" fill="rgb(20,20,20)"/>' +
        '<rect x="200" width="200" height="300" fill="rgb(240,240,240)"/>',
    );
    const backdrop = await detectBackdrop(image);

    expect(backdrop.uniform).toBe(false);
    expect(backdrop.spread).toBeGreaterThan(12);
  });

  it('treats a transparent corner as white, matching what flatten() will produce', async () => {
    // A background-removed photo has no backdrop colour of its own; the pad
    // colour has to agree with whatever the flatten step paints behind it.
    const image = await makeImage(`<rect x="150" y="100" width="100" height="100" fill="${GOLD}"/>`);
    const backdrop = await detectBackdrop(image);

    expect(backdrop.rgb).toEqual([255, 255, 255]);
    expect(backdrop.isDark).toBe(false);
  });
});

describe('detectBorderBackdrop', () => {
  it('keeps a cream sweep when a tight product crop touches one corner', async () => {
    const image = await makeImage(
      `<rect width="400" height="300" fill="${CREAM}"/>` +
        `<rect x="0" y="220" width="120" height="80" fill="${GOLD}"/>`,
    );

    const corners = await detectBackdrop(image);
    const border = await detectBorderBackdrop(image);

    expect(corners.uniform).toBe(false);
    expect(border.uniform).toBe(true);
    expect(toHexColor(border.rgb)).toBe('#fbf8f3');
  });

  it('still rejects a genuinely mixed border', async () => {
    const image = await makeImage(
      '<rect width="200" height="300" fill="rgb(20,20,20)"/>' +
        '<rect x="200" width="200" height="300" fill="rgb(240,240,240)"/>',
    );

    expect((await detectBorderBackdrop(image)).uniform).toBe(false);
  });
});

describe('pickContentBoxMode', () => {
  it('uses saturation only on dark backdrops, where the prop is neutral', async () => {
    const dark = await detectBackdrop(await makeImage('<rect width="400" height="300" fill="rgb(0,0,0)"/>'));
    const light = await detectBackdrop(await makeImage(`<rect width="400" height="300" fill="${CREAM}"/>`));

    expect(pickContentBoxMode(dark)).toBe('saturation');
    expect(pickContentBoxMode(light)).toBe('tolerance');
  });
});

describe('analyzeImage', () => {
  it('frames the product on a cream sweep', async () => {
    const image = await makeImage(
      `<rect width="400" height="300" fill="${CREAM}"/>` +
        `<rect x="100" y="90" width="200" height="120" fill="${GOLD}"/>`,
    );
    const { rect, mode } = await analyzeImage(image);

    expect(mode).toBe('tolerance');
    expect(rect).not.toBeNull();
    // 100/400 = 0.25 and 90/300 = 0.3, plus the small breathing-room margin.
    expect(rect!.x).toBeGreaterThan(0.2);
    expect(rect!.x).toBeLessThan(0.26);
    expect(rect!.y).toBeGreaterThan(0.25);
    expect(rect!.y).toBeLessThan(0.31);
    expect(rect!.w).toBeGreaterThan(0.45);
    expect(rect!.h).toBeGreaterThan(0.35);
  });

  it('excludes a neutral prop on a dark sweep, framing only the metal', async () => {
    // The real case: a gold chain on a black velvet bust. A tolerance box would
    // frame the whole bust and leave the chain small in a lot of dead space.
    const image = await makeImage(
      '<rect width="400" height="300" fill="rgb(0,0,0)"/>' +
        '<rect x="40" y="30" width="320" height="240" fill="rgb(38,38,38)"/>' +
        `<rect x="160" y="130" width="80" height="40" fill="${GOLD}"/>`,
    );
    const { rect, mode } = await analyzeImage(image);

    expect(mode).toBe('saturation');
    expect(rect).not.toBeNull();
    // The gold sits at x 0.40-0.60, y 0.43-0.57. The box must hug it rather
    // than the 0.10-0.90 prop.
    expect(rect!.x).toBeGreaterThan(0.33);
    expect(rect!.x + rect!.w).toBeLessThan(0.67);
    expect(rect!.w * rect!.h).toBeLessThan(0.15);
  });

  it('returns no rect for a non-uniform frame rather than guessing', async () => {
    const image = await makeImage(
      '<rect width="400" height="300" fill="rgb(20,20,20)"/>' +
        '<rect x="200" width="200" height="300" fill="rgb(240,240,240)"/>',
    );
    const { rect } = await analyzeImage(image);

    expect(rect).toBeNull();
  });

  it('returns no rect for an empty sweep', async () => {
    const { rect } = await analyzeImage(await makeImage(`<rect width="400" height="300" fill="${CREAM}"/>`));
    expect(rect).toBeNull();
  });
});

describe('clampRect', () => {
  it('keeps a rect inside the frame', () => {
    expect(clampRect({ x: 0.8, y: 0.9, w: 0.5, h: 0.5 })).toEqual({
      x: 0.8,
      y: 0.9,
      w: expect.closeTo(0.2, 5),
      h: expect.closeTo(0.1, 5),
    });
  });

  it('pulls negative origins back to zero', () => {
    const rect = clampRect({ x: -0.3, y: -0.2, w: 0.5, h: 0.5 });
    expect(rect.x).toBe(0);
    expect(rect.y).toBe(0);
  });
});

describe('applyCropRect', () => {
  it('extracts the requested fraction of the source', async () => {
    const image = await makeImage(`<rect width="400" height="300" fill="${CREAM}"/>`);
    const cropped = await applyCropRect(image, { x: 0.25, y: 0.5, w: 0.5, h: 0.5 });
    const meta = await sharp(cropped).metadata();

    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  it('returns the source untouched for a degenerate rect, so a bad crop cannot block a post', async () => {
    const image = await makeImage(`<rect width="400" height="300" fill="${CREAM}"/>`);
    const cropped = await applyCropRect(image, { x: 0.5, y: 0.5, w: 0, h: 0 });

    expect(cropped).toBe(image);
  });
});

describe('toHexColor', () => {
  it('formats channels as a padded hex triplet', () => {
    expect(toHexColor([251, 248, 243])).toBe('#fbf8f3');
    expect(toHexColor([0, 0, 0])).toBe('#000000');
    expect(toHexColor([255, 255, 255])).toBe('#ffffff');
  });
});
