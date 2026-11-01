import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDripBudget,
  formatSocialScheduleChoice,
  formatSocialScheduleInput,
  getDefaultSocialScheduledFor,
  parseSocialScheduleChoice,
  parseSocialScheduleInput,
  SOCIAL_QUEUE_POSTING_SLOTS,
  SOCIAL_DRIP_TIME_BUDGET_MS,
  SOCIAL_SCHEDULED_DRIP_BATCH_SIZE,
  validateSocialScheduledFor,
} from '@/lib/social-queue-schedule';

describe('social queue schedule', () => {
  it('offers only the seven approved posting slots', () => {
    expect(SOCIAL_QUEUE_POSTING_SLOTS).toEqual([
      { value: '12:00', label: '12:00 PM - noon' },
      { value: '14:00', label: '2:00 PM' },
      { value: '16:00', label: '4:00 PM' },
      { value: '18:00', label: '6:00 PM' },
      { value: '20:00', label: '8:00 PM' },
      { value: '22:00', label: '10:00 PM' },
      { value: '24:00', label: '12:00 AM - midnight' },
    ]);
  });

  it('uses a per-worker safety batch instead of a daily queue cap', () => {
    expect(SOCIAL_SCHEDULED_DRIP_BATCH_SIZE).toBe(25);
  });

  it('defaults to the next available posting slot', () => {
    expect(getDefaultSocialScheduledFor('instagram', new Date('2026-08-02T15:00:00.000Z')).toISOString())
      .toBe('2026-08-02T16:00:00.000Z'); // 11 AM -> noon EDT
    expect(getDefaultSocialScheduledFor('facebook', new Date('2026-08-02T16:05:00.000Z')).toISOString())
      .toBe('2026-08-02T18:00:00.000Z'); // 12:05 PM -> 2 PM EDT
    expect(getDefaultSocialScheduledFor('instagram', new Date('2026-08-02T21:00:00.000Z')).toISOString())
      .toBe('2026-08-02T22:00:00.000Z'); // 5 PM -> 6 PM EDT
    expect(getDefaultSocialScheduledFor('facebook', new Date('2026-08-03T02:05:00.000Z')).toISOString())
      .toBe('2026-08-03T04:00:00.000Z'); // 10:05 PM -> midnight EDT
    expect(getDefaultSocialScheduledFor('facebook', new Date('2026-08-03T03:58:00.000Z')).toISOString())
      .toBe('2026-08-03T16:00:00.000Z'); // midnight is too close -> next noon
  });

  it('round-trips Eastern wall time across daylight-saving changes', () => {
    const summer = parseSocialScheduleInput('2026-08-02T18:00');
    const winter = parseSocialScheduleInput('2026-12-02T18:00');
    expect(summer?.toISOString()).toBe('2026-08-02T22:00:00.000Z');
    expect(winter?.toISOString()).toBe('2026-12-02T23:00:00.000Z');
    expect(formatSocialScheduleInput(summer!)).toBe('2026-08-02T18:00');
  });

  it('treats midnight as the end of the selected date', () => {
    const midnight = parseSocialScheduleChoice('2026-08-02', '24:00');
    expect(midnight?.toISOString()).toBe('2026-08-03T04:00:00.000Z');
    expect(formatSocialScheduleChoice(midnight!)).toEqual({ date: '2026-08-02', slot: '24:00' });
  });

  it('accepts the new daytime slots and rejects any other valid instant', () => {
    const now = new Date('2026-08-02T14:00:00.000Z');
    expect(validateSocialScheduledFor('2026-08-02T16:00:00.000Z', now).error).toBeNull();
    expect(validateSocialScheduledFor('2026-08-02T18:00:00.000Z', now).error).toBeNull();
    expect(validateSocialScheduledFor('2026-08-02T20:00:00.000Z', now).error).toBeNull();
    expect(validateSocialScheduledFor('2026-08-02T23:00:00.000Z', now).error)
      .toMatch(/noon, 2 PM, 4 PM, 6 PM, 8 PM, 10 PM, or midnight/i);
    expect(validateSocialScheduledFor('2026-08-03T00:00:00.000Z', now).error).toBeNull();
  });

  it('rejects past, invalid, and excessively distant schedules', () => {
    const now = new Date('2026-08-02T14:00:00.000Z');
    expect(validateSocialScheduledFor('not-a-date', now).error).toMatch(/invalid/i);
    expect(validateSocialScheduledFor('2026-08-02T13:59:00.000Z', now).error).toMatch(/future/i);
    expect(validateSocialScheduledFor('2028-08-02T22:00:00.000Z', now).error).toMatch(/12 months/i);
  });
});

// The drip budget exists because the BATCH SIZE never bounded runtime, and
// runtime is what kills these workers: Netlify cuts a synchronous function at
// 26 seconds. On 2026-08-19 the Facebook drip ran 25s and the job went red with
// `curl (56)`. These assertions pin the part that stops that recurring.
describe('drip time budget', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const at = (ms: number) => vi.setSystemTime(new Date(ms));

  it('stays under the Netlify 26s synchronous ceiling, with headroom', () => {
    // Not a style preference: 26_000 is the platform limit, and the run still
    // has to insert a closing sync log and serialise a response after the loop.
    expect(SOCIAL_DRIP_TIME_BUDGET_MS).toBeLessThan(26_000);
    expect(26_000 - SOCIAL_DRIP_TIME_BUDGET_MS).toBeGreaterThanOrEqual(5_000);
  });

  it('always attempts the first row, however tight the budget', () => {
    vi.useFakeTimers();
    at(0);
    const budget = createDripBudget(1);
    at(10_000);
    // A stalled queue is worse than a slow one: if one slow publish could stop
    // the loop before it started, nothing would ever post again.
    expect(budget.exhausted(0)).toBe(false);
  });

  it('refuses to START a row that cannot finish, rather than waiting to overrun', () => {
    vi.useFakeTimers();
    at(0);
    const budget = createDripBudget(20_000);

    at(8_000);
    budget.record(8_000); // one slow publish, measured
    expect(budget.exhausted(1)).toBe(false); // 8s + 8s = 16s, fits

    at(13_000);
    // 13s elapsed + an 8s row = 21s, past the 20s budget. A naive
    // `elapsed > budget` test would say "keep going" here and land at 21s.
    expect(budget.exhausted(1)).toBe(true);
  });

  it('measures the SLOWEST row, not the most recent one', () => {
    vi.useFakeTimers();
    at(0);
    const budget = createDripBudget(20_000);
    budget.record(9_000);
    budget.record(500); // a fast row must not make the loop optimistic again
    at(12_000);
    expect(budget.exhausted(2)).toBe(true);
  });

  it('reports elapsed time for the deferral message', () => {
    vi.useFakeTimers();
    at(0);
    const budget = createDripBudget();
    at(4_200);
    expect(budget.elapsedMs()).toBe(4_200);
  });
});
