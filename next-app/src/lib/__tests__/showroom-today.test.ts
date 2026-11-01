import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STORE_HOURS,
  SHOWROOM_TIME_ZONE,
  hoursRows,
  showroomWeekdayName,
} from '@/lib/business-location';

// Guard for the "Today" marker added to the homepage Visit Us block
// (2026-08-23). `ShowroomHours` had deliberately shipped WITHOUT one, and the
// two reasons it gave are still the reasons this is shaped the way it is:
// these pages are statically prerendered, so a server-rendered "today" is the
// build date; and the answer has to be about NAPLES, not the reader.
//
// The second one is not theoretical. It was reproduced live while building
// this: at that moment UTC said Monday and Naples said Sunday, and the badge
// correctly marked Sunday. Any implementation reading `new Date().getDay()` on
// the server, or the visitor's own timezone, marks the wrong row for several
// hours out of every day.

describe('showroomWeekdayName — answers for Naples, not the reader', () => {
  it('reads the showroom timezone, not UTC', () => {
    // 02:00 UTC on Monday the 24th is still 22:00 SUNDAY in Naples.
    const lateSundayInNaples = new Date('2026-08-24T02:00:00Z');
    expect(showroomWeekdayName(lateSundayInNaples)).toBe('Sunday');
    expect(
      new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long' })
        .format(lateSundayInNaples),
    ).toBe('Monday');
  });

  it('is right on the other side of the same boundary', () => {
    // 04:00 UTC is midnight-plus in Naples: now both agree it is Monday.
    expect(showroomWeekdayName(new Date('2026-08-24T05:00:00Z'))).toBe('Monday');
  });

  it('handles both sides of daylight saving', () => {
    // EST (UTC-5) in January: 04:30 UTC is still Saturday evening.
    expect(showroomWeekdayName(new Date('2026-01-11T04:30:00Z'))).toBe('Saturday');
    // EDT (UTC-4) in July: 03:30 UTC is still Saturday evening.
    expect(showroomWeekdayName(new Date('2026-07-12T03:30:00Z'))).toBe('Saturday');
  });

  it('returns a name that can actually match a row key', () => {
    // The comparison is `showroomWeekdayName() === row.dayKey`, so this must
    // stay in the same vocabulary as HOURS.days / WEEK_ORDER.
    expect(hoursRows(DEFAULT_STORE_HOURS, false).map((row) => row.dayKey)).toContain(
      showroomWeekdayName(new Date('2026-08-24T02:00:00Z')),
    );
  });

  it('names the timezone once, and the badge reports the one it used', () => {
    expect(SHOWROOM_TIME_ZONE).toBe('America/New_York');
  });
});

describe('hours rows — day keys for the today comparison', () => {
  it('keys every day in canonical English', () => {
    expect(hoursRows(DEFAULT_STORE_HOURS, false).map((row) => row.dayKey)).toEqual([
      'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
    ]);
  });

  it('keeps the key English even when the label is Spanish', () => {
    // ⚠️ The whole reason `dayKey` exists separately from `day`. `Intl` returns
    // "Sunday"; a Spanish row labelled "Domingo" could never match it, so the
    // badge would silently never appear on the ES homepage.
    const spanish = hoursRows(DEFAULT_STORE_HOURS, true);
    expect(spanish.map((row) => row.day)).toContain('Domingo');
    expect(spanish.map((row) => row.dayKey)).toEqual(hoursRows(DEFAULT_STORE_HOURS, false).map((row) => row.dayKey));
  });
});
