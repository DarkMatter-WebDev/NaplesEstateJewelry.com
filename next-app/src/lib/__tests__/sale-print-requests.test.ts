import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isMissingSalePrintTable,
  isPaperReceipt,
  isSaleClaimStale,
  isSalePrintPending,
  nextSalePrint,
  SALE_PRINT_COLUMNS,
  SALE_PRINT_MESSAGES,
  SALE_PRINT_TABLE,
  salePrintInsert,
  salePrintLabel,
  salePrintWatchPhase,
} from '../sale-print-requests';
import { BUY_RECEIPT_CLAIM_STALE_MS } from '../buy-receipts';

// In-store sale receipts printed by the Print Station (owner, 2026-10-26).

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const NOW = Date.parse('2026-10-26T18:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const paper = { title: 'Receipt NEJ-1', css: '.nej-paper{}', body: '<div class="nej-paper">x</div>' };

function row(over: Partial<{ id: string; printed_at: string | null; claimed_at: string | null; requested_at: string }> = {}) {
  return { id: 'a', printed_at: null, claimed_at: null, requested_at: ago(10_000), ...over };
}

describe('sale print queue rules', () => {
  it('a row is waiting until printed_at is set', () => {
    expect(isSalePrintPending({ printed_at: null })).toBe(true);
    expect(isSalePrintPending({ printed_at: ago(1) })).toBe(false);
  });

  it('a claim is taken over only after the buy receipts’ 90 s', () => {
    expect(isSaleClaimStale({ claimed_at: null }, NOW)).toBe(true);
    expect(isSaleClaimStale({ claimed_at: ago(BUY_RECEIPT_CLAIM_STALE_MS - 1_000) }, NOW)).toBe(false);
    expect(isSaleClaimStale({ claimed_at: ago(BUY_RECEIPT_CLAIM_STALE_MS + 1_000) }, NOW)).toBe(true);
  });

  it('the station takes the OLDEST waiting row, skipping printed, freshly claimed and already-printed-here rows', () => {
    const rows = [
      row({ id: 'new', requested_at: ago(1_000) }),
      row({ id: 'printed', requested_at: ago(90_000), printed_at: ago(80_000) }),
      row({ id: 'claimed', requested_at: ago(60_000), claimed_at: ago(5_000) }),
      row({ id: 'old', requested_at: ago(30_000) }),
    ];
    expect(nextSalePrint(rows, NOW)?.id).toBe('old');
    expect(nextSalePrint(rows, NOW, new Set(['old']))?.id).toBe('new');
    expect(nextSalePrint([row({ printed_at: ago(1) })], NOW)).toBeNull();
  });

  it('the laptop: waiting → printed; stalled after 30 s unclaimed or after a minute', () => {
    expect(salePrintWatchPhase(null, 2_000)).toBe('waiting');
    expect(salePrintWatchPhase({ printed_at: null, claimed_at: null }, 10_000)).toBe('waiting');
    expect(salePrintWatchPhase({ printed_at: ago(1), claimed_at: ago(2) }, 4_000)).toBe('printed');
    expect(salePrintWatchPhase({ printed_at: null, claimed_at: null }, 31_000)).toBe('stalled');
    expect(salePrintWatchPhase({ printed_at: null, claimed_at: ago(1) }, 31_000)).toBe('waiting');
    expect(salePrintWatchPhase({ printed_at: null, claimed_at: ago(1) }, 61_000)).toBe('stalled');
  });

  it('labels and the stored paper', () => {
    expect(salePrintLabel({ printed_at: null, claimed_at: null })).toBe('Waiting for the desktop');
    expect(salePrintLabel({ printed_at: null, claimed_at: ago(1) })).toBe('Printing');
    expect(salePrintLabel({ printed_at: ago(1), claimed_at: ago(2) })).toBe('Printed');
    expect(isPaperReceipt(paper)).toBe(true);
    expect(isPaperReceipt({ title: 'x', css: '' })).toBe(false);
    expect(isPaperReceipt(null)).toBe(false);
  });

  it('the inserted row carries the order and the paper, nothing else', () => {
    expect(salePrintInsert({ orderId: 'o1', orderNumber: 'NEJ-1', customerName: 'Jane', total: 10, paper, requestedBy: 'a@b.c' })).toEqual({
      order_id: 'o1', order_number: 'NEJ-1', customer_name: 'Jane', total: 10, paper, requested_by: 'a@b.c',
    });
  });

  it('knows the "SQL not run yet" error', () => {
    expect(isMissingSalePrintTable({ code: '42P01' })).toBe(true);
    expect(isMissingSalePrintTable({ code: 'PGRST205', message: "Could not find the table 'public.sale_print_requests'" })).toBe(true);
    expect(isMissingSalePrintTable({ code: '23505', message: 'duplicate key' })).toBe(false);
    expect(isMissingSalePrintTable(null)).toBe(false);
  });
});

describe('wiring (source guards)', () => {
  const sql = read('..', 'supabase', 'sale-print-requests-2026-10.sql');
  const station = read('src', 'components', 'admin', 'buy-receipts', 'PrintStation.tsx');
  const form = read('src', 'components', 'admin', 'InStoreSaleForm.tsx');
  const sender = read('src', 'components', 'admin', 'instant-sale', 'SaleStationPrint.tsx');
  const saleRoute = read('src', 'app', 'api', 'admin', 'in-store-sales', 'route.ts');
  const requestRoute = read('src', 'app', 'api', 'admin', 'in-store-sales', '[id]', 'print-request', 'route.ts');

  it('the SQL makes the table admin-only, with every column the code selects', () => {
    expect(sql).toContain(`create table if not exists public.${SALE_PRINT_TABLE}`);
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('public.is_admin_user(auth.uid())');
    expect(sql).toContain(`revoke all on public.${SALE_PRINT_TABLE} from anon`);
    expect(sql).toContain('on delete cascade');
    for (const column of SALE_PRINT_COLUMNS.split(',').map((c) => c.trim())) expect(sql).toMatch(new RegExp(`\\n  ${column}\\s`));
  });

  it('the station reads the queue straight from Supabase, claims before printing, prints the paper in a frame', () => {
    expect(station).toContain('.from(SALE_PRINT_TABLE)');
    expect(station).toContain(".update({ claimed_at: new Date().toISOString(), claimed_by: stationId() })");
    expect(station).toContain(".is('printed_at', null)");
    expect(station).toContain('printPaperInFrame(paperReceiptDocument(row.paper))');
    // A missing table (SQL not run) must not stop buy receipts printing.
    expect(station).toContain('!isMissingSalePrintTable(salesError)');
    expect(station).not.toMatch(/fetch\(['`]\/api\/admin\/in-store-sales/);
  });

  it('the form keeps Record sale and Record & print receipt, and adds the desktop printer', () => {
    expect(form).toContain('Record & print receipt');
    expect(form).toContain('Record & send to desktop printer');
    expect(form).toContain("sendToStation: action === 'station'");
    expect(form).toContain('<SaleStationPrint orderId={recorded.orderId}');
    expect(sender).toContain('Send to desktop printer');
    expect(sender).toContain('SALE_PRINT_MESSAGES.printed');
    expect(SALE_PRINT_MESSAGES.stalled).toContain('Print Station window');
  });

  it('both routes are admin-only and queue through the one helper', () => {
    expect(saleRoute).toContain('queueSalePrint(admin.supabase, service,');
    expect(requestRoute).toContain('await requireAdmin()');
    expect(requestRoute).toContain('queueSalePrint(admin.supabase,');
  });
});
