import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STORE_HOURS,
  HOURS,
  WEEK_ORDER,
  hoursLine,
  hoursRows,
  hoursSegmentsFull,
  hoursSummary,
  openingHoursSchema,
  type StoreHoursSchedule,
} from '@/lib/business-location';
import { parseStoreHours, TIME_RE } from '@/lib/store-hours';

// The hours formatters became schedule-driven when hours went admin-editable
// (2026-08). The load-bearing assertions here are the BYTE-IDENTITY ones: for
// the default schedule, every formatter must produce exactly the strings the
// site shipped when they were hand-written literals — that is what proves the
// no-DB fallback changes nothing.

/** Build a schedule from open-day specs; all other days closed (11:00–15:00). */
function schedule(open: Partial<Record<(typeof WEEK_ORDER)[number], [string, string]>>): StoreHoursSchedule {
  return Object.fromEntries(
    WEEK_ORDER.map((day) => {
      const times = open[day];
      return [day, { open: Boolean(times), opens: times?.[0] ?? '11:00', closes: times?.[1] ?? '15:00' }];
    }),
  ) as StoreHoursSchedule;
}

const ALL_CLOSED = schedule({});
const SPLIT_WEEK = schedule({
  Tuesday: ['10:00', '14:00'],
  Wednesday: ['10:00', '14:00'],
  Thursday: ['10:00', '14:00'],
  Friday: ['11:00', '15:00'],
  Saturday: ['11:00', '15:00'],
});

describe('DEFAULT_STORE_HOURS — derived from the NAP-canonical constant', () => {
  it('opens exactly the HOURS.days set with the HOURS times', () => {
    for (const day of WEEK_ORDER) {
      const expected = (HOURS.days as readonly string[]).includes(day);
      expect(DEFAULT_STORE_HOURS[day].open).toBe(expected);
      expect(DEFAULT_STORE_HOURS[day].opens).toBe(HOURS.opens);
      expect(DEFAULT_STORE_HOURS[day].closes).toBe(HOURS.closes);
    }
  });
});

describe('hoursLine — matches the current built-in default (Mon–Sat)', () => {
  it('EN', () => {
    expect(hoursLine(DEFAULT_STORE_HOURS, false)).toBe('Mon–Sat 11am–3pm, or by appointment');
  });

  it('ES (comma between days and times, lowercase a.m. with periods)', () => {
    expect(hoursLine(DEFAULT_STORE_HOURS, true)).toBe(
      'Lunes a sábado, 11:00 a.m. – 3:00 p.m., o con cita',
    );
  });

  it('joins split-time segments with a semicolon', () => {
    expect(hoursLine(SPLIT_WEEK, false)).toBe('Tue–Thu 10am–2pm; Fri–Sat 11am–3pm, or by appointment');
    expect(hoursLine(SPLIT_WEEK, true)).toBe(
      'Martes a jueves, 10:00 a.m. – 2:00 p.m.; Viernes a sábado, 11:00 a.m. – 3:00 p.m., o con cita',
    );
  });

  it('renders a single open day without a range dash', () => {
    expect(hoursLine(schedule({ Saturday: ['09:00', '13:00'] }), false)).toBe(
      'Sat 9am–1pm, or by appointment',
    );
  });

  it('keeps non-zero minutes, compact style', () => {
    expect(hoursLine(schedule({ Tuesday: ['11:30', '15:45'] }), false)).toBe(
      'Tue 11:30am–3:45pm, or by appointment',
    );
  });

  it('does NOT merge across the Sunday→Monday boundary', () => {
    const sunMon = schedule({ Sunday: ['11:00', '15:00'], Monday: ['11:00', '15:00'] });
    // Monday-first WEEK_ORDER: Monday's segment prints first, Sunday's last.
    expect(hoursLine(sunMon, false)).toBe('Mon 11am–3pm; Sun 11am–3pm, or by appointment');
  });

  it('splits non-contiguous same-time days into separate segments', () => {
    const tueThu = schedule({ Tuesday: ['11:00', '15:00'], Thursday: ['11:00', '15:00'] });
    expect(hoursLine(tueThu, false)).toBe('Tue 11am–3pm; Thu 11am–3pm, or by appointment');
  });

  it('reads by-appointment-only when every day is closed', () => {
    expect(hoursLine(ALL_CLOSED, false)).toBe('By appointment only');
    expect(hoursLine(ALL_CLOSED, true)).toBe('Solo con cita');
  });
});

describe('hoursSummary — the invoice two-line block', () => {
  it('matches the hoursDaysLabel/hoursTimesLabel bytes on the default', () => {
    expect(hoursSummary(DEFAULT_STORE_HOURS, false)).toEqual({
      days: 'Monday – Saturday',
      times: '11:00 AM – 3:00 PM',
    });
    expect(hoursSummary(DEFAULT_STORE_HOURS, true)).toEqual({
      days: 'Lunes a sábado',
      times: '11:00 a.m. – 3:00 p.m.',
    });
  });

  it('is null for a split week and for all-closed', () => {
    expect(hoursSummary(SPLIT_WEEK, false)).toBeNull();
    expect(hoursSummary(ALL_CLOSED, false)).toBeNull();
  });

  it('full-form segments back the split-week fallback', () => {
    expect(hoursSegmentsFull(SPLIT_WEEK, false)).toEqual([
      'Tuesday – Thursday 10:00 AM – 2:00 PM',
      'Friday – Saturday 11:00 AM – 3:00 PM',
    ]);
    expect(hoursSegmentsFull(ALL_CLOSED, false)).toEqual([]);
  });
});

describe('hoursRows — per-day times', () => {
  it('matches the built-in default rows byte-for-byte', () => {
    const rows = hoursRows(DEFAULT_STORE_HOURS, false);
    expect(rows.map((r) => [r.day, r.time, r.closed])).toEqual([
      ['Monday', '11:00 AM – 3:00 PM', false],
      ['Tuesday', '11:00 AM – 3:00 PM', false],
      ['Wednesday', '11:00 AM – 3:00 PM', false],
      ['Thursday', '11:00 AM – 3:00 PM', false],
      ['Friday', '11:00 AM – 3:00 PM', false],
      ['Saturday', '11:00 AM – 3:00 PM', false],
      ['Sunday', 'Closed', true],
    ]);
  });

  it('gives each day its OWN times on a split week, in ES conventions too', () => {
    const rows = hoursRows(SPLIT_WEEK, true);
    expect(rows[1]).toEqual({ day: 'Martes', time: '10:00 a.m. – 2:00 p.m.', closed: false, dayKey: 'Tuesday' });
    expect(rows[5]).toEqual({ day: 'Sábado', time: '11:00 a.m. – 3:00 p.m.', closed: false, dayKey: 'Saturday' });
    expect(rows[0].time).toBe('Cerrado');
  });
});

describe('openingHoursSchema — grouped by identical times, English days', () => {
  it('emits a single grouped spec on the default', () => {
    expect(openingHoursSchema(DEFAULT_STORE_HOURS)).toEqual([
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        opens: '11:00',
        closes: '15:00',
      },
    ]);
  });

  it('groups NON-contiguous days sharing times into one spec', () => {
    const tueThu = schedule({ Tuesday: ['11:00', '15:00'], Thursday: ['11:00', '15:00'] });
    expect(openingHoursSchema(tueThu)).toEqual([
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Tuesday', 'Thursday'], opens: '11:00', closes: '15:00' },
    ]);
  });

  it('emits one spec per distinct time pair on a split week', () => {
    expect(openingHoursSchema(SPLIT_WEEK)).toEqual([
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Tuesday', 'Wednesday', 'Thursday'], opens: '10:00', closes: '14:00' },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Friday', 'Saturday'], opens: '11:00', closes: '15:00' },
    ]);
  });

  it('is empty when every day is closed (caller omits the property)', () => {
    expect(openingHoursSchema(ALL_CLOSED)).toEqual([]);
  });
});

describe('parseStoreHours — untrusted jsonb/PUT validation', () => {
  it('round-trips a valid schedule', () => {
    expect(parseStoreHours(structuredClone(DEFAULT_STORE_HOURS))).toEqual(DEFAULT_STORE_HOURS);
    expect(parseStoreHours(structuredClone(SPLIT_WEEK))).toEqual(SPLIT_WEEK);
  });

  it('rejects non-objects and null', () => {
    expect(parseStoreHours(null)).toBeNull();
    expect(parseStoreHours('Tue-Sat')).toBeNull();
    expect(parseStoreHours([])).toBeNull();
  });

  it('rejects a missing day and an extra key', () => {
    const missing = structuredClone(DEFAULT_STORE_HOURS) as Record<string, unknown>;
    delete missing.Wednesday;
    expect(parseStoreHours(missing)).toBeNull();

    const extra = { ...structuredClone(DEFAULT_STORE_HOURS), Funday: { open: true, opens: '11:00', closes: '15:00' } };
    expect(parseStoreHours(extra)).toBeNull();
  });

  it('rejects malformed times', () => {
    const bad = structuredClone(DEFAULT_STORE_HOURS);
    bad.Tuesday.opens = '11am';
    expect(parseStoreHours(bad)).toBeNull();
    expect(TIME_RE.test('24:00')).toBe(false);
    expect(TIME_RE.test('9:00')).toBe(false);
    expect(TIME_RE.test('09:00')).toBe(true);
  });

  it('rejects closes <= opens on an OPEN day, but tolerates it on a closed one', () => {
    const inverted = structuredClone(DEFAULT_STORE_HOURS);
    inverted.Tuesday.closes = '11:00';
    expect(parseStoreHours(inverted)).toBeNull();

    // A CLOSED day's times are dormant state, not an assertion — reopening the
    // day in the admin panel is when they get validated again.
    const closedInverted = structuredClone(DEFAULT_STORE_HOURS);
    closedInverted.Sunday.opens = '15:00';
    closedInverted.Sunday.closes = '11:00';
    expect(parseStoreHours(closedInverted)).toEqual(closedInverted);
  });
});
