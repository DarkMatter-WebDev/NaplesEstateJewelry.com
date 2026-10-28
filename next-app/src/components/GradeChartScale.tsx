'use client';

import { useEffect, useState } from 'react';

export interface GradeChartGrade {
  g: string;
  band: string;
  line: string;
  /** What the abbreviation stands for (clarity: "Very Slightly Included 1"); shown first. */
  name?: string;
}

export interface GradeChartBand {
  band: string;
  name: string;
  offer: string;
}

interface Props {
  title: string;
  grades: GradeChartGrade[];
  bands: GradeChartBand[];
  bandStyle: Record<string, { bg: string; fg: string }>;
  /** localStorage key that remembers "Show every grade" on this device. */
  storageKey: string;
  isEs: boolean;
}

/**
 * One scale of the diamond color/clarity chart (owner, 2026-10-28; chart B of
 * mockup 3). Compact by default: the chips in order, a box that shows the
 * tapped grade's line, and one summary line per band. "Show every grade"
 * expands to the full table — the counter view — and the choice is remembered
 * per device so the owner's phone opens expanded after the first tap.
 *
 * Every grade's line is ALWAYS in the markup the page passes in (the guard
 * test reads them from page.tsx); this component only decides which are shown.
 * Storage reads/writes are best effort — blocked storage just means compact.
 */
export default function GradeChartScale({ title, grades, bands, bandStyle, storageKey, isEs }: Props) {
  const [picked, setPicked] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // Storage is only readable after hydration; the server always renders
    // compact, so reading it here (not in the initializer) is the intended
    // pattern and the set-state-in-effect flag is a false positive.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(storageKey) === '1') setExpanded(true);
    } catch {
      // Storage blocked (private window, cleared data): start compact.
    }
  }, [storageKey]);

  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
    try {
      if (next) localStorage.setItem(storageKey, '1');
      else localStorage.removeItem(storageKey);
    } catch {
      // Best effort only.
    }
  };

  const pickedGrade = picked ? grades.find((c) => c.g === picked) ?? null : null;

  return (
    <div className="rounded-2xl border border-[#d0c5af] bg-white p-7 shadow-[0_10px_28px_rgba(38,28,6,0.04)]">
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: '#735c00', fontFamily: 'var(--font-label)' }}>
        {title}
      </p>

      {/* The chips, in order. Tapping one shows its line in the box below. */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {grades.map((c) => {
          const on = c.g === picked;
          return (
            <button
              key={c.g}
              type="button"
              aria-pressed={on}
              onClick={() => setPicked(on ? null : c.g)}
              className={`inline-flex min-w-[2.4rem] cursor-pointer items-center justify-center rounded-md border px-2 py-1 text-xs font-bold ${
                on ? 'border-[#735c00] ring-2 ring-[#735c00] ring-offset-1' : 'border-[#d0c5af]'
              }`}
              style={{ background: bandStyle[c.band].bg, color: bandStyle[c.band].fg, fontFamily: 'var(--font-label)' }}
            >
              {c.g}
            </button>
          );
        })}
      </div>

      {/* flex + justify-center: the starting hint sits centred in the box
          instead of top-left with empty space under it (owner, 10-28). */}
      <div className="mb-4 flex min-h-[2.75rem] flex-col justify-center rounded-xl border border-dashed border-[#d0c5af] bg-[#fbf7ea] px-3 py-2 text-sm leading-relaxed text-[#4d4635]" aria-live="polite">
        {pickedGrade ? (
          <>
            {pickedGrade.name ? (
              <p className="m-0 font-bold text-[#1a1c1c]">
                <span className="mr-2" style={{ fontFamily: 'var(--font-label)' }}>{pickedGrade.g}</span>
                {pickedGrade.name}
              </p>
            ) : null}
            <p className="m-0">
              {pickedGrade.name ? null : (
                <span className="mr-2 font-bold text-[#1a1c1c]" style={{ fontFamily: 'var(--font-label)' }}>{pickedGrade.g}</span>
              )}
              {pickedGrade.line}
            </p>
          </>
        ) : (
          <p className="m-0 text-center text-xs text-[#7a7360]">{isEs ? 'Toque un grado para leerlo.' : 'Tap a grade to read it.'}</p>
        )}
      </div>

      {expanded ? (
        <div className="flex flex-col gap-5">
          {bands.map((b) => (
            <div key={b.band}>
              <div className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="text-sm font-bold text-[#1a1c1c]" style={{ fontFamily: 'var(--font-headline)' }}>{b.name}</p>
                <p className="text-xs leading-relaxed text-[#735c00]">{b.offer}</p>
              </div>
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {grades.filter((c) => c.band === b.band).map((c) => (
                    <tr key={c.g} className="border-b border-[#e3dccd] last:border-b-0">
                      <td className="w-14 py-1.5 pr-3 align-top font-bold text-[#1a1c1c]" style={{ fontFamily: 'var(--font-label)' }}>{c.g}</td>
                      <td className="py-1.5 text-[#4d4635]">
                        {c.name ? <span className="font-semibold text-[#1a1c1c]">{c.name}. </span> : null}
                        {c.line}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {bands.map((b) => (
            <p key={b.band} className="m-0 text-sm leading-relaxed text-[#4d4635]">
              <span className="mr-1.5 font-bold text-[#1a1c1c]" style={{ fontFamily: 'var(--font-headline)' }}>{b.name}</span>
              {b.offer}
            </p>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={toggleExpanded}
        aria-expanded={expanded}
        className="mt-4 cursor-pointer text-xs font-bold text-[#735c00] underline underline-offset-2"
      >
        {expanded ? (isEs ? 'Mostrar menos ▴' : 'Show less ▴') : isEs ? 'Mostrar todos los grados ▾' : 'Show every grade ▾'}
      </button>
    </div>
  );
}
