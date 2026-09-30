import { describe, expect, it, vi, beforeEach } from 'vitest';

// Manual-price products are used throughout so no live spot data is needed;
// buildOrderDraft rejects spot-linked items when the feed is on its fallback.
vi.mock('@/lib/spot-price', () => ({
  fetchSpotData: async () => ({
    source: 'live' as const,
    gold: 2400,
    silver: 30,
    fetchedAt: new Date().toISOString(),
  }),
}));

import { buildOrderDraft, isOrderDraftError } from '@/lib/checkout-pricing';
import type { DiscountResolver } from '@/lib/checkout-pricing';

type FakeProduct = Record<string, unknown>;

function product(overrides: FakeProduct = {}): FakeProduct {
  return {
    id: 'p1',
    category: 'chains',
    metal_type: 'gold',
    metal_variant: null,
    title: 'Test Chain',
    item_year: null,
    price_mode: 'manual',
    purity: '14k',
    weight_grams: 10,
    inventory_number: '1',
    sku: 'SKU1',
    gram_weight: 10,
    pricing_multiplier: null,
    status: 'available',
    images: [],
    image_urls: [],
    manual_price_label: '$1,000.00',
    asking_price: 1000,
    quantity: 1,
    ...overrides,
  };
}

/** Minimal stand-in for the two calls buildOrderDraft makes on the client. */
function fakeSupabase(products: FakeProduct[]) {
  return {
    from() {
      return {
        select() {
          return {
            in: async () => ({ data: products, error: null }),
          };
        },
      };
    },
  } as never;
}

const LOCAL_PICKUP = 'local-pickup';

describe('buildOrderDraft discount handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a zero discount and no applied code when none is offered', async () => {
    const draft = await buildOrderDraft(
      fakeSupabase([product()]),
      [{ productId: 'p1', quantity: 1 }],
      LOCAL_PICKUP,
      'FL',
    );

    expect(isOrderDraftError(draft)).toBe(false);
    if (isOrderDraftError(draft)) return;
    expect(draft.discount).toBe(0);
    expect(draft.appliedDiscount).toBeNull();
    // 6% of $1,000 merchandise, free local pickup.
    expect(draft.tax).toBe(60);
    expect(draft.total).toBe(1060);
  });

  it('applies a percent discount and taxes the DISCOUNTED merchandise', async () => {
    const resolver: DiscountResolver = async () => ({
      ok: true,
      discount: { code: 'THANKYOU', type: 'percent', value: 15, amount: 150 },
    });

    const draft = await buildOrderDraft(
      fakeSupabase([product()]),
      [{ productId: 'p1', quantity: 1 }],
      LOCAL_PICKUP,
      'FL',
      resolver,
    );

    expect(isOrderDraftError(draft)).toBe(false);
    if (isOrderDraftError(draft)) return;
    expect(draft.subtotal).toBe(1000);
    expect(draft.discount).toBe(150);
    expect(draft.appliedDiscount?.code).toBe('THANKYOU');
    // Tax is 6% of $850, NOT of $1,000.
    expect(draft.tax).toBe(51);
    expect(draft.total).toBe(901);
  });

  it('applies a fixed-dollar discount', async () => {
    const resolver: DiscountResolver = async () => ({
      ok: true,
      discount: { code: 'FIFTY', type: 'fixed', value: 50, amount: 50 },
    });

    const draft = await buildOrderDraft(
      fakeSupabase([product()]),
      [{ productId: 'p1', quantity: 1 }],
      LOCAL_PICKUP,
      'FL',
      resolver,
    );

    if (isOrderDraftError(draft)) throw new Error('expected a draft');
    expect(draft.discount).toBe(50);
    expect(draft.tax).toBe(57);
    expect(draft.total).toBe(1007);
  });

  it('charges no tax on an out-of-state order regardless of the discount', async () => {
    const resolver: DiscountResolver = async () => ({
      ok: true,
      discount: { code: 'THANKYOU', type: 'percent', value: 15, amount: 150 },
    });

    const draft = await buildOrderDraft(
      fakeSupabase([product()]),
      [{ productId: 'p1', quantity: 1 }],
      'priority-insured',
      'NY',
      resolver,
    );

    if (isOrderDraftError(draft)) throw new Error('expected a draft');
    expect(draft.tax).toBe(0);
    expect(draft.total).toBe(draft.subtotal - draft.discount + draft.shippingFee);
  });

  it('rejects the order when the code is no longer valid', async () => {
    const resolver: DiscountResolver = async () => ({ ok: false, reason: 'exhausted' });

    const draft = await buildOrderDraft(
      fakeSupabase([product()]),
      [{ productId: 'p1', quantity: 1 }],
      LOCAL_PICKUP,
      'FL',
      resolver,
    );

    expect(isOrderDraftError(draft)).toBe(true);
    if (!isOrderDraftError(draft)) return;
    expect(draft.code).toBe('discount_invalid');
    expect(draft.status).toBe(409);
  });

  // The shipping tier and the $5,000 Express cutoff price INSURANCE on the goods
  // in the box. A discount must not move an over-cap order under the cap.
  it('keys the shipping tier off the PRE-discount subtotal', async () => {
    const bigItem = product({ manual_price_label: '$6,000.00', asking_price: 6000 });

    const undiscounted = await buildOrderDraft(
      fakeSupabase([bigItem]),
      [{ productId: 'p1', quantity: 1 }],
      'priority-insured',
      'FL',
    );
    const discounted = await buildOrderDraft(
      fakeSupabase([bigItem]),
      [{ productId: 'p1', quantity: 1 }],
      'priority-insured',
      'FL',
      async () => ({
        ok: true,
        // Enough to drop the order under $5,000 if the tier were computed after.
        discount: { code: 'BIG', type: 'fixed', value: 2000, amount: 2000 },
      }),
    );

    if (isOrderDraftError(undiscounted) || isOrderDraftError(discounted)) {
      throw new Error('expected both drafts to build');
    }
    expect(discounted.subtotal).toBe(6000);
    expect(discounted.discount).toBe(2000);
    expect(discounted.shippingFee).toBe(undiscounted.shippingFee);
  });

  it('still rejects Express over $5,000 when a discount would drop it below', async () => {
    const bigItem = product({ manual_price_label: '$6,000.00', asking_price: 6000 });

    const draft = await buildOrderDraft(
      fakeSupabase([bigItem]),
      [{ productId: 'p1', quantity: 1 }],
      'express-overnight-insured',
      'FL',
      async () => ({
        ok: true,
        discount: { code: 'BIG', type: 'fixed', value: 2000, amount: 2000 },
      }),
    );

    expect(isOrderDraftError(draft)).toBe(true);
    if (!isOrderDraftError(draft)) return;
    expect(draft.code).toBe('express_unavailable');
  });

  // The resolver's ONLY input is the server-computed subtotal. There is no path
  // for a browser-supplied amount to reach the draft — this test fails if the
  // signature ever grows a client-provided amount.
  it('resolves the discount from the server-computed subtotal only', async () => {
    const seen: number[] = [];
    const resolver: DiscountResolver = async (subtotal) => {
      seen.push(subtotal);
      return { ok: true, discount: { code: 'X', type: 'percent', value: 10, amount: subtotal * 0.1 } };
    };

    await buildOrderDraft(
      fakeSupabase([product()]),
      [{ productId: 'p1', quantity: 1 }],
      LOCAL_PICKUP,
      'FL',
      resolver,
    );

    expect(seen).toEqual([1000]);
  });

  it('keeps the order chargeable when a fixed discount zeroes the merchandise', async () => {
    const smallItem = product({ manual_price_label: '$80.00', asking_price: 80 });

    const draft = await buildOrderDraft(
      fakeSupabase([smallItem]),
      [{ productId: 'p1', quantity: 1 }],
      'priority-insured',
      'FL',
      async (subtotal) => ({
        ok: true,
        // Deliberately larger than the subtotal — the clamp must hold.
        discount: { code: 'HUGE', type: 'fixed', value: 500, amount: Math.min(500, subtotal) },
      }),
    );

    if (isOrderDraftError(draft)) throw new Error('expected a draft');
    expect(draft.discount).toBe(80);
    expect(draft.total).toBeGreaterThan(0);
  });
});
