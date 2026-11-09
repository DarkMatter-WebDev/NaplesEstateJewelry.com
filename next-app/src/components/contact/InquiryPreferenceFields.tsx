'use client';

import { useState } from 'react';
import {
  locationAreaOptions,
  locationNeedsDetail,
  outOfAreaNote,
  preferredContactOptions,
  type LocationArea,
  type PreferredContact,
} from '@/lib/inquiry-fields';

/**
 * The two lead-form fields added 2026-09-08 (owner-approved mockup, option A):
 *
 *   LocationField          — "Where are you located?" select; the two catch-all
 *                            areas reveal a "City & state" line + the out-of-area
 *                            note. Posts `location_area` + `location_detail`.
 *   PreferredContactField  — "How should we contact you?" as three radio pills
 *                            (Call · Text · Email). Posts `preferred_contact`.
 *
 * Both are REQUIRED (native `required`, so the browser blocks an empty submit
 * the same way it does for the name and phone fields). "Email" chosen with an
 * empty email box is caught by each form's own submit handler, next to the
 * email field, using `preferredContactNeedsEmail`.
 *
 * `tone` matches the host form: EvalForm styles its labels/inputs inline
 * (grey label, #d8d0c2 border); the contact forms use `.form-label` /
 * `.form-field`. Styles are inline on purpose — a brand-new class in
 * globals.css can be invisible in dev (see dev-server notes), and these
 * fields have nothing to share with any other surface.
 */

type Tone = 'eval' | 'default';

const EVAL_LABEL_CLASS = 'text-[0.7rem] font-bold uppercase tracking-[0.14em]';
const EVAL_LABEL_STYLE: React.CSSProperties = { color: '#5e5e5d', fontFamily: 'var(--font-label)' };
const EVAL_INPUT_CLASS = 'w-full rounded-xl px-3 py-2 text-sm';
const EVAL_INPUT_STYLE: React.CSSProperties = { border: '1px solid #d8d0c2', background: 'white', color: '#1a1c1c' };

function FieldLabel({ tone, htmlFor, as = 'label', children }: {
  tone: Tone;
  htmlFor?: string;
  as?: 'label' | 'legend';
  children: React.ReactNode;
}) {
  const className = tone === 'eval' ? EVAL_LABEL_CLASS : 'form-label';
  const style = tone === 'eval' ? EVAL_LABEL_STYLE : undefined;
  if (as === 'legend') {
    return <legend className={className} style={{ ...style, padding: 0 }}>{children}</legend>;
  }
  return <label htmlFor={htmlFor} className={className} style={style}>{children}</label>;
}

export function LocationField({ locale, tone = 'default', idPrefix }: {
  locale: string;
  tone?: Tone;
  idPrefix: string;
}) {
  const isEs = locale === 'es';
  const [area, setArea] = useState<LocationArea | ''>('');
  const needsDetail = locationNeedsDetail(area || null);
  const inputClass = tone === 'eval' ? EVAL_INPUT_CLASS : 'form-field';
  const inputStyle = tone === 'eval' ? EVAL_INPUT_STYLE : undefined;

  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <FieldLabel tone={tone} htmlFor={`${idPrefix}-location-area`}>
          {isEs ? '¿Dónde se encuentra?' : 'Where are you located?'} *
        </FieldLabel>
        <select
          id={`${idPrefix}-location-area`}
          name="location_area"
          required
          value={area}
          onChange={(e) => setArea(e.target.value as LocationArea | '')}
          className={inputClass}
          style={inputStyle}
        >
          <option value="" disabled>{isEs ? 'Seleccione…' : 'Select…'}</option>
          {locationAreaOptions(isEs).map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      {needsDetail && (
        <div className="grid gap-2">
          <div className="grid gap-1">
            <FieldLabel tone={tone} htmlFor={`${idPrefix}-location-detail`}>
              {isEs ? 'Ciudad y estado' : 'City & state'}
            </FieldLabel>
            <input
              id={`${idPrefix}-location-detail`}
              name="location_detail"
              type="text"
              maxLength={120}
              autoComplete="address-level2"
              placeholder={isEs ? 'p. ej. Sarasota, FL' : 'e.g. Sarasota, FL'}
              className={inputClass}
              style={inputStyle}
            />
          </div>
          <p
            className="rounded-xl px-3 py-2 text-sm"
            style={{ border: '1px solid rgba(115, 92, 0, 0.24)', background: '#fbf5e7', color: '#4d4635' }}
          >
            {outOfAreaNote(isEs, area || null)}
          </p>
        </div>
      )}
    </div>
  );
}

export function PreferredContactField({ locale, tone = 'default', idPrefix, value, onChange }: {
  locale: string;
  tone?: Tone;
  idPrefix: string;
  /** Controlled use (InquiryForm keeps its values in state); omit for FormData forms. */
  value?: PreferredContact | '';
  onChange?: (value: PreferredContact) => void;
}) {
  const isEs = locale === 'es';
  const [internal, setInternal] = useState<PreferredContact | ''>('');
  const current = value ?? internal;

  function select(next: PreferredContact) {
    setInternal(next);
    onChange?.(next);
  }

  return (
    <fieldset className="grid gap-1" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <FieldLabel tone={tone} as="legend">
        {isEs ? '¿Cómo prefiere que le contactemos?' : 'How should we contact you?'} *
      </FieldLabel>
      <div className="grid grid-cols-3 gap-2">
        {preferredContactOptions(isEs).map((option) => {
          const on = current === option.value;
          return (
            <label
              key={option.value}
              htmlFor={`${idPrefix}-contact-${option.value}`}
              className="flex cursor-pointer select-none items-center justify-center rounded-xl text-center text-sm font-semibold transition-colors focus-within:ring-2 focus-within:ring-[#735c00]/40"
              style={{
                border: `1.5px solid ${on ? '#735c00' : '#d8d0c2'}`,
                background: on ? '#f7efd7' : 'white',
                color: on ? '#735c00' : '#1a1c1c',
                padding: '0.55rem 0.4rem',
                fontFamily: 'var(--font-label)',
              }}
            >
              <input
                id={`${idPrefix}-contact-${option.value}`}
                type="radio"
                name="preferred_contact"
                value={option.value}
                required
                checked={on}
                onChange={() => select(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
