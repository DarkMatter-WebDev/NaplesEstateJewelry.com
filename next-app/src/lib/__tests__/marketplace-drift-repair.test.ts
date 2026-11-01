import { describe, expect, it } from 'vitest';
import {
  classifyDriftRepair,
  countDriftRepairs,
  driftRepairOutcomeLevel,
  formatDriftRepairSummary,
} from '@/lib/marketplace-drift-repair';

describe('classifyDriftRepair', () => {
  it('counts a repair only when the drift is gone after a successful write', () => {
    expect(classifyDriftRepair({ driftBefore: 'delist', directError: false, driftAfter: null })).toBe('repaired');
  });

  it('counts a marketplace refusal as reconciled when the read-only check cleared the drift', () => {
    // Etsy #19 / eBay #75 (2026-09-07): the marketplace had already closed
    // the listing, refused our delist, and the status check mapped its real
    // state (edit / Completed) into the local row.
    expect(classifyDriftRepair({ driftBefore: 'delist', directError: true, driftAfter: null })).toBe('reconciled');
  });

  it('never reports a repair while the drift is still there', () => {
    expect(classifyDriftRepair({ driftBefore: 'delist', directError: true, driftAfter: 'delist' })).toBe('failed');
    // A write that "succeeded" but changed nothing is a failure too — the
    // sweep trusts state, not return values.
    expect(classifyDriftRepair({ driftBefore: 'restore', directError: false, driftAfter: 'restore' })).toBe('failed');
  });

  it('is a no-op when there was nothing to repair', () => {
    expect(classifyDriftRepair({ driftBefore: null, directError: false, driftAfter: null })).toBe('noop');
  });
});

describe('countDriftRepairs + formatDriftRepairSummary', () => {
  it('tallies each outcome and prints them all in the summary line', () => {
    const counts = countDriftRepairs(['repaired', 'reconciled', 'failed', 'failed', 'noop']);
    expect(counts).toEqual({ repaired: 1, reconciled: 1, failed: 2, noop: 1 });
    const line = formatDriftRepairSummary('Etsy', { scanned: 128, drifted: 5, ...counts, remaining: 0 });
    expect(line).toBe('Etsy status reconcile: 128 scanned, 5 drifted, 1 repaired, 1 reconciled, 2 failed, 0 deferred.');
  });

  it('flags a run as a warning when anything failed or was deferred', () => {
    expect(driftRepairOutcomeLevel({ failed: 0, remaining: 0 })).toBe('ok');
    expect(driftRepairOutcomeLevel({ failed: 1, remaining: 0 })).toBe('warning');
    expect(driftRepairOutcomeLevel({ failed: 0, remaining: 2 })).toBe('warning');
  });
});
