import { describe, expect, it } from 'vitest';
import {
  describeStatusChecks,
  formatElapsed,
  formatStatusCheckTime,
  pairedSalesRow,
  resolveStatusCheckHealth,
  summarizeStatusCheck,
  type StatusCheckRow,
} from '../marketplace-status-checks';

const NOW = new Date('2026-09-14T02:12:00Z');

// Shapes copied from what reconcileEtsyStatusDrift / sweepEtsySales write.
const cleanCheck: StatusCheckRow = {
  createdAt: '2026-09-14T02:00:05Z',
  outcome: 'ok',
  message: 'Etsy status reconcile: 134 scanned, 0 drifted, 0 repaired, 0 reconciled, 0 failed, 0 deferred.',
  detail: { scanned: 134, drifted: 0, repaired: 0, reconciled: 0, failed: 0, remaining: 0, skipped: false },
};
const salesRow: StatusCheckRow = {
  createdAt: '2026-09-14T02:00:02Z',
  outcome: 'ok',
  message: 'Etsy sales: 0 orders read, 0 marked sold, 0 quantity reduced, 0 already handled, 0 not ours, 0 failed',
  detail: { ordersRead: 0, sold: 0, decremented: 0, alreadyHandled: 0, unmatched: 0, failed: 0, state: 'ran' },
};

describe('resolveStatusCheckHealth', () => {
  it('treats a missing row as never run', () => {
    expect(resolveStatusCheckHealth(null, NOW)).toBe('never_run');
    expect(resolveStatusCheckHealth('not a date', NOW)).toBe('never_run');
  });

  it('stays ok through one late run and turns stalled after 60 minutes', () => {
    expect(resolveStatusCheckHealth('2026-09-14T01:13:00Z', NOW)).toBe('ok'); // 59 min
    expect(resolveStatusCheckHealth('2026-09-14T01:12:00Z', NOW)).toBe('ok'); // exactly 60
    expect(resolveStatusCheckHealth('2026-09-14T01:11:00Z', NOW)).toBe('stalled'); // 61
  });
});

describe('formatElapsed', () => {
  it('reads like the mockup', () => {
    expect(formatElapsed(20_000)).toBe('less than a minute');
    expect(formatElapsed(12 * 60_000)).toBe('12 min');
    expect(formatElapsed(134 * 60_000)).toBe('2 h 14 min');
    expect(formatElapsed(120 * 60_000)).toBe('2 h');
    expect(formatElapsed(3 * 24 * 60 * 60_000)).toBe('3 days');
  });
});

describe('formatStatusCheckTime', () => {
  it("uses the owner's Eastern time, adding the date once it is not recent", () => {
    expect(formatStatusCheckTime('2026-09-14T02:00:05Z', NOW)).toBe('10:00 PM ET');
    expect(formatStatusCheckTime('2026-09-12T14:30:00Z', NOW)).toBe('9/12, 10:30 AM ET');
  });
});

describe('summarizeStatusCheck', () => {
  it('summarizes a clean run with its sales row', () => {
    expect(summarizeStatusCheck(cleanCheck, salesRow)).toBe('134 listings checked, 0 sales, nothing to fix');
  });

  it('counts sold and quantity-reduced lines as sales', () => {
    const sales = { ...salesRow, detail: { ...(salesRow.detail as object), sold: 1, decremented: 1 } };
    expect(summarizeStatusCheck(cleanCheck, sales)).toBe('134 listings checked, 2 sales, nothing to fix');
  });

  it('ignores a sales row from a different run', () => {
    const old = { ...salesRow, createdAt: '2026-09-13T20:00:00Z' };
    expect(pairedSalesRow(cleanCheck, old)).toBeNull();
    expect(summarizeStatusCheck(cleanCheck, old)).toBe('134 listings checked, nothing to fix');
  });

  it('reports repairs, failures and leftovers', () => {
    const check = { ...cleanCheck, outcome: 'warning' as const, detail: { scanned: 134, drifted: 4, repaired: 1, reconciled: 1, failed: 1, remaining: 1 } };
    expect(summarizeStatusCheck(check, null)).toBe('134 listings checked, 2 fixed, 1 still out of sync, 1 left for the next check');
  });

  it("falls back to the row's own message when it has no counts", () => {
    const skipped: StatusCheckRow = { createdAt: cleanCheck.createdAt, outcome: 'warning', message: 'Status reconcile skipped because auto-delist on sold is disabled.', detail: null };
    expect(summarizeStatusCheck(skipped, null)).toBe('Status reconcile skipped because auto-delist on sold is disabled');
  });
});

describe('describeStatusChecks', () => {
  const describe_ = (over: Partial<Parameters<typeof describeStatusChecks>[0]> = {}) =>
    describeStatusChecks({ lastCheck: cleanCheck, lastSales: salesRow, lastCheckAtLabel: '10:00 PM ET', now: NOW, ...over });

  it('renders the normal card', () => {
    expect(describe_()).toEqual({
      icon: 'check_circle',
      tone: 'ok',
      text: 'Last check 11 min ago (10:00 PM ET): 134 listings checked, 0 sales, nothing to fix.',
    });
  });

  it('renders the stalled card in red with the run-history pointer', () => {
    const copy = describe_({ lastCheck: { ...cleanCheck, createdAt: '2026-09-13T23:58:00Z' }, lastCheckAtLabel: '7:58 PM ET' });
    expect(copy.tone).toBe('error');
    expect(copy.text).toBe(
      "Last check 2 h 14 min ago (7:58 PM ET) — sold items may stay live on the other marketplace until it runs again. Check the job's run history in Supabase → Integrations → Cron.",
    );
  });

  it('renders a never-run card as a fault, not reassurance', () => {
    const copy = describe_({ lastCheck: null, lastSales: null, lastCheckAtLabel: null });
    expect(copy.tone).toBe('error');
    expect(copy.text).toContain('No 30-minute check has been recorded yet');
    expect(copy.text).not.toMatch(/netlify/i);
  });

  it('shows a failed run with its message', () => {
    const copy = describe_({ lastCheck: { ...cleanCheck, outcome: 'error', message: 'Etsy request timed out.', detail: null } });
    expect(copy).toEqual({ icon: 'error', tone: 'error', text: 'Last check 11 min ago (10:00 PM ET) failed: Etsy request timed out.' });
  });

  it('warns when the paired sales check failed', () => {
    const copy = describe_({ lastSales: { ...salesRow, outcome: 'error', detail: null, message: 'Etsy sales sweep failed: timeout' } });
    expect(copy.tone).toBe('warning');
    expect(copy.text).toBe('Last check 11 min ago (10:00 PM ET): 134 listings checked, the sales check failed, nothing to fix.');
  });
});
