import { describe, expect, it } from 'vitest';
import {
  MAX_PRICE_PUSH_ATTEMPTS,
  resolvePriceChip,
  resolvePriceChipState,
} from '../marketplace-price-chip';

describe('resolvePriceChipState', () => {
  it('says nothing when the product is not listed', () => {
    expect(resolvePriceChipState(null)).toBe('none');
    expect(resolvePriceChipState(undefined)).toBe('none');
  });

  it('says nothing while every push has landed', () => {
    expect(resolvePriceChipState({ error_count: 0 })).toBe('none');
    expect(resolvePriceChipState({ error_count: null })).toBe('none');
    expect(resolvePriceChipState({})).toBe('none');
  });

  it('flags a listing inside the retry budget as failing', () => {
    expect(resolvePriceChipState({ error_count: 1 })).toBe('failing');
    expect(resolvePriceChipState({ error_count: MAX_PRICE_PUSH_ATTEMPTS - 1 })).toBe('failing');
  });

  it('flags a listing at or past the ceiling as stalled', () => {
    expect(resolvePriceChipState({ error_count: MAX_PRICE_PUSH_ATTEMPTS })).toBe('stalled');
    expect(resolvePriceChipState({ error_count: MAX_PRICE_PUSH_ATTEMPTS + 5 })).toBe('stalled');
  });

  // The boundary is the one thing that must match planEbayPricePush /
  // planEtsyPricePush, which skip on `error_count >= MAX_PRICE_PUSH_ATTEMPTS`.
  // If the chip said "failing" at the value the planner already skips, the table
  // would promise a retry that never comes.
  it('changes state at exactly the value the planners skip on', () => {
    expect(resolvePriceChipState({ error_count: MAX_PRICE_PUSH_ATTEMPTS - 1 })).toBe('failing');
    expect(resolvePriceChipState({ error_count: MAX_PRICE_PUSH_ATTEMPTS })).toBe('stalled');
  });
});

describe('resolvePriceChip', () => {
  it('renders nothing on the happy path, so the column stays quiet', () => {
    expect(resolvePriceChip({ error_count: 0 })).toBeNull();
    expect(resolvePriceChip(null)).toBeNull();
  });

  it('names the retry budget on a failing listing', () => {
    const chip = resolvePriceChip({ error_count: 1 });
    expect(chip?.label).toBe('Price failed');
    expect(chip?.tooltip).toContain(`1 of ${MAX_PRICE_PUSH_ATTEMPTS}`);
    expect(chip?.tooltip).toContain('retried');
  });

  it('says a stalled listing is being SKIPPED, not retried', () => {
    const chip = resolvePriceChip({ error_count: MAX_PRICE_PUSH_ATTEMPTS });
    expect(chip?.label).toBe('Price stalled');
    expect(chip?.tooltip).toContain('skipped');
    expect(chip?.tooltip).toContain('resets it');
    expect(chip?.tooltip).not.toContain('will be retried');
  });

  it('surfaces the stored cause when there is one', () => {
    const chip = resolvePriceChip({ error_count: 2, last_error: 'eBay API error (HTTP 400).' });
    expect(chip?.tooltip).toContain('Last error: eBay API error (HTTP 400).');
  });

  it('omits the cause cleanly when none was recorded', () => {
    const chip = resolvePriceChip({ error_count: 2, last_error: null });
    expect(chip?.tooltip).not.toContain('Last error');
    expect(chip?.tooltip.trim()).toBe(chip?.tooltip);
  });

  it('uses the error colour for both fault states', () => {
    expect(resolvePriceChip({ error_count: 1 })?.fg).toBe('var(--color-error)');
    expect(resolvePriceChip({ error_count: 9 })?.fg).toBe('var(--color-error)');
  });
});

describe('the price signal is independent of content freshness', () => {
  // The regression this whole module exists to prevent. A listing can be
  // content-stale (shipping policy changed) while every price push succeeds —
  // that was 84 eBay listings on 2026-08-11 — and it can be content-fresh while
  // prices fail. Neither state may be inferred from the other.
  it('reports nothing for a content-stale listing whose pushes all succeeded', () => {
    expect(resolvePriceChip({ error_count: 0, last_error: null })).toBeNull();
  });

  it('reports a fault for a content-fresh listing whose pushes are failing', () => {
    expect(resolvePriceChip({ error_count: 2 })?.label).toBe('Price failed');
  });
});
