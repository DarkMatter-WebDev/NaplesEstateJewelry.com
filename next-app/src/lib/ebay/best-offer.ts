// eBay Best Offer, chosen per item (2026-10-14). PURE — no eBay calls, no
// database: the rules and wording behind the "Allow offers" box in the eBay
// drawer section. The server side is setEbayBestOffer in ./sync.ts.
//
// Owner's choice: Best Offer is ON or OFF per item, and NOTHING is ever
// accepted automatically — never `autoAcceptPrice`. Since 2026-11-01 an item
// can also have a MINIMUM (owner: *"set a minimum best offer price as either a
// set amount below asking, or a percentage off asking, or a set amount
// alone"*), sent as eBay's `autoDeclinePrice`. It is worked out from the
// CURRENT eBay price on every offer write, so it follows spot instead of going
// stale (the reason it was refused on 10-14).

import type { EbaySyncState } from './store';

/** The `listingPolicies.bestOfferTerms` block every createOffer / updateOffer sends.
 *  Always explicit, on or off: updateOffer replaces the whole offer, so leaving
 *  `autoDeclinePrice` out REMOVES a minimum already on eBay. Never autoAcceptPrice. */
export function bestOfferTerms(
  enabled: boolean,
  autoDeclinePrice: number | null = null,
): { bestOfferEnabled: boolean; autoDeclinePrice?: { value: string; currency: 'USD' } } {
  if (!enabled || autoDeclinePrice == null) return { bestOfferEnabled: enabled };
  return { bestOfferEnabled: true, autoDeclinePrice: { value: autoDeclinePrice.toFixed(2), currency: 'USD' } };
}

// ---------------------------------------------------------------------------
// The minimum offer (2026-11-01). One column per kind on `products`
// (supabase/ebay-best-offer-minimum-2026-11.sql) so a number never changes
// meaning; `ebay_offer_min_mode` picks which one applies (null = no minimum).
// ---------------------------------------------------------------------------

export const OFFER_MINIMUM_MODES = ['off_amount', 'off_percent', 'fixed'] as const;
export type OfferMinimumMode = (typeof OFFER_MINIMUM_MODES)[number];

export interface OfferMinimumSettings {
  mode: OfferMinimumMode | null;
  offAmount: number | null;
  offPercent: number | null;
  fixed: number | null;
}

/**
 * active          = sent to eBay as the auto-decline price
 * none            = no minimum chosen
 * offers_off      = a minimum is saved but "Allow offers" is off — nothing sent
 * no_price        = the item has no eBay price right now — nothing sent
 * too_low         = works out under $1 — nothing sent
 * at_or_above_price = the minimum is the eBay price or more — eBay refuses it, nothing sent
 */
export type OfferMinimumStatus = 'active' | 'none' | 'offers_off' | 'no_price' | 'too_low' | 'at_or_above_price';

export interface OfferMinimum {
  settings: OfferMinimumSettings;
  /** The lowest offer that still reaches the owner, in dollars (null when none). */
  minimum: number | null;
  /** What eBay gets: `minimum − $0.01`, only when status is 'active'. eBay
   *  declines offers EQUAL TO or below its auto-decline price, so the cent keeps
   *  an offer of exactly the minimum. */
  autoDeclinePrice: number | null;
  status: OfferMinimumStatus;
}

const roundCents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function positiveNumber(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function normalizeOfferMinimumMode(value: unknown): OfferMinimumMode | null {
  return typeof value === 'string' && (OFFER_MINIMUM_MODES as readonly string[]).includes(value) ? (value as OfferMinimumMode) : null;
}

/** The stored settings off a product row (columns absent until the SQL runs → no minimum). */
export function offerMinimumSettingsFromProduct(product: {
  ebay_offer_min_mode?: string | null;
  ebay_offer_min_off_amount?: number | string | null;
  ebay_offer_min_off_percent?: number | string | null;
  ebay_offer_min_fixed?: number | string | null;
}): OfferMinimumSettings {
  return {
    mode: normalizeOfferMinimumMode(product.ebay_offer_min_mode),
    offAmount: positiveNumber(product.ebay_offer_min_off_amount),
    offPercent: positiveNumber(product.ebay_offer_min_off_percent),
    fixed: positiveNumber(product.ebay_offer_min_fixed),
  };
}

/**
 * The minimum for today's eBay price. Relative kinds round DOWN to whole
 * dollars ($1,150 − 10% = $1,035; $1,149.37 − $100 = $1,049); a fixed amount
 * is used as entered.
 */
export function computeOfferMinimum(
  settings: OfferMinimumSettings,
  ebayPrice: number | null,
  bestOfferEnabled: boolean,
): OfferMinimum {
  const result = (minimum: number | null, status: OfferMinimumStatus): OfferMinimum => ({
    settings,
    minimum,
    autoDeclinePrice: status === 'active' && minimum != null ? roundCents(minimum - 0.01) : null,
    status,
  });

  // The chosen kind needs its own number; without it there is no minimum.
  const { mode } = settings;
  if (mode == null) return result(null, 'none');
  if (mode === 'fixed' && settings.fixed == null) return result(null, 'none');
  if (mode === 'off_amount' && settings.offAmount == null) return result(null, 'none');
  if (mode === 'off_percent' && (settings.offPercent == null || settings.offPercent >= 100)) return result(null, 'none');

  const price = ebayPrice != null && Number.isFinite(ebayPrice) && ebayPrice > 0 ? ebayPrice : null;
  let minimum: number | null = null;
  if (mode === 'fixed') minimum = roundCents(settings.fixed!);
  else if (price != null && mode === 'off_amount') minimum = Math.floor(roundCents(price - settings.offAmount!));
  else if (price != null && mode === 'off_percent') minimum = Math.floor(roundCents(price * (1 - settings.offPercent! / 100)));

  if (!bestOfferEnabled) return result(minimum, 'offers_off');
  if (price == null) return result(minimum, 'no_price');
  if (minimum == null || minimum < 1) return result(minimum, 'too_low');
  if (minimum >= price) return result(minimum, 'at_or_above_price');
  return result(minimum, 'active');
}

/** True when the item's price pushes must go through a full offer update (the
 *  price-only bulk call cannot change the auto-decline price). */
export function needsOfferMinimumUpdate(settings: OfferMinimumSettings, bestOfferEnabled: boolean): boolean {
  return bestOfferEnabled && settings.mode != null;
}

const usd = (value: number) =>
  `$${value.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 })}`;

/** The "Today: …" line under the Minimum offer box. */
export function offerMinimumTodayLine(minimum: OfferMinimum, ebayPrice: number | null): string {
  switch (minimum.status) {
    case 'none':
      return 'No minimum: every offer reaches you on eBay.';
    case 'active':
      return minimum.settings.mode === 'fixed'
        ? `Offers under ${usd(minimum.minimum!)} are declined by eBay automatically.`
        : `Today: offers under ${usd(minimum.minimum!)} are declined by eBay automatically.`;
    case 'offers_off':
      return 'Saved, but not on eBay while "Allow offers" is off.';
    case 'no_price':
      return 'This item has no eBay price right now, so no minimum is sent.';
    case 'too_low':
      return 'This works out under $1, so no minimum is sent. Lower the amount off.';
    case 'at_or_above_price':
      return `${usd(minimum.minimum!)} is at or above today's eBay price (${ebayPrice != null ? usd(ebayPrice) : '—'}), so it is not on eBay right now. Offers reach you by hand until the price is back above it.`;
  }
}

/** The small line under "Today: …" — how the figure behaves when spot moves. */
export function offerMinimumHowLine(settings: OfferMinimumSettings, ebayPrice: number | null): string | null {
  if (settings.mode === 'fixed' && settings.fixed != null) {
    return `Stays ${usd(roundCents(settings.fixed))} when spot moves. If the eBay price drops to it or below, it is not sent and you see a warning.`;
  }
  const price = ebayPrice != null ? usd(ebayPrice) : 'eBay price';
  if (settings.mode === 'off_amount' && settings.offAmount != null) {
    return `${price} eBay price − ${usd(settings.offAmount)}, rounded down to whole dollars. Moves with the eBay price as spot changes.`;
  }
  if (settings.mode === 'off_percent' && settings.offPercent != null) {
    return `${price} eBay price − ${settings.offPercent}%, rounded down to whole dollars. Moves with the eBay price as spot changes.`;
  }
  return null;
}

/** Checks a Save from the box. Returns an error sentence, or null when it is fine. */
export function validateOfferMinimumInput(mode: OfferMinimumMode | null, value: unknown): string | null {
  if (mode == null) return null;
  const n = positiveNumber(value);
  if (n == null) return 'Enter a number greater than 0.';
  if (mode === 'off_percent' && n >= 100) return 'The percent off must be under 100.';
  if (n > 9_999_999) return 'That amount is too large.';
  return null;
}

/** The column a mode's number is stored in. */
export const OFFER_MINIMUM_COLUMN: Record<OfferMinimumMode, 'ebay_offer_min_off_amount' | 'ebay_offer_min_off_percent' | 'ebay_offer_min_fixed'> = {
  off_amount: 'ebay_offer_min_off_amount',
  off_percent: 'ebay_offer_min_off_percent',
  fixed: 'ebay_offer_min_fixed',
};

/** What getOffer says the auto-decline price is (null = none on eBay). */
export function autoDeclineFromOffer(
  offer: { listingPolicies?: { bestOfferTerms?: { autoDeclinePrice?: { value?: string | number } } } } | null | undefined,
): number | null {
  const raw = offer?.listingPolicies?.bestOfferTerms?.autoDeclinePrice?.value;
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) ? roundCents(n) : null;
}

/** Saved only (no offer to update right now). */
export function offerMinimumSavedOnlyMessage(minimum: OfferMinimum, state: EbaySyncState | null | undefined): string {
  if (minimum.status === 'offers_off') return 'Minimum saved. It goes on eBay when "Allow offers" is on.';
  const when = state === 'hidden_oos'
    ? 'eBay gets it after Restore, then Sync Updates.'
    : state === 'ended' || state === 'error'
      ? 'eBay gets it with this item\'s next successful sync.'
      : 'It is included when this item is synced to eBay.';
  return `${minimum.status === 'none' ? 'Minimum removed' : 'Minimum saved'}. ${when}`;
}

/**
 * The offer was updated on eBay. `confirmed` = the auto-decline price getOffer
 * reads back (null = none on eBay); `readOk` = false when the read failed.
 */
export function offerMinimumPushedMessage(
  minimum: OfferMinimum,
  ebayPrice: number | null,
  confirmed: number | null,
  readOk: boolean,
): string {
  if (readOk && confirmed !== minimum.autoDeclinePrice) {
    return confirmed == null
      ? 'eBay accepted the update but does not show a minimum. Check the listing on eBay.'
      : `eBay accepted the update but reads a different minimum (declines $${confirmed.toFixed(2)} and under). Check the listing on eBay.`;
  }
  const said = readOk ? 'eBay confirmed it' : 'eBay was updated (its answer could not be read back)';
  if (minimum.status === 'none') return `Minimum removed. ${said}: every offer reaches you again.`;
  if (minimum.status === 'active') return `Minimum saved. ${said}: the listing now declines offers under ${usd(minimum.minimum!)}.`;
  return `Minimum saved, not on eBay right now. ${offerMinimumTodayLine(minimum, ebayPrice)}`;
}

export function isMissingOfferMinimumColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '42703' || error.code === 'PGRST204') return true;
  const message = error.message ?? '';
  return /ebay_offer_min_/.test(message) && /does not exist|schema cache|could not find/i.test(message);
}

export const OFFER_MINIMUM_SQL_MISSING_MESSAGE =
  'The minimum-offer columns are not in the database yet. Run supabase/ebay-best-offer-minimum-2026-11.sql in the Supabase SQL Editor, then try again.';

/**
 * States where the item's eBay offer is pushed right away when the box changes:
 * a live listing (published / out_of_date) and a prepared-but-unpublished offer
 * (review / offer_created). Everything else only saves the choice — it reaches
 * eBay with that item's next sync, publish or restore:
 *  - hidden_oos: the product is usually sold; a full update could re-show it.
 *  - ended / error: a full update would move the item to "Ready to publish".
 *  - pending / item_synced / no row: there is no offer yet.
 */
export const BEST_OFFER_PUSH_STATES: ReadonlySet<EbaySyncState> = new Set<EbaySyncState>([
  'published',
  'out_of_date',
  'review',
  'offer_created',
]);

export type BestOfferPlan = 'push' | 'save';

export function planBestOfferChange(
  listing: { sync_state: EbaySyncState; ebay_offer_id: string | null } | null,
): BestOfferPlan {
  if (!listing?.ebay_offer_id) return 'save';
  return BEST_OFFER_PUSH_STATES.has(listing.sync_state) ? 'push' : 'save';
}

/** What eBay's getOffer says. `bestOfferTerms` is only returned while Best Offer is on. */
export function bestOfferFromOffer(offer: { listingPolicies?: { bestOfferTerms?: { bestOfferEnabled?: boolean } } } | null | undefined): boolean {
  return offer?.listingPolicies?.bestOfferTerms?.bestOfferEnabled === true;
}

export function isLiveSyncState(state: EbaySyncState | null | undefined): boolean {
  return state === 'published' || state === 'out_of_date';
}

/** The notice after a choice was only SAVED (no offer to update right now). */
export function bestOfferSavedMessage(enabled: boolean, state: EbaySyncState | null | undefined): string {
  const choice = enabled ? 'Best Offer on' : 'Best Offer off';
  if (state === 'hidden_oos') {
    return `${choice} — saved. This listing is hidden (sold out), so eBay gets it after Restore, then Sync Updates.`;
  }
  if (state === 'ended') return `${choice} — saved. eBay gets it when this listing is restored or synced again.`;
  if (state === 'error') return `${choice} — saved. eBay gets it with this item's next successful sync.`;
  return `${choice} — saved. It is included when this item is synced to eBay.`;
}

/** The notice after the offer was updated on eBay. `confirmed` = the read-back (null = could not read it). */
export function bestOfferPushedMessage(
  enabled: boolean,
  state: EbaySyncState | null | undefined,
  confirmed: boolean | null,
): string {
  if (confirmed !== null && confirmed !== enabled) {
    return enabled
      ? 'eBay accepted the update but does not show Best Offer on this listing. Check the listing on eBay.'
      : 'eBay accepted the update but still shows Best Offer on this listing. Check the listing on eBay.';
  }
  const unconfirmed = confirmed === null ? ' (eBay was updated; its answer could not be read back.)' : '';
  if (isLiveSyncState(state)) {
    return (enabled
      ? 'Best Offer on — the live eBay listing now shows Make Offer. Answer offers on eBay.'
      : 'Best Offer off — the live eBay listing is Buy It Now only again.') + unconfirmed;
  }
  return (enabled
    ? 'Best Offer on — the prepared listing carries it when you publish.'
    : 'Best Offer off — the prepared listing goes up as Buy It Now only.') + unconfirmed;
}

/** Postgres / PostgREST "no such column" — the SQL has not been run yet. */
export function isMissingBestOfferColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '42703' || error.code === 'PGRST204') return true;
  const message = error.message ?? '';
  return /ebay_best_offer/.test(message) && /does not exist|schema cache|could not find/i.test(message);
}

export const BEST_OFFER_SQL_MISSING_MESSAGE =
  'The Best Offer column is not in the database yet. Run supabase/ebay-best-offer-2026-10.sql in the Supabase SQL Editor, then try again.';

/** Bulk run: the item already had this choice, so nothing was sent. */
export function bestOfferUnchangedMessage(enabled: boolean): string {
  return enabled ? 'Already on — skipped.' : 'Already off — skipped.';
}

// ---------------------------------------------------------------------------
// The Products list's bulk "Best Offer on / off" (2026-10-14): the browser
// calls /api/admin/ebay/best-offer once per selected item, one at a time, with
// skipIfUnchanged — these sort and count what came back.
// ---------------------------------------------------------------------------

export type BestOfferBulkOutcome = 'updated' | 'saved' | 'unchanged' | 'check' | 'failed';

export interface BestOfferBulkItemResult {
  ok: boolean;
  enabled: boolean;
  pushed: boolean;
  confirmedOnEbay: boolean | null;
  unchanged?: boolean;
}

/**
 * updated   = eBay was changed (and did not read back differently)
 * saved     = stored only; it reaches eBay with that item's next sync / restore
 * unchanged = already had this choice, skipped
 * check     = eBay took the update but reads back the other way — look at the listing
 * failed    = nothing changed (the box was put back, or the call failed)
 */
export function bestOfferBulkOutcome(result: BestOfferBulkItemResult | null, wanted: boolean): BestOfferBulkOutcome {
  if (!result || !result.ok) return 'failed';
  if (result.unchanged) return 'unchanged';
  if (!result.pushed) return 'saved';
  if (result.confirmedOnEbay !== null && result.confirmedOnEbay !== wanted) return 'check';
  return 'updated';
}

export function countBestOfferBulk(outcomes: BestOfferBulkOutcome[]): Record<BestOfferBulkOutcome, number> {
  const counts: Record<BestOfferBulkOutcome, number> = { updated: 0, saved: 0, unchanged: 0, check: 0, failed: 0 };
  for (const outcome of outcomes) counts[outcome] += 1;
  return counts;
}

/** The one-line summary at the end of a bulk run. */
export function bestOfferBulkSummary(wanted: boolean, counts: Record<BestOfferBulkOutcome, number>, stopped: boolean): string {
  const parts: string[] = [];
  if (counts.updated) parts.push(`${counts.updated} updated on eBay`);
  if (counts.saved) parts.push(`${counts.saved} saved for their next sync`);
  if (counts.unchanged) parts.push(`${counts.unchanged} already ${wanted ? 'on' : 'off'}`);
  if (counts.check) parts.push(`${counts.check} to check on eBay`);
  if (counts.failed) parts.push(`${counts.failed} not changed`);
  const body = parts.length ? parts.join(' · ') : 'nothing to do';
  return `${stopped ? 'Stopped' : 'Done'} — Best Offer ${wanted ? 'on' : 'off'}: ${body}.`;
}

/**
 * The product table's eBay chip (2026-10-15, owner: *"display 'live + offer'
 * where it currently just says 'live'"*): a LIVE listing that allows Best
 * Offer reads "Live + Offer". Every other state keeps its own label.
 */
export function ebayChipLabelWithOffer(label: string, state: string | undefined, bestOffer: boolean | undefined): string {
  return state === 'published' && bestOffer === true ? `${label} + Offer` : label;
}
