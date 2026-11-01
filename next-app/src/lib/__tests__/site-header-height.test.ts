import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guard for the --site-header-height token.
//
// Before 2026-08-04 the fixed header's height was implicit (padding + logo,
// 57px on phones and 73px from md up) while ~16 pages independently reserved a
// hardcoded 4rem/64px, and the hero pinned itself at a hardcoded 4rem. The
// numbers had silently diverged: page content's first 9px sat behind the
// header, visible on the homepage announcement bar and absorbed unnoticed
// elsewhere by generous section padding.
//
// These assertions keep the token authoritative — the header takes its height
// FROM it, and everything that must sit below the header derives from it — so
// the same drift cannot reappear one hardcoded offset at a time.

const SOURCE_ROOTS = [join(process.cwd(), 'src', 'app'), join(process.cwd(), 'src', 'components')];
const GLOBALS = join(process.cwd(), 'src', 'app', 'globals.css');
const SITE_HEADER = join(process.cwd(), 'src', 'components', 'layout', 'SiteHeader.tsx');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.tsx') || path.endsWith('.css') ? [path] : [];
  });
}

describe('--site-header-height token', () => {
  it('defines one responsive token plus the offset utility', () => {
    const css = readFileSync(GLOBALS, 'utf8');
    expect(css).toContain('--site-header-height: 3.5rem');
    expect(css).toContain('--site-header-height: 4.5rem');
    expect(css).toContain('.site-header-offset {');
    expect(css).toContain('padding-top: var(--site-header-height)');
  });

  it('sizes the header FROM the token, so the token is authoritative', () => {
    const header = readFileSync(SITE_HEADER, 'utf8');
    expect(header).toContain("height: 'var(--site-header-height)'");
    // The row centers inside that height; reintroducing vertical padding here
    // would make the rendered header taller than the token again.
    expect(header).not.toMatch(/site-header-row[^"]*\bpy-\d/);
  });

  it('leaves no page reserving the header space with a hardcoded value', () => {
    // 4rem/3.5rem subtracted from the viewport is the old full-height-below-
    // header idiom; `top: 4rem` is the old sticky-below-header idiom; a pt-16
    // <main> is the old page-offset idiom. All three must read the token now.
    const STALE_OFFSET = /100[sd]vh\s*-\s*(?:4rem|3\.5rem)|top:\s*4rem|<main className="(?:[^"]*\s)?pt-16(?:\s[^"]*)?"/;

    const offenders = SOURCE_ROOTS.flatMap(sourceFiles).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, index) => ({ file, line: line.trim(), lineNumber: index + 1 }))
        .filter(({ line }) => STALE_OFFSET.test(line)),
    );
    expect(offenders).toEqual([]);
  });
});
