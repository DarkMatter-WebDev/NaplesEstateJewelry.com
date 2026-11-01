import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MARKETPLACE_TIMEOUT_MS, isFetchTimeoutError, timeoutLabel } from '@/lib/marketplace-timeout';
import { EtsyApiError, etsyFetch } from '@/lib/etsy/client';
import { EbayApiError, ebayFetch } from '@/lib/ebay/client';

// 2026-09-14: neither marketplace client had a request timeout, so one hung
// connection could stall the 30-minute sales + reconcile sweep. These tests
// pin that every call carries a signal, that a hang becomes a typed,
// non-retryable error the sweeps already know how to log, and that nothing
// retries a timeout (the worst case stays bounded).

/** A fetch that never answers — it only settles when its signal aborts. */
function hangingFetch() {
  return vi.fn((_input: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    if (!signal) return; // would hang forever — the "has a signal" assertion catches this
    signal.addEventListener('abort', () => reject(signal.reason));
  }));
}

describe('isFetchTimeoutError', () => {
  it('recognises the timeout and abort errors fetch throws', () => {
    expect(isFetchTimeoutError(new DOMException('The operation timed out.', 'TimeoutError'))).toBe(true);
    expect(isFetchTimeoutError(new DOMException('aborted', 'AbortError'))).toBe(true);
  });

  it('ignores ordinary failures', () => {
    expect(isFetchTimeoutError(new TypeError('fetch failed'))).toBe(false);
    expect(isFetchTimeoutError(null)).toBe(false);
    expect(isFetchTimeoutError('TimeoutError')).toBe(false);
  });

  it('keeps every limit inside the sweep budgets and labels it in seconds', () => {
    expect(MARKETPLACE_TIMEOUT_MS.api).toBeLessThanOrEqual(15_000);
    expect(MARKETPLACE_TIMEOUT_MS.token).toBeLessThan(MARKETPLACE_TIMEOUT_MS.api);
    expect(MARKETPLACE_TIMEOUT_MS.upload).toBeLessThanOrEqual(30_000);
    expect(timeoutLabel(15_000)).toBe('15 s');
  });
});

describe('etsyFetch — request timeout', () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    process.env.ETSY_API_KEY = 'test-key';
    process.env.ETSY_SHARED_SECRET = 'test-secret';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it('turns a hung request into a non-retryable etsy_timeout error after one attempt', async () => {
    const fetchMock = hangingFetch();
    vi.stubGlobal('fetch', fetchMock);
    const call = etsyFetch({ path: '/v3/application/shops/1/receipts', accessToken: 'token', timeoutMs: 40 });
    await expect(call).rejects.toBeInstanceOf(EtsyApiError);
    await expect(call).rejects.toMatchObject({ code: 'etsy_timeout', retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('says what happened without wording that the sweeps read as a connection problem', async () => {
    vi.stubGlobal('fetch', hangingFetch());
    const error = await etsyFetch({ path: '/v3/application/listings/1', timeoutMs: 40 }).catch((e: unknown) => e) as EtsyApiError;
    expect(error.operatorMessage).toMatch(/did not respond/);
    // lib/etsy/sync.ts isConnectionLevelEtsyError aborts a whole bulk run on these words.
    expect(error.operatorMessage).not.toMatch(/reconnect|not connected|refresh token|shop id/i);
  });

  it('still returns data normally when Etsy answers in time', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ state: 'active' }), { status: 200 })));
    const res = await etsyFetch<{ state: string }>({ path: '/v3/application/listings/1' });
    expect(res.data.state).toBe('active');
  });
});

describe('ebayFetch — request timeout', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('turns a hung request into a non-retryable ebay_timeout error after one attempt', async () => {
    const fetchMock = hangingFetch();
    vi.stubGlobal('fetch', fetchMock);
    const call = ebayFetch({ method: 'GET', path: '/sell/fulfillment/v1/order', accessToken: 'token', timeoutMs: 40 });
    await expect(call).rejects.toBeInstanceOf(EbayApiError);
    await expect(call).rejects.toMatchObject({ code: 'ebay_timeout', retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });

  it('still returns data normally when eBay answers in time', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ orders: [] }), { status: 200 })));
    const res = await ebayFetch<{ orders: unknown[] }>({ method: 'GET', path: '/sell/fulfillment/v1/order' });
    expect(res.data.orders).toEqual([]);
  });
});
