import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildMarketingAudience, combineSource } from '@/lib/marketing';

describe('combineSource', () => {
  it('combines two distinct sources into a sorted, +-joined string', () => {
    expect(combineSource('subscriber', 'account')).toBe('account+subscriber');
    expect(combineSource('account', 'buyer')).toBe('account+buyer');
    expect(combineSource('subscriber', 'buyer')).toBe('buyer+subscriber');
  });

  it('produces the same result regardless of merge order', () => {
    expect(combineSource('account', 'subscriber')).toBe(combineSource('subscriber', 'account'));
  });

  it('combines a third source into an already-combined value', () => {
    expect(combineSource('account+subscriber', 'buyer')).toBe('account+buyer+subscriber');
  });

  it('is idempotent when the incoming source is already present', () => {
    expect(combineSource('buyer', 'buyer')).toBe('buyer');
    expect(combineSource('account+buyer', 'buyer')).toBe('account+buyer');
  });
});

// Minimal stand-in for the three audience queries: every chain ends in the
// table's rows, whichever filter the builder applied.
function fakeClient(tables: Record<string, unknown[]>): SupabaseClient {
  const result = (table: string) => Promise.resolve({ data: tables[table] ?? [], error: null });
  return {
    from: (table: string) => ({
      select: () => ({
        is: () => result(table),
        eq: () => result(table),
      }),
    }),
  } as unknown as SupabaseClient;
}

describe('buildMarketingAudience timestamps', () => {
  it('carries subscribed_at and profiles.created_at through every merge', async () => {
    const rows = await buildMarketingAudience('all', fakeClient({
      homepage_subscribers: [
        { email: 'both@example.com', full_name: 'Both', source: 'homepage', unsubscribe_token: 't', unsubscribed_at: null, subscribed_at: '2026-08-01T12:00:00.000Z' },
        { email: 'sub@example.com', full_name: 'Sub', source: 'homepage', unsubscribe_token: 't2', unsubscribed_at: null, subscribed_at: '2026-08-02T12:00:00.000Z' },
      ],
      profiles: [
        { id: 'u1', email: 'both@example.com', first_name: null, last_name: null, full_name: 'Both', marketing_opt_out: false, created_at: '2026-07-15T09:30:00.000Z' },
        { id: 'u2', email: 'acct@example.com', first_name: 'A', last_name: 'B', full_name: null, marketing_opt_out: false, created_at: '2026-07-20T09:30:00.000Z' },
      ],
      buyers: [
        { email: 'both@example.com', name: 'Both', user_id: 'u1', marketing_opt_out: false },
        { email: 'buyer@example.com', name: 'Buyer', user_id: null, marketing_opt_out: false },
      ],
    }));
    const byEmail = Object.fromEntries(rows.map((row) => [row.email, row]));

    // subscriber + account + buyer: both stamps survive the two later merges
    expect(byEmail['both@example.com'].subscribedAt).toBe('2026-08-01T12:00:00.000Z');
    expect(byEmail['both@example.com'].accountCreatedAt).toBe('2026-07-15T09:30:00.000Z');
    expect(byEmail['both@example.com'].source).toBe('account+buyer+subscriber');
    // subscriber only
    expect(byEmail['sub@example.com'].subscribedAt).toBe('2026-08-02T12:00:00.000Z');
    expect(byEmail['sub@example.com'].accountCreatedAt).toBeNull();
    // account only
    expect(byEmail['acct@example.com'].subscribedAt).toBeNull();
    expect(byEmail['acct@example.com'].accountCreatedAt).toBe('2026-07-20T09:30:00.000Z');
    // buyer only: neither stamp exists
    expect(byEmail['buyer@example.com'].subscribedAt).toBeNull();
    expect(byEmail['buyer@example.com'].accountCreatedAt).toBeNull();
  });
});
