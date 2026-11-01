import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// 2026-10-17: the homepage served a cached "Page Not Found" on `/` and `/es`
// for ~34 hours after a carousel save. Cause: `dynamicParams = false` on the
// home route. With it, Next answers ANY cache miss on the route with its
// "no fallback" 404 — even for the prerendered /en and /es — and caches it.
// Netlify's cache reports a miss whenever a tag the page uses is expired
// (`revalidateTag(…, { expire: 0 })` on a carousel / banner / hours save).
// The routes that need "unknown param = 404" use `force-static` + an explicit
// `notFound()` instead. Rule: DECISIONS.md → "Never `dynamicParams = false`".

const SRC = join(process.cwd(), 'src');
const read = (...p: string[]) => readFileSync(join(SRC, ...p), 'utf8');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('static-param routes survive a cache miss', () => {
  it('no route sets dynamicParams = false', () => {
    const offenders = sourceFiles(join(SRC, 'app'))
      .filter((file) => /export\s+const\s+dynamicParams\s*=\s*false/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file));
    expect(offenders).toEqual([]);
  });

  it('the home route is force-static and 404s unknown locales itself', () => {
    const page = read('app', '[locale]', '(home)', 'page.tsx');
    expect(page).toMatch(/export const dynamic = 'force-static';/);
    expect(page).toMatch(/if \(!hasLocale\(routing\.locales, locale\)\) notFound\(\);/);
  });

  it('the city route is force-static and 404s unknown cities itself', () => {
    const page = read('app', '[locale]', 'sell', '[city]', 'page.tsx');
    expect(page).toMatch(/export const dynamic = 'force-static';/);
    expect(page).toMatch(/if \(!area\) notFound\(\);/);
  });
});
