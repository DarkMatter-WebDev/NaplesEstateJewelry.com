import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  autoDeclineFromOffer,
  bestOfferTerms,
  computeOfferMinimum,
  isMissingOfferMinimumColumn,
  needsOfferMinimumUpdate,
  offerMinimumHowLine,
  offerMinimumPushedMessage,
  offerMinimumSavedOnlyMessage,
  offerMinimumSettingsFromProduct,
  offerMinimumTodayLine,
  validateOfferMinimumInput,
  type OfferMinimumSettings,
} from '../best-offer';
import { offerBody } from '../sync';
import type { MappedEbayPayload } from '../mapping';

// eBay Best Offer minimum (2026-11-01): owner — "set a minimum best offer price
// as either a set amount below asking, or a percentage off asking, or a set
// amount alone". Sent as eBay's autoDeclinePrice (offers EQUAL TO or below it
// are declined; it must be under the Buy It Now price).

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

const none: OfferMinimumSettings = { mode: null, offAmount: null, offPercent: null, fixed: null };
const offAmount = (n: number): OfferMinimumSettings => ({ ...none, mode: 'off_amount', offAmount: n });
const offPercent = (n: number): OfferMinimumSettings => ({ ...none, mode: 'off_percent', offPercent: n });
const fixed = (n: number): OfferMinimumSettings => ({ ...none, mode: 'fixed', fixed: n });

describe('computeOfferMinimum — the figure for today\'s eBay price', () => {
  it('works the mockup examples (eBay price $1,150)', () => {
    expect(computeOfferMinimum(offAmount(100), 1150, true)).toMatchObject({ minimum: 1050, autoDeclinePrice: 1049.99, status: 'active' });
    expect(computeOfferMinimum(offPercent(10), 1150, true)).toMatchObject({ minimum: 1035, autoDeclinePrice: 1034.99, status: 'active' });
    expect(computeOfferMinimum(fixed(900), 1150, true)).toMatchObject({ minimum: 900, autoDeclinePrice: 899.99, status: 'active' });
  });

  it('rounds relative minimums DOWN to whole dollars; a fixed amount is used as entered', () => {
    expect(computeOfferMinimum(offAmount(100), 1149.37, true).minimum).toBe(1049);
    expect(computeOfferMinimum(offPercent(15), 999.99, true).minimum).toBe(849); // 849.9915
    expect(computeOfferMinimum(offPercent(10), 1000, true).minimum).toBe(900); // no float slip to 899
    expect(computeOfferMinimum(fixed(899.5), 1000, true)).toMatchObject({ minimum: 899.5, autoDeclinePrice: 899.49 });
  });

  it('follows the price: the same % gives a new minimum when spot moves', () => {
    expect(computeOfferMinimum(offPercent(10), 1200, true).minimum).toBe(1080);
    expect(computeOfferMinimum(offPercent(10), 1100, true).minimum).toBe(990);
    expect(computeOfferMinimum(fixed(900), 1200, true).minimum).toBe(900);
  });

  it('never sends a minimum at or above the eBay price (eBay refuses it)', () => {
    expect(computeOfferMinimum(fixed(900), 880, true)).toMatchObject({ minimum: 900, autoDeclinePrice: null, status: 'at_or_above_price' });
    expect(computeOfferMinimum(fixed(900), 900, true)).toMatchObject({ autoDeclinePrice: null, status: 'at_or_above_price' });
    expect(computeOfferMinimum(fixed(900), 900.01, true)).toMatchObject({ autoDeclinePrice: 899.99, status: 'active' });
  });

  it('never sends a minimum under $1, with no price, or while offers are off', () => {
    expect(computeOfferMinimum(offAmount(100), 60, true)).toMatchObject({ autoDeclinePrice: null, status: 'too_low' });
    expect(computeOfferMinimum(offPercent(99), 50, true)).toMatchObject({ autoDeclinePrice: null, status: 'too_low' });
    expect(computeOfferMinimum(offPercent(10), null, true)).toMatchObject({ autoDeclinePrice: null, status: 'no_price' });
    expect(computeOfferMinimum(offPercent(10), 1150, false)).toMatchObject({ minimum: 1035, autoDeclinePrice: null, status: 'offers_off' });
  });

  it('no kind, or a kind without its number, is no minimum', () => {
    expect(computeOfferMinimum(none, 1150, true)).toMatchObject({ minimum: null, autoDeclinePrice: null, status: 'none' });
    expect(computeOfferMinimum({ ...none, mode: 'fixed', offAmount: 100 }, 1150, true).status).toBe('none');
    expect(computeOfferMinimum({ ...none, mode: 'off_percent', offPercent: 100 }, 1150, true).status).toBe('none');
  });
});

describe('reading the stored settings', () => {
  it('reads each kind from its own column; unknown kinds and bad numbers are ignored', () => {
    expect(offerMinimumSettingsFromProduct({ ebay_offer_min_mode: 'off_percent', ebay_offer_min_off_percent: '10.00', ebay_offer_min_fixed: 900 }))
      .toEqual({ mode: 'off_percent', offAmount: null, offPercent: 10, fixed: 900 });
    expect(offerMinimumSettingsFromProduct({ ebay_offer_min_mode: 'auto_accept' }).mode).toBeNull();
    expect(offerMinimumSettingsFromProduct({ ebay_offer_min_off_amount: -5 }).offAmount).toBeNull();
    // Columns absent until the SQL runs → no minimum, nothing breaks.
    expect(offerMinimumSettingsFromProduct({})).toEqual(none);
  });

  it('only items with offers on AND a kind chosen take the full-update price path', () => {
    expect(needsOfferMinimumUpdate(offPercent(10), true)).toBe(true);
    expect(needsOfferMinimumUpdate(offPercent(10), false)).toBe(false);
    expect(needsOfferMinimumUpdate(none, true)).toBe(false);
  });
});

describe('what eBay receives and reads back', () => {
  it('sends autoDeclinePrice as a USD string only with offers on; never autoAcceptPrice', () => {
    expect(bestOfferTerms(true, 1034.99)).toEqual({ bestOfferEnabled: true, autoDeclinePrice: { value: '1034.99', currency: 'USD' } });
    expect(bestOfferTerms(true, 900)).toEqual({ bestOfferEnabled: true, autoDeclinePrice: { value: '900.00', currency: 'USD' } });
    expect(bestOfferTerms(false, 1034.99)).toEqual({ bestOfferEnabled: false });
    expect(bestOfferTerms(true, null)).toEqual({ bestOfferEnabled: true });
  });

  it('offerBody carries the minimum worked out on the payload', () => {
    const payload = {
      sku: 's', title: 't', description: 'd', aspects: {}, conditionId: '3000', conditionDescription: 'Used',
      categoryId: '1', categoryPath: 'x', categoryIsApproximate: false, categoryIsOverride: false,
      price: 1150, priceBeforeMarkup: 1000, quantity: 1, images: [], fulfillmentPolicyId: 'f', shippingTier: 'standard',
      paymentPolicyId: 'p', returnPolicyId: 'r', merchantLocationKey: 'l', marketplaceId: 'EBAY_US',
      bestOfferEnabled: true, offerMinimum: computeOfferMinimum(offPercent(10), 1150, true),
    } satisfies MappedEbayPayload;
    expect(offerBody(payload).listingPolicies.bestOfferTerms).toEqual({
      bestOfferEnabled: true,
      autoDeclinePrice: { value: '1034.99', currency: 'USD' },
    });
    expect(JSON.stringify(offerBody(payload))).not.toMatch(/autoAccept/);
  });

  it('reads getOffer\'s auto-decline price (absent = none)', () => {
    expect(autoDeclineFromOffer({ listingPolicies: { bestOfferTerms: { autoDeclinePrice: { value: '1034.99' } } } })).toBe(1034.99);
    expect(autoDeclineFromOffer({ listingPolicies: { bestOfferTerms: {} } })).toBeNull();
    expect(autoDeclineFromOffer(null)).toBeNull();
  });
});

describe('the box\'s wording', () => {
  it('the "Today" and how lines match the mockup', () => {
    expect(offerMinimumTodayLine(computeOfferMinimum(offPercent(10), 1150, true), 1150)).toBe('Today: offers under $1,035 are declined by eBay automatically.');
    expect(offerMinimumTodayLine(computeOfferMinimum(fixed(900), 1150, true), 1150)).toBe('Offers under $900 are declined by eBay automatically.');
    expect(offerMinimumTodayLine(computeOfferMinimum(fixed(900), 880, true), 880)).toMatch(/\$900 is at or above today's eBay price \(\$880\), so it is not on eBay right now/);
    expect(offerMinimumTodayLine(computeOfferMinimum(none, 1150, true), 1150)).toBe('No minimum: every offer reaches you on eBay.');
    expect(offerMinimumHowLine(offPercent(10), 1150)).toBe('$1,150 eBay price − 10%, rounded down to whole dollars. Moves with the eBay price as spot changes.');
    expect(offerMinimumHowLine(fixed(900), 1150)).toMatch(/^Stays \$900 when spot moves/);
  });

  it('save notices: pushed, read back, mismatched, saved only', () => {
    const active = computeOfferMinimum(offPercent(10), 1150, true);
    expect(offerMinimumPushedMessage(active, 1150, 1034.99, true)).toBe('Minimum saved. eBay confirmed it: the listing now declines offers under $1,035.');
    expect(offerMinimumPushedMessage(active, 1150, null, true)).toMatch(/does not show a minimum/);
    expect(offerMinimumPushedMessage(active, 1150, 999.99, true)).toMatch(/reads a different minimum/);
    expect(offerMinimumPushedMessage(active, 1150, null, false)).toMatch(/could not be read back/);
    expect(offerMinimumPushedMessage(computeOfferMinimum(none, 1150, true), 1150, null, true)).toMatch(/^Minimum removed\. eBay confirmed it/);
    expect(offerMinimumPushedMessage(computeOfferMinimum(fixed(900), 880, true), 880, null, true)).toMatch(/not on eBay right now/);
    expect(offerMinimumSavedOnlyMessage(active, 'hidden_oos')).toMatch(/Restore, then Sync Updates/);
    expect(offerMinimumSavedOnlyMessage(computeOfferMinimum(offPercent(10), 1150, false), 'published')).toMatch(/when "Allow offers" is on/);
  });

  it('validates a Save', () => {
    expect(validateOfferMinimumInput(null, '')).toBeNull();
    expect(validateOfferMinimumInput('off_percent', '10')).toBeNull();
    expect(validateOfferMinimumInput('off_percent', '100')).toMatch(/under 100/);
    expect(validateOfferMinimumInput('fixed', '0')).toMatch(/greater than 0/);
    expect(validateOfferMinimumInput('off_amount', '')).toMatch(/greater than 0/);
  });

  it('recognises the missing-SQL errors only', () => {
    expect(isMissingOfferMinimumColumn({ code: '42703', message: 'column products.ebay_offer_min_mode does not exist' })).toBe(true);
    expect(isMissingOfferMinimumColumn({ message: "Could not find the 'ebay_offer_min_fixed' column of 'products' in the schema cache" })).toBe(true);
    expect(isMissingOfferMinimumColumn({ code: '23514', message: 'violates check constraint' })).toBe(false);
  });
});

describe('source guards', () => {
  const sync = read('src', 'lib', 'ebay', 'sync.ts');

  it('the SQL: four columns on products, checked kinds/values, no public grant', () => {
    const sql = read('..', 'supabase', 'ebay-best-offer-minimum-2026-11.sql');
    for (const column of ['ebay_offer_min_mode text', 'ebay_offer_min_off_amount numeric', 'ebay_offer_min_off_percent numeric', 'ebay_offer_min_fixed numeric']) {
      expect(sql).toContain(`add column if not exists ${column}`);
    }
    expect(sql).toMatch(/ebay_offer_min_mode in \('off_amount', 'off_percent', 'fixed'\)/);
    expect(sql).not.toMatch(/grant\s+(select|update)/i);
    expect(sql).not.toMatch(/ebay_listings\s+add column/i);
  });

  it('price pushes for minimum items use the full offer update, never the price-only call', () => {
    const priceOnly = sync.slice(sync.indexOf('async function priceOnlyStep'), sync.indexOf('async function withdrawListing'));
    expect(priceOnly.indexOf('needsOfferMinimumUpdate(')).toBeGreaterThan(0);
    expect(priceOnly.indexOf('needsOfferMinimumUpdate(')).toBeLessThan(priceOnly.indexOf('bulkUpdatePriceQuantity('));
    expect(priceOnly).toMatch(/updateOfferPriceWithMinimum\(/);
    expect(sync.match(/await pushEbayPriceCandidatesWithMinimums\(/g)?.length).toBe(2);
    expect(sync).not.toMatch(/await pushEbayPriceCandidates\(\{\s*service,\s*candidates: plan\.candidates/);
  });

  it('the minimum-items lookup degrades to "none" when the SQL has not run', () => {
    const fn = sync.slice(sync.indexOf('async function getOfferMinimumProductIds'));
    expect(fn.slice(0, fn.indexOf('\n}\n'))).toMatch(/if \(error\) return new Set\(\)/);
  });

  it('a failed eBay update puts the stored minimum back; the route is admin-only', () => {
    const fn = sync.slice(sync.indexOf('export async function setEbayOfferMinimum'));
    expect(fn).toMatch(/runSyncStep\(productId, 'update'\)/);
    expect(fn).toMatch(/ebay_offer_min_mode: previous\.ebay_offer_min_mode/);
    const route = read('src', 'app', 'api', 'admin', 'ebay', 'offer-minimum', 'route.ts');
    expect(route).toMatch(/requireAdmin\(\)/);
    expect(route).toMatch(/validateOfferMinimumInput/);
    expect(route).not.toMatch(/export async function GET/);
  });

  it('the admin product list never loads the minimum (the drawer Save would write a stale copy back)', () => {
    const summary = read('src', 'lib', 'admin-product-summary.ts');
    expect(summary).not.toMatch(/ebay_offer_min_/);
  });

  it('the drawer has the box, wired to its route', () => {
    const panel = read('src', 'components', 'admin', 'EbayProductPanel.tsx');
    expect(panel).toMatch(/\/api\/admin\/ebay\/offer-minimum/);
    expect(panel).toMatch(/Minimum offer/);
    expect(panel).toMatch(/Save minimum/);
  });
});
