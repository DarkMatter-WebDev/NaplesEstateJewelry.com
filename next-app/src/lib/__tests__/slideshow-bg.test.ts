import { describe, expect, it } from 'vitest';
// From carouselConfig (pure), not carouselData — that module instantiates the
// Supabase browser client at import time, which has no env in the test runner.
import { normalizeSlideshowBg } from '../../../carousel/lib/carouselConfig';

// The per-slideshow solid background replaced the per-photo sweep on
// 2026-08-09. Two properties matter enough to pin:
//  1. normalization — the admin color input and legacy word values both land on
//     concrete hex, and garbage falls back rather than painting `background: ''`;
//  2. the pre-migration inherit rule — a missing bg_color_alt/bg_color_third
//     resolves to Slideshow 1's color, so running the app before
//     add-slideshow-bg-colors.sql changes nothing visible.
describe('normalizeSlideshowBg', () => {
  it('passes hex values through, lowercased', () => {
    expect(normalizeSlideshowBg('#1A2B3C', '#ffffff')).toBe('#1a2b3c');
    expect(normalizeSlideshowBg('#000', '#ffffff')).toBe('#000');
  });

  it('maps the legacy word values to hex', () => {
    expect(normalizeSlideshowBg('black', '#ffffff')).toBe('#000000');
    expect(normalizeSlideshowBg('White', '#000000')).toBe('#ffffff');
  });

  it('falls back on null, undefined, and empty — the inherit rule', () => {
    // This is what makes a pre-migration read (missing bg_color_alt /
    // bg_color_third columns) resolve to Slideshow 1's color.
    expect(normalizeSlideshowBg(null, '#123456')).toBe('#123456');
    expect(normalizeSlideshowBg(undefined, '#123456')).toBe('#123456');
    expect(normalizeSlideshowBg('   ', '#123456')).toBe('#123456');
  });
});
