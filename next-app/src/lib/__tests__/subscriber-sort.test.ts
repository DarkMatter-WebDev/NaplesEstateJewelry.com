import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SubscriberDirectoryRow } from '../marketing';
import {
  DEFAULT_SUBSCRIBER_SORT,
  nextSubscriberSort,
  sortSubscriberRows,
  subscriberAlertsLabel,
  subscriberLanguageLabel,
  subscriberRowFromDirectory,
  subscriberRowKey,
  subscriberSourceLabel,
  type SubscriberRow,
} from '../subscriber-sort';

function row(overrides: Partial<SubscriberRow> & { email: string }): SubscriberRow {
  return {
    subscriberId: null,
    name: null,
    source: 'subscriber',
    subscriberSource: null,
    subscriberEmail: overrides.email,
    subscribedAt: null,
    accountCreatedAt: null,
    phone: null,
    smsStatus: null,
    ...overrides,
  };
}

const ROWS: SubscriberRow[] = [
  row({ email: 'carol@example.com', name: 'Carol', subscribedAt: '2026-09-01T12:00:00Z' }),
  row({ email: 'alice@example.com', name: 'alice', subscribedAt: '2026-09-11T12:00:00Z' }),
  row({ email: 'bob@example.com', name: 'Bob', source: 'account', subscriberEmail: null, accountCreatedAt: '2026-09-05T12:00:00Z' }),
  row({ email: 'dave@example.com', name: null, source: 'buyer', subscriberEmail: null }),
  row({ email: 'erin@example.com', name: 'Erin', source: 'account+subscriber', subscriberSource: 'admin_manual', subscribedAt: '2026-09-11T12:00:00Z', accountCreatedAt: '2026-01-01T00:00:00Z' }),
];

const emails = (rows: SubscriberRow[]) => rows.map((item) => item.email.split('@')[0]);

describe('subscriber sort', () => {
  it('defaults to the Subscribed column, newest first, with undated rows last', () => {
    expect(DEFAULT_SUBSCRIBER_SORT).toEqual({ key: 'subscribed', direction: 'desc' });
    // alice and erin share a timestamp → email breaks the tie; bob's date is his account date.
    expect(emails(sortSubscriberRows(ROWS, DEFAULT_SUBSCRIBER_SORT))).toEqual(['alice', 'erin', 'bob', 'carol', 'dave']);
  });

  it('keeps undated rows last when the date order is flipped', () => {
    expect(emails(sortSubscriberRows(ROWS, { key: 'subscribed', direction: 'asc' }))).toEqual(['carol', 'bob', 'alice', 'erin', 'dave']);
  });

  it('sorts names case-insensitively with blanks last, and flips', () => {
    expect(emails(sortSubscriberRows(ROWS, { key: 'name', direction: 'asc' }))).toEqual(['alice', 'bob', 'carol', 'erin', 'dave']);
    expect(emails(sortSubscriberRows(ROWS, { key: 'name', direction: 'desc' }))).toEqual(['erin', 'carol', 'bob', 'alice', 'dave']);
  });

  it('sorts by email and by the source label the table shows', () => {
    expect(emails(sortSubscriberRows(ROWS, { key: 'email', direction: 'asc' }))).toEqual(['alice', 'bob', 'carol', 'dave', 'erin']);
    expect(subscriberSourceLabel(ROWS[4])).toBe('Admin manual + Account holder');
    // Account holder < Admin manual + … < Newsletter subscriber < Past buyer
    expect(emails(sortSubscriberRows(ROWS, { key: 'source', direction: 'asc' }))).toEqual(['bob', 'erin', 'alice', 'carol', 'dave']);
  });

  it('does not mutate the input', () => {
    const copy = [...ROWS];
    sortSubscriberRows(ROWS, { key: 'email', direction: 'desc' });
    expect(ROWS).toEqual(copy);
  });

  describe('text-alert rows (2026-09-15)', () => {
    const TEXT_ROWS: SubscriberRow[] = [
      row({ email: 'carol@example.com', name: 'Carol', phone: '+12395550199', smsStatus: 'confirmed', subscribedAt: '2026-09-01T12:00:00Z' }),
      // A text-only sign-up: no email at all, keyed by its number.
      row({ email: '', subscriberEmail: null, name: null, phone: '+12395550122', smsStatus: 'pending', subscribedAt: '2026-09-15T12:00:00Z' }),
      row({ email: 'alice@example.com', name: 'alice', subscribedAt: '2026-09-11T12:00:00Z' }),
      row({ email: 'dana@example.com', name: 'Dana', phone: '+12395550177', smsStatus: 'stopped', subscribedAt: '2026-09-05T12:00:00Z' }),
    ];
    const keys = (rows: SubscriberRow[]) => rows.map(subscriberRowKey);

    it('labels the Alerts column from what the row holds', () => {
      expect(subscriberAlertsLabel(TEXT_ROWS[0])).toBe('Both · Confirmed');
      expect(subscriberAlertsLabel(TEXT_ROWS[1])).toBe('Text · Pending YES');
      expect(subscriberAlertsLabel(TEXT_ROWS[2])).toBe('Email');
      expect(subscriberAlertsLabel(TEXT_ROWS[3])).toBe('Both · Stopped');
    });

    it('sorts by phone with rows that have none last, either way', () => {
      // Keys are the email where there is one, so dana's row reads by her email even though it sorts by her number.
      expect(keys(sortSubscriberRows(TEXT_ROWS, { key: 'phone', direction: 'asc' }))).toEqual(['+12395550122', 'dana@example.com', 'carol@example.com', 'alice@example.com']);
      expect(keys(sortSubscriberRows(TEXT_ROWS, { key: 'phone', direction: 'desc' }))).toEqual(['carol@example.com', 'dana@example.com', '+12395550122', 'alice@example.com']);
    });

    it('sorts by the Alerts label and keeps a text-only row in the date order', () => {
      expect(keys(sortSubscriberRows(TEXT_ROWS, { key: 'alerts', direction: 'asc' }))).toEqual(['carol@example.com', 'dana@example.com', 'alice@example.com', '+12395550122']);
      expect(keys(sortSubscriberRows(TEXT_ROWS, DEFAULT_SUBSCRIBER_SORT))).toEqual(['+12395550122', 'alice@example.com', 'dana@example.com', 'carol@example.com']);
    });

    it('sorts a blank email last without crashing on the empty string', () => {
      expect(keys(sortSubscriberRows(TEXT_ROWS, { key: 'email', direction: 'asc' }))).toEqual(['alice@example.com', 'carol@example.com', 'dana@example.com', '+12395550122']);
    });
  });
});

describe('nextSubscriberSort', () => {
  it('opens a text column ascending and the date column newest first', () => {
    expect(nextSubscriberSort(DEFAULT_SUBSCRIBER_SORT, 'name')).toEqual({ key: 'name', direction: 'asc' });
    expect(nextSubscriberSort({ key: 'name', direction: 'desc' }, 'subscribed')).toEqual({ key: 'subscribed', direction: 'desc' });
  });

  it('flips the direction when the same header is clicked again', () => {
    expect(nextSubscriberSort(DEFAULT_SUBSCRIBER_SORT, 'subscribed')).toEqual({ key: 'subscribed', direction: 'asc' });
    expect(nextSubscriberSort({ key: 'email', direction: 'asc' }, 'email')).toEqual({ key: 'email', direction: 'desc' });
  });
});

// 2026-11-24: the owner switched a subscriber to Spanish, reopened Edit and it
// showed English — the page dropped both languages when it built the table.
describe('the subscriber language reaches the table and Edit', () => {
  const directoryRow = (overrides: Partial<SubscriberDirectoryRow>): SubscriberDirectoryRow => ({
    email: 'maria@example.com',
    name: 'Maria',
    source: 'subscriber',
    subscriberSource: 'admin_manual',
    unsubscribeToken: null,
    userId: null,
    subscriberEmail: 'maria@example.com',
    subscribedAt: '2026-11-20T12:00:00Z',
    accountCreatedAt: null,
    subscriberId: 'row-1',
    phone: '+12395550148',
    smsStatus: 'confirmed',
    language: 'es',
    subscriberLanguage: 'es',
    ...overrides,
  });

  it('a Spanish row keeps both languages, so Edit opens on Español and the line says Español', () => {
    const line = subscriberRowFromDirectory(directoryRow({}));
    expect(line.subscriberLanguage).toBe('es');
    expect(line.language).toBe('es');
    expect(subscriberLanguageLabel(line)).toBe('Español');
  });

  it('an English row, and a line with no newsletter row, read English and stay read-only', () => {
    expect(subscriberRowFromDirectory(directoryRow({ language: 'en', subscriberLanguage: 'en' })).subscriberLanguage).toBe('en');
    const buyerOnly = subscriberRowFromDirectory(directoryRow({ subscriberId: null, language: undefined, subscriberLanguage: null }));
    expect(buyerOnly.language).toBe('en');
    expect(buyerOnly.subscriberLanguage).toBeNull();
    expect(subscriberLanguageLabel(buyerOnly)).toBe('English');
  });

  it('a buyer whose latest order was Spanish shows Español without a newsletter setting', () => {
    const line = subscriberRowFromDirectory(directoryRow({ subscriberId: null, language: 'es', subscriberLanguage: null }));
    expect(subscriberLanguageLabel(line)).toBe('Español');
    expect(line.subscriberLanguage).toBeNull();
  });

  it('copies every field the table reads (none silently dropped)', () => {
    const line = subscriberRowFromDirectory(directoryRow({}));
    const expected: (keyof SubscriberRow)[] = ['subscriberId', 'email', 'name', 'source', 'subscriberSource', 'subscriberEmail', 'subscribedAt', 'accountCreatedAt', 'phone', 'smsStatus', 'language', 'subscriberLanguage'];
    expect(Object.keys(line).sort()).toEqual([...expected].sort());
  });

  it('the page builds its lines through subscriberRowFromDirectory, and Edit opens on the saved setting', () => {
    const src = join(process.cwd(), 'src');
    const page = readFileSync(join(src, 'app', '[locale]', 'admin', 'subscribers', 'page.tsx'), 'utf8');
    expect(page).toContain('audienceResult.data.map(subscriberRowFromDirectory)');
    const manager = readFileSync(join(src, 'components', 'admin', 'SubscribersManager.tsx'), 'utf8');
    expect(manager).toContain("language: row.subscriberLanguage ?? 'en' });");
    expect(manager).toContain("{ label: 'Language', sortKey: 'language' },");
  });

  it('sorts by language, Español grouped after English ascending', () => {
    const rows = [
      row({ email: 'a@example.com', language: 'es' }),
      row({ email: 'b@example.com', language: 'en' }),
      row({ email: 'c@example.com' }),
    ];
    expect(sortSubscriberRows(rows, { key: 'language', direction: 'asc' }).map((r) => r.email)).toEqual(['b@example.com', 'c@example.com', 'a@example.com']);
    expect(sortSubscriberRows(rows, { key: 'language', direction: 'desc' })[0].email).toBe('a@example.com');
  });
});
