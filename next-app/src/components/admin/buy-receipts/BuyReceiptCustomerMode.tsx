'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { BUSINESS_NAME } from '@/lib/business-location';
import {
  CUSTOMER_FIELDS,
  CUSTOMER_MODE_CODE_LENGTH,
  customerFirstName,
  customerProblems,
  formatCustomerField,
  tidyCustomerValues,
  type CustomerField,
  type CustomerHandBackReason,
  type CustomerProblem,
  type CustomerValues,
} from '@/lib/buy-receipt-customer-mode';
import { CUSTOMER_MODE_MAX_TRIES, CUSTOMER_MODE_TRY_WINDOW_SECONDS } from '@/lib/customer-mode-lock';
import { endCustomerMode } from './buy-receipt-client';
import { BUY_RECEIPT_CUSTOMER_CSS, CUSTOMER_MODE_HOST_CLASS, CUSTOMER_MODE_PAGE_CSS } from './buy-receipt-customer-css';

/**
 * Admin → Buy Receipts → New receipt → "Customer input mode" (owner mockups
 * 2026-10-03): the screen the SELLER holds.
 *
 * It shows only the seller's own contact boxes, covers the whole page, does not
 * scroll, and cannot be left without the staff code:
 * - "Save" flags every unfinished box; only then is "Submit unfinished"
 *   offered, and that needs the code;
 * - a complete Save locks on "Thank you" until the code is entered;
 * - the small "Staff" button leaves the mode — with the code.
 *
 * The code is checked on the server (`endCustomerMode`); it is not in this file.
 * What the server refuses a locked browser is in `lib/customer-mode-lock.ts`.
 * The boxes edit the SAME draft as the owner's form, so nothing is copied back
 * and forth: when the tablet returns, the form simply has the details in it.
 */

type Phase = 'form' | 'thanks';
type Flags = Partial<Record<CustomerField, string>>;

type FieldUi = {
  label: ReactNode;
  className: string;
  inputMode?: 'tel' | 'numeric' | 'email';
  autoCapitalize: 'words' | 'characters' | 'none';
  maxLength?: number;
};

const FIELD_UI: Record<CustomerField, FieldUi> = {
  sellerName: { label: 'First and last name', className: 'brc-f-name', autoCapitalize: 'words' },
  sellerPhone: { label: 'Phone', className: 'brc-f-phone', inputMode: 'tel', autoCapitalize: 'none' },
  sellerStreet: { label: 'Street address', className: 'brc-f-street', autoCapitalize: 'words' },
  sellerCity: { label: 'City', className: 'brc-f-city', autoCapitalize: 'words' },
  sellerState: { label: 'State', className: 'brc-f-state', autoCapitalize: 'characters', maxLength: 2 },
  sellerZip: { label: 'ZIP', className: 'brc-f-zip', inputMode: 'numeric', autoCapitalize: 'none', maxLength: 10 },
  sellerEmail: { label: <>Email <i>(optional)</i></>, className: 'brc-f-email', inputMode: 'email', autoCapitalize: 'none' },
};

const PAD_TEXT: Record<CustomerHandBackReason, { title: string; sub: string; back: string }> = {
  unfinished: {
    title: 'Please hand this tablet to our staff',
    sub: 'Some boxes are not finished. A staff member can accept the form as it is.',
    back: 'Back to the form',
  },
  saved: { title: 'Staff only', sub: 'The customer has finished. Enter the code to open the receipt.', back: 'Back' },
  staff: { title: 'Staff only', sub: 'Enter the code to leave customer input mode. What was typed is kept.', back: 'Back to the form' },
};

const PAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'] as const;
const TOO_MANY_TRIES = 'Too many tries. Wait half a minute, then try again.';

/** A keyboard takes far more than this; the iPad's shortcut strip (a hardware keyboard) takes less. */
const KEYBOARD_MIN_PX = 140;

const PAGE_STYLE_ID = 'nej-customer-mode-page';
const TRAP_STATE_KEY = 'nejCustomerMode';
let trapArmed = false;

/**
 * Hide the back end for as long as the mode lasts. Kept in <head>, outside
 * React, on purpose: if a Back jump makes the router swap this page out, the
 * admin page it swaps in must stay hidden until the reload below lands.
 */
function holdPage() {
  if (document.getElementById(PAGE_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = PAGE_STYLE_ID;
  style.textContent = CUSTOMER_MODE_PAGE_CSS;
  document.head.appendChild(style);
}

function isTrapEntry(): boolean {
  const state = window.history.state as Record<string, unknown> | null;
  return Boolean(state && state[TRAP_STATE_KEY] === true);
}

/** One extra history entry for this same page, so the Back button has something harmless to take. */
function pushTrap() {
  try {
    // No URL argument: a plain history entry, not a navigation.
    window.history.pushState({ [TRAP_STATE_KEY]: true }, '');
  } catch {
    // A browser that refuses is still covered by the server-side lock.
  }
}

/** The staff code was accepted: show the page again and give the Back button back. */
export function releaseCustomerModePage() {
  trapArmed = false;
  document.getElementById(PAGE_STYLE_ID)?.remove();
  if (isTrapEntry()) window.history.back();
}

function toFlags(problems: CustomerProblem[]): Flags {
  const flags: Flags = {};
  for (const entry of problems) flags[entry.field] = entry.problem;
  return flags;
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export default function BuyReceiptCustomerMode({
  values,
  onChange,
  emailCopy,
  mailingList,
  onAsk,
  phase,
  tried,
  onProgress,
  onUnlocked,
  lockPath,
}: {
  values: CustomerValues;
  onChange: (patch: Partial<CustomerValues>) => void;
  emailCopy: boolean;
  mailingList: boolean;
  onAsk: (patch: { emailCopy?: boolean; mailingList?: boolean }) => void;
  phase: Phase;
  /** A Save has already found unfinished boxes: "Submit unfinished" is on offer. */
  tried: boolean;
  onProgress: (next: { phase: Phase; tried: boolean }) => void;
  /** The server accepted the staff code. */
  onUnlocked: (reason: CustomerHandBackReason) => void;
  /** The New receipt page's address — where "Sign in" returns to if the sign-in ran out mid-way. */
  lockPath: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const padRef = useRef<HTMLDivElement>(null);
  const inputs = useRef<Partial<Record<CustomerField, HTMLInputElement | null>>>({});
  const wrongTries = useRef(0);
  const pauseTimer = useRef<number | null>(null);

  const [flags, setFlags] = useState<Flags>(() => (tried ? toFlags(customerProblems(values)) : {}));
  const [pad, setPad] = useState<CustomerHandBackReason | null>(null);
  const [entered, setEntered] = useState('');
  const [padMessage, setPadMessage] = useState<{ text: string; signIn?: boolean } | null>(null);
  const [checking, setChecking] = useState(false);
  const [paused, setPaused] = useState(false);

  // The page stays hidden and the Back button stays here for as long as the mode lasts.
  useEffect(() => {
    holdPage();
    trapArmed = true;
    // The page this screen was opened on is, by definition, the one to stay on.
    const here = window.location.pathname;
    if (!isTrapEntry()) pushTrap();
    const onPop = () => {
      if (!trapArmed) return;
      // A jump further back in the history lands on another page: reload this one instead.
      if (window.location.pathname !== here) {
        window.location.replace(here);
        return;
      }
      pushTrap();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // The screen is exactly the part the keyboard leaves visible, so nothing is ever under the keys.
  // A layout effect: sized before the first paint. (This component is only ever drawn in the browser.)
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const viewport = window.visualViewport;
    let width = window.innerWidth;
    let tallest = 0;
    const fit = () => {
      // Zoomed in (a laptop trackpad pinch): the visible part is small because of the zoom,
      // not a keyboard. Leave the screen at its full size.
      if (viewport && Math.abs(viewport.scale - 1) > 0.01) {
        host.style.removeProperty('--brc-h');
        host.style.removeProperty('--brc-top');
        host.classList.remove('brc-kbd');
        return;
      }
      const height = viewport ? viewport.height : window.innerHeight;
      const top = viewport ? viewport.offsetTop : 0;
      // Turned sideways or upright: the old "tallest" belongs to the other shape.
      if (window.innerWidth !== width) {
        width = window.innerWidth;
        tallest = 0;
      }
      tallest = Math.max(tallest, height);
      host.style.setProperty('--brc-h', `${Math.round(height)}px`);
      host.style.setProperty('--brc-top', `${Math.round(top)}px`);
      // iOS and current Android leave window.innerHeight alone and shrink only the visible part;
      // an older Android shrinks both, which the "tallest seen" catches.
      const keyboard = window.innerHeight - height > KEYBOARD_MIN_PX || tallest - height > KEYBOARD_MIN_PX;
      host.classList.toggle('brc-kbd', keyboard);
    };
    fit();
    viewport?.addEventListener('resize', fit);
    viewport?.addEventListener('scroll', fit);
    window.addEventListener('resize', fit);
    return () => {
      viewport?.removeEventListener('resize', fit);
      viewport?.removeEventListener('scroll', fit);
      window.removeEventListener('resize', fit);
    };
  }, []);

  // No dragging the screen around and no pinch: only a caret inside a box, or the
  // last-resort scroll on a screen too small to hold the boxes, may move.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const stopMove = (event: TouchEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input')) return;
      const area = target?.closest('.brc-main, .brc-center');
      if (area && area.scrollHeight > area.clientHeight + 1) return;
      event.preventDefault();
    };
    const stopGesture = (event: Event) => event.preventDefault();
    host.addEventListener('touchmove', stopMove, { passive: false });
    document.addEventListener('gesturestart', stopGesture);
    return () => {
      host.removeEventListener('touchmove', stopMove);
      document.removeEventListener('gesturestart', stopGesture);
    };
  }, []);

  // The keypad takes the keyboard too (a laptop, or a tablet in a keyboard case).
  useEffect(() => {
    if (pad) padRef.current?.focus();
  }, [pad]);

  useEffect(
    () => () => {
      if (pauseTimer.current !== null) window.clearTimeout(pauseTimer.current);
    },
    [],
  );

  const hasEmail = Boolean(values.sellerEmail.trim());

  function closeKeyboard() {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  }

  function setField(field: CustomerField, input: HTMLInputElement) {
    const raw = input.value;
    // Brackets and dashes are added only while typing at the end; an edit in the
    // middle is left alone (reformatting there would throw the caret to the end).
    const atEnd = input.selectionStart === null || input.selectionStart >= raw.length;
    const next = atEnd ? formatCustomerField(field, raw) : raw;
    onChange({ [field]: next });
    if (flags[field]) {
      setFlags((current) => {
        const rest = { ...current };
        delete rest[field];
        return rest;
      });
    }
    // The two small boxes are about the email: no email, nothing to ask for.
    if (field === 'sellerEmail' && !next.trim() && (emailCopy || mailingList)) onAsk({ emailCopy: false, mailingList: false });
  }

  function tidyField(field: CustomerField) {
    const formatted = formatCustomerField(field, values[field]);
    if (formatted !== values[field]) onChange({ [field]: formatted });
  }

  function save() {
    const found = customerProblems(values);
    if (found.length === 0) {
      onChange(tidyCustomerValues(values));
      setFlags({});
      closeKeyboard();
      onProgress({ phase: 'thanks', tried: false });
      return;
    }
    setFlags(toFlags(found));
    onProgress({ phase: 'form', tried: true });
    inputs.current[found[0].field]?.focus();
  }

  function openPad(reason: CustomerHandBackReason) {
    closeKeyboard();
    setEntered('');
    setPadMessage(paused ? { text: TOO_MANY_TRIES } : null);
    setPad(reason);
  }

  function closePad() {
    setPad(null);
    setEntered('');
    if (!paused) setPadMessage(null);
  }

  function pause(seconds: number, text: string) {
    wrongTries.current = 0;
    setPaused(true);
    setPadMessage({ text });
    if (pauseTimer.current !== null) window.clearTimeout(pauseTimer.current);
    pauseTimer.current = window.setTimeout(() => {
      pauseTimer.current = null;
      setPaused(false);
      setPadMessage(null);
    }, seconds * 1000);
  }

  async function check(code: string, reason: CustomerHandBackReason) {
    setChecking(true);
    const result = await endCustomerMode(code);
    setChecking(false);
    if ('unlocked' in result) {
      wrongTries.current = 0;
      onUnlocked(reason);
      return;
    }
    setEntered('');
    if (result.reason === 'wait') {
      pause(result.waitSeconds ?? CUSTOMER_MODE_TRY_WINDOW_SECONDS, result.error);
      return;
    }
    if (result.reason === 'wrong') {
      wrongTries.current += 1;
      // The server counts as well; this pause holds even if its counter is unreachable.
      if (wrongTries.current >= CUSTOMER_MODE_MAX_TRIES) {
        pause(CUSTOMER_MODE_TRY_WINDOW_SECONDS, TOO_MANY_TRIES);
        return;
      }
    }
    setPadMessage({ text: result.error, signIn: result.reason === 'signed-out' });
  }

  function press(key: string) {
    if (!pad || checking || paused) return;
    if (key === 'clear') {
      setEntered('');
      setPadMessage(null);
      return;
    }
    if (key === 'back') {
      setEntered((current) => current.slice(0, -1));
      setPadMessage(null);
      return;
    }
    if (entered.length >= CUSTOMER_MODE_CODE_LENGTH) return;
    const next = entered + key;
    setEntered(next);
    setPadMessage(null);
    if (next.length === CUSTOMER_MODE_CODE_LENGTH) void check(next, pad);
  }

  let screen: ReactNode;
  if (pad) {
    const text = PAD_TEXT[pad];
    const signInPath = `${lockPath.startsWith('/es/') ? '/es' : ''}/account/sign-in?next=${encodeURIComponent(lockPath)}`;
    screen = (
      <div
        ref={padRef}
        className="brc-screen brc-center brc-pad"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (/^\d$/.test(event.key)) press(event.key);
          else if (event.key === 'Backspace') press('back');
          else if (event.key === 'Escape') closePad();
        }}
      >
        <div className="brc-center-in">
          <span className="brc-badge"><LockIcon /></span>
          <h2>{text.title}</h2>
          <p className="brc-sub">{text.sub}</p>
          <p className="brc-who">Staff: enter the code</p>
          <div className="brc-dots" aria-label={`${entered.length} of ${CUSTOMER_MODE_CODE_LENGTH} digits entered`}>
            {Array.from({ length: CUSTOMER_MODE_CODE_LENGTH }, (_, index) => (
              <i key={index} className={index < entered.length ? 'brc-filled' : undefined} />
            ))}
          </div>
          <div className="brc-pad-msg" role="alert">
            {checking ? <span style={{ color: 'var(--color-on-surface-variant, #4d4635)' }}>Checking…</span> : padMessage?.text}
            {!checking && padMessage?.signIn && <> <a href={signInPath}>Sign in</a></>}
          </div>
          <div className="brc-keys">
            {PAD_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                className={key === 'clear' || key === 'back' ? 'brc-ghost' : undefined}
                aria-label={key === 'back' ? 'Delete the last digit' : undefined}
                disabled={checking || paused}
                onClick={() => press(key)}
              >
                {key === 'clear' ? 'Clear' : key === 'back' ? '⌫' : key}
              </button>
            ))}
          </div>
          <button type="button" className="brc-link" onClick={closePad}>{text.back}</button>
        </div>
      </div>
    );
  } else if (phase === 'thanks') {
    const first = customerFirstName(values.sellerName);
    screen = (
      <div className="brc-screen brc-center brc-thanks" role="status">
        <div className="brc-center-in">
          <span className="brc-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
          </span>
          <h2>{first ? `Thank you, ${first}.` : 'Thank you.'}</h2>
          <p className="brc-sub">Please hand this tablet back to our staff.</p>
          <button type="button" className="brc-staff" onClick={() => openPad('saved')}><LockIcon />Staff: unlock</button>
        </div>
      </div>
    );
  } else {
    const flagged = Object.keys(flags).length;
    // "Submit unfinished" is for a form that IS unfinished: once every box is
    // right again the only button is Save.
    const unfinished = tried && customerProblems(values).length > 0;
    screen = (
      <div className="brc-screen brc-form">
        <div className="brc-top">
          <div className="brc-in">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/images/branding/nav-logo.webp" width={157} height={120} alt="" />
            <span className="brc-brand">{BUSINESS_NAME}</span>
            <span className="brc-tag">Seller information</span>
          </div>
        </div>
        <div className="brc-main">
          <div className="brc-in">
            <div className="brc-title">
              <h2>Your information</h2>
              <p>Please fill in the boxes, then tap <b>Save</b>.</p>
            </div>
            <div className="brc-grid">
              {CUSTOMER_FIELDS.map((field, index) => {
                const ui = FIELD_UI[field];
                const flag = flags[field];
                const nextField = CUSTOMER_FIELDS[index + 1];
                return (
                  <label key={field} className={`brc-fld ${ui.className}${flag ? ' brc-bad' : ''}`}>
                    <span className="brc-lab">
                      <span>{ui.label}</span>
                      {flag && <span className="brc-why">{flag}</span>}
                    </span>
                    <input
                      ref={(element) => {
                        inputs.current[field] = element;
                      }}
                      type="text"
                      value={values[field]}
                      inputMode={ui.inputMode}
                      maxLength={ui.maxLength}
                      // One seller must never be offered another's details, and nothing here is to be remembered.
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize={ui.autoCapitalize}
                      spellCheck={false}
                      data-1p-ignore=""
                      data-lpignore="true"
                      data-form-type="other"
                      enterKeyHint={nextField ? 'next' : 'done'}
                      aria-invalid={flag ? true : undefined}
                      onChange={(event) => setField(field, event.currentTarget)}
                      onBlur={() => tidyField(field)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        // Return steps to the next box; after the last one the keyboard closes.
                        event.preventDefault();
                        const following = nextField ? inputs.current[nextField] : null;
                        if (following) following.focus();
                        else event.currentTarget.blur();
                      }}
                    />
                  </label>
                );
              })}
              <div className={`brc-opts${hasEmail ? ' brc-on' : ''}`} aria-hidden={hasEmail ? undefined : true}>
                <label className="brc-opt">
                  <input type="checkbox" checked={emailCopy} disabled={!hasEmail} onChange={(event) => onAsk({ emailCopy: event.target.checked })} />
                  Email me a copy of my receipt
                </label>
                <label className="brc-opt">
                  <input type="checkbox" checked={mailingList} disabled={!hasEmail} onChange={(event) => onAsk({ mailingList: event.target.checked })} />
                  Add me to the mailing list
                </label>
              </div>
            </div>
          </div>
        </div>
        <div className="brc-bar">
          <div className="brc-in">
            <button type="button" className="brc-staff" onClick={() => openPad('staff')}><LockIcon />Staff</button>
            <span className="brc-msg" role="alert">
              {tried && flagged > 0 ? (flagged === 1 ? 'Please finish the highlighted box.' : `Please finish the ${flagged} highlighted boxes.`) : null}
            </span>
            {unfinished && <button type="button" className="brc-unf" onClick={() => openPad('unfinished')}>Submit unfinished</button>}
            <button type="button" className="brc-save" onClick={save}>Save</button>
          </div>
        </div>
      </div>
    );
  }

  return createPortal(
    <div ref={hostRef} className={CUSTOMER_MODE_HOST_CLASS} role="dialog" aria-modal="true" aria-label="Seller information">
      <style>{BUY_RECEIPT_CUSTOMER_CSS}</style>
      {screen}
    </div>,
    document.body,
  );
}
