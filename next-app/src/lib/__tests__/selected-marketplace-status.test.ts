import { describe, expect, it } from 'vitest';
import {
  marketplaceItemStatusLabel,
  marketplaceStatusGroup,
  type CheckedMarketplaceItem,
} from '../selected-marketplace-status';

function item(overrides: Partial<CheckedMarketplaceItem> = {}): CheckedMarketplaceItem {
  return {
    productId: 'product-1',
    syncState: 'pending',
    linked: false,
    checkError: false,
    ...overrides,
  };
}

describe('marketplace status result grouping', () => {
  it('separates linked, unlinked, and failed results into exclusive groups', () => {
    expect(marketplaceStatusGroup(item({ linked: true, syncState: 'published' }))).toBe('listed');
    expect(marketplaceStatusGroup(item())).toBe('not-listed');
    expect(marketplaceStatusGroup(item({ linked: true, checkError: true }))).toBe('issues');
    expect(marketplaceStatusGroup(item({ linked: true, syncState: 'error' }))).toBe('issues');
    expect(marketplaceStatusGroup(undefined)).toBe('issues');
  });

  it('keeps exact marketplace states available inside a listed detail view', () => {
    expect(marketplaceItemStatusLabel('etsy', item({ linked: true, syncState: 'active' }))).toBe('Live');
    expect(marketplaceItemStatusLabel('etsy', item({ linked: true, syncState: 'draft_review' }))).toBe('Draft, needs review');
    expect(marketplaceItemStatusLabel('ebay', item({ linked: true, syncState: 'ended' }))).toBe('Ended');
    expect(marketplaceItemStatusLabel('ebay', item({ linked: true, syncState: 'hidden_oos' }))).toBe('Hidden (sold)');
  });
});
