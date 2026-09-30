import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Guards the fix for the 2026-08-21 finding: two sold products stayed live on
 * eBay and Etsy because the auto-delist hook was launched as a bare floating
 * promise and the serverless container froze before it finished. 39 of 41
 * delisted correctly; these two lost the race, silently, leaving no log row.
 *
 * The properties worth failing a build over:
 *  1. The work is handed to `after()` — the only thing the runtime waits for.
 *     A `void promise` is invisible to it.
 *  2. BOTH marketplaces plus Deep Field run, and one failing does not cancel
 *     the others.
 *  3. Failures are LOGGED. The original `.catch(() => {})` is what let this go
 *     unnoticed for twelve days.
 */

const afterCallbacks: Array<() => unknown> = [];
vi.mock('next/server', () => ({
  after: (cb: () => unknown) => { afterCallbacks.push(cb); },
}));

const etsyHandle = vi.fn(async () => {});
const ebayHandle = vi.fn(async () => {});
const etsyScan = vi.fn(async () => {});
const ebayScan = vi.fn(async () => {});
const deepfield = vi.fn(async () => {});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/etsy/sync', () => ({
  handleProductStatusChange: etsyHandle,
  scanAndMarkOutOfDate: etsyScan,
}));
vi.mock('@/lib/ebay/sync', () => ({
  handleProductStatusChange: ebayHandle,
  scanAndMarkOutOfDate: ebayScan,
}));
vi.mock('@/lib/deepfield/sync', () => ({ syncProductsToDeepField: deepfield }));

/** Run whatever was handed to after(), the way the runtime would. */
async function drainAfter() {
  const pending = [...afterCallbacks];
  afterCallbacks.length = 0;
  for (const cb of pending) await cb();
}

beforeEach(() => {
  vi.clearAllMocks();
  afterCallbacks.length = 0;
});

describe('scheduleProductStatusHooks', () => {
  it('defers the work to after(), not a floating promise', async () => {
    const { scheduleProductStatusHooks } = await import('@/lib/product-status-hooks');
    scheduleProductStatusHooks(['p1']);

    // Scheduled, but nothing has run yet — the response still goes out first.
    expect(afterCallbacks).toHaveLength(1);
    expect(ebayHandle).not.toHaveBeenCalled();

    await drainAfter();
    expect(etsyHandle).toHaveBeenCalledWith(['p1']);
    expect(ebayHandle).toHaveBeenCalledWith(['p1']);
    expect(deepfield).toHaveBeenCalledWith(['p1']);
  });

  it('runs the out-of-date scan only when asked', async () => {
    const { scheduleProductStatusHooks } = await import('@/lib/product-status-hooks');

    scheduleProductStatusHooks(['p1']);
    await drainAfter();
    expect(ebayScan).not.toHaveBeenCalled();

    scheduleProductStatusHooks(['p1'], { scanOutOfDate: true });
    await drainAfter();
    expect(etsyScan).toHaveBeenCalledWith(['p1']);
    expect(ebayScan).toHaveBeenCalledWith(['p1']);
  });

  it('one marketplace failing does not cancel the other, and is logged', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    ebayHandle.mockRejectedValueOnce(new Error('eBay is down'));

    const { scheduleProductStatusHooks } = await import('@/lib/product-status-hooks');
    scheduleProductStatusHooks(['p1', 'p2']);
    await expect(drainAfter()).resolves.toBeUndefined();

    // Etsy and Deep Field still ran.
    expect(etsyHandle).toHaveBeenCalledWith(['p1', 'p2']);
    expect(deepfield).toHaveBeenCalledWith(['p1', 'p2']);
    // And the failure was surfaced rather than swallowed.
    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(String(errorLog.mock.calls[0][0])).toContain('ebay:status-change');
    expect(String(errorLog.mock.calls[0][0])).toContain('p1, p2');
    errorLog.mockRestore();
  });

  it('dedupes ids and no-ops on an empty set', async () => {
    const { scheduleProductStatusHooks } = await import('@/lib/product-status-hooks');

    scheduleProductStatusHooks([]);
    scheduleProductStatusHooks(['', null as unknown as string]);
    expect(afterCallbacks).toHaveLength(0);

    scheduleProductStatusHooks(['p1', 'p1', 'p2']);
    await drainAfter();
    expect(ebayHandle).toHaveBeenCalledWith(['p1', 'p2']);
  });
});
