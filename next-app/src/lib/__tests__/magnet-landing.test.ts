import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAGNET_DIRECTORY_ID,
  MAGNET_LANDING_LIVE,
  MAGNET_LANDING_PATH,
  MAGNET_TRUCK_PHOTO,
  MAGNET_TRUCK_STRIP_RATIO,
} from '@/lib/magnet-landing';
import { SCAN_SOURCES } from '@/lib/scan-sources';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

// The /magnet landing page (owner, 2026-11-23, mockup 4 "C1"). Held until the
// owner's real truck photo is set; the magnets must keep working either way.
describe('/magnet landing page', () => {
  it('is switched on by the truck photo alone, at the printed address', () => {
    expect(MAGNET_LANDING_LIVE).toBe(MAGNET_TRUCK_PHOTO !== null);
    expect(MAGNET_LANDING_PATH).toBe('/magnet');
    expect(SCAN_SOURCES.magnet.path).toBe(MAGNET_LANDING_PATH);
    // The proxy imports it on the edge: nothing may be imported here.
    expect(read('src', 'lib', 'magnet-landing.ts')).not.toMatch(/^import /m);
  });

  it('when the photo is set, it is a real WebP file in public/ (AGENTS.md: verify the encode)', () => {
    if (!MAGNET_TRUCK_PHOTO) return;
    expect(MAGNET_TRUCK_PHOTO.src).toMatch(/^\/assets\/images\/pages\/[a-z0-9-]+\.webp$/);
    const file = join(process.cwd(), 'public', MAGNET_TRUCK_PHOTO.src);
    expect(existsSync(file)).toBe(true);
    const head = readFileSync(file).subarray(0, 12).toString('latin1');
    expect(head.slice(0, 4)).toBe('RIFF');
    expect(head.slice(8, 12)).toBe('WEBP');
    expect(Math.max(MAGNET_TRUCK_PHOTO.width, MAGNET_TRUCK_PHOTO.height)).toBeLessThanOrEqual(2048);
    // Never the dev stand-in (memory: preview with the storefront photo, then revert).
    expect(MAGNET_TRUCK_PHOTO.src).not.toMatch(/storefront|zz-/);
  });

  it('the strip is 10:3 and the photo is cut to the same shape (owner, truck mockup 4: "A at 117 px")', () => {
    expect(MAGNET_TRUCK_STRIP_RATIO).toBeCloseTo(10 / 3, 5);
    expect(read('src', 'components', 'magnet', 'MagnetLanding.tsx')).toContain('relative aspect-[10/3] w-full');
    if (!MAGNET_TRUCK_PHOTO) return;
    // Same shape → the approved crop shows exactly, nothing more is cut off.
    expect(Math.abs(MAGNET_TRUCK_PHOTO.width / MAGNET_TRUCK_PHOTO.height - MAGNET_TRUCK_STRIP_RATIO)).toBeLessThan(0.01);
  });

  it('the proxy keeps the counted 302 while held, then lets /magnet through to the page', () => {
    const proxy = read('src', 'proxy.ts');
    const block = proxy.slice(proxy.indexOf('if (isMagnetPath(pathname)) {'), proxy.indexOf('const legacy = legacyRedirect(request);'));
    expect(block).toContain('if (!MAGNET_LANDING_LIVE) return NextResponse.rewrite(new URL(MAGNET_SCAN_ROUTE, request.url));');
    // /Magnet, /magnet/ → the one address; /magnet itself falls through to the locale rewrite.
    expect(block).toContain('if (pathname !== MAGNET_LANDING_PATH)');
    expect(block).toContain('NextResponse.redirect(url, 308)');
    expect(block.indexOf('MAGNET_LANDING_LIVE')).toBeLessThan(block.indexOf('MAGNET_LANDING_PATH'));
  });

  it('the page answers 404 until the photo is set', () => {
    const page = read('src', 'app', '[locale]', 'magnet', 'page.tsx');
    expect(page).toContain('if (!MAGNET_TRUCK_PHOTO) notFound();');
  });

  it('is never indexed, never in the sitemap, and has no cookie notice — like /card', () => {
    const landing = read('src', 'components', 'magnet', 'MagnetLanding.tsx');
    expect(landing).toContain('robots: { index: false, follow: false }');
    expect(landing).toMatch(/<main [^>]*data-no-cookie-notice/);
    expect(read('src', 'app', 'sitemap.ts')).not.toMatch(/magnet/i);
  });

  it('counts the scan from the page, once per tab, as "magnet"', () => {
    const landing = read('src', 'components', 'magnet', 'MagnetLanding.tsx');
    expect(landing).toContain('<ScanBeacon source="magnet" />');
  });

  it('has the approved buttons: gold Free Evaluation, Call, Text with the truck note', () => {
    const landing = read('src', 'components', 'magnet', 'MagnetLanding.tsx');
    expect(landing).toMatch(/href=\{`\$\{prefix\}\/free-evaluation`\}[^>]*className="gold-button"/);
    expect(landing).toContain('className="dark-button"');
    expect(landing).toContain('I saw your truck');
    expect(landing).toContain('vi su camioneta');
    // A dial-only button says "Call" (DECISIONS 2026-10-31), never "call or text".
    expect(landing).not.toMatch(/Call or Text/i);
    // Sellers' page: no social tiles (unlike /card).
    expect(landing).not.toContain('SOCIAL_PROFILES');
    // The owner's real photo only — the face is a crop of chris-owner.webp.
    expect(existsSync(join(process.cwd(), 'public', 'assets', 'images', 'pages', 'chris-owner-face.webp'))).toBe(true);
  });

  it('the "more below" arrow starts hidden, leaves on the first scroll and glides to the directory', () => {
    const landing = read('src', 'components', 'magnet', 'MagnetLanding.tsx');
    expect(landing).toContain('<ScrollCue targetId={MAGNET_DIRECTORY_ID}');
    expect(landing).toContain('id={MAGNET_DIRECTORY_ID}');
    expect(MAGNET_DIRECTORY_ID).toBe('magnet-directory');
    const cue = read('src', 'components', 'magnet', 'ScrollCue.tsx');
    expect(cue).toContain('data-state="hidden"');
    expect(cue).toContain("set('shown')");
    expect(cue).toContain('scrollHeight > window.innerHeight');
    expect(cue).toContain("window.removeEventListener('scroll', onScroll)");
    expect(cue).toContain("'(prefers-reduced-motion: reduce)'");
    const css = read('src', 'app', 'globals.css');
    expect(css).toContain(".scroll-cue[data-state='gone']");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.scroll-cue \{\s*animation: none;/);
    expect(css).toContain('env(safe-area-inset-bottom)');
  });
});
