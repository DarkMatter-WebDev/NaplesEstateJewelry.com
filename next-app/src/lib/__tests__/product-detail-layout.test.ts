import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Owner, 2026-10-25: "i like today's layout for 1280-1999px... can we apply that
// layout to the 2000px and wider screens too?" The ultrawide arrangement left
// ~460px of empty photo column under the thumbnails on a long description.
describe('product detail layout: one desktop arrangement', () => {
  const css = readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8').replace(/\r\n/g, '\n');

  /** Every `@media (min-width: …)` block's text, with its width. */
  const mediaBlocks = (() => {
    const out: { width: number; body: string }[] = [];
    const re = /@media \(min-width: (\d+)px\) \{/g;
    for (let m = re.exec(css); m; m = re.exec(css)) {
      let depth = 1;
      let i = m.index + m[0].length;
      for (; i < css.length && depth > 0; i++) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}') depth--;
      }
      out.push({ width: Number(m[1]), body: css.slice(m.index, i) });
    }
    return out;
  })();

  it('no 2000px+ block rearranges the product layout', () => {
    const wide = mediaBlocks.filter((b) => b.width >= 2000);
    expect(wide.length).toBeGreaterThan(0); // positive control: the canvas tiers still exist
    for (const block of wide) expect(block.body).not.toContain('.product-detail-layout');
  });

  it('the md+ layout keeps the trust strip as a full-width third row', () => {
    const md = mediaBlocks.find((b) => b.width === 768 && b.body.includes('.product-detail-layout'));
    expect(md?.body).toMatch(/\.product-detail-layout > \.product-trust-badges \{\s*grid-column: 1 \/ -1;\s*grid-row: 3;/);
  });
});
