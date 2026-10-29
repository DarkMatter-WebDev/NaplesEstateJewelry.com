import { describe, expect, it } from 'vitest';
import type { StoreHoursSchedule } from '@/lib/business-location';
import {
  APPOINTMENT_ANY_TIME,
  addDays,
  appointmentIssue,
  appointmentLastDate,
  appointmentMonth,
  appointmentMonthRange,
  appointmentSlots,
  formatAppointment,
  formatAppointmentDay,
  monthTitle,
  shiftMonth,
  parseAppointmentRequest,
  showroomTodayIso,
  weekdayOf,
} from '@/lib/appointment-request';

const open = { open: true, opens: '11:00', closes: '15:00' };
const shut = { open: false, opens: '11:00', closes: '15:00' };
// Tue–Sat 11–3, the showroom's hours.
const SCHEDULE: StoreHoursSchedule = {
  Monday: shut, Tuesday: open, Wednesday: open, Thursday: open,
  Friday: open, Saturday: open, Sunday: shut,
};

function form(fields: Record<string, string>) {
  return (name: string) => fields[name] ?? null;
}

describe('day math', () => {
  it('adds days across a month end and knows the weekday', () => {
    expect(addDays('2026-10-29', 3)).toBe('2026-11-01');
    expect(weekdayOf('2026-10-29')).toBe('Thursday');
    expect(weekdayOf('2026-11-01')).toBe('Sunday');
  });

  it('takes today from Naples, not UTC', () => {
    // 02:00 UTC on Oct 30 is still 10 pm on Oct 29 in Naples (EDT).
    expect(showroomTodayIso(new Date('2026-10-30T02:00:00Z'))).toBe('2026-10-29');
  });
});

describe('appointmentSlots', () => {
  it('runs 10 AM–5 PM every 30 minutes on an open day, whatever the walk-in hours', () => {
    expect(appointmentSlots(open)).toEqual([
      '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00',
      '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
    ]);
  });

  it('has none on a closed day', () => {
    expect(appointmentSlots(shut)).toEqual([]);
  });
});

describe('appointment months', () => {
  const oct = appointmentMonth('2026-10-29', SCHEDULE, { year: 2026, month: 9 });
  const days = oct.filter((d) => d !== null);

  it('lays a month out in Sunday-first weeks, padded before the 1st and after the last day', () => {
    expect(oct.length % 7).toBe(0);
    expect(oct.slice(0, 4)).toEqual([null, null, null, null]); // Oct 1 2026 is a Thursday
    expect(oct[4]!.iso).toBe('2026-10-01');
    expect(days.at(-1)!.iso).toBe('2026-10-31');
  });

  it('never lets today be picked; tomorrow is the first choice', () => {
    const today = days.find((d) => d.isToday)!;
    expect(today.iso).toBe('2026-10-29');
    expect(today.selectable).toBe(false);
    expect(days.find((d) => d.selectable)!.iso).toBe('2026-10-30');
  });

  it('greys out closed weekdays, months ahead too', () => {
    const jan = appointmentMonth('2026-10-29', SCHEDULE, { year: 2027, month: 0 });
    expect(jan.find((d) => d?.iso === '2027-01-04')!).toMatchObject({ closed: true, selectable: false }); // Monday
    expect(jan.find((d) => d?.iso === '2027-01-08')!.selectable).toBe(true); // Friday
  });

  it('pages from the month holding tomorrow through 12 months ahead', () => {
    expect(appointmentMonthRange('2026-10-29')).toEqual({ first: { year: 2026, month: 9 }, last: { year: 2027, month: 9 } });
    // On a month's last day the calendar opens on the next month.
    expect(appointmentMonthRange('2026-10-31').first).toEqual({ year: 2026, month: 10 });
    expect(appointmentLastDate('2026-10-29')).toBe('2027-10-31');
    const lastPage = appointmentMonth('2026-10-29', SCHEDULE, { year: 2027, month: 9 });
    expect(lastPage.find((d) => d?.iso === '2027-10-29')!.selectable).toBe(true);
  });

  it('steps months across a year end and titles them', () => {
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth({ year: 2027, month: 0 }, -1)).toEqual({ year: 2026, month: 11 });
    expect(monthTitle({ year: 2026, month: 10 }, false)).toBe('November 2026');
    expect(monthTitle({ year: 2026, month: 10 }, true)).toBe('Noviembre 2026');
  });
});

describe('parseAppointmentRequest', () => {
  it('is null when the box is not ticked', () => {
    expect(parseAppointmentRequest(form({ appointment_date: '2026-11-06' }))).toBeNull();
  });

  it('reads a ticked request', () => {
    expect(parseAppointmentRequest(form({ appointment: 'yes', appointment_date: '2026-11-06', appointment_time: '13:00' })))
      .toEqual({ date: '2026-11-06', time: '13:00' });
    expect(parseAppointmentRequest(form({ appointment: 'yes', appointment_date: '2026-11-06', appointment_time: 'any' })))
      .toEqual({ date: '2026-11-06', time: APPOINTMENT_ANY_TIME });
  });

  it('flags a ticked box with a missing or malformed day or time', () => {
    expect(parseAppointmentRequest(form({ appointment: 'yes' }))).toBe('invalid');
    expect(parseAppointmentRequest(form({ appointment: 'yes', appointment_date: '2026-02-31', appointment_time: '13:00' }))).toBe('invalid');
    expect(parseAppointmentRequest(form({ appointment: 'yes', appointment_date: '2026-11-06', appointment_time: '1pm' }))).toBe('invalid');
  });
});

describe('appointmentIssue', () => {
  it('passes a request inside the hours', () => {
    expect(appointmentIssue({ date: '2026-11-06', time: '13:00' }, '2026-10-29', SCHEDULE)).toBeNull();
    expect(appointmentIssue({ date: '2026-11-06', time: 'any' }, '2026-10-29', SCHEDULE)).toBeNull();
  });

  it('notes, but does not refuse, a request that no longer fits', () => {
    expect(appointmentIssue({ date: '2026-11-02', time: '13:00' }, '2026-10-29', SCHEDULE)).toMatch(/closed/);
    expect(appointmentIssue({ date: '2026-11-06', time: '16:00' }, '2026-10-29', SCHEDULE)).toBeNull();
    expect(appointmentIssue({ date: '2026-11-06', time: '17:00' }, '2026-10-29', SCHEDULE)).toMatch(/outside/);
    expect(appointmentIssue({ date: '2026-11-06', time: '09:30' }, '2026-10-29', SCHEDULE)).toMatch(/outside/);
    expect(appointmentIssue({ date: '2026-10-29', time: '13:00' }, '2026-10-29', SCHEDULE)).toMatch(/passed/);
    expect(appointmentIssue({ date: '2027-01-08', time: '13:00' }, '2026-10-29', SCHEDULE)).toBeNull(); // 2+ months out is fine
    expect(appointmentIssue({ date: '2027-11-05', time: '13:00' }, '2026-10-29', SCHEDULE)).toMatch(/12 months/);
  });
});

describe('formatAppointment', () => {
  it('words a request for the subject, the email and Spanish', () => {
    const req = { date: '2026-11-06', time: '13:00' };
    expect(formatAppointment(req, false)).toBe('Fri, Nov 6 at 1:00 PM');
    expect(formatAppointment(req, false, 'long')).toBe('Friday, November 6, 2026 at 1:00 PM');
    expect(formatAppointment(req, true)).toBe('viernes 6 de noviembre, 1:00 p.m.');
    expect(formatAppointment({ date: '2026-11-06', time: 'any' }, false)).toBe('Fri, Nov 6 — any time');
    expect(formatAppointmentDay('2026-11-06', false)).toBe('Friday, November 6, 2026');
    expect(formatAppointmentDay('2026-11-06', true)).toBe('viernes 6 de noviembre de 2026');
  });
});
