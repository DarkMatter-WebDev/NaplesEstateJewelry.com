import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

// Owner, 2026-10-25: replace the product-page review grid with "a scrolling
// carousel of reviews … when the user hovers over it, it stops and they can
// click on it and drag it right and left to progress or go back."
describe('reviews band (homepage + product pages)', () => {
  const band = read('src', 'components', 'home', 'TestimonialMarqueeBand.tsx');
  const section = read('src', 'components', 'home', 'TestimonialsSection.tsx');
  const css = read('src', 'app', 'globals.css');

  it('product pages and the homepage both render the band; the grid is gone', () => {
    expect(section).toContain('<TestimonialMarqueeBand durationSeconds={durationSeconds}>');
    expect(section).not.toContain('testimonial-grid');
    expect(section).not.toMatch(/variant\?:|variant ===|variant = '/);
    expect(read('src', 'app', '[locale]', 'shop', '[id]', 'page.tsx')).toContain('<TestimonialsSection locale={locale} compact />');
    expect(read('src', 'app', '[locale]', '(home)', 'page.tsx')).toContain('<TestimonialsSection locale={locale} />');
    expect(css).not.toMatch(/\.testimonial-grid\s*\{/);
  });

  it('stops on mouse hover, while dragged, on keyboard focus, and offscreen', () => {
    expect(band).toMatch(/onScreen && !hovered && !focused && pointerId === null && !reducedMotion\.matches/);
    expect(band).toContain("e.pointerType === 'mouse'");
    expect(band).toContain("matches(':focus-visible')");
    expect(band).toContain('new IntersectionObserver');
  });

  it('drags both ways, loops, and never opens a review at the end of a drag', () => {
    expect(band).toMatch(/offset = wrap\(startOffset - dx\)/);
    expect(band).toMatch(/const wrap = \(value: number\) => \(half > 0 \? \(\(value % half\) \+ half\) % half : 0\)/);
    // Capture only once it IS a drag — capturing on press steals the link's click.
    expect(band).toMatch(/if \(Math\.abs\(dx\) < DRAG_THRESHOLD_PX\) return;\s*dragging = true;[\s\S]*?setPointerCapture/);
    expect(band).toContain("band.addEventListener('click', onClickCapture, true)");
    expect(band).toContain("band.addEventListener('dragstart', onDragStart)");
  });

  it('a finger pauses it for a while; reduced motion never self-scrolls', () => {
    expect(band).toMatch(/if \(e\.pointerType !== 'mouse'\) resumeAt = performance\.now\(\) \+ TOUCH_RESUME_MS/);
    expect(band).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
  });

  it('CSS: no animation any more; vertical swipes still scroll the page', () => {
    expect(css).not.toContain('@keyframes testimonial-marquee-scroll');
    expect(css).toMatch(/\.testimonial-marquee \{[^}]*touch-action: pan-y;/);
    expect(css).toMatch(/\.testimonial-marquee\[data-dragging\] \{[^}]*cursor: grabbing;/);
    // The seam rule: spacing by margin, never gap (two exactly equal halves).
    expect(css).toMatch(/\.testimonial-marquee \.testimonial-card \{[^}]*margin-inline-end:/);
  });
});
