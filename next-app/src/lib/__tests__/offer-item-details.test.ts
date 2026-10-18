import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// The admin offers read → the card's "Item details" dropdown (owner mockup 1,
// 2026-10-18), run end to end on a stand-in database client with item #143's
// real catalogue values and a live spot price.

const spot = vi.hoisted(() => ({ source: 'api' as 'api' | 'fallback' }));
vi.mock('@/lib/spot-price', () => ({
  fetchSpotData: async () => ({ goldPerTroyOz: 4166.100098, silverPerTroyOz: 57.116001, fetchedAt: 0, source: spot.source }),
}));

import { listOffersForAdmin } from '../offers-server';

const PRODUCT = {
  id: '14k-yellow-gold-victorian-slide-charm-bracelet-with-multi-stone-charms-and-opal-143',
  category: 'Gold', metal_type: 'Gold', metal_variant: 'yellow_gold',
  title: '14K Yellow Gold Victorian Slide Charm Bracelet With Multi-Stone Charms',
  item_year: 1880, price_mode: 'spot-multiplier', purity: 14, weight_grams: 34.23, gram_weight: 34.23,
  inventory_number: 143, sku: null, pricing_multiplier: 2, status: 'available', images: [],
  image_urls: ['https://example.test/143.webp'], manual_price_label: null, asking_price: null, quantity: 1,
  title_es: null, accepts_offers: true,
};
const DETAIL = {
  id: PRODUCT.id, description: '14K yellow gold Victorian slide charm bracelet featuring 11 charms total.',
  length: '7.75', width_mm: 16.6, jewelry_type: 'Bracelet', product_type: null, chain_type: 'Charm',
  tags: [], tags_es: [], title_es: null, cost_basis: 1900,
};
const OFFER = {
  id: 'offer-1', product_id: PRODUCT.id, status: 'open', amount: '4500.00', listed_price: '5349.00',
  subtotal: '4500.00', tax: '270.00', shipping_fee: '0', total: '4770.00', counter_amount: null,
  order_id: null, expires_at: '2026-10-20T22:40:00Z',
};

function fakeClient(detailError: { message: string } | null = null): SupabaseClient {
  return {
    from(table: string) {
      let columns = '';
      const builder = {
        select(value: string) { columns = value; return builder; },
        in() { return builder; },
        order() { return builder; },
        limit() { return builder; },
        then(resolve: (value: { data: unknown[] | null; error: unknown }) => void) {
          if (table === 'product_offers') return resolve({ data: [OFFER], error: null });
          if (table === 'products' && columns.includes('cost_basis')) {
            return resolve(detailError ? { data: null, error: detailError } : { data: [DETAIL], error: null });
          }
          if (table === 'products') return resolve({ data: [PRODUCT], error: null });
          return resolve({ data: [], error: null });
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

describe('admin offers read → Item details', () => {
  it('sends the specs, today\'s melt from the live spot price, the cost and the item link', async () => {
    spot.source = 'api';
    const [offer] = await listOffersForAdmin(fakeClient(), 'open');
    expect(offer.product_listed_price).toBe(5349);
    expect(offer.product_details).toEqual({
      category: 'Gold', purity: 14, grams: 34.23, length: '7.75 in', width: '16.6 mm', type: 'Bracelet · Charm',
      year: 1880, description: DETAIL.description, melt: 2674.51, spotPerOz: 4166.100098, cost: 1900, multiplier: 2,
      productPath: `/shop/${PRODUCT.id}`,
    });
  });

  it('with the spot feed down there is no melt — never a fallback number', async () => {
    spot.source = 'fallback';
    const [offer] = await listOffersForAdmin(fakeClient(), 'open');
    expect(offer.product_details?.melt).toBeNull();
    expect(offer.product_details?.spotPerOz).toBeNull();
    expect(offer.product_details?.cost).toBe(1900);
  });

  it('if the details read fails, the cards still load with the basic specs', async () => {
    spot.source = 'api';
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const [offer] = await listOffersForAdmin(fakeClient({ message: 'boom' }), 'open');
    quiet.mockRestore();
    expect(offer.product_title).toBe(PRODUCT.title);
    expect(offer.product_details?.purity).toBe(14);
    expect(offer.product_details?.cost).toBeNull();
    expect(offer.product_details?.description).toBeNull();
  });
});
