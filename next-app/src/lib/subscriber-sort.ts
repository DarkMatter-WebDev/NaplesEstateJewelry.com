/**
 * Sorting for Admin → Subscribers (`components/admin/SubscribersManager.tsx`).
 * Pure so the order rules are testable: click a header to sort by it, click
 * again to flip; the default is the Subscribed column, newest first (owner,
 * 2026-09-12). Rows without a date sort last in both directions so a fresh
 * subscriber never hides under undated account rows.
 *
 * Since 2026-09-15 a row may be a text-alert sign-up with no email at all
 * (`email` is '' then, `phone` carries the number). The Phone and Alerts
 * columns sort like the others; blanks sit last either way.
 */
import { formatUsPhone, smsStatusLabel, subscriberChannelLabel, type SmsStatus } from './subscriber-phone';

export type SubscriberRow = {
  /** '' for a text-only sign-up. */
  email: string;
  name: string | null;
  source: string | null;
  subscriberSource: string | null;
  subscriberEmail: string | null;
  /** When the newsletter row was created; null for account/buyer-only rows. */
  subscribedAt: string | null;
  /** When the matching site account was created; null when there is none. */
  accountCreatedAt: string | null;
  /** The mobile number in E.164 (`+12395550148`), when text alerts were requested. */
  phone: string | null;
  /** Where the number stands: waiting for the YES reply, confirmed, or stopped. */
  smsStatus: SmsStatus | null;
};

export type SubscriberSortKey = 'name' | 'email' | 'phone' | 'alerts' | 'source' | 'subscribed';
export type SubscriberSortDirection = 'asc' | 'desc';
export interface SubscriberSort {
  key: SubscriberSortKey;
  direction: SubscriberSortDirection;
}

export const DEFAULT_SUBSCRIBER_SORT: SubscriberSort = { key: 'subscribed', direction: 'desc' };

/** Text columns open ascending (A→Z); the date column opens newest first. */
function defaultDirection(key: SubscriberSortKey): SubscriberSortDirection {
  return key === 'subscribed' ? 'desc' : 'asc';
}

/** A header click: same column flips the direction, a new column opens in its natural direction. */
export function nextSubscriberSort(current: SubscriberSort, key: SubscriberSortKey): SubscriberSort {
  if (current.key !== key) return { key, direction: defaultDirection(key) };
  return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
}

// `row.source` may be a single value ('subscriber'/'account'/'buyer') or a
// sorted '+'-joined combination (see combineSource in lib/marketing.ts) when
// the same email matched more than one audience — checked by substring
// rather than exact match so any combination renders a correct label instead
// of falling through to a wrong default.
export function subscriberSourceLabel(row: Pick<SubscriberRow, 'source' | 'subscriberSource'>): string {
  const source = row.source ?? '';
  const parts: string[] = [];
  if (source.includes('subscriber')) {
    // 'buy_receipt' = a seller ticked "Add me to the mailing list" on the buy receipt's customer screen.
    parts.push(
      row.subscriberSource === 'admin_manual' ? 'Admin manual' : row.subscriberSource === 'buy_receipt' ? 'Buy receipt' : 'Newsletter subscriber',
    );
  }
  if (source.includes('account')) parts.push('Account holder');
  if (source.includes('buyer')) parts.push('Past buyer');
  return parts.length > 0 ? parts.join(' + ') : 'Newsletter subscriber';
}

/** "Both · Confirmed", "Text · Pending YES", "Email" — the Alerts column, and what it sorts by. */
export function subscriberAlertsLabel(row: Pick<SubscriberRow, 'email' | 'phone' | 'smsStatus'>): string {
  const channel = subscriberChannelLabel({ email: row.email || null, phone: row.phone });
  const status = row.phone ? smsStatusLabel(row.smsStatus) : '';
  return status ? `${channel} · ${status}` : channel;
}

/** The date the Subscribed column shows: the newsletter row, else the account creation. */
export function subscriberSortDate(row: Pick<SubscriberRow, 'subscribedAt' | 'accountCreatedAt'>): number | null {
  const raw = row.subscribedAt ?? row.accountCreatedAt;
  if (!raw) return null;
  const time = new Date(raw).getTime();
  return Number.isNaN(time) ? null : time;
}

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

/** Email, else the number, so every row has a stable identity for tie-breaks and keys. */
export function subscriberRowKey(row: Pick<SubscriberRow, 'email' | 'phone'>): string {
  return row.email || row.phone || '';
}

/** The value a column sorts by; null means "nothing to show" and sorts last either way. */
function sortValue(row: SubscriberRow, key: SubscriberSortKey): string | number | null {
  switch (key) {
    case 'name':
      return row.name?.trim() || null;
    case 'email':
      return row.email.trim() || null;
    case 'phone':
      return row.phone ? formatUsPhone(row.phone) : null;
    case 'alerts':
      return subscriberAlertsLabel(row);
    case 'source':
      return subscriberSourceLabel(row);
    case 'subscribed':
      return subscriberSortDate(row);
    default:
      return null;
  }
}

export function sortSubscriberRows(rows: readonly SubscriberRow[], sort: SubscriberSort): SubscriberRow[] {
  const sign = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = sortValue(a, sort.key);
    const right = sortValue(b, sort.key);
    // Blank names and missing dates sit at the bottom in BOTH directions, so
    // flipping a column never buries the real values under the empty ones.
    if (left == null && right == null) return collator.compare(subscriberRowKey(a), subscriberRowKey(b));
    if (left == null) return 1;
    if (right == null) return -1;
    const primary = typeof left === 'number' && typeof right === 'number'
      ? left - right
      : collator.compare(String(left), String(right));
    if (primary !== 0) return primary * sign;
    // Email (or the number) breaks every tie so the order is stable across re-renders.
    return collator.compare(subscriberRowKey(a), subscriberRowKey(b));
  });
}
