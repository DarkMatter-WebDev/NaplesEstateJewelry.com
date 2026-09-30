import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOTS = [join(process.cwd(), 'src', 'app'), join(process.cwd(), 'src', 'components')];
const CANVAS_WIDTH = /max-w-(?:6xl|7xl|\[(?:1200|1300|1440|1500|1800)px\])/;

function tsxFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? tsxFiles(path) : path.endsWith('.tsx') ? [path] : [];
  });
}

describe('ultra-wide layout coverage', () => {
  it('provides explicit medium, standard and wide canvas tiers at 2000px', () => {
    const css = readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8');
    expect(css).toContain('@media (min-width: 2000px)');
    expect(css).toContain('.ultrawide-page-medium');
    expect(css).toContain('.ultrawide-page {');
    expect(css).toContain('.ultrawide-page-wide');
  });

  it('opts every large route/component canvas into an ultra-wide tier', () => {
    const uncovered = SOURCE_ROOTS.flatMap(tsxFiles).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, index) => ({ file, line, lineNumber: index + 1 }))
        .filter(({ line }) => CANVAS_WIDTH.test(line) && !line.includes('ultrawide-')),
    );
    expect(uncovered).toEqual([]);
  });

  it('keeps legal prose and authentication cards intentionally narrow', () => {
    const legal = readFileSync(join(process.cwd(), 'src', 'components', 'legal', 'LegalPolicyPage.tsx'), 'utf8');
    const signIn = readFileSync(join(process.cwd(), 'src', 'app', '[locale]', 'account', 'sign-in', 'page.tsx'), 'utf8');
    expect(legal).toContain('max-w-4xl');
    expect(legal).not.toContain('ultrawide-page');
    expect(signIn).toContain('max-w-sm');
    expect(signIn).not.toContain('ultrawide-page');
  });
});
