import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Owner, 2026-11-25: "remove 'inside Sharon Lynch Collections' from
 * everywhere.. we now have proper signage and we are just as much the shop as
 * sharon". No page, email, receipt or print may name the other business.
 * (Test files are skipped — they may name it to assert it is absent.)
 */
const APP = join(__dirname, '..', '..', '..');
const ROOTS = ['src', 'messages', 'public'].map((dir) => join(APP, dir));
const TEXT = /\.(?:ts|tsx|js|mjs|json|md|html|txt|xml|css)$/i;

function files(dir: string): string[] {
  let out: string[] = [];
  let names: string[] = [];
  try { names = readdirSync(dir); } catch { return out; }
  for (const name of names) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      out = out.concat(files(full));
    } else if (TEXT.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe('no shared-suite landmark', () => {
  it('no source, message or public file names Sharon Lynch', () => {
    const hits = ROOTS.flatMap(files).filter((file) => /sharon\s+lynch|dentro de sharon|inside sharon/i.test(readFileSync(file, 'utf8')));
    expect(hits.map((file) => relative(APP, file))).toEqual([]);
  });
});
