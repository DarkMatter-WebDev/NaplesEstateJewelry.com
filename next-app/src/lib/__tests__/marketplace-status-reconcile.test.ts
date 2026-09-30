import { describe, expect, it } from 'vitest';
import { detectEbayStatusDrift, EBAY_HIDE_MESSAGE, EBAY_WRITE_BLOCKED_PRODUCT_IDS, isEbayManualHold, RELISTED_LISTING_WARNING } from '@/lib/ebay/sync';
import { detectEtsyStatusDrift, ETSY_DELIST_MESSAGE, isEtsyManualHold } from '@/lib/etsy/sync';
import type { EbayListingRow } from '@/lib/ebay/store';
import type { EtsyListingRow } from '@/lib/etsy/store';

/**
 * The reconcile sweep is the safety net under the auto-delist hook, which
 * cannot be made reliable in-request: `after()` on Netlify is best-effort by
 * design, so work still in flight when the response flushes is frozen with the
 * container and lost if it is reclaimed cold. Two sold products stayed live on
 * both marketplaces for twelve days that way.
 *
 * These tests cover DETECTION only, because detection is the sweep's whole job —
 * the repair delegates to `handleProductStatusChange`. A detector that misses a
 * case is a sold item nobody takes down.
 */

function ebayRow(overrides: Partial<EbayListingRow> = {}): EbayListingRow {
  return {
    product_id: 'p1',
    ebay_sku: 'p1',
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
  } as EbayListingRow;
}

function etsyRow(overrides: Partial<EtsyListingRow> = {}): EtsyListingRow {
  return {
    product_id: 'p1',
    etsy_listing_id: 123,
    sync_state: 'active',
    listing_state: 'active',
    ...overrides,
  } as EtsyListingRow;
}

describe('eBay status-drift detection', () => {
  it('flags a SOLD product whose listing is still live', () => {
    // This is the exact August failure: status sold, listing left published.
    expect(detectEbayStatusDrift(ebayRow({ sync_state: 'published' }), { status: 'sold', quantity: 1 })).toBe('delist');
    expect(detectEbayStatusDrift(ebayRow({ sync_state: 'out_of_date' }), { status: 'sold', quantity: 1 })).toBe('delist');
  });

  it('flags a zero-quantity product even when the status still says available', () => {
    expect(detectEbayStatusDrift(ebayRow(), { status: 'available', quantity: 0 })).toBe('delist');
  });

  it('flags archived and draft products whose listing has not ended', () => {
    expect(detectEbayStatusDrift(ebayRow(), { status: 'archived', quantity: 1 })).toBe('delist');
    expect(detectEbayStatusDrift(ebayRow(), { status: 'draft', quantity: 1 })).toBe('delist');
    expect(detectEbayStatusDrift(ebayRow({ sync_state: 'ended' }), { status: 'archived', quantity: 1 })).toBeNull();
  });

  it('flags a restocked product still hidden', () => {
    expect(detectEbayStatusDrift(ebayRow({ sync_state: 'hidden_oos' }), { status: 'available', quantity: 1 })).toBe('restore');
  });

  it('never restores a listing the owner hid (manual hold)', () => {
    // Owner ruling 2026-09-24: a delist done by hand — on eBay itself or from
    // the site — must not be undone by a sweep. Twin of the Etsy rule.
    expect(detectEbayStatusDrift(ebayRow({ sync_state: 'hidden_oos' }), { status: 'available', quantity: 1 }, true)).toBeNull();
    // The hold only ever suppresses a restore — a sold product still comes down.
    expect(detectEbayStatusDrift(ebayRow({ sync_state: 'published' }), { status: 'sold', quantity: 1 }, true)).toBe('delist');
    expect(detectEbayStatusDrift(ebayRow({ sync_state: 'published' }), { status: 'archived', quantity: 1 }, true)).toBe('delist');
  });

  it('releases the eBay hold only for a hide automation wrote', () => {
    expect(isEbayManualHold(EBAY_HIDE_MESSAGE.auto)).toBe(false);
    expect(isEbayManualHold(EBAY_HIDE_MESSAGE.manual)).toBe(true);
    // No hide_oos row: quantity zeroed on eBay's side, or before the rule. Hold.
    expect(isEbayManualHold(null)).toBe(true);
    expect(isEbayManualHold(undefined)).toBe(true);
    expect(isEbayManualHold('')).toBe(true);
    expect(EBAY_HIDE_MESSAGE.auto.startsWith('auto:')).toBe(true);
    expect(EBAY_HIDE_MESSAGE.manual.startsWith('auto:')).toBe(false);
  });

  it('leaves agreeing state alone — the sweep must be a no-op on a healthy catalog', () => {
    expect(detectEbayStatusDrift(ebayRow({ sync_state: 'published' }), { status: 'available', quantity: 1 })).toBeNull();
    expect(detectEbayStatusDrift(ebayRow({ sync_state: 'hidden_oos' }), { status: 'sold', quantity: 1 })).toBeNull();
    expect(detectEbayStatusDrift(ebayRow({ sync_state: 'ended' }), { status: 'sold', quantity: 1 })).toBeNull();
  });

  it('never touches a write-blocked listing', () => {
    // A quarantined listing is a deliberate decision. A sweep that "repairs" it
    // would write to a listing the owner suspended on purpose.
    const detached = ebayRow({ sync_state: 'published', last_error: RELISTED_LISTING_WARNING });
    expect(detectEbayStatusDrift(detached, { status: 'sold', quantity: 1 })).toBeNull();
    for (const pinned of EBAY_WRITE_BLOCKED_PRODUCT_IDS) {
      expect(detectEbayStatusDrift(ebayRow({ product_id: pinned }), { status: 'sold', quantity: 1 })).toBeNull();
    }
  });

  it('ignores rows with nothing live to act on', () => {
    expect(detectEbayStatusDrift(ebayRow({ ebay_listing_id: null }), { status: 'sold', quantity: 1 })).toBeNull();
    expect(detectEbayStatusDrift(ebayRow(), null)).toBeNull();
  });
});

describe('Etsy status-drift detection', () => {
  it('flags a non-available product whose listing is still live', () => {
    for (const state of ['draft_created', 'images_synced', 'inventory_synced', 'draft_review', 'active', 'out_of_date']) {
      expect(detectEtsyStatusDrift(etsyRow({ sync_state: state } as Partial<EtsyListingRow>), { status: 'sold' })).toBe('delist');
    }
    expect(detectEtsyStatusDrift(etsyRow(), { status: 'archived' })).toBe('delist');
  });

  it('flags a restocked product still delisted', () => {
    expect(detectEtsyStatusDrift(etsyRow({ sync_state: 'delisted' } as Partial<EtsyListingRow>), { status: 'available' })).toBe('restore');
  });

  it('never restores a listing the owner deactivated (manual hold)', () => {
    // 2026-09-24: 33 high-value listings were deactivated from the admin on
    // purpose; without this rule the next sweep put every one back on Etsy.
    const held = etsyRow({ sync_state: 'delisted' } as Partial<EtsyListingRow>);
    expect(detectEtsyStatusDrift(held, { status: 'available' }, true)).toBeNull();
    // The hold only ever suppresses a restore — a sold product's listing still comes down.
    expect(detectEtsyStatusDrift(etsyRow({ sync_state: 'active' } as Partial<EtsyListingRow>), { status: 'sold' }, true)).toBe('delist');
  });

  it('releases the hold only for a delist automation wrote', () => {
    expect(isEtsyManualHold(ETSY_DELIST_MESSAGE.auto)).toBe(false);
    expect(isEtsyManualHold(ETSY_DELIST_MESSAGE.manual)).toBe(true);
    // No delist row at all: deactivated on Etsy's side, or before the rule existed. Hold.
    expect(isEtsyManualHold(null)).toBe(true);
    expect(isEtsyManualHold(undefined)).toBe(true);
    // Pre-rule rows carry no message; those 33 listings must stay off Etsy.
    expect(isEtsyManualHold('')).toBe(true);
    expect(ETSY_DELIST_MESSAGE.auto.startsWith('auto:')).toBe(true);
    expect(ETSY_DELIST_MESSAGE.manual.startsWith('auto:')).toBe(false);
  });

  it('leaves agreeing state alone', () => {
    expect(detectEtsyStatusDrift(etsyRow({ sync_state: 'active' } as Partial<EtsyListingRow>), { status: 'available' })).toBeNull();
    expect(detectEtsyStatusDrift(etsyRow({ sync_state: 'delisted' } as Partial<EtsyListingRow>), { status: 'sold' })).toBeNull();
  });

  it('keys on status only — quantity is deliberately not consulted', () => {
    // Asymmetry with eBay, inherited from the hook this mirrors. Encoded so a
    // future "consistency" edit has to face the decision explicitly.
    expect(detectEtsyStatusDrift(etsyRow(), { status: 'available' })).toBeNull();
  });

  it('ignores rows with nothing live to act on', () => {
    expect(detectEtsyStatusDrift(etsyRow({ etsy_listing_id: null } as Partial<EtsyListingRow>), { status: 'sold' })).toBeNull();
    expect(detectEtsyStatusDrift(etsyRow(), null)).toBeNull();
  });
});

describe('the two August failures would have been caught', () => {
  it('detects both products exactly as they sat for twelve days', () => {
    // Real state, from production on 2026-08-21 before the repair.
    const monacoEbay = ebayRow({ product_id: '10k-gold-monaco-cuban-link-necklace', sync_state: 'out_of_date', last_pushed_qty: 1 });
    const ropeEbay = ebayRow({ product_id: '10k-gold-rope-chain-necklace', sync_state: 'out_of_date', last_pushed_qty: 1 });
    expect(detectEbayStatusDrift(monacoEbay, { status: 'sold', quantity: 1 })).toBe('delist');
    expect(detectEbayStatusDrift(ropeEbay, { status: 'sold', quantity: 1 })).toBe('delist');

    const monacoEtsy = etsyRow({ product_id: '10k-gold-monaco-cuban-link-necklace', sync_state: 'active' } as Partial<EtsyListingRow>);
    const ropeEtsy = etsyRow({ product_id: '10k-gold-rope-chain-necklace', sync_state: 'active' } as Partial<EtsyListingRow>);
    expect(detectEtsyStatusDrift(monacoEtsy, { status: 'sold' })).toBe('delist');
    expect(detectEtsyStatusDrift(ropeEtsy, { status: 'sold' })).toBe('delist');
  });
});
