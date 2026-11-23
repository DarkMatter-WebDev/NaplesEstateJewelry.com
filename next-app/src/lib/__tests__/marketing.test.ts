import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildMarketingAudience,
  campaignVersionFor,
  combineSource,
  countByLanguage,
  recipientLanguage,
  unsubscribeUrlFor,
} from '@/lib/marketing';
import { withMarketingFooter } from '@/lib/marketing-email-html';

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
        // The orders read for each recipient's language (2026-11-22).
        not: () => ({ order: () => ({ limit: () => result(table) }) }),
      }),
    }),
  } as unknown as SupabaseClient;
}

describe('buildMarketingAudience language (2026-11-22, owner "4A")', () => {
  it('is Spanish for a Spanish newsletter row or a Spanish LATEST order; English otherwise', async () => {
    const rows = await buildMarketingAudience('all', fakeClient({
      homepage_subscribers: [
        { email: 'es-sub@example.com', full_name: 'Luis', source: 'homepage_hero', unsubscribe_token: 't', unsubscribed_at: null, subscribed_at: null, locale: 'es' },
        { email: 'en-sub@example.com', full_name: 'Mary', source: 'homepage_hero', unsubscribe_token: 't2', unsubscribed_at: null, subscribed_at: null, locale: 'en' },
      ],
      profiles: [],
      buyers: [
        { email: 'Buyer-ES@example.com', name: 'Ana', user_id: null, marketing_opt_out: false },
        { email: 'back-to-en@example.com', name: 'Joe', user_id: null, marketing_opt_out: false },
      ],
      // Oldest first, as the query orders them: the LAST one wins.
      orders: [
        { customer_email: 'buyer-es@example.com', customer_language: 'es', created_at: '2026-11-21T10:00:00Z' },
        { customer_email: 'back-to-en@example.com', customer_language: 'es', created_at: '2026-11-21T10:00:00Z' },
        { customer_email: 'back-to-en@example.com', customer_language: 'en', created_at: '2026-11-22T10:00:00Z' },
      ],
    }));
    const language = Object.fromEntries(rows.map((row) => [row.email, row.language]));
    expect(language['es-sub@example.com']).toBe('es');
    expect(language['en-sub@example.com']).toBe('en');
    expect(language['buyer-es@example.com']).toBe('es');
    expect(language['back-to-en@example.com']).toBe('en');
    expect(countByLanguage(rows)).toEqual({ en: 2, es: 2 });
  });

  it('reads everyone as English when the orders cannot be read', async () => {
    const client = {
      from: (table: string) => ({
        select: () => ({
          is: () => Promise.resolve({ data: table === 'homepage_subscribers' ? [{ email: 'a@example.com', full_name: null, source: null, unsubscribe_token: null, unsubscribed_at: null, subscribed_at: null, locale: 'en' }] : [], error: null }),
          eq: () => Promise.resolve({ data: [], error: null }),
          not: () => { throw new Error('boom'); },
        }),
      }),
    } as unknown as SupabaseClient;
    const rows = await buildMarketingAudience('all', client);
    expect(rows.map((row) => row.language)).toEqual(['en']);
  });

  it('recipientLanguage + campaignVersionFor: Spanish only with a full Spanish version (owner "3A")', () => {
    expect(recipientLanguage({ subscriberSpanish: true, latestOrderLanguage: null })).toBe('es');
    expect(recipientLanguage({ subscriberSpanish: false, latestOrderLanguage: 'es' })).toBe('es');
    expect(recipientLanguage({ subscriberSpanish: false, latestOrderLanguage: 'en' })).toBe('en');
    const english = { subject: 'New arrivals', html: '<p>Hi</p>' };
    const spanish = { subject: 'Nuevas piezas', html: '<p>Hola</p>' };
    expect(campaignVersionFor({ language: 'es' }, english, spanish)).toEqual({ ...spanish, language: 'es' });
    expect(campaignVersionFor({ language: 'en' }, english, spanish)).toEqual({ ...english, language: 'en' });
    expect(campaignVersionFor({ language: 'es' }, english, null)).toEqual({ ...english, language: 'en' });
    expect(campaignVersionFor({ language: 'es' }, english, { subject: 'Hola', html: '  ' })).toEqual({ ...english, language: 'en' });
    expect(campaignVersionFor({}, english, spanish).language).toBe('en');
  });

  it('a Spanish email gets the Spanish footer and the Spanish unsubscribe page; English is unchanged', () => {
    const recipient = { email: 'a@example.com', unsubscribeToken: 'tok' } as Parameters<typeof unsubscribeUrlFor>[0];
    expect(unsubscribeUrlFor(recipient, 'https://x.com')).toBe('https://x.com/unsubscribe?token=tok&email=a%40example.com');
    expect(unsubscribeUrlFor(recipient, 'https://x.com', 'es')).toBe('https://x.com/es/unsubscribe?token=tok&email=a%40example.com');
    const en = withMarketingFooter('<p>Hi</p>', 'https://x.com/u', '1 Main St');
    expect(en).toContain('You are receiving this marketing email because you subscribed or have a Naples Estate Jewelry account.');
    expect(en).toContain('>Unsubscribe</a>');
    const es = withMarketingFooter('<p>Hola</p>', 'https://x.com/es/u', '1 Main St', 'es');
    expect(es).toContain('Recibe este correo de mercadeo porque se suscribió o tiene una cuenta en Naples Estate Jewelry.');
    expect(es).toContain('>Cancelar suscripción</a>');
    expect(es).not.toContain('Unsubscribe<');
  });
});

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
