import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import { SCAN_SOURCE_KEYS, type ScanSource } from '@/lib/scan-sources';

// QR / short-link scan counter (2026-10-31). One row per counted visit in
// `qr_scans` — time + source only (supabase/qr-scans-2026-10.sql). Written by
// /api/magnet (server side) and POST /api/scan (the card pages' ping), read by
// Admin → Insights. The list of sources: lib/scan-sources.ts.

const TABLE = 'qr_scans';
/** A redirect or a page ping must never wait long on the counter. */
const RECORD_TIMEOUT_MS = 1500;

/**
 * Save one scan. Awaited by the routes (not `after()`: Netlify freezes the
 * function once the response is sent), but capped so a slow or missing table
 * never delays anything more than RECORD_TIMEOUT_MS. Never throws.
 */
export async function recordScan(source: ScanSource): Promise<boolean> {
  const insert = (async () => {
    try {
      const { error } = await createServiceClient()
        .from(TABLE)
        .insert({ source, scanned_at: new Date().toISOString() });
      if (error) {
        console.error(`Scan not saved (${source}):`, error.code, error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.error(`Scan not saved (${source}):`, err);
      return false;
    }
  })();
  const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), RECORD_TIMEOUT_MS));
  return Promise.race([insert, timeout]);
}

export type ScanSummary = {
  last7Days: number;
  last30Days: number;
  allTime: number;
  lastScanAt: string | null;
};

/** Newest scan times per source shown on Admin → Insights (owner 10-31: "timestamps … grouped by page"). */
export const RECENT_SCANS_PER_SOURCE = 200;

/**
 * Each source's most recent scan times (ISO strings, newest first), capped at
 * RECENT_SCANS_PER_SOURCE so a busy code can't make the page heavy — the
 * counts above the list stay exact. `null` when the table is not there yet.
 */
export async function getRecentScans(
  limitPerSource: number = RECENT_SCANS_PER_SOURCE,
): Promise<Record<ScanSource, string[]> | null> {
  try {
    const db = createServiceClient();
    const perSource = await Promise.all(
      SCAN_SOURCE_KEYS.map(async (source) => {
        const { data, error } = await db
          .from(TABLE)
          .select('scanned_at')
          .eq('source', source)
          .order('scanned_at', { ascending: false })
          .limit(limitPerSource);
        if (error) throw error;
        return [source, (data ?? []).map((row) => (row as { scanned_at: string }).scanned_at)] as const;
      }),
    );
    return Object.fromEntries(perSource) as Record<ScanSource, string[]>;
  } catch (err) {
    const e = err as { code?: string; message?: string };
    console.error('Recent scans unavailable:', e?.code ?? '', e?.message ?? err);
    return null;
  }
}

/** Counts per source for Admin → Insights. `null` when the table is not there yet (SQL not run). */
export async function getScanSummaries(now: Date = new Date()): Promise<Record<ScanSource, ScanSummary> | null> {
  try {
    const db = createServiceClient();
    const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
    const count = (source: ScanSource, since?: string) => {
      const q = db.from(TABLE).select('id', { count: 'exact', head: true }).eq('source', source);
      return since ? q.gte('scanned_at', since) : q;
    };
    const perSource = await Promise.all(
      SCAN_SOURCE_KEYS.map(async (source) => {
        const [week, month, all, latest] = await Promise.all([
          count(source, daysAgo(7)),
          count(source, daysAgo(30)),
          count(source),
          db.from(TABLE).select('scanned_at').eq('source', source).order('scanned_at', { ascending: false }).limit(1),
        ]);
        const failed = [week, month, all, latest].find((r) => r.error);
        if (failed?.error) throw failed.error;
        const summary: ScanSummary = {
          last7Days: week.count ?? 0,
          last30Days: month.count ?? 0,
          allTime: all.count ?? 0,
          lastScanAt: (latest.data?.[0] as { scanned_at?: string } | undefined)?.scanned_at ?? null,
        };
        return [source, summary] as const;
      }),
    );
    return Object.fromEntries(perSource) as Record<ScanSource, ScanSummary>;
  } catch (err) {
    const e = err as { code?: string; message?: string };
    console.error('Scan counts unavailable:', e?.code ?? '', e?.message ?? err);
    return null;
  }
}
