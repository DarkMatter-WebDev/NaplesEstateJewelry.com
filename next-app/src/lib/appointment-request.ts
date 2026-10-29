import {
  SHOWROOM_TIME_ZONE,
  formatTime,
  type StoreDayHours,
  type StoreHoursSchedule,
  type WeekDay,
} from '@/lib/business-location';

/**
 * "I'd like to request an appointment" on the Message Us form (owner-approved
 * mockup, 2026-10-29).
 *
 * A REQUEST, not a booking: the customer picks a day and a time, the owner
 * calls or texts to confirm. There is no availability store — nothing here
 * reserves a slot, so two customers can ask for the same time and the phone
 * call sorts it out. That keeps a call in every appointment (owner's rule:
 * rank work by its effect on calls).
 *
 * Days come from the admin-editable showroom hours, so closing a day in admin
 * greys it out here; times are `APPOINTMENT_HOURS` (10 AM–5 PM). Pure + client-safe: the form computes
 * the calendar in the browser, the contact route re-checks the request.
 *
 * Dates are `YYYY-MM-DD` strings in the SHOWROOM's timezone, and all day math
 * runs on UTC midnights so no visitor or server timezone can shift a day.
 */

/**
 * How far ahead a customer may ask: tomorrow through the end of the 12th
 * month after this one (owner, 2026-10-29: "allow the customer to choose any
 * month in the future… some may be planning to come down to naples a month
 * or two out"). Was today + 21 days in the first build.
 */
export const APPOINTMENT_MONTHS_AHEAD = 12;
export const APPOINTMENT_SLOT_MINUTES = 30;
/** The "Any time that day" choice. */
export const APPOINTMENT_ANY_TIME = 'any';

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const SLOT_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Sunday-first, matching `Date#getUTCDay`. */
const DAY_BY_INDEX: readonly WeekDay[] = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DAYS_ES: Record<WeekDay, string> = {
  Sunday: 'domingo', Monday: 'lunes', Tuesday: 'martes', Wednesday: 'miércoles',
  Thursday: 'jueves', Friday: 'viernes', Saturday: 'sábado',
};

function isoToUtc(iso: string): number | null {
  const m = ISO_DATE_RE.exec(iso);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // Rejects 2026-02-31 and friends, which Date.UTC would roll over.
  return new Date(t).toISOString().slice(0, 10) === iso ? t : null;
}

function utcToIso(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const t = isoToUtc(iso);
  if (t === null) throw new Error(`Bad date: ${iso}`);
  return utcToIso(t + days * 86_400_000);
}

export function weekdayOf(iso: string): WeekDay {
  const t = isoToUtc(iso);
  if (t === null) throw new Error(`Bad date: ${iso}`);
  return DAY_BY_INDEX[new Date(t).getUTCDay()];
}

/** Today's date in Naples. `en-CA` formats as `YYYY-MM-DD`. */
export function showroomTodayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SHOWROOM_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function minutes(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
}

function hhmm(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Appointment hours — wider than the showroom's walk-in hours (owner,
 * 2026-10-29: "include hours from 10am - 5pm"). The DAYS still follow the
 * admin showroom schedule; only the times on an open day come from here.
 */
export const APPOINTMENT_HOURS = { opens: '10:00', closes: '17:00' } as const;

/**
 * Start times on an open day, every 30 minutes, the last one a full slot
 * before closing (10:00–17:00 → 10:00 … 16:30). Closed day → none.
 */
export function appointmentSlots(day: StoreDayHours): string[] {
  if (!day.open) return [];
  const slots: string[] = [];
  const last = minutes(APPOINTMENT_HOURS.closes) - APPOINTMENT_SLOT_MINUTES;
  for (let t = minutes(APPOINTMENT_HOURS.opens); t <= last; t += APPOINTMENT_SLOT_MINUTES) slots.push(hhmm(t));
  return slots;
}

/** A calendar page. `month` is 0-based. */
export interface MonthKey {
  year: number;
  month: number;
}

export function monthOf(iso: string): MonthKey {
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) - 1 };
}

export function shiftMonth(key: MonthKey, by: number): MonthKey {
  const total = key.year * 12 + key.month + by;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

export function sameMonth(a: MonthKey, b: MonthKey): boolean {
  return a.year === b.year && a.month === b.month;
}

function monthStartIso(key: MonthKey): string {
  return `${key.year}-${String(key.month + 1).padStart(2, '0')}-01`;
}

/** The last day a customer may pick: the end of the 12th month after today's. */
export function appointmentLastDate(todayIso: string): string {
  return addDays(monthStartIso(shiftMonth(monthOf(todayIso), APPOINTMENT_MONTHS_AHEAD + 1)), -1);
}

/**
 * The pages the ‹ › arrows move between: the month holding tomorrow (so on
 * the last day of a month the calendar opens on the next one) through the
 * month of `appointmentLastDate`.
 */
export function appointmentMonthRange(todayIso: string): { first: MonthKey; last: MonthKey } {
  return { first: monthOf(addDays(todayIso, 1)), last: monthOf(appointmentLastDate(todayIso)) };
}

export interface AppointmentCalendarDay {
  iso: string;
  dayOfMonth: number;
  weekday: WeekDay;
  isToday: boolean;
  /** Showroom closed that weekday. */
  closed: boolean;
  /** Today or earlier, or past the window. */
  outside: boolean;
  /** The customer may pick it. */
  selectable: boolean;
}

/**
 * One month as Sunday-first weeks; `null` pads the cells before the 1st and
 * after the last day. Today itself is never selectable — the form tells
 * same-day visitors to call.
 */
export function appointmentMonth(
  todayIso: string,
  schedule: StoreHoursSchedule,
  key: MonthKey,
): (AppointmentCalendarDay | null)[] {
  const last = appointmentLastDate(todayIso);
  const start = monthStartIso(key);
  const end = addDays(monthStartIso(shiftMonth(key, 1)), -1);
  const cells: (AppointmentCalendarDay | null)[] = Array(DAY_BY_INDEX.indexOf(weekdayOf(start))).fill(null);
  for (let iso = start; iso <= end; iso = addDays(iso, 1)) {
    const weekday = weekdayOf(iso);
    const closed = !schedule[weekday].open || appointmentSlots(schedule[weekday]).length === 0;
    const outside = iso <= todayIso || iso > last;
    cells.push({
      iso,
      dayOfMonth: Number(iso.slice(8, 10)),
      weekday,
      isToday: iso === todayIso,
      closed,
      outside,
      selectable: !closed && !outside,
    });
  }
  while (cells.length % 7) cells.push(null);
  return cells;
}

/** "November 2026" / "Noviembre 2026". */
export function monthTitle(key: MonthKey, isEs: boolean): string {
  const name = (isEs ? MONTHS_ES : MONTHS_EN)[key.month];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${key.year}`;
}

/** Sunday-first column headings. */
export function weekdayHeadings(isEs: boolean): string[] {
  return isEs
    ? ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
}

export function slotLabel(slot: string, isEs: boolean): string {
  return formatTime(slot, isEs ? 'es' : 'en-full');
}

/** The picked day alone: "Friday, November 6, 2026" / "viernes 6 de noviembre de 2026". */
export function formatAppointmentDay(iso: string, isEs: boolean): string {
  const weekday = weekdayOf(iso);
  const day = Number(iso.slice(8, 10));
  const month = Number(iso.slice(5, 7)) - 1;
  const year = iso.slice(0, 4);
  return isEs
    ? `${DAYS_ES[weekday]} ${day} de ${MONTHS_ES[month]} de ${year}`
    : `${weekday}, ${MONTHS_EN[month]} ${day}, ${year}`;
}

/**
 * Human wording of a request.
 * - `short` (subject line, success panel): "Fri, Nov 6 at 1:00 PM"
 * - `long` (email body): "Friday, November 6, 2026 at 1:00 PM"
 * Spanish uses one shape: "viernes 6 de noviembre, 1:00 p.m."
 */
export function formatAppointment(
  request: AppointmentRequest,
  isEs: boolean,
  style: 'short' | 'long' = 'short',
): string {
  const weekday = weekdayOf(request.date);
  const day = Number(request.date.slice(8, 10));
  const month = Number(request.date.slice(5, 7)) - 1;
  if (isEs) {
    const time = request.time === APPOINTMENT_ANY_TIME ? 'a cualquier hora' : slotLabel(request.time, true);
    return `${DAYS_ES[weekday]} ${day} de ${MONTHS_ES[month]}, ${time}`;
  }
  const time = request.time === APPOINTMENT_ANY_TIME ? '— any time' : `at ${slotLabel(request.time, false)}`;
  if (style === 'long') {
    return `${weekday}, ${MONTHS_EN[month]} ${day}, ${request.date.slice(0, 4)} ${time}`;
  }
  return `${weekday.slice(0, 3)}, ${MONTHS_EN[month].slice(0, 3)} ${day} ${time}`;
}

export interface AppointmentRequest {
  date: string;
  /** `HH:MM` or `APPOINTMENT_ANY_TIME`. */
  time: string;
}

/**
 * Read the three form fields. `null` = no appointment asked for;
 * `'invalid'` = the box was ticked but the day/time is missing or malformed.
 */
export function parseAppointmentRequest(
  get: (name: string) => FormDataEntryValue | null,
): AppointmentRequest | null | 'invalid' {
  if (String(get('appointment') ?? '') !== 'yes') return null;
  const date = String(get('appointment_date') ?? '').trim();
  const time = String(get('appointment_time') ?? '').trim();
  if (isoToUtc(date) === null) return 'invalid';
  if (time !== APPOINTMENT_ANY_TIME && !SLOT_RE.test(time)) return 'invalid';
  return { date, time };
}

/**
 * Why a well-formed request no longer fits — the hours changed after the page
 * loaded, or the page sat open past midnight. The lead is never refused for
 * this: the owner sees the note and sorts it out on the call.
 */
export function appointmentIssue(
  request: AppointmentRequest,
  todayIso: string,
  schedule: StoreHoursSchedule,
): string | null {
  if (request.date <= todayIso) return 'that day has already started or passed';
  // +1 day of slack for a browser clock a little ahead of the server's.
  if (request.date > addDays(appointmentLastDate(todayIso), 1)) return 'more than 12 months out';
  const hours = schedule[weekdayOf(request.date)];
  if (!hours.open) return 'the showroom is closed that day';
  if (request.time !== APPOINTMENT_ANY_TIME && !appointmentSlots(hours).includes(request.time)) {
    return 'that time is outside appointment hours (10 AM–5 PM)';
  }
  return null;
}

export function appointmentInvalidMessage(isEs: boolean): string {
  return isEs
    ? 'Elija un día y una hora para su cita, o desmarque la casilla.'
    : 'Please pick a day and a time for your appointment, or untick the box.';
}
