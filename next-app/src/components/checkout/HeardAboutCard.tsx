'use client';

import { useEffect, useRef, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import {
  HEARD_ABOUT_CHOICES,
  HEARD_ABOUT_OTHER,
  HEARD_ABOUT_OTHER_MAX,
  normalizeHeardAbout,
} from '@/lib/order-heard-about';

const GOLD = '#735c00';

/**
 * The optional "How did you hear about us?" card under the Order Received
 * buttons (owner's mockup 2, 2026-10-29). One answer; "Other…" opens a box for
 * their own words; Send appears once something is picked; after a save the card
 * becomes a one-line thank-you. Skipping it changes nothing about the order.
 * Saved by `/api/orders/heard-about`, read in Admin → Orders → the order.
 */
export default function HeardAboutCard({ orderId, orderNumber, isEs }: { orderId: string; orderNumber: string; isEs: boolean }) {
  const [choice, setChoice] = useState('');
  const [other, setOther] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const otherRef = useRef<HTMLInputElement>(null);

  const isOther = choice === HEARD_ABOUT_OTHER.key;
  useEffect(() => {
    if (isOther) otherRef.current?.focus();
  }, [isOther]);

  if (state === 'done') {
    return (
      <div
        className="mt-9 flex items-center justify-center gap-2.5 rounded-[18px] border bg-white px-5 py-4"
        style={{ borderColor: 'var(--color-outline-variant)' }}
        role="status"
      >
        <AppIcon name="check_circle" aria-hidden="true" style={{ fontSize: '26px', color: '#b5890c' }} />
        <p className="text-base" style={{ color: 'var(--color-on-surface)' }}>
          {isEs ? 'Gracias — nos ayuda mucho.' : 'Thank you — that helps.'}
        </p>
      </div>
    );
  }

  const answer = normalizeHeardAbout(choice, other);

  async function send() {
    if (!answer || state === 'sending') return;
    setState('sending');
    try {
      const res = await fetch('/api/orders/heard-about', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, orderNumber, heardAbout: answer.heardAbout, heardAboutOther: answer.heardAboutOther }),
      });
      // 404 = this order already has an answer (another tab): nothing to retry.
      setState(res.ok || res.status === 404 ? 'done' : 'error');
    } catch {
      setState('error');
    }
  }

  const chips = [...HEARD_ABOUT_CHOICES, HEARD_ABOUT_OTHER];

  return (
    <form
      className="no-print mt-9 rounded-[18px] border bg-white px-5 pb-5 pt-[22px] text-center"
      style={{ borderColor: 'var(--color-outline-variant)' }}
      onSubmit={(e) => { e.preventDefault(); void send(); }}
    >
      <fieldset>
        <legend className="w-full">
          <span className="block text-[0.68rem] font-bold uppercase tracking-[0.14em]" style={{ color: '#b5890c', fontFamily: 'var(--font-label)' }}>
            {isEs ? 'Una pregunta rápida' : 'One quick question'}
          </span>
          <span className="mt-2 block text-[1.3rem] font-bold leading-snug" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
            {isEs ? '¿Cómo nos conoció?' : 'How did you hear about us?'}
          </span>
          <span className="mb-4 mt-1.5 block text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
            {isEs ? 'Opcional — ayuda a un pequeño negocio local a saber qué funciona.' : "Optional — it helps a small local shop know what's working."}
          </span>
        </legend>

        <div className="flex flex-wrap justify-center gap-2">
          {chips.map((c) => (
            <label key={c.key} className="cursor-pointer">
              <input
                type="radio"
                name={`heard-about-${orderNumber}`}
                value={c.key}
                checked={choice === c.key}
                onChange={() => { setChoice(c.key); if (state === 'error') setState('idle'); }}
                className="peer sr-only"
              />
              <span
                className="inline-block rounded-full border border-[var(--color-outline-variant)] bg-white px-3.5 py-2 text-sm leading-tight text-[var(--color-on-surface)] transition-colors hover:border-[#735c00] peer-checked:border-[#735c00] peer-checked:bg-[#f6efd9] peer-checked:font-bold peer-checked:text-[#735c00] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#1a1c1c]"
              >
                {isEs ? c.es : c.en}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {isOther && (
        // The 340px cap sits on this wrapper: an unlayered `input { max-width: 100% }`
        // in globals.css beats a max-w utility on the input itself.
        <div className="mx-auto mt-3 max-w-[340px]">
          <label htmlFor={`heard-about-other-${orderNumber}`} className="sr-only">
            {isEs ? '¿Dónde nos conoció?' : 'Where did you hear about us?'}
          </label>
          <input
            ref={otherRef}
            id={`heard-about-other-${orderNumber}`}
            type="text"
            value={other}
            onChange={(e) => setOther(e.target.value)}
            maxLength={HEARD_ABOUT_OTHER_MAX}
            placeholder={isEs ? 'Cuéntenos dónde' : 'Tell us where'}
            autoComplete="off"
            className="w-full rounded-xl border bg-white px-3.5 py-2.5 text-base outline-none focus:shadow-[0_0_0_3px_rgba(115,92,0,0.15)]"
            style={{ borderColor: GOLD, color: 'var(--color-on-surface)' }}
          />
        </div>
      )}

      {choice && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <button type="submit" className="gold-button" disabled={!answer || state === 'sending'} aria-busy={state === 'sending'}
            style={!answer ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}>
            {state === 'sending' ? (isEs ? 'Enviando…' : 'Sending…') : (isEs ? 'Enviar' : 'Send')}
          </button>
          {state === 'error' && (
            <p className="text-sm" role="alert" style={{ color: 'var(--color-error)' }}>
              {isEs ? 'No se pudo guardar. Intente de nuevo.' : "That didn't save. Please try again."}
            </p>
          )}
        </div>
      )}
    </form>
  );
}
