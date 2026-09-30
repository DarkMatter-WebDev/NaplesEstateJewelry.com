import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { APP_ICONS, AppIcon } from '@/components/AppIcon';

const APP_ROOT = path.resolve(process.cwd());
const SOURCE_ROOT = path.join(APP_ROOT, 'src');
const LEGACY_CLASS = ['material', 'symbols', 'outlined'].join('-');
const LEGACY_FAMILY = ['Material', 'Symbols', 'Outlined'].join(' ');
const LEGACY_ASSET = ['material', 'symbols', 'subset'].join('-');

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(fullPath);
    return /\.(?:css|ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

describe('inline SVG icon integrity', () => {
  it('does not restore the removed ligature-font infrastructure', () => {
    const violations = sourceFiles(SOURCE_ROOT).flatMap((file) => {
      const contents = fs.readFileSync(file, 'utf8');
      return [LEGACY_CLASS, LEGACY_FAMILY, LEGACY_ASSET]
        .filter((legacyValue) => contents.includes(legacyValue))
        .map((legacyValue) => `${path.relative(APP_ROOT, file)} contains ${legacyValue}`);
    });

    expect(violations).toEqual([]);
    expect(fs.existsSync(path.join(APP_ROOT, 'public', 'assets', 'fonts'))).toBe(false);
  });

  it('maps every statically named AppIcon to an SVG component', () => {
    const missing = sourceFiles(SOURCE_ROOT).flatMap((file) => {
      const contents = fs.readFileSync(file, 'utf8');
      return Array.from(contents.matchAll(/<AppIcon\b[^>]*\bname="([^"]+)"/g))
        .map((match) => match[1])
        .filter((name) => !(name in APP_ICONS))
        .map((name) => `${path.relative(APP_ROOT, file)} uses unknown icon ${name}`);
    });

    expect(missing).toEqual([]);
  });

  it('does not reintroduce fontVariationSettings on icons', () => {
    // These are Material Symbols variable-font axes and mean nothing to an SVG.
    // A "'FILL' 1" value used to be translated into fill="currentColor", which
    // floods a Lucide OUTLINE icon and hides every interior stroke — a filled
    // circle-check is a plain disc, a filled gem or badge is a blob. That cost
    // 14 of 24 icons on /free-evaluation before it was found. Icons that should
    // genuinely be solid pass fill="currentColor" explicitly instead.
    // AppIcon.tsx still names the property in order to STRIP it, and this file
    // names it to prove the stripping works — both are the guard, not a breach.
    const allowed = [
      path.join('components', 'AppIcon.tsx'),
      path.join('__tests__', 'app-icon-integrity.test.ts'),
    ];
    const offenders = sourceFiles(SOURCE_ROOT)
      .filter((file) => !allowed.some((suffix) => file.endsWith(suffix)))
      .filter((file) => fs.readFileSync(file, 'utf8').includes('fontVariationSettings'))
      .map((file) => path.relative(APP_ROOT, file));

    expect(offenders).toEqual([]);
  });

  it('renders outline icons by default and only fills when asked', () => {
    const plain = renderToStaticMarkup(createElement(AppIcon, { name: 'diamond' }));
    expect(plain).toContain('fill="none"');

    const solid = renderToStaticMarkup(createElement(AppIcon, {
      name: 'star',
      fill: 'currentColor',
    }));
    expect(solid).toContain('fill="currentColor"');

    // The removed bridge: a stale FILL axis must no longer produce a fill.
    const legacy = renderToStaticMarkup(createElement(AppIcon, {
      name: 'diamond',
      style: { fontVariationSettings: "'FILL' 1" },
    }));
    expect(legacy).toContain('fill="none"');
    expect(legacy).not.toContain('fontVariationSettings');
  });

  it('renders SVG markup and never falls back to visible icon-name text', () => {
    const rendered = renderToStaticMarkup(createElement(AppIcon, {
      name: 'sync',
      className: 'test-icon',
    }));

    expect(rendered).toContain('<svg');
    expect(rendered).toContain('app-icon test-icon');
    expect(rendered).not.toContain('>sync<');
    expect(renderToStaticMarkup(createElement(AppIcon, { name: 'not_registered' }))).toBe('');
  });
});
