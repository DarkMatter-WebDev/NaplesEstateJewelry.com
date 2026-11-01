import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The module reads env at call time via getConfig(), so these can be flipped
// per test. Supabase and spot are mocked so nothing touches the network or a
// real database.
const selectIn = vi.fn();
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => ({ select: () => ({ in: selectIn }) }),
  }),
}));
vi.mock('@/lib/spot-price', () => ({
  fetchSpotData: async () => ({
    goldPerTroyOz: 4343.299805,
    silverPerTroyOz: 63.707001,
    fetchedAt: 1786146956481,
    source: 'api' as const,
  }),
}));

const {
  syncProductsToDeepField, isDeepFieldSyncConfigured,
  IMAGE_BUDGET_PER_REQUEST, MAX_PRODUCTS_PER_REQUEST,
} = await import('@/lib/deepfield/sync');

function productRow(id: string) {
  return {
    id,
    status: 'available',
    category: 'Gold',
    price_mode: 'manual',
    manual_price_label: '$100',
    purity: 14,
    gram_weight: 10,
    weight_grams: 10,
    pricing_multiplier: 1.25,
    images: [],
    image_urls: [],
    // Internal fields that must never be transmitted.
    cost_basis: 1,
    minimum_price: 2,
    internal_notes: 'private',
    acquisition_source: 'private',
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  delete process.env.DEEPFIELD_SYNC_URL;
  delete process.env.DEEPFIELD_SYNC_TOKEN;
  delete process.env.DEEPFIELD_SYNC_DRY_RUN;
  // Keep retry backoff out of the suite's wall-clock.
  process.env.DEEPFIELD_SYNC_RETRY_DELAY_MS = '0';
  selectIn.mockReset();
  selectIn.mockResolvedValue({ data: [productRow('a')], error: null });
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ imported: 1, failed: 0, success: true, results: [] }),
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('deep field sync is inert unless configured', () => {
  it('sends nothing and reads nothing when both vars are unset', async () => {
    expect(isDeepFieldSyncConfigured()).toBe(false);
    await syncProductsToDeepField(['a']);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(selectIn).not.toHaveBeenCalled();
  });

  it('stays inert when only the URL is set', async () => {
    process.env.DEEPFIELD_SYNC_URL = 'https://example.test/receiver';
    await syncProductsToDeepField(['a']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stays inert when only the token is set', async () => {
    process.env.DEEPFIELD_SYNC_TOKEN = 'tok';
    await syncProductsToDeepField(['a']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing for an empty id list even when configured', async () => {
    process.env.DEEPFIELD_SYNC_URL = 'https://example.test/receiver';
    process.env.DEEPFIELD_SYNC_TOKEN = 'tok';
    await syncProductsToDeepField([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('deep field sync when configured', () => {
  beforeEach(() => {
    process.env.DEEPFIELD_SYNC_URL = 'https://example.test/receiver';
    process.env.DEEPFIELD_SYNC_TOKEN = 'tok';
  });

  it('posts with bearer auth and a live-import body', async () => {
    await syncProductsToDeepField(['a']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.test/receiver');
    expect(init.headers.Authorization).toBe('Bearer tok');
    const body = JSON.parse(init.body);
    expect(body.copyImages).toBe(true);
    expect(body.dryRun).toBeUndefined();
    expect(body.products).toHaveLength(1);
  });

  it('sends a dry-run body when the flag is exactly "true"', async () => {
    process.env.DEEPFIELD_SYNC_DRY_RUN = 'true';
    await syncProductsToDeepField(['a']);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.dryRun).toBe(true);
    expect(body.copyImages).toBe(false);
  });

  it('treats any other flag value as live, so a typo cannot silently disable it', async () => {
    for (const value of ['1', 'yes', 'TRUE_ISH', '']) {
      fetchMock.mockClear();
      process.env.DEEPFIELD_SYNC_DRY_RUN = value;
      await syncProductsToDeepField(['a']);
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.dryRun, `value ${JSON.stringify(value)}`).toBeUndefined();
    }
  });

  it('never transmits internal fields', async () => {
    await syncProductsToDeepField(['a']);
    const raw = fetchMock.mock.calls[0][1].body as string;
    for (const forbidden of [
      'cost_basis', 'minimum_price', 'internal_notes', 'acquisition_source',
      'private_price_label', 'live_spot_snapshot', 'acquisition_date',
      'reserved_until', 'reserved_order_id', 'price_label',
    ]) {
      expect(raw, `payload must not contain ${forbidden}`).not.toContain(`"${forbidden}"`);
    }
  });

  // Superseded 2026-08-08: this used to assert archived products were NEVER
  // pushed. Filtering them out meant archiving a product told Deep Field
  // nothing, so it kept showing an item the storefront had already removed,
  // silently. Proven live with `test-item-111-131`. They are now pushed
  // CARRYING their archived status so the partner can hide them.
  it('pushes an archived product so the partner can hide it', async () => {
    selectIn.mockResolvedValue({
      data: [{ ...productRow('a'), status: 'archived' }],
      error: null,
    });
    await syncProductsToDeepField(['a']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.products).toHaveLength(1);
    expect(body.products[0].status).toBe('archived');
    expect(body.products[0].id).toBe('a');
  });

  it('normalizes a legacy title-case status on the way out', async () => {
    selectIn.mockResolvedValue({ data: [{ ...productRow('a'), status: 'Sold' }], error: null });
    await syncProductsToDeepField(['a']);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).products[0].status).toBe('sold');
  });

  it('still sends an archived product alongside live ones in one batch', async () => {
    selectIn.mockResolvedValue({
      data: [productRow('live'), { ...productRow('gone'), status: 'archived' }],
      error: null,
    });
    await syncProductsToDeepField(['live', 'gone']);
    const sent = fetchMock.mock.calls
      .flatMap((c) => JSON.parse(c[1].body).products)
      .map((p: { id: string; status: string }) => [p.id, p.status]);
    expect(sent).toEqual(expect.arrayContaining([['live', 'available'], ['gone', 'archived']]));
  });

  // Superseded 2026-08-08: this used to assert 25 products per request, which
  // is Deep Field's advertised cap but is NOT reachable in production. The
  // receiver copies images synchronously at ~1.2s each, so 25 products (~190
  // images) is ~4 minutes in one HTTP call and dies at a gateway timeout.
  // Batching is now budgeted by IMAGE count, capped at 3 products.
  it('caps products per request even when they carry no images', async () => {
    selectIn.mockResolvedValue({
      data: Array.from({ length: 53 }, (_, i) => productRow(`p${i}`)),
      error: null,
    });
    await syncProductsToDeepField(Array.from({ length: 53 }, (_, i) => `p${i}`));
    const sizes = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body).products.length);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(3);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(53);
  });

  // Asserts against the EXPORTED budget rather than a hardcoded number. A
  // literal here silently becomes a lie the moment the constant is retuned —
  // which is exactly what happened when the budget moved 18 -> 30.
  it('splits on the IMAGE budget, not the product count', async () => {
    // 7 + 14 + 17 = 38, the exact group that hit a gateway timeout during the
    // bulk import. It must never travel as one request at any sane budget.
    const withImages = (id: string, n: number) => ({
      ...productRow(id),
      images: Array.from({ length: n }, (_, i) => `https://example.test/${id}-${i}.webp`),
    });
    selectIn.mockResolvedValue({
      data: [withImages('a', 7), withImages('b', 14), withImages('c', 17)],
      error: null,
    });
    await syncProductsToDeepField(['a', 'b', 'c']);

    const batches = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body).products);
    const imagesIn = (b: { images: string[] }[]) =>
      b.reduce((n, p) => n + p.images.length, 0);

    expect(batches.length).toBeGreaterThan(1);
    for (const batch of batches) {
      // Within budget, or a single oversized product travelling alone.
      expect(imagesIn(batch) <= IMAGE_BUDGET_PER_REQUEST || batch.length === 1).toBe(true);
      expect(batch.length).toBeLessThanOrEqual(MAX_PRODUCTS_PER_REQUEST);
    }
    // The 38-image group is never reassembled into one request.
    expect(batches.some((b) => imagesIn(b) === 38)).toBe(false);
    // Nothing dropped.
    expect(batches.flat().map((p: { id: string }) => p.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('retries a 5xx and succeeds without the caller ever knowing', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 504, text: async () => 'gateway timeout' })
      .mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ imported: 1, failed: 0, success: true, results: [] }),
      });
    await expect(syncProductsToDeepField(['a'])).resolves.toBeUndefined();
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('does NOT retry a 4xx, because a rejection will not fix itself', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => 'bad request' });
    await syncProductsToDeepField(['a']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('deep field sync never throws into its caller', () => {
  beforeEach(() => {
    process.env.DEEPFIELD_SYNC_URL = 'https://example.test/receiver';
    process.env.DEEPFIELD_SYNC_TOKEN = 'tok';
  });

  it('swallows a network failure', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(syncProductsToDeepField(['a'])).resolves.toBeUndefined();
  });

  it('swallows a database failure', async () => {
    selectIn.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(syncProductsToDeepField(['a'])).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('swallows a non-2xx receiver response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'server error' });
    await expect(syncProductsToDeepField(['a'])).resolves.toBeUndefined();
  });

});
