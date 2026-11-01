'use client';

import { useEffect, useRef, useState } from 'react';
import { addressOneLine } from '@/lib/business-location';
import { copyTextToClipboard } from '@/lib/clipboard';

interface Props {
  locale?: string;
  className?: string;
}

/** How long the confirmed state stays up before reverting to the copy icon. */
const CONFIRM_MS = 2200;

/**
 * Small icon button that copies the showroom address to the clipboard.
 *
 * ⚠️ It copies `addressOneLine()` — the street and city ONLY, with no landmark
 * and no business name. What gets pasted almost always goes into a maps app or
 * a GPS, and "· inside Sharon Lynch Collections" is wayfinding for a human
 * reading the page, not something a geocoder should be handed. The landmark
 * stays visible next to the button; it just does not travel.
 *
 * Uses the existing `lib/clipboard` helper rather than calling
 * `navigator.clipboard` directly: that helper already falls back to a hidden
 * textarea + `execCommand` when the Clipboard API is unavailable, which is the
 * case on any non-secure context. Admin surfaces have used it for a while.
 *
 * Accessibility notes:
 *
 * - The button is icon-only, so its accessible name comes from `aria-label`,
 *   and that label changes with state — a screen reader that re-reads the
 *   button after activation hears the result rather than the same "Copy" again.
 * - Success is also announced through a polite live region, because the icon
 *   swap is the only other signal and it is purely visual.
 * - The box is a fixed square and both icons are the same size, so the
 *   confirmation swap cannot reflow the address line beside it.
 */
export default function CopyAddressButton({ locale = 'en', className = '' }: Props) {
  const isEs = locale === 'es';
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<number | undefined>(undefined);

  // A click late in the component's life would otherwise set state after
  // unmount when the page navigates away mid-confirmation.
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function handleCopy() {
    const ok = await copyTextToClipboard(addressOneLine());
    setState(ok ? 'copied' : 'failed');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), CONFIRM_MS);
  }

  const label =
    state === 'copied'
      ? isEs
        ? 'Dirección copiada'
        : 'Address copied'
      : state === 'failed'
        ? isEs
          ? 'No se pudo copiar la dirección'
          : 'Could not copy the address'
        : isEs
          ? 'Copiar dirección'
          : 'Copy address';

  return (
    <>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={label}
        title={label}
        className={`hover-chip inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border align-middle transition-colors ${className}`}
        style={{
          borderColor:
            state === 'copied' ? 'var(--color-primary)' : 'var(--color-outline-variant)',
          color: state === 'copied' ? 'var(--color-primary)' : 'inherit',
          opacity: state === 'copied' ? 1 : 0.75,
        }}
      >
        {state === 'copied' ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M20 6 9 17l-5-5"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="9" y="9" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
            <path
              d="M5 15V5a2 2 0 0 1 2-2h10"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        )}
      </button>
      <span aria-live="polite" className="sr-only">
        {state === 'idle' ? '' : label}
      </span>
    </>
  );
}
