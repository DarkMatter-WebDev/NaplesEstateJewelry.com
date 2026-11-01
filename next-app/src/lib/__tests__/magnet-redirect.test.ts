import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isMagnetPath, MAGNET_DESTINATION, MAGNET_SCAN_ROUTE } from '@/lib/magnet-redirect';
import { isPageScanSource, PAGE_SCAN_SOURCES, SCAN_SOURCE_KEYS, SCAN_SOURCES, shouldCountScan } from '@/lib/scan-sources';
import { CARD_HOLDERS } from '@/lib/card-holders';

vi.mock('server-only', () => ({}));
const insert = vi.fn();
const deleteEq = vi.fn();
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ from: () => ({ insert, delete: () => ({ eq: deleteEq }) }) }),
}));

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

// The vehicle-magnet QR address (2026-10-31). Printed, so it must keep working
// and keep its tags; the destination may change, the 302 may not.
describe('/magnet redirect', () => {
  it('matches /magnet, a trailing slash and any capitalisation only', () => {
    for (const p of ['/magnet', '/magnet/', '/Magnet', '/MAGNET/']) expect(isMagnetPath(p)).toBe(true);
    for (const p of ['/magnets', '/magnet/x', '/es/magnet', '/en/magnet', '/', '/free-evaluation']) {
      expect(isMagnetPath(p)).toBe(false);
    }
  });

  it('points at the canonical free-evaluation page with the three UTM tags', () => {
    const url = new URL(MAGNET_DESTINATION);
    expect(url.origin).toBe('https://naplesestatejewelry.com');
    expect(url.pathname).toBe('/free-evaluation');
    expect(url.searchParams.get('utm_source')).toBe('car_magnet');
    expect(url.searchParams.get('utm_medium')).toBe('qr');
    expect(url.searchParams.get('utm_campaign')).toBe('vehicle_magnets');
  });

  it('is handed to the counting route in the proxy, before the locale rewrite', () => {
    const proxy = read('src', 'proxy.ts');
    expect(MAGNET_SCAN_ROUTE).toBe('/api/magnet');
    expect(proxy).toContain('NextResponse.rewrite(new URL(MAGNET_SCAN_ROUTE, request.url))');
    expect(proxy.indexOf('isMagnetPath(pathname)')).toBeLessThan(proxy.indexOf('url.pathname = `/en'));
    // The proxy runs on the edge: nothing server-only may be imported on that path.
    expect(proxy).not.toMatch(/from '.*qr-scans'/);
    expect(read('src', 'lib', 'magnet-redirect.ts')).not.toMatch(/^import /m);
    expect(read('src', 'lib', 'scan-sources.ts')).not.toMatch(/^import /m);
  });

  it('the route counts as "magnet", answers a 302, never cached, and HEAD is not counted', () => {
    const route = read('src', 'app', 'api', 'magnet', 'route.ts');
    expect(route).toContain("recordScan('magnet')");
    expect(route).toContain('NextResponse.redirect(MAGNET_DESTINATION, 302)');
    expect(route).toContain("'Cache-Control', 'no-store'");
    expect(route).toContain("'Netlify-CDN-Cache-Control', 'no-store'");
    const head = route.slice(route.indexOf('export function HEAD'));
    expect(head).not.toContain('recordScan');
  });

  it('hides the cookie notice for magnet arrivals on the landing page only — never as consent', () => {
    const layout = read('src', 'app', '[locale]', 'layout.tsx');
    const source = new URL(MAGNET_DESTINATION).searchParams.get('utm_source');
    expect(source).toBe('car_magnet');
    const script = layout.match(/__html: `([^`]*data-nej-magnet[^`]*)`/)?.[1] ?? '';
    expect(script).toContain(`utm_source=${source}(&|$)`);
    expect(script).toContain("setAttribute('data-nej-magnet','')");
    expect(script).not.toMatch(/localStorage|data-nej-cookies-ok/);
    expect(read('src', 'app', 'globals.css')).toContain(
      'html[data-nej-magnet] body:has(main[data-magnet-landing]) [data-cookie-notice]',
    );
    expect(read('src', 'app', '[locale]', 'free-evaluation', 'page.tsx')).toMatch(/<main [^>]*data-magnet-landing[ >]/);
  });

  it('stays out of the sitemap', () => {
    expect(read('src', 'app', 'sitemap.ts')).not.toMatch(/magnet/i);
  });
});

describe('QR scan counting (magnet + cards)', () => {
  afterEach(() => {
    insert.mockReset();
    vi.useRealTimers();
  });

  it('lists the three printed codes, and only the cards may report from a page', () => {
    expect(SCAN_SOURCE_KEYS).toEqual(['magnet', 'card', 'kittcard']);
    expect(SCAN_SOURCES.card.path).toBe(CARD_HOLDERS.card.path);
    expect(SCAN_SOURCES.kittcard.path).toBe(CARD_HOLDERS.kittcard.path);
    expect([...PAGE_SCAN_SOURCES]).toEqual(['card', 'kittcard']);
    expect(isPageScanSource('card')).toBe(true);
    expect(isPageScanSource('magnet')).toBe(false); // counted server side only
    expect(isPageScanSource('anything')).toBe(false);
    for (const key of SCAN_SOURCE_KEYS) expect(key).toMatch(/^[a-z0-9_-]{1,40}$/); // the SQL check constraint
    // This project never grants new tables to service_role on its own (live 42501, 10-31).
    const sql = read('..', 'supabase', 'qr-scans-2026-10.sql');
    // DELETE since 10-31: Insights' per-code Clear button.
    expect(sql).toContain('grant select, insert, delete on public.qr_scans to service_role;');
    expect(sql).toContain('revoke all on public.qr_scans from anon, authenticated;');
  });

  it('counts phones, not bots, previews, test tools or empty user agents', () => {
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
    const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
    expect(shouldCountScan(iphone)).toBe(true);
    expect(shouldCountScan(android)).toBe(true);
    for (const ua of ['curl/8.9.1', 'Googlebot/2.1', 'facebookexternalhit/1.1', 'WhatsApp/2.23', 'Slackbot-LinkExpanding 1.0', 'Mozilla/5.0 HeadlessChrome/129', '', '   ', null, undefined]) {
      expect(shouldCountScan(ua)).toBe(false);
    }
  });

  it('saves one row with the source and the time only', async () => {
    insert.mockResolvedValue({ error: null });
    const { recordScan } = await import('@/lib/qr-scans');
    await expect(recordScan('card')).resolves.toBe(true);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(Object.keys(insert.mock.calls[0][0]).sort()).toEqual(['scanned_at', 'source']);
    expect(insert.mock.calls[0][0].source).toBe('card');
  });

  it('never throws and never holds a response past the timeout', async () => {
    const { recordScan } = await import('@/lib/qr-scans');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    insert.mockResolvedValue({ error: { code: 'PGRST205', message: 'table not found' } });
    await expect(recordScan('magnet')).resolves.toBe(false);
    insert.mockRejectedValue(new Error('network'));
    await expect(recordScan('magnet')).resolves.toBe(false);
    vi.useFakeTimers();
    insert.mockReturnValue(new Promise(() => {}));
    const pending = recordScan('magnet');
    await vi.advanceTimersByTimeAsync(1600);
    await expect(pending).resolves.toBe(false);
  });

  it('the page ping endpoint accepts only page sources, filters bots and always answers 204', () => {
    const route = read('src', 'app', 'api', 'scan', 'route.ts');
    expect(route).toContain('isPageScanSource(source) && shouldCountScan(');
    expect(route).toContain('status: 204');
    expect(route).toContain('.slice(0, 200)');
  });

  it('both card pages ping once per tab with their own key, and send nothing about the visitor', () => {
    const landing = read('src', 'components', 'card', 'CardLanding.tsx');
    expect(landing).toContain('<ScanBeacon source={holder.key} />');
    const beacon = read('src', 'components', 'ScanBeacon.tsx');
    expect(beacon).toContain('sessionStorage');
    expect(beacon).toContain("'/api/scan'");
    expect(beacon).toContain('JSON.stringify({ source })');
  });

  it('Admin → Insights lists every source and is in the admin menu', () => {
    const page = read('src', 'app', '[locale]', 'admin', 'insights', 'page.tsx');
    expect(page).toContain('SCAN_SOURCE_KEYS.map');
    expect(page).toContain('getScanSummaries()');
    // Owner 10-31: every scan's own time, grouped by page (one block per source).
    expect(page).toContain('getRecentScans()');
    expect(page).toContain('<time dateTime={iso}>{easternFull.format(new Date(iso))}</time>');
    expect(page).toMatch(/timeZone: 'America\/New_York'/);
    const qr = read('src', 'lib', 'qr-scans.ts');
    expect(qr).toMatch(/\.eq\('source', source\)\s*\.order\('scanned_at', \{ ascending: false \}\)\s*\.limit\(limitPerSource\)/);
    expect(page).toContain("is_admin");
    expect(page).toContain('qr-scans-2026-10.sql');
    const header = read('src', 'components', 'admin', 'AdminHeader.tsx');
    expect(header).toContain('`${adminBasePath}/insights`');
    expect(read('src', 'app', '[locale]', 'admin', 'marketing', 'page.tsx')).not.toMatch(/scan/i);
  });

  // Owner 10-31: "add a button to individually clear each page's visit counter".
  it('Clear deletes only the one code it is pressed for', async () => {
    const { clearScans } = await import('@/lib/qr-scans');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    deleteEq.mockReturnValue({ select: () => Promise.resolve({ data: [{ id: 1 }, { id: 2 }], error: null }) });
    await expect(clearScans('card')).resolves.toEqual({ removed: 2 });
    expect(deleteEq).toHaveBeenCalledWith('source', 'card');
    // The missing grant gets a plain instruction, not a database code.
    deleteEq.mockReturnValue({ select: () => Promise.resolve({ data: null, error: { code: '42501', message: 'permission denied' } }) });
    const refused = await clearScans('magnet');
    expect('error' in refused && refused.error).toContain('qr-scans-2026-10.sql');
  });

  it('Clear is admin-only, accepts only known codes, asks first, and shows only when there are scans', () => {
    const route = read('src', 'app', 'api', 'admin', 'insights', 'scans', '[source]', 'route.ts');
    expect(route).toContain('await requireAdmin()');
    expect(route).toContain('SCAN_SOURCE_KEYS as string[]).includes(source)');
    const button = read('src', 'components', 'admin', 'ClearScansButton.tsx');
    expect(button).toContain('window.confirm(');
    expect(button).toContain("method: 'DELETE'");
    expect(button).toContain('router.refresh()');
    const page = read('src', 'app', '[locale]', 'admin', 'insights', 'page.tsx');
    expect(page).toContain('{total > 0 && <ClearScansButton source={source}');
  });
});
