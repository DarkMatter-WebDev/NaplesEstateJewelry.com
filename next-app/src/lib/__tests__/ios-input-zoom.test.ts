import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

// Owner, 2026-09-20: "apply that fix on mobile everywhere there's an input
// field, so the mobile view never auto-zooms in like that anymore."
// iOS Safari zooms the page when a focused field is under 16px and never zooms
// back out. `.form-field` is 14px and some fields set smaller sizes inline.
describe('iOS input zoom: every text field is 16px on touch screens', () => {
  const css = read('src', 'app', 'globals.css').replace(/\r\n/g, '\n');
  const rule = css.match(
    /@media \(hover: none\) \{\n {2}:is\(input, select, textarea\):not\(([^)]*)\) \{\n([^}]*)\}\n\}/,
  );

  it('has ONE sitewide rule, on touch screens only', () => {
    expect(rule).not.toBeNull();
  });

  it('wins over `.form-field`, Tailwind text sizes and inline styles', () => {
    // A plain `input { font-size }` loses to `.form-field` (specificity) and to
    // `style={{ fontSize }}` (checkout discount code is 13px inline).
    expect(rule![2]).toMatch(/font-size: 1rem !important;/);
  });

  it('leaves alone the inputs that draw no text', () => {
    for (const type of ['checkbox', 'radio', 'range', 'file', 'hidden']) {
      expect(rule![1]).toContain(`[type='${type}']`);
    }
  });

  it('is unlayered — inside @layer it would lose to unlayered field styles', () => {
    // Brace depth is 0 where the rule starts: it sits at the top level of the
    // stylesheet, not inside an `@layer { … }` (or any other) block.
    const before = css.slice(0, css.indexOf(rule![0])).replace(/\/\*[\s\S]*?\*\//g, '');
    const depth = (before.match(/\{/g) ?? []).length - (before.match(/\}/g) ?? []).length;
    expect(depth).toBe(0);
  });

  it('is never "fixed" by disabling zoom in the viewport', () => {
    for (const file of [['src', 'app', '[locale]', 'layout.tsx'], ['src', 'app', 'layout.tsx']]) {
      const layout = read(...file);
      expect(layout).not.toMatch(/userScalable|maximumScale|user-scalable|maximum-scale/);
    }
  });
});
