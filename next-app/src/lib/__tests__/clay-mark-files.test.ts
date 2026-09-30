import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Every name in `ClayMarkName` must have `public/assets/images/icons/mark-<name>.webp`
// on disk. A missing file is not a build error — next/image only fails at
// request time — so a renamed or deleted asset would ship as a broken mark.
// Added 2026-09-04 when the owner's icon pack replaced the clay set; the clay
// names `ring`, `flatware`, `goldbar`, `phone` and `microscope` are retired
// and must not come back without a file (`shield` returned 2026-09-05 with one).

const COMPONENT = readFileSync(join(process.cwd(), 'src', 'components', 'ClayMark.tsx'), 'utf8');
const ICONS = join(process.cwd(), 'public', 'assets', 'images', 'icons');

function unionNames(): string[] {
  const start = COMPONENT.indexOf('export type ClayMarkName =');
  // The union ends at the first `'…';` — a bare `;` search would stop at a
  // semicolon inside a comment line within the union.
  const end = COMPONENT.slice(start).search(/'\s*;/) + start + 1;
  return Array.from(COMPONENT.slice(start, end).matchAll(/\|\s*'([a-z-]+)'/g)).map((m) => m[1]);
}

describe('ClayMark — every name resolves to an icon-pack file on disk', () => {
  const names = unionNames();

  it('reads a real union (positive control)', () => {
    expect(names.length).toBeGreaterThan(15);
    expect(names).toContain('gold-seal');
  });

  it('has mark-<name>.webp for every name', () => {
    const missing = names.filter((name) => !existsSync(join(ICONS, `mark-${name}.webp`)));
    expect(missing).toEqual([]);
  });

  it('resolves only to the mark- prefix (no clay- fallback left in the component)', () => {
    expect(COMPONENT).toContain('/assets/images/icons/mark-${name}.webp');
    expect(COMPONENT).not.toContain('clay-${name}');
  });

  it('keeps the retired clay names retired', () => {
    for (const old of ['ring', 'flatware', 'goldbar', 'phone', 'microscope']) {
      expect(names).not.toContain(old);
    }
  });
});
