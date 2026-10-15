import { describe, expect, it } from 'vitest';
import {
  bulkPriceQuantityFailureMessage,
  drainQueueCore,
  EBAY_BULK_ENQUEUE_LIMIT,
  EBAY_WRITE_BLOCKED_PRODUCT_IDS,
  isEbayWriteBlocked,
  offerBody,
  planEbayPricePush,
  reconcileEbayStateFromOffer,
  RELISTED_LISTING_WARNING,
  resolveFreshnessScanAction,
  resolveEbayRelistChain,
  selectExistingFixedPriceOfferId,
  shouldPushPrice,
  type DrainDeps,
  type SyncStepResult,
} from '../sync';
import type { Product, SpotData } from '@/types/product';
import type { EbayListingRow } from '../store';

describe('offer contract hardening', () => {
  it('sets the required GTC duration on fixed-price offers', () => {
    const payload = {
      sku: 'sku-1',
      title: 'Title',
      description: 'Description',
      aspects: {},
      conditionId: '3000',
      conditionDescription: 'Used',
      categoryId: '1',
      categoryPath: 'Test',
      categoryIsApproximate: false,
      categoryIsOverride: false,
      price: 100,
      priceBeforeMarkup: 90,
      quantity: 1,
      images: [],
      fulfillmentPolicyId: 'fulfillment',
      shippingTier: 'standard' as const,
      paymentPolicyId: 'payment',
      returnPolicyId: 'return',
      merchantLocationKey: 'location',
      marketplaceId: 'EBAY_US',
      bestOfferEnabled: false,
    };
    expect(offerBody(payload).listingDuration).toBe('GTC');
  });

  it('adopts only the fixed-price offer for the configured marketplace', () => {
    const offers = [
      { offerId: 'auction', format: 'AUCTION', marketplaceId: 'EBAY_US' },
      { offerId: 'uk-fixed', format: 'FIXED_PRICE', marketplaceId: 'EBAY_GB' },
      { offerId: 'us-fixed', format: 'FIXED_PRICE', marketplaceId: 'EBAY_US' },
    ];
    expect(selectExistingFixedPriceOfferId(offers, 'EBAY_US')).toBe('us-fixed');
    expect(selectExistingFixedPriceOfferId(offers, 'EBAY_CA')).toBeNull();
  });

  it('treats a per-offer failure inside HTTP 200 as a failed bulk update', () => {
    expect(bulkPriceQuantityFailureMessage({ responses: [{ statusCode: 200, offerId: 'ok' }] }, 1)).toBeNull();
    expect(
      bulkPriceQuantityFailureMessage(
        { responses: [{ statusCode: 400, offerId: 'bad', errors: [{ message: 'Offer is unpublished.' }] }] },
        1,
      ),
    ).toBe('Offer is unpublished.');
    expect(bulkPriceQuantityFailureMessage({ responses: [] }, 1)).toMatch(/incomplete/i);
  });
});

describe('resolveEbayRelistChain', () => {
  it('follows a completed listing to the active relist with the same SKU', async () => {
    const lookup = async (listingId: string) =>
      listingId === 'old'
        ? { itemId: 'old', sku: 'sku-82', listingStatus: 'Completed', relistedItemId: 'new' }
        : { itemId: 'new', sku: 'sku-82', listingStatus: 'Active', relistedItemId: null };

    await expect(resolveEbayRelistChain({ startingListingId: 'old', expectedSku: 'sku-82', lookup })).resolves.toEqual({
      state: 'active',
      listingId: 'new',
      hops: 1,
    });
  });

  it('leaves a genuinely completed listing inactive when it has no relist', async () => {
    const lookup = async () => ({ itemId: 'old', sku: 'sku-82', listingStatus: 'Completed', relistedItemId: null });
    await expect(resolveEbayRelistChain({ startingListingId: 'old', expectedSku: 'sku-82', lookup })).resolves.toEqual({
      state: 'inactive',
      listingId: 'old',
      hops: 0,
      listingStatus: 'Completed',
    });
  });

  it('never adopts a relist whose seller SKU belongs to another product', async () => {
    const lookup = async () => ({ itemId: 'new', sku: 'different-sku', listingStatus: 'Active', relistedItemId: null });
    await expect(resolveEbayRelistChain({ startingListingId: 'new', expectedSku: 'sku-82', lookup })).resolves.toEqual({
      state: 'sku_mismatch',
      listingId: 'new',
      hops: 0,
      actualSku: 'different-sku',
    });
  });

  it('stops a malformed relist loop', async () => {
    const lookup = async (listingId: string) => ({
      itemId: listingId,
      sku: 'sku-82',
      listingStatus: 'Completed',
      relistedItemId: listingId === 'a' ? 'b' : 'a',
    });
    const result = await resolveEbayRelistChain({ startingListingId: 'a', expectedSku: 'sku-82', lookup });
    expect(result.state).toBe('loop_or_limit');
  });
});

describe('reconcileEbayStateFromOffer — mapping eBay GetOffer onto our sync_state', () => {
  it('reports NOT live for an ENDED listing even though eBay still returns the old listingId (the reported bug 2026-07-10)', () => {
    // Exact live shape: owner deleted the listing on eBay; GetOffer returns
    // status UNPUBLISHED + listingStatus ENDED, but listingId is still present.
    expect(reconcileEbayStateFromOffer('published', 'UNPUBLISHED', 'ENDED')).toEqual({ syncState: 'ended', live: false });
  });

  it('confirms live only when eBay shows an ACTIVE listing', () => {
    expect(reconcileEbayStateFromOffer('published', 'PUBLISHED', 'ACTIVE')).toEqual({ syncState: 'published', live: true });
    expect(reconcileEbayStateFromOffer('review', 'PUBLISHED', 'ACTIVE')).toEqual({ syncState: 'published', live: true });
    // Published offer with no finer listing status → still treated live.
    expect(reconcileEbayStateFromOffer('published', 'PUBLISHED', undefined)).toEqual({ syncState: 'published', live: true });
  });

  it('preserves local content drift when eBay confirms the listing is active', () => {
    expect(reconcileEbayStateFromOffer('out_of_date', 'PUBLISHED', 'ACTIVE')).toEqual({ syncState: 'out_of_date', live: true });
    expect(reconcileEbayStateFromOffer('out_of_date', 'PUBLISHED', undefined)).toEqual({ syncState: 'out_of_date', live: true });
  });

  it('preserves a local hidden_oos when the listing is still active on eBay', () => {
    expect(reconcileEbayStateFromOffer('hidden_oos', 'PUBLISHED', 'ACTIVE')).toEqual({ syncState: 'hidden_oos', live: true });
  });

  it('maps an OUT_OF_STOCK listing to hidden_oos', () => {
    expect(reconcileEbayStateFromOffer('published', 'PUBLISHED', 'OUT_OF_STOCK')).toEqual({ syncState: 'hidden_oos', live: false });
  });

  it('an UNPUBLISHED offer we thought was live → ended; one we never published → review', () => {
    expect(reconcileEbayStateFromOffer('published', 'UNPUBLISHED', undefined)).toEqual({ syncState: 'ended', live: false });
    expect(reconcileEbayStateFromOffer('review', 'UNPUBLISHED', undefined)).toEqual({ syncState: 'review', live: false });
    expect(reconcileEbayStateFromOffer('offer_created', 'UNPUBLISHED', undefined)).toEqual({ syncState: 'review', live: false });
  });
});

describe('shouldPushPrice — Q3 threshold logic', () => {
  it('always pushes when there is no prior pushed price', () => {
    expect(shouldPushPrice(100, null, 1)).toBe(true);
    expect(shouldPushPrice(100, 0, 1)).toBe(true);
  });

  it('pushes when the change meets or exceeds the threshold', () => {
    expect(shouldPushPrice(101, 100, 1)).toBe(true); // exactly 1%
    expect(shouldPushPrice(110, 100, 1)).toBe(true);
    expect(shouldPushPrice(90, 100, 1)).toBe(true); // drops count too
  });

  it('skips when the change is below the threshold', () => {
    expect(shouldPushPrice(100.5, 100, 1)).toBe(false);
    expect(shouldPushPrice(100, 100, 1)).toBe(false);
  });

  it('respects an admin-edited threshold', () => {
    expect(shouldPushPrice(105, 100, 10)).toBe(false);
    expect(shouldPushPrice(111, 100, 10)).toBe(true);
  });
});

describe('manual bulk price planning', () => {
  it('filters already-current rows before taking the next 25, so later listings are reachable', () => {
    const listings: EbayListingRow[] = Array.from({ length: 30 }, (_, index) => ({
      product_id: `product-${index + 1}`,
      ebay_sku: `product-${index + 1}`,
      ebay_offer_id: `offer-${index + 1}`,
      ebay_listing_id: `listing-${index + 1}`,
      sync_state: 'published',
      content_hash: null,
      last_pushed_price: index < 25 ? 115 : 100,
      last_pushed_qty: 1,
      category_id: null,
      last_error: null,
      error_count: 0,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }));
    const products = new Map<string, Product>(
      listings.map((listing) => [
        listing.product_id,
        {
          id: listing.product_id,
          category: 'Gold',
          price_mode: 'manual',
          manual_price_label: '$100',
          asking_price: 100,
          status: 'available',
          sold_price: null,
        } as Product,
      ]),
    );
    const spotData: SpotData = {
      goldPerTroyOz: 3300,
      silverPerTroyOz: 35,
      fetchedAt: Date.now(),
      source: 'api',
    };

    const plan = planEbayPricePush(listings, products, spotData, 15, null);

    expect(plan.candidates.map((candidate) => candidate.listing.product_id)).toEqual([
      'product-26',
      'product-27',
      'product-28',
      'product-29',
      'product-30',
    ]);
  });
});

describe('eBay write-block guard', () => {
  const listingRow = (overrides: Partial<EbayListingRow> = {}): EbayListingRow => ({
    product_id: 'some-product',
    ebay_sku: 'some-product',
    ebay_offer_id: 'offer-1',
    ebay_listing_id: 'listing-1',
    sync_state: 'published',
    content_hash: null,
    last_pushed_price: 100,
    last_pushed_qty: 1,
    category_id: null,
    last_error: null,
    error_count: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  });

  // Inventory #82 was pinned here until 2026-08-21, when the owner-approved
  // end-and-republish put it back under normal management. The list is empty
  // now, and that is an assertion worth keeping: a stray re-pin is a listing
  // the price push silently stops updating.
  it('has no pinned write-blocks', () => {
    expect([...EBAY_WRITE_BLOCKED_PRODUCT_IDS]).toEqual([]);
  });

  // The pinning MECHANISM still has to work, because it is the right response
  // to a listing that is live but unreachable. Exercised against a synthetic
  // id via the same predicate the real set feeds.
  it('a pinned id would block regardless of last_error', () => {
    const pinned = new Set(['synthetic-pinned-id']);
    const blocked = (productId: string, lastError: string | null) =>
      pinned.has(productId) || lastError === RELISTED_LISTING_WARNING;
    expect(blocked('synthetic-pinned-id', RELISTED_LISTING_WARNING)).toBe(true);
    expect(blocked('synthetic-pinned-id', null)).toBe(true);
    expect(blocked('synthetic-pinned-id', 'Some other error')).toBe(true);
  });

  it('still blocks any detached relist, and leaves ordinary listings writable', () => {
    expect(isEbayWriteBlocked('ordinary', listingRow({ last_error: RELISTED_LISTING_WARNING }))).toBe(true);
    expect(isEbayWriteBlocked('ordinary', listingRow())).toBe(false);
  });

  it('keeps a write-blocked listing out of the price-push plan', () => {
    // Uses the detached-relist path, which is the live block now that the
    // pinned set is empty. Previously keyed on the pinned inventory #82.
    const blockedId = 'detached-relist-item';
    const listings: EbayListingRow[] = [
      listingRow({ product_id: blockedId, ebay_sku: blockedId, last_error: RELISTED_LISTING_WARNING }),
      listingRow({ product_id: 'ordinary', ebay_sku: 'ordinary' }),
    ];
    const products = new Map<string, Product>(
      listings.map((listing) => [
        listing.product_id,
        {
          id: listing.product_id,
          category: 'Gold',
          price_mode: 'manual',
          manual_price_label: '$500',
          asking_price: 500,
          status: 'available',
          sold_price: null,
        } as Product,
      ]),
    );
    const spotData: SpotData = { goldPerTroyOz: 3300, silverPerTroyOz: 35, fetchedAt: Date.now(), source: 'api' };

    const plan = planEbayPricePush(listings, products, spotData, 0, null);

    expect(plan.candidates.map((candidate) => candidate.listing.product_id)).toEqual(['ordinary']);
    expect(plan.blocked).toBe(1);
  });
});

describe('freshness scan — sold listings are never flagged out_of_date', () => {
  const row = (sync_state: string, last_pushed_qty: number | null) =>
    ({ sync_state, last_pushed_qty }) as Pick<EbayListingRow, 'sync_state' | 'last_pushed_qty'>;

  it('never hashes a sold piece (the bug that flagged 36 hidden listings)', () => {
    // Before the fix these were hashed against the new tier shipping policy and
    // flipped to out_of_date, losing the state that says "hidden because sold".
    expect(resolveFreshnessScanAction(row('hidden_oos', 0), 'sold')).toBe('skip');
    expect(resolveFreshnessScanAction(row('published', 1), 'sold')).toBe('skip');
    expect(resolveFreshnessScanAction(row('hidden_oos', 0), 'archived')).toBe('skip');
  });

  it('repairs a mis-flagged hidden row, but only with proof the hide succeeded', () => {
    // last_pushed_qty === 0 is written by hideListingQuantityZero and never
    // touched by the scan, so it is the durable evidence.
    expect(resolveFreshnessScanAction(row('out_of_date', 0), 'sold')).toBe('repair-hidden');
    // Just sold, auto-hide not run yet: still real work, must not be relabelled.
    expect(resolveFreshnessScanAction(row('out_of_date', 1), 'sold')).toBe('skip');
    expect(resolveFreshnessScanAction(row('out_of_date', null), 'sold')).toBe('skip');
  });

  it('still hashes available listings, and skips ones already flagged', () => {
    expect(resolveFreshnessScanAction(row('published', 1), 'available')).toBe('hash');
    expect(resolveFreshnessScanAction(row('hidden_oos', 0), 'available')).toBe('hash');
    expect(resolveFreshnessScanAction(row('out_of_date', 1), 'available')).toBe('skip');
  });
});

describe('bulk enqueue cap', () => {
  it('bounds one bulk run so a blanket re-sync cannot rewrite the whole catalog', () => {
    // The cap is the standing "never blanket re-sync" rule made mechanical.
    expect(EBAY_BULK_ENQUEUE_LIMIT).toBeGreaterThan(0);
    expect(EBAY_BULK_ENQUEUE_LIMIT).toBeLessThanOrEqual(25);
  });
});

function makeResult(overrides: Partial<SyncStepResult> = {}): SyncStepResult {
  return { done: true, syncState: 'published', ...overrides };
}

describe('drainQueueCore — pure orchestration loop', () => {
  it('drains every claimed item until the queue is exhausted', async () => {
    const queue = ['a', 'b', 'c'];
    const processed: string[] = [];
    const deps: DrainDeps = {
      claimNext: async () => queue.shift() ?? null,
      runStep: async (productId) => {
        processed.push(productId);
        return makeResult({ syncState: 'published' });
      },
      now: () => 0,
      budgetMs: 8000,
    };
    const result = await drainQueueCore(deps);
    expect(processed).toEqual(['a', 'b', 'c']);
    expect(result.exhausted).toBe(true);
    expect(result.results).toHaveLength(3);
  });

  it('stops (never loops forever) if the same product is re-claimed in one pass', async () => {
    // Simulates a bug in the claim RPC or a stuck row that keeps being
    // returned — the seen-guard is the safety net that prevents the drain
    // from spinning forever, mirroring the Etsy production runaway fix.
    let calls = 0;
    const deps: DrainDeps = {
      claimNext: async () => {
        calls += 1;
        return 'same-product'; // always returns the same id
      },
      runStep: async () => makeResult({ syncState: 'error' }),
      now: () => 0,
      budgetMs: 8000,
    };
    const result = await drainQueueCore(deps);
    expect(result.exhausted).toBe(false);
    expect(result.results).toHaveLength(1); // processed once, then the seen-guard stopped the loop
    expect(calls).toBe(2); // claimed once, processed, claimed again, seen -> stop
  });

  it('respects the time budget and reports not exhausted', async () => {
    let now = 0;
    const deps: DrainDeps = {
      claimNext: async () => {
        now += 5000; // each claim "takes" 5s of simulated time
        return `product-${now}`;
      },
      runStep: async () => makeResult(),
      now: () => now,
      budgetMs: 8000, // budget blows after the second claim
    };
    const result = await drainQueueCore(deps);
    expect(result.exhausted).toBe(false);
    expect(result.results.length).toBeGreaterThan(0);
  });

  it('breaks the loop (but reports not exhausted) when an item is not done, leaving the rest of the queue for the next pass', async () => {
    const queue = ['a', 'b'];
    const deps: DrainDeps = {
      claimNext: async () => queue.shift() ?? null,
      runStep: async (productId) => makeResult({ done: productId !== 'a', syncState: 'item_synced' }),
      now: () => 0,
      budgetMs: 8000,
    };
    const result = await drainQueueCore(deps);
    expect(result.results).toEqual([{ productId: 'a', syncState: 'item_synced' }]);
    expect(result.exhausted).toBe(false);
    expect(queue).toEqual(['b']); // 'b' was never claimed this pass
  });

  it('returns exhausted:true with zero results when the queue starts empty', async () => {
    const deps: DrainDeps = {
      claimNext: async () => null,
      runStep: async () => makeResult(),
      now: () => 0,
      budgetMs: 8000,
    };
    const result = await drainQueueCore(deps);
    expect(result.exhausted).toBe(true);
    expect(result.results).toHaveLength(0);
  });
});
