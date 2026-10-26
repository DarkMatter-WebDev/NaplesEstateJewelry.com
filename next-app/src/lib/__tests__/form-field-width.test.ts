import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

// Owner, 2026-10-25 (iPad): the trade-in "%" wrapped onto its own line because
// the 2-digit box stretched across the screen; "scan the site for any other
// input fields that are way longer/larger than they need to be".
// Cause: `.form-field { width: 100% }` sat in an UNLAYERED rule, which beats
// Tailwind's `w-24` etc. (`@layer utilities`) — 15 short fields were full width.
describe('.form-field width yields to a width utility', () => {
  const css = read('src', 'app', 'globals.css').replace(/\r\n/g, '\n');

  it('keeps the full-width default inside @layer components', () => {
    expect(css).toMatch(/@layer components \{\n {2}\.form-field \{\n {4}width: 100%;\n {2}\}\n\}/);
  });

  it('the unlayered .form-field rule sets no width', () => {
    const unlayered = css.match(/\n\.form-field \{\n([^}]*)\}/);
    expect(unlayered).not.toBeNull();
    expect(unlayered![1]).not.toMatch(/(^|\s)(width|inline-size)\s*:/);
  });

  it('the trade-in box and its % stay together on one line', () => {
    const panel = read('src', 'components', 'admin', 'AdminSpecialPricePanel.tsx');
    const groups = panel.match(/<span className="inline-flex items-center gap-2 whitespace-nowrap">\s*<input[\s\S]*?className="form-field w-24"[\s\S]*?>%<\/span>\s*<\/span>/g);
    expect(groups).toHaveLength(2);
  });
});
