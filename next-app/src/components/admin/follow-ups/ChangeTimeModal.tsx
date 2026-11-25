'use client';

import { useState } from 'react';
import AdminModal from '@/components/admin/AdminModal';
import { formatFollowUpTime, nextSlotAtOrAfter } from '@/lib/follow-ups';
import { formatSocialScheduleInput } from '@/lib/social-queue-schedule';
import { callJson, MUTED, SMALL_BUTTON } from './shared';

/**
 * "Change time" (mockup 1): Later today · Tomorrow 10 AM · Pick a date.
 * Times are Naples (Eastern) time whatever the device's own time zone is.
 */
export default function ChangeTimeModal({
  id,
  who,
  current,
  onClose,
  onDone,
}: {
  id: string;
  who: string;
  current: string | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const now = new Date();
  const laterToday = new Date(now.getTime() + 2 * 3600_000);
  // The next 10 AM (Mon–Sat) at least a minute from now.
  const tomorrowMorning = nextSlotAtOrAfter(new Date(now.getTime() + 60_000));
  const [value, setValue] = useState(formatSocialScheduleInput(current ? new Date(current) : tomorrowMorning));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(sendAt: string) {
    setBusy(true);
    setError(null);
    const { ok, data } = await callJson(`/api/admin/follow-ups/${id}`, { body: { action: 'reschedule', sendAt } });
    setBusy(false);
    if (!ok) {
      setError(data.error ?? 'Could not change the time.');
      return;
    }
    onDone(`${who}: now sends ${formatFollowUpTime(typeof data.sendAt === 'string' ? data.sendAt : null)}.`);
  }

  // "Later today" only while two hours from now is still the same day, before 6 PM in Naples.
  const laterLocal = formatSocialScheduleInput(laterToday);
  const offerLaterToday = laterLocal.slice(0, 10) === formatSocialScheduleInput(now).slice(0, 10) && Number(laterLocal.slice(11, 13)) < 18;
  const quick = [
    ...(offerLaterToday ? [{ label: `Later today · ${formatFollowUpTime(laterToday).split(', ').pop()}`, at: laterToday }] : []),
    { label: `Next 10 AM · ${formatFollowUpTime(tomorrowMorning)}`, at: tomorrowMorning },
  ];

  return (
    <AdminModal title={`Change time — ${who}`} onClose={onClose} maxWidth="max-w-md">
      <div className="space-y-4 px-4 py-4 text-sm">
        <p style={MUTED}>Now set for: <b style={{ color: 'var(--color-on-surface)' }}>{formatFollowUpTime(current)}</b></p>
        <div className="flex flex-wrap gap-2">
          {quick.map((option) => (
            <button
              key={option.label}
              type="button"
              className="outline-button"
              style={SMALL_BUTTON}
              disabled={busy}
              onClick={() => void save(formatSocialScheduleInput(option.at))}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="form-label">Or pick a date and time (Naples time)</span>
          <input
            type="datetime-local"
            className="form-field"
            value={value}
            min={formatSocialScheduleInput(now)}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        {error && <p role="alert" className="text-sm font-semibold" style={{ color: 'var(--color-error)' }}>{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="outline-button" style={SMALL_BUTTON} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="gold-button" style={SMALL_BUTTON} onClick={() => void save(value)} disabled={busy || !value} aria-busy={busy}>
            {busy ? 'Saving…' : 'Save time'}
          </button>
        </div>
      </div>
    </AdminModal>
  );
}
