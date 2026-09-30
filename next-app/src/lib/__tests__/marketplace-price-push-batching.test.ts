import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Guards the two properties that made the scheduled eBay price push time out
 * on 2026-08-21, and that had been silently deferring 15-18 Etsy listings a
 * day since 2026-08-20:
 *
 *  1. Bookkeeping is BATCHED. Recording a push used to cost two awaited
 *     Supabase round-trips per listing. eBay itself was never slow - 50 prices
 *     go up in two bulk calls - but 100 serialized round-trips at ~157ms each
 *     burned 15.7s of a 22.2s run.
 *  2. The time budget is an ABSOLUTE deadline stamped at request entry, not a
 *     duration measured from inside the push loop. The old budget could not
 *     bound the request, because setup (spot fetch, connection read, listing
 *     and product queries) fell outside it. Setup ran ~10s, the loop then used
 *     its full 22s, and the 32s total drew a gateway 504 AFTER every price had
 *     already been pushed - the work succeeded and the job still went red.
 *
 * Both properties fail against the pre-fix code: it wrote once per listing,
 * and it pushed everything regardless of how long setup took.
 */

const SPOT = {
  goldPerTroyOz: 4343.299805,
  silverPerTroyOz: 63.707001,
  fetchedAt: 1786146956481,
  source: 'api' as const,
};

/** Advanced by the mocked setup calls so a test can spend the deadline before the loop starts. */
let setupCostMs = 0;

const ebayStore = {
  bulkPatchListings: vi.fn(async () => {}),
  insertSyncLogs: vi.fn(async () => {}),
  insertSyncLog: vi.fn(async () => {}),
  upsertListing: vi.fn(async () => ({})),
  pruneOldSyncLogs: vi.fn(async () => { vi.advanceTimersByTime(setupCostMs); }),
  getConnection: vi.fn(async () => ({
    id: 1,
    status: 'connected',
    price_push_enabled: true,
    price_push_threshold_pct: 1,
    price_markup_pct: 15,
    fulfillment_policy_id: 'f',
    express_fulfillment_policy_id: null,
    high_value_shipping_threshold: null,
    payment_policy_id: 'p',
    return_policy_id: 'r',
    merchant_location_key: 'm',
    marketplace_id: 'EBAY_US',
    selling_limit_amount: null,
    selling_limit_quantity: null,
    sold_handling: 'withdraw',
  })),
  getListing: vi.fn(),
  claimNextPendingListing: vi.fn(),
  claimNextReviewListing: vi.fn(),
  countPendingListings: vi.fn(),
  countReviewListings: vi.fn(),
};

const etsyStore = {
  bulkPatchListings: vi.fn(async () => {}),
  insertSyncLogs: vi.fn(async () => {}),
  insertSyncLog: vi.fn(async () => {}),
  upsertListing: vi.fn(async () => ({})),
  pruneOldSyncLogs: vi.fn(async () => { vi.advanceTimersByTime(setupCostMs); }),
  getConnection: vi.fn(async () => ({
    id: 1,
    status: 'connected',
    price_push_enabled: true,
    price_push_threshold_pct: 1,
    price_markup_pct: 15,
    readiness_state_id: 1,
    shop_id: 7,
  })),
};

let listingRows: unknown[] = [];
let productRows: unknown[] = [];

/** in() must be awaitable (the products query) and chainable (the listings query adds order()). */
function inResult(rows: unknown[]) {
  const promise = Promise.resolve({ data: rows, error: null }) as Promise<unknown> & {
    order?: () => Promise<unknown>;
  };
  promise.order = () => Promise.resolve({ data: rows, error: null });
  return promise;
}

vi.mock('server-only', () => ({}));
vi.mock('@/lib/spot-price', () => ({ fetchSpotData: async () => SPOT }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      select: () => ({ in: () => inResult(table === 'products' ? productRows : listingRows) }),
    }),
  }),
}));

class FakeEbayApiError extends Error {
  status = 400; code = 'x'; operatorMessage = 'x'; retryable = false;
  errorId = 1; category = 'REQUEST'; detail = {};
}
vi.mock('@/lib/ebay/client', () => ({
  EbayApiError: FakeEbayApiError,
  ebayFetch: vi.fn(async ({ json }: { json: { requests: Array<{ sku: string }> } }) => ({
    data: { responses: json.requests.map((r) => ({ sku: r.sku, statusCode: 200 })) },
    headers: new Headers(),
  })),
  ebayTradingGetItemStatus: vi.fn(),
}));
vi.mock('@/lib/ebay/auth', () => ({ ensureFreshAccessToken: async () => ({ accessToken: 'tok' }) }));
vi.mock('@/lib/ebay/store', () => ebayStore);

class FakeEtsyApiError extends Error {
  status = 400; code = 'x'; operatorMessage = 'x'; detail = {};
}
vi.mock('@/lib/etsy/client', () => ({
  EtsyApiError: FakeEtsyApiError,
  etsyFetch: vi.fn(async () => ({ data: {}, headers: new Headers() })),
}));
vi.mock('@/lib/etsy/auth', () => ({
  ensureFreshAccessToken: async () => ({ accessToken: 'tok', shopId: 7 }),
}));
vi.mock('@/lib/etsy/store', () => etsyStore);

function productRow(n: number) {
  return {
    id: `p${n}`,
    status: 'available',
    quantity: 1,
    category: 'Silver',
    price_mode: 'spot-multiplier',
    pricing_multiplier: 1.25,
    purity: 925,
    gram_weight: 50,
    weight_grams: 50,
    manual_price_label: null,
    sold_price: null,
  };
}

function seedEbay(count: number) {
  listingRows = Array.from({ length: count }, (_, i) => ({
    product_id: `p${i}`,
    ebay_sku: `SKU${i}`,
    ebay_offer_id: `offer-${i}`,
    ebay_listing_id: `listing-${i}`,
    sync_state: 'published',
    last_pushed_price: 1, // far below the computed price, so every row is a candidate
    last_pushed_qty: 1,
    error_count: 0,
    last_error: null,
  }));
  productRows = Array.from({ length: count }, (_, i) => productRow(i));
}

function seedEtsy(count: number) {
  listingRows = Array.from({ length: count }, (_, i) => ({
    product_id: `p${i}`,
    etsy_listing_id: 1000 + i,
    sync_state: 'active',
    last_pushed_price: 1,
    error_count: 0,
    last_error: null,
  }));
  productRows = Array.from({ length: count }, (_, i) => productRow(i));
}

function patchedProductIds(mock: { mock: { calls: unknown[][] } }): string[] {
  return mock.mock.calls.flatMap(
    (call) => (call[1] as Array<{ product_id: string }>).map((patch) => patch.product_id),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  setupCostMs = 0;
});

describe('eBay scheduled price push', () => {
  it('records 30 pushes in a handful of writes, not one pair per listing', async () => {
    seedEbay(30);
    const { runScheduledPricePush } = await import('@/lib/ebay/sync');
    const result = await runScheduledPricePush();

    expect(result.pushed).toBe(30);
    expect(result.remaining).toBe(0);
    // 30 candidates = two chunks (25 + 5) = two writes each, not 30.
    expect(ebayStore.bulkPatchListings).toHaveBeenCalledTimes(2);
    expect(ebayStore.insertSyncLogs).toHaveBeenCalledTimes(2);
    // Every listing is still recorded exactly once, across those two calls.
    const patched = patchedProductIds(ebayStore.bulkPatchListings);
    expect(patched).toHaveLength(30);
    expect(new Set(patched).size).toBe(30);
  });

  it('counts SETUP time against the deadline, not just the push loop', async () => {
    seedEbay(30);
    setupCostMs = 21_000; // longer than the 20s request budget
    const { runScheduledPricePush } = await import('@/lib/ebay/sync');
    const result = await runScheduledPricePush();

    // The first chunk always runs, so a slow day still makes progress...
    expect(result.pushed).toBe(25);
    // ...but the rest defers instead of overrunning the gateway.
    expect(result.remaining).toBe(5);
    expect(result.done).toBe(false);
  });
});

describe('Etsy scheduled price push', () => {
  it('batches bookkeeping instead of writing twice per listing', async () => {
    seedEtsy(30);
    const { runScheduledPricePush } = await import('@/lib/etsy/sync');
    const result = await runScheduledPricePush();

    expect(result.pushed).toBe(30);
    // Flushes at 25 and once more at the end - not 30 separate write pairs.
    expect(etsyStore.bulkPatchListings).toHaveBeenCalledTimes(2);
    expect(etsyStore.insertSyncLogs).toHaveBeenCalledTimes(2);
    expect(patchedProductIds(etsyStore.bulkPatchListings)).toHaveLength(30);
  });

  it('counts SETUP time against the deadline', async () => {
    seedEtsy(30);
    setupCostMs = 21_000;
    const { runScheduledPricePush } = await import('@/lib/etsy/sync');
    const result = await runScheduledPricePush();

    // Etsy checks per item, so exactly one listing gets through.
    expect(result.pushed).toBe(1);
    expect(result.remaining).toBe(29);
  });
});
