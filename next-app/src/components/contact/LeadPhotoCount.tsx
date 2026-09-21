import { isOverLeadPhotoCap, leadPhotoCountLabel, leadPhotoOverCapMessage } from '@/lib/lead-photo-limits';

/**
 * The line under a lead form's photo picker: "3 photos selected", or — in red —
 * "You selected 12 photos. Only the first 10 will be sent." Shared by the
 * free-appraisal and contact forms so the two can never disagree again
 * (2026-09-20; see `lib/lead-photo-limits.ts`).
 *
 * `role="alert"` on the over-cap line: a screen-reader user hears it the moment
 * the picker closes, same as a sighted user sees the red.
 */
export default function LeadPhotoCount({
  isEs,
  selected,
  color,
}: {
  isEs: boolean;
  selected: number;
  /** Colour of the normal count line (each form has its own accent). */
  color: string;
}) {
  if (selected <= 0) return null;
  if (isOverLeadPhotoCap(selected)) {
    return (
      <span
        role="alert"
        data-lead-photo-over-cap
        className="text-sm font-semibold block mt-2"
        style={{ color: 'var(--color-error, #b91c1c)' }}
      >
        {leadPhotoOverCapMessage(isEs, selected)}
      </span>
    );
  }
  return (
    <span className="text-sm font-semibold block mt-2" style={{ color }}>
      {leadPhotoCountLabel(isEs, selected)}
    </span>
  );
}
