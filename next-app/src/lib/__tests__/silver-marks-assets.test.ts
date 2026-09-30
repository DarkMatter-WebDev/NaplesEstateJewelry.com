import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The "Reading Silver Marks" section (2026-09-06) lists its photos by key in
// `SilverMarksSection.tsx`; each key needs BOTH files on disk — the tile crop
// and the full photo the lightbox opens. next/image only fails at request
// time, so a missing file would ship as a broken tile or an empty viewer.

const SECTION = readFileSync(join(process.cwd(), 'src', 'components', 'silver', 'SilverMarksSection.tsx'), 'utf8');
const DIR = join(process.cwd(), 'public', 'assets', 'images', 'pages', 'silver-marks');

function keys(): string[] {
  return Array.from(new Set(Array.from(SECTION.matchAll(/key: '([a-z0-9-]+)'/g)).map((m) => m[1])));
}

describe('silver marks section — every photo key has its two files', () => {
  const list = keys();

  it('reads a real list (positive control)', () => {
    expect(list.length).toBeGreaterThan(20);
    expect(list).toContain('own-london-1824-v2');
  });

  it('has <key>.webp and <key>-full.webp for every key', () => {
    const missing = list.flatMap((k) => [`${k}.webp`, `${k}-full.webp`]).filter((f) => !existsSync(join(DIR, f)));
    expect(missing).toEqual([]);
  });

  it('uses no image outside the silver-marks folder in the gallery component', () => {
    const gallery = readFileSync(join(process.cwd(), 'src', 'components', 'silver', 'MarkGallery.tsx'), 'utf8');
    expect(gallery).toContain("const DIR = '/assets/images/pages/silver-marks'");
  });
});
