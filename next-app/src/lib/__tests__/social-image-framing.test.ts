import { describe, expect, it } from 'vitest';
import {
  centeredSquareCrop,
  cropBackgroundPosition,
  squareCanvasWindow,
} from '@/lib/social-image-framing';

describe('social image framing', () => {
  it('starts a centered landscape crop that fills a square', () => {
    expect(centeredSquareCrop(4 / 3)).toEqual({
      x: expect.closeTo(0.125, 5),
      y: 0,
      w: expect.closeTo(0.75, 5),
      h: 1,
    });
  });

  it('starts a centered portrait crop that fills a square', () => {
    expect(centeredSquareCrop(3 / 4)).toEqual({
      x: 0,
      y: expect.closeTo(0.125, 5),
      w: 1,
      h: expect.closeTo(0.75, 5),
    });
  });

  it('shows the un-cropped landscape with top and bottom canvas space', () => {
    expect(squareCanvasWindow(4 / 3, { x: 0, y: 0, w: 1, h: 1 })).toEqual({
      x: 0,
      y: expect.closeTo(0.125, 5),
      w: 1,
      h: expect.closeTo(0.75, 5),
    });
  });

  it('aligns a centered half-width crop at the middle of its source', () => {
    expect(cropBackgroundPosition(0.25, 0.5)).toBe('50.000%');
  });
});
