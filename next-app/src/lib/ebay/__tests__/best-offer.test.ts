import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BEST_OFFER_PUSH_STATES,
  bestOfferBulkOutcome,
  bestOfferBulkSummary,
  bestOfferFromOffer,
  bestOfferUnchangedMessage,
  countBestOfferBulk,
  bestOfferPushedMessage,
  bestOfferSavedMessage,
  bestOfferTerms,
  isMissingBestOfferColumn,
  planBestOfferChange,
} from '../best-offer';
import { offerBody } from '../sync';
import type { MappedEbayPayload } from '../mapping';
import type { EbaySyncState } from '../store';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

function payload(bestOfferEnabled: boolean): MappedEbayPayload {
  return {
    sku: 'sku-1',
    title: 'Title',
    description: 'Description',
    aspects: {},
    conditionId: '3000',
    conditionDescription: 'Used',
    categoryId: '261993',
    categoryPath: 'Test',
    categoryIsApproximate: false,
    categoryIsOverride: false,
    price: 100,
    priceBeforeMarkup: 90,
    quantity: 1,
    images: [],
    fulfillmentPolicyId: 'fulfillment',
    shippingTier: 'standard',
    paymentPolicyId: 'payment',
    returnPolicyId: 'return',
    merchantLocationKey: 'location',
    marketplaceId: 'EBAY_US',
    bestOfferEnabled,
  };
}

describe('the offer eBay receives', () => {
  it('always carries bestOfferTerms, on AND off — updateOffer replaces the whole offer', () => {
    expect(offerBody(payload(true)).listingPolicies.bestOfferTerms).toEqual({ bestOfferEnabled: true });
    expect(offerBody(payload(false)).listingPolicies.bestOfferTerms).toEqual({ bestOfferEnabled: false });
  });

  it('never sends an auto-accept or auto-decline price (owner: offers are answered on eBay)', () => {
    for (const on of [true, false]) {
      const json = JSON.stringify(offerBody(payload(on)));
      expect(json).not.toMatch(/autoAcceptPrice|autoDeclinePrice/);
    }
    expect(Object.keys(bestOfferTerms(true))).toEqual(['bestOfferEnabled']);
  });

  it('keeps the rest of the offer as it was (policies, fixed price, GTC)', () => {
    const body = offerBody(payload(true));
    expect(body.format).toBe('FIXED_PRICE');
    expect(body.listingDuration).toBe('GTC');
    expect(body.listingPolicies).toMatchObject({ fulfillmentPolicyId: 'fulfillment', paymentPolicyId: 'payment', returnPolicyId: 'return' });
  });
});

describe('planBestOfferChange — which states update eBay at once', () => {
  const all: EbaySyncState[] = ['pending', 'item_synced', 'offer_created', 'review', 'published', 'out_of_date', 'hidden_oos', 'ended', 'error'];

  it('pushes a live or prepared offer; only saves everywhere else', () => {
    const pushed = all.filter((state) => planBestOfferChange({ sync_state: state, ebay_offer_id: 'offer-1' }) === 'push');
    expect(pushed.sort()).toEqual(['offer_created', 'out_of_date', 'published', 'review']);
    expect([...BEST_OFFER_PUSH_STATES].sort()).toEqual(pushed.sort());
  });

  it('never pushes a hidden (sold-out) listing — a full update could show a sold piece again', () => {
    expect(planBestOfferChange({ sync_state: 'hidden_oos', ebay_offer_id: 'offer-1' })).toBe('save');
  });

  it('never pushes an ended or errored listing — a full update would move it to "Ready to publish"', () => {
    expect(planBestOfferChange({ sync_state: 'ended', ebay_offer_id: 'offer-1' })).toBe('save');
    expect(planBestOfferChange({ sync_state: 'error', ebay_offer_id: 'offer-1' })).toBe('save');
  });

  it('only saves when there is no offer yet (or no eBay row at all)', () => {
    expect(planBestOfferChange(null)).toBe('save');
    expect(planBestOfferChange({ sync_state: 'published', ebay_offer_id: null })).toBe('save');
  });
});

describe('reading Best Offer back from eBay', () => {
  it('is on only when getOffer returns bestOfferTerms.bestOfferEnabled true', () => {
    expect(bestOfferFromOffer({ listingPolicies: { bestOfferTerms: { bestOfferEnabled: true } } })).toBe(true);
    expect(bestOfferFromOffer({ listingPolicies: { bestOfferTerms: { bestOfferEnabled: false } } })).toBe(false);
    // eBay leaves the container out entirely while Best Offer is off.
    expect(bestOfferFromOffer({ listingPolicies: {} })).toBe(false);
    expect(bestOfferFromOffer({})).toBe(false);
    expect(bestOfferFromOffer(null)).toBe(false);
  });
});

describe('the notices', () => {
  it('says plainly what happened to a live listing', () => {
    expect(bestOfferPushedMessage(true, 'published', true)).toMatch(/live eBay listing now shows Make Offer/);
    expect(bestOfferPushedMessage(false, 'published', false)).toMatch(/Buy It Now only again/);
  });

  it('flags a read-back that disagrees with the choice', () => {
    expect(bestOfferPushedMessage(true, 'published', false)).toMatch(/does not show Best Offer/);
    expect(bestOfferPushedMessage(false, 'published', true)).toMatch(/still shows Best Offer/);
  });

  it('says when the read-back could not be made', () => {
    expect(bestOfferPushedMessage(true, 'published', null)).toMatch(/could not be read back/);
  });

  it('tells a hidden listing that it needs Restore, then Sync Updates', () => {
    expect(bestOfferSavedMessage(true, 'hidden_oos')).toMatch(/Restore, then Sync Updates/);
    expect(bestOfferSavedMessage(false, null)).toMatch(/included when this item is synced/);
  });
});

describe('missing SQL is recognised', () => {
  it('matches the Postgres / PostgREST missing-column errors only', () => {
    expect(isMissingBestOfferColumn({ code: '42703', message: 'column products.ebay_best_offer does not exist' })).toBe(true);
    expect(isMissingBestOfferColumn({ code: 'PGRST204', message: "Could not find the 'ebay_best_offer' column" })).toBe(true);
    expect(isMissingBestOfferColumn({ message: "Could not find the 'ebay_best_offer' column of 'products' in the schema cache" })).toBe(true);
    expect(isMissingBestOfferColumn({ code: '23505', message: 'duplicate key' })).toBe(false);
    expect(isMissingBestOfferColumn({ message: 'permission denied for ebay_best_offer' })).toBe(false);
    expect(isMissingBestOfferColumn(null)).toBe(false);
  });
});

describe('source guards', () => {
  it('the SQL adds the column off by default, on products, with no public grant', () => {
    const sql = read('..', 'supabase', 'ebay-best-offer-2026-10.sql');
    expect(sql).toMatch(/alter table public\.products\s+add column if not exists ebay_best_offer boolean not null default false/);
    expect(sql).not.toMatch(/grant\s+select/i);
    expect(sql).not.toMatch(/ebay_listings\s+add column/i);
  });

  it('the route is admin-only and validates a real boolean', () => {
    const route = read('src', 'app', 'api', 'admin', 'ebay', 'best-offer', 'route.ts');
    expect(route).toMatch(/requireAdmin\(\)/);
    expect(route).toMatch(/typeof body\.enabled !== 'boolean'/);
    expect(route).not.toMatch(/export async function GET/);
  });

  it('the drawer section has the per-item box; the settings page no longer has the dead account-wide one', () => {
    const panel = read('src', 'components', 'admin', 'EbayProductPanel.tsx');
    expect(panel).toMatch(/\/api\/admin\/ebay\/best-offer/);
    expect(panel).toMatch(/Allow offers/);
    const settings = read('src', 'components', 'admin', 'EbaySettingsPanel.tsx');
    expect(settings).not.toMatch(/Allow Best Offer|bestOfferEnabled/);
  });

  it('a failed eBay update puts the stored choice back', () => {
    const sync = read('src', 'lib', 'ebay', 'sync.ts');
    const fn = sync.slice(sync.indexOf('export async function setEbayBestOffer'));
    expect(fn).toMatch(/runSyncStep\(productId, 'update'\)/);
    expect(fn).toMatch(/update\(\{ ebay_best_offer: previous \}\)/);
  });
});

describe('bulk "Best Offer on / off" (Products list, 2026-10-14)', () => {
  const base = { ok: true, enabled: true, pushed: true, confirmedOnEbay: true };

  it('sorts the answer for each item into one outcome', () => {
    expect(bestOfferBulkOutcome(base, true)).toBe('updated');
    expect(bestOfferBulkOutcome({ ...base, confirmedOnEbay: null }, true)).toBe('updated');
    expect(bestOfferBulkOutcome({ ...base, confirmedOnEbay: false }, true)).toBe('check');
    expect(bestOfferBulkOutcome({ ...base, pushed: false, confirmedOnEbay: null }, true)).toBe('saved');
    expect(bestOfferBulkOutcome({ ...base, pushed: false, confirmedOnEbay: null, unchanged: true }, true)).toBe('unchanged');
    expect(bestOfferBulkOutcome({ ...base, ok: false, pushed: false }, true)).toBe('failed');
    expect(bestOfferBulkOutcome(null, true)).toBe('failed');
    // Turning OFF: eBay reading "off" back is the success case.
    expect(bestOfferBulkOutcome({ ok: true, enabled: false, pushed: true, confirmedOnEbay: false }, false)).toBe('updated');
    expect(bestOfferBulkOutcome({ ok: true, enabled: false, pushed: true, confirmedOnEbay: true }, false)).toBe('check');
  });

  it('counts and summarises a run', () => {
    const counts = countBestOfferBulk(['updated', 'updated', 'saved', 'unchanged', 'failed']);
    expect(counts).toEqual({ updated: 2, saved: 1, unchanged: 1, check: 0, failed: 1 });
    expect(bestOfferBulkSummary(true, counts, false)).toBe(
      'Done — Best Offer on: 2 updated on eBay · 1 saved for their next sync · 1 already on · 1 not changed.',
    );
    expect(bestOfferBulkSummary(false, countBestOfferBulk([]), true)).toBe('Stopped — Best Offer off: nothing to do.');
  });

  it('says plainly when an item was skipped', () => {
    expect(bestOfferUnchangedMessage(true)).toBe('Already on — skipped.');
    expect(bestOfferUnchangedMessage(false)).toBe('Already off — skipped.');
  });

  it('skips an unchanged item BEFORE anything is written or sent; only the bulk run asks for it', () => {
    const sync = read('src', 'lib', 'ebay', 'sync.ts');
    const fn = sync.slice(sync.indexOf('export async function setEbayBestOffer'));
    const skip = fn.indexOf('options.skipIfUnchanged && previous === enabled');
    expect(skip).toBeGreaterThan(0);
    expect(skip).toBeLessThan(fn.indexOf('.update({ ebay_best_offer: enabled })'));
    expect(skip).toBeLessThan(fn.indexOf("runSyncStep(productId, 'update')"));
    const route = read('src', 'app', 'api', 'admin', 'ebay', 'best-offer', 'route.ts');
    expect(route).toMatch(/skipIfUnchanged: body\.skipIfUnchanged === true/);
    const panel = read('src', 'components', 'admin', 'EbayProductPanel.tsx');
    expect(panel).not.toMatch(/skipIfUnchanged/);
  });

  it('the bulk window calls the route one item at a time, with skipIfUnchanged', () => {
    const modal = read('src', 'components', 'admin', 'EbayBestOfferBulkModal.tsx');
    expect(modal).toMatch(/for \(const item of items\)/);
    expect(modal).toMatch(/await fetch\('\/api\/admin\/ebay\/best-offer'/);
    expect(modal).toMatch(/skipIfUnchanged: true/);
    expect(modal).not.toMatch(/Promise\.all/);
    expect(modal).not.toMatch(/autoAccept|autoDecline/);
  });

  it('the "Choose an action" window offers both choices and the Products list opens the bulk window', () => {
    const actions = read('src', 'components', 'admin', 'SelectedProductsActionsModal.tsx');
    expect(actions).toMatch(/onChoose\('ebay-best-offer-on'\)/);
    expect(actions).toMatch(/onChoose\('ebay-best-offer-off'\)/);
    const shell = read('src', 'components', 'admin', 'AdminShell.tsx');
    expect(shell).toMatch(/setEbayBestOfferBulk\(action === 'ebay-best-offer-on'\)/);
    expect(shell).toMatch(/<EbayBestOfferBulkModal/);
  });
});
