// Delivery tracking emails (owner, 2026-11-05, mockup 4 approved) — the PURE,
// client-safe half: carrier names, tracking-number display, scan times and
// places, and the admin status wording. The EasyPost calls, the database and
// the sending live in `order-tracking-server.ts` / `easypost.ts`.
//
// ⛔ Scan times are shown in the SCAN'S OWN local time. EasyPost stamps each
// scan with the local UTC offset when it knows the place ("…T14:14:00-05:00")
// and falls back to UTC ("…Z") when it does not. So the wall-clock digits are
// read straight off the string; only a "Z" stamp is converted (to Eastern, the
// shop's zone — a best guess, as EasyPost itself calls these "best-effort").
// No Intl here on purpose: Node's Intl puts a U+202F narrow space before
// "PM", and the project rule is never Intl for times.

export type EasyPostTrackerStatus =
  | 'unknown'
  | 'pre_transit'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'available_for_pickup'
  | 'return_to_sender'
  | 'failure'
  | 'cancelled'
  | 'error';

/** One row of `public.order_tracking` (supabase/order-tracking-2026-11.sql). */
export interface OrderTrackingRow {
  order_id: string;
  tracking_number: string;
  carrier: string | null;
  easypost_tracker_id: string | null;
  status: string | null;
  status_detail: string | null;
  public_url: string | null;
  last_event_message: string | null;
  /** Raw EasyPost datetime string, offset kept (never normalised to UTC). */
  last_event_at: string | null;
  last_event_city: string | null;
  last_event_state: string | null;
  last_event_zip: string | null;
  out_for_delivery_at: string | null;
  delivered_at: string | null;
  delivered_message: string | null;
  register_error: string | null;
  out_for_delivery_email_at: string | null;
  delivered_email_at: string | null;
  checked_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** EasyPost carrier string for what the owner typed, or null (EasyPost then auto-detects). */
export function easyPostCarrier(carrier: string | null | undefined): string | null {
  const c = String(carrier ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (!c) return null;
  if (c.includes('usps') || c.includes('postal') || c.includes('postoffice')) return 'USPS';
  if (c === 'ups' || c.startsWith('ups')) return 'UPS';
  if (c.includes('fedex')) return 'FedEx';
  if (c.includes('dhl')) return 'DHLExpress';
  return null;
}

/** The tracking number with spaces and dashes removed — what carriers and EasyPost take. */
export function compactTrackingNumber(value: string | null | undefined): string {
  return String(value ?? '').replace(/[\s-]+/g, '').trim();
}

/** Same number, ignoring spaces/dashes and case. */
export function sameTrackingNumber(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = compactTrackingNumber(a).toUpperCase();
  return Boolean(left) && left === compactTrackingNumber(b).toUpperCase();
}

/**
 * How the number reads in an email: a long all-digit USPS number in groups of
 * four ("9405 5112 0620 1234 5678 90"), the way USPS prints it. Anything else
 * (UPS "1Z…", FedEx) exactly as the owner typed it.
 */
export function formatTrackingNumber(value: string | null | undefined): string {
  const typed = String(value ?? '').trim();
  const compact = compactTrackingNumber(typed);
  if (/^\d{20,34}$/.test(compact)) return compact.replace(/(\d{4})(?=\d)/g, '$1 ');
  return typed;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface ScanTimeParts {
  /** "Thu, Nov 12" */
  date: string;
  /** "2:14 PM" — plain ASCII space, never U+202F. */
  time: string;
}

/** Second Sunday of March 2:00 → first Sunday of November 2:00 (US Eastern DST), as UTC ms. */
function easternOffsetHours(utcMs: number): number {
  const year = new Date(utcMs).getUTCFullYear();
  const nthSunday = (month: number, n: number) => {
    const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
    return 1 + ((7 - first) % 7) + (n - 1) * 7;
  };
  // 2:00 local = 7:00 UTC in March (EST), 6:00 UTC in November (EDT).
  const dstStart = Date.UTC(year, 2, nthSunday(2, 2), 7);
  const dstEnd = Date.UTC(year, 10, nthSunday(10, 1), 6);
  return utcMs >= dstStart && utcMs < dstEnd ? -4 : -5;
}

function wallClockParts(year: number, month: number, day: number, hour: number, minute: number): ScanTimeParts {
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return {
    date: `${weekday}, ${MONTHS[month - 1]} ${day}`,
    time: `${h12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`,
  };
}

/** Date + time of a scan in the scan's own local time (see the header note). Null if unreadable. */
export function formatScanTime(raw: string | null | undefined): ScanTimeParts | null {
  const value = String(raw ?? '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi, zone] = match;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;

  if (zone && zone !== 'Z') return wallClockParts(year, month, day, hour, minute);

  // UTC stamp (or no zone at all, which EasyPost documents as UTC): show Eastern.
  const utcMs = Date.UTC(year, month - 1, day, hour, minute);
  const local = new Date(utcMs + easternOffsetHours(utcMs) * 3600_000);
  return wallClockParts(
    local.getUTCFullYear(),
    local.getUTCMonth() + 1,
    local.getUTCDate(),
    local.getUTCHours(),
    local.getUTCMinutes(),
  );
}

/** Milliseconds since epoch for a scan stamp, honouring its offset. NaN if unreadable. */
export function scanInstant(raw: string | null | undefined): number {
  const value = String(raw ?? '').trim();
  if (!value) return NaN;
  return Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`);
}

/** "NAPLES" → "Naples", "FORT MYERS" → "Fort Myers". Carriers send cities in capitals. */
function titleCaseCity(city: string): string {
  return city
    .toLowerCase()
    .replace(/(^|[\s'-])([a-z])/g, (_, lead: string, letter: string) => `${lead}${letter.toUpperCase()}`);
}

/** "Naples, FL 34102" from a scan's location; null when there is nothing to show. */
export function formatScanPlace(
  city: string | null | undefined,
  state: string | null | undefined,
  zip: string | null | undefined,
): string | null {
  const c = String(city ?? '').trim();
  const s = String(state ?? '').trim().toUpperCase();
  const z = String(zip ?? '').trim().slice(0, 5);
  const cityState = [c ? titleCaseCity(c) : '', s].filter(Boolean).join(', ');
  const place = [cityState, z].filter(Boolean).join(' ').trim();
  return place || null;
}

/**
 * Where USPS says it left the package: "Delivered, Left with Individual" →
 * "Left with Individual". Null when the scan does not say (plain "Delivered").
 */
export function deliveredWhere(message: string | null | undefined): string | null {
  const text = String(message ?? '').trim();
  const match = /^delivered\s*[,:-]\s*(.+)$/i.exec(text);
  if (!match) return null;
  const where = match[1].replace(/\s+/g, ' ').trim();
  return where || null;
}

const STATUS_LABELS: Record<string, string> = {
  unknown: 'Waiting for the first carrier scan',
  pre_transit: 'Label created — waiting for the carrier to pick it up',
  in_transit: 'In transit',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  available_for_pickup: 'Held at the post office for pickup',
  return_to_sender: 'Being returned to you',
  failure: 'Delivery problem — check the carrier',
  cancelled: 'Cancelled by the carrier',
  error: 'Carrier error — check the carrier',
};

/** Admin wording for an EasyPost tracker status. */
export function trackingStatusLabel(status: string | null | undefined): string {
  const key = String(status ?? '').trim();
  if (!key) return STATUS_LABELS.unknown;
  return STATUS_LABELS[key] ?? key.replace(/_/g, ' ');
}

/** Statuses after which a tracker stops changing (the sweep stops re-checking these). */
export const FINAL_TRACKING_STATUSES = new Set(['delivered', 'return_to_sender', 'failure', 'cancelled']);
