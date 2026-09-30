import { describe, expect, it } from 'vitest';
import {
  describePricePushHealth,
  isPricePushFault,
  previousScheduledRun,
  resolvePricePushHealth,
} from '../marketplace-price-push-health';

// eBay's real schedule: '45 11 * * *'.
const HOUR = 11;
const MINUTE = 45;

const base = {
  enabled: true,
  cronSecretConfigured: true,
  scheduleUtcHour: HOUR,
  scheduleUtcMinute: MINUTE,
};

describe('previousScheduledRun', () => {
  it('returns today when the fire time has already passed', () => {
    const now = new Date('2026-08-10T18:00:00Z');
    expect(previousScheduledRun(HOUR, MINUTE, now).toISOString()).toBe('2026-08-10T11:45:00.000Z');
  });

  it('rolls back to yesterday when the fire time has not arrived yet', () => {
    const now = new Date('2026-08-10T04:00:00Z');
    expect(previousScheduledRun(HOUR, MINUTE, now).toISOString()).toBe('2026-08-09T11:45:00.000Z');
  });

  it('handles the month boundary', () => {
    const now = new Date('2026-09-01T02:00:00Z');
    expect(previousScheduledRun(HOUR, MINUTE, now).toISOString()).toBe('2026-08-31T11:45:00.000Z');
  });
});

describe('resolvePricePushHealth', () => {
  it('reports a missing cron secret ahead of everything else', () => {
    expect(resolvePricePushHealth({
      ...base,
      cronSecretConfigured: false,
      enabled: false,
      lastRunAt: null,
      now: new Date('2026-08-10T18:00:00Z'),
    })).toBe('not_configured');
  });

  it('reports the owner-disabled toggle as its own state, not a fault', () => {
    const health = resolvePricePushHealth({
      ...base,
      enabled: false,
      lastRunAt: null,
      now: new Date('2026-08-10T18:00:00Z'),
    });
    expect(health).toBe('disabled');
    expect(isPricePushFault(health)).toBe(false);
  });

  // The regression this module exists for: production had zero
  // scheduled_price_push rows and the card rendered a green check.
  it('treats a never-run schedule as a fault', () => {
    const health = resolvePricePushHealth({
      ...base,
      lastRunAt: null,
      now: new Date('2026-08-10T18:00:00Z'),
    });
    expect(health).toBe('never_run');
    expect(isPricePushFault(health)).toBe(true);
  });

  it('is ok when the most recent scheduled fire time produced a run', () => {
    expect(resolvePricePushHealth({
      ...base,
      lastRunAt: '2026-08-10T11:45:12Z',
      now: new Date('2026-08-10T18:00:00Z'),
    })).toBe('ok');
  });

  it('is overdue when the run predates the most recent fire time', () => {
    const health = resolvePricePushHealth({
      ...base,
      lastRunAt: '2026-08-09T11:45:12Z',
      now: new Date('2026-08-10T18:00:00Z'),
    });
    expect(health).toBe('overdue');
    expect(isPricePushFault(health)).toBe(true);
  });

  it('does not flag a late-but-running push during the grace window', () => {
    // 11:52 UTC: today's 11:45 fire time has passed but the grace has not
    // elapsed, so yesterday's successful run is still the comparison point.
    expect(resolvePricePushHealth({
      ...base,
      lastRunAt: '2026-08-09T11:45:12Z',
      now: new Date('2026-08-10T11:52:00Z'),
    })).toBe('ok');
  });

  it('flags the miss once the grace window closes', () => {
    expect(resolvePricePushHealth({
      ...base,
      lastRunAt: '2026-08-09T11:45:12Z',
      now: new Date('2026-08-10T13:00:00Z'),
    })).toBe('overdue');
  });

  it('treats an unparseable timestamp as never having run', () => {
    expect(resolvePricePushHealth({
      ...base,
      lastRunAt: 'not-a-date',
      now: new Date('2026-08-10T18:00:00Z'),
    })).toBe('never_run');
  });
});

describe('describePricePushHealth', () => {
  const copy = (over: Partial<Parameters<typeof describePricePushHealth>[0]> = {}) =>
    describePricePushHealth({
      health: 'ok',
      schedule: 'Daily at 11:45 UTC',
      cronSecretName: 'EBAY_CRON_SECRET',
      lastRunOutcome: 'ok',
      lastRunMessage: 'Scheduled eBay price push: 12 pushed.',
      lastRunAtLabel: '8/10/2026, 7:45:12 AM',
      ...over,
    });

  it('names the missing variable so the fix is actionable', () => {
    expect(copy({ health: 'not_configured' }).text).toContain('EBAY_CRON_SECRET');
  });

  it('never renders a green check for a never-run schedule', () => {
    const result = copy({ health: 'never_run', lastRunOutcome: null, lastRunMessage: null, lastRunAtLabel: null });
    expect(result.icon).toBe('error');
    expect(result.tone).toBe('error');
    expect(result.text).toContain('not firing');
    expect(result.text).toContain('Supabase → Integrations → Cron');
  });

  // pg_cron is the only scheduler (2026-09-13); the Netlify scheduled functions
  // are deleted, so a fault must never send the owner to a Netlify log.
  it('points an overdue schedule at the pg_cron run history, never Netlify', () => {
    const result = copy({ health: 'overdue' });
    expect(result.tone).toBe('error');
    expect(result.text).toContain('Supabase → Integrations → Cron');
    expect(result.text).not.toContain('Netlify');
    expect(copy({ health: 'never_run', lastRunOutcome: null, lastRunMessage: null, lastRunAtLabel: null }).text).not.toContain('Netlify');
    expect(result.text).toContain('8/10/2026, 7:45:12 AM');
  });

  it('carries a healthy run message through unchanged', () => {
    const result = copy();
    expect(result.icon).toBe('check_circle');
    expect(result.tone).toBe('ok');
    expect(result.text).toBe('Last run 8/10/2026, 7:45:12 AM: Scheduled eBay price push: 12 pushed.');
  });

  it('downgrades a healthy-window run that itself reported a warning', () => {
    expect(copy({ lastRunOutcome: 'warning' }).tone).toBe('warning');
    expect(copy({ lastRunOutcome: 'error' }).icon).toBe('error');
  });
});
