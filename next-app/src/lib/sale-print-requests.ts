// In-store sale receipts printed by the Print Station (owner, 2026-10-26:
// "record sale and print receipt from the print station ... if the user
// records the sale on the laptop").
//
// One row in `sale_print_requests` (supabase/sale-print-requests-2026-10.sql)
// per press of "Send to desktop printer": the order and its one-page paper
// receipt (`order-receipt-paper.ts`), built by the site when the row is made.
// The station (`components/admin/buy-receipts/PrintStation.tsx`) reads the
// table straight from Supabase, claims a row, prints it and sets `printed_at`;
// the laptop watches its row (`components/admin/instant-sale/SaleStationPrint.tsx`).
// Same claim rules as a buy receipt (`lib/buy-receipts.ts`).
//
// Pure: no React, no Supabase client.
import type { PaperReceipt } from '@/lib/order-receipt-paper';
import { BUY_RECEIPT_CLAIM_STALE_MS } from '@/lib/buy-receipts';

export const SALE_PRINT_TABLE = 'sale_print_requests';

export const SALE_PRINT_COLUMNS =
  'id, order_id, order_number, customer_name, total, paper, requested_at, requested_by, claimed_at, claimed_by, printed_at';

export type SalePrintRequestRow = {
  id: string;
  order_id: string;
  order_number: string;
  customer_name: string | null;
  total: number | string | null;
  paper: PaperReceipt;
  requested_at: string;
  requested_by: string | null;
  claimed_at: string | null;
  claimed_by: string | null;
  printed_at: string | null;
};

/** What the laptop keeps after a send: enough to watch the row. */
export type SalePrintRequestRef = { id: string; requestedAt: string };

/** The laptop's watch after a send (same timings as a buy receipt's). */
export const SALE_PRINT_WATCH_EVERY_MS = 2_000;
export const SALE_PRINT_WATCH_STALLED_MS = 30_000;
export const SALE_PRINT_WATCH_GIVE_UP_MS = 60_000;

export const SALE_PRINT_MESSAGES = {
  waiting: 'Sent. Waiting for the desktop…',
  printed: 'Printed on the desktop.',
  stalled: 'The desktop has not picked this up. Is the Print Station window open on the printer PC?',
  notSent: 'The sale is recorded, but it could not be sent to the desktop printer. Press Send to desktop printer to try again.',
  needsSql: 'The desktop printer needs supabase/sale-print-requests-2026-10.sql run in Supabase first.',
} as const;

export type SalePrintPhase = 'waiting' | 'printed' | 'stalled';

/** A paper receipt as stored in the row: all three parts present as strings. */
export function isPaperReceipt(value: unknown): value is PaperReceipt {
  if (!value || typeof value !== 'object') return false;
  const paper = value as Record<string, unknown>;
  return typeof paper.title === 'string' && typeof paper.css === 'string' && typeof paper.body === 'string' && paper.body.length > 0;
}

/** Not printed yet. */
export function isSalePrintPending(row: Pick<SalePrintRequestRow, 'printed_at'>): boolean {
  return !row.printed_at;
}

/** No station holds this row, or the one that did went quiet (same 90 s as a buy receipt). */
export function isSaleClaimStale(row: Pick<SalePrintRequestRow, 'claimed_at'>, nowMs: number): boolean {
  if (!row.claimed_at) return true;
  return nowMs - new Date(row.claimed_at).getTime() > BUY_RECEIPT_CLAIM_STALE_MS;
}

/** The next row this station may print: oldest first, unprinted, unclaimed (or abandoned), not already printed here. */
export function nextSalePrint<T extends Pick<SalePrintRequestRow, 'id' | 'printed_at' | 'claimed_at' | 'requested_at'>>(
  rows: T[],
  nowMs: number,
  skip: ReadonlySet<string> = new Set(),
): T | null {
  return [...rows]
    .sort((a, b) => a.requested_at.localeCompare(b.requested_at))
    .find((row) => isSalePrintPending(row) && isSaleClaimStale(row, nowMs) && !skip.has(row.id)) ?? null;
}

/**
 * What the laptop says about its row. `null` row = not readable (yet): keep
 * waiting until the give-up time. Stalled = 30 s and no station has claimed it,
 * or a minute has gone by.
 */
export function salePrintWatchPhase(
  row: Pick<SalePrintRequestRow, 'printed_at' | 'claimed_at'> | null,
  elapsedMs: number,
): SalePrintPhase {
  if (row?.printed_at) return 'printed';
  if (elapsedMs > SALE_PRINT_WATCH_GIVE_UP_MS) return 'stalled';
  if (elapsedMs > SALE_PRINT_WATCH_STALLED_MS && !row?.claimed_at) return 'stalled';
  return 'waiting';
}

/** The station's row label. */
export function salePrintLabel(row: Pick<SalePrintRequestRow, 'printed_at' | 'claimed_at'>): string {
  if (row.printed_at) return 'Printed';
  return row.claimed_at ? 'Printing' : 'Waiting for the desktop';
}

/** The row the route inserts. */
export function salePrintInsert(input: {
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  total: number | null;
  paper: PaperReceipt;
  requestedBy: string | null;
}) {
  return {
    order_id: input.orderId,
    order_number: input.orderNumber,
    customer_name: input.customerName,
    total: input.total,
    paper: input.paper,
    requested_by: input.requestedBy,
  };
}

/** Postgres "relation does not exist" — the SQL file has not been run. */
export function isMissingSalePrintTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  const message = error.message ?? '';
  return /sale_print_requests/.test(message) && /does not exist|could not find/i.test(message);
}
