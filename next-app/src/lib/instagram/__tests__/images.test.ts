import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { getSquareImageFraming, renderSquareJpeg } from '../images';

const CREAM = { r: 251, g: 248, b: 243 };

async function landscapeSweep(): Promise<Buffer> {
  return sharp({
    create: { width: 400, height: 300, channels: 3, background: CREAM },
  }).png().toBuffer();
}

async function tightCornerSweep(): Promise<Buffer> {
  return sharp(Buffer.from(
    '<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="400" height="300" fill="rgb(251,248,243)"/>' +
      '<rect x="0" y="220" width="120" height="80" fill="rgb(198,150,44)"/>' +
    '</svg>',
  )).png().toBuffer();
}

describe('square social framing', () => {
  it('reports the exact sampled canvas that the square renderer uses', async () => {
    const source = await landscapeSweep();
    const framing = await getSquareImageFraming(source);
    const rendition = await renderSquareJpeg(source);
    const corner = await sharp(rendition).raw().toBuffer();

    expect(framing).toEqual({
      sourceAspect: expect.closeTo(4 / 3, 5),
      canvasColor: '#fbf8f3',
      hasCanvas: true,
    });
    expect(corner.subarray(0, 3)).toEqual(Buffer.from([251, 248, 243]));
  });

  it('uses the dominant border sweep when jewelry reaches a corner', async () => {
    const framing = await getSquareImageFraming(await tightCornerSweep());

    expect(framing.canvasColor).toBe('#fbf8f3');
    expect(framing.hasCanvas).toBe(true);
  });
});
