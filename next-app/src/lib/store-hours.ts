import 'server-only';

import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';
import { SHOP_SETTINGS_TABLE } from '@/lib/shop-settings';
import { DEFAULT_STORE_HOURS, WEEK_ORDER, type StoreHoursSchedule } from '@/lib/business-location';

// Re-exported so server code can take default + fetch from one import; the
// constant itself lives in business-location.ts, which client code may use.
export { DEFAULT_STORE_HOURS };

/**
 * Admin-editable weekly showroom hours — the server-side data layer.
 *
 * Storage: `shop_settings.store_hours` (jsonb, single row, added by
 * `supabase/store-hours-2026-08.sql`). `null` or any malformed/unreachable
 * value degrades to `DEFAULT_STORE_HOURS`, so the site renders its historical
 * Mon–Sat 10:00–16:00 hours until the migration runs and an admin saves.
 *
 * ⛔ Server-only (`unstable_cache` + a server Supabase read). Client components
 * that need hours receive a formatted STRING prop from their server parent —
 * never import this module from `'use client'` code.
 */

export const STORE_HOURS_CACHE_TAG = 'store-hours';

/** 24h `HH:MM`, zero-padded — the storage AND `<input type="time">` format. */
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Validate an untrusted value (jsonb column or PUT body) into a schedule.
 * Returns null on ANY defect — caller falls back to `DEFAULT_STORE_HOURS`
 * (reads) or rejects with a per-field message (the admin API re-implements
 * these checks with error strings; keep the two in sync).
 *
 * Rules: exactly the 7 canonical English day keys, no extras; `open` boolean;
 * `opens`/`closes` match `TIME_RE`; open days need `closes > opens` — plain
 * string compare, valid because zero-padded `HH:MM` sorts lexicographically.
 */
export function parseStoreHours(value: unknown): StoreHoursSchedule | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== WEEK_ORDER.length) return null;
  const result = {} as StoreHoursSchedule;
  for (const day of WEEK_ORDER) {
    const entry = record[day];
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return null;
    const { open, opens, closes } = entry as Record<string, unknown>;
    if (typeof open !== 'boolean') return null;
    if (typeof opens !== 'string' || !TIME_RE.test(opens)) return null;
    if (typeof closes !== 'string' || !TIME_RE.test(closes)) return null;
    if (open && closes <= opens) return null;
    result[day] = { open, opens, closes };
  }
  return result;
}

const fetchCachedStoreHours = unstable_cache(
  async (): Promise<StoreHoursSchedule | null> => {
    try {
      const { data, error } = await createPublicClient()
        .from(SHOP_SETTINGS_TABLE)
        .select('store_hours')
        .eq('id', true)
        .maybeSingle();
      // Column/table not migrated yet, or any query error → default.
      if (error) return null;
      return parseStoreHours(data?.store_hours);
    } catch {
      return null;
    }
  },
  // v1: bump if StoreHoursSchedule's shape ever changes — a cached old payload
  // would otherwise deserialize into the new shape.
  ['store-hours-v1'],
  {
    tags: [STORE_HOURS_CACHE_TAG],
    revalidate: 300,
  },
);

/**
 * The live weekly schedule, cached 5 minutes and busted immediately by the
 * admin PUT via `revalidateTag(STORE_HOURS_CACHE_TAG, { expire: 0 })`.
 * Never throws — every failure path serves `DEFAULT_STORE_HOURS`.
 */
export async function getStoreHours(): Promise<StoreHoursSchedule> {
  try {
    return (await fetchCachedStoreHours()) ?? DEFAULT_STORE_HOURS;
  } catch {
    return DEFAULT_STORE_HOURS;
  }
}
