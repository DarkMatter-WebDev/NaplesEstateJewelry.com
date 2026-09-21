'use client';

import { useEffect, useRef } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { CONTACT_PHONE_DISPLAY, TEL_HREF, smsHref } from '@/lib/contact-links';

/**
 * What a lead form shows once it has been sent — shared by the free-appraisal
 * form, the contact "message us" form and the product inquiry form, so the
 * three can never drift apart (owner-approved mockup option B + the "need us
 * sooner" line, 2026-09-20).
 *
 * Why it exists:
 * - **It brings itself into view.** A sent form is swapped for this much
 *   shorter panel, the page collapses, and the browser keeps its old scroll
 *   offset — on a phone the confirmation ended up ABOVE the screen and the
 *   customer saw the footer instead. On mount it jumps to the middle of the
 *   screen (`block: 'center'` also keeps it clear of the sticky header),
 *   re-checks once after the phone keyboard has closed, and takes focus so a
 *   screen reader announces it.
 * - **"Send another"** — before, a sent form was a dead end: a customer who
 *   spotted a mistake had to reload the page. `onSendAnother` lets the parent
 *   bring back a clean form. The server's rate limits are unchanged.
 * - "Success!" and a check mark replace the old "OK" badge.
 *
 * The parent owns the outer wrapper (each form sits in a different card), so
 * this renders only the panel's contents.
 */
export default function FormSuccessPanel({
  isEs,
  kind,
  body,
  onSendAnother,
}: {
  isEs: boolean;
  /** Small line under the heading: a submission (photos/appraisal) or a message. */
  kind: 'submission' | 'message';
  /** The one sentence under it — each form keeps its own wording. */
  body: string;
  onSendAnother: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Instant, not smooth: an animated scroll needs animation frames and is
    // cancelled by anything that moves the page under it — on a phone the
    // keyboard is closing at exactly this moment. The form has just been
    // swapped out anyway, so a jump reads as part of the same change.
    el.scrollIntoView({ block: 'center', behavior: 'auto' });
    el.focus({ preventScroll: true });
    // Once the keyboard has gone the visible area is taller and the page may
    // have shifted: check once more, and only move if the panel is cut off.
    const recheck = window.setTimeout(() => {
      const rect = el.getBoundingClientRect();
      if (rect.top < 0 || rect.bottom > window.innerHeight) {
        el.scrollIntoView({ block: 'center', behavior: 'auto' });
      }
    }, 450);
    return () => window.clearTimeout(recheck);
  }, []);

  const received = kind === 'message'
    ? (isEs ? 'Mensaje enviado' : 'Message sent')
    : (isEs ? 'Envío recibido' : 'Submission received');

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="status"
      data-form-success
      className="text-center outline-none"
    >
      <div
        className="mx-auto mb-4 grid h-[3.25rem] w-[3.25rem] place-items-center rounded-full text-2xl"
        style={{ background: '#f7efd7', color: 'var(--color-primary)' }}
        aria-hidden="true"
      >
        <AppIcon name="check" />
      </div>
      <p
        className="text-2xl font-bold mb-1.5"
        style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
      >
        {isEs ? '¡Listo!' : 'Success!'}
      </p>
      <p
        className="text-[0.8rem] font-bold uppercase tracking-[0.12em] mb-2.5"
        style={{ fontFamily: 'var(--font-label)', color: 'var(--color-primary)' }}
      >
        {received}
      </p>
      <p className="text-sm mb-5" style={{ color: 'var(--color-on-surface-variant)' }}>
        {body}
      </p>
      <button type="button" className="outline-button" onClick={onSendAnother}>
        <AppIcon name="sync" aria-hidden="true" />
        {isEs ? 'Enviar otro' : 'Send another'}
      </button>
      <p className="text-sm mt-4" style={{ color: 'var(--color-on-surface-variant)' }}>
        {isEs ? '¿Nos necesita antes? ' : 'Need us sooner? '}
        <a href={TEL_HREF} className="font-bold" style={{ color: 'var(--color-primary)' }}>
          {isEs ? 'Llame' : 'Call'}
        </a>
        {isEs ? ' o ' : ' or '}
        <a href={smsHref()} className="font-bold" style={{ color: 'var(--color-primary)' }}>
          {isEs ? 'envíe un texto' : 'text'}
        </a>
        {isEs ? ' al ' : ' '}
        <a href={TEL_HREF} className="font-bold whitespace-nowrap" style={{ color: 'var(--color-primary)' }}>
          {CONTACT_PHONE_DISPLAY}
        </a>
      </p>
    </div>
  );
}

/** After "Send another": put the top of the fresh form back on screen. */
export function scrollToFormStart(el: HTMLElement | null): void {
  if (!el) return;
  // After React has put the form back in the DOM. A timer, not an animation
  // frame, and an instant jump — same reasoning as the panel above.
  window.setTimeout(() => el.scrollIntoView({ block: 'start', behavior: 'auto' }), 60);
}
