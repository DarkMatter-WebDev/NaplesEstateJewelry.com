'use client';

import { useMemo, useState } from 'react';
import type { StoreHoursSchedule } from '@/lib/business-location';
import { CONTACT_PHONE_DISPLAY, TEL_HREF } from '@/lib/contact-links';
import {
  APPOINTMENT_ANY_TIME,
  appointmentMonth,
  appointmentMonthRange,
  appointmentSlots,
  formatAppointmentDay,
  monthTitle,
  sameMonth,
  shiftMonth,
  showroomTodayIso,
  slotLabel,
  weekdayHeadings,
  weekdayOf,
  type MonthKey,
} from '@/lib/appointment-request';

/**
 * "I'd like to request an appointment" — a tick box that opens a small
 * calendar inside the Message Us form (owner-approved mockup, 2026-10-29).
 * Rules and wording live in `lib/appointment-request.ts`.
 *
 * Posts `appointment=yes`, `appointment_date` (YYYY-MM-DD) and
 * `appointment_time` (HH:MM or "any") only while ticked; unticked, the form
 * posts exactly what it did before.
 *
 * The calendar is built from "today in Naples" the moment the box is ticked,
 * never during render on the server — a prerendered page would otherwise bake
 * in its build date.
 *
 * Colours are inline, like `InquiryPreferenceFields`: unlayered rules in
 * globals.css beat Tailwind utilities on form elements.
 */

const GOLD = '#735c00';
const LINE = '#e4dccb';

/** ‹ / › — a real button (`type="button"`, so it never submits the form). */
function MonthArrow({ dir, disabled, label, onClick }: {
  dir: 'prev' | 'next';
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid h-9 w-9 flex-none place-items-center rounded-[10px] text-lg leading-none focus-visible:outline-2 focus-visible:outline-[#735c00]/50"
      style={{
        border: `1px solid ${disabled ? '#ece7dc' : '#d0c5af'}`,
        background: 'white',
        color: disabled ? '#cfc8b8' : GOLD,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {dir === 'prev' ? '‹' : '›'}
    </button>
  );
}

export default function AppointmentRequestField({ locale, schedule, idPrefix, checked, onCheckedChange }: {
  locale: string;
  schedule: StoreHoursSchedule;
  idPrefix: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const isEs = locale === 'es';
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  // The month on show; null = the first pickable month. The picked day is
  // kept while the customer pages through other months.
  const [shown, setShown] = useState<MonthKey | null>(null);

  // Read when ticked, never during a server render (see the header comment).
  const today = useMemo(() => (checked ? showroomTodayIso() : ''), [checked]);
  const range = today ? appointmentMonthRange(today) : null;
  const view = shown ?? range?.first ?? null;
  const cells = today && view ? appointmentMonth(today, schedule, view) : [];
  const atFirst = !range || !view || sameMonth(view, range.first);
  const atLast = !range || !view || sameMonth(view, range.last);
  const slots = date ? appointmentSlots(schedule[weekdayOf(date)]) : [];

  function pickDate(next: string) {
    setDate(next);
    // A time the new day doesn't have would post a slot outside its hours.
    const nextSlots = appointmentSlots(schedule[weekdayOf(next)]);
    if (time !== APPOINTMENT_ANY_TIME && !nextSlots.includes(time)) setTime('');
  }

  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{ border: '1.5px solid #e2d6b5', background: '#fffdf8' }}
    >
      <label
        htmlFor={`${idPrefix}-appointment`}
        className="flex cursor-pointer select-none items-start gap-3 px-4 py-3.5"
        style={{ borderBottom: checked ? '1px solid #ece3c9' : undefined }}
      >
        <input
          id={`${idPrefix}-appointment`}
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className="mt-0.5 grid h-[1.375rem] w-[1.375rem] flex-none place-items-center rounded-md text-[0.95rem] font-bold peer-focus-visible:ring-2 peer-focus-visible:ring-[#735c00]/40"
          style={{
            border: `2px solid ${checked ? GOLD : '#b5a37a'}`,
            background: checked ? GOLD : 'white',
            color: 'white',
          }}
        >
          {checked ? '✓' : ''}
        </span>
        <span className="text-[0.95rem] leading-snug" style={{ color: 'var(--color-on-surface)' }}>
          <span className="font-semibold">
            {isEs ? 'Me gustaría solicitar una cita' : 'I’d like to request an appointment'}
          </span>
          <span className="block text-[0.8rem]" style={{ color: 'var(--color-on-surface-variant)' }}>
            {isEs
              ? 'Elija un día y una hora; le confirmaremos.'
              : 'Pick a day and time — we’ll confirm with you'}
          </span>
        </span>
      </label>

      {checked && (
        <div className="grid gap-5 px-4 pb-4 pt-3 md:grid-cols-[minmax(0,1fr)_14rem]">
          <input type="hidden" name="appointment" value="yes" />

          <fieldset className="grid gap-1" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <legend className="form-label" style={{ padding: 0 }}>
              {isEs ? 'Día preferido' : 'Preferred day'} *
            </legend>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <MonthArrow
                dir="prev"
                disabled={atFirst}
                label={isEs ? 'Mes anterior' : 'Previous month'}
                onClick={() => view && setShown(shiftMonth(view, -1))}
              />
              <p className="text-sm font-semibold" aria-live="polite" style={{ color: 'var(--color-on-surface)' }}>
                {view ? monthTitle(view, isEs) : ''}
              </p>
              <MonthArrow
                dir="next"
                disabled={atLast}
                label={isEs ? 'Mes siguiente' : 'Next month'}
                onClick={() => view && setShown(shiftMonth(view, 1))}
              />
            </div>
            <div className="grid grid-cols-7 gap-1" aria-hidden="true">
              {weekdayHeadings(isEs).map((d) => (
                <span
                  key={d}
                  className="pb-0.5 text-center text-[0.62rem] font-bold uppercase tracking-[0.06em]"
                  style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-label)' }}
                >
                  {d}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((d, i) => {
                if (!d) return <span key={`pad-${i}`} aria-hidden="true" />;
                if (!d.selectable) {
                  return (
                    <span
                      key={d.iso}
                      className="flex h-10 flex-col items-center justify-center rounded-[10px] text-sm leading-none"
                      style={d.isToday
                        ? { border: '1.5px dashed #c9bd9d', background: 'white', color: 'var(--color-on-surface-variant)', fontWeight: 600 }
                        : { background: '#f3f1ec', color: '#bdb6a8', textDecoration: d.closed && !d.outside ? 'line-through' : undefined }}
                    >
                      {d.dayOfMonth}
                      {d.isToday && (
                        <span className="mt-0.5 block text-[0.52rem] uppercase tracking-[0.06em]">{isEs ? 'hoy' : 'today'}</span>
                      )}
                    </span>
                  );
                }
                const on = date === d.iso;
                return (
                  <label
                    key={d.iso}
                    htmlFor={`${idPrefix}-day-${d.iso}`}
                    className="flex h-10 cursor-pointer flex-col items-center justify-center rounded-[10px] text-sm font-bold leading-none focus-within:ring-2 focus-within:ring-[#735c00]/40"
                    style={{
                      border: `1.5px solid ${on ? GOLD : LINE}`,
                      background: on ? GOLD : 'white',
                      color: on ? 'white' : 'var(--color-on-surface)',
                    }}
                  >
                    {/* Not the posted field: only this month's days exist,
                        so the picked day posts from the hidden input below
                        and survives paging to another month. */}
                    <input
                      id={`${idPrefix}-day-${d.iso}`}
                      type="radio"
                      name={`${idPrefix}-appointment-day`}
                      value={d.iso}
                      checked={on}
                      onChange={() => pickDate(d.iso)}
                      className="sr-only"
                    />
                    {d.dayOfMonth}
                  </label>
                );
              })}
            </div>
            <input type="hidden" name="appointment_date" value={date} />
            {date && (
              <p className="mt-2 text-sm" style={{ color: 'var(--color-on-surface)' }}>
                {isEs ? 'Su día: ' : 'Your day: '}
                <b style={{ color: GOLD }}>{formatAppointmentDay(date, isEs)}</b>
              </p>
            )}
            <p className="mt-1.5 text-xs leading-snug" style={{ color: 'var(--color-on-surface-variant)' }}>
              {isEs
                ? 'Días en gris: salón cerrado. ¿Necesita uno de esos días? Díganoslo en su mensaje; a menudo podemos arreglarlo.'
                : 'Grey days: showroom closed. Need one of those days? Say so in your message — we can often arrange it.'}
            </p>
          </fieldset>

          <div className="grid content-start gap-3">
            <fieldset className="grid gap-1" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
              <legend className="form-label" style={{ padding: 0 }}>
                {isEs ? 'Hora preferida' : 'Preferred time'} *
              </legend>
              {date ? (
                <div className="grid grid-cols-4 gap-1.5 md:grid-cols-2">
                  {[...slots, APPOINTMENT_ANY_TIME].map((slot) => {
                    const on = time === slot;
                    const any = slot === APPOINTMENT_ANY_TIME;
                    return (
                      <label
                        key={slot}
                        htmlFor={`${idPrefix}-time-${slot}`}
                        className={`flex cursor-pointer items-center justify-center rounded-[10px] py-2 text-[0.8rem] font-bold focus-within:ring-2 focus-within:ring-[#735c00]/40${any ? ' col-span-full' : ''}`}
                        style={{
                          border: `1.5px solid ${on ? GOLD : LINE}`,
                          background: on ? '#f7efd7' : 'white',
                          color: on ? GOLD : 'var(--color-on-surface)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <input
                          id={`${idPrefix}-time-${slot}`}
                          type="radio"
                          name="appointment_time"
                          value={slot}
                          required
                          checked={on}
                          onChange={() => setTime(slot)}
                          className="sr-only"
                        />
                        {any ? (isEs ? 'Cualquier hora ese día' : 'Any time that day') : slotLabel(slot, isEs)}
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p
                  className="rounded-[10px] px-3 py-2.5 text-sm"
                  style={{ border: `1.5px dashed ${LINE}`, color: 'var(--color-on-surface-variant)' }}
                >
                  {isEs ? 'Elija un día para ver las horas.' : 'Pick a day to see the times.'}
                </p>
              )}
            </fieldset>

            <p
              className="rounded-[10px] px-3 py-2.5 text-[0.8rem] leading-relaxed"
              style={{ border: '1px solid rgba(115, 92, 0, 0.24)', background: '#fbf5e7', color: '#4d4635' }}
            >
              {isEs ? (
                <>Esto es una <b>solicitud</b>, aún no una reserva: le llamaremos o enviaremos un texto para confirmar la hora. ¿Viene hoy? Llame al </>
              ) : (
                <>This is a <b>request</b>, not a booking yet — we’ll call or text to confirm your time. Coming in today? Just call </>
              )}
              <a href={TEL_HREF} className="whitespace-nowrap font-bold" style={{ color: GOLD }}>{CONTACT_PHONE_DISPLAY}</a>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
