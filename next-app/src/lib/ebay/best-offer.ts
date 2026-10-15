// eBay Best Offer, chosen per item (2026-10-14). PURE — no eBay calls, no
// database: the rules and wording behind the "Allow offers" box in the eBay
// drawer section. The server side is setEbayBestOffer in ./sync.ts.
//
// Owner's choice: Best Offer is ON or OFF per item, with NO auto-accept and
// NO auto-decline price — every offer is answered by hand on eBay. So the
// offer only ever carries `bestOfferEnabled`; never autoAcceptPrice /
// autoDeclinePrice (those are fixed dollars and would go stale as spot moves).

import type { EbaySyncState } from './store';

/** The `listingPolicies.bestOfferTerms` block every createOffer / updateOffer sends.
 *  Always explicit, on or off: updateOffer replaces the whole offer. */
export function bestOfferTerms(enabled: boolean): { bestOfferEnabled: boolean } {
  return { bestOfferEnabled: enabled };
}

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
